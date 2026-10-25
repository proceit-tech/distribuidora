# ORDEM ÚNICA VIGENTE — PRO-93-R05 · UX RESUMEN, BÚSQUEDA AVANZADA E KUDE (25/10/2026)

**Projeto:** NEXIT · **Repo:** `proceit-tech/distribuidora` · **Branch oficial:** `feature/NEXIT-2026-001-banco-demo`  
**Responsável confirmou:** problema de conexão/`HTTP 400` que indicava `No se encontraron datos de la empresa para validar el lote` **foi corrigido mediante ajuste no FORNECEDOR da API**. **NÃO INVESTIGAR OU ALTERAR gateway, JSON, RUC, token, login, endpoints, cadastro/ambiente do fornecedor, estados de envio, CDC, nem realizar nova emissão** nesta tarefa. Esta ordem substitui a ordem mista `ORD-CLAUDE-NEXIT-PRO-93-GATEWAY-400-UX-2026-10-25.md`.

## 0. Leitura, alcance e prioridade

Sincronizar HEAD da branch. Ler integralmente `CLAUDE.md` e estes **arquivos completos antes de alterar**:
- `app/(private)/facturas/nueva/page.tsx`;
- `app/(private)/facturas/nueva/page.module.css`;
- `app/(private)/documentos/kude-modal.tsx`;
- `app/(private)/documentos/page.tsx`, `lib/facturacion/kude-visor.ts` (compreensão, somente alterar se estritamente necessário e justificado).
- Auditoria visual existente `documentacao/analises/AUD-NEXIT-FE-ENVIO-400-UX-RESUMEN-2026-10-25.md` **SOMENTE suas seções de UX**, lembrando que a hipótese de conexão nessa auditoria foi superada pelo ajuste no fornecedor.
- Consultar Linear PRO-93, PRO-128, PRO-194 e PRO-115. Não abrir issues duplicadas.

**Não criar novos requisitos. Não fazer somente um patch superficial de CSS que quebre foco, campos ou tabelas.** A interface é em **ESPANHOL (Paraguay)**.

## 1. Resumen de la factura — PRODUTOS COMO ELEMENTO PRINCIPAL

**Defeito comprovado pela captura e código:** na modal de confirmação `Resumen de la factura`, a grade `.resumenCuerpo` estica verticalmente as três seções `Cliente y entrega`, `Operación`, `Pagos`. A lista tem `.resumenTabla {max-height:260px;overflow:auto}` e fica reduzida a menos de uma linha visível, enquanto enormes áreas acima ficam vazias. Isso impede revisar uma FE de dezenas de itens.

**Corrigir de forma estruturada:**
1. Cabeçalho compacto, preservando empresa, código de estabelecimento ANTES da sucursal, ponto e data.
2. Grupos `Cliente y entrega`, `Operación` e `Pagos` com altura determinada pelo conteúdo, SEM `stretch` de linhas implícitas. Evitar desperdício de altura. Dados comerciais longos (endereço, informação adicional, entregas) devem ser integralmente consultáveis; se necessário, em seção `details` acessível por teclado, sem apagar dados nem alterar `dInfAdic`.
3. **Tabela de produtos deve receber o espaço principal**, com descrição, código, unidade, quantidade, preço com IVA, IVA, descontos existentes e total (sem esconder linhas ou informação relevante). Nenhuma rolagem vertical separada DENTRO da tabela; o corpo da modal tem **UMA rolagem vertical** quando há 20/100 linhas; uma linha não pode ficar cortada. Preservar cabeçalho da tabela e legibilidade das quantias.
4. Totais (inclusive composição de IVA), estoque por depósito e `Volver a editar`/`Enviar factura` sempre acessíveis, sem sobreposição/fundo flutuante. Caso haja corpo rolável, manter barra de ações no rodapé da modal sem cobrir o conteúdo, com `padding` correto.
5. Contemplar 0, 1, 20 e 100 itens, vários dígitos em valores, descrição longa, zoom, desktop 1366×768/1440×900/1698×864 e mobile. Sem tabelas que provoquem rolagem vertical dupla. Rolagem horizontal somente quando necessário em largura pequena.
6. Preservar valores, arredondamentos, condição de crédito/pagamentos, desconto, todos os detalhes da revisão, snapshot congelado, teclado Tab/Escape, foco inicial e devolução do foco ao fechar. Não mudar o fluxo fiscal.

