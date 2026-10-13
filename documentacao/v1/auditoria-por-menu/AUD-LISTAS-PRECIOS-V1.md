# Auditoria por menu — Listas de precios

**Rota principal:** `/listas-precio`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado:** ABERTA — NÃO AUDITADA INTEGRALMENTE — NÃO HOMOLOGADA  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Listas de precios**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

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

Primeira auditoria dirigida registrada em §I–IV (LPR-A01…LPR-A08). Há defeitos comprovados em código/SQL e pendências operacionais; **nenhum teste nesta sessão em PostgreSQL, VM ou navegador**. Os achados anteriores LPR-X01…X03 preservam decisões de negócio, mas **não** representam autorização para implantar precificação por apresentação na V1.

## Pendências

Auditoria ESTÁTICA DIRIGIDA concluída em 12/10/2026 para os fluxos principais e SQL relacionado. Não foi feita revisão exaustiva linha a linha de todos os arquivos, nem testes de browser/API/PG nesta sessão. Não atribuir percentual de homologação.

## Regra de migrations

O responsável mostrou NEX-001…051 já aplicadas na VM. Proibido editar scripts aplicados, checksums ou reexecutar SQL histórico como se fosse nova migration. Qualquer nova alteração estrutural exige justificativa, aprovação e migration incremental a partir de NEX-052.

## Dependência de Productos: unidade-base e preço referencial (12/10/2026)

**LPR-X01 / ALTA / mismatch:** `NEX-008` guarda `lista_precio_items.unidad_medida_id`; `NEX-017:90-111` só sincroniza a unidade quando `producto_fijar_precio_referencia` é executada; `app/api/productos/[id]/route.ts:253-296` pode editar `productos.unidad_medida_id` sem chamar essa função caso `precioEnviado` seja falso. Resultado: o preço de referência permanece vinculado à unidade anterior do produto. Mesmo que haja ajuste de unidade-base depois, o preço e histórico devem ter unidade explicitada e jamais recalculada arbitrariamente.

**Fonte:** `AUD-PRODUCTOS-V1.md`, seção XIV. Auditória deste menu permanece aberta; não implementar política comercial sem decisão.

## Matrizes de preços × apresentações × troca de unidade-base — complemento 12/10/2026

**LPR-X02 / ALTA:** `NEX-008:63-88` contém uma única linha por produto/lista, embora guarde `unidad_medida_id`; `NEX-017:90-121` grava preço referência por unidade-base e `v_producto_precio_referencia` oculta a unidade. Sem contrato de preço por `producto_unidades.id`, não é possível afirmar que a venda por caixa/pacote terá preço correto ou desconto calculado. Alterar a unidade-base com estoque zero não autoriza transportar o mesmo preço nominal para outra unidade.

**DEC-PRD-U10 encerrada pelo responsável:** na V1, alteração da unidade-base **não exige revisão de preços e não suspende vendas por esse motivo**. Conservar valores numéricos e permitir edição voluntária, sem recálculo automático. Garantir apenas coerência técnica de vínculo de unidade por solução simples. Ver `AUD-PRODUCTOS-V1.md` §XX. Auditoria de Listas de precios ainda ABERTA.

## DEC-PRD-U09 — vínculo dos preços às versões da apresentação (12/10/2026)

**Regra aprovada:** um fator comercial utilizado não será sobrescrito; Caja v1=12 UNI e Caja v2=10 UNI são versões diferentes da MESMA apresentação, com vigências não sobrepostas. Preços e históricos das operações precisam manter a unidade/fator associados à transação para não reinterpretar vendas antigas.

**Lacuna LPR-X03:** `NEX-008` mantém unicidade `(empresa_id, lista_precio_id, producto_id)` e unidade por item, sem preço/versão por apresentação; `NEX-017` grava preço de referência com a unidade-base. Não há contrato comprovado de preço por versão de apresentação. Vincular eventual preço futuro à apresentação/versão com vigência e condições comerciais próprias; não presumir que a mudança do fator altere automaticamente o preço de caixa ou a margem.

**DEC-PRD-U10 resolvida por simplificação de escopo V1:** nenhuma obrigatoriedade de rever preços nem bloqueio de vendas por mudança de unidade-base. Auditoria Listas de precios continua ABERTA, sem código/SQL executado.

## Alinhamento de escopo V1 — preços sem processo de revisão obrigatório (12/10/2026)

