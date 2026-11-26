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
- **DEC-PRD-U03 — PARCIALMENTE APROVADA:** quando uma apresentação comercial não possuir equivalência fiscal SIFEN apropriada, converter automaticamente a quantidade e o preço para a **unidade-base fiscal válida do produto**, preservando o total e registrando as unidades/quantidades originais (decisão explícita do responsável em 12/10/2026). **Subdecisão ainda aberta:** apresentação marcada `esUnidadBase` deve obrigatoriamente ter unidade igual à unidade-base do produto e fator 1? Recomenda-se sim, mas não declarar aprovado sem resposta.
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

**POLÍTICA DEFINIDA PELO RESPONSÁVEL (12/10/2026):** quando a apresentação comercial escolhida não possuir código SIFEN compatível, **converter automaticamente** a linha para a unidade-base com código SIFEN válido do produto, ajustando quantidade/preço fiscal sem alterar o total. A definição de `esUnidadBase` redundante em apresentações continua pendente: se a marcação existir, recomenda-se somente unidade igual à base e fator 1, mas depende de confirmação.

**Status:** DEC-PRD-U03 com **CONVERSÃO AUTOMÁTICA APROVADA**; restantes de `esUnidadBase`, precisão/arredondamento e auditoria completa continuam abertos. Não liberar correções ao Claude antes de finalizar a auditoria do menu.

## Confirmação do responsável — unidade do documento eletrônico (12/10/2026)

**Declaração:** “sim, para sifen tem que ser a unidade que existe.”

**REGRA CONFIRMADA:** qualquer unidade enviada na factura eletrônica deve ser um código existente e fiscalmente válido no catálogo oficial SIFEN. Apresentações comerciais podem ser distintas e múltiplas por produto; sua descrição comercial não constitui, por si só, autorização para enviar tal descrição ou um código inventado ao SIFEN. Unidade fiscal, quantidade e preço precisam permanecer matematicamente coerentes.

**Aplicação na auditoria:** no cadastro de Productos, manter unidade-base de controle de estoque e apresentações com fatores próprios. Na emissão, validar no backend o código SIFEN efetivamente enviado no item; testar unidade de apresentação existente no catálogo e apresentação sem equivalente fiscal. **Não** considerar resolvido o defeito de que `lib/facturacion/emision.ts` hoje utiliza apenas a unidade-base do produto.

**ATUALIZAÇÃO POSTERIOR:** o responsável escolheu expressamente **CONVERSÃO AUTOMÁTICA PARA A UNIDADE-BASE FISCAL** quando a apresentação não possui equivalente SIFEN, com ajuste da quantidade e preço sem alterar o total. Ver seção XIII; a dúvida bloqueio versus conversão foi encerrada.

**Execução:** nenhuma alteração de código, SQL, VM ou migration autorizada; auditoria continua aberta.

## XIII. Decisão aprovada — DEC-PRD-U03 / política de conversão automática de apresentações para SIFEN (12/10/2026)

**Escolha expressa do responsável:** “1. Conversão automática (recomendada): o NEXIT permite vender 1 bandeja de 6 unidades e envia ao SIFEN 6 UNI (código 77), ajustando o preço unitário e preservando o valor total da venda. esta”

### Regra de negócio decidida

1. Produtos têm **unidade-base de estoque** e podem ter diversas apresentações comerciais (compra e venda), com fator de conversão **informado por produto/apresentação**, não deduzido do nome.
2. Quando a apresentação vendida possui uma unidade fiscal SIFEN oficial apropriada, o documento pode utilizar essa unidade fiscal, respeitados quantidade, preço e regras do documento.
3. Se a apresentação comercial escolhida **não possui código fiscal SIFEN correspondente**, o NEXIT deve **converter automaticamente** a linha para a unidade-base do produto, que obrigatoriamente terá equivalência SIFEN válida (decisão DEC-PRD-U02). A unidade fiscal do documento será o código SIFEN da unidade-base; **nunca** enviar uma unidade comercial não reconhecida.
4. Para o caso expresso: 1 bandeja = 6 unidades-base; venda de **1 bandeja → documento eletrônico: 6 unidades SIFEN 77 — UNI**. A quantidade de estoque também equivale a **6 unidades-base**. O preço unitário fiscal é o valor total comercial da bandeja dividido pela quantidade fiscal, preservando o **total monetário da operação**, sujeito às restrições de precisão do contrato fiscal.
5. Persistir/rastrear separadamente: apresentação selecionada, quantidade comercial, fator de conversão efetivamente aplicado, quantidade na unidade-base, código SIFEN informado no DE, quantidade fiscal, preço comercial, preço fiscal e total. Não deduzir fator 6, 12 ou 24 só de texto como “bandeja”, “docena” ou “caja”.
6. Fazer cálculos com decimais exatos e ordem de arredondamento compatível com a regra SIFEN, sem divisão por zero e sem ajuste silencioso de tributos ou totais. **Se um caso não puder preservar o total dentro da precisão permitida, sinalizar a impossibilidade antes de emitir**. A fórmula concreta/precisão fiscal deve ser auditada junto à implementação e normas vigentes.
7. Validar novamente no backend (não somente no frontend) a unidade fiscal oficial, existência da apresentação para esse produto, fator positivo, preço, quantidade, coerência do total e permissões. Não confiar nos valores de conversão enviados pelo navegador.
8. Preservar IDs, produto, estoque, vínculos, histórico e cadastros anteriores; nenhuma alteração de migration aplicada ou execução na VM é autorizada nesta etapa.

### Impacto técnico identificado para Claude, depois da auditoria

- `producto_unidades` / `producto_proveedores` guardam referências UUID e fatores; `lib/productos/normalizar.ts`, `shared.ts` e `sincronizar.ts` devem preservar compatibilidade e validar apresentação/fator.
- `lib/facturacion/emision.ts:82-92,201,220-244` **não possui hoje** contrato de apresentação na linha de factura: utiliza apenas a unidade-base do produto. `lib/facturacion/payload-fe.ts:186-188` exige E709 e quantidade/preço já convertidos; será necessária revisão de DTO, consulta/autorização, cálculo e artefatos, não simples ajuste do combo.
- Os campos `cUniMed`, `dCantProSer`, `dPUniProSer`, cálculos do IVA, armazenamento do snapshot comercial/fiscal e posterior baixa/estorno de estoque devem ser confrontados em Facturas e Inventario, sem presumir que a emissão atual movimenta estoque.
- Critérios regressivos mínimos: 1 bandeja × fator 6 com base UNI 77; 2 bandejas × fator 6; apresentação com unidade SIFEN oficial própria; apresentação sem unidade fiscal mas com unidade-base fiscal; fator zero/inválido; produto fora da empresa; item `vendible=false`; preço/quantidade fracionária sem representação exata; total e IVA antes/depois.

**Estado:** conversão automática **APROVADA**; subregra `esUnidadBase` versus unidade-base do produto e fator 1 **AINDA NÃO RATIFICADA**. Auditoria integral do menu segue **ABERTA**, não homologada, sem autorização de implementação.

## XIV. Auditoria de persistência e contratos transversais (12/10/2026) — continuação independente

**Cobertura desta passagem:** conferência estática do inventário completo de **51 arquivos de migrations NEX-001…051** (varredura de definições/trigger/colunas relacionadas a unidad de medida, produtos, preço e stock); leitura dirigida de NEX-007/008/009/014/017/038/039/040/041/042/044/046 e dos serviços `lib/productos/{normalizar,shared,formulario,sincronizar,documentos,documentos-http}.ts`, `lib/stock/shared.ts`, `lib/facturacion/{emision,payload-fe}.ts`, APIs de Produtos/Estoque e componentes de Productos. **A varredura de todas as migrations não equivale a uma prova formal de ausência de efeitos indiretos em funções não examinadas linha a linha.** Nenhum SQL executado, nenhuma captura no navegador, testes automatizados não executados por esta auditoria.

### Novos achados e impacto comprovável

| ID | Gravidade | Evidência | Impacto e requisito para futura correção |
|---|---|---|---|
| **PRD-A21** | **BLOQUEANTE — integridade histórica** | `app/(private)/productos/_components/pestanas/informacion.tsx:59-66` permite editar `unidadMedidaId` na ficha; `app/api/productos/[id]/route.ts:253-296` atualiza toda a ficha inclusive a unidade-base sem checagem de existência de saldo/movimentos; `lib/productos/shared.ts:47-63` inclui `unidad_medida_id` sempre; `NEX-007-productos.sql:25`, `NEX-009-inventario-costos.sql:29-68,235-343` e `NEX-014-movimientos-operativos.sql:224-249` contabilizam quantidades por produto/depósito sem congelar unidade histórica por linha. Nenhuma guarda específica de alteração da unidade-base foi identificada na varredura das 51 migrations. | Após haver estoque/movimentos, alterar de UNI para Caja/Metro muda **a semântica de todas as quantidades e custos históricos** sem conversão. Exigir política de imutabilidade da base após 1º fato operacional ou migração controlada/irreversível explícita com auditoria. Não alterar dados existentes automaticamente. |
| **PRD-A22** | **ALTA — incoerência comercial/preço** | `NEX-008-listas-precio.sql:63-88` persiste `lista_precio_items.unidad_medida_id`; `NEX-017-familias-lineas-precio-referencia.sql:90-111` atualiza essa coluna **apenas quando se chama** `producto_fijar_precio_referencia`; `app/api/productos/[id]/route.ts:294-296` chama essa função só se `datos.precioEnviado`; a edição pode mudar `productos.unidad_medida_id` sem mudar o preço. | Unidade-base atual pode divergir da unidade vinculada ao preço de referência, que passa a ser interpretado pelo faturador como preço da unidade-base. Criar validação cruzada/bloqueio de troca e regressões para edições com preço não enviado. Não recalcular preço silenciosamente. |
| **PRD-A23** | **ALTA — exposição fora do alcance de depósitos** | `app/api/productos/route.ts:75-111,128-129` lista stock agregado e catálogo de depósitos da empresa sem filtro pelo usuário; `app/api/productos/[id]/route.ts:160-166,193-197` retorna `stockPorDeposito` e total por **todos** depósitos da empresa; `lib/stock/shared.ts:11-28,54-64` filtra saldos/custos pelo alcance do usuário; `app/api/stock/route.ts:23` passa o `usuarioId`; `NEX-014-movimientos-operativos.sql:269-275` define `usuario_puede_deposito`. | Diferença factual de isolamento entre Stock e Productos: usuário com `PRODUCTOS.VER` pode receber quantidades/custos de depósitos que não integra pelo backend de Produtos, caso o papel SQL permita essas leituras. A exigência de **filtrar por alcance** já é a política do módulo Stock; corrigir consultas da lista, ficha e depósitos, ou documentar exceção aprovada pelo responsável. Testes com usuários de alcance ASIGNADOS/TODOS e depósitos ativos/inativos. |
| **PRD-A24** | **ALTA — rejeição inesperada de documentos** | `NEX-007-productos.sql:215-225` define `producto_documentos.observacion` com CHECK máximo **500**. `NEX-041-productos-documentos-archivos-imagen.sql` não altera esse CHECK. UI `pestanas/documentos.tsx:39` admite **1000**; `lib/productos/documentos.ts:29-31` somente rejeita **mais de 1000**; APIs em `app/api/productos/[id]/documentos/{route.ts,[docId]/route.ts}` persistem o campo. `lib/productos/documentos-http.ts:58-64` responde **500 genérico** para CHECK 23514. | Observação de 501…1000 é aceita pela validação e rejeitada no banco, sem feedback correto por campo. Unificar limite na fonte de verdade com regra aprovada (mínimo ajuste: UI+validador 500, sem editar NEX-007), adicionar teste de limite 500/501 para POST e PUT. |
| **PRD-A25** | **ALTA — idempotência de criação incompleta** | `app/(private)/productos/nuevo/page.tsx:23-35` envia POST sem chave idempotente; `app/api/productos/route.ts:193-235` gera próximo código PRD e INSERT em transação. O cliente preserva `id` **apenas após obter resposta HTTP com sucesso**, protegendo uploads posteriores, mas não o intervalo em que o banco confirma alta e a resposta se perde. | Se o servidor fizer COMMIT e houver perda da resposta, novo clique/reenvio POST pode criar um segundo produto com outro PRD, mesmo que primeira criação tenha ocorrido. A proteção atual contra duplicidade **após resposta recebida** é positiva, porém não resolve perda da resposta original. Definir chave de operação durável por alta ou outra deduplicação idempotente no servidor e testes de timeout pós-COMMIT. |
| **PRD-A26** | **ALTA — testes contradizem nova regra aprovada** | `lib/productos/fiscal.casos.ts:68` afirma explicitamente `afectación vacía = sin clasificar` em `modo:'crear'`; `lib/productos/productos.casos.ts:28` usa base mínima sem classificação; `DEC-PRD-U02` foi aprovada: novos MERCADERIA/SERVICIO vendáveis **não** podem ser salvos incompletos. | A suíte antiga legitimava o comportamento agora proibido. Revisar fixtures/testes de criar vs editar legados, sem perder o suporte histórico autorizado. Exigir teste negativo POST com IVA/unidade fiscal faltante; teste positivo IVA10/5/Exento/Exonerado/parcial e fator de apresentação conforme contrato. |
| **PRD-A27** | **RISCO A EVALUAR — precisão da conversão** | `NEX-007-productos.sql:105` admite fator `numeric(18,6)`; `lib/productos/productos.casos.ts:106` testa e aprova fator `0.000001`; `NEX-009-inventario-costos.sql:42,129` mantém saldo/linha de movimento em `numeric(18,4)`; `NEX-014:232` só admite até 4 decimais no movimento. | A regra aprovada de conversão comercial→estoque pode produzir quantidade com 5/6 decimais, impossível de contabilizar sem perda de precisão. Implementação futura deve rejeitar ou definir uma escala permitida baseada na unidade-base para cada caso e preservar total, sem arredondar silenciosamente. Não chamar de bug de estoque atual antes de existência da conversão operativa. |
| **PRD-A28** | **MÉDIA — confirmação nativa ainda presente** | `app/(private)/productos/_components/pestanas/informacion.tsx:27-38` usa `window.confirm()` ao trocar categoria que invalida família/linha; complemente PRD-A04/A06. | Padronizar o modal de confirmação, preservar a escolha e evitar limpeza silenciosa das dependências. |

