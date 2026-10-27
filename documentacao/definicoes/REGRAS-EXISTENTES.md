# DistribuNex — Regras de negócio existentes

Requisito: REQ-2026-001 (RN-02, RN-04, RN-05) · Autor: Claude · Data: 2026-10-08 · Base: `main` @ `7f4230a`

Só estão aqui regras **que o código executa**, com referência. Expectativas de produto que não existem no código estão marcadas como **NÃO IMPLEMENTADO**. Não foram inventadas regras.

Cada regra tem uma origem:
- **[API]**: validada no servidor (`app/api`). Vale em modo real.
- **[UI]**: validada só na tela, antes de gravar. Pode ser contornada chamando a API diretamente.
- **[DEMO]**: lógica do repositório no navegador (`lib/mocks`). É o comportamento demonstrado ao prospect, mas **não existe no servidor**.

## 1. Autenticação e sessão [API]

| ID | Regra | Referência |
|---|---|---|
| AUT-01 | O login exige empresa, usuário e senha, com limites de 30, 80 e 200 caracteres | `app/api/auth/login/route.ts:86` |
| AUT-02 | O usuário é localizado pelo código da empresa e pelo nome de usuário, sem diferenciar maiúsculas; a empresa precisa estar ativa | `login/route.ts:128` |
| AUT-03 | A senha é comparada por `crypt()` (bcrypt, armazenada no banco) | `login/route.ts:175` |
| AUT-04 | Após 5 falhas consecutivas, o usuário fica bloqueado por 15 minutos | `login/route.ts:184-185` |
| AUT-05 | Usuário bloqueado ou inativo não entra; o evento é registrado com o motivo | `login/route.ts:150-200` |
| AUT-06 | Login bem-sucedido zera as tentativas, grava `ultimo_acceso_at`, cria a sessão e registra `LOGIN_EXITOSO` | `login/route.ts:220-252` |
| AUT-07 | A sessão dura 8 horas, sem renovação e sem limite por inatividade | `lib/auth/session.ts:12`; `login/route.ts:238` |
| AUT-08 | A sessão só é válida se não estiver revogada nem expirada, e se o usuário estiver `ACTIVO` e não bloqueado | `session.ts:109-128` |
| AUT-09 | O logout revoga a sessão no banco | `app/api/auth/logout/route.ts:42` |
| AUT-10 | Em `DEMO_MODE=true`, entra apenas `casa_mingo/admin/admin123`, e a sessão é o cookie constante `demo-casa-mingo` | `login/route.ts:21-23,96`; `session.ts:13,92` |
| AUT-11 | Autorização por perfil/permissão: **NÃO IMPLEMENTADO** (existe função sem uso em `lib/auth/permissions.ts`) | — |

## 2. Clientes

### 2.1 [API] `POST /api/clientes`
| ID | Regra | Referência |
|---|---|---|
| CLI-01 | Naturaleza: `CONTRIBUYENTE` ou `NO_CONTRIBUYENTE` (códigos SIFEN 1 e 2) | `app/api/clientes/route.ts:115,655` |
| CLI-02 | Tipo de operação: `B2B`, `B2C`, `B2G`, `B2F` (1–4) | `:120,659` |
| CLI-03 | Tipo de contribuinte: `FISICA` ou `JURIDICA` | `:127,663` |
| CLI-04 | País (código **e** nome) e razão social são obrigatórios | `:667-673` |
| CLI-05 | Contribuinte exige RUC e DV. **O DV não é calculado nem conferido** (mód. 11 NÃO IMPLEMENTADO) | `:676-678` |
| CLI-06 | Não contribuinte exige tipo de documento SIFEN (cédula PY, passaporte, cédula estrangeira, carnê de residência, innominado, carteira diplomática, outro) e o número; "OTRO" exige descrição | `:132,680-693` |
| CLI-07 | Vencimento do crédito exige limite de crédito temporal | `:695-699` |
| CLI-08 | Frequência de entrega: DIARIA, SEMANAL, QUINCENAL, MENSUAL, A_DEMANDA; dias de entrega entre 1 e 7 | `:158,252,701` |
| CLI-09 | Bloqueio de vendas exige motivo | `:708` |
| CLI-10 | Formato de e-mail validado (principal, cópia, faturamento, cobranças, contatos) | `:712-715,738` |
| CLI-11 | Endereço: tipo FISCAL, COMERCIAL, ENTREGA, SUCURSAL ou OTRA (padrão COMERCIAL); endereço e país obrigatórios; no Paraguai, departamento, distrito e cidade são validados contra o catálogo geográfico | `:142,719-730,299,993` |
| CLI-12 | Contato exige nome | `:735` |
| CLI-13 | Documento anexo: tipo RUC, CONTRATO, CREDITO, EXONERACION ou OTRO; nome e URL obrigatórios; o vencimento não pode ser anterior à emissão | `:150,743,750,1069` |
| CLI-14 | Grupo, lista de preço, rota, zona, vendedor e canal precisam pertencer à empresa da sessão e estar ativos | `:272-297,760-795` |
| CLI-15 | Não pode haver outro cliente da empresa com o mesmo tipo, número e DV de documento | `:804-823` |
| CLI-16 | Datas no formato `dd/mm/yyyy` | `:224` |
| CLI-17 | Gravação transacional (cliente, contatos, endereços, documentos) | `:827-1108` |

