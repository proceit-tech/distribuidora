# CASA MINGO — ORDEN MAESTRA DE DESARROLLO POR ETAPAS

**Fecha:** 02/11/2026. **Proyecto:** NEXIT · `proceit-tech/distribuidora` · branch `feature/NEXIT-2026-001-banco-demo`.
**Linear padre:** PRO-329. **Desarrolla:** Claude Code. **Audita:** ChatGPT por commit antes de autorizar el siguiente.
**IMPORTANTE:** orden PREPARADA/EN COLA, NO ACTIVA. La orden activa aún es **PRO-338-R02**, pendiente de entrega y auditoría. No reemplazarla ni ejecutar estas etapas de forma simultánea.

## PROTOCOLO OBLIGATORIO

- Leer `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, este documento y la issue correspondiente antes de actuar. Consultar la versión **completa y más reciente** de cada archivo desde la branch actual; **trabajar UN ARCHIVO a la vez**, nunca suponer actual una copia de otro turno, ZIP o SHA. Confirmar SHA inicial. Leer antes de modificar.
- **Una issue por ciclo**. Implementar solo la issue habilitada tras la auditoría anterior, escribir casos dirigidos de regresión, commit+push SHA completo y **PARAR** para ChatGPT. No saltar a la siguiente por propia iniciativa.
- **NO EJECUTAR** tests, runner, lint, typecheck, build, CI manual, SQL, migrations, PostgreSQL, VM, Docker, gateway real, navegador productivo ni deploy (restricción vigente). Escribir casos como fuente, indicar explícitamente `0 ejecutados`; no declarar homologado por revisión estática.
- No alterar emisión, numeración, CDC, SIFEN, FE/NCE, idempotencia, stock, cálculos, descuentos, IVA, moneda, KuDE PRO-326, consulta fiscal PRO-338, permisos, empresas/sucursales ni historial. Mantener lector de códigos, Enter, GTIN y ceros a izquierda. No crear soluciones nuevas ni tocar CSS global sin necesidad acreditada.

## ETAPA 1 — PRO-331 — NUEVA FACTURA (ALTA PRIORIDAD)

**Diagnóstico:** `app/(private)/facturas/nueva/page.tsx`: `lineas.map((l,i))` no muestra `i+1`; el efecto de `lineaAFocar` mueve el foco a input de **Cantidad** después del alta; `page.module.css::.tableWrap` tiene `overflow-x:auto` pero sin scroll vertical limitado.

**Reglas exigidas:**
1. **4 filas visibles, scroll desde 5:** en la tabla de **edición** de detalle, mostrar cuatro líneas de producto accesibles más encabezado y scroll vertical LOCAL cuando se agrega el quinto producto o más. Barra de scroll de la tabla, NO sidebar de navegación. No recortar filas de altura variable (stock, descripción, descuento, warnings); usar alto y estructura razonables y `thead` sticky. Mantener scroll horizontal local cuando sea necesario. Buscador `Añadir Producto por Código` queda **FUERA** del scroll, visible y accesible. No introducir scroll al modal **Resumen** ni alterar su cabecera.
2. **Columna de orden:** introducir `N°` con posición visual `1,2,3,...` **antes** del nombre del producto. Ajustar `colgroup`, `thead`, `tbody`, `colSpan`, `data-label` y estilos/ARIA. Tras eliminar la fila 2 de 3, quedan ordinales 1,2. No cambiar clave interna de línea, código de producto, orden fiscal del JSON, secuencia de documento o cálculo. El índice no es ID del registro.
3. **Foco después del escaneo:** al agregar **correctamente** producto por código/GTIN/Enter, limpiar la búsqueda y volver el cursor al input `Añadir Producto por Código` listo para otra lectura, incluso con 5/21/50 ítems. Si mismo SKU, sumar unidad a la fila existente y retornar al buscador (no crear duplicado). No enviar foco a Cantidad tras alta rápida como ahora. **No robar foco** durante edición manual de Cantidad/Precio/Descuento, Tab/click, modal Búsqueda avanzada o editor de datos fiscales. Respetar errores de validación que exijan intervención, no esconderlos. Evitar useEffect que roba foco al rerender.
4. **NO limitar a 4 ni 21 artículos por este cambio.** Cuatro es exclusivamente número de filas visibles. Mantener la política fiscal actual `MAX_LINEAS=999`; la propuesta condicional de 21 tiene issue independiente PRO-339.

**Archivos candidatos:** `app/(private)/facturas/nueva/page.tsx`, `page.module.css`, casos fuente locales cuando indispensables. No modificar APIs/SQL por UX.

**Casos escritos (NO ejecutados):** 0/1/4/5/21/50 renglones; recálculo al borrar, header sticky, cuatro visibles y scroll, input búsqueda fijo; escaneos consecutivos Enter con ceros iniciales, doble SKU; teclado/Tab y edición manual sin salto; panel fiscal, stock insuficiente, encabezado y vista desktop, sin alteraciones del PDF/IVA.

**Entregar:** SHA, paths, causa, cambios y casos no ejecutados. **PARAR** para auditoría ChatGPT **PRO-331-R01**.

## ETAPA 2 — PRO-333 — ORDEN NUMÉRICO DE DOCUMENTOS

**Diagnóstico:** `lib/facturacion/shared.ts::ORDEN.numero = ["d.establecimiento","d.punto_expedicion","d.numero"]` usa `numero` TEXT. El defecto es **orden lexicográfico**, no por fecha cuando se hace clic en Documento.

**Reglas:** al pulsar `Documento`, el **número numérico** es criterio PRIMARIO, con ASC/DESC del control `ThOrdenable`; ejemplo DESC: **90015, 90014, 90006, 90005, 90004** (en vez de 90006, 90005, 9004, 90015). Después de número, desempates estables por establecimiento, punto, serie, tipo, fecha e ID. Preservar ceros de presentación y el número persistido sin regrabar. Revisar dominio TEXT en schema: no hacer cast peligroso a integer/bigint sin prueba; para cadenas no numéricas definir orden determinista y seguro. Hacer ORDER BY en SQL **ANTES de LIMIT/OFFSET**, preservar filtros multiempresa/sucursal, permisos, orden por fecha por defecto cuando no hay selección, historial y PRO-338.

**Archivos candidatos:** `lib/facturacion/shared.ts`, casos fuente; la página solo si se demuestra fallo en cambio de dirección. **Casos NO ejecutados:** ASC/DESC, número corto/largo, ceros, establecimientos/puntos distintos, empate, paginación, filtro y fecha por defecto. Commit+SHA y **PARAR** para ChatGPT **PRO-333-R01**.

## ETAPA 3 — PRO-334 — COLOR POR TIPO FE/NCE

**Diagnóstico:** `app/(private)/documentos/page.tsx` usa `<tr className={ui.row}>` igual en FE y NCE. Los badges de PRO-338 colorean **estado fiscal** y NO tipo de comprobante.

**Reglas:** FE = **azul suave** de fondo/acento de su fila; NCE = **amarillo claro suave**. Mantener etiqueta `Factura electrónica`/`Nota de crédito` y contraste por texto (no solo color). Señal visual coherente en detalle expandido sin cambiar datos/acciones. Mantener intactos los badges SIFEN **verde aprobado, rojo rechazado fiscal, amarillo pendiente, gris sin transmitir**, así como alerta CDC_DIVERGENTE **roja técnica**. No colorear fila de rojo/verde por estado ni confundir amarillo de NCE con pendiente. Hover/focus teclado/accesibilidad y responsive desktop sin desbordar; conservar KuDE aun rechazado/sin CDC, historial, email, consulta manual y automática. **Solo** TSX/CSS local + casos fuente si necesario. No alterar SQL o filtros.

**Casos NO ejecutados:** FE/NCE ambas con APROBADO, RECHAZADO y PENDIENTE; CDC divergente; hover/foco, expansión, acciones KuDE; color por tipo independiente del fiscal. Commit+SHA y **PARAR** para ChatGPT **PRO-334-R01**.

## ETAPA 4 CONDICIONAL — PRO-339 — PROPUESTA MÁXIMO 21 ÍTEMS CASA MINGO

Texto del cliente: **«Si es posible que limite hasta 21 líneas solamente»**. Esta frase es **condicional** y no autoriza reemplazar el `MAX_LINEAS=999` fiscal por 21 para todos.

1. Inspeccionar política/configuración **por empresa** real en schema/código. Si existe mecanismo seguro y corresponde a CASA MINGO, evaluar aplicar 21 **solo en dicha empresa** tanto en UI como en backend de creación antes de reservar numeración; no confiar en UI sola, no inferir empresa por nombre/RUC/UUID ficticio, no alterar NCE ni facturas históricas >21.
2. Si NO existe infraestructura segura por empresa, **DETENER implementación del hard-cap**, informar el mínimo cambio/migración/permisos que haría falta y solicitar decisión específica. No introducir migration, tabla o feature flag unilateralmente. PRO-331/333/334 pueden considerarse independientemente de este gate.
3. Si autorizada y viable: 21 aceptada, intento de 22 bloqueado con texto claro sin borrar selección, tras quitar una fila puede agregar de nuevo; SKU ya presente aumenta cantidad sin sumar líneas. La tabla igual muestra solo 4 filas antes de hacer scroll. Conservar validación general 999 y otras empresas.

**Casos a escribir sin ejecutar:** 4/5 visual, 20/21/22 datos, borrar, mismo SKU, tenant distinto >21, histórico >21, API y UI, scanner y stock. **No declarar PRO-339 completa** si la política está pendiente.

## DEPENDENCIAS DEL PROVEEDOR — NO EDITAR POR CLAUDE

**PRO-298:** KuDE de FE USD debe mostrar **exactamente 2 decimales** en PDF. PDF lo genera gateway externo y NEXIT lo muestra íntegro. Verificar con PDFs reales y solicitar ajuste de plantilla al proveedor; **no** reescribir PDF, no montar generador propio, ni redondear JSON/impuestos/cambio/CDC.

**PRO-336:** nuevo certificado de firma con la misma clave **si es permitido por el proveedor/certificado**, intervención de operador autorizado en entorno de gateway o firma, nunca pedir PFX/contraseña por chat. El NEXIT hoy no tiene uploader PFX/P12. Investigar separadamente por qué no se ven DTE APROBADOS: firma/certificado, estado SIFEN, consulta de gateway/CDC, filtros y KuDE son cosas distintas. No afirmar que cambiar certificado aprueba documentos anteriores, no implementar uploader sin arquitectura aprobada.

## GATE DE AUDITORÍA / ORDEN SECUENCIAL

0. Primero **PRO-338-R02** (orden activa): Claude entrega SHA; ChatGPT audita; sin aprobación **no comenzar PRO-331**.
1. Después, Claude implementa solo **PRO-331**, SHA → **auditoría ChatGPT** → autorización siguiente.
2. **PRO-333**, SHA → auditoría → siguiente.
3. **PRO-334**, SHA → auditoría → siguiente.
4. **PRO-339**, diagnóstico/política condicionada, no hardcodear ni tocar máximo global.
5. PRO-298 y PRO-336 requieren proveedor/operador humano; homologación visual real + pruebas/SQL/deploy sujetos a autorización expresa.

Cada entrega debe enumerar archivos, SHA completo, cambios mínimos, casos fuente, riesgos y dependencias; **0 pruebas ejecutadas**. ChatGPT emite R01 y, si hay defectos, R02 focal; `In Review` hasta homologación, no `Done` por código publicado.
