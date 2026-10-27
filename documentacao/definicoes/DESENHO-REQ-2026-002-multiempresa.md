# DESENHO-REQ-2026-002 — Multiempresa, usuários, perfis e menus

Requisito: `REQ-2026-002-multiempresa-usuarios-perfiles-menus.md` · Autor: Claude
Versão: **5 (decisões D-11 e D-12 e AUD-REQ-2026-002-R04)** · Data: 2026-10-09
Código analisado: `main` @ `0dbb013` (o código funcional é idêntico ao de `7f4230a`; desde então só entraram documentos)
Situação: **PROPOSTA PARA APROVAÇÃO DOCUMENTAL.** As decisões de negócio estão registradas em `DECISOES-REQ-2026-002-APROVACAO.md` (D-01 a D-08, `2a007e7`), `DECISOES-REQ-2026-002-R03-CONTROLES-CRITICOS.md` (D-09 e D-10, `9c76906`) e `DECISOES-REQ-2026-002-R04-OPERADOR-UNICO-E-PRAZOS.md` (D-11 e D-12, `ee59738`); elas não autorizam implementação, migrations nem homologação. Nenhum código, nenhum SQL executável e nenhuma migration fazem parte desta entrega. Os trechos SQL deste documento são ilustrativos e servem para fixar o contrato; não são DDL definitivo (F-001).

Documentos de apoio, no PR #2 (`feature/REQ-2026-001-consolidacao-documental` @ `fd16292`): `ARQUITETURA-ATUAL.md` §2 e §7, `MODELO-DADOS-ATUAL.md` §1.1, `MAPA-MODULOS.md` §1 e §6, `documentacao/banco/INTROSPECCAO-SOMENTE-LEITURA.md`.

## 0. Resposta aos achados da R01

| Achado | Severidade | Onde foi tratado |
|---|---|---|
| F-001 Autorização depende de esquema não inspecionado | ALTA | §3 vira modelo-alvo **condicionado** à fase 0; §10.1 lista a introspecção e as verificações de integridade pré-migração; nenhuma DDL definitiva |
| F-002 Escalada de privilégios | ALTA | **§4** (novo): regras de delegação, autoelevação, último administrador, bootstrap, versão e auditoria antes/depois; testes em §11.2 |
| F-003 Alcance por sucursal/depósito | MEDIA | **§6** reescrito: definição formal dos conjuntos, coerência depósito × sucursal, transferências, depósitos de terceiros, remoção de atribuição; testes em §11.3 |
| F-004 RLS e contexto transacional | MEDIA | **§5** (novo): contrato da camada de dados, papéis SQL, `FORCE RLS`, rollback, reutilização do pool, cache do Next.js; testes em §11.1 |
| F-005 Janela de autorização incompleta | MEDIA | **§10** reescrito: isolamento aplicado já na fase 1; permissões em modo observação até o catálogo existir; portões de entrada/saída por fase |
| F-006 Contrato temporal de revogação | MEDIA | **§8** (novo): tabela evento × efeito × momento, bloqueio de linha contra condição de corrida, sem cache de autorização; testes em §11.4 |
| F-007 Catálogos globais | BAIXA | §3.4: classificação tabela a tabela, com decisão pendente pós-introspecção |
| Condição R02: decisões D-01 a D-05 | — | §2: decisões do responsável registradas em `DECISOES-REQ-2026-002-APROVACAO.md` (versão 3) |
| Condição R02: matriz de cobertura das rotas | — | `MATRIZ-PERMISOS-REQ-2026-002.md` §4 e §7 (verificação 26/26 páginas, 5/5 APIs, 32/32 itens de menu) |

### 0.1 Resposta à R02 e às decisões do responsável (versão 3)

| Origem | Ponto | Onde foi tratado |
|---|---|---|
| D-06 (AJUSTAR) e R02-F-001 | Administrador **não** recebe dados sensíveis automaticamente; concessão explícita, auditada e sem autoconcessão | §2, §4.1, §4.2 (ESC-01, ESC-05, ESC-12, ESC-13), §4.4, §4.6, §9, §11.6; matriz §2 e §5 |
| D-07 (condicionada) e R02-F-002 | Cinco anos é proposta inicial; classificação dos registros, validação legal, acesso, descarte e backups; nenhum expurgo automático antes da validação | §9.1 |
| D-08 (aprovada com condições) | Envio → `EN_TRANSITO` → recebimento, validação independente dos dois depósitos, cancelamento, perda e conciliação | §6.4, §6.4.1, §11.3 |
| R02-F-003 | OBSERVAR só em homologação isolada com dados sintéticos; isolamento entre empresas sempre negado; chave que falha fechada | §10 (regras da chave), §11.5 |
| R02-F-004 | Decisões registradas; DDL só depois do banco real; testes antes de implementar | §2, §10 |
| D-04 (condicionada) | Revisão por área de negócio e testes por operação antes de implementar; correções da matriz versionadas | matriz §8 e §9; §11.7 |
| D-01, D-02, D-03, D-05 (aprovadas) | Incorporadas como regras, não mais como recomendação | §2, §4, §6 |

### 0.2 Resposta à R03 e às decisões D-09 e D-10 (versão 4)

| Origem | Ponto | Onde foi tratado |
|---|---|---|
| D-09 / R03-F-002 | As 4 ações críticas saem do perfil administrador e passam a exigir concessão individual, rastreável, por recurso/ação; segregação criador ≠ aprovador | §4.1, §4.7, ESC-15, ESC-16; matriz §2.1, §3, §5; testes §11.9 |
| D-10 / R03-F-001 | Dado sensível exige segundo aprovador **independente**; estados SOLICITADA, APROBADA, REJEITADA, REVOGADA, EXPIRADA (e CANCELADA); nada é efetivo antes da aprovação | §4.7.2, §4.7.4 |
| D-10 | Independência verificável: contas diferentes, linhagem de criação, linhagem de poder, identidade (documento e e-mail), MFA, antiguidade do poder; revalidação na aprovação e no uso | §4.7.3, ESC-14 |
| D-10 | Empresa sem segundo aprovador independente: autorização formal da PROCEIT, vinculada ao pedido da empresa, com responsável de plataforma identificado; não é bypass | §4.7.5, §4.4, §4.6 |
| Pedido do responsável (item 4) | Autoconcessão impossível por perfil (as permissões controladas não podem estar em perfil) e por conta alternativa (regras de independência) | §4.1, ESC-13, §4.7.3, §11.10 |
| R03-F-003 / D-04 | Revisão por área continua PENDENTE com o responsável | matriz §8 |
| R03-F-004 | Banco real e CI continuam dependências (REQ-2026-003 e 004) | §10 |

### 0.3 Resposta à R04 e às decisões D-11 e D-12 (versão 5)

| Origem | Ponto | Onde foi tratado |
|---|---|---|
| D-11 / R04-F-001 | Empresa sem segunda pessoa independente: autorização formal da PROCEIT **para cada operação crítica**, sem autoaprovação nem uso de outras contas; vale só para aquele objeto e versão, uma vez | §4.7.7 (substitui a proposta da v4), §4.7.11, §9 |
| D-12 / R04-F-003 | Validade 180 dias (dado sensível) e 365 (ação crítica); solicitação expira em 7 dias; aprovador com poder há 7 dias, como valores **aprovados** | §4.7.2, IND-06, §4.7.8 |
| D-12 (condições 1 a 6) | Parametrização controlada e auditada, limites rígidos, revogação imediata, renovação sem automatismo, antiguidade não contornável, exceção PROCEIT sem dispensa de MFA, urgência por processo formal | §4.7.8, §4.7.9, §4.7.12 |
| R04-F-002 | Independência exige evidência; limites da verificação de identidade declarados; a linhagem de contas não elimina conluio nem identidade dupla | §4.7.10, §13 |
| R04-F-004 / R03-F-003 / R03-F-004 | D-04, D-07, banco real e CI continuam abertos | matriz §8, §10 (sem mudança) |

## 1. Pontos de partida

### 1.1 O que já existe e se mantém
| Item | Evidência | Decisão de desenho |
|---|---|---|
| Login por empresa + usuário + senha | `app/api/auth/login/route.ts:128` | Mantido (RN-03) |
| `empresa_id` da sessão em todas as gravações | `app/api/clientes/route.ts:827`; `app/api/proveedores/route.ts:651`; `app/api/productos/route.ts:272` | Mantido; vira regra obrigatória da camada de dados |
| Perfis e estado do usuário relidos a cada requisição | `lib/auth/session.ts:109-125` | Mantido; base da revogação imediata (§8) |
| Tabelas `perfiles`, `permisos`, `perfil_permiso`, `usuario_perfil` | `lib/auth/permissions.ts:15-23` | Reaproveitadas, sujeitas à fase 0 |
| Bloqueio por tentativas e `eventos_seguridad` | `login/route.ts:150-252` | Mantido; ampliado (§9) |
| Validação de catálogo por empresa | `clientes/route.ts:272` (`validarReferenciaEmpresa`) | Generalizada (§5.5) |

### 1.2 O que precisa ser corrigido
| ID | Problema | Evidência | Seção |
|---|---|---|---|
| G-01 | Nenhuma rota verifica permissão | `lib/auth/permissions.ts`: 0 importadores | §7 |
| G-02 | Menu completo quando não há permissões | `lib/navigation/menu.ts:321-322`; `lib/auth/server-context.ts:37-38` | §7.4 |
| G-03 | O código não confere se o perfil é da empresa do usuário | `session.ts:116-117`; `permissions.ts:17-22` | §3.2, §5 |
| G-04 | Dois critérios de administrador (`'ADMIN'` × `es_administrador`) | `server-context.ts:15`; `permissions.ts:22` | §4.1 |
| G-05 | `POST /api/productos` aceita IDs de outras empresas | `productos/route.ts:272-410` | §5.5 |
| G-06 | Sem sucursal nem alcance | `ARQUITETURA-ATUAL.md` §7 | §6 |
| G-07 | Empresa desativada não derruba sessões | `session.ts:109-125` | §8 |
| G-08 | Demo concede administrador por cookie constante | `session.ts:13,92`; `permissions.ts:10` | §7.5 |
| G-09 | Auditoria só de login; `app.usuario_id` só no login | `login/route.ts:220` | §9 |
| G-10 | Sem administração de usuários e perfis | menu `/administracion/*` sem página | §12 |

## 2. Decisões (D-01 a D-08)

Fonte: `documentacao/definicoes/DECISOES-REQ-2026-002-APROVACAO.md`, registrado em 2026-10-08 (commit `2a007e7`). As decisões aprovam diretrizes de negócio e de arquitetura; **não** aprovam implementação, testes, migrations nem homologação.

| ID | Decisão do responsável | Condição obrigatória | Como o desenho atende |
|---|---|---|---|
| D-01 | APROVADO — contas separadas por empresa | Manter login empresa + usuário + senha | §3.2; nenhuma mudança no login. Identidade única futura exige novo REQ |
| D-02 | APROVADO — união das permissões dos perfis | A união nunca ultrapassa empresa e alcance | §4.1, §6.3 (permissão **e** empresa **e** alcance) |
| D-03 | APROVADO — administração global PROCEIT segregada | Identidades separadas, MFA, suporte explícito, temporário e auditado, sem bypass | §4.6 |
| D-04 | APROVADO CONDICIONALMENTE — matriz | Revisão por área de negócio; validar concessão inicial, revogação e testes de cada operação antes de implementar; versionar correções | Matriz versão 4 (39 recursos, 142 permissões; histórico na matriz §9); checklist por área (matriz §8); teste por operação gerado da matriz (§11.7) |
| D-05 | APROVADO — alcance vazio nega | `TODAS`/`TODOS` só por concessão explícita | §6.1, §6.2; concessão de `TODAS`/`TODOS` sujeita a ESC-06 e auditada |
| D-06 | **AJUSTAR** — administrador sem acesso sensível automático | Concessão explícita e auditável por recurso/ação, inclusive para administradores; impedir autoconcessão | §4.1, §4.7, ESC-12 a ESC-14, §4.4, §4.6 |
| D-07 | APROVADO CONDICIONALMENTE — 5 anos como objetivo | Classificar eventos; validar prazos com jurídico/contabilidade e privacidade antes de expurgo automático; definir acesso, descarte e backups | §9.1 |
| D-08 | APROVADO — transferência em duas etapas | Envio → `EN_TRANSITO` → recebimento; validação independente dos dois depósitos; cancelamento, perda e conciliação; testes | §6.4.1, §11.3 |

| D-09 | APROVADO — ações críticas com concessão explícita, inclusive para administrador | Rastreável (ator, beneficiário, empresa, recurso, ação, motivo, data, situação); segregação criador ≠ aprovador; checagem no servidor com alcance; revogação pelo contrato do §8 | §4.1, §4.7, ESC-15, §8.2 |
| D-10 | APROVADO — dado sensível com segundo aprovador independente | Sem autoaprovação direta, por perfil ou por contas do mesmo operador; registro completo; efetivo só após aprovação; exceção formal PROCEIT; estados e expiração; sem condição de corrida; revalidação na aprovação e no uso | §4.7 |

A D-06 continua valendo e é complementada pela D-10 (como conceder) e pela D-09 (ações críticas).

