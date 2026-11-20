# AUD-NEXIT-DEPOSITOS-DESKTOP-R01 — 18/10/2026

**Menu 10:** Inventario → Depósitos. **Ruta:** /depositos. **Rama:** feature/NEXIT-2026-001-banco-demo.
**Veredicto:** AUDITORÍA ESTÁTICA DOCUMENTADA CON HALLAZGOS ABIERTOS; SIN HOMOLOGACIÓN. **Correcciones no autorizadas en esta fase.**
**Corte:** revisión de archivos leídos directamente en la rama; blobs de la pantalla 1d87293dd8223dffd13484c69d643c43354f83e1; servicio shared 7e38fc3b86fc3cc2638da7effc866d1b83d6567b; migration NEX-046 4855ce4b7b74657fa3cb573de3753ffc03ff39ec. No se afirma SHA HEAD global a partir de un blob.
**Método:** lectura de CLAUDE.md, PROTOCOLO-IA.md, PROGRESSO, definición aprobada del Inventario, auditoría integrada 13/10, página completa (681 líneas), componentes/validaciones/cargas, seis endpoints, autorización, SQL NEX-046 completo (432 líneas), helper de alcance de Movimientos y suite de pruebas existente. Solo inspección GitHub: 0 pruebas ejecutadas, 0 HTTP autenticado, 0 PostgreSQL/VM/Docker, 0 navegador ni capturas.
**Alcance:** ERP exclusivamente desktop; no abrir incidencia por falta de interfaz móvil.

## 1. Inventario técnico y reglas verificadas

| Capa | Evidencia examinada | Conclusión |
| --- | --- | --- |
| Navegación/layout | lib/navigation/menu.ts; app/(private)/depositos/layout.tsx | Ruta incluida en Inventario y protegida por INVENTARIO.VER. |
| Pantalla | app/(private)/depositos/page.tsx:27–681; componentes de tabla/orden; CSS reutilizado | Una página con lista, filtros código/nombre/sucursal, estado, orden, formulario en línea, panel usuarios y historial; sin subtelas /nuevo o /[id]. |
| Alta/edición | lib/depositos/validacion.ts; POST /api/depositos; PATCH /api/depositos/[id] | Código 1–30 ASCII con formato, único sin distinguir caja, inmutable; nombre ≤120, sucursal UUID; asignación explícita opcional del creador. |
| Estado | POST /api/depositos/[id]/estado | No DELETE físico; inactivación bloqueada con cualquier saldo; lectura histórica de inactivos. |
| Acceso y auditoría | GET/POST /api/depositos/[id]/usuarios; DELETE /api/depositos/[id]/usuarios/[usuarioId]; GET /api/depositos/[id]/historial-acceso | INVENTARIO.EDITAR, empresa y depósito del actor; vínculo solo para ASIGNADOS compatible con sucursal; eventos persistentes de cambios efectivos. |
| Sesión/seguridad | lib/depositos/servidor.ts; lib/depositos/shared.ts; lib/movimientos/historial.ts | Empresa/actor siempre de sesión; 401/403/404; filtros por alcance de depósito; no escritura SQL directa desde roles de app. |
| Cargas | lib/depositos/carga.ts; lib/inventario/validar-carga.ts | Comprobación HTTP y forma registro a registro; errores descartan lista/permisos y permiten reintento; compuertas para respuestas tardías. |
| PostgreSQL | documentacao/banco/nexit/v1/migraciones/NEX-046-depositos-gestion.sql | SECURITY DEFINER, transacciones API; triggers de código/sucursal inmutable y guarda de saldo al inactivar; grant runtime restringido; log solo altas. Archivo versionado ≠ aplicado. |
| Integraciones | Stock, Movimientos, Productos > Inventario, Reposición | Depósitos solo maestro y permisos; Ver stock usa filtro real /stock?deposito=id; efecto físico solo en Movimientos; umbrales de stock solo en Productos. |
| Pruebas existentes | lib/inventario/depositos.casos.ts y auditorías INV-R02…R05 | Cobertura de helpers/cargas y fragmentos estáticos; no reproduce interacciones reales de guardado, solape de mutaciones, cambios de permisos en formulario abierto ni edición simultánea. |

