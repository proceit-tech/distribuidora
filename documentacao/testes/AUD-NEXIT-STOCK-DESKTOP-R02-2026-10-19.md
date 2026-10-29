# AUD-NEXIT-STOCK-DESKTOP-R02 — Revalidação independente do menu 08 Inventario → Stock

**Data:** 19/10/2026. **Projeto:** ERP NEXIT / DistribuNex V1, exclusivamente desktop. **Auditor:** ChatGPT. **Repositório:** `proceit-tech/distribuidora`. **Branch:** `feature/NEXIT-2026-001-banco-demo`. **HEAD de corte:** `dc109a7d2028fe8c20e09f25b080a5c4e175dff1`. **Corte da AUD-R01 (18/10):** `ee57f3a681d3d33aa71e0428b0cbb59efac20c6c`.

## 1. Veredito e classificação por evidência

**Stock continua NÃO HOMOLOGADO e a etapa corretiva não foi encerrada.** A auditoria R01 permanece aplicável: 13 arquivos relevantes de tela, serviço, API, permissões e testes conservam SHA de blob idêntico na branch atual. Nesta R02:

| ID | Prioridade | Classificação | Resultado |
|---|---|---|---|
| **STK-D01 / C24** | **ALTA — gate funcional** | **EXIGE DECISÃO** | O catálogo de produtos é empresarial/global enquanto saldo/custo é limitado aos depósitos autorizados. Resultado `SIN_STOCK` e KPI podem misturar populações; produto inativo com saldo só fora do alcance entra no conjunto por `EXISTS` sem filtro. Mas o comentário de `shared.ts` torna a exibição do catálogo global **intencional**: **não implementar filtro ou ampliar autorização sem decidir a política C24**, rastreada também em **PRO-137 (Dashboard)** e PRO-161 (KIT). |
| **STK-D02** | **MÉDIA — defeito de UI** | **CONFIRMADO** | `MONEDA_BASE` no escopo de módulo é alterada mesmo depois de `activo=false`; a instância B pode exibir dados monetários da empresa B com moeda da instância A. Correção técnica focal de estado por instância, sem SQL. |
| **STK-D03** | **MÉDIA — risco transacional** | **CONDICIONAL SEM PROVA OPERACIONAL** | `leerStock` lê nove fontes por `Promise.all(db.query)` de pool, sem transação/instantânea comum. Durante gravações de Movimientos pode compor saldos de uma versão com custos de outra; a possibilidade arquitetural é real, **não foi reproduzida no PostgreSQL**. Investigar teste de concorrência dirigido antes de autorizar mudança de isolamento/transação. |

Nenhum item foi implementado pelo ChatGPT. **Não** abrir tarefa corretiva para STK-D01 sem decisão nem instalar `REPEATABLE READ` automaticamente em STK-D03.

## 2. Fonte de verdade e escopo auditado

