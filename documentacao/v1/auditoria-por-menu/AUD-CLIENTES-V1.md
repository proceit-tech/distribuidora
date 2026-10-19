# Auditoria por menu — Clientes

**Rota principal:** `/clientes`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado:** ABERTA — NÃO AUDITADA INTEGRALMENTE — NÃO HOMOLOGADA  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Clientes**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

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

Primeira passagem estática concluída em 12/10/2026 (ver seções I–V abaixo). Os achados CLI-A01…CLI-A06 são constatações do código/SQL atual, não provas de reprodução na VM. A auditoria continua aberta.

## Pendências

Auditoria INICIADA e PARCIAL em 12/10/2026. Falta confronto exaustivo de todos os campos fiscais e comerciais, todas as migrations aplicáveis, consultas reais no PostgreSQL, cenários de HTTP/browser e validação visual. Não atribuir percentual de cobertura.

## Regra de migrations

O responsável mostrou NEX-001…051 já aplicadas na VM. Proibido editar scripts aplicados, checksums ou reexecutar SQL histórico como se fosse nova migration. Qualquer nova alteração estrutural exige justificativa, aprovação e migration incremental a partir de NEX-052.

## I. Primeira passagem da auditoria estática — 12/10/2026

**Branch:** `feature/NEXIT-2026-001-banco-demo`. A tarefa autorizada pelo responsável é **auditar Clientes enquanto Claude Code executa a Etapa 01 de Productos**. Não editar nenhum arquivo de código, migration ou documentação de Produtos nem liberar nova implementação de Clientes sem autorização específica.

**Fontes lidas/confrontadas nesta passagem:** `CLAUDE.md`; `documentacao/PROTOCOLO-IA.md`; seções de Clientes de `PROGRESSO-NEXIT-V1.md` (incluindo `F-CLI-10-01` corrigido); `app/(private)/clientes/{page.tsx,nuevo/page.tsx,[id]/page.tsx,layout.tsx}`; `app/api/clientes/{route.ts,[id]/route.ts,[id]/documentos/route.ts}`; `lib/clientes/{aptitud-cliente,relacionados,filtros-listado}.ts`; migrations `NEX-005-clientes.sql` e contrato das `NEX-021…032` referido no progresso; testes versionados `cierre-modulo.casos.ts`, `comercial.casos.ts`, `permisos-documentos.casos.ts`; especificações visuais `CLIENTES-LISTA-PADRAO-V1.md` e `AUDITORIA-CADASTRO-CLIENTES-PADRAO-FORMULARIOS-V1.md`. Algumas APIs/serviços foram lidos por trecho; **não é auditoria exaustiva nem validação da aplicação de todas as migrations**.

### Achados com evidência concreta

