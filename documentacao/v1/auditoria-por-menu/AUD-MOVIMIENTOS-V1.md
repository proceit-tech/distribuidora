# Auditoria por menu — Movimientos

**Rota principal:** `/movimientos`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado:** ABERTA — NÃO AUDITADA INTEGRALMENTE — NÃO HOMOLOGADA  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Movimientos**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

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

**Movimientos** permanece proprietário único das gravações, histórico e anulação; agrupamento visual dos tipos é proposta. Regras de autorização nos atalhos e integração documental futura em INV-02/07.

**Estado:** propostas de simplificação pendentes de decisão do responsável; achados técnicos numerados e critérios de aceite no contrato compartilhado. Não interpretar este registro como autorização automática para o Claude alterar o menu.


## Auditoria atual — Movimientos DESKTOP (18/10/2026)

**Corte oficial de código:** `eaa10106dfb273ddd57079ddab5c978dc6d28009`. **Relatório de auditoria por menu:** [AUD-NEXIT-MOVIMIENTOS-DESKTOP-R01](../../testes/AUD-NEXIT-MOVIMIENTOS-DESKTOP-R01-2026-10-18.md). ERP **somente desktop**, sem escopo mobile. Relatório de **inspeção estática**: não houve execução de testes, APIs reais, CI, navegador, SQL, PostgreSQL ou VM. **NÃO HOMOLOGADO**. Histórico INV-R02…R05 permanece com correções presentes no código, não reabrir sem regressão.

| ID | Prioridade | Evidência do código neste corte | Situação |
|---|---|---|---|
| **MOV-D01** | **ALTA** | `nuevo/page.tsx:94–111,119–150,225–468`: `saving` bloqueia só botão Registrar, não bloqueia campos e Cancelar; editar limpa `clave.current` enquanto POST K1 está em voo. COMMIT com resposta perdida seguido de nova tentativa K2 permite segundo movimento real apesar do índice UNIQUE por chave (`NEX-014:333–345`). Testar sequência com promessa controlada, manter chave e payload após resposta indeterminada. | **ABERTO** |
| **MOV-D02** | **MÉDIA** | `movimientos/page.tsx:80–115,135–143,280–355`: indicador `cargando` usa diferença entre `resultado.clave` e `claveConsulta`, mas `datos` continua resultado anterior; filtros/página novos mostram linhas e links de consulta antiga enquanto carregam. | **ABERTO** |
| **MOV-D03** | **MÉDIA** | `nuevo/page.tsx:35–76`: `hoyAsuncion()` muda ao virar a data local e está na dependência do efeito que recarrega catálogos e sobrescreve `setForm`, `setBase` e quantidade mesmo com rascunho sujo. | **ABERTO** |

**Preservar decisões e regras do sistema:** registro só por `inventario_registrar_movimiento` em transação; 9 tipos técnicos e 4 grupos visuais, motivo e custo contextual, estoque PROPIO/TERCERO e lotes; anulação só com `MOVIMIENTOS.ANULAR` e movimento inverso único, SQL NEX-014 e, se aplicada, NEX-052; autorização de depósitos para registrar, história invisível fora de escopo e transferência visível só se ambos depósitos no alcance; `MOVIMIENTOS.VER + CREAR` para entrar na tela novo por layouts é **decisão histórica explícita**, não bug deste menu; toast de registro só após confirmação real. Referência de documento é texto livre: integração física FE/NC/entrega continua fora de escopo.

**Observações não bloqueantes:** GET de catálogos entrega metadata de depósitos não autorizados com `permitido=false` por contrato/teste anterior (requer decisão de privacidade antes de classificar); histórico com 3 SELECTs sem snapshot único (risco transitorio); `Number`/float8 para quantidades/custos limites merece teste focal; modal nativo já confirma anulação; motivo da anulação continua editável durante POST, mas SQL evita duas inversões; estoque de catálogo é orientativo, função valida saldo vigente; V1 transferencia é imediata. Nenhum bug adicional confirmado nestas observações.

**Estado:** Auditoria do **Menu 9 Movimientos** documentada com **1 ALTA + 2 MÉDIAS ABERTAS**, **NÃO HOMOLOGADA**. Não alterar código nem mandar comando ao Claude sem autorização; somente testes básicos localizados em intervenção futura, nunca suite/build/tsc/lint global/VM/PG por iniciativa IA. **Próximo menu: Inventario → Depósitos** quando solicitado.