### 2.2 [UI]/[DEMO] telas de clientes
| ID | Regra | Referência |
|---|---|---|
| CLI-U1 | Na edição, CONTRIBUYENTE define B2B/RUC, e NO_CONTRIBUYENTE define B2C/cédula; em ambos o país vira PRY | `app/(private)/clientes/[id]/page.tsx:480` |
| CLI-U2 | Na edição, a operação B2F define país ARG/Argentina e passaporte | `clientes/[id]/page.tsx:507` |
| CLI-U3 | A edição exige razão social | `clientes/[id]/page.tsx:551` |
| CLI-D1 | Código sequencial `CLI-nnnn` gerado no navegador; preservado na edição | `lib/mocks/clientes-storage.ts:94,147` |

## 3. Proveedores

### 3.1 [API] `POST /api/proveedores` (sem chamador na UI)
| ID | Regra | Referência |
|---|---|---|
| PRV-01 | Tipo e número de documento, razão social e país (3 letras) são obrigatórios | `app/api/proveedores/route.ts:565-568` |
| PRV-02 | Fornecedor do Paraguai deve usar RUC | `:570-571` |
| PRV-03 | RUC com 3–8 dígitos e DV de exatamente 1 dígito (o DV não é conferido) | `:573-575` |
| PRV-04 | Dia de pagamento entre 1 e 31; prazos e dias não negativos; desconto de 0 a 100%; mínimo de compra ≥ 0; avaliação de 0 a 100 | `:589-596` |
| PRV-05 | Estado de homologação, nível de risco (NO_EVALUADO…CRITICO) e método de transporte dentro de listas fixas | `:189-198,601-603` |
| PRV-06 | Datas finais não podem ser anteriores às iniciais (relação e homologação) | `:609-610` |
| PRV-07 | No máximo um contato principal e uma conta bancária principal; uma dirección principal por tipo (FISCAL, COMERCIAL, RETIRO, PAGOS, OTRA) | `:179,618-629` |
| PRV-08 | Retenção do tipo IVA, RENTA ou OTRA. **O `impuesto_id` não é validado** | `:180,824` |
| PRV-09 | Grupo e meio de pagamento pertencem à empresa; condição de pagamento, moeda, incoterm e país existem no catálogo global | `:642-647` |
| PRV-10 | Unicidade por RUC, por documento, por conta bancária, por contato principal e por endereço principal, garantida por constraints do banco e traduzida em mensagens | `:880-887` |
| PRV-11 | Datas no formato `yyyy-mm-dd` (diferente de clientes e productos) | `:223` |

### 3.2 [UI]/[DEMO]
| ID | Regra | Referência |
|---|---|---|
| PRV-U1 | Paraguai exige RUC; RUC de 3–8 dígitos com DV de 1 dígito | `app/(private)/proveedores/_components/proveedor-form.tsx:316,328` |
| PRV-U2 | A razão social é gravada em maiúsculas | `proveedor-form.tsx:337` |
| PRV-D1 | Código `PRV-nnnn` gerado no navegador | `lib/mocks/proveedores-storage.ts:104` |

## 4. Productos

### 4.1 [API] `POST /api/productos` (sem chamador na UI)
| ID | Regra | Referência |
|---|---|---|
| PRD-01 | Código, descrição, descrição para fatura e unidade base são obrigatórios | `app/api/productos/route.ts:211-219` |
| PRD-02 | Tipo: MERCADERIA (padrão), SERVICIO, KIT, ACTIVO_FIJO | `:220-223` |
| PRD-03 | Controle de stock: CANTIDAD (padrão), LOTE, UNIDAD_ETIQUETADA | `:224-225` |
| PRD-04 | Código SIFEN com até 20 caracteres | `:226-227` |
| PRD-05 | Códigos adicionais: GTIN, GTIN_EMPAQUE, EAN, UPC, CODIGO_ALTERNO, SKU_PROVEEDOR, OTRO; GTIN/EAN/UPC com 8–14 dígitos | `:236-255` |
| PRD-06 | Cada apresentação exige unidade, nome e fator de conversão maior que zero | `:257-264` |
| PRD-07 | Só KIT pode ter componentes (um KIT sem componentes é aceito) | `:265-267` |
| PRD-08 | Vencimento de documento não pode ser anterior à emissão | `:400` |
| PRD-09 | Datas `dd/mm/yyyy` | `:79` |
| PRD-10 | **Não** valida que categoria, marca, imposto, unidade, fornecedor, depósito e produtos relacionados pertençam à empresa | `:272-410` |