| ID | Prioridade | Localização e comprovação | Impacto / mínimo critério para correção |
|---|---|---|---|
| **CLI-A01** | **ALTA — impedimento de edição de legados** | `app/api/clientes/[id]/route.ts:268-280`: PUT percorre **todos** os campos `REFERENCIAS` (`:40-47`) e exige `activo=true` mesmo se o UUID é igual ao valor já salvo; só condição de pagamento/moeda, mais adiante em `:297-304`, tem tratamento explícito de campo inalterado. `app/api/clientes/route.ts:509-561` devolve catálogos ativos apenas. | Cliente associado anteriormente a grupo, lista, vendedor, canal, rota ou zona posteriormente **inativado** pode não conseguir salvar sequer a mudança do telefone/endereço. Corrigir diferenciação 'referência EXISTENTE inalterada' × 'nova referência escolhida' dentro da transação; permitir legado inalterado, negar nova seleção de inativo/fora da empresa, preservar UUID histórico. Incluir caso de edição com referência inativa inalterada, troca para ativa, tentativa de apontar para outra empresa. |
| **CLI-A02** | **ALTA — perda de alterações não salvas** | `app/(private)/clientes/nuevo/page.tsx:1043-1061,2199-2203` e `app/(private)/clientes/[id]/page.tsx:1062-1075,2427-2434` exibem links diretos para `/clientes` (`Volver/Cancelar`) sem confirmação de formulário alterado; busca estática de ambos os componentes não identifica listener `beforeunload` nem guard de navegação. As confirmações `window.confirm` existentes no cadastro novo são restritas a decisões específicas e finalização incompleta de documentos. | Ao deixar a página, dados editados, contactos, endereços e anexos ainda não enviados podem se perder sem aviso. Guard mínimo de saída para estado alterado (incluindo arquivos/filhos), usar padrão UX aprovado e não bloquear navegação quando não houver alterações; `beforeunload` apenas para fechar/recarregar. Confirmar em browser antes de homologar. |
| **CLI-A03** | **ALTA/MÉDIA — atualização obsoleta sobrescreve outro operador** | `app/api/clientes/[id]/route.ts:289-296` faz `SELECT ... FOR UPDATE` no momento de salvar, porém não verifica versão original da tela; `:464-515` atualiza quase toda a linha. O `GET :123,190-192` expõe `actualizado_at` ao cliente, mas `app/(private)/clientes/[id]/page.tsx:859-948` envia dados sem `actualizadoEn`/`version` ou `If-Match`; `lib/clientes/relacionados.ts` faz UPDATE de coleções identificadas por id. | Dois operadores que abriram a mesma ficha podem salvar um após o outro e o último sobrescrever alterações feitas pelo primeiro enquanto a tela dele estava aberta. `FOR UPDATE` serializa queries simultâneas, **não** detecta formulário obsoleto. Preferir pré-condição simples de versão/`actualizado_at` em PUT, retornar 409 e pedir recarregar, inclusive quando mudanças em filhos relevantes. Teste de duas sessões/tabs na mesma empresa; não criar infraestrutura complexa na V1. |
| **CLI-A04** | **MÉDIA — falha do catálogo ocultada na edição** | `app/(private)/clientes/[id]/page.tsx:497-547`: requisições de ficha e catálogos são paralelas, mas se confere `rCliente.ok` e **não se confere `rCatalogos.ok`**. A resposta do catálogo é tratada como `Partial<Catalogos>` e mesclada com `CATALOGOS_VACIOS` mesmo quando HTTP 401/403/500. | Um erro de serviço/permissão ao carregar opções aparece ao usuário como seletores vazios e cadastro aparentemente normal, em vez de falha explícita. Verificar `rCatalogos.ok`, informar e manter o formulário sem salvar decisões sobre catálogo indisponível; não limpar silenciosamente FKs por ausência de opção. Regressões HTTP 500/403 catálogo versus ficha 200 e vice-versa. |
| **CLI-A05** | **DESEMPENHO — risco, não bloqueador imediato V1** | `app/api/clientes/route.ts:421-492` (`modo=lista`) retorna todos os clientes da empresa sem `LIMIT/OFFSET`, depois `evaluarAptitudEmpresa` para TODOS; `lib/clientes/aptitud-cliente.ts:74-96` realiza novas consultas completas de clientes e domicílios fiscais para cálculo de aptidão; `app/(private)/clientes/page.tsx:257-282` recebe e mapeia tudo, com 8 itens por página definidos em `:20` e filtro/paginação no browser. | Tempo/resposta/consumo crescem com carteira grande e são difíceis de perceber com poucos registros. Não inventar metas de escala; medir no ambiente autorizado com cardinalidade real. Se houver lentidão demonstrada, migrar filtros, ordenação e paginação para servidor preservando KPI/filtro de aptidão. Não propor redesenho agora sem evidência operacional. |

## II. Comportamentos corretos observados, evitar correções regressivas

- `app/api/clientes/route.ts:402-413,420-475` exige sessão e `CLIENTES.VER`, restringe a lista por empresa da sessão; `POST:630-642` exige `CREAR`. `app/api/clientes/[id]/route.ts:95-126,202-223` exige `VER` no GET, `EDITAR` no PUT, usa `empresa_id` da sessão. Requer confirmação HTTP e multiempresa em teste real antes de homologar, mas **não registrar como defeito sem evidência**.
- PUT da ficha usa `BEGIN`, row lock no cliente, sincroniza contatos/direções na transação e `COMMIT` depois de validar aptidão fiscal (`app/api/clientes/[id]/route.ts:287-296,531-556`). `lib/clientes/relacionados.ts:360-364` rejeita manipulação de documentos via JSON; documentos privados usam rotas próprias.
- Fluxo de upload inicial de documentos conta com revalidação da autoria/permissão sob `FOR UPDATE` em `app/api/clientes/[id]/documentos/route.ts:68-77`, corrigindo o achado anterior F-CLI-10-01. Não reabrir sem prova de regressão.
- A lista não usa mocks na operação real e não esconde registros inativos por padrão. A nomenclatura do formulário é em espanhol PY. A documentação visual registra aprovação estática do estado vazio mas as capturas originais **ainda não estão versionadas no Git**: não afirmar screenshot ou homologação de dados reais.

