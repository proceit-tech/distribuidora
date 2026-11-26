# ORDEM FOCAL — PRO-93-R06-C01 / PRO-128 — fechar auditoria estática R01 (25/10/2026)

> **HISTÓRICO EXECUTADO — NÃO EXECUTAR NOVAMENTE (26/10/2026):** esta ordem foi emitida pelo ChatGPT com base em exigências mobile que o responsável NÃO solicitou. Claude executou no SHA `275e19aaa9c9d341a5ea9ac70e4369d861e3010f`. Não há nova tarefa mobile nem obrigação de ampliar responsividade. [Parecer de retificação R02](../testes/AUD-NEXIT-PRO-93-R06-UX-R02-ESCOPO-DESKTOP-2026-10-26.md).

**Branch única:** `feature/NEXIT-2026-001-banco-demo`. **Commit funcional auditado:** `4cdcbf75dee6e0912360f05e3ee9ae32991b5e59`.

**LEITURA INICIAL OBRIGATÓRIA (integrais):** `CLAUDE.md`, `documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-93-R06-UX-RESUMEN-PRODUCTOS-2026-10-25.md`, `documentacao/testes/AUD-NEXIT-PRO-93-R06-UX-R01-2026-10-25.md`, Linear PRO-93/128/115 e arquivos COMPLETOS `app/(private)/facturas/nueva/page.tsx` / `page.module.css`. Conferir a cascata inteira ANTES da edição; revisar integralmente os dois arquivos DEPOIS.

## Só duas correções de interface, sem regra fiscal nova

### F001 (média, bloqueante UX) — preço/desconto no celular

- `page.tsx:1567–1571`: preço base como texto seguido de spans opcionais de desconto e preço modificado. `page.module.css:2282–2289`: `td {display:flex;justify-content:space-between}` em max 720px.
- O rótulo CSS `::before`, o preço e os spans viram itens flex separados dentro de UMA célula estreita (grid mobile com 2 colunas), causando hierarquia frágil e potencial transbordamento.
- Corrigir **somente a célula de preço da TABELA DO RESUMO**, de modo que `Precio (IVA incl.)`, valor, desconto e referência à lista sejam claros e apareçam em sequência vertical ou agrupamento valor/detalhes que não competem horizontalmente. Permitir wrapping natural e largura do bloco quando necessário; não ocultar conteúdo.
- Preservar a estrutura de cartões mobile para as demais células. Verificar estaticamente preço simples, desconto, preço modificado, ambos, valores longos e IVA parcial. **Não alterar desconto/cálculo.**

### F002 (média, bloqueante UX) — descrição longa oculta

- `page.module.css:1578–1584`: `-webkit-line-clamp:2` mantém descrições do produto cortadas em 2 linhas dentro do resumo, inclusive mobile; `title` não oferece leitura confiável por toque.
- Na modal `Resumen de la factura`, permitir visualização integral de descrições extensas sem precisar hover nem acessar editor. Preferir remover o clamp SOMENTE no resumo e manter quebra de linha/altura natural; alternativa expansível acessível se tecnicamente justificada. **Não mudar descrição original, código, valores, tabela de edição principal ou produto.**

## Observação opcional, sem ampliar escopo

- O001: coerência de `InfoAdicionalResumen` para caracteres Unicode fora de BMP. Atualmente `texto.length` determina se há corte, mas `Array.from(texto).slice(0,160)` mede outra unidade. Corrigir apenas se for trivial e sem alterar o texto original nem `dInfAdic`. Não transformar em nova funcionalidade.

## Preservações obrigatórias

- **R05 + R06:** modal até 1280px, cartões compactos, **UMA rolagem vertical** em `.resumenCuerpo`, rodapé fixo fora do scroller, tabela sem rolagem própria, cabeçalho `sticky` ligado ao scroller do corpo, `Información adicional` prévia expansível. `Búsqueda avanzada` já está alinhada: **não tocar**.
- **KuDE e fornecedor FORA DO ESCOPO**; Enter/scanner intactos. Não modificar cálculos, JSON fiscal, `dInfAdic`, payload, gateway, endpoints, credenciais, estoque, SIFEN, NCE, usuários, perfis, SQL/migrations, dados. Rótulos UI somente em espanhol.
- Não criar nova issue nem mudar estado para Done.
- Nenhum teste, lint, typecheck, build, CI, browser, SQL, VM, API externa, SIFEN ou deploy autorizado. Não inventar homologação. Não alterar ambiente.

## Entrega

Patch mínimo somente nos dois arquivos indicados se necessário; commit + push na branch oficial; SHAs completos, trechos/linhas afetados, demonstração estática do agrupamento preço/desconto e descrição integral, riscos de browser. **PARAR para reauditoria independente do ChatGPT.**
