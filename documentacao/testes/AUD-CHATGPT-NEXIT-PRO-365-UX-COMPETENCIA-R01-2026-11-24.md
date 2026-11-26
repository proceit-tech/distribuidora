# AUD-CHATGPT — PRO-365 / NEXIT-DOC-UX-COMPETENCIA-R01 — 24/11/2026

**DICTAMEN: CONFORME PARCIALMENTE EN AUTORÍA Y CI AUTOMÁTICO; NO APROBADO VISUALMENTE; NO DESPLEGAR / NO MERGE.** La corrección principal de iconos por línea existe y pasó CI; la revisión visual integral con las dos capturas de referencia y con NEXIT renderizado está pendiente. Las capturas **sí fueron facilitadas al auditor ChatGPT en la conversación**, pero Claude declaró no recibirlas en su hilo. No atribuir a Claude una comparación de imágenes que no hizo.

## 1. Material y versión auditada

- Repo `proceit-tech/distribuidora`, PR #7 **DRAFT**, branch `feature/NEXIT-2026-001-banco-demo`.
- Orden canónica `documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-365-UX-COMPETENCIA-R01-2026-11-23.md` (revisada con matriz visual y criterios A01–A10); base `0aea05698b848b55e6c06eddbebda09b0df77c49`.
- Commit funcional Claude **`294f4e29619e54e71d8afcab425d7f3f171881ae`**, comparado con base: **11 archivos** (dos archivos UI, siete archivos de casos existentes actualizados, un caso nuevo, su registro en runner, un informe de entrega). **NO** se editaron migrations, SQL, APIs, gateway, código de FE/NCE, KuDE, stock ni permisos.
- `documentacao/analises/PRO-365-R01-ENTREGA-UX-COMPETENCIA-2026-11-24.md`: declara no disponer de las capturas, ni navegador, ni ejecución manual; sus criterios A09 y A10 constan correctamente como pendientes.
- Captura de referencia **1** mostrada por el usuario en ChatGPT: panel grande `Documentos Electrónicos` con `Filtros` plegable; checkbox por Nro Lote/Sucursal/Fecha Emisión/Fecha Firma y estados, múltiples tipos FE/NCE/NDE/NRE/AFE; `Resumen de estados` con KPIs de SIFEN/e-mail/total; selección, iconos de acciones, tipos y eventos, agrupación/exportación visibles. No inferir que esas operaciones existen en NEXIT.
- Captura de referencia **2** mostrada por el usuario en ChatGPT: `Facturas Electrónicas` con barra de filtros compactos, **leyenda de estado Envío · XML · SIFEN · Correo**, tabla compacta, iconos coloreados de acciones y estado, selector de eventos y paginación. Esta comparación es de **evidencia visual recibida en ChatGPT**; no es comprobación por render del código actualizado.

## 2. Evidencia técnica positiva

1. `app/(private)/documentos/page.tsx:962–963` ahora deriva `const fases = iconosEstado(d)`; `:1023–1034` renderiza sus cuatro estados independientes por cada documento en orden fijo `Envío · XML/CDC · SIFEN · Correo`, más indicador opcional de alerta o hueco fijo. No queda el texto principal `Rechazado` ocupando la celda.
2. `lib/facturacion/presentacion-sifen.ts` queda sin cambios: el retorno real `RECHAZADO` produce cruz roja SIFEN sin convertir CDC, ACK ni correo en aprobación. `textoFase()` añade motivo persistido al tooltip SIFEN cuando existe `fiscal.mensaje` y `fiscal.rechazo`; no altera el estado ni el recuento SQL.
3. La leyenda se muestra una vez por encima de la tabla y se referencia con `aria-describedby`. Indicadores `IconoFase` conservan `role=img`, `aria-label`, `tabIndex=0`, tooltip en mouse/foco/toque, colores y símbolos.
4. `Acciones` permanece separada y con restricciones: KuDE/PDF y consultar SIFEN según las operaciones existentes; XML y correo sin endpoint no se habilitan artificialmente. `Eventos` muestra situación acreditada o `Sin información`, y desplaza explicaciones de indisponibilidad a tooltip/segunda capa.
5. CSS cambia solo el módulo de la pantalla; `.estado` en desktop usa flex y cuatro áreas de 36 px, con quinto hueco de 36 px para alerta. En mobile permanecen las reglas de tarjeta y `flex-wrap` para Estado/Acciones/Eventos.
6. Casos existentes se actualizaron específicamente para dejar de imponer la UX revocada PRO-195; el nuevo conjunto PRO-365 tiene **16 comprobaciones** (funciones puras y presencia estructural en fuente). El runner las carga. Esto no es una prueba visual del DOM en navegador.

## 3. CI automático independiente revisado

