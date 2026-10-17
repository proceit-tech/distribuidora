# Nexit V1 — Especificação consolidada de ajustes de Productos (ChatGPT, 2026-10-12)

**Estado:** análise e instrução autorizada para implementação das correções não ambíguas; **homologação humana pendente**. **Claude implementa; ChatGPT audita; responsável opera VM**. Branch `feature/NEXIT-2026-001-banco-demo`. Não acessar VM, não executar migrations nem deploy. Consultar `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e matriz anterior antes de implementar.

## 0. Evidência, escopo e retificações

**Fonte visual:** nove capturas reais de Productos enviadas pelo responsável em conversa ChatGPT em 2026-10-12: Información, SIFEN y códigos (2 telas), Inventario, Compras (2 telas), Logística, Alternativos y kits e Documentos. **Arquivos binários NÃO estão versionados no GitHub por esta publicação:** referência de chat e nomes ainda devem ser substituídos por cópias originais após upload tecnicamente autorizado; NÃO alegar evidência ANTES arquivada no Git. Não usar imagem externa/genérica.

**Código conferido na branch:** `app/(private)/productos/_components/{producto-form.tsx,campos.tsx,pestanas/{informacion,sifen,inventario,compras,logistica,kit,documentos}.tsx}`, `lib/productos/{formulario,normalizar,shared}.ts`; endpoints de documentos `app/api/clientes/[id]/documentos/route.ts`, `app/api/proveedores/[id]/documentos/route.ts`, regras `lib/almacenamiento/archivos-reglas.ts`, matriz normativa Productos e propostas fiscais NEX-039/040. Revisão **estática/visual**: não executados testes reais de browser ou PostgreSQL.

**Retificação obrigatória:** o responsável clicou em **Agregar** para apresentar cada coleção. `formularioInicial()` devolve arrays vazios. **NÃO existe defeito de abertura automática de cartões**; nunca remover a possibilidade de adicionar cartões vazios antes do salvamento. Em Documentos é a TELA REAL de Productos, não outra tela; nenhuma imagem de terceiros é parte das evidências.

## 1. Revisão normativa SIFEN — P0

**Fonte primária:** DNIT Nota Técnica n° 23, PDF oficial `https://www.dnit.gov.py/documents/20123/388810/NT_E_KUATIA_023_MT_V150.pdf/9580922b-5dd5-60f9-4857-ae66a757898f?t=1724956850006`, §3.1, que **amplia** a Tabela 5 do MT v150 em **30 unidades novas**; além das **34 anteriores**, perfaz 64 entradas nessa versão consolidada. Não confundir o manual original de 34 com catálogo vigente após NT023. Confirmar grafia e códigos diretamente na fonte antes de editar SQL/TS. As novas entradas são:

| E709 | E710 | Descrição |
|---|---|---|
| 111 | 4A | Bovinas |
| 112 | Ci | Curie |
| 113 | DOC | Docena |
| 114 | GLL | Galones (US) (3,7843 LT) |
| 115 | GRO | Gruesas |
| 116 | E4 | Kilogramo Bruto |
| 117 | KT | Kits |
| 118 | M5 | Microcurie |
| 119 | MCU | Milicurie |
| 120 | MIL | Millar |
| 121 | PAR | Par |
| 122 | FOT | Pies |
| 123 | FTK | Pies Cuadradas |
| 124 | PCE | Piezas |
| 125 | KLT | Quilate |
| 126 | RM | Resmas |
| 127 | RO | Rollos |
| 128 | kWh | 1000 Kilowatt Hora |
| 129 | U(JGO) | Mazos |
| 130 | DR | Tambores |
| 131 | BX | Caja |
| 132 | SET | Juego |
| 133 | PK | Paquete |
| 134 | BG | Bolsa |
| 135 | DPC | Docena Par |
| 136 | JR | Pote |
| 137 | BL | Fardos |
| 138 | AB | Bulto |
| 139 | BK | Cesta |
| 140 | BW | Peso Base |

**Defeito comprovado:** `NEX-039-unidades-medida-sifen.sql` e `lib/fiscal/unidades-sifen.ts` têm apenas as 34 unidades antigas. A matrícula anterior afirma incorretamente que Caja e Docena não existem na tabela fiscal. **Correção permitida:** atualizar catálogo versionado e TypeScript, seed para novas instalações, asserts e documentação para 64 códigos; habilitar vínculo **CJ → 131/BX, DOC → 113/DOC** quando correspondência comercial for de fato essas unidades, sem tocar IDs, conversões ou apresentações e sem operar banco existente. `MT` continua pendente (87/m ou 108/MT). **Atenção:** `NEX-039` é descrita como não aplicada, mas conferir `schema_migrations` antes de editar migration em ambiente real; se aplicada, criar nova incremental, nunca reescrever checksum. Preservar rollback e grants.

