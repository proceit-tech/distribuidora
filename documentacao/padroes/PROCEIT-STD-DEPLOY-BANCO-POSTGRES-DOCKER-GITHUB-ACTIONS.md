# PROCEIT — Padrão de implantação de banco PostgreSQL em Docker via GitHub Actions

**Estado:** padrão em elaboração, documentando a instalação Nexit em 09/10/2026. **Não homologado para produção.**  
**Finalidade:** repetir nos próximos produtos PROCEIT o fluxo **Claude desenvolve → GitHub versiona → ChatGPT revisa → proprietário aprova → pipeline implanta**, sem acesso permanente do desenvolvedor ao banco.

## 1. Princípios obrigatórios

1. Um repositório por produto e stacks Docker independentes.
2. Não recriar banco, contêiner ou volume para instalar migrations.
3. SQL versionado, sequencial, com checksum e registro de execução; scripts já aplicados nunca são reescritos.
4. PR e revisão obrigatórias antes do merge; deploy separado do merge, com aprovação humana.
5. Usuário administrativo de migration separado da identidade de aplicação com privilégios mínimos.
6. Não expor PostgreSQL publicamente, não commitar senhas/chaves, não enviar segredos pelo chat.
7. O operador deve validar o ambiente e o alvo antes de qualquer operação mutável.
8. Banco vazio tem procedimento inaugural específico; **não equivale** à política normal de atualizações de produção.
9. Antes de clientes reais: backup externo com recuperação ensaiada, isolamento multiempresa testado e plano de rollback.
10. O Claude prepara código/migrations/testes e não executa comandos em produção sem autorização.

## 2. Arquitetura Nexit (instância de referência)

| Item | Valor confirmado |
|---|---|
| Projeto Google Cloud | `project-7cebe2de-5441-4b0f-bff` |
| VM | `instance-20260930-232419` |
| Usuário operador | `proceit24` |
| Stack | `/srv/stacks/distribuidora` (arquivos compose, não repositório Git) |
| Banco | `nexit` PostgreSQL 16.15 |
| Contêiner DB | `nexit-db` saudável |
| Contêiner app | `nexit-app` |
| Proxy | `proceit-caddy` |
| Volume | `nexit_pgdata` |
| Rede | `nexit_internal`, interna |
| Conta técnica de migração atual | `nexit_app` — **superusuário**, uso apenas de instalação; revisar redução posterior |
| Identidade prevista para a aplicação | `nexit_runtime` (ainda não provisionada no banco vazio) |
| Conta Linux prevista para deploy | `nexit-deploy`, UID 1002; sem sudo e sem grupo docker |
| Repositório | `proceit-tech/distribuidora` |
| Branch / PR de preparação | `feature/NEXIT-2026-001-banco-demo` / PR #7 |
| Estrutura candidata SQL | `documentacao/banco/nexit/v1/migraciones/NEX-001…NEX-015` |

**Observações verificadas:** `psql` conectou a `nexit` como `nexit_app`; consulta `pg_tables` em `public` retornou zero linhas. Isso **não comprova** que outros schemas estejam vazios. O serviço SSH está ativo; autenticação por chave habilitada e por senha desabilitada.

## 3. O que foi feito até aqui na VM

- Contêineres existentes inspecionados com `docker ps`; nenhum recriado.
- `nexit-deploy` criado com grupo exclusivo, sem sudo/docker.
- `/home/nexit-deploy/.ssh` criado com permissão 700.
- Par SSH ED25519 gerado em `/home/nexit-deploy/.ssh/nexit-github-actions{,.pub}` **com propriedade root**. A chave privada permanece na VM: **não copiar ao chat e não habilitar acesso antes de provisionar segredo com segurança; remover cópia de origem após transferência segura**.
- Criados `/opt/nexit-deploy` (root, 755) e `/etc/nexit` (root, 750).
- Script de implantação baixado da branch da PR #7, validado com `bash -n` e instalado como `/opt/nexit-deploy/nexit-db-remote.sh` (root, 755); confirmada a presença de `migrar-inicial)`.
- `/etc/nexit/deploy.conf` criado (root, 600), com os parâmetros abaixo; **não contém senha**.
- Disponíveis `docker`, `flock`, `sha256sum`, `tar` e `gcloud` (snap).
- Git consulta o repositório remotamente, mas `/srv/stacks/distribuidora` **não é clone Git**.

