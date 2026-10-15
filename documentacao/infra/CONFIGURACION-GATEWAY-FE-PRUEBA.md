# Configuración del gateway de facturación electrónica de PRUEBA (PRO-133)

**Estado:** preparado y versionado; **NO aplicado en la VM por Claude** (Claude Code no tiene acceso autorizado a la VM, Docker ni PostgreSQL; ver `CLAUDE.md`). La aplicación la hace el responsable en una ventana segura. Nada de lo de abajo prueba que el gateway responda: eso solo lo demuestra una autenticación real, que NO se hizo.

**Qué faltaba (evidencia operativa):** ninguna empresa tenía fila en `fe_gateway_config`, por lo que `POST /api/facturas` devolvía HTTP 409 antes de reservar número (`envio.ts`, preflight).

**Datos conocidos (en Git, sin secretos):** servidor `https://gateway-bebidas-py.e-factura-hub.com`; `POST /api/login` (body `ruc`+`password`), `POST /api/recepcion_de`, `POST /api/consulta_de` (Bearer). Fuente: `documentacao/v1/REQUISITOS-FACTURACION-ELECTRONICA-API-EXTERNA-2026-10-12.md`. Credenciales: **solo** en `app.env` del stack (`/srv/stacks/distribuidora/app.env`, fuera de Git, leído por `env_file` de `app.compose.yml`); la base guarda solo el nombre lógico `credencial_ref`.

## Convención (CASA MINGO)
`credencial_ref = CASAMINGO` → variables `NEXIT_FE_CASAMINGO_RUC` y `NEXIT_FE_CASAMINGO_PASSWORD`. El RUC y la clave son los del emisor de prueba ya poseídos por el responsable; **no** se copian al Git, a Linear ni a registros.

## Pasos (responsable, con backup previo; sin migraciones, sin numeración, sin transmitir)
1. **Verificación de solo lectura** (cuál es la empresa y si ya hay fila):
   `docker exec nexit-db psql -U nexit_app -d nexit -c "SELECT e.codigo, e.razon_social, g.activo FROM empresas e LEFT JOIN fe_gateway_config g ON g.empresa_id = e.id ORDER BY e.codigo;"`
   (requiere NEX-047 aplicada; si `fe_gateway_config` no existe, parar: es una migration, otra tarea).
2. **Variables privadas** en `app.env` (editar a mano; no pegar los valores en chat/Git): `NEXIT_FE_CASAMINGO_RUC=…` y `NEXIT_FE_CASAMINGO_PASSWORD=…`. Hacer copia `app.env.bak` antes.
3. **Cadastro del gateway**: `scripts/configurar-gateway-prueba-NEX-047.sql` con `-v empresa=<codigo de CASA MINGO>` y `-v ref=CASAMINGO` (comando en el encabezado del script; transacción única, aborta si la empresa no es única o ya tiene fila, no guarda secretos).
4. **Recrear solo el contenedor de la app** para que lea `app.env` (mismo procedimiento que `PROCEDIMIENTO-ATUALIZACAO-AMBIENTE-NEXIT-VM.md`; no `down -v`, no tocar `nexit-db`):
   `cd /srv/stacks/distribuidora && docker compose -p nexit -f compose.yml -f app.compose.yml up -d --no-deps --force-recreate app`
5. **Verificar presencia sin mostrar valores**:
   `docker exec nexit-app sh -c 'test -n "$NEXIT_FE_CASAMINGO_RUC" && test -n "$NEXIT_FE_CASAMINGO_PASSWORD" && echo credenciales=presentes'`
6. **Verificar en la pantalla** «Nueva factura» con un usuario de CASA MINGO: el aviso de gateway desaparece (estado `CONFIGURADO`) y «Enviar factura» se habilita. `CONFIGURADO` = fila activa válida + credenciales presentes en el servidor; no prueba conexión ni que el gateway acepte las credenciales.

## Reversión
`scripts/reversion-gateway-prueba-NEX-047.sql` (desactiva la fila, no borra) y, si se desea, retirar las dos variables de `app.env` y recrear `app`. Tras revertir, el envío vuelve a responder 409 antes de reservar número y la pantalla muestra «Sin configurar».

## Alcance y pendientes
No transmite documentos, no consume numeración, no aplica migrations. Pendiente: la **prueba real de autenticación y de envío controlado** (otra autorización) y el diagnóstico operativo del SHA desplegado.
