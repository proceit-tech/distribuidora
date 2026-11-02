/**
 * E05 (PRO-200) — ajustes visuales y códigos de la Factura. Solo PRESENTACIÓN y manejo de TEXTO de códigos: ningún cálculo fiscal ni payload cambia. Sin PostgreSQL ni navegador (pantalla estructural; lógica real
 * probada: formateo, comparación de códigos, búsqueda rápida con Enter, payload y resumen del servidor).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { crearBuscadorRapido, elegirPorEnter, MENSAJE_ENTER } from "@/lib/facturacion/busqueda-rapida";
import { soloDifierenCerosIniciales } from "@/lib/facturacion/codigo-producto";
import { buscarProductosFactura, leerCuerpoFactura, prepararFactura, type CuerpoFactura } from "@/lib/facturacion/emision";
import { construirPayloadFE, resumenCalculo, totalFactura, type EntradaFE, type LineaFE, type ReceptorFE } from "@/lib/facturacion/payload-fe";
import { etiquetaEstablecimiento, textoConciliacionPagos } from "@/lib/facturacion/presentacion";
import { textoDec } from "@/lib/facturacion/calculo";
import { formatearMontoVisual } from "@/lib/formato/monto-visual";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const EMPRESA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const SUC = "55555555-5555-4555-8555-555555555555";
const CLIENTE = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
const PUNTO = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";
const P_CERO = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";
const P_SIN = "f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2";
const P_11 = "f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3";

const receptor: ReceptorFE = {
  codigo: "CLI-000001", naturaleza: 1, tipoOperacion: 1, tipoContribuyente: 2, pais: "PRY", ruc: "80000005", dv: "6", tipoDocumentoIdentidad: null, descripcionTipoDocumento: "", numeroDocumento: "",
  razonSocial: "EMPRESA SINTETICA SA", nombreFantasia: "", direccion: "Calle 1", numeroCasa: "123", departamento: "1", distrito: "1", ciudad: "1", telefono: "", celular: "", email: "a@b.com", emailCopia: "", emailFacturacion: "",
};
const linea = (extra: Partial<LineaFE> = {}): LineaFE => ({ codigoInterno: "P-1", gtin: null, descripcion: "Producto de prueba", unidadSifen: 77, cantidad: "1", precio: "11000", afectacion: 1, tasa: 10, proporcion: null, ...extra });
function entrada(lineas: LineaFE[]): EntradaFE {
  const total = totalFactura(lineas);

  return { moneda: "PYG", tipoTransaccion: 1, presencia: 1, condicion: 1, pagos: [{ tipo: 1, monto: total === null ? "1" : textoDec(total) }], infoAdicional: "", receptor, lineas };
}
type Payload = { Detalles: Array<Record<string, string | number | null>>; Subtotales: Array<Record<string, number>> };

const prod = (id: string, codigo: string) => ({ id, codigo, controlaStock: false, descripcion: "Producto " + codigo, unidadSifen: 77, unidadSimbolo: "UNI", unidadNombre: "Unidad", unidadVigente: true, afectacion: 1, proporcion: null, tasa: 10, precio: "11000", monedaPrecio: "PYG", gtin: null });

export async function verificarCasosVisualCodigosE05(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── 1. Guaraníes sin decimales en pantalla; la precisión interna y lo transmitido NO cambian ─────────────────────────────────────────────────────
  {
    const lineas = [linea({ codigoInterno: "A", precio: "24600" }), linea({ codigoInterno: "B", precio: "24600" }), linea({ codigoInterno: "C", precio: "58100" })];
    const p = construirPayloadFE(entrada(lineas)) as unknown as Payload;
    const r = resumenCalculo(lineas);

    igual("E05-01 la IVA conserva TODA su precisión en el payload (9754.54545454, ejemplo conocido del gateway) y en el resumen interno, aunque se MUESTRE como 9.755 en guaraníes", [p.Subtotales[0].dTotIVA, p.Subtotales[0].dIVA10, r.texto.totalIva, formatearMontoVisual(r.texto.totalIva, "PYG")], [9754.54545454, 9754.54545454, "9754.54545454", "9.755"]);
    igual("E05-02 campos, totales y revisión en PYG: 82500.0000 → 82.500; 9754.54545454 → 9.755; 107300 → 107.300; USD conserva 2 decimales", [formatearMontoVisual("82500.0000", "PYG"), formatearMontoVisual("9754.54545454", "PYG"), formatearMontoVisual(r.texto.total, "PYG"), formatearMontoVisual("12.5", "USD")], ["82.500", "9.755", "107.300", "12,50"]);
    igual("E05-03 el total transmitido es el exacto (107300) y no depende del formato de pantalla", [p.Subtotales[0].dTotGralOpe, p.Detalles.map((d) => d.dTotOpeItem)], [107300, [24600, 24600, 58100]]);
  }
  igual("E05-04 pagos y crédito: «a cubrir» y «cubre» se muestran sin decimales en PYG; con pagos que NO coinciden se muestra el decimal EXACTO (no se oculta la diferencia)", [
    textoConciliacionPagos({ simbolo: "Gs.", moneda: "PYG", objetivo: "52250.4", suma: "52250.4", coincide: true }),
    textoConciliacionPagos({ simbolo: "Gs.", moneda: "PYG", objetivo: "52250.4", suma: "52250", coincide: false }),
    textoConciliacionPagos({ simbolo: "Gs.", moneda: "PYG", objetivo: "52250", suma: null, coincide: false }),
    textoConciliacionPagos({ simbolo: "US$", moneda: "USD", objetivo: "18.9", suma: "18.9", coincide: true }),
  ], ["Suma de los pagos Gs. 52.250 de 52.250 · coinciden", "Suma de los pagos Gs. 52.250 de 52.250,4 · NO coinciden", "Revise los montos · a cubrir Gs. 52.250", "Suma de los pagos US$ 18,90 de 18,90 · coinciden"]);

  // ── 2. «Establecimiento 001» ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("E05-10 el establecimiento emisor se rotula siempre «Establecimiento 001» (ceros conservados)", [etiquetaEstablecimiento("001"), etiquetaEstablecimiento("002")], ["Establecimiento 001", "Establecimiento 002"]);

  // ── 3. Códigos de producto: texto, ceros iniciales, sin conversión ──────────────────────────────────────────────────────────────────────────────
  igual("E05-20 001234 y 1234 son códigos DISTINTOS: solo se consideran «parecidos» los numéricos que difieren en ceros iniciales; el mismo texto, los alfanuméricos y los distintos no", [
    soloDifierenCerosIniciales("001234", "1234"), soloDifierenCerosIniciales("1234", "001234"), soloDifierenCerosIniciales("001234", "001234"), soloDifierenCerosIniciales("001234", "01234"), soloDifierenCerosIniciales("A001", "A1"), soloDifierenCerosIniciales("001234", "1235"), soloDifierenCerosIniciales("0", "00"),
  ], [true, true, false, true, false, false, true]);
  {
    type P = { codigo: string; gtin: string | null };
    const exacto = (p: P, t: string) => p.codigo.toLowerCase() === t.toLowerCase() || p.gtin === t;
    const parecido = (p: P, t: string) => soloDifierenCerosIniciales(p.codigo, t);
    const cero: P = { codigo: "001234", gtin: null };
    const sin: P = { codigo: "1234", gtin: null };
    const enter = (items: P[], texto: string) => elegirPorEnter(items, texto, exacto, parecido);

    igual("E05-21 Enter con «1234» y un único resultado «001234»: NO lo elige solo (es otro código); con el código exacto sí; con ambos códigos en la lista elige el idéntico", [enter([cero], "1234"), enter([cero], "001234").elegido?.codigo, enter([cero, sin], "1234").elegido?.codigo, enter([cero, sin], "001234").elegido?.codigo], [{ elegido: null, motivo: "CODIGO_PARECIDO" }, "001234", "1234", "001234"]);
    igual("E05-22 el comportamiento anterior se conserva: un único resultado parcial no numérico/ sin relación de ceros (p. ej. descripción) se sigue eligiendo; varios resultados no se eligen", [enter([{ codigo: "AB-77", gtin: null }], "ab").elegido?.codigo, enter([{ codigo: "7790123456789", gtin: "7790123456789" }], "7790123456789").elegido?.codigo, enter([cero, { codigo: "9", gtin: null }], "12").motivo, enter([], "1").motivo], ["AB-77", "7790123456789", "VARIOS", "SIN_RESULTADOS"]);
    igual("E05-23 el mensaje de código parecido está en español y no confunde con «varios»", MENSAJE_ENTER.CODIGO_PARECIDO, "No hay un código idéntico: el resultado solo difiere en los ceros iniciales. Elíjalo de la lista si es el correcto.");

    // Controlador real de la búsqueda rápida (Enter): no selecciona el código parecido y lo informa.
    const elegidos: string[] = [];
    const avisos: string[] = [];
    const cola: Array<() => void> = [];
    const b = crearBuscadorRapido<P & { id: string }>({
      buscar: async () => ({ items: [{ id: "x", ...cero }], total: 1 }),
      programar: (fn) => { cola.push(fn); return cola.length; },
      cancelar: () => undefined,
      habilitado: () => true, exacto, parecido, titulo: (t) => t.codigo,
      alCambiar: (e) => { if (e.aviso) avisos.push(e.aviso); },
      alElegir: (t) => elegidos.push(t.codigo),
    });

    b.escribir("1234");
    await b.enter();
    igual("E05-24 controlador de la búsqueda rápida: Enter con «1234» y único resultado «001234» → no se añade nada y se muestra el aviso; con «001234» exacto → se añade", [elegidos, avisos.includes(MENSAJE_ENTER.CODIGO_PARECIDO)], [[], true]);
    b.escribir("001234");
    await b.enter();
    igual("E05-25 …y con el texto exacto se añade el producto", elegidos, ["001234"]);
  }
  {
    // La búsqueda al servidor envía el texto TAL CUAL (sin convertir a número) y la lista devuelve el código como texto.
    const llamadas: Array<{ sql: string; p: unknown[] }> = [];
    const db = { async query(sql: string, p: unknown[] = []) { llamadas.push({ sql, p }); return { rows: [{ ...prod(P_CERO, "001234"), total: "1" }], rowCount: 1 }; } } as never;
    const r = await buscarProductosFactura(db, EMPRESA, "  001234 ");

    igual("E05-26 la búsqueda de productos envía «001234» como texto (filtro ILIKE sobre el código, sin Number) y devuelve el código con sus ceros", [llamadas[0].p[1], llamadas[0].p[2], (r.productos[0] as { codigo: string }).codigo], ["001234", "%001234%", "001234"]);
  }
  {
    // Emisión: 001234, 1234 y un código de 11 dígitos viajan como TEXTO distinto e intacto en el payload y en el resumen del servidor.
    const filaCliente = { codigo: "CLI-1", naturaleza_receptor: 1, tipo_operacion: 1, tipo_contribuyente_sifen: 2, pais_codigo: "PRY", tipo_documento_identidad_sifen: null, descripcion_documento_identidad: null, numero_documento: "80000005", dv: "6", razon_social: "CLIENTE", nombre_fantasia: null, email: null, email_copia: null, email_facturacion: null, telefono: null, celular: null, telefono_ddi: null, celular_ddi: null, activo: true, bloqueado_ventas: false, direccion: "Calle 1", numero_casa: "123", departamento_codigo: "1", distrito_codigo: "1", ciudad_codigo: "1" };
    const catalogo = [prod(P_CERO, "001234"), prod(P_SIN, "1234"), prod(P_11, "00123456789")];
    const db = {
      async query(sql: string, p: unknown[] = []) {
        if (/usuario_tiene_permiso/.test(sql)) return { rows: [{ ok: false }], rowCount: 1 };
        if (/FROM clientes c\s+LEFT JOIN LATERAL/.test(sql)) return { rows: [filaCliente], rowCount: 1 };
        if (/SELECT c\.id, c\.naturaleza_receptor/.test(sql)) return { rows: [{ ...filaCliente, id: CLIENTE, tipo_persona: "JURIDICA", tipo_documento: "RUC" }], rowCount: 1 };
        if (/FROM direcciones_cliente/.test(sql)) return { rows: [{ cliente_id: CLIENTE, direccion: "Calle 1", numero_casa: "123", departamento_codigo: "1", distrito_codigo: "1", ciudad_codigo: "1", pais_codigo: "PRY" }], rowCount: 1 };
        if (/FROM referencia_geografica_paises/.test(sql)) return { rows: [{ codigo: "PRY" }], rowCount: 1 };
        if (/FROM sucursales sc JOIN empresas e/.test(sql)) return { rows: [{ empresa: "EMPRESA", sucursal: "Casa Central", establecimiento: "001", punto: "002", puntoNombre: "Punto 002" }], rowCount: 1 };
        if (/FROM productos p/.test(sql)) return { rows: catalogo.filter((c) => (p[1] as string[]).includes(c.id)), rowCount: 1 };

        return { rows: [], rowCount: 0 };
      },
    } as never;
    const cuerpo = leerCuerpoFactura({ claveIdempotencia: "clave-codigos-0001", sucursalId: SUC, puntoId: PUNTO, clienteId: CLIENTE, tipoTransaccion: 1, presencia: 1, pagos: [{ tipo: 1 }], infoAdicional: "", lineas: [{ productoId: P_CERO, cantidad: "1", precio: null }, { productoId: P_SIN, cantidad: "1", precio: null }, { productoId: P_11, cantidad: "1", precio: null }] }) as CuerpoFactura;
    const prep = await prepararFactura(db, EMPRESA, USUARIO, cuerpo);
    const pay = prep.payload as unknown as Payload;
    const res = prep.resumen as unknown as { establecimiento: string; lineas: Array<{ codigo: string }> };
    const json = JSON.stringify(pay);

    igual("E05-27 el payload SIFEN lleva los códigos como TEXTO exacto y distintos (dCodInt «001234», «1234», «00123456789»: 11 dígitos sin recortar) y el resumen del servidor los muestra igual", [pay.Detalles.map((d) => d.dCodInt), pay.Detalles.map((d) => typeof d.dCodInt), res.lineas.map((l) => l.codigo), json.includes('"dCodInt":"001234"'), json.includes('"dCodInt":001234')], [["001234", "1234", "00123456789"], ["string", "string", "string"], ["001234", "1234", "00123456789"], true, false]);
    igual("E05-28 el resumen del servidor informa el establecimiento con sus ceros (001) y la lista de stock/reconciliación usa los códigos como texto", [res.establecimiento, prep.lineasStock.map((l) => l.codigo)], ["001", ["001234", "1234", "00123456789"]]);

    const largo = (() => { try { construirPayloadFE(entrada([linea({ codigoInterno: "0".repeat(21) + "1" })])); return "OK"; } catch (e) { return String((e as Error).message).includes("1 a 20 caracteres") ? "RECHAZADO" : "ERR"; } })();

    igual("E05-29 un código de más de 20 caracteres se RECHAZA con mensaje claro (nunca se corta ni se convierte)", largo, "RECHAZADO");
  }

  // ── 4. Pantalla y fuentes (estructural) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  const pagina = leer("app/(private)/facturas/nueva/page.tsx");
  const pagos = leer("app/(private)/facturas/nueva/medios-pago.tsx");
  const credito = leer("app/(private)/facturas/nueva/condicion-credito.tsx");
  const normalizar = leer("lib/productos/normalizar.ts");
  const sqlStock = leer("documentacao/banco/nexit/v1/migraciones/NEX-067-facturacion-stock-baja-fe.sql");

  cierto("E05-30 pantalla: medios de pago y crédito muestran los importes con el formateador visual (PYG sin decimales) y reciben la moneda; el campo de precio sigue mostrando 82.500 fuera de foco y el valor exacto al editar", /moneda=\{moneda\}\s+simbolo=\{sim\}/.test(pagina) && /<CondicionCredito moneda=\{moneda\}/.test(pagina) && /formatearMontoVisual\(objetivo, moneda\)/.test(pagos) && /textoConciliacionPagos\(\{ simbolo, moneda, objetivo/.test(pagos) && !/formatearDecimalTexto/.test(pagos) && /formatearMontoVisual\(saldo, moneda\)/.test(credito) && !/formatearDecimalTexto/.test(credito) && /value=\{precioEnFoco === l\.clave \? l\.precio : fmCampo\(l\.precio\)\}/.test(pagina));
  cierto("E05-31 pantalla: el establecimiento se rotula «Establecimiento NNN» en la cabecera, en la lista de sucursales y en la revisión", (pagina.match(/etiquetaEstablecimiento\(/g) ?? []).length >= 3 && /\{s\.nombre\} · \{etiquetaEstablecimiento\(s\.establecimiento\)\}/.test(pagina) && /\{etiquetaEstablecimiento\(resumen\.establecimiento\)\} · \{resumen\.sucursal\}/.test(pagina));
  cierto("E05-32 pantalla: la búsqueda rápida de productos usa la comparación de códigos como texto (exacto sin cambiar mayúsculas de ceros) y el filtro de «código parecido»; nada convierte el código a número", /exacto=\{\(p, t\) => p\.codigo\.toLowerCase\(\) === t\.toLowerCase\(\) \|\| p\.gtin === t\}/.test(pagina) && /parecido=\{\(p, t\) => soloDifierenCerosIniciales\(p\.codigo, t\)\}/.test(pagina) && !/Number\((p|l|producto|l\.producto)\.codigo|Number\([^)]*codigoInterno|parseInt\([^)]*codigo(Interno)?\b|parseFloat\([^)]*codigo(Interno)?\b/.test(pagina + leer("lib/facturacion/emision.ts") + leer("lib/facturacion/payload-fe.ts") + leer("lib/facturacion/stock-fe.ts")));
  cierto("E05-33 Productos: el código interno se normaliza SOLO como texto recortado (sin conversión numérica) y la conciliación de stock compara el código del payload como texto exacto", /const codigo = texto\(d\.codigo, "El código interno", "codigo", 80\)/.test(normalizar) && !/Number\(d\.codigo|parseInt\(d\.codigo/.test(normalizar) && /p\.codigo = d->>'dCodInt'/.test(sqlStock));
  cierto("E05-34 sin cambios fuera de alcance: ni el cálculo, ni el stock, ni el gateway/KuDE, ni la base de datos importan los módulos de presentación y de códigos de esta entrega", !/presentacion|codigo-producto/.test(leer("lib/facturacion/calculo.ts") + leer("lib/facturacion/payload-fe.ts") + leer("lib/facturacion/stock-fe.ts") + leer("lib/facturacion/gateway.ts") + leer("lib/facturacion/kude-visor.ts")));

  return fallos;
}
