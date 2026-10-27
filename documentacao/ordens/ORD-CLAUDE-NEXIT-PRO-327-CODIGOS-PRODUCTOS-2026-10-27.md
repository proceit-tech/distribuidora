# ORDEN ÚNICA CLAUDE — PRO-327 P0 — CÓDIGO ALFANUMÉRICO E RECUPERACIÓN DE CEROS CASA MINGO

**Fecha:** 27/10/2026  
**Responsabilidad:** ChatGPT especifica reglas/analiza/audita; Claude SOLAMENTE desarrolla código y SQL versionado.  
**Repo:** `proceit-tech/distribuidora`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Linear:** [PRO-327](https://linear.app/proceit/issue/PRO-327)  
**Fuente comercial:** Excel `INVENTARIO ENERO 2026-Mingo Familia y Sub Familia (2).xlsx`, SHA-256 `a607dafe65417a5f88c0183bd87c6c1d6b6cebd4dc50d385fcc3a74154cb8fbd`; mismo archivo exacto de la importación anterior.  
**MAPA EXHAUSTIVO OBLIGATORIO:** [CASA_MINGO_MAPEO_CORRECCION_CODIGOS_2026-10-27.csv](../banco/nexit/v1/scripts/casa-mingo/CASA_MINGO_MAPEO_CORRECCION_CODIGOS_2026-10-27.csv).

## 1. Decisiones de negocios NO DISCUTIBLES

1. Código del cliente/producto **es TEXTO ALFANUMÉRICO**, NO número, NO GTIN y NO PK. `productos.id` UUID continúa siendo la única PK. El código incluye y distingue ceros a la izquierda: `0026102469514` no equivale a `26102469514`. Nunca `Number`, `parseInt`, `parseFloat`, `String(Number(...))`, transformación que los elimine, truncamiento ni recálculo de identificadores.
2. La columna `CODIGO` del Excel utiliza dos representaciones: **388 celdas numéricas con formato Excel `0000000000000`** (387 presentadas con 13 dígitos, una originalmente con 14) y **173 celdas texto**, que se preservan literalmente; NO aplicar padding de 13 a las celdas texto. Hay 561 SKU físicos y cinco pares de códigos originales duplicados. La fila Excel 5 **debe** quedar `0026102469514`, y fila 4 `0026102469668`.
3. Los cinco códigos de SKU previamente remapeados en la importación (filas 173,232,233,234,235) **deben conservar sus códigos únicos de sistema y SIFEN** (`34264170018983`…`34264170018987`); en `codigo_inventario` se restituye el original visible del cliente (puede repetirse). Jamás colapsar dos productos, ni asignar un `dCodInt` SIFEN idéntico a dos productos distintos.
4. **Para 561 productos ya importados**, `productos.codigo` y `productos.codigo_sifen` se alinean al campo `codigo_producto_nuevo` del mapa, salvo los cinco casos que permanecen con el código único previamente remapeado; `productos.codigo_inventario` se alinea al campo `codigo_cliente_original`. Esto implica teóricamente **249 cambios en codigo / codigo_sifen y 254 en codigo_inventario**; cada valor real anterior debe validarse en preflight y nunca sobrescribirse si difiere inesperadamente.
5. Los **dos productos anteriores** `PRD-000001/PRD-000002`, todos los demás tenants, stock, costos, precios, lote, movimientos, proveedores, FE/NCE antiguas, CDC y snapshots fiscales NO se alteran. Referencias internas a producto permanecen por UUID.
6. Para **Nuevo producto**, permitir ingresar `Código del producto` como texto alfanumérico opcional al crear. Campo vacío genera `PRD-nnnnnn` por el método existente. Si se informa, debe persistir exactamente como texto (excepto normalización ya prevista de espacios externos) y ser único por empresa; soportar `000123`, `AB-0012`, `A000123`, distinguir `000123` de `123`. Rechazar código vacío solo si el mecanismo automático existente fallase; no eliminar la generación automática.
7. En la edición regular el identificador `productos.codigo` **sigue inmutable** (NEX-038 y PUT actual); mostrarlo como texto/copiar, no permitir cambio ordinario. `Código inventario` es campo separado, preserva ceros y letras, puede coincidir entre dos productos históricos; no es PK ni código fiscal SIFEN.
8. SIFEN E701 `dCodInt` identifica de manera única una mercadería/servicio y admite 1–50 caracteres alfanuméricos (NT 009, 09/09/2021, fuente DNIT). NEXIT actualmente construye `dCodInt` desde `productos.codigo` en `lib/facturacion/emision.ts`; no usar `codigo_inventario` si sería ambiguo, ni intercambiarlo silenciosamente por GTIN. Para productos vendibles no permitir códigos mayores de 50 caracteres sin confirmación de compatibilidad fiscal; el esquema `codigo` permite hasta 80 y se conserva. No tocar GTIN, código de barras ni su dígito verificador, menos aún a partir del padding del Excel. `codigo_sifen` sigue campo técnico separado y no puede contradecir identidad fiscal.
9. La actualización es **corrección de datos previamente importados** — NO una nueva importación, NO inventario de apertura, NO migration global ni script masivo sin selector. Debe existir un único script focal y un preflight separado SOLO LECTURA.

## 2. Análisis de archivos obligatorio antes de editar

Leer integrales `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, esta orden, el mapa CSV y:
- `documentacao/banco/nexit/v1/scripts/casa-mingo/README.md`
- `documentacao/banco/nexit/v1/scripts/casa-mingo/CASA_MINGO_561_productos_normalizados.csv`
- `documentacao/banco/nexit/v1/scripts/casa-mingo/CASA_MINGO_mapeo_codigos_duplicados.csv`
- `documentacao/banco/nexit/v1/migraciones/NEX-007-productos.sql`
- `documentacao/banco/nexit/v1/migraciones/NEX-038-productos-codigo-inmutable.sql`
- `lib/productos/formulario.ts`, `normalizar.ts`, `shared.ts`, `alta.ts`
- `app/(private)/productos/_components/pestanas/informacion.tsx`, `producto-form.tsx`, componentes de input.
- `app/api/productos/route.ts` y `app/api/productos/[id]/route.ts`
- `lib/facturacion/emision.ts`, `lib/facturacion/payload-fe.ts` y rutas de selector de producto/consulta que presentan códigos.

**Estado comprobado:** `formularioAPayload` envía `codigo:""` siempre en `crear`; la UI solo muestra código interno en editar, sin input en Nuevo. `productos.codigo` es TEXT UNIQUE (empresa_id,codigo); el PUT niega cambio normal y NEX-038 impide UPDATE directo. No corregir esto manipulando PK ni concediendo edición libre general.

## 3. Entrega de código A — Alta de productos

- Añadir input textual `Código del producto` en pestaña Información, visible SOLO en alta; no `type=number`, ni input con máscara numérica/solo dígitos. Ayuda en español: `Alfanumérico. Conserva los ceros iniciales. Si queda vacío, el sistema asigna un código automático.` Se acepta letras/números (y guiones existentes si forman parte del código comercial).
- Actualizar `formularioAPayload` y consumidor para enviar el código digitado en creación. El servidor valida texto 1–80 conforme esquema y si vendible/emitible a SIFEN 1–50 conforme E701; advertir/rechazar caracteres incompatibles con el contrato fiscal, sin normalizaciones silenciosas. No convertir a números, no cambiar mayúsculas/minúsculas sin norma explícita.
- Respetar la unicidad por empresa; un código existente responde 409 de forma legible y conserva el formulario. Entre dos empresas pueden existir iguales.
- Campo en edición sigue solo lectura, código anterior nunca se altera vía API; preserva NEX-038.
- No autollenar por copia `codigo_inventario`, `codigo_sifen`, código de barras o GTIN sin decisión explícita del usuario: mantener campos distinguibles y reglas fiscales actuales, sin falsear código fiscal.
- No tocar precios, cantidades, FE, línea de factura o los flujos existentes.

## 4. Entrega de script B — Corrección histórica puntual CASA MINGO

Crear SOLO:
- `documentacao/banco/nexit/v1/scripts/casa-mingo/CASA_MINGO_CORREGIR_CODIGOS_PREFLIGHT_SOLO_LECTURA.sql`
- `documentacao/banco/nexit/v1/scripts/casa-mingo/CASA_MINGO_CORREGIR_CODIGOS_PENDIENTE_AUTORIZACION.sql`
- Breve instrucción de ejecución y rollback lógico documentada junto a los archivos, sin tocar scripts antiguos ya ejecutados.

Reglas obligatorias:
1. Leer el **MAPA canónico versionado de 561 filas**, no fabricar por `lpad` los 561 códigos indiscriminadamente. Los originales texto son literales y los cinco remapeos son excepciones.
2. Preflight no modifica datos. Recibe `empresa_uuid` explícito y comprueba `empresas` == `CASA MINGO S.A.` / `codigo='80003314'` / activa / no demo; verifica esquema/triggers, tabla y roles. Muestra por fila **UUID vigente / código actual / código propuesto / `codigo_inventario` actual/propuesto / `codigo_sifen` actual/propuesto / descripción**, stock asociado (informativo), colisiones y discrepancias. Protege contra reutilizar código ya tomado por los 2 productos anteriores u otro SKU; admite solo source-state o target-state previstos; cualquier tercer valor ABORTA.
3. Aplicación requiere parámetro afirmativo específico `autorizar_actualizacion=true` **además** de UUID, backup externo confirmado y preflight aceptado. Sin ello debe terminar sin UPDATE. **NO EJECUTAR AHORA**.
4. Transacción única, bloqueos y timeouts razonables, anti-concurrencia, 561 registros exactos identificados por `empresa_uuid` + código previo o corregido y con descripción confirmada, sin depender solo de descripción. Validar correspondencia 1:1, 561 UUID inalterados y resultados finales exactos; `ROLLBACK` ante cualquier fallo, jamás éxito parcial. Idempotente solo para un segundo ciclo plenamente confirmado (no reescribir parcialmente). Generar comprobante antes/después fuera de las tablas de stock/fiscales y conteos 561, 249, 254 según estado.
5. **NEX-038:** no eliminar ni modificar migración histórica y NO eliminar definitivamente el trigger. Si se necesitara modificar `productos.codigo`, diseñar una excepción one-off transaccional estricta que solo afecte el lote exacto de CASA MINGO, evitando bypass global de todas las tablas/FK/triggers (PROHIBIDO `session_replication_role=replica` o `DISABLE TRIGGER ALL`). Si no puede asegurarse reactivación atómica y un lock que evite otro UPDATE sin control, REPORTAR BLOQUEO al ChatGPT. No alterar función de inmutabilidad para uso general. El trigger tiene que continuar habilitado tras COMMIT/ROLLBACK.
6. El usuario de aplicación quizá no sea el propietario del objeto y no tenga permiso DDL para una excepción temporal. No ampliar grants; detallar el rol dueño necesario para ejecución posterior segura, sin usar ni adivinar credenciales.
7. Prohibidos `INSERT` de productos, `DELETE`, inventario_registrar_movimiento, actualización de `stock_saldos`, `inventario_costos`, `movimiento_lineas`, `listas_precio`, documentos electrónicos, payloads/versiones fiscales o datos de otro tenant. Los movimientos previos conservan `producto_id`; la nueva FE usa la identidad actual. No modificar GTIN/etiquetas ni realizar correcciones fiscales retroactivas.
8. Caso excepcional: 5 duplicados conservan código único de sistema/fiscal, guardando en `codigo_inventario` el valor original del cliente; comunicar su duplicación en el reporte, sin generar cinco nuevas identidades.

## 5. Casos de aceptación como código, NO ejecutar

1. Producto nuevo `0026102469514` se graba igual como STRING y se busca/muestra así.
2. `000123` y `123` son distintos; `AB-0012` es válido; `PRD-000001` automático funciona si campo vacío.
3. Dos productos con mismo `codigo` en la misma empresa dan 409 y no duplican; otra empresa puede usar el mismo código.
4. PUT general no cambia código y trigger continúa activo.
5. Mapping EXACTO 561, 388 celdas numéricas, 173 texto, 5 duplicados; 249 códigos `productos.codigo` corregidos, 254 `codigo_inventario` restablecidos; fila 5 `0026102469514`.
6. SIFEN usa SKU único no código de cliente duplicado y no recibe identificador convertido a número; fiscal E701 <=50 cuando el producto es facturable.
7. Ningún UUID/stock/costo/precio/GTIN/documento histórico es modificado por el script.
8. Error por mapeo incompleto, colisión, estado inesperado, empresa incorrecta, permisos/trigger: rollback integral.
9. Reabrir ficha, selector de FE, búsqueda, listado de productos y precios preservan ceros (no convertir números en React/JSON/SQL).

## 6. Prohibiciones y cierre

- No modificar issue, requisitos, mapas ni Linear (gestión ChatGPT); Claude SOLO desarrolla.
- No ejecutar los scripts en PostgreSQL de prueba/VM, ni SQL alguno, ni aplicar migration, ni ejecutar build, lint, typecheck, CI, HTTP real, tests o navegador sin autorización separada. Escribir/ajustar casos automatizados sí está autorizado.
- No modificar servidores, Docker, gateway, certificados, stock, FE/NCE ni otras issues.
- Commit + push SOLO en la branch oficial; respuesta final con SHA completo, archivos alterados, conteos teóricos, puntos de riesgo y nota **NO EJECUTADO**. Parar para auditoría independiente del ChatGPT. No marcar Done.

**ÓRDEN DE DESARROLLO AUTORIZADA. SCRIPT DE UPDATE APENAS VERSIONADO Y TOTALMENTE BLOQUEADO PARA EJECUCIÓN; LA EJECUCIÓN EN BANCO REAL NECESITA NUEVA AUTORIZACIÓN HUMANA.**
