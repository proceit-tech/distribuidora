# AUD-NEXIT-CASA-MINGO-G01-R02 — Transporte HTTPS seguro, IPv6 y DNS rebinding

**Fecha:** 21/10/2026  
**Commit funcional auditado:** `eb23737637c1b5eb9bba69903a773bf52c4f8c99`  
**Commit anterior:** `db0f4e57ed2ba348952f36e58461cfa4d887dde1`  
**Auditoría base:** `documentacao/testes/AUD-NEXIT-CASA-MINGO-G01-R01-2026-10-21.md`.  
**Tareas:** PRO-208 (F001), PRO-209 (F002), PRO-207 (G01), PRO-200.

## Parecer

**G01-R02 APROVADA ESTATICAMENTE.** Los hallazgos de seguridad PRO-208/PRO-209 están **corregidos en el código inspeccionado**. No se identifican nuevos defectos bloqueantes específicos del parche. La configuración editable G01 queda apta a avanzar **solo en desarrollo**, no homologada ni aplicada a la VM.

Auditoría en GitHub: lectura de `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progreso pertinente, auditoría R01, diff, `lib/facturacion/gateway-url.ts`, `lib/facturacion/gateway.ts`, `lib/facturacion/gateway-destino.casos.ts`, `lib/facturacion/configuracion-gateway.casos.ts` y procedimiento NEX-069. **No se ejecutaron por ChatGPT** Node/TypeScript/ESLint, suites, CI, socket de gateway real, PostgreSQL, migrations, Docker ni navegador.

## Matriz de aceptación

| Hallazgo y requisito | Evidencia en commit `eb237376` | Resultado |
| --- | --- | --- |
| F001 / IPv4 mapeada (decimal, hexadecimal, forma larga, mayúsculas) | `bytesIpv6` decodifica IPv6 a 16 bytes; `ipNoPublica` identifica prefijo `::ffff:0:0/96` incluso escrito como hexadecimal y aplica los mismos rangos especiales IPv4. También rechaza compatible `::/96` y zonas. | **CORREGIDO ESTÁTICAMENTE** |
| F001 / NAT64, 6to4, Teredo y IPv6 local/reservada | Rechazo por defecto fuera de 2000::/3 y exclusiones explícitas de 2001::/32, 2002::/16, 2001:db8::/32, 3fff::/20, otras reservadas | **Conforme en recorte; selección de rangos especiales requiere mantenimiento si IANA cambia** |
| F002 / no resolver por segunda vez tras validación | `solicitar` usa `node:https.request` y **una sola** función `lookup: crearLookupSeguro(resolver)`; esa función resuelve/valida toda la lista A/AAAA y **solo devuelve IPs validadas al socket**. Ya no hay `fetch(url)` que rehaga resolución fuera de control | **CORREGIDO ESTÁTICAMENTE** |
| F002 / hostname TLS/SNI y verificación certificado | `hostname` original en `https.request`, `rejectUnauthorized:true`, sin agent compartido, ningún `servername` cambiado a IP. No se desactiva TLS | Conforme por inspección de opciones; falta handshake con certificado válido real |
| F002 / impedir redirecciones y rutas inseguras | `https.request` no redirecciona; acepta únicamente origen HTTPS validado y rutas internas de la aplicación; rechaza IP literal, userinfo, puertos no admitidos | Conforme estático |
| F002 / login, Probar conexión, emisión, consulta y KuDE | `gateway.ts`: `fetchSeguro` por defecto para cuatro llamadas y `fetchKudeSeguro` para cuerpo PDF en streaming; los dos comparten `solicitar` y `crearLookupSeguro` | Conforme estático |
| Regresión funcional en G01 | El commit solo altera transporte, tests y procedimiento; NEX-069, pantalla, credenciales por empresa, payload fiscal y motores E01–E05 no cambiaron | Conforme al diff |

## Pruebas del desenvolvedor y límites

**Claude reportó (no reproducido por auditor):** nuevo `gateway-destino.casos` 15 comprobaciones / 0 fallas; configuración 81/0, fat-e2 44/0, kude 96/0, facturacion 271/0, nce 205/0; TypeScript y ESLint puntuales sin errores. Los tests cubren IPv4 mapeada, IPv6 especial, respuesta DNS público→privado, DNS mixto A/AAAA, hostname original, redirección, lectura KuDE/cancelación y un `https.request` real que rechaza resolución privada antes de abrir un socket.

**Limitación material:** el transporte de IP fijada usa un **simulador de conexión** para destino público; la prueba con `node:https` real solo demuestra rechazo del IP privado, **no** verifica conexión pública TLS exitosa, SNI, cadena de certificados, compatibilidad con servidor destino real ni comportamiento de red durante corte/timeout. Este conjunto debe validarse en homologación autorizada y no justifica declarar listo para producción.

## Observación de seguridad no bloqueante conservada desde R01

La URL elegida por un usuario con `FACTURACION_ELECTRONICA.CONFIGURAR` puede ser **cualquier dominio HTTPS público** válido. Si deja la contraseña en blanco, mantiene la clave actual y una prueba posterior puede transmitirla al nuevo host. El pinning DNS previene acceso a infraestructura interna pero **no acredita la confianza del operador de ese host**. El alcance de CONFIGURAR y/o consentimiento para transferir credenciales debe evaluarse en la homologación; **no alterar silenciosamente el comportamiento aprobado**.

## Estado y gate

- **PRO-208/PRO-209:** resueltos **estáticamente**, no marcados Done/Homologados.
- **PRO-207/G01:** revisión técnica estática aprobada, no homologada.
- **NEX-067, NEX-068 y NEX-069:** continúan **NO aplicadas**; no ejecutar por IAs. Para despliegue se requiere listado real de pendientes, backup, preflight/verificación, pruebas TLS y autorización expresa del responsable.
- **E06** (NCE selección y devolución parcial, tal como define el handoff) **puede comenzar como siguiente entrega de desarrollo aislado**, con tests dirigidos, commit/push y detención para auditoría E06-R01. No implica autorizar deploy ni pruebas operacionales automáticas.
