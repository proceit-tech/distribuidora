# Procedimiento de homologación — PRO-312-R03 / Lote B (evidencias R05 en el envío FE/NCE)

25/11/2026 · Documento de **planificación**. Nada de esto se ejecutó. Cada paso requiere autorización expresa del responsable; lo ejecuta solo el responsable en la VM existente. Ninguna IA accede a la VM, a la base ni al gateway.

[Orden](../ordens/ORD-CLAUDE-NEXIT-PRO-312-R03-LOTE-B-INSTRUMENTACION-R05-2026-11-25.md) · [Casos](../testes/CASOS-NEXIT-PRO-312-R03-LOTE-B-2026-11-25.md) · [Desactivación R05](PROCEDIMENTO-DESACTIVACION-COORDINADA-R05-2026-11-25.md).

## 1. Tipos de evidencia (no confundir)

| Tipo | Qué es | Qué NO es |
|---|---|---|
| Revisión estática | lectura del diff y de los contratos NEX-084/085 (Claude y auditoría ChatGPT) | ejecución |
| CI existente | GitHub Actions del push: casos R03B con base y gateway simulados, C1 (preparación de SQL contra NEX-001…085), tipos, lint, build | prueba del gateway, de SIFEN ni de NEX-084 real |
| Casos escritos | R03B-A01…J10 (en CI) y los 523 anteriores (base descartable, no en CI) | homologación |
| Evidencia real futura | resultados de los diagnósticos de solo lectura de este documento y de la ventana de homologación en la VM | algo que exista hoy |

## 2. Gates de activación (todos obligatorios, en orden)

La variable `NEXIT_E03_EVIDENCIAS` queda **sin definir** (apagada) hasta cumplir todos:

1. Auditoría ChatGPT del Lote B conforme.
2. VM con NEX-001…085 exactas y verificadores NEX-084/085 en 65/65 (ya acreditado; reconfirmar sin cambios).
3. Modo R05 `ACTIVO` y procedimiento de desactivación disponible (no ejecutarlo).
4. **D6-c** (§3) sin incompatibilidades, o decisión del responsable sobre las encontradas.
5. **D8-B** (§4) con el tamaño máximo observado y la decisión del responsable sobre el límite de 8 MiB.
6. Decisión del responsable sobre la desactivación operacional (quién y cómo vuelve a apagar).
7. Ventana de homologación autorizada: pocos documentos de prueba, en la cuenta del gateway de la propia empresa, con seguimiento de §5.

Si algún gate falla: **no se activa**. No hay activación parcial ni fallback silencioso: con la variable en `R05` y la base no preparada, la emisión responde 503 antes de numerar.

## 3. D6-c — compatibilidad del serializador (solo lectura)

**Riesgo.** La vía R05 transmite `JSON.stringify` del snapshot leído de `documento_electronico_solicitudes.payload` (jsonb) y NEX-084 exige `texto::jsonb` = snapshot (`NEX:CUERPO_NO_COINCIDE`). jsonb compara números por valor y no admite NUL ni sustitutos sueltos, así que la única diferencia posible es un número que JavaScript no representa exacto (más de 15–17 cifras significativas o entero mayor que 2^53). En ese caso el envío queda NO_TRANSMITIDO (`CUERPO_NO_COINCIDE`) e indeterminado: no se pierde el documento, pero no se transmite.

**Método seguro.** PostgreSQL ≥ 12 escribe `float8` con la representación más corta que vuelve al mismo valor (el mismo criterio que JavaScript). Si `v::numeric <> (v::text::float8)::numeric` para algún número del snapshot, JavaScript no lo reproduce. Solo agregados; parámetros; transacción READ ONLY.

```sql
-- D6-c: ejecutar SOLO con autorización, como operador, en la VM. No modifica nada.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';
PREPARE d6c(uuid, timestamptz) AS
  WITH nums AS (
    SELECT s.documento_id, n.v
    FROM public.documento_electronico_solicitudes s
    CROSS JOIN LATERAL jsonb_path_query(s.payload, 'strict $.**') AS n(v)
    WHERE s.empresa_id = $1 AND s.creado_at >= $2 AND jsonb_typeof(n.v) = 'number'
  )
  SELECT count(*)                                                       AS numeros,
         count(*) FILTER (WHERE (v::text)::numeric <> ((v::text)::float8)::numeric) AS no_representables,
         count(DISTINCT documento_id) FILTER (WHERE (v::text)::numeric <> ((v::text)::float8)::numeric) AS documentos_afectados
  FROM nums;
EXECUTE d6c('<empresa_id>', now() - interval '180 days');
ROLLBACK;
```

