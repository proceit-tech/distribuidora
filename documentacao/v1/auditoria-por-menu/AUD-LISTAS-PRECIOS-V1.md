# Auditoria por menu — Listas de precios

**Rota principal:** `/listas-precio`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado:** ABERTA — NÃO AUDITADA INTEGRALMENTE — NÃO HOMOLOGADA  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Listas de precios**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

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

## Dependência de Productos: unidade-base e preço referencial (12/10/2026)

**LPR-X01 / ALTA / mismatch:** `NEX-008` guarda `lista_precio_items.unidad_medida_id`; `NEX-017:90-111` só sincroniza a unidade quando `producto_fijar_precio_referencia` é executada; `app/api/productos/[id]/route.ts:253-296` pode editar `productos.unidad_medida_id` sem chamar essa função caso `precioEnviado` seja falso. Resultado: o preço de referência permanece vinculado à unidade anterior do produto. Mesmo que haja ajuste de unidade-base depois, o preço e histórico devem ter unidade explicitada e jamais recalculada arbitrariamente.

**Fonte:** `AUD-PRODUCTOS-V1.md`, seção XIV. Auditória deste menu permanece aberta; não implementar política comercial sem decisão.

## Matrizes de preços × apresentações × troca de unidade-base — complemento 12/10/2026

**LPR-X02 / ALTA:** `NEX-008:63-88` contém uma única linha por produto/lista, embora guarde `unidad_medida_id`; `NEX-017:90-121` grava preço referência por unidade-base e `v_producto_precio_referencia` oculta a unidade. Sem contrato de preço por `producto_unidades.id`, não é possível afirmar que a venda por caixa/pacote terá preço correto ou desconto calculado. Alterar a unidade-base com estoque zero não autoriza transportar o mesmo preço nominal para outra unidade.

**Decisão aberta DEC-PRD-U10** no documento canônico Productos: exigir revisão prévia de listas de preço, ou permitir troca com preço temporariamente não vendável. Não converter/recalcular margem/preço por presunção. Auditoria de Listas de precios ainda ABERTA.

## DEC-PRD-U09 — vínculo dos preços às versões da apresentação (12/10/2026)

**Regra aprovada:** um fator comercial utilizado não será sobrescrito; Caja v1=12 UNI e Caja v2=10 UNI são versões diferentes da MESMA apresentação, com vigências não sobrepostas. Preços e históricos das operações precisam manter a unidade/fator associados à transação para não reinterpretar vendas antigas.

**Lacuna LPR-X03:** `NEX-008` mantém unicidade `(empresa_id, lista_precio_id, producto_id)` e unidade por item, sem preço/versão por apresentação; `NEX-017` grava preço de referência com a unidade-base. Não há contrato comprovado de preço por versão de apresentação. Vincular eventual preço futuro à apresentação/versão com vigência e condições comerciais próprias; não presumir que a mudança do fator altere automaticamente o preço de caixa ou a margem.

**Pendente:** DEC-PRD-U10 sobre regra de preço ao trocar a unidade-base; auditoria Listas de precios continua ABERTA, sem código/SQL executado.
