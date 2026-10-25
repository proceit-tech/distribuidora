# ORDEM CLAUDE — PRO-128 · Nova factura electrónica · Reparação de UX da tela (25/10/2026)

**Responsável:** definição visual a partir de captura real do responsável (25/10/2026). **Implementador:** Claude. **Auditoria:** ChatGPT após commit.  
**Repositório:** `proceit-tech/distribuidora`. **Branch:** `feature/NEXIT-2026-001-banco-demo`.  
**Issue ÚNICA:** `PRO-128` (já existe, In Review). Relacionada à UX `PRO-93` e aceite humano `PRO-115`; não criar issue repetida.

## 0. Problema observado, sem atribuir versão de deploy sem prova

A captura recebida pelo responsável (25/10/2026, `Nueva factura electrónica`, viewport ~1698×864) mostra:
- faixa branca de resumo/totais deslocada, flutuando no **rodapé à esquerda**, ocupando espaço e **cobrindo a área de Descuento general / trecho inferior do detalhe**; grande faixa vazia à direita;
- componente inferior com total + IVA + expansão de impostos + pendências + ações distribuídos em várias linhas, altura desnecessária;
- tabela com cabeçalho `Unida / d` por falta de largura, além de título do preço quebrado em três linhas;
- formulário composto de cartões altos e espaçamentos que tornam a emissão lenta e visualmente pesada, mesmo sem um único produto.
- `0 ítems` na imagem; comportamento com 20 e 100 ainda exige cuidado.

**Causa ESTÁTICA no Git:** `app/(private)/facturas/nueva/page.module.css` ao final define `.colUnidad { width: 56px }` e `.itemsCompacta td, th { overflow-wrap: anywhere }`; `.barraResumen {position:sticky;bottom:0;display:flex;flex-wrap:wrap}`, `.barraPanel {position:absolute;bottom:calc(100% + 14px)}`. O JSX `app/(private)/facturas/nueva/page.tsx` renderiza `.barraResumen` após a área principal. A estrutura atual já pretende ocupar 100% da largura e **não tem painel lateral**; existem regras CSS antigas de `.workspace` grid 340px na parte superior do arquivo e sobrescritas mais recentes no rodapé. Isso requer revisar **ordem de cascata, largura de containers e compatibilidade com assets efetivamente servidos**, não recriar a FE.

**Cuidado com evidências:** a captura da conversa não informa o SHA do deploy. A captura demonstra um defeito visual na tela mostrada, mas **não prova qual build/stylesheet a VM está servindo**. Não inventar essa informação, não acessar VM sem autorização; diagnosticar o CSS branch e entregar como verificar o SHA/assets no ambiente quando o responsável autorizar.

## 1. Objetivo de design

Uma interface de emissão **profissional, compacta, legível, responsiva em desktop, orientada a registrar muitos produtos**, sem painel lateral permanente, sem modal de totais flutuando na área de edição, sem rolagem interna da tabela e sem sacrificar controles fiscais/comerciais.

O **rodapé de resumo** pode permanecer visível (sticky/dock integrado), como preferência já expressa pelo responsável, mas deve parecer **uma barra alinhada à mesma largura útil dos cartões**, **não uma janela sobreposta cobrindo campos**. Se sticky não permitir essa garantia em alguma largura/altura, usar fallback **em fluxo normal da página**. **A modal de revisão final** (`Resumen de la factura` após clicar `Revisar y confirmar`) é outro componente e deve ser preservada.

## 2. Intervenção localizada — CSS + JSX somente se necessário

Arquivos para ler por inteiro antes de alterar:
- `app/(private)/facturas/nueva/page.module.css`;
- `app/(private)/facturas/nueva/page.tsx`;
- componentes já utilizados em Cliente/Produto/Pago/Fiscal apenas para assegurar compatibilidade; não redesenhar seus fluxos ou APIs;
- `CLAUDE.md`, `PROGRESSO-NEXIT-V1.md`, `documentacao/analises/DIAG-NEXIT-FE-NUEVA-FACTURA-UX-DIRECCION-KUDE-2026-10-25.md`, e `PRO-128`.

