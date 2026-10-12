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

## 8. Auditoria normativa DNIT — grupo E8 (documento original conferido, 2026-10-11)

**Fonte primária examinada diretamente:** `documentacao/referencias/sifen/NT_E_KUATIA_027_MT_V150(3).zip` (cópia também fornecida ao ChatGPT), `Manual Técnico Versión 150 - 01-2.pdf`, **páginas impressas 85–87**, seção **E8 — Campos que describen los ítems de la operación (E700–E899)**; emendas `NT_E_KUATIA_009_MT_V150.pdf` **página 1**, `NT_E_KUATIA_023_MT_V150.pdf` **página 1** e `NT_E_KUATIA_026_MT_V150.pdf` **páginas 1–2**. As NTs prevalecem onde alteram expressamente o MT. Trata-se de confronto de versão fornecida, **não certificação da normativa hoje vigente na DNIT nem de XSD completo**.

| ID/Tag SIFEN | Definição efetiva no pacote | Regra normativa do DE (não necessariamente do cadastro) | Campo Nexit e desvio |
|---|---|---|---|
| E700 `gCamItem` | 1–999 grupos por DE (MT p.85) | Item da operação é obrigatório | Entidade do produto é mestre; linhas DE pertencem à futura emissão |
| **E701 `dCodInt`** | **1–50** alfanuméricos (**NT009 p.1**, atualiza 1–20 MT) | Obrigatório; código não identifica produtos distintos no cadastro do emissor | `codigoSifen` limitado a **20** no NEX-007: aceita subset legal, mas **não representa todo o limite normativo**; `codigo` admite 80 e não pode ir diretamente ao XML se >50. **P0: definir fonte estável e política 1–50 antes da integração** |
| E702 `dParAranc` | Numérico comprimento **4**, ocorrência 0–1 (MT p.85) | Opcional no grupo E8 | `partidaArancelaria` DB máx.4; além do comprimento validar **somente dígitos** quando aplicável |
| E703 `dNCM` | Numérico **6–8**, ocorrência 0–1 (MT p.85) | Opcional no grupo E8 | `ncm` DB máx.8; rejeitar caracteres não numéricos e comprimento fora 6–8 quando informado, conforme versão fiscal; verificar necessidade aduaneira por operação |
| **E704 `dDncpG`** | Alfanumérico **8** e **0–1**, **NT026 p.1–2** retira a exigência automática em B2G | Se código DNCP existir, preencher à esquerda com zero; a NT026 elimina a validação E704/1800 que tornava obrigatório no B2G | `dncpGeneral` até 8; **não obrigar universalmente nem exigir só por B2G** |
| **E705 `dDncpE`** | Alfanumérico **3–4** e **0–1**, **NT026 p.1–2** elimina obrigatoriedade atrelada a E704 | Informar se existir; padding conforme NT; sem obrigatoriedade automática com E704 na NT026 | `dncpEspecifico` até 4; validar mínimo 3 quando informado |
| E706 `dGtin` | Numérico 8,12,13,14, 0–1 (MT p.86) | Informar se mercadoria tem GTIN | `codigos[]` / `codigoBarras`; validar comprimento e checksum GS1; mapear 1 GTIN **do item** |
| E707 `dGtinPq` | Numérico 8,12,13,14, 0–1 (MT p.86) | Informar se pacote tem GTIN | `producto_unidades.codigo_barras` e códigos GTIN_EMPAQUE; distinguir GTIN pacote de unidade |
| **E708 `dDesProSer`** | **1–2000** alfanuméricos (**NT009 p.1** amplia 1–120 MT) | Descrição obrigatória do produto/serviço no DE | `descripcionFactura` tem teto **120** DDL (subset conservador), não representa limite SIFEN; decisão de ampliar 2000 ou manter limite empresarial menor; **não declarar 120 como máximo legal atual** |
| E709 `cUniMed` | Numérico **1–5**, obrigatório, MT p.86 | Código da **Tabela 5** da unidade; B2G pode referir dados WS DNCP | `unidadMedidaId` é UUID, **não enviar UUID no XML**; requer mapeamento da unidade para código SIFEN |
| E710 `dDesUniMed` | Alfanumérico **1–10**, obrigatório, MT p.86 | Descrição/código relacionado à unidade | Catálogo de unidade deve guardar correspondência fiscal válida |
| **E711 `dCantProSer`** | Numérico **1–10p(0–8)** (**NT023 p.1** amplia escala 0–4) | Quantidade obrigatória de item | Qty e conversões de ERP com precisão suficiente; regras de inventário `numeric(18,4)` são distintas da quantidade fiscal até 8 decimais; **não mudar toda a DDL de estoque sem decisão** |
| E712 `cPaisOrig` | Alfanumérico 3, 0–1, MT p.86 | Código de país opcional | `paisOrigenCodigo`, ISO3 da referência fiscal |
| E713 `dDesPaisOrig` | Alfanumérico **4–30**, condicionado à presença de E712 (MT p.86) | Descrição necessária se informou país | `paisOrigenNombre`, catálogo de país; validar 4–30 e grafia apropriada |
| E714 `dInfItem` | Alfanumérico **1–500**, 0–1, MT p.86 | Informação de interesse do emissor sobre item | `informacionFactura`, ≤500; não enviar `observacion` interna automaticamente |
| E715 `cRelMerc` | Numérico 1, 0–1, valores 1 quiebra / 2 merma (MT p.86) | Relacionado a dados de relevância das mercadorias; condicional ao tipo DE | `relacionMercaderia` mapeia CHECK (1,2); especificar quando incluir no documento |
| E716 `dDesRelMerc` | Alfanumérico **19–21**, condicional com E715 (MT p.86) | Descrição textual canônica 1/2 | Não há campo mestre obrigatório: derivar do código por tabela normativa |
| E717 `dCanQuiMer` | Numérico **1–10(0–4)**, condicional à presença de E715 (MT p.87) | Quantidade de quebra/merma na unidade E709 | `cantidadMerma` no mestre pode ser default; **quantidade do DE deve vir da operação real**, não copiar estático indiscriminadamente |
| E718 `dPorQuiMer` | Numérico **1–3(0–8)**, condicional à presença de E715 (MT p.87) | Percentual da operação | `porcentajeMerma` DDL `numeric(7,4)` não representa 8 casas; separar política mestre/fiscal e precisão de transmissão |

**Atenção:** no MT original, E704 era apresentado como obrigatório em D202=3 e E705 obrigatório junto a E704; **NT026 exclui explicitamente essas duas validações**. Na matriz anterior esses campos estavam assinalados “a confirmar”: a partir desta seção está comprovada a prevalência no pacote consultado. A NT009 modifica também E701/E708; NT023 modifica E711. **Faturamento eletrônico é planejado V2**, portanto os campos de um **DE emitido** não transformam automaticamente a ficha de cadastro V1 em XML, nem autorizam nova integração fiscal.

### 8.1. Achados do confronto GET/PUT versus banco

**Caminhos inspecionados:** `app/api/productos/[id]/route.ts`, `app/api/productos/route.ts`, `lib/productos/shared.ts`, `NEX-007-productos.sql`, além dos tipos e formulário da matriz.

