# NEXIT — Configuración de la API editable y persistente

**Decisión del responsable (21/10/2026):** en `Configuración → Facturación electrónica`, **dejar los campos de configuración de la API abiertos para editar, cambiar y guardar**, incluyendo la **URL base del gateway**, el **Usuario API** y la **Contraseña API**. Hoy la URL se muestra `readOnly` y el servidor usa una URL constante tanto al guardar como al probar; el usuario necesita poder apuntar otra URL **por empresa** desde la pantalla, sin tocar Git, variables globales ni PostgreSQL manualmente.

**Estado:** REQUISITO APROBADO, NO IMPLEMENTADO. No mezclado con E05; crear una **entrega única G01 / Configuración editable**, auditar antes de avanzar con E06. Relación: PRO-133 (gateway), PRO-200 (paquete CASA MINGO) y la URL de prueba del 20/10/2026. No implica cambiar identidad fiscal, entorno de otra empresa, logo ni KuDE.

## Comportamiento definitivo

1. **Pantalla en español:** `Empresa` permanece **solo lectura** (contexto de la sesión, no campo de API). `URL base del gateway`, `Usuario API (RUC)` y `Contraseña API` son editables para quien tenga `FACTURACION_ELECTRONICA.CONFIGURAR`. No exponer ni hacer editable `empresa_id`, `credencial_ref`, token, endpoints internos ni credenciales de otra empresa.
2. **Carga/edición:** mostrar `baseUrl` y usuario persistidos, prellenados. Contraseña oculta, **nunca** se devuelve al navegador; en blanco al editar significa **conservar la actual**, escribir otra la reemplaza. Mostrar indicador de contraseña configurada sin revelar el secreto.
3. **Guardar:** `PUT /api/facturacion/configuracion` recibe URL base editada + usuario + contraseña opcional y valida servidor; la función SQL `fe_gateway_config_guardar` existente ya recibe `p_base_url` y persiste por `empresa_id`. En la aplicación se debe **dejar de pasar `URL_GATEWAY_PRUEBA` forzado** cuando el usuario ha seleccionado una URL válida. `GET` posterior recupera exactamente la URL guardada; recargar pantalla conserva cambios. La URL predeterminada del sistema se propone solo si la empresa aún no tiene ninguna URL configurada; **nunca sobrescribir silenciosamente el valor de otra empresa**.
4. **Probar conexión:** `POST /api/facturacion/configuracion/probar` debe usar **la URL efectiva elegida** (valor editado aún no guardado, si está presente y se señala explícitamente como prueba temporal, o guardado cuando no hay edición) y las credenciales aplicables, enviando solo `POST /api/login`. NO seguir apuntando a `URL_GATEWAY_PRUEBA`. Una prueba de valores **no guardados** debe identificarse como temporal y **no** marcar como comprobada la configuración almacenada. Solo autenticación, nunca emisión/cancelación/documento fiscal.
5. **Prueba desactualizada:** cambiar solo la URL también invalida la prueba previa (fecha/estado) y tokens de la empresa, igual que cambiar el usuario/clave. El esquema existente `NEX-061` incrementa `credenciales_version` solo cuando se modifican usuario/clave: revisar una solución **incremental** que también versiona el cambio de URL y evita que un resultado tardío de `Probar conexión` sobre la URL anterior se guarde como vigente (carrera guardar↔probar). No modificar migraciones **ya aplicadas**; confirmar orden con el runner, añadir nueva si indispensable. No asumir que NEX-067/068 estén aplicadas.
6. **Conexiones fiscales:** tanto login como emisión/consulta/KuDE posterior deben usar la URL por empresa persistida (a través de `configGatewayValida` / flujo actual) y sus propias credenciales; no cambiar a otra identidad/empresa. `Probar conexión` OK no certifica FE/NCE/KuDE.
7. **Validaciones y seguridad:** aceptar únicamente una URL base HTTPS autorizada, sin ruta, query, fragmento, usuario/clave embebidos ni redirecciones inseguras. Validar host/puerto de forma defensiva en servidor y al conectar; **rechazar localhost, redes privadas, loopback, link-local, metadata, IPs reservadas, DNS interno/rebinding y redirecciones a destinos no autorizados** (protección SSRF). No guardar host interno, no filtrar tokens/contraseñas en respuestas ni logs. No aceptar la empresa del body; sesión/autorización SQL obligatorias. Mantener límites de intentos de prueba y timeout.
8. **UI/UX:** editar URL y credenciales, `Guardar`, `Probar conexión`, avisos claros por éxito/error, bloqueo de acciones mientras hay request; opción de cancelar edición y restaurar valores guardados sin escribir en el servidor. Si la URL cambió, la UI no debe mostrar «probada» por el éxito histórico de otra URL. No sustituir automáticamente contraseñas ni borrar otras configuraciones.
9. **No hacer:** no tocar NEX-067/068, stock, descuentos, NCE, payload SIFEN, logo, KuDE visual, identidad fiscal del emisor ni credenciales de otros tenants; no deploy/SQL real por Claude/ChatGPT.