## AUD-R02 Movimientos DESKTOP — revalidação de vigência (19/10/2026)
- Relatório: documentacao/testes/AUD-NEXIT-MOVIMIENTOS-DESKTOP-R02-2026-10-19.md. Base R01 eaa10106dfb273ddd57079ddab5c978dc6d28009; HEAD funcional examinado e5c5f2016940d9b59c4a4a30fcf3a33f3852981e. Entre eles, 212 commits e ZERO alteração funcional dos arquivos de Movimientos; identidade confirmada por 17 blobs de tela, API, helpers, testes e proteção de formulário.
- MOV-D01 ALTA ABERTO: novo/page.tsx mantém inputs mutáveis durante saving, limpar chave K1 com POST pendente permite retry K2 após resposta perdida e duplicação física possível apesar da idempotência SQL por chave. MOV-D02 MÉDIA ABERTO: resultado.datos sem resultado.clave == claveConsulta expõe linhas/resumo de consulta anterior enquanto novo filtro carrega. MOV-D03 MÉDIA ABERTO: hoyAsuncion é dependência de useEffect que recarrega catálogos e pode repor formulário com rascunho sujo na virada de data.
- Não foi comprovado defeito novo neste recorte. MOV-O01..O06 continuam observações condicionais. VER e VER+CREAR para novo, CREAR no POST, ANULAR crítico, empresa/ambos depósitos de transferência e motor SQL único preservados em código. Nenhuma migration executada ou estado real do banco confirmado.
- Zero testes reexecutados pelo ChatGPT; sem navegador/React, HTTP real, PostgreSQL/VM, CI, suite global ou deploy. PRO-79 In Review, NÃO HOMOLOGADO; CORREÇÃO SOLICITADA 1 ALTA + 2 MÉDIAS. Claude somente se o responsável autorizar separadamente.

## AUD-R03 Movimientos DESKTOP — PRO-182 / MOV-D01 (19/10/2026)
- **Relatório independente:** [AUD-NEXIT-MOVIMIENTOS-DESKTOP-R03](../../testes/AUD-NEXIT-MOVIMIENTOS-DESKTOP-R03-2026-10-19.md); commits funcionais e546276c9d60940f330095bf53c210082ce2f293 e dea120fbed88c99322c73da4eb7c21fadba1266f. **Núcleo de MOV-D01 CONFORME ESTATICAMENTE** (snapshot/clonagem K1, reserva síncrona, bloqueio de edição, indeterminado→retry K1/mesmo payload e confirmação repetido); **MAS CORREÇÃO SOLICITADA: MOV-R03-01 ALTA e MOV-R03-02 MÉDIA**, não homologado.
- **MOV-R03-01 ALTA:** lib/movimientos/cliente-api.ts:84 declara 4xx exceto 408 como RECHAZADO e lib/movimientos/intento.ts:60–61 descarta K1 sem considerar que o POST anterior já ficou INDETERMINADO. K1 comitou/resposta perdida, retry recebe 401/403 antes de SQL (sessão/permissão) ou 400 em preflight, controle perde K1 e pode autorizar K2 = risco de duplicação física. Resposta 4xx com JSON ilegível também é tratada como rejeição comprovada. Critério: preservar K1/payload/risco após qualquer rejeição subsequente sem prova autoritativa da ausência de COMMIT, testar retry 401/403/409/400/4xx ilegível; 4xx primeiro envio conclusivo continua corrigível.
- **MOV-R03-02 MÉDIA:** novo/page.tsx:148–159 chama router.push após POST OK mesmo se usuário confirmou saída, navegador desmontou componente e resposta chegou tardiamente. Critério: não navegar/atualizar UI desmontada, sem afirmar cancelamento da operação em servidor; teste promessa controlada de abandono e resolução tardia.
- **Claude reportou**, não reexecutado pelo ChatGPT: intento 12/0, movimientos 20/0, stock-reposición 275/0 = **307/0**; ESLint/tipos pontuais OK. Testes helper/servidor simulado + regex UI, sem React/browser real, HTTP autenticado, PG/VM, SQL, CI, suíte global ou deploy. Falha cruzados NEX-053 histórica fora do diff.
- **PRO-182 In Review com bloqueios R03; PRO-79 In Review não homologado; PRO-183/184 Todo (MOV-D02/D03 intocados).** Apenas correção dos resíduos com autorização expressa, depois AUD-R04. Não duplicar MOV-D01 original nem tocar NEX-014.

