# AUD-PRO94-NCE-ZERO-R01 — Reauditoria da implementação ZERO-01/02/03

**Data:** 2026-10-16 · **Responsável pela auditoria estática:** ChatGPT  
**SHA de código auditado:** [`10a508178a3705a00d0cd859f8336c2d7e469137`](https://github.com/proceit-tech/distribuidora/commit/10a508178a3705a00d0cd859f8336c2d7e469137)  
**Branch:** `feature/NEXIT-2026-001-banco-demo` · **Linear:** [PRO-94](https://linear.app/proceit/issue/PRO-94)  
**Ordem técnica vinculante:** `documentacao/v1/PRO-94-CORRECOES-AUD-ZERO-2026-10-16.md`  
**Análise originária:** `documentacao/testes/AUD-PRO94-NCE-ZERO-2026-10-16.md`  
**Protocolo:** `CLAUDE.md` e `documentacao/PROTOCOLO-IA.md` consultados. Progresso pertinente inspecionado.

## Veredito

**APROVADO POR INSPEÇÃO ESTÁTICA — ZERO-01/02/03 ENCERRADOS; 0 defeitos de implementação confirmados neste escopo.**  
**ZERO-04 fora da autorização, corretamente não modificado.** Não abrir outra rodada de desenvolvimento nem pedir nova suíte ao Claude unicamente em razão desta auditoria. A aprovação estática **NÃO** autoriza aplicar NEX-062 em produção nem declarar NCE homologada.

O commit alterou somente `NEX-062`, `T26-nex062-nce.sql`, `lib/facturacion/consulta-automatica.ts`, `lib/facturacion/nce.ts`, `lib/facturacion/nce.casos.ts` e `PROGRESSO-NEXIT-V1.md`. Não mudou NEX-054, assinatura de consulta manual, gateway, cálculo fiscal TS, permissões ou telas.

## Matriz de conformidade

### ZERO-01 — ALTA anterior — **ENCERRADO ESTATICAMENTE**

**Origem:** RN-20, CA-18. [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql L407`](https://github.com/proceit-tech/distribuidora/blob/10a508178a3705a00d0cd859f8336c2d7e469137/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L407), [`lib/facturacion/consulta-automatica.ts L56`](https://github.com/proceit-tech/distribuidora/blob/10a508178a3705a00d0cd859f8336c2d7e469137/lib/facturacion/consulta-automatica.ts#L56) e `lib/facturacion/shared.ts`.

- `fe_consulta_reservar` agora escolhe o `creado_por` **se** usuário existente da mesma empresa, `ACTIVO`, com `CREAR OR EDITAR` e `sucursal_en_alcance`; senão um usuário **ativo**, autorizado, mesma empresa e sucursal, selecionado deterministicamente por `creado_at,id`; senão `o_actor=NULL`.
- O serviço usa `consultarEstado(...,{flujoNce:String(f.o_tipo)==="NCE"})`, que para NCE executa a função `fe_documento_registrar_consulta_flujo_nce`. Esta exige CREAR/EDITAR, tenant, alcance e documento FE/NCE pendente; grava o ator real. Para consulta manual a função original continua exigindo EDITAR.
- Worker continua reservando só `TIPOS_CONSULTA_AUTOMATICA=["NCE"]`, com lease, `SKIP LOCKED`, backoff, ausência de reenvio e comportamento `sinActor`. Nenhum novo scheduler, nenhuma elevação de permissão de perfil.
- **Limite da evidência:** testes `nce.casos` verificam seleção SQL por inspeção textual e usam banco simulado **apenas no cenário sem ator**. T26 inclui cenários CREAR-only e bloqueado, mas **não foi executado em PostgreSQL**; credenciais, worker real sem browser e concorrência não verificados. Portanto são critérios implementados, **não homologados operacionalmente**.

### ZERO-02 — MÉDIA anterior — **ENCERRADO ESTATICAMENTE**

**Origem:** RN-13, CA-13. [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql L273`](https://github.com/proceit-tech/distribuidora/blob/10a508178a3705a00d0cd859f8336c2d7e469137/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L273), [`lib/facturacion/payload-nce.ts L238`](https://github.com/proceit-tech/distribuidora/blob/10a508178a3705a00d0cd859f8336c2d7e469137/lib/facturacion/payload-nce.ts#L238) e `lib/facturacion/monedas.ts`.

- A NEX-062 valida moeda `PYG/USD/BRL`; em PYG exige câmbio/condição ausentes e `dTotalGs=total`. Em USD/BRL exige `dTiCam` original do snapshot FE, `dCondTiCam=1` e `dTotalGs=v_total_det*v_cambio` sem arredondar, com produto de até 8 casas decimais e menos de 10^15. Inconsistência/missing => `NEX:PAYLOAD_INVALIDO`.
- Bloco fiscal executa **antes do SELECT da sequência NCE FOR UPDATE**, portanto impede reservar número em payload incorreto. Demais verificações da soma, IVA e câmbio do payload permanecem.
- `nce.casos` confere serializador USD real e contratos SQL. T26 inclui USD coerente, dTotalGs diferente, ausente, condição de câmbio diferente, câmbio alterado e moeda divergente, **sem execução no banco**.
- **Cobertura adicional ainda não demonstrada, sem defeito provado no código:** o T26 versionado não inclui teste positivo BRL separado nem casos positivos/negativos em PostgreSQL para todos os limites extremos e frações F023. SQL contém a mesma regra para `USD/BRL`. Não iniciar nova bateria local apenas por isto; fica como evidência a colher na validação autorizada. Nenhuma conformidade externa SIFEN de USD/BRL alegada.

### ZERO-03 — MÉDIA condicional anterior — **ENCERRADO ESTATICAMENTE**

**Origem:** RN-02, CA-02. [`lib/facturacion/nce.ts L223`](https://github.com/proceit-tech/distribuidora/blob/10a508178a3705a00d0cd859f8336c2d7e469137/lib/facturacion/nce.ts#L223), leitura FE em [`lib/facturacion/nce.ts L122`](https://github.com/proceit-tech/distribuidora/blob/10a508178a3705a00d0cd859f8336c2d7e469137/lib/facturacion/nce.ts#L122), SQL NCE em [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql L176`](https://github.com/proceit-tech/distribuidora/blob/10a508178a3705a00d0cd859f8336c2d7e469137/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L176).

- O `original` da listagem passa a somar somente `jsonb_array_elements(sv.payload->'Detalles')`, sendo `sv` uma **única** solicitação encontrada em `CROSS JOIN LATERAL (... ORDER BY so.version DESC LIMIT 1)`. O detalhe e a reserva SQL da NCE usam igualmente a última versão fiscal.
- Preservados filtro por empresa/usuário/sucursal, cliente, CDC aprovado, busca por número/data/CDC, saldo `original-acreditado`, `NCE pendiente`, paginação e desempate estável.
- O novo teste TypeScript que usa `[100,120]` é **uma simulação pura** da regra (seleciona último elemento), **não uma execução da consulta com PostgreSQL e duas versões**. Isto limita a evidência de execução, mas não é uma divergência lógica encontrada no SQL.

### ZERO-04 — decisão futura — **FORA DO ESCOPO, PRESERVADA**

Worker segue consultando NCE pendentes, não reconsulta `APROBADO` automaticamente para descobrir posterior `CANCELADO`. Consulta manual oficial continua possível, e estado CANCELADO libera saldo quando registrado. A cadência global e reconsulta de aprovadas são decisões separadas do responsável; não expandir nesta tarefa.

## Testes e limitações

**Reportados pelo Claude Code no commit, não executados pelo auditor:** `nce.casos` (0 falhas), `fat-e2.casos` (0 falhas), ESLint `lib/facturacion` limpo. A auditoria fez inspeção do diff e dos serviços/SQL relacionados, não reexecutou suítes, CI, `tsc`, PostgreSQL ou gateway.

**NEX-062 permanece não aplicada. T26 nunca executado em PostgreSQL. Sem execução de NCE em navegador ou gateway/SIFEN real, sem prova da ativação do worker na VM.** Os testes SQL T26 usam fixtures sintéticos e não podem ser executados no único banco operacional real. O NEXIT tem **somente um ambiente operacional**, sem staging presumido. Todas as alterações de produção, backup, scripts preflight e validação pertencem ao responsável humano, mediante autorização separada.

## Próxima ação

**Encerrar o ciclo de correções ZERO-01/02/03 sem abrir ZERO-R02**. Manter PRO-94 `In Progress — aguardando validação operacional`; não homologar NCE nem liberar automaticamente a migration. Se o responsável autorizar a etapa de aplicação, auditar **antes** o runner e os comandos/pré-verificações/backup/reversão já versionados, para execução exclusivamente humana. Nunca pedir ao Claude que repita testes já executados como condição burocrática.

**Resultado final:** `AUD-PRO94-NCE-ZERO-R01 = APROVADA_ESTATICA`; `ZERO-01/02/03 = ENCERRADOS`; `ZERO-04 = FORA_ESCOPO`; `NEX-062 = NAO_APLICADA`; `NCE = NAO_HOMOLOGADA`.
