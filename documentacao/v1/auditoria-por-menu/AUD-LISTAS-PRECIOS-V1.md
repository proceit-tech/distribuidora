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

## V. HANDOFF CONJUNTO AUTORIZADO — Listas de precios + um ajuste residual em Catálogos de Productos (12/10/2026)

**Autorização do responsável:** auditar o commit de Catálogos `f93cf7eb97f259707665e2cb28f73c2be1561e33`, identificar somente eventuais correções reais e encaminhar **junto com Listas de Precios** ao Claude Code. Parecer canônico `AUD-CATALOGOS-PRODUCTOS-V1.md` §VII: cinco achados com aceite estático, um residual CAT-R02-01, sem homologação PostgreSQL/browser. Proveedores commit `f5bf07e02ea7d6ee6b3f39bb4e0c3b8abcb4234c` **não é escopo desta implementação**, a menos que haja regressão provada por teste de integração.

### Achado adicional de Listas identificado durante a preparação do handoff

**LPR-A09 — ALTA / campo novo pode reutilizar vínculo INATIVO apenas porque o UUID constava em outro lugar da lista:** `lib/listas-precio/shared.ts:261-281` constrói `previas` com **TODOS os UUIDs** das FKs de cabeçalho, mais os UUIDs de todas as regras, SEM campo nem tipo de aplicação. Depois `verificar(tipo,id,campo,etiqueta)` permite inativo se `previas.has(id)` for verdadeiro. Exemplo: uma lista mantém historicamente o `cliente_id=X` inativo; um operador pode inserir **nova** regra `CLIENTE/X` sem seleção ativa; `previas.has(X)` autoriza porque X já aparece no cabeçalho, embora **essa regra seja nova**. O mesmo ocorre se mover referência antiga para outro campo/regra de igual domínio. **Correção mínima:** exceção de inativo permitida somente se `tipo/posição lógica/ID` da vinculação histórica da mesma lista for mantido **inalterado**; novos vínculos exigem `activo=true`, mesmo com UUID já usado em outro contexto; manter validação por empresa e FK. Para regras, preferir ID persistente da própria regra ou comparação comprovada sem depender de posição do array (pois mudar ordem não significa nova regra), considerando a sincronização seletiva de LPR-A01. Testes positivos de legados inalterados e negativos nova regra com ID antigo, troca de campo, outra empresa.

### Escopo único de implementação de Listas de Precios

Corrigir **LPR-A01…A09**, priorizando integridade e salvamento com recorte enxuto V1, usando as evidências da seção II:

1. **A01 — persistência incremental de filhos:** parar de apagar/recriar toda linha de preço, escalão e regra em qualquer PUT. Preservar `id`/`creado_at` inalterados, atualizar só o que mudou, inserir só os novos e tratar exclusões explícitas. Testar também lista `REF-VENTA` integrada com Productos; se o cliente enviou um item histórico inativo que continua inalterado, não perdê-lo. Sem motor novo nem migration a priori.
2. **A02 — versão obrigatória e conflito 409:** comparar `actualizado_at` com microssegundos, depois do lock, antes de escrita; manter o rascunho local. **ATENÇÃO à integração com Productos:** `producto_fijar_precio_referencia` da NEX-017 pode atualizar diretamente `lista_precio_items` sem alterar `listas_precio.actualizado_at`. Uma proteção apenas pelo timestamp do CABEÇALHO não detecta preço referência alterado por Productos entre GET e PUT da lista. A correção de A01 deve garantir que edição apenas de cabeçalho NÃO restaure preços antigos; se um preço do mesmo item estiver sendo editado por dois canais, demonstrar proteção de versão/snapshot adequada **sem criar migração nem fluxo grande por presunção**; se realmente impossível dentro do contrato atual, reportar bloqueio preciso e entregar o restante.
3. **A03 — escalões sobrepostos:** bloquear **no backend e formulário** faixas inclusivas que se sobrepõem para o mesmo produto; indicar campo/faixa, sem SQL histórico editado.
4. **A04 — `REF-VENTA` imutável:** proteger `codigo` do registro de referência no backend; UI readonly. Não bloquear edição dos PREÇOS da referência (integração já aprovada).
5. **A05 — moeda de lista com itens:** mensagem simples e bloqueio coerente com NEX-018; sem conversão automática nem ação que prometa sucesso e bate no trigger. Preservar edição comum de lista sem alterar moeda.
6. **A06 — unidade comercial coerente:** impedir nova unidade de medida arbitrária incompatível com produto; manter unidade histórica gravada/valor nominal quando não alterados. Não implementar preço por versão de apresentação, fator de caixa, recálculo ou aprovação. Validar empresa e catálogo da unidade de modo seguro.
7. **A07 — guardar rascunhos:** usar `useProtegerCambios` oficial nos links laterais e saída sem duplo aviso; limpar o guard após gravar sem perda de dados.
8. **A08 — lista base com derivadas:** bloquear mudança incompatível de tipo ou moeda se esta lista for base de outras da mesma empresa; sem alterações automáticas nas derivadas. Testar também encadeamento simples A→B→C.
9. **A09 — vínculo inativo por campo/regra:** distinguir referência já usada **no mesmo contexto histórico** de nova vinculação com UUID reaproveitado. Não enfraquecer a validação de tenant do NEX-018.

