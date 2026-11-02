# AUD-NEXIT-MOVIMIENTOS-DESKTOP-R02 — Reauditoria de vigência e riscos do menu

**Data:** 19/10/2026. **Auditor:** ChatGPT. **Produto:** NEXIT/DistribuNex V1, exclusivamente desktop.  
**Repositório:** `proceit-tech/distribuidora`; **branch:** `feature/NEXIT-2026-001-banco-demo`.  
**HEAD funcional comparado:** `e5c5f2016940d9b59c4a4a30fcf3a33f3852981e`. **Base da R01:** `eaa10106dfb273ddd57079ddab5c978dc6d28009`. [Auditoria original R01](./AUD-NEXIT-MOVIMIENTOS-DESKTOP-R01-2026-10-18.md).

## 1. Veredito

**A AUD-R01 continua tecnicamente vigente quanto ao código funcional do menu.** A comparação GitHub entre a base R01 e o HEAD constatou 212 commits posteriores, mas **nenhum arquivo funcional próprio de Movimientos na lista dos arquivos alterados**. Inspeção adicional de SHAs de blob confirma identidade dos principais 17 arquivos de rotas, telas, helpers, testes e proteção de alterações entre os dois cortes. As três falhas já documentadas persistem nos mesmos trechos do código: **1 ALTA + 2 MÉDIAS; CORREÇÃO SOLICITADA**. Nenhuma correção daquelas falhas foi encontrada nem foi presumida a partir de commits em outros menus.

Esta R02 é a reconfirmação independente da vigência e confronto dos achados, não refaz testes operacionais nem cria achados duplicados. Nenhum novo defeito ALTA/MÉDIA adicional foi demonstrado neste recorte. **PRO-79 In Review; Movimientos NÃO HOMOLOGADO, nenhuma tarefa Done.**

## 2. Arquivos e contratos examinados

