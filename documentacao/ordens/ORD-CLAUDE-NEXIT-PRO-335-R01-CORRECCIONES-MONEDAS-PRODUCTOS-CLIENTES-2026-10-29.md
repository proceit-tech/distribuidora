# ORDEN CORRECTIVA FOCAL — PRO-335 / AUDITORÍA R01 — monedas en Productos y vista de Clientes

**Fecha:** 29/10/2026 · **Auditor/analista:** ChatGPT · **Desarrollador:** Claude.  
**Commit original PRO-335:** `d2214351d2bf2677b3dc6dc166733aafa6af1a8a` (22 archivos; 74 + 1 casos, no ejecutados).  
**Auditoría obligatoria:** [AUD-NEXIT-PRO-335-R01](../testes/AUD-NEXIT-PRO-335-FORMATO-MONETARIO-R01-2026-10-29.md).  
**Repo:** `proceit-tech/distribuidora` · **branch:** `feature/NEXIT-2026-001-banco-demo`.  
**Issue única:** [PRO-335](https://linear.app/proceit/issue/PRO-335). **PRO-337 permanece NO AUTORIZADA**, no modificar CSS/layout del Informe de Ventas.

## A. Alcance aprobado de ESTE CORRECTIVO

Corregir únicamente **F-001 (agregación KPI de monedas), F-002 (origen de moneda de costo) y F-003 (presentación de confirmación de conversión de límite de crédito)**. La auditoría R01 confirmó que Proveedores «Monto mínimo de compra» es un **input EDITABLE**, por lo cual no debe recibir formato de lectura ni cambiar validación contractual.

**F-001 — Productos / KPI «Valor a precio venta»:** `listado-productos.tsx` suma hoy `precioVentaReferencia × stockDisponible` de múltiples monedas y sobrescribe `monedaValor` con la última: total rotulado erróneamente. Agrupar el subtotal **por moneda real del PRECIO**, nunca mezclar PYG/USD/BRL, no inventar conversiones y no usar moneda del último elemento. Mostrar subtotales separados en el mismo KPI o sustituir por desglose legible sin suma falsa. Moneda ausente: grupo explícito «Sin moneda», no atribuir una divisa. Conservar filtrado/ACL y criterios de qué productos computan. Para sumas decimales en texto usar utilitario puro `sumarDecimales/multiplicarDecimales` o equivalente; no `Number` para agregados monetarios si hay `numeric` textual disponible. Si alterar tipos/listado es necesario, limitarse a DTO de lectura. No recalcular IVA ni precios fiscales ni cambiar DB.

**F-002 — Productos / costo medio y costo de apertura:** `inventario_costos` y `NEX-009` utilizan `empresas.moneda_base_codigo` para COSTOS; `app/api/productos/route.ts` solo expone costo numérico sin moneda; `[id]/route.ts` devuelve costo y usa `monedaReferencia` tomada de lista de precios si existe. El listado rotula costo promedio siempre PYG; la pestaña Inventario rotula costo promedio con `catalogos.monedaReferencia`; las monedas pueden diferir. **Crear proyección mínima de metadatos de SOLO LECTURA de la moneda base de costos** desde `empresas.moneda_base_codigo`, respetando sesión/tenant/ACL y contratos anteriores; mantener `catalogos.monedaReferencia` exclusivamente para PRECIO de venta referencial. Para costo de apertura, usar `movimiento_lineas.moneda_costo_codigo` cuando exista (ya forma parte de la fila), no asumir que es igual a la lista de referencia ni convertir. Si el costo ya se debe mostrar en moneda base por contrato, demostrarlo desde el código persistido; si la moneda está ausente/desconocida, mostrar dato exacto sin afirmar moneda. Actualizar solo tipos de lectura y widgets de Productos necesarios. No modificar ni crear valores de inventario, movimientos o precios. No ampliar SELECT a otras empresas ni hacer migrations.

**F-003 — Clientes / confirmación de conversión de crédito:** `clientes/[id]/page.tsx`, bloque `vistaConversion` de «Límite de crédito» y «Límite temporal» muestra texto numérico crudo. Es una tabla de **LECTURA** previa al consentimiento, no el input de crédito. Mostrar valores PYG con 0 decimales y USD/BRL con 2 conforme moneda de origen/destino DE CADA LADO de la flecha, usando helper PRO-335. **Mostrar explícitamente también el valor exacto no redondeado de la conversión en un texto secundario accesible** si visual oculta fracciones, para que el operador sepa exactamente qué está confirmando. No tocar `conversionMoneda`, cálculo `convertirLimites`, entrada editable, contraseña, fórmula de tasa ni payload; ninguna nueva validación de base de datos.

## B. Archivos AUTORIZADOS

1. `app/(private)/productos/_components/listado-productos.tsx` — subtotal de KPI por moneda y rótulo de costo promedio.
2. `app/(private)/productos/_components/pestanas/inventario.tsx` — moneda real de costo y apertura.
3. `app/api/productos/route.ts` — **SOLO** metadato de moneda base para lectura del listado, sin cambios a queries de permisos, CREATE, PATCH, transacciones ni endpoints ajenos.
4. `app/api/productos/[id]/route.ts` — **SOLO** metadato de moneda base y `moneda_costo_codigo` de apertura si preciso, sin cambios en estado/edición.
5. `types/productos.ts` — tipado aditivo, retrocompatible, para metadato moneda base y moneda costo de apertura. Si se necesita un tipo del listado ya presente, ampliar exclusivamente el de la vista.
6. `app/(private)/clientes/[id]/page.tsx` — **SOLO** el render de tabla `vistaConversion` y el helper importado, sin alterar campos de edición, cálculos, confirmación o envío.
7. `lib/formato/monto-visual.casos.ts` o `lib/productos/productos-r02.casos.ts` y `lib/clientes/*.casos.ts` únicamente para escribir casos puros/estructurales focales. Si se requiere un helper monetario puro adicional, crearlo bajo `lib/formato/` o `lib/productos/` con justificación; sin alterar existentes más allá de la UI.

**Fuera de alcance:** `Proveedores` editable, CSS/layout PRO-337, Facturas/NCE/KuDE/SIFEN, inventario cálculos/movimientos, SQL/migrations, stock/emisión, exportadores, dashboard, reportes ya auditados, reposición, precios guardados, `CLAUDE.md`, `PROGRESSO`, Linear, planes, órdenes, proveedores de firma.

## C. Casos de aceptación obligatorios (escribir como código)

- KPI 2 productos PYG 100.000 y USD 20 => **dos subtotales PYG 100.000 y USD 20,00**, NO USD 100.020/GS 100.020.
- 2 productos misma moneda ⇒ subtotal exacto; mezcla USD/PYG/BRL ⇒ 3 líneas monetarias sin suma agregada falsa; sin moneda ⇒ «Sin moneda», sin atribuirla.
- Costo promedio con empresa base PYG y lista de referencia USD ⇒ costo PYG, precio USD. Empresa base USD y lista referencia PYG ⇒ costo USD, precio PYG. Costo de apertura con `moneda_costo_codigo` independiente ⇒ etiqueta correcta. Ausencia de moneda ⇒ no inventar.
- Clientes: conversión de crédito `142090.90909092 PYG` → valor principal `142.091 PYG`, con `142090.90909092` disponible como valor exacto de verificación; USD 1234.56789 → 1.234,57, dato exacto conservado; tasa/campos/payload idénticos a antes.
- No se altera la aritmética o el `numeric` de costos, precios, IVA; sin monedas no se fuerza PYG; F-001/F-002/F-003 cubiertos en casos y matriz.

## D. Protocolo

Leer `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, auditoría R01 completa y todos los archivos permitidos. Confirmar branch y trabajo local limpio; fast-forward sin sobrescribir/stash. Desarrollar únicamente los tres hallazgos. **NO EJECUTAR** tests, lint, typecheck, build/CI manual, PostgreSQL, SQL/migrations, Docker, VM, gateway, navegador productivo ni deploy. Casos solo escritos. **Una entrega focal**, commit+push, SHA COMPLETO, total de casos nuevos y archivos; **PARAR para AUDITORÍA CHATGPT R02**. Si para resolver F-002 se requiere cambiar archivo no autorizado, PARAR con evidencia y no asumir divisa errónea.
