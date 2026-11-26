# MATRIZ NORMATIVA PROPUESTA — PROVEEDORES NEXIT V1

**2026-10-11 · Avaliação ChatGPT · Para aprovação do responsável · NÃO IMPLEMENTAR AINDA**

**Código fonte lido diretamente na branch:** `types/proveedores.ts`, `lib/proveedores/shared.ts`, `app/(private)/proveedores/_components/proveedor-form.tsx`, `app/api/proveedores/route.ts`, `app/api/proveedores/[id]/route.ts`, migration `NEX-006-proveedores.sql`, `CLAUDE.md` e `documentacao/PROTOCOLO-IA.md`. Capturas do usuário: nove imagens do formulário/listagem (não versionadas no Git). **DDL base NEX-006 revisado; não afirmamos que banco operacional ou todas as migrations posteriores foram verificados.**

## Contrato de leitura

Cada campo abaixo tem ID estável, nome visual, JSON TypeScript/POST/PUT, coluna SQL (derivada explicitamente do mapeamento indicado abaixo), limite/formato, obrigação e regra recomendada. A **situação** separa regra atualmente implementada de lacuna/correção/proposta. `existente` NÃO significa testado; `aprovado` significa somente a política documental já confirmada pelo responsável. Os campos de filhos são arrays `contactos[]`, `direcciones[]`, `cuentasBancarias[]`, `retenciones[]`, `documentos[]` no payload. O `GET /api/proveedores/[id]` os devolve com mesmo nome. Todas as mutações precisam filtrar `empresa_id`, usar `PROVEEDORES` para autorização, preservar `id` e auditar o que for regulado. **Nenhum valor pode ser truncado silenciosamente.**

**Regras numéricas transversais:** porcentagens `numeric(5,2)` aceitam 0 a 100 com até duas casas; valor `numeric(18,2)` não negativo, até 16 inteiros e duas casas. Transporte em JSON como string decimal canônica; aplicar validação no servidor, não JS floating point; não arredondar dados de entrada sem política explícita. **Cuidado:** manter `numeric(18,2)` só replica DDL atual, não decide se moedas sem centavos exigirão escalas distintas em operações futuras.

**Datas:** interface espanhol PY `dd/mm/aaaa` por componente confiável e API/SQL `YYYY-MM-DD`; valores inexistentes como NULL; validar data calendárica real e pares cronológicos.

**RUC/DV:** RUC PY 3 a 8 dígitos ASCII, armazenado sem DV; DV 1 dígito calculado **módulo 11 DNIT (base 11)** a partir do RUC; `calcularDvRuc` no formulário e `validarRucDv` em POST/PUT do módulo compartilhado `lib/fiscal/calcular-dv-ruc.ts`; não importar regras do receptor SIFEN. O backend de Proveedores atual só faz regex DV — deficiência confirmada.

**Não existe aprovação sobre** fluxo de homologação/bloqueio, workflow bancário, regra de fornecedores estrangeiros e aumento de tamanho de razão social/fantasia: são propostas submetidas ao responsável, não ordens ao Claude.

## 1. Información — proveedores

