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


## Módulo Reportes — revisión integral DESKTOP R01 (18/10/2026)

- **Seis entradas revisadas:** índice [Reportes operativos](AUD-REPORTES-V1.md), [Stock general](AUD-REPORTE-STOCK-GENERAL-V1.md), [Valorización de inventario](AUD-REPORTE-VALORIZACION-V1.md), [Kardex de movimientos](AUD-REPORTE-KARDEX-V1.md), [Stock crítico y reposición](AUD-REPORTE-STOCK-CRITICO-V1.md) y [Lotes y vencimientos](AUD-REPORTE-LOTES-V1.md). **Informe técnico completo:** [AUD-NEXIT-REPORTES-DESKTOP-R01](../../testes/AUD-NEXIT-REPORTES-DESKTOP-R01-2026-10-18.md).
- **1 ALTA RPT-D01:** normalización del filtro por la API no coincide con comparación de respuesta del cliente en los 5 reportes. **1 MEDIA RPT-D02:** búsqueda nueva durante debounce aún muestra/puede exportar filtro anterior. **1 BAJA RPT-D03:** texto incompleto de la tarjeta Stock crítico del índice. No contar 5 veces un defecto transversal. Observaciones de alcance/SQL, exportaciones y ambiente pendientes de verificación humana.
- **Estado:** inspección de código/datos/seguridad/exports documentada, **sin homologación**, sin tests de IA, sin VM/PG/browser, sin corrección ni orden Claude. Los 5/5 aceites estáticos históricos de R19/R20 se conservan como histórico de motores y funcionalidades previas, con nuevos hallazgos UI abiertos. Próximo menú según solicitud del responsable.


## Reporte individual 1 — Stock general DESKTOP (18/10/2026)

- **Auditoría funcional independiente:** [Stock general R01](../../testes/AUD-NEXIT-STOCK-GENERAL-DESKTOP-R01-2026-10-18.md) y [ficha canónica](AUD-REPORTE-STOCK-GENERAL-V1.md). Finalidad exclusiva: documento cuantitativo de existencias PROPIO/TERCERO por producto, depósito, lote y estado con exportación (no costo/compra/planificación). **SG-D01 ALTA** y **SG-D02 MEDIA** ya cuentan como RPT-D01/D02 globales. **SG-D03 ALTA NUEVA**: totales `porUnidad` agrupados por nombre de unidad, mientras NEX-003 admite dos UUID diferentes con nombre idéntico; XLSX/PDF reutilizan el agregado. **Solo SG-D03 se suma al global de Reportes: ahora 2 ALTAS + 1 MEDIA + 1 BAJA** en la combinación transversal/Stock general. 7 observaciones condicionales, 12 casos de aceptación futuros, 0 ejecutados. No homologado ni implementado. **Próximo reporte individual: Valorización de inventario**, a petición.

## Reporte individual 2 — Valorización de inventario DESKTOP (18/10/2026)

- **Auditoría funcional independiente:** [Valorización R01](../../testes/AUD-NEXIT-VALORIZACION-DESKTOP-R01-2026-10-18.md) y [ficha canónica](AUD-REPORTE-VALORIZACION-V1.md). Función financiera: importe de inventario propio a costo real de inventario_costos conciliado contra stock_saldos, clasificación por producto×depósito, 4 vistas, sin inventar costos ni precios de venta. **VZ-D01 ALTA** y **VZ-D02 MEDIA** = transversales ya contados RPT-D01/D02. **VZ-D03 MEDIA NUEVA:** «Costo registrado» filtra cantv y confunde valor monetario residual sin cantidad con ausencia de registro. **VZ-D04 MEDIA NUEVA:** KPI «ALCANCE» cuenta depósitos que sobreviven al filtro y no todos los autorizados. **Solo +2 MEDIAS al total global de Reportes, ahora 2 ALTAS + 3 MEDIAS + 1 BAJA.** Siete observaciones, 14 pruebas previstas, 0 ejecutadas. Sin homologación, sin código/migration/Claude. **Siguiente reporte individual: Kardex de movimientos**, a petición.

## Reporte individual 3 — Kardex de movimientos DESKTOP (18/10/2026)

- **Auditoría funcional por reporte:** [Kardex R01](../../testes/AUD-NEXIT-KARDEX-DESKTOP-R01-2026-10-18.md) y [ficha canónica](AUD-REPORTE-KARDEX-V1.md). Función exclusiva: libro histórico por número de registro, saldos por producto×depósito×lote×unidad UUID×propiedad×propietario, anulaciones, transferencias, estados, conciliación, XLSX/PDF. **KDX-D01 ALTA** (texto API trim ≠ filtro cliente) y **KDX-D02 MEDIA** (debounce muestra foto previa) ya contados globalmente RPT-D01/D02. **Nuevos exclusivos:** **KDX-D03 MEDIA** propietario TERCERO rotulado con 8 dígitos del UUID potencialmente colisiona en pantalla/archivos; **KDX-D04 MEDIA** catálogo de usuarios trae nombres de autores de cualquier depósito empresarial en vez de limitar al alcance actual; **KDX-D05 BAJA** mensaje de conciliación atribuye causa no diagnosticada. **Suma al global solo +2 MEDIAS +1 BAJA**; acumulado de Reportes = **2 ALTAS +5 MEDIAS +2 BAJAS** tras tres reportes individuales. 9 observaciones, 14 pruebas focales futuras. Correcciones AUD-KDX-R01…R05 y aceites estáticos históricos preservados; NO HOMOLOGADO, 0 pruebas ejecutadas, sin migración ni Claude. **Próximo reporte individual: Stock crítico y reposición** a solicitud.

