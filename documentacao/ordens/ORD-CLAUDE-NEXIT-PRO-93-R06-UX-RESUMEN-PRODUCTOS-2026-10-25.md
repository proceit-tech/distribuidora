# ORDEM ATIVA — PRO-93-R06 / PRO-128 — Resumen de la factura: prioridade aos produtos (25/10/2026)

> **HISTÓRICO EXECUTADO — ESCOPO CORRIGIDO (26/10/2026):** implementação original entregue em `4cdcbf75dee6e0912360f05e3ee9ae32991b5e59`, complemento C01 em `275e19aaa9c9d341a5ea9ac70e4369d861e3010f`. Os cenários celular/mobile inscritos nesta ordem foram criados indevidamente pelo ChatGPT; **não representam decisão do responsável e não compõem os critérios de aceite**. O foco é desktop. Ver [AUD-R06-R02](../testes/AUD-NEXIT-PRO-93-R06-UX-R02-ESCOPO-DESKTOP-2026-10-26.md). Não reexecutar.

**Origem:** decisões explícitas do responsável após reauditoria R05 (P1–P10).  
**Repo:** `proceit-tech/distribuidora` — **branch única:** `feature/NEXIT-2026-001-banco-demo`.  
**Estado:** AUTORIZADA PARA IMPLEMENTAÇÃO DE CÓDIGO PELO CLAUDE, SEM EXECUÇÃO DE TESTES/BUILD/VM/DEPLOY. **Parar após commit e push para auditoria independente do ChatGPT.**  
**R05:** implementada nos commits `4cc5f0c02dd5f604c9bf614ca07aef114aebf3fb` e `dada93410d3bc1b6efca40fdfb93765ec5076dec`, auditada ESTATICAMENTE em `documentacao/testes/AUD-NEXIT-PRO-93-R05-UX-2026-10-25.md`. **Preservar.** A R06 é melhoria expressamente aprovada, não reprovação da R05.

## 0. Procedimento obrigatório antes de editar

1. Sincronizar a branch oficial, verificar HEAD e working tree, ler **integralmente** `CLAUDE.md`, esta ordem, o relatório R05 e as issues Linear PRO-93, PRO-128 e PRO-115. PRO-194 apenas como limite de não alteração.
2. Ler os **arquivos completos**, não apenas trechos: `app/(private)/facturas/nueva/page.tsx` e `app/(private)/facturas/nueva/page.module.css`; conferir as dependências de estilos/composição estritamente necessárias antes de editar (ex.: `components/ui/lista-padrao/lista.module.css`). Revisar o resultado inteiro ao final.
3. Não partir de CSS antigo nem recriar comportamento já corrigido. Identificar seletores efetivos e precedência real da cascata; aplicar alterações mínimas e localizadas, sem overrides contraditórios ou reconstrução de layout não solicitada. Idioma de todos os rótulos da interface: **español de Paraguay**.
4. Escopo do Claude é somente código autorizado abaixo e documentação técnica factual da própria entrega, não reabrir requisitos do projeto.

## 1. P1 — `Resumen de la factura`: reorganizar informações e AMPLIAR produtos

**Decisão do responsável:** “quero que organize as informe amplie a parte de produtos”.

- Esta é a modal de revisão **antes de `Enviar factura`**, não a barra financeira da página nem o PDF KuDE. Priorizar a área da tabela no espaço útil do diálogo, inclusive usar melhor a largura disponível em desktop; não fixar largura em valor que comprometa o mobile. Atualmente a modal possui `max-width:1040px`; avaliar aumento moderado/responsivo APENAS se trouxer ganho concreto e sem prejudicar os dados/ações.
- Manter os blocos `Cliente y entrega`, `Operación` e `Pagos` de **altura natural**, compactos, legíveis, bem distribuídos, sem grandes faixas vazias, sem esconder informações importantes. No celular, empilhar com leitura clara. Cabeçalho (empresa/estabelecimento/ponto/data) igualmente compacto, **sem remover dados**.
- Tabela de produtos como elemento dominante, ocupando **largura disponível**, com a estrutura fiscal/comercial existente: descrição/código, unidade, quantidade, preço IVA incluído, IVA, descontos existentes e total por item. Não esconder linhas/campos existentes, não mudar valor de nenhum campo nem reconstruir cálculo no frontend.
- **Uma única rolagem VERTICAL para o corpo da modal** com 20/100 linhas; nenhuma rolagem vertical adicional dentro da tabela de produtos. O rodapé `Volver a editar` / `Enviar factura` permanece separado, acessível e sem sobrepor conteúdo. A rolagem horizontal da tabela pode existir apenas onde a largura realmente exigir.
- Totais, detalhamento fiscal, estoque por depósito e ações devem permanecer presentes e integralmente consultáveis; se o usuário precisa descer pelo conteúdo, os números de produtos não podem ficar cortados nem encobertos.
- **Não alterar** o formulário principal de emissão fora do estritamente indispensável para o alinhamento P2.

## 2. P8 — Cabeçalho da tabela visível ao percorrer listas grandes

**Decisão:** APROVADO. Ao consultar uma tabela com muitos itens, preservar a identificação das colunas `Producto`, `Unid.`, `Cant.`, `Precio (IVA incl.)`, `IVA`, `Total` durante o deslocamento vertical do corpo, **sem criar uma segunda rolagem vertical**. 