| Referência | Achado comprovado no código | Consequência / especificação de correção |
|---|---|---|
| PRD-API-01 | `PUT /api/productos/[id]` faz `DELETE` de **todas** as coleções `TABLAS_HIJAS` e `insertarHijos` para recriá-las | **P0:** perde IDs, dificulta FK futuras, versões e histórico; migrar para sincronização por ID, auditoria e deleção explícita |
| PRD-API-02 | `PUT` recebe `datos.codigo` e o utiliza no `UPDATE productos` depois de `SELECT codigo … FOR UPDATE` | **P0:** não há nessa rota garantia explícita de imutabilidade; proteger código no servidor/DB antes de homologar |
| PRD-API-03 | `GET` converte `precio::float8`, `costo_promedio::float8`, `cantidad::float8` e valores relacionados | **P0:** incompatível com contrato de decimal exato; devolver `numeric` como texto sem perda de precisão |
| PRD-API-04 | `POST` usa `prepararProducto` e `insertarHijos`; abertura chama função de movimento real | Preservar transação, idempotência, permissão de movimentação e restrições por depósito |
| PRD-API-05 | `shared.ts` usa `Number` em custo/quantidade/preço e corta strings usando `.slice` | **P0:** erro explícito por limite e transporte monetário/quantidade como decimal canônico |
| PRD-API-06 | `NEX-007` tem registros independentes para `producto_codigos`, `producto_unidades`, `producto_proveedores`, `producto_deposito_configuracion`, `producto_alternativos`, `producto_componentes`, `producto_documentos` | Necessita respeitar FKs de empresa, unicidade, principals e preservação de identidades nas sete coleções |
| PRD-API-07 | `producto_documentos` opera por `nombre_archivo` + `url_archivo`; não prova arquivo seguro persistente | Documentos privados nos padrões Clientes/Proveedores com migration incremental quando aprovado |
| PRD-API-08 | `NEX-007` limita `codigo_sifen` a 20 e `descripcion_factura` a 120, enquanto NT009 permite até 50 e 2000 no XML | Desalinhamento de capacidade máxima, **não necessariamente violação fiscal**: limites empresariais menores podem ser decisão válida; exigir decisão explícita |

### 8.2. Itens ainda dependentes de normativa mais recente ou comprovação operacional

- Confirmar XSD e regras finais vigentes DNIT na data de implementação, inclusive alterações posteriores ao pacote MT v150/NT027. O pacote analisado não inclui NT021.
- Campos `gValorItem`/IVA, preço, descontos, outras regras de cálculo e eventos devem ser especificados **para a emissão**, não inferidos do cadastro.
- As migrations posteriores à NEX-007 precisam ser confrontadas especificamente quanto a `familia_id`, `linea_id`, lista de referência e integridade de catálogos; não marcar essa checagem como concluída somente com a DDL inicial.
- Validar autorização granular/escopo em ambiente real, triggers, cardinalidade, comportamento de transação, e aceitação humana do novo layout quando implementado.

**Estado:** seção fiscal E8 auditada diretamente no manual e nas NT009/023/026 arquivadas; revisão GET/PUT comprovada estaticamente. **Não marca auditoria de todas as migrations e do XML completo como encerrada.** Nenhum SQL, deploy ou VM foi executado.

### 8.3. Confirmação das evoluções posteriores à NEX-007 diretamente no Git

- **NEX-017 — confirmada:** `productos.familia_id` e `linea_id` **já existiam na NEX-007** e receberam FKs compostas por empresa para `familias_producto` e `lineas_producto`; a linha é associada à família por `(empresa_id, familia_id, linea_id)` e há CHECK `linea_id IS NULL OR familia_id IS NOT NULL`. O documento anterior dizia “coluna de evolução posterior”, impreciso: **coluna é NEX-007; integridade é NEX-017**. A validação UI/API deve reproduzir esta regra e emitir mensagem por campo.
- **NEX-017 — preço de referência confirmado:** funções `lista_precio_referencia` e `producto_fijar_precio_referencia`, vista `v_producto_precio_referencia` e índice parcial de uma lista de referência por empresa. A API GET obtém `precio::float8` desta vista, o que causa risco de precisão já assinalado, enquanto POST/PUT chamam função para preço referencial. Não armazenar preço diretamente em `productos`.
- **NEX-018 — inspecionada:** migration de integridade das listas de preço, não representa uma nova coluna do produto. Checar seu contrato funcional ao rever preço e moeda, sem tentar criar outra lista/valor paralelo.
- **NEX-020 — confirmada:** catálogos `categorias_producto` e `marcas_producto` recebem índices únicos por empresa/nome ou código normalizados; existe função `catalogo_producto_guardar` e grants de operação. Não permitir catálogo de outra empresa nem duplo por variação de maiúsculas ou espaços.

**Escopo da revisão estática:** foram inspecionados os arquivos NEX-017, NEX-018 e NEX-020 que evoluem diretamente o módulo. Não afirmamos que toda migration NEX-008 a NEX-037 foi auditada linha a linha, nem que triggers/grants estão exercitados no PostgreSQL. Outras migrations podem afetar integrações indiretas e exigem conferência na implementação respectiva.

## 9. Revisão final ChatGPT — escopo executável e decisões ainda não aprovadas (2026-10-11)

**Resultado:** confrontados novamente dados visuais, contrato de GET/POST/PUT, NEX-007, NEX-017/018/020 e documentação SIFEN E8/NT009/023/026. Esta revisão distingue correções técnicas evidentes de políticas novas. **Nenhuma das DEC-PRD-01…12 foi expressamente aprovada pelo proprietário somente pela publicação da matriz**; a solicitação posterior de comando ao Claude não equivale a aprovação automática de todas as opções propostas.

**Liberável para implementação controlada mediante comando explícito do proprietário:** padronização visual e acessibilidade **sem remover os sete grupos**, sem alterar contratos de dados por cosmética; não truncar strings; validação coerente com restrições já vigentes; não aceitar alteração do código interno na edição; preservar IDs de filhos e transações ao corrigir PUT; correções de precisão decimal com revisão de ponta a ponta; testes de isolamento empresa e permissões. Manter estabilidade de inventário, custos, preço de referência, listas e conversões e auditar antes de alterar funções SQL. O Claude pode preparar **novas** migrations incrementais quando necessárias, sem executá-las.

**Necessita escolha/aceite específico antes de virar regra obrigatória:** ampliação do limite empresarial de código SIFEN 20→50 ou descrição fiscal 120→2000 (as notas DNIT permitem mais, mas não tornam ilegais limites de cadastro menores); upload de imagens versus links atuais e formatos próprios; efeitos de SERVICIO/KIT, conversão de fatores, política de fornecedor principal e elegibilidade, políticas de merma/volume, GTIN principal em produto versus embalagem, tratamento de documentos legados, importação ERP real ou envio DTE. Quando faltar decisão, implementar somente o que não altere semântica e registrar a questão ao responsável.

**Limitações normativas:** pacote SIFEN MT v150/NT até 027 sem NT021, XSD vigente e cálculo fiscal operacional não auditados; não liberar geração de DTE, integração SEPSA nem importador de ERP pela alteração cadastral.

**Critérios para Claude:** registrar por campo matriz final com estado UI→payload→GET/POST/PUT→DDL; corrigir código estritamente para regras já aprovadas/defeitos verificáveis; registrar divergências novas e não as converter em decisão implícita; executar tsc, lint, build, casos e regressões, fazer commit/push e parar para auditoria do ChatGPT. Se build global falhar em /clientes/nuevo ou /login, demonstrar se é regressão, sem esconder falha nem fazer deploy.

## 10. Implementação controlada (Claude Code, 2026-10-11) — estado exato

