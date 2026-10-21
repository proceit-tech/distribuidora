# AUD-NEXIT-LISTAS-PRECIOS-DESKTOP-R02 — Reauditoria independente do menu Listas de precios

**Data:** 19/10/2026. **Auditor:** ChatGPT. **Sistema:** NEXIT / ERP DistribuNex **somente desktop**. **Repositório:** `proceit-tech/distribuidora`. **Branch:** `feature/NEXIT-2026-001-banco-demo`. **HEAD de corte:** `3ce1cccfe5740fe8c48b1c43821371c8792fa996`. **Corte anterior R01 (18/10):** `25f2844d1a18171c2520850ca7379c879d937438`.

## Parecer

**Quatro achados ABERTOS e confirmados na versão vigente: LPR-D01 ALTA; LPR-D02, LPR-D03 e LPR-D04 MÉDIAS. Listas de precios NÃO HOMOLOGADO.** A revisão confirma problemas de autorização no fluxo de alta, interface de consulta/edição, classificação de vigência e degradação sob falha de catálogo. **Não identificada correção posterior** em nenhum dos 11 arquivos centrais. As correções históricas de preço, CAS e integridade comercial permanecem no código; não reabri-las nem alterar SQL históricos.

## 1. Fontes, escopo e confiabilidade

Protocolos atualizados consultados no GitHub: `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, seções pertinentes de `PROGRESSO-NEXIT-V1.md`, `documentacao/v1/auditoria-por-menu/AUD-LISTAS-PRECIOS-V1.md` §§I–VIII, auditoria anterior `documentacao/testes/AUD-NEXIT-LISTAS-PRECIOS-DESKTOP-R01-2026-10-18.md`; schema/tipos `types/lista-precio.ts`, GET/POST/PUT, telas, helpers e testes; contratos de migrations NEX-008/017/018 conforme documentos canônicos. A leitura é **estática e dirigida**, sem declarar inspeção de cada ramo/SQL em operação.

**Comparação objetiva SHA de blob entre R01 e HEAD vigente — todos os 11 idênticos:**
- `app/(private)/listas-precio/layout.tsx` (`3c6f165fedad93c4e598eb47317bf42db98f682b`);
- `app/(private)/listas-precio/page.tsx` (`01aaafd3f02e6eddd250e7e36c944d3981cf667f`);
- `app/(private)/listas-precio/nuevo/page.tsx` (`e6acfb6237d752e2751a56bb36d17454feec92ec`);
- `app/(private)/listas-precio/[id]/page.tsx` (`015f46a104a3abc3333571f32ec9a3d3bb45db5f`);
- `app/(private)/listas-precio/_components/lista-precio-form.tsx` (`15b8aa77a53742c62001adcd2950a15170c54f2c`);
- `app/api/listas-precio/route.ts` (`78f35a445262df790cfc4a5b96380312071f2354`);
- `app/api/listas-precio/[id]/route.ts` (`923cb475dcf18a343e4584ce3ac669b14852d16d`);
- `lib/listas-precio/shared.ts` (`03de6ecc117ff1c5ec3cce9c1ed520b842c9f5e0`);
- `lib/listas-precio/formulario.ts` (`0a9de8fb58c5dc33644f31d9493fdb87276af841`);
- `lib/listas-precio/cliente-api.ts` (`a103d2cfeffa7c219c52c412c9d9926169b4c961`);
- `lib/listas-precio/estabilizacion.casos.ts` (`63ca8b1b7ebdc7285cd1928ad6e18dbcbde6daac`).

**Auditor executou:** 0 casos automatizados, 0 HTTP real, 0 React/navegador, 0 PostgreSQL/VM/Docker, 0 migration/SQL, 0 CI, 0 build, 0 lint/tsc globais ou pontuais. Não foi feito deploy e o ledger de migrations no banco real não foi inspecionado.

## 2. Achados confirmados — evidências atuais e aceite

### LPR-D01 — ALTA — LISTAS_PRECIO.CREAR não permite alta pela UI

**Evidência:** `app/(private)/listas-precio/layout.tsx` exige `guardPage("LISTAS_PRECIO","VER")` para **todo** o subárvore, incluindo `/listas-precio/nuevo`. `app/api/listas-precio/route.ts:36–45` exige VER **antes** de reconhecer `?modo=catalogos`, mas `POST` exige CREAR, isto é, permissão independente. `_components/lista-precio-form.tsx:150–174` carrega opções por `cargarCatalogosListas()`; `nuevo/page.tsx` redireciona ao listado com VER após o POST. Perfil somente CREAR não consegue iniciar nem concluir pela UI, apesar de estar autorizado a POST na API.

**Cuidado de segurança crucial:** a resposta atual `GET /api/listas-precio?modo=catalogos` contém **monedas, grupos, zonas, canales, clientes, produtos e seus `costoPromedio` e `precioReferencia`, todas as listas base, `monedaBase`**; não liberar todo esse conteúdo indiscriminadamente a CREAR-only. A política de custo/alcance por depósitos ainda não foi decidida (observação LPR-O01). Também evitar bypass por `modo=`, parâmetros desconhecidos ou combinados; não transformar consultas de lista em catálogo autorizado.

**Aceite:** separar acesso do layout para listado/detalhe apenas VER, alta somente CREAR; responder catálogos **mínimos** necessários à criação com autorização específica, sem expor listas/fichas/clientes/custos fora das permissões definidas; garantir pós-alta para CREAR-only sem navegação proibida. Caso a composição de lista por produtos exija **decisão funcional de visibilidade**, isolar o gate e reportar, não ampliar catálogo implicitamente. Testes curtos por sessão/tenant, CREATE-only, VER-only, sem permissão, finalidade de GET, parâmetro inválido e pós-alta.

### LPR-D02 — MÉDIA — ações de UI sem CREAR/EDITAR

**Evidência:** `app/(private)/listas-precio/page.tsx:445–447,663–665` mostra `Nueva lista` mesmo para VER-only. `[id]/page.tsx` entrega `mode="edit"` para toda ficha carregada, sem ler permissão EDITAR. `_components/lista-precio-form.tsx:420–550,905–920` renderiza controles editáveis e `Actualizar lista` para VER-only. As APIs continuam protegidas por CREAR/EDITAR, portanto não foi demonstrado bypass de persistência, mas a UX anuncia ações impossíveis.

**Aceite:** disponibilizar permissão real CREAR e EDITAR do servidor para as telas, condicionar os botões e a escolha de modo; ficha VER-only consulta sem possibilitar submit e sem bloquear ações de leitura legítimas; nunca relaxar POST/PUT. Testes focais perfil VER-only, CREAR+VER, EDITAR+VER, administrador e usuário sem permissão, isolamento de empresa e link de retorno.

### LPR-D03 — MÉDIA — estado de vigência e KPI incorretos

**Evidência:** `app/(private)/listas-precio/page.tsx:39–54` faz `getEstadoReal` retornar `VENCIDA` para **qualquer** linha com `vigenteHasta` passado, **antes de examinar `lista.estado`**. Lista `BORRADOR`/ `INACTIVA` vencida por data perde o estado administrativo no filtro e visual. Em `page.tsx:241–269`, `resumen.activas` conta `activo && getEstadoReal(lista)==="ACTIVA"`, **sem validar `vigenteDesde`**, portanto inclui lista com início futuro como «Disponibles para operar». As datas são calculadas pelo fuso do navegador em `new Date('YYYY-MM-DDT23:59:59')`, não pelo contrato local de Paraguay.

**Aceite:** definir uma função de data explícita `America/Asuncion` (sem timezone implícita do dispositivo) e separar estado administrativo do estado de vigência: BORRADOR/INACTIVA continuam assim apesar de `vigenteHasta` passado; só uma lista ACTIVA, habilitada e dentro de ambas as datas pode contar como disponível. Para uma ACTIVA com início futuro, distinguir «Aún no vigente» da disponível; manter vencimento inclusivo no calendário PY e rótulos/filtros coerentes. Testes puros em fusos diferentes com BORRADOR vencida, INACTIVA vencida, ACTIVA futura, vigente e vencida; data-limite PY. Não alterar estado armazenado, SQL, inventário ou FE.

### LPR-D04 — MÉDIA — falha de catálogos permite submissão e assume PYG

**Evidência:** `_components/lista-precio-form.tsx:145–176`: `catalogo` começa `null`, `cargarCatalogosListas()` só faz `setCatalogo` no sucesso e `setError` em erro; **não existe estado de carga confiável nem ação focal de retry**. `monedaBase=catalogo?.monedaBase ?? "PYG"` assume PYG antes de conhecer configuração real. `submit` em ~336–392 não barra quando catálogo falhou, e botão `Guardar lista/Actualizar lista` no final só usa `disabled={saving}`; se houver dados no formulário, consegue tentar POST/PUT com opções ausentes, inclusive após GET 403/500/red/JSON inesperado. A API ainda valida as referências e moeda, sem prova de corrupção de dados real.

**Aceite:** distinguir `cargando / error / cargado`, verificar shape útil dos catálogos (não apenas HTTP 200), não declarar moeda base como PYG sem certeza (empresa pode ter base USD ou BRL), impedir submit com carga faltante/falhada no handler e botão, permitir retry autorizado que preserve rascunho, manter referências históricas do próprio documento em edição sem acrescentar inativos globais. Não descartar modificações nem permitir seleção «aparentemente vazia» como válida. Testes focais 401/403/500/erro de rede/shape inválida, base USD, botão/handler, retry bem-sucedido, rascunho intacto e refs históricas.

## 3. Correções anteriores que devem permanecer

**LPR-A01…A09, LPR-R02-01:** a auditoria histórica §VII e R01 mostram `planificarHijos` preservando IDs e versões, `itemsCargados` vindo do `initial.productos` (mesmo excluídos do rascunho), checagem de todos os itens sob `FOR UPDATE`, `exigirVersionLista` (cabeçalho) e `conflictoItems` sob lock antes de atualizar cabeçalho/filhos, SQL 409/rollback se obsoletos, criação/edição com autenticação e `empresaId` derivado da sessão. Superposição de escalões, unidade de apresentação, `REF-VENTA` de código fixo, moeda/lista-base/regras e referências históricas inativas já possuem validação; não refazer esses mecanismos nem criar um motor de preços novo. Compatibilidade com NEX-008/017/018 obrigatória; não editar migrations anteriores nem aplicar banco sem autorização. Nenhuma homologação de concorrência real foi executada.

**Observações sem bug material confirmado (LPR-O01…O05):** confidencialidade dos custos empresariais nos catálogos segundo autorização ainda sem política aprovada, possíveis limites de precisão `float8`/JS `Number`, escala de listagem em memória sem medição, confirmações nativas já existentes e GET de cabeçalho/filhos sem snapshot explícito sob alteração concorrente. Requerem contrato funcional ou teste direcionado antes de virar tarefa de correção; não decidir política C24 ou custo por conta própria.

## 4. Gestão, Linear e continuidade

- Criar quatro subtarefas individuais em **PRO-70**: LPR-D01 ALTA e LPR-D02/D03/D04 MÉDIAS, todas `Todo` até correção; PRO-70 `In Review` com bloqueios explícitos. Nenhuma `Done`.
- Auditoria **documental apenas**, sem modificação funcional, testes ou homologação. Somente após autorização expressa do responsável Claude implementa tarefas selecionadas, testa apenas funcionalidades direcionadas, commita/push e para para AUD-R03 independente de ChatGPT. Não enviar Claude por padrão somente por ter auditado.
- Preservar decisões U09/U10, custo/depósito por política, não avançar automaticamente **Catálogos comerciales**. **Estado do menu: Listas de precios NÃO ENCERRADO / NÃO HOMOLOGADO.**
