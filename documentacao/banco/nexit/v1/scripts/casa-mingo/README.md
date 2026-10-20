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
