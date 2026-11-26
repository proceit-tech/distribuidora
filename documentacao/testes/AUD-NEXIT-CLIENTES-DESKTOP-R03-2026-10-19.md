# AUD-NEXIT-CLIENTES-DESKTOP-R03 — Reauditoria independente do commit 4966ad9

**Data:** 2026-10-19. **Auditor:** ChatGPT. **Projeto:** NEXIT / ERP DistribuNex, repositório `proceit-tech/distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`. **SHA funcional auditado:** `4966ad92939172961d696cff38aa3ee841f66a8a`; pai `61f0e2561df00a252cb9873a09cc0ffe62e30ace`; a branch apontava ao SHA auditado na abertura.

**Veredito:** **CORREÇÃO REQUERIDA — R03-01 MÉDIA**, regressão funcional localizada no fluxo de alta CREAR-only com documentos pendentes. **CLI-D01, D02, D03, D06 e D07 implementadas e substancialmente CONFORMES em revisão estática**, mas **NÃO ENCERRAR o menu**, não declarar aprovação/homologação geral e não avançar para Proveedores sem reauditar R03-01.

## 1. Escopo e fontes de prova

Consultados `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, auditoria R02 e o commit via API GitHub. Diferença de **20 arquivos**: novos layouts `/clientes/nuevo` e `/clientes/[id]`, listagem separada em componente cliente, servidor GET/POST, ficha e uploader preservados, controller geográfico, helper de direção fiscal, helper decimal, RBAC/menu, tipos, regressões, testes novos e progresso.

Inspecionados em código atual: `app/(private)/clientes/{layout,page}`, `nuevo/{layout,page}`, `[id]/{layout,page}`, `[id]/_components/{hijos,documentos}`, `_components/listado-clientes`; `app/api/clientes/{route,[id]/route}`; `lib/clientes/{permisos-acceso,geografia-cargas,direccion-fiscal,limite-credito,permisos-documentos,documentos-http,filtros-listado,clientes-r02.casos}`; `lib/navigation/menu.ts`, `lib/auth/permissions.ts`, `lib/inventario/decimal.ts`, `lib/formato/decimal-texto.ts`, `lib/ui/proteger-cambios.ts`, `types/clientes.ts`.

**Natureza:** auditoria estática dirigida a diffs e invariantes; não foi realizada execução por ChatGPT de TS/casos, chamadas HTTP, servidor Next.js, PostgreSQL, navegador, VM/Docker, migrations ou CI. Dados de testes descritos pelo Claude não foram reproduzidos pelo auditor.

## 2. Matriz de aceite estático da entrega

| Achado | Evidências verificadas | Parecer |
|---|---|---|
| **CLI-D01 ALTA** permissão CREAR-only | Layout pai admite VER ou CREAR; subrota novo exige CREAR; lista server-side e subrota ficha exigem VER; GET de `/api/clientes` classifica finalidade e permite a CREATE-only somente catálogos e geografia, mantendo `clientesResultado.rows=[]` em `modo=catalogos`; GET catálogo geográfico conhecido responde exclusivamente referências e desconhecido retorna HTTP 400; GET comum/lista requer VER; POST continua CREAR; menu novo aponta `/clientes/nuevo`, sem herdar VER. Conclusão sem VER é tela própria, mas contém a regressão R03-01 descrita abaixo | **Implementação conforme quanto a acesso estático; fluxo de conclusão não totalmente aprovado por R03-01** |
| **CLI-D02 MÉDIA** ações restritas | Listagem usa `puedeCrear` obtido de `guardPage` e `hasPermission` no servidor; botões de alta condicionados. GET de ficha devolve `permisos.editar` da sessão; UI usa `fieldset disabled`, não apresenta botão Atualizar e `guardar` não realiza PUT quando sem EDITAR. `DocumentosCliente` fica dentro do fieldset, botões de mudança ficam inertes, âncoras de download podem funcionar; APIs mantêm proteção | **Conforme estaticamente, sem navegador** |
| **CLI-D03 MÉDIA** consultas geográficas | `crearCargasGeograficas` com tokens por identidade `uid` ou `k`; mudança de departamento/distrito/país e exclusão invalidam replies/erros; pré-carga usa token vigente; novo usa `key={direccion.uid}`, serializa direções sem UID; edição conserva `k` estável e `quitar` | **Conforme estaticamente; chamadas reais/render React não executados** |
| **CLI-D06 MÉDIA** direção fiscal | Helpers `cambiarTipoDireccion` e `marcarDireccionFiscal` normalizam flags/tipo `FISCAL` das outras direções, selecionam no máximo uma e preservam demais atributos. Editor usa ambos; regra SQL/serviço não foi relaxada | **Conforme estaticamente, sem SQL executado** |
| **CLI-D07 MÉDIA** crédito decimal | `limiteCredito: string` no DTO de lista; `limiteTexto` recebe decimal PG, `sumarLimitesPorMoneda`/ `compararLimites` reutilizam BigInt de `lib/inventario/decimal` e `formatearLimite` usa formatter decimal texto. Lista não converte mais o limite para JS Number; filtro, ordenação e cards usam texto exato | **Conforme estaticamente, sem valores reais PostgreSQL** |

**Preservado no diff:** funções SQL fiscais, migrations NEX-052/053, CAS/409 de edição, cliente_documentos, política de arquivos/versionamento, outras rotas de produtos/faturamento/inventário e Dashboard. A redistribuição do arquivo de listagem server/client não altera suas funções básicas além de proteção e dinheiro. Escopo desktop; não exigir mobile.

## 3. Achado da reauditoria — correção localizada requerida

### CLI-R03-01 — MÉDIA — Finalização sem documentos pendentes mantém aviso de rascunho sujo na tela de sucesso CREATE-only

**Evidência determinística no código:**
- `app/(private)/clientes/nuevo/page.tsx:379–383` define `sucio = altaCreada ? documentos.some(d => d.archivo && !docsSubidos.includes(d.uid)) : ...`, **sem condicionar a `!altaFinalizada`** e o associa a `useProtegerCambios(sucio && !guardando)`.
- `:976–990` `finalizarSinPendientes()` pede confirmação para abandonar arquivos não enviados e, quando `cerrarCargaInicial` retorna sucesso, executa `terminarAlta()`.
- `:887–898,1031–1050` `terminarAlta()` para ator sem `CLIENTES.VER` faz apenas `setAltaFinalizada(true)` sem limpar o estado de arquivos pendentes; a tela final exibe botão **«Registrar otro cliente»** que chama `window.location.assign("/clientes/nuevo")`.
- `lib/ui/proteger-cambios.ts` adiciona listener `beforeunload` quando `sucio===true`. Mesmo após o usuário ter autorizado o encerramento dos documentos não carregados, navegar pelo botão final pode disparar aviso nativo de alterações não salvas. Esse aviso contradiz a finalização já confirmada e a promessa de um novo cadastro limpo.
- No caminho sem documentos pendentes, `sucio=false` e o problema não aparece. Não é falha de autorização nem cria duplicado automaticamente; é regressão de navegação/estado após finalização explícita.

**Correção mínima:** depois de **fechamento confirmado pelo servidor** (`cerrarCargaInicial===true`) e `altaFinalizada=true`, a proteção de rascunho não deve disparar na tela concluída. Antes de confirmar o fechamento, ou se falhar, deve continuar protegendo arquivos pendentes; preservar retry, cliente criado uma única vez, dados e fluxo VER existente. Não remover `useProtegerCambios` do formulário nem apagar/recarregar arquivos antes da decisão do operador.

**Casos focais obrigatórios:** CREAR-only, criar com 2 arquivos, 1 enviado + 1 falhou → «Finalizar sin los documentos pendientes» → confirmação + fechamento OK → tela final, novo cadastro sem beforeunload; antes de confirmar/ao cancelar a confirmação mantém proteção; fechamento falha, mantém proteção e retry; tentar reenvio e concluir tudo sem aviso; usuário com VER mantém redirecionamento original. Testar helper puro + integração UI se disponível; teste estrutural sem browser não prova funcionamento real do listener.

**Não é autorização automática ao Claude.** A direção de correção é explícita para envio em tarefa separada após decisão do responsável; ChatGPT reaudita R04.

## 4. Testes e transparência

**Relato Claude:** `lib/clientes/clientes-r02.casos.ts` 48 comprovações, 0 falhas; regressões `estabilizacion` 26, `permisos-documentos` 151, `cierre-modulo` 76, `comercial` 61, `nueve-ajustes` 53, `facturacion` 271 e `dashboard` 46, todas sem falhas; lint e tipo isolados relatados. **ChatGPT não executou essas suítes nem verificou ESLint/TypeScript;** os testes novos são funções puras e verificações estruturais, não chamadas HTTP reais/PG/navegador. O cenário R03-01 não está explicitamente coberto por esses 48 casos e não pode ser declarado testado.

**Regra futura:** Claude somente corrige o R03-01 após autorização; testes focados, commit e push, parar. ChatGPT faz R04 independente. Não iniciar Proveedores, outras Cnn, SQL/VM/deploy, nem refazer CLI-D01…D07 sem defeito específico. **Clientes NÃO HOMOLOGADO / NÃO ENCERRADO.**
