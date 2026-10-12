# Auditoria por menu — Productos

**Rota principal:** `/productos`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado:** ABERTA — NÃO AUDITADA INTEGRALMENTE — NÃO HOMOLOGADA  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Productos**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.


## I. Contrato do menu e inventário de arquivos examinados

**Estado da passagem:** ANÁLISE ESTÁTICA APROFUNDADA PARCIAL; NÃO HOMOLOGADA e sem autorização de implementação. Fonte: branch GitHub lida em 12/10/2026; confrontada com SQL de leitura da VM fornecido pelo responsável (6 unidades comerciais sem vínculo SIFEN, 2 produtos UN).

**Telas reais do menu e sete abas identificadas em código:**
- Lista: `app/(private)/productos/page.tsx` (ainda precisa avaliação campo-a-campo); novo `app/(private)/productos/nuevo/page.tsx`; edição `app/(private)/productos/[id]/page.tsx`.
- Formulário `app/(private)/productos/_components/producto-form.tsx`, `campos.tsx`, `contexto.ts`, `producto-form.module.css`, `pestanas/{informacion,sifen,inventario,compras,logistica,kit,documentos,foto,repetidores}.tsx`. Abas: Información, SIFEN y códigos, Inventario, Compras, Logística, Alternativos/Kits, Documentos.
- Contratos, form state e validações lidos: `types/productos.ts` (estrutura identificada; revisão integral pendente), `lib/productos/{formulario,normalizar,shared,sincronizar}.ts`, `lib/fiscal/unidades-sifen.ts`; demais helpers/tests de `lib/productos` permanecem na matriz de leitura pendente.
- APIs examinadas diretamente, ao menos seus métodos, consultas, autenticação/autorizações e handlers principais: `app/api/productos/route.ts`, `app/api/productos/[id]/route.ts`, `app/api/productos/[id]/imagen/{route.ts,versiones/route.ts,versiones/[version]/route.ts,versiones/[version]/recuperar/route.ts}`, `app/api/productos/[id]/documentos/{route.ts,finalizar/route.ts,[docId]/route.ts,[docId]/restaurar/route.ts,[docId]/versiones/route.ts,[docId]/versiones/[version]/recuperar/route.ts}`. As oito rotas categoria/marca/família/linha usam handlers compartilhados em `lib/productos/catalogos-admin.ts`; auditar detalhadamente no arquivo próprio Catálogos de productos.
- DDL e normas confrontadas: `NEX-003-catalogos-globales.sql` (unidades_medida), `NEX-007-productos.sql` (produto/apresentações/fornecedores), `NEX-039-unidades-medida-sifen.sql` (34 oficiais), `NEX-040-productos-clasificacion-iva.sql` (IVA), `NEX-043-unidades-medida-sifen-nt023.sql` (30 adicionais); reconciliação separada `scripts/reconciliar-unidades-sifen-NEX-039.sql`, sem execução. Consultadas também `ESPECIFICACAO-AJUSTES-PRODUCTOS-V1-2026-10-12.md`, `MATRIZ-AUDITORIA-PRODUCTOS-V1-UI-API-DB-SIFEN-ERP-2026-10-11.md`, `MATRIZ-NORMATIVA-CAMPO-A-CAMPO-PRODUCTOS-V1-2026-10-11.md`.
- Ainda não houve leitura crítica exaustiva das 110 fontes candidatas (cerca de 0,9 MB), da referência normativa binária DNIT no ZIP, nem execução de testes ou navegador. Nenhum item não examinado é presumido correto.

## II. Achados fundamentados por arquivo/linha

