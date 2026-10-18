# Índice de auditorias por menu — NEXIT V1

**Estado geral: EM ANDAMENTO.** Uma ficha existente NÃO significa auditoria concluída. Não alterar migrations NEX-001…051 aplicadas; qualquer futura NEX-052 requer autorização.

## Principal

- [AUD-DASHBOARD-V1.md](AUD-DASHBOARD-V1.md) — ABERTA, sem homologação

## Maestros

- [AUD-CLIENTES-V1.md](AUD-CLIENTES-V1.md) — ABERTA, sem homologação
- [AUD-PROVEEDORES-V1.md](AUD-PROVEEDORES-V1.md) — ABERTA, sem homologação
- [AUD-PRODUCTOS-V1.md](AUD-PRODUCTOS-V1.md) — ABERTA, sem homologação
- [AUD-CATALOGOS-PRODUCTOS-V1.md](AUD-CATALOGOS-PRODUCTOS-V1.md) — ABERTA, sem homologação
- [AUD-LISTAS-PRECIOS-V1.md](AUD-LISTAS-PRECIOS-V1.md) — ABERTA, sem homologação
- [AUD-CATALOGOS-COMERCIALES-V1.md](AUD-CATALOGOS-COMERCIALES-V1.md) — ABERTA, sem homologação

## Inventario

- [AUD-STOCK-V1.md](AUD-STOCK-V1.md) — ABERTA, sem homologação
- [AUD-MOVIMIENTOS-V1.md](AUD-MOVIMIENTOS-V1.md) — ABERTA, sem homologação
- [AUD-DEPOSITOS-V1.md](AUD-DEPOSITOS-V1.md) — ABERTA, sem homologação
- [AUD-REPOSICION-V1.md](AUD-REPOSICION-V1.md) — ABERTA, sem homologação

## Facturación

- [AUD-DOCUMENTOS-ELECTRONICOS-V1.md](AUD-DOCUMENTOS-ELECTRONICOS-V1.md) — ABERTA, sem homologação
- [AUD-FACTURAS-V1.md](AUD-FACTURAS-V1.md) — ABERTA, sem homologação

## Reportes

- [AUD-REPORTES-V1.md](AUD-REPORTES-V1.md) — ABERTA, sem homologação
- [AUD-REPORTE-STOCK-GENERAL-V1.md](AUD-REPORTE-STOCK-GENERAL-V1.md) — ABERTA, sem homologação
- [AUD-REPORTE-VALORIZACION-V1.md](AUD-REPORTE-VALORIZACION-V1.md) — ABERTA, sem homologação
- [AUD-REPORTE-KARDEX-V1.md](AUD-REPORTE-KARDEX-V1.md) — ABERTA, sem homologação
- [AUD-REPORTE-STOCK-CRITICO-V1.md](AUD-REPORTE-STOCK-CRITICO-V1.md) — ABERTA, sem homologação
- [AUD-REPORTE-LOTES-V1.md](AUD-REPORTE-LOTES-V1.md) — ABERTA, sem homologação

## Plataforma

- [AUD-EMPRESAS-PLATAFORMA-V1.md](AUD-EMPRESAS-PLATAFORMA-V1.md) — ABERTA, sem homologação

## Método

Auditar integralmente cada menu na ordem: regras oficiais e requisitos → código de páginas/componentes → API → serviço → SQL/migrations → permissões/isolamento → testes → UX real na VM → relatório final com achados e evidência. Separar 'comprovado pelo Git' de 'validado pelo responsável na VM'. Não enviar correções genéricas ao Claude antes de concluir o diagnóstico e a decisão do menu.


## Nova auditoria geral 18/10/2026 — estado atual