Correções exigidas:
1. **Rodapé integrado, em largura total.** O resumo e as ações devem usar a mesma largura dos cartões e da tabela, não largura estreita à esquerda, sem uma faixa vazia à direita. Rever `.workspace`, `.barraResumen`, containers e cascata de regras antigas. Não compensar com números mágicos vinculados ao tamanho da screenshot.
2. **Nada encoberto.** Ao rolar a página, campos `Descuento general`, `Forma de pago`, `Observaciones`, linhas de produtos e botões permanecem inteiramente acessíveis/visíveis. A altura real do dock precisa ser considerada no fluxo, na rolagem e no foco (inclusive teclado); `scroll-margin-bottom:110px` não é garantia se a barra cresce. Preferir uma faixa inferior compacta **~64–80px em desktop 1440**, uma linha para totais/estado/ações quando houver largura; se não, quebrar responsivamente com área reservada, não sobrepor.
3. **Detalhes sem overlays invasivos.** `Detalle de impuestos` e `Pendientes de validación` devem expandir numa região **em fluxo, sem popup absoluto escondendo produto/campo nem jogar a barra sobre o formulário**. Mostrar só texto sintético (ex. `2 pendientes`) até abertura, mantendo o conteúdo das mensagens e acessibilidade. Não esconder o motivo de `Revisar y confirmar` estar desabilitado.
4. **Tabela legível e focada em produtos.** Ajustar `colgroup` / CSS para `Producto` dominar a área flexível; rótulo `Unidad` INTEIRO, não `Unida/d`. Mínimo útil da coluna de unidade ~80px desktop; alinhar `Cantidad`, `Precio`, `Descuento`, `Subtotal` com números tabulares e espaço de edição. Evitar `overflow-wrap:anywhere` nos cabeçalhos e valores monetários; limitar apenas texto longo de produto/GTIN com duas linhas + title/tooltip. Usar nome fiscal/agrupamentos corretos; não omitir unidades nem IVA.
5. **Sem scroll vertical interno na tabela.** Com 1, 20 ou 100 produtos, todos fazem parte do formulário e o **único scroll vertical é o da página**. Não paginar de modo que itens não sejam mantidos na edição; não ocultar ações. Em desktop homologável (1366×768, 1440×900 e viewport grande da imagem), sem scroll horizontal interno; numa largura efetiva menor com sidebar usar adaptação responsiva explícita que mantenha códigos, quantidade, preço, total e ações utilizáveis. Não reduzir fonte a ponto ilegível.
6. **Compactação do formulário sem esconder campos.** `Operación` em grid bem proporcionado (Sucursal/Punto com espaço suficiente e ajuda `Próximo N.º` discreta, Condición/Moneda/Tipo/Presencia sem truncamento); `Cliente` pesquisa clara, selecionado compacto; busca de produto acessível logo antes da tabela, leitor/Enter preservados. Altura dos cartões ditada pelo conteúdo, sem grandes faixas vazias. Painéis condicionais (Crédito e Fiscal) continuam alcançáveis. Evitar introduzir sidebar/resumo de 340px.
7. **Hierarquia financeira.** `Total general` é a maior informação no dock; IVA e descontos secundários; `Revisar y confirmar` primário sempre acessível; `Cancelar` secundário. Não repetir um grande painel vazio; não abrir modal em toda alteração.
8. **Design da mesma família NEXIT.** Fundo e bordas discretos, espaçamentos consistentes, hierarquia tipográfica sóbria; textos es-PY. Não acrescentar sombras/cores/cards decorativos sem função, nem substituir componentes existentes por mockups.

## 3. Proteções FUNCIONAIS (não tocar)

