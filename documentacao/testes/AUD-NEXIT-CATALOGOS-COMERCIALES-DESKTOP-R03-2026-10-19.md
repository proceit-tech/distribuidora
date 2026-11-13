# AUD-NEXIT-CATALOGOS-COMERCIALES-DESKTOP-R03 — Reauditoria independente PRO-173, PRO-174 e PRO-175

**Data:** 19/10/2026. **Auditor:** ChatGPT. **Sistema:** NEXIT / ERP DistribuNex — somente desktop. **Repositório:** `proceit-tech/distribuidora`. **Branch:** `feature/NEXIT-2026-001-banco-demo`. **Commit funcional:** `c35fbcde113de8d3988d3accd0045ae8425cf5b4`, **pai:** `22175a77b56f08b6625c30676dd5a61f1cd486f1`. **HEAD conferido:** SHA funcional na abertura da auditoria.

## 1. Parecer executivo

**PRO-175 / CC-D03: CONFORME em auditoria estática dirigida.**
**PRO-173 / CC-D01: CONFORME no caminho autorizado de alta CREAR-only e isolamento de consulta, com desvio residual CC-R03-02 BAIXA (HTTP 403 em vez de 400 para query inválida sob CREAR-only).**
**PRO-174 / CC-D02: CONFORME quanto a exclusão de mutações, troca de abas e chamadas obsoletas no fluxo revisado, com defeito residual CC-R03-01 MÉDIA: campos continuam editáveis durante POST/PUT e mudanças posteriores ao envio podem ser descartadas ao confirmar sucesso.**

**Maestros → Catálogos comerciales NÃO HOMOLOGADO e ainda com dois ajustes técnicos residuais.** Não houve mudança funcional pelo auditor, nenhuma task Done e não se afirma teste real de React, HTTP ou PostgreSQL. O relato do Claude de ausência de decisão funcional bloqueante é compatível com o código examinado: os dois resíduos são técnicos/UX, sem decisão de política para abrir mais informações.

## 2. Fontes, diff e alcance

