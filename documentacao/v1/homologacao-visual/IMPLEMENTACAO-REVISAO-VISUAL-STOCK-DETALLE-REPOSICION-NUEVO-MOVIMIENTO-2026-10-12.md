# Implementação — revisão visual e funcional: Detalle de Stock, Reposición e Nuevo movimiento

**2026-10-12 · Claude Code.** Resposta à `ESPECIFICACAO-REVISAO-VISUAL-STOCK-DETALLE-REPOSICION-NUEVO-MOVIMIENTO-2026-10-12.md` (commit de referência c2e93f9b). **Sem migration, sem SQL real, sem alterar a política de valorização/movimentação.** Não validado em navegador nem em PostgreSQL; **não HOMOLOGADO**. Sem capturas ANTES/DEPOIS no Git (pendentes: dependem do responsável abrir as telas no ambiente real).

## 1. Confronto campo a campo (UI ↔ API ↔ SQL)

Fontes lidas: telas, `lib/movimientos/shared.ts`, `app/api/{movimientos,stock,reposicion}`, NEX-014 (`inventario_registrar_movimiento`, `usuario_puede_deposito`), `lib/stock/*`, `lib/reposicion/*`. Só se registra o que foi comprovado no código.

| ID | Achado comprovado | Severidade | Tratamento |
|---|---|---|---|
| F-01 | UX-19: o cartão de «Nuevo movimiento» exibia o badge **«Registrado»** antes de gravar. | Média (semântica) | Substituído por «Sin registrar»; sucesso só após resposta da API (redireciona com `?ok=`). |
| F-02 | A tela aceitava data futura, mas `inventario_registrar_movimiento` rejeita (`p_fecha > hoy` em America/Asuncion). | Média | Validação por campo (mesmo fuso); campo de data dd/mm/aaaa (`CampoFecha`). |
| F-03 | O campo «Hora *» mostrava a hora do navegador como somente leitura; o servidor grava a sua. | Baixa | Removido; ajuda do campo Data: «La hora la registra el servidor». |
| F-04 | `cantidad` com `step=0.001`, a API admite 4 decimais. Estado inicial `cantidad=1` pré-preenchida. | Baixa | `step=0.0001`, validação de 4 decimais; campo vazio no início. |
| F-05 | Produtos `UNIDAD_ETIQUETADA` apareciam na lista, mas a API sempre os rejeita. | Média | Opção desabilitada com rótulo e erro por campo; sem ação «mover» no detalhe. |
| F-06 | O catálogo `GET /api/movimientos?modo=catalogos` devolvia **saldos e lotes de todos os depósitos**, inclusive os que o usuário não opera; o snapshot sem depósito somava depósitos fora do alcance (inconsistente com Stock). | Média (alcance) | Saldos e lotes do catálogo filtrados com `usuario_puede_deposito` (a função SQL continua sendo a autoridade ao registrar). |
| F-07 | Origem e destino eram sempre exibidos e todas as origens operativas eram oferecidas em qualquer tipo (ex.: ENTRADA com origem VENTA). | Baixa | Campos condicionais por tipo; origens coerentes por tipo (a API continua aceitando todas; não implicam documento). |
| F-08 | `movimientos/nuevo` só tinha guarda `MOVIMIENTOS.VER` (layout do módulo); a API exige `CREAR`. | Média | `layout.tsx` com `guardPage("MOVIMIENTOS","CREAR")`. |
| F-09 | Detalhe de Stock: o indicador «VALOR FÍSICO» tinha a legenda «Costo promedio»; legendas «Pendiente de salida» e «Próximo ingreso» supunham fluxos não modelados. | Baixa | Legendas neutras («Total físico a costo promedio», «Apartado, no disponible», «Aún no confirmado en depósito»). |
| F-10 | Reposição: os indicadores «Sin stock» e «Bajo mínimo» contavam também o **consolidado de referência** (que não é plano), incoerente com «Necesitan reposición». | Média | Contam só renglones que são plano (`necesita`). |
| F-11 | Reposição: o filtro padrão «Necesitan reposición» ocultava renglones sem avisar; o botão «Ir a Movimientos» abria o formulário vazio. | Baixa | Aviso com contagem e «Ver todos»; link «Preparar transferencia» com dados validados. |
| F-12 | O SQL **não exige motivo** ao registrar (só ao anular, ≥ 5). | Informativo | O motivo continua opcional (limite 300); não se inventa obrigatoriedade. |
| F-13 | `documento_referencia` é texto livre (≤ 120) sem vínculo. | Informativo (já conhecido, AUD-DOC-01) | A tela declara que não vincula nem valida factura/remisión/NC. |