| ID | Severidade | Prova do Git e comportamento | Diagnóstico / contrato de correção |
|---|---|---|---|
| PRD-A01 | **CRÍTICA / confirmada** | `app/api/productos/route.ts:122-126,150`: `catalogos.unidades` carrega `unidades_medida` ativas (somente 6 no banco); `pestanas/informacion.tsx:59-66` usa esse catálogo no campo `Unidad base`; `pestanas/compras.tsx:10-12,32,78` o reutiliza. NEX-039/043 disponibilizam **64** códigos fiscais em OUTRA tabela. | Os 64 códigos SIFEN não são selecionáveis em Productos. O modelo e UI precisam garantir opção fiscal real sem quebrar IDs de estoque/apresentação. |
| PRD-A02 | **CRÍTICA / confirmada** | `lib/productos/normalizar.ts:76-82` exige somente `unidadMedidaId`; `lib/productos/shared.ts:206` verifica existência/atividade da unidade, **não** `unidad_sifen_codigo`; `pestanas/sifen.tsx:83-99` (grupo unidade fiscal) mostra vínculo só leitura e informa que falta não impede gravação. `lib/facturacion/emision.ts:83-92` usa o vínculo para faturar. | Backend aceita produto sem unidade fiscal, impedindo sua emissão. Regra aprovada pelo responsável: toda unidade selecionável para produto faturável deve ser SIFEN. Exigir FK fiscal válida conforme decisão de transição, com mensagem por campo. |
| PRD-A03 | **ALTA / observação na VM confirmada** | Resultado da consulta do responsável: CJ, DOC, KG, LT, MT, UN sem `unidad_sifen_codigo`; UN referenciada por 2 produtos. `scripts/reconciliar-unidades-sifen-NEX-039.sql:11-25` já prevê relação criteriosa e auditada para cinco unidades, mas **não foi aplicado**; MT depende de decisão 87/108. | Não alterar seis unidades em massa às cegas nem reprocessar migrations. Preparar regularização idempotente, com histórico, somente após definição de códigos e autorização operacional. |
| PRD-A04 | **ALTA / confirmada** | `app/(private)/productos/_components/producto-form.tsx:79-84,212-235,286-294` calcula `sucio`, mas mostra links `Volver` e `Cancelar` sem qualquer bloqueio de navegação; não chama `useProtegerCambios` nem instala `beforeunload` nesse componente. | Alterações do formulário podem ser perdidas na navegação interna ou ao fechar a aba. Implementar proteção própria acessível, com modal do Nexit em navegação interna e aviso nativo apenas em fechamento/reload. |
| PRD-A05 | **ALTA / confirmada** | `producto-form.tsx:82-84` computa `sucio` somente do objeto `form`, excluindo `pendientes` (documentos aguardando envio) e `fotoPendiente`. | Usuário pode anexar arquivo/foto e sair sem nenhum alerta por dirty, além do caso geral PRD-A04. Estado de anexos deve compor alterações pendentes. |
| PRD-A06 | **ALTA UX / confirmada** | `pestanas/documentos.tsx:148,166,181` e `pestanas/foto.tsx:44-45,126,229` utilizam `window.confirm` para descartar/recuperar/excluir conteúdo. | Substituir em operações internas por confirmação modal consistente com Nexit. Preservar confirmação diferenciada para restauração/alterações duráveis e tratamento de abortos. |
| PRD-A07 | **MÉDIA/ALTA / falta de invariante confirmada; severidade de negócio pendente** | `pestanas/compras.tsx:41-44` somente avisa se apresentação marcada `Unidad base` usa outra unidade ou fator != 1; `lib/productos/normalizar.ts:159-186` exige fator >0 e no máximo uma base, mas não exige correspondência/fator=1. `NEX-007-productos.sql:99-120` também não impõe essa coerência. | Uma apresentação pode declarar-se unidade base com conversão contraditória. Definir regra: se `esUnidadBase`, unidade == base e fator exatamente 1; ou retirar flag redundante, mediante decisão de negócio. |
| PRD-A08 | **ALTA / contrato de alcance a confirmar** | `app/api/productos/route.ts:128-129` devolve depósitos da empresa sem filtro por sucursal/usuário; `app/api/productos/[id]/route.ts:160-166` devolve `stockPorDeposito` de todos os depósitos da empresa; telas Inventario usam esses resultados. | Existe filtro multiempresa, **mas não se vê restrição por alcance de sucursal nessas queries**. Confirmar regra de visibilidade estoque/depósitos por usuário e confrontar com RLS/funções; não declarar vazamento definitivo até revisão de segurança. |
| PRD-A09 | **MÉDIA / divergência normativa a decidir** | `lib/productos/normalizar.ts:89-99` limita `codigoSifen` a 20 e `descripcionFactura` a 120; `NEX-007:14,17` segue limites legados; documento `ESPECIFICACAO-AJUSTES-PRODUCTOS...` registra atualização NT009 dos limites E701/E708, mas proíbe alterá-los sem autorização. | Confrontar campo efetivamente usado no JSON do gateway com versão normativa aplicável; não aumentar limite de banco sem decisão nem alterar migration aplicada. |
| PRD-A10 | **MÉDIA / regra existente do produto versus SIFEN a confirmar** | `normalizar.ts:145-149` valida GTIN por dígitos e comprimento (8/12/13/14), sem verificação de dígito de controle GS1 nesse ponto. A matriz de requisitos anterior sugeria verificação quando aplicável. | Pergunta de contrato: validar checksum GS1 para GTIN antes do cadastro/envio? Ainda não classificar como defeito normativo obrigatório sem conferir DNIT/Gateway. |
| PRD-A11 | **ATENÇÃO / workflow assíncrono confirmado** | `app/(private)/productos/nuevo/page.tsx:23-80` cria produto por POST, depois tenta foto/documentos via requests separados e fecha a carga; em falha, mantém produto e direciona à ficha. `[id]/page.tsx:63-101` apresenta recuperação; sem transação distribuída. | Fluxo explícito tenta evitar duplicação; auditar idempotência das tentativas e possibilidade de arquivos parcialmente processados; não recomendar recriar produto ou rollback cego. |
| PRD-A12 | **ATENÇÃO / default tributário real** | `lib/productos/formulario.ts:95-98` deixa unidade sem selecionar, mas pré-seleciona imposto de 10% e `afectacionIva="1"` quando a taxa existe. `NEX-040` deixa `afectacion_iva NULL` em legados e impede inferir EXE. | Default de IVA pode ser útil comercialmente, mas é risco de classificação automática não percebida. Validar com responsável se IVA deve ser escolha explícita por produto novo e tipo de operação. |
| PRD-A13 | **POSITIVO / segurança existente** | `app/api/productos/route.ts:62-68,182-202` exige sessão e `PRODUCTOS.VER/CREAR`, abertura de estoque exige `MOVIMIENTOS.CREAR`; `[id]/route.ts:48,242,258-260` filtra empresa e bloqueia linha antes de editar; APIs privadas de documentos/fotos possuem decisões de ação. | Essas proteções existem, mas **não provam** cobertura total de autorização ou ausência de vazamentos em outros handlers. Testes negativos pendentes. |
| PRD-A14 | **ATENÇÃO / UX contrato de erro** | `app/(private)/productos/nuevo/page.tsx:82-88` e `[id]/page.tsx:119-133` rendem texto plano com `style={{padding:24}}` em estados de loading/erro/não encontrado. | Não seguem os componentes visuais e estados padronizados que o responsável exige; avaliar em 1440/768/375 e substituir por padrões sem alterar negócio. |