Orientação do responsável: **se o cliente trocar a unidade-base, o cadastro registra a troca** (respeitadas as salvaguardas U07 de saldo zero/sem pendências), e não nasce um fluxo adicional de aprovação/revisão de preços. **Manter valores numéricos de preços existentes**, sem reajuste automático, bloqueio comercial nem inativação preventiva; cliente pode modificar os preços quando quiser. Garantir que o vínculo técnico da unidade usada no preço permaneça coerente com o contrato, sem alterar documentos antigos. Ver `AUD-PRODUCTOS-V1.md` §XX.

Não criar wizard de precificação, bloqueio temporário de vendas, conversão automática de preços de caixa/unidade ou outra complexidade apenas por esta decisão. A lacuna de múltiplos preços por apresentação pode ser tratada como evolução conforme uso real. Auditoria estática ABERTA; não houve código, SQL, VM ou testes alterados.

## I. AUD-LPR-R01 — primeira auditoria dirigida do menu Listas de precios (12/10/2026)

**Branch auditada:** `feature/NEXIT-2026-001-banco-demo`. **Escopo do pedido:** auditar o menu enquanto Claude Code implementa Proveedores + Catálogos de Productos. **NÃO autoriza implementação de Listas de Precios nesta etapa.** Consultados os protocolos `CLAUDE.md` e `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` item 5, documentos visuais `AUDITORIA-LISTAS-PRECIO-Y-CATALOGOS-COMERCIALES-2026-10-12.md` e decisão de câmbio manual, telas `/listas-precio`, `/nuevo`, `/[id]`, formulário e cliente-API, rotas GET/POST/PUT, `lib/listas-precio/{shared,formulario,calculos,listas-comerciales.casos}.ts`, migrations NEX-008/017/018, contratos de Productos/Facturación. Código/SQL apenas lidos via GitHub, **não executados pelo ChatGPT**.

### II. Achados com evidência no código vigente

