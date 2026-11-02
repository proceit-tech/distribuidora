# Handoff para Claude Code — NEXIT / CASA MINGO — pacote de ajustes aprovados

**Data da decisão:** 20/10/2026.
**Situação:** requisitos comerciais aprovados pelo responsável; **não significa código implementado nem homologado**.
**Fonte única:** `proceit-tech/distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`.
**Módulos:** Facturas → Nueva, Notas de crédito, Documentos electrónicos / KuDE NCE, Inventario/Movimientos, configuração do gateway.
**Não propor novas opções funcionais ao responsável; executar na sequência por entrega auditável.**

## Instrução vinculante para Claude

1. Antes de qualquer alteração, ler os arquivos ATUAIS `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, trechos pertinentes de `PROGRESSO-NEXIT-V1.md`, este handoff e o requisito canônico `documentacao/definicoes/REQ-CASA-MINGO-DECISIONES-NCE-KUDE-2026-10-20.md`; comparar o código real e as migrations no Git, não memória de conversa.
2. No clone `C:\\projetos\\PROCEIT\\distribuidora`: inspecionar `git status`, branch e últimos commits, sincronizar sem sobrescrever trabalho local. Antes de implementar uma funcionalidade verificar se está **já implementada** ou apenas documentada, e limitar o patch ao que falta.
3. **Trabalhar UMA entrega por vez**, por ordem de dependência abaixo. A autorização do responsável cobre este pacote, mas o protocolo exige após cada entrega: testes **direcionados**, commit e push na branch, atualizar brevemente o progresso, informar SHA/resultados/bloqueios e **PARAR PARA AUDITORIA INDEPENDENTE DO CHATGPT**. Não marcar Done/Homologado, não iniciar a entrega seguinte sem auditoria/autorização. Não abrir novos ciclos de perguntas de negócio.
4. Não acessar VM, não aplicar migrations, SQL ou Docker no banco real, não modificar configuração real/credenciais; somente o responsável faz deploy e homologação. Nunca guardar segredos, tokens, password nem RUC de autenticação da imagem Postman no Git, logs ou Linear.
5. Não executar suite global, `next build` ou lint global, testes completos de banco, workflows manuais salvo solicitação expressa. Usar testes pertinentes ao módulo/permissões/cálculo/segurança e declarar os limites. Não tocar arquivos de auditoria `AUD-*`; o ChatGPT audita.
6. Códigos de catálogo/itens, tipo fiscal, estoque, status SIFEN, permissões e multiempresa devem continuar íntegros; produzir migrations incrementais novas após verificar versão já aplicada. Não corrigir problema criando rotas/payloads falsos ou alterando fiscalidade da FE que funciona.
7. Documentar a execução de cada entrega na fonte canônica e atualizar a issue respectiva. O único relatório ao responsável deve ser curto: o que foi feito, testes em números, SHA e bloqueios concretos. **Não relatar homologação da VM não executada**.

## Decisões já fechadas — NÃO perguntar de novo

| Ref | Decisão do responsável | Critério de aceite |
|---|---|---|
| FE-QTD | **Todos** os produtos aceitam quantidades fracionárias mesmo com SIFEN `77/UNI`. Aceitar `5,5`, `2,25` etc. até 4 casas; internamente Decimal, sem truncar/arredondar a inteiro. | Campo, validação API, snapshot fiscal, subtotal, estoque e Kardex mantêm exatidão; quantidade 5,5 reduz 5,5. |
| FE-STOCK | Não vender mercadoria com saldo insuficiente. Consultar depósitos **autorizados** com `DISPONIBLE/PROPIO`, excluir reservado/quarentena/trânsito. **Distribuir automaticamente** a quantidade entre depósitos, mostrando origem e quantidade antes de emitir; baixar ao EMITIR a FE. | A=3 e B=5, vender 6 → uma linha fiscal 6, saídas rastreáveis 3+3 por depósito. Movimentos vinculados à FE, sem saldo negativo/double decrement; falha/transação inconsistente não produz baixa parcial. |
| FE-END | Em `Facturas → Nueva`, escolher a `Dirección de entrega` entre os endereços **já cadastrados** do cliente; se cinco filiais, oferecer cinco; default `es_entrega_default` selecionado automaticamente, podendo trocar. Sem default mas com endereços → escolher manualmente. **Sem endereços → permitir faturar com aviso informativo não bloqueante**. | Salvar ID e snapshot do destino escolhido (ou NULL), sempre na empresa/cliente correto. Troca de cliente limpa seleção. Endereço fiscal do receptor e sucursal/ponto EMISSOR não mudam. Não criar endereço pela FE. |
| FE-DESC | Desconto **por item e geral**, cada um aceitando `%` ou valor em moeda (Gs. quando PYG); cálculos conforme Manual Técnico SIFEN v150/NT; não apenas apresentação. | Payload `dDescItem`, `dPorcDesIt`, `dDescGloItem` e totais F/IVA conciliados, inclusive coexistência dos dois descontos; desconto não pode exceder valor. |
| FE-UX | Depois de adicionar produto, foco no campo **Cantidad** do novo item. Guaranis **sem decimais visuais** em preço/IVA/resumo lateral/campos/totais, **sem alterar precisão fiscal**, incluindo tela principal, modal e edição. Mostrar `Establecimiento 001` onde aplicável. | Campo PYG fora de foco `82.500` em vez de `82500.0000`, IVA sem 8 decimais na lateral; em foco permite digitar sem salto e sem perder precisão real. |
| CODIGO | Preservar **zeros à esquerda** de códigos de produto migrados do Excel, em cadastro, busca, itens e integração (`001234` diferente de `1234`). Não cortar código por ser de 11 dígitos quando permitido. | Testes sobre string, CSV/importado, UI e payload sem conversão numérica indevida. Não alterar código real automaticamente sem cotejo com fonte. |
| NCE-DEV | Em motivo `Devolución`, operador reduz a quantidade (5 → 2; inclusive 2,5) respeitando saldo fiscal disponível. **Não devolver stock automaticamente com NCE**; entrada fica separada no Inventario. | Nota de crédito credita só quantidade escolhida; movimentos de estoque não são criados pela NCE. |
| NCE-SELECT | Seleção individual e `Seleccionar todos` no cabeçalho, `Eliminar seleccionados` remove apenas linhas da **nota em preparação**, podendo eliminar todas; nunca apaga itens da FE original. | Controles consistentes ao alternar motivo, selecionar e eliminar. |
| NCE-DESCUENTO | Nos motivos 3 `Descuento` e 4 `Bonificación` mostrar `+ Agregar DESCUENTO`. **Item fixo/serviço não estocável**, com identidade estável de sistema, quantidade **1**, valor definido pelo operador, **IVA 10% SEMPRE**. A NCE desse fluxo terá **somente uma linha** `DESCUENTO`; sem rateio fiscal entre itens originais e sem mistura com outras linhas. | Adicionar serviço, selecionar/remover as linhas originais, informar Gs. 20.000 → 1 linha, qty 1, IVA10, total 20.000, sem estoque, sem ultrapassar saldo/CDC/controles da FE. **Não remover linhas originais automaticamente nem apagá-las na FE.** Se permanecerem selecionadas, bloquear emissão. |
| NCE-FISC | IVA 10% fixo no `DESCUENTO` foi **decidido comercialmente**, mesmo com FE anterior 5%/exenta/mista; não substituir silenciosamente por rateio ou tributação original. | Verificar contrato do gateway/validação SIFEN nos casos 10%, 5%, exenta, mista antes da homologação. Se não aceito, bloquear emissão e documentar **erro fiscal concreto**; não inventar aprovação ou contornar validação. |
| KUDE-NCE | **FE e NCE podem solicitar KuDE em qualquer estado fiscal**: não exigir `APROBADA` nem CDC pré-gravado para mostrar ação e consultar o gateway. Se a API entregar PDF válido correspondente ao documento, permitir visualizar/baixar/imprimir. Body `POST /api/kude` exatamente `{dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc}` com FE/NCE e **sem `tipOpe`**. | Reutilizar visualizador existente, usar identidade fiscal de cada FE/NCE (nunca da FE original para NCE), preservar zeros, isolar empresa/sucursal/permissões. Se houver CDC persistido, impedir divergência com o retornado; não inventar PDF nem aceitar documento errado. Quando API falhar/não entregar, informar indisponibilidade. |
| GATEWAY | Nova base teste `https://gateway.e-factura-hub.com` (captura Postman comprovou `POST /api/login` HTTP 200). `lib/facturacion/gateway-credenciales.ts` já teve default alterado no Git. | Verificar testes e preservar URL/credenciais por empresa em `fe_gateway_config`/`NEXIT_DB`; **constante não altera URL já persistida**. Não mudar RUC/nome do emitente por causa da API de testes. Configuração efetiva só pelo operador autorizado na VM. |
| CANCELAR | **ADIADO E FORA DO ESCOPO ATUAL por falta de API.** Não implementar evento de cancelamento FE/NCE (48h/7 dias) nem estorno automático de estoque após cancelamento; histórico funcional preservado para eventual fase futura. | Nenhum desenvolvimento, migration, fluxo alternativo ou simulador operacional de cancelamento nesta rodada. Retomar só com contrato real da API e nova autorização expressa do responsável. |

