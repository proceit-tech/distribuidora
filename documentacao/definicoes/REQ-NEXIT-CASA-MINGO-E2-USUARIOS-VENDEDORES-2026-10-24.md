# REQ-NEXIT-CASA-MINGO-E2 — Administración de Usuarios = Vendedores — HISTÓRICO SUPERADO

> **DOCUMENTO SUPERADO / NÃO VIGENTE — 24/10/2026.** O responsável rejeitou a premissa de que todo usuário seja vendedor, e revogou a autorização de implementar E2. Este documento é preservado **apenas como histórico da análise equivocada**. **NÃO usar suas regras RN-E2 sobre vendedor ou seu comando para Claude**. A referência canônica é `documentacao/definicoes/REQ-NEXIT-PLATAFORMA-MULTIEMPRESA-PERFILES-R01-2026-10-24.md` (MASTER global, empresa com admin próprio, múltiplos perfis, regras comerciais pendentes). O código E1 atualmente atribui `Vendedor:` ao emissor autenticado, mas isso NÃO é regra universal aprovada e exige decisão funcional específica. **Nenhum desenvolvimento E2 está autorizado** até aprovação formal do responsável.


**Fecha:** 24/10/2026. **Fuente de negocio:** solicitud CASA MINGO del 22/10/2026 y decisión del responsable: «para ellos Usuario y Vendedor son lo mismo».  
**Estado:** autorización para iniciar *desarrollo E2*, **no para homologar ni desplegar**.  
**Linear:** PRO-293 (etapa E2), PRO-109 (padre funcional), PRO-72 (regla vendedor), PRO-93/94 (emisión FE/NCE), PRO-115 (homologación).  
**Branch:** `feature/NEXIT-2026-001-banco-demo`. **Precedente:** `documentacao/testes/AUD-NEXIT-CASA-MINGO-INFO-ADICIONAL-E1-R06-2026-10-24.md`.  
**Base transversal:** `documentacao/definicoes/REQ-2026-002-multiempresa-usuarios-perfiles-menus.md` (texto histórico; revisar lo ya implementado antes de aplicarlo literalmente).

## 1. Problema y delimitación

CASA MINGO requiere que su personal autorizado pueda **crear, consultar, editar y desactivar los usuarios de SU empresa** y controlar qué acciones y depósitos/sucursales puede utilizar cada usuario. Para la V1, **el vendedor identificado en FE/NCE es el usuario autenticado que emite**, usando el nombre que obtiene el servidor; no hay lista ni selección independiente de Vendedores y no debe crearse una entidad nueva.

La ruta `/administracion/usuarios` ya está declarada en `lib/navigation/menu.ts` con permiso `USUARIOS.VER` pero **no está en `V1_HREFS` ni tiene página operativa** en el HEAD funcional auditado. **Hallazgo arquitectónico relevante:** el layout padre `app/(private)/administracion/layout.tsx` ejecuta `guardPlatformPage()` y concede acceso solo a administradores globales. La V1 debe permitir **administración empresarial** sin convertirla en autorización de plataforma, sin perder la separación actual de `/administracion/empresas`. Resolver de forma específica el boundary de ruta/layout, no relajar `guardPlatformPage` para todo el grupo ni dar `isPlatformAdmin` al personal de CASA MINGO.

## 2. Evidencia de estructura ya existente

- `NEX-002-seguridad.sql` contiene `usuarios`, `perfiles`, `permisos`, `perfil_permiso`, `usuario_perfil`, `usuario_sucursal`, `usuario_deposito`, `sesiones_usuario`, `eventos_seguridad`. Las FKs están compuestas por empresa donde corresponde.
- `usuarios`: `empresa_id`, `usuario` (único por empresa, minúscula), `nombre`, `apellido`, `email`, `password_hash`, `estado` ACTIVO/BLOQUEADO/BAJA, `sucursal_id`, alcances, bloqueo de login, `debe_cambiar_contrasena`, `version_acceso`, auditoría temporal y creador.
- `app/api/auth/login/route.ts` autentica contra `usuarios.password_hash = crypt($2,password_hash)` y estado ACTIVO; sesiones duran ocho horas.
- `lib/auth/permissions.ts` distingue `isCompanyAdmin` de `isPlatformAdmin`, con `guardApi`, `guardPage`, `guardPlatformApi` y `guardPlatformPage`; no romper ese aislamiento.

**No asumir que una migración es necesaria**: comprobar otras migraciones posteriores a NEX-002 y constraints vigentes antes de escribir SQL nuevo. Nunca ejecutar migraciones en VM por Claude.

## 3. Reglas funcionales y de seguridad

**RN-E2-01 — Ámbito:** cada alta, lista, edición, búsqueda y baja lógica se restringe a `empresa_id` de la sesión. Nunca confiar en empresa enviada por el navegador. IDs de otras empresas deben provocar acceso denegado/sin filtración, incluyendo API directa.

**RN-E2-02 — Listado:** incluir usuario/login, nombre y apellido, email cuando corresponda, estado, perfiles y ámbito de trabajo autorizado. Filtros/búsqueda y paginación con consultas SQL parametrizadas. No exponer `password_hash`, tokens, sesiones ni campos secretos.

