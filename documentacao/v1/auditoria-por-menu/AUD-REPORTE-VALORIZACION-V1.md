# Auditoria por menu — Reporte Valorización

**Rota principal:** `/reportes/valorizacion`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado atual (18/10/2026): AUDITORIA ESTÁTICA R01 REGISTRADA — ACHADOS TRANSVERSAIS ABERTOS — NÃO HOMOLOGADA** (os registros históricos abaixo são preservados).  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Reporte Valorización**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

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

## Auditoria transversal de Reportes — 13/10/2026

**Auditoria estática integrada:** [AUD-REPORTES-INTEGRADA-V1-2026-10-13.md](./AUD-REPORTES-INTEGRADA-V1-2026-10-13.md), referência única para achados e critérios cruzados dos cinco relatórios + índice. **SHA-base:** `aee2af3926603fb9c9db4bba1ed72bc874b5c2a2`. **Prioridade máxima.** RPT-V01 (custo médio heterogêneo), RPT-V02 (snapshot), RPT-V03 (cobertura de custo), RPT-V04 (erro com dados obsoletos) e RPT-V05 (precisão quantitativa). Valor em moeda base e custo real de inventario_costos preservados.

**Status:** achados e propostas registrados, **sem código, SQL, PostgreSQL, browser, VM, Docker ou deploy nesta rodada**. Não representa autorização automática para Claude alterar Reportes enquanto a tarefa conjunta de Inventario estiver ativa; **NÃO HOMOLOGADO**.

## Revisão desktop Reportes R01 (18/10/2026)

**Informe transversal completo:** [AUD-NEXIT-REPORTES-DESKTOP-R01](../../testes/AUD-NEXIT-REPORTES-DESKTOP-R01-2026-10-18.md).
**Escopo deste menu: Valorización de inventario.** **RPT-D01 ALTA TRANSVERSAL:** `q` normalizada en API diverge de `aplicados.q` en respuestaVigente; **RPT-D02 MEDIA TRANSVERSAL:** durante debounce puede verse/exportarse foto monetaria del filtro anterior. Snapshot y cálculo de costos ya aceptados se preservan.
**Método/limite:** inspeção de arquivos atuais da branch, não execução. Relatos de aceites estáticos históricos RPT-R19/R20 preservados, mas esta revisão encontrou novas lacunas de filtro de UI que impedem marcar o conjunto como livre de achados. **0 testes/HTTP/PG/VM/Docker/browser, sem mudanças funcionais nem migrations, NÃO HOMOLOGADO.** Nenhuma tarefa Claude autorizada.
