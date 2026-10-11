# Nexit V1 — Proveedores — Matriz UI × tipos × API × SQL × referência ERP (2026-10-11)

**Status:** REVISÃO ESTÁTICA INICIAL; **não homologado**. Nenhum código/SQL/VM alterado, nenhum teste executado nesta auditoria. Escopo: telas fornecidas pelo responsável (8 abas e visão geral), branch `feature/NEXIT-2026-001-banco-demo`, `app/(private)/proveedores/_components/proveedor-form.tsx`, `types/proveedores.ts`, `app/api/proveedores/route.ts`, `app/api/proveedores/[id]/route.ts`, `lib/proveedores/shared.ts`, migration **NEX-006-proveedores.sql**, e comparação visual com Clientes. **Não pressupor que NEX-006 é o último DDL efetivo**, nem que migrations estão aplicadas na VM; confrontar mudanças posteriores antes de implementar. As telas são evidência visual da conversa, não arquivos versionados.

## Premissas e fronteiras

1. Seguir padrão visual de **Clientes V1** para título, breadcrumbs, formulário compacto, abas, seletores, telefones internacionais, validadores comuns de RUC/DV, localização, botões e mensagens. Reutilizar funções existentes comprovadamente equivalentes, não copiar lógica de cliente indiscriminadamente.
2. **Fornecedor não é receptor fiscal SIFEN**: não importar `aptitud-sifen`, B2B/B2F nem matriz de campos obrigatórios do receptor; validações do fornecedor devem refletir compras/cadastro/tributos aplicáveis, não requisitos do XML de venda.
3. **Matriz a seguir descreve o mapeamento versionado, NÃO um contrato de mudanças aprovado.** Campos “recomendar/decidir” precisam de decisão expressa antes de ampliar regra de negócio.
4. Em Proveedores, POST usa `prepararProveedor` e `insertarHijos`; PUT apaga e reinserta todos os filhos (ver risco crítico abaixo). DDL base NEX-006 tem UNIQUE `(empresa_id,tipo_documento,numero_documento)` e constraints de RUC/documento.

## Matriz campo a campo — cada linha representa campo visual, propriedade TS e coluna persistida

Legendas: **OK-base** = trilha UI→tipo→shared→NEX-006 identificada; **R** = requer revisão; **CRÍTICO** = comportamento potencialmente destrutivo; **P** = política a definir. Para SQL, a coluna indicada é a coluna da NEX-006 ou a coluna usada no INSERT/UPDATE do shared; não é prova de banco aplicado.

### 1 — Información

| Campo da tela | Tipos / API | SQL NEX-006 | Auditoria |
|---|---|---|---|
| Código automático PRV | gerado no POST; `codigo` só leitura | `proveedores.codigo`, UNIQUE por empresa | **R:** retirar cabeçalho e cartão duplicados; manter geração. |
| Tipo de pessoa | `tipoPersona` | `tipo_persona` | OK-base, FISICA/JURIDICA. |
| Tipo de documento | `tipoDocumento` | `tipo_documento` | **R:** opções por país e pessoa; não impor SIFEN do receptor. |
| RUC / número de documento | `numeroDocumento` | `numero_documento` | **R:** RUC PY 3–8 dígitos e não duplicidade por empresa; confirmar condição para estrangeiros. |
| DV | `dv` | `dv` | **R:** API exige um dígito se RUC mas não comprova módulo compartilhado de cálculo/verificação DV; avaliar reutilização. |
| Razón social | `razonSocial` | `razon_social` | OK-base obrigatório. |
| Nombre de fantasía | `nombreFantasia` | `nombre_fantasia` | OK-base opcional. |
| Grupo de proveedor | `grupoProveedorId` | `grupo_proveedor_id` FK por empresa | OK-base catálogo, validar status. |
| País | `paisCodigo`, `paisNombre` apresentação | `pais_codigo` | **R:** evitar default PY silencioso quando usuário alterou país; catálogos ISO. |
| Teléfono | `telefono` | `telefono` | **R:** telefone internacional país/DDI/área conforme Clientes exigiria compatibilizar schema; não assumir campos já existentes. |
| Correo electrónico | `email` | `email` | OK-base formato; conferir preservação. |
| Sitio web | `sitioWeb` | `sitio_web` | OK-base http/https. |
| Observación general | `observacion` | `observacion` | **R:** exibida repetidamente em todas as abas; preferir um único local/controle, preservando valor. |

