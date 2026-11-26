# AUD-NEXIT-PRODUCTOS-DESKTOP-R02 — Revalidação independente do menu Productos

**Data:** 19/10/2026. **Auditor:** ChatGPT. **Projeto:** NEXIT / ERP DistribuNex exclusivamente desktop. **GitHub:** `proceit-tech/distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`. **HEAD inicial da revisão:** `b1de7713cc41f499c3f31f159ad9e20fc30d426e`. **Corte comparado:** `32b86e4e600ca7a942f910e4cd80f75263cdba54` (AUD-R01 de 18/10/2026).

**Parecer:** **6 achados PRD-D01…D06 AINDA ABERTOS**, sendo **3 ALTAS e 3 MÉDIAS**, antes da próxima implementação de Productos. **NÃO HOMOLOGADO**, sem alteração do código de aplicação ou banco pelo auditor. Os 11 principais arquivos específicos de tela, serviço de encerramento, permissão documental e API possuem blobs SHA **idênticos** entre o corte R01 e o HEAD atual: `productos/{layout,page,nuevo/page,[id]/page,_components/producto-form,_components/pestanas/documentos}`, `app/api/productos/{route,[id]/route,[id]/documentos/finalizar/route}`, `lib/productos/{permisos-documentos,cierre-carga}`. Nenhum desses desvios foi corrigido por entregas posteriores de Dashboard, Clientes ou Proveedores.

## 1. Fontes e limites

- Lidos `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` (item Productos e auditoria de 18/10), ficha `documentacao/v1/auditoria-por-menu/AUD-PRODUCTOS-V1.md` (especialmente seções XXII–XXV e decisões fiscais), relatório `documentacao/testes/AUD-NEXIT-PRODUCTOS-DESKTOP-R01-2026-10-18.md`, plano C05/C13/C18/C22; rechecados os 11 hashes e trechos diretos de UI, GET/POST, GET/PUT, permissionamento documental, encerramento e editor de anexos.
- Esta R02 é revalidação estática **dirigida aos seis achados** e dependências necessárias; não equivale a leitura de todas as rotas de imagem/anexos, nem a execução de testes, SQL, VM, browser, CI, build/lint/tsc. Não inferir que migrations (incluindo NEX-052/NEX-053) foram aplicadas no PostgreSQL.

## 2. Achados confirmados por código vigente e contratos obrigatórios

### PRD-D01 — ALTA — Criar sem poder VER

- `app/(private)/productos/layout.tsx` exige `PRODUCTOS.VER` indiscriminadamente; `nuevo/page.tsx` precisa `GET /api/productos?modo=catalogos`, porém `app/api/productos/route.ts` exige VER antes de interpretar a finalidade, enquanto POST exige CREAR.
- **Aceite:** módulo pai aceita VER ou CREAR, listagem e ficha continuam exigindo VER, alta exige CREAR; navegação CREAR-only aponta a `/productos/nuevo`, sem link de lista/ficha; catálogos MÍNIMOS para criação com VER ou CREAR e resposta baseada em permissões da sessão. **Atenção:** `modo=catalogos` atualmente possui `catalogos.productos` (lista de `id/codigo/descripcion` dos produtos ativos) além das demais referências; não conceder automaticamente essa lista completa a CREAR-only. Verificar se alguma referência é indispensável à composição de KIT; em caso positivo restringir a finalidade/campos autorizados, sem decidir política de visibilidade de catálogo global (gate C24) por conta própria. A listagem e GET de ficha nunca devem sair pelo caminho de catálogos de alta. Verificar strings vazias, valores desconhecidos e combinações de query, evitando o bypass já identificado em Proveedores (PRV-R03-01).

### PRD-D02 — ALTA — Upload parcial após POST sem retomada segura

- `nuevo/page.tsx`: POST cria produto, upload foto+documentos incrementa apenas contador de `fallidos`; após falha, redireciona para `/productos/[id]?aviso=...` (ficha exige VER). ID não é mantido em URL de alta para retry/recarga, a foto e documentos já enviados não são rastreados individualmente; nova tentativa pode criar duplicado. `ProductoForm` pode marcar `guardado=true` após retorno de callback mesmo quando foi feita navegação a uma ficha inacessível.
- **Aceite:** fase pós-criação com ID durável e recuperação em rota de alta CREAR-only; uploads apenas pendentes; pós-refresh preservar ID e exigir reeleição do arquivo perdido quando necessário, sem novo POST de produto; encerramento positivo do servidor como condição para sucesso, fluxo VER volta a lista, CREAR-only mostra «Producto registrado», sem links proibidos nem aviso indevido pós-cierre. Não conceder acesso a ficha nem permitir fotos/documentos de outro criador/tenant; manter imagem separada de documentos e autorização por ação.

### PRD-D03 — ALTA — Edição concorrente perde alterações sem CAS

