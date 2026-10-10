import type { Pool, PoolClient } from "pg";

// Datos relacionados del cliente (contactos, direcciones y documentos): lectura y sincronización para la EDICIÓN.
// Mismas reglas y tablas que el alta (POST /api/clientes). Todo se ejecuta dentro de la transacción del llamador y
// SIEMPRE con empresa_id de la sesión. Semántica:
//   - Si el cuerpo no trae `contactos` / `direcciones` / `documentos`, esa colección no se toca.
//   - Un elemento con `id` actualiza esa fila (el id debe pertenecer a ESTE cliente y empresa); los campos que no vengan
//     en el elemento conservan su valor actual.
//   - Un elemento sin `id` se inserta.
//   - Una fila solo se elimina si su id viene en `contactosEliminar` / `direccionesEliminar` / `documentosEliminar`:
//     omitirla de la lista nunca borra datos.

type Db = Pick<Pool, "query">;
type Json = Record<string, unknown>;
type Conn = PoolClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS_DIRECCION = new Set(["FISCAL", "COMERCIAL", "ENTREGA", "SUCURSAL", "OTRA"]);
const TIPOS_DOCUMENTO = new Set(["RUC", "CONTRATO", "CREDITO", "EXONERACION", "OTRO"]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ErrorValidacion extends Error {}

function texto(v: unknown, max?: number) {
  if (typeof v !== "string") return "";
  const r = v.trim();
  return max ? r.slice(0, max) : r;
}
const opcional = (v: unknown, max?: number) => texto(v, max) || null;

function numeroOpcional(v: unknown, min: number, max: number) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new ErrorValidacion("Uno de los valores numéricos informados no es válido.");
  if (n < min) throw new ErrorValidacion(`El valor debe ser igual o mayor a ${min}.`);
  if (n > max) throw new ErrorValidacion(`El valor debe ser igual o menor a ${max}.`);
  return n;
}

function codigoGeografico(v: unknown, etiqueta: string) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorValidacion(`${etiqueta} no es válido.`);
  return n;
}

function correo(v: string | null, etiqueta: string) {
  if (v && !EMAIL.test(v)) throw new ErrorValidacion(`${etiqueta} no tiene un formato válido.`);
}

/** dd/mm/yyyy -> yyyy-mm-dd (mismo formato que usa el alta). */
function fechaIso(v: unknown, etiqueta: string) {
  const f = texto(v);
  if (!f) return null;
  const m = f.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new ErrorValidacion(`${etiqueta} debe tener el formato dd/mm/yyyy.`);
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  if (d.getUTCFullYear() !== +m[3] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[1]) {
    throw new ErrorValidacion(`${etiqueta} no es una fecha válida.`);
  }
  return `${m[3]}-${m[2]}-${m[1]}`;
}

const idsDe = (v: unknown, etiqueta: string): string[] => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ErrorValidacion(`La lista de ${etiqueta} a eliminar no es válida.`);
  const ids = v.map((x) => texto(x));
  if (ids.some((x) => !UUID.test(x))) throw new ErrorValidacion(`Un identificador de ${etiqueta} no es válido.`);
  return [...new Set(ids)];
};

// ---------------------------------------------------------------- Formas de la API
export type ContactoApi = {
  id: string; nombre: string; apellido: string; cargo: string; departamento: string; telefono: string; celular: string; email: string;
  esPrincipal: boolean; recibePedidos: boolean; recibeFacturacion: boolean; recibeCobranzas: boolean;
  recibeDocumentosElectronicos: boolean; recibeNotificaciones: boolean;
};
export type DireccionApi = {
  id: string; tipo: string; etiqueta: string; direccion: string; numeroCasa: string; complemento: string; paisCodigo: string; paisNombre: string;
  departamentoCodigo: string; departamento: string; distritoCodigo: string; distrito: string; ciudadCodigo: string; ciudad: string;
  codigoPostal: string; contactoNombre: string; contactoTelefono: string; horarioRecepcion: string; observacion: string;
  esFiscal: boolean; esEntregaDefault: boolean; latitud: string; longitud: string;
};
export type DocumentoApi = {
  id: string; tipo: string; nombreArchivo: string; urlArchivo: string; fechaEmision: string; fechaVencimiento: string; observacion: string;
};
export type HijosApi = { contactos: ContactoApi[]; direcciones: DireccionApi[]; documentos: DocumentoApi[] };

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export async function leerHijos(db: Db, empresaId: string, clienteId: string): Promise<HijosApi> {
  const [c, d, o] = await Promise.all([
    db.query(`SELECT * FROM cliente_contactos WHERE empresa_id = $1 AND cliente_id = $2 ORDER BY es_principal DESC, creado_at, id`, [empresaId, clienteId]),
    db.query(`SELECT * FROM direcciones_cliente WHERE empresa_id = $1 AND cliente_id = $2 ORDER BY es_fiscal DESC, es_entrega_default DESC, creado_at, id`, [empresaId, clienteId]),
    db.query(
      `SELECT id, tipo, nombre_archivo, url_archivo, to_char(fecha_emision, 'DD/MM/YYYY') AS fe, to_char(fecha_vencimiento, 'DD/MM/YYYY') AS fv, observacion
         FROM cliente_documentos WHERE empresa_id = $1 AND cliente_id = $2 ORDER BY creado_at, id`,
      [empresaId, clienteId],
    ),
  ]);
  return {
    contactos: c.rows.map(contactoDeFila),
    direcciones: d.rows.map(direccionDeFila),
    documentos: o.rows.map(documentoDeFila),
  };
}