- [NEXIT app CI 45373161653](https://github.com/proceit-tech/distribuidora/actions/runs/45373161653) **SUCCESS**, siete jobs (regresión, typecheck, lint de aplicación/casos, Next build, Docker build, puerta de liberación). Log específico **PRO-365: 16 comprobaciones contadas OK**; total **6.779 PASS, 0 fallos, 0 errores inventario**, 99 archivos `*.casos.ts` cargados.
- [NEXIT banco CI 45373161555](https://github.com/proceit-tech/distribuidora/actions/runs/45373161555) **SUCCESS**; 83 migrations aplicadas en PostgreSQL efímero, T01 OK (8), **1.125 PASS, 0 fallos**. La ejecución automática **no representa el estado de la VM** ni acredita paridad visual.
- Claude declara no haber ejecutado tests/lint/build/navegador/manual CI/SQL/VM. ChatGPT auditó diff, código y logs del CI vía GitHub; tampoco ejecutó pruebas ni accedió a VM.

## 4. Matriz de conformidad con la competencia

| Dominio | Estado a 24/11 | Razón |
|---|---|---|
| Cuatro fases visibles por documento | **CONFORME ESTÁTICAMENTE** | `iconosEstado(d)` se renderiza en fila, no solo historial |
| Rechazo fiscal sin texto enorme ni estado alterado | **CONFORME ESTÁTICAMENTE** | Cruce roja + tooltip/primera capa, sin SQL/estados modificados |
| Acciones separadas de estados | **CONFORME ESTÁTICAMENTE** | Mantiene guardas y deshabilitación honesta |
| Eventos compactos | **CONFORME ESTÁTICAMENTE** | Un resumen + control contextual, explicación técnica fuera de línea |
| Leyenda compacta | **PARCIAL** | Existe pero contiene una frase extensa y otra fila de cinco significados; puede estar más cargada que la leyenda breve de la captura 2 |
| Filtros avanzados/plegables de captura 1 | **NO IMPLEMENTADO** | El commit preserva filtros existentes; los adicionales sin API no pueden simularse |
| Resumen tarjetas comparable a captura 1 | **NO REVISADO EN UI** | KPI y SQL se mantienen; se requiere una ronda visual sin alterar conteos |
| Selección masiva, exportación, agrupación real | **FUERA DE ALCANCE R01** | No inventar endpoints ni gestos sin contrato/autorización |
| Tabla desktop 1366/1920 | **NO HOMOLOGADA** | CSS de `table.tablaDocs` mantiene ancho mínimo 1180; no hay captura renderizada del commit en estos anchos |
| Mobile 320–720 / accesibilidad dinámica | **NO HOMOLOGADA** | CSS estático y casos pasan; no hay prueba de navegador/touch/zoom |
| Equivalencia visual con las dos capturas | **BLOQUEADA** | Claude no recibió imágenes; ChatGPT dispone de imágenes de referencia, no del NEXIT post-R01 renderizado |

## 5. Observaciones que impiden aprobar visualmente

**UX-365-OBS-01 (bloqueante para aceptación visual):** no hay capturas de ambas referencias accesibles en el hilo de Claude ni captura del NEXIT **post-commit**. La matriz de Claude indica literalmente `Sin captura` en todos los renglones de competencia. No autorizar otra ronda que pretenda equivalencia sin las dos imágenes y captura del resultado renderizado.

**UX-365-OBS-02 (amplitud parcial de R01):** el commit corrige cuatro indicadores y Eventos, pero **NO** modifica filtros, resumen KPI, densidad general o acciones de selección. La orden integral cita esos dominios, con límites de backend. Registrar cuáles cambios son solo visuales posibles y cuáles requieren API/orden nueva. No declarar rediseño total.

**UX-365-OBS-03 (riesgo semántico):** `documentacao/analises/PRO-365-R01-ENTREGA-UX-COMPETENCIA-2026-11-24.md:79` reconoce que si `eventosFe.situacion=CANCELADO` está acreditado pero `estadoSifen=APROBADO` persiste, el icono SIFEN sigue verde APROBADO y la cancelación se comunica separadamente en Eventos. Esto preserva las dos fuentes, pero requiere comprobar que operador no entienda `APROBADO` como documento vigente; no modificar máquina fiscal para resolver un riesgo de interfaz.

**UX-365-OBS-04 (leyenda y densidad):** cuatro iconos de 36px + hueco de 36px = **180px** para Estado sin contar padding, junto con tabla `min-width: 1180px`. El encabezado/leyenda explica las cuatro fases con texto más extenso que la referencia compacta de captura 2. Sin render, no se puede determinar ajuste visual a distintos anchos ni inferir pixel-perfect.

**UX-365-OBS-05 (nombres históricos de casos):** el runner aún titula el grupo PRO-195 como `estado principal único` aunque los asserts fueron correctamente actualizados al nuevo diseño; es un texto informativo desactualizado, no falla de CI. Actualizarlo en futura orden focal, sin tocar motor fiscal.

## 6. Dictamen y puertas de la siguiente etapa

**ACEPTAR SOLO EL RECORTE TÉCNICO DE R01** (cuatro iconos, leyenda, Eventos, acciones sin regresión visible en fuente, CI automático verde). **NO APROBAR VISUALMENTE PRO-365, NO desplegar este commit a VM, NO merge, NO marcar Done**.

Recomendación: entregar físicamente a Claude **ambas capturas originales** (en el mismo hilo que implementa) y posteriormente una captura del NEXIT compilado de ese SHA en desktop 1366/1920 y móvil; realizar auditoría comparativa y decisión explícita de alcance R02. Distinguir ajustes de CSS/UI que preservan API de filtros masivos/exportación/grupos que requieren nuevos contratos. Cualquier modificación adicional a código requiere orden R02 separada, commit propio y nueva auditoría; no desplegar primero para ver.

Mantener PRO-365 en **In Review / VISUAL PENDIENTE**, PRO-195 In Review, PR #7 DRAFT. Sin acceso a VM, SQL, gateway, deploy ni merge.
