# PRO-94 — ETAPA 2: REDISEÑO PROFESIONAL DE «NOTA DE CRÉDITO ELECTRÓNICA»

**Fecha:** 2026-10-17. **Idioma de la interfaz:** español (Paraguay).
**Estado:** ESPECIFICACIÓN DE DISEÑO, A LA ESPERA DE IMPLEMENTACIÓN FOCAL Y HOMOLOGACIÓN HUMANA.
**Evidencia original:** `image(20261017-175406).png` aportada por el responsable en la conversación. **La imagen binaria NO está incorporada a este repositorio.** No sustituirla por captura inventada.
**Responsabilidad:** Claude Code implementa una vez autorizado; ChatGPT audita; responsable valida en navegador y decide despliegue. La especificación no implica cambios operacionales.
**Prioridad:** alta, defecto visual explícitamente reprobado.
**Pantalla:** `app/(private)/notas-credito/page.tsx`, `app/(private)/notas-credito/page.module.css`. Reutilizar `components/ui/lista-padrao/lista.module.css` y patrones de Clientes / Facturación. No alterar el sistema global de diseño.

## 1. Problema identificado en pantalla real

- Encabezado grande con párrafo explicativo redundante de dos líneas que consume el primer pliegue.
- Una tarjeta aislada «1. Cliente» ocupa casi toda la anchura para un input sin jerarquía clara; `grid` con `repeat(auto-fit,minmax(220px,1fr))` estira el input; el botón «Buscar» queda flotante.
- La página hace `cargarClientes("",1)` al montar: devuelve una fila de cliente (ej. «ALES S.A.») aun con búsqueda vacía, visualmente desconectada y confundida con selección. No debe parecer que el cliente ya fue elegido.
- Los estados posteriores acumulan varias tarjetas similares; la tabla de detalle exhibe 13 columnas, `min-width:1250px`, y hace difícil localizar la columna editable, incluso en escritorio.
- No hay lectura visual de «factura original → motivo → líneas → resumen», ni jerarquía de total/IVA ni acción primaria contextual. El flujo funcional existe, pero es difícil de descubrir.
- Se exige rediseñar la **experiencia visual completa de la NCE** y sus estados: búsqueda, selección de cliente, selección de factura, edición de líneas y revisión final. No basta reducir padding/tamaño de botones.

## 2. Referencias observadas (patrones de interacción, no copiar contratos fiscales externos)

- **Odoo 19:** https://www.odoo.com/documentation/19.0/es_419/applications/finance/accounting/customer_invoices/credit_notes.html — la nota nace vinculada a una factura validada, muestra motivo/referencia, detalle y confirmación, con ficha compacta. **NEXIT no adopta** sus borradores, reversión contable automática, código de numeración «R» ni registros de pago.
- **ERPNext:** https://docs.frappe.io/erpnext/credit-note — recuperar líneas, cantidades y valores de factura original y permitir ajustes parciales, manteniendo referencia y trazabilidad. **NEXIT no adopta** las cantidades negativas ni actualización automática de stock.
- **Dynamics 365 Business Central:** https://learn.microsoft.com/en-gb/dynamics365/business-central/sales-how-process-sales-returns-cancellations — ficha de documento con datos de cabecera, referencia a factura, lista de líneas y acción principal. **NEXIT no adopta** asientos, cancelación contable o flujo de reclamación.
- Estilo de producto: continuidad visual con **Clientes/Productos/Puntos** de NEXIT: tamaño de títulos, barra compacta, inputs y botones de 38px, tipografía, densidad de tablas, bordes discretos, colores de estado; no introducir una segunda biblioteca UI ni un tema nuevo.

## 3. Layout objetivo — escritorio

### Cabecera y navegación

Una fila compacta con breadcrumb `Documentos electrónicos / Nota de crédito`, `Nueva nota de crédito` y botón secundario `Volver a documentos`. **Eliminar el párrafo largo**; si es imprescindible orientar, usar una ayuda breve contextual o tooltip, no un bloque de 2–3 líneas debajo del título.

