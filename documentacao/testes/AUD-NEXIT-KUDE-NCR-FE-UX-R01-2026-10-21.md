# AUD-NEXIT-KUDE-NCR-FE-UX-R01 — KuDE NCR + Nueva factura premium

**Fecha:** 21/10/2026  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Commits funcionales inspeccionados:** KuDE `1c37e526b4ed156dda513ecb2263348c64762346`; interfaz `620ea83d3eb6be24201fd9a3044acdaa4a479a6b` (HEAD auditado).  
**Fuentes vinculantes:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, `documentacao/definicoes/INC-NEXIT-NCE-KUDE-GATEWAY-2026-10-21.md`, `documentacao/definicoes/REQ-NEXIT-FE-DESKTOP-UX-PREMIUM-2026-10-21.md` y reglas de KuDE actualizadas con la evidencia del Postman.

## Método y limitaciones

Auditoría independiente de commits/diff y archivos reales en GitHub: `lib/facturacion/gateway.ts`, `lib/facturacion/kude.casos.ts`, `app/(private)/facturas/nueva/page.tsx`, `page.module.css`, `medios-pago.tsx`, `lib/facturacion/flujo-factura.ts`, `flujo-factura-ux.casos.ts`, `pagos.casos.ts` y contratos de cálculo/pagos/KuDE relacionados. Los resultados de tests informados por Claude son **declarados y no reejecutados independientemente**. No se usaron navegador, gateway real, VM, PostgreSQL, Docker, migrations ni deploy. Las capturas aportadas en ChatGPT no fueron incorporadas al repositorio.

## Matriz de requisitos, implementación y evidencia

| Criterio | Evidencia del código y tests | Resultado |
|---|---|---|
| KuDE NCR: body POST específico | `cuerpoKudeGateway` produce `tipOpe:"4"`, `dEst`, `dPunExp`, `dNumDoc`, `dSerieNum`, `tipoDoc:"ncr"`; `obtenerKudeGateway` consume el helper; test `NCR-02/03` ejecuta helper y orquestación real con gateway simulado | CONFORME ESTÁTICO |
| KuDE FE sin regresión | Rama FE del helper conserva cinco campos y `tipoDoc:"FE"`, sin `tipOpe`; pruebas dirigidas | CONFORME ESTÁTICO |
| CDC/PDF, emisor, empresa/sucursal y token | La nueva transformación no altera `interpretarKude`, `cdcCoherente`, aislamiento o validación de emisor previa; pruebas reportadas cubren errores | CONFORME ESTÁTICO; gateway real no verificado |
| FE: pago después del cliente y detalle | Sección `sec-pago` después de `sec-detalle`; sin cliente/ítems se muestra guía y no se monta `MediosPago` | CONFORME PARCIAL; F-001 |
| FE: descuento inválido no habilita pago | `page.tsx:627` evalúa solamente `lineasValidas` (cantidad/precio) y `calculo.total > 0`; `resumenCalculo` devuelve además `completo` y `erroresDescuento` | NO CONFORME; F-001 |
| FE: tabla compacta | Controles de 30px, `line-clamp:2`, código/GTIN en línea secundaria, edición fiscal/IVA/cantidad/precio/descuento/subtotal/acciones intactos | CONFORME ESTÁTICO; dimensiones reales NO VERIFICADAS |
| FE: modal de revisión premium | Estructura por grupos, scroll del cuerpo, scroll independiente de productos, totales destacados, stock expandible, footer fuera de scroll | CONFORME ESTÁTICO; accesibilidad F-002 |
| FE: teclado y foco del diálogo | `modalResumen` tiene `role=dialog` / `aria-modal` pero no foco inicial ni ciclo Tab ni Escape ni retorno de foco (en contraste con `confirmacion` que sí los implementa). La sección `workspace` se marca inert; no se transfiere foco explícitamente al nuevo diálogo | NO CONFORME; F-002 |
| Importes, huella y emisión | La revisión consume `resumen` del servidor, y conserva el flujo `flujo.revisar`/ `flujo.enviar` y `huellaActual`; no se modificaron los motores fiscales, inventario o payload | CONFORME ESTÁTICO; operación real NO VERIFICADA |

## Hallazgos abiertos

### F-001 — MEDIA — Forma de pago habilitada pese a error fiscal de descuento

**Localización:** `app/(private)/facturas/nueva/page.tsx`, cálculo de `pagoFlujo` alrededor de la línea 627 y `lib/facturacion/flujo-factura.ts`.  
**Evidencia:** `lineasValidas` incluye solo `cantidadValida` y `precioValido`; `pagoFlujo` se habilita si hay cliente, líneas y `calculo.total > 0`. En cambio `resumenCalculo` puede retornar `erroresDescuento` y `completo=false` con total positivo: `resolverDescuentos` registra descuentos mayores o iguales a 100% / mayores o iguales al precio.  
**Impacto:** habilita una elección de pago y muestra importes sobre una factura aún inválida por descuento; contradice el requisito de no habilitar pago sin ítems válidos/cálculo correcto. La emisión sigue separadamente bloqueada por `faltan`, por lo que NO se ha demostrado emisión fiscal inválida.  
**Corrección esperada:** incluir `calculo.completo` y la ausencia de `erroresDescuento` en `disponibilidadPago`/sus entradas, manteniendo el flujo de Contado/Crédito intacto. Probar 150% de descuento sobre producto válido, descuento particular de monto >= precio, descuento general inválido; una vez corregido, se habilita sin reset indebido.

### F-002 — MEDIA — Diálogo de revisión sin gestión del foco/teclado

**Localización:** `app/(private)/facturas/nueva/page.tsx`, modal `modalResumen` alrededor de las líneas 1328–1453.  
**Evidencia:** nuevo modal `role=dialog aria-modal=true` sin `ref`, asignación de foco inicial, interceptación de Tab, Escape o restauración de foco. El mismo componente tiene controles de foco para el diálogo de confirmación de moneda/condición, pero no para `Resumen de la factura`. `workspace` pasa a `inert` cuando `resumen !== null`.  
**Impacto:** navegación por teclado no tiene foco garantizado dentro del diálogo de revisión y no dispone de cierre Escape; los usuarios de teclado/tecnologías asistivas pueden quedar con el foco previo en región inerte. Contradice el CA de accesibilidad básica del resumen.  
**Corrección esperada:** usar el menor patrón compatible con React/Next existente que traslade foco inicial a la modal, mantenga Tab/Shift+Tab dentro de la modal, permita Escape como «Volver a editar» siempre que no haya envío en curso, y devuelva foco al control que abrió revisión cuando se cierre. No modificar lógica de envío ni permitir doble emisión. Pruebas dirigidas sobre manejo de foco/estado; validación visual/teclado real por el responsable.

## Veredicto R01

**KuDE NCR: APROBACIÓN TÉCNICA ESTÁTICA PARCIAL**, con los contratos de FE/NCR correctos en el código. El HTTP 200 en Postman confirma un contrato externo concreto, **no demuestra que la VM actual esté actualizada, ni que el gateway autentique por la misma configuración, ni que pase el control de emisor/CDC en el ambiente real**. No confundir PDF visible con aprobación del SIFEN; el certificado expirado es un incidente fiscal separado.

**UX FE: CORRECCIÓN SOLICITADA** para F-001 y F-002. No aprobar globalmente la entrega de UX por ahora; el diseño real del browser sigue NO VERIFICADO.

**Próximo gate único:** Claude corrige solo F-001/F-002, tests focales y push; ChatGPT audita la R02. No VM, SQL, migrations, deploy ni nuevos menús. No editar este AUD ni marcar Done/Homologado.
