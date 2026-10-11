# Nexit V1 — Produtos: matriz de auditoria UI × API × banco × SIFEN × ERP

**Data:** 2026-10-11. **Estado:** AUDITORIA E PROPOSTA PARA APROVAÇÃO DO RESPONSÁVEL; nenhuma alteração de código ou migration autorizada por este documento. **Fonte visual:** 11 capturas do responsável, de `nexit.proceit.net/productos/nuevo`; arquivos originais recebidos na conversa, **não versionados no Git**. **Fontes de implementação examinadas:** `app/(private)/productos/_components/producto-form.tsx`, `app/(private)/productos/nuevo/page.tsx`, `types/productos.ts`, `lib/productos/shared.ts`, `app/api/productos/route.ts`, `NEX-007-productos.sql` e manifesto do pacote técnico SIFEN. Demais migrations, rotas, consultas, restrições e contratos fiscais precisam de conferência linha a linha antes de implementação. Não alegar teste funcional do banco com base nas imagens.

## 1. Resumo objetivo das capturas — layout

Existem **sete abas**: Información; SIFEN y códigos; Inventario; Compras; Logística; Alternativos y kits; Documentos. O formulário tem cerca de quatro colunas no desktop e rodapé com `Cancelar / Guardar producto`. A barra superior do formulário repete `ALTA DE PRODUCTO`, `Código automático` e cartão `PRD-0000XX`, além do título global `Nuevo producto`. A descrição da fatura e o país de origem reaparecem em Información e SIFEN. Abas possuem pequenos círculos de estado; capturas posteriores mostram checkmarks conforme navegação/interação, **não comprovação de validação**. Os campos de data de documentos exibem o formato nativo `mm/dd/yyyy`, inadequado para expectativa paraguaia. O produto tem `Imagen URL` e documentos por `Nombre archivo + URL segura`; não há evidência visual de upload privado real. Há cards grandes de estado vazio e espaçamentos amplos.

## 2. Matriz de campos visíveis, origem e validação requerida

Legenda: **OBS** = visto nas capturas; **CÓD** = achado inicial no código/tipos/DDL; **PROP** = regra proposta, NÃO aprovada. Cada linha abaixo representa campo ou família; o Claude deverá transformar em matriz **campo por campo** com nome TS, propriedade JSON, coluna SQL, validação e condição efetivas, sem presumir que campo renderizado é persistido.

