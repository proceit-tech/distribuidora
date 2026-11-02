# AUD-NEXIT-LISTAS-PRECIOS-DESKTOP-R01 — Auditoría del menú «Listas de precios»

**Fecha:** 2026-10-18. **Corte inmutable de código:** `25f2844d1a18171c2520850ca7379c879d937438`, branch `feature/NEXIT-2026-001-banco-demo`.
**Política del producto:** ERP **exclusivamente desktop**, sin necesidad de interfaz para teléfono.
**Veredicto:** **CORRECCIÓN SOLICITADA — 1 ALTA + 3 MEDIAS. Auditoría estática documentada, NO HOMOLOGADA.**
**Responsabilidad:** ChatGPT audita y documenta; Claude solo implementa con autorización explícita y pruebas mínimas dirigidas; responsable humano controla VM, PostgreSQL, deploy y homologación. No se cambió código ni SQL ni se ejecutó nada contra ambientes reales.

## 1. Rastreabilidad y método

Leídos `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, secciones pertinentes del `PROGRESSO-NEXIT-V1.md`, `documentacao/v1/auditoria-por-menu/AUD-LISTAS-PRECIOS-V1.md` (histórico LPR-A01…A09, R02/R03 y decisiones LPR-X01…X03), `documentacao/v1/homologacao-visual/IMPLEMENTACAO-LISTAS-PRECIO-Y-CATALOGOS-COMERCIALES-2026-10-12.md`, árbol de la branch y código actual.
- **Tres páginas operativas más layout:** `app/(private)/listas-precio/{layout.tsx,page.tsx,nuevo/page.tsx,[id]/page.tsx}`, formulario completo `_components/lista-precio-form.tsx` (923 líneas), CSS e interacciones de filtros/tablas/formulario y pestañas Información, Productos y precios, Reglas comerciales.
- **API:** `app/api/listas-precio/route.ts` (GET lista/catálogos, POST) y `app/api/listas-precio/[id]/route.ts` (GET detalle, PUT). GET requiere VER, POST CREAR, PUT EDITAR. `empresaId` viene de la sesión; la mayoría de consultas y mutaciones filtran empresa y limitan IDs; transacciones en POST/PUT.
- **Servicios:** `lib/listas-precio/{shared.ts,cliente-api.ts,formulario.ts,calculos.ts,concurrencia.ts}`, `types/lista-precio.ts`; consideradas pruebas `listas-comerciales.casos.ts`, `estabilizacion.casos.ts`.
- **Persistencia:** NEX-008 (cabecera/lista, precios, escalones, reglas y FKs), NEX-017 (`REF-VENTA`, función de precios Productos, FK unidad), NEX-018 (vigencias, restricciones, validación de referencias multiempresa y moneda por trigger); dependencias monetarias NEX-029/045 y decisiones comerciales precedentes según documentación. Migraciones leídas, **sin comprobar ledger real del PostgreSQL**.
- **Cobertura:** revisión de la lógica de los principales archivos citados, contratos y puntos críticos; **no** se ejecutaron pruebas de navegador, endpoint real, SQL, VM, Docker, SIFEN, build, CI, tsc/lint general ni suites. No afirmar lectura ejecutiva de cada camino en PostgreSQL ni precisión monetaria comprobada.

## 2. Hallazgos actuales por severidad

### LPR-D01 — ALTA — LISTAS_PRECIO.CREAR no permite usar el formulario de alta

**Evidencia:** `app/(private)/listas-precio/layout.tsx:6` aplica `guardPage("LISTAS_PRECIO","VER")` al subárbol **incluida `/listas-precio/nuevo`**. `app/api/listas-precio/route.ts:39` exige VER antes de distinguir `modo=catalogos`, mientras `POST` exige CREAR (`:133`). `app/(private)/listas-precio/_components/lista-precio-form.tsx:163–177` necesita `cargarCatalogosListas` con GET `?modo=catalogos`; `nuevo/page.tsx:12–14` redirige al listado que también exige VER después del alta. Modelo de acciones de permisos separados.

**Secuencia:** un perfil empresarial autorizado exclusivamente a crear listas no puede abrir ni completar el alta; su API de creación sí permite POST si envía datos propios correctamente. Conceder VER de forma implícita **no** es corrección autorizada.

**Criterio:** proteger ruta lista/ficha con VER y ruta nueva con CREAR, catálogos mínimos de alta para CREAR o VER sin exponer listados ni fichas de listas/clientes/stock que el rol no tiene permiso para leer; evitar redirección final a destino prohibido para CREAR-only; cubrir perfiles admin, CREAR-only, VER-only, EDITAR-only, sin acciones, outra empresa en pruebas focales. Considerar explícitamente qué campos de catálogos (por ejemplo costos y clientes) son realmente necesarios y permitidos para CREAR-only antes de ampliar exposición; no reutilizar el GET irrestricto sin análisis.

### LPR-D02 — MEDIA — Acciones de crear/editar visibles y operables desde la UI a usuarios sin la autorización correspondiente

**Evidencia:** `app/(private)/listas-precio/page.tsx:445` y `:663` ofrecen «Nueva lista» a cualquiera que pueda abrir la lista (VER). `app/(private)/listas-precio/[id]/page.tsx:56` pasa `mode="edit"` indiscriminadamente; `_components/lista-precio-form.tsx:447–554,908–917` muestra inputs editables y «Actualizar lista» aunque el actor sea VER-only; no hay `permisos.editar` de respuesta del GET ni un componente de solo lectura. `PUT /api/listas-precio/[id]` exige EDITAR a ~línea 151 y POST exige CREAR.

**Impacto:** operador de consulta puede preparar modificaciones que se rechazarán al final con 403; botón de alta apunta a ruta sin permiso. **No se identificó bypass backend.**

**Criterio:** UX por permiso real: Ver solo lectura sin submit EDITAR, botón Nuevo solo a CREAR, enlaces a destinos permitidos; ninguna relajación de API. Pruebas VER-only, CREAR-only, EDITAR, admin; preservar privilegios específicos/costo si definidos por producto.

### LPR-D03 — MEDIA — Estado de vigencia mezcla situación administrativa con fecha e infla el resumen de disponibilidad

**Evidencia:** `app/(private)/listas-precio/page.tsx:32–50` `getEstadoReal(lista)` devuelve `VENCIDA` si `vigenteHasta` está en el pasado **sin consultar `lista.estado` o `lista.activo`**. Una lista `BORRADOR` o `INACTIVA` con fecha fin anterior aparece bajo filtro VENCIDA y desaparece del filtro administrativo original. `page.tsx:255–271` incrementa `resumen.activas` si `lista.activo && getEstadoReal(lista)==ACTIVA` **sin comprobar `vigenteDesde`**: una lista ACTIVA con inicio futuro figura en «Listas activas · Disponibles para operar». El reloj de vencimiento utiliza la timezone del dispositivo, no `America/Asuncion`, lo que puede diferir cerca del cambio de fecha fuera de Paraguay. `prepararLista` permite legítimamente fecha inicial futura, estado BORRADOR/INACTIVA, y NEX-008/018 soportan esos estados.

**Impacto:** información comercial incorrecta en filtros/KPIs, aunque los valores persistedos no se alteran por el cálculo del navegador.

**Criterio:** acordar/explicitar semántica estado administrativo vs vigencia: preservar BORRADOR/INACTIVA y distinguir «Aún no vigente»/«Vencida» solo para listas que son aptas por estado; KPI «disponibles para operar» exige `vigenteDesde <= fecha PY <= vigenteHasta` además de habilitación; usar fecha local Paraguay como contrato. Si el negocio desea otra regla, documentarla antes de implementar. Pruebas unitarias puras de borrador vencido, inactiva vencida, activa futura, activa vigente, activa vencida, fecha límite 23:59 PY y timezone extranjera.

### LPR-D04 — MEDIA — Editor permite guardar después de fallo de carga de catálogos y asume PYG como base provisional

**Evidencia:** `app/(private)/listas-precio/_components/lista-precio-form.tsx:157–176`: `cargarCatalogosListas` falla, se hace `setError(...)`, pero **no hay** un estado `cargaConfiable`, bloqueo para submit ni reintento. `monedaBase = catalogo?.monedaBase ?? "PYG"` en ~línea 160. `submit` ~338–384 valida campos existentes y ejecuta `onSave(datos)` aun con `catalogo=null`; el botón «Guardar lista» / «Actualizar lista» ~914 permanece habilitado salvo `saving`. En editar, `form.productos` viene de initial y puede enviarse de todas formas; selectores auxiliares usan `[]` y resguardos de valores antiguos.

**Impacto:** el operador ve error de catálogo pero puede intentar guardar asociaciones/monedas que no consigue verificar o interpretar adecuadamente; el texto de ayuda/uso de importación presupone moneda-base PYG, falsa para empresas con otra moneda. El backend aún hace validaciones de referencias/moneda y puede rechazar operaciones; no declarar corrupción DB demostrada.

**Criterio:** diferenciar `cargando/errorCatalogos/ok`, no inferir PYG si moneda-base aún no está confirmada y no dejar que Guardar afirme validez de listas de opciones ausentes; conservar rascunho y ofrecer retry que recargue catálogos sem abandonar; no sobrescribir asociaciones existentes ni bloquear lectura legítima de la ficha. Test catálogo 403/500/red/malformed, empresa base USD, éxito de retry y edición con refs históricas inativas; conservar validação server-side.

## 3. Controlos históricos corrigidos — NÃO REABRIR

- **LPR-A01/A02 + LPR-R02-01:** `GET` detalle devuelve versión UTC µs de cabeçalho y de ítems. Formulario manda `itemsCargados` desde `initial.productos`, incluyendo excluidos en el borrador. PUT obtiene row lock del header, `exigirVersionLista`, `planificarHijos` y `conflictoItems` compara conjunto íntegro ID+versión de ítems bajo `FOR UPDATE`, devuelve 409 si cambiaron en Productos u otra sesión; solo después UPDATE + `aplicarHijos` en transacción. Se conserva ID de hijos cuando no cambian. R03 histórica **aceitó estaticamente** el ajuste; esta revisión confirma su presencia, sin SQL runtime.
- **LPR-A03:** `tramosSuperpuestos` previene faixas inclusivas superpuestas en UI y servidor; intervenciones de Python/SQL no ejecutadas.
- **LPR-A04:** `validarCodigoReferencia` e `initial.esReferencia` fijan código de REF-VENTA; cabeçalho tipo/activo/base protegido por PUT; precios aún editables conforme decisión.
- **LPR-A05/A08:** moneda/tipo no se cambian con ítems/derivadas en `validarCambioMonedaTipo`; trigger NEX-018 confirma moneda ítem/lista. La validación server-side vence a estados obsoletos UI.
- **LPR-A06:** unidad nueva corresponde a unidad-base o a presentación del producto, respetando vínculos históricos sin alteración; no se supone política de recálculo após troca de unidade-base.
- **LPR-A07:** `useProtegerCambios` para enlaces internos/reload, sin garantia universal de Back del navegador.
- **LPR-A09:** referencia comercial inactiva se permite solo si ya está vinculada en mismo contexto original; tenant desde sesión, no del body.
- **SIFEN/IVA y precios por presentación:** no inventar reglas de conversión FX, redondeo fiscal ni costos por caja. DEC-PRD-U09/U10 y LPR-X01…X03 contienen decisiones abiertas/históricas y no autorizan una reimplementación del modelo de precios.

## 4. Observaciones, no fallos confirmados

- **LPR-O01:** API `GET?modo=catalogos` devuelve `costoPromedio` y `precioReferencia` de productos con permiso LISTAS_PRECIO.VER, sin guardas adicionales STOCK/PRODUCTOS; es necesaria política explícita de confidencialidad sobre costes antes de clasificar como fuga de datos. Verificar alcance por depósito; no alegar vulnerabilidad sin decisión.
- **LPR-O02:** API GET precio/costo `numeric(18,4)::float8`, formulario y servidor `Number`, potencial de precisión en valores muy grandes o con cuatro decimales. No se detectó en esta revisión un caso de negocio real ni se corrió prueba límite; proponer test focal de roundtrip precisión antes de calificar bug numérico material. No alterar FE/IVA en esta auditoría.
- **LPR-O03:** `GET /api/listas-precio` y catálogos descargan todos los registros empresariales, listas/paginación y filtrado en memoria (8 por página), sin mediciones reales de tiempo/memoria, riesgo de escala.
- **LPR-O04:** `window.confirm` nativo está presente para cambio de moneda, importación masiva, descuento y precio cero; **hay confirmación real**. Padronización visual desktop futura, no fallo de integridad por sí mismo.
- **LPR-O05:** GET detalle de cabeçalho y tres consultas de hijos no comparte snapshot transaccional explícito; podría quedar temporalmente inconsistente bajo actualización simultánea, y la protección 409 debe bloquear guardado desde estado obsoleto. No inventar error confirmado sin prueba controlada; verificar al homologar.

## 5. Estado y continuidad

**Resultado por menú:** Listas de precios revisado estaticamente en este corte, **1 ALTA + 3 MÉDIAS** abiertos. Sin corrección encargada al Claude; documentación no implica autorización de desarrollo. Si se autoriza después, tests básicos focales por permisos, estado/vigencia, carga fallida de catálogos; preservar CAS de precios, NEX-018, REF-VENTA y multiempresa. NO ejecutar tsc global, build, lint global, suites integral, CI manual ni PostgreSQL/VM operational por IA. Siguiente menú independiente: **Maestros → Catálogos comerciales**; no empezar ni asumir auditado sin solicitud del responsable. La homologación visual desktop y transaccional en ambiente real sigue siendo humana.
