# Auditoria por menu — Documentos electrónicos

**Rota principal:** `/documentos`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado atual 18/10/2026: AUDITORIA ESTÁTICA INDIVIDUAL R01 DOCUMENTADA — 1 ALTA, 6 MÉDIAS, 1 BAIXA ABERTAS — NÃO HOMOLOGADA**  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Documentos electrónicos**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

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

A lista de achados ativos DOC-D01…DOC-D08 e a matriz de requisitos de concorrência estão na seção AUD-DOC-DESKTOP-R01 e no informe técnico específico ao final; este parágrafo era o estado inicial.

## Pendências

Auditoria estática específica de código/menu e matriz de competência documentadas em AUD-DOC-DESKTOP-R01. PostgreSQL/gateway/VM/browser e arquivos fiscais reais seguem sem verificação; não declarar homologação.

## Regra de migrations

O responsável mostrou NEX-001…051 já aplicadas na VM. Proibido editar scripts aplicados, checksums ou reexecutar SQL histórico como se fosse nova migration. Qualquer nova alteração estrutural exige justificativa, aprovação e migration incremental a partir de NEX-052.


## AUD-DOC-DESKTOP-R01 — confronto com concorrência e função operacional (18/10/2026)

**Relatório técnico e matriz funcional completa:** [AUD-NEXIT-DOCUMENTOS-ELECTRONICOS-DESKTOP-R01-2026-10-18.md](../../testes/AUD-NEXIT-DOCUMENTOS-ELECTRONICOS-DESKTOP-R01-2026-10-18.md). Duas capturas fornecidas pelo responsável como **referência funcional da concorrência**, não prova de capacidades/API/arquivos do fornecedor. ERP **somente desktop**, não auditar mobile.

**Função aprovada para diagnóstico:** central de consulta e operação de documentos emitidos, com estado do gateway, status SIFEN e e-mail INDEPENDENTES, CDC, lote, histórico, anexos fiscalmente válidos, permissões por empresa/sucursal. Emissão FE/NCE permanece nos formulários próprios, não criar planejador fiscal duplicado.

**Arquivos efetivamente lidos nesta rodada:** navegação/layout, `app/(private)/documentos/page.tsx` 514 linhas e CSS, APIs GET lista, GET [id] e POST [id]/enviar/consultar, `lib/facturacion/{shared,estados,refresco-documentos,servidor,envio,gateway,reconciliacion}.ts`, componente CampoFecha, suites de Facturación/FAT-E2 versionadas e progresso pertinente. Não foram executados tests, SQL nem navegador.

**Achados NOVOS exclusivos do menu:**
- **DOC-D01 ALTA:** `page.tsx:168–178` detecta `resultado.clave !== claveConsulta` para loading, porém renderiza `resultado.datos` antigo para tabela, KPIs, botões e permissões enquanto troca sucursal/tipo/datas/ordem/página ou digita texto. Não alegar bypass: o servidor revalida autorização.
- **DOC-D02 MEDIA:** `shared.ts:55–62` define `PEND_ENVIO` incluindo `ERROR_ENVIO/ENVIO_INDETERMINADO`, `PEND_RESPUESTA` exclui `NO_RECONOCIDO`; painel mistura/omite exceções em KPIs de pendências.
- **DOC-D03 MEDIA:** KPI `resumen` é GLOBAL ao alcance, não segue filtros, e não é identificado claramente na UI (`shared.ts:170–198`). Decisão original explícita, divergência de UX/contrato, não erro aritmético.
- **DOC-D04 MEDIA:** `page.tsx:85` usa `Number(d.total)` apesar do `::text` no SQL, risco real de perda de precisão monetária para valores grandes.
- **DOC-D05 MEDIA (risco sem reprodução):** `shared.ts:174–187` consulta conteo/resumen/sucursales em `Promise.all` e depois linhas sem mesma foto `REPEATABLE READ`. Divergências em concorrência possíveis, não observadas em PG.
- **DOC-D06 MEDIA:** datas API apenas regex e filtros inválidos silenciosamente removidos / datas impossível ou intervalo inverso sem 400 correto (`shared.ts:96–113,132–133`), apesar do CampoFecha mitigar input comum.
- **DOC-D07 MEDIA:** `SIN_EMAIL` KPI soma `NO_INFORMADO` e `SIN_EMAIL`, conceitos distintos (`shared.ts:62`).
- **DOC-D08 BAIXA:** detalhe/histórico cacheado em `abiertos` por id não revalida automaticamente ao mudar consulta/refrescar, podendo mostrar tentativas antigas.

**Saldo do diagnóstico estático:** **1 ALTA, 6 MÉDIAS, 1 BAIXA** no código; 28 itens C01–C28 comparados à referência e 15 recursos extras E01–E15 propostos, registrados como requisitos/GAPs e não como bugs; 7 blocos de dependência produto/provider; 20 testes futuros dirigidos (DOC-T01…20).

**Lacunas funcionais prioritárias (não são defeitos de SQL comprovados):** filtros por lote e data assinatura; multi-seleção de tipos/estados e ocultações; e-mail pendente/blacklist quando fonte real existir; seleção, exportação XLSX/CSV e agrupamento desktop; históricos de reprocesso/eventos; linha do tempo, CDC e diagnóstico; **KuDE/PDF/XML indisponíveis por contrato não confirmado**, sem inventar endpoint; ações fiscais cancelación/inutilización somente com contrato e elegibilidade legal. `gateway.ts:25–28` permite consulta FE/NCE, não NDE/NRE/AFE apesar de constarem no catálogo.

