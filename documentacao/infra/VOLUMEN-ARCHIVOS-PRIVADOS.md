# Volumen de archivos privados (documentos de Clientes) — preparación para la VM

**Estado:** PREPARADO EN GIT, **NO EJECUTADO**. Ninguna IA accede a la VM, a Docker ni crea el volumen: los pasos siguientes los ejecuta el responsable humano, con revisión, tras publicar el código. Decisión del responsable (2026-10-11): archivos de documentos en **almacenamiento privado dentro de la propia VM**, en **volumen persistente separado**, fuera de `public/`, sin URL pública, con carga y descarga autenticadas y aisladas por `empresa_id`.

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

Valores a confirmar contra los archivos reales de `/srv/stacks/distribuidora` (no versionados) antes de ejecutar; nada de lo siguiente se aplicó.

1. **Copia de seguridad previa** de la base y de la configuración del stack.
2. **Directorio del volumen en el host** (ejemplo, ajustar a la convención de la VM):
   ```bash
   sudo mkdir -p /srv/stacks/distribuidora/data/nexit-archivos
   sudo chown 1001:1001 /srv/stacks/distribuidora/data/nexit-archivos
   sudo chmod 700 /srv/stacks/distribuidora/data/nexit-archivos
   ```
3. **Compose** — en el servicio `nexit-app` (archivo del stack, fuera del Git), montar el directorio y definir la variable:
   ```yaml
   services:
     nexit-app:
       environment:
         NEXIT_ARCHIVOS_DIR: /data/archivos
       volumes:
         - /srv/stacks/distribuidora/data/nexit-archivos:/data/archivos
   ```
   (Alternativa: volumen con nombre `nexit_archivos` declarado en `volumes:`; igual de válido. Lo importante: **persistente y fuera del contenedor**.)
4. **Aplicar las migraciones** NEX-028 (documentos como archivo), NEX-029 (auditoría de conversiones), NEX-030 (autoría de la carga inicial), NEX-031 (exclusión lógica, versiones y auditoría de documentos) y NEX-032 (día del mes de entrega) con el procedimiento habitual (`scripts/aplicar-migraciones.sh`), después de las NEX-022…NEX-027 pendientes y de validar cada una según lo acordado.
5. **Reconstruir/desplegar** la aplicación con el procedimiento habitual.
6. **Verificación operativa** (sin exponer datos): cargar un PDF de prueba a un cliente de prueba, descargarlo, confirmar que el archivo existe en el host bajo `<empresa_id>/clientes/<cliente_id>/…` con permisos `600`, y que **no** es accesible por ninguna URL pública ni sin sesión (`GET /api/clientes/{id}/documentos/{docId}` sin cookie → 401).
7. **Respaldo del volumen**: incluir el directorio en la copia de seguridad externa junto con el dump de PostgreSQL; base y archivos deben restaurarse juntos (la base referencia la clave del archivo).

## Reversión

- Quitar el montaje/variable deja la aplicación respondiendo 503 en documentos; los archivos permanecen en el host.
- Las reversiones `scripts/reversion-NEX-028.sql` y `reversion-NEX-031.sql` **abortan** si hay documentos cargados, versiones, eliminados o auditoría (no se pierde historial ni se dejan archivos huérfanos); exportar y decidir de forma explícita antes.

## Límites conocidos

- Sin análisis antivirus ni conversión (la política propuesta solo admite formatos de documento/imagen con firma verificada y se entregan siempre como descarga, nunca inline).
- Las variables del Compose reales y el nombre exacto del directorio dependen del stack de la VM, que no está en este repositorio.
