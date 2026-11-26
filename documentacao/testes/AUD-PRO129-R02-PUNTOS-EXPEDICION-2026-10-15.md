# AUD-PRO129-R02 — reauditoría de identidad fiscal, concurrencia y grants (NEX-057)

**Fecha:** 2026-10-15. **Commit de implementación:** `8a2d51abaa433f4aaea1cd0b0ea21a7ec2b9200f`. **Branch oficial:** `feature/NEXIT-2026-001-banco-demo` (HEAD de la revisión idéntico). **Auditor:** ChatGPT, contraste independiente con código y CI. **Resultado:** **CORRECCIONES R01-01/R01-02 CONFORMES en el alcance de alta/activación, pero existe R02-01 ALTO pendiente; NO autorizar aplicar NEX-057 en la VM.**

## 1. Evidencia efectivamente comprobada

- Fuentes: `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, secciones pertinentes de `PROGRESSO-NEXIT-V1.md`, AUD-PRO129-R01, `NEX-002`, `NEX-047`, `NEX-048`, `NEX-052`, `NEX-057`, reversión de NEX-057, `puntos.ts`, `T19-nex057-puntos-expedicion.sql`, `T20-concurrencia-puntos.sh`, runner de pruebas y diff del SHA.
- **CI oficial realmente consultado**, [run 38744074271](https://github.com/proceit-tech/distribuidora/actions/runs/38744074271): `completed/success`. Logs del job `116452982967` confirman **57 migrations** aplicadas desde cero en PostgreSQL descartable, `T19` **62 verificaciones PASS**, `T20` **11 verificaciones PASS**, total **658 verificaciones PASS / 0 fallas**. Esta ejecución fue automática del repositorio, no la disparó el auditor. No se hicieron nuevas pruebas en VM/PG operativo/navegador/gateway.
- La aplicación operativa de NEX-057 **no fue confirmada**. La versión original de NEX-057 fue editada en el mismo fichero versionado por Claude; **si el responsable la aplicó antes**, la corrección debe convertirse en migration incremental (NEX-058 o siguiente libre), no se puede reaplicar ni aceptar checksum distinto.

## 2. Resultado de las correcciones solicitadas

**R01-01, conforme en alta/activación y concurrencia controlada:** `fe_punto_identidad_en_uso` cruza puntos y sucursales por `empresa_id + establecimiento_sifen + código`. `fe_punto_crear` rechaza la identidad presente en otra sucursal incluso si está inactiva; `fe_punto_activar` no permite que haya dos activos. `fe_punto_bloquear_identidad` usa advisory lock transaccional por identidad antes de verificar/inserir o bloquear la fila. `fe_puntos_expedicion_identidad_trg` impide inserción/activación directa con dos puntos activos y no afecta UPDATE de `ultimo_numero` ejecutado por la función de emisión. `T19/T20` ejecutados por CI evidencian manejo real de colisiones y altas/activaciones paralelas.

**R01-02, conforme:** helper `nex_aplicar_grants_facturacion_puntos` quita `SELECT` y el resto de privilegios directos sobre `fe_puntos_expedicion_log` al rol `nexit_runtime`, porque la bitácora no tiene RLS y no existe lector HTTP. La escritura de logs permanece restringida a las funciones autorizadas. T19 y runtime T06b pasaron en CI.

## 3. R02-01 — ALTO / nueva brecha reproducible por alteración de establecimiento de una sucursal

**Hecho verificable:** NEX-002 permite modificar `sucursales.establecimiento_sifen` y no establece unicidad por empresa. NEX-057 protege `INSERT/UPDATE OF activo,sucursal_id` en `fe_puntos_expedicion`, **pero NO el UPDATE de `sucursales.establecimiento_sifen`**. `fe_punto_identidad_en_uso` consulta dinámicamente `sucursales.establecimiento_sifen`; cambiarlo después del alta **altera la identidad fiscal de los puntos existentes sin bloquear ni reconciliar sus contadores**.

**Reproducción lógica, NO ejecutada:**
1. Empresa A, S1 establecimiento `001` y S2 establecimiento `002`.
2. En S1 activar punto `001`, `ultimo_numero=100`; en S2 activar punto `001`, `ultimo_numero=100`. Es un estado válido: identidades fiscales `001-001` y `002-001`.
3. Ejecutar `UPDATE sucursales SET establecimiento_sifen='001' WHERE empresa_id=A AND id=S2`. La base lo permite: **no se dispara el trigger de puntos**.
4. Ahora existen dos puntos activos con la misma identidad fiscal `001-001` y contadores independientes. La emisión desde S1 reserva `0000101`; desde S2 también intenta `0000101`; el UNIQUE de NEX-047 previene almacenar un duplicado pero S2 falla operacionalmente. Además, cambiar el establecimiento puede hacer que la identidad actual difiera de los documentos ya emitidos por esa sucursal.

**Criterio:** impedir la reasignación de `establecimiento_sifen` que convierta puntos ya configurados en identidades incompatibles, con protección SQL efectiva (preferible bloquear cambios una vez existan puntos y exigir proceso fiscal controlado para cambios). **No** imponer unicidad global sobre `sucursales.establecimiento_sifen` sin decisión de negocio; no tocar la función de emisión NEX-048, no reiniciar números ni borrar puntos. Evaluar cambio de valor a NULL, y restauraciones de la misma cadena; verificar que sucursales SIN puntos mantengan su funcionamiento. Añadir test dirigido T19 y documentación de error. Preservar migración incremental si NEX-057 ya fue aplicada. No declarar que el problema está solucionado con un aviso en pantalla o solo con un control en la API: el punto crítico es UPDATE de datos maestros en BD.

## 4. Pendencias operativas que NO invalidan el CI

- La verificación del último número emitido también por otros sistemas sigue siendo **confirmación humana**, no conciliación automática con el gateway; documentar y comprobar antes de activar cada punto.
- No ejecutar ni indicar aplicación de la **versión editada de NEX-057** en la VM sin consultar el historial real `schema_migrations`, su checksum y contar con backup y autorización humana.
- PRO-128 (rediseño visual) **no iniciada**. No hubo pruebas visuales de la pantalla de gestión en navegador ni envío real.

## 5. Nueva entrega esperada

**Un cambio localizado:** proteger `sucursales.establecimiento_sifen` para evitar que puntos existentes cambien de identidad fiscal indirectamente. Ampliar T19 con dos sucursales de distinta identidad que se vuelven iguales por UPDATE y verificar el rechazo, sin afectar lectura, permisos y tests de concurrencia existentes. Revisar trigger/locks sobre rutas afectadas y SQL de reversión. **Solamente tests básicos dirigidos por Claude, commit/push SHA completo, y parada para AUD-PRO129-R03. No iniciar PRO-128, VM/PG operativo ni envío fiscal real por la IA.**

**Veredicto:** las correcciones originales superan los tests SQL y la auditoría; **NEX-057 no aprobada todavía para desplegar** porque el cambio posterior de establecimiento puede recrear exactamente el conflicto de numeración que se pretende evitar.
