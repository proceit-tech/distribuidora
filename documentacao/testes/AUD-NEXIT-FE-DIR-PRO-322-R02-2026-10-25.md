# AUD-NEXIT-FE-DIR-PRO-322-R02 — Auditoría estática independiente (25/10/2026)

> **RECTIFICACIÓN EXPRESA POSTERIOR DEL RESPONSABLE — 25/10/2026 / PREVALECE:** La afirmación R02 de que el distrito es opcional como regla de NEXIT es incorrecta: fue una confusión entre SIFEN D221 (0–1) y la regla interna confirmada **domicilio fiscal paraguayo 100% completo o 100% ausente**. `cDisRec` es obligatorio cuando se informa dirección nacional, junto con calle, número, departamento, ciudad y país PRY. Por tanto, **F001-R02 («aptitud exige distrito») es FALSO POSITIVO**: `validarDireccionFiscal` compartido es correcto y NO debe relajarse. La R02 introdujo una **regresión funcional nueva F004-R02 ALTA** en `payload-fe.ts` al permitir ausencia de distrito: revertir esa opcionalidad en validación/JSON de FE NUEVA y asegurar que sin calle pero con cualquier otro dato domiciliario se rechace en vez de silenciarlo. **F002-R02 (mismo key con contenido comercial diferente) y F003-R02 (reintento histórico atado a catálogo actual) permanecen abiertos.** Contrato JSON externo también pendiente. La orden R03 debe reparar F004 + F002 + F003, y no modificar innecesariamente Clientes/Proveedores. Fuente: [REQ FE-DIR 4.2](../definicoes/REQ-NEXIT-FE-DIRECCION-RECEPTOR-INFO-ADICIONAL-2026-10-25.md). Lo que sigue registra la auditoría anterior y está revocado donde contradiga esta rectificación.


**Veredicto: NO CONFORME. No desplegar ni emitir FE real.**

**Código auditado:** commit Claude `a22e511846f78487e384f64551a9c40b21e840cb` (parent documental `27794fde3cb4b8d627c0921c39d2dc1abf4a4f80`; implementación funcional previa `16a1a85b22bab1a25bf20656a9a2d023b06cc452`). El diff R02 modifica exclusivamente `lib/facturacion/emision.ts` (60 líneas cambiadas) y `lib/facturacion/payload-fe.ts` (21 líneas cambiadas). Branch confirmada idéntica al SHA al iniciar auditoría. **Pruebas 0, no ejecutadas por orden del responsable.** Revisión estática de archivos completos implicados y SQL versionado NEX-048, NEX-067, NEX-068, sin ejecución en PostgreSQL/VM/gateway.

## Conforme estáticamente en el patch

- `domicilioFiscalJSON` no emite `cDisRec` cuando el distrito no fue informado; conserva departamento y ciudad obligatorios para el domicilio nacional con calle, país siempre presente y excepciones B2F.
- `validarGeografiaReceptor` utiliza consulta parametrizada a catálogos: departamento activo, ciudad activa perteneciente al departamento y, cuando existe distrito, perteneciente al departamento y coincidente con la ciudad. `lib/geografia/referencia.ts` permanece intacto.
- `payloadHistorico` recupera, desde `documento_electronico_solicitudes` de la misma empresa y la FE con clave de idempotencia, la versión 1 sin las claves que SQL agrega al registrar, y contrasta SHA-256/UTF8 del JSONB contra `entrada_hash`. La fórmula concuerda con `NEX-048-facturacion-emision-fe.sql::fe_documento_crear_fe`, que aplica `encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex')`. Este control certifica la integridad del **payload histórico**, NO la equivalencia con la solicitud actual.
- No se detectan cambios a SQL, migrations, PDFs, NCE, `dInfAdic` o el helper de geografía compartido.

## Hallazgos R02

### F001-R02 — ALTA — distrito sigue siendo obligatorio por puerta de aptitud anterior

En `prepararFactura`, **siempre** se ejecuta `evaluarAptitudCliente` y se rechaza si `!aptitud.apto`. Ese método usa `lib/fiscal/aptitud-sifen.ts::evaluarAptitudSifen`, que invoca `lib/fiscal/campos-receptor.ts::validarDireccionFiscal` con `geo.exigir=true` para operación diferente de B2F. El código vigente de `validarDireccionFiscal` exige simultáneamente **departamento, distrito y ciudad** (`if (geo?.exigir && (!geo.departamento || !geo.distrito || !geo.ciudad))`, líneas 112–114). Por tanto, un receptor PRY con departamento y ciudad pero sin distrito **sigue bloqueado antes de llegar al nuevo validador**. F001 corregida en construcción del JSON, **NO cerrada funcionalmente**.

