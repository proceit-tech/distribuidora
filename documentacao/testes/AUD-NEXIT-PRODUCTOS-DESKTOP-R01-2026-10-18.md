# AUD-NEXIT-PRODUCTOS-DESKTOP-R01 — Auditoría por menú «Maestros → Productos»

**Fecha:** 2026-10-18. **Snapshot de código:** `32b86e4e600ca7a942f910e4cd80f75263cdba54` de `feature/NEXIT-2026-001-banco-demo`. **Producto exclusivamente desktop**, sin requerir diseño o pruebas para teléfono.
**Veredicto:** **CORRECCIÓN SOLICITADA — 3 ALTA y 3 MEDIA confirmadas estáticamente; NO HOMOLOGADO**. Esta auditoría es un diagnóstico, **NO autoriza a Claude** a implementar ni implica una operación en la VM.

## 1. Fuentes, alcance y límites

Leídos `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` vigente, `documentacao/v1/auditoria-por-menu/AUD-PRODUCTOS-V1.md` (secciones I–XXIV, decisiones DEC-PRD-U03/U07/U08/U09/U10 y AUD-R01/R02/R03 de 12/10), árbol real y código actual.

**Pantallas:** `app/(private)/productos/layout.tsx`; `page.tsx` (~807 líneas), `nuevo/page.tsx` (92), `[id]/page.tsx` (156), `_components/producto-form.tsx` (316), pestañas General, SIFEN, Inventario, Compras, Logística, Kit y Documentos; `catalogos/page.tsx` se inspeccionó **solo como dependencia y enlace del menú**: el menú «Catálogos de productos» tendrá auditoría propia.

**HTTP:** inventariadas **20 rutas** `app/api/productos/**/route.ts`, incluyendo 4 parejas de familias/marcas/categorías/líneas, GET/POST de Productos, GET/PUT ficha, foto privada y versiones, documentos, cierre, restauración y versionado. Se rastrearon con mayor profundidad `/api/productos`, `/api/productos/[id]`, `/api/productos/[id]/documentos/finalizar`, foto y permisos de documentos. No declarar que las 20 rutas hayan tenido prueba de ejecución o inspección semántica integral de cada línea.

**Servicios:** `lib/productos/{formulario,normalizar,shared,fiscal,alcance,sincronizar,permisos-documentos,documentos-http,documentos,imagen,cliente-api,cierre-carga}`, `lib/facturacion/emision.ts` como integración fiscal histórica. Se verificaron firmas, condiciones sensibles y contratos de las pruebas específicas.

**SQL:** NEX-007 (productos, hijos, empresa/FK/índices), NEX-038 (código inmutable), NEX-039/043 (unidad SIFEN), NEX-040 (afectación IVA), NEX-041/042 (documentos/foto privados, versiones, eventos y grants), NEX-052 (unidad base, serialización con stock/historial). Migrations **solo leídas**, el ledger operacional no fue consultado. Pruebas antiguas `lib/productos/{estabilizacion,fiscal,documentos-archivos,productos,sincronizar}.casos.ts` inspeccionadas por cobertura pertinente, NO ejecutadas.

**No realizados:** browser real, PostgreSQL, Docker, VM, llamadas API HTTP, tsc/build/lint global ni suites. No inventar «funciona en producción», resultados de CI ni screenshots.

## 2. Hallazgos abiertos de este corte

### PRD-D01 — ALTA — PRODUCTOS.CREAR-only no puede abrir formulario de alta ni sus catálogos

**Código:** `app/(private)/productos/layout.tsx:6`: `guardPage("PRODUCTOS","VER")` cubre tanto `/productos` como `/productos/nuevo`; `app/api/productos/route.ts:68-72`: GET exige `PRODUCTOS.VER` **antes** de distinguir `modo=catalogos`; `app/(private)/productos/nuevo/page.tsx:17-21` carga ese GET; `app/api/productos/route.ts:199-200` POST exige `PRODUCTOS.CREAR`. `lib/productos/permisos-documentos.ts:29-38` permite explícitamente al creador con CREAR cargar foto/documentos en el alta.

