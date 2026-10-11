# REGRA OFICIAL — Cadastro de Clientes Nexit V1
**Estado:** ESPECIFICAÇÃO FUNCIONAL PARA IMPLEMENTAÇÃO; NÃO HOMOLOGADA. **Responsável pela análise:** ChatGPT/PROCEIT. **Desenvolvedor:** Claude Code. **Branch:** `feature/NEXIT-2026-001-banco-demo`.
**Fontes de controle:** CLAUDE.md; documentacao/PROTOCOLO-IA.md; PROGRESSO-NEXIT-V1.md; matriz normativa SIFEN MT150 + NTs originais arquivadas; decisões de Clientes (B2F, Innominado, DV, limites); E1/E2; NEX-005 e migrations posteriores. **Regra:** nunca confundir o texto da tela com os códigos fiscais e com os valores persistidos. Os dados D3 usados na emissão devem ser válidos desde o cadastro conforme condições normativas. Emissão XML/integração efetiva continua fora da V1. As regras internas de ERP não são exigências da SIFEN.

## Contrato técnico obrigatório
Para cada linha: **T** texto ES-PY exibido na tela; **API** chave JSON atual; **DB** coluna e tipo de NEX-005 (confirmar migrations posteriores); **F** campo SIFEN e mapeamento/condição, ou **ERP** regra interna. Atualizar todos os fluxos de criar/editar/consultar, incluindo catálogos, coleções, errors e componentes, mantendo a única fonte de conversão e validação no backend. O backend deve rejeitar valor inválido sem corte silencioso; campos opcionais sem valor seguem NULL/default real. Os códigos D3 indicam o valor do futuro XML, não exigem criar emissor V2 nesta tarefa. Usar `empresa_id` da sessão e FKs compostas.

## A. Información fiscal — campos mestres
| T / API | DB (NEX-005) | F: SIFEN / regra obrigatória |
|---|---|---|
| Naturaleza / naturaleza | naturaleza_receptor SMALLINT NOT NULL | D201: tela Contribuyente/No contribuyente; API CONTRIBUYENTE/NO_CONTRIBUYENTE; DB e SIFEN **1/2** respectivamente; CHECK 1,2. |
| Tipo de persona / tipoPersona | tipo_persona TEXT NOT NULL; tipo_contribuyente_sifen SMALLINT NOT NULL | D205: tela Física/Jurídica; API FISICA/JURIDICA; DB código 1/2 e tipo texto. D205 só transmitido quando D201=1. Para não contribuinte manter seleção explícita e modelo ERP já aprovado, sem inferir XML. |
| Tipo de operación / tipoOperacion | tipo_operacion SMALLINT NOT NULL | D202: tela B2B/B2C/B2G/B2F; API mesmos enums; DB/SIFEN 1/2/3/4. Contribuinte B2B/B2C/B2G; não contribuinte B2C/B2F; B2F implica não contribuinte, país exterior. OEE/B2G não inferir pelo nome. |
| País / paisCodigo | pais_codigo TEXT NOT NULL; pais_nombre nome derivado do catálogo | D203/D204: código PRY fora B2F e país não PRY em B2F, descrição de país do catálogo válido, não digitada. |
| RUC / numeroDocumento se contribuinte | numero_documento VARCHAR(30) NOT NULL, tipo_documento='RUC' | D206: 3–8 dígitos ASCII, sem DV; validar UI+API; manter string, zeros iniciais. |
| DV / dv | dv VARCHAR(5) | D207: 1 dígito, módulo 11 DNIT; somente leitura calculado e reconferido API. |
| Tipo de documento / tipoDocumento | tipo_documento VARCHAR(30); tipo_documento_identidad_sifen SMALLINT | D208: CEDULA_PARAGUAYA→1; PASAPORTE→2; CEDULA_EXTRANJERA→3; CARNET_RESIDENCIA→4; INNOMINADO→5; TARJETA_DIPLOMATICA→6; OTRO→9. Apenas não contribuinte, cadastro B2F também exige documento por regra ERP. |
| Descripción del documento / descripcionDocumentoIdentidad | descripcion_documento_identidad VARCHAR(100) | D209: se OTRO obrigatória, 9–41 caracteres; fora OTRO nulo. |
| Número de documento / numeroDocumento se não contribuinte | numero_documento VARCHAR(30) | D210: 1–20 caracteres; obrigatório no ERP inclusive B2F. Innominado '0' e nome 'Sin Nombre', somente B2C e **único por empresa inclusive em concorrência via constraint**. D208/D210 no XML B2F: conciliar NT002×NT023, não inventar emissão. |
| Nombre o razón social / razonSocial | razon_social VARCHAR(200) **A ALTERAR** | D211: obrigatório 4–255; nome Innominado 'Sin Nombre'. NEX-022 incremental para VARCHAR(255), UI/API 255. |
| Nombre de fantasía / nombreFantasia | nombre_fantasia VARCHAR(200) **A ALTERAR** | D212: opcional, 4–255 se preenchido. NEX-022 VARCHAR(255). |
| Correo electrónico / email | email VARCHAR(150) | D216: opcional, 3–80 se preenchido, sintaxe válida; entrada/API não truncam. |
| Correo en copia / emailCopia | email_copia VARCHAR(150) | ERP: opcional e-mail válido, finalidade cópia; não é D216. |
| Teléfono / telefono | telefono VARCHAR(30) | D214: opcional 6–15 se preenchido; regra de prefixo PRY da NT quando aplicável. |
| Celular / celular | celular VARCHAR(30) | D215: opcional 10–20 se preenchido; regra de prefixo PRY quando aplicável. |
| Código cliente (somente leitura) | codigo VARCHAR(50), trigger clientes_asignar_codigo | D217: gerado CLI-NNNNNN, comprimento oficial 3–15; único por empresa, nunca fornecido manualmente no POST. |

