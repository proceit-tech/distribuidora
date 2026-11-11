# AUDITORÍA INDEPENDIENTE PRO-342-R03 — PARECER RECTIFICADO POR DECISIÓN EXPRESA DEL RESPONSABLE

**Fecha:** 11/11/2026
**Commit funcional auditado:** [b17dda189f0b966d43ebedcebb5138c06b3eee11](https://github.com/proceit-tech/distribuidora/commit/b17dda189f0b966d43ebedcebb5138c06b3eee11)
**Fuente contractual:** [ORDEN PRO-342-R03](../ordens/ORD-CLAUDE-NEXIT-PRO-342-R03-AJUSTES-FINALES-FLUJO-FISCAL-2026-11-11.md) y [reglas vigentes](../definicoes/PRO-342-SOLUCAO-UNICA-AUDITORIAS-CONSOLIDADAS-2026-11-11.md).
**Auditor:** ChatGPT, analista de sistemas y negocio; **desarrollador:** Claude.
**Ámbito:** 8 archivos del commit R03; funciones TypeScript de interpretación, reconciliación, continuidad de conexión y envío; SQL NEX-079 completa y comparación con NEX-047/050/054/062/077; revisión de la intención de casos PRO342-R03 escritos y ajustados. **No se ejecutaron tests, lint, build, SQL, migrations, llamadas al gateway, VM ni deploy.**
**VEREDICTO RECTIFICADO:** **R03-01 NO CONFORME CON LA REGLA REAL DEL GATEWAY; R03-02 y R03-03 CONFORMES ESTÁTICAMENTE.** Se revoca la aprobación estática integral anterior. El responsable aclaró que un XML firmado SIEMPRE tiene CDC; un estado final Aprobado/Rechazado con CDC NULL contradice el contrato. No homologar ni ejecutar tests/SQL/deploy sobre esta regla.

## A. R03-01 NO CONFORME — nunca consolidar un final con CDC NULL

- **Defecto funcional:** `lib/facturacion/reconciliacion.ts::decidirConsulta` deja pasar `APROBADO/RECHAZADO` sin CDC y sin CDC previo. Debe tratarlo como `RESPUESTA_INVALIDA`, conservar intento/mensaje y continuar seguimiento, sin inventar CDC. Preservar protección contra contradicción de finales ya registrados.
- `lib/facturacion/gateway.ts::interpretarConsulta` ya rechaza CDC presente malformado en finales, pero `XML firmado` sin CDC tampoco demuestra firma: el parser/conciliador debe conservar respuesta como evidencia inconsistente y NO consolidar `PENDIENTE` de XML firmado validado en ausencia de CDC (o CDC previo). No generar CDC.
- **Defecto SQL NEX-079 (todavía NO aplicada):** `fe_documento_registrar_consulta_nucleo` permite finales con `coalesce(p_cdc,d.cdc) IS NULL`; restaurar la guarda de CDC auténtico presente/coherente (informado en respuesta o persistido previamente) tanto para APROBADO/RECHAZADO como otros finales. Conservar `CDC_DIVERGENTE`, lease, permisos, historial append-only y no reescribir migrations históricas.
- El estado `APROBADO/RECHAZADO` sale del campo oficial del contrato `response.Estado` bajo `status=success`/HTTP 200, NO de HTTP 200 aislado. Consulta de identidad y aislamiento se hacen como ya estaban diseñados.
- **Casos escritos con expectativa incorrecta:** R03-F, `PRO342-06c`, `P338-10`, `T-E2` y `R03-14` que esperan FINAL válido sin CDC deben cambiar para exigir `RESPUESTA_INVALIDA` y mantener seguimiento. Agregar `XML firmado` sin CDC como anormalidad, `XML firmado+CDC` → nuevas consultas → Aprobado/Rechazado con CDC ya persistido.

**MATIZ IMPORTANTE SOBRE COMPATIBILIDAD SQL ANTIGUA:**
- La afirmación «NEX-054, 062 y 077 antiguas bloquean resultado final sin CDC» es INEXACTA en la SQL versionada.
- **NEX-054 antigua (MANUAL) NO contiene guarda SQL propia de CDC para el final**, por lo que la aplicación DEBE bloquear antes de enviar la llamada a la firma antigua una respuesta sin CDC, y el modo compatibilidad debe seguir declarado limitado. No editar NEX-054 histórica.
- **NEX-062 (FLUJO NCE) y NEX-077 (AUTO) antiguas SÍ exigen CDC válido**: son coherentes con la regla real y deben permanecer intactas; no hay motivo de negocio para permitir finales sin CDC.
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
                  → «Aprobado» o «Rechazado» CON CDC del documento (final SIFEN)
                  → resultado, código, mensaje, fecha, intento (sin generar ni sustituir CDC)
                  → KuDE puede habilitarse ANTES del final, sin hacerlo pasar por aprobación
```

- CDC viene exclusivamente de API; no se genera, calcula, sustituye ni repara.
- Respuestas técnicas e historial son independientes del estado fiscal final.
- El KuDE de correspondencia no verificable se etiqueta/descarga con `NO-VERIFICADO`; sin CDC previo y metadato de proveedor, la titularidad del PDF NO está acreditada. No se incorpora OCR ni lógica fiscal nueva por restricción expresa del responsable.

## E. Condiciones de salida para HABILITAR HOMOLOGACIÓN (sin ejecutarlas aquí)

1. **Verificar instancia real:** SHA del despliegue, firmas de NEX-050/054/062/061/077/078/079 y columna `conexion`; cotejar si base cuenta con NEX-079 aplicada, no inferir por Git.
2. **Backup y migrations:** autorizar por separado revisión de precondiciones y posterior ejecución de NEX-079 con plan de reversión. La R03 NO sirve como solución integral del worker sin la firma SQL nueva. No ejecutar NEX-079 sin validar NEX-077 y dependencias, y la NEX-078 si la versión de emisión la requiere.
3. **Pruebas controladas:** una vez corregidos el código y casos y tras autorización expresa, probar `XML firmado+CDC` → reconsultas → `Aprobado` o `Rechazado`; y casos negativos `XML firmado` sin CDC y final sin CDC **sin CDC previo** → evidencia de `RESPUESTA_INVALIDA`, sin estado fiscal definitivo ni CDC inventado; NCE, ENV, KuDE no verificado. Ninguna prueba fue ejecutada en esta auditoría.
4. **Contrato proveedor para KuDE:** confirmar ambiente/cuenta autenticada, emisor del PDF, relación con serie AA y lote; sin esa evidencia NO afirmar titularidad fiscal del PDF cuando no hay CDC verificado.
5. **Control de operación:** conservar histórico real y no reenviar/editar facturas existentes por diagnóstico. Validar autorizaciones por empresa y sucursal, lease y reconsulta. GO-LIVE necesita un procedimiento de cambio aprobado.
6. **Proceso de revisión:** una vez ejecutadas pruebas autorizadas, el analista revisa resultados y publica decisión de homologación; ningún deploy ni cambio de producción se deduce de esta auditoría.

**ESTADO RECOMENDADO PARA LINEAR:** `In Review`, con **BLOQUEO R03-01 confirmado por regla de negócio** e R03-02/R03-03 conformes estáticamente. La anterior conclusión «R03 íntegra aprobada / no más código» queda revocada; requiere una única corrección focal, sin reabrir otros módulos. **PRO-340 bloqueada.**
