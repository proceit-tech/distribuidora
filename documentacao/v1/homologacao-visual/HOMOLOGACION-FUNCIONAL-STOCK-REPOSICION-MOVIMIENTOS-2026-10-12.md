# Auditoria complementar e homologação funcional — Stock / Reposición / Nuevo movimiento

**2026-10-12 · Claude Code.** Etapa seguinte à aprovação técnica condicionada do commit `1fc2bedc` (auditoria `AUDITORIA-REVISAO-VISUAL-STOCK-REPOSICION-MOVIMIENTOS-1FC2BEDC-2026-10-12.md`). **Sem migration, sem SQL real, sem alterar AUD-REP-01…04 nem a política de valorização/movimentação.**

> **Estado: NÃO HOMOLOGADO.** Os itens 5 (PostgreSQL real), 9 (navegador 375/768/desktop) e 10 (capturas reais) **não foram executados por Claude**: a regra permanente do projeto proíbe acessar o PostgreSQL real, a VM e o Docker; a máquina local não tem PostgreSQL de teste, e as telas exigem sessão autenticada com dados reais (sem banco, as APIs respondem 503 ou lista vazia). Nada neste documento afirma resultado de teste que não ocorreu. Abaixo estão o que foi feito (análise estática + testes locais), o script e o roteiro para o responsável executar os gates.

## 1. Integridade formulário ↔ API ↔ SQL ↔ permissões (item 1)

Revisão de `lib/movimientos/formulario.ts`, `lib/movimientos/shared.ts`, `app/api/movimientos`, NEX-014 e layouts. Veredito por ponto:

| Ponto | Resultado |
|---|---|
| Tipos (9), exigência de origem/destino/custo | Coincidem formulário = `prepararMovimiento` = SQL. Conforme. |
| Quantidade (>0, 4 decimais), custo explícito ≥ 0, data não futura (America/Asuncion), origem≠destino | Formulário antecipa o que a API/SQL rejeitam; a API continua autoridade. Conforme. |
| Lote por modo de controle; vencimento só em entradas; lote novo só em ENTRADA/AJUSTE_POSITIVO | Conforme. **F-IDEM-01 (corrigido):** lote novo simultâneo — ver §5. |
| Alcance de depósitos | UI: depósitos `permitido`; catálogo: saldos/lotes filtrados (commit anterior); SQL: `usuario_puede_deposito` em registrar e anular. Conforme (3 camadas). |
| Permissões | `/movimientos/*` exige `MOVIMIENTOS.VER` (layout pai); `/movimientos/nuevo` exige também `CREAR` (layout); POST exige `CREAR`; função SQL exige `MOVIMIENTOS.CREAR`; anular exige permissão crítica. Quem tem `CREAR` sem `VER` não chega a «Nuevo movimiento» (o layout do módulo o barra): comportamento aceitável, registrado. |
| `empresa_id` | Sempre da sessão; nunca do corpo. Conforme. |
| Motivo/observação/referência | Limites 300/1000/120 iguais em formulário e API; o SQL não exige motivo ao registrar. |
| **Observação (informativa):** a huella da idempotência (NEX-014) cobre tipo, origem, data, depósitos, cliente, referência e linhas, **não** motivo nem observação: reenviar a mesma clave com outro motivo devolve o movimento original (sem conflito). Não é defeito de estoque; fica registrado para decisão (§3). |
| Pré-seleção por URL | Validada no cliente contra o catálogo da sessão e revalidada pela API ao registrar; abrir a URL não executa nada. Conforme. |

Nenhuma divergência de regra de estoque foi encontrada.

## 2. Matriz de origens permitidas por tipo — APROVADA e implementada em UI e API (ver IMPLEMENTACAO-CORRECOES-AUDITORIA-71AE486-MOVIMIENTOS-2026-10-12.md)

Hoje: SQL e API aceitam qualquer origem em qualquer tipo; a UI (commit `1fc2bedc`) apenas **orienta** com a lista abaixo. Proposta para aprovação do responsável, antes de converter em regra de API/SQL:

