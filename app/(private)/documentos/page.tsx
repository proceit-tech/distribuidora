"use client";

import Link from "next/link";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { CampoFecha } from "@/components/ui/campo-fecha";
import ui from "@/components/ui/lista-padrao/lista.module.css";
import { siguienteOrden, type Orden } from "@/components/ui/lista-padrao/orden";
import { ThOrdenable } from "@/components/ui/lista-padrao/th-ordenable";
import { accionDisponible, claveContexto, esListadoMasReciente, esResultadoVigente, posicionTooltip, unirIntentos } from "@/lib/facturacion/documentos-ux";
import { crearControladorVisor, kudeDisponible, pedirKudeAlServidor } from "@/lib/facturacion/kude-visor";
import { iniciarRefresco } from "@/lib/facturacion/refresco-documentos";
import {
  ESTADOS_SIFEN,
  etiquetaIntento,
  ETIQUETA_RESULTADO_INTENTO,
  ETIQUETA_SIFEN,
  ETIQUETA_TIPO,
  TIPOS_DOCUMENTO,
  numeroDocumento,
  type EstadoEmail,
  type EstadoLocal,
  type EstadoSifen,
  type GrupoIndicador,
  type TipoDocumento,
} from "@/lib/facturacion/estados";
import {
  alertaConsulta,
  avisoProyeccionCdc,
  avisoSinCdc,
  cdcDeIntento,
  detalleFiscalPrimario,
  iconosEstado,
  NOMBRE_EJE,
  resumenConsultas,
  seguimientoFiscal,
  textoConexion,
  type IntentoConsulta,
  type SimboloEstado,
  type TonoIcono,
} from "@/lib/facturacion/presentacion-sifen";
import {
  accionesFila,
  alternarSeleccion,
  clavesListado,
  destinoConsulta,
  eventosFila,
  partirFechaHora,
  seleccionVigente,
  type AccionFila,
  type Seleccion,
} from "@/lib/facturacion/documentos-tabla";
import {
  avisoOperador,
  AYUDA_ACCION_NO_DISPONIBLE,
  encabezadoFiscal,
  eventosOperador,
  respuestaFiscal,
  textoConsultaOperador,
  textoEnvioOperador,
  textoIconoOperador,
} from "@/lib/facturacion/documentos-copy-operador";
import { aprobacionOficialDocumento, elegibilidadCancelacionFe, textoFechaGateway, type ProyeccionEventosFe } from "@/lib/facturacion/eventos-fe";
import { formatearFechaHoraPy } from "@/lib/formato/listas";
import { formatearImporteMoneda } from "@/lib/formato/monto-visual";

import { CancelacionModal } from "./cancelacion-modal";
import { KudeModal } from "./kude-modal";
import estilos from "./page.module.css";

const PAGE_SIZE = 20;

type CampoOrden = "fecha" | "numero" | "cliente" | "total" | "estado";
type Documento = {
  id: string; tipo: TipoDocumento; establecimiento: string; puntoExpedicion: string; numero: string; serie: string | null; cdc: string | null; fechaEmision: string;
  sucursalNombre: string; receptorNombre: string; receptorDocumento: string | null; moneda: string; total: string; estadoLocal: EstadoLocal; estadoSifen: EstadoSifen;
  estadoEmail: EstadoEmail; estadoGatewayTexto: string | null; codRespuesta: string | null; mensajeRespuesta: string | null; fechaFirma: string | null; fechaEnvio: string | null;
  ultimaConsultaAt: string | null; ultimaConsultaResultado: string | null; lote: string | null; envioErrorTipo: "AUTENTICACION" | "RECHAZO" | "TRANSITORIO" | null;
  /** NCE (PRO-94): factura original y motivo; `corregible` = rechazo definitivo (acción «Corregir y emitir nueva»); `requiereRevision` = mucho tiempo pendiente (solo etiqueta). */
  feNumero?: string | null; feId?: string | null; feCdc?: string | null; nceMotivo?: number | null; corregible?: boolean; requiereRevision?: boolean;
  /** PRO-313-R01: eventos de la FE leídos de response.DE.Evento en las consultas registradas (proyección del servidor, solo lectura). */
  eventosFe?: ProyeccionEventosFe | null;
};

const MOTIVO_NCE: Record<number, string> = { 2: "Devolución", 3: "Descuento", 4: "Bonificación", 8: "Ajuste de precio" };
type Intento = { id: string; tipo: string; fase: string | null; lote: string | null; cdcInformado: string | null; cdcRespuesta?: string | null; cdcProyeccion?: string | null; cdcAnterior?: string | null; conexion?: Record<string, unknown> | null; resultado: string; httpStatus: number | null; estadoGateway: string | null; estadoSifen: string | null; codRespuesta: string | null; mensaje: string | null; creadoAt: string; actorNombre: string; tieneRespuesta?: boolean; cursor?: string };
type Solicitud = { version: number; payloadHash: string; creadoAt: string };
/** E01 (PRO-314): JSON leído bajo demanda de UNA solicitud o respuesta; se muestra como texto formateado (nunca HTML). */
type VistaJson = { titulo: string; detalle: string; texto: string; cargando: boolean; error: string };
type Respuesta = {
  documentos: Documento[]; total: number; pagina: number; totalPaginas: number; resumen: Record<string, number>; sucursales: Array<{ id: string; nombre: string }>; permisos: { editar: boolean; crear: boolean };
  /** PRO-313-R01: instante del servidor al generar el listado (base del plazo de 48 h cuando la aprobación oficial esté acreditada; nunca el reloj del navegador). */
  generadoMs?: number;
};
/**
 * PRO-342-R04: `tecnico` = segunda capa (historial técnico) abierta; cerrada por defecto. `copiado` = feedback breve del botón Copiar.
 * PRO-342-UX-R01: el «consultando/enviando» ya no vive en el detalle (que se cierra y se reabre) sino en `enCurso`, por documento, para que una acción en curso no se pueda repetir al reabrir.
 */
type Detalle = { cargando: boolean; error: string; intentos: Intento[]; siguienteIntentos: string | null; cargandoMas: boolean; errorMas: string; solicitudes: Solicitud[]; json: VistaJson | null; aviso: string; tecnico: boolean; copiado: "" | "lote" | "cdc" | "error" };

const DETALLE_VACIO: Detalle = { cargando: false, error: "", intentos: [], siguienteIntentos: null, cargandoMas: false, errorMas: "", solicitudes: [], json: null, aviso: "", tecnico: false, copiado: "" };

/**
 * PRO-342-UX-R01 (punto 1): indicadores COMPACTOS. Se conservan los ocho grupos, sus cantidades y su función de filtro (aria-pressed); la explicación larga deja de estar
 * escrita en cada tarjeta y pasa a la descripción accesible (texto oculto) y al título nativo del botón.
 */
// PRO-365-R02: tarjetas del «Resumen de estados» en el orden de la referencia (pendientes, resultado SIFEN, correo y Total al final). Cifras del servidor sin cambios;
// el símbolo es decorativo (el título y la cantidad son el texto) y el color sigue el significado de cada grupo.
// PRO-365-R02-C02: ayudas en lenguaje llano (sin gateway/API/proveedor). Mismos grupos, cifras, filtro y orden. SIN_EMAIL agrupa «sin correo» y «sin información de correo»
// (criterio SQL sin cambios), por eso su ayuda nombra los dos casos.
const INDICADORES: Array<{ grupo: GrupoIndicador | ""; titulo: string; ayuda: string; clase: string; simbolo: SimboloEstado }> = [
  { grupo: "PEND_ENVIO", titulo: "Pend. envío", ayuda: "Envíos pendientes de confirmación (incluye los envíos que no se pudieron confirmar)", clase: estilos.tonoAmber, simbolo: "reloj" },
  { grupo: "PEND_RESPUESTA", titulo: "Pend. respuesta", ayuda: "Documentos pendientes de respuesta de SIFEN (incluye los envíos que no se pudieron confirmar)", clase: estilos.tonoBlue, simbolo: "archivoReloj" },
  { grupo: "APROBADO", titulo: "Aprobados", ayuda: "Documentos aprobados", clase: estilos.tonoVerde, simbolo: "check" },
  { grupo: "RECHAZADO", titulo: "Rechazados", ayuda: "Documentos rechazados", clase: estilos.tonoRed, simbolo: "cruz" },
  { grupo: "EMAIL_ENVIADO", titulo: "Correo enviado", ayuda: "Correos enviados", clase: estilos.tonoViolet, simbolo: "correoCheck" },
  { grupo: "EMAIL_ERROR", titulo: "Error de correo", ayuda: "Errores de correo", clase: estilos.tonoRed, simbolo: "correoCruz" },
  { grupo: "SIN_EMAIL", titulo: "Sin correo", ayuda: "Sin correo o sin información de correo", clase: estilos.tonoGris, simbolo: "correo" },
  { grupo: "", titulo: "Total", ayuda: "Total de documentos", clase: estilos.tonoTeal, simbolo: "archivoCheck" },
];

/**
 * PRO-342-R04 (UX01) / PRO-342-UX-R01 (puntos 2–5): cuatro iconos INDEPENDIENTES por documento, en posiciones fijas (Envío · XML/CDC · SIFEN · Correo), y una quinta
 * posición reservada para el aviso técnico «!» (vacía si no hay aviso, para no desalinear las filas). Sin texto repetido debajo de cada icono: los nombres van UNA vez en
 * la leyenda. Cada icono tiene símbolo propio (el color nunca es la única señal), nombre accesible con el texto completo (aria-label) y tooltip visual en mouse, foco y toque.
 */
const CLASE_TONO_ICONO: Record<TonoIcono, string> = { ok: estilos.iconoOk, info: estilos.iconoInfo, aviso: estilos.iconoAviso, error: estilos.iconoError, neutro: estilos.iconoNeutro };
const ARCHIVO = <path d="M8 3.5h6l4 4V20H8z" />;
const GLIFO: Record<SimboloEstado, ReactNode> = {
  check: <path d="m6.5 12.5 3.8 3.8 7.2-8" />,
  cruz: <path d="m7.5 7.5 9 9m0-9-9 9" />,
  reloj: <><circle cx="12" cy="12" r="7" /><path d="M12 8.5V12l2.6 1.8" /></>,
  alerta: <path d="M12 6.5v7M12 17.2v.3" />,
  guion: <path d="M7.5 12h9" />,
  archivoCheck: <>{ARCHIVO}<path d="m10.3 14 1.9 1.9 3.4-3.6" /></>,
  archivoReloj: <>{ARCHIVO}<path d="M13 11.5v3h2" /></>,
  archivoAlerta: <>{ARCHIVO}<path d="M13 10.5v4M13 17v.3" /></>,
  prohibido: <><circle cx="12" cy="12" r="7" /><path d="m7.2 16.8 9.6-9.6" /></>,
  correo: <><path d="M4.5 7h15v10h-15z" /><path d="m4.5 7.5 7.5 6 7.5-6" /></>,
  correoCheck: <><path d="M4.5 7h15v10h-15z" /><path d="m8.5 12.2 2.4 2.3 4.6-4.6" /></>,
  correoCruz: <><path d="M4.5 7h15v10h-15z" /><path d="m9.2 9.2 5.6 5.6m0-5.6-5.6 5.6" /></>,
};
/** Iconos de ACCIÓN (punto 7; PRO-195-UX-R01: contorno fino, sin fondo): consultar, KuDE, XML, correo, eventos, copiar, copiado y expandir. Siempre decorativos: el botón lleva aria-label. */
const ACCION = {
  consultar: <><path d="M19 12a7 7 0 1 1-2.05-4.95" /><path d="M19 4.5V8h-3.5" /></>,
  kude: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>,
  xml: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="m10 12-2 2.5 2 2.5M14 12l2 2.5-2 2.5" /></>,
  correo: <><path d="M4 6.5h16v11H4z" /><path d="m4.5 7 7.5 6 7.5-6" /></>,
  eventos: <><circle cx="12" cy="12" r="8" /><path d="m8.5 15.5 7-7" /></>,
  copiar: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>,
  copiado: <path d="m6 12.5 4 4 8-9" />,
  abrir: <path d="m6 9 6 6 6-6" />,
  cerrar: <path d="m6 15 6-6 6 6" />,
};