**Fluxo comercial atual:** emitir FE verificando saldo e baixando estoque. **Cancelamento e reversão automática NÃO serão implementados nesta rodada por ausência de API do gateway**. Não simular confirmação fiscal ou criar estornos presumidos; preservar integridade dos estados e registrar dependência futura.

## PROIBIÇÕES explícitas — fora de escopo

- **NÃO** mudar empresa/RUC de teste, ambiente do provedor, logo ou identidade que aparece no KuDE de testes: responsável já aceitou que é ambiente de outra empresa.
- **NÃO** redesenhar KuDE FE, coluna `Cod. Barra`, largura da coluna Código, paginação, limite de 23 itens ou imprimir uma única folha: solicitações antigas **retiradas**.
- **NÃO** mexer no layout KuDE NCE; apenas habilitar disponibilização com `tipoDoc:"NCE"`, preservando o visor e FE.
- **NÃO** somar entradas de NCE ao estoque; **NÃO** emitir `DESCUENTO` com mais de um item fiscal ou IVA rateado.
- **NÃO** reimportar os produtos/estoque CASA MINGO: 561 produtos importados com `COMMIT`, estoque inicial de 91.864 unidades confirmado em dois movimentos `MOV-000003` / `MOV-000004`, mais dois produtos anteriores. Scripts de importação não devem ser rodados outra vez.
- **NÃO** excluir/trocar catálogos, sobrescrever documentos emitidos, fazer manutenção geral ou adicionar novas features sem autorização.