## B. Comercial y crédito — exclusivamente ERP
| T / API | DB | Regra obrigatória do Nexit |
|---|---|---|
| Grupo de cliente / grupoClienteId | grupo_cliente_id UUID | Opcional; catálogo `grupos_cliente` ativo da mesma empresa; persistir ID e FK (empresa,id). |
| Condición de pago / condicionPagoId | condicion_pago_id UUID | Opcional; FK catálogo `condiciones_pago`; não inventar prazo nem prometer aplicação em módulo de vendas não desenvolvido. |
| Moneda predeterminada / monedaCodigoPredeterminada | moneda_codigo_predeterminada TEXT | Código da moeda válida `monedas.codigo`, default UI PYG; não gravar descrição. D-10: moeda dos limites e listas não decidida. |
| Lista de precios / listaPrecioId | lista_precio_id UUID | Opcional; catálogo da mesma empresa, validar ID. Não inventar vigência/compatibilidade sem regra aprovada. |
| Límite de crédito / limiteCredito | limite_credito NUMERIC(18,4) NOT NULL DEFAULT 0 | Valor >=0, até precisão DB. Rótulo Gs. só se regra monetária de limites for Gs. confirmada. D-10 semântica de zero/limite em outras moedas pendente; não implementar bloqueio não aprovado. |
| Descuento comercial (%) / descuentoComercialPct | descuento_comercial_pct NUMERIC(5,2) DEFAULT 0 | 0–100, preservar precisão. |
| Límite temporal / limiteCreditoTemporal | limite_credito_temporal NUMERIC(18,4) | Opcional >=0; vencimento coerente; regra acumular/substituir D-10 pendente. |
| Vencimiento del crédito / fechaVencimientoCredito | fecha_vencimiento_credito DATE | Data calendário válida DD/MM/YYYY na tela → DATE DB; existente CHECK se data então limite temporário não NULL. |
| Día preferido de cobro / diaPreferidoCobro | dia_preferido_cobro SMALLINT | Opcional, inteiro 1–31; rejeitar decimais na API. |
| Correo de facturación / emailFacturacion | email_facturacion VARCHAR(150) | Opcional, sintaxe e-mail válida; independente do e-mail fiscal. |
| Correo de cobranzas / emailCobranzas | email_cobranzas VARCHAR(150) | Opcional, sintaxe e-mail válida. |
| Recibir documento electrónico / recibeDocumentoElectronico | recibe_documento_electronico BOOLEAN DEFAULT true | Persistir boolean verdadeiro/falso; D-11 efeito de envio automático não aprovado. |
| Requiere orden de compra / requiereOrdenCompra | requiere_orden_compra BOOLEAN DEFAULT false | Persistir boolean; D-11 efeito em pedido/venda não aprovado. |
| Bloquear ventas / bloqueadoVentas | bloqueado_ventas BOOLEAN DEFAULT false | Persistir; motivo exigido quando true, registrar usuário e hora de ativação; D-11 escopo de bloqueio operacional ainda não aprovado. |
| Motivo del bloqueo / motivoBloqueoVentas | motivo_bloqueo_ventas VARCHAR(500) | Obrigatório não vazio se bloqueado. |
| Observaciones comerciales / observacionComercial | observacion_comercial VARCHAR(1000) | Opcional, não truncar; até 1000. |
| Canal de venta / canalVentaId | canal_venta_id UUID | Opcional, referência `canales_venta` da própria empresa. |
| Código externo / codigoExterno | codigo_externo VARCHAR(100) | Opcional, unicidade por empresa do SQL; não truncar. |
| GLN / gln | gln VARCHAR(13) | Opcional. Para ser GLN válido, formato GS1 13 dígitos e DV GS1; política de exigir DV permanece D-08 (não inferir). Nunca cortar em 13 silenciosamente. |
| Bloqueio hora/usuário (sem controle editável) | bloqueado_ventas_at TIMESTAMPTZ; bloqueado_ventas_por UUID | Definidos pelo backend na ativação e limpos ao remover; usuário deve ser da empresa. |
| Situação ativa (edição) / activo | activo BOOLEAN DEFAULT true | Diferente de bloqueio de vendas; consulta/edição expõem corretamente. |

