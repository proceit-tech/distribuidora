# AUDITORÍA INDEPENDIENTE PRO-342-R03 — CIERRE DE LA CORRECCIÓN ESTÁTICA

**Fecha:** 11/11/2026
**Commit funcional auditado:** [b17dda189f0b966d43ebedcebb5138c06b3eee11](https://github.com/proceit-tech/distribuidora/commit/b17dda189f0b966d43ebedcebb5138c06b3eee11)
**Fuente contractual:** [ORDEN PRO-342-R03](../ordens/ORD-CLAUDE-NEXIT-PRO-342-R03-AJUSTES-FINALES-FLUJO-FISCAL-2026-11-11.md) y [reglas vigentes](../definicoes/PRO-342-SOLUCAO-UNICA-AUDITORIAS-CONSOLIDADAS-2026-11-11.md).
**Auditor:** ChatGPT, analista de sistemas y negocio; **desarrollador:** Claude.
**Ámbito:** 8 archivos del commit R03; funciones TypeScript de interpretación, reconciliación, continuidad de conexión y envío; SQL NEX-079 completa y comparación con NEX-047/050/054/062/077; revisión de la intención de casos PRO342-R03 escritos y ajustados. **No se ejecutaron tests, lint, build, SQL, migrations, llamadas al gateway, VM ni deploy.**
**VEREDICTO:** **PRO-342-R03 CONFORME ESTÁTICAMENTE CON LOS TRES REQUISITOS DE LA ORDEN. CIERRE DE CORRECCIÓN DE CÓDIGO PARA ESTE CICLO. NO EQUIVALE A HOMOLOGACIÓN NI AUTORIZACIÓN DE PRODUCCIÓN.** No solicitar una R04 por hipótesis sin evidencias de pruebas.

## A. Conformidad R03-01 — final fiscal sin CDC

- `lib/facturacion/reconciliacion.ts::decidirConsulta`: ya no rechaza `APROBADO/RECHAZADO` por la sola ausencia de CDC. Sigue impidiendo retroceso o contradicción de un resultado final ya registrado.
- `lib/facturacion/gateway.ts::interpretarConsulta`: si el estado oficial `Aprobado/Rechazado` viene con CDC malformado, devuelve `RESPUESTA_INVALIDA` para no presentar la respuesta como «sin CDC». Un estado final sin campo CDC puede conservar `cdc=null`; el estado intermedio `XML firmado` sigue sin ser estado definitivo. No construye ni calcula CDC.
- `NEX-079::fe_documento_registrar_consulta_nucleo`: cambió la condición a «si existe CDC y es incoherente, rechazar»; permite estado final con `p_cdc/d.cdc=NULL`, conserva código/mensaje y deja `cdc=NULL`. La protección `CDC_DIVERGENTE`, los finales anteriores y el fencing/lease del worker permanecen.
- El estado `APROBADO/RECHAZADO` sale del campo oficial del contrato `response.Estado` bajo `status=success`/HTTP 200, NO de HTTP 200 aislado. Consulta de identidad y aislamiento se hacen como ya estaban diseñados.
- Casos escritos R03-F (además de reajustes de PRO342-06c, P338-10, T-E2 y R03-14), **no ejecutados**, cubren XML firmado→final sin CDC, final con CDC malformado y divergente, no regresión de final y conservación de mensaje/código.

**MATIZ IMPORTANTE SOBRE COMPATIBILIDAD SQL ANTIGUA:**
- La afirmación «NEX-054, 062 y 077 antiguas bloquean resultado final sin CDC» es INEXACTA en la SQL versionada.
- **NEX-054 (consulta MANUAL) NO contiene una condición que obligue a CDC para fijar un final**; tras la corrección TypeScript R03 puede registrar `APROBADO/RECHAZADO` sin CDC, aunque su intento no tenga `cdc_informado` estructurado ni conexión de NEX-079.
- **NEX-062 (flujo NCE con CREAR/EDITAR) y NEX-077 (consulta AUTO con token) SÍ exigen `coalesce(p_cdc,d.cdc)` válido para finales**. En ausencia de NEX-079, pueden guardar una respuesta `RESPUESTA_INVALIDA` y mantener pendiente un RECHAZADO real sin CDC.
- Lo anterior describe VERSIONES GIT, no garantiza qué funciones están actualmente aplicadas en la VM. La aplicación NO está integralmente conforme en modo degradado. Verificar las firmas reales antes de homologar.

## B. Conformidad R03-02 — credenciales de entorno y continuidad

- `lib/facturacion/gateway.ts::continuidadConexion` devuelve **`DISTINTA`** si cambió host, `credencialRef`, `origenCredenciales` o versión conocida; `shared.ts::conexionParaDocumento` genera 409 antes del HTTP externo.
- Para origen `ENTORNO` (password/usuario en variables de servidor no vinculadas a versión DB), aun con host/ref/versión coincidentes devuelve **`SIN_REFERENCIA`**, nunca `MISMA`; tampoco `null/null` prueba igualdad.
- Para `NEXIT_DB` origen BASE con host/ref/versión efectiva conocida igual, permite `MISMA`; versión divergente `DISTINTA`; desconocida `SIN_REFERENCIA`.
- El aviso de `SIN_REFERENCIA` se actualizó en `app/(private)/documentos/page.tsx`. Las referencias de historial no contienen contraseña/token/usuario ni un hash de RUC.
- **Limitación aceptada, no ocultarla:** `SIN_REFERENCIA` NO BLOQUEA la consulta ni la recuperación de KuDE; indica que la aplicación NO puede probar la igualdad de la cuenta. Una cuenta ENV modificada bajo mismo host/ref todavía puede devolver resultados no relacionados. No presentar su identidad como verificada. Este riesgo exige confirmar configuración real de proveedor o migrar operacionalmente a credenciales NEXIT_DB con autorización separada; NO crear cambio de credenciales o algoritmo extra en esta auditoría.

## C. Conformidad R03-03 — lote sólo con ACK correlacionado

- `gateway.ts::interpretarRecepcion` asigna `lote` al resultado únicamente cuando `estadoLocal=ENVIADO`. Respuestas `ENVIO_INDETERMINADO` por eco fiscal extraño, lista Aceptados de otra factura, rechazo o fallo dejan `lote=null` en el resultado operativo.
- El valor literal potencialmente recibido continúa, cuando procede, en la evidencia saneada de respuesta; no se reconstruye, recorta ni guarda como lote confirmado de la factura.
- `NEX-079::fe_documento_registrar_envio` aplica guarda adicional: intento y documento sólo reciben lote con `p_estado_local='ENVIADO'`; la función SQL histórica NEX-050 no se modificó, pero la entrada de aplicación también evita pasar lote en caso indeterminado.
- No se reenvía JSON. Los casos R03-L01..L09 cubren respuesta ajena, error con lote, timeout, éxito propio y fallback de firma anterior (casos escritos, no ejecutados).

## D. Flujo de negocio preservado desde R01 y R02

```text
JSON FE/NCE único → POST /api/recepcion_de → ACK/lote (no aprobación)
                  → /api/consulta_de → «XML firmado» (intermedio)
                  → reconsultas del MISMO documento por el worker NEX-077
                  → «Aprobado» o «Rechazado» (final SIFEN)
                  → resultado, código, mensaje, fecha, intento y CDC solo si API lo informa
                  → KuDE puede habilitarse ANTES del final, sin hacerlo pasar por aprobación
```

- CDC viene exclusivamente de API; no se genera, calcula, sustituye ni repara.
- Respuestas técnicas e historial son independientes del estado fiscal final.
- El KuDE de correspondencia no verificable se etiqueta/descarga con `NO-VERIFICADO`; sin CDC previo y metadato de proveedor, la titularidad del PDF NO está acreditada. No se incorpora OCR ni lógica fiscal nueva por restricción expresa del responsable.

## E. Condiciones de salida para HABILITAR HOMOLOGACIÓN (sin ejecutarlas aquí)

1. **Verificar instancia real:** SHA del despliegue, firmas de NEX-050/054/062/061/077/078/079 y columna `conexion`; cotejar si base cuenta con NEX-079 aplicada, no inferir por Git.
2. **Backup y migrations:** autorizar por separado revisión de precondiciones y posterior ejecución de NEX-079 con plan de reversión. La R03 NO sirve como solución integral del worker sin la firma SQL nueva. No ejecutar NEX-079 sin validar NEX-077 y dependencias, y la NEX-078 si la versión de emisión la requiere.
3. **Pruebas controladas:** autorizar explícitamente ejecución de casos unitarios/integración y SQL de homologación, incluyendo devolución final `Rechazado 1101` sin CDC, `XML firmado` repetido, ausencia/error de gateway, NCE, cambio ENV y `KUDE-NO-VERIFICADO`. No confundir mocks con validación de gateway/SIFEN.
4. **Contrato proveedor para KuDE:** confirmar ambiente/cuenta autenticada, emisor del PDF, relación con serie AA y lote; sin esa evidencia NO afirmar titularidad fiscal del PDF cuando no hay CDC verificado.
5. **Control de operación:** conservar histórico real y no reenviar/editar facturas existentes por diagnóstico. Validar autorizaciones por empresa y sucursal, lease y reconsulta. GO-LIVE necesita un procedimiento de cambio aprobado.
6. **Proceso de revisión:** una vez ejecutadas pruebas autorizadas, el analista revisa resultados y publica decisión de homologación; ningún deploy ni cambio de producción se deduce de esta auditoría.

**ESTADO RECOMENDADO PARA LINEAR:** `In Review` (código R03 conforme estáticamente, pero pruebas/migration/operación aún pendientes), mantener P0 abierto. **NO levantar PRO-340.** Evitar rondas adicionales de código por defectos no demostrados, salvo si los tests revelan hallazgos concretos.
