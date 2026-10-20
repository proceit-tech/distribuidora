# CASA MINGO — importación inicial de 561 productos (enero 2026)

**Alcance:** catálogo de CASA MINGO exclusivamente. No ejecutar en otra empresa. **El UUID real se determina por consulta a `empresas` y se pasa explícitamente con `-v empresa_uuid=...`.** Nunca suponer que `codigo='casa_mingo'` existe.
**Estado:** publicado para revisión/ejecución en VM. NO se ejecutó en PostgreSQL.

## Archivos
- `CASA_MINGO_importar_productos.sql`: importación transaccional de catálogo, productos, unidades y precios. Incluye 561 filas normalizadas dentro de COPY; requiere `autorizar_carga=true`.
- `CASA_MINGO_preflight_SOLO_LECTURA.sql`: revisión de empresa por UUID, IVA, unidad, catálogos, precios y depósitos; ahora **falla** si el vínculo UN/77 no está listo.
- `CASA_MINGO_ajustar_unidad_SIFEN_77.sql`: ajuste **GLOBAL** de `unidades_medida.UN` a código SIFEN 77, transaccional y condicionado; puede afectar otros tenants que usan esa unidad.
- `CASA_MINGO_561_productos_normalizados.csv`: fuente de datos normalizada con cantidades para posterior inventario.
- `CASA_MINGO_mapeo_codigos_duplicados.csv`: código de origen, código reasignado y GTIN duplicado.

## Reglas
- 561 filas = 561 códigos internos distintos. 5 códigos duplicados asignados consecutivamente desde el máximo numérico de la fuente +1.
- El campo fiscal SIFEN E701 `dCodInt` acepta hasta **50 caracteres**; el campo interno de NEXIT `productos.codigo_sifen` tiene un limite propio de **20**. Los codigos de 11 digitos se conservan integros, incluidos ceros a izquierda.
- GTIN es otro campo: su formato permitido es 8, 12, 13 o 14 dígitos. Los 5 productos reasignados no reciben el GTIN repetido, para evitar un código de barras ambiguo.
- 17 filas sin marca = `SIN MARCA`; 80 sin línea = `SIN LINEA` (línea por familia).
- 2 precios sin dato = 1000 PYG (IVA incluido); 7 cantidades sin dato = 1. Cero explícito se mantiene.
- IVA 10 %, afectación gravada; unidad SIFEN 77, catálogo `unidades_medida.codigo='UN'`.
- No actualizar productos existentes; un conflicto código/descripción aborta antes de modificar. Las inserciones se hacen con `ON CONFLICT DO NOTHING`, y se verifica cobertura de las 561 filas antes del COMMIT.
- **No se inicializa el stock**: para registrar existencias reales hace falta escoger depósito, costo de apertura y hacer un movimiento oficial de inventario; nunca escribir directamente en `stock_saldos`.

## Ejecución en la VM (por responsable técnico, después de respaldo)
En la VM donde está montado el repositorio actualizado, desde su raíz. Primero identificar el UUID real (solo lectura):

```bash
docker exec -i nexit-db psql -X -U nexit_app -d nexit -c "SELECT id AS empresa_uuid, codigo, razon_social, estado, es_demo FROM empresas ORDER BY razon_social;"
```

Confirmado en VM: CASA MINGO S.A. tiene `id=12463e0f-55f7-4a0c-aad1-dc0681ca68b7` y código `80003314`; ya existen 2 productos `PRD-000001/2`, que se preservan. La unidad global `UN` está activa pero sin código SIFEN 77. **No ejecutar la importación hasta resolverlo**. Si la empresa no existe en otro ambiente, detener y crear el tenant mediante proceso oficial.

Antes de cualquier corrección **GLOBAL** de unidades, tomar respaldo verificable y confirmar que se admite actualizar `UN` para todos los tenants que la usan. El script de unidades no borra registros ni toca stock.

Luego definir manualmente `EMPRESA_UUID` y efectuar respaldo antes de la importación:

```bash
git checkout feature/NEXIT-2026-001-banco-demo
git pull --ff-only
cd documentacao/banco/nexit/v1/scripts/casa-mingo
EMPRESA_UUID='REEMPLAZAR_POR_UUID_REAL_VERIFICADO'

# Precondicion: ejecutar una unica vez la correccion global de unidad UN/77,
# SOLO SI SE AUTORIZO EL CAMBIO GLOBAL Y YA EXISTE RESPALDO:
# docker exec -i nexit-db psql -X -U nexit_app -d nexit -v ON_ERROR_STOP=1 \
#   < CASA_MINGO_ajustar_unidad_SIFEN_77.sql

# Solo lectura: valida el estado de la empresa y catalogos; aborta si UN/77 falta.
docker exec -i nexit-db psql -X -U nexit_app -d nexit -v ON_ERROR_STOP=1 -v empresa_uuid="$EMPRESA_UUID" < CASA_MINGO_preflight_SOLO_LECTURA.sql

# SOLO tras validar el preflight y generar respaldo de PostgreSQL:
docker exec -i nexit-db psql -X -U nexit_app -d nexit -v ON_ERROR_STOP=1 -v empresa_uuid="$EMPRESA_UUID" -v autorizar_carga=true < CASA_MINGO_importar_productos.sql

# Revisión de cobertura (561 o menos solo si script falló/rollback):
docker exec -i nexit-db psql -X -U nexit_app -d nexit -v ON_ERROR_STOP=1 -c "SELECT count(*) AS total FROM productos WHERE empresa_id=(SELECT id FROM empresas WHERE id='$EMPRESA_UUID'::uuid);"
```