## Código existente que el Claude debe auditar

- `app/(private)/configuracion/facturacion-electronica/page.tsx`: `<input value={conf.baseUrl} readOnly>`; usuario/senha sí editables; guarda y prueba sin incluir URL.
- `lib/facturacion/configuracion-gateway.ts`: `leerGuardado` / `leerPrueba` omiten URL; `guardarConfiguracion` pasa `URL_GATEWAY_PRUEBA`; `probarConexion` también fuerza la constante en `probarLoginGateway`.
- `app/api/facturacion/configuracion/route.ts` y `.../probar/route.ts`: rutas ya autenticadas para `CONFIGURAR`.
- `documentacao/banco/nexit/v1/migraciones/NEX-061-facturacion-gateway-credenciales-empresa.sql`: `fe_gateway_config_guardar` guarda URL por empresa; CHECK forma HTTPS, pero falta revisar protección SSRF, versionado de cambio de URL y prueba tardía.
- `lib/facturacion/gateway.ts`: `configGatewayValida` acepta URL guardada; `probarLoginGateway` recibe `baseUrl`; cache de tokens está particionada por empresa/URL, además se invalida al guardar.
- `lib/facturacion/gateway-credenciales.ts`: `URL_GATEWAY_PRUEBA` pasa a ser valor **predeterminado inicial**, nunca URL forzada al guardar o probar una empresa ya configurada.
- `lib/facturacion/configuracion-gateway.casos.ts`: tests previos hoy verifican URL fija e ignorar URL del body; actualizarlos únicamente para el nuevo contrato seguro.

## Criterios de aceptación dirigidos

- **G01-01:** empresa A, URL vieja guardada, usuario/clave cargados; editar **solo URL**, guardar, recargar → URL nueva persiste; probar y siguiente login usan host nuevo.
- **G01-02:** editar usuario + password y guardar; posterior GET retorna solo `tienePassword`; nunca la clave.
- **G01-03:** password vacío conserva contraseña anterior; cambiar solo URL no exige reintroducirla.
- **G01-04:** empresas A y B mantienen URLs/credenciales diferentes; rol sin CONFIGURAR recibe 403 y no filtra identidad/clave.
- **G01-05:** `Probar conexión` con URL no guardada usa el valor explícito de la pantalla y muestra claramente «prueba no guardada»; no marca configuración efectiva OK; al Guardar se invalida versión anterior.
- **G01-06:** cambio de URL mientras prueba anterior está en tránsito descarta el resultado obsoleto, incluyendo reintentos y errores tardíos; no altera configuración nueva.
- **G01-07:** URL inválida, no HTTPS, puerto no autorizado, ruta/query, credenciales incrustadas, host interno/localhost/IP privada/redirección, DNS a IP privada → error claro, nada guardado y cero llamadas externas con secretos.
- **G01-08:** después de guardar URL nueva, el login FE usa la base guardada; no cambiar RUC emisor ni datos KuDE de proveedor de pruebas.
- **G01-09:** pruebas TypeScript/ESLint focais y regresiones de configuración PRO-133, gateway, envio FAT-E2, consulta y KuDE; mocks inyectables sin exponer password. Cualquier migration incremental solo versionada, no ejecutada en VM.

## Gate

La auditoría E05-R01 se documentó sin bloqueos. **G01 se prioriza como siguiente entrega de desarrollo porque el responsable lo pidió explícitamente**, antes de E06 del paquete general. Claude debe leer el estado real del Git, trabajar solo G01, pruebas dirigidas, commit/push y **PARAR para auditoría ChatGPT G01-R01**. Si G01 requiere una migration incremental, no declarar aplicabilidad hasta inspección/backup/preflight/homologación del responsable.
