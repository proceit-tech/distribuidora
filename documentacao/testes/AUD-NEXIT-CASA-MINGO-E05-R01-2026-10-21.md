# AUD-NEXIT-CASA-MINGO-E05-R01 — Presentación PYG, establecimiento y códigos de producto

**Fecha:** 21/10/2026  
**Commit funcional auditado:** `8888b7ed580cdbadc2598424fc1bc6daebd81d13`  
**Baseline:** `7d42e64e6e9acb6c83abbfd298be4b16084b2980`
**Tareas:** PRO-200 / E05; FE-UX y CODIGO del handoff.
**Método:** revisión estática dirigida del diff, los helpers, el controlador real de búsqueda rápida, el formateador existente, el cableado JSX y las pruebas versionadas. **Sin ejecutar pruebas Node, TypeScript, ESLint, DOM/navegador, PostgreSQL, VM, SIFEN ni gateway**; los resultados de ejecución corresponden al reporte de Claude.

## Dictamen

**E05-R01: CONFORME ESTÁTICAMENTE, sin hallazgos bloqueantes en el alcance del commit.** Apta para avanzar a la siguiente **entrega de desarrollo** pero NO homologada, sin autorización de deploy.

## Matriz de aceptación

| Regla | Evidencia de implementación | Parecer |
| --- | --- | --- |
| Guaraníes visuales sin decimales en pagos y saldo de crédito | `medios-pago.tsx` recibe `moneda`, usa `formatearMontoVisual` en monto cubierto; `textoConciliacionPagos` en montos conciliados; `condicion-credito.tsx` usa `formatearMontoVisual(saldo,moneda)` | Conforme estático |
| No esconder diferencias reales en pagos | `textoConciliacionPagos` muestra `formatearDecimalTexto` cuando no hay coincidencia, conservando el decimal exacto y el aviso de error; no altera `conciliacion` | Conforme |
| No perder precisión fiscal | `monto-visual.ts` trabaja sobre el texto sin modificar payload; el diff E05 no modifica `calculo.ts`, `payload-fe.ts`, `emision.ts` ni NEX-067/068. El ejemplo IVA 9754.54545454 se muestra como 9.755 y sigue exacto en el payload | Conforme en código |
| Mostrar establecimiento con ceros | `etiquetaEstablecimiento` se usa en encabezado, selector de sucursales y modal de revisión; no convierte la cadena | Conforme |
| Conservar códigos 001234 ≠ 1234 | `codigo-producto.ts` solo compara strings; `busqueda-rapida.ts` acepta `parecido` y rechaza autoelección si único resultado difiere solo en ceros; selección explícita en lista sigue permitida | Conforme |
| Códigos en API/payload/stock como string | Pruebas de `buscarProductosFactura`, `prepararFactura`, `construirPayloadFE`, catálogo y SQL de stock; no se convierten en números | Conforme en recorte y tests estructurales |
| Código >20 caracteres | Validación fiscal lo rechaza (no recorta ni transforma valores históricos) | Conforme |
| Sin regresión E01–E04, KuDE, logo, gateway, migraciones | Commit E05 modifica presentación/controlador de búsqueda, helpers y tests; no cambia gateway, SQL ni motor fiscal | Conforme al diff |

## Evidencia de tests y límites

**Resultados informados por Claude, no reejecutados:**
- `visual-codigos-e05`: 20 verificaciones / 0 fallas.
- Regresiones: buscador-rapido 40, facturacion 271, rediseno 90, visual-v1 29, monedas 84, credito 91, pagos 77, fat-e2 44, ajuste-fiscal 41, revision-factura 42, cantidad-e01 16, stock-e02 61, descuentos-e03 47, entrega-e04 49, nce 205, kude 96; todas declaradas 0 fallas.
- TypeScript / ESLint puntuales: Claude reportó sin errores.
- Los tests de pantalla inspeccionan JSX y lógica real pura, no DOM ni foco/teclado reales.

**Observaciones menores sin hallazgo correctivo nuevo:**
- El formateador visual de PYG redondea a entero; en importes no conciliados se presenta la fracción exacta deliberadamente para evitar ocultar diferencias, como pidió el responsable.
- `etiquetaEstablecimiento` no hace padding por su cuenta; presupone el código textual del establecimiento ya paddeado (001), como el contrato actual de sucursales. La visualización real sigue pendiente.
- El texto similar con ceros iniciales nunca se selecciona automáticamente por Enter si solo aparece un código distinto; los resultados explícitamente resaltados o elegidos con clic siguen siendo elecciones voluntarias del operador.

## Gate de trabajo

**E05 con auditoría estática aprobada.** No marcar Homologado/Done sin verificación humana de Facturas → Nueva en navegador del entorno autorizado. NEX-067/068 permanecen no aplicadas. El pedido nuevo del responsable de editar **URL y credenciales** en Configuración de facturación electrónica se documenta **por separado** (prioridad nueva, independiente del patch E05), y debe implementar/probarse como una sola entrega aislada antes de continuar con E06 si así quedó registrado en la tarea de coordinación. No alterar PRO-133 ni gateway real mediante esta auditoría.
