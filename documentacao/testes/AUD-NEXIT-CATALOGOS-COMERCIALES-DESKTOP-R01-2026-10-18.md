# AUD-NEXIT-CATALOGOS-COMERCIALES-DESKTOP-R01 — Auditoría por menú «Catálogos comerciales»

**Fecha:** 2026-10-18. **Corte Git inmutable:** `adcd75dee93955644977a1fa095647e95d6b327f` en `feature/NEXIT-2026-001-banco-demo`.
**Producto:** ERP exclusivamente **desktop**; NO exigir interfaz o pruebas para teléfonos.
**Veredicto:** **CORRECCIÓN SOLICITADA — 2 ALTAS + 1 MEDIA (contrato de respuesta incompleta); NO HOMOLOGADO**. Los resultados son de inspección estática del código, NO de ejecución ni de prueba operacional.
**Normas:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, `documentacao/v1/auditoria-por-menu/AUD-CATALOGOS-COMERCIALES-V1.md` §§I–VIII, incluyendo reauditoria R04 (13/10) de la precisión decimal. El historial de hallazgos corregidos no se presenta como abierto por defecto.

## 1. Menú, submódulos, fuentes y límites de prueba

| Submódulo | UI/HTTP/reglas rastreadas | Resultado de inspección |
|---|---|---|
| **Tipos de cambio** | `/catalogos-comerciales` pestaña «Tipos de cambio»; `GET/POST /api/catalogos-comerciales/tipos-cambio`, `PUT /[id]` para «Corregir» (nueva versión), `POST /[id]/anular`. Valor PYG por una unidad de moneda extranjera, fecha, cotización decimal exacta, versión, autor, motivo, anulación/consulta de historial, filtro por fecha/moneda y orden. | Servidor exige `LISTAS_PRECIO.VER/CREAR/EDITAR` según acción; `empresa_id` proviene de sesión; corrección retira vigente y crea versión siguiente en transacción; anulación lógica preserva filas. Contratos fiscales/comerciales antiguos preservados. |
| **Canales de venta** | `GET/POST /api/catalogos-comerciales/canales-venta`, `PUT /[id]`; código/nombre/activo, confirmación de inactivar, usuarios y clientes con vínculos | Locks de edición y versión en API, validaciones de código/nombre, aislamiento empresarial y conteos de vínculos presentes. No DELETE físico. |
| **Zonas comerciales** | `GET/POST /api/catalogos-comerciales/zonas`, `PUT /[id]` | Mismos contratos de Canales; histórico inactivo de Clientes conservado. |
| **UI compartida** | `app/(private)/catalogos-comerciales/layout.tsx` (9 líneas), `page.tsx` (~722), `lib/comercial/{servidor,carga,formulario,validacion,version,vinculos,cambio-decimal}.ts` e `lib/productos/catalogos-carga.ts` | Filtros, paginación 20, tabs, validaciones, confirmaciones, protección de cambios sin guardar, token GET contra respuestas obsoletas, errores y permisos inspeccionados. |
| **SQL** | NEX-004 (Canales/Zonas); NEX-005 (FK Clientes), NEX-008/018 (listas y reglas), NEX-045 y `scripts/reversion-NEX-045.sql` | Índices empresa+nombre/código, FK, cotización `numeric(18,6)`, versión única empresa/fecha/moneda, una sola vigente, trigger inmutable sin DELETE, grants y reversión protegida por migraciones posteriores *están versionados*. **NO comprobado qué está aplicado** en PostgreSQL real. |
| **Pruebas** | `lib/comercial/estabilizacion.casos.ts`, `lib/clientes/comercial.casos.ts`, `lib/listas-precio/listas-comerciales.casos.ts` | Casos históricos de versión, respuestas fuera de orden GET, permisos bajo carga, vínculos y 6 decimales presentes; **no se ejecutaron** ni se realizó simulación React de mutación lenta+tab. |

**Fuera de alcance deliberadamente:** generar nueva política FX automática, motor de conversión/precedencia de descuentos, móvil, instalar migraciones, aplicar SQL, VM, Docker, desplegar, modificar código funcional o encargar nuevas tareas a Claude sin decisión del responsable.

## 2. Hallazgos actuales

### CC-D01 — ALTA — CREAR-only no puede abrir el menú ni registrar cotizaciones/canales/zonas desde la UI