## C. Contactos — tabela `cliente_contactos`, exclusivamente ERP
| T / JSON | DB | Regra |
|---|---|---|
| Nombre / nombre | nombre VARCHAR(100) NOT NULL | Obrigatório em contato incluído, sem item parcial descartado em silêncio. |
| Apellido / apellido | apellido VARCHAR(100) | Opcional até 100. |
| Cargo / cargo | cargo VARCHAR(100) | Opcional até 100. |
| Departamento / departamento | departamento VARCHAR(100) | Área profissional, não geográfica. |
| Teléfono / telefono | telefono VARCHAR(30) | Opcional, dado de contato, não D214. |
| Celular / celular | celular VARCHAR(30) | Opcional, dado de contato, não D215. |
| Correo electrónico / email | email VARCHAR(150) | Opcional, formato válido. |
| Principal / esPrincipal | es_principal BOOLEAN DEFAULT false | No máximo um principal por cliente, índice único e mensagem por índice. |
| Recibe pedidos / recibePedidos | recibe_pedidos BOOLEAN DEFAULT false | Preferência independente. |
| Recibe facturación / recibeFacturacion | recibe_facturacion BOOLEAN DEFAULT false | Preferência independente. |
| Recibe cobranzas / recibeCobranzas | recibe_cobranzas BOOLEAN DEFAULT false | Preferência independente. |
| Recibe documentos electrónicos / recibeDocumentosElectronicos | recibe_documentos_electronicos BOOLEAN DEFAULT false | Preferência independente. |
| Recibe notificaciones / recibeNotificaciones | recibe_notificaciones BOOLEAN DEFAULT true | Interno, sem checkbox atual; D-12 não decidido: não alterar por suposição. |
Cada contato tem id UUID, empresa_id UUID e cliente_id UUID; CRUD da coleção deve preservar valores e respeitar escopo.

