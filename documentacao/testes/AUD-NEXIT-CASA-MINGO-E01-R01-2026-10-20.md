# AUD-NEXIT-CASA-MINGO-E01-R01 — Quantidades fracionárias e foco em Cantidad

**Data:** 20/10/2026.
**Commit auditado:** `700a1a81fb3d5ea246c9a9c067b0eca9d446b2d7`.
**Origem do requisito:** `documentacao/definicoes/HANDOFF-CLAUDE-NEXIT-CASA-MINGO-2026-10-20.md`, E01 (PRO-200 / PRO-93).
**Tipo de auditoria:** revisão estática dirigida sobre commit, código, testes e protocolos atuais. **Sem execução própria** de teste automatizado, React em navegador, PostgreSQL, SIFEN, VM, Docker, build ou CI.
**Parecer:** **E01 parcial / CORREÇÃO SOLICITADA**, um achado de UX MÉDIO. **Não homologada, não iniciar E02**.

## Verificações sem achado bloqueante no recorte

- `lib/formato/cantidad-campo.ts`: normalização textual de vírgula para ponto com rejeição de separadores mistos; `cantidadFacturaValida` usa formato `1–10` inteiros, `0–4` decimais e condição maior que zero sem float para validar; reconhece texto de edição `5,` e vírgula inicial `,5`. Suma de unidade a linha existente preserva a parte fracionária com string; o termo inteiro é <=10 dígitos, dentro da faixa de inteiros seguros de JS.
- `app/(private)/facturas/nueva/page.tsx`: remove bloqueio de quantidade fracionária na unidade SIFEN 77, conserva valor digitado no input, normaliza em `aLineaFE` e em `cuerpoFactura`; exibe erro contextual, `Cantidad` permanece editável.
- `lib/facturacion/emision.ts`: `leerCuerpoFactura` aceita quantidade em string e normaliza; `prepararFactura` deixou de rejeitar `unidadSifen===77` com fração; a validação de `payload-fe.ts` preserva `parseDec(l.cantidad,4)`, `>0`, faixa de 10 inteiros e forma fiscal.
- O commit não altera `payload-fe.ts`, `calculo.ts`, gateway, motor de inventário ou migrations. O estoque real e seu consumo ao emitir FE pertencem à **E02**, não fingir que foram concluídos na E01.
- Ajustes nos testes históricos de `facturacion` e `ajuste-fiscal` acompanham a nova regra de fração para 77. As duas asserções históricas de `monedas` e `rediseno` foram corrigidas para `fmCampo`/`precioParaEdicion` conforme alterações anteriores, sem alargar o escopo de código funcional.

## E01-R01-01 — MÉDIA — foco em Cantidad apenas após fechar o seletor avançado

**Evidências:**
- `app/(private)/facturas/nueva/page.tsx` linhas ~245–273: botão `Añadir` do `SelectorProducto` invoca `alAgregar(p)`, **mantém o diálogo aberto** e exibe aviso, enquanto `Listo` chama `alCerrar`.
- Mesmo arquivo linhas ~600–610: o `useEffect` retorna explicitamente quando `selector !== null`; somente após `setSelector(null)` o input `cantidad-{clave}` recebe `focus()`/`select()`.
- Ao incluir vários produtos no diálogo, `lineaAFocar.current` é sobrescrito por cada adição, então somente o **último** recebe foco quando o operador encerra em `Listo`.
- `cantidad-e01.casos.ts` E01-11 verifica **regex no arquivo fonte**, não renderização/click real nem foco por sequência de seleções. O próprio Claude informa ausência de navegador.

**Desvio:** o requisito do cliente é ir a `Cantidad` **quando agrega o produto**, evitando editar quantidade de vários itens a posteriori. A busca rápida consegue isso quando não há diálogo; no seletor avançado a ação `Añadir` ainda não oferece edição imediata de quantidade. **Não afirmar que o pedido foi homologado.**

**Correção solicitada ao Claude (restrita à E01):** alinhar o fluxo do seletor avançado ao requisito de edição de quantidade logo após selecionar/adicionar, preservando acessibilidade e a integridade das linhas. Se mantiver o seletor aberto para multi-alta, proporcionar edição da quantidade antes de continuar a adicionar novos itens; se optar por fechar após `Añadir`, garantir retorno de foco à linha adicionada e manutenção da pesquisa ao reabrir. Não usar foco fora de diálogo `aria-modal`, não alterar cálculo fiscal, preços, cliente, estoque ou integridade multiempresa. Explicitar no relatório o comportamento resultante e cobrir transições `Añadir`/quantidade/segunda adição, produto repetido e saída `Listo` com teste dirigido; se não houver ambiente DOM, delimitar teste estrutural e risco remanescente.

**Observação:** `sumarUnaUnidad` pode produzir um texto acima do limite de 10 inteiros quando já está no valor máximo. A tela então bloqueia `Revisar` pela validação; não é defeito fiscal confirmado, mas teste de limite adicional seria útil se alterar essa rotina.

## Testes declarados pelo Claude e limitações

- `cantidad-e01`: **9** verificações, 0 falhas.
- `ajuste-fiscal`: **41** verificações, 0 falhas.
- Regressões reportadas: facturacion 271, rediseno 90, monedas 84, fat-e2 44, pagos 77, credito 91, revision-factura 42, buscador-rapido 40, visual-v1 29, nce 205 e kude 96, todas 0 falhas.
- TypeScript e ESLint dirigidos declarados sem erros. **Resultados do desenvolvedor, não reexecutados pelo auditor.**
- Sem teste DOM/navegador, sem PG real, VM, serviço SIFEN, nem validação operacional. Nenhuma declaração de `Done`, aprovação de UI ou homologação.

## Gate de conclusão

- E01-R01-01 corrigida ou evidenciada inequivocamente como comportamento aceito pelo responsável; teste mínimo reproduz `Añadir → editar Cantidad` sem depender de `Listo` para cada produto, inclusive segunda adição e repetido, com preservação do fluxo anterior dentro da decisão adotada.
- Novo SHA e testes focados informados, Claude **para** para a auditoria R02. ChatGPT audita o diff; só depois avançar E02 mediante autorização existente e gates do protocolo.
- A implementação ainda não foi aplicada/homologada na VM.
