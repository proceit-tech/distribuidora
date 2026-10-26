# AUD-NEXIT-CM-E4 / PRO-295 + PRO-79 — R01 — Auditoria independente de formato de cantidades

**Data:** 26/10/2026  
**Resultado:** **CONFORME ESTATICAMENTE**, sem achados bloqueantes comprovados. **NÃO HOMOLOGADO** em navegador/ambiente real.  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Commit funcional auditado:** `c55333ef03fa7c45446a1be5c02fcbad56593130`  
**Fonte de requisitos:** `documentacao/ordens/ORD-CLAUDE-NEXIT-CM-E4-FORMATO-CANTIDADES-MOVIMIENTOS-2026-10-26.md` e `documentacao/analises/ANA-NEXIT-REPORTES-VENTAS-COMPRAS-MARGEN-MOVIMIENTOS-2026-10-26.md`.

## 1. Evidências e método
- Verificado o commit diretamente no GitHub e confirmado como HEAD da branch oficial no momento da auditoria; o diff alterou **exatamente cinco arquivos**:
  1. `lib/movimientos/formato-cantidad.ts` (novo);
  2. `app/(private)/movimientos/page.tsx`;
  3. `app/(private)/movimientos/[id]/page.tsx`;
  4. `app/(private)/movimientos/nuevo/page.tsx`;
  5. `lib/movimientos/formulario.ts`.
- Foram lidos integralmente os cinco arquivos após o commit e verificados os consumidores e tipos associados: `lib/formato/listas.ts`, `types/movimientos-stock.ts`, `lib/movimientos/cliente-api.ts`, `lib/movimientos/historial.ts`. Auditoria **estritamente de leitura**, sem executar tests, lint, build, navegador, Docker, SQL ou VM.
- Não houve alterações em `lib/formato/listas.ts`, tipos/DTOs, endpoints, migrations, saldos persistidos, validação de gravação, cálculo de custos, permissões ou integrações fiscais.

## 2. Critérios E4 — resultado por requisito

| Critério | Evidência | Parecer |
| --- | --- | --- |
| Formato `es-PY`; separadores e até 4 decimais significativos, sem zeros finais | `lib/movimientos/formato-cantidad.ts`: `new Intl.NumberFormat('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 4 })` | Conforme estaticamente |
| Quantidade inteira sem `,0000` | `minimumFractionDigits: 0` | Conforme estaticamente |
| Fração real preservada visualmente até escala 4 | `maximumFractionDigits: 4`, compatível com `movimiento_lineas.cantidad numeric(18,4)` | Conforme estaticamente |
| Listado de movimientos | `app/(private)/movimientos/page.tsx` usa helper em quantidade da linha | Conforme |
| Detalle + linhas | `app/(private)/movimientos/[id]/page.tsx` usa helper nos dois pontos | Conforme |
| Nuevo movimiento: saldos e sugestão de lotes | `app/(private)/movimientos/nuevo/page.tsx` formata `disponible/reservado/cuarentena/transito` e sugestões | Conforme |
| Aviso de saldo insuficiente | `lib/movimientos/formulario.ts::advertenciaSaldo` formata apenas o número exibido | Conforme |
| Não modificar outros módulos | formatter compartilhado `lib/formato/listas.ts` permanece inalterado; helper próprio do domínio | Conforme |
| Não alterar gravação, cálculo, SQL, autorização ou API | Diff restrito a helpers de texto e chamadas na UI | Conforme |
| Zero negativo e valor inválido | Helper converte o texto `-0` em `0`; rejeita não finitos com `—` | Conforme quanto ao tratamento codificado |
| Exportação de movimientos | Nenhuma exportação específica foi modificada, e nenhuma saída relevante foi identificada nos arquivos revisados | Sem ampliação de escopo |

### Amostras de saída previstas pelo contrato estático
`1.0000 → 1`; `100.0000 → 100`; `2.5000 → 2,5`; `0.0001 → 0,0001`; `-1.2500 → -1,25`; `0 → 0`. **Estas saídas não são resultados de execução nesta auditoria**, mas consequências do formatador `Intl` lido no código.

## 3. Ressalvas NÃO bloqueantes

- O DTO preexistente representa quantidades com `number` em JavaScript. O E4 não modificou nem melhorou esse contrato. Quantidades extremas fora da precisão segura de `number` requerem análise independente se aparecerem em dados reais; não são defeito demonstrado do patch E4.
- Um valor inesperado com mais de 4 casas será formatado para 4 casas na exibição; o modelo persistente usa `numeric(18,4)` e a validação impede essas entradas nesse fluxo. Nenhuma regra de gravação foi alterada.
- `datalist`, alinhamento e apresentação nos navegadores do responsável não foram verificados visualmente; não declarar homologação por inspeção de TSX.
- Não foi conferido se o ambiente operacional roda esse SHA. Não deduzir deploy da existência do commit.

## 4. Decisão e próximo gate

- **E4 código aprovado em auditoria ESTÁTICA**, sem ordem corretiva adicional. **PRO-295: mover para In Review**, não Done. **PRO-79** permanece In Review (escopo maior de Movimientos).
- A validação visual real cabe ao responsável, com quantidades 0, 1, 2,5, 0,0001, negativo/inverso, lotes, saldos e unidade de medida nas telas existentes, usando computador. Diferenças visuais só reabrirão E4 mediante evidência específica.
- **E5 Informe de Ventas (PRO-296)** e **E6 Informe de Compras (PRO-297)** continuam **Todo, não implementados**. E5 exige ordem específica do analista (ChatGPT); E6 depende de fonte real comprovada, não mocks; Ganancia Bruta opcional ainda sem autorização de código.
- **Divisão de responsabilidades:** Claude só desenvolve/commita; ChatGPT documenta/audita e mantém Linear; responsável executa/homologa no único ambiente operacional.