| Tipo | Origens propostas | Observação |
|---|---|---|
| ENTRADA | COMPRA, DEVOLUCION (de cliente), INVENTARIO, MANUAL | «Compra» e «Devolución» não implicam documento. |
| SALIDA | VENTA, DEVOLUCION (a fornecedor), INVENTARIO, MANUAL | VENTA é o único que admite preço de venda (já regra NEX-014). |
| TRANSFERENCIA | TRANSFERENCIA | Única. |
| AJUSTE_POSITIVO / NEGATIVO | AJUSTE, INVENTARIO, MANUAL | |
| RESERVA, LIBERACION_RESERVA, CUARENTENA, LIBERACION_CUARENTENA | AJUSTE, MANUAL | Cambios de estado, sem custo. |
| ABERTURA / ANULACION | Reservados | ABERTURA só carga inicial; ANULACION só `inventario_anular_movimiento`. |

Decisões pendentes: (a) se a restrição passa a ser validada em `prepararMovimiento` (API) e/ou no SQL (CHECK/função, nova migration); (b) se DEVOLUCION deve distinguir cliente/fornecedor por tipo; (c) migração de movimentos históricos com combinações fora da matriz (nenhum seria alterado: a regra valeria só para novos).

## 3. Obrigatoriedade de motivo por tipo — APROVADA e implementada em UI e API (a tabela abaixo é a proposta original; a regra vigente está em lib/movimientos/reglas.ts)

Hoje: o SQL só exige motivo na **anulação** (≥ 5 caracteres); ao registrar é opcional (≤ 300 na API).

**Movimentações manuais (digitadas na tela Nuevo movimiento):**

| Tipo | Motivo proposto |
|---|---|
| AJUSTE_POSITIVO, AJUSTE_NEGATIVO | **Obrigatório** (≥ 5 caracteres) — corrige estoque sem documento. |
| CUARENTENA, LIBERACION_CUARENTENA | **Obrigatório** — altera disponibilidade. |
| RESERVA, LIBERACION_RESERVA | Obrigatório quando origem MANUAL/AJUSTE (reserva feita à mão). |
| SALIDA com origem MANUAL/INVENTARIO | Obrigatório (saída sem venda/documento). |
| ENTRADA com origem MANUAL/INVENTARIO | Obrigatório. |
| ENTRADA COMPRA/DEVOLUCION, SALIDA VENTA/DEVOLUCION, TRANSFERENCIA | Opcional; referência recomendada. |

**Futuras movimentações originadas por outros módulos (compras, vendas, remisión, devoluções):** o motivo **não é digitado**: o módulo de origem gera um texto estruturado (ex.: «Recepción de compra OC-…») e deve fornecer o **vínculo persistido** documento/linha/evento físico (AUD-DOC-01), a chave de idempotência determinística `fis:<evento>:<linha>:<efeito>` e `documento_referencia`. A obrigatoriedade de motivo livre não se aplica a elas; a rastreabilidade vem do vínculo, não de texto livre. **Anulações** continuam exigindo motivo ≥ 5.

Decisões pendentes: aprovação da tabela; incluir `motivo`/`observacion` na huella de idempotência (exigiria alterar a função SQL: nova migration); onde aplicar (formulário + API; SQL só se aprovado).

## 4. Proteção contra perda de alterações (item 4)

Antes: só `beforeunload` e confirmação nos links da própria página (migas, voltar, cancelar). **Lacuna comprovada:** o menu lateral e demais links internos navegavam sem avisar.

Agora (`lib/ui/proteger-cambios.ts`, hook `useProtegerCambios`): `beforeunload` (fechar, recarregar, sair do site) **mais** interceptação, na fase de captura do documento, de **qualquer** clique em link interno que mude de rota/consulta (menu, migas, voltar, cancelar, tarjetas), com confirmação; ignora ancoragens, nova aba, teclas modificadoras, downloads, outro origem. A decisão é uma função pura testada (`navegacionInternaAbandona`).
**Limite declarado:** o botão «Atrás/Adelante» do navegador dentro da aplicação **não** é interceptado (o App Router do Next.js não oferece API oficial; manipular o histórico arrisca quebrar a navegação). Proposta: aceitar o limite ou, se o responsável exigir, avaliar um guard com `history` em tarefa própria com teste em navegador. O envio bem-sucedido desativa a proteção (`registrado`). Não verificado em navegador.