**Outros assuntos expressamente FORA deste pacote:** política nova de descontos, precedência comercial de motor de vendas, precificação por Caja/Paquete ou versões U09, câmbio automático, precificação por moeda estrangeira derivada, revisão obrigatória ou bloqueio de venda após troca de unidade U10, histórico de preço empresarial com novas tabelas, redesenho geral, paginação em servidor e dashboards. O usuário já definiu que na V1 a troca de unidade-base não impõe revisão nem recalcula preços. Não reabrir decisões comerciais em série.

### Escopo residual Catálogos de Productos

**Corrigir APENAS CAT-R02-01**, conforme `AUD-CATALOGOS-PRODUCTOS-V1.md` §VII: quando `cargar()` retorna falha da lista principal, não deixar permissões antigas habilitarem `Nueva`/`Guardar` nem manter formulário antigo gravável; quando há `errorAuxiliar` ou `cargando` e formulário já aberto, não deixar `guardar()` enviar POST/PUT. **Preservar o rascunho** até recuperação dos dados e explicitar erro. Os demais CAT-A02…A06 já tiveram aceite estático; não reimplementar.

### Preparação obrigatória, segurança e entregas

- Antes de codificar: `git status`, confirmar `feature/NEXIT-2026-001-banco-demo`, `git fetch`/sincronização segura e leitura integral **atual** de `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, trechos pertinentes `PROGRESSO-NEXIT-V1.md`, `AUD-LISTAS-PRECIOS-V1.md` §I–V, `AUD-CATALOGOS-PRODUCTOS-V1.md` §VII, migrations/SQL oficiais NEX-008/017/018/020/044 e APIs relevantes de Productos/Facturación. GitHub é fonte da verdade; implementador = Claude Code, auditor = ChatGPT, aplicação/validação operacional = responsável humano.
- Nenhum acesso à VM, PostgreSQL real, Docker, SIFEN ou deploy. NEX-001…053 não devem ser editadas, reaplicadas ou reescritas; NEX-018 já aplicada segundo progresso do responsável. Não criar migration para problemas resolúveis no servidor. Se houver necessidade estrutural real, justificar e pedir autorização ANTES de preparar SQL.
- Atualizar **somente** `PROGRESSO-NEXIT-V1.md` se necessário; **Claude não edita arquivos `AUD-*`** nem abre documentação duplicada. Commits separados: um de Listas de Precios e um do residual Catálogos, push na branch oficial, sem misturar Proveedores.
- Testes positivos, negativos e regressivos: API PUT duas abas, conflito ao modificar preço em Productos enquanto a lista está aberta, filhos com IDs persistentes, escalões sobrepostos por request direto, código `REF-VENTA`, unidade e moeda inválidas, links laterais dirty, referências inativas e multiempresa; Catálogos com HTTP 401/403/500 e falha auxiliar em form já aberto. Rodar `tsc`, ESLint e `next build`; informar quantidades/falhas, distinguir testes simulados de PostgreSQL/browser reais.
- **PARAR** após commit/push e informar somente resultados, bloqueios demonstrados, testes e SHAs completos. ChatGPT revisará os commits; responsável valida banco e telas. Menus continuam NÃO HOMOLOGADOS até validação humana.

**STATUS:** handoff conjunto de estabilização autorizado; **ainda não implementado pelo Claude**. Nenhum SQL/deploy/teste operacional executado por ChatGPT nesta auditoria.


## VI. AUD-LPR-R02 — revisão independente do commit de estabilização (12/10/2026)

**Commit funcional:** `5d965eff8dce7f7f856995b90445e8b94be480f7`. **HEAD de partida consultado:** `96bbe6cc1a1acc056618a5f5c4ae9c9e9155fbf7`; branch `feature/NEXIT-2026-001-banco-demo`. Consultados protocolos atualizados, progresso, diff, formulário e tipos, `app/api/listas-precio/[id]/route.ts`, `lib/listas-precio/{shared,formulario,calculos,estabilizacion.casos}.ts`, estrutura SQL NEX-008/017/018 e integração de Productos. Auditoria de código estática pelo ChatGPT: **0 testes executados de forma independente, 0 PostgreSQL, 0 browser, 0 VM/Docker**. Claude informou **2272 verificações locais, 0 falhas, tsc/ESLint dos editados/build OK**; esses números são **relatados, não reproduzidos por esta auditoria**.

### Matriz de verificação da entrega

| Achado anterior | Parecer estático | Evidência e limite |
|---|---|---|
| **LPR-A01** | **IMPLEMENTADO COM RESSALVA** | `planificarHijos` e `aplicarHijos` diferenciam atualizações, inclusões e exclusões; UPDATE por `id` com `IS DISTINCT FROM` preserva `id`/`creado_at` dos filhos retidos. Falta proteger versões dos itens **removidos** (LPR-R02-01 abaixo). |
| **LPR-A02** | **PARCIAL — ALTA ABERTA** | `GET` entrega versão µs da lista e de cada preço; `PUT` exige versão da lista, bloqueia cabeçalho `FOR UPDATE` e compara preços **enviados/retidos**. Detecta preço alterado, adicionado ou eliminado que continue listado na tela. Porém não compara a versão do preço que o operador excluiu localmente antes de enviar. Não declarar A02 encerrada. |
| **LPR-A03** | **ACEITE ESTÁTICO** | `tramosSuperpuestos` usado pelo formulário e `prepararLista`, com intervalos inclusivos. Rejeição com campo de erro; testes relatados são simulados. |
| **LPR-A04** | **ACEITE ESTÁTICO** | `validarCodigoReferencia` impede renomear lista `es_referencia`, e código permanece readOnly no formulário; preços editáveis. |
| **LPR-A05** | **ACEITE ESTÁTICO** | `validarCambioMonedaTipo` bloqueia moeda se há itens persistidos; formulário desabilita seletor nas listas com itens. Dependente de PG para atestar trigger. |
| **LPR-A06** | **ACEITE ESTÁTICO** | `validarUnidadesItems` confere unidade-base ou `producto_unidades` da empresa para associação nova ou alterada. Histórica sem alteração é preservada. |
| **LPR-A07** | **ACEITE ESTÁTICO** | `useProtegerCambios(sucio)` protege links SPA e recarga (limite conhecido do botão Atrás no App Router). |
| **LPR-A08** | **ACEITE ESTÁTICO** | `validarCambioMonedaTipo` rejeita mudança de tipo ou moeda em lista com derivadas. |
| **LPR-A09** | **ACEITE ESTÁTICO** | `validarReferenciasComerciales` usa campo de cabeçalho ou mesmo ID de regra com tipo+referência iguais para preservar vínculo histórico inativo. Novo vínculo exige ativo. |

### LPR-R02-01 — ALTA: exclusão obsoleta de preço não verifica sua versão

**Prova em código:** `app/(private)/listas-precio/_components/lista-precio-form.tsx:369-370` envia `itemsCargados` como **somente os IDs inicialmente carregados**; o item removido do formulário já não consta em `productos`. Em `lib/listas-precio/shared.ts:468-516`, a versão do banco (`db.version`) só é comparada dentro do loop de **`d.productos`**, para preços que permanecem no payload (`:502-504`). Em seguida `plan.itemsEliminar = dbItems.filter(x => !retenidos.has(x.id))` (`:516`) elimina todos os não retidos, **sem comparar versão do item excluído**. `aplicarHijos:570-574` efetiva o DELETE.

**Cenário mínimo:** A abre `REF-VENTA` com o item P (versão V1). A remove P da lista local. B altera o preço P em Productos (a função `producto_fijar_precio_referencia` faz UPSERT e atualiza `actualizado_at`, NEX-017:108-112), mas não altera a versão do cabeçalho. A salva qualquer edição com cabeçalho válido e `itemsCargados=[P]`, porém sem P em `productos`. O planejamento constata a presença do ID no banco, mas não compara V1×V2: DELETE do preço **alterado por B**, com commit. Isso viola explicitamente a promessa de LPR-A02 e pode retirar a referência atual de Productos. Analogamente, se B já excluiu P e A também removeu P do rascunho, o desaparecimento de ID originalmente carregado não é acusado pelo código atual.

**Aceite mínimo:** registrar no contrato do formulário a versão original de **todos** os itens carregados (incluindo os removidos localmente); `PUT` deve validar **conjunto completo de IDs e versões** sob lock antes de qualquer escrita. Toda inclusão, alteração ou exclusão externa posterior ao carregamento, inclusive item retirado do rascunho, devolve **409 sem gravar cabeçalho, itens, escalões ou regras**. Rejeitar pedido incompleto/malformado de versões; preservar mensagem por campo e rascunho. Não criar migration nem mudar política de preços. Regressões obrigatórias: remoção intencional sem intervenção externa (sucesso), item removido no rascunho e depois alterado por Productos (409), item removido no rascunho e depois excluído por Productos (409), inclusão externa (409), alteração de item retido (409), lista vazia (sucesso), POST inicial sem token de edição (sucesso). Testar rollback e simular cenários de concorrência; registrar ausência de prova transacional real.

**Veredito R02:** **CORREÇÃO SOLICITADA — 1 defeito ALTA confirmado, LPR-A02 ainda não encerrado.** Demais ajustes com aceite **estático somente**, pendentes de PostgreSQL real e validação operacional humana. Não classificar menu como HOMOLOGADO.


## VII. AUD-LPR-R03 — reauditoria da correção LPR-R02-01 (13/10/2026)

**Commit implementado:** `4845a8c89579ea81258a23875b9e238bb8e25fbf`. **HEAD-base da revisão:** `3442885d0352fbac21e85d3d3ed5462dd86c1e76` na branch oficial. Auditoria independente do diff, contrato da tela, helper, `prepararLista`, `planificarHijos`, PUT, testes com conexão simulada, migrations NEX-008/017/018 e protocolo atual. **Testes realizados pelo ChatGPT: 0 automatizados, 0 PostgreSQL, 0 navegador, 0 VM/Docker.** Claude relatou **2282 verificações** após o commit de Listas (0 falhas; +10 nesta rodada) e **2316** após o commit subsequente de Catálogos; TypeScript, ESLint e build relatados sem falha. Não reproduzidos pela auditoria independente.

### Matriz de revalidação

| Critério LPR-R02-01 | Evidência de implementação no SHA | Parecer |
|---|---|---|
| Foto completa de preço carregado, mesmo excluído do rascunho | `lista-precio-form.tsx:369-370` envia `itemsCargados: [{id,version}]` usando **`initial.productos`**, não `form.productos`; `types/lista-precio.ts` atualizado | **ACEITE ESTÁTICO** |
| Forma do contrato/duplicação/id e versão | `lib/listas-precio/concurrencia.ts:12-34` valida UUID, timestamp µs, coleção, unicidade. `shared.ts:190-194` emite 400 para malformação | **ACEITE ESTÁTICO**; relação ausente retorna 409 antes de qualquer escrita, como previsto |
| Conflito por inclusão/alteração/exclusão externos inclusive item excluído na tela | `planificarHijos` `shared.ts:472-491` lê todos os preços com `FOR UPDATE`, depois usa `conflictoItems` antes de planejar/mutar, retornando 409 por diferenciação exata de ids e versões | **ACEITE ESTÁTICO** |
| Nenhum header/filho é escrito quando conflito | `app/api/listas-precio/[id]/route.ts:166-219`: lock da lista, versão, validações, **plano**; apenas depois UPDATE cabeçalho e `aplicarHijos` dentro de BEGIN/COMMIT | **ACEITE ESTÁTICO**; rollback transacional sob concorrência real não comprovado sem PostgreSQL |
| Regressões de preço removido, alterado e apagado por Productos, inserção externa, solicitação malformada, lista vazia | `lib/listas-precio/estabilizacion.casos.ts:375-430` contém casos com tabela simulada e asserções de 409/400 e ausência de escrita | **COBERTURA ESTÁTICA IDENTIFICADA**; não é teste real de bloqueios PostgreSQL |

**Resultado:** **LPR-R02-01 RESOLVIDO NA AUDITORIA ESTÁTICA; nenhum achado novo confirmado no escopo da correção.** Os achados de estabilização LPR-A01…A09 permanecem com aceite estático condicionado às provas operacionais; não foi detectada regressão da presente correção. **LISTAS DE PRECIOS NÃO HOMOLOGADO.** Para encerrar o menu operacionalmente, o responsável ainda deve conferir na aplicação publicada e no PostgreSQL real autorizado casos de duas sessões concorrentes, atualização de preço em Productos, versão 409, rollback e preservação de preços/histórico, com precauções de dados/backup. Não orientar Claude a reimplementar R02-01 sem falha demonstrada.


## VIII. Auditoría actual — Listas de precios DESKTOP (18/10/2026)

**Corte Git actual:** `25f2844d1a18171c2520850ca7379c879d937438`. Informe de la nueva secuencia por menús: [AUD-NEXIT-LISTAS-PRECIOS-DESKTOP-R01](../../testes/AUD-NEXIT-LISTAS-PRECIOS-DESKTOP-R01-2026-10-18.md). Las secciones anteriores I–VII constituyen historial: en particular **LPR-A01…A09 y LPR-R02-01 se corrigieron en código y recibieron aceite estático R03**; NO son defectos actuales pendientes sin nueva evidencia. No se declararon homologaciones PostgreSQL o navegador.

**Regla actual:** producto **solo desktop**; no exigir UI móvil. Documentar un menú por vez; no emitir tarea para Claude ni modificar módulos ajenos sin orden expresa. No ejecutar VM, PostgreSQL, build/tsc/lint global o suites por defecto.

| ID | Prioridad | Hallazgo vigente 18/10/2026 | Estado |
|---|---|---|---|
| **LPR-D01** | **ALTA** | `/listas-precio/nuevo` hereda `guardPage(LISTAS_PRECIO, VER)` y `GET ?modo=catalogos` exige VER aunque `POST` usa CREAR; CREAR-only no puede realizar alta | ABIERTO |
| **LPR-D02** | **MEDIA** | Listagem ofrece «Nueva lista» sin CREAR y ficha editable/salvable sin EDITAR, aunque las APIs guardan autorizaciones | ABIERTO |
| **LPR-D03** | **MEDIA** | Estado visual `getEstadoReal` marca BORRADOR/INACTIVA con fin pasado como VENCIDA; resumen «disponibles para operar» cuenta ACTIVA con inicio futuro y fecha local del navegador | ABIERTO |
| **LPR-D04** | **MEDIA** | Si fallan catálogos de moneda/productos/referencias, formulario mantiene Guardar habilitado y presupone moneda-base PYG antes de conocer la real | ABIERTO |

**Observaciones no clasificadas como defectos comprobados:** confidencialidad de `costoPromedio` bajo permiso LISTAS_PRECIO.VER requiere política explícita de roles; `numeric(18,4)::float8` y `Number` merecen pruebas límite de precisión monetaria antes de declarar pérdida real; listado entero sin paginación SQL aún sin medir; confirmaciones nativas ya existen; GET cabecera/hijos no ofrece snapshot transaccional explícito (validar caso concurrente si hay síntoma, sin alegar corrupción confirmada).

**Preservar:** ID+versión de todos los precios originalmente cargados, incluso eliminados en borrador; comparar bajo locks y rechazar 409 sin escrituras, retener IDs de hijos, guardas NEX-018 moneda/cotas/tenant, `REF-VENTA` inmutable excepto precios, refs comerciales inactivas históricas, unidad-base/presentaciones, no convertir moneda silenciosamente, sin nueva política de U09/U10 ni cambio fiscal. El registro de migraciones real no fue consultado por esta auditoría.

**Resultado:** auditoría estática independiente de este menú DOCUMENTADA CON **1 ALTA + 3 MÉDIAS ABIERTAS**, NO HOMOLOGADA; ningún cambio de código, SQL, tests, VM ni deploy. **Próximo menú:** Catálogos comerciales, separado.


## IX. Listas de precios DESKTOP — AUD-R02 revalidada (19/10/2026)

**Relatório:** [AUD-NEXIT-LISTAS-PRECIOS-DESKTOP-R02](../../testes/AUD-NEXIT-LISTAS-PRECIOS-DESKTOP-R02-2026-10-19.md). **HEAD revisado:** `3ce1cccfe5740fe8c48b1c43821371c8792fa996`; comparado à R01 `25f2844d1a18171c2520850ca7379c879d937438`, **11 arquivos centrais** das páginas/layout, formulário, endpoints GET/POST/PUT, serviços e testes possuem blobs SHA idênticos. **1 achado ALTA e 3 MÉDIAS continuam ABERTOS, sem homologação operacional.**

| Achado | Severidade | Evidência atual | Correção mínima |
|---|---|---|---|
| **LPR-D01** | **ALTA** | `listas-precio/layout.tsx` exige VER para `/nuevo`; `GET /api/listas-precio?modo=catalogos` verifica VER antes de sua finalidade, mas POST exige CREAR. Depois do alta, redireciona a listagem VER. | Criar com CREAR-only sem habilitar consulta de listas/fichas; catálogo mínimo com autorização específica e destino pós-alta seguro. A resposta atual inclui clientes, produtos e **costoPromedio**: não liberar GET integral ao criador nem presumir política de custo/depósitos; impedir bypass por query inválida/vazia. |
| **LPR-D02** | **MÉDIA** | Lista mostra links `Nueva lista` sem checar CREAR; ficha chama `mode="edit"` e permite `Actualizar lista` mesmo só com VER, e PUT exige EDITAR. | Exibir ações por permissão real do servidor; ficha VER-only em consulta sem submit; manter acesso às leituras autorizadas e checks do backend. |
| **LPR-D03** | **MÉDIA** | `getEstadoReal` substitui BORRADOR/INACTIVA por VENCIDA com fim passado; KPI de ACTIVA + `activo` inclui listas de início futuro; cálculo usa timezone do dispositivo. | Separar situação administrativa/vigência, limitar disponibilidade ao intervalo **desde ≤ data de PY ≤ hasta**, só ACTIVA/habilitada; preservar BORRADOR/INACTIVA e classificar «Aún no vigente» quando necessário, sem alterar registros. |
| **LPR-D04** | **MÉDIA** | Falha de catálogos só escreve `error`, mas `submit`/Guardar não impedem tentativa; `monedaBase` usa fallback **PYG** antes de obter o valor real da empresa. | Estados `cargando/error/ok`, validar shape HTTP, bloquear envio em botão e handler enquanto catálogos indisponíveis, preservar rascunho e permitir retry; não mostrar PYG como base não confirmada, inclusive empresa USD. |

**Preservar** LPR-A01…A09 e LPR-R02-01 corrigidos/aceitos estaticamente nas revisões anteriores (identidade de itens, versão µs do cabeçalho e todos os itens carregados, CAS/409, sincronização seletiva, REF-VENTA, escalões, moeda, base, unidade e referências históricas), migrations NEX-008/017/018, decisões U09/U10 e regras atuais de FE; não refazer o motor de preços. Observações LPR-O01…O05 mantidas como políticas ou verificações operacionais, não novas falhas certas.

**Evidência:** leitura estática da branch no GitHub, **0 testes executados** pelo ChatGPT, sem React/browser/HTTP real, PostgreSQL/VM/Docker, SQL/migration, build/tsc/lint global, CI, deploy. **PRO-70 In Review, quatro correções individuais em Todo, não Done, LISTAS DE PRECIOS NÃO HOMOLOGADO.** Claude só implementa se responsável autorizar; testes **curtos** e reauditoria ChatGPT R03 após SHA. Não avançar Catálogos comerciales automaticamente.


## X. AUD-R03 — reauditoria independente de Listas de precios, 19/10/2026

**Relatório:** [AUD-NEXIT-LISTAS-PRECIOS-DESKTOP-R03](../../testes/AUD-NEXIT-LISTAS-PRECIOS-DESKTOP-R03-2026-10-19.md). Commits Claude `f691d7ff90eeed39923af8f90cd40f8c75e1d6e9` (funcional) e `f220ff4d25321b64e90cc4ee1b1570679541cef3` (contagem de testes), HEAD confirmado no último. **Parecer: LPR-D01/PRO-166, LPR-D02/PRO-167 e LPR-D04/PRO-169 conformes em auditoria estática dirigida; LPR-D03/PRO-168 parcialmente conforme — novo LPR-R03-01 MÉDIA.** **Menu NÃO HOMOLOGADO/NÃO ENCERRADO.**

- **D01 — aceite estático:** módulo pai admite VER ou CREAR; listado e detalhe exigem VER e alta CREAR. `lib/listas-precio/acceso-get.ts` restringe GET por finalidade, impede bypass de `modo=catalogos` duplicado ou extra; CREAR-only recebe opções simples/moeda-base sem listas, clientes, produtos e custos. Menu aponta /nuevo para perfil só CREAR; pós-POST confirmado oferece «Registrar otra lista» sem redirecionar para rota VER. POST/PUT e tenant seguem autorizados no servidor. **LPR-GATE-VISIBILIDADE pendente:** não há como selecionar cliente, lista-base ou produtos sendo apenas CREAR sem definição funcional de quais referências mínimas podem ser vistas; não liberar `costoPromedio` ou catálogo integral.
- **D02 — aceite estático:** GET listado retorna `crear` e GET detalhe retorna `editar` da sessão; CTA Nueva em duas posições condicionado a CREAR, ficha VER-only passa `soloLectura` com `fieldset disabled` dos campos comuns, abas continuam acessíveis, botão de salvar substituído por texto e handler faz early-return; ACL backend intacta.
- **D03 — aceite parcial:** `lib/listas-precio/vigencia.ts` separa BORRADOR/INACTIVA do calendário PY, faz vencimento inclusivo, etiqueta «Aún no vigente» e KPI disponíveis coerente com `hoyAsuncion`. **LPR-R03-01 MÉDIA:** em `_components/listado-listas.tsx`, `const hoy=useMemo(() => hoyParaVigencia(), [])` congela data ao montar; após meia-noite em Asunción, uma lista vencida pode continuar ACTIVA e no KPI sem remontar a tela. Atualizar a data de PY quando o dia virar/retomar foco, sem polling frequente ou SQL, com testes mínimos. Não reabrir classificações puras.
- **D04 — aceite estático:** `carga-catalogos.ts` estados CARGANDO/ERROR/CONFIGURADO, validação de HTTP+arrays principais e moeda-base não vazia, sem PYG presumido, bloqueio de Guardar no botão e no handler, retry local de carga sem perder rascunho; GET backend exige moeda real da empresa ou erro 500. Não houve navegador nem PostgreSQL.
- **Testes informados pelo Claude, não reexecutados pelo ChatGPT:** `listas-r02` 24/0, Listas estabilización 68/0, listas-comerciales 93/0, dashboard 46/0, productos-r02 61/0, clientes-r02 60/0 e proveedores-r02 36/0; lint/tipos pontuais OK. Testes de helper/fetch simulado e asserts estruturais; sem React/click, HTTP real, PG, VM, SQL/migrations, CI, build/lint/tsc global. Nenhum código funcional alterado pelo auditor.
- **Preservações:** LPR-A01…A09 e LPR-R02-01, ID+versão dos preços originais sob lock, 409/rollback, REF-VENTA, NEX-008/017/018, U09/U10, autorização/empresa, sem integração nova com FE/Stock. Linear PRO-166/167/169 In Review conformes estaticamente; PRO-168 In Review parcial; LPR-R03-01 técnica Todo e LPR-GATE-VISIBILIDADE funcional Todo até decisão. PRO-70 In Review, não Done.
- A próxima implementação, se o responsável autorizar, deve ser **somente R03-01**, seguida de AUD-R04 independente. `Catálogos comerciales` não iniciado automaticamente.
