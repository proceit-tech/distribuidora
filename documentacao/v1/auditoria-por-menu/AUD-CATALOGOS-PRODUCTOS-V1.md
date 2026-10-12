# Auditoria por menu — Catálogos de productos

**Rota principal:** `/productos/catalogos`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado:** ABERTA — NÃO AUDITADA INTEGRALMENTE — NÃO HOMOLOGADA  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Catálogos de productos**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

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

- **Confirmado como comportamento existente:** `window.confirm()` protege trocas de abas e determinadas inativações dentro da própria tela; o problema de navegação lateral está documentado como **CAT-A03**. Achados novos e evidências: seção I.

## Pendências

Primeira auditoria dirigida realizada em 12/10/2026: seis achados com evidência de fonte (CAT-A01…CAT-A06), mais duas pendências de investigação. Não houve teste em PostgreSQL/VM/browser; não atribuir porcentagem de homologação.

## Regra de migrations

O responsável mostrou NEX-001…051 já aplicadas na VM. Proibido editar scripts aplicados, checksums ou reexecutar SQL histórico como se fosse nova migration. Qualquer nova alteração estrutural exige justificativa, aprovação e migration incremental a partir de NEX-052.

## I. AUD-CAT-R01 — auditoria dirigida da V1 (12/10/2026), enquanto Claude implementa Proveedores

**Escopo e estado:** ler e avaliar `/productos/catalogos` (Categorías/Marcas/Familias/Líneas), contratos das APIs, permissões, DDL e efeito no cadastro de Productos **sem editar código ou passar tarefa ao Claude nesta rodada**. Auditoria por GitHub, NÃO HOMOLOGADA. Branch `feature/NEXIT-2026-001-banco-demo`. Protocolo consultado: `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md` e `PROGRESSO-NEXIT-V1.md` na branch. Também consultadas `MATRIZ-AUDITORIA-CATALOGOS-PRODUCTOS-V1-2026-10-12.md`, `DECISAO-CAT-012-HIERARQUIA-CATALOGOS-2026-10-12.md`, `ESPECIFICACAO-IMPLEMENTACAO-CATALOGOS-HIERARQUIA-UX-2026-10-12.md` e auditoria `AUDITORIA-CATALOGOS-NEX-044-2026-10-12.md`. As constatações anteriores de fase pré-NEX-044 não devem ser reproduzidas como defeito presente.

### II. Achados novos, com evidência e critérios de aceite

