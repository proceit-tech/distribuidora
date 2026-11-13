# AUD-NEXIT-CASA-MINGO-G01-R01 — Configuración editable del gateway (PRO-207)

**Fecha:** 21/10/2026
**Commit funcional auditado:** `db0f4e57ed2ba348952f36e58461cfa4d887dde1`
**Referencia canónica:** `documentacao/definicoes/REQ-NEXIT-CONFIGURACION-API-EDITABLE-2026-10-21.md`.
**Método:** revisión estática independiente en GitHub de `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progreso pertinente, diff, `gateway-url.ts`, `gateway.ts`, `configuracion-gateway.ts`, UI, NEX-061/NEX-069, preflight/verificar/reversion/procedimiento, y `configuracion-gateway.casos.ts`. Reproducción LOCAL de clasificación IP mediante Node, sin acceso a red.
**Fuera de alcance ejecutado:** no se ejecutó la suite de proyecto, PostgreSQL real, migraciones, navegador, gateway externo, CI ni VM por el auditor. Resultados Claude (85 tests G01 + 1.014 regresiones, TS/ESLint) solo reportados, no verificados.

## Dictamen

**G01-R01 — CORRECCIÓN OBLIGATORIA.** La parte funcional principal de edición y persistencia por empresa está bien estructurada: `baseUrl`, usuario/clave, `Cancelar`, prueba temporal con URL nueva, guardar sobre `fe_gateway_config`, caché particionada/invalidez, versión de NEX-069 que invalida pruebas antiguas. **Dos defectos de seguridad ALTA incumplen G01-07 (destinos privados y DNS rebinding)**, de modo que NO se autoriza implantar NEX-069 ni el nuevo código y NO iniciar E06 antes de auditoría G01-R02.

## Matriz dirigida

| Regla | Inspección de código | Estado |
| --- | --- | --- |
| URL editable, guardado y recarga por empresa | `page.tsx` URL `value={url}`; PUT `baseUrl`; `guardarConfiguracion` pasa base efectiva a `fe_gateway_config_guardar` | Conforme estático |
| Contraseña en blanco conserva anterior, secreto no retorna | `leerGuardado` transforma blanco a NULL; NEX-061/NEX-069 `coalesce` para clave; `fe_gateway_config_ver` devuelve solo bandera | Conforme estático |
| Probar URL escrita sin guardar | `probarConexion` elige `p.baseUrl ?? urlGuardada`; `guardadas` exige identidad de URL+credenciales; `INFORMADAS` es temporal | Conforme estático |
| Cambio solo de URL invalida prueba previa | NEX-069 `v_url_prev IS DISTINCT FROM p_base_url` activa incremento de `credenciales_version` y NULL en última prueba; `fe_gateway_prueba_registrar` exige versión | Conforme estático, sin ejecución PG |
| Login, consulta, FE y KuDE usan URL guardada | `configGatewayValida`, `obtenerToken`, `consulta_de`, `recepcion_de` y `kude` comparten `config.baseUrl` | Conforme estático |
| Validación HTTPS y seguridad de host | Forma, puertos, redirecciones restringidos; **IP IPv6 mapeada y TOCTOU de DNS siguen vulnerables** | **F-001, F-002 ALTA** |
| Permisos/tenancy | rutas invocan `prepararFacturacion(CONFIGURAR)`; NEX-069 mantiene `usuario_tiene_permiso` y permisos versionados | Coherente estático, PG real pendiente |
| NEX-069 aplicada/testada | migration y scripts versionados, no aplicados | **NO_VERIFICADO** |

## G01-R01-F001 — ALTA — IPv4 mapeada en IPv6 hexadecimal pasa la verificación

**Evidencia:** `lib/facturacion/gateway-url.ts`, `ipNoPublica`, aprox. líneas 49–75, solo trata la representación IPv4-mapeada decimal punteada con `/^::ffff:(\d+\.\d+\.\d+\.\d+)$/`. Una IPv4-mapeada equivalente en hexadecimal puro es reconocida por Node como IPv6, cae a la rama `isIP(dir) === 6` y no coincide con ninguno de los prefijos bloqueados.

Ejemplos: `::ffff:7f00:1` (mapea 127.0.0.1), `::ffff:a00:1` (mapea 10.0.0.1), `::ffff:c0a8:101` (mapea 192.168.1.1). La función **devuelve false**, esto es, los marca públicos. Reproducción LOCAL con `node:net.isIP` y exactamente la condición publicada. DNS AAAA puede presentar estas representaciones. Una vez `exigirDestinoPublico` da paso, el cliente HTTP puede dirigirse al loopback/intranet.

**Fix solicitado:** normalizar/canonizar **todas** las formas de IPv4-mapeadas (incluido segmento hexadecimal o formato mixto), mapearlas a su IPv4 real y aplicar filtro IPv4; o utilizar parser confiable de rangos públicos (rechazo por defecto). Añadir tests reales de `ipNoPublica` (no solo regex), con `::ffff:7f00:1`, `::ffff:a00:1`, `::ffff:c0a8:101`, `::ffff:127.0.0.1`, bloques especiales IPv4/IPv6 y DNS AAAA mixto. No permitir que hosts/resolvers manipulados accedan a IP interna, aunque el nombre sea públicamente válido.

## G01-R01-F002 — ALTA — DNS validado no es el DNS que se conecta (TOCTOU/rebinding)

**Evidencia:** `lib/facturacion/gateway-url.ts` líneas 92–101 `crearFetchSeguro`: llama `exigirDestinoPublico(url,resolver)`, que hace `lookup(host,{all:true})`, después entrega **la URL original por hostname** a `base(url, {redirect:'manual'})`. El HTTP client vuelve a resolver durante TCP. Un DNS administrado por atacante puede responder IP pública en lookup y IP privada en la conexión. La propia implementación documenta que no fija el IP; revalidar por petición no corrige la ventana entre lookup y conexión. `gateway.ts` reutiliza ese transporte por defecto para login, recepción, consulta y KuDE (este tiene otro `fetchKudeSeguro` con la misma ventana).

**Fix solicitado:** eliminar diferencia entre dirección autorizada y dirección efectivamente usada por la conexión. Resolver A/AAAA, validar **todos** los resultados con política de IP público, y **fijar la(s) IP(s) comprobadas** al crear la conexión (agente/dispatcher `lookup` controlado/pinning o alternativa equivalente); mantener hostname original para TLS SNI y comprobación estándar de certificado, usar `redirect: manual`, y aplicar idéntica garantía a `fetchSeguro` y `fetchKudeSeguro`. Rechazar si no se puede vincular verificacón a conexión con seguridad, sin caer en fetch global inseguro. Prueba dirigida: resolver secuencial responde público→privado, asegurar que conexión JAMÁS alcanza privado; incluir IPv6, mapeadas, redirecciones, diferentes tipos de request y casos DNS fallido. No alterar mocks fiscales ni códigos de documentos.

## Observación de seguridad secundaria (registrada, NO nuevo ticket)

URL del proveedor es elegible por un usuario con `FACTURACION_ELECTRONICA.CONFIGURAR`. Cambiar a **cualquier** hostname público validado y dejar la clave en blanco puede remitir las credenciales ya guardadas a ese dominio mediante `Probar conexión` o el login de emisión. La nueva interfaz da deliberadamente este poder a quienes pueden CONFIGURAR; al homologar, revisar confianza del rol y una política de host aprobado/consentimiento explícito de transferencia de credenciales, sin quebrar silenciosamente la decisión «cambiar solo URL conserva contraseña». No publicar lista de secretos, tokens, RUC de prueba ni logs sensibles.

## Tests, límites y rollout

**Informado por Claude, NO ejecutado por auditor:** suite G01 85 comprobaciones, 0 fallos; regresiones dirigidas 1.014/0; TypeScript/ESLint puntuales limpios; la batería de `gateway-config.casos` que arranca bash/docker no se ejecutó. NEX-069 sigue NO aplicada.

**NEX-069** conserva misma firma de `fe_gateway_config_guardar` y los grants; `fe_gateway_url_valida` valida forma y el preflight detecta URLs históricas incompatibles. `verificar-NEX-069.sql` valida existencia/estructura, no carrera real de prueba ni resolución de red. PG real y browser quedaron sin verificar. **No autorizar deploy ni correr NEX-069** mientras F001/F002 estén pendientes.

## Gate G01-R02

Claude corrige **SOLO** seguridad de transporte/validación F001 y F002 y sus tests/documentación operativa; la funcionalidad de guardar usuario/clave/URL no debe reescribirse. Tests focados incluyendo DNS rebinding reproducible y IPv4 mapeada, TypeScript/ESLint puntual, commit/push, SHA, limitaciones, **PARAR para auditoría G01-R02**. No E06, no SQL/VM, no homologación. Mantener PRO-207 no Done.
