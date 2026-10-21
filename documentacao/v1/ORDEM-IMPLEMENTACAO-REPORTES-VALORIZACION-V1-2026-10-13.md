# NEXIT V1 — Ordem de implementação de Reportes: prioridade Valorización de inventario

**Decisão do responsável:** após o encerramento da auditoria estática de Inventario, prosseguir com o desenvolvimento de **Reportes**, começando obrigatoriamente por **Valorización de inventario**. **Data:** 13/10/2026. **Branch:** `feature/NEXIT-2026-001-banco-demo`; **HEAD-base da revisão documental:** `cece4a37ce1e2a4b26f7e0b7acb885d075680122`. **Esta ordem autoriza a implementação da PRIMEIRA ENTREGA, Valorización, e estabelece responsabilidades dos demais reportes.** Não autoriza implementar todos simultaneamente; **parar após Valorización para auditoria do ChatGPT**, conforme protocolo do repositório. Nenhum menu foi homologado no ambiente operacional real.

## Leitura obrigatória de fontes de verdade

1. Ler integralmente, na branch atualizada, `CLAUDE.md` e `documentacao/PROTOCOLO-IA.md`; progresso pertinente de `PROGRESSO-NEXIT-V1.md`; verificar branch, HEAD, `git status` e sincronizar fast-forward sem descartar alterações.
2. Contrato aprovado da V1: `documentacao/v1/REPORTES-V1-ALCANCE-APROBADO.md`; auditoria canônica: `documentacao/v1/auditoria-por-menu/AUD-REPORTES-INTEGRADA-V1-2026-10-13.md`, em especial **RPT-V01…V05, V06 e RPT-N02**, e a auditoria particular `AUD-REPORTE-VALORIZACION-V1.md`.
3. Ler contratos pós-Inventario: `documentacao/v1/DEFINICAO-MENUS-INVENTARIO-V1.md`, o progresso dos commits de Stock/Depósitos/Reposición, `lib/stock/shared.ts`, `lib/inventario/decimal.ts` e fonte SQL dos movimentos/custos; checar o schema real versionado, a origem `inventario_costos`, `stock_saldos`, permissões, tipos, APIs e exportações da Valorización.
4. **Não reabrir, modificar ou implantar Inventario** por conveniência. Conciliar sem editar as regras da sua operação. Reutilizar módulos existentes de exportação/formatos; nenhum sistema duplicado.

## Contrato transversal: cinco relatórios distintos e obrigatórios

| Relatório | Dono único da informação | Não duplicar |
|---|---|---|
| **Valorización de inventario (PRIMEIRO)** | Valor de inventário próprio **a custo real**, por produto/depósito e agrupamentos financeiros; cobertura/pendências, exportação | Não tornar Stock ou Kardex outra valorização; não misturar quantidade heterogênea, preço de venda, lucro ou câmbio automático |
| **Stock general** | Foto **quantitativa** do estoque e relatório exportável por estado/lote/propriedade | Não repetir custo, valor financeiro e segundo painel operacional de Stock |
| **Kardex de movimientos** | Histórico auditável de eventos, entradas/saídas/transferências, saldo inicial/final/estornos | Não registrar movimentos (dono: Inventario > Movimientos), nem inventar custo histórico |
| **Stock crítico y reposición** | **Exceções exportáveis** e necessidades baseadas na **mesma regra** de Inventario > Reposición | Não ter segundo planejador, simulador ou política apenas global quando o operacional usa depósito |
| **Lotes y vencimientos** | Vencidos/próximos e situação por lote, depósito e propriedade, XLSX/PDF | Não duplicar Stock general ou inventar validade |

**Índice `/reportes`** é navegação, NÃO sexto relatório. Manter as cinco rotas obrigatórias e suas APIs. Reordenar/ocultar entrada redundante no sidebar **somente em uma rodada visual própria e com aprovação específica**, sem apagar a rota de índice. A prioridade visível de Valorización pode ser tratada dentro da página do relatório nesta primeira entrega.

## Primeira entrega autorizada: Valorización de inventario

**Estado inicial observado:** `lib/reportes/valorizacion.ts` usa `inventario_costos`, agrega dinheiro em `numeric` no PostgreSQL, mas soma quantidade/custo unitário sobre produtos heterogêneos, consulta total/contagem/linhas separadamente sem snapshot e mascara divergências de cobertura em grupos. `app/(private)/reportes/valorizacion/page.tsx` preserva `datos` antigo após falha; `lib/reportes/export-valorizacion.ts` reproduz colunas/totais sem semântica válida em visões agregadas. A origem `depositosPermitidos` em `stock-general.ts:57-64` filtra `d.activo`; **investigar saldo/custo residual histórico antes de alterar acesso a inativos** (RPT-V06).

### A. RPT-V01 — dinheiro é somável, quantidades heterogêneas NÃO

