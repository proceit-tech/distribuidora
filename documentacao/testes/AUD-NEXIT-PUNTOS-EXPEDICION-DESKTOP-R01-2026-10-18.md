# AUD-NEXIT-PUNTOS-EXPEDICION-DESKTOP-R01 — Auditoría individual por función

**Fecha:** 18/10/2026. **Menú:** Facturación → Puntos de expedición; ruta /facturacion/puntos. **Rama:** feature/NEXIT-2026-001-banco-demo. **Dictamen:** AUDITORÍA ESTÁTICA DOCUMENTADA, HALLAZGOS ABIERTOS, NO HOMOLOGADO. No se autorizan correcciones a Claude ni modificación funcional, SQL, migration, VM o deploy.

**Fuentes:** CLAUDE.md, documentacao/PROTOCOLO-IA.md, PROGRESSO-NEXIT-V1.md (PRO-129, NEX-063/064/065), documentacao/v1/DECISAO-PUNTOS-TIPOS-SERIES-2026-10-17.md, referencia visual PUNTOS-EXPEDICION-UX-R01-ANTES-DEPOIS-2026-10-17.md, app/(private)/facturacion/layout.tsx y puntos/page.tsx (501 líneas; blob e5450bcba0ab1089736e3bfd85c9a2af3d143d81) y page.module.css (129), rutas API GET/POST puntos, POST puntos/[id]/tipos y POST puntos/[id]/tipos/[tipo]/estado; lib/facturacion/puntos.ts (256; blob 0e5c5f4787cd35f545c551d2174b5fe3d17210f0) y series.ts; migraciones NEX-063-facturacion-puntos-tipos-series.sql (649), NEX-064-facturacion-punto-alta-con-tipo.sql (94), NEX-065-facturacion-estado-por-tipo.sql (543), tests versionados puntos.casos, alta-punto.casos, estado-tipo.casos, series.casos, y contratos de emisión FE/NCE.

**Alcance:** menú de escritorio. Se leyeron todas las 501 líneas del componente React y 256 líneas del servicio, APIs, CSS, partes relevantes de SQL actual y tests de texto; **no se ejecutó ninguno**. Sin browser/screenshot actual, PostgreSQL/VM, gateway SIFEN, build/lint/tsc/CI ni migración aplicada por ChatGPT. Los resultados históricos del responsable y de Claude no equivalen a esta ronda. No inferir estado actual real de schema_migrations en VM.

## 1. Contrato funcional que debe quedar intacto

Identidad fiscal del contador: empresa + establecimiento SIFEN (3 cifras) + punto de expedición (3 cifras) + tipo documental. Un punto administrativo único puede albergar FE, NCE, NRE, NDE, AFE. Cada tipo tiene su serie, último número y estado. Sólo FE y NCE poseen flujos de emisión; NRE/NDE/AFE se configuran pero NO emiten por existir su fila. Inicial sin serie con próximo 0000001; 9999999 sin serie → AA-0000001; AA…ZZ; ZZ-9999999 → agotada, nunca reiniciar, retroceder o reutilizar. Timbrado/ambiente no son dimensión independiente del contador por mera suposición. Próximo mostrado es REFERENCIAL; sólo backend SQL bajo locks determina el número definitivo.

El alta nueva exige sucursal en alcance con establecimiento, código, nombre, tipo, serie y último número explícitos, confirmación única y elección de activar; registra/reutiliza punto + configura un tipo en UNA transacción SQL. No hay doble alta ni segundo formulario ni creación de tipo FE implícito. La emisión debe usar estado por TIPO, no una segunda compuerta del punto administrativo (decisión vinculante 17/10). Permiso FACTURACION_ELECTRONICA.PUNTOS tanto en layout y rutas como SECURITY DEFINER SQL, empresa/usuario exclusivamente de sesión, sin permitir escritura de identidad ajena. Numeración/log/documentos/CDC históricos conservados.

## 2. Matriz por campo y función