| ID | Campo visual | JSON / TypeScript | Coluna SQL NEX-006 / futura | Tipo e limite | Regra e comportamento obrigatório proposto | Situação |
|---|---|---|---|---|---|---|
| PRV-01-01 | Código | `codigo` | `proveedores.codigo` | texto PRV-000001, automático, imutável | obrigatório gerado pelo trigger, único por empresa | existente |
| PRV-01-02 | Tipo de persona | `tipoPersona` | `proveedores.tipo_persona` | enum JURIDICA/FISICA | obrigatório; default JURIDICA; verificar compatibilidade documental | existente |
| PRV-01-03 | Grupo de proveedor | `grupoProveedorId` | `proveedores.grupo_proveedor_id` | UUID referência grupos_proveedor da empresa | opcional; somente grupo ativo da mesma empresa | existente |
| PRV-01-04 | Tipo de documento | `tipoDocumento` | `proveedores.tipo_documento` | texto UPPER, 1–30 | obrigatório; PRY exige RUC no DDL atual; estrangeiro aceita identificação do país, política específica pendente | existente |
| PRV-01-05 | RUC / Número documento | `numeroDocumento` | `proveedores.numero_documento` | texto 1–50 no DDL; se RUC, 3–8 dígitos ASCII | obrigatório; preservar zeros; único por empresa+tipo+número; não impor SIFEN receptor | existente |
| PRV-01-06 | DV | `dv` | `proveedores.dv` | um dígito texto 0–9 se RUC; NULL fora RUC | RUC: computar módulo 11 DNIT (base máxima 11), conferir servidor; API atual só valida regex (FALHA) | corrigir |
| PRV-01-07 | Razón social | `razonSocial` | `proveedores.razon_social` | texto 1–200 atualmente; proposta 1–255 após nova migration | obrigatório, sem truncamento; alinhar tamanho futuro a Clientes sem acoplar módulo | proposta |
| PRV-01-08 | Nombre de fantasía | `nombreFantasia` | `proveedores.nombre_fantasia` | texto opcional até 200 atualmente; proposta até 255 | NULL vazio; sem truncamento; revisar limite do servidor antes da migration | proposta |
| PRV-01-09 | País | `paisCodigo` | `proveedores.pais_codigo` | ISO alfa-3, 3 letras, FK catálogo | obrigatório; PRY default somente em novo cadastro; PY RUC; exterior documento local | existente |
| PRV-01-10 | Teléfono | `telefono` | `proveedores.telefono` | texto até 50; proposta estrutura DDI/área/nacional | opcional; preservar + e zeros; validar plano por país sem inferir DDI | proposta |
| PRV-01-11 | Correo electrónico | `email` | `proveedores.email` | texto até 150, formato email | opcional; espaços externos removidos, sem alterar endereço interno | existente |
| PRV-01-12 | Sitio web | `sitioWeb` | `proveedores.sitio_web` | URL http(s), até 300 | opcional; rejeitar esquemas não HTTP(s); renderizar link seguro | existente |
| PRV-01-13 | Activo | `activo` | `proveedores.activo` | booleano DEFAULT true | visível em criação/edição; desativar não exclui nem muda homologação automaticamente | existente |
| PRV-01-14 | Bloqueado | `bloqueado` | `proveedores.bloqueado` | booleano DEFAULT false, SQL | EXISTE NO DDL, NÃO ESTÁ em ProveedorBody/columnasProveedor; decidir UI/API e autoridade; proibir perda silenciosa | lacuna |
| PRV-01-15 | Motivo del bloqueo | `motivoBloqueo` | `proveedores.motivo_bloqueo` | texto SQL motivo_bloqueo, limite ausente no DDL inicial | EXISTE NO DDL, NÃO ESTÁ no formulário/API de gravação; sugerir motivo obrigatório ao bloquear, auditoria | lacuna |
| PRV-01-16 | Observación general | `observacion` | `proveedores.observacion` | texto 0–2000 | um campo único, opcional, persistido no registro-mestre; não repetir em todas as abas | corrigir |

## 2. Compras y pagos — proveedores

| ID | Campo visual | JSON / TypeScript | Coluna SQL NEX-006 / futura | Tipo e limite | Regra e comportamento obrigatório proposto | Situação |
|---|---|---|---|---|---|---|
| PRV-02-01 | Condición de pago | `condicionPagoId` | `proveedores.condicion_pago_id` | UUID FK condiciones_pago | opcional; somente condição ativa; padrão para futuras compras | existente |
| PRV-02-02 | Moneda predeterminada | `monedaCodigoPredeterminada` | `proveedores.moneda_codigo_predeterminada` | FK monedas.codigo (código catálogo) | opcional no DDL, UI PYG default; moeda do mínimo de compra, regra proposta | existente |
| PRV-02-03 | Medio de pago preferido | `medioPagoPreferidoId` | `proveedores.medio_pago_preferido_id` | UUID FK medios_pago da empresa | opcional; escolha ativa do tenant | existente |
| PRV-02-04 | Día preferido de pago | `diaPagoPreferido` | `proveedores.dia_pago_preferido` | inteiro 1–31 | opcional; apenas preferência; dias 29–31 não provocam geração de calendário | existente |
| PRV-02-05 | Plazo de entrega (días) | `plazoEntregaDias` | `proveedores.plazo_entrega_dias` | inteiro >=0 | opcional; dias corridos por proposta, sem SLA automático até Compras | proposta |
| PRV-02-06 | Descuento comercial (%) | `descuentoComercialPct` | `proveedores.descuento_comercial_pct` | numeric(5,2) 0.00–100.00 | default 0.00; string decimal canônica, exatamente até 2 casas; rejeitar excesso sem arredondar silenciosamente | corrigir |
| PRV-02-07 | Monto mínimo de compra | `montoMinimoCompra` | `proveedores.monto_minimo_compra` | numeric(18,2) >=0 | default 0.00; decimal como string, moeda padrão exibida, sem usar float JS | corrigir |
| PRV-02-08 | Permite anticipos | `permiteAnticipos` | `proveedores.permite_anticipos` | boolean DEFAULT false | preferência comercial; execução futura em compras/pagamentos requer regra própria | existente |
| PRV-02-09 | Requiere orden de compra | `requiereOrdenCompra` | `proveedores.requiere_orden_compra` | boolean DEFAULT false | preferência; se ativada, exigir OC em operações futuras quando módulo integrado | proposta |
| PRV-02-10 | Correo para pagos | `emailPagos` | `proveedores.email_pagos` | texto até 150 email | opcional, independente de e-mail geral | existente |
| PRV-02-11 | Fecha inicio relación | `fechaInicioRelacion` | `proveedores.fecha_inicio_relacion` | DATE ISO YYYY-MM-DD ou NULL | opcional; UI dd/mm/yyyy, servidor ISO; validar calendário | existente |
| PRV-02-12 | Fecha finalización | `fechaFinRelacion` | `proveedores.fecha_fin_relacion` | DATE ISO ou NULL | opcional; >= início quando ambos; não deletar fornecedor | existente |