## D. Direcciones — tabela `direcciones_cliente`
| T / JSON | DB | Regra fiscal ou ERP |
|---|---|---|
| Tipo / tipo | tipo TEXT | ERP: FISCAL/COMERCIAL/ENTREGA/SUCURSAL/OTRA, coerência com `es_fiscal`. |
| Etiqueta / etiqueta | etiqueta VARCHAR(100) | ERP: identificação opcional. |
| Dirección / direccion | direccion VARCHAR(300) | D213 quando usada como endereço fiscal receptor: 1–255. Endereços comerciais obedecem ao limite DB, sem aplicar D3 indevidamente. |
| Nro. casa / numeroCasa | numero_casa VARCHAR(20) | D218, se D213 usado no receptor: numérico 1–6 dígitos e obrigatório conforme condição. |
| País / paisCodigo | pais_codigo TEXT | Código válido. Não confundir país do endereço com país receptor D203. |
| Complemento / complemento | complemento VARCHAR(200) | ERP opcional. |
| Código postal / codigoPostal | codigo_postal VARCHAR(15) | ERP opcional. |
| Departamento / departamentoCodigo | departamento_codigo INTEGER; departamento VARCHAR(100) | D219/220: exigir e mapear códigos/descrição quando D3 e D213 + não B2F conforme NT; derivar descrição do catálogo. |
| Distrito / distritoCodigo | distrito_codigo INTEGER; distrito VARCHAR(100) | D221/222 e coerência geográfica quando aplicável; relação de catálogo. |
| Ciudad / ciudadCodigo | ciudad_codigo INTEGER; ciudad VARCHAR(100) | D223/224, relação válida com departamento e distrito. |
| Contacto recepción / contactoNombre | contacto_nombre VARCHAR(200) | ERP opcional. |
| Teléfono recepción / contactoTelefono | contacto_telefono VARCHAR(30) | ERP opcional. |
| Horario recepción / horarioRecepcion | horario_recepcion VARCHAR(200) | ERP opcional. |
| Observación / observacion | observacion VARCHAR(500) | ERP opcional. |
| Es fiscal / esFiscal | es_fiscal BOOLEAN DEFAULT false | Máximo um por cliente, índice; conciliar `tipo=FISCAL`. |
| Entrega predeterminada / esEntregaDefault | es_entrega_default BOOLEAN DEFAULT false | Máximo um por cliente, índice. |
| Descripción (interno) / descripcion | descripcion VARCHAR(100) | Não é `etiqueta`; preservar dado histórico, não inventar novo controle. |
| Latitud / latitud | latitud NUMERIC(9,6) | ERP -90..90; D-12 sem exposição aprovada. |
| Longitud / longitud | longitud NUMERIC(9,6) | ERP -180..180; D-12 sem exposição aprovada. |
Cada direção tem id/empresa_id/cliente_id e timestamps. Geografia: NEX-021 torna localização geral opcional; **a condição fiscal D3 prevalece para endereço usado na SIFEN**. Para B2F não impor códigos PY no DE. Preservar dados ao mudar endereço fiscal e evitar 23505.

## E. Entrega y ventas — campos em `clientes`, exclusivamente ERP
| T / API | DB | Regra |
|---|---|---|
| Ruta de entrega / rutaEntregaId | ruta_entrega_id UUID | Catálogo por empresa. |
| Zona comercial / zonaComercialId | zona_comercial_id UUID | Catálogo por empresa. |
| Vendedor responsable / vendedorId | vendedor_id UUID | Catálogo vendedores por empresa. |
| Frecuencia / frecuenciaEntrega | frecuencia_entrega TEXT | DIARIA/SEMANAL/QUINCENAL/MENSUAL/A_DEMANDA; nulo se não definida. |
| Lunes a Domingo / diasEntrega | dias_entrega SMALLINT[] | 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb, 7=Dom; sem valores inválidos/duplicados; D-13 coerência frequência×dias ainda não aprovada. |
| Observaciones logísticas / observacionLogistica | observacion_logistica VARCHAR(1000) | Opcional, até 1000. |

## F. Documentos — tabela `cliente_documentos`, exclusivamente ERP
| T / JSON | DB | Regra |
|---|---|---|
| Tipo / tipo | tipo TEXT | RUC/CONTRATO/CREDITO/EXONERACION/OTRO. Não confundir com D208. |
| Nombre de archivo / nombreArchivo | nombre_archivo VARCHAR(255) | Obrigatório para documento incluído; 1–255. |
| URL segura / urlArchivo | url_archivo TEXT | Obrigatório; validar URL HTTP/HTTPS real, não aceitar javascript:/data:. Referência externa, não upload. |
| Fecha emisión / fechaEmision | fecha_emision DATE | Data real, entrada DD/MM/YYYY. |
| Fecha vencimiento / fechaVencimiento | fecha_vencimiento DATE | Data válida; >= emissão quando ambas fornecidas. |
| Observación / observacion | observacion VARCHAR(500) | Opcional até 500. |
Relacionamentos `id UUID`, `cliente_id`, `empresa_id`, `cargado_por UUID`, timestamps e FK composta; operações CRUD atômicas sem excluir itens parciais silenciosamente.

