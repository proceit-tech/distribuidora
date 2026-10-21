# Implementação — correções da auditoria do commit 71ae486 (Movimientos, Reposición)

**2026-10-12 · Claude Code.** Implementa somente as correções autorizadas. **Sem migration, sem alterar funções SQL, sem tocar valorização/saldos, sem acessar PostgreSQL/VM/Docker.** Não validado em navegador nem em PostgreSQL; **não homologado** (auditoria e homologação são do ChatGPT e do responsável).

## 1. Histórico de Movimientos — alcance e autorização

- **Falha corrigida:** `GET /api/movimientos` (lista) e `GET /api/movimientos/[id]` (detalhe) filtravam só por `empresa_id`; qualquer usuário com `MOVIMIENTOS.VER` via movimentos de depósitos fora do seu alcance.
- **Política usada (a mesma de Stock e Reposición, sem criar outra):** `usuarios.alcance_depositos = 'TODOS'` ou depósitos atribuídos em `usuario_deposito`, incluindo depósitos inativos (o histórico de um depósito inativo não desaparece). Código: `lib/movimientos/historial.ts` (`ALCANCE_MOVIMIENTO`).
- **Transferências (origem ≠ destino):** o movimento é visível **somente se todos** os depósitos que referencia estão no alcance. É a mesma exigência de `inventario_anular_movimiento` (valida origem e destino) e evita revelar nome/quantidades de um depósito não autorizado. Movimento sem nenhum depósito não é exibido.
- **Detalhe:** fora do alcance responde 404 (igual a movimento de outra empresa), sem distinguir "existe mas não autorizado".
- **Resumo e contagens** (cartões, total, páginas) usam o mesmo alcance.
- **Decisão bloqueada (do responsável):** se uma transferência com apenas um dos depósitos autorizado deve aparecer (mascarando o outro) em vez de ficar oculta. Hoje: oculta (mais restritivo).
- **Não revisado nesta tarefa:** `app/api/reportes/kardex*` (Reportes) consulta movimentos por outro caminho; não foi alterado nem auditado aqui.

## 2. Paginação e indicadores no servidor

- Removido o `LIMIT 2000` fixo e o filtro/ordenação no navegador. A API recebe `q`, `tipo`, `orden` (`movimiento|producto|deposito|cantidad`), `dir`, `pagina`, `tamano` (≤ 100, padrão 20) e devolve `movimientos` (a página), `total` (**linhas**), `totalMovimientos` (**movimentos distintos**), `pagina` (ajustada ao intervalo), `totalPaginas` e `resumen` (movimentos do alcance sem filtros: total, entradas, saídas, transferências). Valores não permitidos (tipo/ordem/tamanho/página) são normalizados e nunca viram texto SQL; a busca usa `ILIKE` parametrizado com curingas escapados; a ordenação é por lista branca com desempate estável.
- A tabela continua mostrando **uma linha por linha de movimento**; os contadores dizem "N linha(s) · M movimento(s)" e o cartão "Movimientos" conta movimentos distintos. O padrão visual (cartões, barra, tabela, paginação) foi preservado.

## 3. Mensagens de confirmação

- Antes: `?ok=<número>` na URL exibia «registrado correctamente» sem verificação (qualquer valor na URL aparecia como sucesso) e o erro de carga ficava dentro da célula vazia da tabela.
- Agora: o aviso verde só aparece se a API **confirma** que o movimento existe, é da empresa e está no alcance do usuário (`?confirmar=<número>` → `confirmado`). Se não confirma, ou se o histórico falha ao carregar, mostra um aviso de erro «No se pudo confirmar el registro… verifique antes de repetir» (nunca sucesso). O erro de carga é um aviso próprio com «Reintentar», separado do estado vazio da tabela.

## 4. Reposición

AUD-REP-01…04 intactos (nenhum cálculo foi tocado). Comunicação visual: legenda única explicando **Sugerida** (cálculo do plano), **A planificar** (simulação local, não se guarda) e **Preparar transferencia** (só abre Nuevo movimiento, sem registrar); em cada linha com plano, abaixo de «A planificar»: «Sin simulación: se usa la sugerida (N)» ou «Planificado N: transferir X · comprar Y» (com aviso se excede a sugerida). O link «Preparar transferencia» já respeitava a quantidade planejada e o limite do plano global. A tela não executa movimentos.

## 5. Matriz de origens e motivo contextual (aprovados) — formulário e API

Módulo único `lib/movimientos/reglas.ts`, usado por `formulario.ts` (UI) e `prepararMovimiento` (API):

- **Origens por tipo:** ENTRADA {COMPRA, DEVOLUCION, INVENTARIO, MANUAL}; SALIDA {VENTA, DEVOLUCION, INVENTARIO, MANUAL}; TRANSFERENCIA {TRANSFERENCIA}; AJUSTE_POSITIVO/NEGATIVO {AJUSTE, INVENTARIO, MANUAL}; RESERVA, LIBERACION_RESERVA, CUARENTENA, LIBERACION_CUARENTENA {AJUSTE, MANUAL}. A API rejeita origem fora da matriz; sem origem usa o padrão do tipo (antes «MANUAL» para todos).
- **Motivo obrigatório (≥ 5 caracteres, como a anulação):** ajustes, cuarentena e liberação, reserva e liberação, e ENTRADA/SALIDA com origem MANUAL ou INVENTARIO. **Opcional:** compra, devolução, venda, transferência. A tela marca «Motivo *» só quando aplica.
- **Movimentações de outros módulos** (futuras): não usam motivo digitado; usarão texto estruturado + vínculo persistido (AUD-DOC-01). Esta política não as afeta.
- **Migration/SQL:** **não necessária** e não criada. As funções SQL continuam aceitando todas as combinações e não exigem motivo ao registrar; a regra vale para a API/tela. **Registros existentes não são alterados nem reclassificados.** Limite: quem chamar a função SQL diretamente contorna a matriz. Impor a matriz/motivo no próprio SQL exigiria modificar `inventario_registrar_movimiento` (nova migration, função transacional): **necessidade concreta não demonstrada; decisão bloqueada para o responsável** (inclui o hash de idempotência não cobrir motivo/observação).

## 6. Interface

Padrão de Clientes/Productos/Catálogos mantido (classes `lista-padrao` e formulário de catálogos); textos em espanhol (PY); sem cabeçalhos duplicados nem botões sem função (o botão «Reintentar» só aparece com erro; «Cerrar» no aviso).

## 7. Testes locais e pendências

Casos novos: matriz e motivo (API e formulário), construção das consultas (alcance, parâmetros, lista branca, desvio de página), `leerHistorial`/`movimientoExiste`/`leerLineasMovimiento` com conexão simulada, rotas e telas. **Não executado:** navegador, PostgreSQL, diferentes perfis reais de alcance (um usuário `ASIGNADOS` com e sem os dois depósitos de uma transferência deve ser conferido pelo responsável nos gates da homologação).