- [AUD-NEXIT-MENUS-GERAL-R01](../../testes/AUD-NEXIT-MENUS-GERAL-R01-2026-10-18.md): inventário de 38 páginas/94 rotas e achados transversais.
- [AUD-NEXIT-MENUS-GERAL-R02](../../testes/AUD-NEXIT-MENUS-GERAL-R02-2026-10-18.md): correção explícita da interpretação do Dashboard para administrador de plataforma e novo achado de CTA sem permissão.
- **NÃO encerrada:** cada ficha de menu continua ABERTA até ser auditada em profundidade (UI, rotas, serviços, SQL, permissões, testes, comportamento real); R01/R02 são apenas a fase inicial e a revisão do shell/Dashboard ainda não equivale a homologação. Não marcar as fichas como concluídas por possuir esta lista.


## Criterio vigente — ERP desktop, auditoría secuencial (18/10/2026)

**Decisión del responsable:** NEXIT es exclusivamente desktop. El hallazgo histórico `NGM-R01-01` (sidebar móvil) fue **DESCARTADO POR FUERA DE ALCANCE**; no se exige ninguna implementación para celular ni pruebas viewport móvil. Las auditorías de menús se realizan secuencialmente, **uno por vez**, con interfaz desktop → API → servicio → SQL → permisos → pruebas ligeras; no llamar «auditado» al inventario general. Revisiones históricas R01/R02 de la auditoría general no se modifican, pero su interpretación anterior de «mobile ALTA» queda sustituida por la decisión actual.

**Primer menú en revisión:** [Dashboard desktop — auditoría R01](../../testes/AUD-NEXIT-DASHBOARD-DESKTOP-R01-2026-10-18.md), 1 hallazgo ALTA y 4 MEDIA abiertos; estatus CORRECCIÓN SOLICITADA / SIN HOMOLOGACIÓN. Próximo (sin iniciar todavía): Clientes.


## Segundo menu — Clientes desktop (18/10/2026)

- **Menu 1 — Panel general/Dashboard**: [AUD-NEXIT-DASHBOARD-DESKTOP-R01](../../testes/AUD-NEXIT-DASHBOARD-DESKTOP-R01-2026-10-18.md), 1 ALTA + 4 MÉDIAS documentadas, **sem correção ou homologação**. Não corrigir mobile: produto somente desktop.
- **Menu 2 — Clientes**: [AUD-NEXIT-CLIENTES-DESKTOP-R01](../../testes/AUD-NEXIT-CLIENTES-DESKTOP-R01-2026-10-18.md), 1 ALTA + 2 MÉDIAS de permissões e concorrência de geografia; observações de escala/dialogos. Incorporação à [ficha canônica de Clientes](AUD-CLIENTES-V1.md). **Não homologado.**
- **Próximo menu previsto:** Proveedores, ainda não auditado nesta sequência. Um menu por revisão, separando implementação e auditoria. Sem testes globais, DB ou VM pelas IAs.


## Terceiro menu — Proveedores desktop (18/10/2026)

- **Menu 1** Panel general: [Dashboard desktop R01](../../testes/AUD-NEXIT-DASHBOARD-DESKTOP-R01-2026-10-18.md), 1 ALTA + 4 MÉDIAS, pendentes.
- **Menu 2** Clientes: [Clientes desktop R01](../../testes/AUD-NEXIT-CLIENTES-DESKTOP-R01-2026-10-18.md), 1 ALTA + 2 MÉDIAS, pendentes.
- **Menu 3** Proveedores: [Proveedores desktop R01](../../testes/AUD-NEXIT-PROVEEDORES-DESKTOP-R01-2026-10-18.md), **1 ALTA + 2 MÉDIAS**, pendentes. [Ficha histórica/canónica consolidada](AUD-PROVEEDORES-V1.md): não reabrir correções anteriores PRV-M01…M04/R01…05 já em código. CREAR-only bloqueado por layout VER e redirecionamento, VER-only recebe controles de edição, falha de catálogos geográficos é escondida como lista vazia. Observações: banco visível com VER depende de política, risco de escala de lista e grants reais sem nova evidência.
- **Próximo menu** Productos — não auditado nesta sequência. Software exclusivamente desktop, sem objetivo móvel; cada menu tem auditoria independente e homologação humana separada. Nenhuns testes, SQL/VM/deploy pelas IAs.


