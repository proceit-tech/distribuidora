# Auditoria por menu — Reposición

**Rota principal:** `/reposicion`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado:** ABERTA — NÃO AUDITADA INTEGRALMENTE — NÃO HOMOLOGADA  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Reposición**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

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

**Reposición** mantém planejamento sem gravação, diferenças conceituais em relação a Stock e transferência pré-preenchida via Movimientos. Propostas UX e limitações em INV-01/02/06/08.

**Estado:** propostas de simplificação pendentes de decisão do responsável; achados técnicos numerados e critérios de aceite no contrato compartilhado. Não interpretar este registro como autorização automática para o Claude alterar o menu.


## Auditoría actual — Reposición DESKTOP R01 (18/10/2026)

**Informe técnico detallado:** [AUD-NEXIT-REPOSICION-DESKTOP-R01](../../testes/AUD-NEXIT-REPOSICION-DESKTOP-R01-2026-10-18.md). Corte de código: pantalla blob `489fc532e4612c72f5d6dac69c61fda946ffe824`, datos `1f1bcccc2236f0a94cd63d1849afc17933ad095f`, cálculo `2f08843b569eeb3a2113d715c00354829a858e0a`, API `7cc999769c6859cdc9a5e2c03b9206f16f0afd2c`.

**4 MEDIAS documentadas:** `REP-D01` etiquetas de transferencia/compra del plan base divergen de cantidad simulada usada en CTA/detalle; `REP-D02` simulación individual no redistribuye cupo de origen común entre otros destinos (limitación semántica que exige decisión; no volver a abrir el algoritmo AUD-REP-04); `REP-D03` recarga del GET conserva los resultados/atajos anteriores mientras llega la respuesta; `REP-D04` cinco SELECT de cálculo sin snapshot compartido (riesgo de lectura concurrente, no reproducido).

**7 observaciones no confirmadas:** REP-O01 lote agregado sin lote en precarga; O02 cruce entre alcance de sucursales y depósitos; O03 consolidado bajo alcance parcial (contrato intencional); O04 decimal/float8; O05 simulación preservada tras nueva carga; O06 escala no medida; O07 parámetros inconsistentes.

**Preservado / NO reabrir sin regresión:** INV-R02-03 cargas malformadas; INV-01 diferenciar Stock y reposición; INV-02 acceso VER+CREAR a Movimientos; INV-06/08 simulación local y tránsito opcional; AUD-REP-03 cantidad sin gatillo; AUD-REP-04 origen compartido una sola vez en plan base; tenant/stock PROPIO/depósitos activos autorizados; Reposición solo GET. Tests locales históricos leídos, **0 ejecutados por ChatGPT**, 0 PostgreSQL/VM/Browser. Sin cambios funcionales ni migrations. **AUDITORÍA ESTÁTICA DOCUMENTADA — NO HOMOLOGADA**. Próximo menú: Facturación → Documentos electrónicos, previa solicitud.
