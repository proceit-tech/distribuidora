# Nexit V1 — Revisão integrada UX/campos: Detalle Stock, Reposición, Nuevo Movimiento

**Data:** 2026-10-12. **Solicitação:** padronizar visualmente as três telas e confrontar campos/ações com APIs e banco antes de qualquer ampliação. **Estado:** especificação para Claude; NÃO implementada nem homologada. Sem autorização de SQL, migrations, VM ou deploy.

## Evidências

Código real da branch `feature/NEXIT-2026-001-banco-demo`: `app/(private)/stock/[id]/page.tsx`, `app/(private)/reposicion/page.tsx`, `app/(private)/movimientos/nuevo/page.tsx`, `lib/stock/shared.ts`, `lib/reposicion/{calculo,datos}.ts`, `app/api/{stock,movimientos,reposicion}`, `lib/movimientos/shared.ts`. Padrões V1 de Clientes, Productos, Catálogos e `components/ui/lista-padrao`. Conferir DDL de inventário, permissões e contratos antes de alterar qualquer regra. Protocolos `CLAUDE.md` e `documentacao/PROTOCOLO-IA.md`.

## Mapa por tela

| ID | Tela / campo / ação | Situação confirmada no código | Ajuste solicitado e limite |
|---|---|---|---|
| UX-01 | Detalle Stock — cabeçalho | Hero com pill STOCK, título, código/categoria/marca, link voltar | Seguir cabeçalho compacto/breadcrumb Nexit; não repetir título e legenda sem função; preservar identidade do produto e volta |
| UX-02 | Detalle — 5 indicadores | DISPONIBLE, RESERVADO, CUARENTENA, TRÁNSITO, VALOR FÍSICO | Padronizar cards, formatos e significado; evitar chamar valor inventário de custo médio |
| UX-03 | Detalle — resumo | Modo controle; mínimo/ponto/máximo; físico, virtual, custo médio, propriedade, proprietário | Hierarquia visual legível; informação do produto separada de depósito; não inventar localização |
| UX-04 | Detalle — depósitos | Tabela por depósito de disponível/reservado/quarentena/trânsito/físico, localização não modelada | Padronizar tabela com vista de saldos reais; mensagem Sin ubicación registrada em vez de coluna vazia; respeitar alcance do usuário |
| UX-05 | Detalle — lotes | Bloco condicional no final | Auditar validade, depósito, propriedade, vencimento e apresentação; dados ausentes não são fictícios |
| UX-06 | Detalle — ações | Apenas link voltar, conforme código examinado | Nova barra útil com ações reais permitidas: Nuevo movimiento (pré-seleção segura de produto e depósito quando viável), Movimientos, Reposición; histórico do produto somente se API existente/implementável com dados reais. Não expor ações inválidas sem permissão, e nunca alterar saldos por clique no detalhe |
| UX-07 | Reposición — cabeçalho | Breadcrumb, título, texto extenso, links Stock/Movimientos | Compactar e padronizar sem ocultar distinção 'solo planificación'; botões sem função real não devem aparecer |
| UX-08 | Reposición — filtros | Busca, Depósito, Marca, Situación, Tránsito, limpiar | Padrão lista Nexit; mostrar claramente quando default 'Necesitan reposición' oculta registro(s); exibir 'x de y' e estado vazio explicativo; preservar filtros/orden/paginação |
| UX-09 | Reposición — indicadores | Necessitam, sem stock, baixo mínimo, possível transferência, sem meta | Definir escopo dos contadores (todos vs filtrados) e rótulos; preservar cálculo global determinístico AUD-REP-01..04 |
| UX-10 | Reposición — grade | Produto, depósito, disponível, R/C/T, mínimo/ponto/máximo, situação, sugerida, alternativas, A planificar, ações | Tornar tabela responsiva e legível; diferenciar plano ativo, consolidado de referência, sem gatilho, sem parâmetros; avisar que quantidades ajustadas são simulações locais, não são salvas |
| UX-11 | Reposición — ações | Link para Detalle Stock e opcional Ir a Movimientos com permissão | Habilitar navegação contextual segura para Novo movimiento de transferência com dados pré-preenchidos validados, **somente quando compatível** com a API atual; caso contrário documentar dependência e não sugerir transferência como executada. Compra não tem fluxo transacional nesta etapa: sem botão fictício |
| UX-12 | Reposición — cálculos | `calcularPlanReposicion` compartilha capacidade global | Não alterar decisões/fórmulas; teste para 2 destinos/1 origem e reserva mínima, sem overbooking; trânsito opcional permanece simulação |
| UX-13 | Nuevo Movimiento — tipo | ENTRADA, SALIDA, TRANSFERENCIA, AJUSTE_POSITIVO/NEGATIVO, RESERVA, LIBERACION_RESERVA, CUARENTENA, LIBERACION_CUARENTENA | Não retirar opções; labels em espanhol coerentes e descrição curta da consequência; origem deve ser revisada conforme tipo, sem inferir documento fiscal registrado |
| UX-14 | Nuevo Movimiento — origem | MANUAL, COMPRA, VENTA, DEVOLUCION, TRANSFERENCIA, AJUSTE, INVENTARIO no backend | Não afirmar que documento externo existe; alinhar opções UI/API e validações |
| UX-15 | Nuevo Movimiento — data e referência | fecha, documentoReferencia, motivo, observación | Data local es-PY, referência como texto não-vinculado; motivo obrigatório nos tipos que o SQL exige, erros inline; não prometer vínculo factura/NC/remisión |
| UX-16 | Nuevo Movimiento — item | Produto, quantidade, unidade base, custo unitário condicional, modo de estoque | Validar >0, custo quando exigido, unidade e precisão, produto ativo/alcance; impedir custos fictícios e quantidades negativas; indicar unidade do produto |
| UX-17 | Nuevo Movimiento — depósitos | Origem/destino condicionais ao tipo | Mostrar apenas os campos relevantes, impedir origem=destino, validar acesso ao depósito e saldo (backend preservado) |
| UX-18 | Nuevo Movimiento — lotes | Lote e vencimento condicionais | Verificar exigência por modo de controle, permitir somente combinações válidas; não inventar suporte a unidades identificadas se banco não possui |
| UX-19 | Nuevo Movimiento — status | Card mostra badge 'Registrado' antes de gravar | **Defeito visual semântico:** novo movimento ainda não está registrado; substituir por rótulo correto (p.ex. 'Nuevo' / 'Sin registrar'), sucesso só após confirmação da API |
| UX-20 | Nuevo Movimiento — aviso código | Header anuncia MOV-XXXXXX gerado | Manter geração no servidor mas remover ou compactar aviso duplicado, seguindo padrão atual |
| UX-21 | Nuevo Movimiento — erros/navegação | Form e banner geral; submit; link cancelar | Adotar erros por campo/foco, confirmação dirty, estados loading/sucesso/erro, submit duplo controlado; não interromper idempotência atual |
| UX-22 | Três telas / padrões | CSS específicos, estilos não uniformes com Clientes/Productos | Adaptar espaçamentos, labels, cards, tabelas, títulos, botões, estados vazios, foco, mobile/tablet 375/768/desktop; reaproveitar componentes padrão |
| UX-23 | Permissões | STOCK.VER para stock/reposición, MOVIMIENTOS.CREAR para novas entradas | Links condicionais com checagem server-side; empresa_id e depósitos da sessão; não criar permissão nova |
| UX-24 | Persistência | Stock/Reposición somente leitura; Movimiento confirma em procedure SQL | Nunca gravar pedido/compra/NC/remisión de Reposición, jamais alterar saldo diretamente; todo estoque segue funções SQL oficiais |

## Diretrizes de execução para Claude
- **Primeiro** confronto campo a campo e registro de divergências API ↔ UI ↔ DB, com severidade comprovada e testes. Preservar funcionalidades. **Depois** implementar ajustes visuais e navegação contextual autorizada. Não fazer redesign arbitrário com telas imaginárias.
- Empregar espanhol do Paraguai, sem labels duplicados nem badge de sucesso antes do salvamento; títulos e breadcrumbs padronizados. Mostrar dados reais e ações reais.
- Pré-preenchimento via query params de produto/tipo/depósito exige validação/autorização de servidor, nunca aceitar valor sem reconfirmar os dados elegíveis.
- Testes locais com formulário, múltiplos tipos, permissões, erro de API e disponibilidade; tsc, ESLint nos tocados e build. Claude não executa PostgreSQL real/VM/Docker nem migrations.
- Commit+push branch oficial, relatório de arquivos/testes/pendências; parar para auditoria ChatGPT. Não marcar HOMOLOGADO.

## Escopo explicitamente fora desta etapa
Integração automática factura/remisión/NC, pedidos de compra, motor comercial, tabelas de localizações físicas, novas migrations, mudanças na política de custo/inventário, escrita direta em Stock ou Reposición.
