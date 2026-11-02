# Proveedores V1 — Etapa 1: estandarización visual (2026-10-11)

Alcance ejecutado: solo interfaz. Sin cambios en APIs, migraciones, SQL, payloads, validaciones, enums, homologación, bancos, retenciones ni documentos.

## Aplicado (patrón de Clientes V1: Nuevo/Editar cliente y Lista)
- Alta y edición: miga «Maestros / Proveedores / …», título 24 px, botón «Volver», tarjeta única, pestañas compactas con subrayado (8 pestañas intactas), marca de error en la pestaña, nota «Los campos con * son obligatorios.», campos de 40 px con asterisco rojo, casillas con acento del tema, registros relacionados como tarjetas con «Eliminar» discreto, estado vacío único («Aún no hay … cargadas.»), pie fijo con Cancelar / Guardar, responsive (cuadrículas 4→2→1, pestañas con desplazamiento horizontal).
- Eliminados: pastilla PROVEEDORES, descripción bajo el título, cabecera duplicada de la tarjeta, aviso «Código automático / PRV-0000XX» (el código PRV sigue asignándose al guardar), descripciones repetidas bajo cada sección, pie con texto informativo.
- Edición: título = razón social, con código y estados (Activo/Inactivo, homologación en texto legible).
- Textos: etiquetas internas de cuentas bancarias reemplazadas («Banco», «Sucursal», «Titular», «Documento del titular»).
- Estados de página (cargando, error, no encontrado) con el mismo padrón (`_components/estado-pagina.tsx`).
- Lista: ya usaba el padrón compartido de listados originado en Clientes (`components/ui/lista-padrao`); sin cambios.

## Verificación
- tsc sin errores; build de producción OK; recuento de `<Field>`, `<input>`, `<select>`, `<textarea>`, `<option>` y de todas las llamadas `update("…")` idéntico antes/después (las 8 pestañas conservan todos sus campos).
- ESLint: 8 problemas **preexistentes** (4 errores `react-hooks/set-state-in-effect` en la lista y en el formulario, 4 variables sin uso en `initialForm`), ninguno introducido; no se corrigieron por alterar lógica fuera del alcance.
- **Sin revisión visual en navegador** (no ejecutada): pendiente de aceite humano.

## Divergencias funcionales para la etapa siguiente (no tratadas)
- Validación del formulario limitada a razón social, RUC/DV y país PRY; el resto de reglas pertenece a la etapa de reglas.
- `nuevo/page.module.css` quedó sin uso (hoja anterior); puede eliminarse en una limpieza posterior.
- Marca de error de pestaña solo para validaciones locales; los errores de API no indican pestaña.
