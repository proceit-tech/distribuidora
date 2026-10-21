# NEXIT V1 — Ordem de implementação integrada de Inventario
## Stock · Movimientos · Depósitos · Reposición

**Autorização expressa do responsável:** implementar, em conjunto, a organização funcional e a simplificação dos quatro menus de **Inventario**, preservando integralmente o comportamento de negócio existente e eliminando funções redundantes. **Data:** 2026-10-13 (conforme cronologia do repositório). **Escopo:** somente os quatro menus, suas APIs/helpers diretamente necessários e regressões de integração com **Productos > Inventario** e **Reportes**. **Branch oficial:** `feature/NEXIT-2026-001-banco-demo`. **HEAD de referência ANTERIOR à ordem:** `dfd770faa204b6381d8bc765ece98809674ebe55` — Claude deve trabalhar **a partir do HEAD real atualizado**, não fazer reset para este SHA.

**Regras canônicas (ordem de precedência para esta tarefa):**
1. `CLAUDE.md` e `documentacao/PROTOCOLO-IA.md` — ler integralmente na versão atual, inclusive restrições de segurança, testes, Git, ambiente único.
2. `documentacao/v1/DEFINICAO-MENUS-INVENTARIO-V1.md` — contrato funcional **aprovado** para os quatro menus. Esta ordem autoriza expressamente sua implementação.
3. `documentacao/v1/auditoria-por-menu/AUD-INVENTARIO-INTEGRADA-V1-2026-10-13.md` — provas, IDs INV-01…09, decisões, critérios CA-INV-01…10.
4. Auditorias de Stock, Movimientos, Depósitos e Reposición no mesmo diretório; `PROGRESSO-NEXIT-V1.md` (trechos pertinentes).
5. Documentos e migrations que governam saldo, custos, funções de movimento, depósito, lotes, controle de estados e alcance, além de `CONTRATO-INTEGRACION-MOVIMIENTOS-DOCUMENTOS-V1-2026-10-12.md`. Ler seletivamente as implementações reais `app/(private)`, `app/api`, `lib`, `types`; não reinventar o sistema.

## 0. Sequenciamento: evitar interferência com entrega anterior

Uma correção separada, **CC-R03-01**, de Catálogos comerciales foi encaminhada antes. **Não misturar** CC-R03-01 ou Listas de precios com esta tarefa. Se houver trabalho local pendente do Claude (mudanças não commitadas ou operação anterior em andamento), **concluí-lo/preservá-lo, publicar em commit separado ou parar e informar o bloqueio**, sem sobreposição e sem descartes. Confirmar `git status`, branch e HEAD; `git fetch`, sincronizar de maneira segura/fast-forward; se a branch avançou, revalidar os arquivos afetados e evitar sobrescrever mudanças recentes. **Não executar simultaneamente dois processos de edição no mesmo clone.**

## 1. Divisão exclusiva de responsabilidades (contrato obrigatório)

| Menu | Só pode ser dono de | Não pode fazer |
|---|---|---|
| **Stock** | Leitura: produtos, depósito, saldo por estado, lotes, informação real de custo/valor, detalhe e links | Gravar saldo/entrada/saída, editar depósito, editar parâmetros de reposição, gerar compra, emitir/exportar relatório paralelo |
| **Movimientos** | Registrar entrada/saída, transferência, ajuste, reserva/liberação, quarentena/liberação; histórico, detalhe e anulação autorizada | Editar metas de reposição, cadastrar depósitos ou segundo motor de estoque |
| **Depósitos** | Cadastro de depósito, vínculo à sucursal, estado, acesso e histórico das atribuições de usuários | Ter tabela independente de saldos, entradas, transferências ou estoque mínimo por produto |
| **Reposición** | Cálculo de necessidade, urgência, indicação de compra/transferência, simulação *não persistente* e link para ação física em Movimientos | Criar documento de compra/transferência automaticamente, registrar movimentos, alterar quantidades/custos ou manter cadastro duplicado de produto |

**Editor único de mín./ponto/máx./cantidad reposición por produto e depósito:** `Productos > Inventario`. **Relatórios oficiais:** `Reportes > Kardex / Stock general / Valorización / Stock crítico`. Atalhos cruzados são permitidos e devem preservar permissões e filtros; não duplicar CRUD nem regra de saldo.

## 2. Implementação expressamente autorizada (interfaces + defeitos confirmados)

### A. Stock — somente consulta, compacto e claro