### Configuração instalada (sem credenciais)

```ini
NEXIT_MODO=docker
NEXIT_DB_CONTENEDOR=nexit-db
NEXIT_DB_NOMBRE=nexit
NEXIT_DB_ADMIN=nexit_app
NEXIT_RAIZ=/var/lib/nexit-deploy
NEXIT_RESPALDOS=/var/backups/nexit
NEXIT_EXIGE_COPIA_EXTERNA=1
```

O arquivo é root:root 600; `nexit-deploy` não consegue lê-lo.

## 4. Nível de automação realmente atingido

**Ainda NÃO foram feitos:** instalação de regra sudo restrita, ativação de chave no `authorized_keys`, configuração dos Secrets ou de ambiente protegido GitHub, conectividade GitHub Actions → VM, merge, execução dos workflows, instalação de migrations, criação de empresa/admin, criação da senha `nexit_runtime`, integração de APIs ou testes end-to-end.

A mera presença do script executável root:root **não concede privilégio Docker** a `nexit-deploy`.

### Pipeline versionado (não ativado)

- `.github/workflows/nexit-banco-ci.yml`: testes em PG16 descartável, não na VM.
- `.github/workflows/nexit-banco-deploy.yml`: disparo manual `workflow_dispatch`, confirmação `IMPLANTAR-NEXIT-DB`, branch `main`, ambiente `nexit-produccion` que **deverá ter revisores obrigatórios configurados**.
- Modo `plan`: análise sem aplicar migrações.
- Modo `inicial`: exceção **somente** para banco `nexit` sem objetos persistentes de usuário; não exige Cloud Storage, por decisão expressa do proprietário enquanto não há dados comerciais.
- Modo `completo`: exige backup, prova de restauração e cópia externa recentes antes de migrar. **Não desativar este controle para futuras atualizações.**

**Atenção:** as mudanças mais recentes do executor remoto foram publicadas na PR depois da instalação inicial na VM e a versão foi atualizada manualmente. **Antes de cada uso, conferir commit e hash do script em disco contra a revisão aprovada.** `bash -n` comprova apenas sintaxe, não segurança ou funcionamento.

## 5. Google Cloud Storage — decisão para instalação inaugural

A conta associada à VM é `471627208856-compute@developer.gserviceaccount.com`, com escopo `devstorage.read_only`. A consulta `gcloud storage buckets list` retornou HTTP 403; no Console do projeto a listagem exibiu nenhum bucket. Por decisão de custo, **não foi criado bucket**. Não é necessário para o modo `inicial`, mas **será indispensável definir armazenamento externo e restauração testada antes de dados de clientes reais**.

Não ampliar IAM ou OAuth scopes da VM apenas para resolver o primeiro deploy.

## 6. Pontos críticos antes de habilitar SSH/sudo

1. **Não autorizar o script remoto inteiro a executar como root sem auditoria.** Ele contém comandos Docker e recebe pacotes tar/SQL externos; uma regra genérica `NOPASSWD` pode equivaler a root irrestrito.
2. Projetar um executor mínimo para a primeira instalação, com allowlist estrita e separação entre recepção de pacote e execução privilegiada, ou outra arquitetura que não permita executar conteúdo arbitrário como root.
3. Configuração root-only e executor root-owned não bastam: inspecionar inclusive caminhos, flags, symlinks, integridade do pacote, dono dos diretórios e comandos disponíveis.
4. Para GitHub Actions hospedado, definir SSH seguro (IAP/runner controlado/endpoint restrito); não abrir indiscriminadamente porta 22 para toda a Internet.
5. Definir conta de serviço, acesso de rede, segredo da chave SSH, pinning de host key e revisores do ambiente.
6. Conferir que a opção `inicial` não permite ignorar dados existentes nem reinstalar em banco já inicializado; validar o estado novamente imediatamente antes da alteração.
7. A aplicação ainda precisa de autenticação real, RLS/contexto tenant ou garantia equivalente testada, e permissões limitadas antes do go-live.
8. Custeio D-C1…D-C9 e fonte de 'Ventas al costo' continuam decisões funcionais pendentes.

