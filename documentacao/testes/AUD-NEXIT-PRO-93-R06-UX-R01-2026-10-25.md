# Auditoria independente — PRO-93-R06 / PRO-128 — R01 (25/10/2026)

**Resultado: NÃO CONFORME PARA ACEITE INTEGRAL DA R06 (2 pendências de apresentação em mobile).** O objetivo desktop foi atendido no código, mas não há garantia de leitura completa de produtos com descontos/descrição extensa em celular. **NENHUM teste ou navegador foi executado.**

- Repositório: `proceit-tech/distribuidora`; branch `feature/NEXIT-2026-001-banco-demo`.
- Commit funcional auditado: `4cdcbf75dee6e0912360f05e3ee9ae32991b5e59` (somente `app/(private)/facturas/nueva/page.tsx` e `page.module.css`).
- Critério: `documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-93-R06-UX-RESUMEN-PRODUCTOS-2026-10-25.md`, decisões P1, P2, P5, P6, P8 e P9.
- Método: leitura do diff funcional e dos arquivos TSX/CSS completos; inspeção da cascata CSS, dos estados do componente `InfoAdicionalResumen` e do markup dos preços/descontos. **Sem execução de código, testes, screenshot, deploy ou alteração de ambiente.**

## A. Conformidades identificadas estaticamente

1. **Escopo:** somente TSX/CSS de Nueva factura. Nenhum diff em API, cálculos, `dInfAdic` fiscal, JSON, estoque, migrações, KuDE, fornecedor ou SIFEN. Não interpretar ausência de diff como teste de não regressão.
2. **P1:** `.modalResumen` chega a `min(1280px,100%)`; `.resumenTabla` passa a `overflow:visible` sem altura própria; `.itemsResumen` usa largura total e `table-layout:fixed`. Mantidos cabeçalho, cartões, pagamentos, totais e ações de revisão.
3. **Rolagem:** `.resumenCuerpo {overflow-y:auto}` continua scroller vertical do conteúdo, enquanto a tabela deixa de criar um scroller independente. Não há prova de apresentação real em browser.
4. **P8:** CSS R06 atribui `position:sticky; top:0` aos `th` e remove o `overflow-x:auto` que interferia no ancestral de scroll. Implementação **coerente estaticamente**, mas efetiva fixação e posicionamento dependem de navegador; não homologado.
5. **P9:** novo `InfoAdicionalResumen` apresenta prévia e botão `Ver texto completo/Ver menos`, com `aria-expanded/controls`. Texto original segue renderizado integralmente ao expandir, sem alterar envio.
6. **P2/P5:** `Búsqueda avanzada`, Enter, scanner e seleção não constam do diff; a R05 mantém campo e botão em uma fila com mensagem abaixo.

## B. Achados que impedem o aceite integral

### F001 — MÉDIA/BLOQUEANTE UX: `Precio (IVA incl.)` com descontos vira vários itens flex em um único campo de largura estreita

**Fonte:** `page.tsx:1567–1571` e `page.module.css:2260–2308`.

A célula do preço tem texto numérico seguido, opcionalmente, por um ou **dois** `<span className={estilos.modificado}>` (desconto e preço alterado). Em `max-width:720px`, `td {display:flex;justify-content:space-between;gap:8px}` aplica flex tanto ao rótulo gerado por `::before` quanto ao texto de preço e aos spans de detalhe. Assim os detalhes passam a ser **itens irmãos de flex** e disputam o mesmo espaço horizontal, dentro de um `tr` com **duas colunas**. O `display:block` de `.modificado` não agrupa filhos em um só bloco quando o pai é flex. Em celulares estreitos não há uma estrutura que garanta sequência vertical preço → desconto → preço alterado; pode haver esmagamento, quebra errática ou transbordamento.

**Correção focal:** preservar rótulo e informação fiscal, mas fazer o campo preço ter um **agrupamento de conteúdo** vertical separado do rótulo, ou layout mobile específico `display:block` com rótulo acima e detalhes empilhados abaixo. Não reimplementar cálculo nem alterar textos/valores. Verificar estaticamente os três casos: preço simples; desconto; desconto + preço modificado.

### F002 — MÉDIA/BLOQUEANTE UX: descrição de produto longa continua truncada sem mecanismo adequado em celular

**Fonte:** `page.module.css:1578–1584` mantém `.resumenTabla .prod strong { display:-webkit-box;overflow:hidden;-webkit-line-clamp:2 }`; `page.tsx:1560–1563` só traz `title={l.descripcion}` como possível acesso ao texto integral. A apresentação em até **duas linhas** pode ocultar parte da descrição; o atributo `title` não é método confiável para consultar texto longo por toque. A R06 exige que produto e dados continuem consultáveis e que detalhes longos não desapareçam em celular.

**Correção focal:** disponibilizar a descrição integral em celular, preferencialmente com quebra normal e altura natural da primeira célula (sem `line-clamp` no resumo), ou expansão explícita acessível que não edite dados. Não tocar lista principal de produtos nem os valores de `l.descripcion`.

## C. Observação de baixa prioridade (não bloqueante isoladamente)

### O001 — Contagem de caracteres e prévia em textos Unicode com pares substitutos

Em `page.tsx:469–470`, `largo` usa `texto.length` (unidades UTF-16) e `previa` usa `Array.from(texto).slice(0,160)` (pontos de código). Um texto composto por 100 emojis tem `length=200`, mas `Array.from(texto).length=100`: o botão de expansão aparece mesmo que a prévia contenha o texto inteiro, acrescido de `…`. Recomenda-se usar um critério coerente para identificar conteúdo realmente encurtado, sem mudar o texto enviado nem criar regras fiscais. **Não converter isso em uma nova frente de desenvolvimento.**

## D. Pontos que continuam exclusivos do navegador do responsável

- Efeito efetivo do cabeçalho sticky no scroll de `.resumenCuerpo`, incluindo a observação declarada pelo Claude sobre `top:0` / padding de 12px, e cabeçalho não se sobrepor aos dados.
- Layout com 0, 1, 20 e 100 itens, desconto + alteração de preço, descrição longa, moeda e valores grandes, texto adicional curto/longo; 1366×768, 1440×900, 1698×864, celular e zoom.
- Rodapé `Volver a editar / Enviar factura`, foco, Tab/Escape e leitura da informação adicional por teclado.
- Sem evidência de que ambiente real executa este SHA; não alegar homologação ou deploy.

## E. Decisão e gate

- **PRO-93 e PRO-128:** permanecem `In Review`. **PRO-115:** aceite humano pendente. **PRO-194:** não envolve esta R06.
- **Não aprovar integralmente a R06 ainda.** Corrigir somente F001 e F002, e O001 se couber no mesmo patch mínimo; preservar todas as conformidades de R05 e R06.
- Nenhuma autorização para testes, lint, build, CI, VM, migrations NEX-072/073/074, gateway, SIFEN, browser ou deploy. Claude: corrigir, commit/push, fornecer SHAs e **PARAR para reauditoria ChatGPT**.
