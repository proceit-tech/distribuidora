# ORDEN CLAUDE — PRO-370 / PRO-365-R02-C02-C03 (F03)
Fecha 24/11/2026. Responsable autoriza únicamente F03. PR #7 DRAFT, rama feature/NEXIT-2026-001-banco-demo. Base de auditoría previa: 16f0ecf3b8ccc9e3c03357c88aad04feb51c0ef2; código funcional auditado 0209b7cab041c51ec24fed400644ca4de52e1cd9. C02-C02 KuDE aprobado, no repetir. F01 fuera de alcance.

## Diagnóstico ChatGPT
- presentacion-sifen.ts: iconoSifen APROBADO = check/ok, DocIconos no contempla eventos. page.tsx usa iconosEstado(d) tanto en primera capa (fila, 984) como en historial técnico (1191).
- documentos-copy-operador.ts: encabezadoFiscal ya muestra Cancelado/prohibido/neutro y nota de aprobación original cuando APROBADO + eventosFe.situacion CANCELADO; textoSifen actualmente dice «Aprobado, luego cancelado» pero la fila sigue verde. documentos-tabla.ts estadoPrincipalFila ya reconoce esa misma proyección.
- C02-14c exige el check verde; esa expectativa queda sustituida SOLO para primera capa. Historial técnico mantiene la aprobación original, junto a evento y estado fiscal registrado.
- eventos-fe.ts contextoCancelacionDocumento() siempre retorna acreditado:false actualmente; shared.ts utiliza esa función. Por tanto, escenario de cancelación acreditada por evento es prueba sintética de presentación, NO prueba de disponibilidad real; CANCELACION_FE_OPERATIVA=false, PRO-313/199 no se habilitan. Estado persistido CANCELADO ya es neutral y debe permanecer así.

## Regla y solución vinculante
Primera capa: APROBADO + proyección existente eventosFe.situacion === "CANCELADO" (acreditada por el mecanismo actual) -> SOLO eje SIFEN: simbolo "prohibido", tono "neutro", texto visible/tooltip EXACTO "Cancelado", aria-label "SIFEN: Cancelado". Detalle fiscal permanece Cancelado con nota «Fue aprobado y luego cancelado. La aprobación original se conserva en el historial.» Eventos conserva evidencia y operación no disponible. CANCELADO persistido -> mismo icono/tooltip, sin inventar aprobación anterior. INUTILIZADO -> mismo símbolo pero tooltip Inutilizado. APROBADO normal, SIN_EVENTOS, SIN_INFORMACION, SOLO_RECHAZADOS, EN_REVISION -> check verde Aprobado; no deducir cancelación por mensaje, código, evento genérico aprobado, fecha, CDC o estado de solicitud. RECHAZADO/PENDIENTE/otros mantienen presentación anterior.

Implementar una proyección pura de operador (p.ej. iconosEstadoOperador(d) en documentos-copy-operador.ts, tipada a partir de Parameters<typeof iconosEstado>[0] y eventosFe opcional). Reutilizar iconosEstado(d) y sustituir únicamente el tercer indicador para APROBADO+cancelación acreditada; no mutar array/objeto recibido ni cambiar los otros tres ejes. Ajustar textoSifen en ese caso a «Cancelado». page.tsx usa la nueva proyección SOLO en primera capa de la fila/versión móvil; historial técnico mantiene iconosEstado(d) original, estado fiscal registrado y evidencias. No cambiar presentacionSifen, seguimientoFiscal ni iconosEstado base. Añadir a LEYENDA_SIMBOLOS el símbolo prohibido con estilo neutro existente y texto «cancelado o inutilizado», sin rediseñar el resto. Reutilizar GLIFO y CSS existentes; no cambiar colores FE/NCE ni layout. Mantener filtros/KPI, ordenación y paginación basados en estado persistido; no prometer que filtro Cancelado incluye APROBADO con evento.

## Archivos
Funcionales autorizados: lib/facturacion/documentos-copy-operador.ts y app/(private)/documentos/page.tsx. Casos escritos directamente afectados (en especial documentos-c02-lenguaje-pro365.casos.ts C02-14b/c y documentos-ux-competencia-pro365.casos.ts si matcher de integración lo requiere); informe de entrega. No modificar presentacion-sifen.ts, eventos-fe.ts, documentos-tabla.ts, shared.ts, gateway, KuDE, CSS, API, SQL ni otros módulos. Si se requiere ampliar archivos funcionales, STOP y justificar.

## Criterios de aceptación escritos
1. APROBADO normal check/ok y Aprobado, incluso sin CDC.
2. APROBADO + proyección CANCELADO: eje SIFEN prohibido/neutro, tooltip Cancelado, aria-label correcto, encabezado Cancelado y nota histórica intacta.
3. Historial técnico del mismo documento: iconosEstado original check/ok, estado registrado APROBADO, evidencia de cancelación separada; no cambiar datos.
4. CANCELADO persistido, con/sin eventos: prohibido/neutro, Cancelado; no inventar aprobación original.
5. INUTILIZADO y RECHAZADO (incl. 1109) conservan símbolo/tono/tooltip y motivo aplicable; PENDIENTE y demás estados intactos.
6. APROBADO + EN_REVISION, SOLO_RECHAZADOS, SIN_EVENTOS, SIN_INFORMACION o ausencia de proyección: no presentar cancelación; evento genérico aprobado no acredita cancelación. Usar fuente actual, no cambiar contexto ni gates.
7. Envío, XML/CDC y Correo idénticos a iconosEstado base, 4 ejes mismo orden, aviso técnico independiente. No mutación del documento ni de objetos originales.
8. Leyenda explica prohibido; móvil usa misma proyección; sin cambios de diseño fuera de F03.
9. Sin cambios en filtros/KPI/estado fiscal persistido, permisos, stock, KuDE, cancelación operativa. C02-C02 íntegra.
10. No eliminar casos existentes; actualizar expectativas antiguas únicamente por la nueva regla. Mantener prueba explícita del indicador histórico verde. Documentar prueba sintética y falta de acreditación real por evento.

## Ejecución y STOP
Leer CLAUDE.md, versiones completas más recientes desde Git, un archivo por vez. Un solo lote en PR #7 Draft; no ejecutar manualmente tests/lint/typecheck/build/SQL/CI/Docker/gateway/VM. Observar CI automático tras push. Entregar SHA completo, archivos, diff, matriz de criterios, casos escritos y CI, limitaciones y confirmación de STOP para auditoría ChatGPT. No merge/deploy/R03, ni F01 ni nueva actividad. No homologar por CI verde.