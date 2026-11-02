# AUD-NEXIT-CATALOGOS-PRODUCTOS-DESKTOP-R03 — Reauditoria independente de PRO-164 e PRO-165

**Data:** 19/10/2026. **Auditor:** ChatGPT. **Projeto:** NEXIT / ERP DistribuNex, somente desktop. **Repositório:** `proceit-tech/distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`. **SHA funcional auditado:** `394701480f6b2e6d4d307b20d9f4f99b2492c754`. **Pai:** `0f4a65d857c467fe86afb03ae1d6ce234642bc84`. HEAD da branch confirmado nesse SHA ao início da revisão.

## Parecer independente

**PRO-164 / CAT-D01 (ALTA) e PRO-165 / CAT-D02 (MÉDIA): CONFORMES EM AUDITORIA ESTÁTICA DIRIGIDA.** Ambos os achados da R02 foram corrigidos no recorte revisado. **Nenhum novo bloqueio corretivo demonstrável** no fluxo de concorrência de POST/PUT e de preservação do erro de mudança de estado. As correções anteriores CAT-A01…A06 e CAT-R02-01 permanecem preservadas, sem reimplementação de backend ou migrations.

**Maestros → Catálogos de productos: etapa de correções técnicas R02→R03 CONCLUÍDA ESTATICAMENTE no recorte, NÃO HOMOLOGADA.** Esta auditoria não substitui render/clicks React, navegador real, verificações SQL/PG concorrentes, teste HTTP integrado, VM, Docker, deploy, CI ou teste operacional humano. As tarefas devem permanecer `In Review`, não `Done`. A futura auditoria de **Maestros → Listas de precios** poderá ser iniciada mediante solicitação do responsável, sem declarar que Catálogos de productos foi homologado.

## 1. Fontes, escopo e commits

