# Decisão comercial — Tipo de cambio manual (Nexit V1)

**Data:** 2026-10-12. **Aprovado pelo responsável.** Complementa `AUDITORIA-LISTAS-PRECIO-Y-CATALOGOS-COMERCIALES-2026-10-12.md`. **Status:** requisito aprovado; implementação, SQL real e deploy não executados.

## Decisão

O cadastro **Tipos de cambio** será **100% manual**. Não haverá integração com governo, banco, API cambial ou qualquer fornecedor externo na V1.

### Campos do formulário definidos pelo responsável

1. **Fecha** — data da cotação.
2. **Moneda** — seleção entre moedas já cadastradas no Nexit (ex.: USD, BRL, EUR).
3. **Cambio** — cotação digitada manualmente, expressa em **PYG por 1 unidade da moeda escolhida**.

A moeda base de referência desta funcionalidade é **PYG**. Não criar dois valores Compra/Venta nem campos como Fonte ou Data/Hora como dados obrigatórios da interface; qualquer timestamp técnico para auditoria será interno. Para PYG, cotação de referência é 1 e não precisa de entrada manual.

### Validação e integridade propostas

- Cambio numérico positivo, precisão adequada para taxas e entrada formatada para es-PY; não aceitar 0 ou negativos.
- Mesmo par Moeda/PYG e mesma Fecha: impedir duplicatas ativas incoerentes e definir modo controlado de correção/versão; histórico anterior preservado, nunca substituir silenciosamente valor já usado em transação.
- Data obrigatória e válida; ordenar por data decrescente, filtro por moeda e por intervalo, exibir cotação e estado/ações conforme padrão Catálogos.
- Isolamento por empresa quando registro/taxa for próprio de cada empresa; checar o modelo de moedas e requisitos de multiempresa vigentes antes de criar migration.
- Registrar quem fez alteração e data/hora internamente, se existir infraestrutura de auditoria; caso contrário, projetar trilha mínima sem ampliar formulário.
- Esta decisão **não autoriza conversão automática de custos/preços de listas** nem mudança implícita na política de preço. Para conversão, requer especificação explícita de vigência (taxa na data aplicável), arredondamento, fonte do preço e tratamento de taxa ausente.

### Menu aprovado conceitualmente

**Catálogos comerciales** com abas **Tipos de cambio | Canales de venta | Zonas comerciales**. Aproveitar tabelas já existentes de zonas e canais; identificar tabela/migrations existentes de câmbio antes de criar outra. Layout compatível com Catálogos de Productos; não renomear menus de outros módulos sem análise.

### Limites

Não acessar VM nem aplicar SQL por Claude/ChatGPT. Não alterar migration já aplicada. Implementação autorizada somente após instrução de tarefa e auditoria das tabelas/APIs relacionadas. Critérios pendentes para motor de preços (descontos, prioridade, moedas) permanecem na matriz original.
