# AUD-NEX063-R01 — Puntos por tipo, series SIFEN y reversión segura

**Fecha:** 2026-10-17. **Auditor:** ChatGPT (auditoría independiente estática).
**Repository / branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`.
**SHA de código auditado:** `e98641bfa3a37c3474c49b2869b1cc96187c0667` ([commit](https://github.com/proceit-tech/distribuidora/commit/e98641bfa3a37c3474c49b2869b1cc96187c0667)). **Base funcional/documental:** `8d67c054e0d06e88dc91024637fe8345b4665c94`.
**Normas vinculantes:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `documentacao/v1/DECISAO-PUNTOS-TIPOS-SERIES-2026-10-17.md` y RN-16 actualizada.
**Veredicto:** **CORRECCIÓN SOLICITADA: 2 ALTAS, 2 MEDIAS y 1 dependencia operacional no comprobada. NO AUTORIZAR NEX-063 NI DEPLOY.** Pruebas T27/T28 no ejecutadas en PostgreSQL; sin browser, VM, gateway o SIFEN.

## 1. Matriz de conformidad observada

| Criterio | Evidencia en el código | Estado |
|---|---|---|
| CA-PUN-01 — independencia empresa/est/punto/tipo | `fe_punto_secuencias` ya contiene clave (empresa,punto,tipo); NEX-063 conserva punto administrativo y permite FE/NCE/NRE independientes; `lib/facturacion/puntos.ts` | Conforme estático, sin DB real |
| CA-PUN-02 — sin serie 0000001..9999999 → AA→AB…ZZ, serialización | `fe_secuencia_siguiente` y `fe_secuencia_reservar` (NEX-063 líneas 47-115); `series.ts` | Conforme estático, T27/T28 **no ejecutados** |
| CA-PUN-03 — campo `dSerieNum` | `fe_documento_crear_fe/nce` (NEX-063 líneas 177-178, 420-421) agrega `"dSerieNum": null` cuando no hay serie; `documentos_electronicos.serie` registra NULL o AA | **Contrato JSON→XML no comprobado**; teste T27 usando `->>` IS NULL no verifica ausencia de clave |
| CA-PUN-04/05 — configuración por tipo, UX lista por tipo | Pantalla de puntos: tabla por tipo, serie, último/próximo, estado; alta de punto sin tipo seguida inmediatamente por diálogo de configuración | Conforme estático en estructura; **capturas visuales ANTES/DEPOIS y aceptación humana pendientes** |
| CA-PUN-06 — FE solo FE, NCE solo NCE | `lib/facturacion/emision.ts`, `lib/facturacion/nce.ts`, reserva SQL por `FE`/`NCE` | Conforme estático, NCE no ejercitada en test real SQL |
| CA-PUN-07 — migración y reversión seguras | NEX-063 incremental, `preflight`, `verificar`, `reversion` | **NO CONFORME** por R01-01/R01-02 |
| CA-PUN-08 — tipos futuros no emitibles | Catálogo FE/NCE/NRE/NDE/AFE, flujos implementados FE y NCE | Conforme estático |
| CA-PUN-09 — Nota de Crédito UX | Entrega posterior; MT-01/UI-01 y reversión R04-01 sin cambios de reglas | Fuera del alcance de esta entrega (no homologado) |
| CA-PUN-10 — tests focales | Claude informa `series.casos`, `puntos.casos`, `secuencias.casos`, `nce.casos` y otros 0 fallas, ESLint y TS limpios; no reproducidos por auditor | Solo evidencia declarada, sin ejecución PostgreSQL |

## 2. Hallazgos obligatorios

### NEX063-R01-01 — ALTA — SQL de reversión con delimitador inválido

**Archivo:** `documentacao/banco/nexit/v1/scripts/reversion-NEX-063.sql`, líneas **7-21**.

Se abre el bloque con `DO $` y termina con `END $$;`. PostgreSQL espera una apertura compatible (`DO $$` o etiqueta dollar-quoted consistente). Tal como está, la reversión falla por sintaxis antes de restaurar el esquema. **Corrección:** arreglar el delimitador y probar la reversión sobre una base **descartable** tras aplicar NEX-063, verificando restauración completa, integridad de datos/privilegios y reintentos; no ejecutar en la VM.

### NEX063-R01-02 — ALTA — Condición de carrera en reversión (TOCTOU)

**Archivo:** `reversion-NEX-063.sql`, líneas **7-23**.

La reversión consulta primero si existen series configuradas, documentos con serie o tipos inactivos (líneas 9-20) **sin bloqueo previo**; únicamente después, línea 23, hace `LOCK TABLE fe_punto_secuencias IN EXCLUSIVE MODE`. Entre el chequeo y el bloqueo puede entrar una emisión concurrente que reserve una serie nueva, con lo cual se retira la columna `serie` basándose en un estado anterior. **Corrección:** tomar los bloqueos transaccionales necesarios **ANTES** de las validaciones (incluidas tablas de documentos al nivel requerido), revalidar bajo lock, abortar sin cambios ante actividad incompatible. Test dirigido con dos sesiones y barreras de concurrencia: la reversión espera o aborta sin perder serie/número ni documentos.

### NEX063-R01-03 — MEDIA — La interfaz de selección de FE para NCE omite la serie de la factura original

**Archivos:** `lib/facturacion/nce.ts`, líneas **181, 241**; `lib/facturacion/shared.ts` línea **82**.

La lista/identificación de facturas para crear NCE y el campo `feNumero` de Documentos componen `establecimiento-punto-numero` **sin serie**. Después del rollover, pueden coexistir `001-001-0000001` y `001-001-AA-0000001`, que se presentan bajo el mismo rótulo; aunque el ID/CDC internos sean distintos, el operador no puede distinguirlos visualmente por su numeración. Otras pantallas ya utilizan `numeroDocumento` con serie. **Corrección:** conservar la serie de la FE original en la consulta/DTO y presentar formato fiscal inequívoco en búsqueda, selección y asociación de NCE, sin cambiar motivos, saldos, MT-01/UI-01 ni reglas del gateway. Test focal de dos facturas iguales salvo serie.

### NEX063-R01-04 — MEDIA — T27/T28 no demuestran consumo NCE por su flujo fiscal

**Archivos:** `documentacao/banco/nexit/v1/pruebas/T27-nex063-series-tipos.sql`, `T28-concurrencia-series.sh`.

T27 configura contadores NCE pero solo emite FE; T28 **actualiza directamente** el contador NCE en `fe_punto_secuencias` sin ejecutar `fe_documento_crear_nce`. Por tanto la supuesta independencia transaccional entre emisiones FE/NCE queda probada solo para la fila de secuencia, no para el camino completo NCE. **Corrección:** en banco descartable, añadir caso fiscal NCE válido referenciando FE APROBADA y CDC adecuado, comprobar reserva NCE sin alterar FE; añadir caso NCE inactiva/sin configurar y el límite/rollover NCE. Testar concurrencia para ambas especies cuando técnicamente viable, sin usar SQL de prueba en la base real. No reproducir datos del cliente.

## 3. Bloqueo operacional no atribuido como bug confirmado

**GATEWAY-SERIE-01:** NEX-063 escribe `dSerieNum:null` cuando no hay serie y `dSerieNum:"AA"` al avanzar. El Manual SIFEN trata `dSerieNum` como opcional en el **XML**, pero el gateway externo aún no tiene contrato confirmado de serialización `null` frente a omisión del campo en **JSON**, ni validación de rollover con serie. El test T27 `payload->>'dSerieNum' IS NULL` acepta **ambas** representaciones y no prueba XML. Antes de habilitar emisión en AA o declarar homologación, demostrar formato efectivamente aceptado por el gateway y el XML resultante, preservando seguridad/credenciales. No inventar qué formato acepta.

## 4. Aclaraciones y alcance de la reauditoría

- `e98641b` eliminó los cuatro archivos temporales `.tmp-063-head.sql`, `.tmp-063-tail.sql`, `.tmp-fx5.js`, `.tmp-gen063.js`. La comparación acumulada contra `8d67c05` ya no contiene esos archivos.
- NEX-063, T27 y T28 no fueron ejecutados por el auditor ni hay evidencia de PostgreSQL operacional. El auditor no accedió a VM/PostgreSQL/Docker/gateway/SIFEN. El efecto visual del diseño no puede homologarse por lectura de TSX/CSS.
- SQL previo NEX-060 y NEX-062 y funciones nuevas fueron inspeccionados estáticamente para la ruta de reserva; **no** se afirma prueba de integridad/concurrencia hasta ejecución en DB descartable y revisión de restricciones/índices efectivos.
- No modificar migrations anteriores ni desplegar por IA. El siguiente commit debe corregir exclusivamente hallazgos documentados, mantener NEX-063 sin aplicar, ejecutar solo tests dirigidos; publicar SHA y parar para AUD-NEX063-R02. El responsable conserva control de aplicación y homologación visual/operacional.
