# AUDITORÍA INDEPENDIENTE — PRO-334-R01 / Color por tipo FE/NCE

**Fecha:** 02/11/2026  
**Commit auditado:** [b0381d77ee68eaefb764ffcc062a001e85f4135b](https://github.com/proceit-tech/distribuidora/commit/b0381d77ee68eaefb764ffcc062a001e85f4135b)  
**Linear:** [PRO-334](https://linear.app/proceit/issue/PRO-334) · **GitHub:** [#15](https://github.com/proceit-tech/distribuidora/issues/15)  
**Método:** inspección estática del diff, JSX y CSS reales y cálculo independiente de relación WCAG. Sin pruebas, navegador, lint, compilación, SQL ni despliegue.  
**VEREDICTO: R01 NO CONFORME — ÚNICO HALLAZGO DE CONTRASTE R01-F001.** No autorizar aún PRO-339 ni declarar homologación.

## 1. Alcance y conformidad

Commit modifica exactamente **4 archivos**:
1. `app/(private)/documentos/page.module.css` (fondos FE/NCE, hover, focus, detalle y forced-colors);
2. `app/(private)/documentos/page.tsx` (clases por tipo y etiquetas textuales);
3. `lib/facturacion/colores-tipo-documentos.casos.ts` (nuevo, **25** casos: 01..24 y 18b);
4. `scripts/casos-clientes/run.js` (registro en runner compartido).

**Conformes estáticamente:** FE azul suave (`#f4f8fd`), NCE amarillo claro (`#fffcee`), hover/focus diferenciados (`#e9f1fb`/`#fdf6da`), detalle expandido con tonos compatibles (`#f9fbfe`/`#fffdf5`), borde lateral no intrusivo `box-shadow inset`, etiqueta de tipo escrita en texto y con contraste suficiente. `forced-colors` separa bordes sólidos/discontinuos. Clases por tipo dependen exclusivamente de `d.tipo` y no de SIFEN. No se modificaron consultas SIFEN, estado fiscal, CDC, consulta automática/manual, KuDE, filtros, ordenación PRO-333, emisión, SQL ni NCE.

Los **25 casos están ESCRITOS pero NO EJECUTADOS**; quedaron registrados en el runner compartido. Las aserciones sobre CSS son estructurales, **no pruebas de navegador**.

## 2. Hallazgo R01-F001 — MEDIA, ACCESIBILIDAD (WCAG AA, texto normal)

**Origen y efecto comprobados:**
- `components/ui/lista-padrao/lista.module.css:448–451`: `.cell span { color:#6f8498; font-size:12.5px; }` es el estilo secundario previo. `page.tsx:529–537` muestra con ese estilo **sucursal, número/documento del receptor y texto de factura original** en filas nuevas con fondo de tipo.
- `lista.module.css:930`: `.muted { color:#8092a4; }`; `page.tsx:575–585` usa `ui.muted` para etiquetas explicativas `dt` y `small` en el detalle expandido con fondos nuevos.
- La nueva `page.module.css:202–225,233–240` aplica fondos FE/NCE también en hover/foco y detalle, pero no corrige localmente ese texto heredado.

Contraste calculado según luminancia relativa WCAG para texto normal:

| Texto | Fondo | Relación | AA 4.5:1 |
| --- | --- | ---: | --- |
| `#6f8498` | FE normal `#f4f8fd` | **3.63:1** | NO |
| `#6f8498` | FE hover/focus `#e9f1fb` | **3.40:1** | NO |
| `#6f8498` | NCE normal `#fffcee` | **3.76:1** | NO |
| `#6f8498` | NCE hover/focus `#fdf6da` | **3.57:1** | NO |
| `#8092a4` | Detalle FE `#f9fbfe` | **3.09:1** | NO |
| `#8092a4` | Detalle NCE `#fffdf5` | **3.14:1** | NO |

**Observación de alcance:** incluso sobre blanco los colores heredados ya presentan contraste inferior a 4.5:1 (`#6f8498` 3.87:1, `#8092a4` 3.20:1). No pedir un rediseño global de la librería ni de otras pantallas. La PRO-334 debe garantizar contraste AA **en los fondos que ella introduce** con sobrescrituras locales mínimas.

**Deficiencia de la propia prueba:** `colores-tipo-documentos.casos.ts` caso `PRO334-18b` únicamente tolera pérdida de contraste menor o igual a 0.5 respecto a blanco, aunque el punto de partida ya era inferior a 4.5. Esto permite aprobar texto ilegible. `PRO334-18` verifica texto principal `#234560` y etiquetas de tipo, **no** secundarios/metadata ni `ui.muted` del detalle.

### Orden correctiva R02 única

1. Corregir **solo el color del texto secundario en filas FE y NCE y las etiquetas secundarias del detalle expandido**, usando CSS local del módulo `Documentos electrónicos` y selectores exactos. No modificar `components/ui/lista-padrao/lista.module.css` compartido. Preservar fondos y acentos azules/amarillos, hover/focus, etiquetas FE/NCE y badges fiscales de PRO-338.
2. Cumplir **contraste medido >=4.5:1 en los 6 fondos** (fila normal y hover de FE/NCE, detalle FE/NCE). Como color ilustrativo para texto normal, **`#53687a`** tiene margen suficiente (peor caso cerca de **5.08:1** en hover FE), pero Claude debe inspeccionar y elegir la mínima adaptación CSS que no sobreescriba etiquetas con colores de tipo ni badges SIFEN. No convertir todos los `span` en ese tono; restringir a secundarios reales, por ejemplo directos bajo la `.cell` y `.muted` en detalle.
3. Corregir `PRO334-18b` para que exija un mínimo **absoluto de 4.5:1**, no «perder <=0.5», y añadir casos dirigidos con colores REALES extraídos del CSS para metadatos normales/hover y detalle; comprobar que selectores no alcanzan las cápsulas SIFEN, las etiquetas de tipo ni controles. No ejecutar los casos.
4. Mantener las otras 24 verificaciones o ajustar solo las imprescindibles para el cambio. No reescribir JSX, colores de fondos/acento, APIs, SQL, gateway, KuDE, orden PRO-333, emisión, stock, PRO-338 ni global. No introducir cambios fuera de F001.

**Gate:** PRO-334 permanece `In Review`, no `Done`/homologada; **PRO-339 no autorizada**. Sin pruebas, lint, typecheck, build, CI, SQL, migrations, PostgreSQL, Docker/VM, gateway ni deploy. Claude debe leer la versión completa y vigente de **un archivo a la vez**, commit+push con SHA completo y **PARAR para auditoría PRO-334-R02**.

## 3. Validación de cliente pendiente

Una corrección estática de contraste no sustituye navegador y dispositivos reales. En homologación autorizada comprobar en escritorio/móvil/zoom, hover/focus, FE/NCE con SIFEN aprobado/rechazado/pendiente, CDC_DIVERGENTE, KuDE y expansión. Hasta ese momento no declarar aplicado en CASA MINGO.
