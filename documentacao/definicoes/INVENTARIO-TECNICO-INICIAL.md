# DistribuNex — Inventário técnico inicial (2026-10-08)

Status: BASELINE DOCUMENTAL — NÃO É APROVAÇÃO DO SISTEMA.
Repositório: `proceit-tech/distribuidora`, branch `main`.
Objetivo: orientar Claude e ChatGPT sem confundir UI existente com funcionalidade persistida e homologada.

## Stack identificada
Next.js 16.2.6, React 19.2.6, TypeScript 5.9.3, PostgreSQL via pg 8.23.x, xlsx 0.18.5. Banco configurado via DATABASE_URL e Pool pg em `lib/db/index.ts`. Apps segmentados em `app/(private)` e `app/(public)`; layout privado usa `getShellContext`.

## Mapa de módulos detectados por arquivos
- Dashboard: `app/(private)/dashboard/page.tsx`.
- Clientes: listagem/novo/detalhe + `app/api/clientes/route.ts` (SQL).
- Proveedores: listagem/novo/detalhe + `app/api/proveedores/route.ts` (SQL).
- Productos: listagem/novo/detalhe + `app/api/productos/route.ts` (SQL).
- Listas de precios: listagem, novo, detalhe e formulário; uso de `lib/mocks/listas-precio-storage.ts`.
- Facturas: listagem, novo, detalhe; uso de `lib/mocks/facturas-storage.ts`; API própria não localizada na árvore.
- Stock: listagem/detalhe; `lib/mocks/stock-storage.ts`.
- Movimientos: listagem/novo/detalhe; `lib/mocks/movimientos-stock-storage.ts`.
- Recepciones: listagem/novo/detalhe; `lib/mocks/recepciones-storage.ts`.
- Navegação em `lib/navigation/menu.ts` inclui itens adicionais sem rotas confirmadas na árvore. Não tratar item do menu como função implementada.

## Autenticação e isolamento
`app/api/auth/login/route.ts` autentica com SQL e senha usando crypt(...); `lib/auth/session.ts` usa UUID e segredo aleatório em cookie HttpOnly; há DEMO_MODE e credenciais demonstrativas fixas, que devem ser isoladas estritamente do ambiente real. `lib/auth/permissions.ts` verifica direitos do usuário, mas ainda exige auditoria de aplicação coerente em todos endpoints. `lib/auth/server-context.ts` devolve array vazio de permissões ao shell; verificar controle efetivo de acesso em servidor e interfaces. APIs de cadastros usam filtros por empresa_id em operações examinadas. Verificar também todas as operações de escrita e referências cruzadas.

## Lacunas verificadas
1. README é legado: chama o projeto de base de autenticação e remete a migrations `017_administrador_inicial.sql` que não estão no GitHub.
2. A árvore `main` não contém scripts SQL versionados do esquema real.
3. Diversas áreas usam mocks/localStorage; NÃO presumir persistência corporativa ou consistência multiusuário.
4. Não há script de teste no package.json; nem suíte automatizada visível na árvore atual.
5. Não há definição de integração SIFEN auditada neste repositório.
6. Não há Dockerfile/compose no snapshot analisado; implantação pode existir fora do GitHub e deve ser levantada.

## Regras arquiteturais iniciais
- Não refazer telas aprovadas sem requisito explícito.
- Persistência operacional e cálculos financeiros críticos devem ocorrer no backend/DB em transações, não apenas no navegador.
- Toda consulta e mutação deve validar empresa/sucursal/depósito, permissão e integridade referencial; adicionar defesa em profundidade no banco quando apropriado.
- Separar claramente modo demonstração de produção. Não ocultar falhas de DB com dados fake em ambiente real.
- Movimentos de estoque exigem rastreabilidade, idempotência, não duplicação, saldo coerente e proteção contra concorrência.
- Facturação e SIFEN são integrações por contrato/API e requerem reconciliação, estados, erros, retries e rastreabilidade CDC/KuDE de acordo com a especificação efetiva do fornecedor e da DNIT.
- Migrações apenas incrementais sobre banco inventariado; não reconstruir esquema por suposição.
- Toda tela `page.tsx` deve ter componente React válido e export default; executar build antes de PRONTO_PARA_AUDITORIA.

## Referências técnicas (fontes oficiais)
- Next.js authentication: https://nextjs.org/docs/app/guides/authentication
- Next.js data security: https://nextjs.org/docs/app/guides/data-security
- Next.js Playwright: https://nextjs.org/docs/app/guides/testing/playwright
- Next.js Vitest: https://nextjs.org/docs/app/guides/testing/vitest
- PostgreSQL row level security: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/

## Limite deste inventário
Inventário da árvore integral e leitura orientada de arquivos críticos; não equivale a leitura linha a linha de todos os componentes extensos, execução de npm build, testes de banco ou inspeção da VM. Claude deve complementar leitura integral do código, inventário do banco atual e testes antes de propor mudanças.
