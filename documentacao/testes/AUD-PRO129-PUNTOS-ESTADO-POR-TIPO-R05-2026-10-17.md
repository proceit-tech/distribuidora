# AUD-PRO129-UX-R05 — Estado por tipo NEX-065: auditoría de código, permisos y pruebas SQL

**Fecha:** 2026-10-17. **Auditor:** ChatGPT (inspección estática independiente con acceso de lectura al GitHub).
**SHA auditado:** `e21eef5aa3749466cdac76b47f4f7381ea97ad61` ([commit](https://github.com/proceit-tech/distribuidora/commit/e21eef5aa3749466cdac76b47f4f7381ea97ad61)).
**Base anterior:** `56f8d6bec3d5549242bb782902a509be262b9615`; un commit funcional con NEX-065, API/UI, documentación y T32/T33/T34.
**Normativa:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` (UX-R04-01), `documentacao/v1/DECISAO-PUNTOS-TIPOS-SERIES-2026-10-17.md` (RN-PUN-06; CA-11…CA-16) y `AUD-PRO129-PUNTOS-ESTADO-POR-TIPO-R04-2026-10-17.md`.
**Veredicto:** **CORRECCIÓN SOLICITADA: 1 ALTA de permisos y 2 ALTAS de confiabilidad de pruebas SQL; 1 incumplimiento de protocolo de tests. NEX-065 NO AUTORIZADA para aplicación.** Sin ejecución independiente PostgreSQL/VM/browser/gateway; T32/T33/T34 no ejecutados.

## 1. Matriz de requisitos y resultados estáticos

| RN/CA | Evidencia de código | Resultado |
|---|---|---|
| RN-PUN-06, CA-11/12 — estado exclusivo por tipo | `NEX-065` `fe_documento_crear_fe/nce` quita `AND activo` de `fe_puntos_expedicion`; `fe_secuencia_reservar` vigente valida `fe_punto_secuencias.activo`; `fe_punto_alta_tipo` ya no llama `fe_punto_estado`. | **CONFORME ESTÁTICO**, no hay ejecución real |
| CA-12 — preservar bloqueos heredados | NEX-065 bloquea tablas punto/secuencia en transacción y almacena `fe_estado_previo_nex065` antes de hacer `s.activo := false` solo cuando `p.activo=false AND s.activo=true`. | **CONFORME ESTÁTICO**; T33 **roto**, ver R05-02 |
| CA-13 — UX por tipo | Botón masivo retirado de `page.tsx`, estados/filtros por `t.activo`; acciones «Activar/Desactivar FE/NCE» y no emitibles permanecen solo configurables. | **CONFORME ESTÁTICO**, sin captura posterior/aceptación |
| CA-14 — API/funciones antiguas | `app/api/facturacion/puntos/[id]/estado/route.ts` borrada, stub SQL `fe_punto_estado` aborta, estado de FE/NCE usa solo secuencia y bloqueo `FOR KEY SHARE` en punto, `FOR UPDATE` en secuencia. | **PARCIAL — permisos revocados se reabren**, R05-01 |
| CA-15 — serie NULL y unicidad | NEX-047, línea 116: índice único `documentos_electronicos_numero_key` con `coalesce(serie, '')`; NEX-065 verifica definición en `pg_indexes`. | **CONFORME ESTÁTICO**, no probado contra DB operacional |
| CA-16 — pruebas/migración/reversión | T32 agregado; T33/T34 y cambios a T19/T21/T27…T30; scripts preflight/verify/reversion. | **NO CONFORME — T33 y T29**, R05-02/03 |
| Política de testes 14/10 | Claude declara explícitamente ejecución de `tsc` sobre **todo el proyecto** y 780 comprobaciones TS en nueve suites (la última no fue global suite). | **INCUMPLIMIENTO CONFIRMADO: prohibición expresa de `tsc` global**, ver OBS-R05-04 |

## 2. Hallazgos

### R05-01 — ALTA — Los grants retirados por NEX-065 se restituyen al final del runner de migraciones

**Evidencia y secuencia exacta:**
1. `NEX-065-facturacion-estado-por-tipo.sql`, líneas aprox. 479–520, crea `nex_aplicar_grants_facturacion_estado_tipo`, que revoca `fe_punto_estado`, `fe_punto_registrar` y funciones físicas heredadas a `nexit_runtime`. Reescribe `nex_aplicar_grants_facturacion_puntos` para revocar funciones físicas heredadas.
2. `NEX-052-productos-cambio-unidad-base-stock.sql`, líneas 146–157, define el wrapper `nex_aplicar_grants_runtime()`: ejecuta TODOS los helpers `nex_aplicar_grants_%` **ordenados alfabéticamente** con `ORDER BY p.proname`.
3. `NEX-063-facturacion-puntos-tipos-series.sql`, líneas 626–645, conserva `nex_aplicar_grants_facturacion_series()`, que hace **`GRANT EXECUTE`** sobre `fe_punto_registrar` y `fe_punto_estado` a `nexit_runtime`.
4. `documentacao/banco/nexit/v1/scripts/aplicar-migraciones.sh`, líneas 53–59, vuelve a llamar el wrapper `nex_aplicar_grants_runtime()` **después** de la migración. Orden: `..._estado_tipo` (revoca), `..._puntos` (no revoca registrar/estado), `..._series` (**reconcede**). Por tanto no quedan revocados como pretende NEX-065.
5. Resultado: `verificar-NEX-065.sql`, líneas 16–17, comprueba `NOT has_function_privilege('nexit_runtime', 'fe_punto_estado', 'EXECUTE')`, que falla. Aunque la nueva `fe_punto_estado` aborta por su contenido, `fe_punto_registrar` sigue permitiendo punto sin tipo si otro camino lo invoca.

**Corrección:** redefinir incrementalmente el helper heredado de series en **NEX-065** (sin editar NEX-063) para eliminar grants de funciones físicas retiradas y preservar los demás permisos FE/NCE. Garantizar el estado correcto **después de llamar realmente al wrapper global**, incluso al reaplicar grants por migración futura. Añadir prueba dirigida que ejecute helper completo y consulte `has_function_privilege` en rol runtime para todas las funciones físicas/registro eliminadas; verificar también que las funciones autorizadas `fe_punto_alta_tipo`, `fe_secuencia_configurar`, `fe_secuencia_estado` y FE/NCE emisión conservan EXECUTE. Ajustar reversión para restaurar exactamente el helper previo al rollback y con permisos seguros. No basta otro REVOKE aislado, que el helper antiguo volvería a anular.

### R05-02 — ALTA — T33 no prepara el estado físico de los puntos bajo la versión anterior

**Archivo:** `documentacao/banco/nexit/v1/pruebas/T33-migracion-estado-por-tipo.sh`, líneas aprox. 41–58.

**Evidencia:** la función `mkpunto` llama `fe_punto_registrar`, que por contrato NEX-063 **crea cada punto `activo=false`**. Configurar FE/NCE con `fe_secuencia_configurar(..., true, true)` activa solo cada SECUENCIA, no el punto. T33 crea P1…P4 y ejecuta `fe_punto_estado(P1, false)` aunque P1 **ya está inactivo**, por lo que NEX-063 devuelve `NEX:PUNTO_YA_INACTIVO`. Nunca activa P2/P3/P4, pese a esperar `002:FE=true, 003:FE/NCE=true, 004:NCE=true` en `EF_ANTES`. Tampoco prueba correctamente la transición de un estado efectivo mixto a NEX-065.

**Corrección:** en T33 (copia descartable anterior a NEX-065), crear deliberadamente P1 inactivo y **activar explícitamente P2/P3/P4** mediante la función física legado antes de registrar el estado inicial. Eliminar la desactivación redundante de P1. Afirmar precondiciones globales antes de emitir/aplicar la migración y abortar el test ante fallo de preparación. No relajar `fe_punto_estado` ni cambiar la migración para satisfacer el test. Documentar que T33 **no fue ejecutado**.

### R05-03 — ALTA — T29 revierte NEX-065/064 pero olvida activar el punto físico requerido por la emisión restaurada

**Archivo:** `documentacao/banco/nexit/v1/pruebas/T29-reversion-series.sh`, líneas aprox. 40–53 y escenarios A/B.

**Evidencia:** `crear_copia()` primero revierte NEX-065 y NEX-064 para probar reversión de NEX-063. Luego usa `fe_punto_registrar` (**crea punto inactivo**), configura FE y NCE `activo=true`, pero NO llama `fe_punto_estado(..., true)`. La versión SQL restaurada de NEX-063 todavía exige `fe_puntos_expedicion.activo` en `fe_documento_crear_fe`; por tanto A no puede emitir AA y mantener la transacción para demostrar bloqueo, B no puede emitir `0000011`. Los resultados T29 dejan de ser evidencia válida de reversión/continuidad.

**Corrección:** en el setup **exclusivamente** de las copias anteriores a NEX-065, activar explícitamente el punto físico mediante su función antigua `fe_punto_estado(..., true)` después de configurar FE/NCE, conservando todas las demás precondiciones y bloqueos. Probar que las fases A/B/C se preparan correctamente; no reintroducir activación física en NEX-065 actual ni en UI/API.

### OBS-R05-04 — INCUMPLIMIENTO OPERATIVO — TypeScript global ejecutado sin autorización

`CLAUDE.md` (sección política 14/10) y `documentacao/PROTOCOLO-IA.md` prohíben **`tsc` global** sin autorización expresa. La declaración de Claude `tsc sobre o projeto` contradice la instrucción vigente y el recordatorio del responsable durante la ejecución. Que haya pasado no elimina el incumplimiento. **No pedir volver a ejecutar los 780 casos, ni tsc global, build o suite integral**. Para correcciones R05 deben bastar pruebas TS focales estrictamente asociadas a helpers/grants y preparación T29/T33, lint de archivos afectados. Si no hay verificación TS aislada disponible, registrar esa limitación; no disparar global.

## 3. Riesgos y decisión

- **Aprobado solamente en estructura:** aislamiento FE/NCE por tipo, interfaz sin botón global, preservación `s.activo := s.activo AND p.activo` y unicidad fiscal con índice `COALESCE(serie, '')` fueron verificados en archivos.
- **No aprobado para aplicación:** permisos no duraderos (R05-01), tests críticos de migración/reversión no ejecutables correctamente según código (R05-02/03).
- **No fue probado**: ejecución de NEX-065, reversión, T27…T34 y pruebas SQL reales, gateway `dSerieNum` (GATEWAY-SERIE-01), navegador/homologación. No existe segundo entorno operacional real; el responsable único controla VM/PG. No autorizar deploy/SQL ni declarar HOMOLOGADO.
- **Alcance siguiente:** Claude corrige solo R05-01/02/03 en NEX-065 nueva **aún no aplicada**, helpers/grants y T33/T29 (y verificación/reversión si necesaria), sin tocar NEX-063/064 aplicadas o versionadas, sin modificar reglas comerciales FE/NCE ni interfaz; tests TS focales y análisis estático; commit/push y parada para R06. Migraciones/PG/VM, suite global y tsc global prohibidos. **Documentación AUD histórica inmutable.**
