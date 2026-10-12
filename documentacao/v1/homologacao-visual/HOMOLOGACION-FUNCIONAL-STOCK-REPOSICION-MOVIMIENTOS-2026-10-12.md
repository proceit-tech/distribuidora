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

## 2. Matriz de origens permitidas por tipo — PROPOSTA (não implementada como política)

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

## 3. Obrigatoriedade de motivo por tipo — PROPOSTA

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