## III. Prioridades e escopo enxuto da V1

**Correção preferencial futura, SE AUTORIZADA:** (1) CLI-A01 — edição de referências inativas inalteradas; (2) CLI-A02 — aviso ao abandonar formulário modificado; (3) CLI-A04 — não mascarar indisponibilidade dos catálogos. CLI-A03 pode ser resolvido com proteção simples de versão; CLI-A05 necessita primeiro medição, não é justificativa para reescrever a lista agora. Não adicionar wizards, aprovações comerciais, tabelas extras ou revisões integrais desnecessárias.

**Nenhuma correção de Clientes foi solicitada ao Claude nesta etapa:** ele trabalha em Productos. A auditoria desta ficha continua ABERTA. Não emitir ordem de implementação automaticamente; uma tarefa compacta para Clientes só depois da conclusão/avaliação de Productos ou de autorização expressa do responsável.

## IV. Testes necessários para homologação futura (não executados nesta passagem)

- `PUT` com grupo/lista/vendedor/rota/canal/zona histórica inativa **sem alterar o FK**; trocas para ativos/inativos e FK de outra empresa.
- Formulário com dados sujos (incluindo filho/arquivo) → sair/recarregar/cancelar deve confirmar; formulário intacto → navega sem alerta.
- Duas abas/usuários com versão inicial igual: primeiro salva; segundo recebe conflito e preserva dados locais; dados finais não voltam à versão antiga.
- Cadastro `/clientes/[id]`: catálogo 500/403 + ficha 200 deve mostrar erro claro; ficha 404 não deve ser tratada como falta de catálogo.
- Testes de escala apenas se cardinalidade/latência real justificar; comparar quantidade enviada por `modo=lista`, cálculo de aptidão e ordenação dos filtrados.

**Execução nesta auditoria:** 0 testes, 0 builds, 0 consultas de banco/VM, 0 screenshots capturados. Os resultados de testes de Claude em `PROGRESSO-NEXIT-V1.md` foram apenas consultados; não reproduzidos pelo ChatGPT.

## V. Próxima investigação (sem decisões repetidas)

Examinar próxima rodada por prioridade: integridade de GET/POST/PUT dos filhos frente a NEX-005 e NEX-021…032, autorização/download/versionamento/exclusão lógica de documentos, regras D3/SIFEN de aptidão e mensagens por campo, impacto em Facturación e SQL de índices/constraints; confrontar o estado de migrations no ambiente real somente sob procedimento autorizado pelo responsável. Mantêm-se as decisões oficiais do menu: não formular novamente questões já resolvidas no repositório.

**Status:** PRIMEIRA PASSAGEM documentada; auditoria INCOMPLETA, NÃO HOMOLOGADA, nenhuma implementação autorizada ou aplicada pelo ChatGPT.

## VI. Segunda passagem — permissão de documentos privados e reaplicação de grants (12/10/2026)

### CLI-A06 — CRÍTICA / integridade de versões, auditoria e exclusão lógica (CONFIRMADA EM CÓDIGO SQL; execução no PostgreSQL não comprovada)

**Fonte da política:** `NEX-031-cliente-documentos-versiones-auditoria.sql:2-12` declara preservação física de arquivos e histórico, `cliente_documento_eventos` apenas para altas e ações de versão; `:79-88` aplica `REVOKE DELETE ON cliente_documentos` e `GRANT SELECT,INSERT ON cliente_documento_versiones, cliente_documento_eventos` **somente no momento da migration**.

