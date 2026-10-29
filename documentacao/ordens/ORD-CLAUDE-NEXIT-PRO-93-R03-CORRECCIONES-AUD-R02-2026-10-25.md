# ORDEM ÚNICA PRO-93-R03 — corrigir SOMENTE a auditoria R02

**Data:** 25/10/2026. **Repo:** `proceit-tech/distribuidora`. **Branch:** `feature/NEXIT-2026-001-banco-demo`. **Último commit FUNCIONAL:** `b3bf03186ba67ca6a6451e84c9f5eaebce675b37`. Antes dele: `f675510ba19c2962aba3362b2621bdbe75b807ba`, `226e1a70f6f12350dab2d11fe5fd4633d8e2af0f`. Os commits posteriores da branch são documentais; preservá-los.

**LER PRIMEIRO**: `CLAUDE.md`, `documentacao/testes/AUD-NEXIT-PRO-93-R02-2026-10-25.md`, `documentacao/definicoes/REQ-NEXIT-PLATAFORMA-MULTIEMPRESA-PERFILES-R01-2026-10-24.md`, `documentacao/banco/nexit/v1/migraciones/NEX-002-seguridad.sql`, NEX-052, NEX-065/067/068, NEX-072/073/074 e preflight/verificação/reversões/procedimentos, `app/api/auth/login/route.ts`, `lib/auth/session.ts`, `lib/facturacion/fecha-emision.ts`, `lib/facturacion/emision.ts`, `lib/usuarios/*`, `app/api/usuarios/*`, `app/(private)/facturas/nueva/page.tsx`, componentes de usuários e guardas. **Ler arquivos COMPLETOS antes de qualquer patch**.

## 0. CORTE DE ESCOPO OBRIGATÓRIO

A correção R03 NÃO deve reconstruir a tela nem reabrir o contrato fiscal geográfico. **Tipo de transação: o responsável pediu SOMENTE O COMBO com 13 valores; já está feito, NÃO criar novos campos, regras, operações ou migrations de tipos**. Preservar combo, Establecimiento `001` primeiro, barra resumo em fluxo, Cliente alinhado, tabela `Unidad` e modal final. PRO-205/324 (entrega histórica), NCE, estoque e E03/NEX-072 fora do escopo. Nunca habilitar envio inválido removendo validações.

## 1. F001 (ALTA) — DATA +5 NÃO DEVE GERAR DOCUMENTO FORA DE 120H

Em `fecha-emision.ts` e NEX-073, Claude assumiu que `hoy+5` sempre fica <=120 horas porque a transmissão ocorre depois da criação. **FALSO:** a hora da emissão é a hora atual de Asunción, na data futura escolhida. Em `+5`, já temos EXATAMENTE 120 h na reserva, e qualquer atraso na transmissão excede 120 h. Referência FAQ oficial DNIT: https://www.dnit.gov.py/en/web/e-kuatia/preguntas-frecuentes/-/categories/2705333.

- Preservar o seletor **−30…+5** dias como requisitado, mas diferenciar opção exibida de elegibilidade de emissão. Para datas no limite, aplicar regra com MARGEM SEGURA antes da numeração; não fazer afirmação de que instantâneos futuros de +5 são sempre válidos.
- Não inventar data/hora de transmissão nem supor SLA do gateway. Não retirar validações. Corrigir mensagem em espanhol, `fecha-emision.ts`, NEX-073 e procedimento coerentemente. Escolher política conservadora bem justificada para a hora corrente/fluxo, usando diferença real quando disponível; se faltar instante de envio, falhar fechado antes de confirmar operação insegura, ou deixar `+5` selecionável mas claramente não emitível sem tratamento adicional.
- Preservar replay/huella/idempotência e documentos históricos. Não aplicar NEX-073; NEX-072 também pendente.

## 2. F002 (ALTA) — REINTENTOS DE FE HISTÓRICAS SEM VENDEDOR REGISTRADO

R02 criou `documento_electronico_vendedor` e exige vendedorId no histórico. FE antigas da empresa não têm esse vínculo. Ler `lib/facturacion/emision.ts::leerPayloadHistorico/equivalente` e `NEX-074::fe_documento_crear_fe_vendedor`.

- Não inventar o vendedor antigo como usuário emissor, não sobrescrever FE, dInfAdic, CDC, stock, entregas ou numeración; não gerar nova FE para replay.
- Projetar tratamento COMPATÍVEL dos reintentos legítimos anteriores à NEX-074. Só usar dados confiáveis persistidos; se equivalência total não puder ser provada, 409 explícito/fail-closed, com motivo correto e procedimento de tratamento, nunca 500 nem reenvio duplicado. Diferenciar legado sem vendedor de tentativa fraudulenta com outro vendedor.
- Nas FE novas, vendedorID obrigatório e imutável, com histórico + nome-snapshot e emissor distinto. Fazer mínimo diff para preservar segurança, sem migrations de backfill fictício. Apresentar matriz antigo/novo/mesmo ID/outro ID/vendedor inativo/outro tenant.
- Importante: a falha de ID de DESTINO em `equivalente` preexiste e permanece independente (PRO-205/324): não a “corrigir” por `dInfAdic` nesta ordem, nem declarar emissão real segura.

