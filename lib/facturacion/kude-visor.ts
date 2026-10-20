/**
 * Controlador del visor de KuDE (PRO-194). Lógica pura, sin React ni DOM: la modal solo la refleja.
 *  · CADA apertura (y cada «Reintentar») hace una solicitud NUEVA al servidor: no hay caché, reutilización del archivo ni límite de aperturas (decisión del responsable).
 *  · El PDF solo existe como Blob + URL temporal mientras la modal está abierta; al cerrar se aborta lo pendiente, se revoca la URL y se descartan los datos. Nada se guarda en disco, almacenamiento del navegador ni base.
 *  · Una respuesta tardía (de otro documento, o posterior al cierre) nunca se presenta: cada solicitud tiene un número de secuencia y solo la vigente puede cambiar el estado.
 */
export type DocumentoKudeVisor = { id: string; titulo: string; nombre: string };
export type EstadoKudeVisor =
  | { fase: "CERRADO" }
  | { fase: "CARGANDO"; docId: string; titulo: string }
  | { fase: "LISTO"; docId: string; titulo: string; nombre: string; url: string; descarga: "INACTIVA" | "CARGANDO" | "ERROR"; mensajeDescarga: string }
  | { fase: "ERROR"; docId: string; titulo: string; mensaje: string };

export type DependenciasVisor = {
  /** Pide el PDF AL SERVIDOR de NEXIT (nunca al gateway). Debe respetar `signal`. */
  obtener: (docId: string, signal: AbortSignal) => Promise<Blob>;
  crearUrl: (b: Blob) => string;
  revocarUrl: (url: string) => void;
  descargar: (url: string, nombre: string) => void;
  imprimir: () => void;
  /** Programa la liberación de la URL temporal usada para la descarga (por defecto, 60 s después). */
  diferir?: (f: () => void) => void;
};

export const MENSAJE_KUDE_GENERICO = "No fue posible obtener el KuDE.";

export function crearControladorVisor(dep: DependenciasVisor) {
  let estado: EstadoKudeVisor = { fase: "CERRADO" };
  let secuencia = 0;
  let aborto: AbortController | null = null;
  let abortoDescarga: AbortController | null = null;
  let secuenciaDescarga = 0;
  let doc: DocumentoKudeVisor | null = null;
  const oyentes = new Set<() => void>();
  const poner = (e: EstadoKudeVisor) => {
    estado = e;
    oyentes.forEach((f) => f());
  };

  function liberar() {
    aborto?.abort();
    aborto = null;
    secuenciaDescarga += 1; // cualquier descarga pendiente queda invalidada: no se completará en la interfaz
    abortoDescarga?.abort();
    abortoDescarga = null;
    if (estado.fase === "LISTO") dep.revocarUrl(estado.url);
  }

  async function cargar(d: DocumentoKudeVisor) {
    liberar();
    secuencia += 1;
    const mia = secuencia;
    const control = new AbortController();

    aborto = control;
    doc = d;
    poner({ fase: "CARGANDO", docId: d.id, titulo: d.titulo });
    try {
      const blob = await dep.obtener(d.id, control.signal);

      if (mia !== secuencia || control.signal.aborted) return; // respuesta tardía: se descarta sin presentarla

      poner({ fase: "LISTO", docId: d.id, titulo: d.titulo, nombre: d.nombre, url: dep.crearUrl(blob), descarga: "INACTIVA", mensajeDescarga: "" });
    } catch (e) {
      if (mia !== secuencia || control.signal.aborted) return;
      poner({ fase: "ERROR", docId: d.id, titulo: d.titulo, mensaje: e instanceof Error && e.message ? e.message : MENSAJE_KUDE_GENERICO });
    } finally {
      if (mia === secuencia) aborto = null;
    }
  }

  return {
    estado: () => estado,
    suscribir(f: () => void) {
      oyentes.add(f);

      return () => {
        oyentes.delete(f);
      };
    },
    /** Abre el visor y consulta el KuDE. Un segundo clic accidental sobre el MISMO documento mientras carga se ignora; un documento distinto reemplaza al anterior. */
    abrir(d: DocumentoKudeVisor): Promise<void> {
      if (estado.fase === "CARGANDO" && estado.docId === d.id) return Promise.resolve();

      return cargar(d);
    },
    /** Nueva solicitud tras un error (no reutiliza nada). */
    reintentar(): Promise<void> {
      if (estado.fase !== "ERROR" || !doc) return Promise.resolve();

      return cargar(doc);
    },
    cerrar() {
      if (estado.fase === "CERRADO") return;
      secuencia += 1; // invalida cualquier respuesta en vuelo
      liberar();
      doc = null;
      poner({ fase: "CERRADO" });
    },
    /**
     * «Descargar PDF»: hace una consulta NUEVA al servidor (y por tanto al gateway), distinta de la usada para mostrar. Con un error el visor sigue mostrando el PDF y permite reintentar.
     * Si el visor se cierra o cambia de documento antes de terminar, la solicitud se aborta y nada se descarga.
     */
    async descargar(): Promise<void> {
      if (estado.fase !== "LISTO" || estado.descarga === "CARGANDO") return;

      const { docId, titulo, nombre, url } = estado;
      const mia = (secuenciaDescarga += 1);
      const control = new AbortController();

      abortoDescarga = control;
      poner({ fase: "LISTO", docId, titulo, nombre, url, descarga: "CARGANDO", mensajeDescarga: "" });
      try {
        const blob = await dep.obtener(docId, control.signal);

        if (mia !== secuenciaDescarga || control.signal.aborted) return;

        const temporal = dep.crearUrl(blob);

        try {
          dep.descargar(temporal, nombre);
        } finally {
          (dep.diferir ?? ((f) => void setTimeout(f, 60_000)))(() => dep.revocarUrl(temporal));
        }
        abortoDescarga = null;
        poner({ fase: "LISTO", docId, titulo, nombre, url, descarga: "INACTIVA", mensajeDescarga: "" });
      } catch (e) {
        if (mia !== secuenciaDescarga || control.signal.aborted) return;
        abortoDescarga = null;
        poner({ fase: "LISTO", docId, titulo, nombre, url, descarga: "ERROR", mensajeDescarga: e instanceof Error && e.message ? e.message : MENSAJE_KUDE_GENERICO });
      }
    },
    imprimir() {
      if (estado.fase === "LISTO") dep.imprimir();
    },
  };
}

/** Solicitud real al servidor de NEXIT. Solo viaja el ID; valida que la respuesta sea application/pdf. */
export async function pedirKudeAlServidor(docId: string, signal: AbortSignal, fetchFn: typeof fetch = fetch): Promise<Blob> {
  const r = await fetchFn("/api/documentos/" + encodeURIComponent(docId) + "/kude", { cache: "no-store", signal });

  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: unknown } | null;

    throw new Error(typeof j?.error === "string" && j.error ? j.error : MENSAJE_KUDE_GENERICO);
  }
  if (!(r.headers.get("content-type") ?? "").toLowerCase().includes("application/pdf")) throw new Error("El servidor no devolvió un PDF válido.");

  return r.blob();
}

/** ¿Se ofrece el KuDE en la fila? Solo FE APROBADA con CDC (la integración existe únicamente para ese caso). */
export const kudeDisponible = (d: { tipo: string; estadoSifen: string; cdc: string | null }): boolean => d.tipo === "FE" && d.estadoSifen === "APROBADO" && Boolean(d.cdc);
