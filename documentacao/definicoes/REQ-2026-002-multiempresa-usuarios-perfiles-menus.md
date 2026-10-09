# REQ-2026-002 — Multiempresa, usuarios, perfiles y menús por permisos

Estado: PRONTO_PARA_AUDITORIA (fase de diseño, versión 3 tras decisiones D-01 a D-08 y AUD-R02). Sigue sin autorizar cambios de código hasta la aprobación del diseño y la revisión de la estructura real del banco.
Prioridad: ALTA — fundamento transversal del DistribuNex.
Idioma funcional y de interfaz: español (Paraguay).
Implementador: Claude. Auditor independiente: ChatGPT. Homologación final: responsable PROCEIT.

## Objetivo
Una instalación del DistribuNex debe admitir múltiples empresas independientes, cada empresa con múltiples usuarios y perfiles configurables, cada perfil con un menú y permisos específicos. La restricción debe aplicarse tanto en la interfaz como en el servidor y en el acceso a datos.

## Reglas de negocio
- RN-01 MULTIEMPRESA: una misma instalación y backend sirven a numerosas empresas; todos los datos de negocio deben pertenecer explícitamente a una empresa o estar clasificados como catálogos globales.
- RN-02 AISLAMIENTO: un usuario no puede consultar, crear, modificar, exportar o borrar información de otra empresa por manipulación de URL, IDs, payloads o API. El contexto de empresa se determina en el servidor y se valida en cada operación.
- RN-03 USUARIOS: cada empresa puede disponer de múltiples usuarios, con altas, bajas lógicas, bloqueo/reactivación y auditoría. El identificador de inicio de sesión actual utiliza empresa + usuario + contraseña; conservarlo mientras no se apruebe otra especificación.
- RN-04 PERFILES: la empresa puede administrar perfiles (ej. Administrador, Ventas, Depósito, Compras, Finanzas), asignar uno o varios perfiles a cada usuario y definir sus permisos. Nombres de perfiles son ejemplos, no perfiles obligatorios ni permisos presuntos.
- RN-05 MENÚS: se muestran exclusivamente módulos, grupos y acciones autorizados. Un usuario sin permisos no debe recibir automáticamente todos los menús. Ocultar el menú por sí solo NO protege los endpoints.
- RN-06 PERMISOS: matriz granular por recurso y acción (VER, CREAR, EDITAR, ELIMINAR, APROBAR, EXPORTAR cuando proceda); el backend rechaza acciones no autorizadas aun por llamada directa.
- RN-07 ALCANCE: permisos y registros también deben respetar sucursal, depósito y demás alcances de usuario según corresponda. Definir comportamiento de usuarios con varias sucursales y depósitos en una etapa de especificación detallada.
- RN-08 ADMINISTRACIÓN: el administrador autorizado de una empresa gestiona usuarios y perfiles de esa empresa sin elevarse a administrador global ni acceder a otras empresas.
- RN-09 SESIONES: guardar en contexto validado el usuario, empresa y alcance; invalidar/revalidar sesión o permisos al bloquear usuario o cambiar perfiles, evitando accesos residuales.
- RN-10 AUDITORÍA: registrar cambios de usuarios, asignaciones de perfiles, permisos y acciones sensibles con actor, empresa, marca temporal y objeto afectado, sin contraseñas ni tokens.
- RN-11 CONSISTENCIA: relaciones de datos, claves y operaciones SQL deben impedir referencias cruzadas entre empresas; revisar índices, unique compuestos, FKs/RLS cuando sean aplicables.
- RN-12 PRODUCCIÓN: las excepciones DEMO_MODE, datos mock y fallback de navegación no pueden conceder privilegios en producción.

## Comportamiento de referencia — no confundir con código terminado
- Administrador: administra usuarios/perfiles de SU empresa si la matriz de permisos lo autoriza.
- Vendedor: ve exclusivamente menús de ventas y otros explícitamente concedidos.
- Depósito: ve operaciones de stock, recepción y movimientos autorizadas.
Estos son escenarios ilustrativos sujetos a aprobación de matriz de permisos.

## Hallazgos del código actual
1. `app/api/auth/login/route.ts` filtra usuario por código de empresa y username.
2. `lib/auth/permissions.ts` dispone de SQL para verificar permiso según perfiles.
3. `lib/navigation/menu.ts` usa `resolveNavigation([])` que muestra TODOS los menús cuando la lista está vacía.
4. `lib/auth/server-context.ts` entrega `permissions: []` y `navigation: resolveNavigation([])`, de modo que la interfaz actual no aplica filtrado real.
5. Los endpoints existentes deben auditarse individualmente para garantizar controles de permisos y alcance, no asumir que el menú los protege.
6. La definición y migraciones físicas de BD NO están completas en el GitHub actual; antes de DDL exigir inventario real de la base.