Un indicador horizontal ligero (sin crear un wizard de pasos que destruya selección) muestra `Cliente → Factura original → Nota de crédito`. La etapa actual se distingue en texto/estado, sin iconos gigantes, tarjetas vacías ni títulos numerados repetitivos.

### Estado A — sin cliente seleccionado

En la región de trabajo de ancho razonable (aprox. 850–1150px en escritorio, nunca un campo suelto de todo el viewport), una **única área de búsqueda compacta**:
- Etiqueta `Cliente`; input con icono de búsqueda y placeholder `Buscar por nombre, código o RUC`, altura estándar, ancho contenido, foco visible.
- Resultados desplegables anclados al input o lista compacta inmediatamente debajo con 2 líneas como máximo: razón social + `Código · RUC`. Filtrar tras ingresar al menos **2 caracteres** (propuesta visual, conservando API/paginación). Debounce corto de ~300ms con cancelación/guardas contra respuestas obsoletas; **no** cargar ni mostrar arbitrariamente clientes con campo vacío.
- Click/Enter selecciona cliente sin necesitar botón «Buscar» y luego botón «Seleccionar» por fila (una única acción clara). Ofrecer vacíos, cargando, fallo, paginación sin perder foco. Teclado, lector de pantalla, touch y mensajes accesibles.
- **Innominado** sigue no seleccionable SOLO en el flujo que ya lo prohíbe; no inventar rutas de NCE rechazada Innominado ni cambios server-side.
- Tras selección, sustituir lista por banda compacta `Cliente: Nombre · RUC` con `Cambiar`, sin ocupar nueva tarjeta gigante.

### Estado B — cliente seleccionado, falta factura original

En la misma región de trabajo, sección `Facturas aprobadas`: búsqueda compacta por número, fecha o CDC con icono, filtro contextual y paginación.
- Tabla densa con 6 columnas lógicas: **Nº / Fecha / Moneda / Total / Saldo por acreditar / Acción**; situación `NCE pendiente` como badge contextual de fila, no una séptima columna con acciones duplicadas.
- Solo documentos que hoy cumplen la política FE aprobada + CDC confiable + saldo > 0 son seleccionables. NCE pendiente sigue bloqueando selección. Mantener estados de reconciliación previos, actualización controlada y alcance de empresa/sucursal.
- Click en `Seleccionar factura` (o fila accesible, no dos acciones redundantes) lleva a la edición sin una página en blanco.
- Vacíos diferenciados: todavía sin búsqueda, resultados vacíos y cliente sin facturas elegibles. No revelar otras empresas.

### Estado C — factura seleccionada / emisión NCE

**No agregar tres tarjetas de ancho total apiladas.** Dos columnas en escritorio: región principal **aprox. 8/12** para datos y líneas; panel lateral **aprox. 4/12** para resumen, con sticky solo cuando no interfiere con teclado/zoom. En tablet y móvil apilar de forma natural.

**Franja compacta de factura original:** número, fecha, cliente, moneda y estado `APROBADA`; CDC de 44 dígitos visible mediante campo expandible/copia accesible (sin truncado irreversible), `Cambiar factura` cuando permitido. Para corrección de NCE rechazada, preservar entrada y aviso actuales; no desviar este flujo.

**Datos de NCE:** un grupo compacto con `Motivo` (cuatro motivos ya autorizados), `Sucursal / Establecimiento`, `Punto de expedición NCE` y `Observación (opcional)`; select de motivo fijo bloqueado por historial, sin cambiar reglas; las opciones de punto solamente de secuencias NCE operativas por tipo. La serie/número próximo solo son **referenciales**, nunca reservar o garantizar número antes de la confirmación SQL.

