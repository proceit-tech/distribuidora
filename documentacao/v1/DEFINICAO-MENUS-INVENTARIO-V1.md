# NEXIT V1 — Definição funcional oficial dos quatro menus de Inventario

**Decisão do responsável (2026-10-13):** organizar, simplificar e separar responsabilidades dos quatro menus, preservando o funcionamento real já existente e evitando duplicações. **Estado:** contrato de responsabilidades DEFINIDO; detalhes visuais para futura implementação, **sem autorização implícita para alterar a aplicação**. **Branch:** `feature/NEXIT-2026-001-banco-demo`. **Fonte de evidências da auditoria e achados:** `documentacao/v1/auditoria-por-menu/AUD-INVENTARIO-INTEGRADA-V1-2026-10-13.md` (SHA de inspeção `02d730e6e13ed2b0183563835e27757c18b50259`). Esta definição é a referência normativa; a auditoria é a referência para provas, defeitos, limitações e testes.

## 1. Objetivo e princípios vinculantes

- **Quatro menus, sem quinto processo paralelo:** **Stock = CONSULTAR**, **Movimientos = REGISTRAR/ANULAR**, **Depósitos = CADASTRAR E AUTORIZAR**, **Reposición = PLANEJAR**.
- **Um único efeito físico por evento:** todos os efeitos de estoque passam pelo motor de `inventario_registrar_movimiento` / `inventario_anular_movimiento`, com idempotência e permissão. Nenhum botão de Stock, Depósitos ou Reposición altera `stock_saldos` diretamente. Um atalho para Movimientos não é execução.
- **Separação entre dados mestres, execução e relatórios:** configurações de produtos, apresentacões e políticas mín./ponto/máx./quantidade por depósito são editadas só em `Productos > Inventario`; depósitos são cadastrados só em Depósitos; lançamentos são executados só em Movimientos; análises/exports/valorização contábil detalhada e Kardex pertencem a Reportes.
- **Histórico imutável e operação verificável:** saldos derivados dos fatos efetivos; cancelamentos geram contramovimento; depósitos inativos continuam consultáveis no histórico. Documentos fiscais não geram baixa física somente por existirem; prevenir duplicidade de movimento é obrigação quando integrações forem aprovadas.
- **Empresa, sucursal, depósito, perfil, estados e propriedade:** sempre respeitar `empresa_id` da sessão, permissões por recurso/ação e alcance do usuário; `PROPIO` separado de `TERCERO`; trânsito não é disponibilidade confirmada. Não criar ubicaciones, custo, preço, comprovante ou saldo fictícios.

## 2. Responsabilidade e funções permitidas por menu

### 2.1 Stock — `/stock` / `/stock/[id]` — somentes leituras

**Pergunta:** Qual saldo há de cada produto, em qual depósito, estado e lote?

**Funções essenciais da V1:**
1. Consultar/filtrar produto, código e depósito autorizado; mostrar visão consolidada x depósito explícita.
2. Exibir quantidade **DISPONIBLE**, RESERVADO, CUARENTENA e TRANSITO (se existir), total físico e terceiros separadamente; situação `Sin stock / Bajo mínimo / Normal / Sobrestock`; sem confundir com plano de compra.
3. Abrir detalhe do produto com saldos por depósito e lote/vencimento, custo/valor de fonte verdadeira quando disponível, sem inventar ubicaciones ou custos.
4. Atalhos para **Movimientos del producto / Nuevo movimiento** (apenas pré-selecionar dados, exigir permissões) e **Ver reposición**. Manter custo e preço referencial informativos com indicação de moeda; cálculos oficiais e exportações ficam em Reportes.

**NÃO possuirá:** cadastrar depósito, editar mín./ponto/máx., gravar stock, confirmar transferência/compra, plano duplicado ou Kardex separado.

**Simplificação visual pretendida:** cabeçalho compacto; poucos KPIs primários e filtros úteis; detalhes menos frequentes em ficha e Reportes. Retirada de `Exportar Excel` e `Valorizado por marca` do cabeçalho já foi aprovada e implementada; não reintroduzir. Preservar conteúdo existente até reavaliação visual e aprovação de versão concreta.

### 2.2 Movimientos — `/movimientos`, `/movimientos/nuevo`, `/movimientos/[id]` — lançamento único

**Pergunta:** O que entrou, saiu, mudou de depósito/estado ou foi ajustado, quem confirmou e por quê?

**Funções essenciais da V1:**
1. Consultar histórico de movimentos, filtros, referência e detalhe com identificação de origem/destino, produto, lote, data, usuário e estado.
2. Registrar fatos via um único serviço/API + funções SQL de inventário, com validação transacional de saldo, idempotência, quantidade, unidade-base, depósito permitido e motivo quando exigido.
3. Executar **entrada/saída física**, **transferência imediata**, **ajuste justificado** e **mudança de estado** (reserva/liberação/quarentena/liberação), mantendo os nove tipos técnicos atuais e históricos; apresentação da interface pode agrupar em quatro famílias, sem alteração de enum/SQL por motivo visual.
4. Anular somente com permissão crítica, confirmação e motivo; **contramovimento**, sem apagar fatos.