**Impacto:** perfil legítimo autorizado a crear por POST no puede realizar la operación en UI ni cargar sus catálogos. El enlace de lista no se ofrece sin VER. **No se trata de falta de guarda backend ni de permiso que deba concederse de facto.**

**Corrección esperada:** separar autorización de ruta lista/detalle (VER) y alta (CREAR); abrir exclusivamente catálogos mínimos pertinentes con CREAR sin exponer lista, ficha, stock ajeno ni productos de la empresa; ofrecer navegación/salida autorizada para CREAR-only. Cubrir roles CREAR-only, VER-only, EDITAR-only, admin, sin permiso y otra empresa en tests focales.

### PRD-D02 — ALTA — Fallo parcial de documentos/foto después del POST crea producto irreversible para el formulario, pero navega a ficha inaccesible

**Código:** `app/(private)/productos/nuevo/page.tsx:23-80`: crea el producto mediante POST, obtiene `id`, carga foto y todos los documentos de forma secuencial, incrementa **solo `fallidos`** sin identificar archivos exitosos o fallidos y, si alguno falla, `router.push("/productos/${id}?aviso=documentos")`. Si falla el cierre, redirige del mismo modo a `/productos/${id}?aviso=cierre`. `app/api/productos/[id]/route.ts:50` exige VER, de manera que el criador CREAR-only no puede llegar al formulario de recuperación. Tras recarga de `/productos/nuevo` no existe identificador de producto persistido ni recuperación equivalente a `lib/proveedores/alta.ts`/RetomarAlta; otro clic POST puede dar alta nueva del mismo producto.

**Impacto:** producto válido ya registrado sin foto/documentos completos; criador restringido sin vía de reintento; el usuario no conoce los archivos específicos fallidos y puede repetir envío de los correctos. El flujo menciona «NUNCA se vuelve a crear», pero no lo garantiza frente a navegación fallida/recarga.

**Corrección esperada:** recuperar por el **mismo ID durable** en una pantalla accesible al criador (sin acceso general VER), conservar el estado de archivos fallidos mientras la sesión vive y pedir reelección tras recarga; no duplicar foto/documentos que ya subieron; tratar cierre de modo seguro por API de alta. **No** recrear producto ni ampliar permisos de fichas completas. Tests 1/2 archivo fallido, foto fallida, red, refresh, CREAR-only, tenant distinto, sin acceso a documento ajeno.

### PRD-D03 — ALTA — PUT de Productos no tiene comprobación de versión optimista y permite actualización perdida

**Código:** `app/api/productos/[id]/route.ts:264–349`: normaliza el payload, `SELECT ... FOR UPDATE` por empresa/id (~294–301), valida referencias y actualiza **todas** las columnas con `UPDATE productos SET ... actualizado_at = now() WHERE id=$1 AND empresa_id=$2` (~327–340); **nunca** recibe/compara versión del cliente ni `actualizado_at` del estado visto al abrir la ficha. `app/(private)/productos/[id]/page.tsx:104–111` manda `JSON.stringify(data)`, `lib/productos/formulario.ts` forma el payload sin token CAS, aunque el GET devuelve `actualizadoEn` (~linha 85) y la UI ya conoce esa marca. `SELECT FOR UPDATE` serializa la transacción **durante** el PUT, pero no impide que un formulario abierto antes sobrescriba el trabajo de otro usuario después del commit.

**Secuencia lógica:** A y B abren producto mismo estado → A cambia precio/descripción y confirma → B, con snapshot antiguo, cambia otro campo y confirma → segundo PUT bloquea la fila solo mientras actualiza, pero no compara versión; el producto puede perder cambios de A, y colecciones enviadas antiguas pueden sobrescribir configuraciones/hijos de A. No se afirma que tal caso haya ocurrido en la VM.