/** Tooltip visual (no reemplaza al nombre accesible): se muestra en hover, foco de teclado y toque; Escape, tocar fuera, desplazar o redimensionar lo cierran. */
type EventosTip = { mostrar: (ancla: HTMLElement, texto: string) => void; programarCierre: () => void; ocultar: (ancla: HTMLElement) => void };

// PRO-365-R02-C02: `texto` es el tooltip visual (breve, p. ej. «Enviado»); `etiqueta` es el nombre accesible y antepone el eje para desambiguar (p. ej. «Envío: Enviado»).
// Sin `etiqueta` (historial técnico) el nombre accesible es el mismo texto.
function IconoFase({ eje, simbolo, clase, texto, etiqueta, tip }: { eje: string; simbolo: SimboloEstado; clase: string; texto: string; etiqueta?: string; tip: EventosTip }) {
  return (
    <span
      className={clases(estilos.icono, clase)}
      role="img"
      tabIndex={0}
      aria-label={etiqueta ?? texto}
      data-eje={eje}
      data-simbolo={simbolo}
      onMouseEnter={(e) => tip.mostrar(e.currentTarget, texto)}
      onMouseLeave={tip.programarCierre}
      onFocus={(e) => tip.mostrar(e.currentTarget, texto)}
      onBlur={(e) => tip.ocultar(e.currentTarget)}
      onClick={(e) => tip.mostrar(e.currentTarget, texto)}
    >
      <span className={estilos.iconoCirculo} aria-hidden="true">
        <svg viewBox="0 0 24 24">{GLIFO[simbolo]}</svg>
      </span>
    </span>
  );
}

/**
 * PRO-195-UX-R01 (punto 3): acción de la fila con icono de contorno y color propio (KuDE rojo, XML azul, consulta azul neutro, correo ámbar). Una acción no disponible
 * queda DESHABILITADA con su motivo (aria-disabled: sigue enfocable para leer el motivo en el tooltip y en el nombre accesible) y su clic no hace nada.
 */