Consultados na branch atual `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, seções pertinentes de `PROGRESSO-NEXIT-V1.md`, relatório `documentacao/testes/AUD-NEXIT-CATALOGOS-PRODUCTOS-DESKTOP-R02-2026-10-19.md`, ficha `documentacao/v1/auditoria-por-menu/AUD-CATALOGOS-PRODUCTOS-V1.md`, descrição das tarefas Linear PRO-164/165/69, diff publicado e trechos relevantes de tela/helper/testes/contratos das APIs, versão e SQL histórico.

**Commit entregue pelo Claude: 4 arquivos; 152 adições / 25 remoções:**
- `app/(private)/productos/catalogos/page.tsx`: integra proteção de operação exclusiva e opção de recarga que preserva erro de ação;
- `lib/productos/catalogos-operacion.ts` (novo): `crearExclusion` e `ejecutarCambioEstado`;
- `lib/productos/catalogos-estabilizacion.casos.ts`: testes focais, ajustes de asserções estruturais existentes e remoção da pressuposição obsoleta de última migration NEX-053;
- `PROGRESSO-NEXIT-V1.md`: notas da implementação/testes.

O commit **não altera** `catalogos-admin.ts`, `catalogos-carga.ts`, rotas GET/POST/PUT, `catalogos-version.ts`, `catalogos-formulario.ts`, SQL histórico NEX-004/017/020/044 ou outros menus.

## 2. PRO-164 / CAT-D01 — ALTA — operações exclusivas em voo

**CONFORME ESTATICAMENTE.**

1. `crearExclusion()` implementa um estado privado `activa` e método `ejecutar`: a exclusão é adquirida sincronicamente antes de chamar `fn`, um segundo acesso devolve `ejecutada:false` sem executar callback, e `finally` libera a exclusão tanto em sucesso quanto em exceção.
2. `guardar(event)` impede reentrada com `exclusion.current.activa()` e executa a gravação, fechamento do formulário e recarga **dentro** de `exclusion.current.ejecutar`; `setOcupado(true/false)` permite desabilitar botões durante o POST/PUT e até o GET que segue. O formulário só é encerrado quando a gravação legítima retorna sucesso.
3. `cambiarTab` verifica a exclusão diretamente; abas recebem `disabled={ocupado}`. Controles Nueva, Editar, Cancelar e Activar/Inactivar estão desabilitados durante `ocupado` e têm guardas em seus handlers; `cambiarEstado` também verifica a exclusão e utiliza `ejecutar`. Isto impede, pelo fluxo normal de interação, que o PUT antigo de outra aba conclua depois de transição de contexto e lance `cargar()` com o `tipo` anterior.
4. A proteção anterior `crearCompuerta()` para respostas de GET obsoletas permanece. A proteção de alterações não salvas `useProtegerCambios(sucio)`, confirmações internas, `motivoBloqueoGuardar(estadoCarga)`, `cargaConfiable`, validação de campos e resposta 409 de CAS não foram retiradas. Não há simulação falsa de abortar mutação já enviada à API.

**Cobertura focal revista no código:** Promise PUT pendente, tentativas de contexto durante exclusão ativa, segundo POST/PUT vetado, sucesso libera e erro lança/libera; assert estrutural de ligação a todos os controles da UI. **Limitação:** testes de mudança de aba são feitos em modelo puro com `crearExclusion` e asserts de código, não na árvore React montada. Não afirmar que comportamento de cliques/roteamento foi homologado.

**Observação não bloqueante:** links externos à aba (por exemplo «← Productos» ou menu lateral) continuam dependentes do guard de rascunho existente, não de uma navegação transacional central que acompanhe gravações enviadas. O achado D01 cobria a troca de abas e ações da própria tela, cuja exclusão está implantada; não foi demonstrada mistura persistente de catálogos por navegação externa. Verificar UX de navegação durante salvamento em homologação real se necessário, sem expandir escopo automaticamente.

## 3. PRO-165 / CAT-D02 — MÉDIA — feedback de falhas PUT preservado

**CONFORME ESTATICAMENTE.**

1. A tela passa a aceitar `cargar({ preservarError?: boolean })`. O erro de ação `error` só é limpo na recarga quando `!opciones.preservarError`. Erros da lista principal e auxiliares seguem canais próprios `errorCarga` e `errorAuxiliar`; a compuerta mantém descarte de GET atrasado.
2. `ejecutarCambioEstado` em sucesso chama `alExito` e `recargar({preservarError:false})`. Em erro de PUT chama `alError` (mensagem do 409/403/500) e `recargar({preservarError:true})` **sem emitir aviso de sucesso**. `cambiarEstado` passa a delegar nesse helper, preservando `version:fila.version` e recarregando dados vigentes.
3. Novo retry/ação limpa `error` e `aviso` adequadamente; a troca de aba também limpa contexto. O erro de GET falho permanece distinto e bloqueia operações que precisem de carga confiável.
4. Testes novos usam a função `ejecutarCambioEstado` com chamadas simuladas PUT 409, 403, 500 → GET OK; PUT 409 → GET falho; retry PUT OK → aviso legítimo e erro limpo. Assert estrutural confirma repasse correto da opção para `cargar`. A ausência de render React e de requisição HTTP real limita o parecer.

## 4. Testes relatados e limites operacionais

**Claude informou, não reexecutado por ChatGPT:**
- `catalogos-estabilizacion`: **54 verificações / 0 falhas**, 11 novas;
- `jerarquia-catalogos`: **52 verificações / 0 falhas**;
- checagem pontual ESLint e tipos dos arquivos tocados: OK;
- quatro asserções estruturais ajustadas ao novo markup; asserção de última migration atualizada para reconhecer NEX-064/NEX-065, sem editar migrations ou rodar SQL.

Os novos testes de `crearExclusion` e `ejecutarCambioEstado` exercitam as funções de produção por simulação de promessa; o encaixe em `page.tsx` é verificado estruturalmente. **Auditor não executou tests/tsc/lint/build, navegador, React, HTTP real, PostgreSQL, VM, Docker, SQL/migrations, CI, deploy ou suíte global.** Não atribuir cobertura end-to-end.

## 5. Antecedentes, observações e status

- **CAT-A01…A06 e CAT-R02-01:** aceitos nas auditorias anteriores, sem alterações de backend/SQL neste commit. `CAT-A06` depende de CAS `actualizado_at` microssegundos com advisory lock por empresa/tabela, sem prova de concorrência real no PostgreSQL.
- **CAT-012:** Categoria→Família→Linha, Marca separada, histórico sem categoria não reclassificado em silêncio; referências históricas de próprios produtos preservadas; nenhuma cascata de inativação criada.
- **Observações não bloqueantes da R01:** corrida pai ativo→filho requer ensaio PG antes de afirmar defeito; erro com draft e necessidade de recuperação interna sem perder rascunho merece validação em navegador; listagem completa/paginação local não tem medições de escala. Nenhuma migration nova autorizada.
- **Linear PRO-164 / PRO-165 / PRO-69:** `In Review`, aceite estático e **NÃO HOMOLOGADO**; não marcar `Done`.
- **Próxima etapa:** o responsável pode iniciar o menu **Maestros → Listas de precios** como auditoria independente, sem confundir conclusão corretiva estática deste menu com homologação operacional. Não iniciar outro menu automaticamente.