**Outras regras:** E701 identificação fiscal do item, E702 partida arancelaria, E703 NCM, E704/E705 DNCP, E706/E707 GTIN, E708 descrição, E709/E710 unidade, E711 quantidade e E712/E713 origem, E714 informação adicional. NT009 altera limites E701/E708 (20→50 e 120→2000), NT023 amplia casas decimais E711, NT026 altera exigência DNCP. **Não alterar limites empresariais 20/120 sem aprovação**; quantidade da operação não é campo mestre. E731 afetação 1/2/3/4; E733 proporção 100/0/parcial; E734 taxa 0/5/10; E735–E737 são cálculos da linha, nunca valores fixos do produto. Preservar `EXE` legado sem inferência. Verificar consistência normativa da implementação, não implementar emissão de DTE.

## 2. Correções funcionais/visuais por aba

### Información
- Manter `codigo` interno automático/imutável, `codigoInventario`, `codigoSifen` e identificadores externos conceitualmente distintos; **não duplicar campos editáveis**.
- `Descripción interna` e `Descripción para factura` têm funções distintas; preservar; não ocultar dados comerciais.
- `Impuesto / IVA`, país de origem e `Valor venta referencia` aparecem como `<Texto readOnly>` com aparência de input. Padronizar a forma de apresentação **informativa**, sem segundo caminho de edição ou status enganoso de disabled. `Valor venta referencia` = preço referência × estoque; não chamar de valor contábil de inventário.
- `Imagen (URL)`: pedido de alinhar à gestão privada de arquivos como foto do produto, **sem eliminar suporte a URLs legadas**. Não confundir foto principal com documento técnico. Se exigir mudanças estruturais extensas, explicitar separação técnica na entrega.

### SIFEN y códigos
- Preservar E731/E733/E734 e aviso de ausência de equivalência fiscal sem bloquear cadastro; alíquotas coerentes com afetação; origem ISO3; NCM/DNCP conforme pacote normativo.
- **PRD-REV-02 (decisão pendente):** `codigoBarras` principal do produto, `producto_codigos` com `esPrincipal`, `producto_unidades.codigo_barras` de apresentação são hoje três fontes sem regra de precedência demonstrada. **NÃO sincronizar arbitrariamente nem remover colunas/códigos**: elaborar e registrar contrato proposto, manter edição atual até aprovação; eventual aprimoramento de rótulos/ajuda que não altera semântica é autorizado.
- Para integração com ERPs externos, não usar GTIN ou `codigoSifen` como chave ERP; `OTRO` não define origem, empresa/instância do ERP, external ID e unicidade. **PRD-REV-07 pendente**: especificar proposta de tabela `producto_identificadores_externos` (escopo por `empresa_id`, sistema de origem, instância, código externo, produto interno, unicidade e RBAC), mas não introduzir conector SAP/TOTVS nem migration sem revisão e decisão posterior.

### Inventario
- Preservar movimento real de abertura, custo/saldo somente leitura, política por depósito e controle por lote/série. Agrupar visualmente: parâmetros de estoque, abertura apenas na criação, indicadores operacionais somente leitura, políticas por depósito.
- Não atualizar saldos/custos pelo mestre; preservar precisão decimal e FKs; evitar apresentação de `Stock actual` como campo editável.

### Compras
- Preservar apresentações, fatores, estoque/base/compra/venda, fornecedor, custo de referência, moeda, prazo, quantidade mínima. Compactar cartões e mensagens **sem esconder/apagar campos**. Nunca inferir fator 12 de `Caja` ou de `Docena` a partir da descrição fiscal; conversões comerciais são informação independente.
- Vincular conceitualmente a apresentação a E707 sem criar ligação técnica arbitrária nem reclassificar códigos sem decisão.

### Logística
- Separar visualmente características físicas (peso, comprimento, largura, altura, volume) de merma/quiebra; E715…E718 são informações fiscais da operação quando correspondem, não efeitos automáticos no inventário mestre. Manter os campos e regras de negócio.

### Alternativos y kits
- `PestanaKit` já desabilita adição de componentes fora do tipo `KIT`, e servidor valida; **não apontar isso como falha**.
- Preservar alternativos independentes de componentes; regras futuras de baixa de kit e operação dependem de decisão, **não implementar nova baixa de estoque**.

### Documentos — correção funcional autorizada / DEC-PRD-04
- `documentos.tsx` exige `Nombre del archivo` e **URL del archivo**; `normalizarProducto` também exige URL. Não é o mesmo fluxo de Clientes/Proveedores.
- Adotar para **Produtos** a implementação de arquivos privados já existente em **Clientes/Proveedores**, adaptando entidade/rotas/permissões `PRODUCTOS`, `empresa_id` da sessão, versões, histórico, proteção de download, tipos Ficha técnica / Hoja de seguridad / Certificado / Imagen / Otro, datas, observação. Reutilizar infraestrutura de `lib/almacenamiento/archivos-privados`, regras de arquivo, autorização, assinatura de conteúdo e persistência `NEXIT_ARCHIVOS_DIR`.
- Preparar migration **incremental e compatível** para metadados e versões se requerida, mantendo os links e registros `producto_documentos.url_archivo` anteriores e permitindo visualizá-los. Não apagar nem converter URLs legadas em arquivos locais fictícios.
- Fluxo de criação do produto: não exigir UUID antes da criação; utilizar padrão já existente de upload pós-criação com janela de carga inicial autorizada ou estratégia equivalente sem perda de dados e sem permitir anexar em produto de outra empresa.
- Histórico/versionamento/substituição/remoção lógica precisam seguir modelo de Clientes/Proveedores; não aceitar entrada URL como única opção de documentos novos. Verificar transações/compensação de arquivos.
- Não inventar uma segunda tela; modificar aba existente. Este ajuste abrange somente Documentos de Produtos, sem editar módulo de Clientes/Proveedores salvo biblioteca compartilhada absolutamente necessária e testada.