### Notas de integridade de contratos já confirmados

- **Modelo correto preservável:** `productos` guarda uma unidade-base e `producto_unidades` guarda apresentações/fator; o SIFEN exige código fiscal válido na linha emitida. A escolha DEC-PRD-U03 (conversão automática na ausência de equivalência de apresentação) só é segura se base e fatores estiverem estáveis/validados.
- **O cálculo atual do stock não faz conversão de unidade dentro do PostgreSQL**: `inventario_registrar_movimiento` recebe `producto_id`, `cantidad` e custos; toda conversão futura deve estar concluída antes, ou implementada em contrato transacional auditado sem misturar unidades.
- **Migrations NEX-001…051:** leitura no Git NÃO confirma aplicação na VM. O progresso do repositório registra explicitamente NEX-046…051 como versionadas/não aplicadas em seus marcos, enquanto comunicações anteriores sobre o banco podem ter sido atualizadas depois; verificar estado de `schema_migrations` com o responsável só quando houver plano de execução. Não alterar/reaplicar migrations aplicadas, não presumir que todas as 51 tenham sido executadas.
- **Requisitos de software adicionais derivados:** contrato de alteração de unidade-base, preservação de preço na unidade correta, tratamento transacional da conversão, filtro por depósito, testabilidade da idempotência e limites uniformes de anexos.

**Status deste marco:** novos achados PRD-A21…A28 documentados; nenhuma homologação, implantação, mutation de schema, migração ou alteração de código realizada. A auditoria continua ABERTA. Os pontos de decisão de negócio `esUnidadBase` e regras de alteração da unidade-base após movimentação continuam abertos à ratificação.

## XV. Política de evolução da unidade-base com histórico — declaração do responsável (12/10/2026)

**Manifestação do responsável:** “pode ter um produto com historial de unidade de medida mas somente um ativo, o quero fica historial?” Contexto: revisão da proposta anterior de bloquear definitivamente a troca da unidade-base após haver movimentos.

**Regra de negócio proposta/confirmada no princípio (ainda falta condição de transição):** cada produto terá **somente uma unidade-base vigente**, mas poderá possuir **várias versões históricas** de unidade-base, preservadas com intervalo de vigência, unidade anterior/nova, usuário responsável, data/hora, motivo e fator/snapshot da mudança. O produto não deve perder movimentações históricas. As **apresentações de compra e venda são independentes** e várias podem permanecer ativas ao mesmo tempo; não confundir a unicidade da unidade-base com limitar apresentações.

**Separação essencial:** `productos.unidad_medida_id` representa hoje a base atual (NEX-007); `producto_unidades.es_unidad_base` tem índice parcial que garante **no máximo uma apresentação marcada base**, não é uma trilha temporal. Não há modelo versionado de unidades-base nem snapshot obrigatório da unidade por `movimiento_lineas` em NEX-009/014. O histórico desejado **não existe integralmente no esquema atual**, mesmo que a troca de um UUID deixe algum rastro por outras fontes. Será necessário definir modelo incremental de histórico/vigência e compatibilizar a geração de documentos, apresentações, preços, lotes, custo e movimentos.

**Regras técnicas que não dependem da decisão restante:**
- Um único registro de unidade-base **vigente por produto**, com constraint transacional que impeça duas versões ativas; versões antigas jamais são apagadas nem reativadas retroativamente.
- Cada movimento ou documento deve continuar legível com a **unidade e fator efetivamente utilizados no momento**. Para movimentos anteriores à implantação de snapshots, definir política de reconstrução verificável; não inventar unidade histórica a partir da unidade atual.
- Em caso de troca autorizada, registrar versão anterior/nova, data de início/fim, responsável, motivo e, quando aplicável, fator, quantidades/custos antes/depois, vínculos de documentos e auditoria; preservar IDs das unidades globais e dos produtos.
- Não converter saldos, lotes, unidades identificadas, reservas, trânsito, pedidos, preços ou custos automaticamente sem regra aprovada, reconciliação completa e transação segura; nunca reescrever eventos antigos para parecerem emitidos na nova unidade.
- Uma alteração de unidade-base sem estoque atual pode ainda impactar pedidos, reservas, faturas, notas de crédito e tabelas de preço; o sistema terá de bloquear ou migrar esses vínculos conforme regra a ser auditada.

**PRD-A21 continua válido:** a API atual troca `unidad_medida_id` sem histórico e sem reconciliar valores. O risco de integridade não desaparece pela criação de uma trilha temporal; o campo só pode mudar por um fluxo controlado.

**DEC-PRD-U07 — APROVADA (12/10/2026):** a troca da unidade-base só será permitida quando **todo o estoque do produto estiver zerado e não houver operações pendentes**. A base antiga permanece no histórico e somente uma base pode estar vigente. Não há autorização para converter saldo positivo nessa troca. Detalhamento técnico/aceite na seção XVI.

**Estado atualizado:** histórico e unicidade da base atual, além da condição de troca com estoque zerado e sem operações pendentes, **aprovados** (DEC-PRD-U07; seção XVI). A alteração real continua exigindo fluxo auditado e não foi implementada.


## XVI. Decisão formal DEC-PRD-U07 — troca da unidade-base somente com estoque zero e sem pendências (12/10/2026)

**Escolha expressa do responsável:** “Opção 1 — Recomendada: permitir a troca apenas quando todo o estoque estiver zerado e não houver operações pendentes. O histórico continua preservado.”

### Regra aprovada

1. O produto pode ter **várias unidades-base ao longo de sua história**, mas **somente uma vigente por vez**. A unidade-base anterior deve permanecer consultável (unidade/código, data inicial/final, usuário, motivo e demais dados de contexto), nunca ser apagada nem reescrever os fatos históricos.
2. A unidade-base **pode ser alterada mesmo havendo movimentações históricas**, mas **somente se todos os saldos correntes do produto forem exatamente zero, em todos os depósitos/empresas aplicáveis ao registro, estados e propriedades**, e **não houver operações pendentes vinculadas ao produto**. A verificação não pode limitar-se à visão `DISPONIBLE` nem aos depósitos que o usuário enxerga; deve abranger todos os depósitos **da mesma empresa**, sem varrer dados de empresas alheias.
3. Bloquear a alteração se existir saldo positivo em DISPONIBLE, RESERVADO, CUARENTENA, TRANSITO, saldo de terceiros ou qualquer outra categoria operacional vigente; considerar lotes, unidades identificadas, custos/saldos conciliados e documentos em andamento na avaliação.
4. **Operações pendentes**: não presumir que basta `stock_saldos=0`: verificar as fontes e estados reais das operações de compras, vendas/pedidos, separação, transferências, devoluções, reservas, recepções, movimentos não concluídos e documentos pertinentes, **na medida em que realmente existam na V1**. Não inventar tabelas nem exigir fluxos de V2; concluir matriz explícita de bloqueadores a partir do SQL e APIs atuais.
5. A decisão **não autoriza conversão automática de estoque positivo** ao trocar base, nem alteração retroativa de movimentos, custo, preço ou documentos. A regra de **conversão automática de apresentação na emissão SIFEN** (DEC-PRD-U03) é um processo separado e continua aprovada.
6. Para a transição, executar em transação com guarda de concorrência, revalidar saldo/pendências **no banco no instante de gravar**, atualizar a versão de vigência, garantir **uma única vigente** por produto e registrar motivo/usuário/data. Não deixar novo movimento disputar a troca sem serialização/controle equivalente.
7. Futuros movimentos usam a nova unidade-base. Movimentos antigos e os documentos emitidos continuam interpretados na unidade/fator histórico da operação; preservar snapshots e indicar limitações de histórico anterior à implantação do versionamento.
8. Conferir explicitamente a unidade de preços de referência/listas e apresentações, pois a troca sem estoque não implica que o preço antigo seja numericamente válido para a nova unidade. Não ajustar preços silenciosamente.

### Critérios mínimos de aceite futuros

- Produto sem saldo atual e sem pendências, com movimentos encerrados no passado: **permite** trocar de base e grava versão antiga/nova.
- Qualquer saldo não zero em qualquer depósito/estado/propriedade da empresa: **bloqueia** com explicação verificável; inclusive o que o usuário não tem permissão para consultar detalhadamente (sem vazar depósitos fora de seu alcance).
- Zero em `DISPONIBLE`, mas quantidade em RESERVADO/TRANSITO/terceiros: **bloqueia**.
- Saldos zerados com pedidos/transferências/recepções/reservas pendentes realmente suportadas no sistema: **bloqueia** com motivo adequado.
- Duas edições concorrentes e movimento registrado no instante da troca: uma operação deve ser rejeitada/reavaliada; jamais persistir base incorreta ou duas vigências.
- Histórico exibe unidade antiga e nova, períodos e responsável; estoque/movimentos/FE antigos e novos conservam significado e quantidades.

