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

## Seguridad de NEX-022 y datos fiscales anteriores (revisión tras auditoría bfc98b4)
- **INSERT de filhos:** POST y PUT inserten `empresa_id` (de la sesión) de forma explícita en `cliente_contactos`, `direcciones_cliente` y `cliente_documentos`, además de la herencia del trigger `nex_heredar_empresa`; las FK compuestas (empresa, cliente) siguen validando el aislamiento.
- **NEX-022 aborta antes de tocar nada** si alguna vista afectada tiene triggers, reglas adicionales, valores por defecto o es materializada; elimina las vistas sin CASCADE (cualquier otra dependencia hace fallar el DROP) y, tras recrearlas, **verifica** definición, opciones, propietario, comentarios (vista y columnas), ACL de la vista y ACL por columna; si algo difiere, revierte toda la transacción. Criterio previo: `scripts/preinspeccion-NEX-022-023.sql` sección 3b con todo en 0 (y 3c sin filas). La migración NO se ha probado en PostgreSQL desde el notebook: las verificaciones previas y una prueba en una copia restaurada del respaldo son obligatorias antes de aplicarla en el banco real.
- **Datos fiscales anteriores a las reglas:** el PUT tolera un campo fiscal inválido solo mientras no cambie (para no impedir cambios comerciales). Eso **no** hace apto al cliente: `GET /api/clientes/[id]` devuelve `aptitudSifen { apto, pendientes[] }` calculado con las mismas reglas (`lib/fiscal/aptitud-sifen.ts`) y la pantalla de edición lo muestra. Plan de regularización: la sección 6 de la preinspección cuenta los clientes con pendientes; se corrigen editándolos (el formulario exige datos válidos para lo que se modifique). Ningún flujo declara "apto para emitir" si hay pendientes.

### Aptitud SIFEN (`evaluarAptitudSifen`) — cobertura (corrección tras auditoría c6f208b)
Evalúa, sin valores por defecto (un código desconocido de naturaleza/operación/tipo de persona/tipo de documento/país es siempre una pendiente): naturaleza × operación, país × operación (PRY / exterior), tipo de persona, tipo de documento coherente con la naturaleza, RUC 3–8 dígitos y DV módulo 11, no contribuyente sin DV, documento 1–20, descripción de Otro 9–41, Innominado (B2C, "0", "Sin Nombre"), razón social/fantasía/e-mail/teléfono/celular (límites D3), y domicilio fiscal (D213, nro. de casa, geografía si la operación no es B2F; B2F exige domicilio fiscal). `GET /api/clientes/[id]` entrega todos los datos necesarios (naturaleza y operación sin sustituir códigos desconocidos por B2C) y casos de regresión válidos/ inválidos están en `lib/fiscal/aptitud-sifen.casos.ts` (`verificarCasosAptitud()`, **no ejecutados**). **No** cubre: existencia/estado del RUC ante la DNIT ni la política de emisión V2. La sección 6 de la preinspección replica estas condiciones en SQL (con la cobertura declarada en el propio script).

### País en el catálogo oficial (corrección C5)
`aptitudSifen` confirma que `pais_codigo` del receptor **y** del domicilio fiscal existan y estén activos en `referencia_geografica_paises` (el GET consulta con `resolverPais`; resultado `true`/`false`/`null`). Un código inexistente (p. ej. `ZZZ` en B2F) o inactivo es pendiente específica ("no existe o no está activo en el catálogo oficial de países"); si no se pudo consultar, es pendiente "no fue posible verificar" (nunca apto). B2F con un país extranjero válido sigue siendo aceptado. Casos de regresión añadidos (35 en total). La preinspección (sección 6) usa el mismo catálogo y declara en su cabecera sus diferencias con la API (solapamiento de contadores, trim, e-mail, reglas duplicadas TS/SQL).