Decisões do `DECISOES-REQ-2026-002-R04-OPERADOR-UNICO-E-PRAZOS.md` (`ee59738`, 2026-10-09):

| ID | Decisão do responsável | Condição obrigatória | Como o desenho atende |
|---|---|---|---|
| D-11 | APROVADO — empresa com único operador: autorização formal da PROCEIT para **cada operação crítica** | Operação pendente e sem efeito até a autorização; sem autoaprovação (nem por outras contas); solicitação com empresa, operador, ação, objeto, justificativa e documento; responsável PROCEIT com MFA e competência explícita; registro na empresa e na plataforma; autorização não vale para outras operações; verificar objeto, versão e validade; sem replay nem corrida | §4.7.7, §4.7.11 |
| D-12 | APROVADO — 180 dias (dado sensível), 365 (ação crítica), solicitação expira em 7, aprovador com poder há 7 dias | Parâmetros controlados e auditados; prazo não é direito permanente; renovação só com nova aprovação; antiguidade não contornável; exceção PROCEIT não dispensa MFA; urgência por processo formal | §4.7.2, §4.7.3 (IND-06), §4.7.8, §4.7.9, §4.7.12 |

Pontos ainda abertos, conforme o registro: detalhes finais da matriz por módulo (D-04), prazos efetivos e base legal por classe de registro (D-07) e o esquema real do banco.

## 3. Modelo de dados-alvo (condicionado à fase 0)

**Condição (F-001):** o que segue é o modelo-**alvo**. As migrations serão escritas só depois da introspecção (§10.1) e da conciliação coluna a coluna. Colunas que já existirem não são recriadas; colunas com outro nome ou tipo geram uma decisão registrada, e não uma migration presumida.

### 3.1 Princípios
1. Toda tabela de negócio tem `empresa_id NOT NULL`, exceto os catálogos classificados como globais na §3.4.
2. **Chave composta contra referência cruzada (RN-11):** `UNIQUE (empresa_id, id)` em cada tabela de empresa, e FKs entre tabelas da mesma empresa no formato `(empresa_id, x_id) REFERENCES x (empresa_id, id)`.
3. Unicidade sempre composta com a empresa: `(empresa_id, lower(usuario))`, `(empresa_id, codigo)`.
4. RLS como segunda barreira (§5.3), ativada tabela a tabela na fase 5.

### 3.2 Entidades de acesso

| Entidade | Situação no código | Colunas-alvo | Regras |
|---|---|---|---|
| `empresas` | existe | `id, codigo, razon_social, ruc, estado` (`ACTIVA` \| `SUSPENDIDA`), `version_acceso` | `codigo` único global (usado no login) |
| `sucursales` | não referenciada; confirmar na fase 0 | `id, empresa_id, codigo, nombre, establecimiento_sifen, activo` | `UNIQUE (empresa_id, codigo)` |
| `depositos` | existe | + `sucursal_id` (FK composta), `es_de_terceros`, `activo` | Todo depósito pertence a uma sucursal da mesma empresa |
| `usuarios` | existe | + `alcance_sucursales` (`TODAS` \| `ASIGNADAS`), `alcance_depositos` (`TODOS` \| `ASIGNADOS`), `baja_at`, `debe_cambiar_contrasena`, `version_acceso`, `creado_por`, `creado_por_tipo` (`USUARIO` \| `PLATAFORMA`), `documento_hash` (HMAC do documento de identidade, nunca o número), `email_verificado`, `mfa_activo` | `sucursal_id` atual = sucursal padrão, obrigatoriamente dentro do alcance |
| `usuario_sucursal`, `usuario_deposito` | inexistentes | `empresa_id, usuario_id, sucursal_id` / `deposito_id`, `asignado_por, asignado_at` | FKs compostas |
| `perfiles` | existe (`empresa_id` NAO_VERIFICADO) | `id, empresa_id, codigo, nombre, es_administrador, es_sistema, activo, version` | Ver §4 |
| `permisos` | existe (global) | `id, codigo, recurso, accion, modulo, nivel_alcance` (`EMPRESA` \| `SUCURSAL` \| `DEPOSITO`), `clase` (`OPERACIONAL` \| `DATO_SENSIBLE` \| `ACCION_CRITICA` \| `ADMINISTRATIVA`) | Catálogo mantido pela plataforma |
| `perfil_permiso` | existe | + `empresa_id` | FK composta para `perfiles` |
| `usuario_perfil` | existe | + `empresa_id, asignado_por, asignado_at` | FK composta para `usuarios` e `perfiles` (fecha G-03) |
| `concesiones_permiso` | inexistente | `id, empresa_id, beneficiario_id, permiso_id, clase` (`DATO_SENSIBLE` \| `ACCION_CRITICA`), `estado`, `canal` (`EMPRESA` \| `PLATAFORMA`), `solicitante_id, motivo, aprobador_id, aprobador_tipo, aprobado_at, rechazo_motivo, vigente_hasta, revocado_por, revocado_at, revocado_motivo, documento_respaldo_id, version` | Uma linha por usuário × permissão controlada (§4.7). FK composta para `usuarios` |
| `concesiones_permiso_eventos` | inexistente | `id, empresa_id, concesion_id, evento, actor_id, actor_tipo, detalle jsonb, created_at` | Histórico imutável de cada transição |
| `autorizaciones_operacion` | inexistente | D-11. `id, empresa_id, operacion_tipo` (`AJUSTE_STOCK` \| `PAGO` \| `NOTA_CREDITO` \| `ANULACION_FACTURA`), `objeto_tipo, objeto_id, objeto_huella` (hash do conteúdo da operação), `solicitante_id, beneficiario_id, justificacion, documento_respaldo_id, estado` (`SOLICITADA` \| `AUTORIZADA` \| `RECHAZADA` \| `CANCELADA` \| `EXPIRADA` \| `CONSUMIDA`), `autorizador_plataforma_id, decidido_at, valida_hasta, consumida_at, version, created_at` | Um registro por operação (§4.7.11); histórico em `autorizaciones_operacion_eventos` (imutável) |
| `parametros_concesion`, `parametros_concesion_historial` | inexistentes | D-12. `clave, valor, empresa_id` (nulo = padrão da plataforma), `version, vigente_desde, modificado_por, motivo`; o histórico guarda valor anterior, valor novo, ator, motivo e hora | Só inserção no histórico; limites rígidos no código (§4.7.8) |
| `usuario_poder_eventos` | inexistente | `empresa_id, usuario_id, permiso_id, evento` (`CONCEDIDO` \| `RETIRADO`), `origen` (perfil, concessão ou plataforma), `atribuido_por, created_at` (relógio do banco) | Base única da antiguidade do poder de aprovar (IND-06, §4.7.8); só inserção |
| `auditoria_acceso` | inexistente no código | `id, empresa_id, actor_tipo` (`USUARIO` \| `PLATAFORMA`), `actor_id, accion, entidad, entidad_id, antes jsonb, despues jsonb, motivo, ip, user_agent, created_at` | Só inserção (§9) |
| `usuarios_plataforma`, `accesos_soporte` | inexistentes | Contas PROCEIT com MFA; concessões de suporte com prazo | §4.6 |

Os menus continuam em código (`lib/navigation/menu.ts`), cada item ligado a uma permissão. O que varia por empresa são os perfis.

### 3.3 Tabelas de negócio
As 46 tabelas de `MODELO-DADOS-ATUAL.md` §2 entram no inventário de tenant da fase 0. As tabelas filhas (`cliente_contactos`, `producto_codigos` etc.) recebem `empresa_id` próprio (redundante, mas permite FK composta e RLS simples), com backfill a partir do pai.

### 3.4 Classificação dos catálogos (F-007)

O código atual trata como globais as tabelas lidas sem filtro de empresa. A classificação final é decidida **depois** da introspecção; nada é global por omissão.

| Tabela | Hoje no código | Proposta | Motivo | Situação |
|---|---|---|---|---|
| `referencia_geografica_*` (4) | global | Global | Dado oficial, igual para todos | Confirmar na fase 0 |
| `monedas` | global | Global | Códigos ISO 4217 | Confirmar na fase 0 |
| `incoterms` | global | Global | Padrão internacional | Confirmar na fase 0 |
| `impuestos` | global | Global, com habilitação por empresa (`empresa_impuesto`) | A alíquota é legal, mas nem toda empresa usa todas | **Decisão pendente** |
| `unidades_medida` | global | Global (códigos SIFEN); apresentações por empresa ficam em `producto_unidades` | O SIFEN exige códigos oficiais | **Decisão pendente** |
| `condiciones_pago` | global | **Por empresa** | Prazo comercial varia por empresa | **Decisão pendente**; exige migration com backfill por empresa |
| `permisos` | global | Global (catálogo da plataforma) | D-03 | — |
| `grupos_*`, `listas_precio`, `rutas_entrega`, `zonas_comerciales`, `vendedores`, `canales_venta`, `medios_pago`, `categorias_producto`, `marcas_producto`, `depositos` | por empresa | Por empresa | — | Já filtradas por empresa no código |

## 4. Proteção contra escalada de privilégios (F-002)

### 4.1 Definições
- **Classes de permissão** (coluna `permisos.clase`; lista na matriz §2.1):
  - `OPERACIONAL`: as do dia a dia.
  - `ADMINISTRATIVA`: `USUARIOS.*`, `PERFILES.*`, `PERMISOS_SENSIBLES.*`, `PERMISOS_CRITICOS.*`, `CONFIGURACION.*`, `AUDITORIA.*`.
  - `DATO_SENSIBLE` (5): ver ou editar custo de produtos, crédito de clientes e dados bancários de fornecedores.
  - `ACCION_CRITICA` (4): aprovar ajuste de estoque, aprovar pagamento, anular fatura, aprovar nota de crédito.
  - `DATO_SENSIBLE` e `ACCION_CRITICA` formam as **permissões controladas**.
- **Permissões controladas nunca ficam em perfil.** Elas só existem como concessão individual, em `concesiones_permiso`, para um usuário e uma permissão, e só valem no estado `APROBADA` e dentro da vigência (§4.7). Assim, ninguém as obtém editando ou atribuindo um perfil (ESC-13).
- **Conjunto efetivo** `P(u)` = (união das permissões `OPERACIONAL` e `ADMINISTRATIVA` dos perfis ativos de `u`) ∪ (permissões das concessões `APROBADA` e vigentes de `u`). Tudo dentro da empresa de `u`. A união nunca amplia empresa nem alcance (D-02).
- **Administrador da empresa**: usuário com ao menos um perfil ativo `es_administrador = true` da própria empresa. É o único critério; o código literal `ADMIN` (`server-context.ts:15`) deixa de ter significado.
- **Conjunto do perfil administrador** (D-06, D-09): todas as permissões `OPERACIONAL` e `ADMINISTRATIVA` da empresa. **Nenhuma** permissão controlada e nenhuma `PLATAFORMA.*`. Ser administrador não dá acesso a custo, crédito, contas bancárias, nem às 4 ações críticas.
- As concessões são por recurso e ação: `PRODUCTOS_COSTO.VER` não traz `CLIENTES_CREDITO.VER`; `PAGOS.APROBAR` não traz `FACTURAS.ANULAR`.

### 4.2 Regras de delegação

Valem para qualquer operação de administração, inclusive as feitas por quem é administrador:

