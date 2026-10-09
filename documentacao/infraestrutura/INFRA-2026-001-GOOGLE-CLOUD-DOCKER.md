# INFRA-2026-001 — Google Cloud: uma VM, stacks Docker independentes

Status: ARQUITETURA DEFINIDA PELO RESPONSÁVEL PROCEIT; implementação e inspeção de VM ainda pendentes.
Data: 2026-10-09

## Decisão
Uma só máquina virtual Google Compute Engine executa Docker Engine. Cada sistema PROCEIT é **independente**, com:
- Repositório Git próprio e processo de build/deploy próprio;
- Stack Docker Compose por sistema, contendo container da aplicação web/API e **instância/container PostgreSQL próprios** quando o sistema exigir banco;
- Banco, usuário e senha próprios, sem compartilhamento de credenciais;
- Rede interna Docker isolada e volumes de dados persistentes independentes;
- Variáveis de ambiente, domínio/subdomínio, logs, ciclo de atualizações e backups independentes;
- Equipes de desenvolvimento com acesso somente aos seus repositórios/artefatos e permissões estritamente necessárias, sem acesso a código ou bancos de outros sistemas.

Exemplos de stacks (nomes ilustrativos):
`/srv/distribuidora`, `/srv/academia`, `/srv/proceit-site`, cada um com `compose.yml`, `.env` seguro, aplicação, volumes e procedimento de backup.

## Elementos compartilhados mínimos
- A VM, kernel, Docker Engine e seus recursos CPU/RAM/SSD;
- Um proxy reverso na borda (Caddy/Nginx/Traefik, a definir) para distribuir HTTPS por domínio; **o proxy compartilhado não une bancos, repositórios nem redes privadas das aplicações**.
- Monitoramento de infraestrutura e políticas de backup externo, com isolamento de destinos e segredos por sistema.

## Política de isolamento e operação
1. Cada stack tem projeto Compose único (nome explícito), rede privada própria e portas internas não publicadas na Internet. Somente web/proxy devem receber tráfego público autorizado.
2. Containers PostgreSQL não publicam `5432` externamente; aplicação usa endereço interno da própria rede.
3. Volumes com nomes por projeto, persistentes, com backup consistente e restauração ensaiada; cópia externa à VM.
4. Credenciais não entram no Git. Pessoal com SSH/root no host pode, por natureza, acessar qualquer container, volume e repositório local: isolamento de Docker **não equivale a isolamento de host/administrador**. Contas de deploy e repositórios devem ter escopo limitado; não fornecer Docker socket/grupo docker a desenvolvedores isolados.
5. Deploy isolado: atualizar um sistema sem recriar ou reiniciar os demais; pipeline CI/CD próprio por repositório; migração de DB exclusiva daquele sistema.
6. Políticas de limites de recursos, monitoramento, recuperação e atualização do host são compartilhadas; dimensionar a VM para a soma das cargas. Falha da VM afeta todos os sistemas: há risco de indisponibilidade comum.
7. Não recriar volumes ou bancos existentes. Fazer inventário somente leitura da VM antes de instalar/configurar o que falta.

## Requisitos antes de instalação
- Inventário autorizado do estado real da VM: OS, `docker version`, `docker compose version`, `docker ps`, redes, volumes, diretórios e portas, serviços em execução; sem imprimir credenciais.
- Escolher reverse proxy, domínios, mecanismo de entrega GitHub→VM (pull autorizado ou imagens de registry), estratégia de backup off-VM, limites de recursos e monitoramento.
- Arquivos completos por stack: Dockerfile, compose.yml, .env.example, instruções de deploy/rollback/backup, testes de health e isolamento.
- Aplicação de mudanças somente após revisão, testes e aprovação operacional.

## Repartição do trabalho
- ChatGPT: documentação, arquitetura e artefatos de infraestrutura, auditoria.
- Claude: priorizado para alterações de código funcional do sistema usando o contexto versionado no GitHub.
- Responsável PROCEIT: autorização de ações na VM e implantação.