**Escopo executado:** correções técnicas comprovadas + novo layout (sete abas preservadas). **Nada foi testado em PostgreSQL nem em navegador**; NEX-038 está versionada e **NÃO aplicada**. As DEC-PRD-01…12 **não foram tratadas como aprovadas**.

| Ref | Estado | Como ficou |
|---|---|---|
| PRD-A01 | Implementado | Cabeçalho único (migalha + título + chip de código em edição); removidos o cartão «Código automático», o rodapé descritivo e as descrições repetidas. Código gerado automaticamente (POST rejeita código enviado). |
| PRD-A02 | Implementado | `descripcionFactura` editável só em Información (espelho somente leitura em SIFEN); `paisOrigenCodigo` editável só em SIFEN (espelho em Información). Um único estado no formulário. |
| PRD-A03 / PRD-API-03/05 | Implementado | `lib/productos/decimales.ts` (reusa `decimalExacto`): decimais como string exata (numeric(18,4)/(18,6)/(7,4)); GET devolve `::text`; sem `Number`/`float8` em shared/rotas de produto; precio, costo de apertura e cantidad de apertura chegam ao SQL como string. Lista (`GET /api/productos`) também em texto; a conversão para número só ocorre para formatar a exibição. |
| PRD-A04 | Implementado | Nenhum texto é truncado: o excesso é rejeitado com campo e mensagem. Inclui a administração de catálogos (`texto/opcional` agora rejeitam). Limites mantidos (código SIFEN 20, descrição fiscal 120): **não ampliados** (decisão pendente). |
| PRD-A05 / PRD-API-07 | **Parcial** | Documentos preservados como enlace (nome + URL), com datas dd/mm/aaaa ↔ ISO, vencimento ≥ emissão, edição por id. **Upload privado/versões/exclusão lógica NÃO implementado** (DEC-PRD-04 pendente; exige migration e armazenamento). Nenhuma migração destrutiva. |
| PRD-A06 | Implementado | `SKU_PROVEEDOR` no tipo TS, UI, API e SQL. |
| PRD-A07 | Parcial | Fator de fornecedor e de presentação validados > 0 na aplicação. A CHECK `>= 0` da DDL **não foi alterada** (decisão/migration pendente; dados antigos com 0 continuariam existindo). |
| PRD-A08 | Implementado | `producto-form.tsx` (2878 linhas) substituído por casca + 7 abas + `campos.tsx`, `contexto.ts`, `lib/productos/{normalizar,formulario,pestanas,sincronizar}` (padrão Clientes/Proveedores). |
| PRD-A09 / PRD-API-01 | Implementado | PUT sem DELETE-ALL: eliminações explícitas (ids), UPDATE por id só se mudou, INSERT das novas, ausentes intocadas; registro referenciado (23503) não se elimina (409). Ordem: eliminações → produto → atualizações/altas (KIT→outro tipo exige remover componentes). |
| PRD-A10 | Implementado | Datas dd/mm/aaaa na tela, ISO na API (a API aceita ambos). |
| PRD-A11 | Implementado | Validação real por aba: a mesma `normalizarProducto` no formulário e no servidor; erro com campo → abre a aba e foca o campo; abas sem «check» falso. |
| PRD-A12 | Mantido | Nenhuma emissão SIFEN/XML/SEPSA/ERP. |
| PRD-API-02 | Implementado | PUT conserva o código (rejeita alteração com 409; nunca o atualiza) + **NEX-038** (trigger `productos_codigo_inmutable`) + reversão. |
| PRD-API-04 | Preservado | Transação, `MOVIMIENTOS.CREAR`, `inventario_registrar_movimiento` (idempotência `apertura:<id>`), alcance de depósito pela função SQL. Abertura só no POST (rejeitada no PUT). |
| PRD-API-06 | Implementado | Referências validadas (categoria, marca, família, linha↔família, unidade, imposto, fornecedor, depósito, moeda, produtos alternativos/componentes) por empresa e vigência, com campo; valores já gravados e hoje inativos são admitidos. Unicidade de código/depósito/principal tratada em UI e servidor. |
| §8 (E8) | Implementado só o fundamentado | NCM 6–8 dígitos; partida 4 dígitos; DNCP específico 3–4 e geral ≤ 8 alfanuméricos (sem obrigatoriedade B2G, NT026); país ISO3. **Não implementado:** checksum GS1 (DEC-PRD-02), E701 1–50 / E708 1–2000, mapeamento de unidades/Tabela 5, E713 4–30. |

**Decisões comerciais NÃO impostas (pendentes):** DEC-PRD-02 (checksum GTIN), 03 (SERVICIO/KIT), 04 (documentos privados), 06 (GTIN principal ↔ `codigoBarras`), 08 (elegibilidade de fornecedor), 09, 10, 11 (merma/volume sem efeitos automáticos), limites 20→50 e 120→2000, relação max ≥ min de estoque (dados antigos têm máximo 0).

**Observações para a auditoria:** (1) a regra NCM/partida/DNCP pode rejeitar a *edição* de produtos antigos com valores fora do padrão até que sejam corrigidos; (2) o formulário antigo gravava `0` em máximo/pesos/dimensões; agora vazio = NULL e `0` existente é preservado como 0; (3) sem tabela de auditoria de produtos (não existia; eventos de produto ficam como pendência).

### 10.1 Correção PRD-AUD-01 (2026-10-11)

`eliminarHijos()` valida (existência, conflito «modificada e eliminada») e apaga; `guardarHijos()` já não exige que os ids eliminados existam (foram validados e removidos na fase 1): só exige que existam as filas modificadas e que nenhuma figure também como eliminada. Sem DELETE-ALL. O teste anterior não detectou o defeito porque a base simulada não refletia os DELETE; a nova suíte `sincronizar.casos.ts` usa base com estado e executa as duas fases juntas (exclusão simples/múltipla, com edição, com inclusão, componentes, referência 23503, multiempresa, execuções sequenciais com dados obsoletos). Verificado que a suíte falha (10 asserções) com o código anterior. Concorrência real (bloqueio de linhas) não foi exercitada em PostgreSQL: a rota bloqueia o produto `FOR UPDATE` antes das fases.

## 11. Catálogos oficiais SIFEN: unidades de medida, afetação IVA e códigos fiscais (2026-10-12)

**Origem:** Manual Técnico v150 arquivado no GitHub, tabela 5 (página impressa 211), tabela 6 (p. 212), grupo E8 item (p. 85–87), grupo E8.2 IVA (p. 89–90); NT013 para fórmula de base gravada e base exenta em operação parcial. Referências apresentadas pelo responsável em capturas de sistema concorrente: apenas **comparação de UI**, não fonte normativa. A lista de concorrência contém unidades da Tabela 5, mas não autoriza copiar seu código ou taxonomia.

### 11.1. Tabela 5 — unidades oficiais do item (E709/E710)

