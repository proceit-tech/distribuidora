# AUD-NEX063-R02 — Reauditoría puntos por tipo, series SIFEN y reversión

**Fecha:** 2026-10-17. **Auditor:** ChatGPT (revisión independiente estática).
**SHA auditado:** `163ae7529690091d1fc21ad47bd017d627f9eb3c` ([GitHub](https://github.com/proceit-tech/distribuidora/commit/163ae7529690091d1fc21ad47bd017d627f9eb3c)). **Base comparada:** `e98641bfa3a37c3474c49b2869b1cc96187c0667`; tres commits, sin `.tmp-fx6.js` presente al final.
**Fuentes:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` (sección NEX-063), `documentacao/v1/DECISAO-PUNTOS-TIPOS-SERIES-2026-10-17.md` y `AUD-NEX063-PUNTOS-SERIES-R01-2026-10-17.md`.

**Veredicto:** **CORRECCIÓN SOLICITADA: 1 ALTA nueva (R02-01)**. Los cuatro hallazgos de R01 se cierran **solo por inspección estática de los cambios**, sin afirmar que el SQL o las pruebas PostgreSQL funcionen. **NEX-063 NO autorizada para aplicación/deploy**. T27/T28/T29, reversión, gateway, SIFEN y navegador no ejecutados/verificados por el auditor.

## 1. Comprobación de hallazgos R01 y RN/CA

| ID / requisito | Código revisado | Estado |
|---|---|---|
| R01-01 — sintaxis de reversión | `scripts/reversion-NEX-063.sql`, líneas 7–31: `DO $$` … `END $$;` coherentes | **CERRADO ESTÁTICAMENTE**; T29 sin ejecutar |
| R01-02 — TOCTOU de reversión | Mismo archivo, líneas 14–17: `lock_timeout=60s` y bloqueos punto EXCLUSIVE → secuencia EXCLUSIVE → documentos SHARE **antes** de las comprobaciones, bajo la ejecución transaccional **obligatoria `psql -1`** | **CERRADO ESTÁTICAMENTE** bajo el procedimiento `-1`; prueba de concurrencia T29 aún no ejecutada. **Advertencia:** sin `-1` los bloqueos de `DO` no abarcan el resto del script; no ejecutar el archivo como comandos autocommit |
| R01-03 / CA-PUN-09 — número fiscal de FE con serie al crear NCE | `lib/facturacion/nce.ts`: detalle, lista/búsqueda y corrección; `lib/facturacion/shared.ts`: factura asociada visible. Identificación `001-001-0000001 (AA)` y búsqueda `AA-0000001` | **CERRADO ESTÁTICAMENTE**; sin browser/DB |
| R01-04 / CA-PUN-02/06 — NCE fiscal por secuencia independiente | `T27` invoca `fe_documento_crear_nce` con FE sintética APROBADA y CDC; cubre NCE sin serie, inactiva, sin configurar, AA, ZZ, idempotencia; `T28` fase 2 usa dos sesiones NCE y una FE | **CERRADO EN COBERTURA ESTÁTICA**; T27/T28 **no ejecutados** |
| CA-PUN-01/04/05/08 — tipos y UX | Sin cambios relevantes al modelo o la pantalla respecto de R01 | **PENDIENTE** de comprobación operacional y visual |
| CA-PUN-03 — JSON/ XML `dSerieNum` | JSON aún agrega `dSerieNum:null` si no hay serie; el manual trata el XML como opcional, gateway concreto no probado | **GATEWAY-SERIE-01 pendiente** |
| CA-PUN-07/10 — despliegue seguro/pruebas | T29 nuevo en runner, pero su entrada no es apta para el caso de reversión válida | **NO CONFORME — R02-01** |

## 2. Hallazgo nuevo

### NEX063-R02-01 — ALTA — El T29 copia una base que ya contiene series, invalidando el caso de reversión válida

**Evidencias exactas:**
- `documentacao/banco/nexit/v1/scripts/ejecutar-pruebas.sh`, líneas **69–71**: T27 en la base principal; líneas **102–107**: T28 y luego T29.
- `pruebas/T27-nex063-series-tipos.sql`, líneas **85–95**: avanza una secuencia FE a `ZZ-9999999`; líneas **184–193**: avanza la secuencia NCE a `AA` y a `ZZ-9999999`; esos cambios quedan persistidos al terminar el `DO`.
- `pruebas/T28-concurrencia-series.sh`, líneas **63–67** y **115–119**: también conserva FE/NCE en AA.
- `pruebas/T29-reversion-series.sh`, líneas **11, 23–25**: `ORIG="$PGDATABASE"` y `CREATE DATABASE ${ORIG}_t29... TEMPLATE $ORIG`. Cada copia incluye **todas** las secuencias fiscales/estados previamente persistidos, no solo la empresa que crea el propio T29.
- `T29`, líneas **63–72**: escenario **B** espera reversión exitosa en la copia; pero `scripts/reversion-NEX-063.sql`, líneas **22–29**, aborta si existe **cualquier** serie no nula o tipo inactivo en **cualquier empresa**. La presencia de series de T27/T28 garantiza el aborto. El caso A también arrastra estas series y puede abortar por contaminación en vez de la condición de carrera que pretende aislar.

**Impacto:** la batería fallará en el caso válido B y la evidencia sobre la reversión concurrente será ambigua. No demuestra que la reversión de producción sea defectuosa: demuestra que la **preparación del test es incompatible con sus precondiciones globales**. Esta es una falla comprobable por código, aunque los tests no se hayan ejecutado.

**Corrección limitada:** preparar para T29 un origen **limpio, descartable y aislado**, con NEX-063 y datos sintéticos mínimos, sin series no nulas ni tipos inactivos ni otros residuos de T27/T28. Puede hacerse tomando una plantilla preparada ANTES de que se ejecuten esos tests o creando su propia base limpia con migrations/semillas vigentes, sin tocar base operativa ni borrar registros de la batería principal. Validar explícitamente las precondiciones **globales** de A/B/C antes de cada prueba; para A inyectar solamente el rollover controlado; para C inyectar solamente el tipo inactivo controlado; B debe comprobar sintaxis, reversión de FE/NCE, integridad de documentos y continuidad de numeración sin residuos externos. No cambiar la política segura de aborto en el script de reversión.

**Prueba de regresión mínima:** preparar/inspeccionar por lógica pura el orden del runner y la preparación aislada del T29; si hay PostgreSQL descartable autorizado, ejecutar únicamente T29 contra base limpia con NEX-001…063, sin suite global. Si no lo hay, registrar como no ejecutado y no declarar reversión comprobada. No introducir scripts destructivos sobre la VM.

## 3. Aclaraciones de riesgo y límites

- El contrato JSON→XML `dSerieNum` (nulo versus ausente al no existir serie, y AA en rollover) **no está confirmado**. No reemplazar `null` por omisión a ciegas; requiere evidencia del gateway real y XML aceptado.
- La reversión actual exige `psql -v ON_ERROR_STOP=1 -1` (transacción única). En autocommit sus bloqueos no protegen todos los comandos; la instrucción operativa debe hacer esta condición inequívoca y jamás sugerir ejecutar `psql -f` sin `-1`.
- Las nuevas verificaciones textuales/TypeScript reportadas 0 fallas, ESLint y TS limpios **son declaración del Claude**, no ejecución independiente aquí. SQL NEX-063, T27, T28 y T29 siguen **no ejecutados** en PostgreSQL; ninguna homologación visual o fiscal fue realizada.
- Se confirmó que el archivo temporal `.tmp-fx6.js` fue eliminado antes de `163ae752`. No abrir un nuevo alcance por ese archivo.
- **Siguiente paso:** Claude corrige **solo** R02-01 y la evidencia/precondición de pruebas; commit/push, detiene y solicita AUD-NEX063-R03. No cambiar funciones fiscales, flujo NCE, MT-01/UI-01, NEX-063 ni desplegar. ChatGPT revisará el SHA. Responsable humano aplica/valida solamente después de la aprobación correspondiente.
