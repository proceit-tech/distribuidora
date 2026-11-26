# REQ-2026-002 — Multiempresa, usuarios, perfiles y menús por permisos

> **ATUALIZAÇÃO ANALÍTICA 24/10/2026:** responsável confirmou MASTER global, cadastro de empresas/primeiro admin, administrador próprio em cada empresa e **múltiplos perfis por usuário** (VENDEDOR + FATURADOR, CONTADOR e outros). A referência atual de decisões confirmadas/em aberto é `REQ-NEXIT-PLATAFORMA-MULTIEMPRESA-PERFILES-R01-2026-10-24.md`. D-01…D-04 e os “hallazgos del código actual” abaixo são HISTÓRICOS: verificar código atual antes de segui-los. A premissa universal Usuario=Vendedor foi revogada e E2 está bloqueada para análise. Esta nota não autoriza implementação.


Estado: DEFINIDO PARA ANÁLISIS; NO AUTORIZA CAMBIOS DE CÓDIGO HASTA REVISAR LA ESTRUCTURA REAL DEL BANCO.
Prioridad: ALTA — fundamento transversal del DistribuNex.
Idioma funcional y de interfaz: español (Paraguay).
Implementador: Claude. Auditor independiente: ChatGPT. Homologación final: responsable PROCEIT.

## Objetivo
Una instalación del DistribuNex debe admitir múltiples empresas independientes, cada empresa con múltiples usuarios y perfiles configurables, cada perfil con un menú y permisos específicos. La restricción debe aplicarse tanto en la interfaz como en el servidor y en el acceso a datos.

## Reglas de negocio
- RN-01 MULTIEMPRESA: una misma instalación y backend sirven a numerosas empresas; todos los datos de negocio deben pertenecer explícitamente a una empresa o estar clasificados como catálogos globales.
- RN-02 AISLAMIENTO: un usuario no puede consultar, crear, modificar, exportar o borrar información de otra empresa por manipulación de URL, IDs, payloads o API. El contexto de empresa se determina en el servidor y se valida en cada operación.
- RN-03 USUARIOS: cada empresa puede disponer de múltiples usuarios, con altas, bajas lógicas, bloqueo/reactivación y auditoría. El identificador de inicio de sesión actual utiliza empresa + usuario + contraseña; conservarlo mientras no se apruebe otra especificación.
- RN-04 PERFILES (APROBADO 24/10/2026): **todas las empresas reciben los mismos nueve perfiles preexistentes**, con nombres visibles en español (Paraguay): **Administrador de empresa, Gerente, Vendedor, Facturador, Contador, Compras, Inventario y depósitos, Finanzas y Consultas e informes**. El MASTER es autoridad global SEPARADA, no es un perfil empresarial asignable. El administrador empresarial **NO crea, edita ni elimina perfiles o permisos**: únicamente asigna o retira uno o varios de estos perfiles a usuarios de SU empresa. **Matriz de permisos/menús/acciones aún pendiente de aprobación:** los nombres no autorizan funcionalidades automáticamente. El mantenimiento del catálogo es central, no por tenant. Todas las etiquetas y mensajes de la UI en español de Paraguay.
- RN-13 MÓDULOS CONTRATADOS (DECISIONES 24/10/2026): el MASTER habilita por empresa únicamente los módulos contratados; ninguna empresa puede activar módulos adicionales. **Administrador de empresa:** acceso operativo total a todas las funciones de esos módulos, sin permisos granulares por acción ni perfiles adicionales, solo en SU empresa. **Usuarios comunes:** acción permitida si el módulo está habilitado y la unión de sus perfiles activos la autoriza, dentro de su empresa y sus sucursales/depósitos permitidos. Toda API/backend y navegación deben verificar contratación + contexto de empresa + autorización correspondiente; no hay exención de autenticación, validación de datos ni integridad fiscal. No se han definido licencias, caducidad ni estructura técnica definitiva.
- RN-14 ADMINISTRADOR DE EMPRESA (DECISIÓN 24/10/2026): el usuario con perfil **Administrador de empresa** tiene **acceso operativo completo a todas las funciones de cada módulo contratado y habilitado por el MASTER para SU empresa**, sin requerir otros perfiles ni configurar autorizaciones por acción. No puede habilitar módulos no contratados, administrar el MASTER o empresas ajenas, ni crear/editar perfiles o permisos del catálogo. Los demás usuarios conservan la unión de permisos de sus perfiles activos. Los controles de módulos, empresa, autenticación y validaciones de negocio se mantienen también en API/backend. Una política de alcance por sucursal/depósito para el Administrador de empresa no fue decidida aquí y no debe inventarse.
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
D-02: **DECISIÓN CONFIRMADA 24/10/2026:** los permisos efectivos de un usuario con varios perfiles son la **UNIÓN de todos los permisos concedidos por sus perfiles activos**, limitada siempre por la empresa de la sesión y por sucursales/depósitos autorizados; sin elevación a permisos MASTER. Un perfil que no concede un permiso no anula el otorgado por otro. Sin permiso concedido se rechaza la acción. El backend y los menús deben respetar esta agregación; los cambios de perfiles requieren revalidar acceso/sesión. Las asignaciones de sucursales/depósitos y la matriz concreta por perfil siguen pendientes de especificación.
D-03: qué funciones son exclusivas del administrador global PROCEIT.
D-04: lista definitiva de permisos por módulo y alcance sucursal/depósito. **Decisión adicional confirmada:** el admin empresarial NO edita perfiles/permisos; solo administra asignaciones de perfiles preexistentes, incluso varias por usuario. Ver requisito canónico R01, RN-08/RN-09 y D-02/D-02A.
No bloquear REQ-2026-001 por estas decisiones; documentar antes de implementación de REQ-2026-002.

## Instrucciones para Claude
Tratar este requisito como regla transversal de producto. Primero completar REQ-2026-001 y documentar tablas/índices/perfiles/permisos reales del banco. Proponer diseño de APIs, autorización server-side, menú filtrado e SQL incremental sem modificar código antes da aprovação. Submeter cada execução para auditoria independente em AUD-REQ-2026-002-R01.md e seguintes.
