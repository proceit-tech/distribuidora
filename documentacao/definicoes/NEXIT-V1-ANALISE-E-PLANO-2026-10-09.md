# Nexit V1 — Análise, matriz dos nove itens e plano para validação (09/10/2026)

**Status:** para validação do responsável e revisão do ChatGPT. Nenhuma mudança estrutural de grande alcance foi iniciada; nada foi executado na VM, nenhum merge, nenhum deploy.

## 0. Confirmação de entendimento
O Nexit V1 é um **sistema real de produção** para clientes, com escopo fechado nos nove itens (tudo neles deve funcionar de ponta a ponta sobre PostgreSQL). A empresa DEMO é **apenas um recurso comercial** (tenants fictícios, modelo + uma por prospect), sem definir arquitetura nem escopo. Nada de localStorage/mocks/valores fixos; nada fora dos nove itens; funcionalidade só "pronta" com teste ponta a ponta.

## 1. Busca das migrations 018–021 (e 003)
- Pesquisadas todas as branches/refs locais e remotas dos repositórios acessíveis e o sistema de arquivos da sessão: **não existe 018, 019, 020, 021**.
- **A 003 também falta** (a 004 exige `schema_migrations.version='003'`). Pelas tabelas que o código usa e nenhum histórico cria, a 003 provavelmente cria: `medios_pago, incoterms, grupos_proveedor, referencia_geografica_paises` e as filhas de proveedores (`proveedor_contactos/direcciones/cuentas_bancarias/retenciones/documentos`) — é inferência, não prova.
- 018–021: não deduzíveis; a 022 só exige a 021 e usa `zonas_comerciales` (criada na 015).
- Não foram criadas versões falsas. **Pedido ao responsável:** localizar 003 e 018–021 no seu computador/pgAdmin (`select * from schema_migrations` de qualquer banco legado `distribuidora` mostra o que foi aplicado) ou autorizar o caminho B abaixo.

## 2. Compatibilidade dos SQLs históricos (ensaio em PG 16 descartável)
Método: aplicados 001–017, 022–024 na ordem; versões ausentes só simuladas **num banco de ensaio** para medir o resto da cadeia (evidência, nunca procedimento).
- **Sem 003/018–021 a cadeia não executa:** 004 falha pelo guard; 006 falha (`medios_pago` inexistente) e a falha em cascata derruba 007, 008, 010 (parcial), 012–015, 022–024 (`zonas_comerciales`/`cuentas_cobrar`/`movimientos_caja` ausentes). 001, 002, 004, 005, 009, 011, 016, 017 aplicam sem erro (com guards simulados).
- **Cobertura das 46 tabelas que o app consulta:** 37 existem no histórico; **9 ausentes** (as de 003 acima).
- **A2/A3 confirmados:** `depositos` (001) **não tem `empresa_id`**, mas triggers de 004/010 e a função da 023 consultam `depositos.empresa_id` → falharão em execução; 016 corrige só parte. Exigem migration adaptativa.
- Stock/custos históricos: `existencias`, `movimientos_stock`, `lotes_stock`, `costos_producto`, `producto_precios`, `listas_precio` (001/004/009/011). **Não comprovado** custo médio ponderado móvel, custo congelado na saída, relatório "ventas al costo" nem valorização (A6).
- Os históricos criam **128 tabelas** (compras, finanças, fiscal, logística…) muito além dos nove itens (A5).
- Nomes de colunas: histórico usa `created_at/updated_at`; a minha proposta derivada usa `creado_at/actualizado_at`. Precisa ser reconciliado com o app antes de escolher (o app só usa `creado_at`? — a verificar na adaptação; as 66 consultas do app passam contra a proposta derivada, **não foram executadas contra o histórico por falta de 003**).

## 3. Dois caminhos de banco (decisão do responsável)
| | A — Base histórica + migrations adaptativas | B — Esquema enxuto derivado do código (já ensaiado) |
|---|---|---|
| Fonte | 001–017, 022–025 + 003/018–021 (pendentes) | NEX-001…013 em `proposta-derivada-do-codigo/` |
| Bloqueio | 003 e 018–021 | nenhum |
| Escopo | 128 tabelas, só ~54 relevantes | só os nove itens (+ dependências) |
| Custo/estoque | a construir sobre `costos_producto` | pronto e testado (promedio móvel, custo congelado, vistas) |
| Risco | aplicar legado inteiro; defeitos A2/A3 | diverge do legado (futuro ERP exigiria convergência) |
| Evidência | cadeia não executa hoje | 125 verificações PASS |
**Recomendação:** A como fonte de verdade das estruturas que já existem (clientes/productos/proveedores/seguridad) **assim que 003 e 018–021 forem localizados**, aproveitando B apenas nas partes ausentes/frágeis no legado (inventário com custo, vistas de relatório/dashboard, `nexit_runtime`, ciclo DEMO). Se 003/018–021 não existirem, adotar B como base da V1. Não decidir sem o responsável.

## 4. Matriz dos nove itens (estado real hoje)
Código atual: APIs reais só para `auth`, `clientes`, `proveedores`, `productos` (sem PUT/DELETE; só POST/GET); demais telas em localStorage/valores fixos; shell mostra todos os menus (`permissions: []`); sem uso de `userHasPermission`.

