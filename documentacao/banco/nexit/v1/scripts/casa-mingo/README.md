# CASA MINGO — importación inicial de 561 productos (enero 2026)

**Alcance:** catálogo de CASA MINGO exclusivamente. No ejecutar en otra empresa.
**Estado:** publicado para revisión/ejecución en VM. NO se ejecutó en PostgreSQL.

## Archivos
- `CASA_MINGO_importar_productos.sql`: importación transaccional de catálogo, productos, unidades y precios. Incluye 561 filas normalizadas dentro de COPY; requiere `autorizar_carga=true`.
- `CASA_MINGO_preflight_SOLO_LECTURA.sql`: revisión de empresa, IVA, unidad, catálogos, precios y depósitos.
- `CASA_MINGO_561_productos_normalizados.csv`: fuente de datos normalizada con cantidades para posterior inventario.
- `CASA_MINGO_mapeo_codigos_duplicados.csv`: código de origen, código reasignado y GTIN duplicado.

## Reglas
- 561 filas = 561 códigos internos distintos. 5 códigos duplicados asignados consecutivamente desde el máximo numérico de la fuente +1.
- El código interno SIFEN E701 `dCodInt` acepta **1–20 caracteres**. Códigos de 11 dígitos se conservan íntegros, incluidos ceros a izquierda.
- GTIN es otro campo: su formato permitido es 8, 12, 13 o 14 dígitos. Los 5 productos reasignados no reciben el GTIN repetido, para evitar un código de barras ambiguo.
- 17 filas sin marca = `SIN MARCA`; 80 sin línea = `SIN LINEA` (línea por familia).
- 2 precios sin dato = 1000 PYG (IVA incluido); 7 cantidades sin dato = 1. Cero explícito se mantiene.
- IVA 10 %, afectación gravada; unidad SIFEN 77, catálogo `unidades_medida.codigo='UN'`.
- No actualizar productos existentes; un conflicto código/descripción aborta antes de modificar. Las inserciones se hacen con `ON CONFLICT DO NOTHING`, y se verifica cobertura de las 561 filas antes del COMMIT.
- **No se inicializa el stock**: para registrar existencias reales hace falta escoger depósito, costo de apertura y hacer un movimiento oficial de inventario; nunca escribir directamente en `stock_saldos`.

## Ejecución en la VM (por responsable técnico, después de respaldo)
En la VM donde está montado el repositorio actualizado, desde su raíz:

```bash
git checkout feature/NEXIT-2026-001-banco-demo
git pull --ff-only
cd documentacao/banco/nexit/v1/scripts/casa-mingo

# Solo lectura: no modifica datos.
docker exec -i nexit-db psql -X -U nexit_app -d nexit -v ON_ERROR_STOP=1 < CASA_MINGO_preflight_SOLO_LECTURA.sql

# SOLO tras validar el preflight y generar respaldo de PostgreSQL:
docker exec -i nexit-db psql -X -U nexit_app -d nexit -v ON_ERROR_STOP=1 -v autorizar_carga=true < CASA_MINGO_importar_productos.sql

# Revisión de cobertura (561 o menos solo si script falló/rollback):
docker exec -i nexit-db psql -X -U nexit_app -d nexit -v ON_ERROR_STOP=1 -c "SELECT count(*) AS total FROM productos WHERE empresa_id=(SELECT id FROM empresas WHERE codigo='casa_mingo');"
```

El conteo simple de empresa puede incluir productos existentes y no sustituye la verificación transaccional de 561 líneas hecha por el SQL. Guardar salida completa y logs de ejecución; no considerar homologado sin consulta funcional en NEXIT y pruebas de FE/GTIN.
