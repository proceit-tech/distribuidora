# NEXIT-CI-R01 / F003 — Diagnóstico T01: tablas con `actualizado_at` sin trigger `<tabla>_actualizado_trg`

**Fecha:** 23/11/2026 · **Base:** HEAD `0f72bd9aeeabad19d0d458bd85af96c5584112d5` · **Orden:** `documentacao/ordens/ORD-CLAUDE-NEXIT-CI-R01-C1-T01-UX-2026-11-23.md` §1 F-T01 y §2.3.

**Naturaleza:** diagnóstico estático y propuesta DOCUMENTAL. No se escribió SQL ejecutable, no se creó ni modificó ninguna migration, no se alteró `T01-estructura.sql` ni se ejecutó SQL, psql, runner, Docker ni VM. **T01 sigue siendo BLOQUEANTE** hasta que el responsable autorice (o rechace) por separado una migration incremental.

## 1. Evidencia del fallo

- CI automático `nexit-banco-ci`, run 44791651890 (HEAD f15a2b2): `T01-estructura.sql:30 NOTICE … tablas con actualizado_at sin trigger: compras_entradas_intenciones, fe_punto_secuencias, movimientos_intenciones` y `T01-estructura.sql:36 ERROR: FALLA: todas las tablas con actualizado_at tienen trigger de actualización`.
- Criterio T01 (líneas 23–36): toda tabla base de `public` con columna `actualizado_at` debe tener un trigger llamado exactamente `<tabla>_actualizado_trg`. El criterio es correcto y **no se modifica** (no se agregan excepciones).

## 2. Causa común

`NEX-001-base.sql:21–41` define `actualizar_fecha()` (`NEW.actualizado_at := now(); RETURN NEW;`) y `nex_instalar_triggers_actualizacion()`, que instala `<tabla>_actualizado_trg BEFORE UPDATE … EXECUTE FUNCTION actualizar_fecha()` en todas las tablas con esa columna. NEX-002…017 la llamaban después de crear sus tablas. Las migraciones posteriores que crean tablas con `actualizado_at` dejaron de llamarla. NEX-055 corrigió **solo** `fe_gateway_config`, `documentos_electronicos` y `fe_puntos_expedicion`, a propósito: no recorre el esquema y avisa (NOTICE) si quedan otras tablas. Las tres tablas de abajo se crearon **después** (NEX-060, NEX-066, NEX-075) con el mismo patrón y la misma omisión.

En las tres, **todos los UPDATE versionados ya escriben `actualizado_at = now()` de forma explícita** y la aplicación (`nexit_runtime`) no puede actualizar las tablas directamente. Por eso hoy no hay un dato incorrecto demostrado: falta una garantía estructural, y T01 la exige.

## 3. Diagnóstico por tabla

### 3.1 `fe_punto_secuencias` (NEX-060, fiscal)

| Aspecto | Hallazgo |
|---|---|
| Migración creadora | `NEX-060-facturacion-secuencias-por-tipo.sql:38–48` (`actualizado_at timestamptz NOT NULL DEFAULT now()`). Columnas `serie`/`activo` agregadas por NEX-063/065. |
| Triggers existentes | `fe_punto_secuencias_inmutable_trg` (BEFORE UPDATE OR DELETE, `fe_secuencias_inmutable()`: empresa/punto/tipo inmutables, `ultimo_numero` nunca retrocede, no se elimina salvo reinicio DEMO) y `fe_punto_secuencias_truncate_trg` (BEFORE TRUNCATE). No tiene `fe_punto_secuencias_actualizado_trg`. Estos triggers tienen otra finalidad: no prueban que haya que reemplazar el criterio de T01. |
| Escritores (UPDATE) | Todos fijan `actualizado_at = now()`: NEX-060:193 y :321; NEX-062:337 y :504; NEX-063:113 (`fe_secuencia_reservar`), :536 y :577; NEX-065:59 y :464. Grants: la aplicación solo tiene `SELECT` (caso `secuencias.casos.ts:65`). |
| ¿Es seguro otro trigger? | Sí, con condiciones. `actualizar_fecha()` solo cambia `NEW.actualizado_at`. Como los BEFORE se disparan en orden alfabético, `…_actualizado_trg` corre antes que `…_inmutable_trg`, que no valida `actualizado_at`, así que las reglas fiscales (no retroceder, identidad inmutable) quedan iguales. `now()` es la hora de inicio de la transacción, el mismo valor que ya escriben las funciones: el resultado no cambia. |
| Efecto sobre actualizaciones | Ninguno visible en los escritores actuales. Protege a un escritor futuro que olvide la columna. No toca `ultimo_numero`, `serie`, `activo`, documentos, CDC ni numeración. |
| Locks | En ejecución: trigger de fila sin locks extra. **Al instalarlo:** `CREATE TRIGGER` toma `SHARE ROW EXCLUSIVE` sobre la tabla, que entra en conflicto con el `ROW EXCLUSIVE` de `UPDATE` (reserva de número en `fe_secuencia_reservar`). Espera a las emisiones en curso y bloquea las nuevas hasta el COMMIT de la migración. Hace falta una ventana sin emisión y `lock_timeout` corto: la tabla está en el camino crítico de FE/NCE. |
| Reversión | `DROP TRIGGER fe_punto_secuencias_actualizado_trg ON public.fe_punto_secuencias`, solo si lo creó la migración (la migration debe abortar si el trigger ya existe, como NEX-055, para que la reversión nunca borre uno preexistente). Sin cambios de datos que deshacer. |

