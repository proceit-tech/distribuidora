# Auditoria por menu — Reporte Stock general

**Rota principal:** `/reportes/stock-general`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado atual (18/10/2026): AUDITORIA INDIVIDUAL R01 DOCUMENTADA — 2 ALTAS + 1 MÉDIA ABERTAS — NÃO HOMOLOGADA** (os registros históricos abaixo são preservados).  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Reporte Stock general**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

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

Os achados da revisão específica de 18/10 constam na seção «Auditoría independiente por función» abaixo; a frase anterior era o estado inicial e foi substituída.

## Pendências

Auditoria estática por função documentada no informe R01 abaixo. Não há prova de execução real no navegador/VM/PostgreSQL nem homologação; não atribuir cobertura operacional.

## Regra de migrations

O responsável mostrou NEX-001…051 já aplicadas na VM. Proibido editar scripts aplicados, checksums ou reexecutar SQL histórico como se fosse nova migration. Qualquer nova alteração estrutural exige justificativa, aprovação e migration incremental a partir de NEX-052.

## Auditoria transversal de Reportes — 13/10/2026

**Auditoria estática integrada:** [AUD-REPORTES-INTEGRADA-V1-2026-10-13.md](./AUD-REPORTES-INTEGRADA-V1-2026-10-13.md), referência única para achados e critérios cruzados dos cinco relatórios + índice. **SHA-base:** `aee2af3926603fb9c9db4bba1ed72bc874b5c2a2`. Reporte **quantitativo exportável**, sem valorização paralela; Stock operacional continua em Inventario. Verificar consistência de escopo e salvaguarda de dados antigos em falhas.

**Status:** achados e propostas registrados, **sem código, SQL, PostgreSQL, browser, VM, Docker ou deploy nesta rodada**. Não representa autorização automática para Claude alterar Reportes enquanto a tarefa conjunta de Inventario estiver ativa; **NÃO HOMOLOGADO**.

## Revisão desktop Reportes R01 (18/10/2026)

**Informe transversal completo:** [AUD-NEXIT-REPORTES-DESKTOP-R01](../../testes/AUD-NEXIT-REPORTES-DESKTOP-R01-2026-10-18.md).
**Escopo deste menu: Stock general.** **RPT-D01 ALTA TRANSVERSAL:** filtro `q/lote` normalizado en API pero no en la igualdad de respuesta visible, con pantalla en blanco para `ABC `; **RPT-D02 MEDIA TRANSVERSAL:** durante debounce el GET/exportación anterior todavía parece actual. Motor de stock/cálculo del lote preservado.
**Método/limite:** inspeção de arquivos atuais da branch, não execução. Relatos de aceites estáticos históricos RPT-R19/R20 preservados, mas esta revisão encontrou novas lacunas de filtro de UI que impedem marcar o conjunto como livre de achados. **0 testes/HTTP/PG/VM/Docker/browser, sem mudanças funcionais nem migrations, NÃO HOMOLOGADO.** Nenhuma tarefa Claude autorizada.


## Auditoría independiente por función — Stock general DESKTOP R01 (18/10/2026)

**Informe técnico exclusivo del menú:** [AUD-NEXIT-STOCK-GENERAL-DESKTOP-R01](../../testes/AUD-NEXIT-STOCK-GENERAL-DESKTOP-R01-2026-10-18.md). Este informe revisa la **función de Stock general** por sí sola: situación cuantitativa actual y documental de las existencias PROPIAS y TERCEROS por producto, depósito, lote, estado/unidad y alcance. No se autoriza escribir stock, valorizar inventario, calcular reposición ni duplicar funciones de otros menús.

**Cobertura inspeccionada:** layout/nav, pantalla 336 líneas con 2 vistas y filtros/estados/paginación, API GET, API exportar GET, lib/reportes/stock-general.ts, plan.ts, cliente HTTP, exportador, contrato de tipos, guard, snapshot, depósitos, migration NEX-003 y casos `stock-general.casos.ts`. Las funciones de stock/precio y migraciones reales no se ejecutaron. La clasificación de Stock por mínimo/máximo, filtro de lote que no altera situación base, decimal textual, separación de terceros, alcance de depósitos inactivos e instantánea de lectura **permanecen implementados**.

**Hallazgos actuales del menú:**
- **SG-D01 — ALTA, heredado de RPT-D01 transversal:** `trim`/límite de texto del servidor difiere de comparación exacta de `q/lote` en cliente. Búsqueda `"ABC "` produce 200 válido, pero queda oculta.
- **SG-D02 — MEDIA, heredado de RPT-D02 transversal:** mientras transcurren 300 ms de `debounce`, el usuario ya digitó otro filtro y la consulta/exportación anterior puede parecer vigente.
- **SG-D03 — ALTA NUEVA CONFIRMADA POR CÓDIGO:** el resumen de unidades usa `Map` por `unidad` (nombre), no por `unidades_medida.id` (UUID); NEX-003 impone UNIQUE(codigo), **no UNIQUE(nombre)**. Dos unidades físicas con mismo nombre y códigos/IDs diferentes se suman en KPIs y en notas Excel/PDF. No se ha demostrado que existan homónimos reales en la VM.

**Conteo correcto:** este menú tiene **2 ALTAS + 1 MEDIA** abiertas; el módulo general de Reportes aumenta **solo en 1 ALTA NUEVA (SG-D03)**, sin contabilizar repetidamente SG-D01/SG-D02. **7 observaciones** sobre política de catálogo/alcance, validación de página, escala, foto exportada y verificación operativa están detalladas en el informe.

**Pruebas/aceptación propuestas:** SG-R01-T01…T12; énfasis UUID homónimo, q/lote y debounce, unidad/cantidades/terceros, lote vs situación, tenant, 401/403/413, Excel/PDF y escritorio 1440/1920. **0 pruebas ejecutadas por ChatGPT. Sin POST/SQL/VM/PostgreSQL/navegador/CI, SIN HOMOLOGACIÓN.** Histórico RPT-R11 de correcciones y sus pruebas publicadas conservado, no reabrir RPT-R10-01. No enviar correcciones a Claude antes del cierre de auditoría general; próximo reporte separado: Valorización de inventario.
