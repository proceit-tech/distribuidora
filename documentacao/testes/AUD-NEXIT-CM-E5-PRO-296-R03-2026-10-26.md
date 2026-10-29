# AUD-NEXIT-CM-E5 / PRO-296 — R03 — Reauditoria de correspondência NCE ↔ FE por produto
**Data:** 26/10/2026. **Projeto:** NEXIT — Informe de Ventas / E5. **Branch:** `feature/NEXIT-2026-001-banco-demo`.
**Código funcional auditado:** `07d92b2e14ba818b0534abbc620be07836fd68d0`, confirmado na branch oficial antes de registrar esta auditoria. Parent funcional: `f71e48181b4550ea22b7ec819e4bd9233b5f77d3`.
**Resultado:** **CONFORME ESTATICAMENTE NO ESCOPO R02-F001.** Não há falha lógica bloqueante remanescente identificada na comparação de multiplicidades de assinaturas para a vista `PRODUCTOS`. **Não equivale a homologação em dados reais, banco, navegador ou exportações executadas.**
**Normas:** `documentacao/ordens/ORD-CLAUDE-NEXIT-CM-E5-R02-F001-BIJECCION-NCE-PRODUCTOS-2026-10-26.md` e `documentacao/definicoes/REQ-NEXIT-CM-E5-INFORME-VENTAS-PRO-296-2026-10-26.md`. Parecer anterior: `documentacao/testes/AUD-NEXIT-CM-E5-PRO-296-R02-2026-10-26.md`.

## 1. Evidências conferidas diretamente no GitHub
- O commit funcional altera **somente** `lib/reportes/ventas.ts`, sem SQL versionado, migrations, UI, endpoints, permissões ou exportadores. O arquivo foi lido integralmente junto com o diff e as definições NEX-062/NEX-070.
- `nce_lineas` tem chave `(empresa_id,nce_id,linea)` e a coluna `linea` representa o **ordinal da linha da FE original**, não a posição em `NCE.Detalles`. O código não inventa uma coluna de ordinal inexistente.
- `fev` exige apenas uma solicitação histórica da FE e um array válido de `Detalles`, dentro do escopo da empresa e das NCE já classificadas como fiscalmente `COMPUTA`.
- `fn` produz uma assinatura por item NCE; `fl` produz uma assinatura por linha creditada, recuperando `FE.Detalles[linea-1]`. Assinatura via `jsonb_build_array`: código, GTIN, descrição, unidade, afetação, taxa/proporção IVA, valor, quantidade e preço. Valores numéricos JSON/texto decimal são normalizados para `numeric`; campos essenciais nulos tornam a assinatura inválida.
- Em `mult`, `UNION ALL` das duas fontes e `GROUP BY (nce_id,firma)` computam `n_item` e `n_linea`. `atr` exige existência de firmas e nenhuma firma nula ou com multiplicidades diferentes. Isso é **comparação de multiconjuntos**, não mera cobertura de candidatos.

## 2. Prova estática do fechamento R02-F001
Para o conjunto de assinaturas normalizadas, existe uma bijeção compatível se, e somente se, **cada assinatura possui exatamente a mesma multiplicidade** nos itens da NCE e nas linhas creditadas da FE. O novo predicado é essa igualdade e rejeita assinaturas faltantes, duplicadas apenas em um lado ou ilegíveis. Considera-se a identidade de produto fiscal histórico dada pelos campos completos da assinatura, não somente pelo código.