**Fonte do defeito:** `NEX-014-movimientos-operativos.sql:494-518` define `nex_aplicar_grants_runtime()` com `REVOKE ALL ON ALL TABLES IN SCHEMA public`, concede SELECT genérico a todas e INSERT/UPDATE/DELETE a lista fixa que contém `cliente_documentos`, **mas NÃO contém** `cliente_documento_versiones` ou `cliente_documento_eventos` no conjunto de escrita. A função do NEX-014, portanto, ao ser executada **depois do NEX-031**, desfaz simultaneamente:

1. os `INSERT` concedidos a `nexit_runtime` nas tabelas `cliente_documento_versiones` e `cliente_documento_eventos` (deixando o runtime sem privilégios para criar a versão e o evento de auditoria), e
2. o `REVOKE DELETE` em `cliente_documentos` (o runtime volta a ter capacidade de exclusão física, apesar da política declarada de eliminação somente lógica).

**Confirmação cruzada de falta de reparação:** `NEX-037-proveedores-cuentas-desactivacion-auditoria-inmutable.sql:86-125` cria `nex_aplicar_grants_proveedores` e encadeia a função base; `NEX-041-productos-documentos-archivos-imagen.sql:146-173` e `NEX-046-depositos-gestion.sql:420-429` recompõem o wrapper para Proveedores/Fiscal/Productos/Comercial/Depósitos, **sem uma função de restauração de grants de `cliente_documentos`, `cliente_documento_versiones` e `cliente_documento_eventos`**.

**Impacto em caso de reaplicação:** as rotas `POST /api/clientes/[id]/documentos` (`route.ts:78-103`), `PUT .../[docId]` (`route.ts:141-185`), exclusão/restauração e recuperação de versões dependem dos privilégios de INSERT em versões/eventos. As transações podem falhar por permissão; a garantia de que o role do app não pode executar DELETE direto no cadastro de documentos deixa de ser verdadeira. **Isto é um risco condicional comprovado pelas definições, NÃO prova de que a função foi executada ou de que essas permissões estão atualmente erradas na VM.**

**Aceite técnico mínimo, sem ampliar a V1:** em futura migration incremental AUTORIZADA, garantir helper `nex_aplicar_grants_clientes()` idempotente e encadeado ao wrapper global, que reaplique permanentemente `REVOKE DELETE` em `cliente_documentos`, e `SELECT,INSERT` (sem UPDATE/DELETE) nas tabelas de versões/eventos após qualquer reset de grants. Confrontar grants finais com `has_table_privilege`/`information_schema` no banco efetivo apenas sob procedimento humano autorizado; não reexecutar NEX-014 nem reescrever NEX-031. Se pertinente à garantia append-only, considerar bloqueio por trigger para UPDATE/DELETE/TRUNCATE nas tabelas de auditoria/versões, conforme padrão já usado em outros módulos, mas não impor desenho extra sem validação.

**Casos de regressão obrigatórios:** estado de grants depois de `nex_aplicar_grants_runtime()` executado em PostgreSQL de prova (não VM operacional); runtime pode `SELECT/INSERT` em versões/eventos mas NÃO `UPDATE/DELETE`, `cliente_documentos` permite UPDATE (eliminação lógica) mas NÃO DELETE. Upload, troca de versão, auditoria, eliminação lógica e restauro completam suas transações sem 42501; dados históricos preservados.

**Prioridade de implementação futura:** CLI-A06 é potencial bloqueador de funcionamento/segurança de Documentos e precede melhorias meramente visuais. Não liberar automaticamente Claude para Clientes enquanto trabalha em Productos. Estado atual do PostgreSQL precisa ser confirmado pelo responsável antes de qualquer decisão de aplicação.

**Execução desta análise:** apenas leitura GitHub. 0 testes PostgreSQL, 0 VM, 0 migrations executadas. Auditoria Clientes continua ABERTA, sem implementação autorizada.

## VII. RODADA CONJUNTA AUTORIZADA — estabilização Clientes + Productos V1 (12/10/2026)