| ID | Prioridade | Evidência no código atual | Correção mínima / critério de teste |
|---|---|---|---|
| **CAT-A01** | **ALTA — falha de catálogos auxiliares ocultada** | `app/(private)/productos/catalogos/page.tsx:79-101`: carrega lista principal `r` e auxiliares `rf` (Famílias quando em Líneas) / `rk` (Categorías para Famílias/Líneas). Verifica apenas `r.ok`; processa `rf.json()` e `rk.json()` **sem `rf.ok`/`rk.ok`** e interpreta ausência de `familias`/`categorias` como `[]`. A API auxiliar com 403/500 pode ser tratada como seletor/filtro vazio. | Verificar HTTP/status e shape dos três resultados **antes de expor formulário e filtros**; exibir erro explícito e não permitir salvar associação presumidamente vazia. Testar main=200 + categorias=403/500, main=200 + familias=500, e normal 200. Reutilizar tratamento já corrigido em Clientes. |
| **CAT-A02** | **MÉDIA/ALTA — respostas assíncronas fora de ordem** | A função `cargar` da mesma página (`:79-106`) fecha sobre `tipo`, atualiza estados globais `filas`, `familias`, `categorias`, `permisos` e `cargando`. `useEffect(:108-111)` dispara nova consulta ao mudar aba, **sem AbortController, geração de requisição nem verificação da aba atual**; resposta da aba anterior mais lenta pode chegar por último e substituir as linhas da atual. | Proteger o estado contra resposta obsoleta/cancelar fetch anterior. Testar alternância Categorías → Líneas → Familias com latências invertidas; resultado e permissões exibidos sempre da aba atual, sem estado de carregamento falso. Nenhuma mudança SQL. |
| **CAT-A03** | **ALTA — rascunho perdido por navegação lateral** | `page.tsx:113-125` usa somente `beforeunload` com `sucio`; `:127-158` e `:332-355` usam confirmação explícita apenas em troca de aba, criar/editar/cancelar e link próprio para `/productos`. **Não usa** `useProtegerCambios` do projeto. Os `Link` do menu lateral fazem navegação client-side e não acionam `beforeunload`. | Reutilizar o guard de navegação de Clientes/Productos para links da aplicação, incluindo menu lateral, sem popup para formulário intacto; manter confirmar/descarte atual para ações internas, sem confirmações duplas. Testar formulário alterado + sidebar, link Produtos, aba, recarregar e cancelar. Limitações do botão voltar do App Router continuam a ser validadas visualmente. |
| **CAT-A04** | **ALTA — referência histórica inativa não aparece no seletor de edição de Productos** | A integração `/api/productos?modo=catalogos` em `app/api/productos/route.ts:125-128` envia **somente `activo = true`** para Categorías, Marcas, Familias, Líneas. `app/(private)/productos/_components/pestanas/informacion.tsx:24-25,71-92` constrói selects apenas dessas coleções; a inclusão `f.id === form.familiaId` não resolve um UUID que nem veio da API. `lib/productos/shared.ts:204-229` **aceita** referência antiga inativa inalterada, mas a UI pode apresentar seleção sem opção/label correspondente. | Na edição, fornecer dados mínimos das referências históricas **do próprio produto e mesma empresa**, marcadas `(inactivo)`, sem oferecer registros inativos para seleção nova e sem alterar os UUIDs gravados. Verificar Categoria, Marca, Familia, Línea, inclusive hierarquia antiga, com GET e edição/salvamento de campo não relacionado. Não reativar/reclassificar automaticamente. |
| **CAT-A05** | **MÉDIA — confirmação de inativação não considera famílias descendentes** | `lib/productos/catalogos-admin.ts:88-99` projeta `productos` como `count(*)` **pela FK direta** `p.categoria_id = t.id`, sem contar famílias/linhas dependentes. `page.tsx:272-285` só confirma inativar Categoria se `fila.productos > 0`; a condição especial de confirmação se aplica apenas a `tipo === 'familias'`. Portanto Categoria com `0` produtos diretamente associados, mas com famílias, é desativada **sem alerta de dependências**, apesar da hierarquia CAT-012. | Manter inativação lógica e dados vinculados (nenhuma cascata). Avisar no ato de inativar Categoria que famílias/linhas vinculadas continuam com seus IDs e podem precisar de revisão. Se contar descendentes, obter contagem **real**, não inferir via `productos`. Testar Categoria com 0 produtos diretos + 1 Família, com e sem linhas, confirmação e cancelamento. |
| **CAT-A06** | **MÉDIA/ALTA — perda de edição concorrente de catálogo** | `lib/productos/catalogos-admin.ts:219-291` aceita PUT de catálogo **sem versão/If-Match**; para Família/Línea há `SELECT ... FOR UPDATE` apenas no instante do salvar, depois regrava `codigo`, `nombre`, `descripcion`, vínculo e `activo`. O bloqueio serializa transações simultâneas, mas não compara os valores com a ficha anteriormente carregada pelo operador. Duas abas podem sobregravar alterações da primeira. Categorías/Marcas têm mesmo problema por atualização via `catalogo_producto_guardar`, apesar da checagem RBAC no SQL. | Adotar precondição de edição leve e compatível com quatro tipos (p.ex. token/snapshot de `actualizado_at` **se existir e for confiável**), retornar 409 se obsoleto, manter formulário local para correção. Confrontar DDL de quatro catálogos antes de escolher versão; se exigisse nova coluna/migration, propor separadamente, não adicionar SQL por suposição. Testar duas abas A/B, edição após ativar/inativar e request direto. |

### III. Comportamentos corretos verificados e que devem ser preservados

