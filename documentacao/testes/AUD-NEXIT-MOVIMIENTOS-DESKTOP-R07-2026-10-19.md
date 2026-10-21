# AUD-NEXIT-MOVIMIENTOS-DESKTOP-R07 — Reauditoria independente PRO-187 / MOV-R06-01

**Data:** 19/10/2026 · **Auditor:** ChatGPT · **Sistema:** NEXIT/DistribuNex V1, exclusivamente desktop.  
**Repositório e branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`.  
**Commit funcional auditado e HEAD funcional conferido:** `1358935edc2e9bef2bd42706a846f49ef60c8230` ([GitHub](https://github.com/proceit-tech/distribuidora/commit/1358935edc2e9bef2bd42706a846f49ef60c8230)).  
**Revisão anterior:** [AUD-NEXIT-MOVIMIENTOS-DESKTOP-R06](./AUD-NEXIT-MOVIMIENTOS-DESKTOP-R06-2026-10-19.md). **Tarefas:** [PRO-187](https://linear.app/proceit/issue/PRO-187), subordinada a [PRO-184](https://linear.app/proceit/issue/PRO-184).

## 1. Parecer

**PRO-187 / MOV-R06-01 (MÉDIA): CONFORME ESTATICAMENTE — REGRESSÃO DA AUD-R06 CORRIGIDA.** O callback de sucesso da carga de catálogos passou a disponibilizar o catálogo e limpar o erro de carga **antes** da condição que proíbe reinicializar um formulário já editado. Assim o editor deixa de permanecer travado quando o usuário digita observação, motivo ou documento de referência enquanto o GET inicial ainda está pendente. Não foi identificado novo defeito corretivo ALTA/MÉDIA no diff. **PRO-184/MOV-D03: CONFORME ESTATICAMENTE NO ESCOPO DA CORREÇÃO DA VIRADA DE DATA**, integrando agora o aceite do resíduo PRO-187.

**Importante:** este é um aceite **estático e dirigido**, não prova em React/browser nem homologação operacional. **PRO-79 Movimientos segue In Review e NÃO HOMOLOGADO**. PRO-182/MOV-D01 e resíduos PRO-185/186 permanecem aceitos estaticamente na R04; PRO-183/MOV-D02 na R05. Risco residual **MOV-O07** — perda da chave K1 se o usuário abandonar/recarregar página com operação indeterminada — permanece declarado e depende de decisão e verificação operacional humana.

## 2. Escopo e fontes confrontadas

Lidos `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, fichas do menu e AUD-R06, estado do Linear e commit/diff real; inspecionados códigos vigentes em `lib/movimientos/inicializacion.ts`, `app/(private)/movimientos/nuevo/page.tsx`, `lib/movimientos/inicializacion.casos.ts`, `lib/movimientos/intento.ts`, `lib/movimientos/formulario.ts`, `lib/movimientos/vista-historial.ts`, `app/api/movimientos/route.ts` e `lib/ui/proteger-cambios.ts`.

O diff funcional altera apenas **4 arquivos**: `lib/movimientos/inicializacion.ts`, `app/(private)/movimientos/nuevo/page.tsx`, `lib/movimientos/inicializacion.casos.ts`, `PROGRESSO-NEXIT-V1.md`. SQL, migrações, API, autenticação, ACL, registros de estoque, histórico, motor de anulação e idempotência permanecem fora do diff.

## 3. Critérios de aceite

