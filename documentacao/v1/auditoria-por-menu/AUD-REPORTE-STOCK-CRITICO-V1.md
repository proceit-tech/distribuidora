# Auditoria por menu — Reporte Stock crítico

**Rota principal:** `/reportes/stock-critico`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado atual (18/10/2026): AUDITORIA INDIVIDUAL R01 DOCUMENTADA — 1 ALTA, 3 MÉDIAS, 1 BAIXA ABERTAS — NÃO HOMOLOGADA** (os registros históricos abaixo são preservados).  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Reporte Stock crítico**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

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

Os achados vigentes SC-D01…SC-D05 constam na seção «Auditoría independiente por función» e no relatório técnico detalhado. A frase histórica não retrata mais o estado atual.

## Pendências

Auditoria estática individual por função documentada; operação em PostgreSQL real, navegador e exportações efetivas pendentes de homologação humana.

## Regra de migrations

O responsável mostrou NEX-001…051 já aplicadas na VM. Proibido editar scripts aplicados, checksums ou reexecutar SQL histórico como se fosse nova migration. Qualquer nova alteração estrutural exige justificativa, aprovação e migration incremental a partir de NEX-052.

## Auditoria transversal de Reportes — 13/10/2026

**Auditoria estática integrada:** [AUD-REPORTES-INTEGRADA-V1-2026-10-13.md](./AUD-REPORTES-INTEGRADA-V1-2026-10-13.md), referência única para achados e critérios cruzados dos cinco relatórios + índice. **SHA-base:** `aee2af3926603fb9c9db4bba1ed72bc874b5c2a2`. **RPT-C01/C02:** o relatório usa política global de produto, diferente da Reposición por depósito, e duplica planejamento. Manter relatório exportável de exceções; alinhar cálculos depois da estabilização de Inventario.

**Status:** achados e propostas registrados, **sem código, SQL, PostgreSQL, browser, VM, Docker ou deploy nesta rodada**. Não representa autorização automática para Claude alterar Reportes enquanto a tarefa conjunta de Inventario estiver ativa; **NÃO HOMOLOGADO**.

## Revisão desktop Reportes R01 (18/10/2026)

**Informe transversal completo:** [AUD-NEXIT-REPORTES-DESKTOP-R01](../../testes/AUD-NEXIT-REPORTES-DESKTOP-R01-2026-10-18.md).
**Escopo deste menu: Stock crítico y reposición.** **RPT-D01 ALTA TRANSVERSAL:** `q` normalizada en servidor != `qAplicada` cruda, resultado válido oculto; **RPT-D02 MEDIA TRANSVERSAL:** datos y exportación anteriores vigentes durante debounce del nuevo texto. Motor único calcularPlanReposicion y snapshot de reporte preservados.
**Método/limite:** inspeção de arquivos atuais da branch, não execução. Relatos de aceites estáticos históricos RPT-R19/R20 preservados, mas esta revisão encontrou novas lacunas de filtro de UI que impedem marcar o conjunto como livre de achados. **0 testes/HTTP/PG/VM/Docker/browser, sem mudanças funcionais nem migrations, NÃO HOMOLOGADO.** Nenhuma tarefa Claude autorizada.

## Auditoría independiente por función — Stock crítico y reposición DESKTOP R01 (18/10/2026)

**Informe técnico completo del menú:** [AUD-NEXIT-STOCK-CRITICO-DESKTOP-R01](../../testes/AUD-NEXIT-STOCK-CRITICO-DESKTOP-R01-2026-10-18.md). **Función exclusiva:** reporte documental/descargable de alertas de abastecimiento y sobrestock, reutilizando `calcularPlanReposicion` y la fuente `leerEntradasReposicion`; calcula el plan compartido antes de filtros, sin generar compra, transferencia ni movimiento. Sobrestock usa físico propio del mismo ámbito; el costo de referencia es estimativo, no Valorización patrimonial. Vistas PRODUCTO/DEPOSITO.

**Inventario revisado:** pantalla 314 líneas; APIs GET consulta y exportación; fuente `stock-critico.ts` 134 líneas; regla pura `stock-critico-plan.ts` 200 líneas; exportador 94 líneas; cliente, tipos, guardas, snapshot, acceso y motor/fuentes operativos; pruebas preexistentes `stock-critico.casos.ts` 508 líneas y antecedentes R06/R07/R08. Código actual leído y contratos contrastados, sin ejecución.

**Hallazgos específicos:**
- **SC-D01 ALTA — HEREDADO RPT-D01:** `q` recibe trim/limite de la API, pero el cliente compara con valor original; HTTP 200 válido puede quedar oculto. No duplicar en global.
- **SC-D02 MEDIA — HEREDADO RPT-D02:** durante debounce (300 ms) siguen visibles/exportables datos de consulta anterior mientras la búsqueda está cambiando. No duplicar en global.
- **SC-D03 MEDIA NUEVA:** en PRODUCTO, al sumar destino con meta definida + destino necesitado sin meta, la UI presenta «8 + 1 sin meta», pero `export-stock-critico.ts:34–35` exporta solo 8 si `sinMeta>0` y suma>0; la nota general no identifica qué fila es incompleta. Pérdida de alcance de estimación en Excel/PDF.
- **SC-D04 MEDIA NUEVA:** `totalesCritico` suma `valorReferencia:null` con `sumarDecimales`, que devuelve "0" para todos null/lista vacía; KPI/total Excel/PDF muestran valor 0 sin estimación posible por falta de costo/meta, pese a las notas. Distinguir importe parcial/no estimable de cero real.
- **SC-D05 BAJA NUEVA:** columna UI `Disponible` de PRODUCTO suma solo los destinos del plan recortado, no disponible global; exportador ya dice `Disponible (destinos)`. Unificar rótulo.

**Cuenta del reporte:** 1 ALTA heredada + 3 MEDIAS (1 heredada y 2 nuevas) + 1 BAJA nueva; únicamente **SC-D03/D04/D05 incrementan el total global**. Acumulado de Reportes tras cuatro reportes individuales: **2 ALTAS + 7 MEDIAS + 3 BAJAS**, sin multiplicar RPT-D01/D02. Nueve observaciones condicionadas y quince pruebas focales futuras SC-R01-T01…T15 documentadas en informe.

**Preservar código histórico:** aceptación estática R06/R07/R08 del motor único, origen compartido una vez, parámetros por depósito, categoría/marca/familia, sobrestock informativo, snapshot `REPEATABLE READ`, permisos `REPORTES.VER/EXPORTAR`, 413 y XLSX/PDF. No se comprobó ruptura nueva del cálculo de distribución física. **0 tests ejecutados por ChatGPT, sin PostgreSQL/VM/browser/build/export externo ni homologación; ninguna migration/corrección ni tarea para Claude.** Próximo reporte individual: Lotes y vencimientos.