**Corrección esperada:** token de versión confiable y obligatorio en PUT, comparación bajo row lock contra versión actual antes de cualquier UPDATE/sincronización, responder 409 con campo/aviso útil por formulario obsoleto; clientes GET/PUT usan marcas precisas de fecha y no hay motivo para quitar la sincronización seletiva. Conservar permisos, alcance de depósito, unidad-base bloqueada, precio, IVA y acciones documentales. Tests requests sin versión, versión obsoleta y actual (A/B), fila ajena y rollback sin modificación colateral. **No** editar migration histórica ni alterar reglas stock/SIFEN para introducir CAS.

### PRD-D04 — MEDIA — Cierre de carga NO es idempotente para creador CREAR-only si se pierde la respuesta HTTP

**Código:** `lib/productos/permisos-documentos.ts:29–38` solo admite `FINALIZAR_CARGA` al propio creador si `cargaInicialAbierta=true`, y `app/api/productos/[id]/documentos/finalizar/route.ts:13–41` valida el permiso antes del `UPDATE productos SET ... = false`. Si el servidor confirma 200 y cierra la flag, pero la respuesta se pierde, reintento de ese mismo criador CREAR-only resulta 403. El helper `cerrarCargaInicial` detecta fallo de red, pero el endpoint no permite que su criador confirme un cierre ya hecho. Este patrón fue **corregido en Proveedores** (`lib/proveedores/permisos-documentos.ts`) y todavía no en Productos.

**Corrección esperada:** idempotencia estricta solamente para mismo creador autenticado con CREAR al repetir FINALIZAR_CARGA cuando ya está cerrada, retornando 200 no-op, sem reabrir uploads nem conceder EDITAR/VER. Test 200 perdido/retry 200; otro criador/outro tenant/CREAR-only após fechamento não podem fazer CARGAR.

### PRD-D05 — MEDIA — Tela permite salvar/crear visualmente sem permissão correspondente

**Código:** `app/(private)/productos/page.tsx:504-507` e ~677 oferecem «Nuevo producto» a qualquer perfil com VER, embora POST exija CREAR. `app/(private)/productos/[id]/page.tsx:134–153` rende `ProductoForm mode="edit"` sem modo leitura; `producto-form.tsx:277–307` expõe campos editáveis e «Actualizar producto» a VER-only; PUT `/api/productos/[id]` exige EDITAR em ~278. GET não retorna `permisos.editar` na ficha (retorna permissões documentais, que não devem ser tomadas indiscriminadamente como autorização para todos os campos da ficha).

**Impacto:** operador VER-only trabalha no formulário e termina em HTTP 403; botão de alta sem autorização também produz rota negada. Segurança backend preservada; **UX/fluxo por role** quebrado.

**Correção esperada:** modo somente leitura quando VER sem EDITAR, ou controle contextual de ações por servidor/sessão para os campos apropriados; excluir CTA Novo para quem não pode CREAR; ações específicas de documentos/foto permanecem conforme permissões próprias. Não substituir guardas API por controle visual; testes basicos por perfil.

### PRD-D06 — MEDIA — Rascunho de documento não salvo desaparece ao trocar a aba

**Código:** `app/(private)/productos/_components/pestanas/documentos.tsx:79–85`: estado `nuevo` e `editando` é interno a `DocumentosFicha`, não espelhado em `ctx.pendientes` nem em flag de `producto-form.tsx`. `producto-form.tsx:286–300` renderiza `PestanaDocumentos` **somente quando `tab==="documentos"`** (desmonta componente ao trocar). `useProtegerCambios` ~92 cobre apenas `sucio` do formulário, `pendientes` de alta e foto pendente — **não** cobre `nuevo/editando` na ficha. Trocar aba com novo documento ou edição pendente apaga campos/arquivo em silêncio, mesmo sem sair da página.

**Correção esperada:** alerta específico antes de sair da aba com rascunho, ou elevar o rascunho ao formulário pai e mantê-lo entre abas; testar aba→aba e sair da página com documentos pendentes. Preservar versionamento, upload privado e URL legada. Seguir a solução de Proveedores PRV-M03 em vez de criar gerenciador global.

## 3. Regras já presentes — NÃO reabrir como problemas novos