| E709 código numérico | E710 representação | Nome da unidade da Tabela 5 |
|---|---|---|
| 87 | m | Metros |
| 2366 | CPM | Costo por Mil |
| 2329 | UI | Unidad Internacional |
| 110 | M3 | Metros cúbicos |
| 77 | UNI | Unidad |
| 86 | g | Gramos |
| 89 | LT | Litros |
| 90 | MG | Miligramos |
| 91 | CM | Centimetros |
| 92 | CM2 | Centimetros cuadrados |
| 93 | CM3 | Centimetros cubicos |
| 94 | PUL | Pulgadas |
| 96 | MM2 | Milímetros cuadrados |
| 79 | kg/m² | Kilogramos s/ metro cuadrado |
| 97 | AA | Año |
| 98 | ME | Mes |
| 99 | TN | Tonelada |
| 100 | Hs | Hora |
| 101 | Mi | Minuto |
| 104 | DET | Determinación |
| 103 | Ya | Yardas |
| 108 | MT | Metros |
| 109 | M2 | Metros cuadrados |
| 95 | MM | Milímetros |
| 666 | Se | Segundo |
| 102 | Di | Día |
| 83 | kg | Kilogramos |
| 88 | ML | Mililitros |
| 625 | Km | Kilómetros |
| 660 | ml | Metro lineal |
| 885 | GL | Unidad Medida Global |
| 891 | pm | Por Milaje |
| 869 | ha | Hectáreas |
| 569 | ración | Ración |

**Atenção:** há **Metros 87/m e Metros 108/MT** na tabela fonte: preservar os códigos, sem deduplicar pelo nome. A representação de kg/m² e ración deve ser confrontada com o XSD antes da emissão. No caso de operação B2G, E709 remete também ao WS DNCP, como indicado no MT.

**Nexit atual:** `NEX-003-catalogos-globales.sql` define `unidades_medida` com `id`, `codigo` e `nombre`; `GET /api/productos` consulta `SELECT id,codigo,nombre FROM unidades_medida WHERE activo=true`. **Não há prova de que `codigo` corresponda ao E709 numérico** nem de que o catálogo possua a representação do E710. Definir mapeamento explícito (código fiscal e representação), preservar IDs internos usados por produtos e converter na geração futura de DTE. Não substituir catálogo nem inventar que seed está aplicado. Verificar primeiro seeds e registros reais.

### 11.2. Tabela 6 e grupo E8.2 — IVA por item

| Código/Tag | Conceito normativo | Origem / regra de aplicação |
|---|---|---|
| E731 iAfecIVA = 1 | Gravado IVA | Tabela 6, p.212 e grupo E8.2 |
| E731 = 2 | Exonerado | Tabela 6; conferir denominação legal atual: MT referencia legislação específica |
| E731 = 3 | Exento | Tabela 6 |
| E731 = 4 | Gravado parcial | Tabela 6; requer proporção tributada |
| E733 dPropIVA | Proporción gravada | 0–100 segundo condições da operação; não copiar `100` cegamente do concorrente |
| E734 dTasaIVA | Tasa del IVA | 0 para exonerado/exento; 5 ou 10 para gravado ou parcial, conforme MT |
| E735/E736/E737 | Base gravada, liquidação, base exenta | **Cálculo de operação**, ver NT013, não atributo estático de produto |

**Nexit atual:** `NEX-003` define `impuestos` por `codigo,nombre,porcentaje` (numeric(5,2)); API produtos retorna `id,codigo,nombre,porcentaje`; UI só oferece `Impuesto / IVA`. Portanto **não existe evidência de campo próprio de afetação E731 e proporção E733** no contrato de cadastro analisado. Uma taxa 5/10 no produto não identifica sozinha exento/exonerado/gravado parcial. A alternativa recomendada é estruturar **classificação fiscal padrão do produto** separada da tributação efetiva da operação: afetação (1–4), taxa (0/5/10) e proporção gravada quando 4; validar coerência no backend, permitir política de substituição legítima pela operação e versionar migration incremental se aprovada. Não alterar tributação de itens históricos nem emitir DTE nesta V1.

### 11.3. Demais códigos e campos associados mostrados pelo concorrente

| Campo visual | Fonte SIFEN / Nexit | Recomendação |
|---|---|---|
| Tipo Producto/Servicio | E701/E708 e natureza do item; formulário Nexit usa MERCADERIA/SERVICIO/KIT/ACTIVO_FIJO | Mapear seleção fiscal produto/serviço no ato da emissão; categorias ERP podem ser mais detalhadas |
| Unidad de Medida | E709/E710 Tabela 5 | Seleção pelo catálogo oficial e conversão para unidade base/apresentação |
| Afectación IVA | E731 Tabela 6 | Falta modelo explícito no cadastro atual para classificação padrão |
| % IVA | E734 | Não assumir 10% para todos |
| Proporción IVA | E733 | Só quando pertinente; para parcial deve haver regra, validação e persistência |
| Código de Producto | E701 + `codigo_sifen` Nexit | Limite do pacote NT009 até 50; hoje coluna 20, aguarda decisão de ampliar |
| DNCP General/Específico | E704/E705 e NT026 | Ambos já existem no cadastro; padronização e condicional conforme documentos atuais, não obrigatoriedade genérica |
| Código de barras | E706/E707 | Nexit possui `codigo_barras`, `producto_codigos`, código de embalagem em apresentações; usar GTIN correto, não campo genérico indiscriminado |
| Precio | Grupo E8.1 da operação fiscal | Preço de referência Nexit não equivale a preço final faturado |

**Atenção ao padrão visual:** **não reproduzir a tela do concorrente** (um formulário com todos os atributos sem distinção). O Nexit preserva suas sete abas; em SIFEN concentrar classificação fiscal e códigos, em Información apenas o necessário para identificação comercial, e em Compras/Inventario preservar políticas independentes. Campos fiscais novos demandam regra, DB, API e validação completos; não adicionar apenas controle visual.

### 11.4. Estado e decisões pendentes

- A tabela oficial de unidades **foi identificada e transcrita**; falta verificar seeds concretos/linhas reais e definir fonte/versionamento dos códigos e representação fiscal. Não alegar que `unidades_medida` já contém toda a tabela.
- **DEC-PRD-13 (nova):** aprovar catálogo canônico das 34 unidades oficiais da Tabela 5 com `codigo_sifen`, representação e vínculo com `unidades_medida` (sem perder IDs/referências já existentes).
- **DEC-PRD-14 (nova):** aprovar classificação fiscal padrão por produto com afetação IVA 1–4, taxa e proporção condicionais, independente do cálculo do DTE na operação; definir permissões e política de mudança.
- Nenhuma dessas novas regras foi implementada nem aprovada implicitamente por esta auditoria. Claude só implementa após autorização específica do responsável; migraciones devem ser incrementais e não aplicadas na VM pelas IAs.

## 12. Confronto técnico e proposta de evolução cadastral SIFEN (Claude Code, 2026-10-12)

**Natureza:** documentação e proposta. **Nada foi implementado, nenhuma migration foi criada, nenhum SQL foi executado, e DEC-PRD-13 e DEC-PRD-14 NÃO foram aprovadas nem implementadas.** Não houve acesso ao PostgreSQL real: o conteúdo efetivo dos catálogos da VM é **desconhecido**; o que se afirma sobre dados vem dos seeds e migrations versionados no Git (que podem não refletir o banco real). Fontes: Manual Técnico v150 (`Manual Técnico Versión 150 - 01-2.pdf`, extraído do ZIP arquivado com `pdftotext`; Tabelas 5 e 6 p. 211–212; E8 p. 85–87; E8.2 p. 89–90; validações 151–156 p. 178), NT009, NT013, NT023, NT026 e NT027.

### 12.1. Verificação da transcrição da §11

