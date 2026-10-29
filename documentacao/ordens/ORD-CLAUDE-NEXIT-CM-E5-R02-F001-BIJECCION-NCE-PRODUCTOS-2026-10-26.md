# ORDEM CORRETIVA FOCAL — E5-R02-F001 / PRO-296 — correspondência 1:1 entre NCE e linha original FE
**Data:** 26/10/2026 · **Branch:** `feature/NEXIT-2026-001-banco-demo` · **Commit funcional de base:** `f71e48181b4550ea22b7ec819e4bd9233b5f77d3`.
**Parecer integral:** `documentacao/testes/AUD-NEXIT-CM-E5-PRO-296-R02-2026-10-26.md`. **Especificação E5:** `documentacao/definicoes/REQ-NEXIT-CM-E5-INFORME-VENTAS-PRO-296-2026-10-26.md`.
**Objetivo único:** eliminar falso positivo de atribuição da NCE a SKU em `PRODUCTOS` quando há múltiplos candidatos por linha. Não refazer E5 nem reabrir R01.

## 1. Leitura obrigatória
Ler por completo `lib/reportes/ventas.ts`, parecer R02, contrato E5, NEX-062/070 e as partes pertinentes dos demais arquivos usados; verificar HEAD e diff contra o commit funcional. Não confiar em demonstração que não está no Git.

## 2. Falha lógica comprovada no código
O predicado atual do CTE `atr`:
```sql
count(DISTINCT par.ord) = f.it_n AND count(DISTINCT par.linea) = f.lin_n
```
apenas comprova que TODOS os itens e linhas têm **algum** candidato. Não comprova uma correspondência um-para-um. O parecer R02 demonstra com FE ordinais `[A, B, B]` e NCE fiscal inconsistente `[A, A, B]`, todos os preços/IVA iguais: cada lado tem 3 vértices cobertos, mas não há bijeção; agrupar a NCE por itens subtrai 2 A e 1 B quando a estrutura de origem comprova 1 A e 2 B.

## 3. Correção mínima e segura
- Calcular/verificar uma bijeção **real** (cada ítem NCE usado exatamente uma vez; cada linha `nce_lineas.linea` exatamente uma vez), com os mesmos predicados já existentes de produto, GTIN, descrição, unidade, IVA, motivo, quantidade, preço e `nl.monto`.
- Pode adotar **comparação das multiplicidades por assinatura de equivalência normalizada** quando os campos de comparação forem idênticos (normalizar numéricos, null, espaços como já faz) ou outro método SQL deterministicamente correto. Duplicatas históricas legítimas de um mesmo item devem continuar atribuíveis quando houver a mesma quantidade e valores de `nce_lineas`, mesmo que o ordinal físico seja ambíguo entre linhas de SKU/atributos rigorosamente idênticos.
- Se não for possível provar a bijeção, NÃO atribuir nenhum valor da NCE a SKU. Deixar o documento inteiro no bloco `Ajustes no atribuibles a producto` com o total de cabeçalho, sem alterar o RESUMEN global. Manter NCE `DESCUENTO/BONIFICACIÓN` de serviço nesse bloco.
- Não ordenar linhas por `dCodInt` para supor `nce_lineas.linea = NCE.Detalles.ord`; o schema não conserva essa posição. Não espalhar descontos globalmente entre SKU.
- Não criar/perseguir itens de NCE com payload inadequado; manter política de documento ANOMALIA existente quando integridade fiscal geral falhar.
- Alterar exclusivamente `lib/reportes/ventas.ts` salvo dependência inequívoca, SEM tocar estado fiscal, IVA, cálculo da emissão, SQL versionado/migrations, UI, outras vistas, outras consultas, permissões ou exportadores.

## 4. Cenários de raciocínio estático a demonstrar
1. FE 3 linhas `[A, B, B]`; `nce_lineas = [A, B, B]` e NCE JSON `[A, A, B]` com mesmo monto/IVA: **NÃO atribuível** apesar de 3 ordinais e 3 linhas com algum candidato.
2. FE e NCE com 2 linhas idênticas A e A e mesmas quantidades/valores: **atribuível**, sem exigir correspondência de ordem que banco não registra.
3. FE com `[A, B, C]`, NCE `[C, A]`, `nce_lineas` originais de C e A, ordem trocada: **atribuível** quando assinaturas batem (sem assumir ordem).
4. Uma NCE de DEVOLUCIÓN: quantidade do registro original deve conciliar; NCE de AJUSTE: quantidade física devolvida zero.
5. NCE serviço DESCUENTO ou NCE com FE sem payload único: permanece ajuste sem atribuição, uma única vez.
6. Totais globais, número de FE/NCE, IVA, outras vistas, Excel e PDF preservados; ajustes não atribuíveis garantem conciliação.

Esses são **cenários de inspeção e demonstração estática**, não ordens para executar testes. Não declarar teste executado.

## 5. Entrega e parada
Ler arquivos completos antes e depois, revisar a lógica SQL e provar contra os exemplos, commit/push na branch oficial, informar SHA e arquivos exatos; ou reportar bloqueio concreto sem alterar código se tecnicamente impossível. Não executar testes/lint/build/CI, navegador, PostgreSQL, VM, migrations, Docker, SIFEN, gateway ou deploy. Claude não gerencia Linear, auditoria nem documentação de progresso; somente desenvolve. **PARAR PARA REAUDITORIA INDEPENDENTE DO CHATGPT.** Não iniciar Compras E6, margen/ganancia, relatórios extras.
