# Nexit V1 — Matriz integral de auditoría: Catálogos de productos

**Fecha:** 2026-10-12. **Autor:** ChatGPT, auditoría independiente. **Estado:** PARA DECISIÓN / NO HOMOLOGADO. **Alcance:** exclusivamente `/productos/catalogos`: Categorías, Marcas, Familias, Líneas. Esta publicación **NO autoriza a Claude a implementar**; no modifica código, migraciones o VM.

## 1. Evidencias y límites

**Capturas originales del responsable (vistas en la conversación, no versionadas como binarios Git):** `image(20261012-103601).png` Categorías (4 filas visibles), `image(20261012-103616).png` Marcas (3), `image(20261012-103628).png` Familias (51), `image(20261012-103641).png` Líneas (203). En las cuatro capturas, el formulario "Nueva ..." **ya está abierto**: no presumir que aparece automáticamente. Los textos `Sin código` corresponden a datos existentes sin código; no implican que la API esté rota. Algunos datos parecen semánticamente particulares: Categorías "EMIRATOS ARABES UNIDOS", "ESPAÑOLA", "FRANCESA", "ITALIANA"; Marcas "BISETTI", "LUMINARC", "PEDRINI"; Familias "ACCESORIOS DE VINO", "BOLS", "BOTELLA"; Líneas "ABONDANCE"/familia "DECANTER", "A GAS"/"CAFETERA", "APILABLE"/"MANTEQUERITA". **No reclasificar por nombre automáticamente** sin confirmación del negocio.

**Código revisado en GitHub:** `app/(private)/productos/catalogos/{page.tsx,page.module.css}`; `lib/productos/catalogos-admin.ts`; `app/api/productos/{categorias,marcas,familias,lineas}/route.ts`; `app/api/productos/categorias/[id]/route.ts`; `documentacao/banco/nexit/v1/migraciones/NEX-007-productos.sql`; `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`. Las definiciones SQL exactas de NEX-017/NEX-020 **no se localizaron por las rutas intentadas**; algunas conclusiones sobre constraints quedan condicionadas a una lectura directa del archivo/migration efectiva. No hubo SELECT al PostgreSQL ni interacción en navegador.

**Fuentes externas para contraste — no son requisitos automáticos de Nexit:**
- SAP Business One, gestión de Item Master: https://help.sap.com/docs/sap_business_one/68a2e87fb29941b5bf959a184d9c6727/452366619e152b31e10000000a1553f7.html ; grupo de artículos y propiedades: https://help.sap.com/docs/SAP_BUSINESS_ONE/68a2e87fb29941b5bf959a184d9c6727/45221d4673c80108e10000000a114a6b.html
- Microsoft Dynamics 365, jerarquías de productos: https://learn.microsoft.com/en-us/dynamics365/commerce/retail-hierarchies
- Odoo 18, categorías ecommerce y categoría superior: https://www.odoo.com/documentation/18.0/applications/websites/ecommerce/products/catalog.html

## 2. Arquitectura verificada

`page.tsx` tiene **cuatro pestañas** en una pantalla; búsqueda por nombre/código, filtro de estado, filtro adicional Familia para Líneas, ordenación por código/nombre/familia/productos/estado, paginación client-side de 20 filas. API compartida `catalogos-admin.ts` separa permisos PRODUCTOS.VER/CREAR/EDITAR; usa `empresa_id` de sesión; `POST` y `PUT` transaccionales, validación nombre requerido (<=120), código opcional (<=40), descripción solo familias/líneas (<=500). Líneas exigen `familiaId` de misma empresa; impedir cambio de familia si línea tiene productos vinculados está confirmado. Categorías y Marcas usan `catalogo_producto_guardar()` (NEX-020 según código); Familias y Líneas escritura directa. No endpoint DELETE en las rutas examinadas; inactivación vía PUT.

**Modelo:** `productos` mantiene columnas **independientes** `categoria_id`, `marca_id`, `familia_id`, `linea_id`. `lineas_producto` tiene `familia_id` en API; la relación jerárquica confirmada es Familia→Línea. **No hay prueba de jerarquía obligatoria Categoría→Familia→Línea.** Marcas es eje ortogonal de clasificación. El contador `Productos` en cada catálogo usa `count(*)` por referencia directa a ese catálogo en `productos`, incluidos productos inactivos (no filtra `p.activo`).