**Estado:** DEC-PRD-U07 **APROVADA**. O detalhamento de tabelas/estados de pendências permanece um trabalho de auditoria técnica, não nova escolha de regra. A subregra `esUnidadBase` em apresentações (DEC-PRD-U03) continua pendente de ratificação. Sem código, migrations, PostgreSQL ou VM alterados; auditoria de Productos ainda ABERTA.

## XVII. Matriz operacional REAL V1 — bloqueadores para troca de unidade-base (análise estática 12/10/2026)

**Escopo:** DEC-PRD-U07 autoriza a alteração de base **somente com todos os saldos zerados e sem operações pendentes**. A tabela seguinte discrimina fatos operacionais existentes em código/SQL, o que ainda está em DEMO e decisões não inventadas. Fonte revisada: NEX-007/008/009/010/014/017/047…050, `lib/stock/shared.ts`, `lib/movimientos/{shared,documentos}.ts`, `lib/reposicion/{datos,calculo}.ts`, `app/api/{stock,movimientos,reposicion,productos}/**`, `app/(private)/recepciones/**`, `lib/mocks/recepciones-storage.ts`, `lib/navigation/menu.ts`.

| Fonte REAL da V1 | Situação/estado verificável | Regra de troca de base | Evidência |
|---|---|---|---|
| `stock_saldos` | **Qualquer quantidade > 0** para o produto na empresa em qualquer depósito, lote, estado (`DISPONIBLE`, `RESERVADO`, `CUARENTENA`, `TRANSITO`) ou propriedade (`PROPIO`, `TERCERO`) | **BLOQUEIO CERTO**, não bastam saldo disponível nem saldos visíveis ao operador | `NEX-009:29-67`, estados :46, propriedade :47, quantidade :42/:51 |
| `inventario_costos` | `cantidad_valorizada > 0` mesmo que `stock_saldos` aparentemente zero; ou diferenças na conciliação | **BLOQUEIO CERTO por inconsistência**; resolver dados antes de trocar a base. `costo_promedio` sozinho >0 com `cantidad_valorizada=0` NÃO significa saldo (o próprio motor preserva o último médio) | `NEX-009:197-215,298-312,358-370`; `NEX-014:139-145` |
| `stock_lotes` | Cadastro de lote sem saldo; lotes antigos permanecem vinculados ao produto | **NÃO bloquear só por existência do lote**, mas manter lote/histórico. Se houver qualquer saldo nesse lote, **bloquear** | `NEX-009:10-28`, `stock_saldos.lote_id:39` |
| `movimientos_inventario` + `movimiento_lineas` | `REGISTRADO`/`ANULADO` são os únicos estados reais no modelo; operações registradas passam por função transacional de inventário, sem rascunho persistido | **Não bloquear por histórico concluído** se saldo zero e nenhuma pendência. Para movimento simultâneo à troca, bloqueio transacional/conflito obrigatório | `NEX-009:69-96,124-146`; `NEX-014:282-359,369-432`; `app/api/movimientos/route.ts` |
| `Reposición` | Planejamento e transferências 'preparadas' somente calculadas em estado da página, sem persistência operativa | **NÃO bloquear**, pois não existe pedido/transferência real ainda; não usar recomendação como operação pendente | `app/api/reposicion/route.ts:8-9` (GET somente); `lib/reposicion/calculo.ts:169-174` |
| `Recepciones` | Páginas existentes em `app/(private)/recepciones/**`, mas usam `lib/mocks/recepciones-storage.ts` e `localStorage`, inclusive botão `crearRecepcionDemo` | **NÃO usar como fonte SQL real de pendências**; telas excluídas do menu V1 habilitado. Não alegar que uma recepção de navegador reserva estoque real. Uma recepção real futura precisará entrar na matriz | `recepciones/nuevo/page.tsx:85-115,364-379`, `lib/mocks/recepciones-storage.ts:18-99`, `lib/navigation/menu.ts:338-363` |
| Pedidos de compra/venda, reservas comerciais, devoluções, entregas | Nenhuma API/tabela de pedidos e recepções operacionais de V1 localizada no inventário de fontes atual; o `tipo_origen=COMPRA/VENTA/DEVOLUCION` no Movimento é **classificação de um fato registrado**, não workflow de pedido pendente | **NÃO inventar pendências em tabelas inexistentes**. Ao implementar esses módulos, adicionar chave de vínculo por produto/linha e bloqueador real | `NEX-009:94-96`, `NEX-014`, árvore da branch; `lib/movimientos/documentos.ts:2-11` prepara contrato ainda não conectado |
| `documentos_electronicos` / `documento_electronico_solicitudes` | NEX-047…050 definem `PENDIENTE_ENVIO`, `ENVIANDO`, `ENVIO_INDETERMINADO`, `ERROR_ENVIO`, `ENVIADO` e estado SIFEN separado; payload fiscal persistido e imutável em JSONB, **sem FK de cada item para `productos.id`** | **BLOQUEADOR FISCAL A DECIDIR COM O RESPONSÁVEL**: não confundir documento fiscal pendente com movimento físico pendente. Só aplicar regra por produto quando a origem/linha puder ser identificada de forma íntegra. Não bloquear todos os produtos por documentos de outros itens, nem ignorar envios abertos ao trocar unidade | `NEX-047:76-122`, `NEX-048:50-64,153-163`, `NEX-049/050`, `lib/facturacion/payload-fe.ts:182-195` (dCodInt e unidade/quantidade, sem productId) |
| Documentos e foto de Productos | Upload/edição por versões/carga inicial aberta; não representam ordem física | **Não são por si só bloqueadores de estoque**, mas quaisquer alterações não salvas exigem proteção UX e fechamento coerente de transação | `NEX-041/042`, `app/api/productos/[id]/documentos/**` |

**IMPORTANTE — precisão da matriz:** estas verificações dizem respeito às fontes *realmente representadas na branch*, não validam seus dados da VM. NEX-047…050 têm estado de aplicação NÃO APLICADA no `PROGRESSO-NEXIT-V1.md` consultado; o estado real de `schema_migrations` deve ser conferido antes de qualquer plano operacional. O status `REGISTRADO` de Movimientos não é equivalente a uma ordem pendente; `ENVIADO` local em Facturas não significa `APROBADO` no SIFEN.

### Novos achados sobre operações pendentes, preços, apresentações e histórico

| ID | Classificação | Evidência / contrato violado ou incompleto |
|---|---|---|
| **PRD-A29** | **BLOQUEANTE PARA NOVA TROCA DE BASE — concorrência** | `app/api/productos/[id]/route.ts:258-260` bloqueia somente a linha do produto durante PUT; `NEX-014:224-249,282-359` consulta produto e cria movimentos sem lock correspondente `FOR SHARE` da mesma linha. Fazer `SELECT SUM(stock_saldos)` antes de alterar a base, isoladamente, não protege de movimento concorrente. Exigir estratégia de serialização envolvendo a troca e TODOS os caminhos de escrita de estoque, com revalidação e ordem de locks estável (ou regra equivalente demonstrável no PostgreSQL). Sem implementação, NÃO permitir edição livre da base. |
| **PRD-A30** | **ALTA — não existe histórico de apresentações/fatores** | `NEX-007:99-120` não tem `activo`, vigência nem tabela de versões em `producto_unidades`; `lib/productos/sincronizar.ts:40-57,127-157,174-186` executa `UPDATE factor_conversion`, unidade, flags, e `DELETE` explícito de apresentações sem FK operacional para snapshots de venda. Alterar/retirar apresentação utilizada pode perder o fator histórico ou significado de uma venda anterior, ainda que o estoque base tenha histórico. Especificar versões de apresentação e congelar fator por transação; preservar os identificadores históricos e impedir reinterpretação. **Regra de edição após utilização exige aprovação de negócio**. |
| **PRD-A31** | **ALTA — preço multiapresentação não suportado** | `NEX-008:63-88` guarda uma unidade por item de lista e UNIQUE `(empresa_id, lista_precio_id, producto_id)`, não preço por apresentação do mesmo produto na mesma lista; `NEX-017:90-121` define preço de referência em unidade-base, e `v_producto_precio_referencia` nem retorna a unidade. `lib/facturacion/emision.ts:82-92,224-244` usa preço por produto, sem `producto_unidades` ou fator. Para múltiplas apresentações não existe definição de preço base × fator/valor específico; auditar como calcular antes de vender pacote/caixa e quais preços prevalecem. **Não inferir margem, desconto, arredondamento ou preço por caixa apenas pelo fator sem decisão do negócio.** |
| **PRD-A32** | **ALTA — bloqueador fiscal por produto não modelado** | `NEX-047:76-122` tem vínculo `cliente_id` mas não `producto_id` nem linhas fiscais relacionais; `NEX-048:50-64` congela `payload` JSONB, e `lib/facturacion/payload-fe.ts:182-195` identifica somente `dCodInt`, `cUniMed`, quantidade e valor por item. Uma regra SQL de 'operações pendentes por produto' não pode depender apenas do FK inexistente nem da contagem global de FEs da empresa. Projetar vínculo idempotente por documento/linha/produto e snapshot de unidade/apresentação, ou política de conciliação de payload seguro; primeiro decidir se FE pendente **por si só** impede a troca. |
| **PRD-A33** | **OBSERVAÇÃO de implementação atual** | `app/(private)/recepciones/nuevo/page.tsx:364-379` chama `crearRecepcionDemo(form)` e `lib/mocks/recepciones-storage.ts:41-99` usa `localStorage`, não PostgreSQL. A rota não aparece no `V1_HREFS` do menu. Logo, qualquer 'pendência de recepção' oriunda desse protótipo NÃO é verificação confiável para alteração da unidade-base na V1. Não introduzir falso bloqueador. |
| **PRD-A34** | **OBSERVAÇÃO / não bloquear indevidamente** | `NEX-009` declara `movimientos_inventario.estado` apenas `REGISTRADO`/`ANULADO`; `lib/reposicion/calculo.ts` é planejamento puro. Exigir zero saldo real é suficiente para esses fatos concluídos; não bloquear troca porque o produto possui movimentos históricos REGISTRADO. Histórico antigo deve permanecer com snapshot ou período de unidade-base identificável. |

### Fluxo de transição unitária — critérios técnicos futuros (não implementar agora)

1. Verificar `empresa_id`, autorização `PRODUCTOS.EDITAR`, contexto da sucursal/deposito de forma coerente, existência da unidade-base destino e equivalência fiscal SIFEN vigente para produto vendável; nunca receber permissão/empresa do corpo da requisição.
2. Exigir unidade de destino distinta, motivo auditável e versão atual esperada para evitar gravações obsoletas; determinar data/hora do servidor, não do browser.
3. **Na mesma transação**, serializar com registro de movimentos e outros escritores de estoque, verificar saldos >0 em todos estados/propriedades/depósitos, verificar consistência de quantidades valorizadas, verificar operações pendentes reais, fechar versão anterior e criar versão vigente; garantir unicidade da versão ativa no PostgreSQL.
4. Considerar a base histórica usada em listas de preço, apresentações e fornecedores; exibir checklist de impactos e exigir revisão dos preços sem sobrescrever os preços anteriores como se tivessem a nova unidade.
5. Persistir histórico imutável e snapshots (unidade-base, fator, preço/quantidade fiscal, ID de apresentação) em novas operações. Lançamentos antigos sem snapshot: relatórios devem usar o intervalo histórico quando defensável e sinalizar qualquer ambiguidade.
6. Tratar reversão, importações e edição concorrente: jamais reabrir base antiga diretamente, reescrever movimento ou recalcular histórico silenciosamente.

