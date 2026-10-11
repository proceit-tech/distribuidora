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
