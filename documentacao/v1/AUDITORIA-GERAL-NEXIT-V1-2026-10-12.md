# Auditoria geral NEXIT V1 — escopo, inventário e achados iniciais

**Situação: EM ANDAMENTO — NÃO É AUDITORIA INTEGRAL CONCLUÍDA.** O responsável solicitou leitura e verificação linha por linha de todos os menus e arquivos da branch `feature/NEXIT-2026-001-banco-demo`. Este documento registra somente o que foi efetivamente examinado, e serve de trilha da revisão sem permitir que a IA declare 100% por engano.

## Inventário confirmado via árvore recursiva GitHub
- 852 entradas incluindo pastas; 648 arquivos/blobs, árvore não truncada; 36 páginas `app/**/page.tsx`; 83 rotas `app/api/**/route.ts`; 51 migrations NEX-001…051.
- Caminhos e protocolos verificados: `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, `lib/navigation/menu.ts`, `app/(private)/layout.tsx`.
- Inspeção transversal inicial: `lib/fiscal/unidades-sifen.ts`, `app/(private)/productos/_components/pestanas/informacion.tsx`, `app/(private)/productos/_components/pestanas/sifen.tsx`, `app/(private)/productos/catalogos/page.tsx`, `lib/facturacion/emision.ts`, `documentacao/banco/nexit/v1/migraciones/NEX-039-unidades-medida-sifen.sql`, `NEX-043-unidades-medida-sifen-nt023.sql`, `lib/ui/proteger-cambios.ts`.
- **Não auditados integralmente neste registro**: demais arquivos, controles de permissão e todas as APIs/SQL, CSS/responsividade real, execução de PostgreSQL, comportamento no navegador. Mencionar explicitamente essas lacunas até terminar módulo a módulo.

## Mapa dos menus ativos V1
`lib/navigation/menu.ts` define grupos Maestros, Compras, Inventario, Ventas, Finanzas, Facturación, Reportes e Administración. `V1_HREFS` libera apenas caminhos implementados: Clientes, Proveedores, Productos, Catálogos de productos, Listas de precios, Catálogos comerciales, Stock, Reposición, Depósitos, Documentos electrónicos, Facturas, Movimientos e seis rotas de Reportes. Menus descritos mas não listados em `V1_HREFS` não devem ser classificados como funcionalidades entregues. Administração de plataforma tem fluxo distinto (Empresas). Validar correspondência real de permissões de cada item e page guard/API guard nas fases seguintes.

## Achados iniciais fundamentados

**AG-001 / crítica / Productos → Facturación / Dado fiscal obrigatório sem contrato no cadastro:** `Productos Información` monta `Unidad base` com `catalogos.unidades`, não com o catálogo completo SIFEN. `Productos SIFEN` exibe `unidad?.sifenCodigo` em campo só leitura e informa que falta de equivalência não impede salvar produto. `lib/facturacion/emision.ts` lê `unidades_medida.unidad_sifen_codigo`, e o formulário de Facturas impede produtos sem essa coluna. O SQL de leitura que o responsável executou na VM confirmou seis unidades comerciais com `unidad_sifen_codigo = NULL` e dois produtos associados à UN. A decisão expressa do responsável é que **toda unidade de produto faturável tenha correspondência SIFEN**, e que as 64 opções oficiais sejam utilizáveis no cadastro. Corrigir cadastro/UI/APIs/regras sem corromper histórico; não editar NEX-039/043 aplicadas.

**AG-002 / alta / menus Catálogos Produtos:** `app/(private)/productos/catalogos/page.tsx` contém chamada direta a `window.confirm` na função `confirmarDescarte`, incoerente com exigência do usuário de modal profissional em navegação interna. Auditar ocorrência em todas as telas, não apenas Facturas.

**AG-003 / média / Facturación / Paginação:** `buscarClientesFactura` e `buscarProductosFactura` usam `count(*) OVER() AS total` e derivam total exclusivamente das linhas da página. `OFFSET` além da última página produz `total=0` apesar de existirem registros elegíveis. Separar contagem global filtrada da página, ou tratar página fora de intervalo preservando total.

**AG-004 / escopo / navegação:** há itens declarados para Notas de crédito, Notas de remisión, Monitor SIFEN, Compras, Ventas, Finanzas e Administração que ficam intencionalmente ocultos por `V1_HREFS`. Não sinalizar como erro de rota sem confrontar escopo/cronograma de V1. Entretanto comparar se o usuário espera esses menus e se o conjunto real é coerente com os requisitos já aprovados.

**AG-005 / migrações:** NEX-001…051 já foram mostradas como aplicadas na VM em captura anterior do responsável. Runner registra versão/checksum em `schema_migrations`, por isso preservar todas as migrations aplicadas; alterações de schema futuras por **NEX-052 incremental**, somente se estritamente necessárias e aprovadas, com reversão apropriada. Não recomendar reaplicar antigas, reiniciar banco nem atualizar massivamente unidades fiscais existentes sem diagnóstico.

## Plano da revisão integral solicitado pelo responsável

Fase A: mapa menu → página → APIs → módulos `lib` → tabelas, permissões e migrations, incluindo fluxos de login/admin. Fase B: auditoria funcional/campo a campo de Maestros (Clientes, Proveedores, Productos, Catálogos, Precios). Fase C: Operações (Inventario, depósitos, Stock, Movimientos, Reposición, Compras/Recepciones quando aplicáveis). Fase D: Facturación completa, JSON SIFEN, gateway, lote, PDFs, notas crédito planejadas. Fase E: Reportes, Dashboard, Administração e infraestrutura/CI/testes. Em todas fases: isolamento multiempresa, autorização backend+SQL, requisitos V1, erros, formulários, usabilidade, evidência do código versus evidência operativa. Não atribuir estado AUDITADO a módulo enquanto não tiver verificação completa; registrar artefatos e achados por arquivo/linha e severidade.

**O usuário pediu AUDITORIA, não autorização genérica para Claude refazer 648 arquivos**. ChatGPT apura defeitos reais e fecha decisões, Claude só recebe tarefas aprovadas após relatório. Nenhuma mudança em código/SQL ou VM está autorizada por este inventário inicial.

## Segunda passagem — 12/10/2026, revisão crítica da auditoria

**Escopo efetivamente revisto nesta passagem:** árvore recursiva completa (648 blobs), classificação de 367 arquivos de código em app/lib/components, 36 page.tsx, 83 endpoints API; exame dirigido de `lib/navigation/menu.ts`, `lib/auth/permissions.ts`, `lib/facturacion/emision.ts`, `app/api/facturas/{clientes,productos}/route.ts`, `app/(private)/facturas/nueva/page.tsx`, `app/(private)/productos/catalogos/page.tsx`, `app/(private)/productos/_components/pestanas/{informacion,sifen}.tsx`, `lib/fiscal/unidades-sifen.ts`. Não equivale à leitura linha a linha do universo completo.

**AG-006 / alta / Catálogos de productos / janela nativa em operação destrutiva:** `app/(private)/productos/catalogos/page.tsx` função de inativação executa `window.confirm(\`¿Inactivar «${fila.nombre}»? ${detalle}\`)`, além do `window.confirm` em `confirmarDescarte` (AG-002). Ambas precisam avaliação de substituição por modal de confirmação de padrão Nexit, sem remover aviso contra operação indevida.

**AG-007 / alta / Facturas / rastreamento incompleto de dirty:** `app/(private)/facturas/nueva/page.tsx` usa `const sucio = resultado === null && (cliente !== null || lineas.length > 0 || infoAdicional !== "")`; campos editáveis de configuração da emissão não entram na condição. Revisar comparação do estado inicial com atual, incluindo preseleções e edição real, e efeitos de gravar/enviar.

**AG-008 / preocupação de contrato / seleção de preço:** `lib/facturacion/emision.ts` consulta `v_producto_precio_referencia` e usa permissão independente `FACTURACION_ELECTRONICA.PRECIO` para alterar preço; falta comprovar correspondência com a lista de preços aplicável, moeda, cliente e ordem de precedência comercial da V1. **PENDENTE DE VERIFICAÇÃO**: não declarar defeito sem confrontar origem da view e regras documentadas.

**AG-009 / preocupação de contrato / movimentos/stock:** `productos.unidad_medida_id` e o vínculo ao catálogo fiscal são usados por faturação. Ainda precisa auditoria das conversões comerciais/presentações, quantidades e movimentos de inventário; NÃO assumir que corrigir o combo de Produtos autoriza atualização indiscriminada de estoque histórico. **PENDENTE DE VERIFICAÇÃO**.

**AG-010 / qualidade da auditoria / cobertura:** a inspeção de `V1_HREFS` sozinha não avalia campos, permissões nem execução de cada menu. Uma auditoria 100% exige examinar cada caminho page → API → lib → tabelas/migrations, testes existentes e fluxos negativos; e homologação visual separada em VM. A revisão parcial é explicitamente **NÃO HOMOLOGADA**.

**Regra de correção fiscal atualizada pelo responsável:** todas as unidades selecionáveis para os produtos faturáveis devem corresponder a unidades SIFEN válidas; disponibilizar seleção de todos os códigos SIFEN de NEX-039/043. A tabela de seis unidades comerciais sem vínculos da VM não autoriza inferir que existam só seis unidades SIFEN; não criar cópias indiscriminadas nem editar migrations já aplicadas. Qualquer transição de modelo requer auditoria de estoque/conversões e migration incremental aprovada, se realmente necessária.