| ID | Aba | Campo ou grupo (OBS) | Referência atual | Verificação normativa obrigatória |
|---|---|---|---|---|
| PRD-I01 | Información | Código interno | `productos.codigo` | Gerado no servidor por empresa, unicidade, imutabilidade após criação; não depender de placeholder |
| PRD-I02 | Información | Código inventario | `codigo_inventario` | Opcional, identificador legado ERP; definir unicidade e política de alteração |
| PRD-I03 | Información | Descripción interna * | `descripcion` | Obrigatória e tamanho da DDL; separar nome interno de texto fiscal |
| PRD-I04 | Información e SIFEN | Descripción para factura * | `descripcion_factura` | **Um único valor/campo lógico**, evitar edição conflitante em duas abas; limites do schema e SIFEN |
| PRD-I05 | Información | Tipo de producto * | `MERCADERIA/SERVICIO/KIT/ACTIVO_FIJO` | Condicionais de stock, kit, serviço, ativo imobilizado, impostos e emissibilidade |
| PRD-I06 | Información | Unidad base * | `unidad_medida_id` | Validar unidade existente; conversões e unidade usada fiscalmente |
| PRD-I07 | Información | Categoría / Marca | FKs tenant da DDL | Catálogos empresa, validação cruzada |
| PRD-I08 | Información | Familia / Línea | Migrations de catálogos posteriores | Linha pertence à família; proteger seleção dependente |
| PRD-I09 | Información | Procedencia | `origen_etiqueta` (confrontar API) | Não confundir procedência livre com país legal de origem |
| PRD-I10 | Información | Impuesto / IVA | `impuesto_id` | Não fixar IVA 10% para todas mercadorias/serviços; validação tributária dependente de tipo |
| PRD-I11 | Información | Precio venta referencia (PYG) | Lista de referência NEX-017 | Valor monetário decimal preciso, moeda da empresa/lista; não transformar ausência em zero |
| PRD-I12 | Información | Valor venta referencia | Calculado | **Só leitura** = preço × stock, rotulado como estimativa, não lucro nem valuation contábil |
| PRD-I13 | Información | Imagen URL | `imagen_url` | Definir se imagem privada com upload; URL pública arbitrária não é equivalente a storage seguro |
| PRD-I14 | Información e SIFEN | País de origen | `pais_origen_codigo/nombre` | Fonte única, ISO-3166 alfa-3; avaliar exigência real SIFEN |
| PRD-I15 | Información | Producto vendible / comprable / Permite stock de terceros | `vendible/comprable/permite_terceros` | Matriz de combinações por tipo e política de terceiros |
| PRD-S01 | SIFEN y códigos | Código SIFEN | `codigo_sifen` | Definir finalidade e mapeamento real do item DTE; comprimento e fallback autorizados |
| PRD-S02 | SIFEN y códigos | Descripción para factura | `descripcion_factura` | Não duplicar campo editável em tela |
| PRD-S03 | SIFEN y códigos | NCM | `ncm` | Validar comprimento, formato, existência/uso legal; não impor para todos sem norma |
| PRD-S04 | SIFEN y códigos | Partida arancelaria | `partida_arancelaria` | Verificar DDL atual (limite 4) versus conceito fiscal real; não truncar silenciosamente |
| PRD-S05 | SIFEN y códigos | DNCP general / específico | `dncp_general/especifico` | Uso governamental condicionado, não requisito universal SIFEN |
| PRD-S06 | SIFEN y códigos | Código de barras principal | `codigo_barras` | Conciliar com códigos múltiplos e unicidade de principal |
| PRD-S07 | SIFEN y códigos | Información adicional en factura | `informacion_factura` | Limite, sanitização, política de envio |
| PRD-S08 | SIFEN y códigos | Códigos de barras y GTIN: Tipo, Código, Descripción, Principal | `producto_codigos` | Validar GTIN-8/12/13/14 dígito verificador GS1 quando aplicável; tipos não-GTIN sem regra GS1; único principal, duplicidades |
| PRD-V01 | Inventario | Control de stock | `modo_control_stock` | CANTIDAD/LOTE/UNIDAD_ETIQUETADA; condicional por tipo produto |
| PRD-V02 | Inventario | Stock mínimo, máximo, punto reposición | `numeric(18,4)` | 0 permitido; coerência min ≤ max; reposição não ultrapassar regras definidas |
| PRD-V03 | Inventario | Inventario inicial | Movimento de abertura | Apenas alta; quantidade/custo/depósito coerentes; movimento transacional, não editar saldo direto |
| PRD-V04 | Inventario | Costo unitario de apertura | Inventario custos | Decimal exato; exigido se quantidade > 0; nunca custo inventado |
| PRD-V05 | Inventario | Depósito de apertura | Depósitos tenant e permissão | Filtrar depósitos por alcance; só exigir quando quantidade inicial > 0 |
| PRD-V06 | Inventario | Vida útil (días) | `vida_util_dias` | Tipo e rastreabilidade; não confundir vida útil contábil de ativo com validade |
| PRD-V07 | Inventario | Stock actual real | `v_stock_producto/stock_saldos` | Somente leitura, calculado por movimentos; não sobrepor por PUT |
| PRD-V08 | Inventario | Costo promedio (PYG) | `inventario_costos` | Somente leitura, custo real; moeda explicitada |
| PRD-V09 | Inventario | Controla stock / Requiere vencimiento / Inspección calidad | flags de produto | Dependências entre lote, vencimento, QC e operações |
| PRD-V10 | Inventario | Políticas por depósito: Depósito, mín/máx, cantidad a reponer | `producto_deposito_configuracion` | Registro por depósito, tenant, permissão, edição por ID sem apagar histórico |
| PRD-C01 | Compras | Presentaciones: Unidad, Presentación, Factor, Código barras | `producto_unidades` | Fator >0, exatidão decimal; unidades para comprar/vender; exclusividade da base |
| PRD-C02 | Compras | Proveedores: Proveedor, código, costo, plazo, principal | `producto_proveedores` | Validar fornecedor da empresa, evitar duplicidades; preço e moeda; relação não é autorização de compra |
| PRD-L01 | Logística | Peso neto/bruto, largo/ancho/alto, volumen | `productos` | Decimais precisos, unidades e coerência peso bruto ≥ líquido se ambos >0 |
| PRD-L02 | Logística | Relación mercadería | `relacion_mercaderia` | Opções e efeito fiscal/logístico; condicional por tipo |
| PRD-L03 | Logística | Cantidad merma / Porcentaje merma | `cantidad_merma/porcentaje_merma` | Definir se campos alternativos ou complementares; sem baixa automática no estoque |
| PRD-L04 | Logística | Observación interna | `observacion` | Não enviar ao SIFEN como informação pública |
| PRD-K01 | Alternativos y kits | Alternativo: Producto, Tipo, Prioridad | `producto_alternativos` | Sem autovínculo, duplicidade, opcional recíproco; regras por tipo |
| PRD-K02 | Alternativos y kits | Kit: Componente, Cantidad, Orden, Opcional | `producto_componentes` | Somente quando tipo KIT; sem composição circular ou auto referência; quantidade >0; custo/estoque só por operação real |
| PRD-D01 | Documentos | Tipo, Nombre archivo, URL segura | `producto_documentos` | **GAP**: URL não equivale a upload seguro; propor storage privado no padrão aprovado de Clientes/Proveedores |
| PRD-D02 | Documentos | Emisión, Vencimiento, Observación | `producto_documentos` | Datas localizadas e validamente ordenadas; expiração aplicável, renovação, versões e auditoria |

