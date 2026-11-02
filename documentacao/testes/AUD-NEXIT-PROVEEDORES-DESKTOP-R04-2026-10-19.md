# AUD-NEXIT-PROVEEDORES-DESKTOP-R04 — Reauditoria independente do SHA ab60d4e

**Data:** 19/10/2026. **Auditor independente:** ChatGPT. **Projeto:** NEXIT / ERP DistribuNex, repositório `proceit-tech/distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`. **SHA funcional auditado:** `ab60d4ef3e3a402f084686f0afc3ab5cc835cc7e`. **Pai:** `5deb9e8febe6de1e4732f58dbc4471377dc3e68f`; HEAD da branch confirmado no SHA ao iniciar. **Tarefas Linear:** PRO-135 (PRV-R03-01) e PRO-136 (PRV-R03-02).

## Parecer

**PRV-R03-01 ALTA e PRV-R03-02 MÉDIA: RESOLVIDOS EM AUDITORIA ESTÁTICA.** O recorte de Proveedores `PRV-D01/D02/D03` entregue no commit `2be47f21da2536872152d849e9b4373f19bd1c2c` permanece conforme estaticamente, agora sem os dois bloqueios da R03. **Nenhum novo defeito bloqueante comprovado no diff inspecionado.** Este parecer **NÃO É HOMOLOGAÇÃO** de Proveedores, da UI no navegador, do PostgreSQL ou das migrations. O menu aguarda validação operacional humana. Não autoriza automaticamente o próximo menu, Produtos.

## Protocolo, versões e material inspecionado

- Lidos `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` pertinente e `documentacao/testes/AUD-NEXIT-PROVEEDORES-DESKTOP-R03-2026-10-19.md`, além das tarefas Linear PRO-135 e PRO-136.
- Commit remoto com **6 arquivos**, 138 adições e 16 exclusões segundo metadados: `lib/proveedores/acceso-get.ts` (novo), `app/api/proveedores/route.ts`, `app/(private)/proveedores/_components/pestanas/direcciones.tsx`, `app/(private)/proveedores/_components/proveedor-form.tsx`, `lib/proveedores/proveedores-r02.casos.ts` e `PROGRESSO-NEXIT-V1.md`.
- Conferidos código atual integral dos helpers e componente de direções, partes pertinentes da API, formulário e testes, juntamente com `lib/auth/permissions.ts`, demais contratos de GET e a conservação das rotas/ACL anteriores.
- **Não foram executados pelo auditor** os testes TS/JS, integração React, requisições HTTP reais, PostgreSQL/VM/Docker, build, lint, typecheck global, migrations, CI ou deploy. A inspeção é estática e independente; o relato de Claude é identificado como tal.

## Matriz de verificação

### PRO-135 / PRV-R03-01 — ALTA — exceção GET segura por finalidade

**Conforme na revisão estática.** Em `lib/proveedores/acceso-get.ts`, `finalidadGet(url)` diferencia `GEOGRAFIA`, `CATALOGOS`, `LISTA` e `INVALIDA`, com allowlist explícita `paises/departamentos/distritos/ciudades` e recusa `catalogo` vazio, não reconhecido ou combinado com qualquer `modo`. `decidirGet` permite `PROVEEDORES.CREAR` sem VER **apenas** para `CATALOGOS` e `GEOGRAFIA`, e a lista exige VER.

Em `app/api/proveedores/route.ts`, a escolha de finalidade ocorre antes de consultas de dados: `denegadoVer` e `tieneCrear` são avaliados a partir da sessão; decisão `invalida` devolve 400 e `denegada` devolve a resposta de permissão (ou 403). A geografia retorna seu catálogo e há barreira adicional: se a finalidade autorizada for `GEOGRAFIA` e a consulta geográfica não responder, a rota devolve 400, **não** cai para `SELECT ... FROM proveedores`. Para `CATALOGOS`, `proveedoresConsulta` devolve rows vazios. A listagem legítima mantém `p.empresa_id=$1` da sessão, sem alterar POST, SQL, migrations ou dados de outros tenants.

**Casos checados no código novo:** `?catalogo=`, `?catalogo`, `?catalogo=&modo=lista`, desconhecido, catálogo + modo, `?modo=catalogos`, geografia válida, listagem com VER, lista sem VER e ausência de fornecedores em todo caminho com CREAR-only. `proveedores-r02.casos.ts` agora testa a decisão pura `decidirGet` com URLs concretas e a ligação estrutural à rota, em vez de aprovar `has('catalogo')` por regex. **Não simula a rota HTTP Next.js em execução**; 400 e 403 reais permanecem para homologação/integrada autorizada.

### PRO-136 / PRV-R03-02 — MÉDIA — retry de leitura independente do fieldset

**Conforme na revisão estática.** `proveedor-form.tsx` deixa de envolver `PestanaDirecciones` em `Bloque`. A própria aba mantém `<Bloque bloqueado={ctx.soloLectura}>` em volta exclusivamente dos controles de adicionar/remover/editar endereços e de `Geografia`; os alertas e botões `ErrorGeo`/«Reintentar» são renderizados **antes e fora** do `fieldset disabled`. A aba recebe erros de cada `Geografia` com callback de parent estável (`useCallback`) indexado pelo ID do endereço; o efeito do filho notifica e limpa dados na mudança/desmontagem. `useCatalogoGeo` preserva `crearCargaCatalogo`, token e `invalidar` no cleanup; `reintentar` apenas incrementa `intento` para repetir o GET, sem modificar campos nem salvar formulário.

A alteração não toca `PestanaDocumentos`, `PanelGobernanza`, `ResolucionCuenta`, `ReactivarCuenta` ou suas políticas independentes. Testes focais verificam hierarquia fora do `fieldset`, campos dentro do bloqueio e callback de retry. **Não houve montagem de React em navegador**: foco, estado final e resposta visual real ficam para validação operacional.

## Testes relatados e restrições

**Claude declarou:** `lib/proveedores/proveedores-r02.casos.ts` **36 verificações / 0 falhas** (13 novas) e ESLint/checagem de tipos somente nos arquivos tocados como OK. As suítes históricas de Proveedores não foram repetidas nesta correção, conforme escopo curto. **ChatGPT não reexecutou os 36 testes nem as verificações de lint/tipos**. O novo conjunto une decisões puras e checagens de estrutura, não fornece prova de execução de GET real com PostgreSQL nem do botão no DOM.

**Sem autorização e sem execução** de build, suíte global, CI manual, migrações, VM, Docker, banco ou validação visual nesta rodada. O commit continua restrito aos dois IDs e não apresenta mudança fora de Proveedores e progresso.

## Estado e sequência

- **PRO-135 / PRV-R03-01:** aceite estático, **In Review**, aguardando homologação; não marcar Done.
- **PRO-136 / PRV-R03-02:** aceite estático, **In Review**, aguardando homologação; não marcar Done.
- **PRV-D01/D02/D03:** permanecem aceitos estaticamente sem novo bloqueio; revisão estática das correções de Proveedores concluída nesta rodada.
- **Proveedores:** sem pendência corretiva bloqueante conhecida nesta auditoria, **NÃO HOMOLOGADO operacionalmente**. As observações de escala/política bancária e o estado real de migrations NEX-034…037 continuam externos a esse aceite.
- **Governança:** GitHub fonte canônica do código e auditoria, Linear rastreia issues e estados; ChatGPT audita, Claude só desenvolve tarefa autorizada e o responsável homologa. Não iniciar Productos automaticamente.
