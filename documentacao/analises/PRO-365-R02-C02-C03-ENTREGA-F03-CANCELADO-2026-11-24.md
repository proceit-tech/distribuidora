# PRO-370 / PRO-365-R02-C02-C03 (F03) — Entrega Claude (24/11/2026)

Orden: `documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-365-R02-C02-C03-F03-CANCELADO-2026-11-24.md`. HEAD inicial autorizado: `6e62ca3999096720ede03aaefb26eceac62dd3d2`.
PR #7 sigue DRAFT. Casos escritos, no ejecutados manualmente; solo se observa el CI automático del push. **No es homologación visual.**

## Cambio funcional (solo los dos archivos autorizados)

| Archivo | Cambio |
|---|---|
| `lib/facturacion/documentos-copy-operador.ts` | Nueva proyección pura `iconosEstadoOperador(d)` (tipo `Parameters<typeof iconosEstado>[0] & { eventosFe? }`) y auxiliar `cancelacionAcreditadaSobreAprobado(d)`. Reutiliza `iconosEstado(d)`; solo si `estadoSifen === "APROBADO"` y `eventosFe?.situacion === "CANCELADO"` devuelve un objeto NUEVO para el eje SIFEN con `simbolo: "prohibido"`, `tono: "neutro"`, `corto: "SIFEN Cancelado"`. Envío, XML/CDC y Correo son los mismos objetos base, en el mismo orden. `textoSifen` en ese caso pasa de «Aprobado, luego cancelado» a «Cancelado» (aria-label «SIFEN: Cancelado»). |
| `app/(private)/documentos/page.tsx` | La fila (única vista, también en móvil) usa `const fases = iconosEstadoOperador(d);`. El historial técnico sigue con `iconosEstado(d)`. `LEYENDA_SIMBOLOS` añade `{ simbolo: "prohibido", clase: estilos.iconoNeutro, texto: "cancelado o inutilizado" }` reutilizando GLIFO y CSS existentes. |

No se tocaron `presentacion-sifen.ts` (`iconosEstado`, `presentacionSifen`, `seguimientoFiscal`), `eventos-fe.ts` (`contextoCancelacionDocumento`, `CANCELACION_FE_OPERATIVA=false`), `documentos-tabla.ts`, `shared.ts`, gateway, KuDE, CSS, API ni SQL.

## Antes / después (APROBADO + `eventosFe.situacion = "CANCELADO"`)

| Lugar | Antes | Después |
|---|---|---|
| Fila, eje SIFEN | check verde, tooltip «Aprobado, luego cancelado» | prohibido neutro, tooltip «Cancelado», aria-label «SIFEN: Cancelado» |
| Detalle fiscal (encabezado) | «Cancelado» + nota de aprobación original | sin cambios |
| Historial técnico, Estados técnicos | check verde «SIFEN Aprobado» | sin cambios (aprobación original) |
| Leyenda | 4 símbolos + aviso | + «prohibido: cancelado o inutilizado» |

APROBADO normal (con o sin CDC), APROBADO con EN_REVISION / SOLO_RECHAZADOS / SIN_EVENTOS / SIN_INFORMACION / sin proyección, CANCELADO e INUTILIZADO persistidos, RECHAZADO (incl. 1109) y PENDIENTE: sin cambios.

## Matriz de criterios

| # | Criterio | Casos |
|---|---|---|
| 1 | APROBADO normal check/ok, también sin CDC | C02C03-01, 02 |
| 2 | APROBADO + cancelación: prohibido/neutro, «Cancelado», aria-label, encabezado y nota | C02C03-03, C02-14b |
| 3 | Historial técnico con aprobación original (check verde, APROBADO registrado) | C02C03-04, C02-14c |
| 4 | CANCELADO persistido con/sin eventos, sin aprobación inventada | C02C03-05 |
| 5 | INUTILIZADO, RECHAZADO 1109 (motivo), PENDIENTE intactos | C02C03-06, 07, 08 |
| 6 | EN_REVISION, SOLO_RECHAZADOS, SIN_INFORMACION, sin proyección, SIN_EVENTOS, mensaje de cancelación: no cancelado | C02C03-09..12 |
| 7 | Envío/XML/Correo idénticos, 4 ejes mismo orden, aviso independiente, sin mutación | C02C03-13, 14, 16 |
| 8 | Leyenda con prohibido; fila/móvil con la proyección | C02C03-15 |
| 9 | Filtros/KPI, permisos, operaciones, cancelación no operativa, KuDE C02-C02 | C02C03-17, 18 |
| 10 | Casos existentes conservados; expectativas antiguas actualizadas solo por F03 | ver abajo |

## Casos (escritos, no ejecutados manualmente)

- `documentos-c02-lenguaje-pro365.casos.ts`: C02-14b (tooltip «Cancelado») y C02-14c (primera capa prohibido/neutro; historial base sigue check verde) actualizados; nuevos C02C03-01..18.
- Matcher de integración `const fases = iconosEstado(d);` → `const fases = iconosEstadoOperador(d);` (misma comprobación, nueva fuente de la fila) en `documentos-ux-competencia-pro365.casos.ts`, `documentos-ux-r01.casos.ts`, `documentos-pro195-r01.casos.ts`, `facturacion.casos.ts` y `flujo-fiscal-pro342.casos.ts`. Ningún caso eliminado.

## Limitaciones

- El escenario de cancelación acreditada es **sintético de presentación**: hoy `contextoCancelacionDocumento()` devuelve `acreditado:false` y `CANCELACION_FE_OPERATIVA=false`; no hay acreditación real por evento disponible ni se habilita PRO-313/PRO-199.
- Filtros y KPI siguen basados en el estado persistido: un APROBADO con cancelación acreditada sigue contando como «Aprobados» y no aparece en un filtro «Cancelado».
- Sin revisión visual en navegador ni homologación.

## Alcance

Sin SQL, migrations, API, gateway, KuDE, CDC, numeración, motor fiscal, FE/NCE, stock ni permisos. F01 fuera de alcance. No se inició R03 ni otra actividad. Sin merge ni deploy. STOP para auditoría ChatGPT.