**Evidencia exacta:**
- `app/(private)/catalogos-comerciales/layout.tsx:6` aplica `guardPage("LISTAS_PRECIO","VER")` a toda la página.
- `lib/comercial/servidor.ts:31–48`: los GET exigen VER, `crearSimple` (~123–139) y `crearCambio` (~201–228) exigen CREAR y admiten un actor con solo CREAR.
- `page.tsx:368–375`: el botón «Nuevo» depende de permisos devueltos por GET, imposible de consultar para quien no tenga VER; `lib/navigation/menu.ts` oculta ruta para el perfil que carece de VER.

**Impacto:** perfil empresarial autorizado para crear, sin permiso VER, puede usar el POST correctamente por contrato, pero no puede realizar la operación en la interfaz. No implica bypass de acceso; el backend exige permisos y empresa.

**Criterio:** entrada controlada y ruta de alta con CREAR separadas de la consulta/listado VER; evaluar catálogos auxiliares mínimos necesarios para capturar fecha/moneda y código/nombre sin exponer datos de otros clientes o listas; conservando permisos, usuario y aislamiento de empresa. No otorgar VER implícitamente. Tests focales por perfil CREAR-only, VER-only, EDITAR-only, admin y sin permiso; verificar catálogo sin fuga de datos.

### CC-D02 — ALTA — Respuesta atrasada de mutación pisa estado de otra pestaña y puede destruir un formulario nuevo

**Evidencia exacta:**
- `app/(private)/catalogos-comerciales/page.tsx:223–275`: `guardar` toma `meta.ruta`, `tab`, `form` y `cargar` del render inicial; establece `guardando=true`, ejecuta POST/PUT y, en éxito, siempre llama `cerrar()` y `await cargar()` con el contexto **capturado** de la pestaña anterior.
- `page.tsx:138–155,368–389,476–489,654–688`: `cambiarTab`, botón Nuevo, Cancelar, Editar, Corregir e Inactivar/Anular siguen disponibles durante `guardando`; **solo submit está deshabilitado** por `guardando`. La confirmación de descarte al cambiar de tab no revierte ni cancela una mutación HTTP en vuelo.
- `page.tsx:85–108`: `compuerta.current.nueva()` preserva la **última carga iniciada**. Un `cargar()` tardío de la pestaña antigua, invocado después de la mutación, inicia un request nuevo con token mayor y puede sobrescribir las filas/monedas/permisos de la pestaña actual.

**Secuencia lógica:** editar un Canal y pulsar Guardar → antes de PUT responder confirmar cambio a Zona → GET Zona termina → PUT Canal responde 200 → callback antigo `cerrar()` borra eventual formulario Zona e inicia GET Canal, que gana token y sustituye `filas` cuando `tab` visible todavía es Zona. Con una mutación fallida, el `catch` también puede mostrar errores en un formulario distinto. El problema afecta igualmente versiones de cambio y cambio de historial mientras guarda.

**Impacto:** pérdida de rascunho y mezcla de resultados/permisos/acciones de módulos visibles. El servidor determina tipo de tabla por endpoint capturado y filtra empresa: **no hay evidencia de que mutación escriba en tabla errónea del PostgreSQL**.

**Criterio:** bloquear/coordenar contextos de pestañas, Nuevo, Cancelar, selección de filas y filtros mutables mientras hay mutación pendiente, o comprobar generación/tab/formulario vigente antes de cualquier cierre/error/refresh. No suponer que se puede deshacer automáticamente un PUT que ya llegó al servidor; mantener confirmación de descarte y protección de mudanças. Tests puntuales de POST/PUT lento → tab distinta, nuevo formulario, Cancelar, historia y 409; verificar que contexto viejo no cierre ni pinte nueva pestaña.

### CC-D03 — MEDIA, fallo de robustez condicional — Carga de «Tipos de cambio» acepta HTTP 200 sin el catálogo obligatorio de monedas

**Evidencia:** `lib/comercial/carga.ts:39–46` verifica arreglo principal (`tiposCambio`) y dos booleanos de permiso, pero `monedas` solo se valida **si existe**: `if (j.monedas !== undefined && !Array.isArray(j.monedas)) ...`; un JSON `{tiposCambio:[],permisos:{crear:true,editar:true}}` devuelve `error:""`, `monedas:null`, permisos de alta activos. `page.tsx:104` conserva `monedas` antiguas o la inicial `[]` si no llegan, mientras `:368–375` permite Nuevo y `:430–438` renderiza selector sin opciones. Esto contradice el propósito de la guardia «carga confiable» del contrato de Tipos de cambio.