Consultados no GitHub: `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, seções pertinentes de `PROGRESSO-NEXIT-V1.md`, ficha `documentacao/v1/auditoria-por-menu/AUD-CATALOGOS-COMERCIALES-V1.md`, `documentacao/testes/AUD-NEXIT-CATALOGOS-COMERCIALES-DESKTOP-R02-2026-10-19.md`, descrições Linear PRO-173/174/175/71, metadados/diff completos do commit e a versão atual dos arquivos de tela, GET/API e helpers relacionados.

**Commit funcional:** 1.271 adições e 734 exclusões, com extração da página listada para `app/(private)/catalogos-comerciales/_components/catalogos-comerciales.tsx`. Arquivos novos: `lib/comercial/acceso-get.ts`, `app/(private)/catalogos-comerciales/nuevo/{layout,page}.tsx`, `app/(private)/catalogos-comerciales/_components/catalogos-comerciales.tsx`. Alterados `app/(private)/catalogos-comerciales/{layout,page}.tsx`, `lib/comercial/{carga,servidor,estabilizacion.casos}.ts`, `lib/navigation/menu.ts`, `lib/listas-precio/listas-comerciales.casos.ts`, `PROGRESSO-NEXIT-V1.md`. Sem novas migrations, scripts SQL, preço comercial, inventário ou SIFEN.

**Testes informados pelo Claude e inspecionados por leitura, não reproduzidos pelo ChatGPT:** `comercial/estabilizacion` **63/0** (18 novos); regressões `comercial` **61/0**, `listas-comerciales` **93/0**, `listas-r02` **40/0**, `catalogos-estabilizacion` de Productos **54/0**; ESLint e tipos pontuais aprovados conforme o executor. Os testes exercitam helpers reais (`crearExclusion`, `crearCompuerta`, carregamento, finalidade GET) com promessas e fetch simulados; conexão com botões/handlers React por inspeção/regex. **ChatGPT executou 0 testes**, sem browser/React montado, eventos nativos, HTTP real, PostgreSQL, VM/Docker, SQL/migrations, suíte global, build/lint/tsc global, CI manual ou deploy.

## 3. PRO-173 / CC-D01 — alta CREAR-only e catálogo mínimo

**Aceite estático da rota de alta e isolamento de dados:**
- `catalogos-comerciales/layout.tsx` aceita `LISTAS_PRECIO.VER` **ou** `LISTAS_PRECIO.CREAR`; `catalogos-comerciales/page.tsx` protege o listado com `guardPage("LISTAS_PRECIO","VER")`; `nuevo/layout.tsx` protege alta com `guardPage("LISTAS_PRECIO","CREAR")`.
- `nuevo/page.tsx` usa POST autorizados para tipos de câmbio/canal/zona, catálogo mínimo `tipos-cambio?modo=monedas`, confirma sucesso com «Registrar otro» e só exibe link ao listado quando `permisos.ver=true`. Menu oferece «Nuevo catálogo comercial» aos usuários CREAR-only sem VER.
- `lib/comercial/acceso-get.ts` define `finalidadComercial`; `lib/comercial/servidor.ts` consulta somente `SELECT codigo,nombre,simbolo FROM monedas WHERE activo=true AND codigo<>'PYG'` no modo mínimo, além do booleano VER da sessão. Não retorna histórico, filas de cotação/canais/zonas, Clientes, Listas ou custos nesse modo.
- Servidor `preparar("VER_O_CREAR")` permite somente essa finalidade mínima a CREAR-only; GET normal/histórico continua VER; POST continua CREAR e PUT/anular continuam EDITAR. Empresa nos POST é derivada da sessão; registros não são buscados de outra empresa.
- **Ressalva CC-R03-02 BAIXA:** o helper `finalidadComercial` devolve `INVALIDA` para `?modo=monedas&historial=1` e `?modo=monedas&modo=monedas`; porém `listarCambios` executa primeiro `preparar(finalidade==="MONEDAS" ? "VER_O_CREAR":"VER")`. Para CREAR-only sem VER, `preparar("VER")` devolve 403 e a checagem `if(finalidade==="INVALIDA") return ...400` não é alcançada. No perfil com VER, invalidação devolve 400. **Não há vazamento de dados** nem permissão indevida; quebra o contrato de erro HTTP uniforme prometido para modo inválido e pode confundir cliente/teste. Critério: depois de estabelecer sessão válida, reconhecer query inválida e devolver 400 sem permitir acesso à finalidade mínima; manter 401 para anônimo, 403 para GET de listado ao perfil sem VER, e nenhuma liberação de dados ou chamada DB desnecessária. Testar rota/função que efetivamente decide o status, não apenas helper puro.

## 4. PRO-174 / CC-D02 — exclusão de mutações

**Aceite estático principal:** `_components/catalogos-comerciales.tsx` reutiliza `crearExclusion` com aquisição síncrona nos handlers `guardar`, `cambiarEstado`, `anular`; blocos se mantêm até `cargar()` pós-gravação e são liberados via `finally` no sucesso/erro. `cambiarTab`, botões Nuevo, Editar/Corregir/Cancelar/Anular/Activar/Inactivar e seletor `historial` têm guardas e/ou desabilitação durante `ocupado`; `crearCompuerta` continua impedindo GET antigo de vencer GET posterior por geração. Dado esse bloqueio de troca de contexto no fluxo de tela, o callback tardio de aba antiga não fecha ficha de outra aba. POST/PUT já enviado não é falsamente cancelado. Versionamento microsegundos, 409, formulário após erro, `useProtegerCambios`, confirmações de dependência e histórico preservados.

**Defeito residual CC-R03-01 MÉDIA — digitação durante POST/PUT pode ser perdida:**
1. Em `_components/catalogos-comerciales.tsx`, `guardar()` constrói `cuerpo` com os valores da renderização em que o operador clicou Guardar, chama `await enviar(...)`, e após HTTP OK faz `cerrar()`. Mas os campos dentro do formulário — `CampoFecha`, `select`, inputs `cambio/motivo/codigo/nombre` — continuam **sem `disabled={ocupado}`**, e `actualizar(campo,valor)` não verifica `exclusion.current.activa()`.
2. Sequência: operador grava Canal com nome A, servidor está lento; durante o PUT, digita nome B no mesmo campo ainda ativo. O corpo enviado continua nome A. Quando o PUT A confirma, `cerrar()` desmonta o formulário contendo B **sem aviso e sem salvar B**. A exclusão bloqueia novos contextos/mutações, mas não bloqueia **edição de campos do próprio formulário em voo**. O formulário da rota `nuevo/page.tsx` tem a mesma possibilidade: campos editáveis enquanto POST; em sucesso troca para confirmação, abandonando valores digitados depois do envio.
3. **Aceite focal:** durante POST/PUT, desabilitar edição dos campos do formulário e proteger `actualizar` com a exclusão, tanto no listado quanto na rota de alta. Antes de enviar, campos normais seguem editáveis. Em erro HTTP, reabilitar mantendo rascunho original, validações e 409; em sucesso, fechar/confirmar sem descartar edições feitas durante envio (pois não devem ser admitidas). Não impedir seleção/edição autorizada fora do período exclusivo nem mexer no backend. Testar com promessa lenta, simular tentativa de digitação durante lock, sucesso, 409, liberação e validação. Browser não foi executado: trata-se de risco demonstrado pela combinação de callbacks e campos ativos, não de observação no ambiente.

## 5. PRO-175 / CC-D03 — moedas obrigatórias

**CONFORME ESTATICAMENTE:**
- `lib/comercial/carga.ts`, quando `clave==="tiposCambio"`, exige `monedasValidas(j.monedas)`: presente, array mesmo vazio, itens objetos com `codigo` string; null/string/objeto/ausência ou item sem codigo geram erro/filas vazias/permissões falsas.
- `_components/catalogos-comerciales.tsx` no erro de carga zera filas, permissões **e moedas**; mantém `form` digitado e exibe botão `Reintentar`. Sem carga confiável, não oferece mutações. `Canales/Zonas` não exigem moedas. Endpoints normais de câmbio continuam retornando moedas.
- Testes focais do Claude cobrem payload malformado 200, moedas vazias e válidas, 403/500, recuperação e assert estrutural da ligação; navegador e HTTP integrados não testados. Nenhuma regressão demonstrada nesse recorte.

## 6. Preservações e continuidade

**Não reabrir sem regressão:** CC-A01…A07/CC-R03-01 (locks/versionamento e 409 em Canal/Zona, proteção de rascunho, compuerta GET, carga segura 401/403/500, decimal exato `numeric(18,6)`, reversão NEX-045 dependências, vínculos de Clientes/Listas/Reglas). Política de cotação 100% manual, versão imutável e anulação lógica sem DELETE; motivo opcional; nenhuma conversão automática de câmbio nos preços. Nada no diff autoriza migração nova ou mudanças de permissionamento amplas.

**Linear:** PRO-173 deve ficar `In Review` com ressalva de contrato HTTP até CC-R03-02; PRO-174 `In Review` com pendência CC-R03-01; PRO-175 `In Review` aprovado estaticamente. Criar **duas subtarefas distintas de PRO-71 em Todo**: CC-R03-01 MÉDIA (editar durante gravação) e CC-R03-02 BAIXA (status 403/400 de query inválida). PRO-71 `In Review` / **NÃO HOMOLOGADO**, etapa técnica ainda com resíduos. Nenhuma tarefa Done.

**Sem autorização automática:** Claude só recebe correção focal se o responsável solicitar; somente testes curtos e check pontual, commit/push/parada para AUD-R04 independente. O responsável humano deve homologar browser, HTTP e PostgreSQL depois. Não avançar a Inventario ou outro menu automaticamente.
