# AUD-NEXIT-CASA-MINGO-INFO-ADICIONAL-E1-R06 — Auditoría independiente

**Fecha:** 24/10/2026. **Proyecto:** Distribuidora NEXIT V1 / CASA MINGO.
**Repositorio / branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`.
**Commit funcional auditado, confirmado como HEAD:** `d231ee0ee32f7e64797a3fb1cefa5aea1b23a773`.
**Linear:** PRO-303 (R05-F001), relacionadas PRO-292, PRO-300, PRO-301, PRO-302; próximo trabajo PRO-293.
**Precedente:** `documentacao/testes/AUD-NEXIT-CASA-MINGO-INFO-ADICIONAL-E1-R05-2026-10-24.md`.

## Método y alcance

Se comprobó HEAD, commit y diff de los tres archivos modificados, leyendo completos:
- `documentacao/banco/nexit/v1/migraciones/NEX-071-facturacion-nce-observacion-original.sql` y `docs/PROCEDIMIENTO-NEX-071.md`;
- `lib/facturacion/info-adicional-e1.casos.ts`, `lib/facturacion/nce.ts`, `lib/facturacion/nce-emision.ts`, `lib/facturacion/shared.ts`, contrato de `NEX-070` y flujos de la misma clave;
- `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` y la auditoría R05.

**No se ejecutaron PostgreSQL, migrations, gateway, navegador, VM, Docker, build, TypeScript/ESLint ni pruebas Node por ChatGPT.** El desarrollador Claude informó `info-adicional-e1` **38/0** (4 nuevos), `nce` **205/0**, `nce-correcciones-r01` **26/0**, `nce-descuento-e07` **31/0** y ESLint puntual limpio. Esa evidencia es **declarada por Claude**, no reproducida independientemente. Las verificaciones nuevas del SQL son inspección del texto/contrato, no ejecución transaccional.

## Matriz del defecto PRO-303 / E1-R05-F001

| Invariante | Evidencia de código | Resultado |
| --- | --- | --- |
| La función interna reconoce que se reutilizó una NCE | `fe_documento_crear_nce_obs` llama sin modificaciones a `fe_documento_crear_nce` y obtiene `v_id, v_numero, v_reutilizado` | Conforme |
| Creación nueva guarda observación cruda | Rama `IF NOT v_reutilizado` inserta `p_observacion_original` en `nce_observaciones_originales`, misma llamada SQL y transacción | Conforme estático |
| Reutilización valida la identidad exacta | Rama `ELSE` lee `o.observacion` por `o.empresa_id=p_empresa AND o.nce_id=v_id`; `IF NOT FOUND OR v_original IS DISTINCT FROM p_observacion_original` genera conflicto | **Conforme estático** |
| Documento legado sin origen no se acepta por suposiciones | `NOT FOUND` lanza `DETAIL='NEX:IDEMPOTENCIA_CONFLICTO'`, sin crear registro ni reinterpretar texto | Conforme estático |
| Sin alteración de registro/número | No hay INSERT/UPDATE/DELETE en rama reutilizada; excepción PL/pgSQL revierte efectos de la llamada | Conforme estático |
| HTTP 409 | `respuestaErrorFacturacion` en `lib/facturacion/shared.ts` traduce el detalle a JSON con `status: 409` | Conforme |
| Recuperación 23505 y datos originales | `crearNotaCredito` en `nce.ts` reintenta solo una vez `llamar()` con argumentos intactos y mismo parámetro 12; error P0001 no activa reintento | Conforme estático |
| Seguridad y alcance | Consulta filtra por empresa + NCE, `SECURITY DEFINER SET search_path=public,pg_temp`, grants/revokes previamente versionados sin cambios | Conforme estático |
| PostgreSQL real: carrera y visibilidad entre transacciones | Ningún test contra motor PostgreSQL ni aplicación de NEX-071 | **Pendiente de homologación técnica en ambiente autorizado** |

## Pruebas nuevas observadas en el commit

- **E1-53:** contrato de la rama SQL `ELSE`: SELECT por empresa/NCE, comparación exacta, rechazo por ausencia y discrepancia, sin escrituras en rama de reutilización.
- **E1-54:** el detalle de excepción NEX:IDEMPOTENCIA_CONFLICTO corresponde a HTTP 409.
- **E1-55:** mock `23505` en primera llamada; segundo intento con la misma función y observación cruda de 12.º parámetro.
- **E1-56:** mock `P0001`/detalle conflicto se propaga sin segundo intento.
- No hay pruebas ejecutadas con el motor real que demuestren bloqueo de concurrencia/aislamiento al nivel de PostgreSQL, por lo que no se deduce homologación de la carrera a partir del mock.

## Conclusión de auditoría

**E1-R06: CONFORME EN REVISIÓN ESTÁTICA. Sin defectos comprobados adicionales en el alcance PRO-303.** El problema R05-F001 quedó corregido en el diseño SQL versionado; anteriores PRO-292, PRO-300, PRO-301 y PRO-302 permanecen conformes en sus revisiones estáticas. **Se cierra la etapa de auditoría de código E1**, no la homologación funcional ni la implantación de NEX-071.

### Gate de ejecución / riesgos operacionales pendientes

1. NEX-071 fue versionada pero **no aplicada**; requiere NEX-062/NEX-070 y revisión del orden NEX-066…070. El responsable debe verificar preflight, backups/rollback y ejecución en PostgreSQL real, incluyendo revisión de permisos `SECURITY DEFINER`, triggers, registros antiguos, `SELECT`/INSERT en misma transacción y competencia de misma clave con `" Nota "` vs `"Nota"`.
2. Validar la devolución HTTP 409 desde un entorno real y la continuidad de reintentos idénticos, incluso con fallback antes de NEX-071.
3. Validar FE/NCE con proveedor/KuDE, `dInfAdic` J003 impreso, dirección de entrega y vendedor, y los flujos de corrección real de rechazadas.
4. `PRO-115` homologación y `PRO-114` deploy continúan bloqueadas: **sin Done ni aprobación para producción**.

### Próximo trabajo

Es legítimo **autorizar el desarrollo E2 / PRO-293 Usuarios = Vendedores**, ya que la dependencia sobre E1 era de **cierre de auditoría de código**, ahora satisfecha. La prueba de NEX-071 en la VM es un **gate separado de la producción** y no impide programar E2 en branch, salvo nueva instrucción del responsable.

**Governança:** Claude es desarrollador (código, tests puntuales, commit/push y PARA); ChatGPT gestiona Linear, requisitos, PROGRESSO y auditorías; el responsable humano homologa/autoriza cambios operacionales. No ejecutar VM/SQL/deploy por IA ni marcar issues Done por auditoría estática.
