# Auditoría por menú — Facturación → Notas de crédito

**Ruta:** /notas-credito. **Fecha:** 18/10/2026. **Estado:** AUDITORÍA ESTÁTICA INDIVIDUAL R01 — 1 ALTA + 3 MEDIAS ABIERTAS — NO HOMOLOGADO.

**Informe técnico detallado:** [AUD-NEXIT-NOTAS-CREDITO-DESKTOP-R01](../../testes/AUD-NEXIT-NOTAS-CREDITO-DESKTOP-R01-2026-10-18.md). Incluye fuentes y líneas, cobertura funcional, 10 observaciones y 24 pruebas futuras.

## Función individual

Emitir NCE directa sin borrador, solo a partir de FE aprobada con CDC, motivos 2 Devolución / 3 Descuento / 4 Bonificación / 8 Ajuste de precio; mantener saldo por línea, motivo histórico único, bloquear pendientes, devolver saldo de rechazadas y canceladas, revalidar precio/unidad/IVA del documento FE persistido. Punto y serie NCE independientes. PREVIA no reserva número. EMITIR usa exactamente el body revisado y no confunde recepción de gateway con SIFEN APROBADO. Corrección de NCE rechazada exige NUEVA NCE/número y revisión completa.

## Hallazgos del código vigente

- **NCE-D01 ALTA:** page.tsx:129–156 acepta GET de detalle de FE anterior cuando el operador cambia cliente en :297–299; falta invalidación de contexto. Una FE de cliente A puede abrir después de haber seleccionado B.
- **NCE-D02 MEDIA:** page.tsx:202–218 puede mostrar PREVIA antigua tras editar monto/motivo/punto o volver al listado mientras el HTTP estaba pendiente. **El envío está protegido**: compara formulario con revisado.cuerpo en :220–225; no atribuir emisión de cuerpo diferente.
- **NCE-D03 MEDIA:** nce-emision.ts:67–79 exige configuracionGateway antes de recuperar NCE ya guardada por repeticion. Pérdida de respuesta HTTP más credenciales luego indisponibles puede impedir recuperación de identidad por la misma API, sin indicio de documento duplicado.
- **NCE-D04 MEDIA:** después de emitir, page.tsx:230–233 navega a Documentos filtrando solo numero de siete cifras; NEX-065:362,379 retorna número sin establecimiento/punto/serie/tipo. Varias FE/NCE pueden tener 0000001. Vincular por ID autorizado o referencia fiscal completa.

## Invariantes a preservar

Acceso FACTURACION_ELECTRONICA.CREAR y alcance empresa/sucursal. Innominado SOLO vetado en la selección normal de UI, por tipo SIFEN=5: no imponer veto nuevo API/SQL que el responsable excluyó. Búsquedas obsoletas descartadas por controladores. Revisión exacta UI-01. Histórico/saldos SQL NEX-062 bajo lock FE. Motivo aprobado fijado incluso tras cancelación, aunque cancelación libera monto. IVA histórico, Devolución por cantidad y otras NCE por monto IVA incluido. NCE rechazo definitivo -> propuesta de nueva nota; sin reenviar ciegamente estados indeterminados. PUN-D02 agotamiento ZZ ya consta en Puntos, no duplicarlo. El estado de migration NEX-065 en VM se verifica por el responsable, no por lectura GitHub. Navegador desktop/foco pendiente; el sistema no es móvil.

## Estado general

**1 ALTA, 3 MEDIAS, 0 BAJAS nuevas; 10 observaciones y 24 pruebas futuras. 0 tests ejecutados por ChatGPT.** Sin navegador/VM/PG/SIFEN/gateway/CI, código ni migrations alterados. No homologado, Claude no autorizado. Se registraron estáticamente 22 entradas de menús V1 activos en la secuencia acordada; la auditoría general NO está cerrada, Plataforma → Empresas se mantiene separada y los menús ocultos requieren definición del responsable.

## Reauditoría C03/NCE-D01 R02 — propuesta de rechazada antigua (18/10/2026)

**SHA inspeccionado:** `d9f8595be8ef2d5d8f607fe3f120c2b527d6ab35`. Informe técnico: [AUD-NEXIT-C03-NCE-D01-R02](../../testes/AUD-NEXIT-C03-NCE-D01-R02-2026-10-18.md).

**NCE-D01 ALTA corregida estáticamente en la carga DIRECTA de FE:** `crearCargaDetalle` rechaza respuestas, errores y finally atrasados; conserva precarga y estado de lista cuando corresponde. **C03 todavía ABIERTA por C03-R02-01 ALTA:** el GET anterior de PROPUESTA de NCE rechazada `/api/notas-credito/correccion/[id]` solo se cancela por cambio de `corregir`/unmount, no al seleccionar cliente B o pulsar Cambiar. Si la propuesta de A termina luego, `vivo` sigue true y puede empezar un NUEVO GET de FE A tras invalidar el controlador de detalle, mostrando FE A bajo cliente B. El error de la propuesta también puede quedar desfasado. Solución focal: identidad/contexto de las dos fases (propuesta y detalle), descartar propuesta antigua antes de presentar aviso o abrir FE; sin modificar endpoint, política Innominado UI, saldo, motivo, IVA o envío NCE. Reauditoría R03 obligatoria.

Claude reportó 58 + 205 + 47 = **310 comprobaciones, 0 fallas**; ChatGPT NO las ejecutó, ni browser/PG/VM/gateway. **NO HOMOLOGADO; C04 no autorizada.**

## AUD-C03-R03 — cierre del GET antiguo y aviso pendiente (18/10/2026)

**SHA Claude:** `6f70d0eea48978dfbd39413f3d2483b2aeff9d80`. Informe de reauditoría: [AUD-NEXIT-C03-NCE-D01-R03](../../testes/AUD-NEXIT-C03-NCE-D01-R03-2026-10-18.md).

**C03-R02-01 ALTA RESUELTA ESTÁTICAMENTE:** `crearCargaCorreccion` verifica el contexto antes de mostrar una propuesta recibida o abrir su FE, rechaza errores tardíos y `invalidarContexto` cancela propuesta+detalle al cambiar cliente, volver, salir o cambiar corrección. `crearCargaDetalle` sigue intacto. **C03 no se cierra por C03-R03-01 MEDIA:** si aviso NCE-A ya fue publicado y detalle FE-A está pendiente, cambiar a cliente B invalida el detalle pero **no limpia aviso A** (`page.tsx:164–170,265–273,299–303`). Riesgo visual de corrección fiscal anterior bajo receptor B, sin factura errónea emitida probada. Corregir únicamente la asociación/limpieza de aviso al abandonar contexto A, conservar aviso legítimo B, agregar tests dirigidos y realizar reauditoría R04.

Claude reportó 67 + 205 = **272 comprobaciones sin fallos**, no reejecutadas por ChatGPT; ESLint y tipos focales declarados conformes. **NO HOMOLOGADO; C04 aún no autorizado.**