## 5. Idempotência com PostgreSQL real (item 5) — **NÃO EXECUTADA**

Análise estática (NEX-014): `pg_advisory_xact_lock(hashtextextended('movimientos.idem:'||empresa||':'||clave))` serializa solicitações da mesma chave dentro da transação; depois `SELECT` por `(empresa_id, clave_idempotencia)` (índice único) → mesma huella devolve o movimento (`o_repetido=true`), huella distinta levanta `NEX:IDEMPOTENCIA_CONFLICTO`. Teoricamente concorrência, repetição de payload e perda de resposta de rede ficam cobertas **para a mesma chave**; na UI a chave é mantida enquanto o formulário não muda e renovada ao editar.

Achado e correção **F-IDEM-01** (`resolverLote` em `lib/movimientos/shared.ts`): duas solicitações simultâneas com um **lote novo** faziam `INSERT` em `stock_lotes` sem proteção; a segunda falhava com violação de unicidade (23505) e a API respondia «El movimiento ya existe (clave repetida)» (409), mensagem enganosa. Agora `INSERT … ON CONFLICT (empresa_id, producto_id, codigo_lote) DO NOTHING` e releitura do lote criado pela outra solicitação (a segunda aguarda o commit/rollback da primeira). Coberto por teste com conexão simulada; **não validado em PostgreSQL**.

**Para o responsável:** `documentacao/banco/nexit/v1/scripts/prueba-idempotencia-movimientos.js` (não executado) executa, com N conexões simultâneas: A) mesma chave/mesmo conteúdo → 1 movimento; B) repetição posterior → repetido; C) mesma chave/outro conteúdo → conflito; D) N chaves distintas → N movimentos; E) saldo = +(1+N); compensa tudo com `inventario_anular_movimiento` e confere o retorno ao saldo inicial. Protegido por `CONFIRMO_PRUEBA_EN_AMBIENTE_REAL=SI`; usar produto/depósito de prova com backup. Falhas de rede reais (corte da resposta) devem ser conferidas no navegador: abrir DevTools → Network → «Offline» logo após clicar «Registrar», voltar online e clicar de novo: deve registrar **um** movimento.

| Gate | Resultado | Data / ambiente / operador | Evidência |
|---|---|---|---|
| Script de idempotência | **Pendente** | — | — |
| Corte de rede no navegador | **Pendente** | — | — |

## 6. Reposición × unidades identificadas (item 6)

Inconsistência comprovada: Reposición calculava e oferecia «Preparar transferencia» também para produtos `UNIDAD_ETIQUETADA`, que Movimientos rejeita (o formulário descartava o produto). Correção: `leerEntradasReposicion` lê `modo_control_stock`; o renglão mantém a **sugestão de planejamento** (cálculo inalterado) mas **não oferece** o link e mostra «Unidad identificada (serie/etiqueta): aún no se puede transferir desde Movimientos; la sugerencia es solo de planificación.»

## 7. Quantidade simulada × quantidade preparada (item 7)

Antes o link usava sempre a transferência sugerida, ignorando «A planificar». Regra agora (`transferenciasPlanificadas`, função pura): sem simulação → o confirmado pelo plano global; com simulação → a quantidade escrita é distribuída entre as transferências **na ordem do plano e nunca acima do confirmado** (AUD-REP-04 intacto); o excedente é compra (sem botão), simulação 0 não prepara nada. O texto do link indica «(según A planificar)» quando difere. A simulação continua local e não é salva. Cálculo auditado inalterado.

## 8. ESLint de Movimientos (item 8)