- `app/api/productos/[id]/route.ts` obtém lock `FOR UPDATE` mas não traz nem compara `actualizado_at`; depois `UPDATE` substitui múltiplas colunas e sincroniza filhos. `[id]/page.tsx` PUT envia corpo sem token, embora GET retorne `actualizadoEn`.
- **Aceite:** exigir versão/token de edição no PUT, testar sob lock contra versão exata persistida, responder HTTP 409 para snapshot obsoleto **antes de DELETE/UPDATE dos filhos, preço, unidade e dados**, nunca sobrescrever edições de A com formulário B antigo; sem token, negar com erro orientativo; GET/UI mantém token e explica conflito para recarga deliberada. Atenção à precisão de `timestamp` PostgreSQL (microsegundos versus Date JSON milissegundos) ao criar token; não perder granularidade silenciosamente e não precisar migration histórica. Empresa, permissões, alcance de depósito, preço fiscal e código imutável preservados.

### PRD-D04 — MÉDIA — Idempotência da confirmação documental

- `lib/productos/permisos-documentos.ts` permite criador CREAR-only finalizar apenas enquanto `cargaInicialAbierta=true`, e `app/api/productos/[id]/documentos/finalizar/route.ts` checa isso antes do UPDATE. HTTP 200 perdido e retry devolve 403.
- **Aceite:** repetir fechamento já confirmado somente para o **mesmo criador autenticado da mesma empresa**, com CREATE-only, retorna sucesso idempotente **sem reabrir carga ou autorizar outro upload**; garantir mesmo contexto sob corrida, e negar outros criadores/tenants; não alargar `CARGAR` ou `EDITAR_DATOS`.

### PRD-D05 — MÉDIA — UI de consulta permite criar/editar

- `productos/page.tsx` mostra CTAs «Nuevo producto» sem verificar CREAR; `[id]/page.tsx` renderiza formulário editável sem `PRODUCTOS.EDITAR` e PUT exige EDITAR. GET só traz `permisosDocumentos`, que não equivale a permissão de editar dados maestros.
- **Aceite:** botões e listagem usam CREAR obtido da sessão; formulário modo VER-only bloqueia edição comum e submissão; preservar download e ações de foto/documentos com ACL própria sem colocar ações autorizadas dentro de `fieldset disabled`. Separar perfil com EDITAR e permissão de visualizar ficha (VER) sem inventar visibilidade adicional.

### PRD-D06 — MÉDIA — Rascunho de documento perdido ao trocar aba

- `_components/pestanas/documentos.tsx` mantém `nuevo`/`editando` locais; `producto-form.tsx` desmonta `PestanaDocumentos` ao mudar `tab`, ignorando o rascunho no `useProtegerCambios`. Rascunho novo, substituição, campos e arquivo podem sumir silenciosamente.
- **Aceite:** manter estado ou pedir confirmação explícita **antes** de desmontar o editor; cancelar preserva a aba e conteúdo; confirmar abandona apenas o rascunho, nunca modifica registros já gravados; proteger também tentativa de saída com rascunho pendente, preservando upload privado/versionamento, sem alterar serviços fiscais.

## 3. Preservações de segurança e decisões fechadas

- **Não reimplementar** ajustes PRD-A02/A15/A16 e R02-01…04 / AUD-R03 de 12/10: novos produtos vendáveis só com IVA+unidade SIFEN aptos, IVA 10% Gravado default editável, emissão recusa `vendible=false` ou unidade SIFEN inexistente/inativa, MT antigo usa SIFEN 108 com 87 distinto, isolamento estoque/custos inclusive depósitos inativos, configuração de depósito não visível preservada, histórico da unidade-base e rollback ordenado NEX-053→052. **Não tocar NEX-001…053 históricos, aplicar SQL ou pedir SQL à VM.**
- Catálogos de Productos, Listas de precios, Stock, Movimientos, Facturas, NCE e painel Dashboard são outros menus e **não estão autorizados** neste pacote. A política de visibilidade global de produtos do gate C24 está aberta, não resolvê-la implicitamente.
- PRD-O01 paginação em memória, O02 polimento visual e O03 estado de migrations são observações/operacionais, não autorização para refatoração.
- Sistema **somente desktop**; sem desenvolvimento mobile.

## 4. Implementação e teste posterior

O responsável manifestou intenção de seguir para Productos; este relatório fundamenta os seis desvios, sem autorizar Claude a auditar por conta própria. **Ordem técnica recomendada:** D03 (concorrência), D01+D02+D04 (alta/retomada), D05 (interface), D06 (rascunhos). Se houver dependência direta, agrupar com justificativa sem afetar outros módulos.

**Testes CURTOS, focalizados em invariantes alteradas:** CAS sem token, A/B concorrentes e isolamento; GET catálogos CREATE-only sem fila completa de produtos, query desconhecida/vazia; pós-POST 1 arquivo/foto falha, refresh e retry sem duplicata; fechamento após perda da resposta e criador/tenant alheios; VER-only com documentos permitidos; editor de documento aba→aba e saída. Evitar suites históricas massivas, build, lint/tsc global, PostgreSQL real, VM/Docker, CI manual e deploy. Apresentar número real e limitações.

**Fluxo obrigatório:** Claude desenvolve somente após comando autorizado, publica SHA e para. ChatGPT audita a entrega no SHA e registra Linear; humano homologa. Não declarar homologação ou avançar Catálogos de productos automaticamente.