**Tabla de líneas:** eliminar 13 columnas expuestas simultáneamente. Mostrar de inicio:
- Selección por línea, `Producto / código` (combinados), `IVA`, `Factura original` (cantidad × precio/total, con compacto), `Disponible` (cantidad/saldo según motivo), y **control editable destacado** `Cantidad a devolver` o `Monto a acreditar (IVA incluido)`.
- Datos de histórico `Cantidad acreditada / Monto acreditado / Saldo cantidad / Saldo monto` accesibles por expansión secundaria de fila o panel de detalles, nunca eliminados de la semántica. Ayuda de precio/cantidad/unidad originales visible, no alterable; IVA derivado de FE original.
- Una entrada solo habilitada para línea incluida y no agotada; estado de agotada claro, eliminación o desmarcado de línea solo como UI de selección, sin alterar FE. Respetar cantidades fraccionarias/enteras según regla fiscal, decimales y validación backend.
- Celdas alineadas, importes a la derecha, unidades claras; scroll horizontal solo cuando sea realmente necesario en anchuras móviles, con columna de producto y campo editable siempre discernibles.
- Cero «placeholder» que parezca saldo o importe definitivamente confirmado; importes de la NCE y IVA definitivos vienen del servidor en `/previa`.

**Panel «Resumen de la nota»** en escritorio: factura original, motivo, tipo `NCE`, establecimiento/punto, cantidad de líneas seleccionadas, moneda, y subtotal/IVA/total **solo cuando realmente exista resumen de servidor**. Antes da revisión mostrar `Importes calculados al revisar`, no números ficticios. Acción primaria `Revisar nota de crédito`, deshabilitada de forma explicable si faltan datos, NCE pendiente o saldo. No mostrar `Emitir` hasta la revisión exacta. Si se usa panel sticky, evitar doble CTA y tapar los inputs.

### Estado D — confirmación final

Modal compacto y legible `Revisar y emitir`, con referencia FE + CDC completo accesible, motivo, secuencia NCE/punto/moneda, detalle de líneas, totales por IVA y **Total NCE** dominante. Acciones `Volver y editar` y `Emitir nota de crédito` distinguibles. Mantener cuerpo exacto `revisado.cuerpo`/idempotencia (`UI-01`), fondo `inert`, prevención de doble click, errores persistentes y registro postenvío; no afirmar aprobación SIFEN a partir de HTTP.

## 4. Sistema visual y responsividad

- Escritorio desde ~1280px: encabezado compacto, contenido útil en primer pliegue; columnas de edición + resumen; no llenar 1600px con una sola caja de búsqueda.
- 768–1279px: campos reordenables en 2 columnas y panel resumen al final si la densidad lo exige.
- Hasta 767px / móvil ~375px: una columna, input 100%, resultados legibles, acciones cómodas, tabla con columnas prioritarias o filas expandidas; no panel sticky que cubra emisión; CTA visible sin invadir teclado móvil.
- Usar tokens CSS y clases locales consistentes con NEXIT; no overlays ornamentales, gradientes nuevas, cambios de marca ni tarjetas sobre tarjetas. Alturas y espaciados acordes con Clientes/Productos/Puntos.
- Foco por teclado visible, aria para búsqueda/listado, Escape para cerrar resultados, Enter para seleccionar, errores asociados a campo, estados cargando y vacíos claros; zoom de 200% sin recortes o superposición.
- Sin datos ficticios, cifras no confirmadas, acciones visuales inertes, duplicidad de botones o títulos de tres líneas innecesarios.

## 5. Reglas INNEGOCIABLES y alcance cerrado