## 3. Matriz campo a campo y comportamiento

| ID | Pestaña/control | Evidencia verificada | Situación/impacto | Acción recomendada | Clase / prioridad |
|---|---|---|---|---|---|
| CAT-001 | 4 pestañas | Capturas y constante `TABS` | Navegación presente y consistente | Preservar; no reconstruir | Conforme |
| CAT-002 | Breadcrumb + Volver a Productos | Capturas y Link | Navegación presente | Preservar | Conforme |
| CAT-003 | Título general | Capturas | Un título global único | Preservar | Conforme |
| CAT-004 | Nuevo categoría/marca/familia/línea | Capturas con formulario abierto y botón visible | **No está probado que el formulario se abra solo** | Probar apertura/cancelación; no registrar bug sin evidencia | Homologación |
| CAT-005 | Código opcional (4 catálogos) | Input `maxLength=40`; API opcional 40; capturas `Sin código` | Datos históricos sin código; menor trazabilidad/interop, pero no defecto | Decidir política futura de codificación: autogenerada, externa o facultativa; sin backfill por suposición | Decisión P1 |
| CAT-006 | Nombre obligatorio (4) | `maxLength=120`; API valida; `*` | Requerimiento implementado | Probar nombre en blanco, trim, duplicados | Conforme/QA |
| CAT-007 | Descripción categoría | `TABS.descripcion=false` | No permite descripción para categorías | Evaluar necesidad de catálogo explicativo, sin ampliar DB sin decisión | Mejora P2 |
| CAT-008 | Descripción marca | `TABS.descripcion=false` | No permite descripción para marcas | Opcional; no prioritario | Mejora P2 |
| CAT-009 | Descripción familia | UI `maxLength=500`; API 500 | Presente | Mantener; comprobar persistencia | Conforme/QA |
| CAT-010 | Descripción línea | UI `maxLength=500`; API 500 | Presente | Mantener; comprobar persistencia | Conforme/QA |
| CAT-011 | Familia obligatoria en Línea | Selector `Familia *`; backend valida UUID, misma empresa, actividad | Correcto; protege relación | Mantener; validar edición con familia inactiva | Conforme/QA |
| CAT-012 | Familia como catálogo libre | 51 entradas en captura; API `familias_producto` | No existe vínculo obligatorio con categoría en API | Definir si jerarquía deseada es Categoría→Familia→Línea o clasificación de ejes independientes; no imponer FK nueva automáticamente | Decisión P0 funcional |
| CAT-013 | Marca independiente | Campo `productos.marca_id` | Ortogonal, coherente con fabricante/brand | No forzar Marca→Familia | Conforme |
| CAT-014 | Nombre duplicado | Backend verifica `lower(btrim(nombre))`; ámbito empresa, líneas dentro de familia | Control previo coherente; DB índices únicos reportados por código | Confirmar DDL efectivo, probar mayúsculas/espacios/competencia | QA P1 |
| CAT-015 | Código duplicado | API verifica `lower(codigo)` no vacío dentro empresa | Control existente | Verificar exacta semántica de índices SQL / collation | QA P1 |
| CAT-016 | Estado e inactivación | Botones y PUT; sin DELETE en rutas revisadas | Preserva referencias; puede haber productos vinculados | Preservar inactivación, advertir cantidad de productos afectados antes de confirmar según decisión UX | Mejora P1 |
| CAT-017 | Activación | PUT cambia `activo` | Presente | Probar efectos en selectores de nuevo producto | QA P1 |
| CAT-018 | Registros inactivos vinculados | UI `familiasActivas` incluye familia actual aunque inactiva | Buena compatibilidad de edición | Mantener compatibilidad para históricos | Conforme |
| CAT-019 | Cambio de Familia de Línea utilizada | API bloquea cuando línea tiene productos | Protege consistencia | Mantener y mostrar explicación clara | Conforme |
| CAT-020 | Consistencia Familia–Línea en Producto | Producto guarda `familia_id` y `linea_id` por separado | **Riesgo de combinación incompatible** si no existe trigger/validación en API del Producto | Confrontar normalizador, route e índices/trigger actuales antes de calificar defecto; validar que línea pertenezca a familia indicada | Investigación P0 |
| CAT-021 | Conteo Productos | Subconsulta SQL `count(*)` para cada dimensión | Cuenta todos los referenciados, activos e inactivos | Etiquetar explícitamente como total asociado o indicar separado activos/inactivos; no afirmar que son 'activos' | UX P1 |
| CAT-022 | Búsqueda | Nombre/código, client-side | No busca descripción ni familia textual | Si hay necesidad, extender búsqueda sin romper filtros; con 203 filas actual es aceptable | Mejora P2 |
| CAT-023 | Ordenación | Previa a paginar; funciones compartidas | Correcta por diseño | Verificar con registros vacíos, acentos y sort | Conforme/QA |
| CAT-024 | Paginación | 20 filas, estado dependiente de filtros | Correcta por diseño; solo UI | QA de páginas en 51/203 filas | Conforme/QA |
| CAT-025 | Filtro Familia (Líneas) | Campo dedicado | Correcto | Conservar al aplicar filtros compuestos | Conforme |
| CAT-026 | Botón Limpiar filtros | Limpia estado, texto, familia | Correcto; no modifica datos | Preservar | Conforme |
| CAT-027 | Responsividad del formulario | CSS grid 4→2→1 | Adaptación CSS existe | QA en móvil y tablet, scroll vertical + botones | QA P1 |
| CAT-028 | Accesibilidad tabs | Buttons con `aria-current=page` | Funcionamiento por botón; no patrón ARIA tablist completo | Evaluar navegación teclado y foco; no reportar defecto legal sin prueba | Mejora P2 |
| CAT-029 | Riesgo al cambiar pestaña con edición no guardada | `cambiarTab` ejecuta `setForm(null)` directamente | **Pérdida silenciosa de cambios no guardados** al cambiar pestaña | Confirmación de descarte si formulario editado (dirty); Cancelar explícito | Defecto UX P1 |
| CAT-030 | Bloqueo de doble submit | `guardando` deshabilita Guardar; `guardar()` no usa guard al entrar | Protección visual, posible invocación paralela por teclado/evento | Verificar experimentalmente; no afirmar duplicación sin prueba | QA P2 |
| CAT-031 | Errores por campo | `setError` global, validaciones de servidor | No hay errores inline o foco automático al campo | Aplicar patrón estándar V1 de errores y estados; especialmente nombre/familia | UX P1 |
| CAT-032 | Feedback de inactivación | `cambiarEstado` ejecuta inmediatamente PUT sin confirmación | Cambio de estado inmediato, sin paso de confirmación | Confirmar cuando tiene productos asociados; preservar si responsable prefiere acción rápida | Decisión UX P1 |
| CAT-033 | Permisos | API PRODUCTOS.VER/CREAR/EDITAR; botón por bandera | Se usan permisos generales Productos para catálogo | Confirmar si administrador catálogo debe ser diferenciado; no inventar RBAC | Decisión P2 |
| CAT-034 | API modo demo | `DEMO_MODE` retorna respuesta vacía a GET y rechaza escrituras | Depende de modo operativo | Validar solo ambiente autorizado | QA |
| CAT-035 | Consistencia nombre visual | Espaciado y formularios similares en 4 capturas | Diseño limpio; panel superior extenso pero legible | Compactar opcionalmente, sin forzar modal ni rediseño | Mejora P2 |
| CAT-036 | Semántica de datos precargados | Categorías de nacionalidades y familias de artículos | Datos parecen mezclas de dominios; podrían ser importación legítima | Aprobación del negocio para clasificar; NO mover registros ni borrarlos | Decisión P1 |
| CAT-037 | Auditoría de cambios | API no invoca explícitamente evento de auditoría en funciones examinadas; funciones SQL pueden auditar | No se puede garantizar trazabilidad de catálogo por código consultado | Revisar NEX-020, triggers y política audit antes de afirmar falta | Investigación P1 |
| CAT-038 | Jerarquía/atributos sectoriales | SAP grupos/atributos; Dynamics jerarquías; Odoo categorías padre | Clasificación de Nexit útil, pero no jerarquía multiuso configurable | Mantener V1 simple; futura ampliación de jerarquía/atributos solo por requisito | Benchmark, P2 |