- Preservar todos os estados React/ações, idempotência/duplicidade, fluxo da FE, preview e confirmação final; nenhum botão decorativo, nenhum `setState` perdido, nenhuma confirmação removida.
- NÃO mexer em `lib/facturacion/*`, APIs, SQL, migrations, tabelas, estoque, kardex, entrega, vendedor, contas, SIFEN, gateway ou KuDE nesta correção de layout.
- Preservar `OPCIONES_IVA`, `EditorFiscalItem`, desconto por item e geral, moeda, câmbio, crédito a prazo, formas de pagamento, permissões por ação, dados de cliente, auto foco/leitor/código, preço, unidade, pagamento, total e listagem inteira.
- A regra do fornecedor SIFEN está **CONFIRMADA pelo responsável**: códigos numéricos geográficos e API busca descrições na base SIFEN; **NÃO voltar a questionar ou alterar contrato fiscal**. PRO-322 mapeamento estaticamente conforme; PRO-205/324 é bug operacional de ID de entrega em reintento, **fora do escopo**.
- Modal `Resumen de la factura` de REVISÃO ANTES DE ENVIAR mantém verificação e segunda confirmação, separada do dock de totais.
- Nenhuma autorização de deploy, testes manuais, lint, typecheck, build, CI manual, acesso VM/PG, gateway, emissão fiscal ou alteração de testes (gate FE V1). NÃO tocar `NEX-072`/E03.

## 4. Critérios de aceite de interface

**A. 0 itens (captura atual):** na mesma resolução, título, Operación, Cliente, buscador de Produto e tabela vazia ficam alinhados; unidade sem quebra; desconto geral completamente visível ao acessar; dock na largura útil, **sem sobreposição**, sem janela flutuante no canto esquerdo.

**B. 1 item:** Produto código/descrição legíveis; IVA, unidade, quantidade, preço, desconto e subtotal editáveis e alinhados, inclusive número longo de PYG; dock não cobre linha.

**C. 20 itens:** scroll só do documento; linha 20, descontos, pagamento, observações e botão podem receber foco e edição sem ficarem escondidos sob o dock; leitor/Enter sem regressão; total visível.

**D. 100 itens:** não há rolagem interna do corpo de itens, modal operacional lateral nem controles cortados; estado de todas as 100 linhas permanece em memória/edição; dock não impede acesso à última linha.

**E. Layout:** revisar mentalmente/por CSS as larguras 1366×768, 1440×900, 1698×864 e conteúdo efetivo menor com sidebar. Sem alegar screenshots ou browser realmente verificados se não executados; prova visual do ambiente aguarda autorização. UI em espanhol PY e teclado acessível.

**F. Sem regressão:** valores de PYG/IVA/câmbio/desconto/revisão são os mesmos do código anterior, nenhuma linha perdida.

## 5. Execução e resposta de Claude

Implementar **SOMENTE PRO-128 neste passo**; comparar todos os CSS/JSX completos antes/depois. Fazer o **menor diff sustentável** removendo/neutralizando conflito de cascata do layout anterior e mantendo comportamentos. Se conclusão for que a captura não condiz com CSS branch, **não mascarar com novo CSS arbitrário**: corrigir apenas problemas comprovados no código (a coluna de 56px e o risco de popup/overlap) e registrar como verificar versão deploy, sem acesso à VM.

**SEM** testes, lint/typecheck/build, screenshot automatizada, SQL, VM, gateway ou emissão real, por gate atual. Fazer commit e push na branch oficial com SHA funcional **somente após revisão estática**, e **PARAR para auditoria ChatGPT**. Não marcar PRO-128 Done/homologada visualmente.

**Resposta obrigatória:** SHA, lista de arquivos modificados, diff/justificativa de `Unidad`, dock/reserva de espaço, detalhes/pendências, tabela sem scroll interno, CSS responsivo, confirmação da preservação da modal final e dos comportamentos, limitação de versão do ambiente e lista de verificações visuais pendentes. Não iniciar PRO-323, PRO-205, PRO-324 ou qualquer outra tarefa.