Os 3 erros `react-hooks/set-state-in-effect` de `app/(private)/movimientos/page.tsx` foram eliminados: paginação derivada (chave de filtros + página, sem efeitos) e leitura de `?ok=`/`?buscar=` no callback assíncrono do carregamento (o aviso agora aparece ao terminar de carregar). Comportamento preservado: reinício da página ao mudar busca/tipo/ordem, limite ao total, aviso temporizado, limpeza da URL.

## 9. Navegador 375 / 768 / desktop (item 9) — **NÃO EXECUTADO**

Bloqueio real: sem sessão autenticada nem PostgreSQL, as telas não carregam dados; Claude não pode usar o banco real nem a VM. Roteiro para o responsável (registrar resultado/captura em cada linha; guardar prints em `documentacao/v1/homologacao-visual/evidencias/` com nome `AAAA-MM-DD_<tela>_<largura>.png`, após revisar privacidade):

| Tela | 375 px | 768 px | Desktop | Verificar |
|---|---|---|---|---|
| /stock/[id] | Pendente | Pendente | Pendente | 5 indicadores; blocos Producto/Valorización; tabela de depósitos com rolagem horizontal; ações Entrada/Transferir só com permiso; lotes (vencido/por vencer). |
| /reposicion | Pendente | Pendente | Pendente | Filtros; aviso do filtro padrão; indicadores; «Preparar transferencia» (com e sem simulação); unidad identificada sem link. |
| /movimientos/nuevo | Pendente | Pendente | Pendente | Campos por tipo; erro e foco por campo; aviso de saldo; precarga desde Stock/Reposición; confirmação ao sair (menu lateral incluído); estado «Sin registrar». |
| /movimientos | Pendente | Pendente | Pendente | Busca `?buscar=`; aviso `?ok=`; paginação. |

Também conferir: menus laterais e mensagens em espanhol (PY), botões desabilitados durante o envio, rótulos sem texto cortado, ausência de rolagem horizontal da página.

## 10. Evidências e pendências (item 10)

- **Testes locais:** tsc, ESLint dos arquivos tocados, build e suíte de casos (números no relatório do commit/`PROGRESSO-NEXIT-V1.md`).
- **Capturas reais de navegador:** **não existem no Git**; referências pendentes na tabela do §9.
- **Pendências do responsável:** gates §5 e §9; aprovar §2 e §3; decidir o limite do botão «Atrás» (§4).
- Nada foi marcado como HOMOLOGADO.


## Auditoria de campo — capturas reais e lacuna de Depósitos (2026-10-12)

**Origem:** seis capturas do responsável da VM Nexit (Stock lista e detalhe, Reposición, Movimientos detalhe, Nuevo movimiento); revisão estática da branch oficial e confronto com os documentos já aprovados. **Estado: CORREÇÃO SOLICITADA; não homologado.** Não foram feitos acessos à VM, consultas ao PostgreSQL nem testes de navegador pelo ChatGPT. Estas capturas são evidência visual recebida na conversa, **não estão versionadas no Git**; não alegar evidência anexada ao repositório.

