# Auditoria por menu — Stock

**Rota principal:** `/stock`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado:** ABERTA — NÃO AUDITADA INTEGRALMENTE — NÃO HOMOLOGADA  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Stock**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

## Itens obrigatórios da auditoria completa

- [ ] Todas as rotas e subtelas: navegação, abas, ações, modais, estados de erro e vazio.
- [ ] Campos: origem, exigência, máscara, validação client/server, persistência e retorno.
- [ ] APIs: métodos, status HTTP, consultas, filtros, paginação, transação, concorrência e tratamento de exceções.
- [ ] Autenticação, permissões de ação, isolamento multiempresa e alcance de sucursal.
- [ ] SQL: relações, constraints, índices, FK, trigger, integridade e scripts vinculados.
- [ ] Integrações e dependências entre menus; compatibilidade de dados.
- [ ] Casos de teste: positivos, negativos, limites e regressões; evidências de execução.
- [ ] UX: responsividade 1440/768/375, foco, acessibilidade, textos, confirmação de ações, screenshots reais.
- [ ] Conclusão com todos os achados numerados, severidade, evidência e critério de aceite.

## Achados confirmados até agora (parciais)

Nenhum defeito deste menu documentado ainda nesta ficha. Isso NÃO significa ausência de defeitos.

## Pendências

Auditoria exaustiva deste menu ainda não executada. Não atribuir percentual de cobertura sem inventário de arquivos e linhas revisadas.

## Regra de migrations

O responsável mostrou NEX-001…051 já aplicadas na VM. Proibido editar scripts aplicados, checksums ou reexecutar SQL histórico como se fosse nova migration. Qualquer nova alteração estrutural exige justificativa, aprovação e migration incremental a partir de NEX-052.

## Dependência crítica de Productos: unidade-base e alcance (12/10/2026)

**STK-X01 / BLOQUEANTE / integridade semântica:** a API de edição `app/api/productos/[id]/route.ts:253-296` atualiza `productos.unidad_medida_id` sem guarda de movimentos/stock; `NEX-009` e `NEX-014` contabilizam `stock_saldos.cantidad`, `inventario_costos` e `movimiento_lineas.cantidad` numericamente por produto, sem congelamento da unidade-base na movimentação. Trocar UNI→CJ sem conversão auditada reinterpreta saldos/histórico/custos. Auditar restrição de alteração da base após primeiro fato de inventário antes de qualquer mudança de schema.

**STK-X02 / ALTA / alcance:** `lib/stock/shared.ts` implementa filtro por `usuario_deposito`/`alcance_depositos` na consulta; `app/api/productos/route.ts` e `[id]/route.ts` não aplicam esse filtro ao saldo nem à lista de depósitos. Exigir consistência com a política de visibilidade de Stock ao recuperar dados via Productos.

**STK-X03 / precisão futura:** apresentação em `producto_unidades.factor_conversion` suporta 6 casas (`NEX-007`), mas movimentos/stock apenas 4 (`NEX-009/014`). Conversão aprovada DEC-PRD-U03 requer rejeitar quantidade não representável, sem arredondamento silencioso. A emissão FE atual não deve ser presumida uma baixa de estoque.

**Fonte:** `AUD-PRODUCTOS-V1.md`, seção XIV; auditoria completa de Stock continua aberta. Sem teste de banco/VM.

## Revisão da regra STK-X01 — unidade-base com versões históricas (12/10/2026)

O responsável esclareceu que deseja **histórico das unidades-base de um produto, somente uma base vigente por vez**, e não um bloqueio permanente de mudança após a primeira movimentação. Apresentações comerciais podem continuar múltiplas.

**A integridade de STK-X01 permanece obrigatória:** nenhuma mudança pode reinterpretar saldos, quantidades/custos ou movimentos antigos. `NEX-009/014` registram quantidades em escala 4 sem snapshot da unidade-base; `NEX-007` mantém somente o FK atual e marcação de apresentação base sem versionamento temporal. Exigir histórico da unidade-base e ligação factual às operações. **Decisão DEC-PRD-U07 tomada em 12/10/2026:** somente permitir mudar a unidade-base com todos os saldos do produto zerados e sem operações pendentes; manter histórico de bases, uma única vigente por vez. Especificação na seção XVI de `AUD-PRODUCTOS-V1.md`.

**Nenhum código/SQL/VM alterado.**


## Confirmação DEC-PRD-U07 — guarda de inventário para alteração de unidade-base (12/10/2026)

O responsável escolheu a política conservadora: mudança de base é permitida se e somente se **todo o estoque do produto na empresa** estiver zerado, em **todos os depósitos, estados (DISPONIBLE, RESERVADO, CUARENTENA, TRANSITO etc.) e propriedades (incluindo terceiros)**, sem operações pendentes. Um histórico de unidades-base deve ser preservado, com apenas uma base vigente. Movimentos encerrados não impedem a alteração, mas **nunca são reescritos**.

A futura proteção no banco e na API deve ser transacional e imune a corrida contra novos movimentos; não usar apenas saldos disponíveis, totais de tela ou depósitos ao alcance do operador como verificação de integridade. Investigar os vínculos operacionais efetivamente existentes em V1, sem inventar V2. Ver `AUD-PRODUCTOS-V1.md`, seção XVI.

**Estado:** regra aprovada, não implementada. Auditoria integral de Stock aberta; nenhum teste/SQL executado.

## Matriz operacional real V1 para mudança de unidade-base — complemento 12/10/2026

Consultar **`AUD-PRODUCTOS-V1.md` §XVII**: `stock_saldos` deve ser zero em **todos** estados, depósitos, lotes e propriedades, sem filtrar pelo alcance visual do operador. Qualquer `inventario_costos.cantidad_valorizada` remanescente e falta de conciliação bloqueiam; `costo_promedio` isoladamente preservado com quantidade zero não significa saldo. `stock_lotes` sem quantidade não bloqueia só por existir; movimentos com estado `REGISTRADO`/`ANULADO` são fatos concluídos, não pedidos pendentes. Reposição é planejamento somente leitura; Recepciones hoje usa mocks `localStorage` e não é fonte SQL de pendências.

**STK-X04 / BLOQUEANTE antes de permitir a mudança de base:** API Productos bloqueia apenas produto no PUT; `NEX-014:224-249,282-359` grava movimentos sem bloqueio compartilhado por `productos.id`. A mudança futura exige serialização transacional comum entre a guarda de saldo zero e novos movimentos. Snapshot histórico de unidade-base/versões não existe nos movimentos atuais; não reescrever fatos passados.

**Estado:** dependência identificada, sem código/SQL/VM aplicados; homologação pendente.