## III. Percurso por aba (status factual)

| Aba | O que foi examinado | Faltas para encerrar |
|---|---|---|
| Información | Campo unidad base, categoria/família/linha, edição/cancelamento, preço referência e fiscal resumo | Todos os handlers, campos, máscaras, erros, persistência 1:1 e screenshots |
| SIFEN y códigos | Exibição só leitura de unidade fiscal, classificação de IVA, codigos GTIN e gatilhos NEX-039/040 | Validação DNIT/gateway por campo, confronto integral de 64 códigos, E701/E708, testes negativos |
| Inventario | Stock mínimo/controle, abertura real, depósitos e saldo por depósito; lógica de permissão de abertura | Contrastar branch scope, lotes/séries, invariante min/max, movimentos e triggers |
| Compras | Apresentações, conversões, fornecedores, fatores e permissões indiretas | Confirmar semântica exata da base, preço/quantidade por apresentação e regra de GTIN de embalagem |
| Logística | Rota de aba, campos da DDL, referência a merma/quiebra na documentação | Revisar todos os handlers e implicações fiscais/estoque sem inventar automação |
| Alternativos y kits | Rota de aba, SQL `producto_componentes` e sincronização; algumas proteções | Dependências de baixas, ciclos de KIT e regras de venda/estoque ainda não aprovadas |
| Documentos | APIs POST/GET/PUT, recuperar/restaurar/versões, foto privada, fluxo pós-criação e janelas nativas | Auditoria completa de storage, retenção, grants, concorrência, autorização por ação e execução real |