**Contexto:** após auditoria estática da implementação fiscal Productos (`1a72c7e`, merge `f811741`), o responsável autorizou reunir **ajustes necessários de ambos os menus** para o Claude, evitando burocracia e funcionalidades avançadas. A fonte canônica de instrução do pacote é **`AUD-PRODUCTOS-V1.md` §XXII**. Esta seção define só o escopo Clientes e seus critérios, não substitui a ficha de Produtos.

**Prioridades Clientes (corrigir os defeitos, sem reabrir decisões de negócio):**

1. **CLI-A06 — CRÍTICO / gravação e integridade de documentos:** corrigir permanentemente o efeito de `nex_aplicar_grants_runtime()` sobre `cliente_documentos`, `cliente_documento_versiones` e `cliente_documento_eventos`. `NEX-031:79-88` faz `REVOKE DELETE` e `GRANT SELECT,INSERT` apenas uma vez; `NEX-014:494-518` pode resetar/reconceder DELETE em documentos e retirar INSERT de versões/eventos; wrappers posteriores (NEX-037/041/046) não recompõem privilégios de Clientes. Propor helper idempotente `nex_aplicar_grants_clientes()` ligado ao wrapper corrente, **preservando todos os helpers existentes de outros módulos**; reset não pode voltar a dar DELETE físico no documento nem retirar INSERT de versões/eventos. Se exigir SQL, preparar **somente nova migration incremental NEX-052+** no Git e plano de rollback/preinspeção, sem tocar NEX-001…051 nem executar no banco real. No ambiente de testes seguro, verificar grants com `has_table_privilege` antes/depois de reaplicar helper e operações de upload, versionamento, exclusão lógica/restore. Não alegar privilégio atual da VM sem consulta autorizada. Evitar refatorar toda a infraestrutura de arquivos.
2. **CLI-A01 — ALTA / edição com FK legado inativo:** em PUT `app/api/clientes/[id]/route.ts:268-280` não exigir `activo=true` quando o UUID da referência (grupo, lista, rota, zona, vendedor, canal) for **exatamente o atualmente gravado no mesmo cliente/empresa**. Validar novas escolhas como ativas e da empresa. Carregar/exibir a referência histórica inativa no formulário sem apagá-la silenciosamente, mesmo que catálogos ativos não a contenham. Negativos: FK de outra empresa, inativa escolhida como nova. Sem migration.
3. **CLI-A03 — ALTA / concorrência:** `GET /api/clientes/[id]` já expõe `actualizadoEn`, mas PUT sobregrava toda ficha após `FOR UPDATE` sem pré-condição; usar uma versão otimista simples do registro (token/`actualizado_at` confiável), verificar no backend **depois de adquirir FOR UPDATE** e antes de qualquer UPDATE; retorno HTTP **409** com mensagem específica; preservar rascunho local, não refazer POST, não misturar duas edições. Garantir que atualizações no mesmo fluxo de PUT de contactos/direcciones não sejam perdidas. Se a solução exigir nova coluna/trigger, justificar; preferir mecanismo existente sem migration adicional.
4. **CLI-A04 — MÉDIA / falha mascarada em catálogo:** em `app/(private)/clientes/[id]/page.tsx:497-547`, verificar também `rCatalogos.ok` antes de interpretar a resposta, com feedback claro 401/403/500, **sem converter erro em catálogo vazio nem limpar vínculos**. Corrigir só esse fluxo; regressão erro na ficha versus erro no catálogo.
5. **CLI-A02 — MÉDIA/ALTA UX / perda de rascunho:** telas `clientes/nuevo` e `clientes/[id]` têm Volver/Cancelar via link simples sem proteção. Quando houver alterações efetivas em campos, contatos, direções ou arquivos pendentes, confirmar antes de sair/cancelar e avisar no reload/fechamento, usando padrão reutilizável com Productos. Formulário intacto sai sem aviso. Não impedir navegação após salvar; não gerar popups repetidos.

**Fora desta rodada:** CLI-A05 (paginação server-side e carga grande) fica como medição de desempenho, não bloqueador V1; telefonia internacional além das regras já decididas, integrações de cobrança, novo onboarding, UX avançada, migrations históricas e demais módulos estão fora do pacote. Não introduzir funcionalidades novas.

