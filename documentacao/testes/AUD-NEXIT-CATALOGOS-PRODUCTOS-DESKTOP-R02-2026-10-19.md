# AUD-NEXIT-CATALOGOS-PRODUCTOS-DESKTOP-R02 — Revalidação independente do menu

**Data:** 19/10/2026. **Sistema:** NEXIT / ERP DistribuNex, exclusivamente desktop. **Auditor:** ChatGPT. **Repositório:** `proceit-tech/distribuidora`. **Branch:** `feature/NEXIT-2026-001-banco-demo`. **HEAD de corte:** `7035cd19ec278b2abe02d1e1f8d035017278acc7`. **Snapshot anterior:** `cb35cb35bda7179e09db683e48fdf104867f5f2a` (R01 de 18/10/2026).

**PARECER:** **CAT-D01 ALTA e CAT-D02 MÉDIA CONFIRMADOS, AINDA ABERTOS.** Menu **NÃO HOMOLOGADO**, 0 testes executados pelo ChatGPT nesta rodada. Não houve modificação de código funcional, API, SQL nem migrations pelo auditor. As correções históricas CAT-A01…CAT-A06 e CAT-R02-01 continuam presentes no código atual e não precisam ser reimplementadas.

## 1. Fontes, cobertura e verificação de versão

Consultados no GitHub: `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` (trechos de Catálogos e contexto), `documentacao/testes/AUD-NEXIT-CATALOGOS-PRODUCTOS-DESKTOP-R01-2026-10-18.md`, `documentacao/v1/auditoria-por-menu/AUD-CATALOGOS-PRODUCTOS-V1.md` (§§I–IX), código das quatro abas, APIs e helpers relacionados.

**Verificação objetiva de persistência dos defeitos:** SHA de blob **idêntico** entre R01 e HEAD atual para:
- `app/(private)/productos/catalogos/page.tsx` — `e221b39008592f18329a37c44ea47ccd744b5f65`;
- `lib/productos/catalogos-admin.ts` — `baf37af922bdc888f0211729e09cafafd976ddf5`;
- `lib/productos/catalogos-carga.ts` — `bd0dfe857a0de418b008e096f3109aca58b0a133`;
- `lib/productos/catalogos-estabilizacion.casos.ts` — `60a7fb54eada7d3ab42a60ce916f18f836025ba4`;
- `lib/productos/catalogos-version.ts`, `catalogos-formulario.ts` e migration `NEX-020` também idênticos.

Examinados `page.tsx` (abas, `cargar`, `cambiarTab`, `guardar`, `cambiarEstado`, rascunho, lista, filtros, estados e controles), `catalogos-carga.ts` (respostas HTTP e token de GET), `catalogos-admin.ts` (GET/POST/PUT, autorização, empresa da sessão, advisory lock e CAS de versão), `catalogos-version.ts`, `catalogos-formulario.ts`, wrappers `app/api/productos/{categorias,marcas,familias,lineas}/{route.ts,[id]/route.ts}`, `app/(private)/productos/catalogos/layout.tsx` (VER), testes focais e contratos SQL `NEX-004/017/020/044` de hierarquia/grants. **Nenhuma execução real** de navegador/React, requisição HTTP, PostgreSQL/VM/Docker, SQL/migrations, suíte global, build, lint, tsc ou CI.

A R02 é confirmação **dirigida** dos defeitos pendentes, não certificação exaustiva de todas as telas/DDL do sistema.

## 2. Matriz dos achados abertos

### CAT-D01 — ALTA — operação de salvar pode destruir contexto de outra aba e abrir lista cruzada

**Evidência do código atual:**

1. `app/(private)/productos/catalogos/page.tsx`, `guardar`: `setGuardando(true)` seguido de `await enviar(POST|PUT)`; no sucesso chama **incondicionalmente** `setAviso`, `cerrarFormulario()` e `await cargar()`. A função `cargar` é um callback que fecha sobre `tipo` de quando a operação começou.
2. `cambiarTab` não verifica `guardando`, e botões das quatro abas ficam ativos durante a gravação; confirmação de descarte de rascunho **não interrompe** o POST/PUT que já saiu para a API.
3. `Nueva`, `Cancelar`, `Editar`, `Activar/Inactivar` também podem acionar nova interação enquanto a gravação anterior está pendente; apenas submit tem `disabled={guardando || !confiable}`.
4. `cargar()` faz `compuerta.current.nueva()`: protege GET contra **GET anterior**, mas um `cargar()` da aba antiga iniciado **depois** de terminar PUT antigo pode receber token mais recente que a carga da aba atual, sobrescrevendo `filas`, `permisos`, `familias` e `categorias`.

**Exemplo:** editar Categoría A, clicar Guardar (PUT lento), trocar para Marcas e confirmar descarte, abrir Marca B; PUT antigo termina, fecha o formulário B e chama `cargar()` de Categorías, que pode substituir dados mostrados sob a aba Marcas.

