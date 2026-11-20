# AUD-NEXIT-CATALOGOS-PRODUCTOS-DESKTOP-R01 — Auditoría del menú Catálogos de productos

**Fecha:** 2026-10-18. **Snapshot de código examinado:** `cb35cb35bda7179e09db683e48fdf104867f5f2a` en la branch `feature/NEXIT-2026-001-banco-demo`.
**Menú:** `Maestros → Catálogos de productos` / `/productos/catalogos`. **Producto exclusivamente desktop**, no exigir funciones ni capturas de celular.
**Veredicto:** **CORRECCIONES SOLICITADAS, 1 ALTA + 1 MEDIA; NO HOMOLOGADO**. Hallazgos estáticos reproducibles por el orden de eventos del código; sin reproducción en navegador o DB. Esta auditoría no autoriza cambios funcionales ni ejecución operacional.

## 1. Normas, antecedentes, alcance y método

Leídos `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, `documentacao/v1/auditoria-por-menu/AUD-CATALOGOS-PRODUCTOS-V1.md` §§I–VIII (CAT-A01…CAT-A06, R02 y R03, **aceite estático previo de CAT-R02-01**), así como árbol Git del snapshot indicado. La historia de 12/10 no equivale a fallos actuales sin reconfirmación.

- **UI:** `app/(private)/productos/catalogos/page.tsx` (~685 líneas) y CSS local (~157); tabs Categorías, Marcas, Familias, Líneas, búsqueda/estado/filtros, ordenación, paginación de 20, altas, edición, activación/inactivación, avisos, foco, dirty guard y errores.
- **HTTP:** ocho rutas `app/api/productos/{categorias,marcas,familias,lineas}/route.ts` y `[id]/route.ts`. Los handlers delegan a `lib/productos/catalogos-admin.ts` (~300 líneas), revisado directamente. Verbos GET con PRODUCTOS.VER, POST con PRODUCTOS.CREAR, PUT con PRODUCTOS.EDITAR. **No hay DELETE físico** en este menú.
- **Servicios:** `lib/productos/catalogos-carga.ts`, `catalogos-admin.ts`, `catalogos-formulario.ts`, `catalogos-version.ts`, `catalogos-estabilizacion.casos.ts`, `jerarquia-catalogos.casos.ts`, `historicas.ts`, integración con ficha Productos y `lib/ui/proteger-cambios.ts`.
- **Persistencia:** NEX-004 (Categorías/Marcas y triggers `actualizado_at`), NEX-017 (Familias/Líneas, FK de familia y UNIQUE), NEX-020 (índices normalizados y `catalogo_producto_guardar` SECURITY DEFINER para Categorías/Marcas), NEX-044 (Familia→Categoría y triggers de coherencia). Versiones representadas por `to_char(actualizado_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`. Lectura estática de SQL; **no** se infiere qué migraciones están realmente instaladas.
- **Límites honestos:** no se ejecutaron tests locales ni globales, API HTTP, render real, PostgreSQL, Docker, VM, CI ni SQL. La lectura de ocho wrappers/API y helpers no sustituye tests de transacción/locks reales. La homologación desktop pertenece al responsable.

## 2. Hallazgos nuevos

### CAT-D01 — ALTA — Interacciones UI durante un POST/PUT pueden destruir el contexto actual y mezclar listas de pestañas

**Evidencia verificable:**
- `app/(private)/productos/catalogos/page.tsx:225–275`: `guardar` establece `guardando=true` y espera `enviar`, pero al completar con éxito ejecuta **incondicionalmente** `setAviso(...)`, `cerrarFormulario()` y `await cargar()`, usando el `tipo` y el callback `cargar` capturados al iniciar la operación.
- `page.tsx:141–155,366–375`: `cambiarTab` no verifica `guardando`; las pestañas permanecen activas mientras el POST/PUT está en curso. Si el formulario es sucio, hay confirmación de descarte, **pero confirmar el descarte no cancela la petición ya enviada**.
- `page.tsx:342–356,469–479,615–639`: controles Nueva, Cancelar, Editar, Activar/Inactivar tampoco quedan deshabilitados durante `guardando` (solo submit está deshabilitado en ~479). Se puede crear/abrir otro formulario mientras la operación previa sigue pendiente.
- `page.tsx:76–110`: la compuerta `crearCompuerta` únicamente preserva **la última petición iniciada**. Un `cargar()` tardío de la pestaña anterior, lanzado tras terminar el POST/PUT, obtiene el token más reciente y **puede sobrescribir `filas/permisos/familias/categorias` de la pestaña actual**.

**Secuencia determinista por código:** editar una Categoría; pulsar «Guardar»; antes de recibir respuesta cambiar a Marcas y confirmar; el GET Marcas termina; después termina PUT Categoría y su handler original llama a `cerrarFormulario()` y lanza `cargar()` de Categorías, ganando el token. Resultado posible: el título/tab seleccionado es Marcas, pero las filas/acciones exhiben datos de Categorías; si el operador abrió formulario de Marca, este puede desaparecer. De modo semejante, Cancelar/Nueva o Editar durante la petición pueden perder el nuevo borrador.

**Impacto:** mezcla de contexto y pérdida visual de formulario, acciones sobre línea/tab incompatibles y confusión de éxito. La API mantiene su transacción y política RBAC/versiones: **no hay prueba de escritura a otra tabla por SQL**, pero la pantalla deja de representar el catálogo actual.

**Corrección mínima:** estado de operación que impida o coordine cambios de contexto mientras se guarda; al terminar, actualizar solamente el catálogo y formulario aún vigentes (token/generación/tab actual), sin que un GET de pestaña anterior se convierta en último token; impedir abrir/cancelar/navegar a otro registro durante POST/PUT o gestionar explícitamente fin/cancelación sin destruir datos. Respetar consentimiento del usuario, sin fingir aborto de escritura HTTP ya enviada. Test **React/interacción dirigida** con promesas controladas para PUT lento → cambio de pestaña, abrir nuevo formulario, cancelar y cambio de estado mientras guarda; comprobar que ninguna lista/permiso/draft viejo pisa la vista actual.

### CAT-D02 — MEDIA — Errores de activación/inactivación desaparecen inmediatamente tras `cargar()`

**Evidencia verificable:**
- `page.tsx:278–305` `cambiarEstado` captura error HTTP 409/403/500 en `catch`, hace `setError(mensaje)` y **enseguida llama `await cargar()`** para recuperar datos vigentes.
- `page.tsx:79–85` `cargar` ejecuta `setError("")` al comenzar, antes de la consulta HTTP. No hay estado separado para error de la mutación. `page.tsx:380–384` muestra solo `error`; se elimina el mensaje **en la misma secuencia asíncrona**, independientemente del resultado del GET.
- El error de carga principal se almacena correctamente en `errorCarga`, pero esto es diferente del error en la mutación (p. ej. «otro usuario modificó el registro»). Existe el contraste explícito: `guardar()` conserva su mensaje en `errorForm`.

**Reproducción por lógica:** abrir Categorías; otro usuario actualiza la categoría → pulsar Inactivar en registro obsoleto → PUT retorna 409 → `setError(409)` seguido de `cargar()`, que lo borra al inicio. El operador ve que el botón no produjo el efecto, pero no ve el motivo ni la necesidad de reintentar.

**Corrección mínima:** separar `errorAccion` y `errorCarga` o permitir `cargar({limpiarErrorAccion:false})` tras la mutación fallida, conservar el error hasta que el usuario cambie de acción o efectúe un reintento; mantener refresh de datos actualizado y 409 obligatorio. Test focal para PUT rechazado 409/403/500 seguido de GET correcto y fallido, validando mensaje persistente y ausencia de cambio de estado engañoso.

## 3. Correcciones anteriores presentes en el corte — NO reabrir

| Antecedente | Código actual revisado | Veredicto estático |
|---|---|---|
| CAT-A01 / R02-01: error principal/auxiliares no debe dejar guardar | `cargarCatalogoCompleto` verifica HTTP/shape; `cargaConfiable` + `permisosVigentes` neutralizan permisos bajo carga/error; `guardar/cambiarEstado` llaman `motivoBloqueoGuardar` | **Presente**, no reabrir |
| CAT-A02: fetch antiguo de pestaña previa | `crearCompuerta` token vigente antes de aplicar GET | **Presente** para fetch vs fetch. CAT-D01 es carrera **mutación vs fetch**, no repetición de CAT-A02 |
| CAT-A03: dirty guard sidebar | `useProtegerCambios(sucio)` y `confirmarDescarte` para acciones internas | **Presente**; no controla petición de mutación ya iniciada |
| CAT-A04: referencias inactivas en Productos | `catalogosConHistoricas` + GET ficha por empresa y referencia | **Presente**, menu Productos se audita separado |
| CAT-A05: inactivar con descendientes | `nFamilias/nLineas` calculados en SQL, `textoConfirmarInactivacion` avisa vínculos sin cascada | **Presente** |
| CAT-A06: precondición de versión | `exigirVersionCatalogo` tras advisory lock + select/rowlock donde permitido, 409 obsoleto; `actualizado_at` usa triggers NEX-004/NEX-017; `catalogo_producto_guardar` controla Categorías/Marcas | **Presente**; tests de concurrencia real PG aún pendientes |

**Jerarquía de negocio preservada:** Categoría→Familia→Línea y Marca independiente, ninguna reclasificación/cascada implícita; Familia antigua sin Categoría puede permanecer/editarse; nuevos vínculos exigen padres activos por API; contadores «Productos (total)» abarcan directos activos/inactivos, no todos los descendientes. Código y nombres/índices de empresa leídos, no asumir diferencias en el DB real.

## 4. Observaciones para validación (NO atribuir defecto sin pruebas)

- **CAT-O01 — posible carrera de estado del padre:** `familiaDeLaEmpresa` / `categoriaDeLaEmpresa` hacen `SELECT activo` sin bloqueo explícito; cambio concurrente de `activo` de padre después de validación, antes de INSERT/UPDATE de hijo, puede merecer prueba de dos transacciones. La FK garantiza existencia, no necesariamente estado `activo`; **no se ejecutó PG ni se declara violación real observada**. No introducir locks que generen deadlocks ni alterar NEX-044 sin test y decisión.
- **CAT-O02 — recuperación de error con borrador:** cuando falla la carga principal/auxiliar con formulario ya abierto, se conserva el borrador y se bloquea Guardar, pero el mensaje pide «recargue la página». No se ve botón de reintento focal que preserve ese borrador durante reload; preferible permitir reintentar carga sin perder campos. Es mejora de UX; probar navegación real antes de elevar prioridad.
- **CAT-O03 — confirmación nativa `window.confirm`:** existen avisos de dependencias y descarte; no marcar ausencia de confirmación ni exigir por defecto responsive móvil. La apariencia profesional desktop precisa aceptación humana.
- **CAT-O04 — listados completos:** GET consulta todas las filas del catálogo por empresa, paginación local a 20; volumen no medido y anterior reporte menciona 51 Familias/203 Líneas, **no es problema de escala confirmado**.

## 5. Próximos pasos y políticas

**Aclaración del responsable:** auditar **menú por menú**, documentar y avanzar; no mezclar con correcciones de Dashboard/Clientes/Proveedores/Productos ni emitir tareas de implementación por iniciativa del auditor.

- Si el responsable autoriza arreglar CAT-D01/D02: Claude lee protocolos, progreso y este informe; cambia solo UI/controladores puntuales del menú, mantiene permisos/versión/filtros/jerarquía, corre testes *focales* de mutación lenta/tabs/error 409, lint de archivos tocados; commit/push y parar para auditoría ChatGPT.
- **Prohibido por defecto** tsc, build, lint global, suite integral, CI manual, VM/SQL/PostgreSQL operacional, migrations/DDL y deploy por IA.
- **Menu 5 CATÁLOGOS DE PRODUCTOS:** auditoría de código documentada con **1 ALTA + 1 MEDIA**, no cierre de homologación del producto. Catálogos históricos NEX-004/017/020/044 y grants DB reales no reejecutados ni verificados.
- **Próximo menu de Maestros:** `Listas de precios` — auditoría independiente solo cuando el responsable la solicite.