| Cenário | Resultado logicamente derivado da query |
| --- | --- |
| FE com linhas creditadas `[A,B,B]`, NCE histórica divergente `[A,A,B]` | `A: 1 vs 2`, `B: 2 vs 1`; NCE **não atribuída**; valor integral da NCE segue para `Ajustes no atribuibles a producto` |
| FE `[A,A]` e NCE `[A,A]`, assinaturas completas iguais | `A: 2 vs 2`; **atribuída**, mesmo sem distinguir fisicamente as duas linhas equivalentes |
| FE `[A,B,C]` com crédito de A e C, NCE `[C,A]` | `A:1 vs1`, `C:1 vs1`; **atribuída**, independente de ordem |
| NCE `DEVOLUCIÓN`, motivo 2 | Assinatura compara quantidade >0 e preço original por linha |
| NCE de ajuste monetário por linha (motivo diverso de 2) | Assinatura exige quantidade NCE 1, quantidade creditada 0 e preço igual ao monto |
| NCE serviço `DESCUENTO`/bonificação ou FE sem payload único | Não candidata a atribuição; valor da NCE aparece no bloco não atribuível |
| Campo essencial ilegível, FE ordinal fora de rango | Assinatura nula; NCE não atribuída ao produto |

**Importante:** esses resultados são deduções de predicados SQL lidos; **não são testes executados**, não comprovam que existam dados reais com esses valores.

## 3. Ausência de regressão dentro do diff
- `ATRIBUCION_NCE` é utilizada exclusivamente na ramificação `PRODUCTOS` de `leerVentas`. A view só inclui linhas NCE se `id IN (SELECT nce_id FROM atr)`; caso contrário, agrega sua cabecera em `Ajustes no atribuibles a producto`, sem repetir como item.
- Nenhuma modificação ao CTE comum de totais por documento (`MEDIDAS`, FE/NCE aprovadas, IVA, moedas, NCE com data própria, permissões/ACL) ou às vistas `RESUMEN`, `DOCUMENTOS`, `CLIENTES`, `VENDEDORES`, `MESES`. Sem mudanças nos geradores XLSX/PDF; a exportação por produtos reutiliza a consulta agora corrigida.
- As validações de criação em NEX-062/070 continuam inalteradas; este mecanismo é verificação defensiva de leitura dos históricos, não reemissão nem recálculo do payload.

## 4. Riscos e gates não encerrados
- **Não houve** testes, lint, typecheck, build, CI, SQL, leitura da VM/PG, chamada gateway, emissão fiscal, exportação real, navegador nem deploy.
- A disponibilidade de migrações reais do NEXIT e a confiabilidade de dados históricos **não foram verificadas**. Falta ensaio autorizado com FE/NCE aprovadas, casos de devolução parcial, produtos repetidos, períodos fiscais distintos, moedas/IVA, estados CANCELADO e respostas 401/403/503.
- A existência de página de documento individual `/documentos/[id]` não foi demonstrada; a ausência do botão `Ver documento` é limitação da E5, não regressão deste patch.
- O arquivo `E5-R02-F001-demonstracao.md` referido pelo Claude permanece **fora do Git e não foi fornecido nesta conversa**. Esta auditoria baseia-se no código e nos requisitos oficiais, não nesse documento externo.
- A comparação de assinaturas pode envolver leitura de detalhes fiscais da FE original; desempenho/tempo de resposta em alto volume e exportações grandes não foram medidos. Não afirmar performance.
- Não autorizar novas correções apenas por conjecturas ou por exigências mobile.

## 5. Decisão e gestão
- **R02-F001 e E5 Informe de Ventas: CONFORMES NA AUDITORIA ESTÁTICA, sem ressalva bloqueante comprovada da atribuição por produto.** Não emitir nova ordem R03 de desenvolvimento nem reexecutar E5/R01/R02.
- **PRO-296** permanece `In Review` (código entregue/auditado, aguardando homologação humana com dados reais). **PRO-108** permanece `Todo` (E6 Compras não iniciada). **PRO-115** permanece `Todo`; **PRO-297/E6** permanece `Todo`.
- **Nenhuma ordem Claude ativa desta E5 após R03.** Próximo gate é homologação no ambiente pelo responsável, sob autorização específica, depois de verificar estado de migrações e validar indicadores/exportações reais. ChatGPT audita e atualiza Linear; Claude somente desenvolve sob nova ordem autorizada.