const contactoDeFila = (r: Json): ContactoApi => ({
  id: r.id as string, nombre: s(r.nombre), apellido: s(r.apellido), cargo: s(r.cargo), departamento: s(r.departamento), telefono: s(r.telefono),
  celular: s(r.celular), email: s(r.email), esPrincipal: r.es_principal === true, recibePedidos: r.recibe_pedidos === true,
  recibeFacturacion: r.recibe_facturacion === true, recibeCobranzas: r.recibe_cobranzas === true,
  recibeDocumentosElectronicos: r.recibe_documentos_electronicos === true, recibeNotificaciones: r.recibe_notificaciones !== false,
});
const direccionDeFila = (r: Json): DireccionApi => ({
  id: r.id as string, tipo: s(r.tipo), etiqueta: s(r.etiqueta), direccion: s(r.direccion), numeroCasa: s(r.numero_casa), complemento: s(r.complemento),
  paisCodigo: s(r.pais_codigo), paisNombre: s(r.pais_nombre), departamentoCodigo: s(r.departamento_codigo), departamento: s(r.departamento),
  distritoCodigo: s(r.distrito_codigo), distrito: s(r.distrito), ciudadCodigo: s(r.ciudad_codigo), ciudad: s(r.ciudad), codigoPostal: s(r.codigo_postal),
  contactoNombre: s(r.contacto_nombre), contactoTelefono: s(r.contacto_telefono), horarioRecepcion: s(r.horario_recepcion), observacion: s(r.observacion),
  esFiscal: r.es_fiscal === true, esEntregaDefault: r.es_entrega_default === true,
  latitud: r.latitud === null || r.latitud === undefined ? "" : String(Number(r.latitud)),
  longitud: r.longitud === null || r.longitud === undefined ? "" : String(Number(r.longitud)),
});
const documentoDeFila = (r: Json): DocumentoApi => ({
  id: r.id as string, tipo: s(r.tipo), nombreArchivo: s(r.nombre_archivo), urlArchivo: s(r.url_archivo), fechaEmision: s(r.fe), fechaVencimiento: s(r.fv),
  observacion: s(r.observacion),
});

// ---------------------------------------------------------------- Geografía (Paraguay), igual que el alta
type Geo = { departamentoCodigo: number; distritoCodigo: number; ciudadCodigo: number; departamento: string; distrito: string; ciudad: string };
async function validarGeografiaParaguay(c: Conn, d: DireccionApi): Promise<Geo | null> {
  if (texto(d.paisCodigo, 3).toUpperCase() !== "PRY") return null;
  const dep = codigoGeografico(d.departamentoCodigo, "El departamento");
  const dis = codigoGeografico(d.distritoCodigo, "El distrito");
  const ciu = codigoGeografico(d.ciudadCodigo, "La ciudad");
  if (!dep || !dis || !ciu) throw new ErrorValidacion("Para una dirección de Paraguay seleccione departamento, distrito y ciudad.");
  const r = await c.query(
    `SELECT d.nombre AS departamento, di.nombre AS distrito, ci.nombre AS ciudad
       FROM referencia_geografica_departamentos d
       JOIN referencia_geografica_distritos di ON di.departamento_codigo = d.codigo
       JOIN referencia_geografica_ciudades ci ON ci.distrito_codigo = di.codigo
      WHERE d.codigo = $1 AND di.codigo = $2 AND ci.codigo = $3`,
    [dep, dis, ciu],
  );
  if (r.rowCount !== 1) throw new ErrorValidacion("La combinación de departamento, distrito y ciudad no es válida.");
  return { departamentoCodigo: dep, distritoCodigo: dis, ciudadCodigo: ciu, ...(r.rows[0] as Pick<Geo, "departamento" | "distrito" | "ciudad">) };
}