Consultados `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, `documentacao/testes/AUD-NEXIT-STOCK-DESKTOP-R01-2026-10-18.md`, `documentacao/v1/auditoria-por-menu/AUD-STOCK-V1.md`, `documentacao/testes/AUD-NEXIT-REVALIDACAO-22-MENUS-E-ESCOPO-R01-2026-10-18.md`, plano de correções por menu, documentos NEX-009/014/046/052, e testes de Stock/Reposición. `PRO-78` é a tarefa-mãe correta de Stock; `PRO-72` é Vendedores planejado/oculto e **não corresponde a um dos 22 menus V1**.

**Comparação objetiva de hashes de blob R01 vs HEAD: 13 arquivos idênticos**:
- `app/(private)/stock/page.tsx`, `[id]/page.tsx`, `layout.tsx`;
- `app/api/stock/route.ts`, `app/api/stock/[id]/route.ts`;
- `lib/stock/shared.ts`, `vista.ts`, `cliente-api.ts`;
- `lib/inventario/acceso.ts`, `stock.casos.ts`, `validar-carga.ts`;
- `lib/stock/stock-reposicion.casos.ts`, `lib/depositos/carga.ts`.

Rastreados formulários inexistentes (Stock é leitura), filtros/ordenação/paginação/URL depósito, cards, abas inexistentes, estado vazio/erro, detalhe por produto e lotes, atalhos Movimientos/Reposición, layouts, APIs GET, tenant e RBAC, seleção por depósito no SQL, custos, moedas e cálculo, contratos/migrations e helpers. A revisão R02 é **dirigida** e não comprova leitura linha a linha executada de toda a lógica SQL de Movimientos, Reports ou NEX-052 nem testes E2E do menu. Não atribuir homologação ou percentual de cobertura.

## 3. STK-D01 / C24 — gate de universo de produtos versus saldo autorizado

**Evidência vigente:** `lib/stock/shared.ts` usa `productos p` filtrando empresa e `controla_stock`, com `p.activo OR EXISTS(stock_saldos cantidad>0)` **sem limitar produto nem EXISTS a depósitos do usuário**. O alcance `PERMITIDOS` limita corretamente apenas consultas de `stock_saldos` e `inventario_costos` por `usuario_deposito` ou `alcance_depositos=TODOS`. `clasificarNivel` torna `disponible=0` em `SIN_STOCK`; `indicadoresStock` conta SKU e sin-stock sobre a população global. `/api/stock/[id]` oferece ficha do produto retornado, ainda sem saldo visível.

**Invariante de segurança preservada:** saldo/valor de depósito B não devem ser retornados à pessoa autorizada somente no A. Código atual preserva esse recorte naquelas duas fontes; produto global pode aparecer como `SIN_STOCK` no âmbito A. Para **produto inativo**, a inclusão por saldo apenas em B pode dar inferência de que há histórico fora de A, embora não revele quantidade. Não afirmar vazamento de saldo monetário. **A visibilidade empresarial de metadados de produto é decisão funcional**, inclusive para pessoa sem depósito. Não corrigir com INNER JOIN só sobre saldo positivo: produto configurado em A e realmente esgotado seria suprimido indevidamente.

**Decisão requerida:** produto do catálogo empresa sem nenhuma relação com A deve ser exibido em Stock de A? Se sim, rotular «Sin saldo en depósitos autorizados» separadamente de «Sin stock real no âmbito» e decidir os KPIs; se não, definir quais configurações/depositos/referências permitem ver produto zerado, incluindo inativos. Preservar isolamento de custos e não alterar Dashboard/Stock general sem contrato C24 transversal. **Dependência existente: PRO-137**, não criar duplicata de implementação da política.

**Teste dirigido após decisão:** 2 depósitos A/B, U só A, P com saldo só B (ativo/inativo), P configurado em A com 0, U sem depósitos, U TODOS, empresa alheia; auditar produtos/cards/IDs/quantidades/custos/links, sem mudar SQL antes da autorização.

## 4. STK-D02 — moeda global compartilhada entre instâncias

**Evidência vigente:** `app/(private)/stock/page.tsx` declara `let MONEDA_BASE="PYG"` acima de `StockPage`; no `useEffect`, `cargarStock().then(r => { MONEDA_BASE=r.monedaBase; if(activo){setStock(...)} })`. `MONEDA_BASE` é gravado **antes** do guard de ciclo de vida; ao desmontar A, `activo=false` impede `setStock` mas não impede a alteração global. A tabela usa `formatearCostoUnitarioTexto(..., MONEDA_BASE)`, `formatearMontoTexto(..., MONEDA_BASE)` e fallback de moeda da venda com a mesma variável. Uma instância B pode renderizar valores de B rotulados com a moeda retornada tardiamente por A; o detalhe `[id]` usa estado local e não sofre esse mecanismo.

**Aceite técnico mínimo:** `monedaBase` em estado pertencente à instância do componente, atualizado somente quando `activo`, de preferência junto do mesmo payload de Stock, sem fallback enganoso durante erro/carga. Atualização tardia de A **nunca** altera moeda/linhas de B, mesmo com desmontagem, mudança de tenant ou montagens simultâneas. Testes curtos de promessas GET A lenta → B válida → A tardia; moeda de custos e moeda própria da referência de venda, erro/JSON inválido quando pertinente e no-render de desmontado; checagem estrutural apenas complementar. Sem ampliar autorização, alterar consultas, views ou SQL.

## 5. STK-D03 — leitura multi-SELECT sem snapshot

`lib/stock/shared.ts` faz nove `db.query` em `Promise.all`: produtos, saldos, custos, preços, empresa/moeda, configurações, contagens de depósitos e depósitos autorizados. Como entrada `db` é `Pick<Pool, "query">`, cada SELECT pode ocorrer em transação/conexão independente com seus próprios snapshots. Movimientos atualiza saldo e inventario_costos de uma operação física. Em concorrência, uma leitura pode combinar saldos de depois do commit com custo de antes (ou vice-versa) e apresentar custo unitário/valor não sincronizados. **Não houve teste de concorrência no PG e não se afirma que tal combinação ocorreu num dado real.**

Existe padrão `lib/reportes/snapshot.ts`: `conSnapshotLectura` usa `db.connect()`, `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, `COMMIT`, `ROLLBACK` e `release`, sem executar escrita. **Não transferir mecanicamente** para Stock sem prova dirigida e sem revisar assinatura de `leerStock`, semântica de banco e locks; nenhuma migration necessária no código atual. Planejar prova focada com movimentação concorrente controlada + quantidade/custo/versão de uma foto coerente e relatório dos limites; o responsável autoriza qualquer ensaio PG real. Até lá a tarefa é **investigação condicional**, não correção técnica autorizada.