### 2 — Compras y pagos

| Campo | Tipo/API | SQL | Auditoria |
|---|---|---|---|
| Condición de pago | `condicionPagoId` | `condicion_pago_id` FK | OK-base. |
| Moneda predeterminada | `monedaCodigoPredeterminada` | `moneda_codigo_predeterminada` | OK-base, não confundir com moeda de cada banco. |
| Medio de pago preferido | `medioPagoPreferidoId` | `medio_pago_preferido_id` | OK-base, catálogo por empresa. |
| Día preferido de pago | `diaPagoPreferido` | `dia_pago_preferido` integer 1–31 | **P:** decidir dias 29–31 em meses curtos apenas quando houver calendário de pagamentos. |
| Plazo de entrega (días) | `plazoEntregaDias` | `plazo_entrega_dias` | OK-base não negativo; revisar unidade. |
| Descuento comercial (%) | `descuentoComercialPct` number | `descuento_comercial_pct numeric(5,2)` | **R:** UI faz `Number(...)`; padronizar decimal exato, limites/escala e contrato API. |
| Monto mínimo de compra | `montoMinimoCompra` number | `monto_minimo_compra numeric(18,2)` | **R:** precisão `Number` e moeda não indicada; usar moeda do fornecedor se aprovado. |
| Correo para pagos | `emailPagos` | `email_pagos` | OK-base. |
| Fecha inicio relación | `fechaInicioRelacion` | `fecha_inicio_relacion` | **R UX:** tela mostra `mm/dd/yyyy` de input date em navegador; padronizar experiência PY, sem corromper ISO. |
| Fecha finalización | `fechaFinRelacion` | `fecha_fin_relacion` | OK-base com ordem cronológica; formato UX a revisar. |
| Permite anticipos | `permiteAnticipos` | `permite_anticipos` | **P:** apenas preferência do cadastro ou bloqueio efetivo no módulo de pagamentos? |
| Requiere orden de compra | `requiereOrdenCompra` | `requiere_orden_compra` | **P:** semântica em compras; o cadastro não cria pedidos. |

### 3 — Homologación y logística

| Campo | Tipo/API | SQL | Auditoria |
|---|---|---|---|
| Estado de homologación | `estadoHomologacion` | `estado_homologacion` CHECK 6 status | **P:** fluxo autorizado entre status, papel aprovador e consequências operacionais. |
| Nivel de riesgo | `nivelRiesgo` | `nivel_riesgo` CHECK 5 | **P:** critério e responsabilidade de avaliação. |
| Calificación actual | `calificacionActual` number | `calificacion_actual numeric(5,2)` | **R/P:** precisão, se avaliação manual ou derivada e evidência. |
| Incoterm | `incotermCodigo` | `incoterm_codigo` FK | OK-base; condicionar relevância a compras internacionais sem ocultar desnecessariamente. |
| Fecha de homologación | `fechaHomologacion` | `fecha_homologacion` | OK-base cronologia; UX locale. |
| Vencimiento homologación | `fechaVencimientoHomologacion` | `fecha_vencimiento_homologacion` | **P:** vencimento altera estado automaticamente ou apenas alerta? |
| Transporte preferido | `metodoTransportePreferido` | `metodo_transporte_preferido` | OK-base CHECK de valores; confirmar UI/API. |
| Días para confirmar pedido | `diasConfirmacionPedido` | `dias_confirmacion_pedido` | OK-base inteiro não negativo. |
| Condición de entrega | `condicionEntrega` | `condicion_entrega` | OK-base até 500 caracteres. |
| Permite entrega parcial | `permiteEntregaParcial` | `permite_entrega_parcial` | **P:** preferência a aplicar em Ordens/Recebimento futuro. |