## IV. Contrato de dados transversal

- `productos.unidad_medida_id`, `producto_unidades.unidad_medida_id` e `producto_proveedores.unidad_medida_id` são FKs UUID de `unidades_medida` (NEX-007). A tabela `unidades_medida_sifen` tem código inteiro oficial e `unidades_medida.unidad_sifen_codigo` (NEX-039). A UI **não pode simplesmente substituir ID UUID por código 77/131**, porque quebraria esses contratos. A migração deve ser desenhada para compatibilidade, com opção de escolha direta para o operador.
- `NEX-039` (34 entradas) e `NEX-043` (30 entradas) são migrations executadas e imutáveis. Não editar nem reaplicar. A eventual NEX-052 só pode acrescentar esquema/dados se houver decisão aprovada e verificação prévia do runner (checksums, `--solo-listar`).
- Uma unidade não é uma conversão: nome `Caja` ou `Docena` não autoriza multiplicador 12. O fator é dado por apresentação de cada produto e precisa continuar explícito.
- `NEX-040` classifica `afectacion_iva` (1/2/3/4), mantém legados sem classificação e exige coerência com imposto 0/5/10. Não classificar EXE automaticamente.

## V. Decisões de negócio pendentes — NÃO ENCERRAR antes de responder

- **DEC-PRD-U01 — APROVADA PELO RESPONSÁVEL (12/10/2026):** a unidade histórica `MT — Metro` já existente no NEXIT deve mapear para SIFEN **108 — MT**. Os dois códigos oficiais **87 — m** e **108 — MT** permanecem disponíveis no catálogo para seleção, distintos por código. Não modificar migrations executadas nem atualizar VM automaticamente.
- **DEC-PRD-U02 — APROVADA PELO RESPONSÁVEL (12/10/2026):** novos produtos destinados à venda (`MERCADERIA` ou `SERVICIO` com `vendible=true`) **NÃO podem ser gravados sem os dados SIFEN obrigatórios aplicáveis e classificação IVA integralmente válida**. Exigir, no mínimo, unidade fiscal SIFEN válida/vigente, imposto/taxa e `afectacion_iva` (1/2/3/4) coerentes, e `proporcion_gravada_iva` quando E731=4. Campos SIFEN condicionais somente quando sua regra normativa exigir; não presumir que NCM/GTIN/DNCP sejam sempre obrigatórios. Validar no frontend E no backend POST, com erros por campo e sem criação parcial. Editar dados antigos, tratamento de produtos não destinados à venda e seleção explícita/default de IVA são decisões distintas, ainda pendentes de exame.
- **DEC-PRD-U03**: apresentação declarada base deve obrigatoriamente equivaler a unidade base do produto com fator 1? Recomendação: sim. Antes de mudar constraint, conferir registros legados.
- **DEC-PRD-U04**: classificação e GTIN de embalagens — precedência entre `codigoBarras`, `producto_codigos.esPrincipal` e `producto_unidades.codigo_barras`, antes de atribuir E706/E707 ao gateway.
- **DEC-PRD-U05**: abrangência do saldo por depósito para usuários com alcance de sucursal limitado; regra sugerida restritiva, mas requer confronto com autorização real.
- **DEC-PRD-U06 — APROVADA PELO RESPONSÁVEL (12/10/2026):** manter **IVA 10% — Gravado (E731=1)** como **padrão inicial** do formulário de novo produto, quando existir imposto de 10% ativo no catálogo. O usuário pode alterar imposto e afetação conforme o produto real (5%, Exento, Exonerado, Gravado parcial etc.), e o backend valida todas as combinações. Padrão selecionado **não dispensa** o contrato de completude fiscal obrigatória DEC-PRD-U02. Nunca aplicar default retroativo nos produtos históricos.

## VI. Revisões pendentes antes de considerar 100% do menu

