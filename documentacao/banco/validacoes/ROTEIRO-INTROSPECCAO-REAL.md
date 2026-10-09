# ROTEIRO — introspecção somente leitura do PostgreSQL real (F-001)

Requisito: REQ-2026-003 · PR #4 · Responde ao bloqueio **F-001** (R01 e R02). **Este roteiro NÃO foi executado.** Quem executa é o responsável PROCEIT (ou quem ele autorizar); Claude não acessa o banco do cliente.

Garantias do roteiro: coleta só **metadados do catálogo** (tabelas, colunas, constraints, índices, triggers, funções, políticas RLS, papéis, extensões, estimativa de linhas). **Não lê linhas de negócio**, não exporta dados de clientes, não executa DDL/DML nas tabelas de negócio. Toda sessão abre com `default_transaction_read_only=on`; o script aborta se o papel for superusuário/`BYPASSRLS`.

## 1. Antes de começar (checklist de autorização)

| # | Item | OK? |
|---|---|---|
| 1 | Responsável autoriza por escrito (mensagem no PR/chat) a coleta de **metadados** do banco identificado abaixo | ☐ |
| 2 | Banco/ambiente identificado: ______ (produção, homologação ou cópia). **Preferir cópia/homologação**; se for produção, executar fora do horário de pico | ☐ |
| 3 | Backup recente existe (o roteiro não altera nada, mas registra-se por prudência) | ☐ |
| 4 | Máquina que executa tem `psql` ≥ 14 e acesso de rede ao banco (VPN/túnel se necessário) | ☐ |
| 5 | Senha **não** será colada em chat nem em PR (usar `PGPASSWORD` local ou `~/.pgpass`) | ☐ |

## 2. Papel somente leitura

O catálogo (`pg_catalog`, `information_schema`) é legível por qualquer papel que consiga conectar. Basta um papel **sem** superusuário, **sem** `BYPASSRLS` e **sem** privilégios sobre as tabelas de negócio. O DBA cria (ação administrativa de papel, sem tocar nas tabelas), ou usa um papel existente com esse perfil:

```sql
-- executado pelo DBA/dono, UMA vez; remover depois (DROP ROLE) se não for mais usado
CREATE ROLE dn_introspeccao LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '<definir-localmente>';
GRANT CONNECT ON DATABASE <banco> TO dn_introspeccao;
```

Nunca usar o papel da aplicação nem o superusuário. Se o ambiente impedir criar papel, informar: o script aceita apenas papéis sem privilégio especial (há variável de exceção, **não recomendada**).

## 3. Execução

```bash
cd documentacao/banco/validacoes
export PGHOST=<host> PGPORT=5432 PGDATABASE=<banco> PGUSER=dn_introspeccao
export PGPASSWORD=...            # só no terminal local
CONFIRMO_SOMENTE_LEITURA=SIM ./executar-introspeccao-real.sh saida-real
```

Gera `saida-real/01_…csv … 15_…csv` e `RESUMO.txt` (versão do servidor, papéis, extensões, schemas, tabelas com RLS/linhas estimadas, colunas, constraints, índices, triggers, funções (sem corpo), views, políticas RLS, sequências, privilégios do papel e tabelas de migração). Duração esperada: segundos. Cada consulta tem limite de 30 s.

## 4. Antes de compartilhar o resultado

- Conferir `RESUMO.txt` (papel `false,false`; nenhuma falha ou, se houver, qual).
- Os CSV podem conter **nomes** de tabelas/colunas e definições de views/constraints/políticas; não contêm linhas de dados. `04`/`02` revelam nomes de papéis: remover se forem sensíveis. `11_views.csv` e `09_triggers.csv` têm lógica: se o cliente exigir sigilo, enviar só por canal privado.
- Compartilhar com Claude (anexo no chat) ou commitar em `documentacao/banco/levantamento/real/AAAA-MM-DD/` **somente** com autorização do responsável. Não exportar dados reais de clientes.

## 5. O que Claude fará com o resultado (sem executar nada no banco)

1. Comparar com `DICIONARIO-DADOS.md` / `PLANO-MIGRACAO-INGLES.md`: tabelas e colunas existentes, tipos, nulidade, FKs, `empresa_id` nulo, índices e RLS reais.
2. Atualizar `ESTRUTURA-ATUAL-POSTGRESQL.md` e as colunas NAO_VERIFICADO do mapa (`CONFIRMADO` / `DIVERGE`).
3. Verificar o **gate de versão**: P007 exige PostgreSQL ≥ 15 (`security_invoker`); as demais propostas foram escritas para ≥ 14. Se o servidor real for < 15, as views de P007 precisam de alternativa (consulta na camada de dados) — registrado, não improvisado.
4. Propor migração incremental **por domínio** (expand/contract), com ensaio em cópia, rollback e plano de IDs; em PR próprio e nova auditoria.
5. Depois, e só depois, as integridades I-01..I-10 do desenho do REQ-002 (§10.1) — contagens somente leitura com nomes de colunas já confirmados.

## 6. Não faz parte deste roteiro

Migrations, criação de tabelas, `COPY` de dados, deploy, alteração de configuração do servidor. Qualquer um exige reconciliação do esquema, PR próprio, testes e autorização expressa.