Los 2 productos previos usan codigos PRD-000001 y PRD-000002; los codigos de los 561 registros son numericos y no colisionan con estos codigos previos. La descripcion del primero es semejante a una de origen, pero **no se deduplica automaticamente por descripcion**, porque la identidad comercial no ha sido confirmada: si todo se importa, el recuento de la empresa podra ser 563. Los codigos nuevos preservan los de origen. Auditar duplicados funcionales en UI sin borrar, renombrar o sobrescribir los historicos.

El conteo simple de empresa se filtra por UUID real y puede incluir productos existentes y no sustituye la verificación transaccional de 561 líneas hecha por el SQL. Guardar salida completa y logs de ejecución; no considerar homologado sin consulta funcional en NEXIT y pruebas de FE/GTIN.

## Preparación de apertura de stock: 10 unidades por producto (PENDIENTE)

Se agregó `CASA_MINGO_preflight_stock_10_SOLO_LECTURA.sql` y un **borrador bloqueado por autorización**:
`CASA_MINGO_APERTURA_10_UNIDADES_PENDIENTE_AUTORIZACION.sql`.

### Evidencia del banco (20/10/2026)
- La importación anterior terminó `COMMIT`: 561/561 productos nuevos, IVA, unidad SIFEN y clasificaciones correctos; 563 productos contando dos fichas antiguas.
- Al abrir Stock, estos productos muestran stock inicial 0; el preflight especializado debe confirmar si existe algún saldo en otro depósito.
- Depósito elegido: `DEP-PRINCIPAL` (`a207eebb-aca7-42d3-bdab-373f4f08523b`).
- Alcance temporal del borrador: los **561 códigos numéricos** importados, NO los dos `PRD-000001/2`.
- Objetivo: **10 disponibles** por producto, no incremento indiscriminado: si existe saldo o costo previo, se aborta.
- Motor estándar de BD: `inventario_registrar_movimiento`, NEX-014, `ENTRADA/ABERTURA`, con 2 movimientos (300+261 líneas); salida y valorización verificadas en la misma transacción.
- La UI regular usa intenciones durables NEX-066, pero este archivo es un proceso puntual administrativo de implantación, no una ruta HTTP nueva.
- Falta la decisión del **costo de adquisición unitario**: la planilla contiene precios de VENTA, no costos. El borrador exige `-v costo_unitario=<NUMERO>` sin valor por defecto. Costo cero es técnicamente válido pero causa stock contabilizado a Gs. 0 y solo puede usarse mediante autorización expresa.
- Falta identificar operador autorizado: exige `-v usuario_uuid=<UUID>`. No usar usuario inventado.
- No ejecutar hasta recibir preflight, confirmar costo, validar backup y autorizar el alta; la primera ejecución debe ser supervisada. Evitar ventas sobre existencias ficticias.

### Próximo comando SEGURO: solo lectura

```bash
cd /tmp/nexit-instalacao
git pull --ff-only
cd documentacao/banco/nexit/v1/scripts/casa-mingo
docker exec -i nexit-db psql -X -U nexit_app -d nexit -v ON_ERROR_STOP=1 < CASA_MINGO_preflight_stock_10_SOLO_LECTURA.sql
```

**No ejecutar todavía el borrador** `CASA_MINGO_APERTURA_10_UNIDADES_PENDIENTE_AUTORIZACION.sql`.


## CAMBIO DE REGLA DEL 20/10/2026 — IMPORTANTE
El responsable aclaró que **las cantidades y precios existentes deben respetarse tal cual el Excel**. La propuesta de 10 unidades a TODOS queda **revocada** y su script fue reemplazado por un bloqueo (`\\quit 2`).
- 465 registros con cantidad positiva Excel: mantener exactamente, suma 91.794 unidades.
- 89 con cantidad explícita 0: mantienen cero, no disponibles para facturar sin un nuevo movimiento.
- 7 sin cantidad en el Excel: **10 unidades por defecto** = 70 adicionales.
- Total a registrar en DEP-PRINCIPAL: **91.864 unidades** en **472 productos**; los otros 89 quedan con cero.
- **Precios de venta** ya cargados: los 561 se preservan tal como están, 2 sin precio fueron completados a Gs. 1.000.
- Archivo nuevo: `CASA_MINGO_APERTURA_STOCK_EXCEL_PENDIENTE_AUTORIZACION.sql`, con 561 cantidades auditables y dos movimientos de apertura (300+172).
- **No ejecutar todavía** sin autorización expresa del costo de inventario y preflight. `PRECIO_EXCEL` usa precio de VENTA como costo provisional: contablemente distinto del costo de adquisición real; solo autorizado expresamente. `COSTO_FIJO` requiere `-v costo_unitario=...` y también aprobación.
- Si se necesita que los 89 con cero se facturen, se requiere una decisión nueva sobre ese stock; no cambiar cero por diez arbitrariamente.
