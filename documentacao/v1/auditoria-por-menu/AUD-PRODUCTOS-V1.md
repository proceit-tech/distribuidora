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

- **DEC-PRD-U01**: `MT — Metro` já existe no banco e o SIFEN oferece **87/m** e **108/MT**. Selecionar qual mapeamento se aplicará à unidade histórica, sem apagar a outra opção oficial do catálogo de novas seleções.
- **DEC-PRD-U02**: decidir se um produto novo `MERCADERIA/SERVICIO` com `vendible=true` deve ser impedido de salvar quando a classificação IVA não estiver definida, ou se fica salvo como cadastro incompleto e bloqueado apenas na emissão. O código hoje aceita e deixa a emissão bloquear; unidade fiscal foi expressamente definida como obrigatória.
- **DEC-PRD-U03**: apresentação declarada base deve obrigatoriamente equivaler a unidade base do produto com fator 1? Recomendação: sim. Antes de mudar constraint, conferir registros legados.
- **DEC-PRD-U04**: classificação e GTIN de embalagens — precedência entre `codigoBarras`, `producto_codigos.esPrincipal` e `producto_unidades.codigo_barras`, antes de atribuir E706/E707 ao gateway.
- **DEC-PRD-U05**: abrangência do saldo por depósito para usuários com alcance de sucursal limitado; regra sugerida restritiva, mas requer confronto com autorização real.
- **DEC-PRD-U06**: seleção automática de IVA 10% no formulário de novo produto (default) versus obrigatoriedade de escolha explícita.

## VI. Revisões pendentes antes de considerar 100% do menu

- [ ] Ler criticamente TODOS os `app/(private)/productos/**` incluindo listagem/CSS/responsividade.
- [ ] Percorrer todos `app/api/productos/**`, `lib/productos/**`, `types/productos.ts`, autenticação/armazenamento compartilhados, com contratos HTTP/campos.
- [ ] Confrontar as regras existentes com documentos SIFEN/DNIT versionados, inclusive pacote binário, e separar vigência de proposta.
- [ ] Auditar todas as dependências de inventário, listas de preços, clientes/faturação; evitar alterar tabelas interligadas sem mapa de impacto.
- [ ] Revisar constraints/triggers/índices e SQL incremental NEX-003…051 em todos pontos de dependência, sem executar nem modificar SQL aplicado.
- [ ] Testes locais automatizados realmente executados e registrados; testes manuais/visuais na VM pelo responsável.
- [ ] Obter respostas a DEC-PRD-U01…U06; somente depois fechar parecer do menu, separar achados confirmados e tarefas aprovadas para Claude.

**Auditoria permanece ABERTA. O responsável pediu perguntas de negócio ANTES de encerrar cada menu; respostas devem ser registradas aqui.**

## VII. Revisão transversal posterior — seleção de itens vendíveis (confirmado)

**PRD-A15 / CRÍTICA OPERACIONAL / Productos → Facturas:** `lib/productos/normalizar.ts:314` persiste a flag `vendible` (o cadastro e a DDL expõem `productos.vendible`), mas `lib/facturacion/emision.ts:82-92` define `SELECT_PRODUCTOS` apenas com `p.activo` e `p.tipo_producto IN ('MERCADERIA','SERVICIO')`, sem `p.vendible`. O mesmo SELECT é usado tanto na busca `buscarProductosFactura` (`:102`) quanto em `prepararFactura` (`:201`). Resultado demonstrável pelo SQL: mercadoria/serviço ativa marcada `vendible=false` pode ser listada e processada para emissão se cumprir as outras regras fiscais. **Correção a exigir ao Claude futuramente:** filtro/revalidação no servidor; UI deve mostrar somente elegíveis ou explicar exclusão, com teste regressivo `vendible=false`. Não é necessário SQL para este bug.

**PRD-A16 / MODERADA / catálogo fiscal vigente:** `NEX-039` define `unidades_medida_sifen.vigente`; `SELECT_PRODUCTOS` associa a unidade sem condicionar `us.vigente`, e validações observadas bloqueiam apenas código `NULL`. Checar regras DNIT para códigos eventualmente desativados; caso a coluna seja operacional, tanto seleção quanto emissão devem rejeitar `vigente=false`. **Pendente confirmar contrato** antes de converter em defeito de negócio.