Sem divergência comprovada em: tipos (9 de 9 coincidem com `TIPOS` da API), exigência de origem/destino/custo (`CON_ORIGEN/CON_DESTINO/CON_COSTO`), lote obrigatório por `modo_control_stock`, vencimento só em entradas, idempotência, custos (entrada exige custo explícito; saída usa custo médio no SQL).

## 2. Implementado

- **Nuevo movimiento** (`app/(private)/movimientos/nuevo`, `lib/movimientos/formulario.ts`): padrão visual de Catálogos/Productos (topbar com breadcrumb, formulário em grade, ajuda e erro por campo). Campos condicionais; descrição curta do efeito de cada tipo; saldo visível (disponível/reservado/cuarentena/trânsito) do depósito de referência; **aviso não bloqueante** quando a quantidade excede o saldo visível (o SQL decide); validação por campo na ordem visual com foco no primeiro erro; confirmação de alterações não salvas (`beforeunload` + links); envio único (`saving`) e **mesma chave de idempotência** em reenvios idênticos, renovada ao editar; estados carregando/erro/salvando. Sem módulos inexistentes: nenhum botão de compra/factura/NC.
- **Pré-seleção segura** (`?producto=&tipo=&depositoOrigen=&depositoDestino=&cantidad=`): cada valor é descartado (com aviso) se não coincide com o catálogo da sessão (produto ativo e não «unidad identificada», depósitos autorizados e aplicáveis ao tipo, tipo conhecido, quantidade positiva). A API continua verificando tudo (permissão, alcance, saldo) ao registrar.
- **Detalle de Stock**: topbar compacta com breadcrumb; mesmos 5 indicadores; blocos «Producto y política» e «Valorización y propiedad» (separando produto de depósito); tabela por depósito com «Sin ubicación registrada» e parâmetros do depósito (mín./punto/máx., dado já disponível); lotes com vencimento (vencido / vence em N dias) e estado vazio; aviso de alcance parcial. **Ações reais condicionadas a permissão** (`/api/stock/[id]` devolve `permisos` só para exibir; cada API valida o seu): Nuevo movimiento, Movimientos del producto (`/movimientos?buscar=<código>`, dados reais), Reposición, e por depósito «Entrada» e «Transferir» (se há disponível). Nunca altera saldo por clique.
- **Reposición**: indicadores coerentes com os planos, nota do escopo dos indicadores, aviso do que o filtro padrão oculta, cabeçalho «A planificar (simulación local, no se guarda)» e **«Preparar transferencia»** por origem confirmada (produto, tipo, depósitos, quantidade do plano global AUD-REP-04) apenas com `MOVIMIENTOS.CREAR`. Compra não tem fluxo: nenhum botão. Cálculos inalterados (`calcularPlanReposicion`, AUD-REP-01…04).
- `app/(private)/movimientos/page.tsx`: aceita `?buscar=` (histórico do produto).

## 3. Pendências / limites

- Capturas ANTES/DEPOIS e verificação visual em 375/768/desktop, navegador e PostgreSQL: **não realizadas** (responsável).
- «Preparar transferencia» pré-carrega a quantidade sugerida do plano; o valor digitado em «A planificar» (simulação local) não é usado.
- Reposição não conhece `modo_control_stock`: para uma unidade identificada o formulário descarta o produto e avisa.
- `app/(private)/movimientos/page.tsx` (lista) mantém 3 erros ESLint preexistentes (`set-state-in-effect`) fora do escopo das três telas.
- Decisões ainda do responsável: motivo obrigatório por tipo (hoje opcional, como no SQL), política de origens por tipo (hoje só orientação de UI), vínculo persistido documento/evento físico (AUD-DOC-01).
