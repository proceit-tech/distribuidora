# CASA MINGO — Procedimiento controlado de importación de 561 productos

**Fecha:** 20/10/2026 · **Empresa obligatoria:** `empresas.codigo = 'casa_mingo'`, `es_demo = false`.  
**Origen:** `INVENTARIO ENERO 2026-Mingo Familia y Sub Familia (1).xlsx`; SHA256 `a607dafe65417a5f88c0183bd87c6c1d6b6cebd4dc50d385fcc3a74154cb8fbd`.  
**SQL autónomo:** [CASA_MINGO_importar_productos_2026_01.sql](../scripts/CASA_MINGO_importar_productos_2026_01.sql).  
**Preflight SQL, solo lectura:** [CASA_MINGO_preflight_productos_2026_01.sql](../scripts/CASA_MINGO_preflight_productos_2026_01.sql).

**ESTADO:** SQL preparado/versionado. **NO EJECUTADO NI HOMOLOGADO EN LA VM.** Solo el responsable humano puede ejecutar después de revisión de ChatGPT y backup. Claude no ejecuta VM/SQL/migrations/deploy. No editar las migrations históricas.

## 1. Decisiones explícitas del responsable

- **561 filas** originales deben tener **561 códigos NEXIT distintos**. Hay **556 códigos originales distintos y 5 pares repetidos con descripción diferente**. La primera fila conserva el código, la segunda recibe el siguiente número tras el máximo numérico del archivo (`34264170018982`), según orden de fila Excel: `34264170018983 … 34264170018987`. Ver mapeo:
  - Fila 173: código anterior `883314934502` → `34264170018983`
  - Fila 232: `026102895191` → `34264170018984`
  - Fila 233: `026102895184` → `34264170018985`
  - Fila 234: `026102895207` → `34264170018986`
  - Fila 235: `0883314883800` → `34264170018987`
- **Marca vacía (17):** crear/reutilizar `SIN MARCA` de la empresa.
- **Línea vacía (80):** crear/reutilizar `SIN LINEA` **dentro de la familia**. No existe línea global independiente en NEX-017.
- **Precio vacío (2):** venta de referencia `Gs. 1000`, moneda PYG, precio IVA incluido; conservar explícitamente precios cero existentes.
- **Cantidad vacía (7):** normalizar a `1`; mantener explícitamente las cantidades cero existentes. **No crea stock físico ni saldo**: el inventario de origen es de **enero de 2026**, no necesariamente actual; las cantidades quedan descritas en `productos.observacion` y en el de-para entregado.
- **IVA:** todas las fichas nuevas con `impuesto_id = IVA10` y `afectacion_iva=1` (gravado).
- **Unidad:** la planilla no posee campo de unidad base por producto; utilizar la unidad global `UN` vinculada a código SIFEN **77 / UNI**, inclusive presentación base/compraventa.
- **Familia, línea y marca:** reutilizar catálogos existentes por empresa/nombre o insertar faltantes, sin desactivar ni duplicar; categoría se hereda de la familia si existe, no se inventa.
- **Códigos internos:** preservar íntegros los 11–14 dígitos y ceros iniciales. La DNIT NT 009 establece campo E701 `dCodInt` de 1–50 caracteres; el **esquema NEXIT `productos.codigo_sifen` permite 1–20**; todas las 561 referencias actuales caben sin truncamiento.
- **GTIN:** solo asociar código de barras verificado e inequívoco; los diez productos con código original duplicado no reciben GTIN automático, para impedir identificar dos fichas diferentes por un mismo escaneo. La descripción y la referencia de origen se conservan.

## 2. Secuencia segura de ejecución (SOLO RESPONSABLE)

1. Conferir SHA de Git em branch oficial; asegurar que se ejecutará exactamente el SQL y su preflight versionados, en la empresa/BD correctas.
2. Realizar **backup verificable del PostgreSQL**; documentar su validez y restauración disponible. No atribuir al archivo de enero cifras actuales de stock.
3. Ejecutar **solo preflight read-only** con el contenedor y credenciales reales identificados por el responsable; confirmar empresa no DEMO/activa, PYG, unidad UN/77, impuesto IVA10, families, precios e inexistencia de colisiones de los cinco códigos nuevos. No usar comandos con credenciales expuestas en el Git.
4. Revisar salida del preflight con ChatGPT. **PARAR** si empresa no coincide, no hay unidad/IVA correcto, hay cambios incompatibles en el esquema, colisiones con otros productos o un catálogo preexistente inactivo de mismo nombre.
5. **Solo con autorización humana expresa**, ejecutar el archivo de importación a través de psql, con `ON_ERROR_STOP=1` y `-v autorizar_carga=true`. Si se usa Docker, transmitir el archivo con redirección de stdin o montarlo adecuadamente: `-f` dentro del contenedor solo funciona cuando el archivo está dentro de él. No reutilizar un comando supuesto sin confirmar ruta de la VM.
6. Validar que el resumen final muestre `codigos_presentes_empresa=561`, `codigos_asignados=5`, `precios_definidos_1000=2`, `cantidades_definidas_1=7`, `sin_marca=17`, `sin_linea=80`. `productos_creados` puede ser menor que 561 si algunos productos ya existían y coincidían en identidad; en ningún caso se modifica la ficha existente al repetir el script.
7. Revisar en la UI y por consulta de solo lectura productos, familias/linhas/marcas, IVA, precios, GTIN y empresa. Ejecutar pruebas con operador CASA MINGO sin mezclar otro tenant.
8. Registrar el resultado y decidir homologación con el responsable. No marcar completado sobre la sola base del SQL versionado.

**No aplicar el SQL mediante el runner de migrations:** este archivo es un script de *datos de cliente*, no una migration NEX. No modificar checksums ni esquema.

## 3. Seguridad y reversión

- El SQL comienza con guardas `autorizar_carga` y transacción `BEGIN`, utiliza `SET LOCAL lock_timeout` y aborta al detectar inconsistencias. La postcondición exige **561/561 códigos** presentes en CASA MINGO antes de `COMMIT`.
- Por defecto solo inserta productos aún no existentes; no actualiza, borra ni corrige fichas comerciales que el cliente ya haya modificado. No opera otras empresas ni envía factura electrónica. El script puede repetirse sin duplicar `empresa_id,codigo`.
- **Si una transacción falla, debe realizar ROLLBACK antes de cualquier intento nuevo.** Después de COMMIT, una reversión no puede suponerse segura si ya hubo venta/movimiento/referencia: restauración o saneamiento requieren análisis humano e inventario de dependencias, no un DELETE automático.

## 4. Stock: una decisión separada y necesaria

La cantidad de enero, incluso las siete reemplazadas por 1, es **referencia comercial histórica**. El NEXIT obliga a crear saldo únicamente vía **movimiento legítimo de Inventario / ABERTURA**, con **depósito y costo de adquisición autorizado por empresa/producto**. No asignar por defecto el precio de venta como costo, no alterar `stock_saldos`, `inventario_costos` ni `movimientos_inventario` por INSERT manual. Cuando el responsable defina depósito y criterio de costo, preparar una importación de movimientos separada, auditable y con cantidad actual validada.

## 5. Limites de comprobación

Revisión actual: conteo de origen (561), resolución determinística de 5 códigos, mapeo y estructura SQL en Git. **No se ejecutó el SQL en PostgreSQL real ni en la VM**, tampoco se validaron datos actualmente existentes en CASA MINGO. Todo bloqueo detectado en preflight real debe ser revisado antes de autorizar importación.
