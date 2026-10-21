# Procedimiento NEX-069 — URL del gateway editable (PRO-207 / G01)

**Estado:** versionada y **NO aplicada**. Ningún agente de IA la aplica. La ejecuta **solo el responsable humano** en la VM, con backup previo, según `documentacao/infra/PROCEDIMENTO-ATUALIZACAO-AMBIENTE-NEXIT-VM.md` (runner oficial `aplicar-migraciones.sh`, `--solo-listar` antes). **No depende de NEX-066/067/068**, pero el runner aplica en orden TODAS las pendientes: revisar el listado.

## Qué hace
- Reemplaza `fe_gateway_config_guardar` (misma firma y grants) y crea `fe_gateway_url_valida`: la base **vuelve a validar** la URL (https, dominio en minúsculas, puerto 443 u 8443, sin ruta/consulta/credenciales, sin IP, sin `localhost` ni sufijos internos).
- **Cambiar la URL** sube `credenciales_version` y borra `ultima_prueba_*`: una prueba en vuelo contra la URL anterior no se aplica, y la pantalla nunca muestra «conexión probada» para otra URL.
- No modifica datos existentes. Orden: **primero la migración, después el código** (sin NEX-069 la aplicación guarda la URL, pero la base no invalida la última prueba ni repite la validación).

## Aplicación (sin migrar datos)
- URL editable en *Configuración → Facturación electrónica*; «Probar conexión» usa la URL **escrita** (prueba temporal, no se registra) o la guardada; la emisión, la consulta y el KuDE usan la URL **persistida** de la empresa (validada otra vez antes de transmitir).
- Defensa SSRF al conectar: el nombre se resuelve y se rechaza si alguna dirección es privada/loopback/link-local/metadatos/reservada; **sin redirecciones**. Limitación: DNS rebinding entre resolución y conexión no se elimina por completo (no hay fijación de IP).

## Orden
1. Backup.
2. Pre-verificación (solo lectura): `docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < documentacao/banco/nexit/v1/scripts/preflight-NEX-069.sql` — sección 1 todo `ok = true`; la sección 3 informa URL guardadas que no cumplirían la regla nueva.
3. Runner oficial (`--solo-listar`, autorización expresa).
4. Verificación (solo lectura): `... < documentacao/banco/nexit/v1/scripts/verificar-NEX-069.sql` — todo `ok = true`.
5. Desplegar el código.

## Reversión
`scripts/reversion-NEX-069.sql` (una transacción): restaura el guardar de NEX-061 y elimina `fe_gateway_url_valida`; no toca datos. Antes, desplegar la aplicación anterior a G01; después borrar la fila `NEX-069` de `schema_migrations`.

## Homologación dirigida (la ejecuta el responsable)
| # | Caso | Esperado |
|---|---|---|
| G-01 | Abrir la pantalla | Muestra la URL guardada, usuario y «contraseña configurada» (sin valor) |
| G-02 | Cambiar solo la URL y guardar (contraseña en blanco) | Guarda; la contraseña se conserva; «Última conexión probada» pasa a «Sin probar» |
| G-03 | Probar con URL escrita sin guardar | Resultado marcado como prueba temporal; no cambia el estado guardado |
| G-04 | URL `http://…`, IP, `localhost`, con ruta o con credenciales | Rechazada con mensaje claro; nada se guarda |
| G-05 | Emitir/consultar/KuDE tras guardar | Usan la URL guardada de la empresa |
| G-06 | Otra empresa | No ve ni cambia la URL de la primera |