| Función | Evidencia actual | Estado estático |
| --- | --- | --- |
| Acceso | app/(private)/facturacion/layout.tsx:4–6, APIs GET/POST | PUNTOS requerido, empresa/usuario de sesión |
| Lista de sucursales y tipos | lib/facturacion/puntos.ts:153–194 | filtros de empresa, sucursal activa, sucursal_en_alcance; incluye punto administrativo inactivo; secuencias por tipo |
| Tabla desktop y filtros | page.tsx:107–138,260–377 | fila por tipo, filtros sucursal/tipo/estado, estados y acciones; PUN-D02 |
| Nuevo punto y tipo | page.tsx:161–203,378–450; NEX-064:30–78 y NEX-065:384–430 | formulario único, tipo obligatorio, 0 declarado, lock de identidad, registro atómico o reuse; no duplica tipo |
| Configurar serie y último número | page.tsx:205–247,452–497; puntos.ts:74–88,230–236; NEX-063:481–544 | confirmación/no retroceso; PUN-D01 en checkbox de estado |
| Activar/desactivar por tipo | page.tsx:249–255,362–366; NEX-065:433–470 | fe_secuencia_estado cambia SOLO esa secuencia; ninguna acción del punto físico |
| Numeración con series | lib/facturacion/series.ts; puntos.ts:146–151; NEX-063:47–116 | próximo referencial, reserva FOR UPDATE, AA–ZZ y fin |
| Estado de emisión FE/NCE | NEX-065:113–119,356–361 y puntos.ts:183–190 | compuerta en fe_punto_secuencias.activo; fuente SQL corregida, despliegue no verificado |
| Errores y recarga | puntos.ts:110–139; page.tsx:80–105,140–159 | mensajes 403/404/409/422; PUN-D03 refresh fallido conserva tabla |
| Grupos sin emisión | puntos.ts:20–25,183–190; page.tsx:352–360,438–443,485–490 | NRE/NDE/AFE configurables, no emiten |
| NEX-065 | PROGRESSO-NEXIT-V1.md:1259–1268 | aplicación en VM posterior a corrección NO acreditada en contexto |

**Preservar correcciones anteriores:** alta tipo único con NEX-064, independencia de estados FE/NCE en NEX-065, retirada de fe_punto_estado global, aislamiento y grants, serie null inicial sin AA automático, tipo FE/NCE separado del punto, contador nunca retrocede, reservas SQL atómicas y tests versionados sin inferir homologación. No reabrir defectos de la pantalla antigua con 2 formularios ni botones «Activar punto» sin evidencia en código vigente.

## 3. Hallazgos NUEVOS

### PUN-D01 — ALTA — casilla de activación engañosa al guardar la configuración de tipo existente

**Evidencia exacta:** app/(private)/facturacion/puntos/page.tsx:231–246 abre «Configurar» en FE/NCE activo pero establece activar:false de modo incondicional. En :485–489 el operador ve «Dejar este tipo activo» desmarcado, y :212–228 POST envía activar:false. SQL NEX-063:532–543 para secuencia ya configurada ejecuta activo = CASE WHEN p_activar IS TRUE THEN true ELSE activo END: false no desactiva, PRESERVA el activo anterior. NEX-065 NO sustituye fe_secuencia_configurar. El éxito se informa «Configuración guardada».
**Caso derivado:** 001-001-FE activa; entrar «Configurar», confirmar mismo o nuevo último número con casilla desmarcada y guardar; UI informa éxito y la FE SIGUE ACTIVA. La acción separada «Desactivar FE» sí existe y funciona por tipo; la falla no es imposibilidad absoluta de apagar, sino ambigüedad peligrosa del formulario de configuración.
**Aceptación:** diferenciar explícitamente «Mantener estado actual» y «Activar ahora» (sin opción falsa de desactivar), o implementar desactivación expresa bajo la misma política por tipo (sin alterar numeración), con texto/estado real y confirmación. NO reinterpretar false de una migration ya aplicada arbitrariamente. Tests activo/inactivo, checkbox, FE/NCE independientes, permiso, confirmación y guardado.

### PUN-D02 — MEDIA — una secuencia FE/NCE agotada se anuncia disponible para emitir

