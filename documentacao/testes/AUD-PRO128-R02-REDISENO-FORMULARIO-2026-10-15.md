# AUD-PRO128-R02 — Rediseño: confirmación, editor de IVA y resumen fiscal

**Fecha:** 2026-10-15. **Commit de implementación auditado:** `65768f6017fde0bf117dba4831afa0cd38d01f3e`. **Branch oficial:** `feature/NEXIT-2026-001-banco-demo`, HEAD idéntico al SHA auditado antes del commit de documentación. **Dictamen:** los cuatro hallazgos R01-01/02/03/04 quedaron **CORREGIDOS en revisión estática y tests dirigidos reportados**, pero **PRO-128 permanece In Review** por dos nuevas reservas de UX/accesibilidad R02-01 y R02-02, y por pruebas visuales reales pendientes. No hay nueva regresión SQL/JSON fiscal probada.

## Evidencia efectiva y límites

- Leídos `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `AUD-PRO128-R00`, `AUD-PRO128-R01` y progreso; inspeccionados el commit/diff, `page.tsx`, `ajuste-fiscal-item.tsx`, `page.module.css`, `iva-opciones.ts`, `cambios-formulario.ts`, `emision.ts`, `rediseno.casos.ts`, y las rutas de integración ya auditadas. El commit de Claude cambió 10 archivos, sin DDL, API externa, motor fiscal o JSON de gateway.
- **CI automático** [38780847613](https://github.com/proceit-tech/distribuidora/actions/runs/38780847613) **SUCCESS**, job `116580337127`: 59 migrations aplicadas desde cero en PostgreSQL descartable, T19 78 verificaciones PASS, T20 24 PASS, resumen **689 verificaciones PASS/0 fallas**. Ese flujo es la batería SQL automatizada, **NO una prueba de la UI renderizada ni necesariamente de la suite PRO-128**. Claude reportó suite focal PRO-128, regresiones asociadas y `tsc --noEmit`/ESLint limpios, no reejecutados por el auditor.
- **Sin VM/PostgreSQL operativo, sin navegador/zoom real (1440/1024/768/375), sin transmisión SIFEN/gateway, sin capturas ANTES/DEPUÉS**. Tests de foco, scroll y tecla Escape en `rediseno.casos.ts` son principalmente estructurales y no reemplazan una interacción real.

## Cierre de los 4 hallazgos R01

| ID | Estado | Evidencia |
|---|---|---|
| R01-01 pérdida al cambiar Moneda/Condición | **Corregido en flujo principal, con reserva R02-01** | `pedirMoneda`/`pedirCondicion` calculan pérdidas y abren `role="alertdialog"`; Cancelar/Escape no llaman a `cambiarMoneda`/`aplicarCondicion`; Confirmar sí. El reset no convierte importes. Ver cobertura incompleta de tipo de cambio extranjero. |
| R01-02 editor fiscal lejano/sin foco | **Corregido estructuralmente; visual pendiente** | `Fragment` agrupa línea y `tr.filaPanel` inmediatamente después de la línea seleccionada; `EditorFiscalItem` usa `scrollIntoView` y foco en primer control; un editor por vez, `key` por línea, cierre/retorno por ref. CSS para tarjetas <=900px. La interacción no fue ejecutada en navegador. |
| R01-03 proporción parcial oculta en previa | **Corregido** | `emision.ts:prepararFactura` incluye `resumen.lineas[].proporcion` sólo cuando `afectacion===4`, `null` en otras; modal usa `etiquetaIva(l.afectacion,l.tasa,l.proporcion)` y formateo Decimal es-PY. `Detalles[].dPropIVA`, `payload`, DB, snapshot y cálculos no cambian. |
| R01-04 restaurar IVA maestro | **Corregido** | `RESTAURAR_IVA` limpia sólo afectación, tasa, proporción y `guardar`; disponible en línea/editor si existe ajuste; preserva cantidad, precio, unidad fiscal, descripción y GTIN. Caso parcial 50→37,5→50 y 10→5→10 cubierto por pruebas focales reportadas. |

## Nuevas reservas concretas

### R02-01 — ALTA UX/INTEGRIDAD: pérdida de cambio manual al cambiar USD ↔ BRL y falso aviso por cotización automática

**Causa comprobada:** `cambios-formulario.ts:perdidasAlCambiarMoneda` reporta «el tipo de cambio» sólo con `e.cambio.trim() !== "" && e.aMoneda === "PYG"`. `page.tsx:cambiarMoneda` siempre reemplaza el tipo de cambio por el valor sugerido `cotizaciones[m]?.cambio ?? ""` cuando `m` es extranjero, y lo borra con PYG.

- Caso A: usuario tiene fatura USD con cambio digitado `7200`, sin líneas, pagos modificados ni crédito; elige BRL con cambio sugerido `1300`. `perdidasAlCambiarMoneda(...aMoneda:"BRL")` devuelve vacío, se reemplaza `7200` por `1300` **sin confirmar**. Incumple condición de no perder datos.
- Caso B: usuario selecciona USD; `cambiarMoneda` precarga `cotizaciones.USD.cambio` automáticamente, el operador no escribe nada; elige PYG. La función considera la tasa no vacía como «digitada» y exige confirmación **aunque el usuario no digitó dato**.
- Corrección delimitada: diferenciar cambio **digitado/editado por operador** de sugerencia automática, o controlar de forma equivalente el estado original/sugerido; incluir USD↔BRL y vuelta a PYG, pérdida real y valor restaurado; evitar confirmación en cambios de default/no digitados. No convertir precios ni cambiar moneda de importes. Testes focales con USD↔BRL, USD→PYG, auto-cotización vs tasa manual, Cancelar, Confirmar. Mantener formato/tipo JSON D018, F023.

### R02-02 — MEDIA UX/ACCESIBILIDAD: botón interactivo dentro de etiqueta de IVA y foco del diálogo

**Causa comprobada:** `ajuste-fiscal-item.tsx` coloca un `<button type="button">Usar IVA del producto</button>` dentro del mismo `<label>` que contiene el selector `<select>` IVA. Un `label` no debe contener **dos controles etiquetables**; queda estructura de etiquetado ambigua y riesgo de comportamiento no intuitivo con tecnología asistiva/clicks. **Mover botón a un contenedor hermano** del label, preservando su acción y permiso; conservar asociación explícita label/selector.

**Adicional:** `page.tsx` usa `role="alertdialog"`, `aria-modal` y `autoFocus` al botón Cancelar, pero no gestiona devolución de foco al selector Moneda/Condición al cancelar, confirmar o Escape; al cerrar el modal, el elemento Cancelar se desmonta y el foco puede quedar sin ancla. Comprobar y resolver devolución de foco al control iniciador en todos los cierres; evitar navegación por teclado a controles de fondo mientras el diálogo esté abierto, según patrón accesible, sin introducir componente global ni reescribir otros modales. El manejo de Escape en el editor fiscal dentro de `<select>` también deberá confirmarse en navegador; no se afirma un defecto de React sin esa evidencia.

**Criterio:** pruebas dirigidas de JSX semántico, retorno de foco y acción Restaurar sin disparar cambios de IVA; validación de teclado/Tab/Escape realmente en navegador **pendiente de responsable** si Claude no puede acceder a sesión. No marcar accesibilidad homologada por regex.

## Estado normativo y decisiones sin cambio

- D011 tipo transacción, E011 presencia visibles; E709 unidades buscables conservan código; E731/E733/E734 + E735/E736 IVA y cálculo intactos; PYG/Contado/Efectivo de cuatro claves y pagos P1/P2 preservados. R01-03 agrega sólo propiedad de **presentación** en respuesta de previa, no en JSON gateway.
- P-02, P-11, P-12, USD/BRL D016/E610, desc E710/E732 y J003 **NO homologados** por esta auditoría. Descuentos PRO-124, anticipos/lotes PRO-125, especiales PRO-126 y Cuotas PRO-121 fuera de alcance.
- NEX-056/057/058/059 aún sin inventario/checksum confirmado del PostgreSQL operativo; CI 59 migrations descartables no autoriza deploy. PRO-129 tiene aceptación técnica previa, aún con validación humana pendiente.

## Nueva corrección focal, entrega y homologación

Claude corrige **sólo R02-01 y R02-02**, conserva cierre R01-01..04 y motor fiscal, completa tests mínimos de estado, tipo de cambio y semántica/foco, actualiza progreso, commit/push y pausa para **AUD-PRO128-R03**. Sin migrations, API externa/gateway, suite global, build geral, CI manual/polling, VM/PG real, envío de documentos ni iniciar PRO-124/125/126. El responsable homologará realmente en navegador 1440/1024/768/375, teclado/foco y screenshots antes de aprobar UI operativamente.

**Veredicto:** cuatro hallazgos anteriores **cerrados en código**; dos ajustes localizados todavía obligatorios antes del **aceite técnico PRO-128**.
