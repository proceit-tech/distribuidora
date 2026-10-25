# NEXIT — Arquitetura multiempresa, MASTER, administradores e perfis (R01)

**Data:** 24/10/2026. **Status:** decisões fundamentais confirmadas pelo responsável; detalhes de negócio ainda em análise. **NÃO AUTORIZA DESENVOLVIMENTO.**
**Produto:** NEXIT multiempresa e multicliente; CASA MINGO é um cliente da plataforma, não define regras universais.
**Fonte:** esclarecimento expresso do responsável nesta data. **Revoga** regra universal incorreta “Usuario = Vendedor” e a autorização prematura de E2/PRO-293 contidas em `REQ-NEXIT-CASA-MINGO-E2-USUARIOS-VENDEDORES-2026-10-24.md`.
**Links de análise:** REQ-2026-002, Linear PRO-65 (plataforma), PRO-109 (usuários), PRO-110 (perfis), PRO-293 (E2), PRO-72 (vendedores).

## 1. Regras CONFIRMADAS pelo responsável

- **RN-01 — Sistema multiempresa:** a mesma plataforma atende múltiplas empresas independentes (tenants).
- **RN-02 — MASTER da plataforma:** identidade/nível de administração global reservado ao responsável. Dispõe de menu para **cadastrar empresa/cliente** e **criar seu primeiro usuário administrador interno**. MASTER não é vendedor por ser um usuário, nem é automaticamente administrador operacional dos tenants.
- **RN-03 — Bootstrap:** MASTER cadastra a empresa A e seu administrador inicial → esse administrador entra no contexto da empresa A → administra os usuários dessa empresa. Repetir, isoladamente, com empresa B.
- **RN-04 — Administração interna:** cada empresa possui seu(s) administrador(es) com capacidade de administrar usuários e atribuir perfis **somente à própria empresa**. Não altera o MASTER nem dados de empresas diferentes.
- **RN-05 — Múltiplos perfis:** cada usuário empresarial pode possuir **mais de um perfil simultâneo**, por exemplo **VENDEDOR + FATURADOR**. VENDEDOR, FATURADOR, CONTADOR e outros são papéis/perfis; não são automaticamente contas diferentes.
- **RN-06 — Sem equivalência universal:** a identidade do usuário, seus perfis, o operador que emite FE/NCE e o vendedor comercial não são conceitos necessariamente iguais. Um usuário pode não ser vendedor e pode acumular funções.
- **RN-07 — Cliente específico:** CASA MINGO pediu gerenciamento de usuários e exibição do vendedor no KuDE. Isso é requisito do cliente a conciliar com o modelo da plataforma, não regra estrutural global.

## 2. Modelo conceitual

```
NEXIT (plataforma)
  MASTER GLOBAL — cadastro e gestão de empresas
    Empresa A
      Administrador interno A — usuários e perfis só de A
        Usuário 1 → VENDEDOR + FATURADOR
        Usuário 2 → CONTADOR
        Usuário 3 → outros perfis
    Empresa B
      Administrador interno B — usuários e perfis só de B
        Usuários próprios de B
```

**Cardinalidade:** empresa 1:N usuários; usuário N:M perfis; perfil N:M permissões. Perfis administrativos de plataforma e de empresas mantêm **fronteiras de autorização distintas**. Não criar automaticamente um cadastro comercial separado de vendedor antes de decidir a regra comercial.

## 3. Estado real do GitHub — verificado, mas NÃO equivale a funcionalidade completa

- `NEX-002-seguridad.sql`: `usuarios`, `perfiles`, `permisos`, `perfil_permiso`, `usuario_perfil`, `usuario_sucursal`, `usuario_deposito`, `sesiones_usuario`, `eventos_seguridad`. A PK `usuario_perfil(empresa_id,usuario_id,perfil_id)` já suporta múltiplos perfis por usuário; FKs usam escopo de empresa.
- `lib/auth/permissions.ts`: `isPlatformAdmin` e `isCompanyAdmin` são separados; a permissão da plataforma **não** deve abrir APIs operacionais de clientes.
- `lib/navigation/menu.ts`: menu `PLATFORM_GROUP → Empresas`; estão previstos `Administración → Usuarios` e `Roles y permisos`, estes ainda fora de `V1_HREFS`.
- `app/(private)/administracion/empresas/page.tsx` e `empresas-lista.tsx`: listagem de empresas existente; **não comprova** cadastro da empresa e primeiro administrador pelo MASTER.
- `app/(private)/administracion/layout.tsx`: `guardPlatformPage()` bloqueia atualmente páginas empresariais sob a mesma árvore. Preservar a proteção da plataforma ao projetar telas da empresa.
- `app/api/auth/login/route.ts`: autenticação hoje utiliza empresa + usuário + senha e hash via PostgreSQL.
- **CUIDADO FE/NCE:** E1 atualmente compõe `Vendedor:` com nome do **emissor autenticado** no `dInfAdic`. Esta é uma implementação existente, não uma decisão comercial universal; não mudar ou declarar correta para todos antes de fechar a regra de vendedor designado.

## 4. Decisões EM ABERTO — discutir e aprovar ANTES do código

- **D-01 MASTER:** campos obrigatórios de cadastro de empresa e mecanismo seguro de criação/entrega da credencial do primeiro administrador; capacidade de acrescentar/recuperar outros admins depois.
- **D-02 perfis:** catálogo inicial de perfis (ADMIN EMPRESA, VENDEDOR, FATURADOR, CONTADOR e quais mais?) e se o administrador empresarial pode **criar/editar perfis próprios** ou apenas atribuir perfis predefinidos.
- **D-03 permissão multiperfil:** proposta para avaliação: **união das permissões permitidas** por todos os perfis atribuídos, sempre limitada por empresa, sucursal e depósito e por poderes indelegáveis. Confirmar regras de conflito/negação explícita.
- **D-04 vendedor versus emissor:** quando um faturador registra a venda de outro vendedor, o faturador escolhe um vendedor autorizado distinto? Quais usuários podem ser selecionados como vendedor? Como registrar ambos (operador e vendedor) para auditoria e KuDE? Não assumir que são iguais.
- **D-05 segurança:** limites de alteração de permissões, proteção do último admin, bloqueio/reativação, troca de senha, reset e revogação de sessões. Operação em tenant, sem escalada ao MASTER.

## 5. Sequência de análise/entrega — proposta, NÃO autorizada para Claude

1. Aprovação deste modelo e decisões D-01…D-05.
2. MASTER: alta de empresa e bootstrap do primeiro administrador.
3. Empresa: administração de usuários com **múltiplos perfis e escopos**.
4. Administração de perfis/permissões conforme catálogo/regras aprovados.
5. Regra comercial de vendedor e vinculação com FE/NCE/KuDE por decisão do responsável.
6. Auditoria técnica e homologação: A/B isoladas, master protegido, sessões e perfis atualizados, FE/NCE corretas.

## 6. Gate

**Revogado o comando anterior de E2/PRO-293.** Claude não deve alterar código, SQL, menus ou autenticação enquanto não houver aprovação explícita da análise. ChatGPT mantém requisitos, Linear, auditorias e PROGRESSO. Claude somente implementa e testa tarefas autorizadas, faz commit/push e PARA para auditoria. O responsável decide regras e homologa na VM. NEX-071 continua não aplicada, sem autorização de produção.
