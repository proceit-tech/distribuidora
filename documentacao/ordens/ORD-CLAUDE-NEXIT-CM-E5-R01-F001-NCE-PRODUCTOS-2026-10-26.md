# ORDEM CORRETIVA FOCAL — E5-R01-F001 / PRO-296 — correspondência da NCE ao produto
**Data:** 26/10/2026 · **Branch:** feature/NEXIT-2026-001-banco-demo
**Base funcional auditada:** 105d787a747f09bf0aab75b24cfdfaf33c762c9c.
**Parecer vinculante:** documentacao/testes/AUD-NEXIT-CM-E5-PRO-296-R01-2026-10-26.md.
**Requisito canônico:** documentacao/definicoes/REQ-NEXIT-CM-E5-INFORME-VENTAS-PRO-296-2026-10-26.md.
**Escopo:** mínimo ajuste de integridade de **vista Productos das NCE**; NÃO reimplementar E5.

## 1. Inspeção obrigatória
- Ler integralmente os arquivos existentes lib/reportes/ventas.ts, tipos de reportes e os auxiliares afetados; consultar NEX-062 e NEX-070 (SQL da criação de NCE), payload-nce.ts, os critérios de aceite e o relatório R01.
- Confirmar como nce_lineas.linea corresponde ao ordinal 1..N de Detalles da FE original e ao índice da linha creditada na NCE. NEX-062/NEX-070 validam payload com p_lineas WITH ORDINALITY em criação; o relatório precisa demonstrar que usa/vincula essa evidência.
- Verificar que um mesmo produto/código pode aparecer em mais de uma linha da FE: nunca usar somente dCodInt para inferir o ordinal correto.
- Não executar SQL real nem testes; só revisão integral de fontes e edição focal.

## 2. Defeito de robustez a fechar
Na consulta atual lib/reportes/ventas.ts, f.atribuible se baseia em `lin_n = it_n`, ausência de serviço nce_descuentos e conciliação do valor TOTAL, sem demonstração explícita da relação de cada linha NCE a nce_lineas.linea (ordinal da FE).

**Contrato esperado:**
- Para atribuir NCE por produto, conferir relação de cada par `nce_lineas` → `NCE.Detalles[k]` → `FE.Detalles[linea-1]`, com ordinal inequívoco, quantidade/monto por linha e identificação histórica produto/unidade/IVA coerente, considerando múltiplas linhas do mesmo produto.
- Motivo DEVOLUCIÓN (2): quantidade creditada deve vir do registro original e corresponder à NCE; motivos monetários por linha tratam quantidade de devolução como 0, sem conversão a venda física.
- NCE de DESCUENTO/BONIFICACIÓN via nce_descuentos (serviço DESCUENTO) SEMPRE separada como «Ajustes no atribuibles a producto», sem inventar SKU ou rateio.
- Quando a atribuição linha a linha não estiver provada, mostrar valores como ajuste não atribuível (ou documento ANOMALIA se sua integridade fiscal geral estiver em dúvida). Não perder o valor das NCE, não duplicar descontos, não transformar documento em 0. As medidas globais FE/NCE por documento devem permanecer iguais.
- Não modificar regras de emissão, fiscal, NCE, payload, IVA, cálculos, banco, schema, migrations ou dados. Alterar só a consulta/DTO/presentação de Productos se realmente indispensável.

## 3. Critérios estáticos de verificação
1. FE de 3 linhas; NCE devolve só ordinal 3; relatório atribui ao SKU do ordinal 3, NÃO ao primeiro.
2. FE com 2 itens do mesmo dCodInt mas unidades/descontos distintos; NCE corrige um ordinal sem misturar o outro.
3. NCE com linhas em ordem diferente da FE; usa o pareamento NCE Detalles[k] ↔ nce_lineas[k] registrado na criação, NÃO ordena ao acaso.
4. Desconto NEX-070 serviço DESCUENTO: não atribuível, reportado uma única vez; soma por moeda idêntica ao global.
5. NCE com quantidade/monto/origem incoerente: mantém transparência e não atribui valores ao SKU errado.
6. Tudo que já funciona (RESUMEN, DOCUMENTOS, CLIENTES, VENDEDORES, MESES, XLSX/PDF, permissões, filtros e estados SIFEN) preservado.
**Não declarar teste executado**; justificar ligação SQL com evidências de código e cenários hipotéticos, sem inventar dados reais.

## 4. Entrega
- Fazer apenas menor patch justificável na branch oficial. Revisar arquivos completos antes e depois.
- Commit e push; relatar SHA completo, diff, arquivo(s), estratégia de ligação e eventuais bloqueios. Se concluir demonstravelmente que o contrato atual está integralmente garantido pelo backend histórico e pelo relatório sem patch, explicar com documentação técnica do código e PARAR sem inventar commit funcional.
- Claude não atualiza Linear, progresso, auditoria, permissões nem planeja E6.
- **Não executar** tests, lint, build, CI, SQL, migrations, VM, gateway, emissão real, browser ou deploy.
- **PARAR PARA REAUDITORIA INDEPENDENTE DO CHATGPT.**