**Regras de aceite funcional:** não perder UUIDs comerciais inativos; não sobrescrever edição concorrente; operação de documentos só executa quando o runtime tem permissão correta; não mascarar erro de catálogo; não perder rascunho sem confirmação; multiempresa e permissões por rota continuam íntegros. Testes de regressão locais incluindo cenários negativos; banco real/VM não acessados pelo Claude.

**Ordem e entrega:** ler `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progresso pertinente, §XXII Productos e esta seção VII; sincronizar branch com segurança, implementar ajustes pontuais por menu (commits separados para facilitar auditoria), executar verificações locais, `git commit && git push`, fornecer números de testes/falhas e SHAs e **PARAR**. Não editar `AUD-*`, não criar relatório duplicado, não modificar migrations NEX-001…051 nem executar SQL/migrations/VM. ChatGPT auditará nova entrega; responsável realizará homologação operacional. Esta autorização não equivale a 'Clientes finalizado' ou 'HOMOLOGADO'.

**Estado:** CORREÇÃO CONJUNTA AUTORIZADA PARA CLAUDE CODE; ainda não implementada; auditoria Clientes ABERTA, não homologada. Nenhuma alteração de código, SQL ou VM realizada pelo ChatGPT.

## VIII. AUD-R02 — revisão independente do commit de estabilização Clientes (12/10/2026)

**Commits avaliados:** `389b67e28154c0935ae3c83ffd81777d4721b7b4` (implementação) e `e047ce474603d42217ea54fe3413f5d50f2b1d87` (remoção do script temporal adicionado por engano). A implementação Productos/NEX-052 está em `76072e887f7a25cffa18d89ab5e2aa097abf04e1`. A limpeza remove efetivamente `scripts/_cl2.js`. Progresso atualizado e alterações do menu Clientes localizadas em API, ficha, cadastro novo, hook de rascunho já existente, helper de referências e NEX-053.

### Resultados tecnicamente fundamentados, com pendências

- **CLI-A01 (código implementado):** `lib/clientes/referencias-version.ts:35-45` compara FKs comerciais informadas ao valor persistido do próprio cliente, sem exigir revalidação da referência inativa que permaneceu igual; escolha nova exige `empresa_id` e `activo=true`. `GET /api/clientes/[id]` carrega por empresa as referências historicamente inativas e a ficha as apresenta explicitamente. Não foi testado com dados reais.
- **CLI-A03 (código implementado):** GET fornece `actualizadoEn`; PUT normaliza o valor e compara `date_trunc('milliseconds', actualizado_at)` depois de `SELECT ... FOR UPDATE`; sem versão ou divergência devolve **409 antes de escrita** e a tela mantém dados locais. Não foi reproduzida disputa de duas transações PostgreSQL; timestamps têm precisão de milissegundos no contrato e precisam ser validados em uso real.
- **CLI-A04 (código implementado):** detalhe de Clientes verifica `rCatalogos.ok` e apresenta erro específico de HTTP em vez de interpretar lista vazia. Sem homologação da mensagem em navegador.
- **CLI-A02 (código implementado):** formulários novos/editáveis empregam `useProtegerCambios` com huella de campos/filhos e borrador de documento. Proteção de saída por clique em links e unload, não garantia universal de botão Atrás interno ou navegação programática no Next App Router. Não testar print inexistente.
- **CLI-A06 (SQL implementado, AINDA NÃO APLICADO):** NEX-053 cria `nex_aplicar_grants_clientes()` para `cliente_documentos` (SELECT/INSERT/UPDATE, sem DELETE) e `cliente_documento_versiones`/`cliente_documento_eventos` (SELECT/INSERT, sem UPDATE/DELETE). A nova NEX-052 fornece wrapper dinâmico para chamar todos os helpers. Verificadores são predominantemente de leitura e testes JS simulam os efeitos; **a restauração real de grants e compatibilidade com a conta `nexit_runtime` não foram comprovadas no PostgreSQL**. A NEX-053 depende da NEX-052 e essa ordem também deve ser respeitada para reversão.

**Não foram identificadas regressões bloqueantes novas específicas de Clientes nesta leitura dirigida de código**, mas NÃO equivale a auditoria integral ou aprovação do menu. Em `AUD-PRODUCTOS-V1.md` §XXIII encontram-se três pendências de Productos e uma guarda de reversão NEX-052 que deve ser corrigida antes de recomendar aplicação das migrations. Não reimplementar Clientes nem ampliar escopo sem bug demonstrado.

**Testes informados pelo Claude:** rodada conjunta 2116 verificações, 0 falhas; `tsc` e `next build` aprovados, ESLint apenas dos arquivos alterados. ChatGPT fez somente leitura GitHub e comparação textual; **zero testes locais executados nesta auditoria**, zero PostgreSQL real, VM ou SIFEN.

**Status:** Clientes em **ACEITE ESTÁTICO PROVISÓRIO** das correções direcionadas; NEX-053 **NÃO LIBERADA PARA APLICAÇÃO** até correção/verificação de dependência 052 e validação operacional autorizada. Menu Clientes ainda ABERTO e NÃO HOMOLOGADO.

## IX. AUD-R03 — revisão dirigida de regressão Clientes e dependência NEX-052/053 (12/10/2026)

**Fonte:** commit `6f6253d9c85bcf68dcb46c7576c4dcebcd06ab80` (testes e progresso, **sem alteração funcional Clientes**); ajuste Productos `0ff07fe36c144af17214e802c14728660f81423a`; merge `beb9fbf75ebd42a6a9b30bbe2ae5dd92e3c94397`. Protocolos e progresso atuais lidos. Conferido diff da suíte `lib/clientes/estabilizacion.casos.ts` e leitura da guarda `reversion-NEX-052.sql` em relação à NEX-053.

**Veredito:** **ACEITE ESTÁTICO DA VERIFICAÇÃO REGRESSIVA, sem novo bug comprovado em Clientes nesta rodada**. As duas novas verificações testam principalmente **contratos/expressões do SQL versionado**; não comprovam o estado dos grants nem execução de rollback no PostgreSQL. O código de Clientes e NEX-053 não foram alterados neste commit.

**Reporte do Claude:** 2132 verificações locais, zero falhas, TypeScript/ESLint/build aprovados; ChatGPT não reexecutou. As guardas de dependência não tornam NEX-052/053 aplicadas nem dispensam backup/verificação da ordem de aplicação (052 → 053) e reversão (053 → 052).

**Orientação:** não encaminhar retrabalho de Clientes ao Claude sem nova regressão demonstrada. Priorizar Proveedores na próxima execução. Clientes mantém **homologação operacional humana PENDENTE** (grants, transações, UI, VM), sem declarar o menu encerrado/implantado. Nenhum PostgreSQL, SQL ou deploy executado pelo ChatGPT.


## X. Auditoría actual — Clientes DESKTOP (18/10/2026)

**Snapshot de código:** `fe9e64123c70053b83f3d34b66cee779f184fe62`. **Reporte nuevo y específico:** [AUD-NEXIT-CLIENTES-DESKTOP-R01](../../testes/AUD-NEXIT-CLIENTES-DESKTOP-R01-2026-10-18.md). Esta sección prevalece en el diagnóstico actual; las secciones I–IX son históricas y no deben interpretarse como pendientes sin revalidación.

**Regla de producto confirmada:** ERP para escritorio, sin obligación de interfaz móvil; no exigir rutas ni pruebas de celular. Auditoría por menú, sin mezclar código de otros módulos ni autorizar correcciones masivas.

**Nuevos hallazgos comprobados estáticamente:**

| ID | Prioridad | Diagnóstico | Estado |
|---|---|---|---|
| CLI-D01 | **ALTA** | `/clientes/nuevo` hereda `guardPage(CLIENTES,VER)`; `GET /api/clientes?modo=catalogos` también exige VER, pero POST exige CREAR. Perfil CREAR-only no consigue completar alta via UI | ABIERTO |
| CLI-D02 | **MEDIA** | Vista VER-only muestra «Nuevo cliente», ficha editable y «Actualizar cliente» sin comprobar CREAR/EDITAR; API rechaza a posteriori | ABIERTO |
| CLI-D03 | **MEDIA** | Carrera de consultas de departamento/distrito sin invalidación (nuevo y editor); alta usa índice de array para opciones, índice reutilizado tras eliminar una dirección | ABIERTO |

**Observaciones sin defecto operacional demostrado:** CLI-D04 = antigua CLI-A05, listagem completa/aptitud global sin paginación SQL (riesgo de escala por medir); CLI-D05 = `window.confirm/alert` nativos, UX a padronizar después de la integridad/permiso. 

**Hallazgos históricos CLI-A01–A04:** implementaciones de referencia inactiva, actualización por versión 409, error de catálogo y protección de salida **ya están en código**; no reabrir sin regresión nueva. **CLI-A06:** helper SQL NEX-053 existe y su estado efectivo en PostgreSQL sigue sin comprobarse por esta auditoría; no presumir migrations en VM.

**Cobertura:** rutas list/detalle/alta, 6 endpoints de documentos y su política, `lib/clientes` relevante, migrations y pruebas consultadas; **sin ejecución DB, navegador o todos los flujos de extremo a extremo**. Se anotaron las zonas de riesgo verificables; no se declara que cualquier archivo del repo haya sido ejecutado o validado operacionalmente.

**Estado:** CORRECCIÓN SOLICITADA — NO HOMOLOGADO. No alterar código sin orden del responsable. Próximo menú previsto: **Proveedores**, por separado.


## XI. AUD-R02 — reauditoria independente de Clientes desktop, 18/10/2026

**Parecer atual:** [AUD-NEXIT-CLIENTES-DESKTOP-R02](../../testes/AUD-NEXIT-CLIENTES-DESKTOP-R02-2026-10-18.md). Auditoria estática, 1 ALTA **dependente de definição de RBAC** (CLI-D01), 4 MÉDIAS (CLI-D02/D03 e **novos CLI-D06/D07**); observações D04/D05. NÃO HOMOLOGADO.

**Integridade contra retrabalho:** blobs SHA de `clientes/page.tsx`, `clientes/nuevo/page.tsx`, `clientes/[id]/page.tsx`, `hijos.tsx`, `app/api/clientes/route.ts`, `app/api/clientes/[id]/route.ts`, `lib/clientes/relacionados.ts` e layout da área são idênticos ao corte R01 `fe9e64123`. Não reverter código de Clientes por confusão de repositório ou por commits documentais posteriores. `resolverInicio` do Dashboard agora reforça que papel só CLIENTES.CREAR sem outros privilégios iria a `/sin-acceso`; política de CREATE-only requer decisão do responsável antes de alterar ACL.

**Achados:**
- **CLI-D01 ALTA condicional:** POST admite CREAR, mas layout/GET catálogos exigem VER, e menu/landing não oferecem acesso à alta. Decisão explícita sobre perfis CREATE-only é pré-requisito; não conceder VER nem liberar lista por suposição.
- **CLI-D02 MÉDIA:** botões Nuevo/Actualizar e ficha editável para VER-only, servidor exige CREAR/EDITAR.
- **CLI-D03 MÉDIA:** consultas geográficas antigas em alta e editor podem sobrescrever opções atuais; alta indexa linhas por índice que muda na remoção.
- **CLI-D06 MÉDIA NOVA:** marcar outra direção como tipo Fiscal deixa a antiga com `tipo='FISCAL'` e `esFiscal=false`; serviço conta ambas como fiscais e rejeita gravação. Checkbox desmarcado com tipo fiscal é inefetivo.
- **CLI-D07 MÉDIA NOVA:** limite de crédito `numeric(18,4)` é convertido para `Number` e somado em JS na listagem; risco de apresentação monetária inexata.
- **D04/D05:** desempenho dependente de volume e diálogos nativos são observações, não correções automáticas. **CLI-A01…A04:** correções históricas preservadas. **CLI-A06/NEX-053:** migration versionada; estado PostgreSQL não verificado.

**Validação:** 0 testes executados pelo ChatGPT, sem PostgreSQL/browser/VM, sem prints; levantamento dirigido de rotas/serviços/SQL. Nenhuma implementação autorizada nem nova tarefa ao Claude. Próxima correção a considerar, após decisão humana: CLI-D06, seguida de CLI-D03, sem mexer em fiscais antigos ou no motor SIFEN.