| ID | Regra | Retorno quando violada |
|---|---|---|
| ESC-01 | **Subconjunto:** ninguém concede o que não tem. Criar ou editar um perfil exige que as permissões resultantes sejam ⊆ `P(ator)`. Atribuir um perfil exige o mesmo para as permissões dele. Permissões controladas não passam por aqui: seguem o §4.7 | 403 |
| ESC-02 | **Sem autoalteração:** o ator não altera os próprios perfis, o próprio alcance, o próprio estado nem a própria flag de administrador. Senha e dados pessoais seguem pelo fluxo de "mi cuenta" | 403 |
| ESC-03 | **Perfil próprio:** editar um perfil que o próprio ator tem também obedece à ESC-01, calculada sobre `P(ator)` **antes** da mudança. Assim, ninguém amplia o próprio acesso editando o perfil que usa | 403 |
| ESC-04 | **Flag de administrador:** só um administrador pode criar um perfil `es_administrador`, marcar essa flag ou atribuir esse perfil | 403 |
| ESC-05 | **Permissões administrativas:** só um administrador pode incluí-las num perfil (mesmo que outro ator as tenha) | 403 |
| ESC-06 | **Alcance:** o ator só atribui sucursais e depósitos que estão no próprio alcance (`S(ator)`, `D(ator)`); só quem tem `TODAS`/`TODOS` concede `TODAS`/`TODOS` | 403 |
| ESC-07 | **Último administrador:** nenhuma operação pode deixar a empresa sem ao menos um administrador **ativo**: remover perfil, bloquear, dar baixa, desativar o perfil, desmarcar a flag. A checagem roda na mesma transação, depois de `SELECT … FROM empresas WHERE id = $1 FOR UPDATE`, que serializa as alterações de administração por empresa | 409 "La empresa debe conservar al menos un administrador activo." |
| ESC-08 | **Perfil de sistema:** o perfil `es_sistema` (administrador criado no bootstrap) não pode ser apagado, desativado nem ter as permissões editadas | 409 |
| ESC-09 | **Catálogo fechado:** só códigos existentes em `permisos`; `PLATAFORMA.*` nunca é aceito numa API de empresa | 422 |
| ESC-10 | **Concorrência:** toda edição de usuário ou de perfil envia a versão lida (`version_acceso` / `version`); se outra pessoa alterou antes, a resposta é 409 e nada é gravado (bloqueio otimista) | 409 |
| ESC-11 | **Identificadores de outra empresa:** perfil, usuário, sucursal ou depósito de outra empresa no corpo ou na URL tem o mesmo tratamento de "não existe" | 404 |
| ESC-12 | **Concessão controlada só pelo fluxo:** permissões `DATO_SENSIBLE` e `ACCION_CRITICA` só são obtidas por solicitação em `concesiones_permiso`, com motivo, aprovada conforme o §4.7. O solicitante precisa de `PERMISOS_SENSIBLES.ASIGNAR` ou `PERMISOS_CRITICOS.ASIGNAR`, conforme a classe, e nunca é o beneficiário | 403 (sem permissão ou solicitante = beneficiário); 422 (sem motivo) |
| ESC-13 | **Nenhum perfil contém permissão controlada:** criar ou editar um perfil com `DATO_SENSIBLE` ou `ACCION_CRITICA` é recusado, seja ele administrador ou não | 422 |
| ESC-14 | **Independência (D-10):** o aprovador de uma concessão precisa ser independente do solicitante **e** do beneficiário, pelas regras IND-01 a IND-07 (§4.7.3), verificadas na aprovação e de novo no uso | 403, com a regra IND violada no evento |
| ESC-15 | **Segregação na operação (D-09):** quem cria ou solicita uma operação crítica (ajuste, pagamento, nota de crédito, anulação de fatura) não a aprova. "Mesma pessoa" = mesma conta **ou** mesma identidade (IND-04). A checagem acontece no servidor, dentro da transação da aprovação, com alcance de empresa/sucursal/depósito | 403 |
| ESC-16 | **Operação crítica sem aprovador independente (D-11):** se não há conta que cumpra IND-01 a IND-07, a operação só executa com autorização formal da PROCEIT **para aquela operação** (§4.7.11), de uso único e ligada ao objeto e à versão | 403 ou 409, com a regra no evento |

### 4.3 Versão e auditoria
- Cada mudança de perfis, alcance ou estado incrementa `usuarios.version_acceso`. Cada mudança de permissões de um perfil incrementa `perfiles.version`.
- Toda operação grava em `auditoria_acceso`, na mesma transação, o **antes e o depois** (conjuntos de perfis, permissões e alcance; nunca senha, hash ou token), o ator e o motivo, quando houver.
- Uma tentativa negada por qualquer regra ESC gera `ACCESO_DENEGADO` em `eventos_seguridad`, com a regra violada.
- Toda transição de concessão controlada fica em `concesiones_permiso_eventos` e em `auditoria_acceso` (§4.7.6). Um relatório de concessões vigentes, pendentes e recusadas serve à revisão periódica pelo responsável da empresa (proposta: trimestral).

### 4.4 Bootstrap seguro de uma empresa
1. Só uma conta de plataforma com `PLATAFORMA.EMPRESAS_CREAR` (com MFA) executa o procedimento.
2. Numa única transação: cria a empresa, uma sucursal inicial, o perfil `ADMINISTRADOR` (`es_administrador`, `es_sistema`, sem permissão controlada, D-06/D-09) e o primeiro usuário, com alcance `TODAS`/`TODOS` concedido explicitamente e registrado (D-05), `creado_por_tipo = PLATAFORMA`, senha temporária aleatória e `debe_cambiar_contrasena = true`.
3. **Aprovador independente da empresa (recomendado):** no mesmo onboarding, a plataforma pode criar uma segunda conta para uma pessoa diferente indicada formalmente pela empresa (por exemplo, sócio ou representante legal), com identidade verificada (IND-04), MFA e um perfil com `PERMISOS_SENSIBLES.APROBAR` e `PERMISOS_CRITICOS.APROBAR`. Por ter sido criada pela plataforma, ela é independente do primeiro administrador (IND-02). Sem essa conta, as concessões controladas da empresa seguem a exceção formal da PROCEIT (§4.7.5).
4. As senhas temporárias são mostradas uma única vez a quem executou e entregues por canal separado; nunca vão para log, repositório ou auditoria.
5. No primeiro login, o usuário só consegue trocar a senha e ativar o MFA (obrigatório para quem tem poder de aprovar).
6. Nenhuma conta nasce com permissão controlada.
7. A função `017_administrador_inicial` citada no README é avaliada na fase 0: se já fizer isso, é reaproveitada; se tiver senha fixa, é substituída.

### 4.5 Mudança de permissões e revogação
- Permissões nunca são guardadas no cookie nem em cache: cada requisição recalcula `P(u)` (§8). Por isso, retirar uma permissão vale a partir da requisição seguinte.
- Bloquear, dar baixa ou trocar a senha revoga as sessões abertas do usuário na mesma transação (§8).

### 4.6 Plataforma PROCEIT (D-03)
- Contas em `usuarios_plataforma`, separadas, com MFA obrigatório e login separado.
- **Não existe bypass no código**: nem flag, nem usuário mágico, nem variável de ambiente que libere tudo.
- Suporte dentro de uma empresa: concessão em `accesos_soporte`, com empresa, motivo, permissões (somente leitura por padrão) e expiração (padrão: 60 minutos). O acesso aparece na auditoria **da própria empresa** e pode ser revogado antes do prazo.
- Uma conta de plataforma não usa as telas da empresa sem uma concessão ativa.
- **Aprovação formal de concessão controlada pela PROCEIT:** só pelo procedimento do §4.7.5, com a permissão de plataforma `PLATAFORMA.CONCESIONES_APROBAR`, por uma pessoa da PROCEIT identificada, com MFA. A conta de plataforma nunca é beneficiária de concessão de empresa.
- **Autorização por operação (D-11, §4.7.11):** `PLATAFORMA.OPERACIONES_AUTORIZAR`. **Parâmetros de concessão (D-12, §4.7.8):** `PLATAFORMA.PARAMETROS_CONCESION_EDITAR`. As duas exigem MFA recente e motivo.

### 4.7 Concessões controladas (D-09, D-10)

Regras únicas para as 9 permissões controladas (5 `DATO_SENSIBLE` e 4 `ACCION_CRITICA`). Uma concessão é sempre **um beneficiário × uma permissão**.

#### 4.7.1 Papéis
| Papel | Quem é | Permissão exigida |
|---|---|---|
| Solicitante | Quem propõe a concessão | `PERMISOS_SENSIBLES.ASIGNAR` (dado sensível) ou `PERMISOS_CRITICOS.ASIGNAR` (ação crítica) |
| Aprovador | Quem decide | `PERMISOS_SENSIBLES.APROBAR` ou `PERMISOS_CRITICOS.APROBAR`, MFA ativo e independência (§4.7.3) |
| Beneficiário | Quem recebe o acesso | Usuário ativo da mesma empresa; nunca é solicitante nem aprovador da própria concessão |
| Aprovador de plataforma | Pessoa da PROCEIT, só na exceção do §4.7.5 | `PLATAFORMA.CONCESIONES_APROBAR`, MFA |

Para **dado sensível (D-10)**, solicitante, aprovador e beneficiário são sempre três contas independentes entre si. Para **ação crítica (D-09)**, a concessão também passa por aprovação explícita, com as mesmas regras de independência. O administrador não tem nenhuma das 9 permissões por ser administrador.

#### 4.7.2 Estados
| Estado | Concede acesso? | Como se chega | Quem |
|---|---|---|---|
| `SOLICITADA` | Não | Criação da solicitação, com motivo | Solicitante |
| `APROBADA` | **Sim**, enquanto vigente | Aprovação válida (§4.7.4) | Aprovador independente ou PROCEIT (§4.7.5) |
| `REJEITADA` | Não | Recusa, com motivo | Aprovador |
| `CANCELADA` | Não | Desistência antes da decisão | Solicitante |
| `REVOGADA` | Não (a partir da próxima requisição) | Retirada, com motivo | Solicitante, aprovador, administrador com a permissão `*.ASIGNAR` da classe ou PROCEIT; também automática quando o beneficiário é bloqueado ou recebe baixa |
| `EXPIRADA` | Não | Fim da vigência ou solicitação sem decisão no prazo | Automático (verificado na leitura; nenhum processo apaga dados) |

- **Vigência aprovada (D-12):** dado sensível 180 dias; ação crítica 365 dias; solicitação sem decisão expira em 7 dias. Os valores são parâmetros controlados (§4.7.8), nunca sem limite. A vigência (`vigente_hasta`) é gravada na aprovação, a partir do instante da decisão, e não muda quando o parâmetro muda depois. Renovar = nova solicitação (§4.7.9).
- Um prazo não é direito: bloqueio, revogação ou expiração retiram a capacidade na próxima requisição (§4.7.6, §8.2).
- Transições permitidas: `SOLICITADA → APROBADA | REJEITADA | CANCELADA | EXPIRADA`; `APROBADA → REVOGADA | EXPIRADA`. Os estados finais não mudam mais.
- Não existe solicitação duplicada: uma única concessão `SOLICITADA` ou `APROBADA` por beneficiário × permissão (índice único parcial, proposto). A renovação (§4.7.9) é a única exceção: pode existir uma `SOLICITADA` de renovação enquanto a anterior está `APROBADA`.

#### 4.7.3 Regras de independência (ESC-14)
O aprovador `A` é independente do solicitante `S` e do beneficiário `B` somente se **todas** valerem, para cada par (A,S) e (A,B):

| ID | Regra | O que impede |
|---|---|---|
| IND-01 | Contas diferentes: `A ≠ S`, `A ≠ B` e `S ≠ B` | Autoaprovação direta e autossolicitação |
| IND-02 | **Linhagem de criação:** `A` não é ancestral nem descendente de `S` ou de `B` na cadeia `usuarios.creado_por` (contas criadas pela plataforma são raízes) | Um operador criar uma conta alternativa, ou uma cadeia de contas, para aprovar o próprio pedido |
| IND-03 | **Linhagem de poder:** o perfil ou a concessão que dá a `A` o poder de aprovar não foi atribuído por `S` nem por `B`, nem por uma conta descendente deles | Um operador dar poder de aprovação a uma conta que ele controla |
| IND-04 | **Identidade:** `A`, `S` e `B` têm `documento_hash` e e-mail verificado distintos; contas sem identidade verificada não aprovam | Duas contas da mesma pessoa |
| IND-05 | **MFA:** `A` tem MFA ativo, e a aprovação exige um fator novo naquele momento | Uso da sessão de outra pessoa |
| IND-06 | **Antiguidade (D-12):** `A` tem o poder de aprovar, de forma contínua, há pelo menos 7 dias, medidos em `usuario_poder_eventos` com o relógio do banco (§4.7.8). Não se contorna por troca de conta, perfil ou administrador, nem por parâmetro alterado depois | Montar uma estrutura e aprovar no mesmo dia |
| IND-07 | **Estado:** `A`, `S` e `B` estão ativos, na mesma empresa, e o alcance da permissão é compatível com o de `B` | Aprovação a conta bloqueada ou fora do alcance |

Consequência prática: numa empresa em que todas as contas foram criadas pelo único administrador, nenhuma conta é independente dele, e as concessões em que ele participa (como solicitante ou beneficiário) seguem a exceção formal do §4.7.5. O caminho recomendado é o onboarding com aprovador independente criado pela plataforma (§4.4, passo 3).

**O que IND-01 a IND-07 não garantem.** São controles de detecção e bloqueio de relações **registradas no sistema**. Não provam que duas contas são pessoas diferentes, nem que a mesma pessoa não tem outra identidade. A evidência exigida e os limites estão no §4.7.10. Conluio entre duas pessoas reais não é bloqueável por regra técnica; é tratado por auditoria, relatório periódico, revisão humana e responsabilidade contratual da empresa (§13).

#### 4.7.4 Aprovação sem condição de corrida
Tudo numa única transação (`withTenantTx`):
1. `SELECT … FROM concesiones_permiso WHERE id = $1 AND empresa_id = $2 FOR UPDATE`; o estado precisa ser `SOLICITADA` e não expirado, e a `version` precisa ser a lida pelo aprovador. Senão → 409.
2. Trava compartilhada (`FOR SHARE`) nas linhas de `usuarios` de A, S e B e na linha da empresa (§8.3). Assim, um bloqueio ou uma baixa concorrente espera ou faz a aprovação falhar.
3. Revalida IND-01 a IND-07, as permissões de A e o alcance de B **com os dados do momento**.
4. Grava `APROBADA`, `aprobador_id`, `aprobado_at`, `vigente_hasta`, `version + 1`, o evento em `concesiones_permiso_eventos` e em `auditoria_acceso`.

Duas aprovações simultâneas: a segunda espera a trava, encontra `APROBADA` e recebe 409. Aprovação e cancelamento simultâneos: o primeiro a travar vence; o outro recebe 409.

