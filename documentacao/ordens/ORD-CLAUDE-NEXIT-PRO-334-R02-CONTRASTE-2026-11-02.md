# ORDEN CLAUDE — PRO-334-R02 / Corrección localizada de contraste AA

**Referencia funcional:** `b0381d77ee68eaefb764ffcc062a001e85f4135b` · **Linear:** [PRO-334](https://linear.app/proceit/issue/PRO-334) · **GitHub:** [#15](https://github.com/proceit-tech/distribuidora/issues/15)  
**Auditoría vinculante:** [AUD PRO-334-R01](../testes/AUD-NEXIT-PRO-334-COLORES-FE-NCE-R01-2026-11-02.md)  
**Estado:** ÚNICA orden activa; **PRO-339 sigue bloqueada**.

Leer completamente `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, el informe R01 y los archivos ACTUALES uno por vez. No confiar en snapshots viejos.

## ÚNICO DEFECTO AUTORIZADO — R01-F001

Las filas FE (azul normal `#f4f8fd`, hover `#e9f1fb`) y NCE (amarillo normal `#fffcee`, hover `#fdf6da`) conservan texto de metadatos `.cell span` `#6f8498` con contraste **3.40–3.76:1**, inferior a AA 4.5. Las etiquetas `.muted` `#8092a4` del detalle (`#f9fbfe`/`#fffdf5`) ofrecen ~3.09/3.14:1. El caso `PRO334-18b` es incorrecto: tolera una pérdida relativa de 0.5 respecto a blanco, pero el contraste inicial sobre blanco tampoco llega a 4.5.

### Hacer SOLO lo siguiente

- En **`app/(private)/documentos/page.module.css`**, establecer color de texto secundario legible con reglas **localizadas** que ganen en especificidad a los estilos heredados `.cell span` y `.muted` SOLO dentro de FE/NCE y del detalle FE/NCE. Evitar aplicar el nuevo color indiscriminadamente a todos los `span` o `td`: conservar etiquetas de tipo `.tipoFE/.tipoNCE`, estados fiscales PRO-338 y alertas técnicas. Se permite un tono oscuro neutro como `#53687a` si verifica AA en los seis fondos, normal/hover y detalle.
- En **`lib/facturacion/colores-tipo-documentos.casos.ts`**, sustituir `PRO334-18b` por exigencia de contraste absoluto **>=4.5:1**, no diferencia relativa; cubrir metadatos de FE/NCE, hover/focus y `.muted` en detalle, usando colores efectivamente declarados y selectores reales. Escribir casos sin ejecutarlos. Mantener las comprobaciones ya existentes que sean válidas.
- No tocar `page.tsx`, salvo prueba clara de que CSS local no puede resolver el defecto, en cuyo caso explicar primero alcance mínimo. No tocar CSS global `components/ui/lista-padrao/lista.module.css`, otras páginas ni la lógica que ya aprobó R01.
- No alterar fondos y acentos FE azul/NCE amarillo, hover/focus, `forced-colors`, KuDE, CDC, estado SIFEN, alertas, consulta automática/manual, orden PRO-333, historial, emisión, stock, NCE ni `MAX_LINEAS=999`.

### Entrega y parada

Cero ejecución de tests, runner, lint, typecheck, build, CI, SQL/migrations/PostgreSQL, VM/Docker, gateway, navegador productivo o deploy.

Leer archivos completos **uno por vez**, cambios mínimos, casos fuente sin ejecutar. Publicar commit+push en `feature/NEXIT-2026-001-banco-demo`; reportar SHA completo, paths modificados, contraste mínimo calculado, casos escritos (ninguno ejecutado), y **PARAR para auditoría independiente ChatGPT PRO-334-R02**. No iniciar PRO-339 automáticamente ni declarar `Done`/homologado.
