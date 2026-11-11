/**
 * Controlador del visor de KuDE (PRO-194). Lógica pura, sin React ni DOM: la modal solo la refleja.
 *  · CADA apertura (y cada «Reintentar») hace una solicitud NUEVA al servidor: no hay caché, reutilización del archivo ni límite de aperturas (decisión del responsable).
 *  · El PDF solo existe como Blob + URL temporal mientras la modal está abierta; al cerrar se aborta lo pendiente, se revoca la URL y se descartan los datos. Nada se guarda en disco, almacenamiento del navegador ni base.
 *  · Una respuesta tardía (de otro documento, o posterior al cierre) nunca se presenta: cada solicitud tiene un número de secuencia y solo la vigente puede cambiar el estado.
 *  · PRO-342-R02 (F001): cada PDF trae su PERTENENCIA (cabecera X-Nexit-Kude-Correspondencia del servidor). Solo «VERIFICADA» (CDC idéntico al que la API informó para el documento) se presenta
 *    como KuDE del documento; «NO_VERIFICADA» se muestra con advertencia explícita y otro título, y se descarga con nombre «…-NO-VERIFICADO.pdf». Un Blob sin esa marca cuenta como NO_VERIFICADA.
 */
export type DocumentoKudeVisor = { id: string; titulo: string; nombre: string };
export type PertenenciaKude = "VERIFICADA" | "NO_VERIFICADA";
/** Blob del KuDE con su pertenencia (la pone pedirKudeAlServidor). */
export type BlobKude = Blob & { pertenencia?: PertenenciaKude };

export const pertenenciaDe = (b: Blob): PertenenciaKude => ((b as BlobKude).pertenencia === "VERIFICADA" ? "VERIFICADA" : "NO_VERIFICADA");

/** Título visible: sin pertenencia verificada el PDF NO se titula como KuDE del documento. */
export const tituloKude = (titulo: string, p: PertenenciaKude): string => (p === "VERIFICADA" ? titulo : `PDF devuelto por el gateway — pertenencia NO verificada (${titulo.replace(/^KuDE · /, "")})`);

export const AVISO_KUDE_NO_VERIFICADO =
  "El gateway devolvió este PDF para el número de documento solicitado, pero NEXIT no puede comprobar que pertenezca a este documento ni a esta empresa: el documento aún no tiene un CDC informado por la API con el cual compararlo, o la respuesta no trajo CDC. Verifique el emisor, la fecha y los importes del PDF antes de usarlo; no lo entregue como KuDE de este documento si no coinciden.";

const nombreSegun = (nombre: string, p: PertenenciaKude) => (p === "VERIFICADA" ? nombre : nombre.replace(/\.pdf$/i, "") + "-NO-VERIFICADO.pdf");
export type EstadoKudeVisor =
  | { fase: "CERRADO" }
  | { fase: "CARGANDO"; docId: string; titulo: string }
  | { fase: "LISTO"; docId: string; titulo: string; nombre: string; url: string; descarga: "INACTIVA" | "CARGANDO" | "ERROR"; mensajeDescarga: string; pertenencia: PertenenciaKude }
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

      poner({ fase: "LISTO", docId: d.id, titulo: d.titulo, nombre: d.nombre, url: dep.crearUrl(blob), descarga: "INACTIVA", mensajeDescarga: "", pertenencia: pertenenciaDe(blob) });
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

      const { docId, titulo, nombre, url, pertenencia } = estado;
      const mia = (secuenciaDescarga += 1);
      const control = new AbortController();

      abortoDescarga = control;
      poner({ fase: "LISTO", docId, titulo, nombre, url, descarga: "CARGANDO", mensajeDescarga: "", pertenencia });
      try {
        const blob = await dep.obtener(docId, control.signal);

        if (mia !== secuenciaDescarga || control.signal.aborted) return;

        const temporal = dep.crearUrl(blob);

        try {
          // La descarga es una consulta NUEVA: su propia pertenencia decide el nombre del archivo.
          dep.descargar(temporal, nombreSegun(nombre, pertenenciaDe(blob)));
        } finally {
          (dep.diferir ?? ((f) => void setTimeout(f, 60_000)))(() => dep.revocarUrl(temporal));
        }
        abortoDescarga = null;
        poner({ fase: "LISTO", docId, titulo, nombre, url, descarga: "INACTIVA", mensajeDescarga: "", pertenencia });
      } catch (e) {
        if (mia !== secuenciaDescarga || control.signal.aborted) return;
        abortoDescarga = null;
        poner({ fase: "LISTO", docId, titulo, nombre, url, descarga: "ERROR", mensajeDescarga: e instanceof Error && e.message ? e.message : MENSAJE_KUDE_GENERICO, pertenencia });
      }
    },
    imprimir() {
      if (estado.fase === "LISTO") dep.imprimir();
    },
  };
}

/** Solicitud real al servidor de NEXIT. Solo viaja el ID; valida que la respuesta sea application/pdf. PRO-342-R02: el Blob lleva la pertenencia informada por el servidor (CDC_REGISTRADO = VERIFICADA). */
export async function pedirKudeAlServidor(docId: string, signal: AbortSignal, fetchFn: typeof fetch = fetch): Promise<BlobKude> {
  const r = await fetchFn("/api/documentos/" + encodeURIComponent(docId) + "/kude", { cache: "no-store", signal });

  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: unknown } | null;

    throw new Error(typeof j?.error === "string" && j.error ? j.error : MENSAJE_KUDE_GENERICO);
  }
  if (!(r.headers.get("content-type") ?? "").toLowerCase().includes("application/pdf")) throw new Error("El servidor no devolvió un PDF válido.");

  const pertenencia: PertenenciaKude = r.headers.get("x-nexit-kude-correspondencia") === "CDC_REGISTRADO" ? "VERIFICADA" : "NO_VERIFICADA";

  return Object.assign(await r.blob(), { pertenencia });
}

/** ¿Se ofrece el KuDE en la fila? FE y NCE, sea cual sea su estado fiscal o si ya tienen CDC: el gateway decide si entrega el PDF (E08). */
export const kudeDisponible = (d: { tipo: string }): boolean => d.tipo === "FE" || d.tipo === "NCE";
