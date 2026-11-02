# AUD-NEXIT-CASA-MINGO-E03-R01 — Descuentos por línea y generales en FE

**Auditoría realizada:** 21/10/2026
**Commit funcional:** `684768a1e98235ed6f98f2bc3681b5f6fa2a0807`
**Alcance:** E03, PRO-124 / PRO-200, `descuentos.ts`, `calculo.ts`, `payload-fe.ts`, `emision.ts`, `facturas/nueva/page.tsx`, test `descuentos-e03`, regresiones de moneda y stock.
**Normativa verificada:** MT SIFEN v150 y NT 001 oficial (14/10/2019): https://www.dnit.gov.py/documents/20123/420595/NT_E_KUATIA_001_MT_V150.pdf/c4d2ab8e-632b-dc8f-d3f6-6a144a3a3d9c

## Veredicto
**E03-R01 — CORRECCIÓN PUNTUAL EXIGIDA, sin homologación ni despliegue.**

- **F-001 MEDIA:** al cambiar la moneda, `cambiarMoneda` limpia precios/pagos/crédito, pero **NO reinicia los descuentos en modalidad MONTO** (ni por línea ni global) ni los incluye en las pérdidas por confirmar. El operador puede cargar descuento monetario en PYG, cambiar a USD/BRL y el sistema conservar el número original como valor en la moneda nueva. Es una alteración de importe económico sin conversión ni consentimiento, incompatible con la política explícita de cambios de moneda y el texto de confirmación `nada se convierte automáticamente`. Un descuento en porcentaje sí puede preservarse, porque es adimensional.
- No se identificó un defecto de las fórmulas centrales en revisión estática. **No iniciar E04 hasta nueva auditoría E03-R02**. E02/NEX-067 sigue no aplicada y no homologada.

## Matriz RN/CA → código → evidencia → resultado

| RN / criterio | Código | Evaluación |
|---|---|---|
| Descuento particular por unidad `dDescItem` (EA002) y porcentaje `dPorcDesIt` (EA003) | `descuentos.ts` líneas 73-91 y `payload-fe.ts` `Detalles` | Conforme estaticamente a MT; importe se interpreta por UNIDAD y se rotula así en UI |
| Descuento global F010 y EA004 por ítem | `descuentos.ts` líneas 93-149; NT 001 EA004=[F010*E721/100], tolerancia 0,8 | Conforme estáticamente para modo %, modo MONTO tiene conversión y conciliación exacta adicional de proyecto (sin homologación del proveedor) |
| F009/F033/F011 multiplicados por cantidad | `calculo.ts` líneas 87-111 | Conforme NT 001 |
| F014 = F008-F013+F025 con F013=0 | `calculo.ts` `dTotOpe=dTotGralOpe=total` | Conforme para operaciones sin redondeo/comisión |
| IVA sobre descuentos netos | `calculo.ts` líneas 66-77 | Conforme estáticamente |
| Misma fuente de verdad pantalla/servidor/payload | `payload-fe.ts` `calcularFE`, `validarEntradaFE`, `construirPayloadFE`, `resumenCalculo` | Conforme |
| Stock no descuenta importe sino cantidad | `emision.ts` construye `lineasStock` con cantidades originales | Preservado |
| Sin descuento mantener JSON anterior | `payload-fe.ts`: campos EA solo cuando `descuentos.hay`; subtotales base conservados | Conforme en estructura, byte a byte solo afirmación del desarrollador |
| Revisar incluye descuentos e impide inválidos | `facturas/nueva/page.tsx` `calculo.erroresDescuento`; modal `resumen.descuentos` | Conforme estáticamente, navegador no ejecutado |
| Cambio de moneda elimina importes de moneda antigua | `page.tsx` `cambiarMoneda` y `pedirMoneda`/ `cambios-formulario.ts` | **F-001 MEDIA** |

## F-001 — Descuento monetario preservado incorrectamente entre monedas

