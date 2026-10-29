# Auditoria independente — entrega Stock/Reposición commit 562feeec

**Data:** 2026-10-12. **Auditado:** `562feeec9de83297e578f3f52002af65d634814e`. **Conclusão:** implementação estática substancial, **ajustes solicitados antes de recomendar deploy**. Não homologado em PostgreSQL/navegador.

## Fonte
Commit/diff e arquivos `lib/reposicion/calculo.ts`, `lib/reposicion/datos.ts`, `lib/stock/shared.ts`, `lib/stock/vista.ts`, `app/api/reposicion/route.ts`, `lib/movimientos/documentos.ts`, implementação e contrato documentados; protocolos `CLAUDE.md`, `PROTOCOLO-IA.md`. Relato local Claude: 1635 casos, tsc/lint/build OK, não reproduzidos.

## Conforme pela inspeção
- Stock elimina botões duplicados Exportar Excel e Valorizado por marca, preserva links Movimientos/Reposición.
- `vistaPorDeposito` calcula saldos e valores por depósito sem usar valores consolidados, e estado estoque pela política declarada.
- Reposición: GET com `STOCK.VER`, somente SELECT; transito opcional, sem incluir quarentena, reserva não descontada duas vezes.
- Novo caminho /reposicion e permissão de navegação; sem migration nem automação fiscal.
- Documento de contrato fiscal identifica ausência de chave relacional por documento/linha; `lib/movimientos/documentos.ts` é função pura, não se conecta à API nem ao SQL de movimentação.

## Achados que precisam de solução/clarificação
**AUD-REP-01 — P1: sobreposição de planos por produto (comprovada).** `leerEntradasReposicion` acrescenta uma linha por depósito que tem parâmetros específicos e **também** uma linha consolidada se o produto tem parâmetros globais. Estas linhas podem cobrir o mesmo saldo e sugerir compra duas vezes. Não somar quantidades nem exibir sugestões agregadas sem separar planos; recomendar escolha inequívoca de escopo ou prevenção explícita de dupla contagem e aviso na UI, com testes por mesmo produto em 2 depósitos.

**AUD-REP-02 — P1: cessão integral de depósito sem mínimo/ponto (comprovada).** `calcularReposicion` define reserva 0 quando depósito doador não tem mínimo/ponto e sugere transferir todo seu `DISPONIBLE` (`origenSinParametros: true`). O texto marca advertência mas a sugestão continua. Decisão explícita de transferir de depósitos sem parâmetros segue pendente. Conservador: não considerar saldo como transferível confirmado até política aprovada, ou distinguir como disponibilidade a validar manualmente (sem incluí-lo em quantitativo automático).

**AUD-REP-03 — P1: `SIN_PARAMETROS` com `cantidadReposicion` (comprovado).** O cálculo retorna sem parâmetros/não necessita quando mínimo, ponto e máximo são zero, mesmo se `cantidadReposicion` configurada. Verificar UX: uma quantidade alvo sozinha não define gatilho de reposição; exibir distinção 'tem quantidade sem gatilho', em vez de ocultar incoerência.

**AUD-REP-04 — P1: prioridade e teto na ausência de máximo.** Gatilho de estoque zero/mínimo sem máximo pode produzir sugestão nula (intencional); no modo global, `cantidadReposicion` é sempre null. Validar resultado e feedback quando regras insuficientes, sem inventar máximo.

**AUD-DOC-01 — P0 antes de ligar documentos: garantia de unicidade é somente conceitual.** `decidirEfecto` recebe `efectosPrevios` confiados pelo chamador e constrói chave determinista; não existe armazenamento de identidade forte `eventoFisicoId`/linha nem vínculo de documentos nesta entrega. **Não afirmar que a função já impede concretamente baixa duplicada por Factura+Remisión.** Somente quando houver integração real e constraint transacional documentada. Isso não bloqueia Reposición apenas leitura.

**AUD-INV-01 — P1 QA PostgreSQL.** Filtragem `PERMITIDOS`, `usuario_deposito`, `producto_deposito_configuracion`, validação de SQL e acessos dependem de PostgreSQL real. Nenhuma execução por ChatGPT. Confirmar detalhes da consulta e do tipo de quantidade/custo ao usar depósito inativo e acesso parcial.

**AUD-INV-02 — P1 dados cadastrais.** Ficha mostra `Sin ubicación registrada` porque modelo físico não foi encontrado; não simular localização.

## Próxima ação
Claude deve corrigir AUD-REP-01 e AUD-REP-02 de forma conservadora, adicionar testes cobrindo duplicação de planos/saldo doador sem parâmetros, melhorar aviso AUD-REP-03, e ajustar a redação do contrato AUD-DOC-01. Não mudar migrations ou executar VM, banco, Docker. Fazer commit+push e parar para auditoria. Human fará SQL/VM e homologação depois da nova revisão.