- **FE/SIFEN:** validação de unidade SIFEN e afetação IVA em produto novo vendável; imposto 10% como default editável; legado não sofre backfill silencioso. Código em `lib/productos/normalizar.ts`, `fiscal.ts`, `app/api/productos/route.ts` e NEX-039/040/043. A decisão oficial Metro/MT é código fiscal **108**, mantendo 87 como catálogo distinto; não colocar decisão em aberto por comentários antigos.
- **Faturação:** `lib/facturacion/emision.ts` impede seleção/uso de produto `vendible=false`, unidade sem vínculo ou inativa; como revisão deste menu não há necessidade de modificar FE ou NCE.
- **Inventário:** `validarAlcanceConfiguraciones` protege configurações dos depósitos na edição; filtro de saldos/consultas incluem depósitos históricos inativos dentro do alcance; bloqueio de troca de unidade base com NEX-052 e histórico imutável, impedindo concorrência se aplicada no PostgreSQL. **Não presumir aplicação da NEX-052**, nem autorizar SQL.
- **Cadastro:** código gerado e imutável, referências comerciais legadas inativas tratadas na ficha, sincronização seletiva por ID (sem DELETE ALL genérico), custo e estoque inicial pela rota operativa com `MOVIMIENTOS.CREAR`; quantidade/preço e valores como strings decimais exatos quando exigido.
- **Arquivos:** NEX-041/042 versionam imagem/documentos privados, retêm histórico e exclusão lógica, mas recuperação de alta e fechamento do criador precisam da correção D02/D04; não confundir existência de armazenamento seguro com conclusão do fluxo UI.
- **Catálogos:** `/productos/catalogos` possui API propria com controle de CREAR/EDITAR e tratamento de erros; auditoria **do menu Catálogos de productos é separada**, não rotular aqui seus possíveis achados como encerrados.

## 4. Observações sem novo bloqueio

- **PRD-O01 — escala:** `GET /api/productos` e `productos/page.tsx` filtram/ordenam/paginam a carteira em memória (20 por página no client), sem paginação SQL da lista principal. O tamanho real e a latência não foram medidos: risco, não defeito comprovado.
- **PRD-O02 — feedback visual:** `/productos/nuevo` e `/[id]` exibem erros/carga como `<main style={{padding:24}}>` avulso, menos coeso que formulário padronizado; `window.confirm` aparece na gestão de documentos/foto. Isto não prova ausência de confirmação, mas é dívida de UX desktop.
- **PRD-O03 — status operacional:** as migrations versionadas NEX-038…043 e NEX-052 requerem verificação do `schema_migrations` e privilégios reais antes de quaisquer inferências de deploy. A falta dessa conferência não significa que estão ausentes. A validação estática da R03 de 12/10 não foi homologação no banco.

## 5. Aceite futuro e procedimento

**Prioridade técnica:** resolver D03 (perda de edição concorrente) e D02/D01 (alta/recuperação CREAR-only) antes de liberar perfil restrito; D04 idempotência associada; D05 RBAC UI e D06 documentos sem rascunho são correções específicas. Não misturar correções do menu Catálogos, inventário fiscal ou faturamento que não dependam dessas alterações.

**Testes dirigidos quando Claude receber autorização expressa:** GET catálogo CREAR-only sem liberar lista/GET detalhe; abertura/alta/recuperação após um documento/foto falhos e após reload, sem segundo POST produto; cierre idempotente com 200 perdido e autorias negativas; PUT sem versão/obsoleto/atual para A/B, preservando filhos; perfil VER-only sem ações indevidas; novo/edição documento com tab switch; filial/empresa/alcance. Nenhuma suite global, `tsc` global, build geral, lint global, CI manual, PostgreSQL/VM operacional ou migrations por IA.

**Estado final do menu:** revisão estática deste recorte **DOCUMENTADA COM 6 ACHADOS ABERTOS; NÃO HOMOLOGADA**. Sem ordem ao Claude neste turno. Próximo menu na sequência de `Maestros`: **Catálogos de productos**, em auditoria separada a pedido do responsável.