### 4 — Contactos

| Campo | Tipo/API | SQL | Auditoria |
|---|---|---|---|
| Nombre, apellido | `nombre`, `apellido` | `proveedor_contactos.nombre/apellido` | Nome obrigatório por contato; sobrenome opcional. |
| Cargo, departamento/área | `cargo`, `departamento` | campos homônimos | OK-base. |
| Teléfono, celular | `telefono`, `celular` | campos homônimos | **R:** reutilizar componente DDI de Clientes exige revisar DDL. |
| Correo | `email` | `email` | OK-base, validar formato. |
| Principal | `esPrincipal` | `es_principal` | **R:** no máximo um principal; confirmar enforcement/UX. |
| Recibe cotizaciones, órdenes, logística, devoluciones, pagos, calidad, notificaciones | 7 flags `recibe*` | 7 colunas `recibe_*` | **R:** screenshots não mostram essas preferências; verificar exibição por completo e mapeamento real. |

### 5 — Direcciones

| Campo | Tipo/API | SQL | Auditoria |
|---|---|---|---|
| Tipo: fiscal/comercial/retiro/pagos/otra | `tipo` | `proveedor_direcciones.tipo` | OK-base. |
| Descripción | `descripcion` | `descripcion` NOT NULL | **R:** obrigatória no servidor mas sem indicador claro na captura. |
| Dirección | `direccion` | `direccion` NOT NULL | **R:** obrigatória no servidor mas sem indicador claro na captura. |
| Nro. casa | `numeroCasa` | `numero_casa` | OK-base. |
| País | `paisCodigo` | `pais_codigo` | OK-base; internacional distinto PY. |
| Departamento, distrito, ciudad | códigos + nomes | `departamento_codigo/distrito_codigo/ciudad_codigo` e nomes | **R:** confirmar dependências e seleção contra catálogo PY, país estrangeiro como texto; reusar controles de Clientes. |
| Código postal | `codigoPostal` | `codigo_postal` | **R:** tipo existe mas não aparece na captura fornecida: confirmar UI. |
| Dirección principal | `esPrincipal` | `es_principal` | **R:** em API máximo uma por tipo; conferir UI e índice/constraint correspondente. |

### 6 — Cuentas bancarias

| Campo | Tipo/API | SQL | Auditoria |
|---|---|---|---|
| Banco | `banco` | `proveedor_cuentas_bancarias.banco` | **R:** validar banco e titular; evitar nomes livres inconsistentes quando houver catálogo. |
| Sucursal bancaria | `sucursalBanco` | `sucursal_banco` | **DEFECTO VISUAL:** label literal `sucursalBanco`, não espanhol. |
| Titular | `titular` | `titular` NOT NULL | **DEFECTO VISUAL:** label literal `titular`. |
| Documento del titular | `documentoTitular` | `documento_titular` | **DEFECTO VISUAL:** label literal `documentoTitular`. |
| Tipo de cuenta | `tipoCuenta` | `tipo_cuenta` CHECK | OK-base. |
| Número de cuenta | `numeroCuenta` | `numero_cuenta` UNIQUE por empresa+fornecedor | **R:** normalização segura, preservar zeros; não usar Number. |
| Moneda | `monedaCodigo` | `moneda_codigo` FK | OK-base, independente da moeda padrão. |
| Alias | `aliasCuenta` | `alias_cuenta` | OK-base. |
| SWIFT, IBAN | `codigoSwift`, `iban` | `codigo_swift`, `iban` | **R:** tipos e DDL existem; verificar exposição adequada a bancos internacionais. |
| Principal | `esPrincipal` | `es_principal` | **R:** max 1 no API; confirmar enforcement no SQL e UI. |
| Controle de alteração | não há workflow de dupla confirmação identificado nesta revisão | sem tabela de mudança identificada na NEX-006 | **P:** histórico de alteração bancária e acesso por permissão antes de pagamentos, sem inventar implementação. |

### 7 — Retenciones