**Prueba por lectura de código:**
- `app/(private)/facturas/nueva/page.tsx` aproximadamente líneas 718-727, `cambiarMoneda(m)`: ejecuta `setMoneda`, `setCambio`, `setLineas(... precio...)`, `setPagos`, `setCredito`, `limpiarRevision`. **No modifica `lineas[].descuento` ni `descuentoGeneral`**.
- Misma pantalla líneas ~744-748, `pedirMoneda(m,...)`: llama `perdidasAlCambiarMoneda` con precios, pagos, crédito y cambio, pero no los descuentos.
- `lib/facturacion/cambios-formulario.ts`: `perdidasAlCambiarMoneda` no recibe ni revisa los descuentos de la E03.
- Luego `aLineaFE` y `resumenCalculo` usan el texto de descuento monetario guardado bajo la nueva `moneda` y `cuerpoFactura` lo envía al servidor sin conversión ni nuevo consentimiento.

**Caso de aceptación:** una factura inicialmente PYG con descuento particular `MONTO: 2000` y global `MONTO: 1000`. El operador elige USD. El diálogo debe advertir que se perderán ambos descuentos en moneda anterior; «Cancelar» conserva todo; «Confirmar» deja ambos `MONTO` sin valor y reinicia precio/pagos/crédito conforme reglas previas. Si un descuento es `PORCENTAJE: 10`, puede permanecer `10%` tras cambiar moneda; no conservar ni reinterpretar como monto. Probar USD→BRL y volver a PYG. No auto-convertir importes.
  
**Corrección mínima permitida:**
1. Restablecer `DESC_VACIO` (o `MONTO` con `valor:""`, según UX estable) **solo** para descuentos de modo `MONTO` con valor al cambiar moneda, preservando los porcentajes.
2. Extender el contrato de `perdidasAlCambiarMoneda` para avisar claramente cuántos importes por línea y si el importe global se descartarán; si hay importes MONTO, debe solicitarse confirmación aunque los precios/pagos/credito no cambien.
3. Cobertura dirigida de confirmación/Cancelación, porcentaje preservado, descuento particular y global MONTO descartados y cambios entre PYG/USD/BRL, además de las regresiones pertinentes de `monedas`, `descuentos-e03` y `revision-factura`. Mantener FAT-D02 invalidación de revisión anterior.
4. **No tocar** fórmulas fiscales EA/F, stock E02, NEX-067, NCE, KuDE, gateway, banco o API.

## Observaciones no bloqueantes

- En el modo `MONTO` por línea, la UI rotula expresamente `por unidad` y aplica `cantidad × descuento unitario`, consistente con EA002 del MT. El requisito original dice «por ítem/línea» sin establecer expresamente importe total de línea; esta auditoría no cambia esa interpretación sin decisión comercial nueva. La pantalla debe seguir aclarando lo que se multiplicará por cantidad.
- El global `MONTO` usa una resolución exacta hasta 4 decimales de descuento unitario para aproximar F010, rechazando combinaciones no representables y controlando tolerancia 0,8. Ese algoritmo y su aceptación normativa deberán comprobarse en gateway/SIFEN real; el MT no define explícitamente el control de entrada monetaria global.
- En `payload-fe.ts` persiste el comentario histórico `sin descuentos` de una versión anterior, aunque ahora hay E03; es documentación obsoleta menor, no bloquear por ello.
- La prueba «barrido 400 casos» en `descuentos-e03.casos.ts` es del código puro; servidor y stock usan mocks, y las aserciones de UI verifican estructura, no DOM ni proveedor. No equivale a validación SIFEN.

## Testes / límites

**Reportados por Claude (NO reejecutados por auditor):** `descuentos-e03` 34/0; facturacion 271, ajuste-fiscal 41, fat-e2 44, monedas 84, credito 91, pagos 77, rediseno 90, revision-factura 42, cantidad-e01 16, stock-e02 61, visual-v1 29, nce 205, kude 96, buscador-rapido 40, todos 0 fallos; TypeScript y ESLint focales informados limpios.

Auditor revisó commit/diff y código, documentación normativa pública, protocolos y progreso del Git. No ejecutó tests, SQL, VM, navegador, gateway, SIFEN ni migraciones.

## Gate E03-R02

Corregir **solo F-001**, reportar nuevo SHA y test focal, actualizar progreso una sola vez y detenerse para auditoría R02. **NO iniciar E04** ni declarar E03 Done/Homologada. No aplicar NEX-067 en VM.
