# AUD-PRO94-NCE-UI-ETAPA2-R03 — Cierre estático de R02

**Fecha:** 2026-10-18. **Proyecto:** NEXIT / PRO-94, rediseño visual de Nota de crédito electrónica.
**SHA funcional auditado:** `931502dc432df51ecd911f199fc6103dc74d8032` ([commit](https://github.com/proceit-tech/distribuidora/commit/931502dc432df51ecd911f199fc6103dc74d8032)).
**Base funcional comparada:** `839f17430684f582b7462549aea7b96a161ff756`. El commit funcional modifica únicamente `app/(private)/notas-credito/page.tsx`, `lib/facturacion/nce-busqueda.ts`, `lib/facturacion/nce-busqueda.casos.ts`, `lib/facturacion/nce.casos.ts` y progreso.
**Normativa revisada:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, sección pertinente PRO-94 de `PROGRESSO-NEXIT-V1.md`, `documentacao/v1/homologacao-visual/ESPECIFICACION-NCE-UI-ETAPA2-2026-10-17.md` (V-01…V-10), `AUD-PRO94-NCE-UI-ETAPA2-R02-2026-10-17.md`; comparados controles UI, helper de filtro `nce-entradas.ts`, endpoints `/api/notas-credito/previa` y `/api/notas-credito`.
**Método:** lectura del GitHub, diff, trazado de llamadas y tests focales. **No** se accedió a VM, PostgreSQL operativo, Docker, servidor del navegador, gateway o SIFEN. **No** se ejecutaron suites globales ni tests de la aplicación por el auditor.

## Veredicto

**AUD-R03 APROBADA ESTÁTICAMENTE para el alcance de las tres correcciones R02-01/R02-02/OBS-R02-03, sin defecto nuevo ALTO/MEDIO confirmado en este diff.** Los tres hallazgos se cierran por verificación de implementación, **no por homologación de navegador**. La pantalla permanece **NO HOMOLOGADA** hasta captura DEPOIS y aceptación explícita del responsable.

## Matriz de requisitos → evidencia → resultado

| Requisito / hallazgo | Evidencia inspeccionada | Resultado |
|---|---|---|
| **R02-01** — cambio de filtro q1→q2 invalida inmediatamente | `nce-busqueda.ts` ~141–152: `filtrar(q)` cancela temporizador, aplica token/filtro `{clienteId,q,pagina:1}` **antes** del debounce, ejecuta `alLimpiar()`, `alCargando(true)`; el fetch posterior pasa por `cargar` que solo acepta su token vigente. `page.tsx` ~344–360 deshabilita «Seleccionar factura» cuando `cargando`. | **CERRADO ESTÁTICAMENTE** |
| **R02-01** — respuesta/error tardíos de q1 ignorados | `nce-busqueda.ts` `cargar` ~108–123: token comprobado en success/catch/finally; `nce-busqueda.casos.ts` ~216–230: escenarios q1 ya servido, q1 en vuelo, respuestas/errores tardíos, q2 antes de 300ms, resultado final vigente. | **CERRADO ESTÁTICAMENTE** |
| **R02-01** — refresco automático GAP-03 y paginación | `page.tsx` ~101–127: refresco lee `control.leer().filtro` y comprueba `control.vigente(token)` antes de actualizar; el filtro se registra al digitar. `busFac.pagina()` invalida request anterior y `cargando` bloquea selección hasta llegar página pedida. Casos ~231–254 cubren token de refresco y cambios de página. | **CONFORME ESTÁTICO**; sin prueba de navegador real |
| **R02-02** — patrón accesible honesto | `page.tsx` ~301–334: `<input type="search">` nativo con `aria-describedby="nce-cliente-ayuda"` y resultados en `<ul><li><button>`; retirados `role=combobox` y atributos ARIA de listbox no implementado. `Enter` llama `primeroElegible()`, Escape cierra, ArrowDown reabre y Tab navega hacia botones nativos. Innominado permanece no seleccionable. | **CERRADO ESTÁTICAMENTE**; lector de pantalla real no evaluado |
| **OBS-R02-03** — resultados antiguos de otra página | `nce-busqueda.ts` ~80–85: paginar cancela token anterior, limpia `items/consulta` antes de solicitar página nueva, `vigentes()` prohíbe Enter hasta respuesta; `page.tsx` ~327–333 deshabilita controles de paginación durante `buscando`. Casos ~264–277 cubren páginas 1→2→3, resultado tardío e Innominado. | **CERRADO ESTÁTICAMENTE** |
| Cambiar cliente A→B y abrir factura | `cambiarCliente` cancela timer, invalida token, vacía lista y vuelve a consultar en contexto nuevo; `detener` invalida request al abrir factura; la UI enlaza estos métodos. Caso anterior R01 y nuevos ~255–262. | **SIN REGRESIÓN IDENTIFICADA** |
| NCE pendiente / empresa / elegibilidad | El diff no toca API, filtros SQL, servidor ni fiscalidad; UI sigue deshabilitando FE con `ncePendiente`, carga desde APIs existentes. Se inspeccionaron selectivamente rutas `previa` y `POST /api/notas-credito`, ambas con `prepararFacturacion("CREAR")` y validación server-side. | **PRESERVADO EN EL DIFF**, sin homologación real |
| UI-01 revisión exacta/idempotencia | `page.tsx` `revisar()` solicita resumen server-side y guarda `revisado.cuerpo`; `emitir()` envía **ese cuerpo**, compara formulario actual y bloquea cambios, sin alterar implementación por este commit. Rutas `previa`/emisión siguen separadas. | **PRESERVADO EN EL DIFF** |
| Alcance visual ETAPA 2 | No se modificó CSS ni las seis columnas, cabecera, resumen lateral o modal; revisión por código de estos componentes permanece según etapa anterior. | **SIN REGRESIÓN OBSERVADA**, apariencia no verificada |
| Pruebas y política de ejecución | `nce-busqueda.casos.ts` contiene **44** aserciones directas con temporizador y promesas simulados; Claude declaró 44/44 sin fallos y `nce.casos` 205/205 por ajuste textual, ESLint de archivos tocados y TS aislado. Declaró no ejecutar tsc/build/lint global, CI ni PostgreSQL. | **COBERTURA FOCAL COHERENTE; ejecución no reproducida por el auditor** |

## Limitaciones y observaciones sin nueva ronda

- El control del filtro y la lectura del refresco GAP-03 están unidos por el mismo token, pero no existe prueba E2E en navegador o servidor vivo. En la auditoría de código **no se detectó una carrera residual demostrada** que amerite reabrir R02.
- La lista nativa evita una semántica ARIA falsa, pero su interacción mediante tecnologías de asistencia debe evaluarse en la homologación humana, al igual que el responsive 1600/1280/768/375 y el zoom 200%.
- Las cifras de prueba son del reporte de Claude: el auditor verificó que el archivo contiene 44 llamadas a la aserción `igual` y los escenarios pertinentes, sin afirmar que los ejecutó independientemente.
- La imagen ANTES existe solo en el chat, no como binario GitHub; la evidencia DEPOIS está **PENDIENTE** en `documentacao/v1/homologacao-visual/NCE-UI-ETAPA2-ANTES-DEPOIS-2026-10-17.md`. No inventar capturas ni marcar HOMOLOGADA.

**Decisión:** cerrar esta auditoría **estática** sin emitir nuevo comando de corrección a Claude. Siguiente hito separado: despliegue y comprobación visual/funcional por responsable humano, cuando decida hacerlo, y captura de estados cliente, facturas, edición de líneas y modal final. No hay autorización implícita de deploy ni de pruebas sobre VM por IA.
