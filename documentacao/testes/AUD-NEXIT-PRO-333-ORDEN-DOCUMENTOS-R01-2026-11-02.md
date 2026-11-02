# AUDITORÍA INDEPENDIENTE — PRO-333-R01 / Orden numérico de documentos

**Fecha:** 02/11/2026
**SHA funcional auditado:** [5605b7e643a6b769006acb15b1626e3800e5e56d](https://github.com/proceit-tech/distribuidora/commit/5605b7e643a6b769006acb15b1626e3800e5e56d)
**Linear:** [PRO-333](https://linear.app/proceit/issue/PRO-333) · **GitHub:** [#14](https://github.com/proceit-tech/distribuidora/issues/14)
**Método:** revisión estática del diff y de fuentes actuales de TypeScript, SQL versionado NEX-047, UI y runner; **cero ejecución** de tests, código, lint, typecheck, build, SQL, PostgreSQL, VM, navegador o deploy.
**VEREDICTO:** **CONFORME ESTÁTICAMENTE R01.** No se justifica R02 con los hallazgos actuales. **Se autoriza SOLO el desarrollo PRO-334**; PRO-333 NO está homologada funcionalmente.

## 1. Alcance comprobado

El commit modifica **3 archivos**:
1. `lib/facturacion/shared.ts` — generador del `ORDER BY` numérico;
2. `lib/facturacion/orden-documentos.casos.ts` — **24 casos PRO333-01..24 escritos**, nuevo;
3. `scripts/casos-clientes/run.js` — registro de la suite anterior en runner compartido.

**Ninguno de los 24 casos fue ejecutado**, ni suites anteriores. Registrar en runner no significa que se hayan integrado mediante prueba de ejecución.

## 2. Conformidad funcional estática

- `shared.ts:45–65` crea `ORDEN_NUMERO` con **número** como primer criterio ordenable, antes de establecimiento/punto: separa texto numérico del no numérico, compara longitud después de quitar ceros iniciales y, a igualdad de longitud, compara dígitos con `COLLATE "C"`. No hay `CAST` a integer/bigint y no se reescribe `d.numero`. Esa secuencia implementa el orden numérico para cadenas de dígitos de cualquier longitud, inclusive cero y ceros iniciales.
- `shared.ts:59–65,168–181`: `ORDEN.numero` usa la dirección ASC/DESC del control; luego desempata de forma determinística por texto original, establecimiento, punto, serie, tipo, fecha e ID descendente. La dirección se origina en valores normalizados, nunca en texto SQL arbitrario del usuario.
- NEX-047 define `documentos_electronicos.numero text NOT NULL CHECK (numero ~ '^[0-9]{7}$')`: el formato vigente permite siete dígitos; la lógica tolera registros antiguos o variantes textuales sin hacer casts. El identificador mostrado `001-003-0009015` conserva ceros. Los documentos alfanuméricos no son válidos bajo el CHECK actual; su manejo defensivo no cambia esa restricción.
- `shared.ts::construirConsultas` genera un `ORDER BY` **antes de LIMIT/OFFSET** para toda la lista filtrada; el `COUNT` no se altera. Se conservan `ALCANCE` (empresa + `sucursal_en_alcance`), filtros por tipo/sucursal/estado/fecha/texto, paginación y el orden por `fecha_emision DESC, id DESC` cuando el usuario no selecciona columna.
- `app/(private)/documentos/page.tsx` conserva `ThOrdenable titulo="Documento" campo="numero"` y envía `orden`/`dir` a `/api/documentos`; la API mantiene normalización en servidor. No se implementó un sort de la página en React. Los filtros, FE/NCE, CDC, historial, KuDE y presentación PRO-338 no cambiaron en este commit.
- Las comparaciones de los casos escritos cubren ASC/DESC, ejemplo del cliente 90015/90014/90006/90005/90004, ceros, empate numérico por texto, múltiples establecimientos/series/tipos, paginación de 45 documentos, valores no numéricos defensivos, filtros/ACL y ciclo de columna. Son modelos de código, **no pruebas reales de PostgreSQL**.

## 3. Límites y riesgos pendientes de homologación

1. **No se ejecutó SQL ni se comprobó resultado de PostgreSQL real.** Los 24 casos son modelos/aserciones de fuente; no prueban planes de ejecución, rendimiento del sort por expresiones, collation bajo PostgreSQL ni integración real.
2. El orden expresivo `length(ltrim(d.numero,'0'))` / `ltrim(d.numero,'0') COLLATE "C"` puede exigir sort sobre el conjunto filtrado, sin aprovechar índice de orden simple. No se autoriza añadir índice ni migration por presunción; medir en homologación cuando exista autorización.
3. Probar visualmente en navegador: sin columna seleccionada (fecha descendente), primer clic ASC, segundo DESC, tercero reset, datos de múltiples sucursales/tipos, filtros y paginación 20/20/5, números con ceros. Probar también tabla con lateral y pantalla pequeña. Sin esta verificación **NO se puede afirmar que ya funciona en CASA MINGO**.
4. No se autorizaron tests, build, SQL, VM, gateway real, migrations ni deploy. **PRO-333 permanece In Review, NO Done/homologada** hasta esa validación operativa.

## 4. Decisión de secuencia

**PRO-333-R01: CONFORME EN CÓDIGO.** Sin R02 adicional por hallazgo estático demostrado. Claude puede empezar **EXCLUSIVAMENTE PRO-334** ([Linear](https://linear.app/proceit/issue/PRO-334), [GitHub #15](https://github.com/proceit-tech/distribuidora/issues/15)), siguiendo la [orden maestra CASA MINGO 02/11, ETAPA 3](../ordens/ORD-CLAUDE-NEXIT-CASA-MINGO-FACTURA-DOCUMENTOS-2026-11-02.md).

PRO-334 debe: diferenciar FE con azul suave y NCE con amarillo claro **por tipo**, conservar en separado badges fiscales verde/rojo/amarillo/gris y alerta técnica CDC_DIVERGENTE, cubrir expandido/hover/foco/contraste/responsive, no cambiar consulta automática, estado fiscal, SQL/orden numérico, KuDE ni emisión. Leer archivo completo y más reciente **uno por vez**, cambios mínimos TSX/CSS local y casos fuente **sin ejecutarlos**; commit+push SHA completo y **PARAR para auditoría independiente ChatGPT PRO-334-R01**. **No iniciar PRO-339** hasta nueva autorización, ni realizar tests/SQL/VM/browser/deploy. PRO-298/336 siguen sujetas a proveedor/operador; PRO-338 mantiene gates de NEX-077.