### 4.2 [UI]/[DEMO]
| ID | Regra | Referência |
|---|---|---|
| PRD-U1 | Descrição interna, unidade base e descrição para fatura são obrigatórias | `app/(private)/productos/_components/producto-form.tsx:813,821,831` |
| PRD-U2 | A descrição é gravada em maiúsculas | `producto-form.tsx:851` |
| PRD-D1 | Código `PRD-nnnn` gerado no navegador; **a edição gera código novo** | `lib/mocks/productos-storage.ts:94,126` |
| PRD-D2 | Criar produto não cria saldo de stock | `productos-storage.ts` (não chama `stock-storage`) |

## 5. Listas de precio [DEMO]

| ID | Regra | Referência |
|---|---|---|
| LP-01 | Nome e data de início de vigência são obrigatórios | `app/(private)/listas-precio/_components/lista-precio-form.tsx:529,537` |
| LP-02 | Ajuste percentual: `preço = round(base × (1 + %/100))`, sendo `base` o preço base ou, na falta dele, o custo de referência; % negativo é registrado como desconto | `lista-precio-form.tsx:438` |
| LP-03 | Margem = (preço − custo) / preço | `lista-precio-form.tsx:438` |
| LP-04 | "Importar todos" traz todos os produtos para a lista | `lista-precio-form.tsx:379` |
| LP-05 | A lista é exibida como VENCIDA quando `vigenteHasta` já passou (cálculo na tela, sem alterar o registro); alerta de vencimento em 30 dias | `app/(private)/listas-precio/page.tsx:38,200` |
| LP-06 | Código `LP-nnn` | `lib/mocks/listas-precio-storage.ts:167` |
| LP-NI | Modo de preço, regras, escalas e prioridade são **gravados, mas não aplicados** em nenhum cálculo; nenhum módulo consome a lista (fatura não usa) | — |

## 6. Stock e movimientos [DEMO]

Fórmulas (`lib/mocks/movimientos-stock-storage.ts:145`):
- **físico** = disponível + reservado + quarentena;
- **virtual** = físico + em trânsito;
- **valor** = físico × custo médio.

Nível (`:36`): SIN_STOCK quando físico ≤ 0; BAJO quando ≤ mínimo; SOBRESTOCK quando > máximo (só se máximo > 0); NORMAL nos demais casos.

| ID | Tipo de movimento | Efeito | Validação | Referência |
|---|---|---|---|---|
| MOV-01 | ENTRADA | + disponível no total e no depósito destino; soma ao lote (ou cria) se o controle é LOTE | — | `:212-300` |
| MOV-02 | SALIDA | − disponível | disponível suficiente | `:307` |
| MOV-03 | AJUSTE_POSITIVO | + disponível no total. **Não atualiza o depósito** | — | `:344` |
| MOV-04 | AJUSTE_NEGATIVO | − disponível | saldo suficiente | `:359` |
| MOV-05 | RESERVA | disponível → reservado | disponível suficiente | `:376` |
| MOV-06 | LIBERACION_RESERVA | reservado → disponível | ≤ reservado | `:395` |
| MOV-07 | CUARENTENA | disponível → quarentena | disponível suficiente | `:414` |
| MOV-08 | LIBERACION_CUARENTENA | quarentena → disponível | ≤ quarentena | `:433` |
| MOV-09 | TRANSFERENCIA | depósito origem → destino | saldo no depósito origem | `:469` |

| ID | Regra geral | Referência |
|---|---|---|
| MOV-10 | O produto precisa existir no stock demo; o stock é indexado só pelo produto | `:174-189` |
| MOV-11 | Número `MOV-000001` sequencial; estado `REGISTRADO` | `:140,539` |
| MOV-12 | [UI] Origem obrigatória em saída, transferência, reserva, quarentena, liberações e ajuste negativo; destino obrigatório em entrada, transferência e ajuste positivo; origem ≠ destino | `app/(private)/movimientos/nuevo/page.tsx:112,123,226` |
| MOV-13 | [UI] Depósitos fixos (Central, Norte, Sul), mas o stock base só tem o Central. Uma ENTRADA no Norte soma ao total, mas não a um depósito existente | `movimientos/nuevo/page.tsx:29`; `lib/mocks/stock.ts:9` |
| MOV-14 | [UI] Usuário registrado sempre "admin" | `movimientos/nuevo/page.tsx:93` |
| MOV-NI | Anulação/estorno, custo médio ponderado na entrada, baixa de lote na saída e FEFO: **NÃO IMPLEMENTADO** | — |
| STK-01 | [UI] A tela de stock usa o **preço de venda de referência como custo** e calcula o "preço demo" = custo × 1,2 | `app/(private)/stock/page.tsx:52-70` |