function AccionIcono({ clase, glifo, etiqueta, disponible, motivo, ocupado, alActivar, tip }: { clase: string; glifo: ReactNode; etiqueta: string; disponible: boolean; motivo: string; ocupado?: boolean; alActivar: () => void; tip: EventosTip }) {
  const texto = disponible ? etiqueta : `${etiqueta}. ${motivo}`;

  return (
    <button
      type="button"
      className={clases(estilos.accion, clase, ocupado && estilos.girando)}
      aria-label={texto}
      aria-disabled={!disponible}
      aria-busy={ocupado || undefined}
      onMouseEnter={(e) => tip.mostrar(e.currentTarget, texto)}
      onMouseLeave={tip.programarCierre}
      onFocus={(e) => tip.mostrar(e.currentTarget, texto)}
      onBlur={(e) => tip.ocultar(e.currentTarget)}
      onClick={(e) => {
        if (disponible) alActivar();
        else tip.mostrar(e.currentTarget, texto);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">{glifo}</svg>
    </button>
  );
}

/**
 * PRO-365 (NEXIT-DOC-UX-COMPETENCIA-R01): la fila vuelve a mostrar SIEMPRE los cuatro estados independientes (Envío · XML/CDC · SIFEN · Correo, iconosEstado) y ya no
 * un único texto grande («Rechazado»). El estado fiscal real no cambia: un RECHAZADO persistido se ve en el icono SIFEN (cruz roja) con su código y mensaje registrados
 * en el tooltip y en el detalle. La leyenda de los cuatro ejes se muestra UNA vez sobre la tabla.
 */
const LEYENDA_SIMBOLOS: Array<{ simbolo: SimboloEstado; clase: string; texto: string }> = [
  { simbolo: "check", clase: estilos.iconoOk, texto: "confirmado" },
  { simbolo: "reloj", clase: estilos.iconoAviso, texto: "pendiente" },
  { simbolo: "cruz", clase: estilos.iconoError, texto: "error o rechazo" },
  { simbolo: "guion", clase: estilos.iconoNeutro, texto: "sin información" },
];
const CLASE_ACCION: Record<AccionFila["clave"], string> = { kude: estilos.accionKude, xml: estilos.accionXml, consulta: estilos.accionConsulta, correo: estilos.accionCorreo };

function Glifo({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg>;
}
/**
 * PRO-334 (CASA MINGO, ETAPA 3): color por TIPO de comprobante, independiente del estado fiscal PRO-338. FE = azul suave, NCE = amarillo claro suave (fondo + acento
 * lateral de la fila y del detalle desplegado). El tipo sigue escrito en texto («Factura electrónica» / «Nota de crédito»): el color es complemento. Otros tipos sin color.
 */
const CLASE_FILA_TIPO: Partial<Record<TipoDocumento, string>> = { FE: estilos.filaFE, NCE: estilos.filaNCE };
const CLASE_DETALLE_TIPO: Partial<Record<TipoDocumento, string>> = { FE: estilos.detalleFE, NCE: estilos.detalleNCE };
const CLASE_ETIQUETA_TIPO: Partial<Record<TipoDocumento, string>> = { FE: estilos.tipoFE, NCE: estilos.tipoNCE };
const clases = (...c: Array<string | undefined | false>) => c.filter(Boolean).join(" ");
const fechaHora = (v: string) => formatearFechaHoraPy(v);
// Fechas que informa el gateway como texto (sin zona): se reordenan a dd/MM/yyyy sin convertir la hora.
// PRO-313-R01 (F014): FechaFirma real DD-MM-YYYY HH:mm:ss (validación estricta) y FechaEnvio YYYY-MM-DD HH:mm:ss; sin zona ni conversión; otro texto se muestra literal.
const fechaGateway = (v: string | null) => textoFechaGateway(v);
// PRO-335: importe visual desde el texto numeric exacto (sin Number), en la moneda del propio documento.
// PRO-338-R02 (F003): una línea por intento de consulta, con fecha, resultado, HTTP, mensaje y CDC informado (indicando si sale del JSON de respuesta).
const describirConsulta = (i: IntentoConsulta, conResultado: boolean) => {
  const cdc = cdcDeIntento(i);

  return [fechaHora(i.creadoAt), conResultado ? ETIQUETA_RESULTADO_INTENTO[i.resultado] ?? i.resultado : null, i.httpStatus ? `HTTP ${i.httpStatus}` : null, i.estadoGateway, i.codRespuesta, i.mensaje, cdc ? `CDC informado${cdc.fuente === "json" ? " (según el JSON de respuesta)" : ""}: ${cdc.cdc}` : null]
    .filter(Boolean)
    .join(" · ");
};
const importe = (d: Documento) => `${formatearImporteMoneda(d.total, d.moneda)} ${d.moneda}`;

async function leerJson<T>(r: Response, porDefecto: string): Promise<T> {
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };

  if (!r.ok) throw new Error(j.error ?? porDefecto);

  return j;
}

export default function DocumentosPage() {
  const [visor] = useState(() =>
    crearControladorVisor({
      obtener: (id, signal) => pedirKudeAlServidor(id, signal),
      crearUrl: (blob) => URL.createObjectURL(blob),
      revocarUrl: (url) => URL.revokeObjectURL(url),
      descargar: (url, nombre) => {
        const a = document.createElement("a");

        a.href = url;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        a.remove();
      },
      imprimir: () => {
        const w = (document.getElementById("kude-visor") as HTMLIFrameElement | null)?.contentWindow;

        w?.focus();
        w?.print();
      },
    }),
  );

  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplicada, setBusquedaAplicada] = useState("");
  const [tipo, setTipo] = useState("");
  const [sucursal, setSucursal] = useState("");
  const [estadoSifen, setEstadoSifen] = useState("");
  const [grupo, setGrupo] = useState<GrupoIndicador | "">("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [orden, setOrden] = useState<Orden<CampoOrden>>(null);
  const [paginacion, setPaginacion] = useState({ clave: "", pagina: 1 });
  const [recarga, setRecarga] = useState(0);
  // PRO-342-UX-R01 (punto 11): el resultado guarda su CONTEXTO (filtros + página). Si el contexto actual es otro, sus filas no se muestran ni se pueden accionar.
  // PRO-342-UX-R02 (UX-F001): `secuencia` = número asignado al LANZAR la lectura del listado; solo se aplica una lectura posterior a la mostrada.
  const [resultado, setResultado] = useState<{ clave: string; contexto: string; secuencia: number; datos: Respuesta | null; error: string } | null>(null);
  const secuenciaListado = useRef(0);
  // PRO-342-UX-R02 (UX-F001): por documento, secuencia de la última lectura del listado lanzada antes de terminar su última consulta/envío. Sus acciones quedan
  // deshabilitadas hasta mostrar un listado lanzado DESPUÉS (estado vigente); sobrevive al cierre/reapertura del detalle.
  const [esperaListado, setEsperaListado] = useState<Record<string, number>>({});
  const [abiertos, setAbiertos] = useState<Record<string, Detalle>>({});
  // PRO-342-UX-R01 (punto 11): acción (consulta o envío) en curso por documento; sobrevive al cierre/reapertura del detalle y evita repetirla mientras no termine.
  const [enCurso, setEnCurso] = useState<Record<string, "consulta" | "envio">>({});
  const accionEnCurso = useRef<Set<string>>(new Set());
  // E01 (PRO-314): petición de JSON vigente por documento. Seleccionar otro JSON, cerrar el visor o colapsar el detalle la invalida: una respuesta tardía ya no sustituye la selección ni reabre nada.
  const jsonVigente = useRef<Record<string, number>>({});
  // E02 (PRO-315): generación del historial por documento; colapsar el detalle la invalida y una página tardía no se aplica. PRO-342-UX-R01: también rige las respuestas de consultar/enviar.
  const historialVigente = useRef<Record<string, number>>({});
  // Feedback «Copiado»: solo el temporizador de la última copia lo borra.
  const copiaVigente = useRef<Record<string, number>>({});
  // Tooltip de los iconos de estado (PRO-342-UX-R01, punto 5): uno solo, en coordenadas de ventana, fuera del contenedor con scroll.
  const [tip, setTip] = useState<{ texto: string; ancla: HTMLElement } | null>(null);
  // PRO-195-UX-R01 (punto 2): selección REAL de filas visibles, ligada al contexto (filtros + página); no habilita acciones masivas (R05).
  const [seleccion, setSeleccion] = useState<Seleccion>({ contexto: "", ids: [] });
  // PRO-313-R01: documento cuya modal PREPARADA de cancelación está abierta (solo si fue elegible; hoy nunca). No transmite nada.
  const [cancelando, setCancelando] = useState<Documento | null>(null);
  // PRO-195-UX-R01 (punto 3): resultado de la consulta lanzada desde la FILA con el detalle cerrado; vale solo en su contexto.
  // PRO-195-UX-R01-R01 (F002): `epoca` identifica cada visita a un contexto (A→B→A da épocas distintas aunque la clave textual coincida).
  const [anuncio, setAnuncio] = useState<{ contexto: string; epoca: number; texto: string; error: boolean } | null>(null);
  const abiertosRef = useRef<Record<string, Detalle>>({});
  const tipRef = useRef<HTMLDivElement | null>(null);
  const cierreTip = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Llegada desde «Emitir nota de crédito»: precarga el número emitido en la búsqueda.
    const q = new URLSearchParams(window.location.search).get("q");

    const t = q ? window.setTimeout(() => setBusqueda(q.slice(0, 80)), 0) : undefined;

    return () => { if (t !== undefined) window.clearTimeout(t); };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setBusquedaAplicada(busqueda.trim()), 300);

    return () => window.clearTimeout(t);
  }, [busqueda]);

  // PRO-195-UX-R01-R01 (F001): el CONTEXTO visible deriva de la INTENCIÓN de búsqueda (texto escrito, normalizado) desde la primera tecla; el debounce de 300 ms
  // solo demora la PETICIÓN HTTP. Mientras la búsqueda aplicada no alcanza a la escrita, el resultado mostrado es de otro contexto (obsoleto): sus filas, selección,
  // detalles, acciones e indicadores no se muestran ni se pueden accionar. La petición sigue usando la búsqueda aplicada y su propia página (sin lecturas extra).
  const { claveFiltros, claveFiltrosAplicada, pagina, paginaAplicada } = clavesListado(busqueda, busquedaAplicada, [tipo, sucursal, estadoSifen, grupo, desde, hasta, orden], paginacion);
  const contexto = claveContexto(claveFiltros, pagina);
  const contextoAplicado = claveContexto(claveFiltrosAplicada, paginaAplicada);
  const claveConsulta = JSON.stringify([claveFiltrosAplicada, paginaAplicada, recarga]);

  useEffect(() => {
    let activo = true;
    const p = new URLSearchParams({ pagina: String(paginaAplicada), tamano: String(PAGE_SIZE) });

    for (const [k, v] of Object.entries({ q: busquedaAplicada, tipo, sucursal, estadoSifen, grupo, desde, hasta, orden: orden?.campo ?? "", dir: orden?.dir ?? "" })) if (v) p.set(k, v);

    secuenciaListado.current += 1;
    const secuencia = secuenciaListado.current;
    const aplicar = (datos: Respuesta | null, error: string) => {
      if (activo) setResultado((r) => (esListadoMasReciente(r?.secuencia ?? null, secuencia) ? { clave: claveConsulta, contexto: contextoAplicado, secuencia, datos, error } : r));
    };

    fetch(`/api/documentos?${p.toString()}`, { cache: "no-store" })
      .then((r) => leerJson<Respuesta>(r, "No fue posible cargar los documentos electrónicos."))
      .then((datos) => aplicar(datos, ""))
      .catch((e: unknown) => aplicar(null, e instanceof Error ? e.message : "No fue posible cargar los documentos electrónicos."));

    return () => {
      activo = false;
    };
    // claveConsulta resume todos los filtros que intervienen en la consulta (contexto deriva de ellos).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveConsulta]);

  // Actualización automática (PRO-94, RN-19; NCE-R02-01): mientras haya documentos pendientes de resultado fiscal se RELEE el listado (solo GET: no consulta ni reenvía nada; el servidor los consulta).
  // Sin tope total de lecturas; frecuencia decreciente (30/60/120 s), solo con la pestaña visible, sin parpadeo de carga; el temporizador se limpia al desmontar, cambiar filtros o no quedar pendientes.
  const hayPendientes = (resultado?.contexto === contexto ? (resultado?.datos?.documentos ?? []) : []).some((d) => (d.estadoLocal === "ENVIADO" || d.estadoLocal === "ENVIO_INDETERMINADO") && (d.estadoSifen === "SIN_CONSULTA" || d.estadoSifen === "PENDIENTE" || d.estadoSifen === "NO_RECONOCIDO"));

  useEffect(() => {
    if (!hayPendientes) return;

    let activo = true;
    const p = new URLSearchParams({ pagina: String(paginaAplicada), tamano: String(PAGE_SIZE) });

    for (const [k, v] of Object.entries({ q: busquedaAplicada, tipo, sucursal, estadoSifen, grupo, desde, hasta, orden: orden?.campo ?? "", dir: orden?.dir ?? "" })) if (v) p.set(k, v);

    const detener = iniciarRefresco({
      leer: () => {
        secuenciaListado.current += 1;
        const secuencia = secuenciaListado.current;

        fetch(`/api/documentos?${p.toString()}`, { cache: "no-store" })
          .then((r) => leerJson<Respuesta>(r, "No fue posible actualizar los documentos electrónicos."))
          .then((datos) => { if (activo) setResultado((r) => (esListadoMasReciente(r?.secuencia ?? null, secuencia) ? { clave: claveConsulta, contexto: contextoAplicado, secuencia, datos, error: "" } : r)); })
          .catch(() => undefined);
      },
      visible: () => document.visibilityState === "visible",
      programar: (fn, ms) => window.setTimeout(fn, ms),
      cancelar: (t) => window.clearTimeout(t as number),
      alVolverVisible: (fn) => { document.addEventListener("visibilitychange", fn); return () => document.removeEventListener("visibilitychange", fn); },
    });

    return () => {
      activo = false;
      detener();
    };
    // claveConsulta resume los filtros; hayPendientes decide si hace falta el temporizador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayPendientes, claveConsulta]);

  const cargando = resultado?.clave !== claveConsulta;
  // PRO-342-UX-R01 (punto 11, AUD UX04): un resultado de OTRO contexto (filtros o página anteriores) no se muestra mientras llega el nuevo: no hay filas obsoletas accionables.
  // Una relectura del MISMO contexto (refresco o tras una acción) conserva las filas visibles sin parpadeo.
  const obsoleto = resultado !== null && resultado.contexto !== contexto;
  const datos = resultado?.datos ?? null;
  const errorCarga = obsoleto ? "" : (resultado?.error ?? "");
  const filas = obsoleto ? [] : (datos?.documentos ?? []);
  // F001: indicadores del recorte anterior no se muestran durante la transición («—», sin inventar cifras).
  const resumen = obsoleto ? null : (datos?.resumen ?? {});
  const paginaMostrada = obsoleto ? pagina : (datos?.pagina ?? pagina);
  const totalPaginas = obsoleto ? 1 : (datos?.totalPaginas ?? 1);
  const total = obsoleto ? 0 : (datos?.total ?? 0);
  const hayFiltros = busquedaAplicada !== "" || tipo !== "" || sucursal !== "" || estadoSifen !== "" || grupo !== "" || desde !== "" || hasta !== "";
  const editar = datos?.permisos.editar === true;
  const seleccionados = seleccionVigente(seleccion, contexto, filas.map((f) => f.id));
  const crear = datos?.permisos.crear === true;

  // PRO-342-UX-R01 (punto 11): al cambiar de contexto se cierran los detalles y el tooltip del contexto anterior (ajuste de estado durante el render, patrón de React).
  // Las respuestas tardías de esos detalles ya no encuentran la fila abierta y se descartan; una reapertura inicia una generación nueva.
  const [contextoVisto, setContextoVisto] = useState(contexto);
  const contextoVistoRef = useRef(contexto);
  // PRO-195-UX-R01-R01 (F002): época del contexto visible; aumenta en CADA cambio de contexto (nunca se repite tras A→B→A).
  const [epocaContexto, setEpocaContexto] = useState(0);
  const epocaRef = useRef(0);

  useEffect(() => {
    contextoVistoRef.current = contextoVisto;
  }, [contextoVisto]);

  useEffect(() => {
    epocaRef.current = epocaContexto;
  }, [epocaContexto]);

  if (contextoVisto !== contexto) {
    setContextoVisto(contexto);
    setAbiertos({});
    setTip(null);
    setEpocaContexto((n) => n + 1);
    // PRO-195-UX-R01: otro contexto (filtros, página u otra lectura) ⇒ selección y aviso de la fila anteriores se descartan.
    setSeleccion({ contexto, ids: [] });
    setAnuncio(null);
  }

  // Estado actual de los detalles para las respuestas asíncronas (¿el detalle sigue abierto?). Se sincroniza después del render.
  useEffect(() => {
    abiertosRef.current = abiertos;
  }, [abiertos]);

  // Posiciona el tooltip después de medirlo (fixed: no lo recorta el scroll horizontal de la tabla ni la última fila). Se escribe en el nodo, sin estado extra.
  useLayoutEffect(() => {
    const el = tipRef.current;

    if (!tip || !el) return;
    if (!tip.ancla.isConnected) {
      el.style.visibility = "hidden";

      return;
    }

    const r = tip.ancla.getBoundingClientRect();
    const p = posicionTooltip({ x: r.left, y: r.top, ancho: r.width, alto: r.height }, { ancho: el.offsetWidth, alto: el.offsetHeight }, { ancho: document.documentElement.clientWidth, alto: window.innerHeight });

    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.dataset.lado = p.lado;
    el.style.visibility = "visible";
  }, [tip]);

  // Cierre del tooltip: Escape, toque/clic fuera del icono y del propio tooltip, desplazamiento (incluido el horizontal de la tabla) o cambio de tamaño.
  useEffect(() => {
    if (!tip) return;

    const cerrar = () => setTip(null);
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    const fuera = (e: PointerEvent) => {
      const destino = e.target as Node | null;

      if (destino && (tip.ancla.contains(destino) || tipRef.current?.contains(destino))) return;
      cerrar();
    };

    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fuera);

    return () => {
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fuera);
    };
  }, [tip]);

  useEffect(() => () => window.clearTimeout(cierreTip.current), []);

  const eventosTip: EventosTip = {
    mostrar: (ancla, texto) => {
      window.clearTimeout(cierreTip.current);
      setTip((t) => (t && t.ancla === ancla && t.texto === texto ? t : { ancla, texto }));
    },
    // Pequeña demora: el puntero puede pasar del icono al tooltip sin que se cierre (WCAG 1.4.13, contenido «hoverable»).
    programarCierre: () => {
      window.clearTimeout(cierreTip.current);
      cierreTip.current = window.setTimeout(() => setTip(null), 160);
    },
    ocultar: (ancla) => setTip((t) => (t && t.ancla === ancla ? null : t)),
  };

  function cambiarOrden(campo: CampoOrden) {
    setOrden((actual) => siguienteOrden(actual, campo));
  }

  function limpiar() {
    setBusqueda("");
    setBusquedaAplicada("");
    setTipo("");
    setSucursal("");
    setEstadoSifen("");
    setGrupo("");
    setDesde("");
    setHasta("");
  }

  /** Escribe SOLO si el detalle sigue abierto: nunca recrea un detalle cerrado (respuestas tardías). */
  function aplicarDetalle(id: string, parte: Partial<Detalle>) {
    setAbiertos((a) => (a[id] ? { ...a, [id]: { ...a[id], ...parte } } : a));
  }

  // Tras consultar/enviar llega la primera página actualizada: se fusiona con lo ya cargado (sin duplicados, orden creado_at DESC, id DESC) y se conserva el cursor de las páginas anteriores. Si hubo más de una página de
  // eventos nuevos (la primera página no se solapa con lo cargado) se vuelve a esa página para no dejar huecos.
  function fusionarIntentos(id: string, nuevos: Intento[], parte: Partial<Detalle>) {
    setAbiertos((a) => {
      if (!a[id]) return a;

      const previos = a[id].intentos;
      const masViejoNuevo = nuevos.length > 0 ? nuevos[nuevos.length - 1].cursor : undefined;
      const hueco = nuevos.length >= 100 && previos.length > 0 && masViejoNuevo !== undefined && (previos[0].cursor ?? "") < masViejoNuevo;
      const unidos = unirIntentos(nuevos, hueco ? [] : previos);
      const siguiente = hueco || previos.length === 0 ? (nuevos.length >= 100 && masViejoNuevo !== undefined ? masViejoNuevo : null) : a[id].siguienteIntentos;

      return { ...a, [id]: { ...a[id], ...parte, intentos: unidos, siguienteIntentos: siguiente } };
    });
  }

  // Página anterior del historial (hasta 100 por vez). Solo se aplica si el detalle sigue abierto, el documento es el mismo y el cursor pedido sigue siendo el vigente (no repite ni pisa páginas).
  async function cargarAnteriores(d: Documento) {
    const cursor = abiertos[d.id]?.siguienteIntentos;

    if (!cursor || abiertos[d.id]?.cargandoMas) return;

    const generacion = historialVigente.current[d.id] ?? 0;
    const aplica = (a: Record<string, Detalle>) => a[d.id] && a[d.id].siguienteIntentos === cursor && (historialVigente.current[d.id] ?? 0) === generacion;

    aplicarDetalle(d.id, { cargandoMas: true, errorMas: "" });
    try {
      const j = await leerJson<{ intentos: Intento[]; siguiente: string | null }>(await fetch(`/api/documentos/${d.id}/intentos?cursor=${encodeURIComponent(cursor)}`, { cache: "no-store" }), "No fue posible cargar los intentos anteriores.");

      setAbiertos((a) => {
        if (!aplica(a)) return a;

        const vistos = new Set(a[d.id].intentos.map((i) => i.id));

        return { ...a, [d.id]: { ...a[d.id], cargandoMas: false, errorMas: "", intentos: [...a[d.id].intentos, ...j.intentos.filter((i) => !vistos.has(i.id))], siguienteIntentos: j.siguiente } };
      });
    } catch (e) {
      setAbiertos((a) => (aplica(a) ? { ...a, [d.id]: { ...a[d.id], cargandoMas: false, errorMas: e instanceof Error ? e.message : "No fue posible cargar los intentos anteriores." } } : a));
    }
  }

  async function alternar(d: Documento) {
    if (abiertos[d.id]) {
      jsonVigente.current[d.id] = (jsonVigente.current[d.id] ?? 0) + 1;
      historialVigente.current[d.id] = (historialVigente.current[d.id] ?? 0) + 1;
      setAbiertos((a) => Object.fromEntries(Object.entries(a).filter(([k]) => k !== d.id)));

      return;
    }

    // E02-F001: cada apertura inicia una generación nueva; la respuesta (éxito o error) solo se aplica si sigue siendo la vigente y la fila sigue abierta. Cerrar la fila o reabrirla invalida la carga anterior.
    // PRO-342-UX-R01: la apertura invalida también cualquier JSON pedido antes (por ejemplo, antes de un cambio de filtros que cerró el detalle sin pasar por aquí).
    const generacion = (historialVigente.current[d.id] ?? 0) + 1;
    const vigente = () => historialVigente.current[d.id] === generacion;
    const aplicar = (parte: Partial<Detalle>) => {
      if (vigente()) setAbiertos((a) => (a[d.id] ? { ...a, [d.id]: { ...a[d.id], ...parte } } : a));
    };

    historialVigente.current[d.id] = generacion;
    jsonVigente.current[d.id] = (jsonVigente.current[d.id] ?? 0) + 1;
    setAbiertos((a) => ({ ...a, [d.id]: { ...DETALLE_VACIO, cargando: true } }));
    try {
      const j = await leerJson<{ intentos: Intento[]; siguienteIntentos?: string | null; solicitudes?: Solicitud[] }>(await fetch(`/api/documentos/${d.id}`, { cache: "no-store" }), "No fue posible cargar el detalle.");

      // PRO-342-UX-R02 (UX-F001): fusión NO regresiva. Las acciones esperan a esta carga, pero si algo ya fusionó intentos más nuevos en esta misma generación,
      // el snapshot (anterior) no los borra ni retrocede el cursor de paginación ya conocido.
      if (vigente()) {
        setAbiertos((a) => {
          if (!a[d.id]) return a;

          const previos = a[d.id].intentos;
          const fusion = previos.length > 0;

          return { ...a, [d.id]: { ...a[d.id], cargando: false, intentos: fusion ? unirIntentos(previos, j.intentos) : j.intentos, siguienteIntentos: fusion ? (a[d.id].siguienteIntentos ?? j.siguienteIntentos ?? null) : (j.siguienteIntentos ?? null), solicitudes: j.solicitudes ?? [] } };
        });
      }
    } catch (e) {
      aplicar({ cargando: false, error: e instanceof Error ? e.message : "No fue posible cargar el detalle." });
    }
  }

  // E01 (PRO-314): JSON registrado, solo lectura y bajo demanda (una solicitud o una respuesta a la vez; el listado nunca los trae).
  async function verJson(d: Documento, vista: Omit<VistaJson, "texto" | "cargando" | "error">, url: string, extraer: (j: Record<string, unknown>) => unknown) {
    const peticion = (jsonVigente.current[d.id] ?? 0) + 1;
    const vigente = () => jsonVigente.current[d.id] === peticion;
    // Solo escribe si esta petición sigue vigente y el detalle sigue abierto (nunca recrea una fila colapsada).
    const mostrar = (json: VistaJson) => {
      if (vigente()) setAbiertos((a) => (a[d.id] ? { ...a, [d.id]: { ...a[d.id], json } } : a));
    };

    jsonVigente.current[d.id] = peticion;
    mostrar({ ...vista, texto: "", cargando: true, error: "" });
    try {
      const j = await leerJson<Record<string, unknown>>(await fetch(url, { cache: "no-store" }), "No fue posible cargar el JSON.");
      const valor = extraer(j);

      mostrar({ ...vista, texto: valor === null || valor === undefined ? "" : JSON.stringify(valor, null, 2), cargando: false, error: "" });
    } catch (e) {
      mostrar({ ...vista, texto: "", cargando: false, error: e instanceof Error ? e.message : "No fue posible cargar el JSON." });
    }
  }

  function cerrarJson(d: Documento) {
    jsonVigente.current[d.id] = (jsonVigente.current[d.id] ?? 0) + 1;
    aplicarDetalle(d.id, { json: null });
  }

  // PRO-342-R04 (UX02): copia EXACTA del lote o del CDC registrados (sin recortar ni enmascarar). El aviso «Copiado» dura 2 s y solo lo borra la última copia.
  // PRO-342-UX-R02 (UX-F001): marca Y generación del detalle se comprueban al resolver/rechazar el portapapeles y al borrar: una copia de una apertura anterior
  // (o superada por otra copia) no muestra ni borra el aviso de la apertura actual. La copia en sí no se bloquea.
  async function copiar(d: Documento, campo: "lote" | "cdc", valor: string) {
    const marca = (copiaVigente.current[d.id] ?? 0) + 1;
    const generacion = historialVigente.current[d.id] ?? 0;
    const vigente = () => copiaVigente.current[d.id] === marca && vigenteDetalle(d, generacion);

    copiaVigente.current[d.id] = marca;
    try {
      await navigator.clipboard.writeText(valor);
      if (vigente()) aplicarDetalle(d.id, { copiado: campo });
    } catch {
      if (vigente()) aplicarDetalle(d.id, { copiado: "error" });
    }
    window.setTimeout(() => {
      if (vigente()) aplicarDetalle(d.id, { copiado: "" });
    }, 2000);
  }

  // PRO-342-R04 (UX02): segunda capa (historial técnico, JSON, conexión). Solo muestra/oculta lo ya cargado por GET al abrir la fila: no consulta al gateway.
  function alternarTecnico(d: Documento) {
    setAbiertos((a) => (a[d.id] ? { ...a, [d.id]: { ...a[d.id], tecnico: !a[d.id].tecnico } } : a));
  }

  function verSolicitud(d: Documento, sol: Solicitud) {
    void verJson(d, { titulo: "Solicitud registrada (no necesariamente transmitida)", detalle: `Versión ${sol.version} · huella ${sol.payloadHash}` }, `/api/documentos/${d.id}/solicitud?version=${sol.version}`, (j) => (j.solicitud as { payload?: unknown } | undefined)?.payload);
  }

  function verRespuesta(d: Documento, i: Intento) {
    void verJson(d, { titulo: "Respuesta registrada", detalle: `${i.tipo === "ENVIO" ? "Envío" : "Consulta"} del ${fechaHora(i.creadoAt)}` }, `/api/documentos/${d.id}/intentos/${i.id}/respuesta`, (j) => (j.intento as { respuesta?: unknown } | undefined)?.respuesta);
  }

  // KuDE (PRO-194): cada apertura consulta de nuevo al servidor (sin caché); el visor libera todo al cerrar.
  function abrirKude(d: Documento) {
    void visor.abrir({
      id: d.id,
      titulo: `KuDE · ${d.tipo === "NCE" ? "Nota de crédito" : "Factura"} ${d.establecimiento}-${d.puntoExpedicion}-${d.numero}${d.serie ? ` (${d.serie})` : ""}`,
      nombre: `KuDE-${d.tipo === "NCE" ? "NCE" : "FE"}-${d.establecimiento}-${d.puntoExpedicion}-${d.numero}${d.serie ? `-${d.serie}` : ""}.pdf`.replace(/[^0-9A-Za-z.-]/g, ""),
    });
  }

  /**
   * PRO-342-UX-R01 (punto 11, AUD UX04): una sola acción por documento a la vez; la respuesta (éxito o error) se aplica SOLO al detalle de la misma generación y abierto
   * (cerrar o reabrir la fila, o cambiar de filtros, la descarta sin recrear nada). La relectura del listado se hace siempre que la acción terminó en el servidor.
   */
  function iniciarAccion(d: Documento, accion: "consulta" | "envio"): number | null {
    if (accionEnCurso.current.has(d.id) || !disponible(d)) return null;

    accionEnCurso.current.add(d.id);
    setEnCurso((e) => ({ ...e, [d.id]: accion }));
    aplicarDetalle(d.id, { aviso: "", error: "" });

    return historialVigente.current[d.id] ?? 0;
  }

  // PRO-342-UX-R02 (UX-F001): al terminar (éxito o error) el documento espera un listado lanzado después; hasta entonces sus acciones siguen deshabilitadas
  // aunque `enCurso` se libere (la vista no habilita envíos/correcciones con el estado anterior a la acción).
  function terminarAccion(d: Documento) {
    const espera = secuenciaListado.current;

    setEsperaListado((e) => ({ ...e, [d.id]: espera }));
    accionEnCurso.current.delete(d.id);
    setEnCurso((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== d.id)));
  }

  const vigenteDetalle = (d: Documento, generacion: number) => esResultadoVigente(true, generacion, historialVigente.current[d.id] ?? 0);
  /**
   * PRO-342-UX-R02 (UX-F001): sin acción en curso y con el listado vigente tras la última acción; si el detalle está abierto, además con su GET inicial ya resuelto.
   * PRO-195-UX-R01: la consulta SIFEN es acción de la FILA y funciona con el detalle cerrado (no hay snapshot que pueda pisar intentos nuevos; al reabrir, unirIntentos fusiona).
   */
  const disponible = (d: Documento) => accionDisponible({ cargandoDetalle: abiertos[d.id]?.cargando === true, enCurso: Boolean(enCurso[d.id]), esperaListado: esperaListado[d.id], secuenciaListado: resultado?.secuencia ?? 0 });
  /** Recuperación EXPLÍCITA tras un error o una espera: relee el listado (solo GET; nunca reenvía ni consulta al gateway). */
  const actualizarListado = () => setRecarga((n) => n + 1);

  /**
   * PRO-195-UX-R01-R01 (F002): la consulta de la fila puede empezar con el detalle cerrado y el usuario abrirlo (o cerrarlo y reabrirlo) antes de la respuesta.
   * La respuesta vale SOLO en la misma época de contexto (otro filtro, página o empresa recargada, o A→B→A, la descartan) y entonces:
   *  · si el detalle del documento está abierto (cualquier apertura de esa época) se FUSIONA de forma no regresiva con su historial (unirIntentos; el GET inicial
   *    que llegue después también fusiona) y se muestra el resultado en el detalle;
   *  · si está cerrado, se anuncia en la cabecera del listado.
   * Nunca se repite la consulta ni se reenvía el documento: una sola POST /consultar por acción y relectura del listado (GET).
   */
  async function reconsultar(d: Documento) {
    const generacion = iniciarAccion(d, "consulta");
    const contextoAccion = contexto;
    const epocaAccion = epocaRef.current;
    const informar = (texto: string, error: boolean, intentos: Intento[] | null) => {
      const destino = destinoConsulta({ epocaAccion, epocaActual: epocaRef.current, contextoAccion, contextoActual: contextoVistoRef.current, detalleAbierto: Boolean(abiertosRef.current[d.id]) });

      if (destino === "descartar") return;
      // Escribe solo si el detalle sigue abierto (aplicarDetalle/fusionarIntentos nunca recrean uno cerrado); se intenta también con «anuncio» por si el detalle
      // se abrió en este mismo instante (sin efecto si está cerrado).
      if (intentos) fusionarIntentos(d.id, intentos, { aviso: texto, error: "" });
      else aplicarDetalle(d.id, { error: texto });
      if (destino === "anuncio") setAnuncio({ contexto: contextoAccion, epoca: epocaAccion, texto: `Consulta de ${numeroDocumento(d)}: ${texto}`, error });
    };

    if (generacion === null) return;
    try {
      const j = await leerJson<{ resultado: string; mensaje: string | null; intentos: Intento[]; modoRegistro?: string; continuidadConexion?: string }>(await fetch(`/api/documentos/${d.id}/consultar`, { method: "POST" }), "No fue posible consultar el estado.");
      // PRO-342-R02/R05: la conexión no verificable se informa. PRO-365-R02-C02: mensaje breve de negocio (textoConsultaOperador) que conserva esa advertencia
      // (continuidadConexion === "SIN_REFERENCIA"); el resultado técnico completo (HTTP, mensaje crudo) queda en el historial de consultas.
      const texto = textoConsultaOperador(j.resultado, j.continuidadConexion);

      informar(texto, false, j.intentos);
      setRecarga((n) => n + 1);
    } catch (e) {
      informar(e instanceof Error ? e.message : "No fue posible consultar el estado.", true, null);
    } finally {
      terminarAccion(d);
    }
  }

  async function enviarAlGateway(d: Documento, confirmarRechazo = false) {
    if (confirmarRechazo && !window.confirm("El proveedor de facturación rechazó este documento por errores de datos. Reenviar el MISMO contenido solo tiene sentido si la causa ya fue corregida. No se generará un número nuevo. ¿Reenviar?")) return;

    const generacion = iniciarAccion(d, "envio");

    if (generacion === null) return;
    try {
      const j = await leerJson<{ resultado: string; estadoLocal?: string | null; mensaje: string | null; http: number | null; lote: string | null; errores: string[]; intentos: Intento[] }>(
        await fetch(`/api/documentos/${d.id}/enviar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmarRechazo }) }),
        "No fue posible enviar el documento.",
      );
      // PRO-365-R02-C02: mensaje breve según el estado local devuelto (un envío no confirmado nunca se dice «Enviado»); lote, HTTP y respuesta quedan en el historial.
      if (vigenteDetalle(d, generacion)) fusionarIntentos(d.id, j.intentos, { aviso: textoEnvioOperador(j) });
      setRecarga((n) => n + 1);
    } catch (e) {
      if (vigenteDetalle(d, generacion)) aplicarDetalle(d.id, { error: e instanceof Error ? e.message : "No fue posible enviar el documento." });
    } finally {
      terminarAccion(d);
    }
  }

  const setPagina = (valor: number) => setPaginacion({ clave: claveFiltros, pagina: Math.max(1, valor) });

  return (
    <section className={ui.page}>
      <KudeModal controlador={visor} />
      <CancelacionModal
        key={cancelando?.id ?? "cerrada"}
        datos={cancelando ? {
          numero: numeroDocumento(cancelando), cdc: cancelando.cdc, importe: importe(cancelando), aprobacionCandidata: cancelando.eventosFe?.aprobacionCandidata ?? null,
          elegibilidad: elegibilidadCancelacionFe({ tipo: cancelando.tipo, estadoSifen: cancelando.estadoSifen, puedeEditar: editar, proyeccion: cancelando.eventosFe, aprobacion: aprobacionOficialDocumento(cancelando.eventosFe), ahoraMs: datos?.generadoMs ?? Number.NaN }),
        } : null}
        alVolver={() => setCancelando(null)}
      />
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Facturación</span>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Documentos electrónicos</span>
          </nav>

          <h1>Documentos electrónicos</h1>
        </div>
      </header>

      {/* PRO-365-R02: filtros EXISTENTES reorganizados como la referencia (tarjeta propia, etiqueta sobre cada campo, rejilla compacta). Mismo estado y misma consulta:
          se aplican solos (búsqueda con espera de 300 ms), por eso no hay botón «Filtrar». Filtros de la referencia sin soporte en NEXIT quedan pendientes (no se simulan). */}
      <section className={clases(ui.contentCard, estilos.tarjetaFiltros)} aria-label="Filtros de documentos">
        <div className={estilos.filtros}>
          <label className={clases(ui.filterField, estilos.campoFiltro)}>
            <span>Emisión desde</span>
            <CampoFecha valor={desde} alCambiar={setDesde} />
          </label>

          <label className={clases(ui.filterField, estilos.campoFiltro)}>
            <span>Emisión hasta</span>
            <CampoFecha valor={hasta} alCambiar={setHasta} />
          </label>

          <label className={clases(ui.filterField, estilos.campoFiltro)}>
            <span>Sucursal</span>
            <select value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
              <option value="">Todas</option>
              {(datos?.sucursales ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className={clases(ui.filterField, estilos.campoFiltro, estilos.campoBusqueda)}>
            <span>Receptor / RUC / Nro. / CDC</span>
            <span className={ui.search}>
              <span aria-hidden="true">⌕</span>
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por número, CDC, RUC o cliente..." aria-label="Buscar documentos" />
            </span>
          </label>

          <label className={clases(ui.filterField, estilos.campoFiltro)}>
            <span>Tipo</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos</option>
              {TIPOS_DOCUMENTO.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO[t]}
                </option>
              ))}
            </select>
          </label>

          <label className={clases(ui.filterField, estilos.campoFiltro)}>
            <span>Estado SIFEN</span>
            <select value={estadoSifen} onChange={(e) => setEstadoSifen(e.target.value)}>
              <option value="">Todos</option>
              {ESTADOS_SIFEN.map((s) => (
                <option key={s} value={s}>
                  {ETIQUETA_SIFEN[s]}
                </option>
              ))}
            </select>
          </label>

          <div className={estilos.filtrosAcciones}>
            <span className={estilos.conteo} aria-live="polite">
              {datos && !obsoleto ? `${total} documento(s)` : ""}
            </span>
            <button type="button" className={ui.clearButton} onClick={limpiar}>
              Limpiar filtros
            </button>
          </div>
        </div>
      </section>

      {/* PRO-365-R02: «Resumen de estados» en tarjetas (título, cantidad con color semántico y símbolo), como la referencia. Siguen siendo botones-filtro con la cifra del servidor. */}
      <section className={estilos.resumen} aria-labelledby="titulo-resumen-estados">
        <h2 className={estilos.tituloSeccion} id="titulo-resumen-estados">Resumen de estados</h2>
        <div className={estilos.kpis} role="group" aria-label="Indicadores de documentos (filtran el listado)" aria-busy={cargando || obsoleto}>
          {INDICADORES.map((i) => (
            <button
              key={i.titulo}
              type="button"
              className={clases(estilos.kpi, i.clase, grupo === i.grupo && estilos.kpiActivo)}
              aria-pressed={grupo === i.grupo}
              title={i.ayuda}
              onClick={() => setGrupo(i.grupo)}
            >
              <span className={estilos.kpiTexto}>
                <span className={estilos.kpiTitulo}>{i.titulo}</span>
                <strong className={estilos.kpiValor}>{resumen === null ? "—" : i.grupo === "" ? (resumen.total ?? 0) : (resumen[i.grupo] ?? 0)}</strong>
              </span>
              <span className={estilos.kpiIcono} aria-hidden="true"><svg viewBox="0 0 24 24">{GLIFO[i.simbolo]}</svg></span>
              <span className={estilos.srSolo}>. {i.ayuda}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={ui.contentCard}>
        {errorCarga && !cargando ? (
          <div className={ui.alertError} role="alert" style={{ margin: "0 0 8px" }}>
            {errorCarga}{" "}
            <button type="button" className={ui.clearButton} onClick={() => setRecarga((n) => n + 1)}>
              Reintentar
            </button>
          </div>
        ) : null}

        {/* PRO-195-UX-R01: resultado de una consulta lanzada desde la fila con el detalle cerrado (solo en su contexto). */}
        {anuncio && anuncio.contexto === contexto && anuncio.epoca === epocaContexto ? (
          <div className={clases(anuncio.error ? ui.alertError : ui.alertOk, estilos.anuncio)} role={anuncio.error ? "alert" : "status"}>
            <span>{anuncio.texto}</span>
            <span className={estilos.anuncioAcciones}>
              {cargando ? null : <button type="button" className={ui.clearButton} onClick={actualizarListado}>Actualizar listado</button>}
              <button type="button" className={ui.clearButton} onClick={() => setAnuncio(null)}>Cerrar</button>
            </span>
          </div>
        ) : null}

        {/* PRO-195-UX-R01 (punto 2): selección real de la página visible; sin acciones masivas en esta versión (R05). */}
        {seleccionados.length > 0 ? (
          <div className={estilos.barraSeleccion} role="status">
            <span>{seleccionados.length} documento(s) seleccionado(s) en esta página. Sin acciones masivas disponibles en esta versión.</span>
            <button type="button" className={ui.clearButton} onClick={() => setSeleccion({ contexto, ids: [] })}>Quitar selección</button>
          </div>
        ) : null}

        {/* PRO-365-R02: leyenda ÚNICA y COMPACTA en una línea, como la referencia: orden de los cuatro estados y significado de los símbolos. El detalle de cada fase va en su tooltip. */}
        <div className={estilos.leyendaEstados} id="leyenda-estados">
          <span>
            <strong>Estado:</strong> Envío · XML/CDC · SIFEN · Correo
          </span>
          <span className={estilos.leyendaSimbolos}>
            {LEYENDA_SIMBOLOS.map((s) => (
              <span key={s.simbolo} className={clases(estilos.leyendaSimbolo, s.clase)}>
                <span className={estilos.iconoCirculo} aria-hidden="true"><svg viewBox="0 0 24 24">{GLIFO[s.simbolo]}</svg></span>
                {s.texto}
              </span>
            ))}
            <span className={clases(estilos.leyendaSimbolo, estilos.iconoAviso)}>
              <span className={estilos.iconoCirculo} aria-hidden="true"><svg viewBox="0 0 24 24">{GLIFO.alerta}</svg></span>
              aviso
            </span>
          </span>
          <span className={estilos.srSolo}>Envío indica si el documento fue enviado; XML/CDC indica si se registró el código del documento, que no es una aprobación; SIFEN es el resultado fiscal; Correo es el envío por correo al cliente. Enfoque, toque o pase el puntero sobre cada icono para ver su estado.</span>
        </div>

        <div className={clases(ui.tableScroll, estilos.contenedorTabla)}>
          <table className={clases(ui.table, estilos.tablaDocs)} aria-busy={cargando} aria-describedby="leyenda-estados">
            <thead>
              <tr>
                <th className={estilos.colControl}><span className={estilos.srSolo}>Detalle</span></th>
                <th className={estilos.colControl}>
                  <input
                    type="checkbox"
                    className={estilos.casilla}
                    aria-label="Seleccionar todos los documentos de esta página"
                    checked={filas.length > 0 && seleccionados.length === filas.length}
                    ref={(el) => {
                      if (el) el.indeterminate = seleccionados.length > 0 && seleccionados.length < filas.length;
                    }}
                    disabled={filas.length === 0 || cargando}
                    onChange={(e) => setSeleccion({ contexto, ids: e.target.checked ? filas.map((f) => f.id) : [] })}
                  />
                </th>
                <ThOrdenable titulo="Acciones" />
                <ThOrdenable titulo="Nro. Documento" campo="numero" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Fecha emisión" campo="fecha" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="RUC/CI" />
                <ThOrdenable titulo="Razón Social" campo="cliente" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Monto" campo="total" orden={orden} onOrden={cambiarOrden} alinear="derecha" />
                <ThOrdenable titulo="Estado" campo="estado" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Eventos" />
              </tr>
            </thead>

            <tbody>
              {filas.map((d) => {
                const det = abiertos[d.id];
                const alerta = alertaConsulta(d);
                // PRO-342-R05: nota informativa (no alerta de integridad) si la API informó un estado final sin CDC. PRO-342-UX-R01: va en el historial técnico.
                const sinCdc = avisoSinCdc(d);
                const fiscal = detalleFiscalPrimario(d);
                const consultas = det ? resumenConsultas(det.intentos) : { valida: null, ultima: null };
                // PRO-342-R01: envío (ACK), último retorno del gateway (p. ej. «XML firmado») y resultado fiscal SIFEN en ejes separados (segunda capa).
                const seguimiento = seguimientoFiscal(d);
                // PRO-365: los cuatro estados INDEPENDIENTES de la fila (Envío · XML/CDC · SIFEN · Correo), derivados solo de lo persistido.
                const fases = iconosEstado(d);
                // PRO-313-R01: elegibilidad PREPARADA de la cancelación (no operativa: sin aprobación oficial acreditada ni envío habilitado); el servidor revalidará todo al confirmar.
                const cancelacion = elegibilidadCancelacionFe({ tipo: d.tipo, estadoSifen: d.estadoSifen, puedeEditar: editar, proyeccion: d.eventosFe, aprobacion: aprobacionOficialDocumento(d.eventosFe), ahoraMs: datos?.generadoMs ?? Number.NaN });
                const eventos = eventosFila(d, cancelacion);
                // PRO-365-R02-C02: primera capa en lenguaje llano (eventos, aviso, encabezado y motivo); la versión técnica (eventos, alerta) sigue en el historial técnico.
                const eventosVista = eventosOperador(d, cancelacion);
                const avisoFila = avisoOperador(alerta, d.requiereRevision, d.tipo);
                const encabezado = encabezadoFiscal(d);
                const respuesta = respuestaFiscal(d, fiscal);
                const accion = enCurso[d.id];
                const habilitada = disponible(d);
                const esperando = !accion && esperaListado[d.id] !== undefined && (resultado?.secuencia ?? 0) <= esperaListado[d.id];
                const doc = `${d.tipo === "NCE" ? "la nota de crédito" : "la factura"} ${numeroDocumento(d)}`;
                const motivoEspera = accion === "consulta" ? "Consulta en curso." : accion === "envio" ? "Envío en curso." : esperando ? "Actualizando el estado del documento tras la última acción." : "Cargando el detalle del documento.";
                const acciones = accionesFila(kudeDisponible(d), { editar }, habilitada, motivoEspera);
                const { fecha, hora } = partirFechaHora(fechaHora(d.fechaEmision));
                const marcado = seleccionados.includes(d.id);

                return (
                  <Fragment key={d.id}>
                    <tr className={clases(ui.row, CLASE_FILA_TIPO[d.tipo], marcado && estilos.filaMarcada)} data-tipo={d.tipo}>
                      <td className={estilos.colControl}>
                        <button type="button" className={clases(estilos.expandir, det && estilos.expandirActivo)} aria-expanded={Boolean(det)} aria-controls={det ? `detalle-${d.id}` : undefined} title={det ? "Ocultar detalle" : "Ver detalle"} aria-label={`${det ? "Ocultar" : "Ver"} detalle de ${doc}`} onClick={() => alternar(d)}>
                          <svg viewBox="0 0 24 24" aria-hidden="true">{det ? ACCION.cerrar : ACCION.abrir}</svg>
                        </button>
                      </td>
                      <td className={estilos.colControl}>
                        <input type="checkbox" className={estilos.casilla} aria-label={`Seleccionar ${doc}`} checked={marcado} onChange={(e) => setSeleccion((s) => alternarSeleccion(s, contexto, d.id, e.target.checked))} />
                      </td>
                      <td>
                        <div className={estilos.accionesLinea} role="group" aria-label={`Acciones de ${doc}`}>
                          {acciones.filter((a) => a.visible).map((a) =>
                            a.clave === "kude" ? (
                              <AccionIcono key={a.clave} clase={CLASE_ACCION.kude} glifo={ACCION.kude} etiqueta={`Consultar KuDE (PDF) de ${doc}`} disponible={a.disponible} motivo={a.motivo} alActivar={() => abrirKude(d)} tip={eventosTip} />
                            ) : a.clave === "consulta" ? (
                              <AccionIcono key={a.clave} clase={CLASE_ACCION.consulta} glifo={ACCION.consultar} etiqueta={accion === "consulta" ? `Consultando el estado en SIFEN de ${doc}` : `Consultar estado en SIFEN de ${doc} (no reenvía)`} disponible={a.disponible} motivo={a.motivo} ocupado={accion === "consulta"} alActivar={() => void reconsultar(d)} tip={eventosTip} />
                            ) : (
                              <AccionIcono key={a.clave} clase={CLASE_ACCION[a.clave]} glifo={a.clave === "xml" ? ACCION.xml : ACCION.correo} etiqueta={a.clave === "xml" ? `XML de ${doc}` : `Correo de ${doc}`} disponible={a.disponible} motivo={AYUDA_ACCION_NO_DISPONIBLE[a.clave]} alActivar={() => undefined} tip={eventosTip} />
                            ),
                          )}
                        </div>
                      </td>
                      <td>
                        <div className={ui.cell}>
                          <strong className={ui.mono}>{d.establecimiento}-{d.puntoExpedicion}-{d.numero}</strong>
                          <span>
                            <span className={CLASE_ETIQUETA_TIPO[d.tipo] ?? estilos.tipoOtro} title={ETIQUETA_TIPO[d.tipo]}>{d.tipo}</span>
                            <span className={estilos.srSolo}> {ETIQUETA_TIPO[d.tipo]}</span>
                            {" · "}{d.serie ? `Serie ${d.serie}` : "Sin serie"} · {d.sucursalNombre}
                          </span>
                          {d.tipo === "NCE" && d.feNumero ? <span>Factura {d.feNumero}{d.nceMotivo ? ` · ${MOTIVO_NCE[d.nceMotivo] ?? ""}` : ""}</span> : null}
                        </div>
                      </td>
                      <td>
                        <div className={ui.cell}>
                          <strong className={estilos.sinCorte}>{fecha}</strong>
                          <span className={ui.mono}>{hora}</span>
                        </div>
                      </td>
                      <td className={clases(ui.mono, estilos.sinCorte)}>{d.receptorDocumento ?? "Sin información"}</td>
                      <td className={estilos.razon}>{d.receptorNombre}</td>
                      <td className={ui.numeric} title={importe(d)}>
                        <span className={estilos.moneda}>{d.moneda}</span> <strong className={ui.mono}>{formatearImporteMoneda(d.total, d.moneda)}</strong>
                      </td>
                      <td>
                        {/* PRO-365: cuatro iconos simultáneos en orden fijo + quinta posición reservada al aviso técnico (vacía si no hay, para alinear las filas). */}
                        <div className={estilos.estado} role="group" aria-label={`Estados de ${doc}`}>
                          {/* PRO-365-R02-C02: tooltip breve de operador (Envío ENVIADO = exactamente «Enviado») y nombre accesible con el eje; símbolo, color y posición sin cambios. */}
                          {fases.map((i) => (
                            <IconoFase key={i.eje} eje={i.eje} simbolo={i.simbolo} clase={CLASE_TONO_ICONO[i.tono]} texto={textoIconoOperador(i, d).texto} etiqueta={textoIconoOperador(i, d).etiqueta} tip={eventosTip} />
                          ))}
                          {avisoFila ? (
                            <IconoFase eje="aviso" simbolo="alerta" clase={alerta?.tipo === "inconsistencia" || !alerta ? estilos.iconoError : estilos.iconoAviso} texto={`Revisar: ${avisoFila}`} etiqueta={`Aviso: ${avisoFila}`} tip={eventosTip} />
                          ) : (
                            <span className={estilos.iconoVacio} aria-hidden="true" />
                          )}
                        </div>
                      </td>
                      <td>
                        <div className={estilos.eventos}>
                          {/* PRO-365: Eventos COMPACTO. Situación acreditada o «Sin información» (nunca «sin eventos»); la indisponibilidad de Cancelación/Inutilización va en el
                              nombre accesible y el tooltip del control, no repetida como texto en cada fila. */}
                          <span className={eventosVista.registrado ? estilos.eventoRegistrado : estilos.sinEventos}>
                            {eventosVista.registrado ?? "Sin información"}
                            {eventosVista.registrado ? null : <span className={estilos.srSolo}> de eventos</span>}
                          </span>
                          {/* PRO-313-R01: «Cancelar documento» solo FE; habilitado únicamente si es elegible (hoy nunca: gates de aprobación oficial y homologación). No hay ruta de envío. */}
                          {cancelacion.aplica ? (
                            <AccionIcono clase={estilos.accionEventos} glifo={ACCION.eventos} etiqueta={`Cancelar documento ${doc}`} disponible={cancelacion.disponible} motivo={eventosVista.operacion} alActivar={() => setCancelando(d)} tip={eventosTip} />
                          ) : (
                            <AccionIcono clase={estilos.accionEventos} glifo={ACCION.eventos} etiqueta={`Eventos de ${doc}`} disponible={false} motivo={eventosVista.operacion} alActivar={() => undefined} tip={eventosTip} />
                          )}
                        </div>
                      </td>
                    </tr>

                    {det ? (
                      <tr id={`detalle-${d.id}`} className={clases(estilos.detalle, CLASE_DETALLE_TIPO[d.tipo])} data-tipo={d.tipo}>
                        <td colSpan={10}>
                          {/* PRO-342-R04 (UX02) / PRO-342-UX-R01 (punto 8) / PRO-195-UX-R01 (punto 5) — PRIMERA CAPA: solo cuatro datos fiscales, tal como los registró la API (sin inventar, recortar ni enmascarar). */}
                          {/* PRO-365-R02-C02: el encabezado declara UN estado claro (Aprobado / Rechazado / Pendiente de respuesta / Cancelado / Inutilizado…) derivado del estado
                              persistido (encabezadoFiscal), nunca del texto del mensaje. */}
                          <div className={estilos.detalleCabecera}>
                            <strong>Detalle fiscal · {numeroDocumento(d)}</strong>
                            <span className={clases(estilos.estadoFiscal, CLASE_TONO_ICONO[encabezado.tono])} data-estado-fiscal={encabezado.titulo}>
                              <span className={estilos.iconoCirculo} aria-hidden="true"><svg viewBox="0 0 24 24">{GLIFO[encabezado.simbolo]}</svg></span>
                              <span><span className={estilos.srSolo}>Estado: </span>{encabezado.titulo}</span>
                            </span>
                            {encabezado.nota ? <span className={estilos.notaEstadoFiscal}>{encabezado.nota}</span> : null}
                          </div>
                          <dl className={estilos.fiscal} aria-label="Datos fiscales">
                            <div>
                              <dt className={ui.muted}>Nro lote</dt>
                              <dd className={ui.mono}>{d.lote ?? "Sin información"}</dd>
                              {fiscal.lote ? (
                                <button type="button" className={estilos.copiar} title={det.copiado === "lote" ? "Copiado" : "Copiar"} aria-label="Copiar número de lote" onClick={() => void copiar(d, "lote", fiscal.lote as string)}>
                                  <Glifo>{det.copiado === "lote" ? ACCION.copiado : ACCION.copiar}</Glifo>
                                </button>
                              ) : <span aria-hidden="true" />}
                            </div>
                            <div>
                              <dt className={ui.muted}>{d.tipo === "NCE" ? "CDC de la nota de crédito" : "CDC"}</dt>
                              {/* PRO-342-R05: CDC literal informado por la API (cualquier forma/longitud): se muestra completo, con espacios conservados y corte de línea. */}
                              <dd className={ui.mono} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{fiscal.cdc ?? "Sin información"}</dd>
                              {fiscal.cdc ? (
                                <button type="button" className={estilos.copiar} title={det.copiado === "cdc" ? "Copiado" : "Copiar"} aria-label="Copiar CDC" onClick={() => void copiar(d, "cdc", fiscal.cdc as string)}>
                                  <Glifo>{det.copiado === "cdc" ? ACCION.copiado : ACCION.copiar}</Glifo>
                                </button>
                              ) : <span aria-hidden="true" />}
                            </div>
                            <div>
                              <dt className={ui.muted}>Fecha firma</dt>
                              <dd>{fiscal.fechaFirma ? fechaGateway(fiscal.fechaFirma) : "Sin información"}</dd>
                            </div>
                            {/* PRO-365-R02-C02: ya no hay «Mensaje» incondicional. Solo con RECHAZADO persistido: «Motivo del rechazo» con código y mensaje tal como se registraron
                                (p. ej. «1109 · …»; no se convierte en Inutilizado). En otros estados el mensaje registrado no se presenta como resultado vigente: queda en el historial técnico. */}
                            {respuesta.motivo ? (
                              <div>
                                <dt className={ui.muted}>{respuesta.motivo.etiqueta}</dt>
                                <dd className={estilos.mensajeRechazo}>{respuesta.motivo.valor}</dd>
                              </div>
                            ) : null}
                          </dl>
                          {respuesta.notaHistorial ? <p className={clases(ui.muted, estilos.notaEstadoFiscal)}>{respuesta.notaHistorial}</p> : null}
                          <span className={estilos.srSolo} role="status" aria-live="polite">{det.copiado === "lote" || det.copiado === "cdc" ? "Copiado al portapapeles" : det.copiado === "error" ? "No fue posible copiar: seleccione el texto manualmente" : ""}</span>
                          {det.copiado === "error" ? <div className={ui.alertError} role="alert" style={{ margin: "4px 0" }}>No fue posible copiar: seleccione el texto manualmente.</div> : null}

                          {/* PRO-342-UX-R01 (punto 10): avisos CRÍTICOS breves, siempre visibles en la primera capa; la explicación técnica completa queda en la segunda capa. */}
                          {alerta ? (
                            <div className={alerta.tipo === "inconsistencia" ? estilos.avisoInconsistencia : estilos.avisoTecnico} role="note">
                              <strong>Aviso:</strong> {avisoOperador(alerta, false, d.tipo)}{d.ultimaConsultaAt ? ` Última consulta: ${fechaHora(d.ultimaConsultaAt)}.` : ""}
                            </div>
                          ) : null}
                          {d.requiereRevision ? (
                            <div className={estilos.avisoTecnico} role="note"><strong>Requiere revisión:</strong> sin resultado definitivo desde hace mucho tiempo; no se reenvía{d.tipo === "NCE" ? " ni se libera el saldo" : ""}.</div>
                          ) : null}
                          {d.estadoLocal === "ERROR_ENVIO" && d.envioErrorTipo === "RECHAZO" ? (
                            <p className={ui.alertError} role="alert">{d.tipo === "NCE" ? "El proveedor de facturación rechazó esta nota de crédito por errores de datos (no es un rechazo de SIFEN). Se conservan su número y el historial; no se reenvía: emita una nueva con «Corregir y emitir nueva»." : "El proveedor de facturación rechazó este documento por errores de datos (no es un rechazo de SIFEN). Se conservan su número y el historial; no se genera otro número ni se reenvía automáticamente."}</p>
                          ) : null}
                          {d.estadoLocal === "ENVIO_INDETERMINADO" ? (
                            <p className={ui.alertError} role="alert">Envío no confirmado. Antes de cualquier reenvío, verifique con el proveedor de facturación si el documento llegó: Nexit no reenvía automáticamente un envío no confirmado.</p>
                          ) : null}

                          {/* PRO-195-UX-R01 (punto 3): «Más acciones» legítimas con sus guardas y confirmaciones de siempre (envío manual, reenvío confirmado, corrección NCE). */}
                          <div className={estilos.barraAcciones} role="group" aria-label={`Más acciones de ${doc}`}>
                            {crear && (d.estadoLocal === "PENDIENTE_ENVIO" || (d.estadoLocal === "ERROR_ENVIO" && d.envioErrorTipo !== "RECHAZO")) ? (
                              <button type="button" className={ui.primaryButton} disabled={!habilitada} onClick={() => enviarAlGateway(d)}>
                                {accion === "envio" ? "Enviando..." : "Enviar documento"}
                              </button>
                            ) : null}
                            {crear && d.tipo !== "NCE" && d.estadoLocal === "ERROR_ENVIO" && d.envioErrorTipo === "RECHAZO" ? (
                              <button type="button" className={ui.secondaryButton} disabled={!habilitada} onClick={() => enviarAlGateway(d, true)}>
                                {accion === "envio" ? "Enviando..." : "Reenviar el mismo documento (confirmar)"}
                              </button>
                            ) : null}
                            {crear && d.tipo === "NCE" && d.corregible ? (
                              habilitada ? (
                                <Link className={ui.primaryButton} href={`/notas-credito?corregir=${d.id}`}>Corregir y emitir nueva</Link>
                              ) : (
                                <button type="button" className={ui.primaryButton} disabled>Corregir y emitir nueva</button>
                              )
                            ) : null}
                            {/* PRO-342-UX-R01 (punto 7): «Alternar historial técnico» con icono de expandir; abrirlo no consulta al gateway. */}
                            <button type="button" className={estilos.toggleTecnico} aria-expanded={det.tecnico} aria-controls={`tecnico-${d.id}`} onClick={() => alternarTecnico(d)}>
                              <Glifo>{det.tecnico ? ACCION.cerrar : ACCION.abrir}</Glifo>
                              Historial técnico ({det.cargando ? "…" : `${det.intentos.length}${det.siguienteIntentos ? "+" : ""}`})
                            </button>
                          </div>
                          {/* PRO-342-UX-R02 (UX-F001): tras una acción, el estado mostrado puede ser anterior; se dice y se ofrece releer (solo GET). */}
                          {esperando ? (
                            <p className={estilos.esperaEstado} role="status">
                              {cargando ? "Actualizando el estado del documento…" : "Estado del documento sin actualizar tras la última acción."}{" "}
                              {cargando ? null : <button type="button" className={ui.clearButton} onClick={actualizarListado}>Actualizar</button>}
                            </p>
                          ) : null}
                          {det.aviso ? <div className={ui.alertOk} role="status" style={{ margin: "6px 0" }}>{det.aviso}</div> : null}
                          {det.error ? <div className={ui.alertError} role="alert" style={{ margin: "6px 0" }}>{det.error}</div> : null}

                          {/* PRO-342-R04 (UX02) / PRO-342-UX-R01 (punto 9) — SEGUNDA CAPA, cerrada por defecto: explicaciones técnicas, seguimiento, historial completo, JSON y conexión. */}
                          {det.tecnico ? (
                            <div id={`tecnico-${d.id}`} className={estilos.tecnico} role="region" aria-label="Historial técnico">
                              {sinCdc ? <div className={estilos.avisoTecnico} role="note">{sinCdc}</div> : null}
                              {alerta ? <div className={estilos.notaTecnica} role="note"><strong>Aviso técnico:</strong> {alerta.texto}. {alerta.detalle}</div> : null}

                              {/* PRO-365: los cuatro estados se ven SIEMPRE en la fila; aquí se repiten con su nombre y texto corto como referencia técnica (no es el único sitio). */}
                              <h4 className={estilos.subtitulo}>Estados técnicos</h4>
                              <ul className={estilos.estadosTecnicos} aria-label={`Estados técnicos de ${numeroDocumento(d)}`}>
                                {iconosEstado(d).map((i) => (
                                  <li key={i.eje}>
                                    <IconoFase eje={i.eje} simbolo={i.simbolo} clase={CLASE_TONO_ICONO[i.tono]} texto={i.texto} tip={eventosTip} />
                                    <span><strong>{NOMBRE_EJE[i.eje]}:</strong> {i.corto}</span>
                                  </li>
                                ))}
                              </ul>
                              <p className={ui.muted}>Eventos: {eventos.registrado ?? eventos.sinRegistro}. {eventos.operacion}</p>
                              {/* PRO-313-R01: eventos tal como los informó la API (response.DE.Evento), separados del estado de la FE; todas las ocurrencias, en el orden recibido. */}
                              {d.eventosFe ? (
                                <div className={estilos.eventosDetalle} role="note" aria-label={`Eventos informados de ${numeroDocumento(d)}`}>
                                  <span className={ui.muted}>{d.eventosFe.detalle}{d.eventosFe.lectura ? ` Consulta registrada el ${fechaHora(d.eventosFe.lectura.creadoAt)}.` : ""}</span>
                                  {d.eventosFe.aprobacionCandidata ? <span className={ui.muted}>Fecha de retorno informada con la aprobación (candidata, sin confirmar significado ni zona horaria): {d.eventosFe.aprobacionCandidata}. No habilita el plazo de 48 horas.</span> : null}
                                  {d.eventosFe.avisos.map((a) => <span key={a} className={ui.muted}>{a}</span>)}
                                  {d.eventosFe.eventos.length ? (
                                    <ol className={estilos.listaEventos}>
                                      {d.eventosFe.eventos.map((e) => (
                                        <li key={e.posicion}>
                                          <strong className={e.clase === "APROBADO" ? estilos.eventoAprobado : e.clase === "RECHAZADO" ? estilos.eventoRechazado : undefined}>{e.estado ?? "Estado no informado"}</strong>
                                          {" · "}Motivo: {e.motivo ?? "Sin información"}{" · "}Detalle: {e.detalle ?? "Sin información"}{" · "}Fecha: {e.fecha ?? "Sin información"}
                                        </li>
                                      ))}
                                    </ol>
                                  ) : null}
                                </div>
                              ) : null}

                              <h4 className={estilos.subtitulo}>Seguimiento fiscal</h4>
                              <dl className={estilos.datosTecnicos} aria-label="Seguimiento fiscal">
                                <div><dt className={ui.muted}>1 · Envío al gateway</dt><dd>{seguimiento.envio}</dd></div>
                                <div><dt className={ui.muted}>2 · Último retorno del gateway</dt><dd>{seguimiento.ultimoRetorno}{d.ultimaConsultaAt ? ` (${fechaHora(d.ultimaConsultaAt)})` : ""}</dd></div>
                                <div><dt className={ui.muted}>3 · Resultado fiscal SIFEN</dt><dd>{seguimiento.resultadoFiscal}</dd></div>
                              </dl>

                              <h4 className={estilos.subtitulo}>Registro del documento</h4>
                              <dl className={estilos.datosTecnicos}>
                                {d.tipo === "NCE" ? <div><dt className={ui.muted}>Factura original</dt><dd>{d.feNumero ?? "—"}{d.nceMotivo ? ` · Motivo: ${MOTIVO_NCE[d.nceMotivo] ?? d.nceMotivo}` : ""}</dd></div> : null}
                                {d.tipo === "NCE" ? <div><dt className={ui.muted}>CDC de la factura original</dt><dd className={ui.mono}>{d.feCdc ?? "—"}</dd></div> : null}
                                <div><dt className={ui.muted}>Estado fiscal registrado</dt><dd>{ETIQUETA_SIFEN[d.estadoSifen]}</dd></div>
                                <div><dt className={ui.muted}>Texto informado por el gateway (última consulta válida)</dt><dd>{d.estadoGatewayTexto ?? "—"}</dd></div>
                                <div><dt className={ui.muted}>Último mensaje registrado del gateway</dt><dd>{d.codRespuesta ? `${d.codRespuesta} · ` : ""}{d.mensajeRespuesta ?? "—"}<br /><small className={ui.muted}>De un envío o de una consulta válida; las consultas fallidas no lo modifican.</small></dd></div>
                                <div><dt className={ui.muted}>Fecha de envío</dt><dd>{fechaGateway(d.fechaEnvio)}</dd></div>
                                <div><dt className={ui.muted}>Última respuesta fiscal válida</dt><dd>{consultas.valida ? describirConsulta(consultas.valida, false) : det.cargando ? "Cargando historial..." : "No hay una consulta válida en el historial cargado."}</dd></div>
                                <div><dt className={ui.muted}>Último intento de consulta</dt><dd>{consultas.ultima ? describirConsulta(consultas.ultima, true) : d.ultimaConsultaAt ? `${fechaHora(d.ultimaConsultaAt)} · ${ETIQUETA_RESULTADO_INTENTO[d.ultimaConsultaResultado ?? ""] ?? d.ultimaConsultaResultado}` : "Nunca consultado"}<br /><small className={ui.muted}>Detalle completo y JSON de respuesta en el historial de consultas.</small></dd></div>
                              </dl>

                              <p className={ui.muted}>{d.tipo === "FE" || d.tipo === "NCE" ? "XML: descarga no disponible." : "KuDE y XML: descarga no disponible para este tipo de documento."}</p>

                              <h4 className={estilos.subtitulo}>Solicitud registrada (no necesariamente transmitida)</h4>
                              {det.cargando ? null : det.solicitudes.length === 0 ? (
                                <p className={ui.muted}>No hay JSON registrado para este documento.</p>
                              ) : (
                                <div className={estilos.botonesJson}>
                                  {det.solicitudes.map((sol) => (
                                    <button key={sol.version} type="button" className={ui.secondaryButton} onClick={() => verSolicitud(d, sol)}>
                                      Ver JSON de solicitud · versión {sol.version}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {det.json ? (
                                <div className={estilos.visorJson} role="region" aria-label={det.json.titulo}>
                                  <div className={estilos.visorJsonCabecera}>
                                    <strong>{det.json.titulo}</strong> <small className={ui.muted}>{det.json.detalle}</small>
                                    <button type="button" className={estilos.iconBtn} title="Cerrar JSON" aria-label="Cerrar JSON" onClick={() => cerrarJson(d)}>
                                      <Glifo><path d="m7.5 7.5 9 9m0-9-9 9" /></Glifo>
                                    </button>
                                  </div>
                                  {det.json.cargando ? <p className={ui.muted}>Cargando JSON...</p> : null}
                                  {det.json.error ? <div className={ui.alertError} role="alert">{det.json.error}</div> : null}
                                  {!det.json.cargando && !det.json.error ? (
                                    det.json.texto === "" ? (
                                      <p className={ui.muted}>No hay JSON registrado para este intento</p>
                                    ) : (
                                      <pre className={estilos.json}>{det.json.texto}</pre>
                                    )
                                  ) : null}
                                </div>
                              ) : null}

                              <h4 className={estilos.subtitulo}>Historial de envíos y consultas</h4>
                              {det.cargando ? (
                                <p className={ui.muted}>Cargando historial...</p>
                              ) : det.intentos.length === 0 ? (
                                <p className={ui.muted}>Sin consultas registradas.</p>
                              ) : (
                                <div className={ui.tableScroll}>
                                  <table className={ui.table} style={{ minWidth: 760 }}>
                                    <thead>
                                      <tr><th>Fecha</th><th>Intento</th><th>Resultado</th><th>HTTP</th><th>Estado informado</th><th>Realizado por</th><th>Respuesta registrada</th></tr>
                                    </thead>
                                    <tbody>
                                      {det.intentos.map((i) => (
                                        <tr key={i.id} className={ui.row}>
                                          <td>{fechaHora(i.creadoAt)}</td>
                                          <td>{i.tipo === "ENVIO" ? "Envío" : "Consulta"}{i.fase ? ` · ${i.fase.toLowerCase()}` : ""}</td>
                                          <td>{etiquetaIntento(i.tipo, i.resultado)}{i.lote ? ` · lote ${i.lote}` : ""}{i.cdcInformado ? <><br /><small className={clases(ui.muted, estilos.literal)}>CDC informado: {i.cdcInformado}</small></> : i.cdcRespuesta ? <><br /><small className={clases(ui.muted, estilos.literal)}>CDC informado (según el JSON de respuesta): {i.cdcRespuesta}</small></> : null}{avisoProyeccionCdc(i) ? <><br /><small className={ui.muted}>{avisoProyeccionCdc(i)}</small></> : null}{i.mensaje ? <><br /><small className={ui.muted}>{i.mensaje}</small></> : null}{textoConexion(i.conexion) ? <><br /><small className={ui.muted}>Conexión: {textoConexion(i.conexion)}</small></> : <><br /><small className={ui.muted}>Conexión: no registrada (intento anterior a NEX-079)</small></>}</td>
                                          <td>{i.httpStatus ?? "—"}</td>
                                          <td>{i.estadoGateway ?? "—"}</td>
                                          <td>{i.actorNombre}</td>
                                          <td>
                                            {i.tieneRespuesta ? (
                                              <button type="button" className={ui.secondaryButton} onClick={() => verRespuesta(d, i)}>Ver JSON de respuesta</button>
                                            ) : (
                                              <small className={ui.muted}>No hay JSON registrado para este intento</small>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {det.errorMas ? <div className={ui.alertError} role="alert" style={{ margin: "8px 0" }}>{det.errorMas}</div> : null}
                              {det.siguienteIntentos ? (
                                <div className={estilos.cargarMas}>
                                  <button type="button" className={ui.secondaryButton} disabled={det.cargandoMas} onClick={() => void cargarAnteriores(d)}>
                                    {det.cargandoMas ? "Cargando..." : "Cargar intentos anteriores"}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}

              {filas.length === 0 ? (
                <tr>
                  <td colSpan={10} className={ui.emptyCell}>
                    <div className={ui.empty}>
                      <strong>{cargando ? "Cargando documentos..." : errorCarga ? "No se pudo cargar el listado" : hayFiltros ? "No se encontraron documentos" : "Aún no hay documentos electrónicos"}</strong>
                      {!cargando && !errorCarga ? <span>{hayFiltros ? "Modifique los filtros." : "Los documentos emitidos desde Nexit aparecerán aquí."}</span> : null}
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <footer className={ui.pagination}>
          <span>
            {obsoleto ? "Cargando..." : `Mostrando ${total === 0 ? 0 : (paginaMostrada - 1) * PAGE_SIZE + 1}–${Math.min(paginaMostrada * PAGE_SIZE, total)} de ${total} documento(s)`}
          </span>

          <div>
            <button type="button" aria-label="Página anterior" disabled={paginaMostrada <= 1 || cargando} onClick={() => setPagina(paginaMostrada - 1)}>
              ‹
            </button>
            <strong>
              {paginaMostrada} / {totalPaginas}
            </strong>
            <button type="button" aria-label="Página siguiente" disabled={paginaMostrada >= totalPaginas || cargando} onClick={() => setPagina(paginaMostrada + 1)}>
              ›
            </button>
          </div>
        </footer>
      </section>

      {/* Tooltip visual de los iconos de estado (el texto completo ya es el nombre accesible del icono, por eso se oculta a los lectores de pantalla). */}
      {tip ? (
        <div ref={tipRef} className={estilos.tooltip} aria-hidden="true" onMouseEnter={() => window.clearTimeout(cierreTip.current)} onMouseLeave={eventosTip.programarCierre}>
          {tip.texto}
        </div>
      ) : null}
    </section>
  );
}