Normas atuais: `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, partes pertinentes de `PROGRESSO-NEXIT-V1.md`; contrato `documentacao/v1/DEFINICAO-MENUS-INVENTARIO-V1.md`, ficha `documentacao/v1/auditoria-por-menu/AUD-MOVIMIENTOS-V1.md` e auditoria R01.

Confronto **blobs R01 × HEAD, idênticos**:
- `app/(private)/movimientos/page.tsx`, `nuevo/page.tsx`, `[id]/page.tsx`, `layout.tsx`, `nuevo/layout.tsx`;
- `app/api/movimientos/route.ts`, `[id]/route.ts`, `[id]/anular/route.ts`;
- `lib/movimientos/historial.ts`, `shared.ts`, `cliente-api.ts`, `formulario.ts`, `reglas.ts`, `grupos.ts`, `documentos.ts`;
- `lib/inventario/movimientos.casos.ts` e `lib/ui/proteger-cambios.ts`.

Além desses arquivos, inspecionados diretamente `NEX-014-movimientos-operativos.sql`, `NEX-046-depositos-gestion.sql` e `NEX-052-productos-cambio-unidad-base-stock.sql`, sem executar SQL; registro de existência de script Git não equivale à execução em PostgreSQL. Comparação entre snapshots não apontou alterações nessas migrations.

## 3. Matriz de achados reconfirmados

### MOV-D01 — ALTA — Reenvio de registro pode perder chave de idempotência

**Código:** `app/(private)/movimientos/nuevo/page.tsx:95–111,119–150,204–468`; `lib/movimientos/cliente-api.ts:60–64`; `app/api/movimientos/route.ts:118–153`; `NEX-014:23,333–345`.

O `submit` impede outro clique em Registrar por `saving`, mas os outros campos e mudanças de tipo/grupo não são bloqueados. `cambiar` e `cambiarTipo` limpam `clave.current` mesmo com POST K1 pendente; campo custo também a limpa separadamente. O backend faz BEGIN/COMMIT/ROLLBACK e a função SQL reconcilia reenvio da **mesma** chave; chaves diferentes não identificam a mesma intenção.

**Cenário:** POST A com K1 registrado, resposta perdida; usuário edita durante a espera e restaura valores, invalidando K1; após erro/timeout, reenviar gera K2 e pode gravar segundo movimento físico (quando as regras de saldo o permitem). A presença de `useProtegerCambios(sucio)` não imobiliza inputs nem resolve POST ambíguo. **Risco ALTO persiste.** Nenhuma execução real foi alegada.

**Critério futuro:** snapshot do payload e chave ao iniciar, bloquear qualquer alteração/navegação incompatível durante a mutação, conservar K1 e payload após falha de resultado indeterminado; nova intenção apenas por decisão expressa do operador e sem afirmar que a primeira falhou. Testes dirigidos com promessas/HTTP simulados K1 pendente, alteração tentada, resposta perdida, retry K1 com resultado repetido; não reexecutar migrations.

### MOV-D02 — MÉDIA — Histórico exibe linhas e resumos antigos sob novo filtro

**Código:** `app/(private)/movimientos/page.tsx:73–135,260–269,291–382`.

Há chave de requisição `claveConsulta` e `activo` invalida efeitos de resposta obsoleta, ambos adequados. Contudo a linha `const datos = resultado?.datos ?? null` **não exige** `resultado.clave === claveConsulta`, embora `cargando` detecte a divergência. Assim filtros ou páginas B podem apresentar linhas, links, indicadores e paginação de A durante GET pendente. O aviso de carga aparece apenas quando `filas.length === 0`. Não há comprovação de vazamento de permissão; é contexto exibido indevidamente.

**Critério futuro:** dados/ações visíveis somente se a chave de consulta coincidir (ou bloqueio explícito e inequívoco de resultados antigos), cobrindo filtro A→B, paginação, erro e retry, preservando descarte de respostas fora de ordem.

### MOV-D03 — MÉDIA — Rollover de data provoca reset de borrador

**Código:** `app/(private)/movimientos/nuevo/page.tsx:35–76`.

`hoyAsuncion()` é chamado a cada render; o `useEffect` que carrega catálogos depende de `[hoy]` e, ao resolver, chama `setForm`, `setBase`, `setCantidadTxt` e `setPrecargado`. Uma edição/re-render da tela ao passar meia-noite em Asunción muda `hoy`, refaz GET e pode sobrescrever sem confirmação um formulário em edição.

**Critério futuro:** distinguir data limite de validação de identidade da carga inicial; a passagem D→D+1 não deve sobrescrever rascunho sujo nem recarregar formulário; teste de promessa controlada com rollover e resposta de catálogo tardia, sem introduzir polling global como solução presumida.

## 4. Invariantes preservadas e observações condicionais

- A listagem/detalhe exigem `MOVIMIENTOS.VER`; a página novo herda adicionalmente `MOVIMIENTOS.CREAR` por contrato aprovado; POST valida CREAR, anulação valida ANULAR. Não redefinir CREAR-only sem decisão de política.
- GET histórico, detalhe e confirmação pós-registro usam `empresa_id` e `ALCANCE_MOVIMIENTO` — transferências só visíveis se origem **e** destino estiverem autorizados. A 404 neutra evita distinção direta de acesso a recursos alheios.
- Gravação e anulação exclusivamente por funções SQL `inventario_registrar_movimiento`/`inventario_anular_movimiento`, transações API, chave idempotente única por empresa, reversão documentada. Confirmação visual `?ok` somente após consulta autorizada.
- Reserva/quarentena/lote/custo conforme tipos documentados; referências de documentos permanecem textuais e sem geração física automática por FE/NCE. Quatro agrupamentos de UI não eliminam os nove tipos SQL.
- **Observações MOV-O01…O06 da R01** permanecem observações, não achados comprovados adicionais: metadata de depósitos não autorizados no catálogo sob política antiga, snapshots independentes de leitura, limites numéricos, nativo `window.confirm` e motivo de anulação durante POST, saldo informativo e trânsito/integração física futura. Nenhum teste concorrente em PG foi executado.

A atualização recente de Dashboard/Stock e o trabalho de C24 transversal não implicam mudança no motor ou arquivos do menu Movimientos; dependências cruzadas devem preservar políticas já aceitas.

## 5. Testes, cobertura e encerramento

**Testes executados pelo ChatGPT nesta R02: ZERO.** Foi feita leitura de fonte Git, comparação de commits e blobs, contratos de API e migrações; não houve React/navegador, HTTP de verdade, PostgreSQL, Docker, VM, SQL, migrations, CI manual, build/lint/tsc globais ou deploy. Testes históricos presentes no Git não devem ser citados como executados nesta rodada.

**Estado:** auditoria estática atualizada via R02, **1 ALTA + 2 MÉDIAS abertas**, PRO-79 In Review, não homologado. **Próxima correção prioritária MOV-D01**, apenas se o responsável autorizar trabalho ao Claude; depois auditoria independente do commit (R03). MOV-D02 e MOV-D03 devem ser abordadas em rodadas autorizadas separadas ou com escopo explicitamente aprovado. Não iniciar outro menu automaticamente.
