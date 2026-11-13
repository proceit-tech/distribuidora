# AUD-NEXIT-PROVEEDORES-DESKTOP-R03 — Reauditoria independente do commit 2be47f2

**Data:** 2026-10-19. **Auditor:** ChatGPT. **Sistema:** ERP NEXIT / DistribuNex, desktop, `proceit-tech/distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`.

**SHA funcional auditado:** `2be47f21da2536872152d849e9b4373f19bd1c2c`, pai `5115ff7abda64fba941478c12daed804f0125a89`; branch apontava ao SHA ao iniciar a reauditoria. **Commit alterou 20 arquivos** (1194 linhas adicionadas e 862 excluídas segundo metadata GitHub), inclusive extração de listagem para componente próprio; a anotação «Editou 2 arquivos» recebida no chat não corresponde ao commit remoto.

**Parecer:** **CORREÇÃO REQUERIDA — PRV-R03-01 ALTA (autorização indevida de leitura por CREAR-only) + PRV-R03-02 MÉDIA (retry geográfico indisponível para perfil somente leitura)**. As implementações de navegação PRV-D01, apresentação de ações PRV-D02 e tratamento de HTTP PRV-D03 estão presentes e substancialmente **conformes estaticamente**, mas a finalidade segura de `GET /api/proveedores` não está fechada. **Proveedores NÃO ENCERRADO / NÃO HOMOLOGADO.**

## 1. Verificação da entrega e fontes