## Quarto menu — Productos desktop (18/10/2026)

- **Menu 4 — Productos:** [Relatório técnico R01](../../testes/AUD-NEXIT-PRODUCTOS-DESKTOP-R01-2026-10-18.md) e [ficha canônica de Productos §XXV](AUD-PRODUCTOS-V1.md). Corte `32b86e4e600ca7a942f910e4cd80f75263cdba54`. **3 ALTA + 3 MEDIA** abertos: CRIAR-only impedido pelo layout/GET catálogo que exigem VER; recuperação de foto/documentos do produto já criado redireciona a ficha com VER e não preserva ID/arquivos falhos para reintento; PUT sem versão otimista pode sobrescrever edição concorrente; fechamento da carga não idempotente para criador CREAR-only após perder 200; UI de Novo/Editar visível a VER-only sem direitos; rascunho de documentos desaparece ao mudar aba.
- **Preservado:** SIFEN/IVA/unidade 108 MT, alcance de depósitos, sincronização seletiva, foto/documentos privados e versões. **Sem reabrir** regressões aprovadas estaticamente AUD-R03 histórica. Risco de performance de listagem e dúvidas de migrations/grants reais são observações, não bugs provados.
- **Menus anteriores permanecem pendentes**, sem alterações funcionais: Panel general 1 ALTA + 4 MEDIA; Clientes 1 ALTA + 2 MEDIA; Proveedores 1 ALTA + 2 MEDIA. **Próximo menu:** Catálogos de productos, auditoria independente; nenhum teste global, navegador, VM/SQL feito pela IA. ERP somente desktop.


## Quinto menu — Catálogos de productos desktop (18/10/2026)

- **Menu 5 — Catálogos de productos** (Categorías, Marcas, Familias, Líneas): [AUD desktop R01](../../testes/AUD-NEXIT-CATALOGOS-PRODUCTOS-DESKTOP-R01-2026-10-18.md) e [ficha consolidada §IX](AUD-CATALOGOS-PRODUCTOS-V1.md). Snapshot `cb35cb35bda7179e09db683e48fdf104867f5f2a`. **1 ALTA CAT-D01:** durante POST/PUT as tabs/Nueva/Cancelar/Editar continuam ativas; callback antigo pode fechar o formulário atual e recarregar lista de outra tab. **1 MÉDIA CAT-D02:** erro PUT da ativação/inativação some porque `cambiarEstado.catch` faz `setError(mensagem)` e `cargar()` imediatamente faz `setError("")`.
- **Correções históricas CAT-A01–A06 e CAT-R02-01 preservadas no código:** catálogos auxiliares, compuerta de GET, dirty guard, refs inativas, avisos de descendentes, versão CAS e bloqueio de carga falha. Observações sem defeitos comprovados: race de status de pai sob concorrência (PG não testado), retry de carga com rascunho, `window.confirm`, escala da listagem.
- **Estado:** diagnóstico de código documentado, **NÃO HOMOLOGADO**; não autorizada implementação nem testes globais/VM. **Próximo menu: Listas de precios**, separado, quando solicitado; ERP desktop.


## Sexto menu — Listas de precios desktop (18/10/2026)

- **Menu 6 — Listas de precios:** [AUD técnico R01](../../testes/AUD-NEXIT-LISTAS-PRECIOS-DESKTOP-R01-2026-10-18.md) e [ficha atual §VIII](AUD-LISTAS-PRECIOS-V1.md), snapshot `25f2844d1a18171c2520850ca7379c879d937438`. **1 ALTA LPR-D01:** CREAR-only bloqueado pelo layout `VER` e GET de catálogos somente VER; saída após cadastrar vai para listagem também sem VER. **3 MÉDIAS:** LPR-D02 botões Novo/Editar para VER-only sem CREAR/EDITAR; LPR-D03 estado VENCIDA aplicado a BORRADOR/INACTIVA e «disponíveis» inclui vigência futura; LPR-D04 erro de carga de catálogos mantém formulário salvável e infere moeda-base PYG. **Correções antigas LPR-A01–A09 e R02-01 preservadas**, inclusive foto de versões de ítems excluídos pelo usuário e recusa 409, NEX-018/moeda/REF-VENTA.
- **Observações sem erro confirmado:** visibilidade de custo médio (política RBAC pendente), `float8`/Number em preços altos e risco de precisão, escala de listagem, múltiplas queries GET fora de mesmo snapshot. Nenhum código, SQL, PostgreSQL, VM, testes nem navegador executados por auditor. **Não homologado** e pendente de futura correção autorizada. **Próximo menu: Catálogos comerciales**, auditoria independente somente quando solicitado, ERP exclusivamente desktop.