- Examinar os scroll containers e comportamento real de `position:sticky`: a combinação atual `.resumenTabla { overflow-x:auto; overflow-y:visible }` computa o eixo Y como `auto`, portanto restaurar apenas `th {position:sticky}` pode NÃO fixar os títulos no scroller correto. **Não declarar que funciona apenas por adicionar CSS.**
- Escolher solução estrutural simples, acessível e robusta, com uma só rolagem vertical e alinhamento das colunas inclusive com rolagem horizontal. Se houver conflito técnico não resolvido sem regressão, documentar evidência e limitar a entrega; não introduzir uma segunda rolagem silenciosamente.
- Cabeçalhos e valores alinhados, sem cortar títulos importantes, suportando 1/20/100 linhas, zoom e mobile.

## 3. P9 — Informação adicional com prévia expansível

**Decisão:** APROVADO. Em `Resumen de la factura`, `Información adicional` longa deve mostrar uma **prévia legível do início do texto**, com opção explícita `Ver texto completo` acessível por mouse/teclado; ao expandir, mostrar conteúdo integral. Texto curto pode continuar integral.
- O limite atual `>160` caracteres aciona `details` fechado **sem prévia**. Ajustar SOMENTE apresentação para permitir conferência antes do envio, sem inflar desnecessariamente os cartões.
- Não truncar, reescrever, sanitizar diferentemente, alterar, persistir de novo ou mudar `dInfAdic`, payload fiscal, comentários de entrega ou vendedor. Evitar duplicar texto ao expandir; preservar quebras de linha, acessibilidade e renderização segura de texto.

## 4. P2 — Búsqueda avanzada: somente alinhamento

**Decisão:** “só arrumar o alinhamento”. A R05 já reestruturou `BuscadorRapido`: `accion` na mesma linha do campo e aviso `«... añadido»` abaixo. **Preservar como está** se a cascata atual estiver correta. Corrigir exclusivamente desalinhamento residual comprovado pela análise do DOM/CSS, **sem alterar** busca, debounce, lista, fluxo de seleção, mensagens, auto-complete, Enter, scanner, foco, clientes, vendedores ou sequência de produtos.

## 5. P3, P4, P5, P6, P7, P10 — Fronteiras aprovadas

- **KuDE fora do escopo desta R06**: não editar `app/(private)/documentos/kude-modal.tsx`, `lib/facturacion/kude-visor.ts`, `app/(private)/documentos/page.tsx`, regra PRO-194, `/api/kude` ou fornecedor. A produção/entrega do PDF vem do provedor, mas a janela é UI local; isso **não autoriza** alterações em nenhuma parte do fluxo KuDE.
- **Enter e scanner:** deixar precisamente a lógica atual, sem aprimoramento não solicitado.
- **Cálculos, IVA, preços, desconto, totais, arredondamento, JSON FE, `dInfAdic`, `payload-fe.ts`, gateway, credenciais, APIs, SIFEN, RUC, CDC, stock, NCE, perfis, sequência, impostos e migrations:** FORA DO ESCOPO; NÃO modificar. Preservar snapshot revisto, idempotência, validações e envio.
- **P7 Homologação visual cabe ao responsável.** Você pode apresentar critérios/capturas propostas, mas não declarar teste, navegador, impressão, publicação ou aceite visual realizados.
- **P10 Documentação:** ordem e `CLAUDE.md` organizados pelo ChatGPT. Claude deve lê-los e, se necessário, documentar apenas evidências exatas dos arquivos alterados; não apagar histórico R05, nem reabrir ordens históricas.

## 6. Verificação estática e critérios de aceite (sem executar testes)

- Expor explicitamente a estrutura final e a hierarquia das informações (espaços ocupados por dados vs produtos). Explicar por que a tabela ganhou área útil.
- Conferir a cascata CSS e scroll containers, sem alturas limitantes ou barras verticais duplas, e verificar estaticamente solução para header fixo diante do `overflow-x`.
- Conferir condições 0/1/20/100 produtos, dados longos, todas as informações de cliente/entrega/pagamento e corpo com 1 rolagem, rodapé sempre acessível, zoom, 1366×768, 1440×900, 1698×864, smartphone. **São cenários de aceite HUMANO FUTURO, não testes executados.**
- Preservar estado/modal/tabulação/Escape/foco, inclusive ao abrir/fechar informação adicional, e labels ARIA; não prejudicar composição em larguras estreitas.
- Se não conseguir demonstrar estática e logicamente um requisito (especialmente P8), declarar `PENDENTE` com causa e alternativa, não atribuir selo conforme.

## 7. Proibições operacionais e entrega

**NÃO EXECUTAR:** testes, lint, typecheck, build, CI manual, browser, SQL, migrations/runner NEX-072/073/074, VM, login, Postman, provedor externo, FE real, SIFEN, envio ou deploy. Não alterar ambientes. Não usar segredos/senhas/tokens das capturas.

- Fazer as menores alterações de código necessárias, preferencialmente **somente** `app/(private)/facturas/nueva/page.tsx` e `page.module.css`. Se mais arquivo for imprescindível, justificar antes de expandir; não tocar KuDE.
- Revisar integralmente os arquivos resultantes; commit e push na branch oficial. Relatar SHAs completos, arquivos, diff funcional, decisões de scroll/sticky, riscos reais e itens pendentes. Não mudar estados Linear para Done.
- **PARAR PARA AUDITORIA INDEPENDENTE DO CHATGPT.** Somente depois do parecer estático e da homologação humana expressa pelo responsável será avaliada liberação.