- **Tabela 5 conferida contra o PDF:** os 34 pares código/representação/descrição transcritos na §11.1 coincidem com o manual. São **34 unidades, não 35** (28 na p. 211 + 6 na p. 212: 625, 660, 885, 891, 869, 569); corrigir o «35» do texto de DEC-PRD-13. `Metros` aparece duas vezes (**87/`m`** e **108/`MT`**); `ml` (660, Metro lineal) e `ML` (88, Mililitros) diferem só por maiúsculas; `MM` (95) e `MM2` (96): **nenhuma unicidade por nome nem por `lower(representación)`**.
- **Tabela 6 conferida:** 1 Gravado IVA; 2 Exonerado (Art. 83 – Ley 125/91); 3 Exento; 4 Gravado parcial (Grav-Exento).
- **Regras E8.2 conferidas (validações 151–156 do MT, NT013):** E731 ∈ {1,2,3,4}; E732 é a descrição canônica do código; **E733 = 100 se E731=1; = 0 se E731=2/3; 0 < E733 < 100 se E731=4**; **E734 = 0 se E731=2/3; ∈ {5,10} se E731=1/4**; E735 base gravada = 100·EA008·E733 / (10000 + E734·E733) (NT013); E736 = E735·E734/100; E737 base exenta (só E731=4) = 100·EA008·(100−E733) / (10000 + E734·E733) (NT013). **E735–E737 dependem do valor da linha (EA008): são cálculo da operação, nunca atributo do cadastro.** E730/E731 são obrigatórios conforme D013 e C002 (contexto do documento): o cadastro guarda só o **padrão sugerido**.

### 12.2. Unidades de medida — situação real e proposta

**Estado versionado (NEX-003 + S-001):** `unidades_medida(id uuid, codigo text UNIQUE, nombre, codigo_sifen text, descripcion_sifen text, activo)`; global (sem `empresa_id`). **Sem CHECK nem índice único em `codigo_sifen`** (a fonte histórica 023 criava `varchar(5)` + índice único parcial; a V1 não). Referenciada por `productos`, `producto_unidades`, `producto_proveedores` e `lista_precio_items` (FK por `id`). Nenhum código TS/API/formulário usa `codigo_sifen`: `GET /api/productos` e o formulário usam só `id, codigo, nombre`.

| Código interno (seed S-001) | `codigo_sifen` semeado | Tabela 5 oficial | Juízo |
|---|---|---|---|
| UN Unidad | `77` | 77 / UNI / Unidad | Correto. `descripcion_sifen` semeada = «Unidad» (E710 oficial = `UNI`). |
| KG Kilogramo | `83` | 83 / kg / Kilogramos | Correto (representação oficial `kg`). |
| LT Litro | **`87`** | 87 = **Metros (`m`)**; Litros = **89 / LT** | **Divergente: o seed mapeia Litro para o código de Metros.** |
| MT Metro | **`86`** | 86 = **Gramos (`g`)**; Metro = **87 / m** ou **108 / MT** | **Divergente: o seed mapeia Metro para o código de Gramos; além disso há dois códigos oficiais para metro (decisão).** |
| CJ Caja | `CJ` | não existe na Tabela 5 | Valor não numérico; E709 exige numérico 1–5 da Tabela 5. Caja é *apresentação* (fator sobre a unidade), não unidade fiscal. |
| DOC Docena | `DOC` | não existe | Idem. |

Os produtos DEMO (NEX-012) usam `UN`. Se a VM foi carregada com S-001, `LT` e `MT` estão com código fiscal errado e `CJ`/`DOC` sem equivalente: **verificação somente-leitura pelo responsável** (resultado deve ser anexado ao GitHub):

```sql
SELECT codigo, nombre, codigo_sifen, descripcion_sifen, activo,
       (SELECT count(*) FROM productos p WHERE p.unidad_medida_id = u.id) AS produtos
  FROM unidades_medida u ORDER BY codigo;
```

**Proposta estrutural (NEX-039, a criar só após aprovação de DEC-PRD-13):**
1. Tabela de referência **`unidades_medida_sifen`** (global, só leitura para o papel runtime): `codigo integer PRIMARY KEY CHECK (codigo BETWEEN 1 AND 99999)` (E709, numérico 1–5), `representacion text NOT NULL CHECK (char_length(representacion) BETWEEN 1 AND 10)` (E710), `descripcion text NOT NULL`, `fuente text NOT NULL DEFAULT 'MT150-T5'`, `vigente boolean`. **Sem UNIQUE em `representacion`/`descripcion`** (Metros ×2; `ml`/`ML`). 34 linhas carregadas por seed separado (S-005), com checksum da fonte.
2. **Nova coluna `unidades_medida.unidad_sifen_codigo integer NULL REFERENCES unidades_medida_sifen(codigo)`** (relação N:1: várias unidades internas podem apontar para o mesmo código oficial). **Os IDs e FKs existentes ficam intactos; nenhuma unidade é fundida, renomeada ou apagada.** As colunas atuais `codigo_sifen`/`descripcion_sifen` ficam **obsoletas e preservadas** (sem DROP); a fonte da verdade passa a ser o vínculo.
3. **Backfill NÃO automático:** seed separado e revisável que só vincula o inequívoco (UN→77, KG→83, LT→89) e deixa MT, CJ e DOC **sem vínculo** até decisão (MT: 87/`m` ou 108/`MT`; CJ/DOC: política — normalmente unidade fiscal UNI 77 com a caixa como apresentação).
4. Reversão: `DROP COLUMN unidad_sifen_codigo` + `DROP TABLE unidades_medida_sifen` (sem perda de dados originais). Grants: SELECT para `nexit_runtime`; sem escrita runtime (catálogo global administrado por seed/plataforma).
5. **API:** `GET /api/productos?modo=catalogos` devolve por unidade `unidadSifen: { codigo, representacion, descripcion } | null`. **Validação:** sem vínculo = **aviso de «aptidão fiscal» (informativo)**, nunca bloqueio de cadastro na V1 (não há emissão). `producto_unidades` herda a unidade fiscal da unidade da presentação. Nunca enviar o UUID no XML (E709 é o código oficial).
6. **UI:** nenhum segundo seletor de unidade. Em *SIFEN y códigos*, bloco «Unidad fiscal» **somente leitura** com a unidade base escolhida em Información (`UNI · 77`) e, se faltar vínculo, aviso curto «Sin equivalencia SIFEN: no podrá emitirse».

### 12.3. Tributação IVA — situação real e proposta (DEC-PRD-14 pendente)

**Estado versionado:** `impuestos(id, codigo UNIQUE, nombre, porcentaje numeric(5,2) 0–100, activo)`, global; seed: `IVA10` (10), `IVA5` (5), `EXE` «Exenta» (0). `productos.impuesto_id` (FK, opcional; também `proveedores.impuesto_id`). **Não existe** campo de afetação (E731) nem de proporção (E733); a taxa (E734) existe como `porcentaje`. `EXE` (0%) é **ambíguo**: pode ser Exento (3) ou Exonerado (2), com consequências fiscais distintas; **não deve ser inferido.** O formulário tem um único seletor «Impuesto / IVA» (padrão IVA 10 % para novos), e o POST/PUT só persistem `impuesto_id`.

**Contrato proposto de «classificação fiscal padrão do produto»** (independente do cálculo do DTE; a operação pode legitimamente diferir e é a que se transmite):

| E731 afetação | Taxa padrão (E734) | Proporção gravada (E733) | Cadastro guarda | Operação calcula |
|---|---|---|---|---|
| 1 Gravado IVA | 5 ou 10 | 100 (fixa) | afetação + taxa | E735, E736 |
| 2 Exonerado (Art. 83 – Ley 125/91) | 0 | 0 (fixa) | afetação | zeros |
| 3 Exento | 0 | 0 (fixa) | afetação | zeros |
| 4 Gravado parcial | 5 ou 10 | **0 < x < 100 (informada)** | afetação + taxa + proporção | E735, E736, E737 |