**Critério para considerar concluído estaticamente:** retirar a altura máxima e o `overflow:auto` vertical independentes da tabela, resolver crescimento indevido da grade e verificar cascade CSS completa para não criar novos overrides contraditórios. Não alegar homologação visual sem navegador.

## 2. Botão `Búsqueda avanzada` alinhado AO CAMPO ao adicionar produtos

**Causa localizada:** `page.tsx::BuscadorRapido` renderiza `b.aviso` no mesmo `div.buscador` que o campo; `.buscarFila {display:flex;flex-wrap:wrap;align-items:flex-end}` alinha botão ao fundo do conjunto incluindo o aviso. Após `«ABREBOTELLAS» añadido.`, o botão cai para segunda linha / fica à altura do aviso.

**Corrigir DOM/grade:** no desktop alinhar na mesma linha de controles **campo de busca + botão**; mensagem de sucesso/erro própria abaixo dessa linha, fora do cálculo que posiciona o botão. Usar `grid`/estrutura explícita, slot da ação apenas no buscador de produtos ou composição com DOM estável — **não hacks `margin-top` / `position:absolute`** dependentes da mensagem. Dropdown autocompletar com posicionamento correto e `z-index` sem cobrir ação/tabela; quebra deliberada no mobile. Preservar foco, scanner, Enter, vários produtos em sequência, mensagem de produto adicionado, buscadores de Cliente e Vendedor e acesso por teclado.

## 3. Modal KuDE — só o estado ERRO precisa ser COMPACTO

**Defeito comprovado:** `app/(private)/documentos/kude-modal.tsx` utiliza `height:'min(92vh,100%)'` em TODAS as fases; com HTTP400 ou outro erro KuDE, a modal fica enorme e vazia com aviso no centro.

**Ajustar apenas UI:**
- `LISTO` + PDF: manter visor grande com `iframe`, imprimir/baixar/fechar como hoje.
- `ERROR`: caixa de altura natural, largura limitada adequada, mensagem legível, `Reintentar` e `Cerrar` acessíveis, sem iframe e SEM 92vh de branco. `CARGANDO` pode ser compacto e apresentar indicador acessível.
- Preservar estados `ERROR` e `LISTO`, fechamento Escape, foco/aria-label, limpeza de Blob e nenhuma chamada adicional automática. `Reintentar` continua como ação explícita do usuário.
- **Regra de negócio PRO-194 continua:** operador pode solicitar KuDE de FE ou NCE em qualquer estado e sem CDC; não ocultar o botão, não exigir APROBADO, não alterar `/api/kude`, não refazer JSON externo.

## 4. Proibições / não regressão

- **CONEXÃO RESOLVIDA NO FORNECEDOR**: encerrar investigação no escopo desta ordem; **não modificar** `gateway.ts`, `envio.ts`, `payload-fe.ts`, credenciais, URL, token, classificações de HTTP/SIFEN, SQL/migrations nem KuDE externo.
- Não reabrir NCE, PRO-322, PRO-309/310, reintentos históricos, cadastro/perfil Vendedor, data de emissão, série/numeração ou as 13 opções do combo (solicitadas sem campos fiscais extras).
- Captura Postman contém senha e JWT: **não salvar/exportar/commitar/reproduzir** nem usar valores presentes.
- **Não executar** testes, lint, typecheck, build, CI manual, SQL, migrations, runner, VM, Postman, login, gateway, transmissão FE, KuDE externo, SIFEN ou deploy. NEX-072/073/074 seguem sem autorização de aplicação.
- Todos os arquivos modificados devem ser revisados por inteiro após edição; explicar critérios por viewport e número de itens **sem alegar testes executados**.

## 5. Entrega e parada

Criar commits/push na branch oficial, preferencialmente separados por áreas: `Resumen UX`, `Búsqueda avanzada`, `KuDE modal` (se alterações cruzadas, justificar). Informar SHA **completo**, arquivos e exatas mudanças, riscos restantes e compatibilidade. Não declarar homologação, produção nem que teste visual foi feito. **PARAR PARA AUDITORIA DO CHATGPT; NÃO INICIAR OUTRA TAREFA.**