## G. Auditoria e aceitação — sem atalhos
1. Claude deve implementar as telas de novo/editar/consultar, componentes, APIs GET/POST/PUT, validações e controllers/serviços aplicáveis, catálogos, sincronização de contatos/endereços/documentos, dicionário de dados e migrations incrementais. Não criar controllers artificiais onde Next.js usa route handlers.
2. **NEX-022** necessária para `razon_social` e `nombre_fantasia` 255. Examinar dependências de views `v_movimientos_detalle`, `v_ventas_al_costo` e dependentes; criar migration transacional versionada preservando grants, regras e opções, com pré-inspeção somente leitura para checar drift antes de aplicar. NUNCA editar migration já aplicada e NUNCA executar SQL na VM. Criar outras migrations incrementais se precisar para integridade Innominado/geografia.
3. Não truncar texto no front ou backend silenciosamente; evitar default fiscal inventado; rejeitar erro com campo/aba e preservação do formulário; validar também o PUT; não tolerar dados históricos inválidos sem política explícita de regularização.
4. **Benchmark de ERP:** AUD-R02 documentou captura externa para ordem/compactação/UX; capturas não estão versionadas. Não inventar requisitos concorrentes. UI compacta, moderna, responsiva, espanhol PY, boa hierarquia e estados visuais; homologação visual depende do usuário.
5. Registrar para **cada linha** valor da tela, JSON, DB, condição, teste de código e resultado, e ajustar dicionário de dados existente. Não criar relatório repetitivo. Indicar bloqueios somente se tecnicamente intransponíveis com dados do Git ou se exigirem decisões D-01/D-08/D-10/D-11/D-12/D-13; não inventar decisão.
6. Claude faz commit/push na branch e para. ChatGPT faz auditoria independente do **código completo + SQL + dicionário**, sem aprovar apenas com relatório de Claude. Usuário somente depois decide aplicação no **único ambiente real**, com backup, inspeção e plano de reversão. Estado '100% no Git' não implica migration aplicada ou funcionamento na VM.


## Decisões aprovadas pelo responsável — 2026-10-11 — fechamento dos sete itens da matriz
**Esta seção é normativa e prevalece sobre menções históricas a esses sete itens como indefinidos.** Não equivale a código implementado, migração aplicada ou teste executado. Não eliminar outras decisões pendentes não abrangidas aqui.

| ID | Campo | Decisão aprovada | Implementação e aceite |
|---|---|---|---|
| DEC-CLI-255-01 | Nombre o razón social | **Obrigatório, 4–255 caracteres** segundo D211 SIFEN; não truncar. | UI alta/edição, POST/PUT, validadores e dicionário até 255; DB `razon_social VARCHAR(255)` via NEX-022. Exige teste de limites 4, 200, 201, 255, 256 e reversão segura. |
| DEC-CLI-255-02 | Nombre de fantasía | **Opcional, 4–255 se informado**, D212; nulo quando vazio; não truncar. | UI/API e NEX-022 `nombre_fantasia VARCHAR(255)`; testar vazio, 3,4,200,201,255,256. |
| DEC-CLI-TEL-03 | Teléfono fiscal | **Selecionar país/DDI separadamente e informar número**; backend normaliza segundo o campo D214 SIFEN e NTs vigentes. | UI ES-PY com código de país e DDI legível, validação por país, preservar zeros necessários, rejeitar entradas ambíguas, sem truncar. Antes de definir formato final persistido, mapeamento canônico e migração, confrontar referência oficial SIFEN/NT para telefone e comportamento de números internacionais. A seleção do DDI não autoriza anexar prefixos indiscriminadamente; garantir D214 6–15 quando exigível. Determinar como tratar registros legados `telefono VARCHAR(30)`. |
| DEC-CLI-CEL-04 | Celular fiscal | **Selecionar país/DDI e informar número**; backend normaliza conforme D215 e NTs SIFEN. | Mesmo controle/serviço reutilizável de telefone com regra específica D215 (10–20 conforme norma vigente), validar DDI e estrutura, não assumir regras internacionais iguais às do Paraguai. Planejar preservação/migração de legados `celular VARCHAR(30)`. |
| DEC-CLI-COD-05 | Código automático | **`CLI-000001` em diante, sequência independente por `empresa_id`, somente leitura, não editável.** | Trigger existente `clientes_asignar_codigo`, código único por empresa, incremento concorrente sem colisão, não reutilizar código indevidamente; verificar format, incrementos, dados antigos e transações no PostgreSQL isolado. |
| DEC-CLI-COB-06 | Día preferido de cobro | **Preferência 1–31. Ao calcular vencimento/agenda em mês mais curto, usar último dia existente daquele mês.** Exemplos: 31/abril→30; 31/fevereiro→28 ou 29. | Persistir `dia_preferido_cobro SMALLINT` como preferência original (31, não 30), rejeitar fração, negativo, 0 ou >31; criar utilitário único de cálculo quando consumido pelo módulo de cobranças, respeitar ano bissexto e fuso/DATE; não criar cobranças automáticas na V1 sem autorização. |
| DEC-CLI-NOT-07 | Recibe notificaciones | **Checkbox visível na aba Contactos, marcado por padrão.** | Campo `recibeNotificaciones` BOOLEAN → `cliente_contactos.recibe_notificaciones BOOLEAN NOT NULL DEFAULT true`; alta, edição, GET, POST, PUT, exclusão e dicionário; cada contato tem seu próprio valor; opção desmarcada persiste false, não sumir no merge. |

