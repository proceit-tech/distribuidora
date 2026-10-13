# Auditoria por menu — Catálogos comerciales

**Rota principal:** `/catalogos-comerciales`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado:** ABERTA — NÃO AUDITADA INTEGRALMENTE — NÃO HOMOLOGADA  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Catálogos comerciales**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

## Itens obrigatórios da auditoria completa

- [ ] Todas as rotas e subtelas: navegação, abas, ações, modais, estados de erro e vazio.
- [ ] Campos: origem, exigência, máscara, validação client/server, persistência e retorno.
- [ ] APIs: métodos, status HTTP, consultas, filtros, paginação, transação, concorrência e tratamento de exceções.
- [ ] Autenticação, permissões de ação, isolamento multiempresa e alcance de sucursal.
- [ ] SQL: relações, constraints, índices, FK, trigger, integridade e scripts vinculados.
- [ ] Integrações e dependências entre menus; compatibilidade de dados.
- [ ] Casos de teste: positivos, negativos, limites e regressões; evidências de execução.
- [ ] UX: responsividade 1440/768/375, foco, acessibilidade, textos, confirmação de ações, screenshots reais.
- [ ] Conclusão com todos os achados numerados, severidade, evidência e critério de aceite.

## Achados confirmados até agora (parciais)

**AUD-CC-R01** (seções I–IV): seis achados de código/SQL (CC-A01…A06). **AUD-CC-R02** (seção V): mais um achado confirmado por inspeção da integração Clientes (CC-A07). Total: **sete achados abertos**. Nenhum teste HTTP, navegador, PostgreSQL ou VM foi realizado nestas rodadas.

## Pendências

Primeira passagem dirigida concluída em 12/10/2026; auditoria integral de UI/banco não concluída. Não atribuir percentual de homologação ou afirmar que as migrations estão aplicadas com base apenas no Git.

## Regra de migrations

O responsável mostrou NEX-001…051 já aplicadas na VM. Proibido editar scripts aplicados, checksums ou reexecutar SQL histórico como se fosse nova migration. Qualquer nova alteração estrutural exige justificativa, aprovação e migration incremental a partir de NEX-052.

## I. AUD-CC-R01 — primeira auditoria dirigida do menu Catálogos comerciales (12/10/2026)