## Decisiones aprobadas 2026-10-11 (DEC-CLI-*) — implementación
| Decisión | Pantalla → JSON → DB | Regla implementada | Dónde |
|---|---|---|---|
| 255-01/02 Razón social / fantasía | texto → `razonSocial`/`nombreFantasia` → `varchar(255)` (NEX-022) | 4–255 / vacío = NULL o 4–255; sin truncar | UI+POST+PUT+`campos-receptor.ts` |
| TEL/CEL (retificación 2026-10-11) Teléfono · Celular | `TelefonoPais` (país del número + código de área solo si el plan lo usa + número) → `telefono*Pais`/`Ddi`/`Area` + `telefono`/`celular` → `clientes.telefono_pais, telefono_ddi, telefono_area, telefono` (y `celular_*`) y `cliente_contactos.*` equivalentes (NEX-024/NEX-025) | Ver sección "Teléfonos por país" | `lib/fiscal/telefono.ts`, `components/clientes/telefono-pais.tsx`, POST/PUT/GET/relacionados |
| COD-05 Código | solo lectura → `codigo` varchar(50) | `CLI-000001…` por empresa: trigger `clientes_asignar_codigo` (bloqueo consultivo por empresa, `max+1`); el POST nunca lo recibe. Sin cambios (verificado por lectura del trigger y del POST) | NEX-005 |
| COB-06 Día de cobro | número → `diaPreferidoCobro` → `dia_preferido_cobro` smallint | Entero 1–31 (rechaza decimales, 0, negativos, >31, texto); se guarda la preferencia original (31). `diaDeCobroEnMes()`/`ultimoDiaDelMes()` (bisiestos) para consumidores futuros; la V1 no los consume ni genera cobros | `lib/clientes/dia-cobro.ts`, POST/PUT |
| NOT-07 Recibe notificaciones | checkbox (Contactos, marcado por defecto) → `recibeNotificaciones` → `cliente_contactos.recibe_notificaciones` boolean NOT NULL DEFAULT true | Alta y edición lo muestran; `true`/`false` persisten por contacto; en el PUT un contacto sin la clave conserva su valor y `false` explícito se graba | UI alta/edición, POST, `relacionados.ts` |


### Teléfonos por país (retificación 2026-10-11) — cliente principal (D214/D215) y contactos (ERP)
**Modelo:** país del número = ISO alfa-3 REAL de cualquier país/territorio del catálogo mundial UIT E.164 (FUENTE CANÓNICA `lib/fiscal/paises-ddi.ts` en Git, 247 destinos, huella MD5 verificable; `public.paises_telefonia` NEX-026/NEX-027 es solo un ESPEJO de consulta, la validación no lo lee; destinos UIT sin ISO propio: Ascensión +247 = identificador interno `XAC` del rango XAA–XZZ reservado al usuario por ISO 3166 (no es código ISO oficial, jurisdicción SHN), Diego García = ISO `IOT`, Tristán de Acuña comparte +290 con `SHN`, Kosovo `XKX` también interno; redes globales +870/+881/+882/+883 fuera de alcance; `OTR` ya no se ofrece ni se guarda: valor histórico que, si existiera, se regulariza eligiendo el país real), DDI (asociado solo al país), código de área (solo donde el plan lo usa) y número nacional con ceros preservados. Columnas: `clientes.telefono_pais/telefono_ddi/telefono_area/telefono` y `celular_*`; `cliente_contactos.telefono_pais/telefono_ddi/telefono_area/telefono` y `celular_*` (NEX-024 + NEX-025; sin modificar filas existentes, que quedan sin país). El país del teléfono es **independiente del país fiscal** del receptor. **Los números pueden repetirse** (clientes, contactos, empresas): no hay UNIQUE, ni deduplicación, ni validación de repetición.
**Reglas (única fuente: `PLANES_TELEFONIA` en `lib/fiscal/telefono.ts`):** Paraguay (+595) sin campo de DDD; número con su prefijo local, ceros intactos, teléfono 6–15 y celular 10–20 dígitos (D214/D215 como regla cadastral paraguaya; el teléfono debe incluir el prefijo de la ciudad). Argentina, Brasil, Canadá y Estados Unidos: código de área en campo propio (2–4 / 2 / 3 / 3 dígitos) y largo total del plan (10 / 10–11 / 10 / 10); Bolivia (8), Chile (9), Colombia (8 ó 10), España (9), Perú (8 ó 9), Uruguay (8): sin campo de área (el indicativo de ciudad va dentro del número). Fuera de Paraguay SOLO se BLOQUEA: dígitos únicamente, código de área solo si el destino lo muestra (hasta 5 dígitos, columna varchar(5)) y E.164 (Rec. UIT-T E.164 fija un MÁXIMO de 15 dígitos entre DDI y número; no se afirma un mínimo universal). Código de área esperado en +1/ARG/BRA, largos habituales, 0 inicial y números muy cortos son AVISOS NO BLOQUEANTES (`avisosTelefono`): son planes compilados sin homologación por destino. La aptitud SIFEN aplica la misma validación bloqueante y no considera los avisos. Búsqueda del selector por nombre, ISO o DDI (con o sin +). DDI compartido (+1, +7, +44, +590, +599, +262, +358, +61, +47, +212…): el ISO distingue el destino. Separadores visuales (espacios, guiones, puntos, paréntesis) se aceptan y no se guardan.
**Formatos ambiguos:** se rechazan `+` y el prefijo `00` pidiendo elegir el país y escribir solo el número (sin cortar ni adivinar). Un número que **comienza** por los dígitos del DDI (p. ej. `5951234567` en Paraguay) es válido: no se rechaza por eso. Cambiar de país con área escrita pide confirmación antes de borrarla.
**Registros anteriores:** sin país → se conservan tal cual mientras no se modifiquen (el PUT los tolera); la aptitud evalúa solo su forma (dígitos, largo D214/D215 antiguo). Un contacto o cliente sin número propone Paraguay por defecto.
**SIFEN:** el Manual v150 (D214/D215) y la NT 014 (GENFE023/024) solo fijan tipo A, 6–15 / 10–20 y el prefijo de ciudad para PRY; **no mencionan DDI/DDD ni números internacionales**. No se declara que la DNIT los exija, y la serialización del XML de V2 (si lleva el DDI antepuesto, cómo se miden los límites en números no paraguayos) queda como decisión **pendiente y separada** de la validación cadastral por país.
**Limitaciones declaradas:** los planes de los 11 países son una compilación de Claude (ITU-T E.164, planes nacionales y metadata pública de libphonenumber) **a confirmar por el responsable**; Colombia/Perú aceptan por largo (no distinguen fijo de celular); los códigos de área de países sin campo propio no se validan. Los teléfonos de recepción de `direcciones_cliente` siguen siendo texto libre (ERP, sin cambios).
**Migraciones:** `NEX-026` (catálogo `paises_telefonia` con seed idempotente, sin FK ni cambios de filas; reversión `scripts/reversion-NEX-026.sql`), `NEX-027` (espejo canónico: toma ANTES de cambiar nada la foto `paises_telefonia_previo_nex027` y aborta si ya existe; reversión INTEGRAL `scripts/reversion-NEX-027.sql` restaura fila por fila desde la foto —preexistentes, DDI cambiados, inactivos, destinos nuevos— y comprueba con EXCEPT antes de borrarla; sin foto aborta y la única recuperación es el pg_dump previo; revertir 027 antes que 026). Verificación objetiva: `scripts/verificar-paises-telefonia.sql` (resultado COINCIDE/DIVERGENCIA con 247 filas y huella MD5) + `verificarCoherenciaYDivergenciasCatalogo()`, `NEX-024` (DDI en `clientes`) y `NEX-025` (país/área en `clientes`; país/DDI/área en `cliente_contactos`; CHECK de forma, sin unicidad); reversiones `scripts/reversion-NEX-024.sql` y `reversion-NEX-025.sql`. No validadas en PostgreSQL. **Casos de regresión escritos (no ejecutados):** `lib/fiscal/telefono.casos.ts`, `lib/fiscal/aptitud-sifen.casos.ts`.