**RN-E2-03 — Alta:** datos mínimos: nombre, apellido opcional, nombre de usuario válido/único dentro de empresa, credencial creada de manera segura, estado, al menos un perfil operacional válido y alcance por sucursal/depósito coherente. No asignar perfiles de otra empresa, globales o inactivos. Generar hash en backend siguiendo práctica/login existente; no almacenar contraseña en texto ni registrarla en auditoría. Si existe política vigente de cambio de contraseña, aplicarla con la mínima integración segura.

**RN-E2-04 — Edición/inactivación:** permisos distintos para VER/CREAR/EDITAR y la acción crítica de inactivar/reactivar. Prohibir autoescalada de privilegios. No permitir eliminar/inactivar la última cuenta autorizada de administración empresarial, ni autoinactivarse sin una vía segura de recuperación. No hacer DELETE físico sobre usuarios referenciados por documentos, ventas, audit trail.

**RN-E2-05 — Perfiles y alcances:** reutilizar `usuario_perfil`, `usuario_sucursal` y `usuario_deposito`. Validar que depósito pertenece a empresa y a sucursal compatible; impedir `TODOS/TODAS` no autorizado. Respetar perfiles activos y reglas existentes de permisos; no inventar nueva lista Vendedores.

**RN-E2-06 — Sesiones:** bloquear o desactivar al usuario debe invalidar sesiones efectivas; revisitar sesiones abiertas al cambiar perfiles, permisos o alcance, usando la arquitectura de sesiones real (incl. `version_acceso` si relevante), sin elevar admin de plataforma.

**RN-E2-07 — Auditoría:** registrar alta, edición de identidad, cambio de roles/alcances, bloqueo/reactivación, restablecimiento de credencial, actor autenticado, empresa, objetivo y fecha. Nunca dejar contraseñas ni tokens en logs/eventos.

**RN-E2-08 — Vendedor fiscal:** el nombre mostrado por FE/NCE en `dInfAdic` debe seguir saliendo de `usuarios` del emisor autenticado y guardándose en el snapshot fiscal. Un cambio posterior de nombre no debe alterar documentos ya emitidos. No agregar `vendedor_id` editable ni tocar CDC, NEX-071, SQL de FE/NCE o KuDE excepto corrección verdaderamente indispensable y demostrada.

**RN-E2-09 — Plataforma versus empresa:** conservar `/administracion/empresas` bajo `guardPlatformPage` y rutas globales bajo permisos de plataforma. El nuevo mantenimiento de usuarios pertenece a administrador/operador de la empresa autorizado, aun cuando ambos compartan el prefijo de URL. No usar hacks del navegador o excepción global al layout para habilitar la ruta.

**RN-E2-10 — Estado de navegación V1:** implementar primero página/API con autorización completa y tests, **sin exponer automáticamente en producción**. La incorporación a `V1_HREFS` será revisada por ChatGPT como parte del AUD E2-R01 y su visibilidad en el entorno real solo en homologación humana. No revelar ruta por navegación a perfiles sin permiso.

## 4. Criterios de aceptación de análisis (CA-E2)

1. Cuenta administradora de empresa A crea dos usuarios con perfiles distintos, sin privilegios globales; ambos pueden iniciar sesión con sus credenciales.
2. Empresas A y B con ID conocidos: endpoints de A no revelan ni alteran datos B; cambiar `empresa_id` en payload no cambia alcance.
3. Lista y detalle nunca devuelven hash de contraseña ni token; búsquedas y filtros paganización real y estable.
4. Usuario con `USUARIOS.VER` y sin `USUARIOS.CREAR/EDITAR` visualiza, pero no crea ni edita por UI **o API**.
5. Cuenta no autorizada no se escala a administradora, no puede entregar permisos de plataforma, ni asignar perfiles o sucursales de otra empresa.
6. Inactivación y cambios de perfiles/alcance surten efecto en la sesión/siguientes llamadas; no queda acceso residual.
7. Última cuenta administradora no queda bloqueada o desactivada accidentalmente; autoinactivación no destruye recuperación.
8. El usuario 1 emite FE, el 2 emite NCE: el vendedor es el emisor de cada una; registro histórico no cambia por renombre posterior.
9. Menú `Usuarios` visible solo para perfiles autorizados, sin alterar visibilidad/seguridad de `Empresas` de plataforma. No incluir ruta inexistente en `V1_HREFS`.
10. Evidencia de tests unitarios/focais de API/autorización/datos, estado inicial, ciclos de vida y regresión de login/permisos y FE/NCE relevante; se separan mocks de base/navegador real.

## 5. Entregas y puertas

**Claude:** lectura de HEAD y archivos completos, implementa código/testes/migración incremental *solo si necesaria*, commit/push con SHA, tests focales/TS/ESLint puntual, **PARA** para `AUD-NEXIT-CASA-MINGO-E2-R01`. **NO** actualiza Linear, PROGRESSO, auditorías, VM, Docker, DB, entorno real, despliegue ni otras etapas.

**ChatGPT:** auditoría independiente en Git, documentación de evidencias/defectos, actualización PRO-293/109/72 y PROGRESSO, determina si sigue corrección o avance siguiente. **Responsable humano:** aplicación de cambios operativos, certificados/KuDE del proveedor, validación de navegador/DB, homologación y Done/release.

**Gate de producción separado:** NEX-071 sigue versionada pero no aplicada y depende de pruebas reales; AUD E1-R06 conforme estático no es permiso para operar NCE sin ese gate.
