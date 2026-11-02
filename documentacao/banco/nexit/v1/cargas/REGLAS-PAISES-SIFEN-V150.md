# Países y localización — Nexit V1 / SIFEN v1.50

## Fuentes
- XSD oficial de países: https://ekuatia.set.gov.py/sifen/xsd/Paises_v100.xsd
- Manual Técnico SIFEN v1.50, grupo D3 (receptor): https://ekuatia.set.gov.py/
- Planilla geográfica oficial Paraguay noviembre 2025, carga separada `CARGA-GEOGRAFICA-SIFEN-2025.sql`.

## Fuente de verdad y persistencia
1. Tabla compartida `referencia_geografica_paises`: `codigo` ISO alfa-3, `nombre` en español y `activo`.
2. El combo muestra `nombre` y transmite `codigo`; el backend resuelve `nombre` por `codigo` activo. No confiar en el texto enviado desde UI.
3. La carga de países es **distinta** de departamentos/distritos/ciudades de Paraguay.
4. `gerar_carga_paises_sifen.py` descarga el XSD oficial y genera SQL SOLO si puede extraer códigos y nombres de forma inequívoca. Si falla, investigar fuente oficial, no rellenar nombres adivinados.
5. No eliminar países ni desactivar registros durante la carga sin analizar datos referenciados.

## Reglas fiscales del receptor (aplican a Clientes para emitir DE; NO automáticamente a Proveedores)
- `iTiOpe`: 1 B2B, 2 B2C, 3 B2G, 4 B2F.
- `cPaisRec`: código de país alfa-3; `dDesPaisRe`: descripción del país concordante con el código.
- B2B, B2C, B2G: `cPaisRec = PRY`; B2F: `cPaisRec != PRY`.
- En B2F, validar naturaleza del receptor según reglas específicas de SIFEN v1.50 (revisar tabla de validaciones del tipo de DE antes de emisión).
- Mantener validación de país contra catálogo activo. No utilizar una lista ISO genérica como prueba de que todos los literales son idénticos al XSD.
- La lógica de factura electrónica SIFEN corresponde a V2: en V1 mantener coherencia de maestros, sin habilitar emisión.

## Direcciones — comportamiento de negocio acordado
- País obligatorio, Paraguay `PRY` seleccionado por defecto en clientes nacionales.
- Paraguay: Departamento → Distrito → Ciudad; los tres son **opcionales**, pero cada selector depende del precedente (sin departamento, distrito y ciudad quedan vacíos; con departamento se puede dejar distrito y ciudad vacíos); al cambiar un valor padre se limpian los descendientes.
- Para países distintos de `PRY`, esos cuatro combos paraguayos no son necesarios; la dirección puede usar texto libre si el formulario lo soporta.
- Validar combinaciones de códigos con claves compuestas `(departamento_codigo, distrito_codigo, codigo)`.
- **Barrio está FUERA del alcance actual de la V1** (decisión del responsable; no es obligatorio para el registro SIFEN): no hay tabla de barrios, columnas de barrio, combo ni carga de los 1.104 barrios. La planilla y el histórico `fontes-historicas/025_*` quedan como referencia para una fase futura; reabrir solo con autorización expresa.
- Clientes y Proveedores deben compartir catálogos y comportamiento; no crear tablas/listas paralelas.

## Homologación
- Confirmar cantidad y contenido real de la tabla de países en la VM.
- Probar en navegador selección de PRY y BRA, código persistido, nombre mostrado y reabertura.
- Probar extranjero y reglas específicas de tipo de operación en Clientes; países libres en Proveedores.
- Confirmar que la carga fue efectivamente ejecutada en el PostgreSQL real antes de afirmar que está listo.
