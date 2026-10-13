# NEXIT V1 — Auditoria funcional transversal de Inventario
## Stock · Movimientos · Depósitos · Reposición

**Data:** 2026-10-13. **Auditoria:** ChatGPT, inspeção estática de GitHub e benchmark de documentação oficial de ERPs. **Branch de leitura:** `feature/NEXIT-2026-001-banco-demo`. **SHA-base inspecionado:** `02d730e6e13ed2b0183563835e27757c18b50259`. **Estado:** AUDITORIA / PROPOSTA DE RECORTE V1 — NÃO HOMOLOGADO — IMPLEMENTAÇÃO NÃO AUTORIZADA AUTOMATICAMENTE.

**Objetivo do responsável:** auditar os quatro menus conjuntamente, eliminar sobreposições e definir poucas funcionalidades que se complementem. Este documento é **o contrato transversal único**, referenciado pelas auditorias canônicas dos quatro menus; não reescrever o histórico delas.

**Método e limitações:** foram confrontados `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, páginas e subtelas `/stock`, `/movimientos`, `/depositos`, `/reposicion`, APIs, libs de saldo, cálculo, permissão, depósitos e movimentos, migrations NEX-009/014/017/018/046 e decisões funcionais já versionadas. Consulta comparativa à documentação pública de Odoo 19, SAP Business One, ERPNext e Dynamics 365. **0 testes executados**, **0 PostgreSQL, 0 VM, 0 Docker, 0 navegador e 0 migração executada**. O estado do ledger real de migrations **não foi verificado**; anotações históricas sobre NEX-046 podem não representar a VM atual.

## 1. Conclusão de arquitetura — quatro responsabilidades, uma fonte de dados

| Menu / rota | Pergunta do operador | Faz (escopo enxuto) | NÃO faz |
|---|---|---|---|
| **Stock** `/stock` | Quanto existe e onde? | Consulta de saldos por produto, depósito, estado e lote; disponível/próprio/terceiros; detalhe; alertas indicativos; atalhos que ABREM outros módulos. | Registrar entradas/saídas, ajustar saldo diretamente, configurar depósito, criar compra, manter plano de reposição, recriar relatórios analíticos. |
| **Movimientos** `/movimientos` | O que movimentou o saldo? | Registro operacional com tipos, depósito, quantidade, lote, motivo, chave de idempotência, histórico e anulação por contramovimento. | Manter cadastro de depósitos ou metas mín./máx., escolher fornecedor/precificar compra, calcular necessidades de abastecimento. |
| **Depósitos** `/depositos` | Quais locais operacionais existem e quem os acessa? | Cadastro básico de depósito, sucursal, estado, associação de usuários e histórico de atribuições/revogações. | Registrar saldo inicial, transferir estoque, conter tela paralela de Stock, definir mín./ponto/máx. do produto. |
| **Reposición** `/reposicion` | O que precisa ser abastecido? | Planejamento com gatilhos e metas definidos nos Produtos, sugestão de transferência/compra, alerta de parâmetros faltantes, encaminhamento para execução em outro módulo. | Criar ou confirmar movimento físico, gerar compras automaticamente, reclassificar estoque ou manter outro cadastro de produtos/de depósitos. |

**Regra central:** uma escrita física passa somente pelo motor de Movimientos, mesmo quando no futuro for iniciada por Compras/Ventas/Entregas; Stock reflete fatos; Reposición consulta e propõe; Depósitos define local e acesso. A interface pode abrir a mesma operação por atalhos contextualizados, mas não pode ter dois motores de gravação nem duas regras concorrentes de saldo.

**Referências externas verificadas (conceitos, não escopo a copiar integralmente):**
- SAP Business One, **Inventory Transactions** (entradas/saídas/transferências, contagens, saldos iniciais): https://help.sap.com/docs/SAP_BUSINESS_ONE/68a2e87fb29941b5bf959a184d9c6727/4523650b9e152b31e10000000a1553f7.html?locale=pt-BR
- SAP B1, **Inventory Transfer**: https://help.sap.com/docs/SAP_BUSINESS_ONE/68a2e87fb29941b5bf959a184d9c6727/452364ea9e152b31e10000000a1553f7.html
- Odoo 19, **Warehouses/Locations**: https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management.html
- Odoo 19, **Replenishment/Reordering Rules**: https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment.html
- Microsoft Dynamics 365, **On-hand inventory**: https://learn.microsoft.com/en-us/dynamics365/supply-chain/inventory/inventory-on-hand-list
- Microsoft Dynamics 365, **Inventory journals**: https://learn.microsoft.com/en-us/dynamics365/supply-chain/inventory/inventory-journals
- ERPNext, **Warehouse / Auto Material Request**: https://docs.frappe.io/erpnext/v14/user/manual/en/stock/warehouse ; https://docs.frappe.io/erpnext/auto-creation-of-material-request

## 2. Escopo recomendado por menu

### 2.1 Stock — painel de consulta

**Manter:** busca e filtro por depósito, produto, estados disponível/reservado/quarentena/trânsito, lotes, separação PROPIO/TERCERO, detalhe por depósito, custo médio e valor a custo reais como indicação operacional (com moeda explícita), atalhos para histórico de Movimientos e planejamento Reposición. Filtros respeitam alcance e depósitos históricos inativos continuam visíveis. `stock_saldos` e `inventario_costos` são fontes, não uma segunda tabela de trabalho manual.

**Simplificar (proposta não aprovada):** cabeçalho com no máximo uma ação principal `Ver reposición`; `Movimientos` como link secundário ou ação no detalhe. Indicadores principais limitados a **SKU, Disponible, Sin stock / Bajo mínimo** (o corte final depende do responsável); métricas de rentabilidade/valorização detalhada e exportações permanecem em **Reportes**, não duplicar `/reportes/stock-general`, `/reportes/valorizacion`, `/reportes/kardex`, `/reportes/stock-critico`. Ações «Entrada/Transferir» do detalhe são só **links pré-preenchidos** para `/movimientos/nuevo`. Não usar campo de localização física sem tabela: continuar «Sin ubicación registrada» ou retirar coluna até existir modelo real.

**Definição:** `Sin stock` em Stock significa disponibilidade 0, mesmo sem política de reposição. `Bajo mínimo` é abaixo do mínimo; não significa, sozinho, que Reposición escolheu compra.

### 2.2 Movimientos — única operação que produz fatos de estoque

**Manter os nove tipos SQL existentes**, mas **agrupar na interface** (proposta): (a) **Entrada / Salida manual** para fato físico legítimo ainda sem documento integrado; (b) **Transferencia inmediata** entre depósitos (uma operação com duas pontas); (c) **Ajuste** positivo/negativo com motivo; (d) **Cambio de estado** (reserva/liberación, cuarentena/liberación). O agrupamento não muda históricos nem enums no SQL. Conservar numeração, data, usuário, depósito, lote, idempotência, confirmação real da gravação e anulação compensatória `MOVIMIENTOS.ANULAR`.

**Evitar duas maneiras indistintas de corrigir saldo:** `Entrada/Salida` é recebimento/saída física identificável; `Ajuste` é divergência, perda, inventário e regularização, com motivo. Não criar «ajustar stock» dentro de Stock ou Depósitos. Lista de movimentos é operacional (pesquisa e detalhe); **Kardex** com saldos acumulados, períodos e exportações permanece em Reportes. Nenhum documento fiscal ou comercial isolado cria efeito no stock; futura vinculação ao evento físico deve ser persistida para impedir dupla saída de fatura+remisión (a função pura `lib/movimientos/documentos.ts` ainda não é integração transacional). Não antecipar V2.

### 2.3 Depósitos — mestre de locais e autorização

**Manter:** `codigo` imutável, `nombre`, `sucursal` (imutável após primeiro movimento conforme regra aprovada), `activo`, inativação lógica bloqueada com saldo, atribuição/revogação de usuários e histórico persistente; `INVENTARIO.VER/CREAR/EDITAR`, alcance de empresa/sucursal/depósito. Permitir ler histórico de depósitos inativos; novas operações só em depósitos ativos e autorizados.

**Não duplicar:** configuração de mínimo/máximo/ponto/cantidad reposición por produto/depósito pertence à **ficha de Productos, aba Inventario** e é apenas consumida por Reposición/Stock; não criar formulário paralelo em Depósitos. Uma relação depósito → saldos é, quando útil, **link filtrado para Stock**, não estoque editável. Não criar WMS de corredores/prateleiras, inventários cíclicos, rotas e permissões extras nesta V1 somente para imitar grandes ERPs.

### 2.4 Reposición — uma tela de decisão, não de movimentação

**Manter:** situação `SIN_STOCK`, `BAJO_MINIMO`, `EN_PUNTO`, `OK`, parâmetros faltantes, necessidade e meta, origem transferível sem prejudicar mínimo/ponto e **sem alocar o mesmo estoque a vários destinos**, plano de compra residual, fornecedor principal informativo, filtro por depósito/alcance. O consolidado é **só referência** quando há políticas por depósito; não somar as duas visões. Estoque de terceiros e quarentena não são compra disponível, reserva não pode ser subtraída duas vezes. Nenhuma escrita ou pedido automático. `Preparar transferencia` só pré-preenche o formulário único de Movimientos, que revalida saldo/permite registro.

**Simplificar (proposta não aprovada):** tabela principal em **Producto · Depósito · Disponible/Meta · Situación · Acción sugerida**. Manter detalhamento de quantidades reservadas/quarentena, parâmetros e origem em expansão/detalhe, não duas grades. Ocultar por padrão a coluna editável `A planificar` (simulação que não se salva) ou substituí-la por interação explicitamente chamada **Simular**, sem representar plano persistente. **Não criar botões «Comprar» nem «Recibir devolución»** enquanto não houver documentos e eventos físicos integrados; exibir essas hipóteses só como alternativas informativas. A opção `Considerar tránsito` exige uma decisão de negócio e um produtor efetivo de trânsito; V1 atual não cria esse saldo no fluxo operacional, portanto não simular ingresso confirmado.

**Definição de alerta:** Reposición pode pedir abastecimento **no ponto de reposição mesmo quando Stock diz «Normal»**, pois Stock classifica abaixo do mínimo, enquanto Reposición também considera ponto. Isto é distinção intencional de conceito, não duas classificações a forçar artificialmente como iguais.

## 3. Matriz de sobreposições — decisão de proprietário

| Função que aparece em mais de um lugar | Proprietário único | Onde os outros podem mostrar/encaminhar |
|---|---|---|
| Saldos atuais/disponível/reservado/quarentena/lote | **Stock**, a partir do ledger de Movimientos | Reposición lê como insumo; Depósitos só link para Stock |
| Entrada, saída, transferência e ajuste | **Movimientos**, e futuras integrações pelo MESMO motor | Stock e Reposición apenas links com pré-seleção validada |
| Cadastro, ativação e alcance de depósitos | **Depósitos** | Seletor somente leitura em Stock/Movimientos/Reposición |
| Mínimo/ponto/máximo por produto e por depósito | **Productos > Inventario** | Stock exibe; Reposición calcula; Depósitos não altera |
| Sugestão de comprar/transferir | **Reposición** | Stock apenas link «Ver reposición» |
| Histórico de um movimento e anulação | **Movimientos** | Stock aponta ao histórico; Kardex é análise de relatórios |
| Valor contábil, conciliação e exportação | **Reportes > Valorización/Kardex** | Stock apresenta apenas resumo coerente, sem exportador duplicado |
| Recepção/entrega futura baseada em documento | **Compras/Ventas/Entregas** na criação do documento, motor físico em **Movimientos** | Reposición nunca grava recebimento nem compra |

### Fluxo exemplar sem duplicação

Depósito B tem 2 disponíveis e mínimo 5. **Stock** mostra 2; **Reposición** lê esse saldo e sugere transferência (se A tem excedente permitido) ou compra; o operador escolhe `Preparar transferencia` e confirma uma vez em **Movimientos**, onde origem/destino/saldo são revalidados; **Stock** reflete a transferência; **Reposición** recalcula na próxima leitura. **Depósitos** só determina quais locais existem e quais usuários podem operar. Se a solução exigir expedição/recepção em momentos diferentes, isso é fluxo documental com trânsito futuro e não deve ser escondido numa transferência imediata.

## 4. Achados estáticos e riscos verificáveis

| ID | Severidade | Evidência (caminhos e linhas de referência, SHA-base) | Ação/critério de aceite |
|---|---|---|---|
| **INV-01** | **MÉDIA — semântica duplicada/confusa** | `lib/stock/vista.ts:9-17` define nível SIN_STOCK/BAJO/SOBRESTOCK; `lib/reposicion/calculo.ts:75-116` define necessidade por mínimo **e ponto**. `app/(private)/stock/page.tsx:420-454` e `reposicion/page.tsx:182-209` exibem KPIs parcialmente parecidos. | Preservar fórmulas legítimas, rotular «Bajo mínimo» x «Necesita reposición» e encaminhar as decisões exclusivamente a Reposición; não duplicar recomendação no Stock. Caso teste: disponível entre mínimo e ponto exibe Stock normal e Reposición em ponto, com explicação. |
| **INV-02** | **MÉDIA — atalhos podem levar a 403** | `app/(private)/stock/[id]/page.tsx:97,129-132` usa apenas `MOVIMIENTOS.CREAR`; `app/api/reposicion/route.ts:29` fornece `permisos.movimientos` apenas com CREAR; `reposicion/page.tsx:389-394` oferece `Preparar transferencia` com essa condição. Porém `app/(private)/movimientos/layout.tsx` exige VER e `movimientos/nuevo/layout.tsx` exige CREAR, ambos necessários. | Alinhar o critério de visibilidade do atalho com as duas guardas vigentes, ou revisar formalmente o contrato de navegação. Não enfraquecer a API. Testar usuário CREAR-only, VER-only e VER+CREAR. |
| **INV-03** | **MÉDIA/ALTA — risco de somar moedas diferentes no valor comercial resumido de Stock** | `lib/stock/shared.ts:67-68,136-152` lê `r.moneda` da lista `REF-VENTA`, mas `valorVentaReferencia` é preço×disponível e os valores são acumulados; `stock/page.tsx:36-41,445-454` formata o total usando moeda base da empresa. NEX-017 cria a lista na moeda base originalmente, porém `lib/listas-precio/shared.ts:632-653` só bloqueia mudança de moeda com preços existentes/derivadas e o PUT de `es_referencia` não exige moeda base se vazia. | Caso de referência em moeda distinta da base: **não rotular nem somar como base sem câmbio aprovado**. Preferir bloquear divergência da lista de referência ou exibir valor comercial segregado pela moeda, com identificação e sem conversão automática. Testar lista referência vazia alterada para USD e depois preenchida; moeda PYG de empresa; mistura de moedas impossível ou claramente segregada. Não inferir que o defeito já ocorreu na VM. |
| **INV-04** | **MÉDIA — apresentação monetária arredondada via float no Stock** | `lib/stock/shared.ts:62,67,132-151` converte `numeric` a `float8`, soma em JS e calcula valor; `lib/stock/vista.ts:67-70` soma Number nos KPIs, enquanto Reportes de Valorización usa agregação exata. | Se houver total financeiro no Stock, derivar de soma precisa (PostgreSQL `numeric`/string decimal) ou tratar claramente indicador aproximado, sem divergência silenciosa contra Reportes. O relatório oficial continua dono do valor contábil. Testar centavos/4 casas e valores grandes. |
| **INV-05** | **MÉDIA — Depósitos conserva dados/permissões de carga anterior após erro** | `app/(private)/depositos/page.tsx:39-49` no `catch` seta `error` mas deixa `datos` antigo; `:69-70` continua derivando CREAR/EDITAR daquele objeto; `:114-156,206-224` não condiciona ação a uma carga principal atualmente confiável. | Limpar/inutilizar permissões e bloquear ações de edição/estado/atribuições durante erro e carregamento; preservar o formulário sujo. API/SQL continuam proteção real; **não classificar como bypass confirmado de servidor**. Testes 401/403/500/malformado depois de carregamento inicial, com formulário aberto. |
| **INV-06** | **BAIXA / DECISÃO UX — simulação volátil em Reposición** | `reposicion/page.tsx:126-145,305-307,425-435` permite valor `A planificar`, mas o estado é só local e não gravado; `:171-173` explica o limite. | Reduzir a ação à sugestão + link (ou abrir simulação sob demanda), sem aparentar aprovação ou requisição persistida. Não criar tabela de planos por presunção. |
| **INV-07** | **DEPENDÊNCIA FUNCIONAL FUTURA, não bug desta V1** | `lib/movimientos/documentos.ts` tem helper sem chamador operacional; `CONTRATO-INTEGRACION-MOVIMIENTOS-DOCUMENTOS-V1-2026-10-12.md` documenta `documento_referencia` texto, sem vínculo persistente evento físico + documento + linha. | Ao integrar Compras/Entregas/Factura/Remisión/NC, registrar **um evento físico único com prova transacional** e impedir baixa dupla. Não alterar V1 atual somente para antecipar documentos ausentes. |
| **INV-08** | **BAIXA / FUTURO — interface de trânsito sem produtor V1** | `reposicion/page.tsx:258-264` oferece incluir trânsito; `lib/reposicion/calculo.ts:6-10` trata como opt-in; progresso/documentação descrevem que transferência imediata não produz estado `TRANSITO`. | Manter não considerado por padrão; propor ocultar seleção até existir fluxo de expedição/recepção em trânsito. Não inventar saldo transitório. |
| **INV-09** | **POLÍTICA — parâmetros por depósito não vivem em Depósitos** | `lib/reposicion/datos.ts:42-44`, `lib/stock/shared.ts:73-75` leem `producto_deposito_configuracion`; formulário de Produtos edita por produto/depósito. | Deixar o único editor em Productos; Depósitos pode encaminhar à ficha, nunca duplicar manutenção. |

## 5. Escopo fechado sugerido para V1, sem antecipar grandes ERPs

**Stock:** consultar + filtrar + detalhar + navegar.  
**Movimientos:** registrar operação + consultar histórico + anular com autorização.  
**Depósitos:** cadastrar + editar identificação/sucursal nas restrições aprovadas + inativar/reativar + gerir acesso.  
**Reposición:** calcular necessidade + apresentar origem de transferência/compra + preparar (não executar) transferência.  

**Não criar agora:** WMS de ubicaciones, leitura de códigos de barras adicional, ordem de transferência em trânsito com duas confirmações, conteo cíclico completo, MRP automático, compras automáticas, aprovação multiestágio, novas permissões só para multiplicar menus, dashboards duplicados de Reportes. Esses temas precisam de demanda real e decisão própria.

## 6. Critérios de aceite transversais mínimos

- **CA-INV-01:** saldo exibido em Stock após um movimento registrado se reconcilia com movimentações e Kardex; nem Stock, Depósitos nem Reposición têm POST independente para saldo.
- **CA-INV-02:** abertura de Movimientos via Stock/Reposición segue permissões `VER+CREAR`, valida a autorização e depósitos no servidor, não assume que link pré-preenchido é gravação.
- **CA-INV-03:** Reposición não considera terceiros nem dupla subtração da reserva; utiliza ponto/mín./máx. na escala correta; plano global nunca cede mais estoque que a origem pode dar.
- **CA-INV-04:** parâmetro por depósito tem um único editor (Productos) e uma única política efetiva de comparação por depósito; consolidado não duplica o plano.
- **CA-INV-05:** depósito inativo preserva histórico/acessos, não participa de novas operações; inativação com saldo é rejeitada; mudança de sucursal após primeiro movimento é impedida; atribuição/revogação gera trilha persistente.
- **CA-INV-06:** falha de carregamento/401/403/500 não deixa ações autorizadas por cache de outra carga; rascunho preservado.
- **CA-INV-07:** moeda e importes comerciais de Stock não são misturados/somados incorretamente; KPI e Reportes explicam eventuais diferenças de escopo.
- **CA-INV-08:** saldo sem parâmetros e produto com parâmetros globais/por depósito são distinguidos, com estados vazios úteis; não inventar local físico nem trânsito.
- **CA-INV-09:** anulação é contramovimento vinculado, não exclusão; evento fiscal não gera efeito duplicado quando a integração futura existir.
- **CA-INV-10:** evidências reais em navegador (375/768/1440) e no único PostgreSQL operacional dependem do responsável, após avaliar riscos, não de alegação de teste local do Claude.

## 7. Pendências de decisão do responsável antes de solicitar mudança visual

**D-INV-01:** aprovar **quatro menus com os proprietários únicos** da seção 1, mantendo menus na categoria Inventario? (recomendação: sim).

**D-INV-02:** aceitar **reduzir visibilidade de KPIs/filtros em Stock e Reposición**, mantendo dados técnicos e relatórios, ou manter KPIs atuais e apenas eliminar duplicação de operações? (recomendação: manter indicadores mais úteis, ocultar detalhes avançados).

**D-INV-03:** manter coluna `A planificar` (simulação não persistente) visível ou recolhê-la em ação `Simular`? (recomendação: recolher).

**D-INV-04:** manter os nove tipos técnicos de movimento porém **agrupar visualmente por operação**; não eliminar tipos nem dados históricos (recomendação: sim).

**D-INV-05:** correções sem decisão comercial adicional **INV-02, INV-05** podem entrar numa futura tarefa técnica; **INV-03/04** exigem cuidado especial com apresentação de valores e moeda, mas não autorização para conversão cambial automática.

**Não rediscutir decisões já aprovadas**: taxa de câmbio de Catálogos comerciales manual; saldo próprio separado de terceiros; alteração de unidade-base com guarda U07; sem recálculo automático de preços U10; depósito/sucursal/auditoria de acessos; trânsito não presumido; um efeito físico por evento; nenhum deploy/SQL por IA.

**Próximo passo:** obter aceite deste recorte; depois autorizar Claude Code a implementar apenas itens escolhidos (commits por menu, helpers e casos, sem VM/SQL real); ChatGPT reaudita, responsável valida operacionalmente. **Nenhuma implementação autorizada automaticamente por esta auditoria.**


## 8. Decisão documental do responsável — responsabilidades oficiais (13/10/2026)

**Aprovada a separação de responsabilidades** dos quatro menus no Inventario, sem eliminar dados históricos nem modificar a implementação automaticamente. A **definição normativa** e única de menus, responsabilidades, limites e critérios de aceite é [DEFINICAO-MENUS-INVENTARIO-V1.md](../DEFINICAO-MENUS-INVENTARIO-V1.md). Esta auditoria mantém provas e achados (INV-01…INV-09). A simplificação concreta dos KPIs, a aparência e a posição da ação `A planificar/Simular` devem ser validadas visualmente antes de implementar telas. **Não confundir documentação aprovada com código implantado.**

**Próximo gate:** autorizar Claude para a tarefa escolhida após concluir correções ainda abertas de Catálogos comerciales; futuras correções de Inventario devem tratar INV-02/03/04/05 e a separação de responsabilidades, sem migrações/desenvolvimento antecipado por esta decisão.
