# ORDEM PRO-93-R02 — correções objetivas após auditoria, sem refazer o que funciona

**Data:** 25/10/2026 · **Branch:** `feature/NEXIT-2026-001-banco-demo` · **Código funcional auditado:** `2da6ece8b3be24b95d0e015333d719236b5c8f14` + `03623ec4a7daf32f4f832c47f5fbc0b8112cb9fc`.  
**Ler ANTES de alterar:** `CLAUDE.md`, `documentacao/testes/AUD-NEXIT-PRO-93-R01-2026-10-25.md`, `documentacao/definicoes/REQ-NEXIT-PLATAFORMA-MULTIEMPRESA-PERFILES-R01-2026-10-24.md`, `documentacao/definicoes/REQ-NEXIT-FE-V1-ESTADOS-RESERVA-CORRECCION-2026-10-25.md`, NEX-002, NEX-065, NEX-067, NEX-068, NEX-072 e NEX-073 completas, `lib/facturacion/fecha-emision.ts`, `lib/facturacion/emision.ts`, `lib/facturacion/payload-fe.ts` e `app/(private)/facturas/nueva/page.tsx` completos. Esta ordem só entra em execução se o responsável a enviar expressamente.

## 1. O que NÃO deve ser refeito

Preservar: combo `001 — Casa central`, ponto `003` separado, **combo simples com as 13 opções D011 visíveis e selecionáveis**, nova coluna `Unidad`, grid Cliente/Entrega/botões, rodapé em fluxo, modal de prévia, cálculos, estoque/entregas, PRO-322 e seus códigos geográficos. **O responsável pediu SOMENTE o combo completo, NÃO pediu suporte fiscal operacional a todos os tipos nem novos campos.** Não reabrir implementação visual ou inventar homologação: a tela ainda não foi testada em navegador.

## 2. PRO-294 F001 — CORRIGIR REGRA DE DATA, SEM ALTERAR HISTÓRICO

A NEX-073 e `fecha-emision.ts` consideram emissão FUTURA sempre inválida para SIFEN. Essa premissa é FALSA/INCOMPLETA: a FAQ oficial DNIT diz transmissão NORMAL com assinatura→transmissão <=72h e emissão anterior OU POSTERIOR→transmissão <=120h. URL: https://www.dnit.gov.py/en/web/e-kuatia/preguntas-frecuentes/-/categories/2705333.

- Manter janela comercial selecionável −30/+5 dias PY já pedida pelo responsável. Não autorizar automaticamente qualquer data do intervalo.
- Fazer matriz objetiva por (data de emissão escolhida, hora de emissão efetiva construída, instante de assinatura, instante de transmissão) e classificar **normal** versus **extemporânea/sem suporte**. O input UI só contém DATA; o SQL atualmente usa a hora LOCAL da reserva para gerar `dFeEmiDE`; explicitar essa semântica. Validar diferença REAL de horas, não declarar falsamente que qualquer emissão posterior é proibida nem que todo −5 excede 120h. Assinatura/transmissão são executadas pelo gateway; não fabricar instantes de transmissão presumidos. O resultado da avaliação deve ser consistente em UI, servidor e NEX-073.
- Corrigir somente `lib/facturacion/fecha-emision.ts`, pontos de uso em `emision.ts`, `page.tsx`/mensagens e **a migration NEX-073 ainda NÃO APLICADA**, documentação e scripts afetados. Não alterar NEX-048/065, NCE, CDC/UUID ou uma FE já emitida. A regra que de fato dependa de dados futuros do gateway deve permanecer explícita/conservadora, porém com motivo correto, sem declarar proibição normativa inexistente.
- Reintentos devem conservar data/huella/hash e não consumir outra numeração. Se novos campos de controle forem indispensáveis, justificar e manter isolados. Qualquer codependent migration: SÓ VERSIONAR, sem aplicar.
- NÃO afirmar homologação SIFEN nem execução de testes/VM.

## 3. PRO-294 F002 — BLOQUEAR INSTALAÇÃO DESCONTROLADA DE NEX-073

**PROIBIDO executar qualquer SQL.** `NEX-072` está no Git e NÃO APLICADA, e runner oficial aplica TODAS as pendentes. Um procedimento que mande executar runner normalmente para aplicar `NEX-073` arrastaria `NEX-072` sem autorização.

- Corrigir `PROCEDIMIENTO-NEX-073.md` para PROIBIR execução até listagem formal e aprovação do responsável. Não sugerir “aplicar apenas NEX-073” por remoção de arquivo, registro falso ou bypass de checksum.
- Elaborar checklist estático de pré-condições; enumerar exatamente qual comando `--solo-listar` detecta ambas e o que bloqueia. Não executar comandos.
- Se existir mecanismo OFICIAL documentado de execução seletiva com versionamento íntegro, citar sua implementação real e demonstrar estaticamente; caso contrário, declarar **bloqueio de deploy** aguardando plano humano separado. Não modificar/aplicar NEX-072, nem a inserir num roteiro desta ordem.

## 4. VENDEDOR — CAMINHO ARQUITETURAL JÁ DEFINIDO, NÃO INVENTAR TABELA