## 3. Homologación y logística — proveedores

| ID | Campo visual | JSON / TypeScript | Coluna SQL NEX-006 / futura | Tipo e limite | Regra e comportamento obrigatório proposto | Situação |
|---|---|---|---|---|---|---|
| PRV-03-01 | Estado de homologación | `estadoHomologacion` | `proveedores.estado_homologacion` | PENDIENTE/EN_EVALUACION/HOMOLOGADO/RECHAZADO/SUSPENDIDO/VENCIDO | default PENDIENTE; mudança deve ser autorizada e auditada; gate de compras sujeito a aprovação | proposta |
| PRV-03-02 | Fecha homologación | `fechaHomologacion` | `proveedores.fecha_homologacion` | DATE ISO ou NULL | opcional atualmente; proposta exigir data na aprovação, preenchida no servidor | proposta |
| PRV-03-03 | Vencimiento homologación | `fechaVencimientoHomologacion` | `proveedores.fecha_vencimiento_homologacion` | DATE ISO ou NULL | se informado >= homologação; alerta/vencimento automático exige decisão | proposta |
| PRV-03-04 | Nivel de riesgo | `nivelRiesgo` | `proveedores.nivel_riesgo` | NO_EVALUADO/BAJO/MEDIO/ALTO/CRITICO | default NO_EVALUADO; registrar justificativa/avaliador ao mudar | proposta |
| PRV-03-05 | Calificación actual | `calificacionActual` | `proveedores.calificacion_actual` | numeric(5,2) entre 0 e 100, nullable | percentual/nota, formato decimal 2 casas, origem manual ou automática pendente | proposta |
| PRV-03-06 | Incoterm | `incotermCodigo` | `proveedores.incoterm_codigo` | código FK incoterms | opcional; catálogo válido, adequar ao comércio exterior | existente |
| PRV-03-07 | Condición de entrega | `condicionEntrega` | `proveedores.condicion_entrega` | texto até 500 | opcional; instruções específicas, não confundir com Incoterm | existente |
| PRV-03-08 | Transporte preferido | `metodoTransportePreferido` | `proveedores.metodo_transporte_preferido` | TERRESTRE/MARITIMO/AEREO/FERROVIARIO/MULTIMODAL/OTRO ou NULL | opcional; valores restringidos por CHECK | existente |
| PRV-03-09 | Días para confirmar pedido | `diasConfirmacionPedido` | `proveedores.dias_confirmacion_pedido` | inteiro >=0 ou NULL | opcional, prazo preferido, não automatizar SLA nesta aba | existente |
| PRV-03-10 | Permite entrega parcial | `permiteEntregaParcial` | `proveedores.permite_entrega_parcial` | boolean DEFAULT true | preferência para compras/recebimentos futuros | existente |

## 4. Contactos — proveedor_contactos

| ID | Campo visual | JSON / TypeScript | Coluna SQL NEX-006 / futura | Tipo e limite | Regra e comportamento obrigatório proposto | Situação |
|---|---|---|---|---|---|---|
| PRV-04-01 | Nome | `nombre` | `proveedor_contactos.nombre` | texto 1–100 | obrigatório somente se contato criado | existente |
| PRV-04-02 | Apellido | `apellido` | `proveedor_contactos.apellido` | texto até 100 | opcional | existente |
| PRV-04-03 | Cargo | `cargo` | `proveedor_contactos.cargo` | texto até 100 | opcional | existente |
| PRV-04-04 | Departamento / área | `departamento` | `proveedor_contactos.departamento` | texto até 100 | opcional | existente |
| PRV-04-05 | Teléfono | `telefono` | `proveedor_contactos.telefono` | texto até 50; proposta DDI | opcional; preservar prefixos/zeros | proposta |
| PRV-04-06 | Celular | `celular` | `proveedor_contactos.celular` | texto até 50; proposta DDI | opcional | proposta |
| PRV-04-07 | Correo | `email` | `proveedor_contactos.email` | texto até 150 email | opcional, validação servidor | existente |
| PRV-04-08 | Principal | `esPrincipal` | `proveedor_contactos.es_principal` | boolean DEFAULT false | máximo 1 contato principal por fornecedor; opcional ter principal | existente |
| PRV-04-09 | Recibe cotizaciones | `recibeCotizaciones` | `proveedor_contactos.recibe_cotizaciones` | boolean DEFAULT false | preferência de destinatário, não aciona comunicação automaticamente | existente |
| PRV-04-10 | Recibe órdenes de compra | `recibeOrdenesCompra` | `proveedor_contactos.recibe_ordenes_compra` | boolean DEFAULT false | preferência de destinatário | existente |
| PRV-04-11 | Recibe logística | `recibeLogistica` | `proveedor_contactos.recibe_logistica` | boolean DEFAULT false | preferência de destinatário | existente |
| PRV-04-12 | Recibe devoluciones | `recibeDevoluciones` | `proveedor_contactos.recibe_devoluciones` | boolean DEFAULT false | preferência de destinatário | existente |
| PRV-04-13 | Recibe pagos | `recibePagos` | `proveedor_contactos.recibe_pagos` | boolean DEFAULT false | preferência de destinatário | existente |
| PRV-04-14 | Recibe calidad | `recibeCalidad` | `proveedor_contactos.recibe_calidad` | boolean DEFAULT false | preferência de destinatário | existente |
| PRV-04-15 | Recibe notificaciones | `recibeNotificaciones` | `proveedor_contactos.recibe_notificaciones` | boolean DEFAULT true | preferência de destinatário | existente |

