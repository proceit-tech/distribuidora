# Auditoria por menu — Facturas

**Rota principal:** `/facturas`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado:** ABERTA — NÃO AUDITADA INTEGRALMENTE — NÃO HOMOLOGADA  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Facturas**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

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

- **Confirmado:** paginação de clientes/produtos retorna total zero em página vazia; proteção dirty é parcial; faturação exige vínculo unidade SIFEN.

## Pendências

Auditoria exaustiva deste menu ainda não executada. Não atribuir percentual de cobertura sem inventário de arquivos e linhas revisadas.

## Regra de migrations

O responsável mostrou NEX-001…051 já aplicadas na VM. Proibido editar scripts aplicados, checksums ou reexecutar SQL histórico como se fosse nova migration. Qualquer nova alteração estrutural exige justificativa, aprovação e migration incremental a partir de NEX-052.

## Complemento de auditoria cruzada Productos → Facturas (12/10/2026)

**FAT-X01 / ALTA / confirmado pelo SQL:** `lib/facturacion/emision.ts:82-92` não filtra `p.vendible`. `SELECT_PRODUCTOS` serve tanto ao seletor quanto a `prepararFactura` (`:201`), portanto a trava de negócio não existe no backend. Um produto de tipo MERCADERIA/SERVICIO e ativo pode ser faturado ainda que `productos.vendible=false`. A correção deve ser no contrato comum de busca e preparação no servidor, com regressão; não resolver apenas no browser.
 
**FAT-X02 / já confirmado:** ausência de equivalência fiscal em `unidades_medida.unidad_sifen_codigo` impede emissão, mas Productos permite gravar sem vínculo. Consultar `AUD-PRODUCTOS-V1.md`, casos PRD-A01/02/03.
