# AUD-NEXIT-CASA-MINGO-INFO-ADICIONAL-E1-R05 — Auditoría independiente

**Fecha:** 24/10/2026. **Proyecto:** Distribuidora NEXIT V1 / CASA MINGO.
**Repositorio/branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`.
**Commit funcional auditado y confirmado como HEAD al inicio:** `19925c50d0f035d2eb0b96c47177678d40a6a6e4`.
**Linear:** PRO-301 / PRO-302, nuevas garantías en PRO-303. 
**Antecedentes:** `documentacao/testes/AUD-NEXIT-CASA-MINGO-INFO-ADICIONAL-E1-R04-2026-10-24.md`, `documentacao/definicoes/REQ-NEXIT-CASA-MINGO-CIERRE-V1-2026-10-24.md`, `CLAUDE.md` y `documentacao/PROTOCOLO-IA.md`.

## Método y límites de evidencia

Se confirmó HEAD/commit y diff completo (cinco archivos), se revisaron `lib/facturacion/nce-emision.ts`, `nce.ts`, `info-adicional.ts`, `info-adicional-e1.casos.ts`, `payload-nce.ts`, el SQL NEX-070 (función `fe_documento_crear_nce`) y NEX-071 (wrapper `fe_documento_crear_nce_obs`), y la descripción del procedimiento de deployment. **La auditoría es estática**. No se ejecutó PostgreSQL, VM, Docker, gateway, navegador, migrations, build, pruebas Node/TypeScript/ESLint, ni suites globales. Claude informa tests `info-adicional-e1` **34/0**, `entrega-e04` **70/0**, regresiones NCE/FE con 0 fallos y TypeScript/ESLint puntual limpio; ChatGPT no repitió esas ejecuciones.

## Resultados sobre R04

| Criterio | Evidencia | Dictamen |
|---|---|---|
| PRO-301: cantidad del servicio DESCUENTO en repetición NCE | `repeticion()` consulta `servicioDeNce()` de `nce_descuentos` filtrando por empresa/NCE y compara `parseDec` 8; diferencia → 409 | **CONFORME ESTÁTICO** |
| PRO-301: líneas vs servicio, NEX-070 ausente | Compara presencia/ausencia de servicio; `servicioDeNce` verifica `to_regclass` antes de leer | **CONFORME ESTÁTICO** |
| PRO-302: texto crudo exacto | `crearNotaCredito` usa `cuerpo.observacion` sin `.trim()` en el parámetro 12 y `repeticion` compara `original === cuerpo.observacion` | **CONFORME para reenvío secuencial** |
| PRO-302: límites y fiscalidad | Valida longitud cruda `>5000` con 422 en `prepararNce`; `componerInfoAdicional` y SHA-256 fiscal permanecen iguales | **CONFORME ESTÁTICO** |
| NEX-071: solo altas, inmutabilidad y atomía | Wrapper delega en creación SQL y registra original en la misma transacción solo si se crea nueva NCE; sin ejecutar SQL | **Diseño conforme estático** |
| NEX-071: invariantes al reutilizar | Wrapper confía en `o_reutilizado` de función anterior, cuya identidad SQL incluye el hash fiscal **sin** el original crudo; no verifica `p_observacion_original` contra `nce_observaciones_originales` en caso reutilizado | **NO CONFORME — R05-F001** |

## E1-R05-F001 — ALTA — Reutilización transaccional NEX-071 admite observación cruda diferente con el mismo payload fiscal

**Ubicación:** `documentacao/banco/nexit/v1/migraciones/NEX-071-facturacion-nce-observacion-original.sql` (wrapper `fe_documento_crear_nce_obs`, bloque `v_reutilizado`); `documentacao/banco/nexit/v1/migraciones/NEX-070-facturacion-nce-descuento.sql` (`fe_documento_crear_nce`, `v_entrada` y rama de idempotencia); `lib/facturacion/nce.ts` (manejo de carrera SQLSTATE `23505` y reintento de creación).

**Base comprobable en código:** 
- `fe_documento_crear_nce` calcula `v_entrada` como hash de `p_payload::text` y, para la clave ya existente, retorna `o_reutilizado=true` cuando coincide ese hash.
- `p_observacion_original` no pertenece al JSON fiscal `p_payload`: es el 12.º parámetro interno del wrapper, añadido justamente porque el JSON se compone con el texto visualmente recortado.
- `fe_documento_crear_nce_obs` verifica que el original no sea NULL ni exceda 5000, delega la operación y, **si es reutilizado**, no consulta/compara la observación persistida. Devuelve el documento original sin conflicto.
- `repeticion()` en TypeScript sí compara exactamente el valor crudo **si la NCE ya es visible**, pero es un precheck separado de la creación y no es serializable/atómico con ella.

**Reproducción determinista en contrato SQL (sin ejecutarlo):**
1. Primera llamada de wrapper con clave K, observación cruda `" Nota "` y `p_payload.dInfAdic="Nota\n[Datos automáticos del sistema]\nVendedor: Luis Gómez"`: NCE creada, `nce_observaciones_originales.observacion = " Nota "`.
2. Segunda llamada de wrapper con **misma clave K y mismo `p_payload`** pero `p_observacion_original="Nota"`: el SQL interno reconoce el hash del payload como idéntico, devuelve `o_reutilizado=true`, y wrapper no compara originales; por ello devuelve éxito **sin el 409 requerido**.

**Impacto en flujo normal:** dos solicitudes concurrentes con la misma clave, misma NCE fiscal y observaciones originales distintas que se recortan a igual `dInfAdic` pueden pasar el precheck TS antes de persistirse la primera; la segunda puede terminar en la rama de reutilización SQL. La recuperación ante `23505` en `crearNotaCredito` también vuelve a llamar el wrapper. En ambos casos debe persistir/garantizar la comparación de la observación cruda, sin aceptar petición distinta como mismo documento.

**Corrección mínima requerida:** **dentro del wrapper SQL**, cuando `v_reutilizado=true`, leer la observación cruda persistida para `(p_empresa,v_id)` y compararla con `p_observacion_original` mediante igualdad exacta/NULL-safe; si difiere o falta registro confiable, fallar de forma segura con conflicto, sin devolver la NCE como reutilización válida. También comprobar orden transaccional/visibilidad ante carreras (prueba real en PostgreSQL solo en entorno autorizado posterior). Preservar el manejo de NCE históricas, el tratamiento de solicitud repetida legítima, los controles de monto de servicio, empresa/alcance y la numeración; nunca fabricar o rellenar origen de registros históricos.

**Testes focales nuevos:** prueba de contrato SQL que compruebe la comparación en rama `v_reutilizado` (no solo regex para existencia), casos de dos inputs `" Nota "` y `"Nota"` con mismo payload fiscal; observaciones de espacios solamente vs vacías; duplicados legítimos exactos; reuso sin original histórico → rechazo seguro; concurrencia/carrera antes de guardado (si sólo mocks, declarar que SQL real no se comprobó). No correr base real, VM ni migrations.

## Riesgos separados del defecto

- NEX-071 y NEX-067…070 requieren autorización humana y pruebas de migración/privilegios/carreras con PostgreSQL antes de producción; la NEX-071 está **versionada, no aplicada**.
- `verificar-NEX-071.sql` exige tabla vacía inmediatamente tras aplicarse, antes de emitir nuevas NCE.
- No hay evidencia aquí de fallo de reenvíos secuenciales comunes, diferencia de monto DESCUENTO ni corrupción fiscal en ambiente real. El hallazgo es una violación demostrada por flujo lógico del código SQL y su posible exposición a concurrencia, no un incidente de producción observado.

## Dictamen y siguiente gate

**E1-R05: CORRECCIÓN SOLICITADA (1 hallazgo ALTA nuevo, PRO-303)**. **PRO-301 y PRO-302 conformes estáticamente** en las rutas auditadas; permanece una garantía transaccional necesaria en el SQL NEX-071 para idempotencia, que bloquea el cierre de E1 hasta corregirla y reauditarla. **No declarar homologación ni marcar Done**: ningún SQL se ejecutó en PostgreSQL y el servicio externo no fue comprobado.

Claude desarrolla **solo el hallazgo R05-F001**, ajusta NEX-071 aún no aplicada, tests unitarios/contrato, commit/push y PARA para **AUD E1-R06**. ChatGPT actualiza Linear, AUD y PROGRESSO. No iniciar PRO-293 Usuarios, no modificar KuDE/gateway, inventario, FE ni ejecutar VM/SQL/migrations/deploy.