## 5. Direcciones — proveedor_direcciones

| ID | Campo visual | JSON / TypeScript | Coluna SQL NEX-006 / futura | Tipo e limite | Regra e comportamento obrigatório proposto | Situação |
|---|---|---|---|---|---|---|
| PRV-05-01 | Tipo | `tipo` | `proveedor_direcciones.tipo` | FISCAL/COMERCIAL/RETIRO/PAGOS/OTRA | obrigatório para linha criada | existente |
| PRV-05-02 | Descripción | `descripcion` | `proveedor_direcciones.descripcion` | texto 1–150 | obrigatório quando há endereço; exibir * na UI | corrigir |
| PRV-05-03 | Dirección | `direccion` | `proveedor_direcciones.direccion` | texto 1–300 | obrigatório na linha | corrigir |
| PRV-05-04 | Nro. casa | `numeroCasa` | `proveedor_direcciones.numero_casa` | texto até 20 | opcional; não converter para número | existente |
| PRV-05-05 | País | `paisCodigo` | `proveedor_direcciones.pais_codigo` | ISO alfa-3, obrigatório | referência país válido; default do fornecedor, editável | existente |
| PRV-05-06 | Departamento código | `departamentoCodigo` | `proveedor_direcciones.departamento_codigo` | inteiro >0, Paraguai | se PRY selecionar por catálogo oficial | existente |
| PRV-05-07 | Distrito código | `distritoCodigo` | `proveedor_direcciones.distrito_codigo` | inteiro >0, Paraguai | depende de departamento válido | existente |
| PRV-05-08 | Ciudad código | `ciudadCodigo` | `proveedor_direcciones.ciudad_codigo` | inteiro >0, Paraguai | depende de distrito válido | existente |
| PRV-05-09 | Departamento/estado texto | `departamento` | `proveedor_direcciones.departamento` | texto até 150 | fora PY aceitar texto; PY códigos oficiais | existente |
| PRV-05-10 | Distrito/región texto | `distrito` | `proveedor_direcciones.distrito` | texto até 150 | fora PY aceitar texto; PY códigos oficiais | existente |
| PRV-05-11 | Ciudad texto | `ciudad` | `proveedor_direcciones.ciudad` | texto até 150 | fora PY aceitar texto; PY códigos oficiais | existente |
| PRV-05-12 | Código postal | `codigoPostal` | `proveedor_direcciones.codigo_postal` | texto até 30 | opcional; preservar letras e zeros | existente |
| PRV-05-13 | Principal por tipo | `esPrincipal` | `proveedor_direcciones.es_principal` | boolean DEFAULT false | no máximo uma principal por TIPO no mesmo fornecedor; permitir fiscal e retiro distintos | existente |

## 6. Cuentas bancarias — proveedor_cuentas_bancarias

| ID | Campo visual | JSON / TypeScript | Coluna SQL NEX-006 / futura | Tipo e limite | Regra e comportamento obrigatório proposto | Situação |
|---|---|---|---|---|---|---|
| PRV-06-01 | Banco | `banco` | `proveedor_cuentas_bancarias.banco` | texto 1–150 | obrigatório em conta criada | existente |
| PRV-06-02 | Sucursal bancaria | `sucursalBanco` | `proveedor_cuentas_bancarias.sucursal_banco` | texto até 150 | opcional; label legível, não camelCase | corrigir |
| PRV-06-03 | Titular | `titular` | `proveedor_cuentas_bancarias.titular` | texto 1–200 | obrigatório; auditar alteração | existente |
| PRV-06-04 | Documento del titular | `documentoTitular` | `proveedor_cuentas_bancarias.documento_titular` | texto até 100 | opcional, sem truncar | corrigir |
| PRV-06-05 | Tipo de cuenta | `tipoCuenta` | `proveedor_cuentas_bancarias.tipo_cuenta` | CORRIENTE/AHORRO/CAJA_AHORRO/OTRA | obrigatório, default CORRIENTE | existente |
| PRV-06-06 | Número de cuenta | `numeroCuenta` | `proveedor_cuentas_bancarias.numero_cuenta` | texto 1–100, UNIQUE empresa+fornecedor+conta | obrigatório; preservar zeros e pontuação permitida por banco; auditar | corrigir |
| PRV-06-07 | Moneda | `monedaCodigo` | `proveedor_cuentas_bancarias.moneda_codigo` | FK monedas.codigo | obrigatória para conta; catálogo ativo | existente |
| PRV-06-08 | Alias de cuenta | `aliasCuenta` | `proveedor_cuentas_bancarias.alias_cuenta` | texto até 100 | opcional | existente |
| PRV-06-09 | SWIFT/BIC | `codigoSwift` | `proveedor_cuentas_bancarias.codigo_swift` | texto até 30 no DDL | opcional, validação formato internacional se informado (8 ou 11 chars, decisão técnica proposta) | proposta |
| PRV-06-10 | IBAN | `iban` | `proveedor_cuentas_bancarias.iban` | texto até 50 no DDL | opcional, país + checksum módulo 97 se aplicável, sem obrigação geral | proposta |
| PRV-06-11 | Principal | `esPrincipal` | `proveedor_cuentas_bancarias.es_principal` | boolean DEFAULT false | máximo 1 no cadastro atual; proposta 1 principal por moeda APÓS alteração de regra | decidir |
| PRV-06-12 | Aprobación bancaria | `(novo)` | `proveedor_cuentas_bancarias.A CRIAR / adaptar` | campo/workflow não existe no DDL NEX-006 | proposta de estado e histórico por alteração; sujeito a aprovação comercial | decidir |

