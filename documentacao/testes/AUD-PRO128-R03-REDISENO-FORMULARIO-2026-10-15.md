# AUD-PRO128-R03 — cierre técnico del rediseño de Nueva factura

**Fecha:** 15/10/2026. **Commit de implementación auditado:** `0003cd5e9cb6de49ecaa004a38bef5b2bb17617b`. **Branch:** `feature/NEXIT-2026-001-banco-demo`. **Veredicto:** **PRO-128 ACEPTADA TÉCNICAMENTE POR REVISIÓN ESTÁTICA**; homologación visual, operativa y fiscal en VM **NO realizada**. No autoriza por sí sola aplicar migrations, desplegar ni emitir DE.

## Fuentes y alcance

Auditados `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, secciones pertinentes de `PROGRESSO-NEXIT-V1.md`, `AUD-PRO128-R02`, commit/diff y los seis archivos cambiados: `page.tsx`, `ajuste-fiscal-item.tsx`, `page.module.css`, `cambios-formulario.ts`, `rediseno.casos.ts`, progreso. Contraste funcional con `AUD-PRO128-R00` y R01/R02, esquema/aplicación/payload fiscal ya revisados. El SHA de implementación coincidió con HEAD oficial al inicio de la revisión. No se cambió SQL, migration, contrato de gateway, payload SIFEN, cálculos, numeración, ACL ni snapshot.

**CI automático** [run 38782468500](https://github.com/proceit-tech/distribuidora/actions/runs/38782468500), job `116585916330`: `completed/success`. Log verificado: 59 migrations desde cero en PostgreSQL **descartable**, T19 78 verificaciones OK, T20 24 OK, total **689 verificaciones PASS/0 fallas**. Esa batería no ejecuta navegador y **no representa homologación de la suite React ni del sistema operacional**. Claude reportó suites dirigidas PRO-128/regresiones, mutación, tsc/ESLint, sin ejecución independiente por el auditor.

## Cierre de hallazgos R02

| ID | Veredicto y evidencia |
|---|---|
| R02-01 FX manual vs cotización sugerida | **CERRADO ESTÁTICAMENTE.** `page.tsx` mantiene estado explícito `cambioManual` activado sólo cuando el operador ingresa tasa; `cambiarMoneda` precarga nueva cotización y reinicia ese estado. `perdidasAlCambiarMoneda` recibe `cambioManual`, `cambio` y `cambioNuevo`; muestra aviso si un valor manual no vacío y distinto del nuevo sería perdido al cambiar USD/BRL/PYG, omitiendo avisos por sugerencia automática o por igualdad textual. Diálogo Cancelar/Escape preserva los demás estados; Confirmar utiliza el reset anterior sin conversión. Tests dirigidos cubren USD→BRL, BRL→USD, extranjero→PYG, manual/sugerido/vacío/igual y pérdidas combinadas. Validación de formatos sigue en servidor. |
| R02-02 Semántica IVA/foco/modal | **CERRADO ESTÁTICAMENTE.** `EditorFiscalItem`: selector IVA dentro de `label` con un único control, acción de restaurar IVA como botón hermano en `campoIva`, sin perder callback ni permiso. `page.tsx`: referencia al `currentTarget` del selector iniciador, `cerrarConfirmacion` centraliza Cancelar, Escape y Confirmar, agenda devolución de foco; al abrir, el foco va al botón Cancelar. `alertdialog` contiene dos botones; `onKeyDown` atrapa Tab/Shift+Tab entre ellos. Cabecera, formulario principal y barra móvil reciben `inert` durante la confirmación. Testes estructurales revisados. |

## Continuidad del contrato UI → API → banco → JSON → SIFEN

- A R03 modifica **sólo presentación e estado do formulário**. O cadastro de unidades E709, descritores dependentes do gateway, IVA E731/E733/E734, prévia da proporção parcial E733, total Decimal e `FormaPago[]`, `Detalles[]`, `Subtotales[]` permanecem como auditados em AUD-PRO128-R00/R01/R02. Nenhum campo fiscal do gateway foi incluído ou retirado na R03. Não reabrir P-02/P-11/P-12, D016/E610 USD/BRL ou J003 com base nesse refactor.
- O **aceite técnico** cobre os ajustes R01-01..04 e R02-01..02, não um novo teste do gateway ou prova normativa integral do XML SIFEN. Descontos, antecipos, rastreabilidade, modalidades especiais e Cuotas permanecem em fases próprias.

## Porta de homologación a cargo del responsable

- O Claude não usou navegador e **não existem capturas reais ANTES/DEPOIS** nem execução visual de teclado, leitor de tela, scroll/foco em 1440/1024/768/375 px. A geometria do CSS e o trap de foco são **evidência de implementação**, não experiência operacional comprovada. A validação humana deve checar layout, linha do editor abaixo do produto, IVA 10↔5 e parcial, unidades vigentes, pagamento, Crédito Plazo, troca USD↔BRL com diálogo, Tab/Escape, prévia exata e permissão de pontos.
- **VM/PostgreSQL real:** antes de deploy consultar `schema_migrations` com versões e checksums (principalmente NEX-057 alterada após publicação), verificar NEX-056..059, executar backup e usar runner oficial somente após autorização humana. CI descartável não diz que migrations já estão instaladas.
- Confirmar ambiente homologación vs producción, estabelecimento/punto/timbrado e último número fiscal externo **antes** de transmitir qualquer documento. `ENVIADO` ou HTTP 200 não é `APROBADO`.
- Linear PRO-128: **manter In Review até homologação em navegador/VM**, apesar do aceite técnico R03; não marcar Done. O próximo passo não é nova implementação ao Claude, mas verificações humanas da versão publicada.

**Conclusión:** **AUD-PRO128-R03 ACEPTADA TÉCNICAMENTE** sem achados bloqueantes identificados no diff. O CI automático está verde no SHA auditado. Homologação operacional e fiscal segue pendente e explicitamente não realizada.