## 3. Achados iniciais que exigem confronto de código (não inferir execução)

| Achado | Severidade | Evidência/risco | Ação requerida |
|---|---|---|---|
| PRD-A01 | UX | Cabeçalhos redundantes e cartão verde de `Código automático`; contraste e espaço vertical desnecessários | Modernizar compacto, manter geração automática e texto curto junto ao campo |
| PRD-A02 | Funcional | Descripción para factura e país de origem em duas abas | Fonte única no estado, exibir 1 vez como editável; dependências visuais sem drift |
| PRD-A03 | Fiscal | Na aba `SIFEN y códigos` há nome de integração mas não prova envio DTE | Especificar contratos de ITEM fiscal, não afirmar emissão SIFEN na V1 |
| PRD-A04 | Dados | `lib/productos/shared.ts`: `numero()` usa `Number`; `types/productos.ts` usa `number` para preços/custos/fatores | Auditar perda de precisão; tratar monetary/quantidades decimais como strings até PostgreSQL; não truncar valores |
| PRD-A05 | Dados | `texto(valor,maximo)` aplica `.slice(0,maximo)` | Não cortar identificadores/campos silenciosamente; erro 400 por campo quando exceder |
| PRD-A06 | Documentos | `shared.ts` requer `nombre + url`, captura mostra `URL segura` | Reutilizar armazenamento privado, upload, versões e baixa lógica; desenhar fluxo POST/PUT para arquivos |
| PRD-A07 | Fiscal | DDL NEX-007 `partida_arancelaria` tem limite 4; `ncm` 8, `codigo_sifen` 20 | Comparar nomenclatura/limites com normas DNIT e requisitos ERP; migração incremental se regra aprovada |
| PRD-A08 | Integridade | Formulário `produto-form.tsx` tem ~93KB e muitos controles em um componente | Separar abas e componentes sem mudar contratos inadvertidamente |
| PRD-A09 | Integridade | Progresso aponta PUT que substitui coleções filhas | Auditoria do comportamento de DELETE+INSERT, estabilidade IDs, referências e histórico; preferir sincronização seletiva |
| PRD-A10 | UX | Datas HTML nativas aparecem `mm/dd/yyyy` no navegador | Estabelecer interface pt? **Não**: interface espanhol PY com exibição dd/mm/aaaa, API ISO |
| PRD-A11 | UX | Pequenas bolinhas/checks em abas podem confundir “visitada” com “válida” | Estado de completude derivado de validação real por aba; erros com foco e mensagens |
| PRD-A12 | UX | Estado vazio ocupa grandes cartões `Sin ...` | Compactar estados vazios e filas; botão de ação consistente |
| PRD-A13 | Domínio | `Imagen URL` e `Documentos` têm políticas potencialmente divergentes | Definir anexos/imagens privados, formatos/tamanho, links antigos, controle de download |
| PRD-A14 | Domínio | Campos stock/preço/custo, fornecedor e fiscal convivem na ficha | Diferenciar dado mestre, valor calculado, configuração por depósito e transação operacional |
| PRD-A15 | Segurança | Compras `Proveedor principal` não prova homologação ativa do fornecedor | Ao **criar OC**, consumir `proveedor_elegible_para_compra` quando módulo existir; não negar cadastro da relação por si |
| PRD-A16 | Segurança | Código de barras, conversões, kits, estoque inicial, upload | Revalidar servidor e integridade multiempresa, RBAC granular e concorrência |
| PRD-A17 | Fiscal | GTIN/EAN/UPC distintos tipos, possíveis formatos inconsistentes | Confrontar GS1 e SIFEN e distinguir GTIN comercial, SKU interno, código de fornecedor, código fiscal |
| PRD-A18 | Domínio | Flags serviço, ativo fixo e kit | Matriz de obrigatoriedade/visibilidade e transição com estoque/referências existentes |