- [ ] Ler criticamente TODOS os `app/(private)/productos/**` incluindo listagem/CSS/responsividade.
- [ ] Percorrer todos `app/api/productos/**`, `lib/productos/**`, `types/productos.ts`, autenticação/armazenamento compartilhados, com contratos HTTP/campos.
- [ ] Confrontar as regras existentes com documentos SIFEN/DNIT versionados, inclusive pacote binário, e separar vigência de proposta.
- [ ] Auditar todas as dependências de inventário, listas de preços, clientes/faturação; evitar alterar tabelas interligadas sem mapa de impacto.
- [ ] Revisar constraints/triggers/índices e SQL incremental NEX-003…051 em todos pontos de dependência, sem executar nem modificar SQL aplicado.
- [ ] Testes locais automatizados realmente executados e registrados; testes manuais/visuais na VM pelo responsável.
- [ ] Obter respostas a DEC-PRD-U03…U05; DEC-PRD-U01, DEC-PRD-U02 e DEC-PRD-U06 aprovadas em 12/10/2026. Somente depois fechar parecer do menu, separar achados confirmados e tarefas aprovadas para Claude.

**Auditoria permanece ABERTA. O responsável pediu perguntas de negócio ANTES de encerrar cada menu; respostas devem ser registradas aqui.**

## VII. Revisão transversal posterior — seleção de itens vendíveis (confirmado)

**PRD-A15 / CRÍTICA OPERACIONAL / Productos → Facturas:** `lib/productos/normalizar.ts:314` persiste a flag `vendible` (o cadastro e a DDL expõem `productos.vendible`), mas `lib/facturacion/emision.ts:82-92` define `SELECT_PRODUCTOS` apenas com `p.activo` e `p.tipo_producto IN ('MERCADERIA','SERVICIO')`, sem `p.vendible`. O mesmo SELECT é usado tanto na busca `buscarProductosFactura` (`:102`) quanto em `prepararFactura` (`:201`). Resultado demonstrável pelo SQL: mercadoria/serviço ativa marcada `vendible=false` pode ser listada e processada para emissão se cumprir as outras regras fiscais. **Correção a exigir ao Claude futuramente:** filtro/revalidação no servidor; UI deve mostrar somente elegíveis ou explicar exclusão, com teste regressivo `vendible=false`. Não é necessário SQL para este bug.

**PRD-A16 / MODERADA / catálogo fiscal vigente:** `NEX-039` define `unidades_medida_sifen.vigente`; `SELECT_PRODUCTOS` associa a unidade sem condicionar `us.vigente`, e validações observadas bloqueiam apenas código `NULL`. Checar regras DNIT para códigos eventualmente desativados; caso a coluna seja operacional, tanto seleção quanto emissão devem rejeitar `vigente=false`. **Pendente confirmar contrato** antes de converter em defeito de negócio.

## VIII. Passagem adicional — lista, tipagem e testes (fonte de verdade, 12/10/2026)

**Arquivos complementares lidos nesta passagem:** `app/(private)/productos/page.tsx` (807 linhas), `pestanas/{compras,inventario,logistica,kit}.tsx`, `producto-form.module.css` (inclui media queries 1100/640px), `types/productos.ts`, `lib/productos/{cierre-carga,cliente-api,decimales,documento-pendiente,documentos-http,documentos,errores,eventos,fiscal,formulario,http,imagen-servidor,imagen,permisos-documentos,pestanas,textos}.ts`; arquivos de testes `{documentos-archivos,fiscal,jerarquia-catalogos,migraciones-fiscales,productos,sincronizar}.casos.ts`. Houve inspeção estrutural de cada fonte e leitura focal de lógica relevante; **não** equivale a afirmação de revisão semântica de cada linha ou execução dos testes.

**PRD-A17 / MÉDIA / escala de listagem** — `app/api/productos/route.ts:79-111` devolve toda a coleção de produtos da empresa sem `LIMIT`/páginas do servidor; `app/(private)/productos/page.tsx:435-470` confirma que filtra, ordena e pagina **no browser**, carregando o conjunto completo. Funciona com cadastro pequeno, mas tende a escalar mal e pode sobrecarregar rede/processamento com milhares de SKUs; estabelecer meta quantitativa de V1 antes de alterar contrato de API.