Notas: si la columna de fecha tiene otro nombre en la VM, ajustar solo el filtro de fecha, nunca el resto. `strict $.**` recorre todos los valores anidados. El resultado esperado para activar es `no_representables = 0`. Con valores > 0: no activar; informar el conteo (sin documentos ni valores) para decisión del responsable. No hay método seguro alternativo en la aplicación: si este diagnóstico no puede ejecutarse, **la activación queda detenida**.

## 4. D8-B — tamaño del texto HTTP (solo lectura)

**Regla implementada.** Hasta 1 MiB (1.048.576 bytes) → evidencia NEX-072; más de 1 MiB y hasta 8 MiB (8.388.608) → tabla de POST grandes de NEX-084; más de 8 MiB → NO_TRANSMITIDO `SOLICITUD_EXCEDE_LIMITE` **antes de autenticar y del fetch**. No se trunca ni se quitan ítems; el límite de 999 ítems no cambia.

**Análisis estático del máximo posible.** El tamaño depende de 999 ítems como máximo y de los textos libres de cada ítem (descripción, información adicional) y del encabezado. La aplicación no fija un tope de bytes por ítem más allá de los límites de cada campo. El único tope de base es `pg_column_size(payload) < 262144` (NEX-048), que mide el almacenamiento jsonb (con compresión TOAST) y **no** acota el texto serializado. Por eso el máximo teórico no se puede acotar con certeza sin los largos reales de esos campos en la VM. Estimación de orden de magnitud: con ~1 KiB por ítem, 999 ítems ≈ 1 MiB (franja de POST grande); superar 8 MiB exigiría ~8 KiB por ítem, improbable pero no imposible con descripciones muy largas. **No hay medición real**: ninguna cifra de este documento es observada.

**Diagnóstico (solo lectura).** `octet_length(payload::text)` es una cota superior de los bytes de `JSON.stringify` (jsonb agrega un espacio tras `:` y `,`; los números en JavaScript nunca son más largos que el texto jsonb, salvo exponentes, que no aparecen en montos SIFEN).

```sql
-- D8-B: ejecutar SOLO con autorización. No modifica nada.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';
PREPARE d8b(uuid, timestamptz) AS
  SELECT count(*)                                                     AS solicitudes,
         max(octet_length(payload::text))                             AS max_bytes_cota,
         percentile_disc(0.99) WITHIN GROUP (ORDER BY octet_length(payload::text)) AS p99_bytes_cota,
         count(*) FILTER (WHERE octet_length(payload::text) > 1048576)  AS mayores_1mib,
         count(*) FILTER (WHERE octet_length(payload::text) > 8388608)  AS mayores_8mib,
         max(jsonb_array_length(CASE WHEN jsonb_typeof(payload -> 'Detalles') = 'array' THEN payload -> 'Detalles' END)) AS max_items
  FROM public.documento_electronico_solicitudes
  WHERE empresa_id = $1 AND creado_at >= $2;
EXECUTE d8b('<empresa_id>', now() - interval '180 days');
ROLLBACK;
```

Los ítems del snapshot FE/NCE están en `Detalles` (`payload-fe.ts`); si un snapshot histórico usa otra clave, `max_items` sale nulo para él: informarlo, no inventar. Con `mayores_8mib > 0`: no activar sin decisión del responsable.

## 5. Ventana de homologación (futura)

Solo con los gates 1–6 cumplidos y autorización expresa:

1. Definir `NEXIT_E03_EVIDENCIAS=R05` en el entorno del servidor y reiniciar según el procedimiento de actualización de la VM.
2. Emitir pocos documentos de prueba (FE y, si corresponde, NCE) en la cuenta propia del gateway.
3. Comprobar con lecturas R05 (`fe_e03_estado_operacion_r05`) por documento: una operación, autenticación registrada, POST 1 (y POST 2 solo tras token inválido), salida con P o motivo, cierre.
4. Comprobar que las consultas posteriores usan la misma cuenta (sin 409 inesperados) y que el KuDE sigue igual.
5. Ante cualquier anomalía: quitar la variable (apaga la vía R05 para nuevos envíos sin tocar la base). Desactivar R05 en la base solo con el procedimiento de desactivación y una orden propia.

Un ACK del gateway (ENVIADO) **no** es aprobación SIFEN: el estado fiscal sigue llegando solo por la consulta.

## 6. Lo que no cubre

Sin nueva base de pruebas, sin NEX-086, sin cambios a NEX-001…085, sin activar la bandera, sin desactivar ni reactivar R05, sin Lote C.