**Evidencia:** lib/facturacion/puntos.ts:146–151 / series.ts calculan próximo «Agotada» cuando serie ZZ y último 9999999. page.tsx:345,359 decide badge «Activo · disponible para emitir» con t.activo && t.emitible, ignorando fin de serie; :127–131 incluye la fila en filtro «Activos». NEX-063:102–113 rechaza reserva del número sin sucesor (NEX:NUMERACION_AGOTADA).
**Impacto:** una fila sin números aparece apta en lista y filtros, aunque el servidor bloquea legalmente la emisión. No se demostró duplicidad fiscal.
**Aceptación:** mostrar «Numeración agotada · emisión bloqueada», excluir de filtro «disponibles para emitir» o separar estado administrativo (activo) y operacional (puede emitir), nunca reiniciar ZZ. Test sin serie 9999999 muestra AA, AZ 9999999 muestra BA, ZZ 9999998 próximo ZZ-9999999, ZZ 9999999 bloqueado.

### PUN-D03 — BAJA — después de error de refresco GET se conserva la tabla anterior operable sin marca stale

**Evidencia:** page.tsx:80–105 recargar pone cargando; en catch de GET sólo setErrorCarga y mantiene sucursales anteriores; finally quita cargando y la tabla :343–366 vuelve a exponer filas y botones anteriores. El error sí es visible en :279 y el backend revalida cada operación, por tanto no declarar bypass de seguridad.
**Aceptación:** mantener datos marcados claramente «No actualizados» o deshabilitar acciones mientras no se confirme última carga, con Reintentar seguro. Tests después de alternar estado y fallo de GET, nueva numeración concurrente y retry correcto.

**Totales de nuevos hallazgos: 1 ALTA + 1 MEDIA + 1 BAJA.** No se afirma que estos casos hayan sido reproducidos con PostgreSQL o navegador. Son consecuencias del texto actual de UI, servicio y SQL.

## 4. Observaciones/dependencias — NO contabilizarlas como defectos nuevos

- **PUN-O01 — COMPROMISO OPERACIONAL ALTO: confirmar NEX-065 real.** PROGRESSO-NEXIT-V1.md:1259–1268 documenta la primera tentativa real de NEX-065 en VM que falló por validación textual falsa del índice documentos_electronicos_numero_key, a pesar de estar bien creado. Después se corrigieron archivos de migration/preflight/verificar y se versionó T35, pero NO consta en esa evidencia que NEX-065 se aplicase con éxito después. El usuario/responsable debe verificar schema_migrations, fe_estado_previo_nex065, definición de las funciones FE/NCE y grants, con backup/preflight. **Si no se aplicó NEX-065, el código desplegado puede seguir usando la compuerta física compartida**. La fase de auditoría no autoriza aplicar nada ni afirmar estado real.
- **PUN-O02 — toggle directo de FE/NCE:** botón «Activar/Desactivar FE/NCE» hace POST con un solo clic, sin diálogo de confirmación. Mejorar sólo si responsable decide requisito de confirmación; la especificación vinculante pide acción por tipo pero no exige confirmación de cada toggle. No contar como fallo probado.
- **PUN-O03 — «Inactivos» significa «no disponibles para emitir» en filtro:** page.tsx:127–132 incluye también NRE/NDE/AFE configurados, que nunca son emitibles, aunque su secuencia esté administrativamente activa. Es semántica deliberada comprobada en pruebas de fuente R02-01; si se requiere «desactivados» vs «no emitibles», distinguir estados por decisión de UX, no reabrir código deliberado.
- **PUN-O04 — fallback de columnas NEX-063 ausentes:** puntos.ts:166–190 permite GET antiguo ante error 42703 suponiendo serie null y activo true; es compatibilidad histórica que puede mostrar disponibilidad deducida y no real. El progreso conocía NEX-063 aplicada el 17/10 en VM, así que no suponer que ocurra allí ahora; poner advertencia si se usa en otro ambiente.
- **PUN-O05 — otros emisores externos:** confirmar último número de otro ERP es responsabilidad operativa, no garantía automática de que nadie emita a la misma identidad fiscal.
- **PUN-O06 — contrato XML/JSON serie:** XML omite dSerieNum sin serie, gateway JSON null versus omisión pendiente GATEWAY-SERIE-01; no afirmar homologación.
- **PUN-O07 — focos del diálogo:** el fondo queda inert al abrir y existe Escape, pero no se verifica focus-trap ni devolución foco al botón después de cerrar/guardar. Revisión con teclado y browser desktop 1440/1920 queda pendiente, sin inventar defecto visual.
- **PUN-O08 — SQL tests:** T27/T28/T30/T31/T32/T33/T34/T35 versionados o citados; no ejecutados por ChatGPT. No afirmar locks/deadlocks probados en PostgreSQL.
- **PUN-O09 — presentación:** no exigir móvil, sólo desktop; las capturas ANTES existen como referencia textual, sin PNG versionado en Git. DESPUÉS requiere captura y visto bueno del responsable.