## Cierre del módulo — listado y pestaña Comercial y crédito (revisión de finalización)
- **Listado** (`GET /api/clientes?modo=lista`, solo las filas, sin los once catálogos del formulario): la columna «Contacto principal» muestra el contacto marcado como principal (`cliente_contactos.es_principal`, join por `empresa_id`+`cliente_id`; nombre + teléfono con `+DDI` si lo tiene) y, si no hay, el teléfono/celular fiscal. Un código desconocido de naturaleza u operación ya NO se sustituye por B2C/«no contribuyente»: se muestra «Operación a revisar». La búsqueda incluye contacto principal y compara teléfonos solo por dígitos (con o sin DDI). Las sumas y los importes se muestran sin símbolo de moneda: la moneda de los límites sigue pendiente (D-10); se eliminó el rótulo «Gs.» de listado y formulario de alta. Requiere NEX-024/NEX-025 aplicadas (columnas de DDI).
- **Importes y porcentaje** (`lib/clientes/comercial.ts`, misma regla en UI y en POST/PUT): `limite_credito` y `limite_credito_temporal` numeric(18,4) → ≥ 0, hasta 14 dígitos enteros y 4 decimales; `descuento_comercial_pct` numeric(5,2) → 0–100, hasta 2 decimales. Nada se redondea ni se trunca en silencio: se rechaza con el nombre del campo. Corrección de defecto: la edición convertía valores decimales (p. ej. descuento 2,5 → 25 y límite 1500,5 → 15005) y solo admitía enteros; ahora la entrada acepta coma o punto como único separador decimal y se envía tal cual al servidor.
- **Catálogos al guardar:** condición de pago (catálogo global activo) y moneda predeterminada (`monedas` activa) se verifican en POST; en PUT solo si cambian (un valor ya guardado e inactivado después se tolera). Errores 22003 (rango numérico) y 23503 (FK de catálogo) tienen mensaje propio.
- **Errores y pestañas:** alta y edición comparten `lib/clientes/pestanas.ts`; en la edición el error abre ahora la pestaña correspondiente y el formulario se conserva.