| # | Item | Código existente | Funciona de fato? | Banco | Falta |
|---|---|---|---|---|---|
| 1 | Login e empresa | login/logout/sessão reais (bcrypt/pgcrypto, bloqueio 5×15 min) | **Não**: banco `nexit` vazio; formulário expõe `admin/admin123` e empresa fixa; cookie demo forjável se `DEMO_MODE=true` | 001/013 (legado) ou NEX-002 | remover credenciais públicas; nome da empresa real na shell; permissões por menu; teste E2E |
| 2 | Clientes | API GET/POST (1137 linhas); tela `nuevo` chama API; listagem/edição não | Parcial | 001+022+024 / NEX-005 | listagem e edição via API; PUT; F-01 (`$32::uuid` em clientes/route.ts:827); validações |
| 3 | Proveedores | API GET/POST; telas em localStorage | Não | falta 003 / NEX-006 | telas→API; PUT; vínculo com produtos |
| 4 | Productos | API GET/POST; tela? parcial | Parcial | 023 / NEX-007 | telas→API; PUT; kits/códigos |
| 5 | Movimientos | tela em localStorage | Não | 004/009 / NEX-009 | API transacional, número de movimento, anulação, histórico |
| 6 | Stock | tela em localStorage | Não | `existencias` / NEX-009 | API de saldos por produto/depósito/estado |
| 7 | Listas de precios | tela em localStorage | Não | `listas_precio`+`producto_precios` / NEX-008 | API CRUD, ítens/escalões |
| 8 | Relatórios de custo / XLSX | **sem tela nem API** | Não | NEX-009/011 (legado: não comprovado) | API com filtros, XLSX igual ao filtrado, decisões D-C1..D-C9 |
| 9 | Dashboard | números literais | Não | NEX-011 | API de indicadores derivados |
Dependências técnicas: sucursales, depósitos, catálogos, geografia (025 só após 024).

## 5. Problemas críticos
1. **Banco incompleto:** 003 e 018–021 ausentes; cadeia legada não executa (§2).
2. **Segurança:** `nexit_app` é superusuário (ignora RLS); app deve usar `nexit_runtime` (criado/testado em NEX-013; sem trocar `DATABASE_URL`). Sem RLS ativo e sem `withTenantTx`, o isolamento hoje depende de `WHERE empresa_id` em cada consulta (RLS opcional testada, mas ativá-la exige mudança de código e função de login `SECURITY DEFINER`).
3. **UI:** credencial pública `admin/admin123`; cookie demo estático; todos os menus visíveis; 24 itens de menu sem página.
4. **Regras de negócio:** custo (D-C1..D-C9 **pendentes**, usei apenas defaults provisórios do P007); **fonte de "vendas" sem Facturas** — proposta: SALIDA/VENTA com preço na linha (NEX-010, isolada e substituível) — **decisão necessária**; `payment_terms` global vs por empresa (o app lê sem empresa_id: adotei global).
5. **Bugs do app:** F-01 (cliente com `bloqueado_ventas_por`), junção geográfica só por `distrito_codigo` (códigos de distrito precisam ser únicos globalmente).
6. **Scripts legados:** A2/A3 (`depositos.empresa_id`).

## 6. Sequência recomendada (após validação)
1. Decidir caminho A/B e localizar 003/018–021 · decidir D-C1..D-C9 e fonte de vendas.
2. Banco: migrations finais + `nexit_runtime` + testes (já existe base de testes reutilizável).
3. Login/empresa: remover credenciais públicas, permissões por menu, tenant em todas as consultas.
4. Clientes → Proveedores → Productos (editar/listar via API).
5. Depósitos/sucursales como dependência → Movimientos → Stock → Listas de precios.
6. Relatórios de custo + XLSX → Dashboard.
7. Empresa DEMO (modelo + prospects) sobre os mesmos módulos.
8. E2E, auditoria ChatGPT, aprovação, implantação.

## 7. Plano de testes e implantação automatizada
- **Testes:** bateria SQL em PG 16 descartável (já há 125 verificações para o caminho B), verificação das consultas literais do app, testes de API (supertest/Playwright) por item, E2E com navegador (login→CRUD→movimento→stock→relatório XLSX→dashboard), isolamento A/B nas APIs, conferência XLSX = filtro da tela, varredura de segredos. CI no PR #5 (REQ-2026-004) estende isto; o job `app-lint` ainda está vermelho (pendente).
- **Implantação (proposta, nada ativado):** GitHub Actions com *environment* protegido e **aprovação manual** do responsável; passos: backup `pg_dump` + verificação de restauração → migrations com runner (checksum, transação por arquivo) → publicação da imagem (GHCR) → *smoke tests* pós-implantação. Requer, **a ser autorizado**: chave SSH restrita (deploy) ou *self-hosted runner* na VM, e secrets do ambiente. Hoje tenho **apenas acesso ao GitHub**; nenhum acesso SSH/administrativo à VM, e não solicito mais por ora.
- Backup externo + teste de restauração planejados antes de qualquer execução real (B1 já valida o mecanismo no descartável).

## 8. Pendências para o responsável
Localizar 003 e 018–021 e o DOCX; escolher caminho A/B; decidir D-C1..D-C9, fonte de vendas, `condiciones_pago` global; autorizar mecanismo de implantação (§7); confirmar que posso preparar o PR de código separado após a validação deste plano.
