# AUD-PRO129-UX-R06 — NEX-065: cierre estático de los tres hallazgos R05

**Fecha:** 2026-10-17. **Auditor:** ChatGPT, inspección independiente de código GitHub (sin VM, PostgreSQL ni navegador).
**SHA auditado:** `9f918eae8e03252172c802dca1379b26cc9af304` ([commit](https://github.com/proceit-tech/distribuidora/commit/9f918eae8e03252172c802dca1379b26cc9af304)).
**Base de código:** `e21eef5aa3749466cdac76b47f4f7381ea97ad61`. La comparación base→SHA contiene dos commits de avance (uno corresponde a la AUD-R05) y los cambios funcionales están focalizados en NEX-065, su reversión/verificación y T29/T32/T33.
**Fuentes normativas consultadas:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, sección pertinente de `PROGRESSO-NEXIT-V1.md`, `documentacao/v1/DECISAO-PUNTOS-TIPOS-SERIES-2026-10-17.md`, `documentacao/testes/AUD-PRO129-PUNTOS-ESTADO-POR-TIPO-R04-2026-10-17.md` y `documentacao/testes/AUD-PRO129-PUNTOS-ESTADO-POR-TIPO-R05-2026-10-17.md`.

## Veredicto

**R05-01, R05-02 y R05-03 CERRADOS ESTÁTICAMENTE; AUD-PRO129-UX-R06 APROBADA EN REVISIÓN DE CÓDIGO DEL ALCANCE.** No se identificaron defectos bloqueantes nuevos en el diff focalizado. **NEX-065 no se aplicó y NO está homologada; este veredicto NO constituye autorización de despliegue/SQL.** La pantalla tampoco fue aceptada visualmente y el contrato `GATEWAY-SERIE-01` sigue pendiente.

## Matriz de corrección

| ID | Evidencia de código y comprobación | Resultado |
|---|---|---|
| R05-01 (ALTA), reaplicación de permisos | `NEX-065-facturacion-estado-por-tipo.sql`, nueva redefinición de `nex_aplicar_grants_facturacion_series()` (~líneas 481–502): conserva los REVOKE de PUBLIC, revoca `fe_punto_registrar` y `fe_punto_estado` a `nexit_runtime`, no vuelve a concederlas, mantiene grants de `fe_secuencia_configurar` y `fe_secuencia_estado`. Wrapper `nex_aplicar_grants_runtime` (NEX-052) ejecuta helpers alfabéticamente y es invocado por `aplicar-migraciones.sh` al concluir cada migration. `T32` llama el wrapper y comprueba los permisos negativos y positivos; `verificar-NEX-065.sql` comprueba la misma política. | **CERRADO ESTÁTICAMENTE**, permisos efectivos en PostgreSQL pendientes |
| R05-01, reversión del helper | `reversion-NEX-065.sql` (~líneas 497–519) restaura la versión NEX-063 de `nex_aplicar_grants_facturacion_series` y la ejecuta. **Comparación textual independiente: cuerpo de helper restaurado idéntico al helper versionado en NEX-063**, incluidos grants antiguos necesarios para ese modelo histórico. | **CERRADO ESTÁTICAMENTE**, reversión no ejecutada |
| R05-02 (ALTA), T33 | `T33-migracion-estado-por-tipo.sh` (~líneas 45–51): `fe_punto_registrar` deja P1 inactivo; activa explícitamente P2/P3/P4 con `fe_punto_estado(...,true)`; valida marca física `001=false,002=true,003=true,004=true` y ocho secuencias activas, deteniendo la preparación ante fallo. Luego inactiva solo NCE de P2 y FE de P4 para construir el estado mixto esperado. | **CERRADO ESTÁTICAMENTE**, T33 no ejecutado |
| R05-03 (ALTA), T29 | `T29-reversion-series.sh` (~líneas 40–55): el setup de las copias ya revertidas a NEX-063 activa expresamente el punto físico tras configurar FE/NCE y verifica `activo=true`, antes de los escenarios A/B/C. No modifica la NEX-065 ni la interfaz. | **CERRADO ESTÁTICAMENTE**, T29 no ejecutado |
| RN-PUN-06 / CA-11…16, independencia de activación | Sin modificación a la UI/API ni a las funciones de emisión FE/NCE en este diff; la versión anterior de NEX-065 conserva retiro del estado global y estados de secuencia por tipo. Unicidad por `COALESCE(serie,'')` conforme a SQL de NEX-047 y comprobación de NEX-065. | **Sin regresiones nuevas identificadas en el diff**, operación real pendiente |
| Política de pruebas 14/10 | Claude informa 28 verificaciones locales de `estado-tipo`, 0 fallas, ESLint focal y `bash -n` en T29/T33. Declara que NO ejecutó tsc global, build, ESLint global ni suite general. El auditor no tuvo acceso a los comandos/terminal de Claude; se verificó el protocolo vigente en Git. | **Conforme según reporte**, ejecución no reproducida por auditor |

## Límites expresos de la aprobación

1. Ni el auditor ni Claude ejecutaron NEX-065, T29, T32, T33 o T34 en PostgreSQL; el resultado real de las funciones, permisos, transacciones, migración/reversión y concurrencia **NO está demostrado**.
2. El SQL de NEX-065 y los scripts se versionaron, pero el repositorio no prueba qué migraciones están aplicadas en el único PostgreSQL operativo. El responsable debe verificar el estado real, efectuar backup, preflight, aplicar solo migraciones pendientes en orden y evaluar la verificación posterior **si y cuando autorice esa fase**. ChatGPT no ejecuta ni ordena una aplicación automática.
3. La homologación de pantalla requiere una captura real y prueba del operador: misma empresa + est.001 + punto001, FE y NCE con estados distintos; activar/desactivar cada tipo no toca la otra configuración, tampoco su serie/contador. La versión visual no se presume desplegada por existir el commit.
4. `GATEWAY-SERIE-01` sigue sin contrato confirmado para `dSerieNum: null` frente a omisión en JSON y XML, y uso de serie AA. No inferir homologación fiscal.
5. El control del protocolo de tests permanece obligatorio: solo pruebas básicas de la funcionalidad, sin `tsc` global, build o CI manual por defecto; no solicitar otra ronda sin defecto nuevo demostrado.

**Decisión de continuidad:** cerrar AUD-PRO129-UX-R06 por inspección estática; **no** mandar nueva corrección al Claude ahora. El responsable conserva el control de implementación/homologación, y las pruebas SQL dirigidas aún requieren ejecución autorizada sobre base descartable sin tocar la base operativa por parte de las IAs.