**R03:** ajustar la regla fiscal de aptitud de modo coherente con la opcionalidad D221 sin rebajar la verificación de departamento/ciudad ni la validez del resto del cliente. Revisar llamadas del helper compartido y la posibilidad real de guardar/consultar dirección nacional sin distrito (la carga geográfica de Clientes hoy encadena Departamento→Distrito→Ciudad). No debilitar catálogos, no inventar distrito, limitar cambios al mínimo imprescindible y documentar bloqueo si una restricción heredada lo impide sin migración.

### F002-R02 — ALTA — reutilización de clave para contenido DISTINTO

`crearFacturaElectronica` comprueba que la clave existe, lee `payloadHistorico` y, si su hash coincide con el guardado, **reemplaza incondicionalmente** `preparada.payload` con `historico`, además de sustituir `totalTexto` por el total histórico. No contrasta los nuevos datos de la operación con los datos de origen persistidos antes de llamar a `fe_documento_crear_fe_con_stock_entrega`.

**Reproducción lógica:** primera FE `K` ítem A/total Gs. 100.000. Segunda solicitud `K` ítem B/total Gs. 200.000, con todos los datos actuales válidos. R02 sustituye el JSON de B por el de A; `NEX-048::fe_documento_crear_fe` verifica únicamente el hash del JSON recibido (A), encuentra `entrada_hash` de A y devuelve el documento anterior como `reutilizado`, en lugar de rechazar `NEX:IDEMPOTENCIA_CONFLICTO`. También puede ignorar diferencias en cliente, condición de pago, cantidad, descuentos, destino u otros campos de la solicitud.

**R03:** mantener la reutilización legítima del payload fiscal ya persistido frente a alteraciones posteriores del catálogo, pero exigir **equivalencia demostrable de la solicitud de negocio actual** respecto de la original antes de sustituir el payload: empresa, cliente, sucursal/punto, operación, ítems/cantidades, pagos/crédito, moneda, descuentos, entrega y demás datos controlados por el solicitante según fuentes inmutables disponibles. No comparar ciegamente valores derivados de maestros vivos. Si no existe información histórica suficiente para comprobar un campo relevante, **fallar cerrado con conflicto explícito**, sin afirmar equivalencia y sin introducir tablas/migrations o reglas comerciales arbitrarias. Nunca hacer que una clave usada con contenido diferente devuelva éxito silencioso.

### F003-R02 — MEDIA — reintento histórico continúa sujeto a aptitud geográfica actual

Aunque `domicilioHistorico=true` salta `validarGeografiaReceptor` y `erroresDomicilioReceptor`, `prepararFactura` sigue aplicando `evaluarAptitudCliente` y datos del receptor actual. `lib/clientes/aptitud-cliente.ts` consulta exclusivamente `referencia_geografica_paises WHERE activo = true`; `evaluarAptitudSifen` rechaza país del receptor/domicilio desactivado y aplica `validarDireccionFiscal` con los datos actuales. Ejemplo: después de registrar la FE y sin cambiar la solicitud del operador, el catálogo de país pasa a inactivo; la aptitud devuelve no apto y el reintento recibe 422 pese al snapshot histórico íntegro. También el validador FE mantiene el rechazo B2F con dirección actual vacía.

**R03:** evitar que las nuevas/anteriores revalidaciones fiscales de catálogo actual alteren indebidamente la reutilización de una FE persistida con entrada equivalente, manteniendo controles de autorización, alcance de empresa/sucursal y errores genuinos. No usar `domicilioHistorico` como permiso para ignorar datos de entrada diferentes ni eludir toda la aptitud sin delimitar caso.

## Gate externo y riesgos

**Sin contrato JSON comprobado** para claves/tipos `cDepRec`, `cDisRec`, `cCiuRec` como numbers ni derivación de descripciones `dDesPaisRe` / `dDesDepRec` / `dDesDisRec` / `dDesCiuRec` por el proveedor. Esto NO es defecto demostrado en TS pero **impide homologación y emisión fiscal real**. Obtener evidencia con proveedor y revisar una FE controlada en momento autorizado. No confundir campos XML SIFEN con esquema JSON del gateway.

**NEX-072 no aplicada**. No abrir E03-A2/B/E08/E09, PRO-323, ni operar VM/SQL/Gateway.

## Gate y seguimiento

**Próxima orden Claude exclusivamente R03/PRO-322 — cerrar F001-R02, F002-R02 y F003-R02.** Leer contexto Git actual; modificar solo el mínimo necesario. No crear/ejecutar tests, lint, typecheck, build, CI manual, migración ni acceso a DB/VM/gateway, por orden específica FE-V1 vigente. Commit/push/SHA y PARAR. ChatGPT realizará AUD-R03 con diff y fuentes completas antes de avance. PRO-322 permanece **In Review — NO CONFORME**, no Done ni homologada.