// ---------------------------------------------------------------- Cuerpo de la solicitud
export type Entrada = {
  contactos?: Json[]; direcciones?: Json[]; documentos?: Json[];
  eliminar: { contactos: string[]; direcciones: string[]; documentos: string[] };
};

function listaEntrada(v: unknown, etiqueta: string): Json[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== "object" || x === null || Array.isArray(x))) {
    throw new ErrorValidacion(`La lista de ${etiqueta} no es válida.`);
  }
  for (const x of v as Json[]) {
    if (x.id !== undefined && x.id !== null && x.id !== "" && !UUID.test(texto(x.id))) throw new ErrorValidacion(`Un identificador de ${etiqueta} no es válido.`);
  }
  return v as Json[];
}

export function leerEntrada(cuerpo: Json): Entrada {
  return {
    contactos: listaEntrada(cuerpo.contactos, "contactos"),
    direcciones: listaEntrada(cuerpo.direcciones, "direcciones"),
    documentos: listaEntrada(cuerpo.documentos, "documentos"),
    eliminar: {
      contactos: idsDe(cuerpo.contactosEliminar, "contactos"),
      direcciones: idsDe(cuerpo.direccionesEliminar, "direcciones"),
      documentos: idsDe(cuerpo.documentosEliminar, "documentos"),
    },
  };
}

const idEntrada = (x: Json) => (texto(x.id) ? texto(x.id) : null);
const definido = (x: Json, k: string) => Object.prototype.hasOwnProperty.call(x, k) && x[k] !== undefined;
const mezclar = <T extends Json>(base: T, x: Json): T => {
  const r: Json = { ...base };
  for (const k of Object.keys(base)) if (k !== "id" && definido(x, k)) r[k] = x[k];
  return r as T;
};
const bool = (v: unknown) => v === true;

/** Comprueba que cada id pertenezca al cliente y que no haya ids repetidos ni a la vez en la lista y en `eliminar`. */
function validarIds(items: Json[] | undefined, eliminar: string[], existentes: Set<string>, etiqueta: string) {
  const vistos = new Set<string>();
  for (const x of items ?? []) {
    const id = idEntrada(x);
    if (!id) continue;
    if (!existentes.has(id)) throw new ErrorValidacion(`Un elemento de ${etiqueta} no pertenece a este cliente.`);
    if (vistos.has(id)) throw new ErrorValidacion(`Hay ${etiqueta} repetidos en la solicitud.`);
    if (eliminar.includes(id)) throw new ErrorValidacion(`Un elemento de ${etiqueta} no puede actualizarse y eliminarse a la vez.`);
    vistos.add(id);
  }
  for (const id of eliminar) if (!existentes.has(id)) throw new ErrorValidacion(`Un elemento de ${etiqueta} a eliminar no pertenece a este cliente.`);
}

export type Resumen = { contactos: { nuevos: number; actualizados: number; eliminados: number }; direcciones: { nuevos: number; actualizados: number; eliminados: number }; documentos: { nuevos: number; actualizados: number; eliminados: number } };