- Reduzir a proeminência de indicadores da página inicial para os essenciais **SKU, Disponible, Sin stock e Bajo mínimo**, mantendo informações detalhadas de reservado, quarentena, trânsito, lotes, terceiros, custos e valores na ficha/detalhe e nas telas que realmente precisam. Não eliminar dados úteis nem remover funções de leitura existentes.
- Manter filtros de produto/depósito e, quando relevante, estado/propiedade; consolidado ≠ depósito (nunca apresentar subconjunto autorizado como total da empresa). Indicadores, filtros e detalhes com as **mesmas definições**; depositos inativos com histórico não devem desaparecer.
- Manter um acesso contextual a `Reposición` e outro a `Movimientos`/histórico, sem ações que alterem saldo nesta tela. Botão `Nuevo movimiento` apenas abre formulário oficial com pré-seleção.
- **INV-02:** corrigir visibilidade dos links `Nuevo movimiento`/transferência preparada para exigir `MOVIMIENTOS.VER` **e** `MOVIMIENTOS.CREAR`, visto que layout pai requer VER e filho requer CREAR. Preservar API/SQL; não conceder permissões implicitamente.
- **INV-03/04:** impedir totais de valor comercial apresentados com moeda errada e imprecisão de float. Verificar a moeda real de `REF-VENTA` vs `empresas.moneda_base_codigo`; **não somar valores de moedas diferentes sem taxa/critério oficialmente aprovado**. Preferir não mostrar agregado comercial enganoso quando falta conversão formal; se exibido, rotular unidade monetária e usar operações de decimal preciso para valores oficiais/comparáveis a Reportes. Não inventar câmbio automático; não zerar registros por ausência de preço; preservar custo real e indicadores válidos. Criar regressões de valores grandes e frações, moedas PYG/USD e visualização com acesso parcial.
- Não reintroduzir `Exportar Excel` e `Valorizado por marca` no cabeçalho (já movidos/consolidados em Reportes). Não implementar localização física sem tabela real.

### B. Movimientos — quatro grupos visuais, um motor físico existente

- Agrupar **sem alterar enums/SQL nem apagar históricos** os nove tipos técnicos em quatro opções claras no formulário:
  1. `Entrada / Salida` — fatos físicos identificáveis;
  2. `Transferencia` — imediata entre depósitos;
  3. `Ajuste` — positivo/negativo, motivo obrigatório segundo contrato;
  4. `Cambio de estado` — Reserva / Liberación, Cuarentena / Liberación.
- Cada opção apenas apresenta subtipos/campos válidos existentes, com labels e mensagens em espanhol do Paraguai e entradas condicionais; manter os cenários atuais, inclusive lote, custo real exigido quando aplicável, data, validação de quantidade e `modo_control_stock`. Não sugerir ação impossível de `UNIDAD_ETIQUETADA`.
- Preservar registro pelo mesmo `inventario_registrar_movimiento` e anulação apenas pelo `inventario_anular_movimiento`; chave de idempotência, histórico, estado/alcance, confirmação real e rollback. Manter motivos obrigatórios conforme `lib/movimientos/reglas.ts` e política documentada.
- Lista inicial apresenta operações, datas, origens/destinos, responsáveis, situação, filtro/detalhe; Kardex acumulado/exportação continuam em Reportes. Ações em Stock/Reposición apontam ao formulário **real**, nunca implementam segundo POST.
- Não ativar eventos de Factura, NC, Remisión ou compras ainda sem vínculo transacional persistido. Documento fiscal ≠ evento físico; sem duplicação de baixa.

### C. Depósitos — cadastro/estado/usuários, sem controles duplicados de estoque

- Manter código imutável, nome, sucursal, ativação/inativação lógica, atribuição/revogação de usuários e histórico de acesso existente; não adicionar editor de parâmetros de reposição aqui. Se útil, um link simples `Ver stock` deve usar Stock filtrado, **somente quando o filtro efetivo for realmente aplicado**, nunca link cenográfico.
- Preservar restrições SQL e de escopo: empresa/sucursal/depósito, código único, impossibilidade de inativar com saldo, histórico visível mesmo após desativação, sucursal bloqueada quando aplicável, autorização para gestão de usuários. Não dar DELETE físico a depósitos.
- **INV-05:** depois de falha HTTP, 401/403/500, resposta malformada ou nova carga em curso, dados/permissões da consulta anterior **não podem liberar Criar/Editar/Ativar/Inativar/Gerir usuários**. Bloquear ações sem carga confiável, preservar formulário sujo, permitir recuperação de carga, sem alegar bypass comprovado de servidor. Testar alternância de resposta lenta e estados de autorização.
- Simplificar formulário/lista no mesmo padrão visual de Clientes/Productos já adotado; manter as informações e operações reais. Não inventar localizações de WMS.
- NEX-046 foi versionada anteriormente: conferir pré-requisitos no Git e documentar, mas **não presumir aplicação no PostgreSQL real**.