## 7. Retenciones — proveedor_retenciones

| ID | Campo visual | JSON / TypeScript | Coluna SQL NEX-006 / futura | Tipo e limite | Regra e comportamento obrigatório proposto | Situação |
|---|---|---|---|---|---|---|
| PRV-07-01 | Tipo | `tipo` | `proveedor_retenciones.tipo` | IVA/RENTA/OTRA | obrigatório quando linha criada; cadastro não calcula retenção | existente |
| PRV-07-02 | Impuesto | `impuestoId` | `proveedor_retenciones.impuesto_id` | UUID FK impuestos | opcional no DDL; mostrar seletor e validar imposto | corrigir |
| PRV-07-03 | Porcentaje | `porcentaje` | `proveedor_retenciones.porcentaje` | numeric(5,2) 0.00–100.00 | obrigatório por linha; decimal exato, não Number | corrigir |
| PRV-07-04 | Certificado obligatorio | `certificadoObligatorio` | `proveedor_retenciones.certificado_obligatorio` | boolean DEFAULT false | preferência/controle de documentação, não calcular impostos | existente |
| PRV-07-05 | Vigencia desde | `fechaVigenciaDesde` | `proveedor_retenciones.fecha_vigencia_desde` | DATE ISO nullable | opcional; <= fim se ambos | existente |
| PRV-07-06 | Vigencia hasta | `fechaVigenciaHasta` | `proveedor_retenciones.fecha_vigencia_hasta` | DATE ISO nullable | opcional; >= início se ambos | existente |
| PRV-07-07 | Observación | `observacion` | `proveedor_retenciones.observacion` | texto até 1000 | opcional | existente |

## 8. Documentos — proveedor_documentos

| ID | Campo visual | JSON / TypeScript | Coluna SQL NEX-006 / futura | Tipo e limite | Regra e comportamento obrigatório proposto | Situação |
|---|---|---|---|---|---|---|
| PRV-08-01 | Tipo de documento | `tipo` | `proveedor_documentos.tipo` | CONTRATO/CONSTANCIA_RUC/CERTIFICADO_BANCARIO/CERTIFICADO_RETENCION/LICENCIA/OTRO | obrigatório na inclusão; opções do DDL | existente |
| PRV-08-02 | Archivo privado | `archivo (novo) / urlArchivo (legado)` | `proveedor_documentos.A CRIAR / adaptar` | PDF/JPG/JPEG/PNG/DOCX/XLSX, máximo 10485760 bytes | APROVADO: upload autent., isolamento empresa+fornecedor, não URL pública | aprovado |
| PRV-08-03 | Nombre archivo | `nombreArchivo` | `proveedor_documentos.nombre_archivo` | texto até 255; obtido do arquivo validado | obrigatório no registro; não usar texto manual como substituto do upload | aprovado |
| PRV-08-04 | Fecha emisión | `fechaEmision` | `proveedor_documentos.fecha_emision` | DATE ISO nullable | opcional; validar data e <= vencimento | existente |
| PRV-08-05 | Fecha vencimiento | `fechaVencimiento` | `proveedor_documentos.fecha_vencimiento` | DATE ISO nullable | opcional; >= emissão | existente |
| PRV-08-06 | Observación | `observacion` | `proveedor_documentos.observacion` | texto até 1000 | opcional | existente |
| PRV-08-07 | Versión vigente | `(novo)` | `proveedor_documentos.A CRIAR / adaptar` | inteiro >=1 para arquivo versionado | APROVADO: troca cria versão; versão anterior recuperável, sem deletar bytes | aprovado |
| PRV-08-08 | Exclusión lógica | `(novo)` | `proveedor_documentos.A CRIAR / adaptar` | timestamp + usuário, NULL = ativo | APROVADO: ocultar e permitir restauração, nunca borrar físico | aprovado |
| PRV-08-09 | Auditoría | `(novo)` | `proveedor_documentos.A CRIAR / adaptar` | evento + usuário + timestamp + detalhe | APROVADO: upload, alteração, substituição, exclusão, restauração, recuperação | aprovado |