**Segurança e regras que NÃO podem regredir:** empresa+alcance sucursal via sessão em cada GET/POST, `VER` para lista/detalhe, `CREAR` para envio, `EDITAR` para reconsulta; gateway recebido não é SIFEN aprovado; estado fiscal final precisa CDC coerente; timeout/indeterminado não pode autorizar reenvio cego; NCE rejeitada definitiva reemitida com novo número, preservando FE/CDC/saldo; tokens e respostas devem ser saneados.

**Ordem proposta apenas para decisão:** A corrigir DOC-D01…08 e testar somente escopo direcionado, B filtros/KPIs/UX desktop, C KuDE/XML dependente de contrato, D eventos/e-mail dependentes de contrato/normativa, E exportações/seleção/masivas, F NDE/NRE/AFE por compatibilidade de gateway. **Nenhum desenvolvimento ou migration autorizado a Claude, nenhuma homologação; 0 testes executados, não acessar VM/PostgreSQL/gateway real.**

## Nova evidência KuDE/PDF P0 — 20/10/2026

**Prioridade de apresentação:** o responsável forneceu captura do REQUEST Postman `POST https://gateway-bebidas-py.e-factura-hub.com/api/kude` com `{"tipOpe":"4","dEst":"001","dPunExp":"001","dNumDoc":"0010004","dSerieNum":null,"tipoDoc":"FE"}`. Isso substitui apenas o diagnóstico de que **o endpoint do KuDE era desconhecido** em GAP-01; **não** confirma retorno de PDF, schema response, autorização Bearer compatível ou significado geral de `tipOpe`. Resposta HTTP/Content-Type e mapping são pendências obrigatórias, sem presumir PDF/Base64/URL.
- **Requisito:** [REQ-DOC-KUDE-PDF-GATEWAY-2026-10-20](../../definicoes/REQ-DOC-KUDE-PDF-GATEWAY-2026-10-20.md).
- **Linear:** [PRO-194](https://linear.app/proceit/issue/PRO-194), filha de PRO-91, P0 urgente.
- **Escopo autorizado para Claude:** integrar backend por ID documento e isolamento empresa/sucursal/VER; fonte fiscal imutável; reutilizar gateway autenticação; botão KuDE FE elegível, parse/bytes somente conforme resposta real; testes dirigidos e parada para AUD-DOC-KUDE-R01 independente. **Não** habilitar NCE, XML, emails, exportações ou eventos. Não aplicar SQL/VM/deploy nem declarar homologação por request isolado. R01 DOC-D01..D08 não são implicitamente resolvidos por esta especificação.

## P0 KuDE JSON/Base64 e visualizador modal + P1 UX Desktop — evidência 20/10/2026

- **Evidência de resposta real do gateway entregue pelo responsável:** `POST /api/kude` → HTTP **200 OK**, Body JSON `{"status":"success","CDC":"...","kude":"JVBER..."}`; o valor `kude` é Base64 de PDF. Não registrar o CDC nem a cadeia Base64 real (dados fiscais de terceiro). Ainda não há prova do header HTTP Content-Type, mapeamento semântico de `tipOpe` e aceitação do mesmo Bearer no endpoint.
- **[PRO-194](https://linear.app/proceit/issue/PRO-194), P0 em desenvolvimento:** código corrente `gateway.ts` espera exclusivamente PDF binário, portanto rejeita essa resposta JSON. Requisito [REQ-DOC-KUDE-PDF-GATEWAY](../../definicoes/REQ-DOC-KUDE-PDF-GATEWAY-2026-10-20.md) revisto: validar status+CDC, decodificar Base64 no servidor, modal incorporada, consulta NOVA a cada abertura, nenhuma cota de aberturas nem cache/persistência no banco/disco, download/imprimir, cancelamento e limpeza de Blob. Claude deve corrigir e parar para auditoria independente. Não declarar PDF operacional ainda.
- **[PRO-195](https://linear.app/proceit/issue/PRO-195), P1 planejamento de UX:** o responsável forneceu duas capturas da concorrência com filtros extensos, KPIs, seleção, ações e export. Objetivo é painel desktop NEXIT mais claro, seguro e eficiente, **não clonagem literal da concorrência**. Requisito [REQ-DOC-UX-DESKTOP](../../definicoes/REQ-DOC-UX-DESKTOP-2026-10-20.md) cobre filtros progressivos, status fiscal/gateway/email sem confundir, KPI global x filtrado, valores exatos, tabela com ações legíveis e detalhe lateral. Sem falso suporte a export, e-mails/eventos/ações em lote/XML até contrato e backend próprios. Sequência: PRO-194 → AUD do PDF → PRO-195 → AUD UX → execução/homologação humana.
- **PRO-91 permanece In Review, não homologado**. Não alterar migrations nem executar VM/Docker/SQL/CI ou deploy por IA. A auditoria R01 DOC-D01..D08 continua como evidência; P1 poderá corrigir aspectos UI sem mascarar riscos de banco.
