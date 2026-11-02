# Avaliação técnica preliminar dos SQL históricos — Nexit — 09/10/2026
**Status:** análise estática dos 21 arquivos enviados pelo proprietário + documento funcional antigo. **Nenhum SQL foi executado** ou homologado em PostgreSQL; não confundir inspeção textual com validação funcional.

## Conjunto real recebido
- Versões completas **001–017**, **022–025**; ausentes **018–021**.
- A sequência dos cabeçalhos de pré-requisitos confere: 002→001, ... 017→016, 022→021, 023→022, 024→022, 025→024.
- Scripts históricos são substanciais e cobrem tabelas de login/empresa, clientes, proveedores, productos, listas de precios, movimentos/estoques, custo, relatórios, logística, finanças e SIFEN.
- `001` possui avisos de instalação no banco legado `distribuidora`; o banco da VM é `nexit`, atualmente sem tabelas.
- `025` contém dados de geografia de PY (cabeçalho declara 18 departamentos, 272 distritos, 6766 cidades/localidades e 1104 bairros); não verificar cifras apenas por cabeçalho.
- Documento funcional DOCX v1.0 de setembro/2026 é fonte de negócios **ampla**, originalmente aprovada para desenho do MVP, mas a **primeira demo atual está limitada a nove itens** expressamente selecionados pelo proprietário na PR #7.

## Achados técnicos prioritários
**A1 (bloqueante): 018–021 faltantes.** A 022 exige versão 021 em `schema_migrations`; além disso 022 diz depender das quatro migrations 018,019,020,021. Não inventar versões nem criar registros falsos para contornar verificação. Procurar fontes reais e validar os objetos esperados.

**A2 (alto): scripts legados contêm mudanças cumulativas e correções em migrations posteriores.** A 010 contém referências a `depositos.empresa_id`; em 001 `depositos` relaciona-se a `sucursales` e não declara a coluna. A 016 se apresenta explicitamente como correção de referências inválidas (`fn_deposito_pertenece_empresa`). **É necessário testar se o 010 pode ser aplicado em sequência e se existem funções/triggers quebradas no intervalo**. Sem prova de execução bem-sucedida, não concluir que executar 001–017 é seguro.

**A3 (alto): há pelo menos mais uma referência análoga na 023.** A função `fn_validar_relaciones_producto` consulta `empresa_id FROM depositos` no ramo `producto_deposito_configuracion`, mas a tabela `depositos` do 001 não expõe esse campo. Corrigir comparando via `sucursales` ou função bem testada; não alterar arquivo histórico, fazer migration adaptativa posterior.

**A4 (alto): segurança multiempresa.** Os históricos criam FKs e gatilhos de validação, mas isso não substitui permissões por usuário e isolamento server-side. Seguir a decisão aprovada de `nexit_runtime` sem superusuário e testar dois prospects sem vazamento. Não trocar `DATABASE_URL` real nesta etapa.

**A5 (alto): escopo de nove itens não equivale a executar todo o legado.** Scripts 004–015 criam módulos de compras, vendas, finanças, logística, fiscal. Claude deve **selecionar dependências necessárias** para login/empresa, Clientes, Proveedores, Productos, Movimientos, Stock, Listas de precios, relatórios de custo XLSX e Dashboard; o modelo pode reservar tabelas auxiliares, mas nenhuma tela de módulo não aprovado deve ser implementada.

**A6 (médio): custo/reportes requerem reconciliação.** `011` cria `costos_producto` com registros de custo; `014` cria views operacionais de stock, mas *não está comprovado* que implementem valorização por custo médio ponderado móvel, custo histórico na saída, ou relatório completo `ventas al costo` com exportação XLSX. Mapear dados e gaps antes de afirmar funcionamento.

**A7 (médio): documentação e UI diferem de banco.** O DOCX funcional v1.0 é ampla base histórica, enquanto Claude constatou que muitas telas da app atual ainda usam `localStorage`. Instalar SQL não faz os nove itens funcionarem sem rotas API e adaptação das telas.

## Plano rápido recomendado ao Claude
1. Conferir hashes dos arquivos originais e buscar 018–021; não editar originais.
2. Em branch da PR #7, documentar mapa DDL das versões legadas e comparação com queries de `app/api`, `lib/auth`, incluindo diferenças 001–017 vs 022–025.
3. Construir **esquema Nexit compatível** sem inventar versões executadas; migrations novas e separadas, com resultado reproduzível em PostgreSQL 16 descartável, sem tocar VM.
4. Criar papel `nexit_runtime` + políticas/grants apropriados, e modelo demo + tenant por prospect.
5. Relatar evidências de teste de login, CRUD, stock/kardex, preços, custo médio ponderado móvel, relatórios XLSX, dashboard e isolamento.
6. Entregar PR; ChatGPT revisa; proprietário aprova antes de merge e execução em VM.

## Operação e segurança
- **Não executar** os SQL históricos na VM; não alterar `nexit_pgdata`; não fazer merge.
- Não declarar que os arquivos originais estão publicados no Git antes de verificar o commit. Se ainda não publicados, extrair o pacote enviado ao usuário em `documentacao/banco/nexit/fontes-historicas/`, confirmar SHA256, fazer commit/push na branch.
