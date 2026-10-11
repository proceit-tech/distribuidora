# MATRIZ NORMATIVA COMPLETA — PRODUCTOS NEXIT V1

**2026-10-11 · Elaborada por ChatGPT para aprovação; NÃO autoriza implementação.** Fontes consultadas: onze capturas do usuário, tipos TS, shared de Produtos, API POST, formulário React e NEX-007; padrões aprovados de Clientes/Proveedores. **Sem teste de PostgreSQL ou navegador.** O mapeamento das migrations posteriores e o grupo de itens do PDF DNIT ainda requerem confronto específico antes da implementação fiscal. Não presumir conformidade por campo renderizado.

**Contrato transversal proposto:** preservar `empresa_id` da sessão, controle por permissões, FKs multiempresa, inputs sem truncamento silencioso, dinheiro/fatores em decimais exatos como string até SQL, datas `dd/mm/aaaa` na interface e ISO na API, coleções filhas sincronizadas por IDs persistentes, jamais editar stock/custo real pelo cadastro. Campos `numeric` necessitam escala e limites da DDL vigente. A matriz seguinte registra TODOS os controles visíveis por aba e campos das coleções.

## Información

| ID | Campo / JSON | Coluna candidata / origem | Regra proposta | Estado / prova |
|---|---|---|---|---|
| PRD-01-001 | `codigo` | `codigo` | Automático/único por empresa; imutável após criar | DDL NEX-007 CONFIRMADA |
| PRD-01-002 | `codigoInventario` | `codigo_inventario` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-01-003 | `descripcion` | `descripcion` | Obrigatória; máx. 300 DDL | DDL NEX-007 CONFIRMADA |
| PRD-01-004 | `descripcionFactura` | `descripcion_factura` | Obrigatória; máx. 120 DDL; ÚNICA edição em duas abas; confirmar regra SIFEN | DDL NEX-007 CONFIRMADA |
| PRD-01-005 | `tipoProducto` | `tipo_producto` | MERCADERIA/SERVICIO/KIT/ACTIVO_FIJO; condicionais de stock | DDL NEX-007 CONFIRMADA |
| PRD-01-006 | `unidadMedidaId` | `unidad_medida_id` | FK obrigatória válida | DDL NEX-007 CONFIRMADA |
| PRD-01-007 | `categoriaId` | `categoria_id` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-01-008 | `marcaId` | `marca_id` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-01-009 | `familiaId` | `familia_id` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-01-010 | `lineaId` | `linea_id` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-01-011 | `procedencia` | `origen_etiqueta` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-01-012 | `impuestoId` | `impuesto_id` | Imposto do catálogo; não assumir IVA 10% sempre | DDL NEX-007 CONFIRMADA |
| PRD-01-013 | `precioVentaReferencia` | `precio_venta_referencia` | NULL≠0; moeda e decimal exato; lista NEX-017 | DERIVADO/OPERAÇÃO |
| PRD-01-014 | `imagenUrl` | `imagen_url` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-01-015 | `paisOrigenCodigo` | `pais_origen_codigo` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-01-016 | `vendible` | `vendible` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-01-017 | `comprable` | `comprable` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-01-018 | `permiteTerceros` | `permite_terceros` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |

## SIFEN y códigos

