# Diccionario de datos — Clientes (estado tras NEX-005, NEX-021, NEX-022 y NEX-023)

**Fuente de reglas:** `documentacao/regras/REGRA-CADASTRO-CLIENTES-NEXIT-V1.md`. **Estado:** implementado en el Git; **NEX-022 y NEX-023 versionadas, NO aplicadas**. Verificaciones ejecutadas: **ninguna** (restricción del notebook; auditoría independiente y pruebas en la VM por el responsable).
**Reglas únicas de código:** `lib/fiscal/calcular-dv-ruc.ts` (RUC/DV), `lib/fiscal/campos-receptor.ts` (D3, Innominado, matriz, GLN, URL, longitudes), `lib/clientes/errores-bd.ts` (mensajes por restricción), `lib/clientes/relacionados.ts` (hijos en PUT). Usadas por `clientes/nuevo`, `clientes/[id]` (edición), `POST /api/clientes`, `PUT /api/clientes/[id]`. Ningún texto se trunca: un valor más largo que la columna se rechaza (código de aplicación) y, de llegar a la base, el error 22001 se traduce.

Leyenda: **D3** = campo SIFEN del receptor (Manual v150 + NT); **ERP** = regla propia de Nexit. "Pantalla → JSON → DB": la pantalla muestra texto ES-PY; el JSON envía el enum de la API; la base guarda el valor/código indicado.

## A. Tabla `clientes` — información fiscal (D3)
| Pantalla / JSON | DB (tipo) | Código SIFEN / regla | Aplicada en |
|---|---|---|---|
| Naturaleza: Contribuyente / No contribuyente → `CONTRIBUYENTE`/`NO_CONTRIBUYENTE` | `naturaleza_receptor` smallint 1/2 | D201 = 1/2 | POST/PUT (mapa NATURALEZA) |
| Tipo de persona: Física / Jurídica → `FISICA`/`JURIDICA` | `tipo_persona` text; `tipo_contribuyente_sifen` smallint 1/2 (CHECK acoplado) | D205 solo se transmite si D201 = 1 | POST/PUT; elección explícita en UI |
| Tipo de operación → `B2B`/`B2C`/`B2G`/`B2F` | `tipo_operacion` smallint 1–4 | D202; contribuyente B2B/B2C/B2G, no contribuyente B2C/B2F (`validarNaturalezaOperacion`) | UI + POST + PUT (si cambia) |
| País (catálogo) → `paisCodigo` | `pais_codigo`, `pais_nombre` (derivado del catálogo) | D203/D204; PRY salvo B2F; B2F ≠ PRY (`validarPaisPorOperacion`) | POST/PUT |
| RUC → `numeroDocumento` | `numero_documento` varchar(30), `tipo_documento='RUC'` | D206: 3–8 dígitos, texto, ceros iniciales | `validarRucDv` UI+POST+PUT |
| DV (solo lectura) → `dv` | `dv` varchar(5) | D207: 1 dígito módulo 11 DNIT, recalculado en servidor | `calcularDvRuc` |
| Tipo de documento → `CEDULA_PARAGUAYA`…`OTRO` | `tipo_documento` varchar(30); `tipo_documento_identidad_sifen` smallint | D208: 1,2,3,4,5,6,9 (solo no contribuyente; B2F también lo exige en el cadastro) | POST/PUT (mapa DOC_SIFEN) |
| Descripción (si Otro) → `descripcionDocumentoIdentidad` | `descripcion_documento_identidad` varchar(100) | D209: 9–41 si Otro; nulo si no | `validarCamposReceptor` |
| Número de documento → `numeroDocumento` | `numero_documento` varchar(30) NOT NULL | D210: 1–20; Innominado = "0" | `validarCamposReceptor`, `validarInnominado` |
| Nombre o razón social → `razonSocial` | `razon_social` **varchar(255)** (NEX-022) | D211: 4–255; Innominado = "Sin Nombre" (sin distinguir mayúsculas) | UI + POST + PUT |
| Nombre de fantasía → `nombreFantasia` | `nombre_fantasia` **varchar(255)** (NEX-022) | D212: 4–255 si se informa | idem |
| Correo electrónico → `email` | `email` varchar(150) + regex | D216: 3–80 si se informa | idem |
| Teléfono / Celular → `telefono`, `celular` | varchar(30) | D214: 6–15; D215: 10–20 si se informan (el prefijo PRY de la NT no se valida: ambigüedad pendiente) | idem |
| Código del cliente (solo lectura) | `codigo` varchar(50), trigger `clientes_asignar_codigo` | D217: `CLI-NNNNNN` (10 car., 3–15); nunca se envía en el POST | trigger |
| Correo en copia → `emailCopia` | `email_copia` varchar(150) | ERP: formato válido | POST/PUT |
| Innominado (único por empresa) | índice `clientes_empresa_innominado_key` (**NEX-023**) | DEC-CLI-03: solo no contribuyente B2C, "0", "Sin Nombre"; comprobación previa en API (también sin la migración) | POST/PUT + banco |

