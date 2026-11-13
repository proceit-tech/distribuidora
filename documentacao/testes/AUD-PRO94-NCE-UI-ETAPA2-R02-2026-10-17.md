# AUD-PRO94-NCE-UI-ETAPA2-R02 — Reauditoría de controladores de búsqueda NCE

**Fecha:** 2026-10-17. **Auditor:** ChatGPT, lectura estática independiente en GitHub.
**SHA auditado:** `839f17430684f582b7462549aea7b96a161ff756` ([commit](https://github.com/proceit-tech/distribuidora/commit/839f17430684f582b7462549aea7b96a161ff756)).
**Base funcional:** `d4ce1c2fb9ad55152868f630b6ebaf1047c90390`.
**Normativa y fuente:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, sección PRO-94 de `PROGRESSO-NEXIT-V1.md`, `documentacao/v1/homologacao-visual/ESPECIFICACION-NCE-UI-ETAPA2-2026-10-17.md` (V-01…V-10), `documentacao/testes/AUD-PRO94-NCE-UI-ETAPA2-R01-2026-10-17.md`, y código `page.tsx`/`nce-busqueda.ts`/`nce-busqueda.casos.ts`.
**Veredicto:** **CORRECCIÓN SOLICITADA por 1 MEDIA nueva de carrera funcional y 1 MEDIA de semántica del selector accesible; los tres hallazgos R01 anteriores se cierran estáticamente.** Sin evidencia real de navegador o capturas DEPOIS, **NO HOMOLOGADA**. No autoriza despliegue ni intervención en PostgreSQL/VM.

## 1. Matriz de cierre de R01

| Hallazgo heredado | Evidencia verificada | Resultado |
|---|---|---|
| R01-01 ALTA: Enter elige cliente obsoleto al cambiar texto | `nce-busqueda.ts` líneas 35–86: `escribir` invalida token, cancela timer y vacía `items/consulta` sin esperar 300ms; `vigentes` exige consulta exacta al texto; `primeroElegible` descarta Innominado. `page.tsx` líneas ~303–312 usa esos métodos. Test `nce-busqueda.casos.ts` ~56–94 simula «al»→«be» durante debounce, respuesta tardía, error tardío e Innominado con promesas controladas. | **CERRADO ESTÁTICAMENTE** |
| R01-02 MEDIA: filtro atrasado de cliente A contamina B | `nce-busqueda.ts` líneas ~125–148: `cambiarCliente` cancela timer, invalida `crearControlListado`, limpia lista y solicita B; `detener` invalida al abrir factura. `page.tsx` cambiar/elegir cliente y abrir factura usan el controlador. Pruebas ~144–189 cubren A→B con error/latencia y timeout pendiente. | **CERRADO ESTÁTICAMENTE** para cambios de cliente |
| R01-03 MEDIA: Escape no cierra ni bloquea respuestas | `cerrar` cancela timer, invalida respuesta y vacía lista, `abierto=false`; `reabrir` requiere acción explícita; `page.tsx` monta lista solamente si `estCli.abierto` y refleja `aria-expanded`. Test ~95–127 cubre Escape antes y después del debounce y reapertura. | **CERRADO ESTÁTICAMENTE** para cierre/reapertura; accesibilidad listbox pendiente como hallazgo nuevo |
| Pruebas | 28 aserciones locales reportadas `nce-busqueda`, 205 `nce`, 47 `series`, 31 `alta-punto`, lint de archivos tocados y types con tsconfig limitado según reporte de Claude. Test `nce-busqueda.casos.ts` usa planificador/promesas controladas, y no solo regex. | **Cobertura focal razonable**; el auditor no reprodujo los comandos, no hay navegador |

## 2. Hallazgos nuevos — corrección limitada

### R02-01 — MEDIA — Cambio de filtro de facturas NO invalida GET previo durante debounce; permite elegir factura de resultado obsoleto

**Evidencia:**
- `lib/facturacion/nce-busqueda.ts`, `crearBusquedaFacturas.filtrar` líneas 136–143: solo cancela el temporizador y programa otro; **NO** cambia `control` (token/filtro aplicado), **NO** llama `deps.alLimpiar`, **NO** marca como no seleccionable la lista vieja.
- `cargar` (líneas 107–122) controla obsolescencia con `control.vigente(token)`, pero el token **solo cambia después de 300ms**, cuando comienza el siguiente `cargar`. En esa ventana, la respuesta antigua sigue siendo considerada vigente.
- `page.tsx` ~344–345: `onChange` llama a `busFac.filtrar`, y la tabla ~352–361 sigue renderizando `facturas` antiguas con el botón «Seleccionar factura» habilitado.
- El `GAP-03` refresco automático ~108–119 consulta el `control.leer()` anterior y también puede repoblar la lista con filtro obsoleto durante el debounce.

**Secuencia reproducible por lógica:** cliente A con filtro `123` y facturas `FA-123`; comenzar a escribir filtro `999` antes de concluir GET de `123`; a los 100ms llega `123` (su token sigue vigente), se muestra `FA-123` bajo texto `999`; «Seleccionar factura» permite abrir `FA-123` aun cuando no corresponde a la búsqueda actual. También ocurre con resultados ya visibles incluso sin GET en vuelo. El backend continúa validando elegibilidad y tenant; el defecto es **selección UX del documento equivocado**, no prueba de emisión fiscal inválida.

**Corrección obligatoria:** invalidar **inmediatamente** token/filtro + datos visibles/seleccionabilidad al cambiar texto, antes del debounce; mantener `control.leer()` coherente con el filtro digitado o pausar refresco durante estado transitorio; evitar errores/carga viejos y mensaje falso «sin facturas» mientras consulta nueva está en cola; preservar A→B, paginación, NCE pendiente, GET de reconciliación inicial, y bloqueo contra búsqueda fuera de empresa. Probar con planificador/promesas: q1→q2 antes de 300ms, q1 ya cargado, q1 aún pendiente, paginación y refresco de NCE pendiente, transición sin seleccionar factura de q1 bajo q2. **NO** cambiar API/SQL.

### R02-02 — MEDIA — La lista de resultados aún NO cumple la semántica de combobox/listbox declarada

**Evidencia:** `page.tsx` ~305–325 define `<input role="combobox" aria-haspopup="listbox" aria-controls="nce-clientes" aria-autocomplete="list">`, pero el destino es `<ul id="nce-clientes" aria-live="polite">` con `<li>` ordinarios y botones `Seleccionar`: no contiene `role="listbox"` ni opciones y no ofrece `aria-activedescendant`/opción activa. La tecla flecha abajo `ArrowDown` solo actúa cuando la lista está **cerrada**; con la lista abierta, Enter elige siempre el primer cliente no Innominado, no una opción navegada. El label y botones nativos son accesibles parcialmente, pero anunciar un patrón combobox/listbox inexistente confunde tecnologías asistivas.

**Corrección obligatoria:** elegir una semántica accesible **real y coherente**: implementar un combobox con navegación y opción activa/Enter/Escape (sin controles interativos anidados en roles listbox de manera inválida), **o** usar búsqueda normal con resultados en lista nativa y botones Tab/Enter, retirando atributos ARIA engañosos. Mantener Innominado no seleccionable, no hacer cambios de backend; probar de forma focal teclado, atributos montados/visibilidad y elección inequívoca. No crear una biblioteca nueva.

### OBS-R02-03 — BAJA — Resultado visible de página anterior mientras se solicita otra página de clientes

`nce-busqueda.ts` `pagina(p)` (~80) ejecuta `parar(); ejecutar(q,p)`, cuya transición marca `buscando=true` pero **no** borra `items`; `vigentes()` bloquea Enter, sin embargo los botones por fila del JSX siguen llamando `elegirCliente(c)` sobre items antiguos. Un click durante carga puede elegir una opción de página previa. Limpiar/inhabilitar resultado durante paginación junto con R02-02; preservar paginación y opción por teclado. Registrar prueba puntual, sin ampliar flujo.

## 3. Limitaciones e invariantes

- El diff funcional solo toca `page.tsx`, nuevo helper y casos TS, más progreso/runner focal; no cambia CSS, SQL, migrations, gateway o API fiscal. `revisado.cuerpo` exacto, motivos 2/3/4/8, bloqueo Innominado, NCE pendiente, elección de FE aprobada, secuencia NCE y emisión directa no presentan nueva mutación funcional por este commit.
- Los tests de los controladores son prometedoramente deterministas, pero **no** prueban todavía q1→q2 de facturas del mismo cliente ni la semántica real del combobox. No ejecutar tsc/build/lint global ni CI manual.
- La evaluación visual V-01…V-10 depende de capturas reales (1600/1280/768/375) y de la aprobación del responsable; ANTES binario no está en Git y DEPOIS sigue pendiente.
- **Solo Claude tras autorización humana** corrige R02-01/02 y observación baja de la paginación, con pruebas dirigidas. ChatGPT audita R03; no implementar por iniciativa propia. No manipular VM, SQL o gateway, no reabrir otros alcances PRO-94. No declarar HOMOLOGADA.

**Estado:** R01-01/02/03 cerrados estáticamente; R02-01/02 abiertos; PRO-94 mantiene estado CORRECCIÓN SOLICITADA / UI NO HOMOLOGADA.