| ID | Campo / JSON | Coluna candidata / origem | Regra proposta | Estado / prova |
|---|---|---|---|---|
| PRD-02-019 | `codigoSifen` | `codigo_sifen` | Máx.20 na DDL; campo fiscal de item a confirmar no MT | DDL NEX-007 CONFIRMADA |
| PRD-02-020 | `descripcionFactura` | `descripcion_factura` | Obrigatória; máx. 120 DDL; ÚNICA edição em duas abas; confirmar regra SIFEN | DDL NEX-007 CONFIRMADA |
| PRD-02-021 | `ncm` | `ncm` | Até 8 DDL; condicional conforme operação | DDL NEX-007 CONFIRMADA |
| PRD-02-022 | `partidaArancelaria` | `partida_arancelaria` | Até 4 DDL; verificar se nomenclatura modelada corretamente | DDL NEX-007 CONFIRMADA |
| PRD-02-023 | `dncpGeneral` | `dncp_general` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-02-024 | `dncpEspecifico` | `dncp_especifico` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-02-025 | `paisOrigenCodigo` | `pais_origen_codigo` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-02-026 | `codigoBarras` | `codigo_barras` | Consistência entre código principal e códigos alternativos | DDL NEX-007 CONFIRMADA |
| PRD-02-027 | `informacionFactura` | `informacion_factura` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |

## Inventario

| ID | Campo / JSON | Coluna candidata / origem | Regra proposta | Estado / prova |
|---|---|---|---|---|
| PRD-03-028 | `modoControlStock` | `modo_control_stock` | CANTIDAD/LOTE/UNIDAD_ETIQUETADA; condicional | DDL NEX-007 CONFIRMADA |
| PRD-03-029 | `stockMinimo` | `stock_minimo` | Verificar numeric, escala, limites e relação com outros campos | DDL NEX-007 CONFIRMADA |
| PRD-03-030 | `stockMaximo` | `stock_maximo` | Verificar numeric, escala, limites e relação com outros campos | DDL NEX-007 CONFIRMADA |
| PRD-03-031 | `puntoReposicion` | `punto_reposicion` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-03-032 | `inventarioInicial.cantidad` | `cantidad` | Decimal positivo quando item componente; para abertura ≥0 | DERIVADO/OPERAÇÃO |
| PRD-03-033 | `inventarioInicial.costoUnitario` | `costo_unitario` | Verificar numeric, escala, limites e relação com outros campos | DERIVADO/OPERAÇÃO |
| PRD-03-034 | `inventarioInicial.depositoId` | `deposito_id` | Validar tipo, comprimento, referência e regras condicionais no servidor | DERIVADO/OPERAÇÃO |
| PRD-03-035 | `vidaUtilDias` | `vida_util_dias` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-03-036 | `stockActual` | `stock_actual` | SOMENTE LEITURA; kardex e stock_saldos | DERIVADO/OPERAÇÃO |
| PRD-03-037 | `costoPromedio` | `costo_promedio` | SOMENTE LEITURA; inventario_costos | DERIVADO/OPERAÇÃO |
| PRD-03-038 | `controlaStock` | `controla_stock` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-03-039 | `requiereVencimiento` | `requiere_vencimiento` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-03-040 | `requiereInspeccionCalidad` | `requiere_inspeccion_calidad` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |

## Compras — presentaciones[]

| ID | Campo / JSON | Coluna candidata / origem | Regra proposta | Estado / prova |
|---|---|---|---|---|
| PRD-04-041 | `unidadMedidaId` | `unidad_medida_id` | FK obrigatória válida | DDL NEX-007 CONFIRMADA |
| PRD-04-042 | `nombrePresentacion` | `nombre_presentacion` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-04-043 | `factorConversion` | `factor_conversion` | Decimal exato, >0; verificar DDL >=0 em proveedor | DDL NEX-007 CONFIRMADA |
| PRD-04-044 | `esUnidadBase` | `es_unidad_base` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-04-045 | `esUnidadCompra` | `es_unidad_compra` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-04-046 | `esUnidadVenta` | `es_unidad_venta` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-04-047 | `codigoBarras` | `codigo_barras` | Consistência entre código principal e códigos alternativos | DDL NEX-007 CONFIRMADA |
| PRD-04-048 | `pesoBrutoKg` | `peso_bruto_kg` | Verificar numeric, escala, limites e relação com outros campos | DDL NEX-007 CONFIRMADA |
| PRD-04-049 | `volumenM3` | `volumen_m3` | Verificar numeric, escala, limites e relação com outros campos | DDL NEX-007 CONFIRMADA |