| ID | Prioridade | Constatação demonstrada | Mínimo critério de correção V1 |
|---|---|---|---|
| **LPR-A01** | **ALTA — regravação destrutiva de filhos** | `app/api/listas-precio/[id]/route.ts:195-203`: todo PUT atualiza a lista e chama `borrarHijos` e `insertarHijos`, independentemente dos campos alterados. `lib/listas-precio/shared.ts:344-352` executa DELETE em todos os escalões, itens e regras, depois INSERT com IDs novos (o insert não reutiliza `i.id`, `r.id` etc). Isso altera `id`, `creado_at` e histórico técnico de itens inalterados, mesmo numa simples edição do nome. A transação evita exclusão parcial por erro, **não** preserva identidade/histórico. É especialmente sensível em `es_referencia` integrado a Productos. | **Não apagar/recriar em massa:** manter IDs e datas de criação dos itens, escalões e regras inalterados; UPDATE seletivo por ID pertencente à lista/empresa; INSERT apenas para novos; DELETE apenas quando houve remoção explícita (conforme política de histórico vigente). Não criar novo motor de preços nem migração sem necessidade. Regressões mudar só nome, alterar um preço, incluir/excluir item, preservar PK e preço de referência dos demais. |
| **LPR-A02** | **ALTA — edição concorrente sobrescreve preços** | O GET `app/api/listas-precio/[id]/route.ts:52-77` devolve `actualizadoEn`, mas `PUT:158-203` apenas faz `SELECT ... FOR UPDATE` e **não compara a versão carregada pelo operador** com a persistida; `types/lista-precio.ts:162-164` exclui `actualizadoEn` do payload. Duas abas podem salvar sucessivamente; a segunda reenvia sua ficha antiga e substitui TODOS os preços, regras e limites da primeira, agravado por LPR-A01. | Pré-condição simples e **obrigatória** de versão (`actualizado_at`/token confiável) no PUT, checada após lock e antes da primeira escrita; 409 claro, sem descartar o formulário local. Caso A/B duas abas com preço diferente, request direto sem versão e edição do cabeçalho com filhos. Sem coluna nova se timestamp atual for suficiente. |
| **LPR-A03** | **ALTA — intervalos de escalões sobrepostos são persistidos** | `lib/listas-precio/formulario.ts:73-78` calcula `advertencias.escalonesSuperpuestos`; `lista-precio-form.tsx:649-699` só mostra alerta; `submit:350-390` valida limites individuais, **não barra sobreposição**; `lib/listas-precio/shared.ts:96-103` valida somente `max >= min`. `NEX-018:26-30` também não impõe não-sobreposição de faixas do mesmo item. É possível gravar 1–10 e 5–15 para o mesmo produto, gerando seleção de preço ambígua quando os escalões forem aplicados. | Rejeitar **no servidor** sobreposição entre escalões do mesmo item, com erro por produto/faixa, e na UI exibir erro antes de salvar. Permitir intervalo contíguo sem conflito conforme limites inclusivos documentados (`min seguinte > max anterior`), um único aberto ao infinito. Testar pedido direto e importação. Não criar nova regra de desconto. |
| **LPR-A04** | **ALTA — código da lista de referência mutável** | `PROGRESSO-NEXIT-V1.md` item 5 especifica `REF-VENTA` com código **imutável**. Porém `app/(private)/listas-precio/_components/lista-precio-form.tsx:453-455` deixa `codigo` editável mesmo `bloqueada`, e `app/api/listas-precio/[id]/route.ts:177-199` valida tipo/preço fixo/estado/alcance mas não proíbe código diferente, enquanto `columnasLista` inclui `codigo`. O CHECK `NEX-017:67-68` também não protege o código. | Exigir no backend `codigo` igual ao valor persistido para `es_referencia` e tornar o campo readonly na UI. Regressão PUT direto renomeando `REF-VENTA` deve falhar sem reescrever itens; manter criação automática `LP-nnn` para listas normais. |
| **LPR-A05** | **MÉDIA/ALTA — troca de moeda prometida mas bloqueada pela integridade vigente** | `lista-precio-form.tsx:467-479` confirma mudar a moeda com produtos cargados, dizendo apenas que não converterá importes; porém o PUT faz UPDATE da moeda **antes** de `borrarHijos` (`[id]/route.ts:193-202`), e trigger `NEX-018-listas-precio-integridad.sql:75-86` rejeita mudança enquanto haja item na moeda antiga. Confirmar no navegador não permite completar essa transação. | Escolher o caminho mínimo V1: **impedir troca de moeda de lista com itens** (mensagem por campo e orientação para remover/recriar preços manualmente sob operação distinta) ou implementar fluxo transacional explícito e seguro que respeite o trigger, nunca conversão automática nem recálculo silencioso. Testar lista com/sem itens e edição de outro campo. Não editar NEX-018 aplicada. |
| **LPR-A06** | **ALTA — unidade arbitrária aceita em item de preço** | `lib/listas-precio/shared.ts:108-116` recebe qualquer UUID sintaticamente válido em `p.unidadMedidaId`. Em `insertarHijos:294-304`, `coalesce(x.unidad_id, p.unidad_medida_id)` usa esse valor sem verificar correspondência à unidade-base/uma apresentação realmente pertencente ao produto. A FK de `NEX-008:64-86` garante somente que `unidades_medida.id` existe, **não** que represente aquele produto. O preço de referência lido por `v_producto_precio_referencia` não expõe essa unidade; Facturación usa preço referencial do produto sem unidade vinculada. | Impedir **nova associação de unidade incompatível** com o produto no backend; preservar referências históricas não alteradas sem reprecificar ou apagar. Distinguir unidade-base e futura apresentação, sem criar sistema de preços por apresentação nesta tarefa. Testar UUID de unidade existente porém pertencente a outra semântica do produto e caso histórico inalterado. Respeitar U10: não recalcular preços automaticamente. |
| **LPR-A07** | **MÉDIA/ALTA — sair pelo menu lateral perde rascunho** | `lista-precio-form.tsx:176-189` usa `beforeunload` e confirma manualmente somente os `Link` internos `/listas-precio` nas linhas `408,425,918`; não usa o hook `useProtegerCambios` já utilizado em Productos/Clientes/Proveedores. Navegar pelo sidebar SPA não dispara `beforeunload`, então o rascunho pode desaparecer. | Reutilizar proteção de links internos do projeto, sem duplicar avisos nos próprios links. Preservar saída limpa após salvar e confirmar ao sair/cancelar/recarregar apenas quando há diferenças efetivas. Teste manual browser 375/768/1440 + sidebar; botão Atrás do Next App Router tem limitação conhecida documentada. |
| **LPR-A08** | **MÉDIA — cadeia de listas base pode ficar incoerente após editar o cabeçalho de uma base** | `lib/listas-precio/shared.ts:219-250` valida tipo/moeda da **base escolhida pela lista editada**, e ciclos de descendência. Porém `PUT` não verifica se a lista que está sendo alterada **já é base de outras listas** quando seu `tipo_lista`/`moneda_codigo` muda. Assim uma lista com derivadas pode passar a ter tipo/moeda incompatível com suas filhas mesmo se o trigger NEX-018 não a bloquear por itens próprios (p.ex. lista-base sem itens). | Antes de mudar moeda/tipo, identificar dependentes diretos da lista no mesmo tenant e impedir alteração incompatível com mensagem, sem atualizar descendentes automaticamente. Testar A(base VENTA/PYG)→B derivada VENTA/PYG, A sem itens troca para COMPRA/USD: deve falhar. Não introduzir aplicação efetiva de regras de preços de venda. |

