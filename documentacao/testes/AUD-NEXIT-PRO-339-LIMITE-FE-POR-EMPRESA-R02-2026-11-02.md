# AUDITORÍA INDEPENDIENTE — PRO-339-R02 / Alta atómica de líneas FE

**Fecha:** 02/11/2026  
**SHA auditado:** [641adbdf96c48009ffea12e781fa02ff98b68308](https://github.com/proceit-tech/distribuidora/commit/641adbdf96c48009ffea12e781fa02ff98b68308)  
**Issue:** [Linear PRO-339](https://linear.app/proceit/issue/PRO-339) · [GitHub #16](https://github.com/proceit-tech/distribuidora/issues/16)  
**Origen:** [AUD PRO-339-R01](AUD-NEXIT-PRO-339-LIMITE-FE-POR-EMPRESA-R01-2026-11-02.md), hallazgo R01-F001.  
**VEREDICTO:** **CONFORME ESTÁTICAMENTE R02**. El defecto R01-F001 queda corregido a nivel de código; no se encontró motivo demostrado para R03. **NO ES HOMOLOGACIÓN OPERATIVA** ni autorización de tests, migración, producción o PRO-340.

## 1. Alcance y casos escritos

El SHA R02 modifica **exactamente tres archivos**:
1. `app/(private)/facturas/nueva/page.tsx` (estado de líneas y alta de productos).
2. `lib/facturacion/limite-lineas.casos.ts` (casos PRO339-70..86 y actualización del caso 63).
3. `scripts/casos-clientes/run.js` (texto descriptivo de la suite, sin cambiar el runner de ejecución).

Los **17 casos R02** están escritos, NO ejecutados. En conjunto, los casos **PRO339-01..86** figuran sin saltos: **86 casos escritos y 0 ejecutados**. Los escenarios 70..76 ejercitan **un modelo autónomo de la regla** y 77..86 inspeccionan el código fuente actual; **NO son tests de componente React en navegador real**. No se ejecutó test, runner, lint, typecheck, build, CI manual, SQL, PostgreSQL, VM, Docker, navegador de cliente, gateway ni deploy.

## 2. R01-F001 — CORREGIDO ESTÁTICAMENTE

`page.tsx:620–637`: se mantiene `lineas` como estado React para render; un `useRef<Linea[]>([])` denominado `lineasActuales` conserva **sincronizadamente** el borrador efectivo; `claveSiguiente` conserva próxima identidad visual. El único escritor de `lineas` es `aplicarLineas`, el cual calcula de la referencia actual, actualiza inmediatamente la referencia y luego llama `setLineas(nuevas)` **con un valor**, sin ejecutar foco, avisos, paneles ni otro efecto dentro del actualizador de React. Los handlers ven las altas anteriores incluso antes del siguiente render.

`page.tsx:889–934`: `agregar(p, origen)` consulta `lineasActuales.current`, verifica SKU existente antes del cupo. Para SKU existente, incrementa cantidad por `aplicarLineas` sin crear fila; devuelve la clave previa. Para SKU nuevo, valida el cupo contra el mismo estado vigente. Si no cabe, muestra aviso, cancela foco de cantidad, devuelve `ALTA_BLOQUEADA` y sale **antes de reservar clave, añadir línea, abrir editor fiscal o anunciar éxito**. Si cabe, toma `claveSiguiente.current` y lo incrementa inmediatamente, añade mediante `aplicarLineas` y solo entonces prepara foco/panel y devuelve clave real. No existe intercalado asíncrono entre la verificación del cupo y la escritura sincrónica en la referencia dentro del mismo evento JS; `agregarSiCabe` vuelve a comprobar sobre esa misma referencia. Por tanto, no se observó un camino de resultado exitoso sin fila, ni dos filas nuevas que reciban clave duplicada en el flujo examinado.

`page.tsx:938–939,1038–1045,1090,1497`: edición de cantidades/precios/descuentos, ajustes fiscales, conversión de moneda, reset de factura y eliminación de línea pasan también por `aplicarLineas`, para no dejar la ref desactualizada. El contador y el cuerpo enviado siguen usando `lineas` de la renderización confirmada; la validación en servidor impide emisión fuera de cupo.

**Escenarios estructurales/modelo R02:** 1 lugar/2 SKU distintos (uno entra y otro bloqueado); 2 lugares/2 SKU distintos (claves distintas); mismo SKU dos veces antes de re-render; mismo SKU cuando límite ya alcanzado; quitar/reagregar; mezcla buscador/selector; máximo desconocido; feedback correcto, focus y panel solo para inserciones aceptadas; ausencia de efectos dentro del updater. Todos **SIN ejecución**; React real/Strict Mode/lector requieren homologación.

**Preservado:** `NEX-078`, `empresas.fe_max_lineas` (NULL=999, rango 1..999), sesión `empresaId`, `prepararFactura` (previa y emisión), `MAX_LINEAS=999` fiscal, 4 filas visibles + scroll PRO-331, PRO-333, PRO-334, SIFEN PRO-338, NCE, KuDE, idempotencia histórica, stock y cálculos. No hay cambios en APIs, SQL, migraciones, certificados ni entorno.

## 3. Condiciones críticas de activación (sin levantar)

**NEX-078 todavía no aplicada.** La validación `limiteLineasEmpresa` comprueba la presencia de `empresas.fe_max_lineas`; si falta la columna, `prepararFactura` devuelve **HTTP 422 para toda FE nueva** (incluida la previa), aun si la empresa no tiene un límite configurado. Se diseñó para fallar cerrado; evita una elusión silenciosa pero es **riesgo operativo P0 de despliegue incompleto**.

La habilitación de este código exige: verificar backup, esquema/migrations y rol; ejecutar preflight SOLO por responsable autorizado, aplicar y comprobar NEX-078 **ANTES de activar versión dependiente** (o en una ventana coordinada sin exponer usuarios a la app nueva sin schema), verificar después el máximo 999 con NULL; no presumir que CASA MINGO tenga 21 configurado, pues la migration no establece límite a ninguna empresa. La asignación concreta a una empresa, si se desea 21/63/99, requiere operación administrativa futura autorizada; la pantalla admin se planifica en PRO-340.

Además sigue pendiente ejecutar casos reales y homologar en navegador la UI con dos escaneos rápidos, stock, foco, 1/2 cupos disponibles, doble SKU, borrado, 422 backend, dos empresas y comportamiento de React Strict Mode, así como comprobar que el cambio de política sea revalidado. Un modelo sin React y aserciones del texto fuente **NO demuestran esas situaciones en runtime**.

## 4. Decisión de secuencia

- **PRO-339-R02: CONFORME ESTÁTICAMENTE**. No solicitar R03 con la evidencia del diff; la PRO-339 permanece **In Review**, **no Done ni desplegada**.
- **PRO-340 (pantalla de administración): permanece TODO/Backlog, NO se autoriza automáticamente** por cerrar el correctivo; requiere orden separada y decisión del responsable.
- No ejecutar pruebas, SQL/migrations, Docker/VM, gateway, browser del cliente o deployment desde esta auditoría. Revisión operativa de NEX-078 deberá planificarse aparte y con autorización explícita.