### Decisões de negócio abertas após análise estática

- **DEC-PRD-U08 — APROVADA (12/10/2026):** FE com payload fiscal já gravado e imutável **não bloqueia a troca da unidade-base apenas por aguardar envio/resultado SIFEN**, desde que o estoque esteja integralmente zerado e não haja operação física pendente. Unidade, quantidade, preço, IVA e total históricos da factura permanecem congelados. Sem snapshot comprovado, a exceção não se aplica. Ver seção XVIII.
- **DEC-PRD-U09 — APROVADA (12/10/2026):** apresentação já utilizada em operação de compra/venda/movimento não terá `factor_conversion` nem unidade original sobrescritos. Quando houver mudança (ex.: caixa de 12 → 10 unidades), **encerrar a vigência da versão anterior, conservar histórico e criar nova versão**, sendo somente uma versão da MESMA apresentação vigente para novas operações. Outras apresentações do mesmo produto permanecem independentes e podem continuar ativas. Ver seção XIX.
- **DEC-PRD-U10 — SIMPLIFICADA/ENCERRADA por orientação do responsável (12/10/2026):** ao trocar a unidade-base nas condições já aprovadas em U07, **não exigir revisão de preços, não suspender vendas nem lançar perguntas adicionais**. A alteração solicitada pelo cliente deve ser salva; os valores nominais dos preços permanecem como estão até edição voluntária, **sem recálculo automático**. Na futura implementação, manter a unidade referencial tecnicamente coerente e não modificar documentos históricos. Ver seção XX.

**Estado atualizado:** DEC-PRD-U08/U09 aprovadas; DEC-PRD-U10 simplificada e encerrada na seção XX. Auditoria técnica continua ABERTA, sem novas perguntas repetidas sobre mudança da unidade-base/preços.

## XVIII. DEC-PRD-U08 — FE congelada não bloqueia troca de unidade-base (12/10/2026) — APROVADA

**Declaração do responsável:** “Opção 2: permitir a troca se a factura já possuir seus dados fiscais congelados, mantendo a unidade histórica, desde que não haja nenhuma movimentação física pendente.”

### Regra de negócio

1. **Manter a condição DEC-PRD-U07:** estoque integralmente zero para o produto em todos os depósitos, estados e propriedades da empresa; nenhuma operação/movimentação física pendente.
2. Mesmo que o documento esteja `PENDIENTE_ENVIO`, `ENVIANDO`, `ENVIO_INDETERMINADO`, `ERROR_ENVIO`, `ENVIADO` ou aguardando decisão SIFEN, esse **estado fiscal isolado não impede** a troca da unidade-base, contanto que haja **payload fiscal gravado, íntegro e imutável** e nenhuma operação física pendente.
3. O documento fiscal deve continuar com **a unidade SIFEN histórica E709, quantidade E711, preço E721, IVA, total e demais dados originais**. Após a alteração de unidade-base, reenvio/consulta/KuDE não podem remontar esses valores a partir da unidade fiscal atual do produto. Preservar apresentação/fator originais quando utilizados e versão imutável da factura.
4. Uma prévia de factura não persistida, formulário ainda editável ou documento sem snapshot fiscal verificável **não satisfaz a condição aprovada**. Não liberar a troca presumindo que a FE está congelada. Se ainda houver evento físico pendente relacionado ao produto, **bloquear independentemente do estado da FE**.
5. Alterar a base apenas por operação transacional auditada com controle de concorrência e histórico (usuário, instante, unidade anterior/nova), sem editar registros de movimentos, fiscalizações, preços e documentos anteriores.

### Evidência e lacuna para implementação futura

- `NEX-048-facturacion-emision-fe.sql:50-64,67-90,153-163` modela `documento_electronico_solicitudes.payload` JSONB, `payload_hash`, `entrada_hash`, versão, inserção e imutabilidade. A FE efetivamente criada possui a infraestrutura de snapshot fiscal. A existência da estrutura no PostgreSQL operacional **não foi verificada**, portanto não presumir migrations aplicadas.
- `NEX-047-facturacion-documentos-electronicos.sql:76-122` separa estados locais, fiscais e email; um envio pendente não implica estoque físico pendente.
- `lib/facturacion/payload-fe.ts:182-194` gera valores fiscais do item no payload; a seleção por apresentação (PRD-A20) segue pendente no código.
- `PRD-A32` ainda existe: o snapshot de FE **não inclui FK relacional por linha para `productos.id`**, e identificadores fiscais `dCodInt` não substituem vínculo transacional confiável em todo caso. A verificação de operações físicas pendentes é independente; a ausência de FK não autoriza bloquear todos os produtos por qualquer FE da empresa.

### Casos de aceite planejados, não executados

- Estoque zero, sem pendência física, factura já gravada imutável com envio indeterminado: troca **PERMITIDA**, envio/reconsulta conserva unidade, quantidade, IVA, preço e total do snapshot.
- Saldo em RESERVADO/TRANSITO/terceiro ou qualquer operação física pendente, mesmo que factura imutável: troca **BLOQUEADA**.
- Só prévia fiscal sem persistência comprovada: não tratar como factura congelada; avaliar o fluxo antes da troca e não presumir autorização.
- Reenvio após troca da base: nem E709/E711/E721 nem `payload_hash` podem ser reescritos. Concorrência entre gravação fiscal, estoque e troca requer consistência atômica.

**Estado:** DEC-PRD-U08 APROVADA/ENCERRADA. Ainda abertas DEC-PRD-U03 (`esUnidadBase`), U04, U05, U09, U10 e auditoria integral de Productos. Nenhum código, SQL, VM, teste operacional ou implementação autorizada.

## XIX. Decisão DEC-PRD-U09 — histórico versionado de apresentações e fatores (12/10/2026) — APROVADA

**Pergunta apresentada ao responsável:** “Imagine uma apresentação Caja de 12 unidades que já foi utilizada em vendas. Posteriormente, o fornecedor passa a entregar caixas de 10 unidades. Minha recomendação é preservar a apresentação antiga com seu fator 12 no histórico e criar uma nova versão com fator 10, mantendo somente a versão mais recente ativa para novas operações. As facturas e movimentações anteriores continuam vinculadas ao fator 12. Você aprova esse versionamento histórico das apresentações, sem sobrescrever fatores que já foram utilizados?” **Resposta expressa:** “sim”.

### Contrato funcional aprovado

1. Um mesmo produto pode ter **múltiplas apresentações comerciais distintas ativas simultaneamente** para compra e/ou venda. A regra de **somente uma versão ativa** aplica-se **a cada apresentação lógica/versionada**, NÃO a todas as apresentações de um produto. Uma única unidade-base do produto vigente continua definida pela DEC-PRD-U07, como conceito separado.
2. Quando uma apresentação já tiver sido **efetivamente utilizada** em operação comercial ou de estoque, a troca de fator, unidade da apresentação ou outra propriedade que altere a quantidade física/fiscal **não poderá sobrescrever os atributos históricos**. A mudança encerra a vigência da versão antiga e cria uma nova versão rastreável, com nova identidade/versionamento e fator atualizado.
3. Exemplo aprovado: **Caja v1 = 12 UNI** utilizada em documentos antigos; a partir da troca, **Caja v2 = 10 UNI** para novas operações. Vendas, compras, conversões, movimentos e FE anteriores continuam interpretados como 12 UNI por caixa. Outras apresentações (p.ex. UNI, Bandeja 6) não são desativadas pela troca da Caja.
4. Preservar **origem e cadeia de versões**, datas de vigência sem sobreposição, usuário/motivo de alteração, fator, unidade comercial/base de referência no instante da versão, indicadores compra/venda, barcode e demais atributos relevantes quando usados. Cada fato operacional deve manter o **snapshot da apresentação/versionamento/fator efetivamente aplicado**, mesmo depois da desativação da versão antiga.
5. **Nunca DELETE físico ou UPDATE destrutivo de apresentação já utilizada**; a desativação conserva histórico consultável. Não reconstruir nota de crédito, devolução, estorno, reenvio ou KuDE de uma transação antiga com a versão nova. Para transações com reserva/compra pendente, o vínculo com a versão original tem de permanecer estável; regras específicas serão confrontadas na auditoria por menu.
6. O sistema deverá validar no backend: identidade da apresentação e produto/empresa, vigência para **novas operações**, fator positivo, coerência da unidade-base e da apresentação e ausência de versões vigentes sobrepostas. O browser não será fonte da verdade do fator. As fórmulas e precisões continuam vinculadas às decisões U03/U07 e às regras SIFEN vigentes.
7. A decisão não aprova alterar automaticamente preços, custos, tributos ou estoques antigos quando o fator mudar. O efeito sobre preço por apresentação e lista fica na auditoria de Listas de precios / DEC-PRD-U10. A condição precisa para editar em lugar apresentações **nunca usadas** continua sujeita ao desenho da implementação e à exigência de integridade; não inferir autorização para sobrescrever uma versão já referenciada.

### Evidências da lacuna atual

- `NEX-007-productos.sql:99-120` cria `producto_unidades` apenas com `factor_conversion`, flags e `creado_at`/`actualizado_at`, **sem versão, vigência, inativação ou trilha imutável**. O índice `producto_unidades_uno_base_uq` controla no máximo uma apresentação marcada `es_unidad_base`, não versionamento histórico.
- `lib/productos/sincronizar.ts:40-57,127-157,162-186` permite hoje `UPDATE` de `factor_conversion` e `DELETE` de apresentações como elementos de coleção; não detecta utilização histórica para preservar a versão anterior. Evidência transversal PRD-A30.
- `lib/facturacion/emision.ts` ainda seleciona só a base fiscal do produto, sem `producto_unidades.id` e versão por linha. A futura associação comercial→fiscal precisa usar a versão histórica e manter o payload imutável (DEC-PRD-U03/U08).

### Critérios de aceite da implementação futura (não executados)

- Caja v1=12 registrada e utilizada: edição do fator para 10 **não** reescreve v1; cria Caja v2=10 como vigente; v1 permanece legível no histórico. Uma venda antiga de 2 caixas permanece equivalente a 24 UNI; nova venda de 2 caixas equivale a 20 UNI.
- A troca de Caja não altera Bandeja/UNI ou outras apresentações ativas; não pode haver duas versões simultaneamente vigentes da mesma apresentação lógica.
- Documento/estorno/NC/reenvio antigos conservam unidade, quantidade, fator e preço do snapshot original. Versionamento não duplica operação nem diminui ou aumenta estoque silenciosamente.
- Solicitação direta à API de `UPDATE` destrutivo ou `DELETE` de apresentação usada: deve resultar em versão histórica preservada e resposta coerente, **nunca perda silenciosa de histórico**.
- Simultaneidade de duas alterações de factor e operação em andamento exige serialização/versão esperada; falhar em conflito, não gravar duas versões ativas.

**Status atualizado:** DEC-PRD-U09 APROVADA; U10 encerrada por simplificação da V1 na seção XX. A subdecisão técnica de `esUnidadBase` deve ser resolvida no parecer sem insistir em questionário repetitivo. Auditoria integral Productos ABERTA, nenhuma implementação autorizada.

## XX. Orientação de escopo para a V1 — preços e troca de unidade-base (12/10/2026)