- Hierarquia **Categoría → Familia → Línea**, Marca independente (decisão CAT-012): `NEX-044-familias-categoria-jerarquia.sql:25-29,35-72` adiciona FK composta para categoria, trigger de coerência em produtos e famílias, permitindo NULL histórico; `lib/productos/catalogos-admin.ts:199-209,240-269` exige Categoria ativa em novas Famílias e preserva famílias históricas. `NEX-017:38-60` garante coerência Linha→Família por FK composta. Não voltar a tratar hierarquia como decisão aberta.
- O backend exige `PRODUCTOS.VER/CREAR/EDITAR` conforme método, `empresa_id` da sessão e credencial do usuário validada dentro de `catalogo_producto_guardar` (NEX-020) em Categorías/Marcas. Famílias/Líneas usam transações SQL; a inativação não apaga dados. Manter a escrita controlada pelo banco e os locks consultivos/índices de nomes/códigos.
- Código opcional (sem backfill), nome obrigatório, filtro/pesquisa/paginação 20, estado, categoria e família, inline feedback por campo e confirmação das mudanças **dentro** da página foram implementados. Contagem **`Productos (total)` = produtos diretamente associados, incluindo inativos**, portanto não rotular como ativos/descendentes.
- Famílias antigas sem categoria permanecem válidas para edição e saneamento manual; NEX-044 não reclassifica as 51 famílias históricas por semelhança textual. A tela permite atribuição manual e destaca `Sin categoría`. Não alterar decisões anteriores sobre classificação total obrigatória do Produto, nem inserir categorias inventadas.

### IV. Pontos de atenção que dependem de verificação ou regra vigente

- **Concorrência hierárquica no PostgreSQL:** verificar sob transações controladas simultaneidade entre mudança de `familias_producto.categoria_id` e atualização de `productos.categoria_id`/`familia_id`. NEX-044 tem triggers de coerência mas não ficou demonstrado, nesta revisão estática, se as leituras bloqueiam adequadamente edições concorrentes da família. Não afirmar vulnerabilidade comprovada sem teste PostgreSQL.
- **Ciclo de vida de categorias inativas com famílias ativas:** o código permite que a família permaneça ativa após sua Categoria ser inativada (sem cascata), enquanto o seletor de categorias de Productos só expõe ativas. A hierarquia permanece referencialmente válida. Não inventar inativação automática de família/línea, nem bloquear automaticamente operações sem decisão adicional; monitorar impacto na edição de produtos existentes (CAT-A04).
- **Escala:** todas as linhas de catálogo são trazidas e paginadas no cliente. Com 51 Famílias/203 Líneas documentadas, não há prova de gargalo que exija paginação server-side na V1. Mensagens de erro, focos, tabulação, 320/375/768/desktop e prints reais devem ser validados no navegador autorizado. Capturas antigas citadas na matriz não estão versionadas no Git.
- **Migrations:** NEX-001…051 foram relatadas como aplicadas pelo responsável em outra etapa; os protocolos históricos têm fotografias antigas. Confirmar ledger real antes de qualquer SQL; nunca editar checksum/migration aplicada. NEX-052/053 seguem sem aplicação confirmada nesta rodada e são de OUTROS menus.

### V. Proposta de estabilização V1, NÃO liberada para Claude nesta auditoria

Prioridade funcional ao terminar Proveedores: **CAT-A01, A03 e A04** (falha de catálogo, perda de rascunho e referência histórica), depois **CAT-A02/A05** (condição de corrida de tela e aviso de dependência). **CAT-A06** (edição concorrente) deve receber correção simples, sujeita ao contrato de versionamento existente; não criar migração/desenho avançado só para ele. Não reimplementar hierarquia NEX-044, não introduzir workflows ou modificar Produtos/Clientes além da pequena integração necessária para exibir referência histórica.

**Critérios de homologação pendentes:** cenários HTTP 401/403/500, alternância rápida de abas, rascunhos, edição com registros inativos, duas edições concorrentes e categorias com descendentes; isolamento multiempresa, INSERT/UPDATE com grants reais, conflito de FK, dados legados, testes de regressão + browser/PG na VM por responsável. ChatGPT realizou **0 testes**, 0 builds, 0 PostgreSQL/VM, 0 screenshots neste turno.

**Estado:** AUD-CAT-R01 — auditoria dirigida documentada; Catálogos de Productos **ABERTA / NÃO HOMOLOGADA**, sem implementação autorizada ou alteração do app/SQL. Claude permanece autorizado **somente** a Proveedores até retornar com commits para nova auditoria.