**PRD-A18 / ALTA / regressões ausentes** — testes existentes de Produtos (`lib/productos/fiscal.casos.ts`, `productos.casos.ts`) cobrem IVA, GTIN por comprimento, unidades fiscais como catálogo, sincronização e SQL/checksums; contudo não foi identificada cobertura negativa de: produto `vendible=false` impedido de faturar; `unidades_medida.unidad_sifen_codigo=NULL` impedida no cadastro novo; 64 opções efetivamente exibidas no seletor de Produtos; saída sem salvar com foto/documentos pendentes. **Criar regressões para esses contratos**, não considerar os casos históricos prova de ponta a ponta.

**PRD-A19 / RISCO DE CONCORRÊNCIA — pendente de política** — `app/api/productos/[id]/route.ts:258-260` obtém `FOR UPDATE` para serializar gravações, mas não há precondição visível de versão da ficha recebida pelo usuário em `PUT`; `UPDATE` substitui valores inteiros do formulário (`:284-293`). Com duas edições abertas e um salvamento posterior, o último pode sobrescrever alterações da primeira sessão apesar do bloqueio de transação. Verificar requisito de edição concorrente e propor controle otimista (`actualizado_at`/versão) antes de implementar.

**Pontos positivos documentados, não homologados:** persistência de filho por sincronização seletiva `lib/productos/sincronizar.ts` em vez de delete-all; erros de campo via `ErrorValidacion`; criação de estoque por movimento real (não ajuste direto de saldos); arquivos de produtos com permissões de ação, versionamento e recuperação; área de catálogo protegida por usuário/empresa nos handlers básicos. Cobertura visual real e de RLS/escopo continua pendente.

**Ainda fora de cobertura:** leitura linha-a-linha e execução de todo pacote normativo SIFEN no ZIP do repositório; controle SQL atualizado completo (NEX-001…051 e funções runtime interdependentes); testes browser/VM; todos os detalhes operacionais dos demais menus.


## IX. Decisão do responsável — DEC-PRD-U01 (12/10/2026)

**Texto decidido:** “Para a unidade MT — Metro existente no NEXIT, utilizar o código SIFEN 108. Os dois códigos oficiais devem continuar disponíveis no catálogo.”

- **Unidade histórica** da tabela `unidades_medida`, `codigo = 'MT'`, `nombre = 'Metro'`: vincular ao `unidad_sifen_codigo = 108` (`MT`). Preservar UUID, produtos, apresentações, estoque e histórico.
- **Catálogo fiscal completo** `unidades_medida_sifen`: manter `87 — m — Metros` e `108 — MT — Metros` como opções distintas. Não eliminar nem consolidar registros por descrição.
- A escolha do código **108** vincula **somente a unidade histórica MT**. Não pressupor que a escolha de todas as novas unidades `Metros` seja 108.
- Qualquer futura alteração técnica deve respeitar os contratos de `productos.unidad_medida_id`, `producto_unidades.unidad_medida_id`, `producto_proveedores.unidad_medida_id`, suas FKs e o envio E709.
- **Sem execução nem autorização de SQL nesta etapa.** NEX-001…051 são migrations já aplicadas e imutáveis. Não executar nem editar `NEX-039`, `NEX-043`, script de reconciliação ou atualizar dados na VM agora.
- **Aceite futuro**: seletor oferece 87 e 108; histórico MT mantém identidade e usa 108; factura derivada desse produto envia E709=108; sem alterações de saldo, apresentação e histórico.

**Estado desta seção histórica: DEC-PRD-U01 APROVADA; DEC-PRD-U02 também foi APROVADA posteriormente (seção X).** DEC-PRD-U03…U06 e auditoria integral de Productos seguem abertas.

## X. Decisão do responsável — DEC-PRD-U02 (12/10/2026)

**Texto decidido:** “Você quer que um produto novo destinado à venda só possa ser salvo quando a classificação do IVA estiver completa, não pode ser incompleto, sifen é campo obrigatorio.”