## Ordem de implementação — entregas separadas

**E01 — FE Quantidad** · Remover bloqueio de fração/UNI 77, aceitar vírgula em UI/validação/API/cálculo sem tocar payload FE correto; foco em Cantidad ao adicionar item. Cobrir com testes dirigidos (5,5; 0,0001; vazio; sem regressão em preços). **Claude inicia SOMENTE E01 após ler o repositório.**

**E02 — FE Stock** · Exibir disponibilidade por depósito, alocação automática transparente com múltiplos depósitos, saídas por depósito via motor de inventário no ato da emissão, isolamento e idempotência. Testes de concorrência/estoque insuficiente; não fazer GET fiscal duplicar baixa. Rever integração entre emissão FE e inventário atual.

**E03 — FE Descuentos** · Implementar por linha/final % ou valor conforme manual SIFEN, recalcular os impostos e totais com Decimal; regressão com PYG e moeda estrangeira.

**E04 — FE Dirección entrega** · Combobox seletor de direcciones_cliente filtrado, default automático, troca autorizada, nenhuma direção => warning não bloqueante, snapshot salvo; validação servidor, isolamento.

**E05 — FE UX + códigos** · Verificar a formatação PYG já versionada na tela e lateral, corrigir o que persistir; estabelecimento visual, preservar zeros à esquerda sem alteração arbitrária de dados históricos. Não alterar KuDE.

**E06 — NCE seleção e devolução parcial** · `Seleccionar todos` / `Eliminar seleccionados`, quantidade parcial e vírgula, sem inventário automático. Preservar fluxo de correção NCE rejeitada e motivo fixo já implementados.

**E07 — NCE serviço DESCUENTO** · Nos motivos 3/4 somente: serviço fixo, qty 1, IVA10, monto definido, linha única e sem stock. Adaptar `nce_lineas`/serviço/payload/validadores porque modelo atual exige ordinal original; acrescentar SQL incremental quando indispensável; saldos, CDC, permissão e motivo fixo intactos. Evidenciar risco e teste fiscal 5%/exento/misto; não alegar homologação sem gateway real.

**E08 — KuDE FE/NCE com 5 campos** · Tratar `tipoDoc` FE/NCE dinâmico, **sem `tipOpe`**. Disponibilizar tentativa de KuDE **sem bloquear por estado fiscal APROBADA/PENDIENTE/RECHAZADA ou por CDC local ausente**. Se o gateway entregar PDF válido do documento correto, permitir visualização, download e impressão; caso contrário, mostrar erro/indisponibilidade. Manter verificação de identidade, CDC quando existente, permissões e integridade PDF; não mudar o layout.

**E09 — Gateway teste** · Validar default novo já alterado no Git e testes. Registrar procedimento seguro (sem segredos) para responsável mudar URL persistida por empresa na UI e testar login; Claude não faz deploy nem altera banco real.

**E10 — SUSPENSA / FORA DO PACOTE ATUAL.** Cancelamento FE/NCE e estorno automático da FE aguardam API real do gateway; **não iniciar implementação, contrato fictício, migrations nem desenvolvimento até nova autorização explícita**. Texto histórico de regras de cancelamento permanece como referência futura, não como ordem de execução.

### Para cada entrega
- Investigar SQL/serviços/protocolos existentes; reutilizar a lógica já implementada, não reescrever partes funcionais.
- Testes **focados** de regras diretamente alteradas, permissões/multiempresa, consistência de estado, preço/IVA/stock quando pertinente. O responsável faz teste na VM, não Claude.
- Atualizar progresso e issue vinculada; commit e push; informar SHA, testes e bloqueios; **parar para o ChatGPT auditar**.