## 2. Hallazgos nuevos — sin duplicar INV-05 ni INV-R02…R05

### DEP-D01 — ALTA — la operación de guardar no inmoviliza el formulario ni su identidad
**Evidencia:** app/(private)/depositos/page.tsx:133–184 y :309–313, :346–395, :653–659. Guardar activa guardando, pero solo deshabilita el botón submit. Campos, Cancelar, Nuevo depósito y Editar en otra fila siguen activos; abrir/cerrar cambian form/base mientras el POST/PATCH está pendiente. El éxito de la solicitud anterior siempre ejecuta setForm(null), setBase(null), setAviso y cargar sin cotejar la identidad del formulario vigente.
**Impacto comprobable por código:** un POST/PATCH A pendiente puede cerrarle al usuario el formulario B ya editado, o mostrar éxito del payload anterior después de que se cambiaron campos, perdiendo el borrador B o induciendo falsa creencia de que la edición posterior persistió. No es doble movimiento físico, ni se demuestra corrupción SQL.
**Aceptación:** congelar edición/cambio de entidad/cancelación mientras una mutación está en curso, o vincular snapshot/versión local y respuesta al formulario exacto; tratar fallos ambiguos sin afirmar reversión; preservar borrador ajeno. Probar A pendiente → B abierto → A 201/200 tardío, cambio de nombre durante PATCH, error y reintento.

### DEP-D02 — ALTA / DECISIÓN DE POLÍTICA RBAC — permisos de acción y acceso a la pantalla divergen
**Evidencia:** lib/navigation/menu.ts (Depósitos → INVENTARIO.VER); app/(private)/depositos/layout.tsx:4 exige VER; lib/depositos/servidor.ts:25–56 habilita CREAR/EDITAR en API; NEX-046:16–18, :219–220, :264–265 y :338–339 reconoce permisos separados. No existe ruta alternativa de alta/gestión.
**Impacto:** actor con INVENTARIO.CREAR sin VER puede consumir POST autorizado pero no abrir el formulario desde la aplicación; EDITAR sin VER tampoco alcanza gestión UI. A diferencia de Movimientos, no se identificó decisión explícita VER+CREAR como requisito acumulativo para Depósitos.
**Aceptación:** decidir si VER es precondición formal de estas acciones o ajustar navegación/layout para una entrada compatible y segura; documentar política y probar VER-only, CREAR-only, EDITAR-only, VER+CREAR, VER+EDITAR y administrador, sin rebajar protección API/SQL ni asumir concesión automática de permisos.

### DEP-D03 — MEDIA — el checkbox «Asignarme este depósito» se excluye de cambios no guardados
**Evidencia:** lib/depositos/validacion.ts:30–35, formularioDepositoSucio compara solo codigo/nombre/sucursalId; app/(private)/depositos/page.tsx:79–83 y :377–386 vincula asignarme al formulario, pero no al dirty guard.
**Impacto:** con alta nueva en blanco, desmarcar Asignarme y pulsar Cancelar/Nuevo o navegar no activa confirmación; se descarta la preferencia operativa, relevante para la visibilidad posterior del depósito.
**Aceptación:** incluir la opción en la detección de cambios para creación, manteniendo el mismo comportamiento durante edición; probar solo checkbox, restablecer valor y navegación/cancelación.

### DEP-D04 — MEDIA — formulario/panel abiertos no reaccionan al permiso reducido tras nueva carga válida
**Evidencia:** page.tsx:84–89 recalcula puedeCrear/puedeEditar según GET vigente; :133–165 solo comprueba carga confiable para submit; :391–396 deja Guardar habilitado sin validar permiso pertinente; :212–221, :483–499 permiten acciones del panel sin confrontar puedeEditar si siguió abierto.
**Impacto:** después de una recarga 200 con crear/editar=false el botón Nuevo/Editar desaparece, pero un formulario o panel ya abiertos aún pueden intentar POST/PATCH/POST de usuario. API/SQL deniegan el permiso vigente: NO es bypass confirmado, pero la UI promete una acción inviable y no explica el cambio.
**Aceptación:** acciones de formularios/panel condicionadas a permiso actual, con preservación de lo digitado y mensaje explícito; prueba inicial EDITAR=true → nueva carga 200 EDITAR=false con formulario/panel abiertos, y caso CREAR correspondiente. La respuesta 403 de servidor sigue obligatoria.