## 4. Comparación funcional ERP

| Dimensión | Nexit actual | SAP Business One | Dynamics 365 | Odoo | Dictamen para Nexit |
|---|---|---|---|---|---|
| Clasificación primaria | Categoría, Familia, Línea y Marca en producto | Grupo de artículos + propiedades | Jerarquías de categorías por uso | Categorías jerárquicas | Cuatro dimensiones son suficientes para V1 si la semántica está definida |
| Jerarquía entre niveles | Familia→Línea confirmada | Grupo de artículo plano, propiedades adicionales | Múltiples jerarquías de fines distintos | Padre/hijo en categorías | Decidir si categoría agrupa familias; no suponer |
| Marca | Maestro independiente | Dato de fabricante/marca según configuración | Atributos y organización de producto | A menudo extendida según módulos | Mantener como eje separado |
| Estado | Activo/inactivo sin borrado físico | Inactividad y restricciones de borrado para ítems transaccionados | Publicación por entidad/canal | Active/archive según módulo | Preservar links históricos |
| Atributos | No previstos en estos 4 catálogos | Propiedades de producto | Atributos heredables en jerarquías | Atributos y variantes | Futuro; fuera de esta pantalla |
| Interoperabilidad | Código opcional y UUID interno | Código de artículo/grupo | Identificadores jerárquicos y de producto | IDs y categorías exportables | Definir códigos estables por catálogo para integración antes de migrar/importar |

