# Auditoria independente — revisão visual Stock/Reposición/Nuevo movimiento

Data: 2026-10-12. Commit: `1fc2bedc3bf2d6400e699985148f96ce4fc99a05`. Resultado: **revisão estática favorável para deploy controlado**; **não homologado** em navegador/PostgreSQL.

## Fontes
`CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, diff do commit, `lib/movimientos/formulario.ts`, `app/(private)/movimientos/nuevo/{layout.tsx,page.tsx}`, `app/(private)/stock/[id]/page.tsx`, `app/(private)/reposicion/page.tsx`, `app/api/{stock/[id],movimientos}/route.ts`, `documentacao/v1/homologacao-visual/IMPLEMENTACAO-REVISAO-VISUAL-STOCK-DETALLE-REPOSICION-NUEVO-MOVIMIENTO-2026-10-12.md`.

## Resultados
- Novo movimento requer `MOVIMIENTOS.CREAR` no layout; API verifica sessão e escopo; não expõe saldos/lotes de depósitos não autorizados em catalogos.
- O formulário trata tipos, origens, depósito condicional, custo, lote, quantidade, data futura, feedback inline, pré-seleção validada por catálogo da sessão e envio com idempotência; API/SQL continuam sendo autoridade no registro.
- Detalhe de Stock oferece ações por permissão e visão de depósito, sem gravação direta.
- Reposición preserva cálculo global AUD-REP-01..04 e oferece preparar transferência para novo movimento, sem compra automática.
- Indicadores de reposição distinguem referências consolidadas de planos efetivos; badge «Sin registrar» substitui «Registrado» em novo movimento.
- Não há migration, nem novo modelo de documentos fiscais. Vínculo fiscal transacional segue pendente.

## Gates de homologação obrigatórios
1. Sync limpo da branch e `docker build`, atualizar só o serviço app (sem reiniciar PostgreSQL, sem migration).
2. Abrir /stock, /stock/[id], /reposicion, /movimientos/nuevo em desktop, tablet e mobile; avaliar formulário e tabela com dados reais.
3. Fazer operação controlada de teste por Novo Movimiento com usuário autorizado: confirmar saldo de origem/destino, histórico e recálculo em Stock/Reposición. Não usar dados operacionais indiscriminadamente.
4. Testar produto não autorizado, depósito não autorizado, data futura, quantidade acima do saldo, lote obrigatório, falhas da API e confirmação ao sair com edição pendente.
5. Confirmar que a pré-seleção contextual não executa movimento por abrir URL, exige revisão e confirmação.
6. Confirmar permissões GET/POST e `MOVIMIENTOS.CREAR`; dados legados preservados.

**Conclusão:** nenhuma correção de código obrigatória foi constatada nos pontos examinados para impedir deploy controlado; afirmações de tsc/lint/build/1720 testes são relatório do Claude, não reexecução independente. **Homologação final permanece do responsável humano.**