**Manifestação do responsável:** “nao precisa de tudo isso, se o cliente trocar trouco. para a primeira versao nao precisa ser tanto assim, voce ja pergutou 5 vezes praticamente a mesma coisa.” Trata-se de correção explícita do excesso de detalhamento e das opções artificiais propostas para DEC-PRD-U10.

**REGRA SIMPLES V1 / DEC-PRD-U10 ENCERRADA:** ao cliente trocar a unidade-base dentro da regra U07 (estoque zero e nenhuma operação física pendente), o NEXIT **salva a nova unidade**, **sem exigir revisão obrigatória de preços**, **sem bloquear vendas por esse motivo**, **sem apagar preços existentes** e **sem recalcular automaticamente valores numéricos**. Se o cliente quiser mudar os preços, altera-os diretamente nos cadastros existentes. Preservar coerência do vínculo de unidade nos registros de preço futuros; alterações antigas continuam históricas, sem reconstrução de documentos fiscais emitidos.

**Não interpretar como revogação das escolhas anteriores:** mantém-se U07 (troca só com estoque zero e sem operações físicas pendentes), U08 (factura congelada não bloqueia) e U09 (não sobrescrever fator de apresentação já utilizado). A intenção é eliminar etapas e obrigações extras na UX da V1, não permitir corrupção de saldos/histórico.

**Escopo que NÃO deve ser exigido na V1 apenas para esta regra:** assistente de revisão de preços, bloqueio temporário de venda por preço anterior, recálculo/migração automática de tabelas de preço, aprovações adicionais para troca da unidade, telas de reconciliação avançadas, workflow de múltiplas confirmações.

**Nota de auditoria PRD-A22:** o descompasso possível entre `productos.unidad_medida_id` e `lista_precio_items.unidad_medida_id` continua um fato técnico a ser evitado com solução interna mínima, sem impor burocracia ao usuário nem alterar os valores dos preços. Não tocar nas migrations já aplicadas; proposta técnica posterior deve ser pequena e compatível.

**Conduta do analista daqui em diante:** não repetir perguntas sobre políticas já resolvidas; fazer inventário e apontar defeitos concretos por menu, priorizando bugs que impedem cadastro, estoque e SIFEN. Anotar opções avançadas como melhoria futura, não bloqueadores automáticos da V1. Só solicitar decisão quando houver ambiguidade substantiva que não possa ser resolvida pela regra vigente.

**Situação:** orientação do cliente registrada; auditoria de Productos ABERTA; nenhuma implementação, teste operacional, SQL, VM ou migration alterada.

## XXI. ENTREGA 01 — instrução de implementação para Claude Code (primeiro recorte de auditoria, 12/10/2026)

**STATUS DA AUDITORIA:** parcial e ABERTA, porém o responsável solicitou liberar correções comprovadas de forma incremental, sem aguardar 100% da auditoria de Productos. Esta seção **autoriza somente a ETAPA 01**, não os demais achados. NÃO marcar o menu como AUDITADO COMPLETO/HOMOLOGADO nem afirmar que o ChatGPT testou VM, PostgreSQL ou SIFEN.

**TAREFA ÚNICA — integridade fiscal de produtos vendáveis e seleção para factura.** Implementar de forma mínima os achados **PRD-A02, PRD-A15, PRD-A16 (catálogo marcado não vigente, conforme fonte oficial já modelada) e PRD-A26** com regras **DEC-PRD-U02** (completude de SIFEN em produto novo vendável) e **DEC-PRD-U06** (IVA 10%/Gravado como pré-seleção, editável). É um recorte funcional coeso; demais achados permanecem no backlog de auditoria e **não estão autorizados nesta execução**.

### Escopo funcional autorizado

1. **Alta de produto vendável:** para **NOVO** produto com `tipo_producto` em (`MERCADERIA`, `SERVICIO`) e `vendible=true`, `POST /api/productos` só grava quando a unidade-base comercial selecionada está ligada a um código oficial SIFEN **existente e vigente**, e imposto/taxa + afetação IVA estão completos e coerentes. Para `iAfecIVA=4`, exigir proporção gravada válida. Validar no backend dentro do fluxo existente, antes do INSERT/movimento de abertura; mensagem por campo na UI. O formulário não pode afirmar que ausência fiscal não bloqueia. Usar catálogo oficial de 64 códigos já versionado no projeto e sua relação `unidades_medida.unidad_sifen_codigo`, **sem trocar os UUIDs comerciais por inteiros fiscais**.
2. **Padrão tributário:** `IVA 10% — Gravado` continua preseleção **editável** para produto novo quando imposto 10% ativo existe. Usuário pode selecionar 5%, Exento, Exonerado, Parcial conforme coerência normativa. Não criar classificador fiscal geral nem inferir enquadramento de todos os produtos.
3. **Compatibilidade histórica:** produto antigo com campos fiscais incompletos deve continuar visível/consultável; **não** efetuar backfill, atualização silenciosa, bloqueio massivo nem alteração automática de registros históricos. Não ampliar escopo de validação do PUT legado sem análise de compatibilidade específica. Produtos não vendáveis/`KIT`/`ACTIVO_FIJO` não são tornados fiscalmente obrigatórios por esta tarefa.
4. **Faturação:** `lib/facturacion/emision.ts` deve aplicar `p.vendible=true` ao catálogo, à prévia e à emissão; nenhum request direto pode faturar produto ativo mas `vendible=false`. Na seleção/validação fiscal, rejeitar unidade SIFEN ausente, inexistente ou `vigente=false` com erro útil. Corrigir no servidor, não só esconder na UI. Manter idempotência e snapshot do documento FE, sem reescrever payloads já gravados.
5. **Sem dados inventados:** `DEC-PRD-U01` já define o vínculo da unidade histórica MT existente com código 108, preservando também 87 no catálogo oficial; **não executar reconciliação de banco na VM**, não inferir vínculo de outras unidades arbitrariamente. Se as seis unidades comerciais do banco real ainda não têm vínculo SIFEN, o sistema deverá explicar a falta e o Claude deverá relatar esse **bloqueio operacional real** de forma objetiva, citando o script de reconciliação já existente, em vez de criar atalhos que permitam faturar sem código fiscal válido. Se precisar de SQL adicional para código fiscal no banco real, PARAR e pedir autorização separada antes de criar/aplicar migration.

### Evidência de referência

- `app/api/productos/route.ts` (POST), `lib/productos/{normalizar,shared,formulario,fiscal}.ts`, `app/(private)/productos/_components/pestanas/{informacion,sifen}.tsx`, `lib/facturacion/{emision,payload-fe}.ts`, `lib/productos/{fiscal,productos}.casos.ts`, `lib/facturacion/facturacion.casos.ts`, NEX-007/039/040/043, `documentacao/banco/nexit/v1/scripts/reconciliar-unidades-sifen-NEX-039.sql`.
- Lacunas verificadas: `lib/productos/shared.ts:206-213` aceita base sem código fiscal, `normalizar.ts:109-118` permite ausência de afetação, `lib/facturacion/emision.ts:82-92` não exige `vendible`, nem consulta `us.vigente`.
- Conferir também requisitos oficiais DNIT já versionados na documentação SIFEN do repositório; não inventar NCM/GTIN/DNCP obrigatório universal, nem alterar os limites comerciais antigos sem autorização.

### Critérios mínimos para o Claude demonstrar em testes locais

- `POST`: vendável novo sem SIFEN mapeado ou sem classificação IVA -> erro de validação com campo e **nenhum produto/movimento inicial inserido**; com unidade vigente e IVA coerente -> grava normalmente.
- IVA inicial 10% editável; 5% / exento / exonerado / parcial validados corretamente; combinação inválida ou parcial sem proporção -> erro; legado não é reclassificado silenciosamente.
- Produto `vendible=false` não aparece como selecionável na factura nem passa pela emissão via request direto; produtos fiscalmente inaptos não são faturados; a seleção/consulta de catálogo trata `vigente=false`.
- Regressões existentes permanecem verdes, com fixtures adequadas para novas regras; testes comprovados de rotas/contratos e execução local de `tsc`, ESLint e build quando disponíveis. Não chamar teste mockado de homologação em VM.

### Condições de execução e parada (protocolo oficial)