**Límite de severidad:** el endpoint **actual** `lib/comercial/servidor.ts:173–187` siempre incluye el catálogo de monedas en su respuesta normal exitosa. Por lo tanto **no se afirma que el problema ocurra en una llamada normal**, solo ante un payload 200 incompleto/malformado (regresión contrato mock/gateway/proxy) o cambio futuro accidental. No se reporta fuga ni escritura inconsistente.

**Criterio:** exigir `monedas` array no `tipos-cambio` antes de liberar `crear/editar`; conservar la opcionalidad en Canales/Zonas (no necesitan monedas), limpiar opciones obsoletas ante fallo, mostrar error claro e intento de recarga. Test puro 200 incompleto, 200 `monedas:[]` legítimo, payload correcto, 500 y falta permisos. No migración.

## 3. Correcciones históricas confirmadas en el código, NO reabrir

- CC-A01: `SQL_VERSION_COMERCIAL` con µs + `SELECT FOR UPDATE` y 409; canales/zonas no sobreescriben edición simultánea.
- CC-A02: `useProtegerCambios(sucio)` y `confirmarDescarte` en navegación; guard protege salida pero **no** escrituras pendientes (diferencia específica de CC-D02).
- CC-A03: `crearCompuerta` descarta respuesta GET obsoleta en cambio de tab/historial; CC-D02 es request GET **iniciado después de una mutación tardía**, no la antigua race GET-versus-GET.
- CC-A04: fallas 401/403/500/JSON inválido de lista principal vacían datos/permiso y bloquean Guardar; CC-D03 es forma incompleta exclusiva de respuesta monedas.
- CC-A05 y CC-R03-01: conversión/formatación/comparación de `numeric(18,6)` mediante strings exactas (`formatearCambio`, `compararDecimales`, `igualDecimal`, `normalizarCambio`); datos extremos `123456789012.000001` vs `.000002` no vuelven a perder precisión en render/corrección.
- CC-A06: reversión NEX-045 incluye guardas previas de ledger migraciones posteriores y grants dinámicos, **nunca ejecutada**.
- CC-A07: conteo de `clientes` separado de listas/reglas por empresa, confirmación de inactivación para ambos y vínculos históricos preservados. No inventar eliminación de clientes.
- Cotización 100% manual, versionada, sin conversión automática a precios; no mutar estructura de `REF-VENTA` ni precios de Listas.

## 4. Observaciones y límites sin hallazgo adicional confirmado

- **CC-O01:** se usan confirmaciones nativas `window.confirm` para anular e inactivar y descartar cambios. Existen, no afirmar que falta confirmación; la padronización de diálogos desktop puede planificarse después.
- **CC-O02:** la tabla presenta versiones retiradas como «Reemplazada» si hay otra versión de la misma fecha/moneda con número mayor, aun si la anterior se anuló por un acto independiente antes de un alta posterior. Ese criterio describe secuencia de versiones y no identifica necesariamente motivo jurídico/operativo del retiro. Si se exige distinguir anulación manual y corrección, requiere contrato/procedencia explícitos, no un simple cambio cosmético.
- **CC-O03:** la consulta completa de histórico de cambios, canales y zonas no tiene paginación SQL; el navegador pagina en 20. Sin volumen/tiempo medidos, riesgo de escala, no bug comprobado.
- **CC-O04:** el nuevo permiso específico para cambios/canales/zona no existe: se heredan acciones `LISTAS_PRECIO` según decisión de negocio. No crear permisos espontáneos ni conceder acceso fuera de la matriz acordada.

## 5. Estado, testes futuros y continuidad

**Resultado de esta rodada:** auditoría por menú documentada, **2 ALTAS + 1 MEDIA condicional**, sin aprobación visual ni operacional; pendientes requieren decisión de corrección por el responsable. Claude Code solo implementará una tarefa localizada tras autorización expresa y test básicos de la funcionalidad tocada, sin suite global, build/tsc/lint global, CI manual, SQL/VM/PG/deploy. ChatGPT hará reauditoría de SHA posterior.

**Próximo menú de la V1:** **Inventario → Stock**, aparte y **solo cuando el responsable lo pida**. Catálogos comerciales queda con achados documentados, sin mezclar cambios del inventario.