**Regra fechada (cadastro de produto novo destinado à venda):**
- Na criação, um produto `MERCADERIA` ou `SERVICIO` destinado à venda (`vendible=true`) **não pode ser persistido** enquanto houver requisito fiscal SIFEN aplicável incompleto, ausente ou inválido.
- Exigências verificáveis da classificação tributária: **imposto/taxa**, **afetação IVA (E731)** e suas regras de coerência, **proporção gravada (E733)** somente em caso `afectacion_iva=4`, com taxa validada por `coherenciaIva` no servidor e pelas restrições do banco. Para E731=1/2/3 as proporções derivadas não devem ser digitadas/gravadas como campo adicional.
- **Unidade SIFEN (E709/E710) obrigatória**, selecionada de catálogo oficial válido; não aceitar `unidades_medida.unidad_sifen_codigo IS NULL` para novos produtos vendáveis. Rejeitar unidade inexistente/inativa/não vigente segundo o catálogo fiscal e regra aprovada para utilização.
- **Demais campos fiscais:** respeitar a obrigatoriedade real e as condições de aplicação do Manual SIFEN e das NTs específicas; não inventar obrigatoriedade universal de NCM, DNCP, GTIN, país de origem etc. A matriz normativa por campo/condição será fechada durante esta auditoria.
- Validação **antes de salvar**, tanto no formulário quanto em `POST /api/productos` (a UI sozinha não garante o contrato), com erro orientativo no campo e aba correta; dados incompletos não devem gerar um produto no banco nem uma abertura de estoque.
- A regra aprovada não é uma ordem para corrigir silenciosamente IVA/unidade fiscal de produtos históricos nem alterar suas movimentações. A política de edição de registros legados e a elegibilidade dos tipos não vendáveis será confrontada posteriormente.
- **Lacuna técnica comprovada:** `lib/productos/normalizar.ts:109-118` aceita `afectacionIva` em branco (`null`); `lib/productos/shared.ts:206-213` valida existência da unidade e coerência de IVA *somente se preenchida*, mas não impõe completude; `app/(private)/productos/_components/pestanas/sifen.tsx` oferece `Sin clasificar` e admite unidade sem equivalência; `NEX-040` permite `NULL` por retrocompatibilidade. Exigir nova validação em criação sem editar NEX-040 aplicada; nova constraint de banco só após análise de impacto e migration incremental autorizada.

**Estado:** DEC-PRD-U02 **APROVADA E ENCERRADA**. **Atualização posterior:** DEC-PRD-U06 também aprovada: IVA 10% — Gravado é o padrão inicial editável de novos produtos; nunca obriga classificar incorretamente um produto que tenha outro enquadramento.

## XI. Decisão do responsável — DEC-PRD-U06 (12/10/2026) — APROVADA

**Pergunta apresentada:** manter seleção automática de IVA 10% — Gravado, com possibilidade de o usuário alterar, ou exigir escolha explícita? **Resposta:** “sim é o standar”.

**Interpretação aprovada:**
- Cadastro de **novo produto** começa com **IVA 10% e E731=1 — Gravado** pré-selecionados, desde que exista imposto de 10% ativo no catálogo.
- O usuário **pode e deve modificar** os campos para o enquadramento efetivo de seu produto (IVA 5%, Exento, Exonerado, Gravado parcial etc.) quando 10% não for aplicável.
- Toda alteração deve validar coerência entre imposto/taxa, afetação e eventual proporção gravada no cliente e no servidor. Nunca deixar uma combinação inválida ser gravada apenas porque 10% era o default.
- A escolha do default é somente comportamento inicial da UI: **não implica tributar todas as mercadorias e serviços a 10%**, não cria regra fiscal universal, não preenche registros históricos e não autoriza alterações em NEX-001…051.
- **Evidência do comportamento atual:** `lib/productos/formulario.ts:96-98` já pré-seleciona o imposto de taxa 10% e E731=1 se existir, em novos produtos; `formularioDesdeDetalle()` preserva valores existentes. A auditoria ainda deverá conferir fallback quando 10% não estiver disponível e erros por alteração da afetação.
- **Critério de aceite:** novo produto tem IVA 10% — Gravado como sugestão editável; alteração para tipo tributário permitido é persistida corretamente; formulário não salva classificação incoerente ou incompleta (DEC-PRD-U02); edição de produto existente não modifica IVA por default.

