# AUD-NEXIT-KUDE-NCR-FE-UX-R02 — Reauditoría de pago y foco del resumen

**Fecha:** 21/10/2026  
**Repositorio / branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`  
**Commit auditado:** `e4b9d99c72dd7934a746cf2c648c7bc2a9693efa`  
**Auditoría R01:** `documentacao/testes/AUD-NEXIT-KUDE-NCR-FE-UX-R01-2026-10-21.md`  
**Ámbito:** exclusivamente los dos hallazgos R01 (FE-UX-R01-01 y FE-UX-R01-02); verificar ausencia de cambios en KuDE NCR/FE.

## Alcance de la revisión independiente

Se confirmaron HEAD y diff del commit publicado y se leyeron `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, el requisito de UX premium, el AUD-R01, las partes pertinentes de `PROGRESSO-NEXIT-V1.md` y el código real afectado: `app/(private)/facturas/nueva/page.tsx`, `lib/facturacion/flujo-factura.ts`, `lib/facturacion/flujo-factura-ux.casos.ts`, así como las funciones productivas `resumenCalculo`, `resolverDescuentos` y `crearFlujoRevision`.

No se modificó código. No hubo navegador, VM, PostgreSQL, Docker, migraciones, deploy ni gateway real. **Los resultados 34/0, 77/0, 90/0, 271/0, 30/0, 42/0, 47/0, 91/0 y lint/TypeScript puntual son declarados por Claude, no reproducidos independientemente por el auditor.**

## R02 — Matriz de aceptación

| Hallazgo | Evidencia del código implementado | Dictamen |
|---|---|---|
| **FE-UX-R01-01**: pago habilitado con descuentos inválidos | `page.tsx` llama `disponibilidadPago` con `calculoValido: calculo.completo && calculo.erroresDescuento.length === 0`; `flujo-factura.ts` bloquea cuando no es válido, con guía de corrección; los tests llaman `resumenCalculo` real para descuento de 150 %, monto por unidad >= precio, descuento global inválido y corrección. No se añadió eliminación de `pagos`, ni se tocó motor fiscal | **CORREGIDO — Conforme en auditoría estática** |
| **FE-UX-R01-02**: foco del modal `Resumen de la factura` | Se añadieron refs de modal, botón de vuelta y control iniciador; `useEffect` enfoca `Volver a editar` cuando aparece el resumen, devuelve foco al control inicial conectado en el cierre; `onKeyDown` contiene Tab/Shift+Tab dentro de los elementos enfocados; Escape llama `flujo.cancelar()` salvo cuando `enviandoRef.current` está activo; durante envío los dos botones están deshabilitados. Tests ejecutan `accionTeclaResumen` y `siguienteFocoModal` reales; las conexiones React se comprueban por código/test estático | **CORREGIDO — Conforme en auditoría estática; manejo de DOM/foco real sin prueba de navegador** |
| Huella, emisión e idempotencia | `flujo.revisar(cuerpoFactura())` y `flujo.enviar()` no cambian; `crearFlujoRevision` asegura que el cuerpo emitido sea el revisado e impide dos envíos simultáneos. El cambio de pantalla no altera sus llamadas | Sin regresión comprobada estáticamente |
| Límite de cambios | Solo `page.tsx`, `flujo-factura.ts`, `flujo-factura-ux.casos.ts`, `PROGRESSO-NEXIT-V1.md` | Conforme; KuDE/gateway, payload, fiscalidad, stock, permisos y migraciones no modificados |

## Riesgos residuales / validación operacional humana

- La interacción real de Tab / Shift+Tab / Escape / retorno de foco **no se ejecutó en Chrome ni con lector de pantalla**. Probar con modal que contiene scroll de productos, distribución de stock expandida y botones inferiores; comprobar que no se escape al fondo y que el foco inicial/final sea legible.
- Probar el paso `Revisar y confirmar → Enviar factura → Detalle técnico` con un envío lento, error y éxito; verificar foco y protección frente a cierres mientras el POST está en curso. No se identificó defecto demostrado de doble emisión en el controlador; esta prueba es de integración de navegador.
- Revisar visualmente la tabla compacta y modal para 3 y numerosos productos, GTIN largos, crédito con entrega y pagos múltiples.
- El contrato KuDE NCR implementado en `1c37e526...` queda conforme solo **estáticamente** frente al Postman 200 presentado. Verificar su operación real sin alterar la URL/credenciales; distinguir el incidente del certificado expirado y CDC del estado fiscal. Un PDF válido no demuestra aprobación SIFEN.
- SQL/migrations de NCE y homologación de SIFEN permanecen fuera de esta entrega.

## Conclusión y próximo gate

**R02 — CONFORME EN AUDITORÍA ESTÁTICA.** Se dan por corregidos FE-UX-R01-01 y FE-UX-R01-02 en el código publicado. **Ningún defecto nuevo se demostró en la revisión del diff; no se pide otra iteración de Claude para estos hallazgos.**

**NO HOMOLOGADO EN AMBIENTE REAL.** La siguiente decisión corresponde al responsable humano: validar visualmente el flujo FE desktop y confirmar el KuDE NCR en la configuración existente del gateway, sin hacer cambios de banco, deploy o migrations por cuenta de la IA. No marcar tareas Done/Homologado ni iniciar otra funcionalidad.