- Revisitados `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, `documentacao/testes/AUD-NEXIT-PROVEEDORES-DESKTOP-R02-2026-10-19.md` e a ficha canônica `documentacao/v1/auditoria-por-menu/AUD-PROVEEDORES-V1.md`.
- Inspecionados metadata/diff integral do commit, código efetivo de `app/(private)/proveedores/{layout,page,nuevo/{layout,page},[id]/layout}`, `_components/{listado-proveedores,proveedor-form,retomar-alta,campos,contexto}`, `_components/pestanas/{bancos,direcciones,homologacion,panel-gobernanza,documentos,resolucion-cuenta,reactivar-cuenta}`, `app/api/proveedores/route.ts`, `app/api/proveedores/[id]/route.ts`, `lib/proveedores/{cliente-api,geografia-catalogo,proveedores-r02.casos}`, `lib/navigation/menu.ts`.
- Comparação dirigida **original `proveedores/page.tsx` (pai) × `_components/listado-proveedores.tsx` (commit)**: conteúdo de listagem e filtros preservado, com diferenças observadas na mudança de caminho de CSS, nome/props do componente e condições de botões/mensagens `puedeCrear`.
- Sem execução dos testes de Claude por ChatGPT, sem requisições HTTP reais, React/navegador, PostgreSQL, VM, Docker, migrações, build, tsc/lint global ou CI manual. Cobertura do Claude apresentada: `proveedores-r02.casos.ts` 23/0, regressões `estabilizacion` 39/0, `proveedores` 190/0, `gobernanza` 102/0, `documentos` 113/0, `cuentas-auditoria` 48/0, `reactivacion` 53/0, ESLint/types isolados. **Esses resultados foram informados, não reproduzidos**. Teste focal usa verificações estruturais/regex e controlador geográfico puro; não simula GET real com sessão.

## 2. Matriz de aceite estático do escopo PRV-D01/02/03

| Item | Evidências e parecer |
|---|---|
| **PRV-D01 ALTA — CREAR-only** | Layout pai aceita `VER || CREAR`; layouts `nuevo` e `[id]` separados exigem respectivamente `CREAR` e `VER`; página lista server-side exige VER; menu V1 apresenta «Nuevo proveedor» só ao CREAR-only e `resolverInicio` fornece `/proveedores/nuevo`; GET catálogo comunica `permisos.ver` da sessão; conclusão CREATE-only ocorre somente após confirmação `cierre.cerrada`, tanto alta quanto `RetomarAlta`, mostra «Proveedor registrado» e novo cadastro; usuário VER regressa à lista, sem links indevidos. **CONFORME estaticamente na UI, MAS NÃO FECHADO pela violação de autorização da API PRV-R03-01.** |
| **PRV-D02 MÉDIA — edição comum vs ações próprias** | CTAs Novo no cabeçalho e vazio seguem `puedeCrear` calculado no `guardPage` server-side. `soloLectura` vem de `initial.permisos.editar` da API, `submit` retorna sem EDITAR; `Bloque` desabilita informações, compras, contatos, direções, retenções e campos de contas. `PanelGobernanza`, `ResolucionCuenta`, `ReactivarCuenta`, `PestanaDocumentos` ficam deliberadamente fora do bloqueio com permissões próprias. **CONFORME estaticamente**, ressalvado retry da geografia em ficha VER-only (PRV-R03-02); sem navegador. |
| **PRV-D03 MÉDIA — catálogo geográfico** | `leerCatalogo` distingue HTTP 200 dados vazios de HTTP 401/403, erro 500/502, falha de rede/JSON; `crearCargaCatalogo` usa tokens por pedido e `invalidar` no cleanup; `Geografia` conserva chave vigente, mostra `role='alert'` e `Reintentar`. **CONFORME na classificação e descarte de respostas**; retry inacessível no perfil VER-only pelo bloqueio de edição, ver PRV-R03-02. |

## 3. Achados R03 pendentes

### PRV-R03-01 — ALTA — CREAR-only lê fornecedores ao enviar `catalogo` vazio

**Prova de caminho no código atual:**
1. `app/api/proveedores/route.ts:156–164` recebe GET e, quando `PROVEEDORES.VER` é negado, concede exceção a quem tem CREAR se `url.searchParams.get('modo') === 'catalogos' || url.searchParams.has('catalogo')`. `has('catalogo')` é **verdadeiro mesmo para `?catalogo=` ou `?catalogo` sem valor**.
2. `:81–85` `catalogoGeografico` faz `const catalogo=url.searchParams.get('catalogo'); if (!catalogo) return null;`. Para o parâmetro vazio, devolve `null` em vez de resposta geográfica/400.
3. `:168–176` após esse `null`, `soloCatalogos` é **false** quando não foi enviado `modo=catalogos`; nesse caso executa consulta `SELECT ... FROM proveedores p ... WHERE p.empresa_id=$1`.
4. `:285–296` devolve `proveedores: proveedores.rows` no JSON. O tenant continua restrito pela empresa da sessão (não há demonstração de vazamento cross-company), mas o papel CREAR-only ganha leitura da carteira de fornecedores sem `PROVEEDORES.VER`, contrariando contrato explícito PRV-D01.
5. **Exemplos de reprodução lógica sem banco:** `GET /api/proveedores?catalogo=` e `GET /api/proveedores?catalogo=&modo=lista`, autenticado como ator com somente PROVEEDORES.CREAR. Código do problema precede o commit atual, mas a reauditoria independente de PRV-D01 deve registrá-lo e bloquear a conclusão.
6. `lib/proveedores/proveedores-r02.casos.ts` atualmente trata o predicado inseguro `url.searchParams.has('catalogo')` como assert positivo, sem testar o valor vazio nem fluxo de retorno de fornecedores. Suíte 23/0 não comprova a autorização negativa da API.

**Correção mínima esperada (somente sob ordem específica do responsável):** classificar finalidade do GET antes de conceder exceção, com uma allowlist efetiva de `modo=catalogos` e catálogos geográficos **válidos, não vazios**; somente nessas finalidades oferecer `PROVEEDORES.CREAR` como alternativa a VER. Qualquer GET que possa devolver fornecedores deve exigir VER. Parâmetros vazios, desconhecidos e combinações inconsistentes devem dar HTTP 400 ou 403, conforme contrato, **nunca a listagem completa para CREATE-only**. Não conceder VER, não mudar regras de consulta cross-company, nem trocar migrations/SQL. Adicionar teste dirigido que simule autorização, escolha de finalidade e ausência de `proveedores.rows` em `?catalogo=` / `?catalogo=&modo=lista`, além do caminho normal `?modo=catalogos` e `?catalogo=distritos&departamento=1`.

### PRV-R03-02 — MÉDIA — botão «Reintentar» de consulta geográfica desabilitado no perfil VER-only

- `app/(private)/proveedores/_components/proveedor-form.tsx` envolve `<PestanaDirecciones ctx={ctx}/>` em `<Bloque bloqueado={soloLectura}>` para ficha sem `PROVEEDORES.EDITAR`.
- `_components/campos.tsx` implementa `Bloque` com `<fieldset disabled={bloqueado}>`.
- `pestanas/direcciones.tsx` renderiza `<ErrorGeo>` dentro de `PestanaDirecciones`; seu botão de leitura `<button type='button'>Reintentar</button>` é **descendente do fieldset disabled**. Logo o operador que só possui VER, mas recebe erro de conexão/serviço ao visualizar dados geográficos, vê um botão de retry que não pode acionar.
- Trata-se de leitura de catálogo (sem alteração da ficha), diferente de edição comum. A correção deve preservar o bloqueio dos campos de endereço, mas deslocar a ação de retry fora do fieldset desabilitado, ou exibir tratamento coerente para modo consulta sem botão impossível. **Não habilitar alterações de endereço nem permissões especiais**. Teste focal de estrutura/DOM de ficha VER-only: campos desabilitados, erro acessível, retry ativo somente como requisição GET, sem alterar payload nem campos.

## 4. Preservações e limites

- PRV-M01–M04, PRV-R01-01…05, recuperação de ID em URL, fechamento idempotente, históricos de bancos/documentos, governança e limites de tenant continuam no código; nenhum desses serviços foi alterado no commit.
- Não supor que NEX-034…037 estão ou não aplicadas na VM. Observações PRV-O01 (política de visibilidade bancária), O02 (paginação com volume real), O03 (diálogo browser), O04 (ledger de DB) continuam não bloqueantes e **fora desta autorização de implementação**.
- Projeto exclusivamente desktop. Não executar testes longos/global, build/tsc/ESLint global, CI manual, VM, PostgreSQL, Docker ou deploy por IA.

## 5. Parecer e continuidade

**PRV-D01–D03 implementados no recorte funcional e conformes parcialmente em inspeção estática, mas o menu permanece ABERTO por PRV-R03-01 ALTA e PRV-R03-02 MÉDIA. Não declarar homologação.** Claude somente poderá corrigir esses resíduos mediante ordem expressa do responsável; limitar mudanças a API/autorização da finalidade GET e tratamento de retry de catálogo, testes focais curtos, commit e push, parar. ChatGPT fará **AUD-NEXIT-PROVEEDORES-DESKTOP-R04** do SHA posterior. **Não iniciar Productos automaticamente.**