## 6. Preservações e observações não bloqueantes

- INV-01: nivel `SIN_STOCK` por disponível zero, `BAJO` por mínimo (não ponto de reposição), `SOBRESTOCK` por físico próprio > máximo.
- INV-02: atalhos Movimientos condicionados a `MOVIMIENTOS.VER` e `CREAR`; `UNIDAD_ETIQUETADA` não ganha movimento proibido; Reposición permite STOCK.VER no layout.
- INV-03/04 e INV-R02-01: valores/quotas com `numeric::text`, soma/divisão decimal exatas nos montantes exibidos; custo em moeda-base e referência de venda em sua moeda; nenhuma soma de valores na portada.
- INV-R02-02: depósitos permitidos incluem históricos inativos para leitura; `?deposito=` inválido informa indisponibilidade em vez de consolidar sem aviso. `vistaPorDeposito` recalcula saldo/custo/nível para depósito escolhido e retorna null sem linha de saldo — política histórica.
- APIs Stock são **somente GET**, com sessão e STOCK.VER, empresa e usuário da sessão; movimento físico somente via módulo Movimientos. `NEX-009/014/046/052` são contratos históricos; não presumir estado real das migrations na VM nem executá-las.
- Observações históricas mantidas como **não comprovadas ou decisões**: STK-O01 depósito configurado zerado omitido pela política de vista/teste, STK-O02 soma de unidades heterogêneas em KPI `Disponible`, STK-O03 paginação local 25 sem medição de performance, STK-O04 atalho para depósito inativo com saldo é condicional a legado/migration, STK-O05 custo/preço exposto a `STOCK.VER` depende de política empresarial, STK-O06 404 neutro de detalhe.
- **Observação adicional sem issue corretiva:** `StockDetallePage` usa `useEffect([params.id])` sem limpar `item`/reiniciar `loading`; ao obter `null` de 404, retorna cedo sem resetar o item anterior. Se o Next.js reutilizar a mesma instância React ao mudar `/stock/[id]` para outro id, pode manter dados antigos. **Não classificar bug operacional confirmado sem verificar a reutilização do componente em navegador**, que não foi executado.

## 7. Encaminhamento e governança

- **Linear PRO-78 Stock:** `In Review`, com STK-D01 **gate** transversal C24 (ligação à existente PRO-137), STK-D02 **tarefa técnica Todo**, STK-D03 **tarefa de investigação condicionada Todo**. Não marcar Done ou declarar homologação.
- Claude só implementa STK-D02 após autorização do responsável, com teste focal e commit/push; ChatGPT audita R03. D01 requer decisão de negócio C24; D03 requer evidência de ensaio concorrente **autorizado** antes de qualquer mudança transacional. Não enviar instrução Claude automaticamente.
- Próximo menu oficial após Stock: **Inventario → Movimientos (09/22)**, apenas quando responsável solicitar; não avançar por iniciativa do auditor.
- **Nenhuma execução** pelo ChatGPT: 0 testes, 0 navegador/React, 0 HTTP real, 0 PostgreSQL/VM/Docker, 0 SQL/migrations, 0 suite global, build/tsc/lint, CI manual ou deploy; nenhuma alteração funcional.