## 3. Padrão visual transversal — PRD-REV-05

- Preservar sete abas, botões **Agregar** intencionais, abas com erros mapeados, validação real de campos, rodapé Guardar/Cancelar e responsividade.
- Confrontar componentes e padrões efetivos de Clientes/Proveedores (não só capturas): tamanhos/altura, botões, espaçamento, mensagens, datas `dd/mm/aaaa`, estados vazios, campos de leitura, feedback de upload e ações. Reutilizar componentes existentes onde compatível.
- Não acrescentar cabeçalhos duplicados, avisos extensos permanentes, telas novas nem referências visuais externas; evitar CSS que esconda o último campo sob footer sticky.
- Evidências ANTES são as capturas reais do chat **não versionadas**. DEPOIS deve ser fornecida evidência do ambiente a ser homologado pelo responsável; não fabricar screenshots.

## 4. Checklist e limites de autorização

| ID | Tipo | Situação | Trabalho autorizado |
|---|---|---|---|
| PRD-REV-01 | **P0 defeito normativo comprovado** | Catálogo 34 sem unidades NT023 | Corrigir catálogo para 64, seed, testes, documentos, retrocompatibilidade |
| PRD-REV-02 | Decisão comercial/semântica | GTIN principal × barcode mestre × embalagem | **Só especificar proposta**, sem reconciliar valores |
| PRD-REV-03 | **P1 lacuna comprovada** | Produtos Documentos exige URL | Implementar upload privado/versionamento padrão Clientes/Proveedores, preservar legado |
| PRD-REV-04 | P1 aprimoramento | Foto URL | Implementar upload privado de imagem somente se puder reutilizar infraestrutura sem alterar semanticamente fotos legadas |
| PRD-REV-05 | P1 visual | Divergências de apresentação/consistência | Ajustar as sete abas sem eliminar campos |
| PRD-REV-06 | P1 preservação de regra | Conversão/apresentações | Verificar regras no código e manter sem auto-conversões inventadas |
| PRD-REV-07 | Decisão de arquitetura | Mapa ERP externo | **Só proposta documentada**, sem nova integração/migration |
| PRD-REV-08 | Decisão de negócio | KIT e merma operacional | **Não implementar novas regras**, documentar pendências |

**Sem autorização:** mexer na VM, migrar banco real, executar Docker/deploy, emissão SIFEN, mudar limite E701/E708, inferir EXE, definir MT 87/108, inventar códigos primários, apagar códigos de barras/URLs/arquivos ou colocar novas regras de stock em produção. Se um subitem depender de escolha que altere negócio, **não implementar por presunção; documentar bloqueio específico**.

## 5. Critérios de aceite por evidência

1. Confirmar 34+30 unidades e preservação dos 34 códigos antigos (source comparison MT150/NT023); catálogo novo e API expõem CJ=131 e DOC=113 onde vínculo escolhido para seed novo; dados reais preexistentes não atualizados por seed `ON CONFLICT DO NOTHING`.
2. Criar/editar Produto com zero ou vários códigos, apresentações, fornecedores, depósitos, alternativos, kits e documentos; valores editados persistem por ID; remover só com exclusão explícita; empresa alheia retorna acesso negado.
3. Documento de produto novo: selecionar arquivo local PDF/PNG/JPG/DOCX/XLSX conforme regras existentes, gravar via armazenamento privado, baixar com permissão, criar nova versão, visualizar metadados; legado por URL continua legível. A criação pode anexar documentos sem repetir cadastro ou abrir outra tela.
4. Foto principal de produto: arquivo local e compatibilidade com URL legada quando esse aprimoramento estiver incluído.
5. Validações fiscais e decimais preservadas: E731/E733/E734, GTIN 8/12/13/14 nos tipos relevantes, abertura de estoque via movimento e custo real não editável.
6. Responsividade e UX de Clientes/Proveedores aplicadas onde pertinentes, incluindo erros por aba e sem scroll encoberto.
7. Migraciones novas documentadas com pré-condições, rollback não destrutivo, manutenção de grants e checksums; **não aplicadas em VM**.
8. Testes de desenvolvimento locais de código são permitidos pelo protocolo, mas **não equivalem à auditoria independente**. ChatGPT faz revisão de commit e homologação técnica disponível, humano valida VM.

**Resultado de ChatGPT:** nenhuma alteração da aplicação executada, nenhum SQL executado; apenas especificação versionada. **Status:** pronto para implementação de escopo explícito, não homologado.