- Em **DETALLE produto×depósito** e **PRODUCTO**: apresentar `cantidad_valorizada` e `costoPromedio = round(valor_total/cantidad_valorizada,4)` se quantidade positiva, sem custo inventado. Respeitar unidade-base do produto (mostrar unidade se necessário). Se quantidade zero e valor residual, não gerar custo unitário.
- Em **DEPOSITO**, **CATEGORIA** e **TOTAL GENERAL**: somar somente **valor monetário da mesma moeda-base**, produtos/linhas e contagens de divergências. Não exibir custo unitário derivado de kg + unidade + litro e **não apresentar soma de quantidades heterogêneas como total financeiro com unidade**. Pode mostrar quantidades por produto em detalhamento, não como KPI aditivo misturado.
- Contrato TypeScript/API e XLSX/PDF deve refletir `no aplicable` para as métricas inválidas; não gerar 0 artificial nem mudar custeio transacional de Stock.

### B. RPT-V02 — consistência da fotografia por requisição

- Totais, `count`, linhas, metadados, moeda, catálogos de seleção e exportação de **uma mesma requisição** precisam ler um snapshot consistente. Empregar **uma conexão de PostgreSQL e transação `READ ONLY REPEATABLE READ`** quando suportado pela API existente, com `BEGIN`/`COMMIT`/`ROLLBACK`/`release` confiáveis; ou SQL de consulta única comprovadamente equivalente. Não adianta `BEGIN` em `db.query` se cada `Pool.query` usar outra conexão.
- Em exportação (até 50.000 linhas/413), assegurar que filas e totais tenham o mesmo instante lógico da requisição. **Tela e arquivo baixado depois são duas requisições diferentes**, podem ter snapshots distintos; mostrar `generado`/escopo no arquivo e UI. Não prometer fechamento contábil/histórico nem armazenar snapshots permanentes sem pedido.
- Garantir falha segura, autorização, isolamento por empresa e depósito, liberação de conexão em erro. Não tornar transação de leitura longa/bloqueante desnecessariamente.

### C. RPT-V03 — cobertura e divergência não podem se compensar

- Classificar **por produto×depósito antes de agrupar**, comparando físico próprio `stock_saldos` e `cantidad_valorizada` de `inventario_costos`.
- Mostrar distinguivelmente **sin costo** (saldo físico próprio positivo sem quantidade valorizada), **parcial** (quantidade física > valorizada), **excedente valorizado** (valorizada > física), **resíduo financeiro sem quantidade** (quantidade valorizada 0 e valor não zero), e **con costo** (cobertura coerente). A classificação deve respeitar filtros e tratamento de negativos/zero, sem valorizar terceiros ou trânsito inventado.
- Total geral e grupos devem expor **contagens e magnitudes não compensadas** por tipo. Ex.: depósito A difere +5 e B -5 para mesmo produto: somar 0 líquido NÃO permite mostrar `Con costo`.
- O reporte detecta, NÃO corrige fisicamente nem contabilmente. Não transformar ausência de custo em custo 0 e não esconder divergência ao alternar vista.

### D. RPT-V04, RPT-N02 — confiança da consulta e permissão de exportação

- Resposta 401/403/500, JSON malformado, erro de rede ou filtro alterado não pode deixar resposta **antiga** como se fosse atual. Bloquear uso de dados velhos/exportação desatualizada; preservar filtros, oferecer retry. Usar padrão de compuerta última resposta e validação confiável já existente nos menus estabilizados; evitar outra implementação paralela.
- `REPORTES.VER` para consulta, `REPORTES.EXPORTAR` para download, **enforced no servidor** e coerente com ações visíveis da UI; não exibir exportação funcional que inevitavelmente resultará em 403 para usuário só com VER. Reutilizar contexto de permissão existente, sem dar acesso a administrador plataforma ou outro `empresa_id`.
- Exportar com **os filtros efetivamente confirmados** e preservar rótulos/versão/escopo para auditoria; manter Excel e PDF oficiais. Não oferecer exportação de uma resposta cujo filtro ficou inválido.

### E. RPT-V05 — precisão de quantidades; dinheiro exato

- Montantes monetários em `numeric`/string do SQL até renderização/exportação, conforme helpers já aprovados; **sem `float8`/Number para dinheiro**.
- Quantidades físicas e valorizadas podem ter frações; evitar conversões que distorçam quantidades expressas a alta precisão, especialmente onde são comparadas a custos. Não somar quantidades de **unidades incompatíveis**. Testar valores grandes e frações e preservar a forma original do produto.
- Comparar custo unitário por produto com Stock e sua regra de arredondamento 4 casas; para discrepância legítima de escopo/deposito/horário, explicar claramente, sem alterar o motor do inventário.

### F. RPT-V06 — depósitos inativos, histórico e limite do acesso (investigação condicionante)

