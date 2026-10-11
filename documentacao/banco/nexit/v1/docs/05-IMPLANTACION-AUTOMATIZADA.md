# 05 — Implantação automatizada (PREPARADA, NÃO EXECUTADA)

**Nada aqui foi executado na VM nem no banco `nexit`.** Não se presume que o acesso ao GitHub dê acesso SSH ao servidor: o mecanismo exige que o proprietário instale uma chave e um script (passos abaixo), após auditoria e autorização expressa.

## Arquitetura
GitHub Actions (`.github/workflows/nexit-banco-deploy.yml`, só `workflow_dispatch`, ambiente protegido `nexit-produccion`) → SSH com chave dedicada → **comando forçado** `nexit-db-remote.sh` na VM. A chave **não abre shell**: só aceita os subcomandos da lista branca do script. O script usa `docker exec` no contêiner `nexit-db` (sem alterar contêineres, volumes, rede nem `DATABASE_URL`).

## Fases (equivalem ao item 7 da ordem)
| # | Subcomando | O que faz |
|---|---|---|
| 1 | `entorno`, `planificar` | versão do PG, espaço, papéis, migrações já registradas; lista pendentes (só leitura) |
| 2 | `respaldar` | `pg_dump -Fc` + `pg_dumpall --globals-only` + sha256 + verificação por listagem |
| 3 | `probar-restauracion` | restaura em **contêiner descartável sem rede** e compara contagens de todas as tabelas |
| 4 | `copiar-externo` | cópia para `gs://` (ou `file://` em testes) e verificação por sha256 |
| 5 | `migrar` | **recusa** se respaldo, prova de restauração e cópia externa não forem recentes (< 6 h) e do mesmo arquivo; aplica pendentes (uma transação por arquivo, lock consultivo, checksum SHA-256 registrado; migração editada = erro) |
| 6 | `sembrar-catalogos`, `verificar` | catálogos globais (S-001) e `verificar-instalacion.sh` |
| 7 | `pruebas-post` | verificação + prova funcional com `nexit_runtime` em transação revertida |
| 8 | log | log por execução na VM + resumo do job; recuperação abaixo |

Empresa real e administrador **não** são criados pelo workflow: `inicializar-empresa` é um passo separado e autorizado (hash bcrypt pelo stdin; senha em texto nunca entra no Git, logs nem argumentos). Idem `definir-clave-runtime`.

## Segurança do fluxo
- Dispara só manualmente; confirmação textual `IMPLANTAR-NEXIT-DB`; roda só em `main`; `concurrency` impede dois simultâneos; ambiente com **revisores obrigatórios**; a CI completa (`nexit-banco-ci.yml`) roda antes como pré-requisito.
- Pacote por `git archive` do commit exato; o script valida sha256, rejeita links, `..` e caminhos fora de `v1/`.
- Argumentos validados por regex (sha de 40 hex); sem `eval`; subcomando desconhecido = erro.
- Segredos (no ambiente `nexit-produccion`): `NEXIT_DEPLOY_SSH_KEY`, `NEXIT_DEPLOY_KNOWN_HOSTS`, `NEXIT_DEPLOY_HOST`, `NEXIT_DEPLOY_USER`, opcional `NEXIT_DEPLOY_PROXYCOMMAND` (ex.: túnel IAP). Conexão restrita por firewall ao IP/túnel permitido — **decisão do proprietário** (runner hospedado do GitHub tem IPs amplos; alternativa: runner auto-hospedado ou IAP).

## O que o proprietário precisa fazer uma vez (após autorizar)
1. Criar usuário `nexit-deploy` na VM (sem sudo; no grupo `docker` *equivale a root* → alternativa mais segura: `sudo` restrito apenas ao script, ou usuário rootless; decidir).
2. Instalar `nexit-db-remote.sh` em `/opt/nexit-deploy/` (propriedade root) e `/etc/nexit/deploy.conf` (ver cabeçalho do script).
3. `authorized_keys`: `command="/opt/nexit-deploy/nexit-db-remote.sh",restrict ssh-ed25519 …`.
4. Criar bucket externo e conta de serviço de escrita; configurar o ambiente e os segredos no GitHub.
5. Rodar primeiro `fase=plan`; depois `fase=completo`.