| Campo | Tipo/API | SQL | Auditoria |
|---|---|---|---|
| Tipo (IVA/RENTA/OTRA) | `tipo` | `proveedor_retenciones.tipo` | OK-base, não confundir com validação de receptor SIFEN. |
| Impuesto | `impuestoId` | `impuesto_id` FK | **R:** campo existe em tipos/API/DDL, mas não aparece na captura; verificar visibilidade e catálogo. |
| Porcentaje | `porcentaje` number | `porcentaje numeric(5,2)` | **R:** validação decimal exata, 0–100. |
| Certificado obligatorio | `certificadoObligatorio` | `certificado_obligatorio` | **R:** está no modelo, não na captura; revisar UI e regra. |
| Vigencia desde/hasta | `fechaVigenciaDesde/Hasta` | `fecha_vigencia_desde/hasta` | **R:** exibição date `mm/dd/yyyy` e ordem cronológica. |
| Observación | `observacion` | `observacion` | **R:** tipo contém o campo, não visível na captura; conferir UI. |

### 8 — Documentos

| Campo | Tipo/API | SQL | Auditoria |
|---|---|---|---|
| Tipo | `tipo` | `proveedor_documentos.tipo` CHECK | OK-base (contrato, RUC, certificado bancário/retención, licença, outro). |
| Nombre archivo | `nombreArchivo` | `nombre_archivo` NOT NULL | **R:** nome deve vir de upload seguro, não substituir bytes por texto. |
| URL del archivo | `urlArchivo` | `url_archivo` NOT NULL | **DIVERGÊNCIA de padrão:** somente URLs; Clientes V1 usa arquivo real privado com versionamento/exclusão lógica; recomendar compartilhamento do mecanismo sem compartilhar indevidamente autorização/tabela. Exige decisão do proprietário para aplicar a política documental também aos fornecedores. |
| Fecha emisión / vencimiento | `fechaEmision/Vencimiento` | `fecha_emision/vencimiento` | OK-base cronologia, rever locale. |
| Observación | `observacion` | `observacion` | OK-base. |
| Historial, eliminación, auditoría | não há fluxo comparável identificado | NEX-006 não contém versões/eventos/exclusão lógica de fornecedores | **P:** decidir aplicar política de Clientes para arquivos do fornecedor. |

## Achados transversais (prioridade)

| ID | Severidade | Evidência / impacto | Ação proposta |
|---|---|---|---|
| PRV-01 | **CRÍTICO** | `app/api/proveedores/[id]/route.ts` executa `DELETE FROM` em tabelas filhas e chama `insertarHijos` no PUT. IDs/histórico/referências podem mudar em cada edição. | Redesenhar update diferencial por ID (inserir/atualizar/remover só itens explicitamente alterados), respeitar FK/tenant, sem assumir inexistência de dependentes. |
| PRV-02 | ALTA | Documentos têm `url_archivo NOT NULL`, enquanto Clientes já está padronizado em upload privado e histórico. | Propor política de arquivos igual à de Clientes e dados/migration específicos de fornecedor; sem herdar autorização CLIENTES. |
| PRV-03 | ALTA | `decimal()` em `lib/proveedores/shared.ts` e UI fazem `Number`; DDL inclui `numeric(18,2)` e `numeric(5,2)`. | Preservar precisão monetária como string decimal até SQL e GET, com arredondamento somente explícito. |
| PRV-04 | MÉDIA | Campos de banco `sucursalBanco`, `titular`, `documentoTitular` aparecem como identificadores técnicos. | Labels espanhol PY e campos pertinentes completos. |
| PRV-05 | MÉDIA | Cabeçalho repetido `ALTA DE PROVEEDOR`, texto e cartão de código automático. | Aplicar padrão Clientes mantendo código gerado. |
| PRV-06 | MÉDIA | Datas `input type=date` exibem `mm/dd/yyyy` no navegador nas capturas. | UX localizada, mantendo ISO na API, sem gerar data inválida. |
| PRV-07 | ALTA | Em `prepararProveedor`, RUC valida somente formato numérico e presença do DV; não há prova de comparação DV calculado. | Reutilizar validador comum RUC/DV sem importar regra de receptor SIFEN. |
| PRV-08 | MÉDIA | Contatos, endereços, bancos e retenções têm campos de tipo/API/DDL ausentes das capturas. | Auditar todos os controles e a persistência, especialmente flags e informações de pagamento. |
| PRV-09 | REGRA | Homologação é um conjunto de campos editáveis; não há fluxo aprovado de quem muda status, revisão ou bloqueio operacional. | Propor separação entre cadastro mestre e aprovação/risco; submeter política ao responsável antes de implementar gates. |
| PRV-10 | REGRA | `permiteAnticipos`, `requiereOrdenCompra`, Incoterm, parcial, lead time e retenciones são preferências. | Não prometer aplicação automática em compras/pagamentos sem implementação nesses módulos. |