- Claude Code trabalha apenas na branch `feature/NEXIT-2026-001-banco-demo`, no clone local. Antes de começar, `git status`, conferir branch, sincronizar com segurança e **ler `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, trechos pertinentes de `PROGRESSO-NEXIT-V1.md`, esta auditoria e regras fiscais reais**. Não alterar outros menus além dos pontos de integração da tarefa.
- Não editar arquivos `AUD-*` nem migrations históricas NEX-001…051; não criar documento duplicado nem reabrir perguntas já aprovadas; nenhuma operação no PostgreSQL, Docker, VM, SIFEN/gateway ou deploy. Sem permissões novas ou mudança de layout não relacionada. Se houver bloqueio técnico que torne esse recorte inviável sem migrar DB, **parar apenas a parte bloqueada, documentar motivo concreto e entregar as demais correções seguras**.
- Executar testes **locais**, corrigir regressões, commit+push, reportar somente resultado, quantidade de testes/falhas, bloqueios reais e SHA. **PARAR** após a entrega para nova auditoria independente do ChatGPT, antes da próxima etapa.

### Backlog NÃO AUTORIZADO para esta entrega

- PRD-A01 (UX/catálogo comercial 64 unidades), A04/A05 (dirty guard), A07 (base redundante), A20 (facturação por apresentação), A21/A29 (troca de base/histórico), A24 (observação documental 500 vs 1000), A30/U09 (histórico de apresentações), A31 (preço por apresentação), A32 (rastreabilidade da FE), e todos os demais achados da ficha.
- Regras U03/U07/U08/U09/U10 permanecem **aprovadas como negócio**, mas sua implementação está reservada a tarefas futuras de escopo próprio. Não projetar históricos/cadastros adicionais durante este recorte fiscal.

**PONTO DE CONTROLE:** ETAPA 01 AUTORIZADA PARA CLAUDE CODE; resultado AINDA NÃO IMPLEMENTADO nem HOMOLOGADO. Auditoria integral de Productos ainda ABERTA.

## XXII. AUD-R01 — parecer independente da ENTREGA 01 e pacote conjunto Clientes + Productos (12/10/2026)

### 1. Auditoria da implementação publicada

**Fonte efetiva:** commit `1a72c7e56edd1786c47e51ee7eb866962fd2787b`, filho do commit de autorização `5fba3683bafa41f2d43f41a2164fe098bb9a77e9`; SHA entregue pelo Claude `f811741dfb5fc1d71c51dee5bb3f83d706454025` é um **MERGE** da implementação com a auditoria de Clientes `438d7a0cd6fb8d54012c50f13d12e8376e073cec`, portanto não deve ser usado sozinho como diff de implementação. Revisados arquivos alterados (`normalizar.ts`, `shared.ts`, POST Productos, formulário, seletores, `emision.ts`, Facturas UI, tipos, suites) e contratos NEX-039/040/043 e de emissão.

**Veredito da ETAPA 01: ACEITE ESTÁTICO DO RECORTE, SEM HOMOLOGAÇÃO OPERACIONAL.**

- **PRD-A02 corrigido estaticamente na criação nova vendável:** `normalizarProducto` exige IVA/imposto; `POST /api/productos` chama `validarReferencias(..., { exigirUnidadSifen: ... })` dentro de `BEGIN` antes de INSERT/abertura; a query consulta `unidades_medida_sifen.vigente` e distingue vínculo ausente, código inexistente e não vigente. Mantém legados/PUT sem reclassificação.
- **PRD-A15 corrigido estaticamente:** `SELECT_PRODUCTOS` usado na seleção/prévia/emissão agora filtra `p.vendible`, não só `p.activo`. Requisição direta para não vendível não o encontra e falha antes de reservar número.
- **PRD-A16 corrigido estaticamente:** a query expõe `unidadVigente` e `prepararFactura` rejeita vínculo ausente/inexistente/desativado com 422. A UI distingue não vigente.
- **PRD-A26 ajustado:** fixtures históricas sem classificação agora são explicitamente `vendible:false` e cenários novos cobrem IVA obrigatório, vigente/inexistente, não vendível e bloqueio de emissão; **não confundir fixtures/mocks e testes por inspeção de fonte com teste PostgreSQL ponta a ponta**.
- **DEC-PRD-U06 preservada:** default de IVA 10% Gravado na criação permanece editável. Nenhuma migration histórica alterada nesse commit.

**Contagem de testes:** Claude informa `tsc`, ESLint, `next build` e **2068 verificações / 0 falhas / 23 novas** locais; ChatGPT **NÃO reexecutou** essas verificações nem testou API/DB/VM/SIFEN. A reconciliação de unidades SIFEN é **condicional ao estado verificado do banco** e não é autorização de execução cega do script `reconciliar-unidades-sifen-NEX-039.sql`. NEX-001…051: preservação estrita de migrações já aplicadas, conforme registro operacional do responsável.

**Conclusão:** o recorte fiscal implementado não requer reapresentar ao Claude um novo trabalho A02/A15/A16/A26 sem regressão comprovada. O menu Productos, porém, não está homologado nem encerrado: os itens abaixo são anteriores/independentes da Etapa 01.

### 2. RODADA CONJUNTA AUTORIZADA pelo responsável — estabilização funcional V1 Clientes + Productos

**Pedido atual:** revisar a entrega Productos e, caso haja ajustes, **passar junto com os achados de Clientes para finalizar os dois menus**, sem burocracia nem expansão de escopo. Esta autorização é de **preparar/implementar correções em código Git** pelo Claude Code, não de aplicar SQL, acessar VM, executar scripts de reconciliação ou declarar menus homologados.

**Prioridades Productos (somente defeitos já identificados):**

1. **PRD-A21/U07 — BLOQUEANTE integridade de estoque:** ao tentar alterar `productos.unidad_medida_id` em PUT, comparar com a unidade atualmente persistida. Se não mudou, edição normal. Se mudou, só permitir com **TODOS** os saldos do produto zerados em todos depósitos, estados, propriedades e lotes, sem operações físicas efetivamente pendentes; histórico de unidade anterior preservado/auditável. Fazer verificação no servidor na mesma transação, **serializada com os escritores efetivos de estoque**; a simples leitura de SUM e `FOR UPDATE` apenas do produto não garante ausência de corrida com NEX-014. Não bloquear só pela existência de movimentos históricos concluídos ou por FE congelada e sem pendência física (U08). Não obrigar revisão de preços nem criar wizard/aprovação (U10). Se uma proteção completa exigir alteração de funções SQL já aplicadas, propor **migration incremental NEX-052+** na branch, sem editar NEX-001…051 nem executar. Se inviável no recorte, documentar exatamente a parte bloqueada — nunca abrir alteração insegura.
2. **PRD-A23 — ALTA isolamento:** harmonizar listagem de Produtos, detalhe (`stockPorDeposito`, total e eventuais custos/saldos agregados) e lista de depósitos com a mesma política de alcance efetivo por usuário adotada por Stock (`usuario_puede_deposito`, empresa da sessão). Não exibir saldos de depósitos fora do alcance por GET direto nem calcular agregados a partir de depósitos invisíveis; preservar usuário admin/TODOS e perfis restritos. Cobrir casos multiempresa e alcance parcial.
3. **PRD-A24 — ALTA erro direto de validação:** `producto_documentos.observacion` tem CHECK de 500 caracteres em NEX-007 e UI/validador aceitam 1000. Alinhar **UI e API a 500**, devolver erro de campo útil para 501; não mudar coluna do banco para uma observação simples, não editar migration aplicada. Testar exatamente 500 e 501 no POST/PUT e via browser.
4. **PRD-A04/A05 — proteção simples de rascunho:** formulário Produtos já calcula `sucio` mas não protege Volver/Cancelar/saída, nem inclui fotos/documentos pendentes. Integrar proteção mínima reutilizável com Clientes, apenas ao haver alterações efetivas, incluindo arquivos. Não redesenhar menu nem substituir todos os modais de ação nesta rodada.

**Critérios negativos do pacote:** PRD-A17 (paginação remota), A25 (idempotência pós-COMMIT), A30/U09 (estrutura completa de versões de apresentações), A31 (precificação por apresentação), A20/U03 (faturação por apresentação), GTIN/E706-E707 e refatorações ERP avançadas **não entram neste pacote de estabilização**. As decisões U03/U07/U08/U09/U10 continuam válidas na fonte canônica; o que depende de uma integração maior com Facturas/Movimientos fica como trabalho próprio e NÃO se declara implementado/homologado por esta entrega. `esUnidadBase` inconsistente permanece achado documentado, sem abrir nova discussão nesta rodada.

### 3. Acoplamento com Clientes e condições de parada

**Ler `AUD-CLIENTES-V1.md` seção VII** para os ajustes CLI-A06 (grants documentais), CLI-A01 (referências inativas inalteradas), CLI-A03 (gravação obsoleta), CLI-A04 (catálogo com erro) e CLI-A02 (proteção de rascunho); CLI-A05 só exige medição quando houver lentidão, não reescrever listagem na V1.

**Protocolo de Claude Code para UMA rodada conjunta:** antes de qualquer mudança, `git status`, confirmar branch `feature/NEXIT-2026-001-banco-demo`, sincronizar de modo seguro (`fetch` + fast-forward quando possível), ler integralmente `CLAUDE.md` e `documentacao/PROTOCOLO-IA.md`, trechos pertinentes do `PROGRESSO-NEXIT-V1.md`, esta seção XXII, seção VII de Clientes e regras fiscais/SQL reais. Separar commits por menu para revisão sem mistura; commits/push apenas na branch oficial, sem mexer em `AUD-*`. Não tocar VM, PostgreSQL real, Docker/deploy, gateways SIFEN nem executar SQL. Se nova NEX-052+ for indispensável, preparar justificativa, pré-inspeção e aplicação/reversão seguras no Git; **NÃO aplicar** e solicitar validação do responsável antes da implantação. Não criar documentação/status duplicado. Testes locais direcionados, TypeScript, lint e build, cobertura negativa segurança/concorrência/limites. Terminadas as alterações, relatar objetivamente resultados numéricos, bloqueios reais e SHAs, e **PARAR para nova auditoria independente do ChatGPT**.

**Estado:** Etapa 01 ACEITA ESTATICAMENTE; rodada conjunta de correções **AUTORIZADA PARA O CLAUDE**, mas AINDA NÃO IMPLEMENTADA. Nenhuma homologação, execução de testes pelo ChatGPT, PostgreSQL, VM ou migration. Auditoria integral Productos ABERTA; fechamento depende de inspeção do novo commit e aceite operacional humano.

## XXIII. AUD-R02 — revisão estática independente do pacote de estabilização Productos/Clientes (12/10/2026)

**Artefatos efetivamente conferidos:** Productos `76072e887f7a25cffa18d89ab5e2aa097abf04e1`, Clientes `389b67e28154c0935ae3c83ffd81777d4721b7b4`, limpeza `e047ce474603d42217ea54fe3413f5d50f2b1d87`; migrations NEX-052/053; verificadores/reversões; contrato de `NEX-014`, `NEX-046`, estoque, APIs PUT/GET de ambos os menus, telas/documentos e testes de estabilização. Relato Claude: **2116 verificações, 0 falhas**, `tsc` e `next build` aprovados, lint de arquivos alterados sem erros; ChatGPT NÃO executou testes locais, PostgreSQL, VM ou gateway SIFEN. Não confundir testes que inspecionam texto-fonte/simulações com provas de transações e privilégios PostgreSQL.

**Parecer:** melhorias centrais foram implementadas em fonte Git; **CORREÇÃO PONTUAL NECESSÁRIA** antes de aprovar tecnicamente a estabilização e planejar SQL operacional. Não executar NEX-052/053 nem homologar Clientes/Productos ainda.

### Achados novos e comprovados

1. **PRD-R02-01 — ALTA: a política de alcance do Stock e de Productos diverge para depósitos INATIVOS.** `lib/stock/shared.ts:10-20` usa `PERMITIDOS` sem exigir `depositos.activo` (explicitamente para manter histórico e saldos de depósitos inativos). `NEX-046-depositos-gestion.sql:200-207` define `deposito_en_alcance` também sem exigir ativo. Contudo `app/api/productos/route.ts:95-118,140` e `[id]/route.ts:166,172,183,202` filtram saldos, custo e abertura por `usuario_puede_deposito` de `NEX-014:269-275`, que **exige `d.activo`**. Logo a ficha/lista podem omitir custos/movimentos históricos de depósitos inativos e não têm paridade com Stock. Corrigir READ dos saldos/custos/histórico segundo alcance de consulta de Stock (`deposito_en_alcance`/critério equivalente); continuar exigindo depósito **ativo** para operações novas/escrita de stock. Regressão: usuário TODOS e ASIGNADOS, depósito ativo/inativo, histórico e saldo legado, multiempresa.
2. **PRD-R02-02 — MÉDIA/ALTA: configurações de depósitos fora de alcance continuam expostas pelo detalhe.** `app/api/productos/[id]/route.ts:120-127` retorna todas as linhas `producto_deposito_configuracion` da empresa com `depositoNombre`, `ubicacionPreferidaId`, mínimo/máximo e reposição, mesmo para operador restrito. O Claude deliberadamente não filtrou para evitar exclusão ao salvar, mas **a leitura** ainda revela configurações de depósitos fora do alcance, contrariando o isolamento esperado de PRD-A23. Filtrar a apresentação de configurações por alcance SEM apagar os registros não visíveis: `lib/productos/sincronizar.ts` é sincronização seletiva, não se deve emitir exclusões implícitas por omissão. Negativo: GET restrito não contém config externa, PUT restrito não apaga config externa. Avaliar se a gestão de configuração de todos os depósitos exige permissão administrativa distinta, sem inventá-la.
3. **PRD-R02-03 — PENDÊNCIA DE ACEITE: histórico existe no banco, mas ainda não é consultável na interface.** `NEX-052` cria `producto_unidad_base_historial` imutável e função de troca; `app/api/productos/[id]/route.ts` não lê a tabela nem `types/productos.ts` expõe seu histórico, e a ficha não oferece visualização das mudanças. A DEC-PRD-U07 aprovou manter histórico; para encerrar o menu de maneira simples, oferecer **leitura somente** das mudanças (anterior/nova, data e autor) na ficha, sem wizard ou outros requisitos de versionamento avançado. Não reabrir decisão nem reescrever histórico.
4. **PRD-R02-04 — SEGURANÇA DE REVERSÃO: `scripts/reversion-NEX-052.sql` não recusa rollback se NEX-053 permanecer aplicada.** NEX-053 declara dependência obrigatória da 052; reverter 052 primeiro deixaria o banco e o ledger de migrations em estado fora da ordem autorizada. Acrescentar guarda explícita de NEX-053 (objeto e/ou `schema_migrations`, conforme contrato real do runner) e exigir reversão **053 → 052**. Não executar reversões; não editar NEX-052/053 se já aplicadas — ambas constam versionadas/sem aplicação na evidência disponível.

### Verificações positivas (estáticas)

- **Troca de unidade-base:** em `app/api/productos/[id]/route.ts:264-285` a API compara valor salvo e recebido sob `FOR UPDATE` e só chama proteção quando difere; se faltar função 052, `lib/productos/shared.ts` responde 409 antes do UPDATE. A função SQL valida saldos em todos os depósitos/estados/propriedades, `inventario_costos`, permissão, unidade esperada, grava log na transação. O corpo de `inventario_agregar_linea` em NEX-052 é **idêntico ao da NEX-014 salvo `FOR SHARE` e comentário**, verificado por comparação textual independente. Concorrência/deadlock **não comprovados** em PostgreSQL, exigem teste seguro sob autorização do responsável.
- **Observação documental:** UI e `lib/productos/documentos.ts` aceitam até 500, alinhados ao CHECK do NEX-007. **Rascunhos:** `useProtegerCambios` cobre mudanças de ficha e anexos pendentes para cliques em links internos e `beforeunload`; o próprio hook documenta limitação do botão Atrás interno no App Router. Não afirmar cobertura total de navegação programática.
- **NEX-052/053 grants:** o wrapper 052 descobre helpers zero-arg e exclui a si e a base; 053 adiciona `nex_aplicar_grants_clientes()` e restaura SELECT/INSERT do histórico e ausência de DELETE físico de documentos. O efeito real de RESET e grants **não foi executado**; usar validação real de privilégios e teste de dupla transação antes de aplicar à VM.

### Critérios mínimos da correção, sem expansão

- Corrigir os dois desvios de leitura/alcance (incluindo depósitos inativos) **sem modificar** lógica de permissão dos escritores operacionais; preservar dados e configurações não visíveis no PUT.
- Histórico anterior/nova unidade consultável na ficha sem controle de edição do histórico.
- Reversão da 052 respeita NEX-053 em ordem e não pode deixar dependency dangling.
- Não reimplementar ETAPA 01, não introduzir funcionalidades avançadas U03/U09, não modificar migrations NEX-001…051, não acessar banco/VM. Se as migrations 052/053 já tiverem sido aplicadas fora do registro Git, verificar estado antes de modificar seus arquivos.

**Status:** AUD-R02 **CORREÇÃO SOLICITADA**, apenas revisão estática do Git; faltam testes reais, aplicação autorizada de migrations, screenshots e homologação humana. Menus Productos/Clientes ainda ABERTOS.

## XXIV. AUD-R03 — parecer independente do ajuste final Productos (12/10/2026)

**Revisado:** commit de implementação `0ff07fe36c144af17214e802c14728660f81423a`, teste Clientes `6f6253d9c85bcf68dcb46c7576c4dcebcd06ab80` e merge `beb9fbf75ebd42a6a9b30bbe2ae5dd92e3c94397`. Leitura comparativa de diff e fontes atuais `lib/productos/alcance.ts`, lista/detalhe/PUT de Productos, aba Inventario, tipos, script de reversão NEX-052, teste `estabilizacion.casos.ts` e critério `lib/stock/shared.ts` / NEX-046. `CLAUDE.md`, `PROTOCOLO-IA.md` e progresso atual consultados antes da emissão.

**Veredito:** **APROVADO ESTATICAMENTE para o recorte PRD-R02-01…04; nenhum novo defeito bloqueante comprovado neste diff**. Não significa menu integralmente auditado, que a VM recebeu o código ou que a NEX-052 foi aplicada. Não devolver ajustes de Productos ao Claude sem regressão concreta na verificação operacional.

- **R02-01:** `alcanceConsultaDeposito` usa empresa/usuário da sessão, `alcance_depositos = TODOS` ou `usuario_deposito`, inclusive depósito inativo, coerente com Stock; lista e detalhe o aplicam a agregados/saldos/custo/abertura. Catálogo de depósito para abertura continua exigindo depósito ativo. Conferir em PostgreSQL real a paridade em TODOS/ASIGNADOS e depósitos inativos.
- **R02-02:** políticas do detalhe têm filtro por alcance em GET; `validarAlcanceConfiguraciones` em PUT valida IDs de políticas antigas, exclusões explícitas e depósito alvo, retornando 403 para depósito fora do alcance. Sincronização seletiva não exclui por omissão. Conferir com fornecedor de sessão restrita e requests fabricados, sem tratar testes simulados como evidência de VM.
- **R02-03:** GET verifica `to_regclass` e, se existir, lê `producto_unidad_base_historial` por empresa/produto com data America/Asuncion e responsável; aba Inventario renderiza somente leitura. Sem tabela, retorna array vazio, coerente com a regra de não executar NEX-052 pelo assistente.
- **R02-04:** `reversion-NEX-052.sql` aborta se `nex_aplicar_grants_clientes()` existe **ou** NEX-053 consta em `schema_migrations`; guarda precede DDL destrutivo e respeita dependência 053 → 052. Falta testar a guarda no PostgreSQL autorizado.

**Testes e evidência:** Claude relatou 2132 verificações, zero falhas, `tsc`, ESLint e `next build` aprovados; essa contagem não foi reexecutada pelo ChatGPT. Há testes de fonte e simulados, não ensaios reais de concorrência, privilégios ou isolamento. Nenhum teste PostgreSQL, navegador, VM ou SIFEN executado nesta auditoria.

**Pendências exclusivamente OPERACIONAIS:** responsável humano deverá verificar status/migrations NEX-052/053, fazer backup e validações de segurança antes de aplicação; executar verificadores autorizados, teste de duas transações, grants e alcance restrito no banco real, depois fazer revisão visual das telas. Até isso, a mudança da unidade-base fica bloqueada por 409 sem NEX-052. **PROVEEDORES é a próxima tarefa de implementação; não reabrir Productos por padrão.**

**Estado:** AUD-R03 aprovada **somente estaticamente**; Productos ABERTO para homologação humana, nenhum SQL/deploy autorizado ou executado.


## XXV. Auditoría actual de Productos DESKTOP — 18/10/2026

**Snapshot del código:** `32b86e4e600ca7a942f910e4cd80f75263cdba54`. **Informe inmutable:** [AUD-NEXIT-PRODUCTOS-DESKTOP-R01](../../testes/AUD-NEXIT-PRODUCTOS-DESKTOP-R01-2026-10-18.md). Esta sección es la lectura actual del menú; las secciones I–XXIV anteriores contienen decisiones e historial de implementaciones, NO son un listado de defectos actuales pendientes sin revalidación.

**Política actual:** sistema ERP solo **desktop**, sin obligación móvil. Auditar un menú por vez, sin implementaciones al Claude salvo orden expresamente autorizada; no tsc/build/lint global ni acceso VM/PostgreSQL por IA.

| ID | Prioridad | Desviación constatada actualmente | Estado |
|---|---|---|---|
| **PRD-D01** | **ALTA** | `/productos/nuevo` hereda `guardPage(PRODUCTOS,VER)` y catálogo GET exige VER aunque POST exige CREAR; CREAR-only no puede dar alta | ABIERTO |
| **PRD-D02** | **ALTA** | Fallo parcial foto/documentos después del POST redirige a ficha `/productos/[id]` con VER; CREAR-only no logra retomar, ni se conserva ID en URL de alta/archivos fallidos para retry seguro | ABIERTO |
| **PRD-D03** | **ALTA** | PUT no exige ni contrasta versión de `actualizado_at` bajo row lock; un formulario antiguo puede sobrescribir columnas/hijos de otra edición, aun con `FOR UPDATE` | ABIERTO |
| **PRD-D04** | **MEDIA** | `FINALIZAR_CARGA` de CREAR-only no es idempotente después de cierre 200 exitoso cuya respuesta HTTP se perdió; retry 403 | ABIERTO |
| **PRD-D05** | **MEDIA** | CTA Nuevo y formulário editar/salvar disponibles al perfil VER-only sem CREAR/EDITAR; API denega 403 | ABIERTO |
| **PRD-D06** | **MEDIA** | `DocumentosFicha` guarda `nuevo/editando` local; componente desmonta al cambiar pestaña y `useProtegerCambios` no cubre esos borradores | ABIERTO |

**Observaciones no bloqueantes:** PRD-O01 retorno de catálogo completo con paginación local por 20 (desempeño no medido); PRD-O02 estados de error avulsos y confirmations browser nativas; PRD-O03 aplicación real NEX-038…043/052 y privilegios sin nueva verificación en esta auditoría. No afirmar ausencia de migrations por comentarios históricos.

**Correcto en el código actual:** reglas de IVA/SIFEN y unidad MT→108 con 87 distinto; nuevo vendible exige clasificación y unidad válida, producto no vendible no es emitible; protección por alcance de depósitos; NEX-052 documenta control histórico de unidad base si efectivamente aplicada; sincronización selectiva, código inmutable, archivos privados y versionados. Mantener estas reglas. El menú **Catálogos de productos** (ruta `/productos/catalogos`) se auditará en ficha propia, no se considera cubierto integralmente por esta revisión.

**Estado:** revisión estática por menú con **6 hallazgos abiertos, NO HOMOLOGADA**. Ninguna corrección funcional ni deploy autorizados por este informe. Próximo menú secuencial: Catálogos de productos, separado.


## XXVI. AUD-R02 — revalidação independente antes de nova correção Productos (19/10/2026)

**Relatório:** [AUD-NEXIT-PRODUCTOS-DESKTOP-R02](../../testes/AUD-NEXIT-PRODUCTOS-DESKTOP-R02-2026-10-19.md). HEAD de corte `b1de7713cc41f499c3f31f159ad9e20fc30d426e`. Conferidos SHA de blobs dos **11 arquivos principais** de lista/alta/ficha/formulário/documentos, APIs GET/POST/PUT/finalização, permissão documental e fechamento: **iguais** ao snapshot R01 `32b86e4e600ca7a942f910e4cd80f75263cdba54`. Nenhuma correção posterior de Clientes/Proveedores/Dashboard modificou esses arquivos de Productos; não reverter o que já foi estabilizado.

**Permanecem ABERTOS:** `PRD-D01` ALTA (CREAR-only sem rota e catálogos mínimos), `PRD-D02` ALTA (upload/foto parcial após POST sem retomada por mesmo ID nem pós-refresh CREAR-only), `PRD-D03` ALTA (PUT sem CAS/409 por `actualizado_at`), `PRD-D04` MÉDIA (cierre não idempotente para criador após resposta perdida), `PRD-D05` MÉDIA (CTAs e formulário editáveis para VER-only), `PRD-D06` MÉDIA (rascunho de novo/edição de documento desaparece ao trocar de aba). **NÃO HOMOLOGADO**, 6 achados no escopo desktop.

**Reforço preventivo na correção D01:** `GET /api/productos?modo=catalogos` hoje retorna também `catalogos.productos` com IDs/códigos/descrições dos produtos ativos; não ampliar automaticamente essa carteira a CREAR-only, nem reproduzir o bypass `catalogo=` encontrado em Proveedores. Definir resposta mínima por finalidade com política autorizada de catálogos de criação e sem decidir gate C24 no lugar do responsável. **D03:** comparar token preciso sob lock antes de efeitos de sincronização de filhos. **D02/D04:** conservar ID do produto após POST e retry idempotente do fechamento e de anexos. **D05:** preservar permissões específicas de foto/documentos. **D06:** proteger rascunho durante mudança de aba e saída.

**Preservar:** fiscais IVA/SIFEN, MT→108, unidade 87 distinta, `vendible`, estoque/alcance por depósito, NEX-052/053 e histórico, versões privadas, DELETE seletivo já validado. Não mexer em Catálogos de productos (outro menu), Stock, FE, NCE, migrations ou VM. **Testes somente focais; nenhuma suíte geral, build/tsc/lint global ou operação real de PostgreSQL por IA**. ChatGPT audita entrega após SHA; Claude apenas implementa sob ordem; responsável homologa.


## XXVII. AUD-R03 — reauditoria independente do pacote de correções desktop (19/10/2026)

**Relatório:** [AUD-NEXIT-PRODUCTOS-DESKTOP-R03](../../testes/AUD-NEXIT-PRODUCTOS-DESKTOP-R03-2026-10-19.md). Commits funcionais auditados: `d301766b6c256cfe6f6464808f8e615bfc48b5e1` (PRO-156/PRD-D03) e `6567bafb3c871f17c0d276cb422fa97de0bbd51d` (PRO-154/155/157/158/159). **Parecer: D01, D03, D04, D05, D06 CONFORMES EM REVISÃO ESTÁTICA; D02 IMPLEMENTADO MAS COM BLOQUEIO PRD-R03-01 MÉDIA; KIT/alternativos CREAR-only sob GATE C24. Productos NÃO HOMOLOGADO/NÃO ENCERRADO.**

- **D01:** layout e navegação dão alta a CREAR-only sem lista/ficha; API GET classifica finalidade e não entrega `catalogos.productos` sem VER. **C24:** esse vazio impede escolher componente/alternativo do KIT, sem decisão funcional de política de referência. Não inventar ACL global.
- **D03:** PUT exige token `actualizado_at` textual com 6 decimais, consulta `FOR UPDATE`, compara antes de filhos/preços/UPDATE e conserva HTTP 409/ROLLBACK em versão obsoleta; UI oferece releitura deliberada. Sem transação real PostgreSQL.
- **D04:** cierre do mesmo criador/empresa CREAR-only é idempotente; novo upload após flag fechada continua vetado.
- **D05:** CTAs e formulário comum dependem de CREAR/EDITAR reais, foto/documentos preservam autorização de ação fora do bloco desabilitado.
- **D06:** novo/edição de documento comunica estado de borrador ao pai; trocar aba e sair com rascunho solicita confirmação. Sem navegador.
- **PRD-R03-01 MÉDIA NOVA:** ao recarregar `/productos/nuevo?retomar=<id>` após algum upload falhar, `nuevo/page.tsx` restaura `foto:null` e `pendientes:[]`, esquecendo **o fato de que faltavam arquivos**; `RetomarAlta` calcula `faltan=false` e habilita `Cerrar carga inicial` imediatamente, sem requerer reeleição ou confirmação explícita para abandonar arquivos, fechando a janela CREAR-only. Diferenciar retomada de arquivo pendente de retry só do cierre; exigir upload/reseleção ou confirmação expressa de abandono, nunca reupload de arquivo já confirmado. Testes focais sem suíte geral; só Claude sob nova autorização, depois ChatGPT R04.
- **PRD-GATE-C24:** acesso de CREAR-only ao seletor de referências do KIT/alternativos ainda exige decisão de negócio, vinculado ao C24 global (visibilidade de produto sem expor estoque/custos de outros depósitos).
- **Testes:** Claude informou 36/0 focais + 145,38,135,28,137,32,60,36,46 sem falhas em suites regressivas; **ChatGPT não reexecutou** e não testou HTTP, React, PostgreSQL, VM, Docker, migrations ou CI. Nenhum código funcional ou SQL alterado pelo auditor.

**Linhas e provas completas, limites e critérios de R04 no relatório R03.** Tarefas Linear PRO-154…159 acompanham aceite estático/pendência; nova tarefa específica para PRD-R03-01. Nenhuma homologação ou avanço automático a Catálogos de productos.


## XXVIII. AUD-R04 — revisão independente PRO-160 após commit 32a9196 (19/10/2026)

**Relatório completo:** [AUD-NEXIT-PRODUCTOS-DESKTOP-R04](../../testes/AUD-NEXIT-PRODUCTOS-DESKTOP-R04-2026-10-19.md). **SHA auditado:** `32a9196827ceb43a3bb38839f531076d14bf731c`, diff **6 arquivos** (+120/−22). **Parecer: PRD-R03-01 / PRO-160 PARCIALMENTE CONFORME, mas PRD-R04-01 MÉDIA ABERTA. Productos NÃO HOMOLOGADO/NÃO ENCERRADO.**

- **Correção R03-01 aceita nos caminhos testados estaticamente:** `pend=archivos` ou `pend=cierre` na URL, com ausente/desconhecido→archivos; confirmar descarte antes de cierre após refresh quando uploads podem faltar; cancelar sem chamada, falha HTTP mantém tentativa, encerramento de todos uploads → retry direto; arquivos confirmados fora da fila, sem segundo POST de produto. Falha de rede em upload avisa resultado incerto.
- **PRD-R04-01 MÉDIA — falha nova na própria retomada:** na **mesma sessão**, com anexos A/B falhados e `pendientesExactas=true`, clicar `Quitar` em A só o remove do array, sem confirmar seu abandono; enviar B com sucesso deixa `fallas.length===0`, o código chama `marcarEstado('cierre')` porque `pendientesExactas` segue true. Botão «Cerrar carga inicial» então fecha sem pedir confirmação pelo A removido. Idem ao remover foto pendente e enviar documento restante. Corrigir somente com autorização do responsável: confirmação específica da exclusão ou rastreio de abandono no estado; nunca inferir `cierre` a partir de upload de um subconjunto sem validar que os originais foram confirmados ou conscientemente descartados. Testes curtos de remoção parcial, cancelamento e reenvio total.
- **Testes informados pelo Claude, não executados por ChatGPT:** `productos-r02.casos.ts` 46/0 (+10) e `documentos-archivos` 135/0, lint/tipos pontuais; caso de Quitar A + reenviar B não coberto. Nenhum teste real React, navegador, HTTP ou PostgreSQL. Nenhuma modificação no SQL/migrations ou outros menus.
- **Outros itens:** D01, D03, D04, D05, D06 seguem aceite estático da R03, D02 e PRO-160 parcialmente conformes; C24 / PRO-161 pendente decisão de catálogo KIT/alternativos CREAR-only. Não ampliar GET catálogos nem iniciar Catálogos de Productos. Depois do fix pontual autorizado, reauditar R05 por ChatGPT.


## XXIX. AUD-R05 — revisão independente PRO-162 após commit 8b507d7 (19/10/2026)

**Relatório:** [AUD-NEXIT-PRODUCTOS-DESKTOP-R05](../../testes/AUD-NEXIT-PRODUCTOS-DESKTOP-R05-2026-10-19.md). **SHA funcional auditado:** `8b507d72e31ae8be79503460129e9517fa04870c`, commit de 4 arquivos (+67/−7). **Parecer: PRD-R04-01/PRO-162 PARCIALMENTE CONFORME, mas PRD-R05-01 MÉDIA ainda BLOQUEIA ENCERRAMENTO DE PRODUCTOS. NÃO HOMOLOGADO.**

- **Corrigido para arquivos originalmente falhados:** RetomarAlta guarda UIDs de `pendientesIniciales` e presença de `fotoInicial`; «Quitar» nesses itens seta `abandono=true`. `estadoTrasEnvio(fallas,pendientesExactas,abandono)` não muda para `pend=cierre` se algum original foi descartado, mantendo confirmação explícita do fechamento; cancelar mantém a retomada, todos originais confirmados passam a cierre direto. PRO-160 de refresh, atraso HTTP, idempotência, CREAR-only e autorização preservados.
- **PRD-R05-01 MÉDIA — defeito residual:** `originales` inclui somente `pendientesIniciales`. Documento **novo adicionado na retomada**, cujo upload falha e que depois é removido, não é reconhecido por `esAbandono(uid,originales)`. Igualmente foto **nova** que falha e é removida não marca abandono porque `fotoInicial===null`. Exemplo: A pendente inicial, usuário adiciona C; A/C falham; remove C; reenvia A com sucesso; `estadoTrasEnvio(0,true,false)='cierre'` sem confirmação para C. **Corrigir o rastreio de pendências de uploads que realmente falharam, independentemente de serem originais ou novos**. Arquivo novo removido **antes de qualquer tentativa** não exige confirmação. Exigir confirmação no fechamento para abandono pendente, sem duplicar POST/produto/upload; testes focais.
- **Testes reportados pelo Claude, não reexecutados pelo ChatGPT:** `productos-r02` 53/0 (+7), lint e tipos pontuais OK; sem React/browser, HTTP real, PostgreSQL, VM/SQL/migrations, suite global ou CI. Os novos testes cobrem remoção original, não a retirada após falha de novo arquivo.
- **Estados:** PRO-162 In Review parcialmente aceito, PRD-R05-01 Todo, PRO-160/PRO-155 In Review, PRO-154/156/157/158/159 estáticos conforme R03; KIT/alternativos PRO-161/C24 aguardando decisão humana. **Productos NÃO ENCERRADO / NÃO HOMOLOGADO.** Claude só implementa PRD-R05-01 se o responsável autorizar, com testes curtos e AUD-R06 posterior de ChatGPT; não avançar Catálogos de Productos.


## XXX. AUD-R06 — reauditoria independente de PRO-163, SHA ac514da3 (19/10/2026)

**Relatório:** [AUD-NEXIT-PRODUCTOS-DESKTOP-R06](../../testes/AUD-NEXIT-PRODUCTOS-DESKTOP-R06-2026-10-19.md). **Commit funcional:** `ac514da30cd69ee733cc2fe13269a6a792de0054`, **4 arquivos**, +127/−13. **PARECER: PRO-163 / PRD-R05-01 CONFORME ESTATICAMENTE; nenhum novo bloqueio corretivo identificado neste recorte. NÃO HOMOLOGADO.**

- `RetomarAlta` utiliza `fallidos` por UID de documento e `ID_FOTO`, iniciando pelas pendências originais e passando a incluir também as tentativas **novas** que falharam. `registrarEnvio` adiciona falhas e remove confirmados. «Quitar» chama `quitarArchivo`: apenas arquivo já falhado gera `abandono=true`; arquivo novo nunca tentado não gera falsa advertência.
- Se novo C falha e é removido, enquanto A original é enviado com sucesso, `estadoTrasEnvio(0,true,true)` mantém a confirmação de abandono no cierre; idem foto nova F com upload falhado e removida. Sem abandono, todos confirmados, `pend=cierre` é direto; cancelar decisão não chama API. `pend=archivos` após reload e retry de `pend=cierre` continuam como antes, sem segundo POST de criação.
- **Claude informou** `productos-r02` **61 verificações / 0 falhas** (8 novas) e lint/types pontuais OK; **ChatGPT não executou esses testes nem renderizou React/HTTP/PostgreSQL/VM**, nem executou suíte geral, migrations ou CI.
- **PRO-154…160/162/163:** sem bloqueio corretivo conhecido no fluxo auditado, `In Review`, **não Done** até homologação humana. **PRO-161 / GATE C24 (KIT/alternativos para CREAR-only): Todo e exige decisão do responsável**; não habilitar `catalogos.productos` indiscriminadamente. **PRO-68 / Productos tecnicamente revisado no recorte R02–R06, NÃO HOMOLOGADO e sem alegação de auditoria exaustiva de todo o menu.**
- O responsável pode autorizar a auditoria do próximo menu, **Catálogos de productos**, sem transformar o aceite estático de Productos em homologação ou decidir C24. Não implementar automaticamente outros menus.
