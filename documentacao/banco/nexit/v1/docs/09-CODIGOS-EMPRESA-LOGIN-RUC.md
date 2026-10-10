# NEX-019 — Código visual de empresa en el login

## Decisión de negocio

El identificador interno de la empresa es `empresas.id` (**UUID**). Todas las relaciones deben conservar `empresa_id` (UUID). El **código visual de acceso** es `empresas.codigo`, texto formado por el RUC **sin dígito verificador (DV)**. No se utiliza un ID incremental ni el nombre comercial como código de login.

| Empresa | Código anterior | Código nuevo | RUC informado |
|---|---|---|---|
| CASA MINGO | `casa_mingo` | `80003314` | `80003314-0` |
| PROCEIT | `proceit` | `5469464` | `5469464-7` |

La migration `migraciones/NEX-019-codigos-empresa-ruc.sql` cambia exclusivamente `empresas.codigo`. Mantiene los UUID, las FK, perfiles, permisos, usuarios y contraseñas existentes. El campo **Usuario** del login sigue siendo independiente del código de empresa: este cambio NO renombra a `cliente` ni a `admin`.

## Despliegue

Ejecutar mediante el aplicador versionado `scripts/aplicar-migraciones.sh` (registra versión y checksum, dentro de una transacción). Actualizar repositorio y copiar la carpeta `v1` al contenedor `nexit-db` antes de ejecutar. El aplicador omitirá NEX-001..018 ya aplicadas y ejecutará NEX-019 una sola vez.

## Validación

Tras ejecutar, la salida debe incluir `aplicando NEX-019` y `listo.`. Acceder al login con códigos `80003314` y `5469464`, usando los usuarios y contraseñas ya existentes. No cambiar credenciales en esta migration.

## Regla futura

El alta de una empresa nueva debe establecer `empresas.codigo` a partir del RUC sin DV y validar unicidad. Queda pendiente revisar los formularios de administración/alta de empresa para automatizar esta regla; NEX-019 solo migra los dos registros existentes.