### III. Observações importantes NÃO classificadas como bugs novos para correção automática

- **LPR-X01/X02/X03 — decisões U09/U10:** ainda há lacuna de preço por versão de apresentação e sincronismo simples do vínculo `lista_precio_items.unidad_medida_id` ao mudar unidade-base. O responsável **já recusou revisão obrigatória, bloqueio de venda e recálculo automático de preço na V1**. Não reabrir decisão nem implantar motor de precificação por Caja/Paquete. Exigir apenas consistência mínima de novos registros (LPR-A06); preservar preço nominal/históricos.
- **Faturação eletrônica ainda utiliza referência e não tabela comercial:** `lib/facturacion/emision.ts:82-93` consulta `v_producto_precio_referencia`, **não** escolhe listas comerciais com prioridade/grupo/zona/quantidade. `PROGRESSO-NEXIT-V1.md` item 5 explica que aplicação de regras em vendas pertence ao módulo futuro de vendas. Registrar **lacuna de integração futura**, não afirmar que outras listas automaticamente determinam o preço da FE da V1.
- **Visibilidade de custo sob alcance de depósitos requer alinhamento:** `GET /api/listas-precio?modo=catalogos` usa `v_producto_costo_promedio` de NEX-017, que agrega `inventario_costos` de **todos os depósitos** por empresa. Produtos/Stock passaram a respeitar alcance de leitura. É fato técnico, mas se quem pode `LISTAS_PRECIO.VER` está autorizado a ver o custo empresarial agregado é questão de política de acesso (a confirmar, sem reabrir perguntas automáticas). **Não afirmar vazamento entre empresas**: query filtra `p.empresa_id` e a view usa chave da empresa. Testar com usuário de depósitos ASIGNADOS quando homologar.
- **Trilha histórica de preços:** o esquema `NEX-008` não modela versões históricas por vigência da mesma lista/produto (há UNIQUE por lista/produto). Não inventar versionamento abrangente na V1; `LPR-A01` é a correção imediata de perda desnecessária de IDs e `creado_at`, não autorização para criar módulo de histórico comercial.
- **Escala, câmbio e regras:** importações massivas, descontos acumulados, prioridade de regras e taxa de câmbio manual são requisitos distintos. A decisão oficial de câmbio **é manual**, e não autoriza conversão automática de listas, nem integração bancária. Não criar funcionalidades desses assuntos dentro de correções de estabilidade.

### IV. Cobertura e encaminhamento

**Verificações estáticas positivas:** isolamento por `empresa_id` da sessão em GET/POST/PUT, `LISTAS_PRECIO.VER/CREAR/EDITAR`, transações/rollback, códigos `LP-nnn` sob advisory lock, referências de regra por tipo/empresa verificadas pelo trigger NEX-018, anticiclo em lista base, preço referência de Productos compartilhado sem duplicação de estrutura, margem bruta calculada sem `Infinity` em preço zero, alerta de produto ativo sem preço, IVA/mode/flags comerciais preservados. **Não confundir com homologação PostgreSQL ou HTTP.**

**Prioridade recomendada futura:** LPR-A01/A02 (integridade e concorrência), A03 (escala), A04 (REF-VENTA), A06 (unidade), depois A05/A07/A08. Corrigir sem reimplementar campos e módulos existentes. **Nenhuma tarefa de implementação foi liberada ao Claude por esta auditoria**; ele continua a rodada de Proveedores + Catálogos de Productos. Ao receber o retorno desse commit, auditar primeiro a entrega e só então emitir nova autorização de Listas de Precios.

**Testes desta auditoria:** 0 verificações executadas, 0 build/lint, 0 PostgreSQL/API/VM/browser, 0 screenshots novos. Testes de `PROGRESSO-NEXIT-V1.md` pertencem a fases anteriores e não foram reexecutados. `NEX-018` consta como aplicada no `nexit` real conforme registro do responsável, **não reexecutar nem alterar**. `NEX-052/053` permanecem versionadas, não aplicadas segundo o progresso atual; validar estado efetivo com o responsável antes de qualquer aplicação.

**Estado:** AUD-LPR-R01 **AUDITORIA ESTÁTICA DOCUMENTADA; LISTAS DE PRECIOS ABERTA / NÃO HOMOLOGADA**. Nenhuma alteração de código funcional, SQL, migrations ou VM realizada pelo ChatGPT.