## Fluxo funcional e problemas comprovados no código atual

1. **POST /api/proveedores**: `PROVEEDORES.CREAR`, autenticação, `prepararProveedor`, `validarReferencias`, INSERT mestre + `insertarHijos` em transação. `codigo` PRV de trigger. Falhas retornam respostaErro. Conferir se catálogo por empresa e lista de fornecedores seguem mesmo escopo.
2. **GET /api/proveedores/[id]**: devolve dados do mestre e cinco listas filhas. Porcentagens são expostas em algumas consultas via `::float8` — perde precisão textual e deve ser corrigido na padronização decimal; não presumir que frontend conhece IDs persistentes quando salva.
3. **PUT /api/proveedores/[id]**: `PROVEEDORES.EDITAR` e UPDATE mestre filtrado por empresa, mas **DELETE de todas as cinco tabelas filhas seguido de INSERT completo**; deve ser substituído por atualização diferencial transacional baseada no ID real e autorização, preservando vínculos e versões. Defeito crítico PRV-01 confirmado; jamais usar essa estratégia com documento versionado.
4. **Campos do banco ausentes no formulário**: `proveedores.bloqueado` e `motivo_bloqueo` constam de NEX-006, mas não de `ProveedorBody`/colunas do UPDATE. Não inventar seu estado nem apagar valores; especificar acesso/fluxo e UI.
5. **Contatos**: sete flags de destinatários mapeadas no INSERT e GET; conferir exposição e edição no formulário; no máximo um contato principal no validador, não encontrou constraint agregada explícita em NEX-006.
6. **Direcciones**: geografia PY usa `resolverUbicacionParaguay`, catálogos dependentes; endereços internacionais aceitam nomes textuais. Não impor requisitos de SIFEN do cliente.
7. **Bancos**: `numero_cuenta` é único por empresa+fornecedor; atualização atual perde IDs; `sucursalBanco`, `documentoTitular` e `titular` aparecem como labels técnicos no formulário. Trilha e autorização específicas precisam ser definidas.
8. **Retenciones**: `impuesto_id`, `certificado_obligatorio` e observação estão em tipos/API/SQL; checar apresentação de todos no UX. Nenhum cálculo automático fiscal em cadastro.
9. **Documentos**: `url_archivo NOT NULL` no legado contraria upload real já aprovado; novas migrations específicas devem preservar registros antigos, usar storage privado compartilhado com permissões `PROVEEDORES`, exclusão lógica, versão e auditoria. Não acoplar à tabela Clientes.
10. **Precisão**: API usa `Number` para `descuento_comercial_pct`, `monto_minimo_compra`, `calificacion_actual`, `porcentaje`; GET retorna alguns `::float8`. Defeito PRV-03 confirmado; resolver de ponta a ponta.
11. **UI**: aplicar design-system Clientes integralmente (sem cabeçalhos duplicados, campo de código sem aviso redundante, label compacto, abas, seleção, erro por campo, estados vazios, responsividade, footer); manter oito abas e todos os dados, não encurtar escopo.

## Ciclo de vida dos filhos (regra integral proposta)

Para cada linha, ID UUID estável gerado pelo banco. Em GET, retornar IDs persistidos; na edição, linhas existentes com ID devem sofrer UPDATE pontual; ID novo sofre INSERT; remoção explícita demanda validação de referências, retenção e auditoria, nunca inferir remoção só porque campo ficou fora do payload; impedir alteração de `empresa_id`/`proveedor_id` entre tenants. Banco e documentos exigem histórico preservado. PUT parcial e substituição total precisam de contratos separados e claros. Operações devem ser atômicas no DB; armazenamento de arquivo privado requer limpeza apenas de uploads **não registrados**, sem apagar versões registradas.

## Matriz de rastreabilidade de teste a preparar (Claude, após autorização)

Para **cada um dos 94 campos**, validar: UI create/edit, estado inicial, entrada de limite máximo/mínimo, NULL/vazio, enum/formato, validação server, mapeamento TS JSON, INSERT/SELECT/UPDATE e preservação multiempresa; comparar com constraints SQL posteriores; testar IDs filhos, não exclusão acidental, permissões por ação, banco e documentos, migração aditiva e legado. **Testes não executados nesta auditoria**; nenhum banco/VM tocado.

## Pendências comerciais com proposta objetiva

- **Homologação:** sugestão só fornecedor `activo=true`, `bloqueado=false` e `HOMOLOGADO` pode receber NOVAS ordens. Responsável autorizado aprova com auditoria; efeitos apenas quando Compras adotar gate. Exige aprovação.
- **Conta bancária:** sugestão alteração/nova conta pendente de aprovação para pagamento, histórico completo; principal por moeda, não principal único global. Exige aprovação e mudanças no DDL.
- **Exterior:** sugestão documento fiscal do país de origem, sem RUC PRY obrigatório, com SWIFT/IBAN opcionais quando cabíveis; país PRY continua RUC. Exige aprovação.
- **Razón social/fantasía:** sugestão 255 chars, nova migration, mantendo entrada antiga de 200 até implantação; não alterar NEX-006. Exige aprovação.
- **Bloqueado/motivo:** sugestão bloquear somente com justificativa obrigatória e usuário/data/hora auditados, distinguindo `activo` e status de homologação. Exige aprovação.