**Estrutura recomendada (NEX-040, só após aprovação):**
- **Classificação no catálogo `impuestos`** (preserva a FK `productos.impuesto_id` e a semântica de `porcentaje`): `afectacion_iva smallint NULL CHECK (IN 1..4)`, `tasa_iva smallint NULL CHECK (IN 0,5,10)`; CHECKs de coerência (afetação 1 ⇒ tasa 5/10; 2/3 ⇒ tasa 0; 4 ⇒ tasa 5/10) e `porcentaje = tasa_iva` quando ambas existirem. Novas linhas de catálogo (ex.: `EXENTO`, `EXONERADO`, `GRAV_PARCIAL`) em seed separado, **sem alterar `EXE`**.
- **Proporção no produto:** `productos.proporcion_gravada_iva numeric(7,4) NULL` com CHECK `0 < x < 100`, obrigatória se (e somente se) a afetação do imposto escolhido for 4; verificada por trigger (regra entre tabelas) e pela API.
- **Backfill:** IVA10 → (1, 10), IVA5 → (1, 5); **`EXE` fica sem classificação (NULL) até o responsável decidir 2 ou 3.** Produtos existentes não mudam de imposto; nenhum histórico é reclassificado.
- **Permissões e política de mudança:** alterar o imposto de um produto com movimentos continua com `PRODUCTOS.EDITAR`; propõe-se permissão própria só se a decisão exigir segregação (pendente). Mudança futura não afeta documentos já emitidos (a operação grava seu próprio valor).
- **API/validação:** `normalizarProducto` valida a combinação proporção × afetação do imposto (E733a/b); o catálogo devolve `afectacionIva`, `tasaIva`. Imposto sem classificação = aviso de aptidão fiscal. **UI:** seletor de imposto passa a viver em *SIFEN y códigos* (bloco «IVA»), com chips derivados (afetação, taxa) e campo «Proporción gravada» visível só para afetação 4; em *Información* fica o valor em somente leitura (fonte única).

### 12.4. Demais códigos fiscais — situação real campo a campo

| Tag | Regra do pacote | Campo Nexit / limite | Situação real | Ação proposta |
|---|---|---|---|---|
| E701 dCodInt | 1–50 (NT009) | `codigo_sifen` ≤ 20; `codigo` ≤ 80 | Conservador (subconjunto). `codigo` não pode ir direto ao XML se > 50. | **Manter 20** (sem aprovação não se amplia). Definir na emissão a fonte (`codigo_sifen`, senão `codigo` se ≤ 50). Ampliar para 50 = `ALTER` simples de CHECK + `maxLength`; decisão do responsável. |
| E702 dParAranc | numérico, 4 | `partida_arancelaria` ≤ 4 | **Implementado:** 4 dígitos (V1.1). | — |
| E703 dNCM | numérico 6–8 | `ncm` ≤ 8 | **Implementado:** 6–8 dígitos. | — |
| E704 dDncpG | alfanum. 8, 0–1; **NT026 retira obrigatoriedade B2G** | `dncp_general` ≤ 8 | Implementado: 1–8 alfanuméricos, opcional. O manual exige preencher com zeros à esquerda quando existir. | Não preencher na gravação; aplicar *padding* na emissão (proposta) ou normalizar a 8 na entrada (decisão). |
| E705 dDncpE | alfanum. 3–4, 0–1 | `dncp_especifico` ≤ 4 | **Implementado:** 3–4, opcional. | — |
| E706 dGtin | numérico **8, 12, 13 ou 14**, 0–1 | `producto_codigos` tipos GTIN/EAN/UPC; CHECK de BD: **8–14** dígitos | **Desvio:** a BD e a API aceitam 9, 10 e 11 dígitos, que o E706 não admite. | Restringir a {8,12,13,14} no aplicativo para esses tipos (sem alterar a CHECK da BD); checksum GS1 = DEC-PRD-02 pendente. |
| E707 dGtinPq | idem, GTIN do pacote | tipo `GTIN_EMPAQUE`; `producto_unidades.codigo_barras` (texto livre ≤ 80) | `codigo_barras` da apresentação **sem validação de GTIN**. | Validar como GTIN quando a apresentação for a embalagem; distinguir E706 (item) de E707 (pacote). Pendente DEC-PRD-06 (principal). |
| E708 dDesProSer | 1–2000 (NT009) | `descripcion_factura` ≤ 120 | Subconjunto conservador. | **Manter 120.** Ampliação = decisão (impacto de impressão). |
| E709/E710 | Tabela 5 | `unidad_medida_id` (UUID) | Sem vínculo oficial verificado (ver §12.2). | NEX-039. |
| E711 dCantProSer | 1–10p(0–8) (NT023) | estoque `numeric(18,4)` | Escala de estoque (4) < fiscal (8). | **Não alterar o estoque.** A quantidade fiscal vem da operação. |
| E712/E713 | país ISO3; descrição 4–30 | `pais_origen_codigo`/`_nombre` (≤ 30) | Código validado ISO3; nome copiado do catálogo (`left(…,30)`). | Aviso se o nome do catálogo tiver < 4 caracteres. |
| E714 dInfItem | 1–500 | `informacion_factura` ≤ 500 | Implementado, sem truncar. | — |
| E715–E718 | merma/quebra | `relacion_mercaderia`, `cantidad_merma`, `porcentaje_merma(7,4)` | E718 admite 8 decimais; coluna tem 4. | Mestre = padrão; valor fiscal vem da operação (DEC-PRD-11 pendente). |
| E731–E734 | §12.1 | — | Inexistentes no cadastro (exceto taxa em `porcentaje`). | NEX-040. |
| E735–E737 | cálculo | — | Fora do cadastro. | Sem campo. |

**Limites 20→50 e 120→2000:** nenhuma alteração. Opções para o responsável: (a) manter limites empresariais menores (válidos); (b) ampliar `codigo_sifen` para 50 (baixo risco); (c) ampliar descrição fiscal para 2000 (exige revisar impressão/tickets). Não há dependência técnica desta etapa dos limites.

### 12.5. Estrutura proposta da aba «SIFEN y códigos» (sem alterar as sete abas)

Layout do padrão Nexit (grade 4/2/1, cartões compactos, mensagens por campo), **sem copiar o formulário do concorrente**, em blocos curtos:
1. **Identificação do item** — Código SIFEN (E701); Información adicional en factura (E714); `Descripción para factura` e `País de origen` aparecem só como **valores de leitura** com atalho à aba onde se editam (fonte única; sem duplicar edição).
2. **IVA** (DEC-PRD-14) — seletor de imposto; chips derivados *Afectación* e *Tasa*; *Proporción gravada* apenas se afetação = 4.
3. **Unidade fiscal** (DEC-PRD-13) — leitura da unidade base (e suas presentações) com `código · representação`; aviso se não há equivalência.
4. **Classificação aduaneira e contratações** — NCM, partida arancelaria, DNCP geral/específico.
5. **GTIN e códigos** — coleção atual `codigos` com rótulos E706 (item) / E707 (embalagem); um principal.
Cada bloco mostra um indicador discreto de «aptidão fiscal» (pendências), sem bloquear o salvamento na V1.

