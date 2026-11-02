# AUD-NEXIT-PROVEEDORES-DESKTOP-R01 — Auditoría estática por menú «Proveedores»

**Fecha:** 2026-10-18.
**Corte de código auditado:** `542b11696a01daf6e831d339486fdcf4cbe429f0` (branch `feature/NEXIT-2026-001-banco-demo`).
**Alcance:** ERP exclusivamente desktop. `Maestros → Proveedores`, `/proveedores`, `/proveedores/nuevo`, `/proveedores/[id]`, ocho pestañas del formulario (General, Compras, Homologación, Contactos, Direcciones, Cuentas bancarias, Retenciones, Documentos), rutas API asociadas, servicios, validaciones, roles y esquema.
**Estado:** **REVISIÓN ESTÁTICA DEL MENÚ CONCLUIDA CON HALLAZGOS ABIERTOS — NO HOMOLOGADA**. No se editaron páginas, API, lógica, SQL, migrations, permisos ni VM; no se ejecutaron tests, APIs, Docker, PostgreSQL ni navegador. Una inspección del código y sus contratos NO equivale a asegurar ejecución correcta de cada ruta y transacción en ambiente real.
**Fuentes de gobierno:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, secciones actuales de Proveedores y auditorías generales en `PROGRESSO-NEXIT-V1.md`, `documentacao/v1/auditoria-por-menu/AUD-PROVEEDORES-V1.md` (histórico M01…M06 y PRV-R01) y contratos SQL NEX-006/033–037. Las auditorías previas son historia, no se deben repetir hallazgos ya corregidos.

## 1. Inventario y trazabilidad de capas inspeccionadas

| Capa | Evidencia y resultado |
|---|---|
| Listado e interfaz de alta/detalle | `app/(private)/proveedores/{layout.tsx,page.tsx,nuevo/page.tsx,[id]/page.tsx}` y `_components/proveedor-form.tsx`; formularios y pestañas: `informacion,compras,homologacion,contactos,direcciones,bancos,retenciones,documentos`; botones, filtros, estado error/carga y ruta de recuperación |
| HTTP y autorización | **12 archivos** `app/api/proveedores/**/route.ts`: GET/POST lista/alta, GET/PUT ficha, POST gobernanza, GET eventos, aprobación/reactivación bancaria, upload, versionado, restauración, eliminación lógica, cierre de carga. Inspeccionado control de sesión, permiso declarativo, tenant y rutas administrativas; **no se ejecutaron requests HTTP** |
| Servicios | `lib/proveedores/{http,shared,normalizar,formulario,identificacion,sincronizar,gobernanza,cliente-api,permisos-documentos,documentos-http,documentos,cierre-carga,alta,reactivacion}`, con revisión de flujos sensibles; no se declara lectura exhaustiva semántica de cada línea de cada helper |
| Persistencia | NEX-006 y NEX-033…037: tablas `proveedores,proveedor_contactos,proveedor_direcciones,proveedor_cuentas_bancarias,proveedor_retenciones,proveedor_documentos,proveedor_documento_versiones,proveedor_eventos,proveedor_cuenta_revisiones`; UNIQUE/FK por empresa, índices parciales y grants/helpers de NEX-037. No se comprobó estado instalado real ni se reejecutaron migraciones |
| Pruebas actuales | `lib/proveedores/{proveedores,estabilizacion,documentos,reactivacion,gobernanza,cuentas-auditoria}.casos.ts`: inspección de cobertura específica, simulaciones y contratos; **sin nueva ejecución**; faltan escenarios UI de perfiles CREAR-only/VER-only y fallo HTTP geografía |

## 2. Hallazgos confirmados en el código de este corte

### PRV-D01 — ALTA — El perfil PROVEEDORES.CREAR sin VER no puede acceder al alta por el layout, y la salida del alta apunta a pantalla no autorizada