## Compras — proveedores[]

| ID | Campo / JSON | Coluna candidata / origem | Regra proposta | Estado / prova |
|---|---|---|---|---|
| PRD-05-050 | `proveedorId` | `proveedor_id` | Tenant; vínculo não confere elegibilidade para nova OC | DDL NEX-007 CONFIRMADA |
| PRD-05-051 | `codigoProveedor` | `codigo_proveedor` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-05-052 | `descripcionProveedor` | `descripcion_proveedor` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-05-053 | `unidadMedidaId` | `unidad_medida_id` | FK obrigatória válida | DDL NEX-007 CONFIRMADA |
| PRD-05-054 | `factorConversion` | `factor_conversion` | Decimal exato, >0; verificar DDL >=0 em proveedor | DDL NEX-007 CONFIRMADA |
| PRD-05-055 | `costoReferencia` | `costo_referencia` | Decimal exato e moeda explícita; não custo real | DDL NEX-007 CONFIRMADA |
| PRD-05-056 | `monedaCodigo` | `moneda_codigo` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-05-057 | `cantidadMinimaCompra` | `cantidad_minima_compra` | Verificar numeric, escala, limites e relação com outros campos | DDL NEX-007 CONFIRMADA |
| PRD-05-058 | `plazoEntregaDias` | `plazo_entrega_dias` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-05-059 | `esPrincipal` | `es_principal` | Máximo um por coleção relevante | DDL NEX-007 CONFIRMADA |

## Inventario — depositos[]

| ID | Campo / JSON | Coluna candidata / origem | Regra proposta | Estado / prova |
|---|---|---|---|---|
| PRD-06-060 | `depositoId` | `deposito_id` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-06-061 | `ubicacionPreferidaId` | `ubicacion_preferida_id` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-06-062 | `stockMinimo` | `stock_minimo` | Verificar numeric, escala, limites e relação com outros campos | DDL NEX-007 CONFIRMADA |
| PRD-06-063 | `stockMaximo` | `stock_maximo` | Verificar numeric, escala, limites e relação com outros campos | DDL NEX-007 CONFIRMADA |
| PRD-06-064 | `puntoReposicion` | `punto_reposicion` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-06-065 | `cantidadReposicion` | `cantidad_reposicion` | Verificar numeric, escala, limites e relação com outros campos | DDL NEX-007 CONFIRMADA |

## SIFEN — codigos[]

| ID | Campo / JSON | Coluna candidata / origem | Regra proposta | Estado / prova |
|---|---|---|---|---|
| PRD-07-066 | `tipo` | `tipo` | Validar enum por coleção; código GS1 quando GTIN | DDL NEX-007 CONFIRMADA |
| PRD-07-067 | `codigo` | `codigo` | Automático/único por empresa; imutável após criar | DDL NEX-007 CONFIRMADA |
| PRD-07-068 | `descripcion` | `descripcion` | Obrigatória; máx. 300 DDL | DDL NEX-007 CONFIRMADA |
| PRD-07-069 | `esPrincipal` | `es_principal` | Máximo um por coleção relevante | DDL NEX-007 CONFIRMADA |

## Logística

| ID | Campo / JSON | Coluna candidata / origem | Regra proposta | Estado / prova |
|---|---|---|---|---|
| PRD-08-070 | `pesoNetoKg` | `peso_neto_kg` | Verificar numeric, escala, limites e relação com outros campos | DDL NEX-007 CONFIRMADA |
| PRD-08-071 | `pesoBrutoKg` | `peso_bruto_kg` | Verificar numeric, escala, limites e relação com outros campos | DDL NEX-007 CONFIRMADA |
| PRD-08-072 | `largoCm` | `largo_cm` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-08-073 | `anchoCm` | `ancho_cm` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-08-074 | `altoCm` | `alto_cm` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-08-075 | `volumenM3` | `volumen_m3` | Verificar numeric, escala, limites e relação com outros campos | DDL NEX-007 CONFIRMADA |
| PRD-08-076 | `relacionMercaderia` | `relacion_mercaderia` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-08-077 | `cantidadMerma` | `cantidad_merma` | Verificar numeric, escala, limites e relação com outros campos | DDL NEX-007 CONFIRMADA |
| PRD-08-078 | `porcentajeMerma` | `porcentaje_merma` | Verificar numeric, escala, limites e relação com outros campos | DDL NEX-007 CONFIRMADA |
| PRD-08-079 | `observacion` | `observacion` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |

## Alternativos[]

| ID | Campo / JSON | Coluna candidata / origem | Regra proposta | Estado / prova |
|---|---|---|---|---|
| PRD-09-080 | `productoAlternativoId` | `producto_alternativo_id` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-09-081 | `tipo` | `tipo` | Validar enum por coleção; código GS1 quando GTIN | DDL NEX-007 CONFIRMADA |
| PRD-09-082 | `prioridad` | `prioridad` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |

## Kits — componentes[]

| ID | Campo / JSON | Coluna candidata / origem | Regra proposta | Estado / prova |
|---|---|---|---|---|
| PRD-10-083 | `productoComponenteId` | `producto_componente_id` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-10-084 | `cantidad` | `cantidad` | Decimal positivo quando item componente; para abertura ≥0 | DDL NEX-007 CONFIRMADA |
| PRD-10-085 | `orden` | `orden` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-10-086 | `esOpcional` | `es_opcional` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |

## Documentos[]

| ID | Campo / JSON | Coluna candidata / origem | Regra proposta | Estado / prova |
|---|---|---|---|---|
| PRD-11-087 | `tipo` | `tipo` | Validar enum por coleção; código GS1 quando GTIN | DDL NEX-007 CONFIRMADA |
| PRD-11-088 | `nombreArchivo` | `nombre_archivo` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |
| PRD-11-089 | `urlArchivo` | `url_archivo` | URL antiga; migrar para armazenamento privado com versões e exclusão lógica | DDL NEX-007 CONFIRMADA |
| PRD-11-090 | `fechaEmision` | `fecha_emision` | Calendário válido; UX dd/mm/aaaa | DDL NEX-007 CONFIRMADA |
| PRD-11-091 | `fechaVencimiento` | `fecha_vencimiento` | Não anterior à emissão; nullable | DDL NEX-007 CONFIRMADA |
| PRD-11-092 | `observacion` | `observacion` | Validar tipo, comprimento, referência e regras condicionais no servidor | DDL NEX-007 CONFIRMADA |

## Achados concretos prioritários

| Ref | Evidência | Correção especificada |
|---|---|---|
| PRD-A01 | Cabeçalho “ALTA DE PRODUCTO”, cartão de código e título repetido nas capturas | Uma única identidade visual; geração automática preservada |
| PRD-A02 | descricao fiscal e país origem editáveis em 2 abas | Uma fonte de estado e uma edição principal, espelho não editável |
| PRD-A03 | `lib/productos/shared.ts` usa `Number()` para decimais | Strings decimais, validação de precisão e aritmética exata |
| PRD-A04 | `texto(valor,maximo)` usa `.slice(0,maximo)` | Rejeitar dados longos, nunca truncar silenciosamente |
| PRD-A05 | `prepararProducto` exige `nombre + url` para documentos | Upload privado, versão, restore, auditoria, preservar links anteriores |
| PRD-A06 | `types/productos.ts` omite `SKU_PROVEEDOR` do enum; NEX-007 inclui | Alinhar TS/UI/API/SQL |
| PRD-A07 | NEX-007 permite fator fornecedor >=0 | Corrigir regra operacional >0 após decisão/migration incremental |
| PRD-A08 | `producto-form.tsx` tem ~93 KB e 7 abas | Componentizar com padrão Clientes/Proveedores e conservar contratos |
| PRD-A09 | Progresso do projeto descreve PUT que substitui filhos | Sincronização seletiva por ID, preservar histórico e dependências |
| PRD-A10 | Browser mostra `mm/dd/yyyy` em documentos | Datas espanhol PY dd/mm/aaaa e armazenamento ISO |
| PRD-A11 | Abas com checks conforme navegação | Estado válido só com validação real; primeiro erro por aba |
| PRD-A12 | Imagem URL, código SIFEN e regra de documento fiscal | Não declarar envio SIFEN ativo na V1 |