#### 4.7.5 Exceção formal da PROCEIT (empresa sem aprovador independente)
1. A solicitação é criada normalmente pelo solicitante. O sistema verifica se existe na empresa alguma conta que cumpra IND-01 a IND-07; se não existir, o canal passa a `PLATAFORMA`, e a solicitação fica `SOLICITADA` aguardando a PROCEIT. **Nada é concedido automaticamente.**
2. A empresa envia um pedido formal, assinado pelo representante legal registrado no onboarding. O documento fica vinculado à solicitação (`documento_respaldo_id`, armazenado no módulo de arquivos da empresa).
3. Uma pessoa da PROCEIT, identificada pelo nome na conta de plataforma, com MFA e `PLATAFORMA.CONCESIONES_APROBAR`, confere o documento e aprova ou recusa pelo mesmo procedimento do §4.7.4. A aprovação registra `aprobador_tipo = PLATAFORMA`.
4. A pessoa da PROCEIT não pode ser beneficiária nem ter acesso aos dados concedidos; a decisão aparece na auditoria **da empresa**.
5. A exceção **não dispensa** MFA, aprovação formal nem auditoria (D-12, condição 5). A aprovação da PROCEIT vale também com o antigo prazo: vigência e expiração são as do §4.7.2.
6. Junto com a decisão, a PROCEIT recomenda o cadastro de um aprovador independente (§4.4, passo 3) para que a exceção não vire rotina. Um relatório da plataforma lista as empresas que dependem da exceção.

#### 4.7.6 Uso, revalidação e revogação
- **Uso:** toda leitura de dado sensível e toda execução de ação crítica revalida a concessão **dentro da transação** (`SELECT … FOR SHARE` na linha da concessão: estado `APROBADA`, vigência, beneficiário ativo, alcance). Sem isso, nada é devolvido: a API não retorna o campo sensível, nem mascarado com dígitos reais. Também não há prévia para o aprovador, que decide sobre o acesso, não sobre os dados.
- **Revogação:** `UPDATE … SET estado = 'REVOGADA'` trava a mesma linha; uma leitura ou execução em curso termina antes, ou falha depois. Vale a partir da próxima requisição (§8.2).
- **Revogação automática:** bloquear, dar baixa ou suspender a empresa revoga as concessões do beneficiário na mesma transação.
- **Perda de independência depois da aprovação** (por exemplo, o aprovador recebeu o mesmo documento por correção cadastral): a concessão é marcada para revisão no relatório; não é revogada sozinha, para não interromper a operação sem decisão humana.
- **Registro de cada transição:** solicitação, solicitante, aprovador e tipo, beneficiário, motivo, empresa, permissão, horários, decisão, vigência, revogação e quem revogou. Nunca o conteúdo do dado sensível.

#### 4.7.7 Segregação nas operações críticas (ESC-15) e empresa com único operador (D-11)
| Operação | Quem cria | Quem aprova ou executa a ação crítica |
|---|---|---|
| Ajuste de estoque | `AJUSTES_STOCK.CREAR` | Concessão `AJUSTES_STOCK.APROBAR`; nem a mesma conta nem a mesma identidade de quem criou |
| Pagamento | `PAGOS.CREAR` | Concessão `PAGOS.APROBAR`; idem |
| Nota de crédito | `NOTAS_CREDITO.CREAR` | Concessão `NOTAS_CREDITO.APROBAR`; idem |
| Anulação de fatura | Solicitação de anulação (`FACTURAS.VER` + motivo) | Concessão `FACTURAS.ANULAR`; não pode ser quem emitiu a fatura nem quem pediu a anulação |

**Quando a D-11 se aplica.** No momento de aprovar ou executar uma operação crítica, o sistema procura uma conta que cumpra IND-01 a IND-07 em relação a quem criou o registro. Se existir, vale a segregação normal acima. Se **não existir** (empresa com um único operador, ou sem segunda pessoa independente), a operação **não** pode ser aprovada na empresa: exige a autorização formal da PROCEIT **para aquela operação** (§4.7.11). O sistema decide o canal, não o operador: não há campo, perfil, flag ou parâmetro da empresa que faça a D-11 deixar de valer.

Isto não é uma permissão geral. A concessão `*.APROBAR` do §4.7.1 continua necessária para o beneficiário **e** a autorização por operação passa a ser obrigatória adicionalmente nesse caso: uma sem a outra não executa nada. A autorização PROCEIT de uma operação não vira concessão permanente nem cobre a operação seguinte, mesmo igual.

#### 4.7.8 Parametrização controlada (D-12)
| Parâmetro | Valor aprovado | Limite rígido (no código) | Quem altera |
|---|---|---|---|
| `concesion_dias_dato_sensible` | 180 | de 1 a 180 | PROCEIT |
| `concesion_dias_accion_critica` | 365 | de 1 a 365 | PROCEIT |
| `solicitud_dias_decision` | 7 | de 1 a 7 | PROCEIT |
| `aprobador_antiguedad_dias` | 7 | de 7 a 90 | PROCEIT |

- **Onde ficam:** `parametros_concesion` (padrão da plataforma). Uma empresa pode receber, por pedido formal à PROCEIT, valor **mais restritivo** que o padrão (prazo menor, antiguidade maior). Valor mais frouxo que o aprovado, ou fora do limite rígido, só muda com **nova decisão do responsável** registrada no GitHub e nova versão deste desenho. O teto não é editável por tela nem por API.
- **Quem pode alterar:** pessoa da PROCEIT com a permissão de plataforma `PLATAFORMA.PARAMETROS_CONCESION_EDITAR` e MFA recente. Nenhuma permissão de empresa, nem `CONFIGURACION.EDITAR`, altera estes parâmetros.
- **Cada alteração exige motivo** e grava: parâmetro, valor anterior, valor novo, versão, ator, motivo, hora e IP, em `parametros_concesion_historial` (só inserção) e em `auditoria_acceso`. Uma alteração sem motivo → 422; fora do limite → 422; sem a permissão → 403.
- **Sem efeito retroativo.** O valor muda só para as aprovações **posteriores**. A concessão `APROBADA` guarda o `vigente_hasta` calculado na aprovação e a versão do parâmetro usada. Para encurtar uma concessão existente é preciso revogá-la (§4.7.6), com motivo.
- **Antiguidade não contornável (D-12, condição 4):** a contagem vem de `usuario_poder_eventos`, escrita só pelo servidor com o relógio do banco; o cliente nunca informa a data. A contagem recomeça se o poder for retirado e dado de novo, se o aprovador trocar de conta, de perfil de origem ou de empresa, ou se a identidade (documento) mudar. Reduzir o parâmetro não adianta além do piso de 7 dias do código; aumentá-lo vale para as decisões futuras.
- Os testes usam um relógio injetável para os casos de limite (§11.11).

#### 4.7.9 Renovação, expiração e urgência
- **Renovação:** só por nova solicitação e nova aprovação, pelas regras de D-09 e D-10 (inclusive independência e MFA). Nada é renovado automaticamente. Enquanto a renovação está `SOLICITADA`, a concessão anterior segue até o seu `vigente_hasta`; ao aprovar a renovação, a vigência nova conta da decisão e a anterior passa a `EXPIRADA` (motivo `RENOVADA`). Se vencer antes da decisão, o beneficiário fica sem acesso.
- **Aviso:** um relatório lista as concessões que vencem em breve (janela inicial a confirmar pelo responsável), para pedir a renovação a tempo.
- **Expiração:** verificada na leitura e no uso (`now() > vigente_hasta` ou `now() > created_at + solicitud_dias_decision`); nenhuma tarefa agendada é necessária para negar acesso. O estado `EXPIRADA` é gravado na primeira leitura ou pelo relatório.
- **Urgência:** não existe atalho. A urgência usa o mesmo fluxo pelo canal `PLATAFORMA` (§4.7.5): pedido formal, documento, aprovador PROCEIT com MFA e auditoria. Não encurta a antiguidade, não altera parâmetros e não cria concessão sem registro. O motivo "urgente" fica no pedido. Se faltar um aprovador com a antiguidade exigida, a PROCEIT aprova como no §4.7.5; não se rebaixa IND-06.

#### 4.7.10 Evidências de independência e limites da verificação de identidade (R04-F-002)
**Evidência exigida para uma conta poder ser aprovadora independente** (registrada no onboarding ou na mudança, e conferida por pessoa da PROCEIT):
1. Identificação oficial do titular (tipo de documento, número só como `documento_hash` com chave da plataforma, país e data da conferência) e referência à evidência arquivada, conferida pelo nome do responsável da PROCEIT que verificou.
2. Verificação do e-mail e MFA cadastrado (data do cadastro do fator).
3. Origem autenticada da conta (`creado_por`, `creado_por_tipo`) e do poder de aprovar (`usuario_poder_eventos.atribuido_por`).
4. Declaração da empresa de que o aprovador não é subordinado nem representante do solicitante para este fim (documento vinculado).
5. Revisão periódica humana da lista de aprovadores e de concessões (frequência a definir pelo responsável; proposta: semestral), com registro de quem revisou.

**Contas sem origem conhecida** (importadas, criadas por SQL ou migradas, sem `creado_por`) recebem `creado_por_tipo = IMPORTADO` e **não aprovam** até uma conferência humana registrada.

**O que isto não garante** (declarado, não escondido):
- O sistema não consegue provar que um documento é autêntico, nem que a pessoa que o apresenta é o titular. Um documento falso, ou uma pessoa com dois documentos válidos, passa por IND-04.
- Duas contas com identidades diferentes podem ser usadas pela mesma pessoa, ou por pessoas que combinam (conluio). O compartilhamento de credenciais e de dispositivo MFA não é detectável com certeza.
- Vínculos criados fora do sistema (parentesco, subordinação, acordos) não aparecem em `creado_por`.
- A linhagem de contas **reduz** o risco de autoconcessão pelo mesmo operador; não o elimina. A mitigação final é humana: conferência de identidade, revisão periódica, relatório de concessões e responsabilidade contratual.
- Com a PROCEIT sendo hoje uma empresa de uma única pessoa, a autorização por operação (§4.7.11) e a edição dos parâmetros dependem da mesma pessoa. Isso é uma concentração de função: compensada por MFA, auditoria na empresa e na plataforma, assinatura do documento pela empresa e revisão pelo responsável, e deve ser reavaliada se a equipe crescer.

#### 4.7.11 Autorização formal por operação (D-11)
**Estados:** `SOLICITADA → AUTORIZADA | RECHAZADA | CANCELADA | EXPIRADA`; `AUTORIZADA → CONSUMIDA | EXPIRADA | CANCELADA`. `CONSUMIDA`, `RECHAZADA`, `CANCELADA` e `EXPIRADA` são finais. Só `AUTORIZADA` e vigente permite executar, uma vez.

1. **Solicitação.** O operador cria a operação crítica (ela fica pendente e sem efeito). O sistema detecta que não há aprovador independente (§4.7.7), cria a `autorizaciones_operacion` com: empresa, operador (solicitante e beneficiário), tipo de operação, objeto e sua `objeto_huella`, justificativa (obrigatória) e o documento formal de respaldo da empresa, assinado pelo representante legal. Sem documento ou sem justificativa → 422.
2. **Análise.** Pessoa da PROCEIT identificada, com MFA recente e `PLATAFORMA.OPERACIONES_AUTORIZAR`, confere o documento e a operação e decide, com motivo. Não pode ser beneficiária, nem ter dado da empresa por outra concessão.
3. **Decisão tomada numa única transação**, com `FOR UPDATE` na autorização e `FOR SHARE` em empresa e operador (§4.7.4, §8.3). Duas decisões simultâneas: a segunda recebe 409. Se a operação mudou desde a solicitação (a `objeto_huella` já não bate) → 409 e é preciso nova solicitação.
4. **Execução.** Na transação da execução: `SELECT … FOR UPDATE` na autorização; precisa estar `AUTORIZADA`, da mesma empresa, do mesmo executor, do mesmo `objeto_id` e da mesma `objeto_huella` **calculada naquele instante**, e dentro de `valida_hasta`. Então marca `CONSUMIDA` com `consumida_at` e executa a operação no mesmo commit. Qualquer falha desfaz tudo; a autorização só vira `CONSUMIDA` junto com a operação. Uma segunda execução (replay) encontra `CONSUMIDA` → 409.
5. **Validade da autorização.** `valida_hasta` é pequena e configurável (valor inicial **proposto** em 72 horas; **a confirmar pelo responsável**, pois a D-12 não fixou este prazo). Solicitação sem decisão expira em `solicitud_dias_decision` (7 dias). Se a PROCEIT **rejeita**, a operação não é aprovada nem executada; ela permanece pendente até ser cancelada ou corrigida e solicitada de novo.
6. **Registro.** Cada transição grava solicitante, beneficiário, responsável PROCEIT, data e hora, decisão, motivo, documento vinculado e ID da operação, **na auditoria da empresa** (`auditoria_acceso`) **e** na trilha da plataforma. Eventos: `AUTORIZACION_OPERACION_SOLICITADA/AUTORIZADA/RECHAZADA/CANCELADA/EXPIRADA/CONSUMIDA`.
7. **Não vira regra permanente.** Não existe "autorizar todas as operações deste tipo", nem autorização com validade de dias, nem reuso por outra operação com o mesmo valor.
8. **Empresa com mais de um operador.** Se existe conta independente (IND-01 a IND-07), esse fluxo não se aplica e vale a segregação normal. Se a independência existente deixar de valer (aprovador bloqueado, por exemplo), o sistema volta a exigir a autorização PROCEIT; a verificação é feita a cada operação, não uma vez só.