**Ubicaciones:**
- `app/(private)/proveedores/layout.tsx:6`: `await guardPage("PROVEEDORES", "VER")` en un layout que engloba **también `/proveedores/nuevo`**.
- `app/api/proveedores/route.ts:156–163`: explícitamente permite catálogos/geografía de alta para `PROVEEDORES.CREAR` aunque carezca de `VER`, pero la política de la ruta de la UI los bloquea antes.
- `app/api/proveedores/route.ts:344–345`: POST exige `PROVEEDORES.CREAR`, no VER.
- `lib/proveedores/permisos-documentos.ts:25–45`: autoriza subida temporal/cierre por creador con CREAR y contexto comprobado.
- `app/(private)/proveedores/nuevo/page.tsx:62–63,88–89`: tras alta o cierre satisfactorio se hace `router.push("/proveedores?ok=creado")`, destino que requiere VER. `lib/navigation/menu.ts:403–422` también muestra módulos solo con su permiso de menu.
  
**Impacto real por contrato:** un perfil de uso «registrar proveedores» que solo posea CREAR está admitido por API/documentos pero excluido de la interfaz y, aun si entra por camino alterno, la redirección de éxito lleva a una lista inaccesible. **No es bypass de seguridad:** los GET siguen protegidos.

**Criterio de corrección:** una política congruente de autorización por ruta (lista y ficha requieren VER; alta requiere CREAR; catálogos mínimos CREAR/VER sin filtrar proveedores), punto de entrada autorizado y destino de éxito para CREAR-only (sin conceder VER artificialmente). Incluir admin/VER-only/CREAR-only/ninguna, y accesos cross-tenant de documentos en pruebas dirigidas. No reescribir el flujo de alta ni el GET general.

### PRV-D02 — MEDIA — Usuarios VER-only reciben formulario completamente editable y acción «Actualizar proveedor»

**Ubicaciones:** `app/(private)/proveedores/[id]/page.tsx:101–115` siempre renderiza `<ProveedorForm mode="edit" ...>` para todo actor que supere el GET; `app/(private)/proveedores/_components/proveedor-form.tsx:333–381` monta controles `set`/agregar/quitar y botón `type="submit"` sin consultar `initial.permisos.editar`; `app/api/proveedores/[id]/route.ts:253` exige EDITAR en PUT. `app/(private)/proveedores/page.tsx:528` y ~670 muestran `Nuevo proveedor` sin condición `PROVEEDORES.CREAR`, aunque el POST exige CREAR.

**Impacto:** el operador sin permiso puede editar durante minutos, luego recibe 403 al intentar guardar; además aparece CTA de creación imposible. El GET de ficha ya entrega `permisos.editar` (~línea 218), de modo que existe contrato para deshabilitar correctamente. **No hay demostración de que el PUT permita el cambio a un VER-only**.

**Criterio de corrección:** UI solo lectura si VER sin EDITAR; esconder acciones que requieren CREAR o EDITAR usando datos/autorización confiables (sin sustituir controles backend); acciones especiales de homologación/bancos siguen con sus permisos propios. Pruebas focales por perfil y navegación en desktop. No exigir teléfono.

### PRV-D03 — MEDIA / UX — Fallos de API de geografía se interpretan silenciosamente como catálogo vacío

**Ubicaciones:** `app/(private)/proveedores/_components/pestanas/direcciones.tsx:38–59`: los efectos de distritos y ciudades usan `r.ok ? r.json() : {datos: []}` y `.catch(() => setCargaDistritos/Ciudades(... lista:[]))`, sin mensaje de error/estado reintentable. Cuando el departamento/distrito se selecciona pero el GET devuelve 401/403/500 o falla la red, el selector queda vacío con «Seleccione», indistinguible de un catálogo realmente sin opciones.

**Impacto:** el usuario no puede completar un domicilio paraguayo y no sabe por qué. **Buena implementación que debe conservarse:** las claves `cargaDistritos.clave`/`cargaCiudades.clave` y cleanup `activo` hacen que las respuestas de otro departamento/distrito no se presenten como actuales; no registrar aquí falsa carrera como en Clientes.