O responsável já aprovou **NOVE PERFIS FIXOS comuns às empresas**, inclusive `Vendedor`, usuários com múltiplos perfis por empresa, e **emissor ≠ vendedor comercial**. **Modelo base escolhido para planejamento e implementação limitada:** vendedores são contas da tabela `usuarios` ATIVAS associadas ao perfil pré-existente `Vendedor` através de `usuario_perfil`. **NÃO criar tabela `vendedores` paralela.** O MASTER não é vendedor da empresa e não pode ser assumido na FE.

Como `app/(private)/vendedores` e `app/(private)/administracion/usuarios` não existem, e apenas `ADMIN`/`CONSULTA` estão operacionais nos seeds, esta correção exige base mínima do E2/PRO-293. Se esta ordem for ENVIADA pelo responsável, isso autoriza **análise e autoria de implementação mínima versionada**, sem deploy/migrations aplicadas:
- Definir códigos internos fixos dos nove perfis aprovados para todas as empresas no cadastro/snapshot a partir do modelo de `perfiles` existente, sem permitir ao admin empresarial criar/editar perfis. **Não inventar poderes/menus não decididos para perfis**: permissões que não estejam especificadas devem continuar negadas e marcadas como pendentes da matriz de autorização; o admin tem funções nos módulos contratados da própria empresa conforme regra RN-16, sem acesso MASTER.
- Implementar com contratos reais `Administración → Usuarios` (gestão de contas por empresa, perfil Vendedor atribuído com segurança) e `Maestros → Vendedores` (listagem/alta por fluxo de usuários, edição/inativação), menu `V1_HREFS` apenas quando páginas + APIs + guardas ACL tiverem suporte, e endpoint tenant-scoped de vendedores ativos para o combo de `Nueva factura`.
- Campo `Vendedor *` seleciona ID, sem autoselecionar emissor. Validação server-side `empresa_id`, `estado=ACTIVO`, perfil `Vendedor` ativo e alcance que o modelo realmente oferece; dados estruturados `vendedorId` + nome-snapshot comercial no documento, separados de `creado_por/usuario_emisor`. Auditoria histórica da seleção, reintento e revisão sem modificar FE emitida. Não usar texto editável `dInfAdic` como identidade. PRO-323: inserir de forma assistida linha `Vendedor: ...` visível, editável e revisada sem duplicá-la, sem apagar observações e entrega.
- **Higiene de segurança:** criação de senha/token não inventados nem exibidos; isolamento A/B; respeito a módulo contratado; proteção do último admin/alterações de perfis; revogação de sessões e auditoria conforme controles EXISTENTES. Se algum desses guardas não puder ser implementado com segurança sem decisão de autorização, **parar EXCLUSIVAMENTE este bloco com arquivo/linha e impacto**, não substituir o vendedor automaticamente pelo emissor nem fingir menu funcional.
- Não alterar NCE, STOCK, SQL fiscal histórico, nem criar cadastro paralelo ou permissões de sistema SUPERADMIN para usuários de empresa.

## 5. Tipo de transacción — ESCOPO FECHADO PELO RESPONSÁVEL (RETIFICAÇÃO)

**Solicitação exata: COLOCAR O COMBO COMPLETO COM OS 13 TIPOS. SOMENTE ISSO.**
- O catálogo oficial 1–13 já existe em `CATALOGO_TIPOS_TRANSACCION` e a entrega `03623ec4a7daf32f4f832c47f5fbc0b8112cb9fc` já exibe as 13 opções selecionáveis no MESMO campo. **Requisito de interface atendido estaticamente; não reimplementar.**
- **NÃO** criar outros campos, modais, telas, operações fiscais adicionais, fluxos de autofactura, regras por tipo, migrations ou catálogos paralelos a partir desse pedido.
- A seleção do combo não demonstra que a FE ordinária possa transmitir todos os treze tipos. **Preservar o backend e as validações existentes**, sem habilitar emissão inválida nem interpretar isso como uma solicitação de novos fluxos fiscais.
- O fato de o backend atual aceitar 1–4 e rejeitar 5–13 fica apenas como **limitação técnica conhecida**, não como um novo requisito de desenvolvimento do responsável, nem motivo para pedir campos adicionais. Não exigir "emitir os 13" nem "implementar campos para 5–13" nesta ordem.
- Não voltar a perguntar ao responsável se ele pediu só exibição ou operação completa: **ele ratificou que era somente o combo completo e nenhum campo extra**.

## 6. Entrega e gate

Antes de editar, ler cada arquivo inteiro. Fazer SOMENTE patches comprovadamente necessários, revisá-los inteiros ao fim. Separar commits por responsabilidade, publicar SHAs completos e PARAR para auditoria ChatGPT. Entregar matriz:
- F001 data: correção de norma + impacto em UI/API/SQL prévia/huella;
- F002 procedimento runner: bloqueio seguro NEX-072;
- F003 vendedor: modelagem usuários/perfis, rotas/APIs persistência/tenant, migrations versionadas e o que permanece pendente por segurança; nenhuma tela inexistente apontada como pronta;
- Tipo de transacción: 13 opções visíveis/selecionáveis JÁ entregues no mesmo combo, sem novas funções ou campos; nenhuma alteração adicional requerida;
- UX: CSS atualizado, **não homologado visualmente**.

**Nunca executar testes, lint, typecheck, build, CI, SQL, PostgreSQL, migration, VM, deploy, gateway, SIFEN, FE real. Não marcar Linear Done. Não iniciar E03, NEX-072, PRO-205/324, NCE.**