**Estado geral:** PROPOSTA DETALHADA.  **Nenhum arquivo de código/SQL, migration, banco, Docker ou VM alterado.** O proprietário valida política, depois Claude implementa. Não chamar cobertura funcional 100% ou homologação sem testes reais.


---

# ADENDA NORMATIVA APROVADA PELO RESPONSÁVEL — 2026-10-11

**Status: DEZ DECISÕES DE NEGÓCIO APROVADAS; documentação apenas.** Esta adenda **substitui** as expressões “pendente”, “sugestão”, “proposta” e “exige aprovação” **somente** quando se referem às dez decisões numeradas abaixo, inclusive na seção “Pendências comerciais” anterior. Os demais detalhes técnicos que não sejam implicação necessária das decisões permanecem como especificação proposta, sujeitos a revisão técnica e aprovação onde relevante. **Não há autorização para Claude implementar, alterar código, criar/editar/aplicar migration ou SQL, acessar VM, Docker, nem implantar.** A matriz-base continua sendo referência dos 94 itens; a coluna “situação” descreve implementação antiga, não revoga esta adenda.

## Política aprovada, critérios objetivos e impacto campo a campo

| Decisão | Regra vigente e critério verificável | Campos da matriz / impacto | Contrato de operação para futura implementação |
|---|---|---|---|
| **DEC-PRV-01** | **Somente fornecedor ATIVO, NÃO BLOQUEADO, HOMOLOGADO e cuja homologação NÃO ESTEJA VENCIDA pode receber NOVAS ordens de compra.** Demais status não habilitam nova OC. | PRV-01-013 `activo`; PRV-01-014 `bloqueado`; PRV-03-001 `estadoHomologacion`; PRV-03-003 `fechaVencimientoHomologacion`. | A avaliação **deve ocorrer no backend na confirmação/criação operacional de OC**, nunca apenas no botão. Não cancelar pedidos anteriores, obrigações ou históricos. Cadastro não deve alegar que bloqueio operacional já existe em Compras. |
| **DEC-PRV-02** | Aprovar, rejeitar, suspender, renovar homologação exige **permissão específica** atribuível a perfis autorizados, distinta de edição geral de Proveedores. | PRV-03-001 e datas homologação; autorização `PROVEEDORES.HOMOLOGAR` como **identificador proposto para o futuro contrato RBAC** (confrontar nomenclatura real antes de implementar). | Edição cadastral comum não concede homologação. Registrar usuário, horário, decisão, justificativa e valores anterior/novo. Ações no servidor, por empresa; negar sem permissão. |
| **DEC-PRV-03** | A homologação vencida torna o fornecedor **operacionalmente inelegível** para novas OCs e exige **renovação autorizada**. | PRV-03-001/002/003; status efetivo pode ser derivado de data vigente sem mudar silenciosamente o status armazenado. | Se existe `fechaVencimientoHomologacion`, ela é válida até o final do dia local da empresa; no dia seguinte torna-se vencida. Critério técnico de data local proposto; não executar cron silencioso sem regra. Renovação com auditoria. |
| **DEC-PRV-04** | Conta bancária **nova ou alterada** precisa de aprovação específica **antes de ser elegível para pagamentos**, com auditoria. | PRV-06-001…012 e PRV-06-013; novo estado/fluxo bancário e histórico. | Distinguir rascunho/pendente/aprovada/rejeitada, congelar snapshot aprovado; qualquer mudança em banco, agência, titular, documento, tipo, número, moeda, alias, SWIFT ou IBAN torna a versão alterada **pendente**. Para evitar pagamentos indevidos, a conta aprovada anterior não deve ser trocada silenciosamente; definir token/versão aprovada. Não apagar auditoria, IDs nem dados antigos. Permissão específica de aprovação bancária, distinta de edição, será nomeada no contrato RBAC. |
| **DEC-PRV-05** | Fornecedor **estrangeiro** pode usar documento fiscal do país de origem, **sem RUC paraguaio obrigatório**, e contas internacionais (SWIFT/IBAN quando aplicável). | PRV-01-004/005/006/009; PRV-06-010/011. | Para `paisCodigo=PRY`, regras correntes de RUC e DV módulo 11. Fora de PRY, tipo e identificador fiscal local, DV PY não exigido nem preenchido automaticamente; não usar matriz SIFEN receptor. Catálogo de tipos por país e regras específicas precisam ser checados, sem inventar validação universal de identificadores estrangeiros. |
| **DEC-PRV-06** | Bloqueio administrativo requer **motivo obrigatório e auditoria**; impede novas compras, **preservando histórico e obrigações já existentes**. | PRV-01-014 `bloqueado`, PRV-01-015 `motivoBloqueo`; novo log de auditoria. | Só usuário autorizado pode bloquear/desbloquear; armazenar justificativa, anterior/novo, autor e horário; `activo` e `estadoHomologacion` não são substitutos de `bloqueado`. **Não bloquear pagamentos de obrigações prévias apenas por esse motivo.** |
| **DEC-PRV-07** | Permitir **uma conta principal POR MOEDA** do fornecedor, em bancos diferentes. | PRV-06-007 moeda, PRV-06-012 principal. | Não pode haver duas contas principais **aprovadas e habilitadas para pagamento** na mesma moeda; conta pendente não substitui principal aprovada. Exige ajustar regra API que hoje limita uma principal GLOBAL e projetar constraint parcial consistente. |
| **DEC-PRV-08** | Cadastrar retenção com imposto/tipo, percentual, vigência e certificado; **retenção que exija certificado só pode ser ativada com documento válido**. | PRV-07-001…007; PRV-08-001…009; vínculo entre regra e documento. | Validar datas, percentual exato e vínculo de certificado vigente no servidor ao ativar; ausência/vencimento impede ativação, sem eliminar cadastro. **O cadastro não calcula nem executa retenção**, competência posterior da rotina tributária/pagamentos. Tipo de imposto e legalidade dependem da configuração fiscal aplicável, não SIFEN de receptor. |
| **DEC-PRV-09** | Parâmetros comerciais são **padrões e restrições** em Compras: condições de pagamento, moeda, desconto, pedido obrigatório, antecipos e mínimo; **exceções só com permissão específica**. | PRV-02-001…012 (especialmente 001/002/006/007/008/009). | Na criação/confirm. de OC ou adiantamento, carregar defaults; impedimento ou desvio de política valida no servidor; exceção explícita, justificada e auditada por autorização RBAC. Sem fingir que comportamento já foi integrado aos módulos de compras/pagamentos. |
| **DEC-PRV-10** | Risco `nivelRiesgo` e nota `calificacionActual` são **avaliação MANUAL por usuário autorizado**, com justificativa e auditoria. | PRV-03-004/005; avaliação e autor/data/justificativa em novo histórico. | Edição ordinária do cadastro não permite reclassificar; cada transição registra estado/nota anterior, novo, justificativa, usuário e data. Preservar `NO_EVALUADO` / nota NULL até avaliação. |