### D. Reposición — decidir e recomendar, não executar

- Tornar a tabela principal enxuta em **Producto · Depósito · Disponible · Necesidad/meta · Recomendación/Acción**. Manter detalhes de R/C/T, mínimo/ponto/máximo, causa, fornecedor e alternativas acessíveis em linha expandida/detalhe, não perder informação legítima.
- **INV-01:** distinguir o indicador de Stock `Bajo mínimo` do critério `En punto de reposición` (um produto pode estar `Normal` no Stock e `En punto` na Reposición); rótulos e textos breves devem esclarecer.
- **INV-06:** recolher a coluna de edição local `A planificar` da grade principal e expô-la como **`Simular`**, caso mantida, com aviso inequívoco de que é local, não grava planejamento, não reserva e não executa. Ao sair/recarregar, não alegar persistência. Não construir módulo/tabela nova de planos.
- **INV-08:** sem fluxo real de transporte em duas etapas, **não oferecer trânsito como ingresso efetivo por padrão**. Manter trânsito informativo e a regra atual de exclusão; se mantida qualquer simulação avançada, deixar muito explícito que é hipótese, não disponibilidade confirmada.
- **Preservar integralmente** `lib/reposicion/calculo.ts` e seus invariantes: terceiro excluído do próprio, reserva não descontada em duplicidade, parâmetros por depósito separados do global, linha consolidada só referência se há planos por depósito, origem com excedente alocado **uma única vez** para vários destinos, origem sem parâmetros fora da transferência confirmada, compra residual sem pedido automático, `UNIDAD_ETIQUETADA` sem link de movimento impossível.
- `Preparar transferencia` apenas pré-preenche `/movimientos/nuevo`, visível para quem tem VER + CREAR, e o servidor revalida tudo ao registrar. Indicação de compra é informativa; não criar botão que prometa compra real.

## 3. Defeitos, melhorias e dependências — classificação

- **Correções técnicas prioritárias:** `INV-02`, `INV-03`, `INV-04`, `INV-05`; verificar também persistência de estado/links após carga e regressões existentes.
- **Ajustes funcionais/visuais expressamente aprovados nesta ordem:** menu com responsabilidades exclusivas; agrupamento dos nove tipos em quatro famílias, resumo de KPIs de Stock, tabela enxuta e `Simular` em Reposición, mensagens claras e navegação entre módulos.
- **Não são bugs da V1 a implementar por presunção:** `INV-07` integração física-fiscal ainda sem tabelas de documentos/eventos, `INV-08` fluxo futuro de trânsito de duas etapas, localização física, MRP, WMS, aprovação de compras e nova engine de valuation. Não ampliar escopo.
- **Parâmetros em Productos e Reportes não podem regredir.** Alterar arquivos nesses módulos só quando estritamente necessário a uma correção transversal comprovada; documentar justificativa no progresso e fazer regressões.

## 4. Qualidade, compatibilidade e segurança

1. **Antes de editar:** confrontar campo-a-campo telas ↔ API ↔ helpers ↔ migrations vigentes, confirmar que a UI só usa capacidade realmente existente. Registrar divergência concreta, não presumir migração aplicada porque arquivo existe.
2. Reutilizar componentes/estilo já consolidados em Clientes, Productos e Catálogos: tabelas, busca, ordenação, filtros, campos, erros por campo/foco, modal de confirmação, `useProtegerCambios`, estados vazios/erro/carga. **Não criar framework visual paralelo** e **não remover dados necessários** só por compactação.
3. Menus completos em espanhol (Paraguay), layout compacto, profissional, responsivo em 375px/768px/1440px; acessibilidade do teclado, foco, mensagens, colunas e botões; evitar duplicação de cabeçalhos e textos longos.
4. Segurança: `empresa_id` sempre da sessão, permissões por ação, alcance de sucursal/depósito e dados de terceiros. Em resposta malformada/erro, nunca declarar permissão com cache anterior.
5. Não editar migrations já aplicadas. **Se realmente indispensável uma evolução estrutural** para requisito autorizado, preparar migration SQL **incremental nova** e script de verificação/reversão, versionados para auditoria, **sem executar**. Preferir mudanças puramente de UI/API/helper para o escopo enxuto atual.
6. Preservar tabelas reais, numeração/histórico/identidades, compras/remisiones/NC futuras, validade dos saldos/custos; não usar DEMO_MODE como prova do ambiente real.
7. Implementar helpers puros quando melhoram testes e evitar alteração de lógica sem motivo. **Não mudar fórmulas de reposição já corrigidas** nem reabrir decisões de outros módulos por estética.