### Decisões oficiais consultadas (não rediscutir)
- \`CLAUDE.md\`, \`documentacao/PROTOCOLO-IA.md\`, seções de Inventario de \`PROGRESSO-NEXIT-V1.md\`: consulta obrigatória antes de tarefa, código oficial no Git, Claude implementa, ChatGPT audita, responsável homologa na única VM; uma tarefa por vez, relatório curto.
- \`DECISAO-STOCK-ACOES-2026-10-12.md\`: sem Exportar Excel ou Valorizado por marca em Stock; Reportes é o destino correto; preservar Movimientos e Reposición.
- \`DECISAO-REPOSICION-MOVIMIENTOS-DOCUMENTOS-2026-10-12.md\`: Reposición é planejamento; alternativas de compra/transferência/devolução/regularização são propostas, não movimentações automáticas; documentos fiscais não equivalem a fato físico; um efeito por evento físico.
- \`ESPECIFICACAO-IMPLEMENTACAO-STOCK-REPOSICION-MOVIMIENTOS-2026-10-12.md\` e AUD-REP-01..04: propriedade PROPIO/TERCERO, visibilidade por depósito, preservação dos cálculos de reposição, saldo/valor por depósito, não inventar localização, unidade identificada não operável por formulário atual.
- Matriz manual \`lib/movimientos/reglas.ts\`, autorização em \`lib/auth/permissions.ts\` e SQL versionado são fontes a conferir, nunca substituir por regra inventada.

### Achados auditados: evidência × causa provável × correção

**VIS-01 — Cadastro de depósitos ausente (bloqueante funcional).** O menu \`lib/navigation/menu.ts\` contém item \`/depositos\`, mas não está em \`V1_HREFS\`; \`app/(private)/depositos/page.tsx\` e \`app/api/depositos/route.ts\` não existem nesta branch. O banco já contém \`depositos\` e \`usuario_deposito\` por consultas reais de Stock/Reposición/Movimientos; imagem mostra 'Depósito principal' e o movimento inicial com destino correto. **Não afirmar que o movimento não tem depósito.** É ausência da interface de gestão. **Claude:** confrontar migrations e regras de depósito/empresa/sucursal/alcance/usuário/permissões; implementar gestão funcional (listar, cadastrar, editar, ativar/inativar) com APIs, guardas e menu somente dentro do contrato existente; depósito usado por movimentações NÃO pode ser excluído fisicamente ou deixar histórico ilegível. Se \`INVENTARIO.VER/CREAR/EDITAR\` não existir ou faltar decisão relevante de sucursal, códigos, inativação, permissão, parar nessa parte com questão objetiva antes de criar políticas/migration. O formulário de movimentos só usa depósitos ativos e autorizados; histórico deve preservar depósitos inativos.

**VIS-02 — Novo movimento publicado mostra «Registrado» antes de salvar.** Captura real mostra badge indevido, campo «Hora *», texto 'El número MOV-XXXXX...' e layout antigo. No Git atual \`app/(private)/movimientos/nuevo/page.tsx\` inicia \`registrado=false\`, mostra \`Sin registrar\` e não apresenta hora editável. **Conclusão:** discrepância comprovada *entre captura publicada e código atual*, não prova de defeito no código atual. Claude não deve «corrigir» o arquivo às cegas; apontar commit que introduziu correção, preservar semântica e documentar ao responsável qual versão atual precisa ser implantada pelo procedimento oficial. ChatGPT confere, responsável atualiza VM. Não criar deploy pela IA.

**VIS-03 — Detalle Movimientos: anulação visualmente quebrada.** Captura real mostra «Motivo de la anulación...» sobreposto/sem campos e ação organizados. \`app/(private)/movimientos/[id]/page.tsx\` usa CSS próprio \`page.module.css\` distinto do padrão de Clientes/Productos; corrigir no código real a área de anulação com label, campo, validação mínimo 5, botão com estado/permissão, confirmação da ação crítica e feedback; distinguir REGISTRADO/ANULADO, não mostrar anulação quando usuário não possui \`MOVIMIENTOS.ANULAR\` e evitar falsos botões. Garantir que API de anulação valida permissão e alcance, e o estorno continue compensatório, nunca delete.

**VIS-04 — Formulário de Movimientos: hierarquia visual e condições.** Captura publicada usa quadros extensos, campos de origem e destino simultâneos, campos sem agrupamento compacto. Versão atual já torna campos condicionais, remove hora cliente, usa validação por campo. Claude deve confrontar versão e componentes Clientes/Productos/Catálogos antes de mexer, corrigir apenas diferenças ainda existentes e reaproveitar UI compartilhada; não duplicar badge/heading ou notas extensas; preservar acessibilidade, motivo contextual, custo de ENTRADA, lote e serial.

**VIS-05 — Reposición vazia por filtro inicial.** Captura: 1 produto/271 disponíveis, sobreestoque; filtro predefinido «Necesitan reposición» e «0 de 1», sem linha visível. O código já inclui aviso sobre linhas ocultas e «Ver todos». Verificar se publicado é versão antiga. Ajuste recomendado: estado vazio específico explicando que nenhum item precisa de reposição e atalho claro «Ver todos», sem inventar necessidades. Não alterar AUD-REP-01..04, não mudar filtro implicitamente sem decisão; não implementar compras.

**VIS-06 — Consistência Stock lista/detalhe:** os 271 disponíveis, 180.000 PYG de custo, 48.780.000 PYG de valor e 150 de máximo são coerentes nas capturas; situação «Sobrestock» é esperada. Uma diferença aparente: lista mostra preço referência 336.000 PYG por unidade e valor total venda referência 91.056.000 PYG (271 × 336.000), coerente. Não tratar os números como erro. No detalhe, o campo proprietário e custo seguem sua base; UX deve adequar topbar, cartões, ações e visual ao padrão aprovado sem eliminar informações. O movimento inicial \`MOV-000001\` é ENTRADA/ABERTURA, destino «Depósito principal», logo não está sem depósito.

**VIS-07 — Integração e autorização ponta a ponta:** auditar tela→API→SQL para \`depositos\`, \`usuario_deposito\`, \`usuario_puede_deposito\`, \`/api/stock\`, \`/api/reposicion\`, \`/api/movimientos\`, detalhe e anulação; conferir multiempresa, sucursal se disponível, estado ativo em operações novas versus visibilidade histórica, permissões de menu e backend; Kardex/Reportes pode usar consulta distinta — registrar lacuna e não afirmar equivalência sem inspeção. Sem acesso real ao banco, marcar achados SQL como estáticos.

### Ordem e limites da implementação autorizada
1. **A — corrigir o que for comprovadamente defeito na versão atual**: layout Detalle Movimientos/anulação, possíveis inconsistências reais entre formulários, mensagens/estados vazios e integrações; não reimplementar o já corrigido nem introduzir regressões.
2. **B — módulo Depósitos**: após confronto com SQL/migrations e decisões do Git, implementar escopo operacional com permissão, empresa, alcance, vínculos e segurança; **se faltar uma decisão de negócio bloqueante, apresentar uma única questão objetiva e parar esta etapa**, sem presumir regra. O botão/menu não deve ser habilitado antes de a página/API funcionarem.
3. **C — consistência final de Stock/Reposición/Movimientos/Depósitos**, sem mover regra de estoque para frontend e sem mudar custos, funções SQL de inventário ou relatórios fora do escopo. Qualquer nova migration requer justificativa e autorização antes de execução; nunca editar migration aplicada.
4. **Verificações locais permitidas**: TypeScript, ESLint específico, build, casos isolados; nenhum acesso Claude à VM/Docker/PostgreSQL real. ChatGPT fará auditoria, responsável publica e homologa.
5. **Entrega econômica**: atualizar este documento e \`PROGRESSO-NEXIT-V1.md\` somente onde pertinente, não criar novos relatórios repetidos nem reimprimir lista de arquivos; informar resumo, bloqueios e SHA e parar.

### Critérios de aceite (auditoria ChatGPT e homologação humana)
- CA-01: Novo movimento mostra «Sin registrar» antes de POST, não mostra hora do cliente como obrigatória, sucesso só após commit no servidor; botões e erros coerentes com autorização.
- CA-02: Cadastro de depósitos acessível apenas a perfis autorizados; lista/alta/edição/estado real; empresa e alcance protegidos na API; depósito inativo preservado no histórico, não selecionável para novas operações.
- CA-03: Movimientos detail renderiza dados e anulação sem sobreposição, mostra campos e confirma ação crítica quando permitida; sem anulação por usuário não autorizado.
- CA-04: Reposición explica ausência de necessidade para produto com sobreestoque e permite visualizar todos, sem modificar cálculos nem executar compras/movimentos.
- CA-05: Movimientos e Stock mostram depósito verdadeiro de origem/destino, distinguindo origem ABERTURA de depósito; quantidades e valores preservados.
- CA-06: padrões visuais e controles em 375px, 768px e desktop sem sobreposição; capturas reais só podem ser dadas como existentes se fornecidas/versionadas após validação de privacidade.
- CA-07: permissões no menu, layout, API e SQL convergentes; nenhuma exposição cross-tenant/cross-depósito.