**Criterio de corrección:** diferenciar vacío legítimo de error de API, exponer mensaje por campo o banda accesible y acción para reintentar, sin desactivar validación geográfica server-side; tests mínimos HTTP 401/500/red versus [] y cambio rápido de departamento. No modificar banco de datos.

## 3. Riesgos / decisiones documentadas, NO defectos nuevos automáticamente

- **PRV-O01 — Política bancaria pendiente:** `app/api/proveedores/[id]/route.ts:146–159,217–223` entrega número completo de cuenta, alias y `revisionPendiente.datos` para VER; `app/api/proveedores/[id]/eventos/route.ts:13–34` entrega JSON de cambios antes/después. Ya estaba registrado como PRV-M06. **No se sabe si el usuario decidió un permiso bancario de lectura distinto**. No declarar fuga ni ocultar por suposición. Confirmar política antes de autorizar cambios RBAC; el aislamiento de empresa se observa en WHERE.
- **PRV-O02 — Escala de listado:** `app/api/proveedores/route.ts:174–228` devuelve el conjunto de proveedores de la empresa sin LIMIT/OFFSET y `app/(private)/proveedores/page.tsx:248–493` pagina localmente en grupos pequeños. Igual a PRV-M05; medir desempeño/cantidad antes de refactorizar.
- **PRV-O03 — Diálogos browser nativos:** `window.confirm` en tabs de bancos/documentos/gobernanza, con textos de consecuencias. Pueden mejorarse visualmente más adelante, pero **ya hay confirmación**; no convertir a defecto crítico ni cambiar consecuencias de operaciones.
- **PRV-O04 — Evidencia PostgreSQL aún no disponible en esta revisión:** confirmar en el procedimiento operacional la aplicación y los privilegios efectivos de NEX-034/035/036/037 y `nex_aplicar_grants_proveedores`. **No** inferir que están pendientes solo porque un documento histórico de 11/10 decía no aplicadas; el snapshot actual de progreso no es ledger real.

## 4. Correcciones anteriores efectivamente presentes (no abrir regresiones inexistentes)

- PRV-M01 versión obligatoria de PUT después de `FOR UPDATE`, con 409; PRV-M02 vínculos grupo/medio históricos inactivos preservados si no cambiaron; UI muestra históricos.
- PRV-M03 `useProtegerCambios` para ficha y pendientes, diálogo específico al abandonar tab Documentos con edición en preparación.
- PRV-M04 cierre revisa respuesta HTTP/red, conserva proveedor ya creado; `/proveedores/nuevo` retoma ID por URL (PRV-R01-01), subida parcial conserva solo fallidos en página de retomada (PRV-R01-02), cierre del propio creador es idempotente tras respuesta 200 perdida (PRV-R01-03) y catálogo mínimo admite CREAR-only (PRV-R01-04 en API). `exigirVersionPresente` existe antes de normalización; no reabrir PRV-R01-05 como fallo actual.
- Gobernanza cambia homologación/riesgo/bloqueo exclusivamente mediante endpoints dedicados y permiso correspondiente; cuentas aprobadas tienen cambios pendientes auditados, reactivación admin y validación de cuenta principal por moneda; documentos usan archivos privados, auditoría/versiones y exclusión lógica. Estos controles están en código/DDL; no afirman prueba operacional.
- Geografía tiene defensa real contra respuestas anteriores (clave+cleanup), preserve durante corrección de mensajes de error.

## 5. Veredicto y continuidad secuencial

**Hallazgos de Proveedores en esta revisión: 1 ALTA + 2 MÉDIAS, 4 observaciones no bloqueantes.** Revisión en GitHub documentada; **NO HOMOLOGADA** visual ni operacionalmente. No se entregó código al Claude ni se cambió DB/VM. No ejecutar pruebas globales, `tsc`/build/lint global, CI manual ni SQL/VM por IA. Si el responsable desea estabilizar, Claude solo con orden expresa corregirá PRV-D01/D02/D03 en ese menu, hará pruebas ligeras por perfiles/geo, commit/push y parará para ChatGPT. El siguiente menú de auditoría es **Productos**, por separado, manteniendo todos estos pendientes documentados.