#### 4.7.12 Revogação (D-11 e D-12)
- A revogação de uma concessão (§4.7.6) vale na próxima requisição. Uma `autorizaciones_operacion` `AUTORIZADA` do beneficiário revogado, bloqueado ou com baixa passa a `CANCELADA` na mesma transação.
- A PROCEIT pode cancelar uma autorização `AUTORIZADA` ainda não consumida, com motivo.
- Alterar um parâmetro (§4.7.8) nunca encurta nem prolonga concessão existente; só a revogação e a expiração retiram o acesso.

## 5. Isolamento completo entre empresas (F-004, RN-01, RN-02, RN-11)

### 5.1 Contrato da camada de dados
1. **Só a camada de dados (`lib/data/**`) e a camada de autenticação (`lib/auth/**`) importam `@/lib/db`.** Regra `no-restricted-imports` no ESLint e um teste estático garantem isso. Route handlers, Server Components e Server Actions chamam funções da camada de dados, nunca SQL.
2. **Toda função da camada de dados recebe o `AccessContext` como primeiro parâmetro** e executa as consultas dentro de `withTenantTx(ctx, fn)`, inclusive as leituras (com `BEGIN READ ONLY`). `pool.query` direto é proibido por lint.
3. **Toda consulta filtra `empresa_id = ctx.empresaId` explicitamente**, mesmo depois da RLS (duas barreiras independentes).
4. **Busca por ID** é sempre `WHERE id = $1 AND empresa_id = $2`. Sem linha → 404, sem revelar se o ID existe em outra empresa.
5. **Exportações** usam as mesmas funções da listagem: mesmo filtro, mesmo alcance.
6. **Catálogos globais** (§3.4) são lidos por funções separadas (`withGlobalRead`), que listam explicitamente as tabelas permitidas e são só leitura para usuários de empresa.

### 5.2 `withTenantTx`
```ts
async function withTenantTx<T>(ctx: AccessContext, fn: (tx: Tx) => Promise<T>, opts?: { readOnly?: boolean }) {
  const client = await pool.connect();
  try {
    await client.query(opts?.readOnly ? "BEGIN READ ONLY" : "BEGIN");
    await client.query(
      "SELECT set_config('app.empresa_id', $1, true), set_config('app.usuario_id', $2, true), set_config('app.ip', $3, true)",
      [ctx.empresaId, ctx.usuarioId, ctx.ip ?? ""],
    );
    await revalidarAcceso(client, ctx);   // §8.3: trava compartilhada em empresa e usuário + versão
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
```
- `set_config(..., true)` vale **só até o fim da transação**. No `COMMIT` ou no `ROLLBACK`, o PostgreSQL descarta os valores, então uma conexão devolvida ao pool não carrega a empresa anterior. Nunca se usa `SET` de sessão.
- Qualquer erro, inclusive de validação, provoca `ROLLBACK`; nada é gravado pela metade.
- Se a conexão estiver quebrada, `release(err)` a descarta do pool.

### 5.3 Papéis SQL e RLS (fase 5)
| Papel | Uso | Atributos |
|---|---|---|
| `distribunex_owner` | Dono das tabelas | `NOLOGIN`; ninguém se conecta com ele |
| `distribunex_migrator` | Aplicar migrations pelo pipeline | `LOGIN`, `BYPASSRLS`; credencial só no segredo do pipeline; nunca usado pela aplicação |
| `distribunex_app` | Aplicação | `LOGIN`, **sem** `BYPASSRLS`, não é dono; só `SELECT/INSERT/UPDATE` nas tabelas de negócio; **sem `DELETE`** (baixa lógica); só `INSERT` em `auditoria_acceso` |
| `distribunex_auth` | Login e leitura de sessão antes de existir contexto de empresa | Só `SELECT` em `empresas` (colunas de login), `usuarios` (colunas de login) e `sesiones_usuario`; `UPDATE` só de tentativas e sessão; `INSERT` em `eventos_seguridad`. Nenhum acesso a tabelas de negócio |
| `distribunex_plataforma` | Operações da plataforma (bootstrap, suspensão) | Usado só pelo serviço de plataforma, com auditoria |

- Cada tabela de empresa recebe `ENABLE` e `FORCE ROW LEVEL SECURITY`, com a política `USING (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid)` e o mesmo `WITH CHECK`. Sem contexto, a expressão fica nula e nenhuma linha passa: a política falha fechada.
- Funções `SECURITY DEFINER`: proibidas para dados de empresa. As que existirem (consulta Q7 da introspecção) são revisadas uma a uma; se forem mantidas, recebem `SET search_path = pg_catalog, public` fixo e conferem `app.empresa_id` internamente.
- O tipo de `id` (`uuid`) é presumido a partir de `randomUUID()` no código; confirmar na fase 0.

### 5.4 Next.js
- As rotas e páginas privadas são sempre dinâmicas (dependem de `cookies()`); dados de empresa **nunca** entram no cache de dados do Next.js (`unstable_cache`, `fetch` com cache) nem num cache em memória entre requisições. Só é permitido o `cache()` do React, que vale para uma requisição.
- Logs de erro trazem `empresa_id` e um ID de correlação, sem dados pessoais nem mensagens do banco para o cliente.

### 5.5 Referências recebidas no corpo
`assertMismaEmpresa(tx, tabla, id, ctx)` em **todo** ID recebido (fecha G-05 antes mesmo das FKs compostas), com a lista de tabelas permitidas tipada, como já faz `validarReferenciaEmpresa`. Depois da fase 5, as FKs compostas garantem o mesmo no banco.

### 5.6 Operações sem usuário (futuras)
Rotinas agendadas e integrações (por exemplo, o SIFEN) rodam com um contexto explícito de empresa, criado por um serviço de plataforma auditado. Não existe contexto "sistema" com acesso a todas as empresas.

## 6. Alcance por sucursal e depósito (F-003, RN-07)

### 6.1 Conjuntos permitidos
Para um usuário `u` da empresa `e`, recalculados a cada requisição:

- `S(u)` = todas as sucursais ativas de `e`, se `alcance_sucursales = TODAS`; senão, as sucursais atribuídas que estão ativas.
- `D(u)` = todos os depósitos ativos cuja sucursal ∈ `S(u)`, se `alcance_depositos = TODOS`; senão, os depósitos atribuídos que estão ativos **e** cuja sucursal ∈ `S(u)`.

O depósito sempre fica dentro da sucursal. Um depósito atribuído de uma sucursal que não está em `S(u)` não dá acesso.

### 6.2 Coerência na gravação
| Situação ao salvar o alcance | Resultado |
|---|---|
| Depósito atribuído cuja sucursal não está atribuída (com `ASIGNADAS`) | 422 "El depósito pertenece a una sucursal no asignada." |
| Sucursal padrão fora de `S(u)` | 422 |
| Sucursal ou depósito de outra empresa | 404 (ESC-11) |
| `alcance_sucursales = TODAS` com `alcance_depositos = ASIGNADOS` | Permitido (ex.: vendedor de todas as sucursais sem acesso a depósito) |
| `ASIGNADAS` sem nenhuma sucursal | Permitido; o usuário só acessa recursos de nível empresa (D-05) |
| Perfil administrador | Alcance forçado para `TODAS`/`TODOS` (o administrador poderia se conceder de qualquer forma) |

### 6.3 Regra de autorização
Uma ação é permitida quando: (1) a permissão está em `P(u)`, (2) o alvo é da empresa do usuário e (3) o alvo está no alcance exigido pelo nível da permissão:

| Nível | Exigência |
|---|---|
| EMPRESA | (1) e (2) |
| SUCURSAL | + `registro.sucursal_id ∈ S(u)`; na criação, a sucursal informada ∈ `S(u)` |
| DEPOSITO | + cada depósito envolvido ∈ `D(u)`, conforme §6.4 |

As listagens filtram por `S(u)`/`D(u)`. Os totais (por exemplo, o stock consolidado) somam só o que está no alcance, e a tela indica "en sus depósitos".

### 6.4 Operações de estoque
| Operação | Origem | Destino | Observação |
|---|---|---|---|
| Entrada, recepção, ajuste positivo | — | ∈ `D(u)` | |
| Saída, ajuste negativo, reserva, liberação, quarentena | ∈ `D(u)` | — | |
| Transferência na mesma sucursal | ∈ `D(u)` | ∈ `D(u)` | Uma etapa; os dois saldos mudam na mesma transação |
| Transferência entre sucursais — envio | ∈ `D(u)` do remetente | qualquer depósito ativo da empresa | Ciclo completo na §6.4.1 (D-08) |
| Transferência entre sucursais — recebimento | — | ∈ `D(u)` do recebedor | Validação independente da do envio (§6.4.1) |

Em todas: o alcance é conferido **dentro da transação** que grava o movimento, depois de travar as linhas de saldo envolvidas (`SELECT … FOR UPDATE`, em ordem fixa de `deposito_id` para evitar deadlock). Assim, o alcance e o saldo são validados no mesmo instante da gravação.

### 6.4.1 Transferência entre sucursais (D-08)

Estados da transferência (`transferencias_stock`, entidade nova a modelar no REQ de stock, depois da fase 0):

| Estado | Como se chega | Quem pode | Efeito no estoque | Permissão |
|---|---|---|---|---|
| `EN_TRANSITO` | Envio confirmado | Usuário com a origem em `D(u)` | Origem: `disponible − q`; destino: `transito + q`. O estoque em trânsito pertence à empresa, entra no saldo virtual (`lib/mocks/movimientos-stock-storage.ts:145`) e é valorizado ao custo da origem | `MOVIMIENTOS_STOCK.CREAR` na origem |
| `RECIBIDA` | Recebimento de toda a quantidade | Usuário com o destino em `D(u)` (pode ser outro usuário) | Destino: `transito − q`, `disponible + q` | `MOVIMIENTOS_STOCK.CREAR` no destino |
| `RECIBIDA_CON_DIFERENCIA` | Recebimento de quantidade menor que a enviada | Idem | Destino recebe a quantidade conferida; a diferença vai para "diferencia en tránsito", fora do disponível | Idem; a diferença gera uma conciliação |
| `CANCELADA` | Cancelamento antes de qualquer recebimento | Usuário com a origem em `D(u)` | Origem: `disponible + q`; destino: `transito − q` | `MOVIMIENTOS_STOCK.ANULAR` na origem |
| `CONCILIADA` | Diferença tratada: encontrada (volta ao disponível do destino ou da origem) ou baixada como perda | Quem cria a conciliação + aprovador diferente | Perda vira um ajuste negativo vinculado à transferência | `AJUSTES_STOCK.CREAR` + `AJUSTES_STOCK.APROBAR` (aprovador ≠ criador) |

Regras:
- O envio valida só a origem; o recebimento valida só o destino. Cada validação é independente, no momento da própria gravação, dentro da transação e com as linhas de saldo travadas (§6.4).
- Uma transferência `RECIBIDA` ou `CONCILIADA` não pode ser cancelada; correções posteriores são uma nova transferência ou um ajuste.
- Transferências em trânsito há mais de N dias (N configurável por empresa; proposta: 7) aparecem num relatório de pendências.
- Todos os passos ficam no histórico da transferência, com usuário, data e quantidade.

### 6.5 Depósitos de terceiros
O campo "propietario" já aparece nas recepções demo (`lib/mocks/recepciones-storage.ts:247`). Proposta: `depositos.es_de_terceros` e o proprietário no saldo/lote. As regras de alcance são as mesmas; a valorização do estoque exclui o de terceiros. Não há permissão extra nesta fase.

### 6.6 Efeito de remover uma atribuição
- Vale a partir da próxima requisição (§8).
- Os registros históricos continuam existindo e ficam invisíveis para quem perdeu o alcance; o administrador continua vendo tudo.
- Rascunhos e transferências em trânsito para aquela sucursal ou depósito continuam lá e podem ser concluídos por qualquer usuário que tenha o alcance.
- A remoção é auditada com antes e depois.

## 7. Autorização no servidor e menu

### 7.1 Contrato (`lib/auth/access.ts`, `server-only`)
```ts
type AccessContext = {
  sessionId: string; usuarioId: string; empresaId: string; ip: string | null;
  versionAcceso: number;                      // usuarios.version_acceso lida nesta requisição
  permisos: ReadonlySet<string>;              // P(u)
  esAdministrador: boolean;
  sucursales: ReadonlySet<string>;            // S(u) já resolvido
  depositos: ReadonlySet<string>;             // D(u) já resolvido
  modo: "OBSERVAR" | "APLICAR";               // §10; ausente ou inválido = APLICAR
  // esAdministrador NÃO implica dado sensível: só `permisos` decide (D-06)
  demo: boolean;
};
getAccessContext(): Promise<AccessContext | null>
requirePermission(codigo, alvo?: { sucursalId?: string; depositoIds?: string[] }): Promise<AccessContext>
can(ctx, codigo): boolean
```

