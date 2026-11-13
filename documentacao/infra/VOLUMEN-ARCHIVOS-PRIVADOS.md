# Volumen de archivos privados (documentos de Clientes) — preparación para la VM

**Estado:** PREPARADO EN GIT, **NO EJECUTADO**. Ninguna IA accede a la VM, a Docker ni crea el volumen: los pasos siguientes los ejecuta el responsable humano, con revisión, tras publicar el código. Decisión del responsable (2026-10-11): archivos de documentos en **almacenamiento privado dentro de la propia VM**, en **volumen persistente separado**, fuera de `public/`, sin URL pública, con carga y descarga autenticadas y aisladas por `empresa_id`.

## Configuración real de Docker Compose — confirmada 2026-10-11

Fuente: salida de `docker inspect nexit-app` proporcionada por el responsable de la VM; no inferir nombres de los archivos por su presencia en el directorio.

| Elemento | Valor confirmado |
|---|---|
| Proyecto Compose | `nexit` |
| Servicio Compose de la aplicación | `app` (**no** `nexit-app`) |
| Contenedor de la aplicación | `nexit-app` |
| Primer archivo Compose | `/srv/stacks/distribuidora/compose.yml` |
| Segundo archivo Compose | `/srv/stacks/distribuidora/app.compose.yml` |
| Directorio del stack | `/srv/stacks/distribuidora` |
| Contenedor PostgreSQL | `nexit-db` |
| Banco / usuario informado por el entorno | `nexit` / `nexit_app` |

Comando de referencia para operar Compose en este entorno (primero inspeccionar `config` antes de cualquier recreación):

```bash
cd /srv/stacks/distribuidora
docker compose -p nexit -f compose.yml -f app.compose.yml config --services
```

El repositorio GitHub contiene documentación y código de la aplicación, pero **no contiene los archivos Compose reales ni los archivos .env del stack de la VM**. Se deben inspeccionar los Compose efectivos antes de editar, sin exponer credenciales de los archivos de entorno. Nunca volver a solicitar al responsable que descubra de cero los nombres de proyecto, servicio o archivos ya confirmados; volver a inspeccionar solo si la infraestructura cambia.

Estado informado 2026-10-11: migrations `NEX-001` hasta `NEX-032` registradas en `schema_migrations` (`32` filas); contenedor `nexit-app` en ejecución con imagen `nexit-app:teste`, Next.js 16.2.6. Esto no certifica homologación funcional ni confirma que el volumen de archivos esté montado.

## Qué hace el código

- La aplicación guarda los archivos en el directorio indicado por la variable `NEXIT_ARCHIVOS_DIR`. **No existe valor por defecto**: si la variable falta, la carga y la descarga responden 503 («almacenamiento no configurado»). Así nunca se escribe dentro del contenedor (que se perdería al recrearlo) ni dentro de `public/`.
- Estructura interna: `<empresa_id>/clientes/<cliente_id>/<archivo_id>` (tres UUID generados por el servidor; el nombre original solo es metadato en la base). Permisos de archivo `0600`, directorios `0700`.
- La base (`cliente_documentos`, migración NEX-028) guarda solo metadatos y la clave relativa (`almacen_clave`). La descarga pasa por `GET /api/clientes/{id}/documentos/{docId}` (sesión + permiso `CLIENTES.VER` + `empresa_id` de la sesión), con `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` y `Cache-Control: private, no-store`.
- El contenedor corre con usuario **`nextjs` UID/GID 1001** (fijados en el `Dockerfile`).

## Política V1 aprobada (decisiones finales del responsable, 2026-10-11)

| Tema | Valor |
|---|---|
| Formatos | PDF, JPG/JPEG, PNG, DOCX, XLSX (extensión **y** firma del contenido verificadas en el servidor) |
| Tamaño máximo | 10 MB por archivo |
| Sustitución | **Versionamiento**: la versión anterior se conserva en el historial y puede recuperarse; nada se borra del volumen |
| Eliminación | **Exclusión lógica**: se oculta de las listas operacionales; el archivo, el historial y la auditoría se conservan; puede restaurarse. **Nunca** se borra un archivo del volumen |
| Retención | Preservación obligatoria; ninguna purga automática. Descarte definitivo o plazos: requiere nueva aprobación |
| Documentos anteriores | Los cargados como enlace (`url_archivo`) se conservan y se muestran como «enlace anterior» hasta que se les cargue un archivo |

