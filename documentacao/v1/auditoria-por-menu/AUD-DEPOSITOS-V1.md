# Auditoria por menu — Depósitos

**Rota principal:** `/depositos`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado:** ABERTA — NÃO AUDITADA INTEGRALMENTE — NÃO HOMOLOGADA  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Depósitos**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

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

## Auditoria transversal do Inventario (13/10/2026)

**Revisão estática conjunta de Stock, Movimientos, Depósitos e Reposición.** Fonte canônica transversal: [AUD-INVENTARIO-INTEGRADA-V1-2026-10-13.md](./AUD-INVENTARIO-INTEGRADA-V1-2026-10-13.md). SHA-base: `02d730e6e13ed2b0183563835e27757c18b50259`. **Não homologado; nenhuma implementação, PostgreSQL, VM, Docker ou navegador executados nesta revisão.**

**Depósitos** mantém cadastro/estado, sucursal, acesso e auditoria; metas de estoque pertencem a Productos. Corrigir somente após autorização as permissões de carga obsoleta (INV-05).

**Estado:** propostas de simplificação pendentes de decisão do responsável; achados técnicos numerados e critérios de aceite no contrato compartilhado. Não interpretar este registro como autorização automática para o Claude alterar o menu.


## Auditoría actual — Depósitos DESKTOP R01 (18/10/2026)

**Fuente de hallazgos detallados:** [AUD-NEXIT-DEPOSITOS-DESKTOP-R01](../../testes/AUD-NEXIT-DEPOSITOS-DESKTOP-R01-2026-10-18.md). Corte de pantalla blob `1d87293dd8223dffd13484c69d643c43354f83e1`, migration NEX-046 blob `4855ce4b7b74657fa3cb573de3753ffc03ff39ec`.
**2 ALTAS:** DEP-D01 guardado concurrente no bloquea formulario/otra entidad y su respuesta cierra borrador nuevo; DEP-D02 inconsistencia de permisos CREAR/EDITAR sin VER en layout/navigation, política a decidir.
**5 MEDIAS:** DEP-D03 Asignarme excluido de dirty guard; DEP-D04 formulario/panel ya abiertos siguen intentando mutaciones después de recarga 200 con permisos revocados (API/SQL deniegan); DEP-D05 cambios concurrentes de usuarios dejan panel posiblemente obsoleto; DEP-D06 edición sin control de versión (lost update); DEP-D07 historial de accesos limitado a 200 sin rótulo de ventana parcial.
**1 BAJA:** DEP-D08 colSpan 6 con solo 5 columnas para VER-only.
**Observaciones no confirmadas:** DEP-O01 carrera de revocación vs check SQL anterior a FOR UPDATE; DEP-O02 política cruce alcance sucursal/depósito; DEP-O03 snapshot de 3 SELECT; DEP-O04 escala sin medición; DEP-O05 aplicación real NEX-046 desconocida; DEP-O06 preautorización de usuario BLOQUEADO; DEP-O07 sucursal histórica fuera del catálogo de alcance.
**Preservado:** código inmutable, sucursal tras movimientos, saldo cero para inactivación, actor/empresa de sesión, funciones SQL/roles/grants, historial de accesos persistido, cargas confiables INV-05/INV-R02/R03/R04 y separación Stock/Movimientos/Reposición. **0 pruebas nuevas por ChatGPT; sin PostgreSQL, VM, navegador o capturas. NO HOMOLOGADO.** No implementación Claude hasta fase posterior. Próximo menú: Inventario → Reposición.