**Aceite exigido:** fazer da gravação uma operação exclusiva para os controles que mudam contexto, **ou** invalidar geração de efeitos tardios sem fingir cancelamento do PUT já enviado. Na solução mínima, bloquear troca de aba, Nueva/Editar/Cancelar/Activar/Inactivar durante `guardando`, impedir que callback tardio de aba velha emita novo GET que se torne vigente e assegurar que nenhum formulário/draft atual seja fechado por operação alheia. Proteger também contra acionamento duplo de POST/PUT em handlers e preservar respostas 409/erros do formulário. **Testar fluxos dirigidos com promessa de PUT pendente + tentativa de mudar aba, abrir/cancelar outro registro e ativar/inativar; nenhuma mistura de `filas/permisos` ou perda de rascunho; após fim, ações legítimas continuam.** Sem alterar SQL, auth, outros menus ou migrações.

### CAT-D02 — MÉDIA — erro de ativação/inativação desaparece depois do refresh

**Evidência do código atual:**

1. `cambiarEstado` apaga `error`, tenta PUT e, em `catch`, executa `setError(mensaje)` seguido imediatamente por `await cargar()` para obter o registro vigente.
2. `cargar()` faz `setError("")` no início do GET.
3. A mensagem de erro da ação (409 de versão obsoleta, 403 ou 500) pode desaparecer durante o refresh, sem que a pessoa saiba por que o estado não mudou. `errorCarga` guarda falha de consulta, mas é canal diferente e não conserva o erro da ação.

**Aceite exigido:** separar erro de mutação e erro da consulta, ou permitir `cargar({preservarErrorAccion:true})`; manter mensagem de ação visível após refresh bem-sucedido ou falhado, até nova ação/retry explícito ou mudança de contexto. Preservar recarga do estado atualizado sem sucesso enganoso, manter 409 gerado pelo CAS, 403/500 e token de versão real. **Testes focais:** PUT 409/403/500 → GET OK e GET erro; verificar erro da ação ainda visível; novo retry/sucesso limpa ou substitui aviso apropriadamente. Não repetir suites completas.

## 3. Antecedentes preservados, sem nova tarefa

- `CAT-A01 / R02-01`: `cargarCatalogoCompleto` verifica HTTP/shape principal e auxiliares, `cargaConfiable` impede formulário criar/editar/salvar com erro, permissões antigas são neutralizadas. GET apenas `PRODUCTOS.VER`, POST `PRODUCTOS.CREAR` e PUT `PRODUCTOS.EDITAR`; empresa da sessão no backend.
- `CAT-A02`: `crearCompuerta` evita GET anterior sobrescrever outro GET, ressalva CAT-D01 de **PUT + GET posterior**.
- `CAT-A03`: `useProtegerCambios` e `confirmarDescarte` para rascunhos; não cobre gravação já em voo.
- `CAT-A04`: referências históricas inativas do próprio produto continuam preservadas por associação empresarial, sem catálogo inativo global para escolha nova.
- `CAT-A05`: `nFamilias/nLineas` reais usados no aviso antes de inativar categoria; nenhuma cascata ou reclassificação automática.
- `CAT-A06`: token de `actualizado_at` em microssegundos UTC, PUT sob `pg_advisory_xact_lock` empresa+tabela, leitura/comparação de versão sob transação e `FOR UPDATE` onde autorizado, retorno HTTP 409. A execução de concorrência real em PostgreSQL não foi comprovada.
- Hierarquia definida CAT-012: **Categoría → Familia → Línea**, Marca independente; legados sem categoria não são reclassificados automaticamente; não modificar NEX-004/017/020/044 históricos.

## 4. Observações não bloqueantes e pendências reais de homologação

- Testar depois com PG real a concorrência entre mudança de estado do pai e alta de filho, que hoje apenas verifica `activo` no SELECT, sem prova de corrida violada; não lançar migration sem resultado real.
- A recuperação de falha em catálogo com formulário sujo pode exigir refresh que perde o rascunho; melhoria UX possível, ainda não defeito reproduzido.
- GET traz todas as filas por empresa, com paginação local a 20; não há medição para exigir paginação SQL. Não reabrir nem prometer mudança.
- Avisos `window.confirm` existem; não exigir adaptação mobile. Avaliação visual desktop, foco e acessibilidade no navegador ficam com o responsável.

## 5. Governança e próximo passo

- **CAT-D01 alta e CAT-D02 média devem ser cadastrados em Linear como subtarefas de PRO-69** (`Todo`). A PRO-69 permanece `In Review`, mas com bloqueios corretivos documentados.
- Não executar correções automaticamente: Claude implementa **somente quando o responsável autorizar**, lê protocolos e progresso e corrige essas duas issues com testes curtos. Claude não edita documentos `AUD-*`; faz commit/push e para. ChatGPT fará AUD-R03 independente. Responsável faz homologação operacional real.
- Nenhuma mudança funcional feita nesta auditoria. Não iniciar Listas de precios ou outros menus automaticamente. **MENU CATÁLOGOS DE PRODUCTOS NÃO ENCERRADO E NÃO HOMOLOGADO.**