### DEP-D05 — MEDIA — mutaciones concurrentes de acceso pueden dejar panel con versión obsoleta
**Evidencia:** page.tsx:212–254, :483–499. Al autorizar/revocar se marca ocupado=u.id, deshabilitando solo fila u; cualquier otra fila sigue permitiendo operación. Cada llamada incrementa compuertaPanel y al éxito recarga panel solo si su sesión permanece vigente.
**Escenario:** autorizar A con POST lento → autorizar B con POST rápido → B confirma y recarga antes del COMMIT de A → A confirma después, pero su sesion no es vigente, así que no recarga panel. El panel puede mostrar A como no autorizado aunque la base ya lo autorizó; la lista principal se recarga, pero no el panel. No demuestra doble concesión, pues el SQL tiene ON CONFLICT y auditoría efectiva.
**Aceptación:** serializar cambios de acceso por depósito/panel o consolidar revalidación final tras todas las mutaciones; no bloquear otras pestañas después de cerrar panel; probar A/B inverso, error, panel cerrado y actualización de historial.

### DEP-D06 — MEDIA — edición de ficha sin control de versión del registro
**Evidencia:** page.tsx:161–165 envía solo nombre/sucursalId; app/api/depositos/[id]/route.ts:43–53; NEX-046:257–295 bloquea la fila durante UPDATE pero no compara version/actualizado_at leído por el cliente.
**Impacto:** dos editores cargan el mismo depósito; A cambia nombre y guarda; B con ficha antigua cambia nombre y guarda después: el último sobrescribe la modificación de A sin conflicto ni aviso. Bloqueo SQL evita carrera simultánea en fila, pero no el lost update semántico entre formularios.
**Aceptación:** definir política de versión optimista para la ficha o detectar cambio de datos antes de persistir; un 409 y recarga consciente evitan sobreescritura silenciosa. No crear migration por defecto; revisar disponibilidad de actualizado_at. Probar dos sesiones con edición concorrente, nombre y sucursal.

### DEP-D07 — MEDIA — historial de accesos truncado sin indicación
**Evidencia:** lib/depositos/shared.ts:56–70 usa ORDER BY ... LIMIT 200; page.tsx:510–554 rotula «Historial de accesos», sin total, mensaje «últimos 200» ni paginación.
**Impacto:** si existen más de 200 eventos, se muestra una ventana parcial como si fuera historial completo; las filas anteriores permanecen en PostgreSQL, no se demuestra pérdida física de auditoría.
**Aceptación:** explicitar que son los últimos 200, o proveer paginación confiable/total; probar 201 eventos, orden y vacío. No ampliar V1 a un subsistema de auditoría nuevo.

### DEP-D08 — BAJA — colspan no coincide con columnas visibles en perfiles VER-only
**Evidencia:** page.tsx:594–605 y :611–615: tabla tiene 5 encabezados si puedeEditar=false, pero filas de carga/vacío usan colSpan=6 siempre.
**Impacto:** estructura de tabla inconsistente y posible columna extra/ancho inesperado en desktop.
**Aceptación:** colspan depende de acciones visibles; comprobar con VER-only y VER+EDITAR en 1440px.

## 3. Riesgos, condiciones y decisiones pendientes — no elevar a bug probado