### Regras técnicas autossuficientes já definidas na matriz que permanecem como propostas para aprovação do pacote normativo

- RUC PY **3–8 caracteres ASCII 0–9**, número sem DV; DV calculado no **módulo 11 DNIT de base máxima 11**, recalculado na API; manter zeros à esquerda e não usar tipo numérico; duplicidade documental por empresa/tipo/número.
- `codigo` PRV automático e imutável por empresa, reservado com geração transacional.
- `razonSocial` e `nombreFantasia`: **proposta técnica de até 255** cada, exigindo migration incremental; até ela, NEX-006 permite 200. Não afirmar que já suporta 255.
- Valores `numeric(18,2)` e `numeric(5,2)` transportados como **string decimal canônica**, validados no backend sem JS Number para dinheiro/percentuais; input com escala acima da permitida deve ser rejeitado sem arredondamento silencioso.
- Datas apresentadas em espanhol PY, persistidas `DATE` ISO; campos não informados NULL; regras de prazo e preferência sem supor execução de cron.
- **Documentos já aprovados previamente**: upload real privado, PDF/JPG/PNG/DOCX/XLSX até 10 MiB, versões recuperáveis, exclusão lógica, restauração, auditoria; isolamento por empresa/provedor e permissão PROVEEDORES, nunca CLIENTES.
- Edição dos cinco conjuntos filhos **NÃO pode usar DELETE ALL + INSERT**: preservar IDs, vinculação e histórico; mudar somente linhas explicitamente alteradas sob transação/controle de concorrência.
- As oito abas usam o padrão visual Clientes, mas **nenhuma obrigatoriedade do receptor SIFEN pode ser transferida ao cadastro de fornecedor**.

### Necessidades de projeto identificadas (não representam migrations autorizadas)

1. Entidades/auditorias aditivas para decisão de homologação, avaliação de risco, bloqueio, alterações bancárias/aprovação, documentos versionados e certificação de retenções.
2. Permissões específicas de homologar, aprovar contas, avaliar risco, bloquear e excepcionalizar política; compatibilizar com mecanismo de perfis e autorização vigente antes de definir IDs finais.
3. API específica para transições auditadas, protegida contra tentativas de contornar pelo PUT comum; API e UI separadas para versão bancária em aprovação.
4. Migrations incrementais sem editar NEX-006 original, com garantia de compatibilidade/legado e preservação de histórico; não presumir aplicação real de migrations anteriores.
5. Integrações futuras com Compras/Pagamentos: **documentar contratos de validação e bloqueio**, mas não modificar outros módulos sem autorização de escopo.
6. Testes de aceite por campo da matriz e por decisão DEC-PRV-01 a 10, incluindo fronteiras de empresa, papel, data de vencimento, concorrência e reversões seguras.

**ESTADO DA ADENDA:** decisões do responsável aprovadas e registradas. **O desenvolvimento NÃO está autorizado.** Nenhuma migration, SQL, Docker, volume ou VM executado.
