# Auditoria independente — Stock/Reposición commit 66202e1e

**Data:** 2026-10-12. **Commit auditado:** `66202e1e8c176ad9e0407e92ee4cf9535167b23e`. **Estado:** correções AUD-REP-01/02/03 confirmadas estaticamente; encontrada pendência adicional AUD-REP-04. Não homologado PostgreSQL/navegador. Não executar VM/Docker/SQL a partir deste documento.

## Fontes
`CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, diff do commit, `lib/reposicion/calculo.ts`, `lib/reposicion/datos.ts`, `app/(private)/reposicion/page.tsx`, `lib/stock/stock-reposicion.casos.ts`, `documentacao/v1/homologacao-visual/CONTRATO-INTEGRACION-MOVIMIENTOS-DOCUMENTOS-V1-2026-10-12.md`.

## Verificação dos pedidos
- **AUD-REP-01 conforme em código:** `leerEntradasReposicion` marca o consolidado como `soloReferencia` quando há um ou mais planos por depósito; `calcularReposicion` não gera compra ou transferência nesse consolidado. Teste do mesmo SKU em dois depósitos foi adicionado.
- **AUD-REP-02 conforme individualmente:** origem sem mínimo/ponto aparece em `aValidarManualmente`, excluída da transferência confirmada; déficit remanescente continua sugerido para compra. Não há operação de transferência real.
- **AUD-REP-03 conforme:** `SIN_GATILLO` e aviso para `cantidadReposicion` sem mínimo/ponto/máximo; filtro correspondente presente na página.
- **AUD-DOC-01 conforme:** contrato admite que idempotência por evento físico/linha não está persistida nem ligada à API, e ainda não impede baixa dupla Factura/Remisión.

## Nova inconsistência
**AUD-REP-04 — P1, sobrealocação de origem compartilhada (comprovada por inspeção):** `calcularReposicion` roda independentemente por linha de destino e recalcula o mesmo `transferible = disponible_origen - max(minimo_origen,punto_origen)` sem consumir a disponibilidade atribuída a outros destinos. Quando 2 destinos requerem 40 e a mesma origem pode ceder 50, a UI pode sugerir 40+40 = 80 em transferências, embora a origem disponha apenas 50 transferíveis. Como tela é somente leitura, não há saldo alterado, mas o plano de execução é incorreto como agregado. Corrigir alocação global determinística por produto e origem entre todos os destinos (prioridade por criticidade e critérios estáveis, explicitados), ou rotular as ofertas como **cenários independentes, NÃO somáveis**, sem apresentá-las como transferência confirmada nem deduzir compras agregadas automaticamente. Adicionar testes 2 destinos/1 origem, empate, alcance de depósitos e sem parâmetros. Nenhum movimento deve ser gerado.

## Condições para liberação operacional
- Claude deve corrigir AUD-REP-04 ou explicitar cenário não somável sem prometer disponibilidade compartilhada, publicar commit e parar para nova revisão.
- Nenhuma migration nova consta no commit. Depois da revisão, usuário verifica Git/branch e aplica **somente rebuild/recreate do app**; não executar runner SQL sem necessidade.
- Conferir no navegador `/stock`, `/stock/[id]`, `/reposicion` e `/movimientos`, filtros/permissões, quantidades, custos e estados. Sem PostgreSQL real nesta auditoria.
