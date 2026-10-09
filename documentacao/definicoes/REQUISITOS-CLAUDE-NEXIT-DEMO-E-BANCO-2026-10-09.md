# Solicitação ao Claude — Nexit: banco real e demonstração para futuros clientes
**Data:** 09/10/2026. **Solicitante:** PROCEIT. **Responsável pelo código e SQL:** Claude.
**Infraestrutura:** consultar `documentacao/infraestrutura/ESTADO-REAL-NEXIT-GOOGLE-CLOUD-2026-10-09.md` e `infra/nexit/`.

## Objetivo de negócio (aprovado)
O cliente **quer uma conta de demonstração navegável e operacional**, permitindo criar, editar e testar processos do sistema antes da contratação. A mesma solução deve servir para demonstrações de futuros clientes. NÃO remover a funcionalidade demo; corrigir sua implementação.

## LIMITAÇÃO EXPRESSA DO ESCOPO — NÃO DESENVOLVER 100% DO ERP
**Esta solicitação NÃO autoriza desenvolver, concluir ou migrar todos os módulos do DistribuNex.**
O trabalho do Claude deve estar restrito **aos menus, telas e fluxos já acordados com a PROCEIT no escopo atual** e às dependências mínimas de banco, autenticação, empresa demo e persistência necessárias para demonstrá-los. O fato de um menu existir no código ou de haver uma ideia de módulo futuro **não autoriza incluí-lo como nova entrega**.

Antes de escrever SQL ou código:
1. Levantar os **menus previamente aprovados**, citando os documentos/requisitos do projeto que sustentam cada item. Não adivinhar o escopo.
2. Apresentar tabela por menu: **aprovado no escopo atual / já implementado / incompleto / fora de escopo**, com funcionalidades de demonstração estritamente previstas.
3. Quando houver divergência ou um menu não tiver aprovação explícita, **perguntar à PROCEIT**, sem implementar por conta própria.
4. O schema e os seeds demo devem cobrir **somente** os menus aprovados e as dependências técnicas indispensáveis. Não antecipar módulos futuros, relatórios extras, integrações ou fluxo completo do ERP.
5. Demo significa permitir ao cliente testar **o que já foi contratado/priorizado**, identificando visivelmente as funções não disponíveis. Não prometer ERP completo.

## Requisitos obrigatórios
1. Inspecionar o código atual de login, API, módulos, telas, verificações de tenant, controle de sessão e dependências SQL. Mapear tabelas/colunas/FKs e migrations preexistentes; não assumir que P001–P007 são schema aprovado.
2. Propor schema PostgreSQL versionado, consistente com código atual e planejamento multiempresa. Colocar **todos os arquivos SQL** no Git (migrations ordenadas + seeds demo + README com ordem de execução, pré-requisitos, checksum/estado, rollback/restore e critérios de aceite). Não executar automaticamente na VM; submeter PR para revisão e autorização antes da primeira aplicação real.
3. Criar **empresa de demonstração** identificada inequivocamente como fictícia (ex.: `NEXIT DEMO S.A.`) e usuário demo com senha inicial gerada/definida pelo operador em meio seguro, troca/rotação e sem senha publicada em código, UI, Git, README ou logs. A atual exibição `admin/admin123` na tela pública deve ser substituída por acesso de demo seguro; discutir experiência de acesso facilitado sem expor credenciais compartilhadas.
4. Demo precisa permitir **somente os fluxos pertencentes aos menus já aprovados e efetivamente implementados** (sem pressupor que clientes, fornecedores, produtos, estoque, pedidos, vendas ou relatórios estejam todos no escopo atual), usando **persistência real PostgreSQL**, dados fictícios claramente identificados e isolamento por empresa/tenant. Impedir acesso cruzado e evitar qualquer mistura com empresas/clientes reais. Não inventar integrações fiscais reais, emissão SIFEN, pagamentos ou mensagens em nome de clientes demo.
5. Estratégia de ciclo de vida: seeds **idempotentes**, reset controlado da demo sem tocar tenants reais, limitação de acesso e ações sensíveis, auditoria, limpeza de dados pessoais e prevenção de cadastros maliciosos. Propor se haverá tenant demo compartilhado ou sessão/tenant temporário por prospect; explicitar trade-offs e pedir aprovação antes da escolha final.
6. `DEMO_MODE=false` no container de produção permanece: demo é **dado/tenant de demonstração** e não modo mock global. Rever dependência de localStorage/mocks na UI, identificar o que já funciona vs. pendente e não afirmar que telas são operacionais sem teste E2E.
7. Preservar infraestrutura existente: banco `nexit`, usuário `nexit_app`, container `nexit-db`, volume `nexit_pgdata`, rede `nexit_internal`, `nexit-app`, Caddy e `nexit.proceit.net`. Não criar segundo DB, não renomear volume, não executar `down -v`.
8. Organizar PR funcional SQL e código separadamente da PR #6 infraestrutura quando possível. Incluir ensaios em PostgreSQL de teste descartável, validação de migrations, seeds, constraints, multiempresa, usuário demo, login, permissões e reset, com relatórios verificáveis (sem alegações de testes não executados).
9. Plano de aplicação após aprovação: backup/restore externo verificado, migrações em ordem, criação da empresa demo/admin, testes, rollback e liberação controlada. Não colocar dados reais de clientes até backup.
10. Entregar arquivos **completos** prontos para substituição; português nas orientações à PROCEIT e espanhol PY nas telas.

## Critérios de aceite
- Login demo funcional com sessão persistida e controles seguros; zero senhas demonstrativas expostas na página pública.
- Demo cria e consulta dados fictícios no PostgreSQL **exclusivamente para os menus aprovados e implementados**, isolados de tenants reais, com reset seguro.
- Nenhuma funcionalidade fora do escopo previamente combinado é criada por iniciativa própria; diferenças de escopo são submetidas à PROCEIT antes de qualquer desenvolvimento.
- Toda alteração SQL versionada no Git e aprovada antes de rodar no banco `nexit`.
- Sem dependência de mocks para funcionalidades anunciadas como reais.
- Infraestrutura e dados existentes preservados, backup externo e restore comprovados antes de operação real.

**Estado inicial:** PostgreSQL `nexit` vazio (0 tabelas em public) em 09/10/2026; app Next.js responde HTTP 200 no login, mas nenhuma função foi homologada.