## Criterios de aceptación
- CA-01: dos empresas A/B con datos distintos: ninguna operación del usuario A obtiene datos B, incluyendo acceso directo a APIs, IDs y exportaciones.
- CA-02: múltiples usuarios por empresa, con aislamiento de administración entre empresas.
- CA-03: asignación y modificación de perfiles a usuarios; autorización derivada de la combinación de perfiles según política aprobada.
- CA-04: usuarios de perfiles distintos ven menús distintos en el mismo sistema.
- CA-05: invocaciones directas a API para operaciones no autorizadas devuelven denegación sin modificar datos.
- CA-06: quitar todos los permisos genera navegación restringida o vacía, nunca acceso completo.
- CA-07: cambios en estado de usuario/perfiles revocan o actualizan autorización de forma definida y comprobada.
- CA-08: prueba del alcance por sucursal/depósito, incluyendo manipulación de IDs.
- CA-09: pruebas automatizadas de aislamiento multiempresa, permisos por acción y navegación; evidencia en TST.
- CA-10: todas las migraciones son incrementales y compatibles con el esquema real, con estrategia de reversión evaluada.

## Dependencias y decisiones a confirmar
D-01: si un mismo usuario humano puede pertenecer a varias empresas con una única identidad o precisa cuentas separadas (hoy login es empresa+usuario).
D-02: política de agregación cuando un usuario tiene varios perfiles (propuesto: unión de permisos concedidos, sin reglas de denegación explícita).
D-03: qué funciones son exclusivas del administrador global PROCEIT.
D-04: lista definitiva de permisos por módulo y alcance sucursal/depósito.
No bloquear REQ-2026-001 por estas decisiones; documentar antes de implementación de REQ-2026-002.

## Instrucciones para Claude
Tratar este requisito como regla transversal de producto. Primero completar REQ-2026-001 y documentar tablas/índices/perfiles/permisos reales del banco. Proponer diseño de APIs, autorización server-side, menú filtrado e SQL incremental sem modificar código antes da aprovação. Submeter cada execução para auditoria independente em AUD-REQ-2026-002-R01.md e seguintes.

## Historial
| Fecha | Autor | Estado | Observación |
|---|---|---|---|
| 2026-10-08 | Responsable PROCEIT | DEFINIDO PARA ANÁLISIS | Definición inicial (`ff77929`) |
| 2026-10-08 | Claude | PRONTO_PARA_AUDITORIA (diseño) | Entregados `DESENHO-REQ-2026-002-multiempresa.md`, `MATRIZ-PERMISOS-REQ-2026-002.md` y `TST-REQ-2026-002.md`. Sin código ni SQL. Pendientes de decisión: D-01 a D-05. Esperando AUD-REQ-2026-002-R01 |
| 2026-10-08 | ChatGPT | CORRECAO_SOLICITADA | AUD-REQ-2026-002-R01: 7 hallazgos (F-001 y F-002 ALTA; F-003 a F-006 MEDIA; F-007 BAJA); diseño no aprobado para implementación |
| 2026-10-08 | Claude | PRONTO_PARA_AUDITORIA (diseño v2) | Correcciones de la R01 en `0281e63` y TST. Decisiones D-01 a D-08 pendientes del responsable. Esperando AUD-REQ-2026-002-R02 |
| 2026-10-08 | ChatGPT | — | AUD-REQ-2026-002-R02 (`7b7af37`): diseño aprobable condicionalmente; 4 puntos nuevos (R02-F-001 a F-004) |
| 2026-10-08 | Responsable PROCEIT (registrado por ChatGPT) | — | Decisiones D-01 a D-08 en `DECISOES-REQ-2026-002-APROVACAO.md` (`2a007e7`): D-06 AJUSTAR; D-04 y D-07 condicionadas; demás aprobadas |
| 2026-10-08 | Claude | PRONTO_PARA_AUDITORIA (diseño v3) | Diseño y matriz v3 en `f657c2b`; TST actualizado. Esperando AUD-REQ-2026-002-R03 |

## Caminos alterados (fase de diseño)
- `documentacao/definicoes/DESENHO-REQ-2026-002-multiempresa.md` (nuevo)
- `documentacao/definicoes/MATRIZ-PERMISOS-REQ-2026-002.md` (nuevo)
- `documentacao/testes/TST-REQ-2026-002.md` (nuevo)
- `documentacao/definicoes/REQ-2026-002-multiempresa-usuarios-perfiles-menus.md` (estado e historial)
