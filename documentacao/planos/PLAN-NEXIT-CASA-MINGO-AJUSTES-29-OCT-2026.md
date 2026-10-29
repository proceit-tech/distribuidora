# PLAN DE IMPLEMENTACIÓN CONTROLADA — CASA MINGO — 29/10/2026

**Fuente:** solicitudes reales de CASA MINGO recibidas el 29/10/2026. **Documento rector de auditoría:** [AUD-NEXIT-CASA-MINGO-SOLICITUDES-2026-10-29.md](../analises/AUD-NEXIT-CASA-MINGO-SOLICITUDES-2026-10-29.md). **Coordinador:** [PRO-329](https://linear.app/proceit/issue/PRO-329).

**Separación de responsabilidades:** ChatGPT define reglas, registra y prioriza Linear, versiona especificaciones, audita commits. Claude **solo desarrolla una tarea expresamente habilitada** y entrega SHA/para; no actualiza Linear ni decide cambios comerciales. Operación humana realiza deploy/SQL/migrations/certificados y homologación. Cada tarea pasa por auditoría independiente del ChatGPT antes de otra orden.

## 1. Matriz de tareas sin duplicidad

| Etapa | Linear | Estado inicial | Alcance exacto | Tipo |
|---|---|---|---|---|
| 00 | [PRO-327](https://linear.app/proceit/issue/PRO-327) | **UI/API PENDIENTE; SQL 561 COMPLETADO** | Habilitar código alfanumérico/ceros en alta de productos; SQL ya ejecutado y poscheck OK; **pausada** al priorizar este paquete | Código, orden antigua NO activa |
| 01 | [PRO-328](https://linear.app/proceit/issue/PRO-328) | **ÚNICA ORDEN NUEVA AUTORIZADA** | FE nueva: origen geográfico del receptor = dirección elegida; quitar dirección automática de `dInfAdic`; proteger históricos/idempotencia | P0 fiscal; código + eventual migration solo versionada |
| 02 | [PRO-330](https://linear.app/proceit/issue/PRO-330) | Todo; no autorizada todavía | Stock disponible por línea al agregar/cambiar, sin alterar reserva/venta al emitir | P0 operativo |
| 03 | [PRO-333](https://linear.app/proceit/issue/PRO-333) | Todo; no autorizada | Orden numérico `Documento`, servidor, paginación, IDs estables | P1 bug |
| 04 | [PRO-331](https://linear.app/proceit/issue/PRO-331) | Todo; no autorizada | Ordinal visual, scroll propio de tabla editable, foco al código tras agregar | P1 UX |
| 05 | [PRO-334](https://linear.app/proceit/issue/PRO-334) | Todo; no autorizada | FE azul suave/NCE amarillo suave, estados independentes | P1 UX |
| 06 | [PRO-335](https://linear.app/proceit/issue/PRO-335) | Todo; no autorizada | Formatos IVA Neto y Stock sin decimales cero; mantener fracción real | P1 presentación |
| 07 | [PRO-332](https://linear.app/proceit/issue/PRO-332) | Todo; no autorizada | Vista/Excel/PDF por documento×línea×producto×vendedor×fecha, histórico fiscal fiel | P1 reporte |
| E1 | [PRO-298](https://linear.app/proceit/issue/PRO-298) | Todo; proveedor | PDF KuDE cabecera y USD 2 decimales; produce el gateway. No manipular PDF en NEXIT | Validación externa |
| E2 | [PRO-336](https://linear.app/proceit/issue/PRO-336) | Todo; proveedor | Renovación/instalación de certificado con contraseña correcta; consulta DTE APROBADOS | Validación externa |

**Relacionadas sin reabrir ni duplicar:** PRO-322 geografía del receptor ya implementada para la dirección fiscal antigua; PRO-323 texto asistido, cuyo diseño de inserción automática debe respetar la nueva decisión; PRO-324/PRO-205 identidad logística histórica; PRO-296 ventas E5 ya revisado estaticamente pero sin la nueva vista de detalle; PRO-295 cantidades de movimientos E4 sin ceros finales, pendiente de homologación; PRO-326 KuDE sin CDC (conforme estáticamente, no reabrir); PRO-93 UI factura; PRO-207 credenciales API, no certificado.

## 2. Política de ejecución

1. **ÚNICA orden nueva de código:** [ORD-CLAUDE-NEXIT-CM-PRO-328-DIRECCION-SELECCIONADA-2026-10-29.md](../ordens/ORD-CLAUDE-NEXIT-CM-PRO-328-DIRECCION-SELECCIONADA-2026-10-29.md). No iniciar otras etapas de esta tabla automáticamente.
2. Claude comprueba el árbol Git limpio y sincroniza solo fast-forward. Si hay cambios locales sin commit, los protege y PARA; no sobrescribir.
3. Claude modifica **únicamente archivos autorizados por la orden**, prepara casos puntuales como código y puede versionar migración incremental solicitada, **sin ejecutarla**. No ejecutar NEXIT VM/DB/gateway, ni emitir FE reales, ni desplegar.
4. Final: commit+push, SHA completo, conteo de casos como código, pruebas ejecutadas o no y bloqueos concretos; PARA. ChatGPT audita GitHub HEAD/diff completo, prueba reglas, y autoriza siguiente etapa si está conforme.
5. **No declarar Done** con revisión estática. Las diez peticiones quedan pendientes de visualización y comparación con documentos y datos reales en ambiente humano; si alguna depende del proveedor, no prometer solución por cambio frontend.

## 3. Reglas transversales obligatorias

- Aislamiento tenant, ACL por sucursal/perfil; ninguna URL/búsqueda/control permite otro cliente o empresa.
- Fuente de verdad PostgreSQL y snapshots fiscales previos. Sin mocks, localStorage, datos fijos para negocio ni informes ficticios.
- No alterar monto, IVA, descuentos, numeración, emisión, NCE, stock/reserva, CDC o PDF del gateway en una tarea visual.
- Preservar código SKU alfanumérico con ceros iniciales, como string; distinguir GTIN y PK UUID.
- Código postal/geográfico SIFEN viene de códigos oficiales, no de descripciones libres.
- Fechas del reporte PY; monedas nunca combinadas; fracciones verdaderas no se suprimen.
- Históricos FE/NCE/KuDE jamás se sobrescriben al corregir futuras emisiones.
- Certificados y claves reales quedan bajo custodia del operador/proveedor; ni Claude ni ChatGPT los recibirán o almacenarán.
