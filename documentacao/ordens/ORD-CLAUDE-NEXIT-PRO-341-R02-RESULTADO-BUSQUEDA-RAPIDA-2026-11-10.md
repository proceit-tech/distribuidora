# ORDEN CORRECTIVA — PRO-341-R02 / Resultado real del alta en búsqueda rápida

**Fecha:** 10/11/2026  
**Repositorio:** `proceit-tech/distribuidora` · branch `feature/NEXIT-2026-001-banco-demo`  
**SHA PRO-341-R01 auditado:** `8c7f47b8ffca7597e79bfc4f286b9a63917d6022`  
**Auditoría independiente vinculante:** [AUD PRO-341-R01](../testes/AUD-NEXIT-PRO-341-CODIGO-FOCO-R01-2026-11-10.md)  
**Linear:** [PRO-341](https://linear.app/proceit/issue/PRO-341) · [GitHub #18](https://github.com/proceit-tech/distribuidora/issues/18)  
**Veredicto previo:** **R01 NO CONFORME por UN hallazgo R01-F001**. Código completo visible y foco en Cantidad **conformes estáticamente; NO reimplementarlos**.  
**ÚNICA ORDEN ACTIVA:** este correctivo. **PRO-340 sigue sin autorización.**

## 1. Único defecto autorizado: confirmación «añadido» falsa

**Traza exacta del código actual (SHA R01):**
- `page.tsx:927–932`: `agregar` devuelve `ALTA_BLOQUEADA` si no cabe una línea nueva, sin agregar nada. Muestra aviso correcto de máximo.
- `page.tsx:956`: `agregarRapido = (p) => { agregar(p,"rapido"); }` DESCARTA el retorno; `BuscadorProducto` y `BuscadorRapido` declaran `alElegir: (t)=>void`.
- `lib/facturacion/busqueda-rapida.ts:99–103`: el controlador genérico `seleccionar(t)` llama `deps.alElegir(t)`, limpia el texto y **SIEMPRE** emite `«producto» añadido.`, incluso cuando el backend/estado UI rechazó la línea. `page.tsx:461` muestra ese éxito en `role=status`.
- Esto ocurre en la búsqueda rápida por selección de resultado, opción con Enter y búsqueda directa asíncrona por código/GTIN. **El selector avanzado ya usa la comparación contra ALTA_BLOQUEADA y NO tiene este error.**
- La suite PRO341-10/11/12 es un MODELO de rechazo, no test del controlador real. El error es comprobable por fuente y todavía NO probado en navegador.

## 2. Implementar el contrato real de resultado, con mínimo cambio

1. Leer COMPLETOS y MÁS RECIENTES los archivos de la branch, **UNO A LA VEZ**, antes de analizar o editar: `lib/facturacion/busqueda-rapida.ts`, `app/(private)/facturas/nueva/page.tsx`, `lib/facturacion/limite-lineas.ts`, las suites vigentes de búsqueda/facturación y `scripts/casos-clientes/run.js` si procede. Leer `CLAUDE.md`, protocolo IA e informe R01.
2. Establecer un contrato explícito (tipado y estable) para el callback `alElegir` que **propague el resultado efectivo de la inclusión** desde `agregar`/ `agregarRapido` hasta el controlador de selección, sin interpretar `ALTA_BLOQUEADA` como éxito por ser un número distinto de cero. La rama exitosa incluye alta NUEVA y SKU existente incrementado (sin crear otra línea). Rechazo significa **NO añadido**.
3. `crearBuscadorRapido.seleccionar(t)` debe anunciar `«…» añadido.` SOLO con resultado confirmado como aceptado. Cuando sea rechazo: mostrar aviso correcto en español de **máximo actual por empresa** (idealmente el existente `mensajeAltaBloqueada(maxLineasFE)`), sin ningún estado de éxito contradictorio, accesible para `role=alert` y sin abrir panel fiscal ni enfocar Cantidad. Mantener buscador utilizable y su campo de texto/estado consistente; se puede decidir si se limpia el código tras bloqueo, pero **nunca** anunciar éxito falso. Evitar dos mensajes distintos que contradigan la misma acción.
4. `BuscadorRapido` es GENÉRICO y se usa también para **clientes y vendedores**. Los callbacks `void` existentes no deben convertirse accidentalmente en rechazos ni perder selección. Si se introduce resultado opcional discriminado o función especializada para productos, garantizar compatibilidad retroactiva y no alterar búsqueda, identidad, otras pantallas ni permisos.
5. Asegurar consistencia por todos los caminos: clic en opción vigente, Enter con opción destacada, Enter mediante búsqueda directa asíncrona, resultados tardíos cancelados/invalidados por escritura/blur, código/GTIN con ceros iniciales. Mantener el control `tokenLista/tokenDirecta`, `mantenerAbierto`, permisos y productos deshabilitados sin cambios.
6. **Preservar íntegramente PRO-341-R01 ya conforme**: `.codigoProducto` sin ellipsis y Producto ancho mínimo desktop; foco y selección en Cantidad tras alta aceptada, SKU repetido, 4 filas visibles y scroll vertical desde quinta; foco obligatorio del panel fiscal; selector avanzado dentro de modal; no robar foco manual; decisión atómica y claves de PRO-339-R02. No tocar CSS salvo razón técnica demostrada; no rediseñar control ni añadir atajos/retorno automático al lector.
7. No modificar backend, API, `empresas.fe_max_lineas`, migración NEX-078, `MAX_LINEAS=999`, stock, IVA, importe, descuentos, serie, KuDE, NCE, SIFEN, PRO-338, PRO-333/334 ni contratos fiscales. No crear pantalla PRO-340.

## 3. Casos dirigidos a ESCRIBIR, NO ejecutar

**Prioridad:** ampliar `lib/facturacion/codigo-foco-pro341.casos.ts` y/o crear suite focal de `crearBuscadorRapido` que ejercite el **controlador REAL con dependencias simuladas**, además de comprobar la integración de `agregarRapido` (sin requerir navegador real). No bastan otro modelo independiente ni una única regex que verifique la presencia de `ALTA_BLOQUEADA`.

Escribir, identificar y dejar SIN EJECUTAR al menos:
- Cupo agotado en empresa A=21, B=63 y C=99, un SKU NUEVO: controlador recibe rechazo, no emite `añadido`, no crea fila ni cambia Cantidad, aviso correcto y foco permanece o vuelve al buscador.
- Mismo SKU en factura llena: incremento permitido, resultado aceptado y éxito solo entonces; foco a Cantidad de fila existente.
- Dos selecciones en un mismo ciclo con 1 cupo: una aceptada y la otra bloqueada; **la segunda no presenta éxito**. Con 2 cupos: ambas aceptadas y claves únicas.
- Tres caminos de selección (clic, Enter resaltado, Enter que hace llamada directa async): mismo contrato de resultado; invalidación de petición antigua, cambio de texto/blur/Escape conservados. Ceros iniciales y GTIN siguen funcionales.
- Cliente y vendedor genéricos con callback sin retorno: se seleccionan como ANTES, sin cambio involuntario de UX.
- Nuevo SKU aceptado enfoca Cantidad y selecciona valor; fiscal pendiente mantiene su panel; selector avanzado conserva feedback propio y foco modal.
- Confirmar que ningún caso PRO331/E01/PRO339/PRO341 previo queda obsoleto. Registrar nueva suite en runner solo si resulta necesario; no ejecutarlo.

## 4. Entrega, parada y gates

**PROHIBIDO EJECUTAR:** tests, casos fuente/runner, lint, typecheck, build, CI manual, SQL/migrations, PostgreSQL, VM/Docker, gateway, navegador productivo o deploy.

Publicar commit + push en branch autorizada. Informar **SHA COMPLETO**, paths modificados, naturaleza del cambio (sin funcionalidades eliminadas), casos nuevos/corregidos **NINGUNO EJECUTADO**, limitaciones de comprobación real. **PARAR inmediatamente para auditoría independiente ChatGPT PRO-341-R02.** NO iniciar PRO-340 ni ninguna otra tarea.

**GATE DE PRODUCCIÓN P0 INDEPENDIENTE:** NEX-078 aún no aplicada. Activar esta versión con PRO-339 antes de aplicar/verificar la columna provoca **HTTP 422 en TODA FE nueva**. Aplicación de migration, backup, preflight, pruebas reales y deploy requieren autorización explícita separada. Esta orden no la concede.
