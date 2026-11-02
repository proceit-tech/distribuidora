# AUD-PRO128-R01 — Reauditoría posimplementación de Nueva factura

**Fecha de auditoría:** 15/10/2026. **Commit auditado:** `fb293d1c1dc5cacbd2ff37ea0c128b2a194db5dd`, HEAD oficial confirmado. **Estado:** **IMPLEMENTACIÓN PARCIALMENTE ACEPTABLE; REQUIERE CORRECCIONES UX DIRIGIDAS** antes de aceptación PRO-128. **No hay hallazgo nuevo de cambio en cálculos fiscales/JSON/DDL.** No equivale a homologación operativa/gateway.

## Evidencia
- Branch: `feature/NEXIT-2026-001-banco-demo`. Auditado commit, diff, archivos alterados (19: pantallas, 4 utilitarios puros, suite PRO-128, servidor presentación, test structs, progreso), protocolos previos AUD-PRO128-R00, NEX-039/043/047/048/056/057/058/059 y rutas FE.
- **CI automático** [run 38778151854](https://github.com/proceit-tech/distribuidora/actions/runs/38778151854) en SHA objetivo **completed/success**. Log job `116571065332`: M1 **59 migrations** instaladas en PostgreSQL descartable, T19 **78 PASS**, T20 **24 PASS**, reporte **689 verificaciones PASS y 0 fallas**. Batería SQL/servidor del CI no reemplaza testing real de React en navegador. Claude reportó suite PRO-128 y regresiones focales; la auditoría no reejecutó scripts locales.
- **No se abrió navegador ni VM ni gateway**. No capturas antes/después 1440/1024/768/375, prueba real de foco/teclado/flujo por operador, ni consulta de checksum/migrations del PG operacional. 64 unidades son **versionadas** (34+30), no cantidad real comprobada de VM.
- El diff no modifica SQL/migrations, gateway, `calculo.ts`, `pagos.ts`, `credito.ts`, `ajuste-item.ts`, NEX-048, rutas de envío ni contenido fiscal base de `construirPayloadFE`. `payload-fe.ts` añade exclusivamente propiedades `resumenCalculo.texto`, `emision.ts` añade campos de presentación `resumen.totalesTexto` y `resumen.lineas[].totalTexto`, sin cambiar entradas/salida del gateway. Se mantiene el contrato `FormaPago[]`, `Detalles[]`, `Subtotales[]` y snapshot NEX-048.

## Dictamen principal
Los campos ordinarios D011/E011 ahora están visibles, IVA directo 10/5/exento/exonerado/parcial mapa correctamente E731/733/734, editor fiscal es uno por pantalla, unidades buscables separan códigos iguales en descripción, pagos y crédito se compactaron, textos decimales evitan pérdidas visuales. Todos tienen apoyo estático y pruebas reportadas. La calidad final de CSS/operación requiere navegador. Cuotas, descuentos y especiales NO se abrieron.

## Hallazgos de la AUD-PRO128-R01 que deben cerrarse
### R01-01 — ALTA UX/INTEGRIDAD, borrado silencioso de datos digitados
**Evidencia:** `page.tsx` `cambiarMoneda` (líneas ~642–650) cambia moneda y **reinicia precios de todas las líneas, pagos y credito** sin advertir/solicitar confirmación. Selector Condición (línea ~769) reinicia `credito` y `pagos` sin advertencia. No es un cambio fiscal de payload (el servidor sigue validando), pero el operador puede perder dinero/medios de pago/plazos escritos con un cambio accidental de selector. **Criterio R00 §4:** «Cambiar condición o moneda debe advertir limpiamente cuando borra información previamente digitada». Los tests nuevos sólo comprueban dirty-state, no este comportamiento. **Corrección:** si hay datos ya introducidos que serían eliminados, pedir confirmación ANTES de limpiar; si se cancela, preservar selección y datos; defaults/estado vacío no generan diálogo. No inventar conversión de precios entre monedas; preservar reset una vez confirmado. Tests focados cambio con/sin datos, cancelación y confirmación.

### R01-02 — ALTA UX/ACCESIBILIDAD, editor fiscal desconectado de su fila
**Evidencia:** `page.tsx` líneas ~987–1007: botón `Fiscal`/`Completar` cambia `editando`, pero el único `<EditorFiscalItem>` aparece **después del cierre de toda la tabla**, aunque se haya elegido el primer producto de 20/100/999. `EditorFiscalItem` sólo crea `<section>`, sin foco inicial, ancla, drawer o scroll y con estado `busqueda` local; no hay efecto de enfoque al abrir/cambiar fila. En factura larga, panel puede quedar lejos/fuera de viewport y operador no percibe dónde editar; el atributo `aria-expanded` por sí solo no da foco ni avisa dónde está. **Corrección:** conservar UNA sola instancia contextual con posición útil (panel lateral/drawer/inline tras selección, como el UX aprobado permita), desplazar/focalizar de modo acessible el panel/al primer control y devolver foco al botón de origen al cerrar, sin borrar valores editados; cuando cambia de producto, reiniciar filtro local `busqueda` si procede. Tests dirigidos de vinculación/estado y, en navegador humano, foco y scroll a 1440/768/375. No reintroducir un editor debajo de CADA línea.

### R01-03 — MEDIA/ALTA CONTROL FISCAL, proporción parcial no aparece en revisión previa
**Evidencia:** `emision.ts` `resumen.lineas` alrededor de línea 469 contiene `afectacion`, `tasa` y `totalTexto`, pero **no `proporcion`**. `page.tsx` modal alrededor de línea ~1124 invoca `etiquetaIva(l.afectacion, l.tasa, null)`, por lo que muestra «Gravado parcial IVA 10 %» **sin indicar `dPropIVA` (p.ej. 50 %) que el operador eligió**. El JSON fiscal sigue teniendo E733 correcto, pero la modal de confirmación no deja comprobar esa variable determinante de base/IVA. **Corrección:** exponer `proporcion` como **dato únicamente de presentación de línea** desde `prepararFactura/resumen` y usarlo en `etiquetaIva` de modal; mantener `dPropIVA`/payload/SQL/cálculos intactos. Aceptación: parcial 5/10, 50 %, 37,5 %, no parcial; visualización coincide con `Detalles[].dPropIVA` y no altera número. Tests enfocados.

### R01-04 — MEDIA UX, restauración explícita de la clasificación IVA del producto falta
**Evidencia:** `iva-opciones.ts` y `<select>` de `page.tsx`/`ajuste-fiscal-item.tsx` sólo ofrecen las seis clases; contrato R00 §3 requería opción visible **«Usar clasificación del producto»**. Elegir una clase igual a la del maestro no equivale siempre a reponer su proporción: en producto parcial (E731=4), el estado de `ajuste.proporcion` y `guardar` puede persistir, la opción seleccionada es la misma y el evento onChange no se dispara. Operador que ajustó de 50 % a 40 % no tiene acción explícita de retorno al maestro, y puede quedar seleccionada la bandera de guardar sin que haya modificación real. **Corrección:** incluir acción clara `Usar del producto` / `Restaurar IVA del producto`, que limpie sólo `afectacion/tasa/proporcion/guardar` sin tocar GTIN, unidad, descripción ni precio; mostrar valor efectivo; respetar permiso y no generar ajuste redundante. Test parcial 50→40→restaurar, G10→G5→restaurar y preservación de otros ajustes.

## Matriz de aceptación por los 31 grupos del contrato R00
| ID | Área | Resultado | Evidencia/límite |
|---|---|---|---|
| UX-01 | Sucursal; establecimiento | CONFORME ESTÁTICO | page.tsx selector; emision.ts catalogosFactura; NEX-048 |
| UX-02 | Punto/numero referencial | CONFORME ESTÁTICO; VM PENDIENTE | page.tsx link condicional/numero; PRO-129; NEX-057/058/059 |
| UX-03 | Tipo de transaccion D011 | CONFORME ESTÁTICO | page.tsx campo visible; payload-fe.ts iTipTra |
| UX-04 | Presencia E011 | CONFORME ESTÁTICO | page.tsx campo visible; pagos.ts validador |
| UX-05 | Tipo de impuesto D013 | CONFORME ESCOPO | payload-fe.ts iTImp=1; modalidades especiales deshabilitadas |
| UX-06 | Moneda/FX/F023 | CONFORME DATOS; R01-01 UX | page.tsx cambiarMoneda resetea precios/pagos/credito sin aviso |
| UX-07 | Fecha emision | CONFORME ESTÁTICO | NEX-048 reserva fecha, UI informativa |
| UX-08 | Contado/Credito Plazo | CONFORME DATOS; R01-01 UX | page.tsx condicion resetea pagos/credito sin aviso; condicion-credito.tsx compactada |
| UX-09 | Cuotas suspendidas | CONFORME | credito.ts guardia y UI de opcion condicional |
| UX-10 | Pago unico Efectivo/PYG | CONFORME ESTÁTICO | medios-pago.tsx una fila; payload-fe.ts baseline 4 claves |
| UX-11 | Pagos multiples/condicionales | CONFORME ESTÁTICO | medios-pago.tsx; pagos.ts conciliacion Decimal exacta |
| UX-12 | Cliente/receptor | CONFORME ESTÁTICO | page.tsx ficha read-only; API de Clientes |
| UX-13 | Buscar productos/ACL | CONFORME ESTÁTICO | decidirProducto; selectors; permisos PRECIO/AJUSTE_FISCAL |
| UX-14 | Unidad E709 | CONFORME ESTÁTICO; VM PENDIENTE | unidades.ts buscador; emision.ts WHERE vigente; 64 versionadas |
| UX-15 | IVA directo E731/733/734 | PARCIAL R01-04 | iva-opciones.ts mapea 6 modalidades; falta restaurar clasificacion maestro explicita |
| UX-16 | Persistencia opcional IVA Producto | CONFORME ACL; R01-04 UX | radio Guardar en Productos, NEX-056, falta reset claro del parcial |
| UX-17 | Cantidad E711 | CONFORME ESCOPo | page.tsx rango 4 dec / unidad 77 enteros; API valida |
| UX-18 | Precio con IVA/ACL | CONFORME ESTÁTICO | parseDec; precioModificado; emision.ts 403/422 |
| UX-19 | Descripcion/GTIN/fiscal item | PARCIAL R01-02 | EditorFiscalItem aparece solo al final de tabla, sin scroll/foco; GTIN triestado conservado |
| UX-20 | Detalle/IVA/Subtotal | CONFORME ESTÁTICO | tabla compacta; Decimal texto; linea fiscal unica |
| UX-21 | Descuento | FUERA PRO-128 | PRO-124, builder conserva 0 |
| UX-22 | Anticipos | FUERA PRO-128 | PRO-125 |
| UX-23 | Lotes/serie/informacion item | FUERA PRO-128 | PRO-125 |
| UX-24 | Especial/B2G/importacion | FUERA PRO-128 | PRO-126 |
| UX-25 | Observaciones/J003 | CONFORME ESTÁTICO | dInfAdic conserva contrato gateway, no afirmar XML SIFEN |
| UX-26 | Totales/IVA/contravalor | CONFORME ESTÁTICO; FX PENDIENTE | resumenCalculo.texto; P-02/11/12 y gateway no homologados |
| UX-27 | Previa/confirmar/envio | PARCIAL R01-03 | previa exacta numericamente pero modal omite dPropIVA/proporcion de linea |
| UX-28 | Estados/CDC/intentos | CONFORME ESTÁTICO | envio.ts, gateway.ts, NEX-049/050/054/055 sin cambios |
| UX-29 | Dirty state | CONFORME ESTÁTICO | formularioModificado cubre selecciones y formulario |
| UX-30 | Formato decimal | CONFORME ESTÁTICO | decimal-texto.ts; totalesTexto/totalTexto; sin Number en render |
| UX-31 | Densidad/responsive/foco | PARCIAL R01-02; VISUAL PENDIENTE | CSS cortes 1099/900/760; falta navegador y foco del panel |

## Trazabilidad normativa / JSON y límites de conformidad
- E709 `cUniMed`: código oficial de unidad proveniente de `unidades_medida_sifen` (NEX-039/043), sin alterar unidad física; E710 descriptor esperado en XML del gateway sin afirmar corroboración aún. E731 `iAfecIVA`, E733 `dPropIVA`, E734 `dTasaIVA`: ahora selección directa mapea códigos combinados hacia la misma `ajuste`/API y builder, sin cambios a función de cálculo.
- D011 `iTipTra`, E011 `iIndPres`, E601 `iCondOpe`, medios E606–611, moneda D015/D017/D018, F023: UI mantiene la correspondencia y el servidor fiscal controla modalidad. Los desc D016/E610 USD/BRL, E710/E732, P-02/P-11/P-12 y J003 no se homologan por esta revisión; funcionan bajo reservas de AUD-PRO128-R00. Inventario íntegro de 117 claves pre-implementación está en AUD-PRO128-R00; **el diff no altera sus campos fiscales**. Ausencia de clave opcional en el ejemplo no implica que gateway prohíba la modalidad.
- NEX-056, NEX-057/058/059 todavía sin prueba de estado/checksum en VM; aunque CI corrió migrations hasta 059 en base descartable, no hay autorización de aplicación en operacional.

## Próxima autorización focal y criterio de cierre
Claude sólo puede corregir R01-01/02/03/04; no reabrir función fiscal, infraestructura, SQL, JSON del gateway, P-02/P-11/P-12 ni PRO-124/125/126/Cuotas. Para R01-03 se acepta la adición de **presentación** en respuesta de previa sin tocar payload fiscal, como en el PR inicial. Tests básicos dirigidos para los cuatro hallazgos y invariantes próximas, commit/push SHA y **PAUSA para AUD-PRO128-R02**. No suite completa, build global, CI manual/polling, VM/PostgreSQL operacional ni envío real. Capturas 1440/1024/768/375 y test visual efectivo siguen pendientes de homologación humana incluso si R02 pasa. Estado recomendado Linear: `In Review`, no Done.