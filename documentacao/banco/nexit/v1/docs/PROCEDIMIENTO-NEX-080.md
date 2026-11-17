# PROCEDIMIENTO NEX-080 — CDC como dato informado por la API (PRO-342-R05)

> **Estado:** migración VERSIONADA, **NO APLICADA**. Nada de este procedimiento fue ejecutado por Claude (orden PRO-342-R05: sin SQL, migraciones, VM, Docker, gateway ni deploy). Su ejecución requiere autorización expresa del responsable.

## Qué hace

Regla definitiva del responsable: **NEXIT NO valida el CDC**. El CDC lo genera e informa la API del proveedor; NEXIT lo recibe, lo guarda exactamente como fue informado y lo presenta.

| Cambio | Detalle |
|---|---|
| Restricciones eliminadas (respaldadas en `nex080_respaldo`) | Las de formato de CDC (44 dígitos / `fe_cdc_coherente`) en `documentos_electronicos.cdc` (2), `documento_electronico_intentos.cdc_informado` (1) y `nce_origen.fe_cdc` (1). |
| Restricciones nuevas | Solo límite de transporte: texto de 1..256 caracteres. |
| Columnas nuevas (intentos) | `cdc_anterior` y `cdc_proyeccion` (INICIAL, SIN_CAMBIO, CAMBIO, AUSENTE, NO_PROYECTADO_OTRO_DOCUMENTO, NO_PROYECTADO). |
| Trigger `fe_documentos_inmutable` | El CDC del documento solo cambia por la proyección del MISMO documento (`nex.r05_proyeccion_cdc`) y nunca pasa a NULL. |
| Funciones nuevas | `fe_documento_registrar_consulta_r05`, `_flujo_nce_r05`, `_auto_r05` y `fe_documento_registrar_envio_r05` (públicas para `nexit_runtime`), más el núcleo, `fe_cdc_proyectar_r05` y `fe_cdc_texto_r05`, que son privadas. |
| `fe_documento_crear_nce` | Es la misma definición de NEX-070, con un solo cambio: exige la PRESENCIA del CDC de la FE APROBADA en lugar de `fe_cdc_coherente`. |
| Sin cambios | Las firmas anteriores (NEX-054/062/077/079) no se editan ni se borran. Tampoco cambian el índice único `(empresa_id, cdc)`, el SELECT de `nexit_runtime` ni las filas históricas. |

## Orden obligatorio

1. **Backup** completo de la base (pg_dump) y registro del SHA de la aplicación que corre en la VM.
2. **Preflight**: `scripts/preflight-NEX-080.sql`. Es de solo lectura (`BEGIN READ ONLY … ROLLBACK`). Cualquier fila con `ok = false` significa NO APLICAR hasta conciliar.
3. **Aplicar** `migraciones/NEX-080-facturacion-cdc-dato-api.sql` en una transacción, en una ventana sin emisiones ni consultas en curso. Si hay error, se hace ROLLBACK y no se aplica parcialmente.
4. **Verificar**: `scripts/verificar-NEX-080.sql`, también de solo lectura. Debe dar todas las filas `ok = true`, incluido «ningún intento existente modificado».
5. **Desplegar la aplicación R05**, solo después del paso 4.
   - La app R05 exige las 4 funciones `*_r05` en el catálogo (`exigirNex080`).
   - Sin NEX-080, la app R05 **falla cerrada con 503 antes de llamar al gateway**: no envía, no consulta y no consume numeración. El worker cuenta esos casos como «limitados» y los reprograma.

## Coexistencia

| Combinación | Resultado |
|---|---|
| App anterior + NEX-080 aplicada | Sigue usando sus firmas (NEX-054/062/077/079) y sus reglas de CDC, que NEX-080 no toca. Las restricciones nuevas admiten cualquier CDC que esas firmas acepten. |
| App R05 sin NEX-080 | Bloqueada (503). Nunca degrada a las firmas anteriores. |

Por eso el orden es: migración, verificación y luego la app.

## Reversión (`scripts/reversion-NEX-080.sql`)

La reversión está protegida. **Aborta** si:

- NEX-080 no está aplicada;
- existe evidencia R05 en intentos (`cdc_proyeccion` o `cdc_anterior` no nulos), que es append-only y no se borra;
- existen CDC que las restricciones anteriores no admiten (no se descartan ni se modifican);
- el respaldo está incompleto.

Si no aborta, restaura exactamente las definiciones respaldadas (2 funciones y 4 restricciones), elimina lo creado por NEX-080 y luego se borra la fila `NEX-080` de `schema_migrations`.

Antes de revertir hay que volver a desplegar la app anterior a R05.

## Pendiente (no comprobado)

- No se ejecutó en PostgreSQL. Los casos R05 son textuales y simulados, y no se ejecutaron.
- No se conocen el esquema real de la VM ni el estado aplicado de NEX-077/078/079. El preflight lo verifica antes de aplicar.
- Hay dos dependencias del proveedor que NEXIT no puede comprobar:
  - cambios de CDC para un mismo documento;
  - titularidad del PDF del KuDE.