## Sétimo menu — Catálogos comerciales desktop (18/10/2026)

- **Menu 7 — Catálogos comerciales** (Tipos de cambio, Canales de venta, Zonas comerciales): [AUD técnico R01](../../testes/AUD-NEXIT-CATALOGOS-COMERCIALES-DESKTOP-R01-2026-10-18.md) e [ficha canônica §IX](AUD-CATALOGOS-COMERCIALES-V1.md), corte `adcd75dee93955644977a1fa095647e95d6b327f`. **2 ALTAS:** CC-D01 CREAR-only não entra no menu por guard VER, apesar de POST permitir CREAR; CC-D02 POST/PUT pendente não bloqueia outras tabs, formulários e ações, callback atrasado pode apagar formulário de nova tab e aplicar GET antigo como nova requisição vencedora. **1 MÉDIA condicional:** CC-D03 resposta 200 tiposCambio sem moedas é aceita como carga confiável, permitindo Novo com selector vazio/obsoleto; API atual normal entrega moedas, logo não afirmar sintoma em produção.
- **Histórico preservado**: CC-A01…A07/CC-R03-01 aceitos estaticamente na AUD-R04, versão/409, vínculos Clientes, FX texto exato numeric(18,6), GET compuerta e reversão NEX-045. Não reabrir nem autorizar correção automática. Observações: rótulos histórico e escala requerem decisão/teste real. **NÃO HOMOLOGADO**, nenhum código funcional, SQL, tests globais ou VM/PG/browser tocados. **Próximo menu:** Inventario → Stock, somente sob pedido, ERP desktop.


## Oitavo menu — Stock desktop (18/10/2026)

- **Menu 8 — Inventario → Stock:** [auditoria detalhada R01](../../testes/AUD-NEXIT-STOCK-DESKTOP-R01-2026-10-18.md) e [ficha atual de Stock](AUD-STOCK-V1.md); snapshot `ee57f3a681d3d33aa71e0428b0cbb59efac20c6c`. **1 ALTA STK-D01:** consulta mantém catálogo de produtos global/inativo com saldo em qualquer depósito e só restringe saldo/custo ao escopo do usuário; item sem saldo visível vira «Sin stock» e conta nos KPIs, incluindo item inativo cuja única existência está fora de alcance. Produto global é decisão intencional do helper, logo determinar política antes de retirar linhas. **2 MÉDIAS:** STK-D02 `MONEDA_BASE` global alterada por fetch de componente desmontado (rótulo monetário cruzado); STK-D03 nove SELECTs de Stock via Pool em Promise.all sem instantânea comum, mistura transitória possível entre saldo e custo durante movimento concorrente. Sem reprodução em PostgreSQL real.
- **Histórico corrigido presente:** nível `SIN_STOCK/BAJO`, permissão Movimientos.VER+CREAR, Reposición com STOCK.VER, custos em texto decimal, moeda própria de preço venda, `?deposito=` e depósitos autorizados com/sem saldo, produtos/depósitos inativos históricos e nenhuma escrita física fora de Movimientos. Observações não classificadas: depósito configurado com zero não entra na lista de existência conforme teste legado; soma de unidades heterogêneas no KPI, escala sem medições, entrada para depósito legado inativo condicional, exposição de custo sob STOCK.VER depende de política.
- **Estado:** diagnóstico estático, **NÃO HOMOLOGADO**, nenhuma tarefa de Claude, sem VM/PG/deploy, testes ou código modificado. ERP desktop apenas. **Próximo menu:** Inventario → Movimientos mediante nova solicitação.