### 12.6. Plano de implementação (aguarda autorização específica)

| Etapa | Conteúdo | Dependência |
|---|---|---|
| A | Aprovação de DEC-PRD-13/14, política MT (87 vs 108), `EXE`, CJ/DOC e confirmação dos dados reais da VM (consulta §12.2) | Responsável |
| B | NEX-039 (+ reversão) e seed S-005 (34 unidades); seed separado de vínculo inequívoco | A |
| C | NEX-040 (+ reversão) e seed de classificações; `normalizarProducto` (proporção/afetação), catálogos na API | A |
| D | Aba SIFEN conforme §12.5; aviso de aptidão fiscal | B, C |
| E | Regressões (estáticas + base simulada); verificação em PostgreSQL pelo responsável | B–D |

**Riscos:** (1) vínculos de unidade incorretos já semeados na VM (LT/MT) alimentariam XML errado — corrigir *antes* de qualquer emissão; (2) `EXE` mal classificado muda o tratamento fiscal; (3) restringir GTIN a {8,12,13,14} pode rejeitar a edição de produtos antigos com 9–11 dígitos; (4) unidades globais compartilhadas por todas as empresas: qualquer correção afeta todos os tenants (deve ser feita por migration/seed controlado, nunca por tela de empresa).

**Estado:** confronto documentado; propostas sem implementação; nenhuma verificação em PostgreSQL ou navegador; manifesto das fontes DNIT permanece o do repositório.

## 13. Auditoria independente ChatGPT da proposta §12 — commit 119467d7 (2026-10-12)

**Parecer:** APROVADA A DOCUMENTAÇÃO COMO BASE DE DECISÃO, **COM CORREÇÕES E CONDIÇÕES ANTES DE IMPLEMENTAR**. Nenhuma migration NEX-039/040 foi criada/aplicada, nenhuma execução na VM; a aprovação técnica não significa autorização comercial DEC-PRD-13/14. Revisão do commit, NEX-003, seed S-001, API catálogos e texto original PDF MT v150 Tabela 5 (p. 211–212), Tabela 6. Demais fórmulas da NT013 foram reportadas e documentadas por Claude, não reexecutadas aqui como teste fiscal operacional.

| ID | Constatação verificada | Consequência obrigatória |
|---|---|---|
| PRD-SIF-AUD-01 | A Tabela 5 tem **34 entradas**, não 35. Códigos 87/m e 108/MT ambos correspondem a Metros; 88/ML ≠ 660/ml. | A DEC-PRD-13 no §11.4 foi corrigida para 34; catálogo keyed **pelo código numérico**, nunca descrição/nome sem case. |
| PRD-SIF-AUD-02 | Seed S-001 contém UN→77, KG→83, **LT→87 (incorreto: 89)** e **MT→86 (incorreto: 87 ou 108)**; CJ/DOC possuem valores não numéricos e sem correspondência Tabela 5. | Separar correção de **dados atuais** de seed de instalação nova. Escolha entre códigos 87 e 108 para MT fica expressamente pendente. |
| PRD-SIF-AUD-03 | S-001 executa `ON CONFLICT (codigo) DO NOTHING`. | **Corrigir somente o seed NÃO altera unidades existentes** no banco. Exigir SELECT somente leitura do estado real, plano idempotente de reconciliação, registro de antes/depois e escopo restrito aos mapeamentos fiscais; preservar IDs, FKs e histórico. |
| PRD-SIF-AUD-04 | O modelo `unidades_medida` NEX-003 **já possui** `codigo_sifen` e `descripcion_sifen`, ambos livres e legados. | NEX-039 deve deixar claro se faz referência por nova FK ou substitui/normaliza essas colunas. Se mantiver legado, evitar **duas fontes fiscais ativas divergentes**; definir compatibilidade, leitura e política de sincronização/descontinuação. |
| PRD-SIF-AUD-05 | `impuestos` tem IVA10, IVA5 e EXE; `EXE` representa exenta no seed mas não prova equivalência segura com afetación 2/3 de todos os usos. | Não inferir E731 pela alíquota 0. Propor seleção fiscal explícita e defaults aplicados só a novos produtos ou mediante consentimento; preservar cadastros e documentos anteriores. |
| PRD-SIF-AUD-06 | A classificação IVA pelo imposto global e a proporção por produto são possíveis, mas tributação depende da natureza da **operação**. | Definir override fiscal contextual (tipo DTE, regime/isenção, exportação, destinação), coerência da combinação no backend, valor persistido na transação e tratamento de catálogos sem mapeamento; sem emissão V1. |
| PRD-SIF-AUD-07 | NEX-007 permite GTIN numérico de 8–14 dígitos; E706/E707 exigem 8/12/13/14. | Regra nova no servidor e formulário para codigos GTIN; auditá-la contra dados pré-existentes antes de eventual CHECK DB; não rejeitar SKU/CODIGO_ALTERNO como GTIN. Dígito verificador GS1 requer decisão separada. |
| PRD-SIF-AUD-08 | Não houve acesso ao PostgreSQL da VM nem testes do plano de migrations/DDL. | Não definir `NEX-039`/`NEX-040` como liberadas; revisar grants, FK, seeds seguros, ordem de migração e rollback **não destrutivo** depois de aprovar decisões. |

**Nota de UX:** o aviso proposto `Sin equivalencia SIFEN: no podrá emitirse` deve ser substituído por **`Sin equivalencia SIFEN configurada`** enquanto emissão está fora da V1; não prometer certeza sobre emissão futura. A migração de códigos fiscais não pode modificar a unidade comercial, as conversões ou o inventário existente. Critério de aceitação obrigatório: toda unidade de produto/presentação resolve código E709 válido, representação E710, ou é explicitamente marcada como sem mapeamento; sem falsas homologações fiscais.

**Estado final:** documentação §12 revisada estaticamente e útil como especificação proposta; **pendente a aprovação DEC-PRD-13/14 pelo responsável**, resultado da consulta SQL de leitura do catálogo da VM, confirmação das normas atuais/XSD quando houver integração e testes das futuras migrations em ambiente autorizado. Não homologado para deploy.

## 14. Implementação da evolução fiscal (Claude Code, 2026-10-12) — estado exato

**Autorizada pelo responsável a partir do commit `94d6e035`. NEX-039 e NEX-040 estão versionadas e NÃO foram aplicadas; nenhum SQL, PostgreSQL, VM, Docker ou deploy foi usado; nenhuma validação em navegador.** Sem emissão SIFEN, XML ou integrações.