### 7.2 Regras
1. **Negação por padrão:** toda rota e toda página privada declara a permissão exigida (lista completa em `MATRIZ-PERMISOS-REQ-2026-002.md` §4). Um teste estático falha se algum `route.ts` não chamar `requirePermission` ou se alguma página privada não estiver sob um layout que exija `.VER`.
2. Sem sessão → 401 (páginas redirecionam para `/login`). Com sessão e sem permissão ou fora do alcance → 403, com a mensagem "No tiene permiso para realizar esta acción." e o evento `ACCESO_DENEGADO`.
3. As páginas atuais são Client Components inteiros. A checagem fica num `layout.tsx` de servidor por módulo (por exemplo, `app/(private)/clientes/layout.tsx`), sem mexer na tela. Os botões de ação recebem `can()` e ficam ocultos ou desabilitados; o servidor continua sendo a barreira.

### 7.3 Ordem das verificações numa API
Sessão válida → empresa ativa → usuário ativo → permissão → alvo da mesma empresa (404) → alvo no alcance (403) → validação dos dados (422) → gravação dentro de `withTenantTx`.

### 7.4 Menu (RN-05, CA-04, CA-06)
1. `getShellContext` passa a enviar as permissões reais, e `resolveNavigation` **falha fechado**: lista vazia → só os itens sem permissão exigida (nenhum, depois desta mudança). A regra "lista vazia = tudo" (`menu.ts:321-322`) é removida.
2. Os itens usam os códigos granulares da matriz (§4.3 da matriz). Um grupo aparece se ao menos um item estiver visível.
3. Itens sem página ficam ocultos por `implementado: false`, independentemente de permissão.
4. O menu é calculado no servidor; o cliente não recebe a lista completa.
5. Depois de um 403, o cliente chama `router.refresh()` para receber o menu atualizado.

### 7.5 Modo demonstração (RN-12)
1. Em `NODE_ENV=production`, o servidor não inicia com `DEMO_MODE=true`, nem sem `DATABASE_URL` (hoje as APIs caem em demo, `app/api/clientes/route.ts:5-7`).
2. A sessão demo deixa de ser o cookie constante e passa a ter token aleatório (detalhe no REQ-2026-005 proposto).
3. No demo, as permissões vêm de um perfil demo declarado em código e passam pelo **mesmo** `resolveNavigation`/`can()`/`requirePermission`. Some o `if (isDemoMode()) return true` (`permissions.ts:10`).

## 8. Revogação e contrato temporal (F-006, RN-09, CA-07)

### 8.1 Princípio
Nenhuma informação de autorização é guardada fora do banco: o cookie só tem o ID e o segredo da sessão. Empresa, usuário, perfis, permissões e alcance são lidos **a cada requisição**, e as gravações conferem de novo dentro da própria transação (§8.3).

### 8.2 Tabela de eventos
| Evento | O que acontece na mesma transação | A partir de quando vale | Sessões |
|---|---|---|---|
| Empresa suspensa | `empresas.estado = SUSPENDIDA`, `version_acceso + 1` | Próxima requisição de qualquer usuário da empresa; gravações em curso falham (§8.3) | Todas as sessões da empresa revogadas |
| Usuário bloqueado, baixa ou inativo | `usuarios.estado`, `version_acceso + 1` | Próxima requisição; gravações em curso falham | Todas as sessões do usuário revogadas |
| Senha trocada ou redefinida | novo hash | Imediato para as outras sessões | Todas, exceto a atual quando é o próprio usuário que troca |
| Perfil removido ou atribuído ao usuário | `usuario_perfil`, `version_acceso + 1` | Próxima requisição | Mantidas (o recálculo basta) |
| Permissão retirada de um perfil | `perfil_permiso`, `perfiles.version + 1` | Próxima requisição de todos os usuários com o perfil | Mantidas |
| Perfil desativado | `perfiles.activo = false`, `version + 1` | Próxima requisição | Mantidas |
| Alcance alterado | `usuario_sucursal`/`usuario_deposito`, `version_acceso + 1` | Próxima requisição | Mantidas |
| Sucursal ou depósito desativado | `activo = false` | Próxima requisição | Mantidas |
| Concessão de suporte expirada ou revogada | `accesos_soporte.revocada_at` | Próxima requisição | Sessão de suporte encerrada |
| Concessão controlada aprovada | `concesiones_permiso.estado = APROBADA` (§4.7.4) | Próxima requisição do beneficiário | Mantidas |
| Concessão controlada revogada ou expirada | `estado = REVOGADA` ou vigência vencida | Próxima requisição; leitura ou execução em curso revalida dentro da transação (§4.7.6) | Mantidas |

### 8.3 Condição de corrida
- **Leitura:** uma requisição que começou antes da revogação pode terminar e devolver dados que o usuário podia ver naquele instante. Esse limite é aceito e documentado.
- **Gravação:** `revalidarAcceso` (chamada dentro de `withTenantTx`, §5.2) faz `SELECT … FROM empresas WHERE id = $1 FOR SHARE` e `SELECT … FROM usuarios WHERE id = $2 FOR SHARE` e confere estado e `version_acceso` contra o contexto. A revogação faz `UPDATE` nessas mesmas linhas. O PostgreSQL serializa as duas operações:
  - se a gravação travou primeiro, a revogação espera ela terminar;
  - se a revogação gravou primeiro, a gravação vê o estado novo e falha com 401/403, sem gravar nada.
- **Permissões de perfil e concessões:** para operações administrativas, leitura de dado sensível e execução de ação crítica, `revalidarAcceso` também relê as permissões e a concessão dentro da transação (§4.7.6). Para as demais, vale a leitura do início da requisição (diferença de milissegundos, aceita).
- **Sem cache:** nenhuma camada guarda autorização entre requisições. Se, no futuro, for preciso cache por desempenho, a chave inclui `empresas.version_acceso`, `usuarios.version_acceso` e as versões dos perfis, e o cache é descartado quando qualquer uma delas mudar.

## 9. Auditoria (RN-10)

| Evento | Dados |
|---|---|
| USUARIO_CREADO / USUARIO_EDITADO | antes e depois dos campos, sem senha |
| USUARIO_BLOQUEADO / REACTIVADO / BAJA | motivo; quantidade de sessões revogadas |
| CONTRASENA_RESTABLECIDA | só o fato e o ator |
| PERFIL_CREADO / EDITADO / DESACTIVADO | antes e depois |
| PERFIL_PERMISOS_CAMBIADOS | permissões adicionadas e removidas, versão |
| USUARIO_PERFILES_CAMBIADOS | perfis adicionados e removidos, versão |
| USUARIO_ALCANCE_CAMBIADO | sucursais e depósitos adicionados e removidos |
| EMPRESA_SUSPENDIDA / REACTIVADA, SOPORTE_ACCESO_* | ator de plataforma, motivo, prazo |
| ACCESO_DENEGADO (`eventos_seguridad`) | permissão ou regra violada, rota, ID solicitado |
| CONCESION_SOLICITADA / APROBADA / RECHAZADA / CANCELADA / REVOCADA / EXPIRADA | concessão, permissão, classe, beneficiário, solicitante, aprovador e tipo, motivo, vigência, regra IND violada (se recusada pelo sistema) |
| AUTORIZACION_OPERACION_* | solicitada, autorizada, rechazada, cancelada, expirada, consumida: operação, objeto, `objeto_huella`, solicitante, beneficiário, responsável PROCEIT, motivo, documento (§4.7.11) |
| PARAMETRO_CONCESION_CAMBIADO | parâmetro, valor anterior e novo, versão, ator de plataforma, motivo |
| ACCION_CRITICA_EJECUTADA | permissão, registro afetado, criador do registro, executor |
| DATO_SENSIBLE_CONSULTADO | recurso sensível e ID (contas bancárias, crédito, custo) |
| TRANSFERENCIA_* | envio, recebimento, cancelamento e conciliação (D-08) |
| EXPORTACION | módulo, filtros, quantidade de linhas |

- `auditoria_acceso` é só de inserção: o papel da aplicação não tem `UPDATE` nem `DELETE` nela.
- Retenção: §9.1.
- `withTenantTx` define `app.usuario_id`, `app.empresa_id` e `app.ip`, o que também alimenta triggers de auditoria que já existam no banco (NAO_VERIFICADO).

### 9.1 Classificação e retenção dos registros (D-07)

**Cinco anos é o objetivo proposto, não um prazo legal.** Os prazos abaixo são propostas iniciais. Cada um precisa ser validado pelo jurídico ou pela contabilidade da PROCEIT e do cliente, inclusive quanto à proteção de dados pessoais, **antes** de existir qualquer rotina automática de descarte. Até essa validação, nada é apagado automaticamente.

| Classe | Conteúdo | Dados pessoais | Retenção proposta | Base legal | Acesso |
|---|---|---|---|---|---|
| C1 Administração de acesso | Usuários, perfis, permissões, alcance, concessões sensíveis (antes/depois) | Nome de usuário, ator | 5 anos (objetivo) | A validar | `AUDITORIA.VER` da empresa; plataforma só com concessão de suporte |
| C2 Segurança | Login, falhas, bloqueios, `ACCESO_DENEGADO` | IP, user-agent | 1 ano (proposta) | A validar | Idem |
| C3 Consulta de dado sensível | `DATO_SENSIBLE_CONSULTADO` | Ator, ID do registro | 5 anos (objetivo) | A validar | Idem |
| C4 Exportações | Módulo, filtros, quantidade | Ator | 1 ano (proposta) | A validar | Idem |
| C5 Operações fiscais e financeiras (REQs futuros) | Faturas, notas, pagamentos e respectivos eventos | Clientes e fornecedores | Seguir a obrigação fiscal aplicável | **Obrigatória a validação contábil** | Conforme o módulo |
| C6 Logs técnicos | Erros e ID de correlação, sem dados de negócio | IP, quando necessário | 90 dias (proposta) | A validar | Equipe técnica PROCEIT |

Regras para todas as classes:
- **Gravação:** só inserção. O papel da aplicação não tem `UPDATE` nem `DELETE`. Correções são novos eventos.
- **Minimização:** sem senha, hash, token, número completo de conta bancária ou documento; IP e user-agent só em C2 e C6.
- **Descarte:** só depois da validação legal, por procedimento documentado e executado pelo papel de plataforma. O próprio descarte é registrado (classe, período, quantidade, responsável). Retenção legal ou ordem judicial suspende o descarte.
- **Backups:** criptografados, com acesso restrito à plataforma. Ficam guardados no máximo pelo prazo da classe mais longa que contêm, e os backups antigos seguem o mesmo descarte documentado. Restaurar um backup não traz de volta, sem registro, dados já descartados.
- A retenção será configurável por classe (e, se necessário, por empresa), sem alterar código.

## 10. Sequência de implementação (F-005)

Princípio: **o isolamento entre empresas não depende do catálogo de permissões e é aplicado desde a fase 1. A exigência de permissões só é ligada depois que o banco tem catálogo, perfis e pelo menos um administrador por empresa.** Nunca existe um "modo aberto" improvisado.

| Fase | Conteúdo | Portão de entrada | Portão de saída (evidência no TST) | DDL? |
|---|---|---|---|---|
| 0 | Introspecção somente leitura e verificações de integridade (§10.1) | Responsável autoriza e executa o roteiro | Relatório versionado; divergências registradas; decisões de §3.4 tomadas | Não |
| 1 | `lib/data` + `withTenantTx` + `assertMismaEmpresa` aplicados nas 5 APIs (isolamento **aplicado**); `access.ts` calculando permissões em **modo OBSERVAR**, só em homologação com dados sintéticos, que registra "negaria" sem bloquear; menu ainda no comportamento atual; testes de isolamento A/B | Fase 0 aprovada; CI do REQ-2026-004; ambiente de homologação isolado | CA-01 e CA-05 de isolamento verdes; relatório do modo observação sem negações inesperadas | Não |
| 2 | Migrations mínimas: catálogo de permissões com `clase`, perfis por empresa, perfil `ADMINISTRADOR` de sistema **sem permissão controlada** e garantia de um administrador por empresa (conversão de códigos antigos). Permissões controladas encontradas em perfis existentes são retiradas do perfil e viram solicitações `SOLICITADA` para os usuários afetados, à espera de aprovação independente (nenhum acesso sensível ou crítico migra automaticamente); `concesiones_permiso`, alcance com backfill **explícito** `TODAS`/`TODOS` para os usuários existentes (preserva o comportamento atual e fica marcado para revisão), `version_acceso`, `auditoria_acceso` | Fase 1 | Verificações de §10.1 = 0 inconsistências; toda empresa com ≥ 1 administrador ativo; `up` → `down` → `up` testado | Sim |
| 3 | Modo **APLICAR**: menu falha fechado, `requirePermission` bloqueia, alcance aplicado. Liberação progressiva: desenvolvimento → homologação → uma empresa piloto → todas | Fase 2 | CA-03 a CA-07 verdes; teste com usuário sem permissões, perfil vazio e empresa suspensa | Não |
| 4 | APIs e telas de administração de usuários, perfis e alcance (§12); regras ESC-01 a ESC-11 | Fase 3 | Testes de escalada (§11.2) verdes | Não |
| 5 | FKs compostas e RLS, tabela a tabela, à medida que cada módulo sai do `localStorage` para o banco | Fase 2 e o módulo no banco | Testes de §11.1 com RLS ligada | Sim |