## 7. Processo padrão para os próximos sistemas

### A. Preparar um novo projeto

- Criar repositório privado ou com política de acesso aprovada; criar branch/PR para schema e pipelines.
- Definir nomes específicos de banco, contêiner, volume, rede, usuário runtime e identidade de deploy **sem reutilizar credenciais do Nexit**.
- Provisionar uma base sem modificações preexistentes e verificar objetos em todos os schemas relevantes.
- Versionar migrations; preparar validação, transações por arquivo, checksums e uma rotina de inspeção do plano.

### B. Desenvolver e revisar

- Claude prepara migrations, testes e código da aplicação na branch; não recebe segredo nem acesso livre à produção.
- GitHub registra diffs e CI; ChatGPT revisa isolamento, segurança, compatibilidade, custos, testes e plano de recuperação.
- Proprietário aprova regras funcionais, PR, ambiente e execução do pipeline.
- **Não confundir aprovação de PR com autorização de execução.**

### C. Instalar a primeira versão

- CI descartável e análise estática; aprovar alterações.
- Habilitar temporariamente a execução de migrations no ambiente autorizado com segredo e privilégios mínimos.
- Verificar no próprio banco que está vazio; aplicar só migrations pendentes, registrar seus hashes e gerar logs.
- Carregar apenas catálogos autorizados. Criação da empresa e administrador **separada** da instalação, com credenciais fora do Git.
- Provar conexão do runtime, funções e consultas necessárias; não declarar go-live apenas porque tabelas existem.

### D. Atualizar após o primeiro uso

- Nunca editar migrações já aplicadas; criar nova versão.
- Backup externo antes da alteração; testar a restauração.
- Aplicar as migrations em ordem via pipeline protegido e verificar o estado depois.
- Mudanças incompatíveis exigem estratégia expand/migrate/contract, sem supor rollback SQL reversível.
- Manter registros de commit, autorização, migrations aplicadas, falhas e restauração.

## 8. Checklist de liberação do Nexit

- [x] VM, PostgreSQL, Docker e banco existente identificados
- [x] Conta Linux de deploy isolada criada
- [x] Executor e configuração root-owned instalados
- [x] Workflow inicial/completo versionado na PR
- [ ] Script, workflows e empacotamento auditados e ensaiados na versão final
- [ ] Executor privilegiado realmente limitado, sem acesso geral ao Docker/root
- [ ] Conexão SSH segura e segredos GitHub configurados
- [ ] Ambiente GitHub protegido com aprovação obrigatória efetiva
- [ ] CI da branch confirmada
- [ ] PR revisada/merge aprovado
- [ ] Instalação inicial autorizada e aplicada ao banco existente
- [ ] Catálogos, usuário runtime e empresa/admin inicializados de forma segura
- [ ] Integração Next.js e segurança multiempresa validadas
- [ ] Backup externo e recuperação antes da entrada de clientes reais

## 9. Orientação reutilizável ao Claude

> Para novos projetos PROCEIT, siga este padrão de banco PostgreSQL em Docker: defina schema versionado e CI, documente pré-requisitos, prepare deploy manual com aprovação, mantenha separação entre identidade de deploy/admin/runtime, e **não execute migrations nem altere VM/contêiner/volume sem autorização do proprietário**. Use o Nexit apenas como referência arquitetural: substitua todos os nomes e credenciais, revise o modelo de segurança e não copie padrões provisórios de exceção para bancos com dados. Entregue PR, hash, relatório de compatibilidade, riscos e checklist de liberação. Evite testes repetidos que não tragam nova evidência.

## 10. Links

- [PR #7 — Banco Nexit V1](https://github.com/proceit-tech/distribuidora/pull/7)
- [Workflow de implantação](../../.github/workflows/nexit-banco-deploy.yml)
- [Implantação detalhada Nexit](../banco/nexit/v1/docs/05-IMPLANTACION-AUTOMATIZADA.md)

**Padrão de referência, não autorização para implantar.**