## AUD-R04 Movimientos DESKTOP — PRO-185/186 (19/10/2026)
- **Relatório independente:** [AUD-NEXIT-MOVIMIENTOS-DESKTOP-R04](../../testes/AUD-NEXIT-MOVIMIENTOS-DESKTOP-R04-2026-10-19.md); **commit funcional** 7aa11bb1a905a63c1e3508a4c178c54b892c144e. PRO-185/MOV-R03-01 (ALTA) e PRO-186/MOV-R03-02 (MÉDIA) **CONFORMES ESTATICAMENTE**. PRO-182/MOV-D01 possui aceite técnico estático no ciclo da tela ativa; sem homologação/Done.
- **PRO-185:** huboIndeterminado guarda histórico da intenção; 4xx de retry 401/403/400/409 não apaga K1 nem payload e não declara operação não registrada; resposta 4xx ilegível = indeterminado; rejeição conclusiva na primeira tentativa libera edição; o mesmo K1 volta a confirmar repetido.
- **PRO-186:** aplicarResultadoSiVigente + ref vigente/cleanup de unmount bloqueiam callback de navegação, estado e aviso de resposta tardia de tela desmontada; fluxo vigente preserva confirmação normal. Teste com helper real, integração de tela apenas estrutural.
- **MOV-O07 RISCO RESIDUAL CONHECIDO:** K1 vive em estado por instância; abandonar ou recarregar em INDETERMINADO perde a chave, e uma nova visita permite K2. O aviso manda verificar histórico, mas não implementa recuperação/deduplicação cross-page. Não declarar segurança absoluta contra duplicações, nem abrir mudança estrutural sem decisão humana; considerar em homologação. O back do navegador segue limitação reconhecida pelo hook existente.
- **Testes Claude (não reexecutados ChatGPT):** intento 30/0, movimientos 20/0, stock-reposición 275/0 = **325/0**. Tipos OK e ESLint sem erros com 1 warning de variável m não usada em intento.casos.ts:240. Sem React/navegador/HTTP integrado/PG/VM/Docker/SQL/migrations/CI/deploy; cruzados NEX-053 falha legada fora do diff.
- **Estado:** PRO-185/186 In Review, PRO-182 e PRO-79 In Review, NÃO HOMOLOGADO; PRO-183/MOV-D02 e PRO-184/MOV-D03 seguem Todo. STK-D03/PRO-179 separado. A revisão estática desta rodada é concluída, mas o menu Movimientos permanece com 2 MÉDIAS pendentes.

## AUD-R05 Movimientos DESKTOP — PRO-183/MOV-D02 (19/10/2026)
- **Relatório independente:** [AUD-NEXIT-MOVIMIENTOS-DESKTOP-R05](../../testes/AUD-NEXIT-MOVIMIENTOS-DESKTOP-R05-2026-10-19.md); commit funcional a484a1fe13296b13f394d4798c8dc1593393bcbe. **PRO-183/MOV-D02 CONFORME ESTATICAMENTE**, sem novo bloqueio no diff; menu **NÃO HOMOLOGADO**.
- **Derivação da consulta vigente:** lib/movimientos/vista-historial.ts derivarVista só expõe datos/error quando resultado.clave == claveConsulta e listo, caso contrário estado carregando neutro. Lista usa apenas essa vista para linhas/links, KPI «—», totais, paginação «Mostrando —» e botão de nova movimentação com CREAR vigente. lanzarConsulta invalida respostas e erros assíncronos anteriores ao alterar chave/desmontar. Falha da consulta atual não reabilita dados antigos e oferece Reintentar.
- **Preservados:** debounce 300 ms sobre busca aplicada, filtro/ordem/página no servidor, ?ok confirmado por GET com acesso autorizado, ações CREAR, motor de registros, anulação, SQL, APIs e multiempresa. Ao digitar antes do fim do debounce ainda está aplicado o filtro anterior — regra funcional mantida, não confundir com dados antigos depois da aplicação.
- **Testes Claude, NÃO reexecutados ChatGPT:** historial 15/0, intento 30/0, movimientos 20/0, stock-reposición 275/0 = **340/0**; tipos OK e lint sem erros, 1 warning antigo intento.casos.ts:240. Testes puros + promessas controladas e wiring UI estrutural, não há React/browser/HTTP integrado/PG/VM/Docker/CI/migrations; cruzados NEX-053 é falha legada não alterada.
- **Estado:** PRO-183 In Review, não Done; PRO-79 Movimientos In Review, **NÃO HOMOLOGADO**. PRO-184/MOV-D03 (virada de data/rascunho) permanece Todo. PRO-182/185/186 estáticos aceitos em R04, com MOV-O07 risco K1 cross-page declarado. PRO-179 STK-D03 separado. Próxima correção somente mediante autorização humana e AUD-R06 após commit.