// ---------------------------------------------------------------- Sincronización
export async function sincronizarHijos(c: Conn, empresaId: string, clienteId: string, usuarioId: string, e: Entrada): Promise<Resumen> {
  const resumen: Resumen = {
    contactos: { nuevos: 0, actualizados: 0, eliminados: 0 },
    direcciones: { nuevos: 0, actualizados: 0, eliminados: 0 },
    documentos: { nuevos: 0, actualizados: 0, eliminados: 0 },
  };
  const toca = (items: Json[] | undefined, el: string[]) => (items?.length ?? 0) > 0 || el.length > 0;

  // ---- Contactos
  if (toca(e.contactos, e.eliminar.contactos)) {
    const act = (await c.query(`SELECT * FROM cliente_contactos WHERE empresa_id = $1 AND cliente_id = $2 FOR UPDATE`, [empresaId, clienteId])).rows as Json[];
    const actApi = new Map(act.map((r) => [r.id as string, contactoDeFila(r)]));
    validarIds(e.contactos, e.eliminar.contactos, new Set(actApi.keys()), "contactos");
    const finales: { id: string | null; v: ContactoApi }[] = [];
    for (const x of e.contactos ?? []) {
      const id = idEntrada(x);
      const base = id ? actApi.get(id)! : ({ id: "", nombre: "", apellido: "", cargo: "", departamento: "", telefono: "", celular: "", email: "", esPrincipal: false, recibePedidos: false, recibeFacturacion: false, recibeCobranzas: false, recibeDocumentosElectronicos: false, recibeNotificaciones: true } as ContactoApi);
      const v = mezclar(base, x);
      if (!texto(v.nombre, 100)) throw new ErrorValidacion("Cada contacto debe tener nombre.");
      correo(opcional(v.email, 150), "El correo de un contacto");
      finales.push({ id, v });
    }
    const idsMod = new Set(finales.filter((f) => f.id).map((f) => f.id as string));
    const principales = [
      ...finales.filter((f) => bool(f.v.esPrincipal)).map(() => 1),
      ...[...actApi.values()].filter((a) => !idsMod.has(a.id) && !e.eliminar.contactos.includes(a.id) && a.esPrincipal).map(() => 1),
    ];
    if (principales.length > 1) throw new ErrorValidacion("Solo puede haber un contacto principal por cliente.");

    if (e.eliminar.contactos.length) {
      await c.query(`DELETE FROM cliente_contactos WHERE empresa_id = $1 AND cliente_id = $2 AND id = ANY($3::uuid[])`, [empresaId, clienteId, e.eliminar.contactos]);
      resumen.contactos.eliminados = e.eliminar.contactos.length;
    }
    if (idsMod.size) {
      // Evita choques transitorios con el índice único del contacto principal al cambiar de principal.
      await c.query(`UPDATE cliente_contactos SET es_principal = false WHERE empresa_id = $1 AND cliente_id = $2 AND id = ANY($3::uuid[])`, [empresaId, clienteId, [...idsMod]]);
    }
    for (const { id, v } of finales) {
      const p = [texto(v.nombre, 100), opcional(v.apellido, 100), opcional(v.cargo, 100), opcional(v.departamento, 100), opcional(v.telefono, 30), opcional(v.celular, 30), opcional(v.email, 150),
        bool(v.esPrincipal), bool(v.recibePedidos), bool(v.recibeFacturacion), bool(v.recibeCobranzas), bool(v.recibeDocumentosElectronicos), v.recibeNotificaciones !== false];
      if (id) {
        await c.query(
          `UPDATE cliente_contactos SET nombre=$4, apellido=$5, cargo=$6, departamento=$7, telefono=$8, celular=$9, email=$10, es_principal=$11, recibe_pedidos=$12,
                  recibe_facturacion=$13, recibe_cobranzas=$14, recibe_documentos_electronicos=$15, recibe_notificaciones=$16
            WHERE id = $1 AND empresa_id = $2 AND cliente_id = $3`,
          [id, empresaId, clienteId, ...p],
        );
        resumen.contactos.actualizados++;
      } else {
        await c.query(
          `INSERT INTO cliente_contactos (cliente_id, nombre, apellido, cargo, departamento, telefono, celular, email, es_principal, recibe_pedidos, recibe_facturacion, recibe_cobranzas, recibe_documentos_electronicos, recibe_notificaciones)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [clienteId, ...p],
        );
        resumen.contactos.nuevos++;
      }
    }
  }

  // ---- Direcciones
  if (toca(e.direcciones, e.eliminar.direcciones)) {
    const act = (await c.query(`SELECT * FROM direcciones_cliente WHERE empresa_id = $1 AND cliente_id = $2 FOR UPDATE`, [empresaId, clienteId])).rows as Json[];
    const actApi = new Map(act.map((r) => [r.id as string, direccionDeFila(r)]));
    validarIds(e.direcciones, e.eliminar.direcciones, new Set(actApi.keys()), "direcciones");
    const finales: { id: string | null; v: DireccionApi; geo: Geo | null; fiscal: boolean }[] = [];
    for (const x of e.direcciones ?? []) {
      const id = idEntrada(x);
      const base = id
        ? actApi.get(id)!
        : ({ id: "", tipo: "COMERCIAL", etiqueta: "", direccion: "", numeroCasa: "", complemento: "", paisCodigo: "", paisNombre: "", departamentoCodigo: "", departamento: "", distritoCodigo: "", distrito: "", ciudadCodigo: "", ciudad: "", codigoPostal: "", contactoNombre: "", contactoTelefono: "", horarioRecepcion: "", observacion: "", esFiscal: false, esEntregaDefault: false, latitud: "", longitud: "" } as DireccionApi);
      const v = mezclar(base, x);
      const tipo = texto(v.tipo).toUpperCase() || "COMERCIAL";
      if (!TIPOS_DIRECCION.has(tipo)) throw new ErrorValidacion("Existe una dirección con tipo no válido.");
      if (!texto(v.direccion, 300)) throw new ErrorValidacion("Informe la dirección de cada ubicación registrada.");
      if (!texto(v.paisCodigo, 3)) throw new ErrorValidacion("Informe el país de cada dirección.");
      v.tipo = tipo;
      numeroOpcional(v.latitud, -90, 90);
      numeroOpcional(v.longitud, -180, 180);
      finales.push({ id, v, geo: await validarGeografiaParaguay(c, v), fiscal: bool(v.esFiscal) || tipo === "FISCAL" });
    }
    const idsMod = new Set(finales.filter((f) => f.id).map((f) => f.id as string));
    const sinTocar = [...actApi.values()].filter((a) => !idsMod.has(a.id) && !e.eliminar.direcciones.includes(a.id));
    if (finales.filter((f) => f.fiscal).length + sinTocar.filter((a) => a.esFiscal || a.tipo === "FISCAL").length > 1) {
      throw new ErrorValidacion("Solo puede haber una dirección fiscal por cliente.");
    }
    if (finales.filter((f) => bool(f.v.esEntregaDefault)).length + sinTocar.filter((a) => a.esEntregaDefault).length > 1) {
      throw new ErrorValidacion("Solo puede haber una dirección de entrega predeterminada por cliente.");
    }

    if (e.eliminar.direcciones.length) {
      await c.query(`DELETE FROM direcciones_cliente WHERE empresa_id = $1 AND cliente_id = $2 AND id = ANY($3::uuid[])`, [empresaId, clienteId, e.eliminar.direcciones]);
      resumen.direcciones.eliminados = e.eliminar.direcciones.length;
    }
    if (idsMod.size) {
      // Evita choques transitorios con los índices únicos (fiscal / entrega predeterminada) y con el CHECK tipo FISCAL.
      await c.query(
        `UPDATE direcciones_cliente SET es_fiscal = false, es_entrega_default = false, tipo = CASE WHEN tipo = 'FISCAL' THEN 'COMERCIAL' ELSE tipo END
          WHERE empresa_id = $1 AND cliente_id = $2 AND id = ANY($3::uuid[])`,
        [empresaId, clienteId, [...idsMod]],
      );
    }
    for (const { id, v, geo, fiscal } of finales) {
      const p = [
        opcional(v.etiqueta, 100) ?? v.tipo, texto(v.direccion, 300), geo?.ciudad ?? opcional(v.ciudad, 100), geo?.departamento ?? opcional(v.departamento, 100),
        numeroOpcional(v.latitud, -90, 90), numeroOpcional(v.longitud, -180, 180), fiscal, bool(v.esEntregaDefault), v.tipo, opcional(v.etiqueta, 100),
        opcional(v.numeroCasa, 20), opcional(v.complemento, 200), texto(v.paisCodigo, 3).toUpperCase(), texto(v.paisNombre, 60) || null,
        geo?.departamentoCodigo ?? null, geo?.distritoCodigo ?? null, geo?.distrito ?? opcional(v.distrito, 100), geo?.ciudadCodigo ?? null,
        opcional(v.codigoPostal, 15), opcional(v.contactoNombre, 200), opcional(v.contactoTelefono, 30), opcional(v.horarioRecepcion, 200), opcional(v.observacion, 500),
      ];
      if (id) {
        await c.query(
          `UPDATE direcciones_cliente SET descripcion=$4, direccion=$5, ciudad=$6, departamento=$7, latitud=$8, longitud=$9, es_fiscal=$10, es_entrega_default=$11, tipo=$12,
                  etiqueta=$13, numero_casa=$14, complemento=$15, pais_codigo=$16, pais_nombre=COALESCE($17, pais_nombre), departamento_codigo=$18, distrito_codigo=$19, distrito=$20,
                  ciudad_codigo=$21, codigo_postal=$22, contacto_nombre=$23, contacto_telefono=$24, horario_recepcion=$25, observacion=$26
            WHERE id = $1 AND empresa_id = $2 AND cliente_id = $3`,
          [id, empresaId, clienteId, ...p],
        );
        resumen.direcciones.actualizados++;
      } else {
        await c.query(
          `INSERT INTO direcciones_cliente (cliente_id, descripcion, direccion, ciudad, departamento, latitud, longitud, es_fiscal, es_entrega_default, tipo, etiqueta, numero_casa, complemento,
                  pais_codigo, pais_nombre, departamento_codigo, distrito_codigo, distrito, ciudad_codigo, codigo_postal, contacto_nombre, contacto_telefono, horario_recepcion, observacion)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
          [clienteId, ...p],
        );
        resumen.direcciones.nuevos++;
      }
    }
  }

  // ---- Documentos
  if (toca(e.documentos, e.eliminar.documentos)) {
    const act = (
      await c.query(
        `SELECT id, tipo, nombre_archivo, url_archivo, to_char(fecha_emision, 'DD/MM/YYYY') AS fe, to_char(fecha_vencimiento, 'DD/MM/YYYY') AS fv, observacion
           FROM cliente_documentos WHERE empresa_id = $1 AND cliente_id = $2 FOR UPDATE`,
        [empresaId, clienteId],
      )
    ).rows as Json[];
    const actApi = new Map(act.map((r) => [r.id as string, documentoDeFila(r)]));
    validarIds(e.documentos, e.eliminar.documentos, new Set(actApi.keys()), "documentos");
    const finales: { id: string | null; v: DocumentoApi; fe: string | null; fv: string | null }[] = [];
    for (const x of e.documentos ?? []) {
      const id = idEntrada(x);
      const base = id ? actApi.get(id)! : ({ id: "", tipo: "OTRO", nombreArchivo: "", urlArchivo: "", fechaEmision: "", fechaVencimiento: "", observacion: "" } as DocumentoApi);
      const v = mezclar(base, x);
      v.tipo = texto(v.tipo).toUpperCase();
      if (!TIPOS_DOCUMENTO.has(v.tipo)) throw new ErrorValidacion("Existe un tipo de documento de cliente no válido.");
      if (!texto(v.nombreArchivo, 255) || !texto(v.urlArchivo)) throw new ErrorValidacion("Cada documento requiere nombre de archivo y URL segura.");
      const fe = fechaIso(v.fechaEmision, "La fecha de emisión del documento");
      const fv = fechaIso(v.fechaVencimiento, "La fecha de vencimiento del documento");
      if (fe && fv && fv < fe) throw new ErrorValidacion("La fecha de vencimiento de un documento no puede ser anterior a su emisión.");
      finales.push({ id, v, fe, fv });
    }
    if (e.eliminar.documentos.length) {
      await c.query(`DELETE FROM cliente_documentos WHERE empresa_id = $1 AND cliente_id = $2 AND id = ANY($3::uuid[])`, [empresaId, clienteId, e.eliminar.documentos]);
      resumen.documentos.eliminados = e.eliminar.documentos.length;
    }
    for (const { id, v, fe, fv } of finales) {
      const p = [v.tipo, texto(v.nombreArchivo, 255), texto(v.urlArchivo), fe, fv, opcional(v.observacion, 500)];
      if (id) {
        await c.query(
          `UPDATE cliente_documentos SET tipo=$4, nombre_archivo=$5, url_archivo=$6, fecha_emision=$7, fecha_vencimiento=$8, observacion=$9
            WHERE id = $1 AND empresa_id = $2 AND cliente_id = $3`,
          [id, empresaId, clienteId, ...p],
        );
        resumen.documentos.actualizados++;
      } else {
        await c.query(
          `INSERT INTO cliente_documentos (cliente_id, tipo, nombre_archivo, url_archivo, fecha_emision, fecha_vencimiento, observacion, cargado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [clienteId, ...p, usuarioId],
        );
        resumen.documentos.nuevos++;
      }
    }
  }
  return resumen;
}
