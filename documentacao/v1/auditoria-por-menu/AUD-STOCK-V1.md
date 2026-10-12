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