**Status:** DEC-PRD-U06 ENCERRADA. Permanecem pendentes DEC-PRD-U03…U05 e a auditoria integral de Productos.

## XII. Esclarecimento de regra comercial UoM × apresentações × SIFEN — DEC-PRD-U03 (EM DISCUSSÃO, 12/10/2026)

**Manifestação do responsável:** “como funciona nos grande ERPs, o que vai para sifen é somente o que eles aceitam, mas apresentacao pode ter varios tipos”.

**Princípio de negócio expressamente esclarecido:** uma única unidade-base por produto para estoque, múltiplas apresentações comerciais de compra e venda (inclusive nomes de apresentação não necessariamente presentes no catálogo SIFEN), cada uma com fator de conversão explícito para a unidade-base. Quando emitir documento eletrônico, usar **somente** unidade/código SIFEN vigente e compatível com quantidade e preço faturados; a descrição da apresentação por si só não valida um código fiscal.

**Referências externas de comportamento ERP e norma SIFEN:**
- SAP Business One: https://learning.sap.com/courses/managing-logistics-in-sap-business-one/working-with-units-of-measure-uom-in-sap-business-one (single inventory UoM, multiple purchase/sales UoM, automatic conversion and inventory posting in inventory UoM).
- Oracle NetSuite: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_N2211898.html (base/stock/purchase/sale UoM and invoice in sales UoM).
- DNIT Manual Técnico v150: https://www.dnit.gov.py/documents/20123/420592/Manual%2BT%C3%A9cnico%2BVersi%C3%B3n%2B150.pdf/e706f7c7-6d93-21d4-b45b-5d22d07b2d22?t=1687351495907. E709=cUniMed da Tabela 5; E710=dDesUniMed representacao; E711=dCantProSer quantidade; E721 preço unitário; Nota Técnica 023 e posteriores prevalecem quando aplicáveis.

**PRD-A20 / CRÍTICA DE INTEGRAÇÃO / confirmado pelo código:** o cadastro oferece apresentações em `producto_unidades`, mas `lib/facturacion/emision.ts:82-92,201,220-244` só lê `productos.unidad_medida_id` (unidade-base) via `unidades_medida`, e não busca a apresentação escolhida, fator nem identidade de unidade usada na venda. `lib/facturacion/payload-fe.ts:186-188` emite E709, E711 e preço sem referência à apresentação. O ERP atual não tem contrato de faturação por apresentação; se houver venda de caixas, é preciso definir como representar quantidade e preço coerentes no SIFEN e a baixa real do estoque em unidade-base. Não corrigir só o combo de Produtos.

**Exemplo indicativo (não dado operacional confirmado):** base UNI (1), pacote de 6 (6 UNI), caixa de 24 (24 UNI). Se faturação registra 2 caixas e escolhe SIFEN 131/BX, o DE deve usar E709=131, E711=2 e preço por caixa; inventário baixa 48 UNI; em alternativa fiscal que exige conversão para base, E709=77, E711=48 e preço por UNI ajustado, preservando total. Ambas requerem regra autorizada; não trocar código ou fator automaticamente por nome.

**PONTO A CONFIRMAR PELO RESPONSÁVEL antes de fechar U03:** quando apresentação comercial escolhida para vender não tiver unidade fiscal SIFEN compatível, o sistema deve (a) converter a linha para a unidade-base fiscal reconhecida, preservando valor e histórico, ou (b) impedir venda nessa apresentação até o usuário configurar uma equivalência fiscal válida? (Evitar inventar mapeamento). A definição de `esUnidadBase` redundante em apresentações continua pendente: recomendação de análise é que, se a marcação existe, só possa apontar para a unidade-base real com fator 1, sem proibir outras apresentações alternativas.

**Status:** DEC-PRD-U03 ESCLARECIDA PARCIALMENTE; não encerrar a auditoria nem enviar tarefa ao Claude antes da decisão sobre mapeamento/representação da factura.
