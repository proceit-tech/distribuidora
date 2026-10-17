# AUD-PRO94-NCE-UI-ETAPA2-R01 — Rediseño de Nota de crédito

**Fecha:** 2026-10-17.
**Responsable de auditoría:** ChatGPT (lectura independiente del código versionado en GitHub, no navegador).
**SHA funcional inspeccionado:** `d4ce1c2fb9ad55152868f630b6ebaf1047c90390` ([commit](https://github.com/proceit-tech/distribuidora/commit/d4ce1c2fb9ad55152868f630b6ebaf1047c90390)).
**Estado:** **CORRECCIÓN SOLICITADA** — 1 hallazgo ALTO y 2 MEDIOS de UX/interacción. **NO HOMOLOGADA** ni aprobada visualmente.
**Especificación:** `documentacao/v1/homologacao-visual/ESPECIFICACION-NCE-UI-ETAPA2-2026-10-17.md` (V-01…V-10); `documentacao/v1/REQUISITOS-NCE-V1-EMISION-2026-10-16.md`; `CLAUDE.md` y `documentacao/PROTOCOLO-IA.md`. Progreso pertinente de PRO-94 leído.
**Evidencias:** ANTES `image(20261017-175406).png` en chat (binario no incorporado al repositorio); DEPOIS aún no capturado. `documentacao/v1/homologacao-visual/NCE-UI-ETAPA2-ANTES-DEPOIS-2026-10-17.md` declara la ausencia de las imágenes con honestidad.

## 1. Matriz de revisión

| V / aspecto | Implementación comprobada | Resultado |
|---|---|---|
| V-01 primera pantalla | `page.tsx` ~316–374: título compacto, elimina introducción, búsqueda en región máx. 1150px, input de 560px, no se invoca búsqueda con q vacío | **CONFORME ESTÁTICO**, falta captura de navegador |
| V-02 elección de cliente | `page.tsx` ~83–101, ~181–198 y ~341–371: q>=2, debounce 300ms, lista, Innominado deshabilitado, Enter/Escape | **NO CONFORME** R01-01 y R01-03; la guarda de request comienza demasiado tarde |
| V-03 cliente y factura | ~103–122, ~303–310, ~335–421: banda cliente, tabla factura de 6 columnas, estado NCE pendiente, selección/paginación | **NO CONFORME** R01-02 por temporizador del cliente previo |
| V-04 composición edición | ~425–533: banda FE/CDC, motivo/establecimiento/punto, seis columnas para ítems, detalles expandibles, layout 8/12 + 4/12 | **CONFORME ESTÁTICO**, sin evidencia renderizada |
| V-05 condiciones de crédito | `motivo===2` sigue usando cantidad, demás motivos monto IVA incluido; saldos originales solo lectura; entradas bloqueadas para agotados | **SIN REGRESIÓN IDENTIFICADA** en diff |
| V-06 importes y CTA | Panel solo anuncia «Importes calculados al revisar»; previo llama al servidor, modal usa `resumen.totales` | **CONFORME ESTÁTICO** |
| V-07 UI-01/rechazadas | Precarga `corregir` conservada; `revisado.cuerpo` exacto en POST; `inert` mientras revisión; sin reset del número por el JSX | **CONFORME ESTÁTICO**, no test interactivo |
| V-08 responsivo/accesibilidad | CSS 1100px/767px, inputs foco, modal scroll interno, combobox declarado pero sin manejo completo de opción activa | **PARCIAL**, comportamiento de Escape falla (R01-03), capturas 1600/1280/768/375 pendientes |
| V-09 evidencia visual | ANTES/DEPOIS documentado, ambas imágenes sin archivo en GitHub y DEPOIS sin captura | **NO VERIFICADO** |
| V-10 pruebas | Claude reporta NCE 205 checks + series/alta-punto, ESLint puntual y TS parcial; tests añadidos ~líneas 299–303 de `nce.casos.ts` inspeccionan texto/regex, **no simulan eventos ni carreras** | **EJECUCIÓN DECLARADA**, calidad de interacción insuficientemente cubierta |

## 2. Hallazgos concretos

### R01-01 — ALTA — búsqueda de cliente muestra resultados obsoletos y Enter elige un cliente incorrecto

**Ubicación:** `app/(private)/notas-credito/page.tsx` ~83–101 (token `seqCli`), ~181–198 (debounce) y ~345–364 (lista/Enter).

**Evidencia:** `seqCli.current` solo se incrementa cuando comienza `cargarClientes` (después de los 300ms), o si q tiene menos de dos caracteres. **No** se incrementa al cambiar el texto desde q=«al» a q=«be», ambos válidos; `clientes` tampoco se limpia ni se marca asociada con el término nuevo. Durante el debounce la lista anterior permanece visible con q «be»; Enter busca `clientes.find(c=>!c.innominado)` y llama `elegirCliente` sin comprobar si los resultados corresponden a q actual. Aun una solicitud anterior puede completar exitosamente en esos 300ms y repoblar la lista con resultados obsoletos.

**Reproducción determinista por secuencia de eventos:** escribir «al» y esperar clientes A; sustituir por «be», presionar Enter antes de 300ms ⇒ se selecciona cliente A, sin búsqueda de «be». Esto contradice V-02 y la regla de elección inequívoca.

**Corrección mínima:** invalidar solicitudes y resultados tan pronto cambie el texto (antes del debounce); asociar cada lista a su consulta y bloquear elección si el texto no coincide; Enter solo con opción real y vigente, nunca el primer no-Innominado de un resultado anterior. Respetar Innominado no seleccionable. Test dirigido mediante helper puro o interacción ligera que cubra cambios q1→q2 antes/después de respuestas y Enter, sin API real.

### R01-02 — MEDIA — temporizador de facturas del cliente anterior puede repoblar la lista después de «Cambiar»

**Ubicación:** `page.tsx` ~81 (ref `temporizadorFac`), ~200 (solo limpieza al unmount), ~303–310 (elegir cliente), ~335–339 (Cambiar) y ~381–390 (programación del filtro).

**Evidencia:** al cambiar texto de filtro se agenda `setTimeout(()=>cargarFacturas(cliente.id, v, 1, false),300)`. Pulsar «Cambiar» invalida `control.current`, vacía `facturas` y borra el filtro de texto, **pero no cancela el timeout**. Cuando el timeout dispara después, invoca `cargarFacturas(clienteAnterior.id,..)`, registra un nuevo token vigente mediante `control.current.aplicar` y puede poblar `facturas` con otro cliente. El evento `elegirCliente(nuevo)` tampoco vacía `facturas`, y si la carga del nuevo cliente falla, la tabla puede continuar ofreciendo resultados del anterior.

**Reproducción:** cliente A seleccionado → escribir filtro de FE → pulsar Cambiar antes de 300ms → dejar que termine el timeout/fetch de A → seleccionar cliente B → si la carga de B falla o demora, la interfaz puede retener facturas de A bajo la banda de B.

**Corrección mínima:** cancelar temporizador al cambiar de cliente, elegir uno nuevo, seleccionar factura o desmontar; invalidar request anterior en cuanto cambie el contexto; vaciar lista inmediatamente al escoger cliente nuevo y mantener cargando/vacío de forma inequívoca. No alterar las protecciones server-side; probar contexto A→B y error/latencia de carga B. El control `crearControlListado` debe seguir evitando respuestas obsoletas del lado de peticiones ya iniciadas.

### R01-03 — MEDIA — Escape no cierra efectivamente el combobox y resultados pueden reaparecer

**Ubicación:** `page.tsx` ~346–364, ~181–198.

**Evidencia:** Escape solo ejecuta `setClientes([])`. Cuando `textoCliente.length>=2`, la `<ul id="nce-clientes">` continúa montada y presenta «No hay clientes…» aunque el usuario pretendía cerrar la lista; una solicitud vigente puede retornar después y repoblarla. No hay estado `abierto` ni invalidación del `seqCli` al Escape. `role="combobox"` tampoco define opción activa con `aria-activedescendant` y opciones del listbox con semántica apropiada; los botones «Seleccionar» funcionan con teclado Tab, pero Enter global no discrimina foco/opción marcada.

**Corrección mínima:** cerrar de forma estable la lista sin cambiar fiscalidad; invalidar respuestas pendentes/timer al Escape, reabrir solamente por acción explícita de búsqueda, alinear `aria-expanded` con visibilidad real y proveer comportamiento de teclado consistente. Test focal de Escape durante petición y después de resultados.

## 3. Alcance, notas y restricciones

- **No hallazgos en SQL/gateway por este commit:** archivos cambiados son `app/(private)/notas-credito/page.tsx`, `page.module.css`, aserciones `nce.casos.ts`, evidencia y progreso. La reorganización visual de seis columnas, histórico expansible, panel 8/4 y modal con totales de servidor están presentes en el JSX/CSS; **no se puede verificar su apariencia real sin navegador**.
- **No homologar por 205 comprobaciones:** las nuevas comprobaciones visuales de `nce.casos.ts` son principalmente regex/lectura de fuente y no detectan R01-01/02/03. No se repite la suite amplia ni tsc/build global.
- **Preservar las reglas ya aprobadas:** motivo único, saldo/CDC FE aprobado, Innominado según decisión del responsable, UI-01 cuerpo exactamente revisado, NCE rechazada con precarga, emisión directa sin borradores, numeração independiente, permisos/tenant, lógica de búsqueda existente y reglas de envío; no refactor de backend por un problema de UI.
- **Implementación permitida solo al Claude tras orden del responsable:** correcciones focales de temporizador, invalidación de listas/opción vigente y Escape/ARIA, pruebas de interacción local mínimas, commit/push y parar para R02. No editar SQL/API/FE/gateway ni ejecutar VM/PostgreSQL real; tampoco tsc global, build, lint global o baterías de tests. No exigir nuevas capturas al Claude sin navegador; sigue PENDIENTE la imagen DEPOIS y el aceite humano.
- **Veredicto:** **CORRECCIÓN SOLICITADA** (R01-01 ALTA, R01-02 MEDIA, R01-03 MEDIA). No hay aceptación visual hasta que el responsable pruebe la interfaz publicada; esta auditoría de código no reemplaza el render real.
