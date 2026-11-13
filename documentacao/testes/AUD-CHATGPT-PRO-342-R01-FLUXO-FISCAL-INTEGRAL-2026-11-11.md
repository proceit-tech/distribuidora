# AUDITORÍA INDEPENDIENTE — PRO-342-R01 / ENVÍO, LOTE, XML FIRMADO, CONSULTAS REPETIDAS, HISTORIA Y KuDE

**Fecha:** 11/11/2026
**Commit funcional auditado:** [`abed113625d508f31653a4981287685ab66c9453`](https://github.com/proceit-tech/distribuidora/commit/abed113625d508f31653a4981287685ab66c9453)
**Repositorio/rama:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`
**Contrato:** [ORD PRO-342-R01](../ordens/ORD-CLAUDE-NEXIT-PRO-342-R01-CORRECAO-FLUXO-FISCAL-INTEGRAL-2026-11-11.md) y [especificación vigente](../definicoes/PRO-342-SOLUCAO-UNICA-AUDITORIAS-CONSOLIDADAS-2026-11-11.md), especialmente la rectificación `XML firmado` inicial y NO definitivo.
**Método:** revisión estática de **14 archivos** cambiados, declaraciones y trazas de las funciones de producción, SQL NEX-079 (245 líneas) y reversión, pruebas PRO342-00..10 (479 líneas) y contratos antiguos NEX-054/NEX-077. **NO se han ejecutado casos, SQL, tests, lint, build, VM, gateway, migrations ni deploy.** No se inspeccionaron logs/DB reales.
**DICTAMEN:** **R01 NO CONFORME INTEGRALMENTE** por F001/F002; F003 y F004 también requieren tratamiento focal. El núcleo de reconsulta tras `XML firmado` ES CONFORME ESTÁTICAMENTE, no está homologado operacionalmente.

## A. Conformidades estáticas — NO REHACER

| Dominio | Revisión |
|---|---|
| `XML firmado` | `estados.ts:82–100` interpreta texto bruto `XML firmado` como **PENDIENTE INTERNO**, no aprobado/rechazado; el texto original permanece en historial. No confundir el estado PENDIENTE interno con una decisión final SIFEN oficial. |
| Worker | `consulta-automatica.ts` preserva scheduler existente con FE y NCE, NEX-077 `fe_consulta_reservar_token` + `fe_consulta_programar_token`, lease/fencing/backoff. `NEX-077:45–46` reserva mientras `estado_sifen` sea `SIN_CONSULTA/PENDIENTE/NO_RECONOCIDO`; excluye `APROBADO/RECHAZADO`. `NEX-079:98–101` mantiene la misma regla. |
| Histórico | `shared.ts::consultarEstado` conserva la consulta sin CDC en el request, siempre llama a registro por SQL. NEX-079:123–143 inserta consulta y actualiza estado, CDC/código/mensaje, o solo `ultima_consulta_*` en anomalía. No reescribe los intentos históricos. |
| CDC | `gateway.ts:310–324` consulta exclusivamente `response.DE.CDC`; `resultadoFiscalSinSecretos` conserva CDC 44 dígitos en el campo operacional. Si el gateway no trae CDC, queda `null`. `NEX-079:130–132` `coalesce(d.cdc,p_cdc)` conserva el CDC ya registrado; estados finales requieren identificador conforme al contrato existente, sin inventarlo. |
| Lote | `gateway.ts::interpretarRecepcion` obtiene `nro_lote` de la raíz y `resultadoFiscalSinSecretos` restaura lote operacional. Las rutas de evidencia reconocidas quedan exceptuadas del saneamiento por contraseña; no hace sustitución global. |
| NEX-079 | Adición de columna `conexion` para nuevos intentos, tres sobrecargas de consulta y una de envío. Núcleo de consultas con permisos por empresa, sucursal y lease vigente; reversión se niega si existen intentos con `conexion`, evitando borrar evidencia. No aplicada. |
| Interfaz | `presentacion-sifen.ts::seguimientoFiscal` y `documentos/page.tsx` separan envío, último texto técnico y resultado fiscal; la habilitación del KuDE no se confunde con aprobación. |
| Casos escritos | Suite nueva `flujo-fiscal-pro342.casos.ts`, 11 grupos PRO342-00..10; rutas reales con fetch y DB simulados, incluidos XML firmado repetido, aprobado/rechazado, CDC, lote, worker, KuDE y NEX-079. Runner enlazado. **No ejecutados, por orden expresa.** |

## B. F001 — P0 / El KuDE de emisor ajeno todavía puede mostrarse como propio

**Prueba directa de código:**
1. `gateway.ts:879–890::correspondenciaKude`: si existe CDC registrado, la coincidencia es literal y sirve de filtro. Si el documento **NO tiene CDC local**, acepta un CDC de la respuesta de KuDE mediante `cdcCoherente`, que SOLO verifica **tipo+EEE+PPP+NNNNNNN** y no distingue RUC emisores distintos con la misma numeración.
2. `gateway.ts:883`: si el proveedor responde sin CDC (o con contenido no válido como CDC), la función retorna `NO_VERIFICABLE`, **no un rechazo**.
3. `gateway.ts:916–920::interpretarKude`: convierte `NO_VERIFICABLE` en `{ok:true,pdf}`, listo para presentar al usuario. `shared.ts::obtenerKude` y la ruta API entregan el PDF; el encabezado HTTP `X-Nexit-Kude-Correspondencia: NO_VERIFICABLE` **no impide** visualización/descarga. La modal de documentos no impone distinción explícita al usuario.
4. **Caso PRO342-09e** formaliza `NO_VERIFICABLE` como éxito y PDF presentado, precisamente cuando falta evidencia. **Caso PRO342-09c** cubre solo discrepancia con CDC YA registrado, y PRO342-09d cubre otro número; **no cubren otro RUC con mismo EEE/PPP/NNN y CDC local null**.
5. Este es el mismo escenario de `001-001-0000001 (AA)` de CASA MINGO, en el que el PDF mostrado fue de DISTRIBUIDORA DEL PARAGUAY. Aunque el proveedor de prueba históricamente ha mostrado ese emisor por decisión documentada de octubre, el comportamiento de R01 **NO garantiza** que la visualización corresponda a la factura elegida. No afirmar automáticamente que el proveedor mezcló cuentas o que el envío fue a la cuenta equivocada.

**Impacto:** el objetivo «KuDE correcto, nunca documento de otra empresa» NO se alcanza. Se puede visualizar PDF ajeno aunque haya CDC en la respuesta y coincidan EEE/PPP/numero.

**Límite de negocio impuesto por el responsable:** NO inventar generador/validador fiscal CDC por RUC/DV/fecha, ni OCR, ni bloquear KuDE solo por `XML firmado` o ausencia de CDC local. La corrección **NO** debe reintroducir fórmulas o reglas fiscales adicionales por iniciativa de Claude. La vía válida es demostrar, por **contrato del proveedor y contexto de cuenta/documento**, una correlación fiable; si el proveedor no da forma de comprobarla, no declarar verificado un PDF `NO_VERIFICABLE` ni atribuirlo como propio. La protección exacta debe respetar la decisión empresarial y la disponibilidad del KuDE antes del estado final; ante ausencia de contrato, Claude debe DETENER esta parte y reportar dependencia del proveedor, no forzar una heurística.

**Criterio de salida:** caso otro RUC mismo número/serie y CDC local NULL NO puede pasar como `IDENTIDAD` verificada ni presentarse como factura propia. Respuesta sin CDC tampoco se debe anunciar como correspondencia confirmada.

## C. F002 — P0 / La conexión histórica del ENVÍO no queda fijada de punta a punta

**Prueba directa:**
- `envio.ts:200–205::emitirFactura` aún llama `await configuracionGateway(...)` ANTES de crear/reservar FE.
- `envio.ts:163–180::enviarDocumento` vuelve a llamar `configuracionGateway` y ahora esa configuración sí se utiliza para POST. Si el operador modifica URL/ref entre ambas lecturas, el preflight puede aprobar una cuenta y el POST puede usar otra. La R01 no congela una única config como exige su orden.
- `shared.ts:418–430::consultarEstado` y `:467–485::obtenerKude` leen la **configuración actualmente activa**, **NO** obtienen una conexión asociada al envío previo. Si se cambia la URL/cuenta entre ENVIO, CONSULTA y KuDE, aun guardando snapshot de cada intento (NEX-079), puede consultarse un documento antiguo contra otro gateway. No está implementado el rechazo/aviso de cambio de conexión ni la recuperación autorizada de origen cuando todavía existe.
- NEX-079 registra `host/credencialRef/credencialesVersion/origenCredenciales` **después** de cada llamada, pero **no influye** en escoger la conexión para consulta/KuDE. Registrar el host usado NO corrige la selección.

**Impacto:** no está asegurado «el JSON, el estado y el KuDE pertenecen a la misma configuración fiscal». Este fue precisamente el temor comunicado por el responsable al activar 001/desactivar 003. No afirmar que ocurrió en su incidente: evidencia real de la VM pendiente.

**Criterio de salida:** una configuración efectiva única por operación, y consultas/KuDE posteriores referidas explícitamente a la misma cuenta/ambiente del envío original o bloqueo controlado ante cambio imposible de reconciliar, **sin cambiar URLs/credenciales de producción, reenviar JSON ni inventar cuenta fiscal**.

## D. F003 — P1 / Contrato de «lote EXACTO» no es literal para todos los valores aceptados

`gateway.ts:676–679` convierte `nro_lote` a String y usa `.trim()` ANTES de guardar. Por tanto, si el API enviase un identificador string con espacios iniciales/finales, el NEXIT registra **otro valor** y afirma que conserva el literal exacto. No se afirma que el lote real de CASA MINGO contenga esos espacios. Es discrepancia estática reproducible de contrato: retener valor literal válido sin modificarlo; si incluye delimitadores/espacios inválidos, rechazar explícitamente como identificador inválido/indeterminado, **no normalizarlo silenciosamente**. Los casos actuales solo cubren lote limpio.

## E. F004 — GATE DE PRODUCCIÓN / «Sin NEX-079 funciona» equivale a funcionalidad degradada, no a aceptación completa

- `shared.ts:28–49::registrarConConexion` intenta la firma de NEX-079 y captura cualquier PostgreSQL `42883`; luego usa función anterior SIN registrar `conexion`. El fallback se activa incluso si una función interna falta, aunque la sobrecarga externa exista: el error `42883` no demuestra por sí mismo la ausencia exclusiva de NEX-079.
- SIN NEX-079, la consulta MANUAL usa NEX-054 (no guarda `cdc_informado` estructurado), la consulta AUTOMÁTICA usa NEX-077 (sí guarda), el histórico no contiene host/version; tampoco se puede acreditar la trazabilidad requerida.
- NEX-079 versión incluida requiere NEX-077 real y NEX-078 como otro gate de FE; ninguna está probada aplicada en la VM. Activar versión dependiente de NEX-078 sin `empresas.fe_max_lineas` provoca HTTP422 para toda FE nueva.
- La función `fe_documento_registrar_consulta_nucleo` replica semántica crítica de NEX-054/NEX-062/NEX-077 en nuevo SQL sin prueba ejecutada. La inspección estática fue razonable, pero NO puede probar permisos, ejecución PostgreSQL ni integridad de todas las regresiones.
- Los casos PRO342-08a/b/c usan DB simulada y **NO validan PostgreSQL real**, y las verificaciones PRO342-10d/e/f son de texto/regex sobre SQL. Son útiles, pero no sustituyen homologación.

**Criterio de salida:** diferenciar explícitamente modo compatibilidad de modo integral en código, tela y plan de despliegue; solo homologar flujo integral tras NEX-077/NEX-078/NEX-079 verificadas/aplicadas por operador autorizado, con pruebas y rollback plan aprobado. Tratar con precisión los errores de firma 42883 y no ocultar rotura interna como migration ausente.

## F. Alcance de corrección FOCAL — No rehacer R01

**Mantener conformes**: XML firmado=intermedio, consultas sucesivas hasta Aprobado/Rechazado, lote/CDC operacional intactos, cero reenvíos, estados finales/HISTORIAL, worker existente, 11 grupos de casos, esquema incremental.

**Ajustar exclusivamente**:
1. Correlación KuDE a documento/cuenta/serie donde el contrato del proveedor lo permite; NO aprobar `NO_VERIFICABLE` como verificado. Si la prova de origen no existe, STOP con dependencia documentada, sin inventar algoritmo de CDC/RUC ni ocultar PDF de tercero bajo etiqueta de factura propia.
2. Congelar la config de envío en un solo contexto autorizado, y exigir continuidad de conexión para consultar estado/KuDE sin cambiar silenciosamente gateway de documentos históricos.
3. Preservar lote EXACTO sin `.trim()` de dato fiscal; invalidar en lugar de alterar si el proveedor entrega un valor no conforme.
4. Aclarar modo compatibilidad sem NEX-079 y proteger fallback 42883 de ocultar problemas internos; tests de conflito de config e RUC divergente com mesmo EEE/PPP/NNN e CDC local NULL, além de cenários existentes. **Escrever casos, não executá-los**.

**No** cambiar normas de CDC/estado final, PRO-340, NCE/stock/ventas/reportes, worker nuevo, SQL históricos, credenciales/URL, ni activar NEX-079 por esta auditoría.

## G. Veredicto y gates

**PRO-342-R01: NO CONFORME INTEGRALMENTE, pero núcleo de reconsultas es CONFORME ESTÁTICAMENTE.** No se puede homologar el KuDE ni la continuidad de conexión por intento. **Cero pruebas o SQL ejecutados**. Registrar esta auditoría en GitHub/Linear; una orden correctiva R02 focal después de esta auditoría. El código no se despliega automáticamente.

**Pendientes operacionales:** SHA/build VM real, condición NEX-077/NEX-078 y correlación del proveedor entre lote/cuenta/serie/PDF de CASA MINGO. Ninguna de estas evidencias se sustituye por casos mock.