## Recuperação
- Falha **durante** uma migração: a transação do arquivo é revertida; nada parcial. Corrija e reexecute (migrações aplicadas ficam registradas; só as pendentes rodam).
- Falha **após** migrar: restaurar em base **nova** (`restaurar-nueva <arquivo>`, nunca sobrescreve `nexit`), validar com `verificar` e só então, com a aplicação parada e decisão humana, trocar bases (renomear) ou apontar `DATABASE_URL`. Os respaldos e `globals.sql` ficam em `/var/backups/nexit` e na cópia externa.
- Nunca usar `down -v`.

## Provado em ensaio local
O script foi executado em modo `local` contra PG16 descartável (sem contêiner): recibir → planificar → respaldar → probar-restauracion → copiar-externo → migrar → sembrar → inicializar-empresa → verificar `produccion` → pruebas-post → definir-clave-runtime; recusa de `migrar` sem respaldo/restauração; subcomando e sha inválidos rejeitados; nenhum hash/senha nos logs. **Não provado:** modo `docker`, `gs://`, SSH real, IAP, Actions reais (limitação declarada no TST-002).

## Revisão de segurança ChatGPT — 09/10/2026 (não homologado)

- **Restauração fail-closed:** o script remoto foi corrigido para usar `pg_restore --exit-on-error` e interromper imediatamente em falha na restauração descartável ou recuperação para base nova. A prova compara contagens **e uma impressão estrutural de colunas, constraints, índices e funções**. Continua indispensável ensaio do modo Docker real em ambiente de teste: até lá, **não aprovar a implantação**.
- **Isolamento de leitura:** `nexit_runtime` atualmente tem `SELECT` abrangente e a RLS opcional não está ativada. Uma rota com filtro de empresa incorreto pode vazar dados. **BLOQUEADOR para disponibilização a clientes reais**: integrar e testar escopo tenant no backend e escolher política RLS real antes de homologação da aplicação. Não ligar a RLS sem preparar o contexto transacional da conexão e a função de login.
- **Permissões na VM:** usuário no grupo Docker equivale a administrador/root na máquina. Resolver mecanismo de privilégios limitados (serviço de root controlado, política sudo mínima revisada ou execução isolada), além da restrição SSH, antes de ativar segredos.
- **Verificação de regressão pendente:** estas correções foram aplicadas diretamente ao GitHub. Não houve nova execução do ensaio de restauração pelo ChatGPT e os 319 testes do Claude são anteriores a estas alterações. Claude deverá rodar **somente testes específicos** de restauração/backup e validação sintática do script; não repetir bateria completa sem necessidade.

## Primeira instalação sem Cloud Storage (fase inicial)

Exceção exclusiva para o banco `nexit` sem tabelas, views, sequências ou outros objetos persistentes de usuário. O workflow manual inclui `fase=inicial` e mantém a confirmação `IMPLANTAR-NEXIT-DB`, execução a partir de `main` e aprovação do ambiente `nexit-produccion`. O comando remoto `migrar-inicial <sha>` consulta o catálogo PostgreSQL imediatamente antes de executar NEX-001…015 e falha se detectar qualquer objeto de usuário ou `schema_migrations`.

Essa fase não envia backup externo nem usa GCS, por decisão do proprietário enquanto não há clientes ou dados comerciais. Não altera o container ou volume. **Não é mecanismo de atualização**: depois de instalar as tabelas, `migrar-inicial` fica bloqueado pela própria verificação de banco vazio. A fase `completo` permanece com backup, restauração e cópia externa obrigatórios para próximas alterações.

Ainda faltam configuração de SSH do GitHub Actions, conta de execução restrita, segredos e proteção do ambiente. O script instalado anteriormente na VM precisa ser atualizado para este commit antes de ativar a chave de deploy. Nenhum workflow foi executado nem migrations aplicadas pela publicação deste documento.
