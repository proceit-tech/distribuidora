# INFRA-2026-001 — Portainer e DistribuNex (documentação operacional)
Estado: ARQUIVOS PREPARADOS EM PR. NÃO INSTALADOS NA VM. É obrigatório testar build, imagem e integração antes de colocar em produção.

## Operação proposta
- Portainer somente no loopback da VM, porta 9443 (HTTPS), acessado por túnel SSH. Nunca abrir 9443 diretamente na VPC. Portainer possui acesso privilegiado ao Docker socket; conceder acesso somente a administradores da infraestrutura, não a desenvolvedores de aplicações.
- DistribuNex: compose separado em /srv/stacks/distribuidora, PostgreSQL próprio com volume distribunex_pgdata e sem porta 5432 publicada, rede privada e rede externa de proxy já observada. Banco inicial vazio: **NÃO EXECUTAR P001–P007 antes de reconciliação/autorização**.
- Workflow GitHub publica imagem por SHA em GHCR. Não executa deploy automático.
- A VM não precisa de checkout Git do app se usar imagens GHCR. Para imagens privadas é necessária uma credencial de leitura `read:packages` com escopo mínimo, guardada somente no host em store apropriado; alternativamente publicar imagem pública se isso for explicitamente aprovado. Não confundir `GITHUB_TOKEN` do workflow com token de leitura na VM.
- `DATABASE_URL` segue o contrato atual de `lib/db/index.ts`.
- Atenção: senha PostgreSQL inserida numa connection string deve usar URL encoding para caracteres reservados; usar senha longa URL-safe e não exibir em logs. Evitar passar a senha via linha de comando.

## Instalar APENAS o Portainer (ação explícita, após aprovação)
```bash
sudo install -d -m 0755 /srv/infrastructure/portainer
# obter arquivo compose.yml revisado deste PR em /srv/infrastructure/portainer/compose.yml
cd /srv/infrastructure/portainer
sudo docker compose config
sudo docker compose up -d
sudo docker compose ps
```
No computador local, com SSH funcional para a VM:
```bash
ssh -L 9443:127.0.0.1:9443 proceit24@34.31.253.146
```
Abrir `https://localhost:9443` (certificado inicial autoassinado). Usar sessão de túnel autenticada e criar senha forte para administrador. Se a VM usa VS Code Remote SSH, o encaminhamento de porta pela interface do VS Code é alternativa mais simples.

## Deploy DistribuNex — depois de aprovar imagem/banco/backup
1. Copiar `infra/distribunex/compose.yml` para `/srv/stacks/distribuidora/compose.yml` e `.env.example` para `.env` com permissões 0600.
2. Configurar imagem exata publicada por SHA no GHCR e credencial de leitura do package privada.
3. Validar: `docker compose config --quiet`; testar ambiente; preparar backup externo.
4. Iniciar PostgreSQL isolado e aplicação **somente após** decidir o estado do schema e migrations. Next.js existente não é uma implementação integral: várias telas usam localStorage.
5. Configurar proxy HTTPS com DNS e certificados após decisão de domínios; a rede Docker externa `proxy` já existe mas Caddy ainda não foi instalado.
6. Testar isolamento, estado após restart, restore do banco, rollback e logs.
7. Para cada sistema, usar projeto Compose, volumes e identidades de deploy próprios.

## Limites e próximos trabalhos
- Nenhum build/teste do app foi executado nesta tarefa; Dockerfile é candidato a validação por CI.
- Falta adicionar testes no CI e verificar políticas de publicação GHCR da organização.
- Falta política de backup off-VM e recuperação, proxy/HTTPS e alocação de CPU/memória.
- A VM possui 2 vCPU, cerca de 15 GiB RAM, disco ~193 GiB (inventário de 2026-10-09).