- **DEP-O01 (autorización y carrera SQL, requiere PostgreSQL):** NEX-046:267–275, :309–314, :341–345 y :379–383 comprueba deposito_en_alcance ANTES de adquirir FOR UPDATE. Investigar el entrelazado revocación del propio actor ↔ operación que ya superó la comprobación, con sesiones reales y sin presuponer explotación. Mantener evaluación transaccional y evitar debilitar la guarda de saldo/sucursal.
- **DEP-O02 (política sucursal):** DEPOSITOS_EN_ALCANCE y deposito_en_alcance filtran empresa+alcance de depósito pero no restringen además la sucursal para lectura/administración ordinaria; la sucursal se exige al crear, cambiar y asignar destino. Confirmar que «TODOS los depósitos» prima sobre el alcance restringido de sucursal para gestionar ya existentes; no etiquetar violación sin decisión.
- **DEP-O03 (snapshot de lectura):** listarDepositos hace tres SELECT por Pool en paralelo para depósitos, sucursales y actor, sin snapshot común; cambios simultáneos de alcance pueden dar catálogo temporalmente inconsistente. No se reprodujo en PostgreSQL.
- **DEP-O04 (escala):** carga todos los depósitos y usuarios del panel y filtra en navegador; histórico limitado a 200. No hay medición de rendimiento; no proponer paginación general por defecto.
- **DEP-O05 (operación/ledger):** NEX-046 está versionada y contiene anotación histórica «NO aplicada». Su estado real en schema_migrations y los grants/triggers efectivos NO fueron verificados; no confundir la inspección del archivo con comprobación en VM.
- **DEP-O06 (perfiles especiales):** usuario BLOQUEADO aparece con posible botón Autorizar, pues NEX-046 rechaza BAJA y no BLOQUEADO. Confirmar si se permite preautorizar para eventual reactivación; sin acceso real mientras esté bloqueado, no afirmar vulnerabilidad.
- **DEP-O07 (sucursal actual en pantalla):** la lista de sucursales del GET está filtrada por alcance de sucursal, y al editar se conserva un ID solo si ya vino en el GET. Para depósito asignado cuyo vínculo persiste tras perder alcance de la sucursal, verificar si el selector debe mostrar su sucursal histórica como solo lectura. Riesgo condicional, no reproduzido.

## 4. Controles preservados y no reabrir sin regresión

INV-05 (descartar permisos tras carga fallida/pendiente), INV-R02-03 (validación de listas), INV-R03-01 (validación del panel) e INV-R04-01 (cerrar invalida respuesta tardía) están presentes; no duplicar como defectos nuevos. La compuerta de cargas y la validación de forma siguen activas. La función NEX-046 inactiva solo con saldo cero de todos los estados, con lock sobre depósito y guarda trigger de aumento de saldo; sucursal no cambia tras primer movimiento, incluso anulado, con trigger; código inmutable y unicidad CI; log de eventos de cambios efectivos, sin DELETE ordinario. Las funciones SQL SECURITY DEFINER comprueban permisos, empresa y alcance; API repite permiso. El código no tiene editor de saldos ni parámetros de reposición, ni elimina depósitos. Stock lee por filtro autorizado, Movimientos es único motor de escritura física. Las regresiones anteriores aceptadas estaticamente no se reabren.

## 5. Matriz de pruebas futuras y límites de auditoría

**Pruebas focales necesarias tras autorización de corrección:** D01 promesas POST/PATCH pendientes con cambio/cierre/otro depósito; D02 matriz permisos real de layout+API; D03 checkbox solo con guard de descarte; D04 recarga de permisos válida con formulario/panel abiertos; D05 dos POST/DELETE de accesos desordenados y log; D06 2 editores con versión obsoleta; D07 201 eventos; D08 VER-only desktop; separación de tenant, alcance y saldo al inactivar como regresión focal. Reutilizar casos de lib/inventario/depositos.casos.ts. No ejecutar suite global/CI manual/PG real/VM sin solicitud y responsabilidad del operador. Screenshot desktop real y comprobación de migración son pendientes humanos.

**Resumen:** 2 ALTAS (D01–D02), 5 MEDIAS (D03–D07), 1 BAJA (D08), 7 observaciones no confirmadas. **Menu 10 auditado estáticamente, NO homologado.** No autorizar Claude todavía: la fila de auditoría seguirá avanzando al próximo menu Inventario → Reposición cuando el responsable lo indique.