## Pasos para el responsable (cuando decida aplicarlo)

Configuración real de Docker Compose identificada mediante `docker inspect` por el responsable el 2026-10-11 (archivos de ejecución fuera del Git). El montaje privado todavía no está confirmado como aplicado; validar configuración efectiva antes de reiniciar.

1. **Copia de seguridad previa** de la base y de la configuración del stack.
2. **Directorio del volumen en el host** (ejemplo, ajustar a la convención de la VM):
   ```bash
   sudo mkdir -p /srv/stacks/distribuidora/data/nexit-archivos
   sudo chown 1001:1001 /srv/stacks/distribuidora/data/nexit-archivos
   sudo chmod 700 /srv/stacks/distribuidora/data/nexit-archivos
   ```
3. **Compose** — en el servicio `app` (contenedor `nexit-app`; archivos del stack fuera del Git), montar el directorio y definir la variable:
   ```yaml
   services:
     app:
       environment:
         NEXIT_ARCHIVOS_DIR: /data/archivos
       volumes:
         - /srv/stacks/distribuidora/data/nexit-archivos:/data/archivos
   ```
   (Alternativa: volumen con nombre `nexit_archivos` declarado en `volumes:`; igual de válido. Lo importante: **persistente y fuera del contenedor**.)
4. **Aplicar las migraciones** NEX-028 (documentos como archivo), NEX-029 (auditoría de conversiones), NEX-030 (autoría de la carga inicial), NEX-031 (exclusión lógica, versiones y auditoría de documentos) y NEX-032 (día del mes de entrega) de Clientes y, para **Proveedores**, NEX-033 (nombres 255 y código inmutable), NEX-034 (auditoría y permisos de gobernanza), NEX-035 (aprobación de cuentas bancarias) y NEX-036 (documentos como archivos privados y retenciones con certificado) con el procedimiento habitual (`scripts/aplicar-migraciones.sh`), después de las NEX-022…NEX-027 pendientes y de validar cada una según lo acordado.
5. **Reconstruir/desplegar** la aplicación con el procedimiento habitual.
6. **Verificación operativa** (sin exponer datos): cargar un PDF de prueba a un cliente de prueba, descargarlo, confirmar que el archivo existe en el host bajo `<empresa_id>/clientes/<cliente_id>/…` con permisos `600`, y que **no** es accesible por ninguna URL pública ni sin sesión (`GET /api/clientes/{id}/documentos/{docId}` sin cookie → 401).
7. **Respaldo del volumen**: incluir el directorio en la copia de seguridad externa junto con el dump de PostgreSQL; base y archivos deben restaurarse juntos (la base referencia la clave del archivo).

## Reversión

- Quitar el montaje/variable deja la aplicación respondiendo 503 en documentos; los archivos permanecen en el host.
- Las reversiones `scripts/reversion-NEX-028.sql`, `reversion-NEX-031.sql` y `reversion-NEX-036.sql` (documentos de Proveedores; claves `<empresa>/proveedores/<proveedor>/<uuid>` en el mismo volumen) **abortan** si hay documentos cargados, versiones, eliminados o auditoría (no se pierde historial ni se dejan archivos huérfanos); exportar y decidir de forma explícita antes.

## Límites conocidos

- Sin análisis antivirus ni conversión (la política propuesta solo admite formatos de documento/imagen con firma verificada y se entregan siempre como descarga, nunca inline).
- Las variables del Compose reales y el nombre exacto del directorio dependen del stack de la VM, que no está en este repositorio.

## Productos (NEX-041, no aplicada)

- Los documentos técnicos y la foto principal de Productos usan el MISMO volumen y la variable `NEXIT_ARCHIVOS_DIR`, con claves `<empresa>/productos/<producto>/<uuid>`. No hay configuración adicional ni cambio de propietario (UID 1001).
- Orden de aplicación: NEX-041 después de NEX-037 y NEX-039 (envoltorio de grants). La reversión `scripts/reversion-NEX-041.sql` **aborta** si hay archivos, versiones, fotos o auditoría de Productos.
- NEX-042 (después de NEX-041) agrega el historial `producto_imagen_versiones`: cada foto cargada queda referenciada y recuperable; la reversión `scripts/reversion-NEX-042.sql` aborta si hay filas.
- Cambiar o quitar la foto, o eliminar un documento, no borra archivos del volumen: la retención y la copia de seguridad siguen siendo del volumen.