## 5. Matriz de pruebas focales futuras (0 ejecutadas)

| ID | Caso de aceptación |
| --- | --- |
| PUN-T01 | Permiso PUNTOS en menú/layout/3 APIs/SQL; 403 operador no autorizado, aislamiento empresa A/B |
| PUN-T02 | Alta de punto nuevo FE con serie sin definir y número 0 declarado: 0000001, sin tipo huérfano |
| PUN-T03 | Alta NCE de punto FE existente: mismo punto y nombre, independiente contador, sin doble formulario |
| PUN-T04 | Dos altas simultáneas (mismo código, tipos distintos y mismo tipo), transacción/identidad fiscal |
| PUN-T05 | Tipo existente → nuevo alta se rechaza sin escribir, orientar a configurar |
| PUN-T06 | Reconfigurar FE activo con activar false: sin engaño de cambio de estado, ver PUN-D01 |
| PUN-T07 | Desactivar FE no cambia NCE y viceversa, con NEX-065 aplicada/verificada por responsable |
| PUN-T08 | Sin serie 9999999 → AA, AA 9999999 → AB, AZ→BA, ZY→ZZ, ZZ 9999999 agotada |
| PUN-T09 | ZZ 9999999 ACTIVA no debe figurar disponible para emitir (PUN-D02) |
| PUN-T10 | Retroceso o duplicación por SQL/API directa rechazados, números/documents inmutables |
| PUN-T11 | Punto en sucursal ajena o establecimiento duplicado en otra sucursal: error/locks |
| PUN-T12 | Fallo GET después de cambio estado; filas stale etiquetadas y retry (PUN-D03) |
| PUN-T13 | NRE/NDE/AFE configurables pero sin rutas de emisión ni mensaje «Disponible para emitir» |
| PUN-T14 | NEX-065 estado real mediante comprobación autorizada de VM, grants y no reactivación histórica |
| PUN-T15 | Concurrente reserva FE vs toggle NCE, bloqueo solo de la fila correcta |
| PUN-T16 | Permisos PUNTOS/CREAR separados: poder administrar no implica poder emitir |
| PUN-T17 | Diferencias de serie null/ausencia del JSON gateway, sin suponer respuesta proveedor |
| PUN-T18 | Browser desktop 1440/1920: tabla, filtros, errores, foco, diálogos, acciones y legibilidad |

## 6. Cierre y continuidad

Menú **Facturación → Puntos de expedición auditado estaticamente**: **1 ALTA, 1 MEDIA, 1 BAJA** nuevas, nueve observaciones y 18 tests futuros. Mantener decisión de no corregir todavía y de no ejecutar SQL, migrations, VM, CI ni enviar tareas al Claude. **NO HOMOLOGADO**. Tras este registro, **21 entradas de V1** cuentan con auditoría estática individual/transversal; queda **Facturación → Notas de crédito** en la secuencia activa. Plataforma → Empresas va por auditoría separada; menús ocultos sólo si el responsable decide. La fase global no se cierra sin consentimiento explícito.