## 3. F003 (ALTA) — CREDENCIAL INICIAL DE USUÁRIO NÃO PODE FICAR SEM TROCA

`NEX-074::usr_crear` marca `debe_cambiar_contrasena=true` mas login e sessão atuais ignoram a flag. O cadastro NÃO está seguro no primeiro acesso, embora UI prometa troca.

- Criar fluxo mínimo SEGURO de troca obrigatória de senha inicial, com endpoints autenticados de escopo restrito. Até completar a troca, usuário deve ter acesso apenas ao próprio fluxo de alteração, não aos módulos empresariais. A senha inicial passa por hash existente; nova senha deve ser definida pelo próprio usuário; invalidação de sessões/versão de acesso e auditoria correspondentes.
- Reaproveitar login/sessões/autorização reais, proteção contra Cross-tenant e vazamento de credenciais; sem senha padrão em Git ou tela. Não inventar MASTER nem reset massivo ou reset de senha sem autorização.
- Se isso exigir alguma alteração SQL na NEX-074 ainda NÃO APLICADA ou uma migration aditiva adicional, VERSIONAR somente, jamais executar. Evitar bloquear contas antigas com `debe_cambiar_contrasena=false`.
- Não marcar CRUD de usuários completo enquanto o fluxo estiver ausente.

## 4. F004 (ALTA) — ÚLTIMO ADMIN SOB CONCORRÊNCIA

`usr_cambiar_estado` e `usr_asignar_perfiles` bloqueiam só o alvo; operações concomitantes com alvos distintos podem retirar dois admins simultaneamente. **Serializar por empresa as transações que possam reduzir admins ativos**, em ordem consistente de locks, verificando o invariante DEPOIS da mudança na mesma transação. Não depender apenas de `usr_otros_admins` em READ COMMITTED sem lock. Preservar autorizações tenant/admin e proteção contra autodesativação. Corrigir NEX-074 versionada e verificar coerência dos scripts de rollback/preflight (sem executar).

## 5. F005 (ALTA) — CONFIGURAÇÃO DE ALCANCE DO NOVO USUÁRIO

`usr_crear` usa defaults `alcance_sucursales=ASIGNADAS`, `alcance_depositos=ASIGNADOS` mas não cria `usuario_sucursal/usuario_deposito` nem existe editor desses vínculos na nova UI. Isso deixa novo usuário com perfil mas potencialmente sem sucursal/depósito operacional.

- Usar as relações e controles EXISTENTES do NEXIT; fornecer ao admin empresarial forma SEGURA de configurar alcance por sucursal/depósito de usuários próprios, respeitando empresa, permissão e módulo contratado onde existente. **Não atribuir TODAS/TODOS automaticamente** como workaround. Não retirar filtros `sucursal_en_alcance`.
- Ajustar a UI para mostrar alcance ou estado `sin sucursales asignadas` para não prometer usuário pronto. Se modelo adicional indispensável ainda não está decidido, relatar bloqueio estritamente do alcance e manter fail-closed sem simular que usuário está operacional.

## 6. F006/F007 — DEPLOY/MIGRATIONS e perfis legados

- **NÃO aplicar** NEX-072, NEX-073, NEX-074. Runner oficial processa todas as pendentes. Manter procedimento de bloqueio com plano seguro de verificação/autorizações; não fingir `schema_migrations` preenchido, não burlar checksum ou mover arquivo para aplicar só uma migration.
- `nex_asegurar_perfiles_estandar` cria oito perfis e pressupõe ADMIN existente. Inspecionar o modelo de alta de empresa para comprovar pré-condição, registrar no preflight a situação de empresa sem ADMIN e corrigir de maneira que **NÃO se atribua admin automaticamente a pessoa não autorizada**. Não alterar perfil MASTER.
- **Não executar SQL, testes, lint, typecheck, build, CI manual, VM, deploy, gateway nem FE real.**

## 7. Entrega obrigatória

Revisar arquivos completos ANTES/DEPOIS. Commit/push branch oficial, SHAs completos e relatório:
1. Alterações F001…F007, cada uma com cenário e arquivos/linhas (quando não corrigida, impedimento concreto, não chamar conforme).
2. Histórico FE anterior vs posterior NEX-074, idempotência/reutilização e segurança no reintento.
3. Usuários: primeiro login/troca de senha; perfis; último admin concorrente; sucursais/depósitos.
4. Contratos SQL/migrations versionados, **todos NÃO APLICADOS**, nenhuma autorização de runner/deploy.
5. Confirmação: **13 tipos no mesmo combo, SEM novo campo**, `001` primeiro, grid e dock preservados, sem outros módulos alterados.
6. Nenhum teste/SQL/build/VM/gateway/FE real executado.

**PARAR PARA AUDITORIA INDEPENDENTE DO CHATGPT. NÃO INICIAR OUTRA TAREFA.**