## Reporte individual 4 — Stock crítico y reposición DESKTOP (18/10/2026)

- **Auditoría independiente:** [Stock crítico y reposición R01](../../testes/AUD-NEXIT-STOCK-CRITICO-DESKTOP-R01-2026-10-18.md) y [ficha canónica](AUD-REPORTE-STOCK-CRITICO-V1.md). Función: reporte de alertas y sugerencias de abastecimiento que reutiliza el plan único de Inventario → Reposición sobre Stock propio activo autorizado, sin editar ni ejecutar movimientos/compra; 2 vistas y XLSX/PDF. **SC-D01 ALTA** y **SC-D02 MEDIA** = filtros transversales RPT-D01/D02 ya registrados. **Nuevos exclusivos:** **SC-D03 MEDIA** en la vista Por producto Excel/PDF omiten «+ N sin meta» de las filas agregadas con cantidades conocidas y desconocidas; **SC-D04 MEDIA** total «Valor de referencia» aparece como 0 si todas las necesidades carecen de estimación por falta de costo/meta; **SC-D05 BAJA** UI dice «Disponible» mientras suma únicamente los destinos del plan (Excel ya dice «Disponible (destinos)»). **Solo +2 MEDIAS +1 BAJA al global**; acumulado de hallazgos abiertos de Reportes después de 4 reportes individuales: **2 ALTAS +7 MEDIAS +3 BAJAS**. Nueve observaciones, 15 pruebas sugeridas, 0 ejecutadas. No homologado, ningún cambio de código/migration/Claude. **Siguiente reporte: Lotes y vencimientos** cuando lo solicite el responsable.


## Reporte individual 5 — Lotes y vencimientos DESKTOP (18/10/2026)

- **Auditoría independiente final de Reportes:** [Lotes y vencimientos R01](../../testes/AUD-NEXIT-LOTES-DESKTOP-R01-2026-10-18.md) y [ficha canónica](AUD-REPORTE-LOTES-V1.md). Función exclusiva de riesgo de vencimiento de lotes reales, stock propio/tercero por depósito, fecha Paraguay, 4 clases, existencia por lote, 2 vistas, XLSX/PDF y unidades UUID.
- **LOT-D01 ALTA** normalización API distinta de filtro cliente y **LOT-D02 MEDIA** debounce de búsqueda mantienen los IDs transversales RPT-D01/RPT-D02 **sin duplicar conteo**. **LOT-D03 BAJA NUEVA**: contador muestra «0 lotes» sin respuesta válida durante inicialización/errores/horizonte inválido. **LOT-O01 OBSERVACIÓN NO CONFIRMADA**: JOIN de lotes no exige explícitamente `modo_control_stock='LOTE'`, pendiente revisión de invariantes/DDL de NEX-009/cambio de modo; no afirmar exposición de lotes indebidos.
- **Serie completa:** cinco reportes revisados individualmente: [Stock general](../../testes/AUD-NEXIT-STOCK-GENERAL-DESKTOP-R01-2026-10-18.md), [Valorización](../../testes/AUD-NEXIT-VALORIZACION-DESKTOP-R01-2026-10-18.md), [Kardex](../../testes/AUD-NEXIT-KARDEX-DESKTOP-R01-2026-10-18.md), [Stock crítico](../../testes/AUD-NEXIT-STOCK-CRITICO-DESKTOP-R01-2026-10-18.md) y [Lotes](../../testes/AUD-NEXIT-LOTES-DESKTOP-R01-2026-10-18.md), además del índice Reportes operativos. **Conteo global de NUEVOS/ABIERTOS al cierre de la ronda: 2 ALTAS, 7 MEDIAS y 4 BAJAS (13 únicos)**; no acumular incidencias históricas cerradas o las transversales multiplicadas. Todos documentados; **ninguno homologado**, 0 tests ejecutados por ChatGPT, sin PostgreSQL/VM/browser, sin cambios funcionales ni autorización a Claude. Siguiente etapa sólo a pedido: priorizar e implementar separadamente reporte por reporte.


## Menu Facturación — Documentos electrónicos DESKTOP R01 (18/10/2026)