- `lib/reportes/stock-general.ts:57-64` fornece `depositosPermitidos` só com `d.activo`. Já Stock/Movimientos permitem consultar histórico inativo nas condições aprovadas da NEX-046. Verificar se `inventario_costos` pode reter **valor_total != 0` e quantidade 0` em depósito inativo (ou outro saldo de custo residual) e se total financeiro atual deve incluí-lo quando o usuário tem alcance legítimo. **Não afirmar presença real de resíduos sem PostgreSQL**.
- Só modificar a regra compartilhada de depósitos se isso for **seguro e necessário**, após conferir `usuario_puede_deposito`, NEX-046 e guardas de dados históricos; não ampliar acesso indevido nem alterar Stock general, Kardex e Lotes incidentalmente. Se a política atual não consegue incluir com segurança inativos, registrar limitação e **não maquiar o total como completo**. Isolamento empresa/usuário sempre obrigatório.

## Testes mínimos e critério de parada

- **T01** dois produtos mesma categoria/depósito: um em UNIDAD e outro em KG/LITRO; total monetário soma, custo médio e quantidade geral heterogênea mostram não aplicável.
- **T02** produto com vários depósitos e moedas base: valor exato por produto e depósito, total e exportação; sem misturar empresas/moedas.
- **T03** 0 custo, custo parcial, excedente, resíduo com 0 quantidade mas valor não zero, -5/+5 que se compensam em agregado; exibir divergências em TOTAL, CATEGORIA, DEPOSITO e PRODUCTO.
- **T04** transação concorrente muda `inventario_costos`/saldos entre SELECTs simulados; com conexão/snapshot fixo resultados dentro da mesma consulta permanecem coerentes; teste real de isolamento PostgreSQL fica para o responsável; testes locais de mocks NÃO provam serialização real.
- **T05** acesso: outra empresa, usuário restrito a 1 depósito, VER sem EXPORTAR, sem VER, administrador plataforma, depósito fora do alcance, e 401/403/503.
- **T06** erro de rede, HTTP, 200 malformado, trocar filtros rápido, retry, impedir exportar ou exibir dados antigos; 375/768/1440 evidencia visual apenas se navegador permitido/disponível; não inventar screenshots.
- **T07** exportação XLSX/PDF com os mesmos dados sem duplicação/paginação indevida; 50.000 linhas e HTTP 413, números grandes em texto exato, moeda/base e data/escopo no cabeçalho; não exceder RAM desnecessariamente.
- **T08** conciliação `inventario_costos` vs saldo próprio de Stock, reversões, lotes, depósito inativo residual: **sem correção automática nem escrita**; regressões nas bibliotecas compartilhadas de reportes afetadas.

**Validação de código autorizada:** helpers puros e testes, TypeScript `tsc`, ESLint dos arquivos alterados, `next build`, suíte de regressão pertinente e geradores de arquivo sem dependência de ambiente real. Registrar números **efetivamente executados**, diferenciando mocks/análise estática de rotas/SQL, e pendências.

**Limites:** projeto com **um único ambiente operacional real**, sem staging. **Claude NÃO acessa VM, Docker ou PostgreSQL real, NÃO executa migrations nem faz deploy.** Se surgirem mudanças estruturais indispensáveis e **justificadas**, criar migration SQL **incremental NOVA**, versionada no Git junto ao código (conforme protocolo), sem modificar migration aplicada nem executar SQL; a numeração deve ser descoberta na branch atual. Respeitar NEX-052/053 relatadas não aplicadas até verificar ledger real. Não pedir ao usuário dados/documentos já disponíveis no Git.

**Entrega:** implementar exclusivamente Valorización de inventario, com commits próprios do relatório e eventuais helpers/transações compartilhadas apenas quando estritamente exigidos; manter os demais quatro relatórios funcionando, sem reimplementá-los. Atualizar progresso sucintamente, não editar arquivos `AUD-*` de autoria ChatGPT. Publicar SHAs completos, resultados, pendências; **PARAR PARA AUDITORIA DO CHATGPT**. Nenhuma tela/relatório será homologado sem validação funcional no ambiente real pelo responsável.

## Próximas entregas mapeadas, NÃO iniciadas automaticamente

Após aceite estático de Valorización, reavaliar `AUD-REPORTES-INTEGRADA-V1-2026-10-13.md` e, mediante nova autorização do responsável:
1. **Stock crítico y reposición:** alinhar fórmula de `stock-critico` ao cálculo já estabilizado por depósito de `lib/reposicion/calculo.ts`; preservar seu único papel de relatório exportável, sem segunda simulação de compra/transferência.
2. **Stock general:** verificar que é exclusivamente quantitativo e que filtros, depósitos, lotes/terceiros, estados e XLSX/PDF permanecem corretos, sem nova valorização.
3. **Kardex:** conciliar histórico com Movimientos e Stock, contramovimentos e saldo inicial/final, sem confundir registro físico com relatório.
4. **Lotes y vencimientos:** conservar validade, horizontes e estado/propriedade por lote; evitar duplicar Stock general.
5. **Navegação global:** índice `/reportes` não deve parecer sexto relatório; reordenar principal e remover somente redundância de menu se o responsável aprovar o recorte visual concreto.

**Nenhuma alteração atual de código, SQL, VM ou deploy por esta ordem; apenas autorização para o Claude fazer a primeira implementação posteriormente.**
