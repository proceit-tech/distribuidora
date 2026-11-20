# AUD-PRO129-R01 — gestión fiscal de puntos de expedición (NEX-057)

**Fecha:** 2026-10-15. **Commit auditado:** `5c8c1d00c32a884f6c004bd39439ae4a6387bfad`. **Branch:** `feature/NEXIT-2026-001-banco-demo`. **Auditor:** ChatGPT, revisión estática independiente. **Resultado:** **NO CONFORME / BLOQUEO de aplicación de NEX-057**, hasta corregir R01-01. **Estado:** migration y T19 solo versionados; no se ejecutaron por esta auditoría en PostgreSQL, VM, Docker, navegador ni gateway.

## Contrato y evidencia revisados

`CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progreso pertinente en `PROGRESSO-NEXIT-V1.md`, especificación `AUD-FE-UX-OPERACION-PUNTOS-UNIDADES-IVA-2026-10-15.md`, diff/commit, `NEX-002-seguridad.sql`, `NEX-047-facturacion-documentos-electronicos.sql`, `NEX-048-facturacion-emision-fe.sql`, `NEX-052-productos-cambio-unidad-base-stock.sql`, migration y reversión NEX-057, T19, `puntos.ts`, rutas GET/POST/activar/desactivar, guard de página, pantalla, menú y enlace en nueva factura. No se infiere que pruebas estructurales locales hayan ejecutado SQL. El CI automático asociado al SHA estaba `in_progress` en la consulta inicial: no se registra como aprobado.

## Conforme por inspección

- Sin alta automática de puntos; `fe_punto_crear` exige número inicial informado explícitamente (cero solo si confirmado) y crea INACTIVO; activación posterior exige nueva confirmación. Identidad existente inmutable, `ultimo_numero` monotónico y la asignación del próximo número siguen a cargo de `fe_documento_crear_fe` bajo bloqueo de fila NEX-048.
- Permiso `FACTURACION_ELECTRONICA.PUNTOS` verificado en capa HTTP y dentro de las tres funciones `SECURITY DEFINER` con `search_path` fijo; acciones limitadas por empresa, usuario y `sucursal_en_alcance`. Bitácora de alta, activación y desactivación con FK `empresa_id` y triggers de no modificación.
- La pantalla y el menú usan ruta `/facturacion/puntos`, la nueva factura muestra enlace contextual solo a usuarios autorizados, y el catálogo normal de factura continúa listando únicamente puntos activos.
- NEX-057 tiene reversión y T19 registrado en runner; no modifica migrations NEX-001..056.

## Hallazgo R01-01 — ALTO / BLOQUEANTE: duplicación lógica de punto fiscal entre sucursales

**Hecho:** `NEX-002-seguridad.sql` define `sucursales.establecimiento_sifen` sin unicidad por empresa; dos sucursales de la misma empresa **pueden tener el mismo establecimiento**. `NEX-048` exige `UNIQUE(empresa_id,sucursal_id,codigo)` en `fe_puntos_expedicion` y maneja `ultimo_numero` por fila/punto. La NEX-057 `fe_punto_crear` revisa únicamente el máximo ya emitido en `documentos_electronicos` para empresa+establecimiento+código, pero **no comprueba la existencia de otro punto de expedición del mismo establecimiento y código asociado a otra sucursal**. `fe_punto_activar` tampoco bloquea dos puntos activos de esa misma identidad fiscal.

**Reproducción lógica sobre el esquema actual (no ejecutada):**

1. Empresa A: sucursales S1 y S2 con `establecimiento_sifen='001'` (permitido por NEX-002).
2. Alta en S1 y S2 de sendos puntos `codigo='001'`, ambos con último número confirmado 100, sin documentos previos. Ambos pasan `UNIQUE(empresa,sucursal,codigo)`, la consulta del máximo documental retorna 0 y ambos pueden activarse.
3. Primera FE desde S1 reserva `001-001-0000101`. Primera FE desde S2 intenta reservar el **mismo número** porque su contador es independiente.
4. El índice `documentos_electronicos_numero_key` de NEX-047 evita almacenar el duplicado, pero el intento de emisión de S2 **falla en la transacción**. La integridad final del documento queda protegida; **la configuración fiscal inválida y la indisponibilidad operacional NO están prevenidas**. Reintentos desde S2 siguen chocando hasta conciliación manual.

**Criterio de corrección:** proteger por **identidad fiscal** `(empresa_id, establecimiento_sifen, codigo_punto)`, no solo por sucursal. Rechazar alta o activación que contradiga ese alcance (incluyendo legado inactivo/activo y casos de reasignación de establecimiento), con error específico y sin modificar numeración. Proteger contra concurrencia real de dos altas/activaciones para la misma identidad (bloqueo transaccional/advisory o mecanismo SQL equivalente). **No** resolver eliminando otras sucursales, imponiendo una restricción global nueva a establecimiento sin decisión funcional, reiniciando contadores ni cambiando NEX-048. Probar T19 con dos sucursales del mismo establecimiento y mismo punto/código, además de los casos existentes, y, cuando haya PostgreSQL descartable autorizado, verificar concurrentemente. Si el negocio requiere compartir la misma identidad entre sucursales, necesita diseño de contador único y coordinación explícita (no fue autorizado).

**Numeración externa:** validación automática de último número emitido por otros sistemas/gateway no existe (solo confirmación humana); no presentarla como conciliación automática. El responsable debe confirmar el último número real antes de activar. **NEX-057 NO aplicada** de acuerdo con entrega; verificar antes de cualquier modificación del archivo versionado.

## R01-02 — MEDIO / defensa en profundidad (no bloquea aisladamente)

`nex_aplicar_grants_facturacion_puntos()` concede `SELECT` sobre `fe_puntos_expedicion_log` a `nexit_runtime`, tabla sin RLS por empresa. La UI/endpoint examinados no consumen esa bitácora. Evitar lectura directa de todos los tenants sin motivo: valorar retirar `GRANT SELECT` y usar una función de consulta con filtro/alcance si después se necesita verla; no se detectó un endpoint actual que exponga la bitácora cross-tenant. Ajustar prueba de grants en T19 en coherencia. No cambiar privilegios generales del proyecto por hipótesis.

## Validación mínima de la nueva entrega

- T19 ampliado para S1/S2 mismo establecimiento/código; verificar `fe_punto_crear`/`fe_punto_activar` rechazan colisión sin consumir ni retroceder número; funcionamiento con dos sucursales de establecimientos distintos y misma numeración; dos empresas independientes; permisos por empresa y sucursal; confirmaciones y bitácora.
- Regresiones dirigidas de creación FE, permisos y listado/cambio de punto. Testes **básicos e dirigidos**; no suite completa, build general, lint/tsc global o CI manual sin pedido expreso.
- Commit/push en branch oficial, SHA completo y **pausa para AUD-PRO129-R02**. **NO** iniciar PRO-128 antes de la reauditoría; no acceder VM/DB real ni aplicar NEX-057 por IA.

**Veredicto:** funcionalidad administrativa realizada con barrera de integridad fiscal faltante; NEX-057 **no autorizada para aplicar** y PRO-129 **In Review**. El primer test real en la VM requerirá, además, verificar NEX-056/057 y el entorno gateway/timbrado de forma humana.
