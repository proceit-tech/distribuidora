# Decisão funcional CAT-012 — Hierarquia obrigatória de catálogos de Productos

**Aprovada pelo responsável em 2026-10-12.** Referência: `MATRIZ-AUDITORIA-CATALOGOS-PRODUCTOS-V1-2026-10-12.md`. Esta decisão **define a regra de negócio**, não autoriza por si só aplicação de SQL/deploy nem migração automática de dados.

## Modelo aprovado

**Categoría → Familia → Línea**. Toda Família pertence a exatamente uma Categoría; toda Línea pertence a exatamente uma Familia. Uma Categoría pode conter várias Familias, e uma Familia pode conter várias Líneas. **Marca é independente**, sem dependência obrigatória de categoria/família/linha.

Na ficha do Produto, seleção em cascata: Categoría filtra Familia, Familia filtra Línea. Para um Produto que informe os três níveis, todos devem pertencer à mesma cadeia. Não permitir associação incompatível na API/DB mesmo se a UI for contornada. Especificação adicional a decidir: exigir todos os níveis em TODOS os produtos (p.ex. servicios) ou permitir selecionar somente antecessores; não presumir obrigatoriedade integral do produto a partir da hierarquia obrigatória das entidades Família e Línea.

## Integração com dados atuais e migração segura

A versão V1 atual armazena `productos.categoria_id`, `productos.familia_id` e `productos.linea_id` independentes. O registro Família ainda não tem relação obrigatória Categoria confirmada na auditoria. Antes de declarar NOT NULL/FKs/validadores:
1. Levantar no PostgreSQL real, SOMENTE LEITURA, todas as Categorías, Familias, Líneas, Produtos e relações efetivas (por empresa).
2. Identificar Famílias sem Categoria, produtos com combinações conflitantes e possíveis catálogos inativos relacionados. Em capturas são 4 categorias, 51 famílias, 203 linhas; **não inferir mapeamento pelo nome**.
3. Preparar tabela de correspondência Categoria↔Familia **aprovada pelo humano**. Se alguma família histórica não puder ser atribuída, suspender imposição de NOT NULL até resolução.
4. Migração futura deve ser incremental (próximo número livre, conferir versões aplicadas), sem alterar migrations já aplicadas, sem excluir/renomear IDs e sem atualizar `schema_migrations` manualmente.
5. API deve preservar isolamento por `empresa_id`, integridade na base por FK composta e verificações adequadas para Produto. Prever alteração de categoria da Família com descendentes/produtos associados: restringir ou executar mudança coerente explicitamente autorizada, jamais reclassificar registros em cascata sem consentimento.
6. UX: selecionar Categoria para criar/editar Familia; filtragem dependente Familia/Línea no Produto; manter dados históricos visíveis inclusive inativos quando já vinculados; avisos claros quando há dependência e alterações não salvas.

## Pontos já decididos / pendentes

- **Decidido:** Categoría→Familia→Línea obrigatório entre entidades; Marca independente.
- **Pendente:** categoria correta de cada família histórica; se Produto deve obrigatoriamente preencher os três níveis; como tratar alteração de hierarquia já utilizada em Produtos; eventual código de catálogo obrigatório/autogerado.
- **Não autorizado:** atribuir famílias por similaridade de nomes, apagar catálogos, executar migrations ou alterar o banco real.

**Responsabilidades:** ChatGPT faz levantamento/auditoria e especificação; Claude Code implementará apenas o escopo posteriormente autorizado; responsável humano executa SQL/VM e homologa.