### 3.2 `movimientos_intenciones` (NEX-066, inventario / idempotencia K1)

| Aspecto | Hallazgo |
|---|---|
| Migración creadora | `NEX-066-movimientos-intenciones.sql:34–58`. |
| Triggers existentes | Ninguno. La integridad está en CHECKs (`estado`, `resultado`, `resuelta`, `reconocida`), en la UNIQUE `(empresa_id, clave)` y en el índice único parcial `movimientos_intenciones_pendiente_uk`. |
| Escritores (UPDATE) | Solo funciones SECURITY DEFINER, y todas fijan `actualizado_at = now()`: confirmar (:178–179), reconocer (:212) y rechazar (:236–237). `REVOKE ALL … FROM PUBLIC`; la aplicación no accede a la tabla. |
| ¿Es seguro otro trigger? | Sí. No hay disparadores de inmutabilidad con los que interactuar. `actualizado_at` no forma parte de ningún CHECK ni índice, así que el trigger no afecta la unicidad K1 ni la regla de una sola intención pendiente por usuario. |
| Efecto sobre actualizaciones | Ninguno en los escritores actuales (mismo `now()` de la transacción). |
| Locks | `CREATE TRIGGER` (`SHARE ROW EXCLUSIVE`) espera a las transacciones de registro de movimientos en curso (`tomar` usa `FOR UPDATE`, que toma `ROW SHARE`; ese lock no entra en conflicto, pero confirmar/rechazar sí). Hace falta ventana breve con `lock_timeout`. |
| Reversión | `DROP TRIGGER movimientos_intenciones_actualizado_trg` con la misma condición de no preexistencia. |

### 3.3 `compras_entradas_intenciones` (NEX-075, Compras → Entradas)

| Aspecto | Hallazgo |
|---|---|
| Migración creadora | `NEX-075-compras-entradas.sql:88–112`. Por documentación NEX-075 sigue **versionada y no aplicada** en la VM, así que el impacto en producción hoy es nulo. |
| Triggers existentes | Ninguno en esta tabla (el disparador de inmutabilidad `compras_entradas_inmutable_trg` pertenece a `compras_entradas`, que no tiene `actualizado_at`). |
| Escritores (UPDATE) | Funciones SECURITY DEFINER, todas con `actualizado_at = now()`: confirmar (:409–410), rechazar (:426–427) y reconocer (:461). `REVOKE ALL … FROM PUBLIC`. |
| ¿Es seguro otro trigger? | Sí, por las mismas razones que en 3.2. |
| Efecto / locks / reversión | Igual que 3.2. Si NEX-075 aún no está aplicada, la solución mínima es que la migration incremental lo instale tras comprobar que la tabla existe (y aborte si no existe), sin editar NEX-075 (no se tocan migraciones históricas ni checksums). |

## 4. Propuesta segura (NO implementada; requiere autorización separada)

1. **Una migration incremental nueva** con el número libre siguiente al aplicar (hoy NEX-082 parece libre en `migraciones/`; solo se menciona en el diseño cancelado de PRO-309/310; hay que reconfirmarlo), siguiendo literalmente el patrón de NEX-055:
   - Precondiciones: existen las tres tablas y `public.actualizar_fecha()`. Si alguna tabla falta (por ejemplo NEX-075 no aplicada), **abortar** en lugar de instalar en parte. La alternativa, instalar solo en las existentes, la decide el responsable.
   - Si alguna ya tiene `<tabla>_actualizado_trg`, **abortar** (no se reaplica por suposición).
   - Instalar exactamente `CREATE TRIGGER <tabla>_actualizado_trg BEFORE UPDATE ON public.<tabla> FOR EACH ROW EXECUTE FUNCTION public.actualizar_fecha()` en las tres tablas, sin recorrer el esquema y sin `nex_instalar_triggers_actualizacion()` (alcance no controlado).
   - No modifica datos ni grants. NOTICE final si alguna otra tabla sigue sin el trigger, como en NEX-055.
2. **Reversión exacta** (`scripts/reversion-NEX-0xx.sql`): `DROP TRIGGER` de esos tres nombres, sin tocar datos.
3. **Preflight y verificación** (solo lectura): confirmar la existencia de las tablas, que no haya triggers preexistentes, el estado de `schema_migrations` y que no haya emisión en curso. Después, comprobar los tres triggers y repetir T01.
4. **Implantación:** ventana sin emisión FE/NCE ni registro de movimientos o entradas, `SET lock_timeout` corto, backup previo, ejecución por el runner (transacción única) y solo con autorización expresa del responsable.
5. **Casos escritos asociados** (cuando se autorice): presencia del trigger por nombre; que un UPDATE de `ultimo_numero` siga rechazando el retroceso (inmutabilidad intacta) y actualice `actualizado_at`; que la UNIQUE K1 y el índice pendiente de las intenciones sigan iguales; y la reversión.

**Alternativas descartadas:** agregar excepciones a T01 (prohibido: sería un falso PASS); editar NEX-060/066/075 (migraciones históricas con checksum); instalar los triggers desde el código de la aplicación (el rol runtime no tiene privilegios y no es su responsabilidad).

## 5. Estado y bloqueos

- **T01: FAIL esperado y bloqueante** en el CI automático hasta que exista una migration autorizada y aplicada en el banco de pruebas del CI.
- Pendiente del responsable: autorizar (o no) la migration incremental de §4, su número y la política si NEX-075 no está aplicada en algún entorno.
- No se requiere ningún cambio de código de la aplicación.
