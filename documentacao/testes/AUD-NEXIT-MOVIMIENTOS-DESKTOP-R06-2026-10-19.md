# AUD-NEXIT-MOVIMIENTOS-DESKTOP-R06 — Reauditoria independente PRO-184 / MOV-D03

**Data:** 19/10/2026. **Auditor:** ChatGPT. **Produto:** NEXIT/DistribuNex V1, exclusivamente desktop.  
**Repositório:** `proceit-tech/distribuidora`. **Branch oficial:** `feature/NEXIT-2026-001-banco-demo`.  
**Commit funcional auditado/HEAD confirmado:** `d67e2a7e0f6f8865ef3aaa6f25991ce874edcc3a` ([GitHub](https://github.com/proceit-tech/distribuidora/commit/d67e2a7e0f6f8865ef3aaa6f25991ce874edcc3a)).  
**Predecessora:** [AUD-NEXIT-MOVIMIENTOS-DESKTOP-R05](./AUD-NEXIT-MOVIMIENTOS-DESKTOP-R05-2026-10-19.md). **Tarefa:** [PRO-184](https://linear.app/proceit/issue/PRO-184).

## 1. Veredito

**PRO-184 / MOV-D03: PARCIALMENTE CONFORME — 1 REGRESSÃO MÉDIA CORRETIVA (MOV-R06-01). NÃO ACEITO ESTATICAMENTE COMO CONCLUÍDO.**

O objetivo original — evitar perda de rascunho na passagem de D para D+1 em America/Asuncion — está atendido no fluxo de formulário **já inicializado**: `hoyInicial` permanece estável, o carregamento não depende da data, e a validação usa `hoyAsuncion()` no momento do envio. Não há alterações de K1, snapshot, idempotência, motor SQL, APIs nem histórico. **Porém, ao proteger a edição anterior à chegada do catálogo, a página passou a descartar também o próprio catálogo válido e fica permanentemente em carregamento.** O cenário tem caminho real pela interface, pois há inputs de texto ativos antes de carregar catálogos.

**PRO-79 Movimientos mantém In Review e NÃO HOMOLOGADO; PRO-184 não recebe aceite técnico até corrigir o achado.** MOV-D01/PRO-182/185/186 e MOV-D02/PRO-183 continuam com aceites estáticos dirigidos anteriores; MOV-O07 (K1 se perde ao abandonar a página indeterminada) segue risco operacional conhecido.

## 2. Escopo da revisão e invariantes

Lidos a branch/commit/diff e os arquivos atuais `app/(private)/movimientos/nuevo/page.tsx`, `lib/movimientos/inicializacion.ts`, `lib/movimientos/inicializacion.casos.ts`, `lib/movimientos/formulario.ts`, `lib/inventario/movimientos.casos.ts`, `scripts/casos-clientes/run.js`, partes pertinentes de `PROGRESSO-NEXIT-V1.md`, `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, fichas de menu e AUD-R05; conferida a tarefa no Linear. O commit funcional altera **6 arquivos:** novo helper, testes, novo/page.tsx, caso estrutural de Inventario, runner e progresso.

**Pontos conformes:**
- `nuevo/page.tsx:36–43,69–88`: `hoyInicial` com `useState(() => hoyAsuncion())`; carga de catálogos depende de `intentoCarga`, não de data corrente nem renderização. Isso elimina o gatilho original da MOV-D03.
- `nuevo/page.tsx:143–151`: o POST inicial valida por `validarMovimiento(datos, catalogo, hoyAsuncion())`, com data corrente em Asunción; o input do operador não é modificado.
- `lib/movimientos/inicializacion.ts:14–20`: `resolverInicializacion` nega sobrescrever rascunho após edição/inicialização. Retém precarga segura na inicialização legítima via `precargarDesdeConsulta`.
- `lib/movimientos/inicializacion.ts:24–37`: `iniciarCargaCatalogos` descarta sucessos e erros tardios depois de cleanup.
- `nuevo/page.tsx:108–130,348–383`: handlers de edição marcam `tocado`; `control.current.bloqueado()` permanece ativo para POST/indeterminação; sem mudança do controlador K1.
- `nuevo/page.tsx:224–236`: erro inicial apresenta botão `Reintentar` com contador de carga. Não há polling nem timers novos.
- Diff não altera `lib/movimientos/intento.ts`, `cliente-api.ts`, `vista-historial.ts`, APIs/SQL/migrations ou permissões.

## 3. Achado MOV-R06-01 — MÉDIA — catálogo válido descartado após edição pré-carga

**Evidência determinística:**
1. `nuevo/page.tsx:40` começa com `catalogo=null`; `nuevo/page.tsx:190–194` (aprox., variável `cargando`) deriva carregamento de `!catalogo && !errorForm`; diversos controles essenciais têm `disabled={cargando}`.
2. **Mas** `nuevo/page.tsx:471–492` mantém `documentoReferencia`, `motivo` e `observacion` editáveis mesmo enquanto `cargando`. Seus `onChange` chamam `cambiar`, que em `nuevo/page.tsx:110–116` define `tocado.current=true`.
3. `lib/movimientos/inicializacion.ts:14–16` responde `{aplicar:false}` quando `tocado=true`, corretamente impedindo substituir rascunho.
4. **Regressão de cabeamento:** `nuevo/page.tsx:70–87` faz `if (!ini.aplicar) return;` **antes de** `setCatalogo(c)`. Assim, os catálogos recebidos validamente são ignorados se houve qualquer edição inicial.
5. Sem `setCatalogo`, a tela fica em carregamento e com produto/depósito/data/quantidade e botão Registrar inoperantes; não surge `errorForm` que exporia `Reintentar`. Reabrir a página pode perder rascunho.

**Reprodução lógica exata (sem browser/PG):** abrir /movimientos/nuevo com GET catálogos pendente → digitar «Observación» ou «Motivo» → `tocado.current=true` → GET catálogos responde OK → `resolverInicializacion` retorna false → callback não chama `setCatalogo` → `cargando` permanece verdadeiro sem erro. **Não é mera hipótese abstrata**, pois os campos de texto estão habilitados na tela real.

**Lacuna de teste:** `inicializacion.casos.ts:111–123` comprova que o formulário não é sobrescrito após uma edição, mas espera `inicializaciones=0` e não verifica o catálogo disponível; o cenário do teste pode passar precisamente com a regressão atual. A simulação do formulário até reconhece que campos principais ficam desabilitados, porém não cobre os três campos de texto que permanecem ativos.

**Impacto:** bloqueio da operação de criar novo movimento após sequência normal de edição inicial em conexão lenta; não é evidência de movimento duplicado, violação de ACL ou alteração de estoque. **Prioridade: MÉDIA** (fluxo específico com impacto de indisponibilidade da tela).

**Critérios de aceite corretivos:** separar **aceitar catálogos válidos e encerrar carregamento** de **inicializar/substituir valores do formulário**. Se `resolverInicializacion` decidir não aplicar devido a `tocado`, o catálogo válido ainda deve ser disponibilizado, sem sobrescrever os dados, textos e rascunho. A precarga da URL permanece validada por catálogo e só se aplica na inicialização legítima; decidir comportamento da precarga quando o usuário já editou (não misturar inadvertidamente). A causa de erro/retry deve permanecer funcional sem destruir edição. Não alterar regras SQL, acesso, K1, snapshot, clock, rotina de carregamento geral ou outros menus. Teste com o cabeamento **real**: editar observação antes de resolver GET; resolver com sucesso; catálogo é exibido, `cargando=false`, inputs essenciais liberados, rascunho intacto, uma única carga; e teste de erro/retry com campos já editados. Regressões meia-noite D→D+1, precarga URL autorizada/descartada, unmount e idempotência K1. Sem homologação real.

## 4. Testes e limites

**Claude reportou, ChatGPT não reexecutou:** `inicializacion` **14 verificações/0 falhas**, `intento` **30/0**, `historial` **15/0**, `movimientos` **20/0**, `stock-reposición` **275/0** = **354 verificações/0 falhas reportadas**, não equivalem a React real. Tipos pontuais reportados OK; ESLint sem erros com warning anterior sobre `m` não utilizado em `intento.casos.ts:240`. `cruzados` / NEX-053 é falha preexistente não afetada.

Novo teste exercita helpers puros, `validarMovimiento`, relógio Asunción e controlador K1 com promessas controladas, e inclui asserção estrutural da página. A simulação de tela **não cobre a falha de propagação `setCatalogo` para o React**. Nenhum navegador/React renderizado, HTTP integrado, PostgreSQL/VM/Docker, migrations, CI, suíte global, build ou deploy pelo auditor. Testes executados pelo ChatGPT: **zero**.

## 5. Governança

- **PRO-184/MOV-D03:** In Review, correção parcial; MOV-R06-01 MÉDIA bloqueia aceite estático total. Não Done, não homologado.
- **PRO-79 Movimientos:** In Review, não homologado; não migrar automaticamente a outro menu.
- **PRO-183/MOV-D02**, **PRO-182/MOV-D01**, **PRO-185/186**: aceites estáticos dirigidos prévios mantidos, sem reabertura sem evidência. **MOV-O07** risco operacional permanece declarado.
- Se responsável autorizar correção dirigida MOV-R06-01, Claude deve executar apenas esse ajuste, testes da funcionalidade, commit/push e parar para **AUD-NEXIT-MOVIMIENTOS-DESKTOP-R07**. Sem SQL/VM/PG, CI, suítes globais, deploy, edição de AUD ou homologação declarada.