**NÃO possuirá:** formulário de depósito, manutenção de metas de reposição, determinação de compra ou tabelas próprias de relatórios com saldo acumulado (Kardex permanece em Reportes).

**Definição de entrada/saída vs ajuste:** entrada/saída reflete fato físico identificado; ajuste corrige divergência de inventário, perda, avaria e regularização mediante motivo. A diferença deve aparecer no texto da UI, sem executar o mesmo evento duas vezes. **No V1 atual**, `origen=COMPRA/VENTA/DEVOLUCION` no formulário manual e `documento_referencia` textual **não provam documento integrado**. Não antecipar integração fiscal. Na V1 atual transferência é imediata; despacho/recepção em dois tempos e trânsito são decisões futuras.

### 2.3 Depósitos — `/depositos` — mestre e autorizações

**Pergunta:** Qual depósito existe, em qual sucursal, está ativo e quem pode consultá-lo/operá-lo?

**Funções essenciais da V1:**
1. Listar, criar e editar identificação: código, nome, sucursal e estado; código imutável.
2. Ativar/inativar logicamente, **sem deletar histórico**; inativação bloqueada enquanto houver saldo; sucursal imutável após qualquer movimento (inclusive anulado).
3. Gerir atribuição/revogação de usuários quando permitido, com log persistente de mudanças efetivas; respeitar alcances de sucursal, depósito e perfis.
4. Quando necessário, oferecer **link** para consulta filtrada em Stock, não uma segunda interface de saldos.

**NÃO possuirá:** receber mercadoria, transferir, manter stock, ajustes, políticas de reposição ou cadastro de produtos. **Parâmetros por produto/depósito pertencem a Productos > Inventario**. Não criar WMS de corredores/prateleiras/endereços físicos sem modelo e demanda aprovados.

**Dependência de banco:** gestão de depósitos utiliza NEX-046, mas arquivo versionado **não prova aplicação no ambiente real**; conferir o ledger com responsável antes de falar em homologação/deploy.

### 2.4 Reposición — `/reposicion` — recomendações, nunca efeito físico

**Pergunta:** Qual produto exige abastecimento, quanto, de onde virá o stock ou o que falta comprar?

**Funções essenciais da V1:**
1. Calcular necessidade por produto × depósito com parâmetros **do mesmo escopo**: mínimo, ponto, máximo e quantidade de reposição, definidos em Productos; usar saldo próprio disponível; respeitar nível de prioridade, estados de estoque, alcance e inexistência de parâmetros.
2. Sugerir **transferência disponível** entre depósitos com parâmetros (sem consumir abaixo do próprio mínimo/ponto e **sem alocar a mesma origem duas vezes**), e compra residual com fornecedor principal/plazo como informação, não pedido automático.
3. Mostrar um plano por produto: políticas por depósito prevalecem; agregado global vira referência **não somada** quando existe plano por depósito.
4. Encaminhar `Preparar transferencia` como **pré-preenchimento** de Movimientos, com nova validação transacional no destino; nunca marcar como executada na Reposición.

**NÃO possuirá:** cadastrar depósito, lançar movimento, receber devolução automaticamente, gerar compra, garantir quantidade reservada, alterar custos ou criar plano persistente por padrão. Devolução de cliente e regularizações aparecem como **alternativas** somente quando há base real para orientá-las; execução vai ao módulo de origem/Movimientos.

**Simplificação visual pretendida:** tabela principal compacta `Producto · Depósito · Disponible · Necesidad/meta · Recomendación`, com detalhes por expansão. `A planificar` é atualmente simulação local sem persistência; recolher sob ação `Simular` claramente rotulada, ou manter apenas recomendação, **sujeito à avaliação visual humana**. `Considerar tránsito` não deve gerar falsa disponibilidade; V1 não produz trânsito na transferência imediata atual.

## 3. Exclusividade de dados, serviços e ações

| Ação/dado | Dono da edição/operação | Outros menus |
|---|---|---|
| Produto, apresentações, `stock_minimo`, `punto_reposicion`, `stock_maximo`, `producto_deposito_configuracion` | **Productos > Inventario** | Stock exibe, Reposición lê e calcula; Depósitos não edita |
| `depositos`, `usuario_deposito`, auditoria de acesso | **Depósitos** | Demais menus selecionam apenas depósitos autorizados |
| `movimientos_inventario`, `movimiento_lineas`, `stock_saldos` e estornos | **Movimientos + funções SQL de inventário** | Stock lê; Reposición calcula; Depósitos não escreve |
| `inventario_costos` e valor contábil | **Motor de inventário** (grava); **Reportes** (analisa/expõe exportação oficial) | Stock mostra indicativo consistente, sem soma cambial inventada |
| Sugestão de abastecimento, quantidade transferível, compra residual | **Reposición** | Stock acessa via link; Movimientos apenas executa fato confirmado |
| Lotes e disponibilidade física | **Movimientos** cria/atualiza fatos e lotes autorizados | Stock mostra; Reposición considera ao planejar, dentro do suporte V1 |
| Relatório Kardex, valorização, stock geral/crítico, exportar XLSX/PDF | **Reportes** | Inventario utiliza links, não duplica relatórios |
| Compras, Facturas, Remisiones, NC e respectivos documentos/eventos físicos | **Módulos comerciais futuros**; efeito físico segue o mesmo motor | Nenhuma criação automática antecipada em Inventario |

