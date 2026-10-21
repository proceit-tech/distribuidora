# Nexit V1 — decisão de escopo: Reposición e Movimientos vinculados a documentos

**Data:** 2026-10-12. **Origem:** confirmação expressa do responsável. **Status:** diretriz funcional aprovada, NÃO implementada, sem autorização de SQL/VM/deploy.

## Reposición: todas as alternativas

A sugestão de reposição precisa apresentar, conforme disponibilidade e contexto: (1) compra de fornecedor; (2) transferência entre depósitos; (3) recebimento de devolução de cliente; (4) outras entradas de regularização/ajuste com justificativa e permissão. Não criar automaticamente pedidos, transferências ou movimentos apenas por abrir a página ou gerar uma sugestão. Diferenciar sugestão, autorização, documento comercial/fiscal, separação, expedição, recebimento físico e confirmação da movimentação.

## Movimientos por documentos fiscais/comerciais

O sistema deverá PREVER vínculos auditáveis de movimento a:
- **Factura de venda**: baixa física quando a operação determina saída de mercadorias e essa baixa ainda não ocorreu; não duplicar saída se uma remisión/entrega já movimentou o mesmo item.
- **Nota de remisión**: saída, transferência ou entrada no destino conforme a natureza da remessa; não tratar toda nota como baixa definitiva de propriedade ou venda. Transferência deve conservar rastreabilidade origem/destino e estado trânsito quando aplicável.
- **Nota de crédito**: **entrada somente se houver devolução física efetiva de mercadorias** (produto, quantidade, condição, depósito e propriedade confirmados). Nota de crédito financeira, desconto/bonificação ou correção de valor **não** produz entrada automática.
- **Factura de compra / recebimento**: entrada quando mercadoria é recebida/confirmada, não só por lançar documento. Devolução ao fornecedor e nota de débito: avaliar operação e vínculo; sem automatismo por tipo isolado.
- **Ajuste de inventário**, devoluções, perdas, avarias, quarentena, reservas e estornos: motivos, rastreabilidade e permissão específicos.

**Princípio:** documentos fiscais não são equivalentes a eventos físicos. A política de momento da baixa/alta (fatura, nota de remessa, confirmação de entrega/recebimento) deve ser configurada e validada conforme natureza da operação. Para a mesma operação física, **um único efeito no estoque**; chave de idempotência por evento de origem + linha + tipo de movimento; estornos vinculados ao original, não exclusão de histórico.

## Pré-requisitos de integridade
- Conferir `app/api/movimientos/route.ts`, `lib/movimientos/shared.ts`, migrations de `movimientos`, `stock_saldos`, `inventario_costos`, módulos futuros de Facturación/Compras/Entregas e controle de unidades/lotes.
- Toda movimentação: empresa da sessão, depósito de origem/destino, produto, unidade/fator, quantidade positiva, propriedade próprio/terceiro, status, lote/série quando aplicável, usuário, data, tipo/motivo, documento origem e linha; transação atômica e prevenção de saldo negativo segundo política.
- Separar custo/valor do estoque de valor fiscal/venda; notas fiscais não devem redefinir custo médio sem regra contábil.
- Log de alterações, estorno por operação reversa, nunca apagar movimentos confirmados.
- Reposición: prever compras e transferências, mas conferir saldo disponível, reservado e trânsito sem subtrair reserva duas vezes; depósito e status por linha.

## Próxima etapa
Auditoria conjunta do módulo Stock + Movimientos + relação futura com documentos. Definir matriz documento × evento físico × direção do movimento × estados × prevenção de duplicidade ANTES de mandar Claude implementar. Sem criação automática de Compra/Venta/Remisión/NC e sem assumir emissão fiscal existente no Nexit. Regra depende de decisões posteriores para cada fluxo.
