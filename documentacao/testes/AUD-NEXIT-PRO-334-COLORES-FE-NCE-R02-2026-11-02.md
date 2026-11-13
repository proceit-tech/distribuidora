# AUDITORÍA INDEPENDIENTE — PRO-334-R02 / Contraste AA en documentos FE/NCE

**Fecha:** 02/11/2026  
**Commit auditado:** [33b2cd52637fb34699da53e263877ebd18c5dc06](https://github.com/proceit-tech/distribuidora/commit/33b2cd52637fb34699da53e263877ebd18c5dc06)  
**Linear:** [PRO-334](https://linear.app/proceit/issue/PRO-334) · **GitHub:** [#15](https://github.com/proceit-tech/distribuidora/issues/15)  
**Auditor:** ChatGPT — revisión estática independiente del diff, CSS, JSX vigente y cálculo matemático del contraste, sin ejecutar tests ni navegador.  
**VEREDICTO: CONFORME ESTÁTICAMENTE R02; R01-F001 CERRADO EN CÓDIGO.** La homologación visual, pruebas y deployment siguen pendientes; PRO-334 permanece `In Review`, NO `Done`.

## 1. Alcance exacto

Se modifican **2 archivos**:
1. `app/(private)/documentos/page.module.css` — regla local de color secundario.
2. `lib/facturacion/colores-tipo-documentos.casos.ts` — sustitución de PRO334-18b por umbral WCAG absoluto, nuevos PRO334-25..30.

Los **25 casos anteriores + 6 nuevos = 31 verificaciones** (contando el subcaso `PRO334-18b`, nomenclatura 01..30 + 18b). Ninguno se ejecutó; la suite sigue registrada en `scripts/casos-clientes/run.js` por el commit original, pero **ese runner no se modificó ni ejecutó en R02**.

## 2. R01-F001 — CORREGIDO ESTÁTICAMENTE

**CSS vigente:** `page.module.css:277–282` asigna `color:#53687a` a metadatos directos de las columnas **Documento** y **Cliente** en las filas FE/NCE y a `dt`, `small` y párrafos informativos sin `role` en el detalle desplegado FE/NCE. El selector local prevalece frente a `.cell span {color:#6f8498}` y `.muted {color:#8092a4}` globales por especificidad. No altera `components/ui/lista-padrao/lista.module.css`, que sigue igual.

**Importante:** el `<span>` interior que etiqueta `Factura electrónica` / `Nota de crédito` conserva sus reglas de color explícitas `.filaFE .tipoFE` / `.filaNCE .tipoNCE`. La celda **Estados** (5ª) no está en la regla de metadatos; los badges fiscales, las alertas CDC, e-mail, envío y botones mantienen colores propios. En detalle, los `p[role="alert"]` quedan fuera del selector de `p`; los textos de metadatos visibles se oscurecen correctamente. No se cambió JSX, SQL, filtros, emisión ni estilos globales.

**Contraste WCAG calculado independientemente con luminancia relativa sRGB:**

| Elemento | Fondo | Texto | Contraste |
| --- | --- | --- | ---: |
| FE normal | `#f4f8fd` | `#53687a` | **5.43:1** |
| FE hover/focus | `#e9f1fb` | `#53687a` | **5.08:1** |
| NCE normal | `#fffcee` | `#53687a` | **5.62:1** |
| NCE hover/focus | `#fdf6da` | `#53687a` | **5.34:1** |
| Detalle FE | `#f9fbfe` | `#53687a` | **5.58:1** |
| Detalle NCE | `#fffdf5` | `#53687a` | **5.68:1** |
| Tabla de historial en hover | `#f8fbfc` | `#53687a` | **5.57:1** |

**Mínimo = 5.08:1** (FE hover/foco), supera WCAG AA **4.5:1** para texto normal en las superficies introducidas por PRO-334. No significa un certificado WCAG global para toda la pantalla.

**Pruebas fuente:** PRO334-18b ahora exige contraste absoluto `>=4.5` de los fondos del tipo y del historial; PRO334-25..30 examinan el mínimo, valores heredados, selectores de columnas 1 y 3, preservación de las etiquetas de tipo, estructura del detalle y paleta original. Estos casos **no fueron ejecutados ni reemplazan inspección de estilos computados en navegador**.

## 3. Invariantes confirmadas

- FE sigue en azul suave y NCE amarillo claro, en fila principal/hover/detalle y con acento lateral; identificación por texto y estilo `forced-colors` mantienen su semántica.
- La modificación no toca estados fiscales SIFEN PRO-338, alerta independiente `CDC_DIVERGENTE`, KuDE (inclusive sin CDC/rechazado), consultas automáticas/manuales, historial, orden numérico PRO-333, paginación, stock, emisión ni NCE.
- No se modifica `MAX_LINEAS=999`; la propuesta condicional de 21 corresponde solamente a PRO-339 y requiere **política por empresa real**, no límite global.

## 4. Restricciones y decisión

**R02 conforme EN CÓDIGO**; no solicitar R03 para R01-F001. **PRO-334 queda en estado `In Review`**, pendiente de homologación visual en la pantalla real con FE/NCE, hover/foco, contraste computado, lector de pantalla, viewport móvil, KuDE y estados fiscales, bajo autorización del responsable. Cero tests, lint, typecheck, build, SQL, PostgreSQL, VM, Docker, gateway, browser y deploy ejecutados.

**Autorización de secuencia:** abrir **solamente diagnóstico PRO-339** [GitHub #16](https://github.com/proceit-tech/distribuidora/issues/16) para inspeccionar las versiones completas de archivos pertinentes y el modelo de configuración por empresa. NO se autoriza todavía cambiar código, `MAX_LINEAS=999`, añadir migrations ni implementar hard-cap sin demostrar contrato/configuración por empresa y obtener la decisión explícita del responsable. Claude debe entregar un informe técnico de viabilidad con rutas exactas, dependencias, opciones seguras y propuesta mínima, y **PARAR** para revisión de ChatGPT antes de modificar funcionalidad. PRO-298/336 continúan dependientes del proveedor y PRO-338 de homologación/migrations.