| Critério | Evidência concreta | Resultado |
| --- | --- | --- |
| Receber catálogo válido mesmo com formulário `tocado` | `nuevo/page.tsx:70–86`: `procesarCargaCatalogos` produz `r.catalogo`; `setCatalogo(r.catalogo)` ocorre na linha 77, **antes** de `if (!ini.aplicar) return` da linha 79 | **CONFORME** |
| Encerrar carregamento e disponibilizar produtos/depósitos | `nuevo/page.tsx:98–99` deriva opções de `catalogo`; `cargando` usa `!catalogo && !errorForm`; `setCatalogo` no sucesso quebra essa condição e reabilita os controles dependentes, ressalvados `fieldset` e bloqueios vigentes | **CONFORME ESTATICAMENTE** |
| Não sobrescrever edição anterior | `inicializacion.ts:14–19,26–28`: `resolverInicializacion` continua negando aplicação quando `tocado` ou `inicializado`; `nuevo/page.tsx:79–85` só altera `form`, `base`, `cantidadTxt`, `precargado` depois dessa autorização | **CONFORME** |
| Não limpar dados editados de motivo/referência/observação | `nuevo/page.tsx:111–116,483–502`: handlers marcam `tocado.current=true`; callback do catálogo não faz `setForm` quando tocado | **CONFORME** |
| Limpar erro após sucesso sem restaurar rascunho | `nuevo/page.tsx:77–79` publica catálogo e `setErrorForm("")` antes do ramo de inicialização | **CONFORME** |
| Carga legítima sem edição e precarga URL | `inicializacion.ts:14–19` conserva `precargarDesdeConsulta`, que valida produtos e depósitos autorizados; `nuevo/page.tsx:80–85` mantém aplicação e aviso de descarte | **PRESERVADO** |
| Virada de dia e validação da data local | `nuevo/page.tsx:38,70–91,147–151`: `hoyInicial` é fixo, efeito depende de `intentoCarga`, submit inicial usa `hoyAsuncion()` corrente; sem temporizador novo | **PRESERVADO** |
| Idempotência e segurança do POST | `nuevo/page.tsx:54,137–177` usa `control.current.registrar` e snapshot K1 não alterado; `intento.ts` intocado; sem mudanças SQL/API/ACL | **PRESERVADO NO DIFF** |
| Histórico vigente | `lib/movimientos/vista-historial.ts` e rota/lista não alteradas | **PRESERVADO NO DIFF** |
| Respostas tardias/desmontagem | `iniciarCargaCatalogos` mantém flag `activo` + cleanup; somente sucesso da consulta vigente aciona processamento | **PRESERVADO ESTATICAMENTE** |

## 4. Testes, evidência e limites

**Claude reportou, não reexecutados pelo ChatGPT:** `inicializacion.casos.ts` **17 verificações/0 falhas** (3 novas: edição de `observacion`, `motivo`, `documentoReferencia` antes da resolução do GET); regressões `intento` **30/0**, `historial` **15/0**, `movimientos` **20/0**, `stock-reposición` **275/0**. **Total: 357/0 reportados.** Tipos e ESLint pontuais reportados sem erros nos arquivos alterados. Falha legada `cruzados` / NEX-053 não pertence ao diff.

Os novos testes utilizam **o mesmo `procesarCargaCatalogos` da página** e simulam o cabeamento `setCatalogo` antes de eventual inicialização; após resolver um GET pendente com edição anterior verificam catálogo disponível, `cargando=false`, valor digitado preservado, zero inicializações, edição subsequente de produto e depósito, rascunho sujo. O teste estrutural confronta ordem das chamadas reais no JSX. Os casos legados continuam cobrindo D→D+1 com relógio de Asunción, error/retry, precarga autorizada/descarte, K1/snapshot e desmontagem. **Limitação explícita:** modelo de tela com helper e regex, **não** montagem/rerenderização real em React; tampouco houve HTTP/PG integrado.

O ChatGPT **não executou testes**; nenhuma VM, Docker, PostgreSQL, navegador, SQL/migrations, CI manual, build global, suíte global ou deploy nesta auditoria. Homologação funcional/visual cabe ao responsável humano.

## 5. Continuidade e governança

- **PRO-187/MOV-R06-01:** conforme estática, **In Review**, não Done nem homologada.
- **PRO-184/MOV-D03:** conforme estática na correção dirigida completa, **In Review**, não Done nem homologada.
- **PRO-183/MOV-D02**, **PRO-182/MOV-D01** e **PRO-185/186:** aceites estáticos anteriores mantidos.
- **PRO-79 Inventario → Movimientos:** In Review, **NÃO HOMOLOGADO**, sem nova correção bloqueante identificada neste recorte, mas ainda requer validação operacional/visual e decisão do responsável quanto ao risco MOV-O07 antes de alegar segurança de idempotência entre telas.
- **STK-D03/PRO-179:** separado e não iniciado; não avançar para outro menu automaticamente.
- Não ampliar escopo, mudar SQL, concluir Linear como Done, fazer deploy ou declarar homologação sem autorização específica.
