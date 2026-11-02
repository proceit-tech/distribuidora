# DECISIÓN VIGENTE — PRO-339: límite FE VARIABLE POR EMPRESA (02/11/2026)

**El responsable PROCEIT autorizó IMPLEMENTAR el mecanismo parametrizable** (no valores fijos, no despliegue). Cada empresa cliente de NEXIT tendrá su propio `empresas.fe_max_lineas` (integer NULL, permitido 1..999; `NULL=999`). Valores **21, 63, 99 son EJEMPLOS**; prohibido fijar CASA MINGO=21, hardcodear tenant, nombre/RUC, o poner ese valor como DEFAULT o UPDATE en la migration. La empresa compradora de la FE (`clienteId`) NO determina la cuota; es el tenant (`empresaId` de sesión) quien la determina.

**Ámbito:** solo FE NUEVAS; contar elementos `cuerpo.lineas`, no cantidades ni SKU distintos, NCE inalteradas, FE históricas/reintentos idempotentes equivalentes sin cambio. `MAX_LINEAS=999` sigue límite fiscal común. Validar en backend `prepararFactura` antes de numeración/stock y UX en Nueva factura leyendo catálogo autenticado. Migration incremental solo versionada, **NO APLICADA**. La futura **tela administrativa PRO-340** ([Linear](https://linear.app/proceit/issue/PRO-340) · [GitHub #17](https://github.com/proceit-tech/distribuidora/issues/17)) será etapa separada, **NO DESARROLLAR AHORA**.

**ÚNICA ORDEN ACTIVA DE CÓDIGO:** [ORD-PRO-339-R01-LÍMITE-CONFIGURABLE](../ordens/ORD-CLAUDE-NEXIT-PRO-339-R01-LIMITE-FE-CONFIGURABLE-EMPRESA-2026-11-02.md), bajo protocolo 1 archivo completo/actual por vez, casos fuente sin ejecutar, commit+push SHA y **PARAR para auditoría ChatGPT PRO-339-R01**. Sin test/lint/build/SQL/migrations aplicadas/VM/gateway/deploy.

**ATENCIÓN:** El material D01 a continuación es histórico y queda **SUPERADO** en cuanto a «pendiente autorización», «CASA MINGO fijo 21» o «sólo diagnóstico». Conserva valor como análisis de los archivos, pero no como instrucción activa. La configuración comercial concreta de una empresa se autorizará y aplicará por separado después.

---

## Anexo — parecer D01 histórico (sustituido en los puntos indicados)

# PARECER TÉCNICO — PRO-339-D01 / Límite opcional de líneas FE por empresa

**Fecha:** 02/11/2026  
**Issue:** [Linear PRO-339](https://linear.app/proceit/issue/PRO-339) · [GitHub #16](https://github.com/proceit-tech/distribuidora/issues/16)  
**Estado de decisión:** **OPCIÓN A RECOMENDADA/VALIDADA TÉCNICAMENTE POR CHATGPT; PENDIENTE DE RATIFICACIÓN EXPLÍCITA DEL RESPONSABLE DE PROCEIT**. No iniciar implementación, migration ni configuración de la empresa hasta esa ratificación.  
**Alcance:** solo **nuevas Facturas Electrónicas (FE)** de CASA MINGO, máximo **21 líneas de ítems**.

## 1. Decisión recomendada

**Seleccionar la OPCIÓN A:** columna nullable `empresas.fe_max_lineas` (tipo integer con CHECK de rango válido, preferentemente `BETWEEN 1 AND 999`); su valor `NULL` significa límite efectivo **999**, preservando todas las demás empresas sin configuración. Para CASA MINGO, después de identificar y verificar el registro de empresa correcto y aprobar la operación, configurar **21**. No inferir UUID/RUC por nombre de pantalla ni hardcodear CASA MINGO en la aplicación. La columna representa configuración empresarial; no altera máximo fiscal base de SIFEN de `MAX_LINEAS = 999`.

**Semántica inequívoca:** contar **cada elemento de `cuerpo.lineas`** de la FE — fila del detalle/fila del payload fiscal. Una fila con `cantidad=100` equivale a una línea, no 100. SKU ya presente que aumenta cantidad en la misma fila no cuenta otra; dos filas separadas cuentan dos, aun si comparten SKU. Cualquier descuento comercial que no cree una fila fiscal independiente no consume línea adicional. El scroll de cuatro filas visibles de PRO-331 es solo presentación y no modifica el tope.

**Ámbito:** `FE` nueva únicamente. Excluir NCE y demás tipos, no limitar consultas, KuDE, informes, cancelaciones, notas de crédito, facturas históricas o lectura de documentos anteriores con más de 21 líneas. No romper idempotencia: reintento con **clave ya emitida y payload equivalente** debe reutilizar el documento existente aunque la política se haya reducido después; no permitir que el reintento modifique su payload ni cree nueva FE bajo pretexto de idempotencia.

## 2. Puntos reales verificados en el código

- `documentacao/banco/nexit/v1/migraciones/NEX-002-seguridad.sql:9–20`: la tabla `empresas` tiene ID UUID único y `codigo` único; no existe en esa definición `fe_max_lineas`. El diagnóstico del desarrollador afirma que actualmente no hay campo equivalente.
- `lib/facturacion/payload-fe.ts:53`: `MAX_LINEAS=999`, límite general de serialización fiscal, que debe quedar intacto.
- `lib/facturacion/emision.ts:187–192`: `leerCuerpoFactura` valida forma y máximo **global** de 999, que también debe quedar como guardia técnica general, **no** sustituirse globalmente por 21.
- `lib/facturacion/emision.ts:450–510`: `prepararFactura(db, empresaId, usuarioId, cuerpo, opciones)`, función común de validación servidor antes de reservas; insertar allí control **por empresa** del máximo, consultado por `empresaId` de sesión, solo para FE nueva.
- `app/api/facturas/previa/route.ts:8–35`: el endpoint de previa llama a `prepararFactura` sin escribir o reservar número. `app/api/facturas/route.ts:11–35` usa `leerCuerpoFactura` y `emitirFactura`; `lib/facturacion/emision.ts:701–749` usa `crearFacturaElectronica` y llama a `prepararFactura` antes de reservar/guardar. El backend es AUTORIDAD para validar, independiente de lo que muestre el frontend.
- `lib/facturacion/emision.ts:701–722`: detecta FE con la misma clave de idempotencia y recupera payload histórico; aplicar límite solo a operaciones nuevas, preservando equivalencia y reintentos.
- `app/(private)/facturas/nueva/page.tsx:611–899,1309–1461`: `lineas` es el array editable; reingresar SKU existente suma 1 a su cantidad (sin nueva fila), y existe selector avanzado. La UI debe leer el máximo efectivo REAL de su empresa desde API autorizada y avisar al intentar agregar línea 22, además de mostrar `n/21`. Sin embargo, ni estado del browser ni parámetro del cliente pueden aumentar el límite del servidor.

## 3. Contrato de implementación, si el responsable aprueba

1. **Migration incremental nueva/versionada**, nunca modificar migrations históricas: `ALTER TABLE empresas ADD COLUMN fe_max_lineas integer NULL` con CHECK 1..999. No aplicar SQL ni setear 21 en empresa real durante desarrollo sin autorización específica y verificación de empresa, backup, secuencia de migrations y controles operativos. Política `NULL => 999`.
2. **Servidor**: cargar `COALESCE(fe_max_lineas,999)` para `empresaId` autenticada; no depender del ID suministrado por el frontend. Validar `cuerpo.lineas.length <= limite` en `prepararFactura`, tanto en previa como en creación, **antes de reservar numeración o mover stock**, solo para FE nueva. Error 422 en español descriptivo `Esta empresa permite un máximo de 21 líneas por factura electrónica.` (de forma dinámica) sin consumir numeración ni modificar stocks. **No consultar columna inexistente silenciosamente**: exigir migración como gate de deployment; en caso de schema incompleto, falla controlada o estrategia explícita, no permitir emisión que eluda límite sin aviso.
3. **Idempotencia**: identificar correctamente FE previa equivalente y permitir reuso si excede el máximo comercial actualizado, sin omitir comprobación de equivalencia ni afectar guardia fiscal 999. Si falta evidencia de historico equivalente, no crear una FE nueva con más de 21.
4. **UI**: recuperar el máximo efectivo del catálogo/endpoint autenticado (sin inventar nueva fuente de identidad), mostrar contador de líneas, aviso temprano al intentar crear nueva fila 22 tanto por lector/Enter como por búsqueda avanzada. Volver a permitir agregar tras eliminar una fila; aumentar cantidad de SKU existente no crea fila. Preservar limpieza y retorno de foco PRO-331, alertas de stock, permisos, edición fiscal, cálculos y formato monetario. 4 filas visibles y scroll desde la quinta siguen iguales.
5. **Casos dirigidos a escribir pero NO ejecutar**: 0/1/4/5/20/21/22, cantidad 100 con una línea, SKU existente, producto distinto, borrar 21->20, selector avanzado, scanner/Enter, UI vs API y cuerpo manipulado, otra empresa `NULL=999`, empresa con configuración diferente, cambios de política durante borrador, FE histórica >21 y reintento idempotente, no alterar NCE/KuDE/CDC/IVA/stock/seguridad.

## 4. Gates

- **Solo una decisión técnica registrada**; no se ha recibido autorización expresa del responsable para crear migration o modificar funcionalidades. El procedimiento previo PRO-339-D01 exigía detenerse después del informe técnico.
- Una vez ratificada la opción y las reglas, ChatGPT puede emitir orden única de desarrollo para Claude, detallando paths y verificaciones; cada archivo completo y actualizado, **uno por vez**, commit+push SHA completo y PARAR para auditoría independiente R01.
- **NO EJECUTAR** tests, lint, typecheck, build, SQL, migrations, VM, Docker, gateway, navegador productivo ni deploy sin autorización independiente. El deployment exige verificar migraciones previamente pendientes, esquema real, empresa CASA MINGO y respaldo con responsable.