## 4. Papéis, permissões e fluxos

| Menu | Leitura | Escrita / ação |
|---|---|---|
| Stock | `STOCK.VER` | Nenhuma escrita própria; atalho `Nuevo movimiento` deve exigir **`MOVIMIENTOS.VER` E `MOVIMIENTOS.CREAR`** até que o contrato de layouts seja alterado formalmente |
| Movimientos | `MOVIMIENTOS.VER` | `MOVIMIENTOS.CREAR` para registrar; `MOVIMIENTOS.ANULAR` para contramovimento |
| Depósitos | `INVENTARIO.VER` | `INVENTARIO.CREAR/EDITAR` e checagem extra de alcance e compatibilidade, inclusive ao gerir usuários |
| Reposición | `STOCK.VER` (cálculo somente leitura) | Sem mutações; preparar link requer ambas `MOVIMIENTOS.VER` + `MOVIMIENTOS.CREAR` |

**Fluxo típico:** Stock mostra produto com 2 disponíveis no Depósito B → Reposición calcula necessidade e identifica potencial transferência do Depósito A ou compra → Movimientos recebe pré-preenchimento e revalida, registra (ou rejeita) exatamente uma operação → Stock reflete o saldo → Reposición recalcula. Depósitos só define onde se pode operar e quem tem acesso.

**Fluxo não suportado automaticamente:** Factura/Remisión/NC de uma mesma entrega; evento físico único com vínculo persistente e regra de baixa aguardam decisão própria, conforme `CONTRATO-INTEGRACION-MOVIMIENTOS-DOCUMENTOS-V1-2026-10-12.md`.

## 5. Regras de negócio e condições de aceite

- **INV-RN-01:** nenhum Stock/Depósitos/Reposición grava quantidade física; único motor transacional de inventário.
- **INV-RN-02:** estado/depósito/empresa/propriedade e lote são consistentes; saldo próprio e terceiro nunca se confundem.
- **INV-RN-03:** um saldo exibido com alcance parcial não é anunciado como saldo global da empresa.
- **INV-RN-04:** alerta `Bajo mínimo` de Stock é diferente de `En punto` em Reposición. Stock normal e Reposición em ponto podem coexistir sem contradição.
- **INV-RN-05:** políticas por depósito prevalecem sobre global e não se somam; mínimo/ponto do depósito de origem são respeitados.
- **INV-RN-06:** histórico de movimentos e depósitos inativos é preservado; anulação é reversão rastreável, não DELETE.
- **INV-RN-07:** ações/atalhos são guardadas em UI, API e SQL com `empresa_id`, recurso e alcance; erro de carga nunca deixa permissões antigas utilizáveis.
- **INV-RN-08:** indicador monetário só pode somar valores de mesma moeda com precisão coerente; Reportes é fonte oficial para valuation.
- **INV-RN-09:** formulário de Movimientos não duplica documento futuro; valida fatos e reintentos sob idempotência.
- **INV-RN-10:** nenhuma exibição de trânsito/ubicación/valorização/preço deve inventar estado ou cotação não existente.

**Critério de aceite:** executar comparações tela/API/SQL em código, regressões locais dos quatro módulos, testes de isolamento por empresa/depósito, permissões e cenários de transferência/anulação e conferência com Reportes. A prova de comportamento real de PostgreSQL, rotas autenticadas e visuais 375/768/1440 só ocorre quando o responsável testar no único ambiente operacional. Ver critérios `CA-INV-01…CA-INV-10` e achados `INV-01…INV-09` na auditoria transversal; esta definição **não encerra** esses achados.

## 6. Ordem de entrega futura e limites

1. **Validar primeiro as correções técnicas de risco transversal** `INV-02` (links e permissões), `INV-03/04` (precisão/moneda) e `INV-05` (dados/permissões antigos após erro de Depósitos); corrigir apenas com escopo autorizado.
2. **Aplicar recorte visual enxuto** com responsabilidade única por menu, sem remover APIs, história, custos reais, estados, códigos e permissões. Cada menu em commit separado se houver implementação.
3. **Regredir integração entre os quatro**, incluindo Produtos > Inventario e Reportes, sem duplicar motor ou aplicar SQL.
4. ChatGPT audita; responsável homologa depois de validar no ambiente real e decidir aplicação de migrations pendentes. Claude só programa **após nova autorização específica**; esta documentação não é ordem de implementação.

**Sem implementação de código, deploy, SQL ou VM nesta decisão documental.** Os quatro menus continuam **NÃO HOMOLOGADOS** até aceite operacional.