## 4. Matriz de interoperabilidade SIFEN / outros ERPs — proposta de contrato de dados

**Não declarar integração existente sem prova.** A V1 guarda cadastro e prepara dados; o planejamento de emissão SIFEN está em V2 segundo o protocolo atual. A versão técnica DNIT disponível no repositório é o pacote MT v150/NT 001–027 (com lacuna NT021); usar o manual original e notas aplicáveis ao **grupo de item**, não reutilizar automaticamente conclusões do grupo D3 do receptor.

| Dimensão | Nexit canônico | SIFEN / DTE — conferir norma | Integrações ERP / logística |
|---|---|---|---|
| Identidade | UUID tenant + código interno estável | Código produto/serviço do item segundo grupo técnico vigente | Código externo por origem/sistema, sem sobrescrever ID interno |
| Descrição | Interna ≠ fiscal `descripcion_factura` | Descrição de item, limite/condições do MT/NT | Mapeamento por integração e preservação da descrição fonte |
| Tipologia | Mercadería/Servicio/Kit/Activo fijo | Tipo de item e operações fiscais — dependem de documento e integração | Definir diferenças SAP B1 / outras plataformas; NÃO fixar conector nesta fase |
| Tributação | Imposto selecionado no cadastro | Regras IVA/isenção, tipo de operação, enquadramento do documento | ERP mapeia impostos pelo contrato, não por texto de tela |
| Medida | Unidade base e apresentações + fator | Unidade de medida/código fiscal e quantidade faturada | Conversão de unidade determinística; arredondamento e dimensão |
| Códigos | Código interno, código SIFEN, GTIN e alternos | Usar código apropriado e GTIN apenas se válido e aplicável | Múltiplos identificadores: SKU fornecedor, GTIN, códigos externos; ownership |
| Origem | País ISO + procedência | Obrigatoriedade condicional, não universal presumida | Importação/aduana/origem comercial |
| Valor | Preço de referência, listas; custo/stock próprios | Preço unitário/tributos calculados na **operação**, não campos estáticos do cadastro | Contratos por moeda, precisão, vigência de preço |
| Kit | Componentes estruturados | Definir se fatura kit inteiro ou itens componentes em cada operação | Mapeamento BOM, riscos de dupla baixa/duplicação |
| Lotes | Modo rastreabilidade / validade | Só se aplicável à operação/regulação | GLN/GTIN/lot/expiry via interfaces externas quando aprovadas |
| Documentos | Ficha técnica, certificados etc. | Anexos internos não vão automaticamente ao XML fiscal | Segurança e URLs assinadas/transferências controladas |
| Auditoria | Versões, atores, origem e ações | Histórico de emissão é domínio diferente | Importações idempotentes, reprocessamento e reconciliação |