## B. Comercial y crédito (ERP, tabla `clientes`)
| Pantalla / JSON | DB | Regla | Aplicada en |
|---|---|---|---|
| Grupo / condición de pago / lista de precios / canal → `*Id` | uuid con FK (empresa, id); `condicion_pago_id` FK global | Existentes y activos de la empresa (`validarReferenciaEmpresa`) | POST/PUT |
| Moneda predeterminada → `monedaCodigoPredeterminada` | `moneda_codigo_predeterminada` text | Código de moneda (3) | POST/PUT |
| Límite de crédito / temporal → `limiteCredito`, `limiteCreditoTemporal` | `numeric(18,4)` ≥ 0 | Rótulo "Gs." mantenido (D-10 abierta) | POST/PUT |
| Descuento % → `descuentoComercialPct` | `numeric(5,2)` 0–100 | — | POST/PUT |
| Vencimiento del crédito (dd/mm/yyyy) → `fechaVencimientoCredito` | `date` | Fecha real; exige límite temporal (CHECK) | UI+POST+PUT |
| Día de cobro → `diaPreferidoCobro` | `smallint` 1–31 | Entero | UI+POST (`numeroOpcional`) |
| Correo de facturación / cobranzas | varchar(150) + regex | Formato válido | UI+POST+PUT |
| Recibir documento electrónico / Requiere OC | boolean | D-11: sin efecto operativo aprobado | POST/PUT |
| Bloquear ventas + motivo | `bloqueado_ventas`, `motivo_bloqueo_ventas` varchar(500), `bloqueado_ventas_at`, `bloqueado_ventas_por` | Motivo obligatorio; fecha y usuario los fija el servidor al activar y se limpian al quitar | POST/PUT |
| Observaciones comerciales | varchar(1000) | Sin truncar | UI+API |
| Código externo | varchar(100), único por empresa | Mensaje propio por restricción | UI+API |
| GLN (13 dígitos) | varchar(13) | 13 dígitos exactos, sin cortar; dígito GS1 pendiente (D-08) | `validarGln` |
| Activo (edición) | `activo` boolean | Distinto del bloqueo de ventas | PUT |

## C. `cliente_contactos` (ERP)
Nombre (obligatorio, 100), apellido/cargo/departamento (100), teléfono/celular (30), correo (150, formato), Principal (índice único `cliente_contactos_uno_principal_key`), preferencias `recibe_pedidos`, `recibe_facturacion`, `recibe_cobranzas`, `recibe_documentos_electronicos`, `recibe_notificaciones` (interno, D-12 sin cambios). Alta: UI valida y rechaza filas vacías/incompletas; POST y PUT rechazan sin descartar.

## D. `direcciones_cliente`
| Campo | DB | Regla |
|---|---|---|
| Tipo / Es fiscal | `tipo`, `es_fiscal` (índice único `direcciones_cliente_uno_fiscal_key`; CHECK tipo FISCAL ⇒ es_fiscal) | Un solo fiscal; la UI mantiene tipo y bandera coherentes y avisa |
| Dirección / Nro. de casa | `direccion` varchar(300), `numero_casa` varchar(20) | **Dirección fiscal (D213/D218):** 1–255 y casa numérica 1–6, obligatoria; las demás direcciones solo el límite de columna |
| Departamento/Distrito/Ciudad | códigos int + descripciones del catálogo (NEX-021 cadena jerárquica) | **Fiscal y operación ≠ B2F: los tres obligatorios** (D219/D221/D223); en B2F no se exige; resto opcional |
| País, complemento (200), código postal (15), contacto/teléfono/horario de recepción (200/30/200), observación (500), etiqueta (100) | varchar | ERP; sin truncar |
| Entrega predeterminada | `es_entrega_default` (índice único `…_uno_defecto_entrega_key`) | Una sola |
| Latitud/Longitud, `descripcion` | numeric(9,6), varchar(100) | Sin exposición nueva (D-12) |

## E. Entrega y ventas (`clientes`)
Ruta, zona, vendedor (uuid con FK por empresa), `frecuencia_entrega` (DIARIA/SEMANAL/QUINCENAL/MENSUAL/A_DEMANDA), `dias_entrega` smallint[] (1=Lun … 7=Dom, sin duplicados), `observacion_logistica` varchar(1000). Coherencia frecuencia × días: sin regla (D-13).

## F. `cliente_documentos` (ERP)
Tipo (RUC/CONTRATO/CREDITO/EXONERACION/OTRO, no es D208), nombre de archivo (1–255), URL http/https válida (rechaza `javascript:`/`data:`), fechas dd/mm/yyyy reales con vencimiento ≥ emisión, observación (500). Referencia externa, no hay subida de archivos.

## Migraciones y operación
| Id | Efecto | Antes de aplicar | Reversión |
|---|---|---|---|
| NEX-022 | `razon_social` y `nombre_fantasia` → varchar(255); recrea (automáticamente, sin copiar definiciones) las vistas que leen esas columnas y sus dependientes, restaurando propietario, opciones, comentario y GRANTs | `scripts/preinspeccion-NEX-022-023.sql` (solo lectura) + backup | `scripts/reversion-NEX-022-023.sql` (aborta si hay valores > 200) |
| NEX-023 | Índice único parcial: un Innominado por empresa | Aborta si hay duplicados; regularizar antes | idem (DROP INDEX) |

**Orden de despliegue:** aplicar NEX-022 y NEX-023 **antes** de publicar el código: con el código nuevo y NEX-022 sin aplicar, un nombre de 201–255 caracteres falla en el INSERT (error 22001 traducido, sin truncar).
