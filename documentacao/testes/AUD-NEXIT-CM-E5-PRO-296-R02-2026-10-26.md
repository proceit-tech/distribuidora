# AUD-NEXIT-CM-E5 / PRO-296 — R02 — Reauditoria do corretivo de atribuição NCE por produto
**Data:** 26/10/2026  
**Repositório:** `proceit-tech/distribuidora`; branch `feature/NEXIT-2026-001-banco-demo`.  
**Commit corretivo auditado:** `f71e48181b4550ea22b7ec819e4bd9233b5f77d3` (HEAD confirmado na leitura).  
**Commit base E5:** `105d787a747f09bf0aab75b24cfdfaf33c762c9c`.  
**Fonte normativa:** `documentacao/ordens/ORD-CLAUDE-NEXIT-CM-E5-R01-F001-NCE-PRODUCTOS-2026-10-26.md`; `documentacao/definicoes/REQ-NEXIT-CM-E5-INFORME-VENTAS-PRO-296-2026-10-26.md`.  
**Parecer: MELHORIA COMPROVADA MAS AINDA COM RESSALVA BLOQUEANTE PARA CONCILIAÇÃO POR PRODUTO.** Não declarar E5 integralmente homologada. Auditoria ESTÁTICA, sem execução.

## 1. Evidências confirmadas
- Diff do SHA `f71e481...` altera **apenas** `lib/reportes/ventas.ts`.
- Inclusão de `NUMX` para comparar números em JSON numérico/textual quando campo permite; `ATRIBUCION_NCE` reúne `fev` (FE original, exige solicitação única), `par` (candidatos pela identificação de produto, tributação, preço, quantidade e `nce_lineas.monto`) e `atr` (NCE que parece totalmente correspondida).
- Em `PRODUCTOS`, NCE é atribuída somente se seu ID estiver em `atr`; as demais entram em `Ajustes no atribuibles a producto` pelo valor integral da sua NCE. Essa separação é mutuamente exclusiva e preserva o agregado por documento.
- Os componentes de resumo, documentos, clientes, vendedores, meses, permissões, router, exportadores, payload fiscal, banco e migrations **não foram alterados neste commit**. Não se identificou mudança nos totais globais da query; a nova CTE somente é usada em `PRODUCTOS`.
- As migrações NEX-062 e NEX-070 mostram `nce_lineas.linea` como **ordinal original da FE**, sem coluna da posição correspondente da NCE. O emissor normal NEX-062/070 valida `p_lineas WITH ORDINALITY` quando cria a NCE; contudo, para leitura de dados históricos/legados o relatório precisa garantir a atribuição sem assumir que todo registro recebido segue a mesma invariância.

## 2. R02-F001 — PENDENTE, gravidade média/alta para precisão de relatório por SKU

Em `lib/reportes/ventas.ts` no CTE `atr` (aprox. linhas 297–302 do SHA auditado):
```sql
count(DISTINCT par.ord) = f.it_n
AND count(DISTINCT par.linea) = f.lin_n
```
Essas condições demonstram **cobertura de vértices**, não uma correspondência **bijetiva** NCE.Detalles ↔ nce_lineas. Um único item da FE pode corresponder a múltiplos candidatos e dois itens NCE podem corresponder ao mesmo `nce_lineas.linea`. O resultado pode declarar um documento 'atribuível' sem existir um emparelhamento de todas as posições uma única vez. O comentário "se atribuye solo si cada ítem corresponde" não supre essa prova.

**Contraexemplo lógico reproduzível pela inspeção do predicado (não é evidência de dado real):**
- FE original com 3 linhas: **ordinal 1 = produto A, ordinal 2 = produto B, ordinal 3 = produto B**; todos com mesma quantidade 1, preço 100 e regime IVA 10%, portanto cada uma com valor 100.
- `nce_lineas` referencia FE ordinais `1 (A), 2 (B), 3 (B)`, cada um com `monto = 100` e quantidade coerente com `motivo = 2` (devolução).
- NCE fiscal histórica inconsistente tem `Detalles = [A, A, B]`, cada um com valor 100, mesma unidade/tributação. Subtotal, valor global e IVA são iguais aos de `nce_lineas`; `it_n = lin_n = 3`.
- Em `par`, os itens A da NCE casam ambos com **linha 1**; o item B casa com **linhas 2 e 3**. Resultado: `DISTINCT ord = 3` e `DISTINCT linea = 3`, então o relatório aprova atribuição; mas **nenhuma associação individual 1:1 existe** (há 2 itens A para 1 linha A e 1 item B para 2 linhas B).
- A tela descontaria produtos **2× A e 1× B** quando os ordinais creditados são **1× A e 2× B**. Totais globais e IVA continuariam conciliados, ocultando a atribuição errada. O fluxo oficial atual rejeita essa entrada na criação, mas o contrato defensivo exigido trata legado ou inconsistências históricas, que podem não ser detectadas apenas por somas.

**Conclusão técnica:** R01-F001 foi parcialmente resolvido, mas ainda há contraexemplo em que a distribuição por SKU é indevida. Isso **não prova erro em dados atuais**, porém invalida declarar a função completamente defensiva em face de histórico inconsistente.

### Correção permitida (focal)
Exigir emparelhamento sem reutilização indevida de `ord` nem de `linea`. Alternativas: agrupamento por assinatura normalizada de equivalência (produto/GTIN/descrição/unidade/tributação/valor/quantidade/preço), exigindo cardinalidades iguais por grupo, ou associação 1:1 verificável e determinística; tratar duplicatas legítimas com assinatura igual, sem reclassificá-las por mero empate. Uma solução conservadora que não provar casamento deve classificar a NCE completa como ajuste não atribuível, mantendo soma do cabeçalho. **Não** redistribuir por dCodInt e **não** reabrir cálculo fiscal, emissão, schemas ou saldo.

## 3. Outros critérios e limites
- FE original com versões históricas `>1`: `fev` não credita por produto, usa ajuste não atribuível; consistente com cautela.
- Desconto/bonificação de serviço `DESCUENTO`: sem `nce_lineas` ou com `nce_descuentos`, já cai em ajuste não atribuível.
- `jspx`/React não foi alterado nesta correção; Excel/PDF utilizam mesma fonte `leerVentas`, logo o problema da vista Productos também se projeta às exportações dessa vista.
- O relatório `E5-R01-F001-demonstracao.md` citado pelo Claude **não aparece na árvore Git do SHA**, tampouco foi anexado nesta conversa; os seis cenários afirmados não constituem teste observável. Parecer baseado em fonte rastreável.
- **Nada executado:** testes, lint, build, SQL, VM, navegador, PDF/XLSX real, migrations, gateway ou SIFEN. Migraciones operacionais sem verificação.

## 4. Status e próxima etapa
- **PRO-296:** permanece `In Review`, não `Done`. **PRO-108:** `Todo`, **PRO-115:** `Todo`; **E6/PRO-297:** `Todo`, não iniciar.
- Publicar uma única ordem de correção R02-F001 restrita ao predicado da associação; Claude só desenvolve e publica commit, ChatGPT audita o novo SHA e atualiza Linear. Não criar novas regras por iniciativa do Claude.
- Aceite humano da vista Produtos e das exportações depende da correção estática, da posterior verificação dos casos e da homologação em computador; sem isso não declarar relatório operacional conciliado.