## Mapa de referência

- [PRO-93](https://linear.app/proceit/issue/PRO-93) — FE Nova factura, quantidade, endereços e stock.
- [PRO-124](https://linear.app/proceit/issue/PRO-124) — desconto FE por item e global.
- [PRO-94](https://linear.app/proceit/issue/PRO-94) — NCE motivos, quantidade, `DESCUENTO`.
- [PRO-194](https://linear.app/proceit/issue/PRO-194) — KuDE Documentos FE/NCE; contrato de 5 campos.
- [PRO-133](https://linear.app/proceit/issue/PRO-133) — configuração gateway teste por empresa.
- [PRO-199](https://linear.app/proceit/issue/PRO-199) — cancelación FE e compensação automática de inventário.
- Norma principal de decisões: `documentacao/definicoes/REQ-CASA-MINGO-DECISIONES-NCE-KUDE-2026-10-20.md`.
- Especificação de NCE mais antiga: `documentacao/v1/REQUISITOS-NCE-V1-EMISION-2026-10-16.md` — **as decisões posteriores do responsável sobre DESCUENTO único e IVA10 prevalecem** sobre qualquer definição anterior de crédito distribuído por linhas.
- Contrato de KuDE: `documentacao/definicoes/REQ-DOC-KUDE-PDF-GATEWAY-2026-10-20.md` — correção posterior de 5 campos **sem tipOpe prevalece** sobre exemplos antigos.
- `documentacao/referencias/sifen/`, SIFEN MT v150 e NT; conferir só as regras fiscais de cada entrega.
- Consultar scripts/migrations antes de criar incremental, especialmente `NEX-014`, `NEX-048`, `NEX-062` e `NEX-066` se presentes.

## Correção vinculante de escopo — 21/10/2026

- **KUDE FE e NCE:** o responsável corrigiu a condição: **não é necessário estado APROBADA para visualizar KuDE, nem CDC persistido para tentar buscar**. A API é a fonte da disponibilidade. Para todo documento FE/NCE ao qual o operador tenha acesso e com identificadores para requisição, oferecer tentativa; **se o gateway devolver PDF válido daquele documento, exibir/baixar/imprimir**, qualquer que seja o estado fiscal local. Falha/ausência da API é informada, não se produz PDF fictício. Não aceitar divergência do CDC quando a base já possui CDC, e nunca mostrar documento de outro ID. Apenas cinco campos: `dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc`; sem `tipOpe`.
- **E10 cancelamento + estorno de estoque:** fora desta rodada **porque falta API**. Não iniciar, nem criar endpoints/payloads de evento ou reversão inventados; manter requisitos somente como memória histórica para eventual retomada autorizada.
- **Ordem atual permanece:** auditar E06-R01 antes de E07; depois E07 e E08. **Parar após E08** para homologação dos pedidos do cliente; E10 não faz parte do encerramento atual.

## Estado atualizado de prioridade — 21/10/2026

- E01–E05: implementação auditada estaticamente, **sem homologação operacional**. E05-R01 registrada em `documentacao/testes/AUD-NEXIT-CASA-MINGO-E05-R01-2026-10-21.md`.
- G01 / PRO-207 (URL, usuário e senha editáveis por empresa) foi implementada e auditada em G01-R01 e G01-R02; PRO-208/209 (IPv4-mapeada e DNS rebinding) **corrigidas e aceitas estaticamente**, sem teste TLS real nem aplicação. Auditoria canônica: `documentacao/testes/AUD-NEXIT-CASA-MINGO-G01-R02-2026-10-21.md`. A funcionalidade comercial prevista em E09 não deve ser duplicada; E09 restante é procedimento/homologação quando autorizado.
- **Nova próxima entrega para DESENVOLVIMENTO: E06 — NCE seleção e devolução parcial.** Regras já aprovadas na seção E06 acima. **E07 não iniciar** antes de auditoria E06-R01.
- **NEX-067/068/069 continuam não aplicadas** no banco real; testes, migrations, deploy, gateway e navegador reais seguem sob responsabilidade humana, com autorização expressa. Não mudar logo/KuDE visual, ambiente de outra empresa ou credenciais de outros tenants.

## Mensagem vigente para Claude

> Claude, sincronize a branch, leia `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e este handoff, com foco na **E06**. Aplique somente **E06 — NCE: Seleccionar todos, Eliminar seleccionados, devolução parcial e quantidade com vírgula**, sem devolução de stock automática e sem alterar o motivo fixo ou fluxo de correção de NCE rejeitada. Reutilize código existente, testes direcionados e regressões pertinentes, commit/push, informe SHA e PARE para auditoria ChatGPT E06-R01. Não acesse VM, não aplique migrations nem declare homologação. **Não iniciar E07**.