### Condições obrigatórias de execução e aceitação
- Claude Code deve ler os protocolos e esta regra ANTES de mudar código, conferir versões da branch, API, UI e migrations; entregar arquivos completos versionados no GitHub.
- **Não executar SQL, testes na VM, alterar banco real ou fazer deploy.** NEX-022/NEX-023 continuam sem homologação PostgreSQL. Qualquer migration incremental adicional para telefone/DDI deve preservar dados, ser separada, versionada e passar por auditoria independente.
- **Não inventar norma de telefone**: verificar texto original MT/NT SIFEN versionado e registrar o mapeamento DDI+número→D214/D215 e regras de armazenamento; se norma não resolver caso, explicitar divergência/bloqueio e solicitar decisão concreta.
- Testes exigidos no plano de homologação: UI (máscara, DDI, teclado móvel, estados, acessibilidade), API (validação contra cliente malicioso), SQL (limites, FK, sequenciador, reversão), integração/edição e aptidão SIFEN com telefone/celular canônicos e legados.
- A decisão comercial de último dia não altera o `DATE` de vencimento do crédito temporário; aplica-se **somente** quando módulo futuro usar `dia_preferido_cobro` como dia do mês, evitando alterar datas contratuais.
- Outras questões D-01, D-08, D-10, D-11, D-13 (e partes de D-12 não cobertas por DEC-CLI-NOT-07) permanecem sem decisão se existentes; esta aprovação só resolve os sete itens explicitamente listados.


## Retificação aprovada — telefone, celular, país, DDD e números repetidos (2026-10-11)
**Decisão superior à interpretação anterior DEC-CLI-TEL-03/04:** o usuário escolhe o **país do número** em seletor de países, com **Paraguay / PRY como padrão**. País, DDI internacional e DDD/código de área **não são sinônimos**.
1. **Paraguai:** formulário de telefone e celular não apresenta campo separado de DDD. O país escolhido já identifica o DDI internacional +595 para eventual integração, sem obrigar usuário a digitar DDI. Os números nacionais são informados no campo número (com seu prefixo local pertinente; não retirar zeros automaticamente). O texto "Paraguai não tem DDD" deve ser entendido como **não exigir campo DDD separado no formulário**, não como licença para omitir o prefixo de cidade que D214 SIFEN exigir.
2. **Outros países:** ao escolher outro país, apresentar campo de **DDD/código de área quando aplicável** àquele país/tipo de número; pode ser opcional onde o plano de numeração não o exige. Não inventar uma lista universal, formato ou obrigatoriedade de DDD; fundamentar configuração por país, com catálogo e validação apropriados. O sistema associa automaticamente o DDI ao país, sem exigir entrada manual de DDI em países reconhecidos; códigos internacionais não listados demandam política/catalogação explícita, sem adivinhar. O usuário informa o número e, quando necessário, área em campos distintos.
3. **Repetição permitida:** número de telefone ou celular **pode se repetir** entre clientes, contatos, empresas e até diferentes registros; contador/consultor pode atender várias empresas. **NUNCA** criar UNIQUE, bloquear, marcar erro, deduplicar cadastro ou usar telefone como chave natural. Unicidade de RUC/identificação segue política própria e não é afetada.
4. **Ambiguidade versus duplicidade:** erro de formato de discagem (`+`, `00`, DDI duplicado na digitação) não é igualdade de números entre pessoas. Não rejeitar apenas porque um número *começa* pelos mesmos dígitos do DDI; coincidência válida. Se o usuário informar prefixos completos no campo número, instruir separação/normalização inequívoca em vez de cortar ou adivinhar; validar de acordo com país e sem alterar legados silenciosamente.
5. **Persistência:** preservar `telefono`/`celular` e `telefono_ddi`/`celular_ddi` planejados em NEX-024; se DDD requer nova coluna, definir migration incremental adicional só após confrontar esquema, preservar dados antigos e atualizar UI, GET/POST/PUT, DTO, validações e dicionário. País do telefone pode diferir do país fiscal do cliente. Não confundir DDI selecionado com geografia fiscal do receptor.
6. **SIFEN:** D214/D215 e futura serialização XML são responsabilidade separada da validação cadastral nacional por país. Consultar manual e NT aplicável e registrar o que está comprovado; **não** declarar que a DNIT obriga DDI/DDD na transmissão sem base normativa. Não aplicar tamanho do número nacional paraguaio indiscriminadamente a todos os países.
7. **Aceite:** casos Paraguai padrão sem campo DDD; seleção de Brasil/outros com campo DDD condicional; país de telefone distinto do receptor; dois clientes com mesmo telefone; mesmo contato em seis empresas; número que começa pelos dígitos do DDI sem falso bloqueio; registros antigos sem país/DDI; mudança de país sem descarte silencioso; entrada de `+`/`00`; GET/POST/PUT conservam país, área e número; validação em banco isolado. Não executar SQL nem deploy na VM.
**Situação:** decisão funcional aprovada. Implementação, normas detalhadas de números por país, migrations e testes pendentes de auditoria. Esta retificação substitui a instrução prévia de campo DDI manual para Paraguai e a ideia equivocada de proibição de números repetidos.