## Nono menu — Movimientos desktop (18/10/2026)

- **Menu 9 — Inventario → Movimientos:** [relatório técnico R01](../../testes/AUD-NEXIT-MOVIMIENTOS-DESKTOP-R01-2026-10-18.md) e [ficha canônica](AUD-MOVIMIENTOS-V1.md); snapshot `eaa10106dfb273ddd57079ddab5c978dc6d28009`. **MOV-D01 ALTA:** campos do formulário de novo movimento continuam mutáveis durante POST; mudanças limpam `clave.current`, permitindo retry com outra chave após COMMIT cuja resposta se perdeu → risco de duplo efeito físico. **MOV-D02 MÉDIA:** histórico conserva linhas, resumos e links de filtro/página anterior durante GET do filtro atual; `cargando` não neutraliza `datos`. **MOV-D03 MÉDIA:** virada de data `hoyAsuncion` reexecuta efeito de catálogos e sobrescreve formulário já digitado.
- **Preservado:** 9 tipos SQL/4 grupos UI, autorização MOVIMIENTOS.VER+CREAR para Novo conforme contrato explícito, ANULAR crítico, empresa e dois depósitos em alcance, NEX-014 transacional e idempotente para **mesma** chave, estorno único por original, lote concorrente ON CONFLICT, estado fiscal/documentos sem integração automática. **Observações não bloqueantes:** catálogo enumera depósitos não autorizados com `permitido=false` por decisão/documentação anterior (sem liberar saldos), histórico sem snapshot único, moeda/cantidades `Number` limite, confirmação native, referência de documento textual.
- **Estado:** somente revisão estática, **1 ALTA + 2 MÉDIAS ABERTAS — NÃO HOMOLOGADO**. Nenhuma correção ao Claude, testes, deploy, SQL, VM/PG ou browser pelo auditor; sistema desktop. **Próximo menu: Inventario → Depósitos**, exclusivamente a pedido do responsável.


## Décimo menu — Depósitos desktop (18/10/2026)

- **Menu 10 — Inventario → Depósitos:** [informe R01](../../testes/AUD-NEXIT-DEPOSITOS-DESKTOP-R01-2026-10-18.md) y [ficha canónica](AUD-DEPOSITOS-V1.md). **2 ALTAS DEP-D01/D02; 5 MEDIAS DEP-D03…D07; 1 BAJA DEP-D08**. Revisada pantalla de 681 líneas, APIs, helpers, permisos, contrato Inventario y migration NEX-046 (versionada; aplicación efectiva no confirmada). Sin nuevas implementaciones, pruebas ni homologación. **Próximo menú: Inventario → Reposición**, exclusivamente cuando el responsable lo solicite. ERP desktop; no se exigen casos mobile.


## Undécimo menu — Reposición desktop (18/10/2026)

- **Menu 11 — Inventario → Reposición:** [informe técnico R01](../../testes/AUD-NEXIT-REPOSICION-DESKTOP-R01-2026-10-18.md) y [ficha canónica](AUD-REPOSICION-V1.md). **0 ALTAS, 4 MEDIAS REP-D01…D04**, 7 observaciones condicionadas. Auditoría de pantalla desktop 531 líneas, API solo GET, cálculo, SQL de lectura, carga, autorización, pruebas existentes y contratos Inventario/Movimientos/Stock/Productos/Reportes. La simulación individual y el reparto conjunto necesitan decisión semántica, y las cinco consultas independientes tienen riesgo de consistencia sin prueba PostgreSQL real. Correcciones históricas del Inventario permanecen presentes; no reabrir. **SIN HOMOLOGACIÓN, sin tests ejecutados, sin implementación ni Claude**. **Siguiente menú: Facturación → Documentos electrónicos**, únicamente cuando lo solicite el responsable.