**Importante:** comparaciones conceptuales, no equivalencia 1:1 ni justificación para copiar toda la complejidad de otros ERPs.

## 5. Decisiones y fases

**Fase A — correcciones UX sin modificar modelo (propuesta, no autorizada):** CAT-029 alerta de datos no guardados; CAT-031 errores/foco; CAT-021 aclaración de conteo; CAT-032 confirmación de inactivación condicionada a decisión; CAT-035 compactación opcional. Conservar cuatro pestañas, columnas y filtros.

**Fase B — auditoría técnica antes de tocar SQL:** localizar y leer DDL efectiva de NEX-017/NEX-020; verificar integridad Familia–Línea del Producto, índices de unicidad por empresa y eventos/triggers; comprobar si los catálogos inactivos se ofrecen al crear un nuevo producto. Reproducir casos con PostgreSQL y navegador por el responsable, sin tocar datos permanentes inadvertidamente.

**Fase C — decisiones empresariales:** (1) ¿Categoría agrupa Familia, o son clasificaciones independientes? (2) Política de código: opcional/automático/externo. (3) Semántica y limpieza asistida de los datos importados. (4) Política de inactivación con productos asociados. Ninguna debe implementarse por conjetura.

## 6. Checklist de homologación

- [ ] Crear y editar una categoría, marca, familia y línea y verificar persistencia real tras recarga.
- [ ] Validar separación por empresa y permisos 401/403.
- [ ] Probar duplicados de nombre/código y edición con cambios de mayúsculas/espacios.
- [ ] Intentar asociar línea con familia inactiva o de otra empresa.
- [ ] Intentar cambiar de familia una línea con productos; verificar rechazo y preservación.
- [ ] Verificar correspondencia familia–línea al crear y editar Productos en API/BD.
- [ ] Inactivar y reactivar catálogo con productos y comprobar históricos y selectores.
- [ ] Verificar búsqueda, ordenación, filtros, páginas 1/2/3/última en listas 51/203.
- [ ] Verificar descartar accidentalmente un formulario modificado al cambiar pestaña.
- [ ] Confirmar si el conteo 'Productos' incluye inactivos y qué representa para el negocio.
- [ ] Validar pantallas a 375px, 768px y escritorio, foco y mensajes de error.
- [ ] Revisar catálogo de datos importados con negocio antes de reclasificar.
- [ ] Registrar decisión de negocio por escrito, implementar solo tramo aprobado y reauditar commit.

**No efectuado:** ejecución SQL, lectura de BD real, nuevas capturas, modificaciones de código o despliegue. **Estado:** matriz para aprobación.