**Esta etapa es exclusivamente experiencia UI de NCE, no una reescritura funcional.** Mantener:
- Emisión directa SIN borrador, FE original `APROBADO` + CDC, saldos/detalle desde snapshot fiscal, bloqueo por NCE pendientes e indeterminadas, un motivo por FE, cuatro motivos 2/3/4/8.
- En Devolución, campos cantidad disponibles por línea; en Descuento/Bonificación/Ajuste, importe por línea con IVA incluido. No mezclar motivos, no multiplicar importe por cantidad incorrectamente.
- Empresa, sucursal, usuario y permisos; moneda/IVA/decimales; NCE con secuencia NCE independiente por tipo y serie; nunca modificar FE original ni numeración.
- Mantener `revisado.cuerpo` EXACTO entre `/previa` y `POST /api/notas-credito`; revalidación y protección idempotente/concurrente, envío, consulta posterior; no reabrir MT-01/UI-01/R04-01 ni reglas de Innominado definidas por el responsable.
- NCE no modifica inventario, cuentas comerciales ni genera asientos/pagos; **NO copiar comportamiento fiscal de Odoo/ERPNext/Dynamics**, solo densidad/composición visual.
- NO crear migrations, modificar SQL, FE, gateway, endpoints fiscales, secuencias, credenciales, consultas automáticas, workers u otras telas salvo **ajuste estrictamente necesario de contrato de presentación** claramente justificado (debe parar si exige cambio funcional).
- Si alguna regla aprobada entra en conflicto con mejora estética, prevalece regla aprobada.

## 6. Criterios de aceptación visual y funcional (para nueva auditoría)

- **V-01:** Captura inicial ≈1600×900 muestra cabecera compacta y área de búsqueda equilibrada, SIN lista arbitraria con query vacía, SIN «Buscar» flotante ni texto largo de cabecera.
- **V-02:** Al teclear al menos 2 caracteres aparece listado organizado y con teclado; cliente permitido se selecciona; Innominado no permite selección normal.
- **V-03:** Cliente seleccionado muestra cabecera reducida + facturas elegibles tabuladas, búsqueda/paginación sin pérdida de selección o respuestas antiguas; NCE pendiente no seleccionable.
- **V-04:** Factura seleccionada muestra identidad/CDC + motivo/punto y tabla de líneas + resumen a la derecha; sin 13 columnas simultáneas ni scroll horizontal obligado en escritorio estándar.
- **V-05:** Devolución usa cantidades y valor/IVA de FE original; Descuento/Bonificación/Ajuste usa montos IVA incluido por línea; agotados y cantidades/saldos históricos visibles en detalle.
- **V-06:** Panel y modal final solo dan cifras fiscalmente confiables desde servidor; no hay importe local ficticio. `Revisar` y `Emitir` son acciones separadas.
- **V-07:** Corrección de NCE rechazada y cuerpo exacto revisado (UI-01), sin regresiones; cancelación del modal preserva cambios y no reserva número.
- **V-08:** Estados visuales, validaciones, foco, teclado y responsive 1600px/1280px/768px/375px; no cambio global de estilo.
- **V-09:** Evidencia ANTES y DEPOIS en `documentacao/v1/homologacao-visual/` con viewport/zoom/commit y evaluación; anexar imágenes reales si técnicamente disponible, sino dejar **PENDIENTE** explícito; solo responsable homologa al ver la pantalla en navegador real.
- **V-10:** Testes focales React/TS para interacción de búsqueda (incluidas carreras), selección cliente/FE, control de motivos y líneas, previo→envío exacto e Innominado, solo si existen herramientas leves; NO `tsc` global, build global, lint global, CI manual, batería SQL/VM.

## 7. Secuencia de implementación autorizada para Claude solo por orden del responsable

1. Sincronizar rama, leer `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, sección PRO-94 de `PROGRESSO-NEXIT-V1.md`, requisitos NCE y código real; recopilar referencias visuales de patrones aprobados, sin copiar contratos fiscales.
2. Rediseñar `/notas-credito` completos estados A–D en la misma tarea **solo visual**, conservando rutas/semántica. Preferir componentes menores locales para evitar archivo monolítico. No rediseñar por accidente FE/Puntos.
3. Ejecutar solo tests dirigidos y lint de archivos tocados. Nada de global ni VM. Registrar evidencia y bloqueos reales, commit/push y detener para auditoría.
4. ChatGPT audita contra V-01…V-10 y comparativa ANTES/DEPOIS; responsable homologa en navegador. **Hasta entonces estado NO HOMOLOGADA.**
