# AUD-NEXIT-CASA-MINGO-E01-R02 — Quantidade imediata no seletor avançado

**Data:** 20/10/2026  
**Commit funcional auditado:** `54b7016f018458550407caa937fe6eaca29ed79b`  
**Referência da auditoria anterior:** `AUD-NEXIT-CASA-MINGO-E01-R01-2026-10-20.md` / PRO-201  
**Protocolo:** `CLAUDE.md` e `documentacao/PROTOCOLO-IA.md` consultados no commit auditado; progresso e requisito E01 consultados.
**Natureza:** auditoria estática dirigida do commit, diff e arquivos finais. **Nenhum navegador/DOM, PostgreSQL, API real, VM, Docker, CI ou testes automatizados executados pelo ChatGPT.** Os resultados abaixo de testes são declarações do Claude.

## Veredito

**E01-R01-01 / PRO-201: CORRIGIDO ESTATICAMENTE no fluxo principal.** A edição pode ocorrer imediatamente após cada `Añadir` dentro do diálogo; não depende mais de `Listo`. A prova de foco/teclado em navegador continua **NÃO VERIFICADA**.

**Novo achado E01-R02-01 — BAIXA, correção pontual necessária:** novo componente usa `estilos.cantidadAnadido`, classe CSS inexistente no arquivo versionado. A camada de UI pode ficar sem o agrupamento/espaçamento/realce previstos para esse campo. Antes de declarar E01 encerrada, versionar o estilo da nova área e validar com teste focal. **E01 não é 10/10 nem homologada; E02 não deve começar por esta auditoria.**

## Matriz RN/CA → implementação → teste → resultado

| Regra/critério | Evidência do código em 54b7016 | Prova reportada | Parecer |
| --- | --- | --- | --- |
| R01-01: editar Cantidad imediatamente sem clicar Listo | `SelectorProducto` recebe retorno `clave` do `alAgregar`, atualiza `ultimo` e monta `CantidadAnadido` dentro do diálogo `aria-modal`; `useEffect([solicitud])` usa `focus/select` | E01-R02-01 a 04; teste estrutural/estado puro | **Conforme estaticamente**; foco real não verificado |
| Primeiro, segundo e produto repetido | `registrarAnadido` incrementa `solicitud` a cada clique, `clave` da linha real é retornada nas duas ramificações; `CantidadAnadido` edita por `editar(clave, {cantidad})` | sequência A, B, A (puro) | **Conforme estaticamente** |
| Preservar diálogo multiadição, Enter/Listo/Escape | `SelectorProducto` continua aberto após Añadir; Enter aponta ao filtro de produtos `id="filtro-productos"`; Listo e useEscape preservados | E01-R02-04 estrutura | **Conforme estaticamente**; sem teclado DOM |
| Frações e validação real | `cantidadFacturaValida`, `normalizarCantidadTexto` já usados nas duas interfaces e no backend; `payload-fe.ts` não modificado; `sumarUnaUnidad` bloqueia ultrapassar 10 dígitos inteiros | quantidade-e01 14/0, ajuste-fiscal 41/0 reportados | **Conforme no escopo**, execução dos testes não reproduzida |
| UX/estilização do novo campo | `cantidad-anadido.tsx` usa `estilos.cantidadAnadido` mas `page.module.css` do SHA não contém `.cantidadAnadido` | testes estruturais não consultam CSS; CSS NÃO está no diff da correção | **Achado E01-R02-01** |

## E01-R01-01 — FECHADO ESTATICAMENTE

1. `app/(private)/facturas/nueva/page.tsx` (SelectorProducto): `Añadir` chama `alAgregar(p)`, armazena `clave` e chama `registrarAnadido` a cada adição, inclusive repetida; o novo campo aparece DENTRO do próprio diálogo.
2. `app/(private)/facturas/nueva/cantidad-anadido.tsx`: input usa `valor` controlado, `onChange` que atualiza a linha real, `aria-invalid`, label associada e efeito `[solicitud]` que seleciona o campo.
3. `lib/facturacion/seleccion-cantidad.ts`: contador monotônico de solicitações, capaz de refocar o mesmo item.
4. Produto repetido continua somando uma unidade; ajuste de limite de dez inteiros coerente com restrição fiscal.
5. O bug interino reportado pelo Claude, ID do filtro aplicado a Clientes, **não aparece no commit auditado**: `id="filtro-productos"` está no `SelectorProducto`.
6. O teste E01-R02 verifica funções puras e padrões textuais do JSX, **não** prova foco, navegação por teclado ou anúncio por leitor de tela num DOM real. A frase `aria-modal` sozinha não comprova um foco preso no diálogo; não declarar acessibilidade homologada.

## E01-R02-01 — BAIXA — classe CSS ausente no Git

**Evidência objetiva:** `app/(private)/facturas/nueva/cantidad-anadido.tsx` usa `className={estilos.cantidadAnadido}`. `app/(private)/facturas/nueva/page.module.css` **não define** `.cantidadAnadido`; o arquivo nem sequer consta dos arquivos alterados pelo commit `54b7016f`. O relatório do Claude indicou `page.module.css` como modificado, mas o conteúdo entregue no commit não confirma essa alteração.

**Impacto:** a área que deveria destacar e organizar a edição imediata fica sem classe CSS efetiva; o input recebe estilo genérico `.qty`, mas não há estilo próprio para o agrupamento e a etiqueta. O defeito é de apresentação, **não altera quantidade fiscal/estoque**. Sem browser não afirmar que há sobreposição ou campo invisível.

**Correção mínima para Claude:**
- Versionar em `page.module.css` uma classe `.cantidadAnadido` real, desktop-first, com agrupamento claro e responsivo, sem modificar os estilos de outros componentes.
- Acrescentar teste direcionado que confira correspondência entre classe usada no JSX e regra CSS, além de preservar as 14 verificações de `cantidad-e01`.
- Commit/push apenas do reparo e atualização breve de progresso, sem alteração fiscal, DB, gateway, Inventario, FE emissão ou outra UI. Parar para R03.
- A verificação visual/foco/teclado será realizada somente pelo responsável no único ambiente operacional quando houver implantação autorizada; não substituir por declaração de simulação.

## Testes relatados pelo Claude (não reexecutados)

- `cantidad-e01`: 14 verificações / 0 falhas.
- `facturacion`: 271; `rediseno`: 90; `monedas`: 84; `buscador-rapido`: 40; `ajuste-fiscal`: 41; `revision-factura`: 42; `visual-v1`: 29. Todas reportadas com 0 falhas.
- TypeScript e ESLint pontuais: declarados limpos. Nenhum teste DOM, navegador ou VM realizado.

**Status operacional:** E01 **em revisão**, não Done/não homologado; E02 **não iniciada**. O único reparo exigido agora é a classe CSS ausente e o teste focado; não abrir discussão comercial nova.