**Plano de auditoria fiscal:** extrair do pacote DNIT as tabelas do grupo E (ítems), estrutura XML, regras condicionais para `dCodInt`, `dDesProSer`, unidade, IVA, GTIN, NCM/DNCP e demais campos realmente aplicáveis; indicar **arquivo, versão, página/regra, campo SIFEN, campo Nexit, transformador, fallback e motivo de recusa**, sem inventar. Reverificar normativa vigente antes da codificação fiscal. SEPSA não é SIFEN: só documentar eventual mapeamento GLN/GTIN separado e mediante escopo aprovado. Evitar transformar o cadastro de produtos em uma UI de emissão fiscal.

## 5. Padrão visual a propor para a V1

- Cabeçalho da página único: `Nuevo producto`; pequena linha opcional. Dentro do formulário usar barra compacta com indicador discreto de código automático, **sem bloco “ALTA DE PRODUCTO” redundante**.
- Abas persistentes, responsivas, estados por validação (não apenas clique/visita) e rolagem ao primeiro erro; exibir contador de pendências **somente quando preciso**.
- Quatro colunas quando espaço real permitir; 2 em tablet e 1 em celular; rótulos/ajuda alinhados, campos longos ocupando 2 ou 4 colunas.
- Labels de campo uniformes (peso, cor, tamanho), número com unidades, seleção sem placeholders ambíguos, moedas em legenda, ações de inclusão inline, cards de repetição compactos.
- Estados de leitura separados de edição: código autogerado; stock atual e custo médio; valor de venda derivado.
- Mensagens de validação por campo/aba, não apenas toast genérico; confirmar saída com alteração não salva e prevenir duplicidade de envio.
- Documentos: seção de upload autenticado e histórico, sem usar URL como prova de arquivo armazenado. Datas dd/mm/aaaa para pessoa e ISO no servidor.
- Manter 7 abas como arquitetura inicial; qualquer fusão/exclusão exige aprovação do responsável. Não remover campos operacionais ou fiscais por “limpeza visual”.

## 6. Sequência da entrega — SOMENTE após aprovação do responsável

**Marco A: confronto factual**. Claude inspeciona campo a campo `producto-form.tsx`, seus handlers, `types/productos.ts`, APIs GET/POST/PUT, `lib/productos/shared.ts`, tabelas e migrations posteriores NEX-007, permissões, dependências Inventário/Compras/Listas de precio, contratos atuais. Atualiza **esta matriz** com colunas finais (JSX label, state, payload, regra servidor, coluna/PK/FK, persistência, evidência). Indica P0/P1/P2; registra TODO desvio concreto e questão que exige decisão.

**Marco B: decisões do responsável**. Apresentar decisões específicas sobre código interno/GTIN/fiscal, forma de documentar produto e imagem, kits/serviços, fornecedores, numéricos, valores e regras condicionais. Não aplicar proposta pendente como regra aprovada.

**Marco C: implementação UI**. Após aprovação, Claude realiza redesenho de Produtos com componentes reutilizáveis e mudanças necessárias backend/DB estritamente autorizadas; migrations SQL incrementais versionadas, nunca aplicadas por Claude.

**Marco D: auditoria/aceite**. Compilação, lint, build, testes locais específicos, regressões multiempresa e fiscais; commit/push; ChatGPT revisa diffs; responsável aplica no único ambiente e valida navegador/banco. Registrar capturas ANTES e DEPOIS no Git quando disponíveis e seguras; as imagens deste pedido **ainda não foram arquivadas**.

## 7. Limites de autorização e status

Este documento é uma **auditoria normativa inicial**: constatações da interface e da leitura seletiva de código são fundadas, mas **não equivalem a uma matriz completa de persistência já auditada**. A matriz completa campo-a-campo e auditoria normativa SIFEN requerem a leitura das rotas/migrations e do manual original pelo executor antes de qualquer mudança. **Nada neste documento autoriza o Claude a modificar o sistema ainda**. Esperar autorização de implementação do responsável. Nenhuma VM/SQL/Docker/deploy acessada por ChatGPT.