| Item | Estado | Como ficou |
|---|---|---|
| Catálogo Tabela 5 (34 unidades) | Implementado (SQL) | `NEX-039`: `unidades_medida_sifen` (chave = código E709; E710 1–10; descrição; fonte `MT150-T5`; vigente). Sem UNIQUE em representação/descrição (Metros 87/m e 108/MT; `ml`≠`ML`). Fonte TS `lib/fiscal/unidades-sifen.ts`, comparada por teste com o SQL linha a linha. |
| Vínculo com `unidades_medida` | Implementado | Coluna `unidad_sifen_codigo` N:1 nullable com FK. IDs, referências, presentaciones e movimentos intactos. |
| Duas fontes de verdade | Resolvido | `codigo_sifen`/`descripcion_sifen` viram **espelho legado** preenchido por trigger só quando há vínculo; a aplicação lê apenas o vínculo. Nada é apagado. |
| Seed (instalações novas) | Corrigido | S-001: UN→77, KG→83, **LT→89**; **Metro, Caja e Docena sem vínculo** (87 vs 108 segue pendente; sem equivalência inventada). |
| Dados existentes | Script separado | `scripts/reconciliar-unidades-sifen-NEX-039.sql (unidades) e reclasificar-iva-productos-NEX-040.sql (só com autorização expressa)`: idempotente, só `UN/KG/LT` por código **e** nome exatos, registro antes/depois em `fiscal_reconciliacion_log`; informes de leitura do que fica pendente. Corrigir o seed **não** altera a VM (ON CONFLICT DO NOTHING). |
| API/seletores | Implementado | `GET /api/productos?modo=catalogos` devolve `sifenCodigo`/`sifenRepresentacion`; selects de unidade mostram «LT · Litro (SIFEN 89 · LT)» (Información e Compras). |
| Classificação IVA E731/E733/E734 | Implementado | `NEX-040`: `productos.afectacion_iva` (1–4) e `proporcion_gravada_iva` (0<x<100, só com afetação 4); **a tasa é o `porcentaje` do impuesto escolhido** (trigger: 5/10 para 1 e 4; 0 para 2 e 3); proporção fixa 100/0 **derivada, não armazenada**. Mesma regra em `lib/productos/fiscal.ts` (formulário + normalizador + servidor com a tasa real do banco) e no banco (CHECK + trigger). |
| Desvio da proposta §12.3 | Registrado | A classificação vive **no produto**, não em novas linhas de `impuestos`: essa tabela é compartilhada com as retenções de Proveedores e `EXE` é ambíguo. Assim `impuestos` e suas referências ficam intactos e **`EXE` nunca é reclassificado** (produtos legados = «sin clasificar»). Novos produtos sugerem IVA 10 % Gravado; existentes não mudam. |
| E735–E737 | Não armazenados | Cálculo da operação (NT013); sem coluna nem campo. |
| GTIN E706/E707 | Implementado | Tipos GTIN, GTIN_EMPAQUE, EAN e UPC aceitam só 8/12/13/14 dígitos (só dígitos). `CODIGO_ALTERNO`, `SKU_PROVEEDOR` e `OTRO` não recebem essa regra. CHECK da BD (8–14) não alterada. Informe de leitura lista GTIN legados com comprimento inválido. Checksum GS1: pendente (DEC-PRD-02). |
| NCM/partida/DNCP/limites | Preservado | Regras anteriores intactas; **20→50 e 120→2000 NÃO ampliados**. |
| Aba «SIFEN y códigos» | Implementado | Cinco blocos: identificação fiscal; classificação e afetação IVA (única edição de impuesto/afetação/proporção); unidade de medida SIFEN (derivada da unidade base, sem seletor duplicado); NCM/partida/DNCP; GTIN e códigos adicionais. Descrição fiscal, país (aqui editável uma vez; espelho em Información) e unidade base não se duplicam. Aviso «Sin equivalencia SIFEN configurada» sem bloquear. |
| Preservado | Verificado por testes/estática | Multiempresa e permissões; sincronização por ID e ordem eliminar→produto→guardar (PRD-AUD-01); decimais exatos; NEX-038. |

**Pendentes (decisão do responsável):** código de Metro (87 ou 108); Caja/Docena (política; normalmente UNI 77 + presentación); classificação de `EXE` (2 Exonerado ou 3 Exento) produto a produto; execução das migrations/reconciliação e conferência na VM (backup, `SELECT` de §12.2); checksum GTIN; limites 20→50 / 120→2000; tela de administração de equivalências (hoje por seed/script); gravado parcial só se a empresa o usa. **Risco conhecido:** a nova regra de GTIN pode rejeitar a *edição* de produtos com GTIN de 9–11 dígitos até serem corrigidos (o informe da reconciliação os lista).

**Testes realizados:** `tsc` e ESLint sem erros nos arquivos tocados; casos locais (105 novos: quatro afetações e combinações inválidas, normalizador/BD simulada, GTIN, unidades sem equivalência, legado, isolamento por empresa, SQL/seed/reconciliação/API/tela estáticos). **Build: o `next build` compila, mas o prerender de `/clientes/nuevo` e `/login` falha como antes destas mudanças — build NÃO aprovado.** Nada executado em PostgreSQL nem no navegador; não homologado.

### 14.1 Correção PRD-AUD-03…06 (Claude Code, 2026-10-12)

| Achado | Correção |
|---|---|
| PRD-AUD-03 (P0) | **Runner** `aplicar-migraciones.sh`: `to_regproc('…()')` (só nome) → `to_regprocedure('public.nex_aplicar_grants_runtime()')`; removido o `\|\| true`: se a função existe, uma falha na concessão **aborta** o runner (sem «listo»); se não existe (NEX-013 pendente) avisa explicitamente. Checksums, transação por migração e bloqueio consultivo intactos. **NEX-039** (ainda não aplicada, pode ser editada): `nex_aplicar_grants_fiscal()` = `unidades_medida_sifen` só `SELECT` e `fiscal_reconciliacion_log` **sem acesso** para o runtime (guarda instantâneas de várias empresas); o envoltório de `nex_aplicar_grants_runtime()` passa a chamar base + proveedores + fiscal (convenção da NEX-037), exige NEX-037 e aplica os grants ao terminar; a reversão restaura o envoltório da NEX-037. O teste **executa o runner oficial** com um `psql` simulado (função existe / concessão falha / função inexistente) e falha com o runner anterior. |
| PRD-AUD-04 (P1) | Mensagens do trigger `productos_iva_coherencia`: «…tasa de 5 o 10 por ciento (el impuesto elegido tiene una tasa de % por ciento)»; regra fiscal inalterada. Teste genérico: nº de marcadores `%` = nº de argumentos em todos os `RAISE` das NEX-038/039/040. |
| PRD-AUD-05 (P1) | Trigger `unidades_medida_espejo_sifen`: com vínculo, `codigo_sifen`/`descripcion_sifen` são sempre o espelho (também ao tentar escrevê-los); **ao retirar o vínculo ficam NULL** e o valor anterior é gravado em `fiscal_reconciliacion_log`. Unidades que nunca tiveram vínculo mantêm seu dado legado (não há limpeza em massa); o informe da reconciliação as lista como «código legado sem vínculo canônico». |
| PRD-AUD-06 (P1) | A reclassificação IVA saiu da reconciliação. `reconciliar-unidades-sifen-NEX-039.sql` só vincula unidades (UN/KG/LT) e emite informes de leitura (inclui contagem de produtos sem classificar, sem alterá-los). `reclasificar-iva-productos-NEX-040.sql` **aborta sem autorização expressa** (`nex.autorizacion_reclasificacion`), não é invocado por runner, seed, migration nem script de implantação, e nunca toca `EXE`. NEX-040 e S-001 atualizadas. |

**Verificação conjunta NEX-038/039/040:** ordem 038→039→040; dependências (007; 003+037; 007+039) com pré-condições; só a 039 toca grants; as três têm reversão com salvaguarda de dados; sem colisão de triggers; nenhuma migration reclassifica dados de produtos. **Testes:** 40 verificações novas (1275 no total, 0 falhas); 6 delas falham com o runner anterior. tsc e ESLint sem erros. **Build NÃO aprovado:** o `next build` compila, mas o prerender (`/clientes/nuevo` e `/login`) segue falhando como antes. Nada executado em PostgreSQL; NEX-038/039/040 continuam **não aplicadas**.