**Branch:** `feature/NEXIT-2026-001-banco-demo`; versão estática GitHub em 12/10/2026. **Pedido do responsável:** auditar o menu; **NÃO houve autorização para Claude implementar este menu nesta mensagem**. Fontes confrontadas: `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progresso pertinente no `PROGRESSO-NEXIT-V1.md` (item Listas/Catálogos), `documentacao/v1/homologacao-visual/IMPLEMENTACAO-LISTAS-PRECIO-Y-CATALOGOS-COMERCIALES-2026-10-12.md`, `/catalogos-comerciales/page.tsx`, layout com `guardPage`, as sete rotas `/api/catalogos-comerciales/*`, `lib/comercial/{servidor,formulario,validacion}.ts`, `lib/listas-precio/calculos.ts`, migrações NEX-004/045, `scripts/reversion-NEX-045.sql` e NEX-052 (wrapper novo de grants), além dos casos existentes `lib/listas-precio/listas-comerciales.casos.ts`. **Só leitura estática**; não foi feito teste em PG, VM, navegador, HTTP nem execução local de suites.

### II. Achados com prova e correção mínima

| ID | Severidade | Evidência atual | Impacto e aceite mínimo V1 |
|---|---|---|---|
| **CC-A01** | **ALTA — sobregravação concorrente de Canales/Zonas** | `lib/comercial/servidor.ts:95-104` GET devolve `id,codigo,nombre,activo`, mas NÃO `actualizado_at`/versão; `editarSimple:139-153` faz `SELECT activo ... FOR UPDATE`, sem comparar versão do editor, e atualiza `codigo/nombre/activo` da linha inteira. `app/(private)/catalogos-comerciales/page.tsx:631-637,214-245` envia edição sem token. `NEX-004` já define `actualizado_at` nos dois catálogos. | Editor B com formulário antigo salva depois de A e sobrescreve nome/código/estado de A. Incluir versão de edição obrigatória (microssegundos, após `FOR UPDATE`, antes de UPDATE) com 409 e rascunho preservado, incluindo ação de ativar/inativar; testar dois editores, token ausente/obsoleto e request cross-tenant. Sem migration necessária se timestamp vigente confiável. |
| **CC-A02** | **ALTA — alterações não salvas no menu lateral** | `app/(private)/catalogos-comerciales/page.tsx:97-110` instala apenas `beforeunload`, que não intercepta links SPA Next.js do sidebar; confirmações manuais só em tab/Nuevo/Editar/Cancelar e link próprio para Listas (`:322-329`). Falta o hook compartilhado `useProtegerCambios` já empregado em Clientes/Productos/Catálogos. | Ao sair pelo menu lateral, pode perder código/nome/taxa/motivo ainda não salvos. Reutilizar guard existente, sem avisos duplicados no link próprio nem em cancelamento interno; after save deve liberar saída. Casos edição limpa/suja, sidebar, tabs, reload e link Listas. |
| **CC-A03** | **ALTA/MÉDIA — consultas fora de ordem exibem aba errada** | `page.tsx:73-95` `cargar` depende de tab/historial; `useEffect` dispara novo fetch ao alternar. Não há `AbortController`, token de geração nem verificação da aba vigente antes de `setFilas`, `setPermisos`, `setMonedas`, `setCargando`. Resposta lenta de Tipos de cambio pode substituir linhas/permissões de Zonas ou vice-versa. | Em alternância rápida, tabela, títulos, ações e permissões podem pertencer a consultas diferentes. Aplicar compuerta de requisição já criada para Catálogos de Productos; teste com respostas em ordem invertida entre as três abas e filtro historial. Não redesenhar telas. |
| **CC-A04** | **MÉDIA/ALTA — erro de API deixa estado de permissão ou formato enganoso** | `page.tsx:78-88` exige `r.ok`, mas recebe payload 200 sem `j[meta.clave]` e o converte silenciosamente em `[]`; no `catch` limpa apenas `filas`/`error`, mantendo `permisos` anteriores. Botões `Nuevo`, formulário aberto/`Guardar` e ações da lista não consultam simultaneamente `cargando`/`error`. | Uma falha 401/403/500/200-malformado pode ser apresentada como catálogo vazio, mantendo controles habilitados e rascunho de aba anterior. Exigir array válido (e permissões coerentes), invalidar estado antigo em erro, bloquear ação quando carga não confiável, **preservar rascunho** até recarga correta. O backend continua protegendo permissões — não chamar isto de bypass da API. Regressões 403/500, JSON sem chave, formulário já aberto e falha/recuperação. |
| **CC-A05** | **MÉDIA — comparação monetária com perda de precisão e limite de SQL não validado** | `lib/comercial/servidor.ts:242` rejeita correção por `Number(a.cambio) === Number(nuevo)`; a coluna `NEX-045:50` usa `numeric(18,6)` e a string normalizada permite até 6 decimais (`calculos.ts:119-145`). Acima de aproximadamente 2^33 PYG por unidade, a precisão binária do Number pode não distinguir pequenas diferenças aceitas pelo SQL. `normalizarCambio` tampouco impõe limite de **12 dígitos inteiros** do `numeric(18,6)`; um valor grande pode cair em erro PG 22003 tratado como 500 genérico. | Comparar valor decimal canônico como string/decimal exato, sem `Number` para identidade financeira; validar alcance `numeric(18,6)` no backend com mensagem de campo antes de INSERT/UPDATE, e mapear possível 22003. Testar mudança de 0,000001 em número elevado e limite 12/13 dígitos inteiros. Não inventar conversão ou moeda automática. |
| **CC-A06** | **SEGURANÇA DE REVERSÃO — condicional a migrations posteriores** | `scripts/reversion-NEX-045.sql:17-26` reinstala `nex_aplicar_grants_runtime()` com lista **fixa** `base+proveedores+fiscal+productos`, e elimina helper comercial. A migration posterior NEX-052 (`:147-160`) usa descoberta de **todos** os helpers ativos, incluindo grants de módulos adicionais; NEX-053 depende da 052. Executar reversão 045 após aplicar 052/053 (mesmo que tipos_cambio esteja vazia) substitui a função dinâmica e pode retirar recomposição de privilégios de Clientes/Productos/Depósitos ao fazer próximo reset. | Antes de qualquer rollback real, detectar migrations posteriores no ledger/objetos, **abortar reversão insegura**, exigir ordem de dependências e preservar a política de grants efetivamente instalada. Não editar NEX-045 se já aplicada, nem executar rollback. Se reversão histórica for necessária, preparar script incremental/controlado separado **após aprovação humana**. Teste em banco descartável da guarda/dependências, não VM. |

### III. Comportamentos corretos a preservar e limites de implementação

- Três abas já operacionais em código: **Tipos de cambio**, **Canales de venta**, **Zonas comerciales**; rotas GET/POST/PUT e POST anular com `LISTAS_PRECIO.VER/CREAR/EDITAR`, sessão, empresa do usuário e status adequados; criação de zona/canal com índice único case-insensitive em NEX-045; inativação lógica preserva FK de Listas/Reglas. Não criar exclusão física.
- Taxa **manual** (PYG por unidade de moeda), `PYG` excluído, `validarTipoCambio` exige data válida, moeda ativa, taxa positiva; NEX-045 define unique vigente empresa/fecha/moeda e versionamento imutável. `corregirCambio` faz UPDATE de retiro + INSERT de nova versão na mesma transação, `anularCambio` retira sem apagar. O lock da linha e a chave consultiva estão no código; **concorrência REAL só será comprovada no PostgreSQL**.
- O campo Motivo é opcional na correção conforme decisão versionada; não exigir fonte automática, compra/venda bidirecional, download de taxas ou conversão de preços/custos. O uso das cotações em motor de preços e os algoritmos de descontos NÃO foram aprovados. Não reabrir esses assuntos automaticamente.
- O `estadoCambio` da tela classifica uma versão retirada como 'Reemplazada' se existir qualquer versão posterior para a mesma data/moeda, mesmo que a posterior tenha sido anulada; isso é uma convenção visual atual, não prova de erro fiscal sem regra distinta aprovada.
- `NEX-045` está no Git e o progresso histórico de sua criação dizia NÃO aplicada, enquanto a anotação posterior do responsável reporta NEX-001…051 aplicadas. **Sem consultar o ledger real, não se afirma seu estado na VM**. Não modificar migrações já aplicadas nem recomendar aplicação/reversão por suposição.

### IV. Priorização e próximos testes

**Etapa de estabilização futura sugerida, não autorizada ao Claude por este pedido:** (1) CC-A01 proteção de versões Canales/Zonas; (2) CC-A03/A04 integridade dos carregamentos/permissões; (3) CC-A02 rascunho sidebar; (4) CC-A05 precisão monetária; (5) CC-A06 guarda de reversão apenas como segurança de operação SQL, antes de qualquer necessidade real de rollback. Não criar migrations novas para defeitos resolúveis em código. Não misturar com tarefa ativa de Listas de Precios + residual Catálogos de Productos.

**Casos pendentes de homologação humana:** requests sem e com token de versão, 2 editores em mesma empresa, isolamento entre empresas, 401/403/500, resposta fora de ordem, confirmação de saída, taxa com 6 decimais e valores altos, corretivo x anulação concorrentes, constatação de grants da role runtime e do ledger NEX-045/052/053. Capturas 1440/768/375, tabulação e layout responsivo não foram inspecionados ao vivo.

**Resultado desta sessão:** 0 testes, 0 build/lint, 0 execuções de migrations/SQL, 0 navegador, 0 PostgreSQL e 0 VM. **Catálogos comerciales permanece ABERTO/NÃO HOMOLOGADO**. Este commit de ChatGPT registra auditoria documental, não modifica aplicação.

## V. AUD-CC-R02 — confronto independente com integrações de Clientes (12/10/2026)

**Base inspecionada:** `71cf96f4b1c18fcd0f8cb9f23ab38b52c26f19b4` — `feature/NEXIT-2026-001-banco-demo`. Revisão estática do próprio código após AUD-CC-R01, sem modificação de aplicação nem execução de testes, SQL, PostgreSQL, VM, Docker ou navegador. Os achados **CC-A01…CC-A06** de R01 permanecem abertos: os pontos de evidência foram confrontados novamente e as rotas/telas/services/migrations continuam sem correção desses defeitos. Esta seção acrescenta um achado distinto identificado ao rastrear a integração real com Clientes; não substitui nem altera R01.

| ID | Severidade | Evidência precisa | Impacto e critério de aceite |
|---|---|---|---|
| **CC-A07** | **MÉDIA — vínculos com Clientes omitidos ao inativar Canal/Zona** | `documentacao/banco/nexit/v1/migraciones/NEX-005-clientes.sql:47,64,87,90` define `clientes.canal_venta_id` e `clientes.zona_comercial_id` com FK por empresa para os catálogos. `app/api/clientes/route.ts:543-560` lista só canais/zonas ativos nos cadastros; `app/api/clientes/[id]/route.ts:129-135` recupera referências históricas inativas. Apesar disso, `lib/comercial/servidor.ts:94-104` calcula `usos` exclusivamente de `listas_precio` e `lista_precio_reglas`, ignorando os clientes; `app/(private)/catalogos-comerciales/page.tsx:261-269` pede confirmação somente quando `f.usos > 0`, e `:532-535,595-598` mostra apenas vínculos das listas/regras. | Um canal ou zona utilizado por clientes mas não por listas/regras pode ser inativado **sem qualquer aviso de vínculo**, saindo também dos seletores de novos clientes; a FK e a referência histórica continuam, portanto **não há exclusão ou perda de relacionamento** comprovada. Contar separadamente clientes e listas/regras, exibir vínculos reais e confirmar inativação se qualquer categoria tiver uso. Manter referência histórica nos clientes existentes e exigir `empresa_id` em cada consulta. Testar: (a) apenas clientes vinculados; (b) apenas listas/regras; (c) ambos; (d) zero vínculos; (e) referências de outra empresa não entram na contagem. Não ampliar o escopo funcional V1. |

### Estado e regressões ainda pendentes

- **Sete achados de código/documentação neste menu:** CC-A01 a CC-A06 (R01) e CC-A07 (R02). Nenhum resolvido ou homologado nesta rodada.
- Em especial, a confirmação atual de inativação cobre apenas listas e regras; o relacionamento histórico de Clientes **já é preservado** pelas FKs, e essa proteção não deve ser removida.
- **Testes executados nesta revisão:** 0 automatizados, 0 HTTP, 0 build/lint, 0 PostgreSQL, 0 VM/Docker, 0 navegador. Apenas confrontação estática dos arquivos GitHub no SHA acima. Veredito: **CORREÇÃO SOLICITADA; NÃO HOMOLOGADO**.