## Benchmark de ERPs (referência conceitual, NÃO fonte para substituir regras da PROCEIT)

- **SAP Business One**: fornecedor como parceiro de negócios, com condições de pagamento, contas bancárias, métodos de pagamento e retenção quando aplicável. Fonte: https://help.sap.com/docs/SAP_BUSINESS_ONE_WEB_CLIENT/2554bf7e9aa347729b0547a737e123ac/432e9c2fc0f041079ee37ac239b1275d.html
- **SAP S/4HANA**: fornecedor contém camadas de dados gerais, contábeis por empresa e comerciais por organização de compras; dados bancários, moeda, pagamento e Incoterms são típicos. Fonte: https://learning.sap.com/courses/purchasing-in-sap-s-4hana/creating-business-partners
- **Odoo**: preços por fornecedor/produto alimentam RFQ e pedidos de compra. Isso é um **vínculo futuro com Productos/Compras**, não exige adicionar uma lista de preço inteira no cadastro geral nesta etapa. Fonte: https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/products/pricelist.html
- **Dynamics 365 Business Central**: grupos contábeis de fornecedores direcionam lançamentos de contas a pagar; essa dimensão requer módulo contábil e não se presume pronta em Nexit. Fonte: https://learn.microsoft.com/en-us/dynamics365/business-central/finance-posting-groups

## Questões objetivas para aprovação ANTES de codificar

1. **Documentos fornecedores:** adotar exatamente a política de Clientes (upload privado, 10 MB, formatos, exclusão lógica, histórico de versões, recuperação e auditoria) também em Proveedores?
2. **Homologação:** status HOMOLOGADO/RECHAZADO/SUSPENDIDO/VENCIDO deve bloquear criação de novos pedidos de compra, ou ficar apenas como indicador até módulo Compras? Quem pode aprovar?
3. **Banco:** alterações de conta exigem trilha de auditoria/histórico e confirmação adicional antes de serem utilizadas em pagamentos?
4. **Cadastro estrangeiro:** manter fornecedor PY apenas RUC e fornecedor estrangeiro com documentos próprios (sem obrigatoriedade SIFEN), podendo ter banco estrangeiro/SWIFT/IBAN?
5. **Prazo e datas:** padronizar dd/mm/yyyy visual; armazenar ISO; diferença entre data de início/fim de relação e data de homologação, sem automatizar bloqueios não autorizados.

## Critérios de aceitação da futura implementação

- Conferência campo por campo: visualização, obrigatório condicional, tipo TypeScript, payload POST/PUT, GET de edição, constraint SQL, catálogo/empresa, valor nulo, erro contextual e comportamento responsivo.
- Build `next build`, TypeScript, ESLint e casos locais; apenas quando permitido. Não alegar validação de PostgreSQL/VM sem execução real pelo responsável.
- Se código novo exigir migrations, arquivos versionados somente, nunca aplicados pelas IAs; sem alterar migrações já aplicadas.
- Ações de atualização de registros relacionados não devem apagar historicamente IDs ou arquivos sem escolha expressa.
- Nenhuma mudança de código é autorizada por esta matriz; aguardar autorização de implementação.
