# AUD — Catálogos de Productos / commit 78b5e978 (2026-10-12)

**Auditor:** ChatGPT. **Commit auditado:** `78b5e978e4d4c12746855377d39c91f017962ddb`. **Status:** revisão estática favorável, **NO HOMOLOGADO em PostgreSQL/navegador**. Não autorizada execução automática de migration ou deploy.

## Fontes examinadas
`CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, `documentacao/banco/nexit/v1/migraciones/NEX-044-familias-categoria-jerarquia.sql`, `scripts/reversion-NEX-044.sql`, `scripts/informe-jerarquia-catalogos-NEX-044.sql`, `lib/productos/catalogos-admin.ts`, `lib/productos/catalogos-formulario.ts`, `lib/productos/shared.ts`, `app/api/productos/route.ts`, diff do commit e capturas originais de Categorías/Marcas/Familias/Líneas fornecidas pelo responsável.

## Confirmado pelo código
- NEX-044 acrescenta `familias_producto.categoria_id uuid` **NULLABLE**, FK composta `(empresa_id,categoria_id)` para Categoria e índice. Não reclassifica dados.
- Trigger sobre Produto rejeita categoria divergente da categoria da família **quando ambas presentes e a família classificada**, protegendo mudanças de classificação; alterações de outros campos históricos ficam permitidas.
- Trigger sobre Família impede categoria que conflite com produtos associados já classificados.
- API de Catálogos obriga categoria ativa e da mesma empresa para família nova, mas aceita edição de família histórica sem classificação; Linha continua vinculada a Família.
- API Produto valida coerência de Família/Categoria quando a classificação é modificada e valida Linha/Família. Marca permanece independente.
- SQL de informe é só de leitura, lista famílias não classificadas, categorias previamente usadas em produtos, incoerências e contagens, sem alterar mapeamentos.
- Script de reversão bloqueia quando há famílias com categoria atribuída. Atenção: reversão manual só em procedimento especificamente aprovado.
- Diff contém melhorias UX relatadas: dirty checking, erros por campo, confirmação de inativação, rótulo de contagem. Não houve homologação visual do HTML renderizado.

## Questões e riscos a verificar antes da produção
1. **NEX-044 deve ser executada antes do novo contêiner da aplicação**, pois API já lê `familias_producto.categoria_id`. Deploy invertido causará erro SQL.
2. A primeira atribuição manual de categoria a cada Família histórica poderá ser recusada se houver Produtos da família classificados em categoria divergente. Esse bloqueio é intencional para não alterar dados em silêncio; executar o relatório e resolver conflitos individualmente.
3. `categoria_id NULL` é permitido para Famílias antigas e, no Produto, os níveis de classificação não foram obrigados integralmente. Isso preserva a transição; saneamento posterior e eventual NOT NULL exigirão decisão explícita.
4. A garantia de coerência no banco é condicional a ambos os IDs presentes e ao evento de alteração; verificar em PostgreSQL cenários concorrentes (edição simultânea de categoria de família e de produto), transações e efeitos sobre dados históricos antes de afirmar integridade completa.
5. Validar visualmente no navegador formulários com erros, troca de abas com alterações, seleção em cascata, históricos inativos, paginação de 51 famílias/203 linhas, estados vazios e responsividade.
6. A documentação de protocolos pode conter histórico operacional antigo. Status real das migrations deve ser sempre consultado no PostgreSQL, não inferido da documentação.

## Gate operacional
- Antes de migration, `git status`, branch/commit e `--solo-listar` com runner oficial; conferir que apenas NEX-044 está pendente e todas as versões anteriores têm checksum válido.
- Seguir com NEX-044 **somente mediante autorização do responsável**, depois conferir coluna/FK/triggers e relatório de leitura; se falhar, parar.
- Somente depois `docker build -t nexit-app:teste .` e `docker compose ... up -d --no-deps --force-recreate app` com verificações de armazenamento/logs.
- Não alterar migrations aplicadas, não atualizar `schema_migrations` manualmente, não apagar dados e não atribuir categorias por semelhança de nomes.

**Relato Claude:** 1464 verificações locais, TypeScript/ESLint e build, não reproduzidos neste turno. Auditoria sem execução PostgreSQL, Docker ou navegador.