## 7. Recepciones [DEMO]

| ID | Regra | Referência |
|---|---|---|
| REC-01 | [UI] Fornecedor obrigatório; produto não pode se repetir | `app/(private)/recepciones/nuevo/page.tsx:345,255` |
| REC-02 | Pelo menos um item; quantidade recebida > 0; pendente = ordenada − recebida | `lib/mocks/recepciones-storage.ts:137,144,170` |
| REC-03 | A recepção nasce `RECIBIDA` | `recepciones-storage.ts:209` |
| REC-04 | Cada item gera um movimento ENTRADA, origem COMPRA, no depósito escolhido, **um a um e sem atomicidade** | `recepciones-storage.ts:216` |
| REC-05 | O proprietário do lote é fixo ("CASA MINGO S.A.") | `recepciones-storage.ts:247` |
| REC-06 | Só produtos MERCADERIA ativos podem ser recebidos | `recepciones-storage.ts:312-317` |
| REC-07 | [UI] Custo sugerido = custo médio do produto (0 nos dados base) | `recepciones/nuevo/page.tsx:275` |
| REC-NI | Orden de compra, conferência, devolução, recálculo de custo e conta a pagar: **NÃO IMPLEMENTADO** | — |

## 8. Facturas [DEMO]

| ID | Regra | Referência |
|---|---|---|
| FAC-01 | [UI] Cliente obrigatório; pelo menos um item | `app/(private)/facturas/nuevo/page.tsx:385,394` |
| FAC-02 | [UI] A alíquota do item é inferida do **nome** do imposto: contém "5" → 5%; contém "Exenta" → 0%; senão, 10% | `facturas/nuevo/page.tsx:261-270` |
| FAC-03 | [UI] Preço unitário sugerido = custo médio do produto (0 nos dados base), e não o preço de lista | `facturas/nuevo/page.tsx:292` |
| FAC-04 | [UI] Subtotal do item = quantidade × preço unitário (sem desconto por item) | `facturas/nuevo/page.tsx:328-345` |
| FAC-05 | Preços com IVA incluído: base 5% = round(subtotal5 / 1,05); base 10% = round(subtotal10 / 1,10); IVA = subtotal − base; qualquer alíquota diferente de 0 e 5 vai para 10% | `lib/mocks/facturas-storage.ts:36-63` |
| FAC-06 | [UI] À vista: o valor do pagamento é igual ao total | `facturas/nuevo/page.tsx:319,364` |
| FAC-07 | Número sequencial único de 7 dígitos, que **não** é separado por estabelecimento nem por ponto de expedição | `facturas-storage.ts:166` |
| FAC-08 | A fatura é gravada já `APROBADA`, com CDC fictício (dígitos fixos `12345678901`) e a mensagem "Documento aprobado" | `facturas-storage.ts:208-212` |
| FAC-09 | Emissor fixo "CASA MINGO S.A."; número de casa "0" | `facturas/nuevo/page.tsx:76,84,439` |
| FAC-NI | Envio ao SIFEN, assinatura, CDC real, KuDE, cancelamento, nota de crédito, baixa de stock, conta a receber e timbrado: **NÃO IMPLEMENTADO**. Os campos fiscais definitivos dependem de confirmar o contrato SIFEN/DNIT vigente (RN-05) | — |

## 9. Regras de plataforma

| ID | Regra | Referência |
|---|---|---|
| PLT-01 | Toda leitura de API filtra por `empresa_id` da sessão | APIs, consultas `WHERE ... empresa_id = $1` |
| PLT-02 | Escrita grava `empresa_id` da sessão, nunca do corpo da requisição | `clientes/route.ts:827`; `proveedores/route.ts:651`; `productos/route.ts:272` |
| PLT-03 | Sucursal: lida da sessão, sem nenhuma regra aplicada (**NÃO IMPLEMENTADO**) | `lib/auth/session.ts` |
| PLT-04 | Os dados demo voltam à base quando há 20 itens ou menos | `lib/mocks/productos-storage.ts:56`; `stock-storage.ts:67` |
