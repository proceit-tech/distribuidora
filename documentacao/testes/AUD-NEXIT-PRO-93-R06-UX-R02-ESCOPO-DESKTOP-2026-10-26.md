# Retificação de escopo e reauditoria estática — PRO-93-R06 / PRO-128 (26/10/2026)

**Parecer: CONFORME ESTATICAMENTE QUANTO À IMPLEMENTAÇÃO DOS AJUSTES AUTORIZADOS PARA COMPUTADOR; ACEITE VISUAL PELO RESPONSÁVEL AINDA PENDENTE.** A reprovação R01 por UX **mobile** estava fundamentada em requisito não solicitado pelo responsável. Os bloqueios F001/F002 daquele relatório NÃO devem impedir o aceite da interface desktop nem originar outra ordem.

## Esclarecimento vinculante do responsável

> “quem disse que estamos fazendo sistema para celular??”

O responsável confirmou que **não pediu desenvolvimento para celular nesta etapa**. ChatGPT introduziu por iniciativa própria cenários mobile na ordem R06, transformou-os em requisitos bloqueantes R01 e emitiu a correção R06-C01. **Isto foi um erro de análise e delimitação de escopo do ChatGPT**, não uma decisão do responsável. Não reiterar esses critérios ou ordenar novas adaptações mobile.

**Escopo autorizado da PRO-93-R06:** reorganização das informações do diálogo `Resumen de la factura` em computador; área de produtos maior, aproveitamento da largura da janela e dos monitores; cabeçalhos de tabela visíveis ao rolar 20/100 produtos; prévia de `Información adicional` expandível; `Búsqueda avanzada` apenas alinhamento. Enter/scanner, cálculos, JSON fiscal, `dInfAdic`, KuDE, fornecedor, gateway, estoque, SQL, migrations e perfis intocados.

## Commits e leitura do código

- **R06:** `4cdcbf75dee6e0912360f05e3ee9ae32991b5e59`: somente `app/(private)/facturas/nueva/page.tsx` e `page.module.css`. A modal passa a até 1280px; grupos superiores continuam naturais; a tabela ocupa largura útil, sem segunda rolagem vertical; cabeçalhos têm `position:sticky` ligado ao corpo rolável; `Información adicional` apresenta prévia expansível; `Búsqueda avanzada` não foi alterada.
- **R06-C01:** `275e19aaa9c9d341a5ea9ac70e4369d861e3010f`: somente os mesmos dois arquivos; `precioResumen` agrupa preço e detalhes verticalmente **também no desktop**, alinhados à direita; a descrição deixa de sofrer `-webkit-line-clamp:2` dentro do resumo e pode ser lida integralmente; `InfoAdicionalResumen` usa a mesma métrica Unicode para limite, prévia e contador. O commit inclui CSS `@media (max-width:720px)` por exigência indevidamente criada anteriormente. **A presença desse código não autoriza exigir, homologar ou expandir uma experiência mobile.** Nenhuma alteração adicional é necessária por causa do celular.
- A estrutura da tabela em cartões abaixo de 720px já havia sido adicionada na R06 original por iniciativa de análise. Não reescrever, remover ou desenvolver novamente apenas por isso sem ordem específica do responsável.

## Resultado e limites

1. **P1 — reorganização e maior largura da tabela:** conforme na leitura estática. Aumentar para 1280px e `table-layout:fixed` redistribui a largura de desktop; não há teste de tela real.
2. **P8 — títulos fixos:** solução CSS coerente estruturalmente; **não é possível declarar funcionamento real** do `sticky`, do alinhamento de colunas ou dos títulos em viewport sem navegador. A decisão de aceite pertence ao responsável.
3. **P9 — Informação adicional:** botão `Ver texto completo/Ver menos`, prévia e contador consistentes; campo fiscal de origem não foi alterado.
4. **P2 — alinhamento Búsqueda avanzada:** componente da R05 preservado.
5. **C01 — impacto desktop:** preço e descontos usam contêiner vertical alinhado à direita, sem modificar expressões ou valores; descrição integral pode aumentar a altura de uma linha longa, o que é trade-off de UX, não regressão comprovada. Confirmar visualmente quando o responsável examinar.
6. **R01 F001/F002:** resolução mobile não é gate; foram corrigidos no código, mas a exigência original **não era autorizada**. **O001** normalizado sem impacto fiscal.
7. **NÃO executado:** tests, lint, typecheck, build, browser, VM, SQL, migrations, integrações externas, transmissão ou deploy. Não inferir que o ambiente real contém os commits.

## Gate e próxima etapa

- **Nenhuma ordem ativa de desenvolvimento derivada de R06/R06-C01.** Não criar R06-C02 nem outro ticket mobile.
- **PRO-93 e PRO-128:** `In Review` até inspeção da interface desktop pelo responsável. **PRO-115:** `Todo`, gate de aceite visual desktop. **PRO-194:** sem alteração.
- A validação pelo responsável cobre a janela em computador, especialmente 1366×768, 1440×900 e 1698×864, com 1/20/100 itens, títulos no scroll, organização dos preços/descontos, descrições longas, prévia adicional e rodapé. Não exigir celular.
- Não editar código, não executar build, VM ou deploy por causa desta retificação de escopo. Registrar qualquer defeito real de desktop que o responsável mostrar antes de nova ordem.

**Este registro retifica o escopo da auditoria R01, preservando-a apenas como histórico, e prevalece sobre a ordem já executada R06-C01.**