- **Relatório detalhado:** [AUD-NEXIT-DOCUMENTOS-ELECTRONICOS-DESKTOP-R01](../../testes/AUD-NEXIT-DOCUMENTOS-ELECTRONICOS-DESKTOP-R01-2026-10-18.md), [ficha canônica](AUD-DOCUMENTOS-ELECTRONICOS-V1.md). Auditada a função de central fiscal, as duas imagens de referência do concorrente, tela, APIs, gateway, reconsultas, envio, tipo FE/NCE, política de NCE, permissão/alcance e SQL de listagem.
- **Achados de código:** **1 ALTA** (DOC-D01 resultados e ações obsoletos durante filtros), **6 MÉDIAS** (DOC-D02 taxonomia de pendências; D03 KPIs globais sem rótulo; D04 Number sobre montante exato; D05 snapshot concorrente não comprovado em PG; D06 datas API inválidas; D07 «Sin e-mail» mistura desconhecido/sem destinatário), **1 BAIXA** (D08 detalhe cacheado). **8 achados**, separados dos 28 itens de paridade C01–C28 e 15 melhorias E01–E15 (requisitos, NÃO 43 defeitos). 7 GAPs/dependências e 20 testes focais futuros.
- **Pontos críticos da referência:** filtros lote/firma/tipo/estado/ocultações, KPIs SIFEN e e-mail, histórico de reprocesos, ações e arquivos por documento, seleções/agrupamentos/exportações. **PDF/KuDE/XML, eventos SIFEN e envio e-mail exigem contratos reais**; o catálogo FE/NCE/NDE/NRE/AFE não significa integração dos 5 tipos (consulta gateway FE/NCE apenas). Preservar CDC, idempotência, escopo, estados separados e saldo NCE. **NÃO HOMOLOGADO**, 0 testes executados por ChatGPT, sem SQL/VM/browser/migrations, Claude não autorizado.


## Ponto de controle — auditoria continua, sem implementar (18/10/2026)

**Decisão expressa do responsável:** «registra tudo ainda falta menus». [Controle mestre com estado documentado, menus pendentes e decisão de não liberar implementação](CONTROLE-PENDENCIAS-AUDITORIA-DESKTOP-2026-10-18.md). O relatório [Documentos electrónicos R01](../../testes/AUD-NEXIT-DOCUMENTOS-ELECTRONICOS-DESKTOP-R01-2026-10-18.md) e seus requisitos de concorrência **já estão registrados**: 8 achados de código, 28 funções comparadas, 15 melhorias e 20 testes planejados. Os arquivos binários das capturas continuam apenas na conversa; o Git tem a especificação textual.

**Não encerrar auditoria geral nem enviar correções para Claude.** Próximos itens ativos no mapa V1: **Facturas**, **Puntos de expedición**, **Notas de crédito**, **Administración → Facturación electrónica**. **Plataforma → Empresas** segue em fluxo exclusivo de administrador global. `/reportes` tem auditoria transversal do índice e cinco reportes próprios já auditados. Menus declarados mas ocultos por V1_HREFS são candidatos de escopo futuro, não funcionalidades entregues. Um menu por vez, sem homologação automática, sem VM/SQL/deploy e sem alterações funcionais.

## Auditoría individual — Configuración de facturación electrónica R01 (18/10/2026)

- **Menu exacto:** Administración → Facturación electrónica, /configuracion/facturacion-electronica, diferente de Facturación → Facturas (/facturas/nueva).
- **Documentación:** [informe técnico](../../testes/AUD-NEXIT-CONFIGURACION-FACTURACION-ELECTRONICA-DESKTOP-R01-2026-10-18.md) y [ficha canónica](AUD-CONFIGURACION-FACTURACION-ELECTRONICA-V1.md). Auditados campos, acceso, GET/PUT, POST prueba, servidor, gateway, credenciales, SQL NEX-061, tests existentes sin ejecución.
- **3 MEDIAS:** CFG-D01 carrera al crear primer registro de límite de pruebas de login; CFG-D02 RUC editado combinado con contraseña guardada anterior; CFG-D03 campos habilitados mientras guardar/probar que permiten perder ediciones. **1 BAJA:** CFG-D04 mantiene configuración antigua tras fallo de refresco. 9 observaciones y 16 pruebas focalizadas previstas. Sin reproducción concurrente real en PG.
- **Preservar:** empresa de sesión, permiso CONFIGURAR, tabla aislada, password y token nunca retornados, NEXIT_DB sin fallback de entorno, prueba limitada a login y vinculada a versión; CONFIGURADO no equivale a login OK ni aprobación SIFEN.
- **NO HOMOLOGADO**, 0 pruebas ejecutadas por ChatGPT, sin SQL/VM/PG/gateway/browser, código funcional ni migration; Claude no autorizado. Siguen pendientes Facturas, Puntos de expedición, Notas de crédito, y Empresas de plataforma por separado.

## Facturación / Facturas — revisión individual R01 (18/10/2026)

Informe: [Auditoría Facturas R01](../../testes/AUD-NEXIT-FACTURAS-DESKTOP-R01-2026-10-18.md). Ficha: [AUD-FACTURAS-V1](AUD-FACTURAS-V1.md). Resultado: dos hallazgos altos (FAT-D01, FAT-D02), dos medios (FAT-D03, FAT-D04), uno bajo (FAT-D05); 24 escenarios de prueba futuros. Brecha funcional previa: venta por presentaciones y conversión fiscal pendiente, contabilizada separadamente. Auditoría estática únicamente, no homologada ni liberada para desarrollo. Próximos menús: Puntos de expedición y Notas de crédito.