## Matriz SIFEN / ERP (pendência de verificação normativa)

| Família de dados | Nexit | Requisito para mapeamento SIFEN e ERP |
|---|---|---|
| Identificador | código Nexit, código SIFEN, GTIN, fornecedor, ERP externo | Definir tradução para item XML, validação de GS1 e não substituir ID mestre |
| Descrição | interna e fatura | Confirmar campo grupo de item MT v150, máximo e texto emitido |
| Fiscal | NCM, DNCP, partida, origem, IVA | Verificar condições fiscais no grupo de itens e NT aplicáveis: não usar D3 receptor como norma de item |
| Quantidade | unidade base e apresentações, fator | Regras de conversão, unidade de emissão, rounding e tolerância |
| Preços/custos | listas, preço referência, custo fornecedor, custo real | Preço/tributo da operação; não transmitir custo como preço de venda |
| Lotes e GTIN | modo de rastreio, códigos e depósito | Mapeamento SEPSA/ERP externo só sob contrato específico; distinto de SIFEN |
| Kits | componentes, opcional, ordem | Evitar dupla baixa e estabelecer política de emissão kit versus componentes |
| Integrações | identificadores externos por empresa/conector | Versionamento de mapas, imports idempotentes e auditoria; sem conector autorizado |

**Fonte disponível:** `documentacao/referencias/sifen/NT_E_KUATIA_027_MT_V150(3).zip`, com MT v150 e NT001–027 (NT021 ausente), segundo manifesto do repositório. **Não foram conferidas nesta entrega as páginas e validações do grupo de itens**, portanto não declarar limites como legais ou implementar XML a partir de palpites. O SIFEN de emissão permanece em V2.

## Decisões para aprovação

**DEC-PRD-01** Código interno gerado e imutável; identificação externa separada. **02** GTIN com checksum GS1 por tipo. **03** SERVICIO não movimenta stock; KIT exige política própria. **04** Documentos privados e versionados como Clientes/Proveedores. **05** Valores monetários, quantidades e fatores como decimal canônico. **06** Principal único por coleção, reconciliar GTIN principal. **07** Sem emissão SIFEN na V1; validação cadastral separada. **08** Fornecedor pode estar relacionado sem homologação, mas não recebe nova OC sem elegibilidade. **09** Abertura de estoque somente na criação com movimento real e permissão. **10** ERP externo por mapeamento de códigos, sem integração implementada agora. **11** Merma/volume não geram efeitos automáticos; confirmar cálculo. **12** Layout compacto e sete abas preservadas.

## Design proposto

Uma única linha de título; retirar duplicidade “ALTA DE PRODUCTO” e cartão “Código automático”; grid responsivo 4/2/1; campos com largura consistente; coleções repetíveis em cards compactos; estados vazios curtos; abas com validação real; datas locais; indicadores de leitura distintos de edição; seção de documentos com upload/versões; manter os sete grupos sem perda funcional.

## Próxima etapa

ChatGPT deve completar o confronto normativo com PDF do grupo de itens e confirmar migrations posteriores/GET/PUT antes de aprovar escopo técnico final. Claude **somente implementa**, após decisões do proprietário. As capturas originais estão na conversa e NÃO foram arquivadas no Git. Nenhuma VM/SQL/Deploy foi tocada.