## Decisão definitiva — catálogo MUNDIAL de países e DDI (2026-10-11)
**Obrigatório:** disponibilizar **todos os países e territórios com códigos telefônicos internacionais atribuídos**, não apenas 11 países nem escolha genérica `OTR`. A fonte de referência dos códigos de chamada e planos nacionais é **UIT/ITU-T E.164**, catálogo de planos nacionais https://www.itu.int/oth/t0202/en; a biblioteca Google libphonenumber pode auxiliar na normalização/validação, mas não substitui a distinção entre código ISO, DDI e código de área. A inclusão de todos os países é decisão aprovada; não exige aprovação individual de cada um.
1. **Seleção:** campo com busca pelo nome do país/território em espanhol, ISO e DDI; Paraguay / PRY / +595 selecionado por padrão; mesmo seletor reutilizável em telefone e celular do cliente e de cada contato. O catálogo deve ser completo, versionado e permitir manutenção/atualização dos DDI. Preferir reaproveitar `referencia_geografica_paises` com mapeamento de telefonia próprio, evitando listas divergentes e não impondo que códigos telefônicos definam país fiscal.
2. **Persistência:** gravar ISO real do país/território, DDI e, quando aplicável, área e número; nunca guardar `OTR` como substituto do país real. Códigos DDI compartilhados por países/territórios são válidos: o ISO diferencia destinos. Em áreas NANP +1, não confundir DDI com prefixos de área.
3. **Interface:** Paraguay não mostra DDD separado, número com prefixo local mantido; em outros países DDD/código de área só onde aplicável. Não bloquear arbitrariamente por limites dos 11 planos sem revisão; validação de números internacionais segundo metadados confiáveis e fallback que não descarte números por falta de plano específico. Proibido UNIQUE em números de telefone/celular; repetição entre clientes, contatos e empresas é normal.
4. **Migração:** se a modelagem NEX-024/NEX-025 não contemplar o universo global ou os metadados, criar migration incremental nova, preservar registros legados e não alterar migrations já versionadas; controlar atualizações de catálogo via seed versionada/idempotente. Verificar compatibilidade ISO alfa-3 e regiões/territórios; não armazenar código fictício no lugar de destino conhecido.
5. **Separação fiscal:** seleção do país do número independe de D203 (país do receptor), D214/D215 da SIFEN e política de emissão XML V2 ainda pendente. Não definir serialização fiscal por suposição.
6. **Critérios de aceite:** todos os países/territórios UIT com códigos atribuídos acessíveis e pesquisáveis, casos PRY/BRA/ARG/URY/USA/CAN/países remotos e territórios que compartilham DDI, país real preservado em GET/POST/PUT, cobertura de contatos, alteração de país sem perda silenciosa, dados legados, duplicidade autorizada, testes de build e regressão documentados. Nenhum deploy/SQL na VM sem auditoria e autorização.
**Esta decisão substitui expressamente a opção 'Otro país' com código `OTR` como representação definitiva do país.**
