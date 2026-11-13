# AUD-NEX063-R03 — Verificación estática de la corrección R02-01

**Fecha:** 2026-10-17. **Auditor:** ChatGPT, inspección del código del repositorio conectado, sin ejecutar PostgreSQL ni navegador.
**SHA auditado:** `ef5ae54e83dde3822be4543ad2f351a7e710b10b` ([commit](https://github.com/proceit-tech/distribuidora/commit/ef5ae54e83dde3822be4543ad2f351a7e710b10b)).
**Base comparada:** `163ae7529690091d1fc21ad47bd017d627f9eb3c`, comparación de dos commits.
**Referencias:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` (NEX-063/R02), `documentacao/v1/DECISAO-PUNTOS-TIPOS-SERIES-2026-10-17.md`, `documentacao/testes/AUD-NEX063-PUNTOS-SERIES-R01-2026-10-17.md`, `documentacao/testes/AUD-NEX063-PUNTOS-SERIES-R02-2026-10-17.md`.

## Veredicto

**R02-01 CERRADO ESTÁTICAMENTE, SIN NUEVOS DEFECTOS CONFIRMADOS EN EL DIFF.** El aislamiento de T29 ya no depende del contenido de T27/T28, y el procedimiento de recuperación prescribe `psql -v ON_ERROR_STOP=1 -1`. Esto **NO** prueba el funcionamiento de las migraciones, las transacciones/reversiones reales ni la serialización bajo sesiones PostgreSQL: **NEX-063 sigue NO APLICADA, NO HOMOLOGADA, y SIN AUTORIZACIÓN de despliegue**. La aprobación estática de R03 no es aprobación operacional.

## Matriz de verificación

| ID | Evidencia directa | Resultado |
|---|---|---|
| R02-01 / aislamiento global | `T29-reversion-series.sh` líneas 15–17 y 26–30: crea `${ORIG}_t29base` propia mediante `CREATE DATABASE`, `aplicar-migraciones.sh` y S-001; escenarios usan `CREATE DATABASE … TEMPLATE $BASE`, no `TEMPLATE $ORIG` | **CONFORME ESTÁTICO** |
| Precondiciones de cada prueba | `T29` líneas 33–38, 53–56, 82–84, 94–98: chequea globalmente series configuradas, tipos inactivos y documentos con serie en base limpia y copias A/B/C antes de alterar; en A solo fuerza FE 9999999, B no inyecta configuración anormal, C desactiva intencionalmente NCE y comprueba que sea la única desactivada | **CONFORME ESTÁTICO**; ver limitación de prueba |
| Seguridad contra DB operacional | `T29` líneas 15–18: exige prefijo `nexit_test_*`; runner de migraciones comprueba patrón estricto `^nexit_test_[0-9]+(_[a-z0-9]+)?$` si está habilitado el bootstrap NEX-019; cleanup solo nombres derivados `_t29a/b/c/base` | **CONFORME ESTÁTICO** para batería descartable, no ejecutar en VM |
| Bootstrap de migraciones desde cero | `ejecutar-pruebas.sh` líneas 16–19 exporta `NEX_BOOTSTRAP_ANTES_DE_019` y `PGOPTIONS`, y en línea 34 crea base `nexit_test_<pid>`; `aplicar-migraciones.sh` líneas 22–29 y 45–48 usa bootstrap sintético en NEX-019 solo para base descartable compatible. El sufijo `_t29base` cumple el patrón | **CONFORME ESTÁTICO**; no se ejecutó |
| R01-01/R01-02 (reversión) | `reversion-NEX-063.sql` sigue con `DO $$` y bloqueos punto → secuencias → documentos antes de la revalidación; `T29` A retiene emisión FE y prueba aborto por serie, B prueba aplicación válida y continuidad, C prueba aborto por tipo desactivado | **Sin regresiones en el diff**; **SIN ejecución SQL** |
| R01-03 (serie FE original en NCE) | `lib/facturacion/nce.ts`, `lib/facturacion/shared.ts` no fueron modificados en estos dos commits | **Sin regresión en el diff**; previamente cerrado estáticamente |
| R01-04 (cobertura NCE fiscal) | T27/T28 no fueron modificados; siguen preparados para ejercer `fe_documento_crear_nce` | **Sin regresión en el diff**; pruebas sin ejecución |
| Contrato `dSerieNum` | Mantenido `null` en JSON sin serie; desconocido si gateway exige ausencia o acepta `null`; XML/SIFEN aún no comprobados | **GATEWAY-SERIE-01 PENDIENTE** |
| Visual | Pantallas sin cambios en estos commits; sin capturas aceptadas por humano | **NO HOMOLOGADO** |

## Limitaciones comprobadas, no nuevos defectos bloqueantes

1. El T29 tiene condiciones y expectativas en el archivo, pero **no está demostrado en PostgreSQL** que aplique correctamente NEX-001…063, ni que la reversión válida B compile/complete y restaure funciones/privilegios, ni que A/C aborten sin cambios.
2. `precondicion_global` usa `chk` para registrar una falla, pero no interrumpe inmediatamente el escenario; aun así, el script acumula FALLAS y devuelve exit code 1. Si hay futuros ajustes de test, se puede endurecer a `return 1` antes de las inyecciones (mejora preventiva, **no nueva autorización de código ni hallazgo de alto impacto en este SHA**, ya que solo opera en bases descartables).
3. La validez de `dSerieNum` no puede inferirse del simple payload guardado. No convertir `null` a ausencia por conjetura ni afirmar interoperabilidad XML.
4. Reporte Claude: pruebas focales `series.casos`, `puntos.casos`, `secuencias.casos`, `nce.casos` y ESLint sin fallas, **no reproducidas por auditor**. **T27, T28, T29, NEX-063, gateway, SIFEN y browser NO ejecutados**. La única plataforma operacional real es la VM controlada por el responsable; no se presupone entorno adicional.

## Decisión de continuidad

- **Cerrar la R03 por conformidad estática del alcance R02-01**. No enviar al Claude otra ronda de correcciones sin defecto adicional demostrado.
- **No autorizar aplicación de NEX-063 ni deploy con solo esta evidencia.** La decisión de ejecución/validación de los scripts en el único ambiente real es exclusivamente del responsable, mediante procedimiento vigente, preflight y recuperación revisados. El resultado en la VM se deberá evaluar cuando el responsable lo aporte.
- **Etapa 2 (UX Nota de crédito)** aún no iniciada, solo a pedido/orden expresa. **Homologación visual de Puntos de expedición pendiente**.
- Al continuar, priorizar la confirmación verificable del contrato `dSerieNum` con el gateway; mantener explícita esta dependencia sin pedir datos ya versionados.