## 5. Testes mínimos obrigatórios — cruzando os quatro menus

- Verificação de tipos `tsc`, ESLint dos alterados, `next build`, suíte de regressão local dos quatro menus e suites afetadas de Productos/Reportes. Registrar quantidades executadas e falhas, diferenciando código puro, mocks, HTTP, PostgreSQL, navegador.
- **INV-T01:** entrada / saída / ajuste / transferência entre A e B afeta uma única vez os saldos em Stock e a sugestão de Reposición, respeitando quantidade, lote, estados e alcance; nenhum outro menu executa uma operação.
- **INV-T02:** Reposición: depósito A cede a B e C sem soma de alocações maior que excedente, não reduz A abaixo do próprio mínimo/ponto; origem sem parâmetros fica `a validar`; consolidado não duplica planos.
- **INV-T03:** Stock: consolidado, por depósito ativo/inativo e usuário ASIGNADOS; propriedade PROPIO vs TERCERO, custo, disponível, reservados, quarentena, lotes; sem soma indevida de valores em moedas distintas.
- **INV-T04:** Movimientos: quatro grupos, nove tipos existentes, motivo obrigatório, entrada com custo, transferência válida/inválida, data, unidade identificada sem ação impossível, anulação compensatória e idempotência, 401/403.
- **INV-T05:** Depósitos: criar/editar/ativar/inativar, restrição com saldo, sucursal imutável conforme regra, gestão de usuários e trilha histórica; falhas 401/403/500/malformação e respostas fora de ordem, rascunho preservado.
- **INV-T06:** acesso: Stock.VER sem MOVIMIENTOS.CREAR; MOVIMIENTOS.CREAR sem VER; VER+CREAR; INVENTARIO.VER sem editar; perfil restrito a depósitos/sucursales; links e APIs coerentes.
- **INV-T07:** Reposición `Simular` não grava nada; `Preparar transferencia` não registra enquanto o usuário não confirmar no formulário real. Nenhum pedido de compra automático.
- **INV-T08:** UI mínima 375/768/1440; evidências ANTES/DEPOIS se navegador acessível sem VM proibida, senão registrar pendência explícita, nunca inventar prints. Rascunhos preservados ao navegar.
- **INV-T09:** relatório Kardex/Valorización permanece no menu Reportes e sem regressões de custo, moedas e totais; não inserir exportadores duplicados.
- **INV-T10:** não transformar `INV-07` em integração transacional sem modelo/contrato aprovado.

**Limite importante:** o projeto possui **um único ambiente operacional real**; não inventar staging nem teste de VM/PG. Claude **não acessa VM, Docker nem PostgreSQL real** e não aplica migration ou deploy. Executar localmente só o que está disponível/permitido, usar mocks onde necessário e registrar honestamente o que não foi comprovado. Responsável aplica e homologa no ambiente real após auditoria.

## 6. Plano de commits e entrega conjunta (não dividir a autorização em quatro pedidos)

**O responsável autorizou os quatro menus nesta mesma rodada**. Claude deve planejar a integração dos quatro antes de editar, mas pode implementar internamente em sequência para reduzir conflito:
1. helpers compartilhados, permissões e definições de cálculo/valor (somente quando estritamente exigido);
2. Stock;
3. Movimientos;
4. Depósitos;
5. Reposición;
6. regressões cruzadas e documentação final.

**Commits separados, verificáveis por módulo e por alteração transversal quando necessário.** Sem merge em main, sem deploy, sem tocar em Catálogos comerciales ou Listas de precios por conveniência. Se CC-R03-01 estiver sendo trabalhada no mesmo clone, não começar esta rodada antes de preservar/concluir aquela alteração. Não editar documentos de auditoria `AUD-*` do ChatGPT; atualizar `PROGRESSO-NEXIT-V1.md` apenas no que for necessário, e testes/implementação onde realmente agregarem evidência sem duplicar documentação.

**Entrega final única:** indicar o que foi feito em cada menu, quantidade de testes reais locais executados/falhas, lacunas PG/navegador, scripts incrementais (se houver) e **SHAs completos dos commits separados**. **PARAR PARA REAUDITORIA DO CHATGPT**: não iniciar menu novo, não alegar 10/10 ou HOMOLOGADO e não pedir autorização adicional para os quatro menus já incluídos nesta ordem, salvo novo requisito, bloqueio efetivo ou alteração estrutural fora do escopo.

**Estado no momento da ordem:** documentação e autorização de implementação somente. Nenhuma alteração no código, banco, VM, Docker ou telas reais foi feita por esta ordem.