Regras da chave `AUTHZ_MODO` (R02-F-003):
- **Falha fechada:** sem a variável, ou com um valor diferente de `OBSERVAR`, o modo é `APLICAR`.
- `OBSERVAR` só é aceito quando **três** condições valem juntas: `NODE_ENV` diferente de `production`, `AMBIENTE=homologacion` e a marca `DATOS_SINTETICOS=true` gravada no próprio banco (tabela de configuração preenchida só pela carga de dados sintéticos). Se qualquer uma faltar, a aplicação não inicia.
- Mesmo em `OBSERVAR`, o isolamento entre empresas, a validação de IDs de outra empresa, as regras ESC e o acesso a dado sensível são **sempre aplicados**. O modo observação só suspende o bloqueio de permissões operacionais.
- Banco com dados reais de cliente nunca roda em `OBSERVAR`. A produção é liberada só com `APLICAR` e os testes de §11 verdes.
- Em nenhuma fase existe um valor que libere tudo.

### 10.1 Fase 0 — verificações de integridade pré-migração
Roteiro de catálogo em `documentacao/banco/INTROSPECCAO-SOMENTE-LEITURA.md` (PR #2). Depois dele, contagens só leitura (os nomes de colunas são confirmados pela consulta Q3):

| ID | Pergunta | Esperado |
|---|---|---|
| I-01 | `perfiles` tem `empresa_id`? Quantos perfis sem empresa? | Define a migration de perfis |
| I-02 | `usuario_perfil` em que a empresa do perfil ≠ a do usuário | 0 |
| I-03 | Usuários ativos sem nenhum perfil ativo | Listar quantidade; decisão antes da fase 3 |
| I-04 | Empresas sem nenhum usuário ativo com perfil `es_administrador` | 0 (senão, bootstrap antes da fase 3) |
| I-05 | Códigos em `permisos` que não estão na matriz, e vice-versa | Tabela de conversão |
| I-06 | Duplicados de `(empresa_id, lower(usuario))` | 0 |
| I-07 | Por tabela de negócio: linhas com `empresa_id` nulo | 0 |
| I-08 | Por FK candidata a composta: linhas cuja referência é de outra empresa | 0 (senão, correção de dados aprovada antes da FK) |
| I-09 | Funções `SECURITY DEFINER` e triggers existentes | Lista revisada |
| I-10 | Papel usado pela aplicação: dono das tabelas? `BYPASSRLS`? | Define a migração de papéis |

## 11. Testes (CA-09)

Ambiente: PostgreSQL efêmero no CI (REQ-2026-004 proposto), semeado com empresas A e B, duas sucursais e três depósitos por empresa, e usuários de perfis diferentes.

### 11.1 Isolamento (F-004, CA-01, CA-05)
| Teste | Esperado |
|---|---|
| Para cada rota de API: usuário de A usa IDs de B no caminho, na query e no corpo; tenta exportar | 404/403; nenhuma linha de B lida ou alterada (contagem antes e depois) |
| Pool com 1 conexão: requisição de A, depois de B, na mesma conexão; B consulta `current_setting('app.empresa_id', true)` | Vazio no início da transação de B; só dados de B |
| Exceção no meio de uma gravação | `ROLLBACK`; nenhuma linha parcial; contexto não vaza |
| Consulta com RLS sem contexto (`app.empresa_id` não definido) | 0 linhas |
| `distribunex_app` tenta `DELETE`, `UPDATE` em `auditoria_acceso` ou acesso a outra empresa com RLS | Erro de permissão |
| Teste estático: `@/lib/db` importado fora de `lib/data` e `lib/auth` | Falha do teste |

### 11.2 Escalada de privilégios (F-002)
| Teste | Regra | Esperado |
|---|---|---|
| Usuário com `PERFILES.EDITAR` (sem `STOCK.EXPORTAR`) cria um perfil com `STOCK.EXPORTAR` | ESC-01 | 403 |
| O mesmo usuário adiciona a permissão ao perfil que ele próprio usa | ESC-03 | 403 |
| Usuário com `PERFILES.ASIGNAR` atribui a si mesmo um perfil | ESC-02 | 403 |
| Não administrador atribui o perfil administrador a outro | ESC-04 | 403 |
| Não administrador inclui `USUARIOS.CREAR` num perfil | ESC-05 | 403 |
| Usuário com alcance da sucursal 1 atribui a sucursal 2 a outro | ESC-06 | 403 |
| Duas requisições simultâneas removem os dois últimos administradores | ESC-07 | Uma passa, a outra 409; sobra 1 administrador |
| Apagar o perfil de sistema | ESC-08 | 409 |
| Enviar `PLATAFORMA.EMPRESAS_CREAR` num perfil | ESC-09 | 422 |
| Duas edições do mesmo perfil com a mesma versão | ESC-10 | A segunda recebe 409 |
| Atribuir perfil de outra empresa | ESC-11 | 404 |
| Cada tentativa acima | §4.3 | Evento `ACCESO_DENEGADO`; nenhuma alteração |

### 11.3 Alcance (F-003, CA-08)
| Teste | Esperado |
|---|---|
| Usuário com depósito Central faz saída no Norte (ID válido da empresa) | 403 |
| Transferência na mesma sucursal com destino fora de `D(u)` | 403; nenhum saldo alterado |
| Envio entre sucursais com origem em `D(u)` | OK; estado `EN_TRANSITO`; origem −q, destino trânsito +q |
| Envio com origem fora de `D(u)` | 403; nada gravado |
| Recebimento por usuário sem o depósito de destino | 403 |
| Recebimento total por outro usuário com o destino | `RECIBIDA`; trânsito −q, disponível +q |
| Recebimento parcial | `RECIBIDA_CON_DIFERENCIA`; diferença fora do disponível |
| Cancelamento antes do recebimento | `CANCELADA`; saldos voltam ao estado anterior ao envio |
| Cancelamento depois do recebimento | 409 |
| Conciliação de perda aprovada pelo próprio criador | 403 (aprovador ≠ criador) |
| Conciliação de perda aprovada por outro usuário | `CONCILIADA`; ajuste negativo vinculado |
| Soma de saldos antes e depois de cada caso acima | Igual (nada some sem ajuste aprovado) |
| Salvar alcance com depósito de sucursal não atribuída | 422 |
| Remover a sucursal do usuário e repetir a listagem | Registros da sucursal somem na próxima requisição |
| Stock consolidado | Soma só `D(u)` |
| Exportação | Mesmo filtro da tela |

### 11.4 Revogação (F-006, CA-07)
| Teste | Esperado |
|---|---|
| Sessão aberta; plataforma suspende a empresa; próxima requisição | 401; sessão revogada |
| Sessão aberta; usuário bloqueado; próxima requisição | 401 |
| Perfil removido; próxima requisição a rota que exigia a permissão | 403; menu sem o item |
| Gravação longa em curso (transação travada) e bloqueio do usuário em paralelo | Ou a gravação termina antes e o bloqueio espera, ou a gravação falha sem gravar; nunca grava depois do bloqueio |
| Usuário sem nenhuma permissão | Menu vazio (CA-06) |

### 11.5 Implantação (F-005)
| Teste | Esperado |
|---|---|
| Fase 1 em OBSERVAR, homologação com dados sintéticos | Nenhum bloqueio de permissão operacional; isolamento A/B, ESC e dado sensível bloqueando; log de "negaria" |
| `AUTHZ_MODO=OBSERVAR` com `NODE_ENV=production`, ou sem `AMBIENTE=homologacion`, ou sem a marca `DATOS_SINTETICOS` no banco | Aplicação não inicia |
| `AUTHZ_MODO` ausente ou com valor inválido | Modo `APLICAR` |
| Aplicação iniciada em produção com `DEMO_MODE=true` | Não inicia |
| Fase 2: migrations `up` → `down` → `up` a partir da linha de base | Sem erro; verificações de §10.1 = 0 |
| Fase 3 com perfil vazio, usuário sem perfil e empresa suspensa | Menu vazio / 403 / 401 |

### 11.6 Dados sensíveis e ações críticas sem herança (D-06, D-09)
| Teste | Regra | Esperado |
|---|---|---|
| Administrador sem concessão consulta custo, crédito ou conta bancária | §4.1 | 403 nos três; campos ausentes nas listagens |
| Administrador sem concessão aprova ajuste, aprova pagamento, anula fatura ou aprova nota de crédito | §4.1, D-09 | 403 nos quatro, sem alterar dados |
| Criar ou editar qualquer perfil (administrador ou não) com uma das 9 permissões controladas | ESC-13 | 422 |
| Bootstrap de empresa nova | §4.4 | Nenhuma conta com permissão controlada |
| Migração de perfil existente com `PAGOS.APROBAR` | §10 fase 2 | Permissão sai do perfil; solicitação `SOLICITADA` criada; o usuário perde o acesso até a aprovação |
| Concessão de `PRODUCTOS_COSTO.VER` aprovada | §4.1 | Não dá `CLIENTES_CREDITO.VER` (403) |
| Leitura de dado sensível autorizada | §9 | Evento `DATO_SENSIBLE_CONSULTADO` |

### 11.7 Teste por operação gerado da matriz (D-04)
Um teste parametrizado lê o catálogo da matriz (versão aprovada) e, para **cada** permissão (142), executa:
1. um usuário com a permissão (e o alcance exigido) consegue a operação;
2. um usuário sem ela recebe 403 sem alterar dados;
3. um usuário de outra empresa recebe 404;
4. para permissões de nível sucursal ou depósito, um usuário fora do alcance recebe 403.

Permissões de módulos ainda AUSENTES ou DEMO entram no teste quando o módulo for para o banco; até lá, aparecem no relatório como "sem operação implementada".

### 11.8 Retenção (D-07)
| Teste | Esperado |
|---|---|
| Papel da aplicação tenta `UPDATE`/`DELETE` em `auditoria_acceso` | Erro de permissão |
| Busca por rotina de descarte automático no código | Inexistente até a política validada |
| Evento auditado contém senha, hash, token ou número completo de conta | Nunca (teste de varredura dos campos `antes`/`despues`) |

### 11.9 Fluxo de concessão controlada (D-09, D-10)
| Teste | Regra | Esperado |
|---|---|---|
| Solicitação sem motivo | ESC-12 | 422 |
| Solicitante sem `*.ASIGNAR` da classe | ESC-12 | 403 |
| Solicitante pede para si mesmo | IND-01 | 403 |
| Solicitante aprova a própria solicitação | IND-01 | 403 |
| Beneficiário aprova a solicitação em que é beneficiário | IND-01 | 403 |
| Leitura do dado com a concessão `SOLICITADA`, `REJEITADA`, `CANCELADA` | §4.7.2 | 403 em todas |
| Aprovação por conta independente (criada pela plataforma, MFA, poder há mais de 7 dias) | §4.7.4 | `APROBADA`; acesso na próxima requisição; eventos registrados |
| Aprovação sem MFA recente | IND-05 | 403 |
| Aprovador com poder recebido há 2 dias | IND-06 | 403 |
| Duas aprovações simultâneas | §4.7.4 | Uma `APROBADA`, a outra 409 |
| Aprovação e cancelamento simultâneos | §4.7.4 | Só um vence; o outro 409 |
| Aprovação enquanto o beneficiário é bloqueado | §4.7.4 | A aprovação falha ou a concessão é revogada no bloqueio; nunca fica `APROBADA` para usuário bloqueado |
| Revogação durante uma leitura sensível em curso | §4.7.6 | A leitura termina antes da revogação ou falha depois; nenhuma leitura depois do commit da revogação |
| Concessão expirada | §4.7.2 | 403; estado `EXPIRADA` |
| Solicitação sem decisão há mais de 7 dias | §4.7.2 | `EXPIRADA`; não pode mais ser aprovada (409) |
| Solicitação duplicada para a mesma permissão e beneficiário | §4.7.2 | 409 |
| Uso de ação crítica com concessão vigente por quem criou o registro | ESC-15 | 403 |
| Uso de ação crítica com concessão vigente por outra conta com o mesmo documento de quem criou | ESC-15, IND-04 | 403 |
| Uso de ação crítica por usuário independente, com concessão e alcance | ESC-15 | OK; evento `ACCION_CRITICA_EJECUTADA` |
| Ação crítica em depósito ou sucursal fora do alcance do beneficiário | §6.3 | 403 |
| Concessão de dado sensível aprovada: `vigente_hasta` = aprovação + 180 dias; de ação crítica: + 365 | §4.7.2 | Valores exatos gravados |
| Renovação aprovada sem nova solicitação | §4.7.9 | Não existe: nada se renova sozinho; sem acesso depois do vencimento |
| Renovação solicitada e aprovada com a anterior vigente | §4.7.9 | Nova vigência conta da decisão; anterior `EXPIRADA` (`RENOVADA`) |

### 11.10 Tentativas de contornar (contas alternativas e perfis)
| Tentativa | Regra | Esperado |
|---|---|---|
| Administrador A cria a conta X e a usa para aprovar uma concessão para A | IND-02 | 403 (X é descendente de A) |
| A cria X e Y; X solicita e Y aprova uma concessão para A | IND-02 | 403 (Y é descendente de A, beneficiário) |
| A cria X; X cria Y; Y aprova uma concessão solicitada por A | IND-02 | 403 (cadeia de criação) |
| Usuário B, criado pela plataforma, recebe de A o perfil com `PERMISOS_SENSIBLES.APROBAR` e aprova um pedido de A | IND-03 | 403 (poder atribuído pelo solicitante) |
| Duas contas com o mesmo documento ou e-mail se aprovam mutuamente | IND-04 | 403 |
| Conta criada pela plataforma sem identidade verificada tenta aprovar | IND-04 | 403 |
| A edita um perfil que usa, para incluir `PRODUCTOS_COSTO.VER` | ESC-13 | 422 |
| A cria o perfil "Contador" com `PAGOS.APROBAR` e atribui a X | ESC-13 | 422 |
| A concede `PERMISOS_SENSIBLES.APROBAR` a X e, no mesmo dia, X aprova um pedido feito por outra pessoa para A | IND-02, IND-03, IND-06 | 403 |
| Empresa com um único administrador pede dado sensível para ele | §4.7.5 | Canal `PLATAFORMA`; nenhum acesso até a aprovação formal da PROCEIT |
| PROCEIT aprova sem documento de respaldo vinculado | §4.7.5 | 422 |
| Conta de plataforma tenta ser beneficiária | §4.7.5 | 422 |
| Aprovação da PROCEIT | §4.7.5 | `aprobador_tipo = PLATAFORMA`, nome da pessoa e documento de respaldo na auditoria da empresa |
| Cada tentativa negada acima | §4.3 | Evento `ACCESO_DENEGADO` com a regra; nenhuma mudança de estado |

### 11.11 Prazos, parâmetros e renovação (D-12)
Todos os testes usam relógio injetável.
| Teste | Regra | Esperado |
|---|---|---|
| Concessão de dado sensível: leitura em 179d23h, em 180d | §4.7.2 | OK; 403 e `EXPIRADA` |
| Concessão de ação crítica: execução em 364d23h, em 365d | §4.7.2 | OK; 403 e `EXPIRADA` |
| Aprovação de solicitação em 6d23h, em 7d | §4.7.2 | OK; 409 e `EXPIRADA` |
| Aprovador com poder há 6d23h, há 7d | IND-06 | 403; OK |
| Aprovador perde o poder e o recebe de novo: aprova no dia seguinte | §4.7.8 | 403 (contagem recomeçou) |
| Aprovador muda de perfil de origem ou de conta | §4.7.8 | Contagem recomeça |
| Aprovação com cliente informando `poder_desde` antigo (corpo ou cabeçalho) | §4.7.8 | Ignorado; relógio do banco |
| Reduzir `aprobador_antiguedad_dias` para 0 ou 3 | §4.7.8 | 422 (piso 7) |
| Elevar `concesion_dias_dato_sensible` para 181 ou `concesion_dias_accion_critica` para 366 | §4.7.8 | 422 (teto) |
| Alterar parâmetro sem motivo | §4.7.8 | 422 |
| Alterar parâmetro com `CONFIGURACION.EDITAR` da empresa | §4.7.8 | 403 |
| Alterar parâmetro por plataforma com MFA e motivo | §4.7.8 | OK; histórico com valor anterior, novo, versão, ator |
| Parâmetro encurtado depois: concessão existente | §4.7.8 | Mantém `vigente_hasta` gravado; só revogação a encurta |
| Parâmetro de antiguidade aumentado: aprovação em curso | §4.7.8 | Valor em vigor no instante da decisão |
| Concessão vencida, nova solicitação, aprovação | §4.7.9 | Nova `APROBADA`; a vencida segue `EXPIRADA` |
| Aprovador pela exceção PROCEIT sem MFA recente | D-12.5 | 403 |
| Urgência: pedido pelo canal `PLATAFORMA` sem documento | §4.7.9 | 422 |
| Urgência: tentativa de aprovar com aprovador de 2 dias "por urgência" | §4.7.9 | 403 |
| Revogação durante a vigência | §4.7.12 | 403 na próxima requisição; autorização por operação do beneficiário vira `CANCELADA` |
| Relatório de concessões que vencem | §4.7.9 | Lista as corretas, sem dados sensíveis |

### 11.12 Operação crítica em empresa com único operador (D-11)
| Teste | Regra | Esperado |
|---|---|---|
| Único operador cria e tenta aprovar o próprio pagamento | §4.7.7 | 403; operação segue pendente e sem efeito |
| Mesmo, com concessão `PAGOS.APROBAR` já aprovada | §4.7.7 | 403 sem `AUTORIZADA` da PROCEIT |
| Operador cria outra conta e aprova por ela | IND-02, §4.7.7 | 403 |
| Operador tenta marcar a empresa como "com mais operadores" por campo, perfil ou parâmetro | §4.7.7 | Ignorado; o canal vem do sistema |
| Solicitação sem justificativa, sem documento ou documento de outra empresa | §4.7.11 | 422 |
| PROCEIT autoriza com MFA, documento e motivo | §4.7.11 | `AUTORIZADA`; auditoria na empresa e na plataforma com todos os campos |
| PROCEIT autoriza sem `OPERACIONES_AUTORIZAR` ou sem MFA recente | §4.7.11 | 403 |
| PROCEIT rejeita | §4.7.11 | `RECHAZADA`; operação não executa |
| Execução com `AUTORIZADA` e objeto igual | §4.7.11 | OK; `CONSUMIDA` junto com a operação |
| Reuso: segunda execução com a mesma autorização | §4.7.11 | 409 |
| Reuso: a mesma autorização para outra operação igual (outro `objeto_id`) | §4.7.11 | 403 |
| Operação alterada (valor, itens) depois da autorização | §4.7.11 | 409 (`objeto_huella`) |
| Execução depois de `valida_hasta`; de 7 dias sem decisão | §4.7.11 | 403 e `EXPIRADA` |
| Autorização de empresa A usada na empresa B | §5 | 404/403 |
| Duas execuções simultâneas com a mesma autorização | §4.7.11 | Uma OK, a outra 409; operação executada uma vez |
| Decisão da PROCEIT e cancelamento do operador simultâneos | §4.7.11 | Só um vence; o outro 409 |
| Falha na execução depois de consumir | §4.7.11 | Rollback: autorização segue `AUTORIZADA` |
| Operador é bloqueado com autorização `AUTORIZADA` | §4.7.12 | `CANCELADA` na mesma transação |
| Empresa passa a ter aprovador independente | §4.7.11 (8) | Segregação normal; sem exigir PROCEIT |
| Aprovador independente é bloqueado | §4.7.11 (8) | Volta a exigir PROCEIT, na próxima operação |
| Pessoa da PROCEIT tenta ser beneficiária | §4.6 | 422 |

### 11.13 Evidência de independência e limites (R04-F-002)
| Teste | Regra | Esperado |
|---|---|---|
| Aprovador com identidade duplicada (mesmo `documento_hash`) | IND-04 | 403 |
| Aprovador sem identidade verificada | §4.7.10 | 403 |
| Aprovador com e-mail não verificado | §4.7.10 | 403 |
| Conta importada (`IMPORTADO`) sem conferência humana | §4.7.10 | 403 |
| Conta importada após conferência humana registrada | §4.7.10 | Elegível, se IND-01 a IND-07 valerem |
| Vínculo criado fora do sistema (inserção direta sem `creado_por`) | §4.7.10 | Tratado como `IMPORTADO` |
| Conta criada pela plataforma sem documento de respaldo | §4.7.10 | Não elegível |
| Mudança de `documento_hash` de aprovador existente | §4.7.8 | Poder recomeça a contar; relatório de revisão |
| Relatório periódico de aprovadores e concessões | §4.7.10 | Lista com origem, verificador e data; marca contas sem revisão |
| Nenhum teste automatizado prova independência de pessoas | §4.7.10 | **Limite declarado:** cobertura só das relações registradas |

## 12. APIs e telas de administração (fase 4)

Interface em espanhol, no padrão visual existente.

| Método e rota | Permissão | Regras |
|---|---|---|
| `GET /api/auth/me` | sessão | Usuário, empresa, permissões e menu calculado |
| `GET /api/admin/usuarios` | `USUARIOS.VER` | Só a empresa da sessão |
| `POST /api/admin/usuarios` | `USUARIOS.CREAR` | Senha temporária gerada e mostrada uma vez; `debe_cambiar_contrasena` |
| `PATCH /api/admin/usuarios/{id}` | `USUARIOS.EDITAR` | ESC-02, ESC-10 |
| `POST /api/admin/usuarios/{id}/bloquear` · `/reactivar` | `USUARIOS.EDITAR` | ESC-02, ESC-07; revoga sessões (§8) |
| `POST /api/admin/usuarios/{id}/baja` | `USUARIOS.ELIMINAR` | ESC-02, ESC-07; revoga sessões |
| `POST /api/admin/usuarios/{id}/restablecer-contrasena` | `USUARIOS.EDITAR` | Revoga sessões do alvo |
| `PUT /api/admin/usuarios/{id}/perfiles` | `PERFILES.ASIGNAR` | ESC-01, 02, 04, 07, 10, 11 |
| `PUT /api/admin/usuarios/{id}/alcance` | `USUARIOS.EDITAR` | ESC-02, 06, 10; coerência §6.2 |
| `GET/POST /api/admin/perfiles`, `PATCH /api/admin/perfiles/{id}` | `PERFILES.VER/CREAR/EDITAR` | ESC-01, 03, 04, 05, 08, 10 |
| `PUT /api/admin/perfiles/{id}/permisos` | `PERFILES.EDITAR` | ESC-01, 03, 05, 08, 09, 10, 13 |
| `POST /api/admin/concesiones` | `PERMISOS_SENSIBLES.ASIGNAR` ou `PERMISOS_CRITICOS.ASIGNAR` | ESC-12, IND-01, IND-07; define o canal (empresa ou plataforma) |
| `POST /api/admin/concesiones/{id}/aprobar` · `/rechazar` | `PERMISOS_SENSIBLES.APROBAR` ou `PERMISOS_CRITICOS.APROBAR` + MFA | ESC-14 (IND-01 a IND-07), §4.7.4 |
| `POST /api/admin/concesiones/{id}/cancelar` · `/revocar` | Solicitante; aprovador; `*.ASIGNAR` da classe | §4.7.2, motivo obrigatório na revogação |
| `GET /api/admin/concesiones` | `AUDITORIA.VER` ou `*.ASIGNAR`/`*.APROBAR` | Pendentes, vigentes, recusadas e revogadas; sem conteúdo sensível |
| `POST /plataforma/concesiones/{id}/aprobar` | `PLATAFORMA.CONCESIONES_APROBAR` + MFA (serviço de plataforma) | §4.7.5; documento de respaldo obrigatório |
| `GET /api/admin/permisos` | `PERFILES.VER` | Catálogo sem `PLATAFORMA.*` |
| `GET /api/admin/auditoria` | `AUDITORIA.VER` | Só a empresa da sessão |

A tela de perfis não mostra as 9 permissões controladas. Elas ficam numa tela própria, `/administracion/concesiones`, com solicitação, fila de aprovação (só para aprovadores independentes daquele pedido) e histórico.

Telas: `/administracion/usuarios` (lista, novo, detalhe com abas Datos, Perfiles, Alcance), `/administracion/roles` (grade módulo × ação, com as permissões que o ator não pode conceder desabilitadas) e `/administracion/auditoria`. `/administracion/configuracion` fica fora deste REQ.

## 13. Riscos do próprio desenho

| Risco | Mitigação |
|---|---|
| O banco real tem outro modelo de perfis e permissões | Fase 0 antes de qualquer DDL; conversão revisada pelo responsável |
| Usuários legítimos ficam sem acesso ao ligar o APLICAR | Fase 1 em OBSERVAR com relatório; backfill explícito na fase 2; liberação progressiva |
| Custo de recalcular permissões e de travar linhas a cada requisição | Uma consulta agregada por requisição; `FOR SHARE` só nas gravações; medir antes de otimizar |
| RLS mal configurada | Fase 5 por tabela, testes antes de ativar, papel de migração separado |
| Telas cliente inteiras dificultam o gate por página | Layout de servidor por módulo |
| Conta alternativa criada pelo mesmo operador | Bloqueada pela linhagem de criação e de poder (IND-02, IND-03) e pela identidade (IND-04); testes em §11.10 |
| Identidade falsa no cadastro (documento de outra pessoa) | Aprovadores só com identidade verificada; o aprovador independente recomendado é criado pela plataforma no onboarding, com conferência de documento |
| Conluio entre duas pessoas reais | Não é bloqueável por regra técnica; mitigado por auditoria, relatório periódico de concessões e responsabilidade da empresa |
| Empresas pequenas dependentes da exceção PROCEIT | Custo operacional para a PROCEIT; mitigado pelo aprovador independente no onboarding e pelo relatório de empresas em exceção |
| Segregação impossível em empresa de um só operador | D-11 aprovada: autorização PROCEIT por operação (§4.7.7, §4.7.11) |
| PROCEIT, hoje de uma só pessoa, concentra autorização por operação e edição de parâmetros | MFA, auditoria na empresa e na plataforma, documento assinado da empresa, revisão do responsável; reavaliar com equipe maior (§4.7.10) |
| Bloqueio operacional por prazos curtos ou por dependência da PROCEIT | Relatório de vencimentos, renovação antecipada, processo de urgência formal (§4.7.9); valores revisáveis por nova decisão |
| Identidade falsa, dupla ou conluio | Limites declarados em §4.7.10; conferência humana e revisão periódica; sem alegar eliminação do risco |
