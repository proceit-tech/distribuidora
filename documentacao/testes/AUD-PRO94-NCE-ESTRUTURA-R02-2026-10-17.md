# AUD-PRO94-NCE-ESTRUTURA-R02 — reauditoria estritamente do fixture T26

**Data:** 2026-10-17. **Revisor:** ChatGPT.  
**Commit auditado:** [`33b5c479300a0463427e7c6a3856066638147eb5`](https://github.com/proceit-tech/distribuidora/commit/33b5c479300a0463427e7c6a3856066638147eb5).  
**Branch oficial:** `feature/NEXIT-2026-001-banco-demo`. **Gestão:** [PRO-94](https://linear.app/proceit/issue/PRO-94).  
**Fonte de exigências:** `documentacao/testes/AUD-PRO94-NCE-ESTRUTURA-R01-2026-10-16.md` (achado R01-01).  
**Protocolos e contexto conferidos:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, migration `NEX-062` e helper `_helpers.sql`.

## Veredito

**AUD-PRO94-NCE-ESTRUTURA-R02 = APROVADA_ESTÁTICA, R01-01 ENCERRADO, 0 novos achados no escopo revisado.** A entrega consiste exclusivamente em alterações no `T26-nex062-nce.sql` e no progresso; **NEX-062, emissão, cálculos, FX, tabelas e código de UI/API não foram alterados**. As quatro correções estruturais da R01 continuam encerradas estaticamente. Não iniciar R03 nem solicitar ao Claude repetição de suítes antigas apenas por este encerramento.

## Evidência específica do R01-01

| Comportamento exigido | Evidência e resultado |
|---|---|
| Segunda factura com CDC próprio | [`documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql:175`](https://github.com/proceit-tech/distribuidora/blob/33b5c479300a0463427e7c6a3856066638147eb5/documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql#L175)–184: cria `v_f11` com CDC do número `0000011`; define `v_pay11 := jsonb_set(v_pay, '{DocumentosAsociados,0,dCdCDERef}', CDC de v_f11)`. `pg_temp.ok` exige CDC correspondente a v_f11 **e diferente** de `v_cdc` da primeira FE. **CORRETO.** |
| `PYG-01` deve falhar pelo total fracionário, não por outro erro | [`documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql:186`](https://github.com/proceit-tech/distribuidora/blob/33b5c479300a0463427e7c6a3856066638147eb5/documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql#L186)–193 usa `v_pay11`, captura apenas SQLSTATE `P0001`, lê `MESSAGE_TEXT` por `GET STACKED DIAGNOSTICS` e exige prefixo exato `el total de la nota de crédito debe poder guardarse exacto%`. Erros por associação, itens, saldo ou falha fabricada têm outra mensagem e reprovam. **CORRETO.** |
| Evitar falso positivo se a chamada não lançar erro | [`documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql:187`](https://github.com/proceit-tech/distribuidora/blob/33b5c479300a0463427e7c6a3856066638147eb5/documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql#L187)–192: se a função não rejeita, é lançado erro `FALLA:` que o handler repropaga. `pg_temp.ok` lança exceção quando a asserção é falsa, conforme [`documentacao/banco/nexit/v1/pruebas/_helpers.sql:3`](https://github.com/proceit-tech/distribuidora/blob/33b5c479300a0463427e7c6a3856066638147eb5/documentacao/banco/nexit/v1/pruebas/_helpers.sql#L3)–7. **CORRETO.** |
| Negativo sem consumo de numeração | [`documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql:194`](https://github.com/proceit-tech/distribuidora/blob/33b5c479300a0463427e7c6a3856066638147eb5/documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql#L194) verifica que a sequência não mudou e não há NCE da FE v_f11. **PRESENTE; NÃO EXECUTADO.** |
| `PYG-02` positivo e testes de FK posteriores | [`documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql:195`](https://github.com/proceit-tech/distribuidora/blob/33b5c479300a0463427e7c6a3856066638147eb5/documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql#L195)–204 usa `v_pay11` também no teste positivo; por inspeção, payload CDC agora coincide com v_f11 e os testes de FK têm o registro esperado disponível se PostgreSQL aceitar a emissão. **CORRETO ESTATICAMENTE.** |

## Limites da auditoria

- **O T26 não foi executado:** precisa de PostgreSQL descartável com migrations aplicadas, e o único PostgreSQL operacional **não pode receber dados sintéticos de testes**.
- Claude reportou **nenhum teste executado** nesta correção pontual, conforme instrução anterior. Auditor leu o diff e os arquivos relacionados, sem rodar SQL, TypeScript, lint, build, CI, navegador, gateway ou SIFEN.
- A correção é **estática**, não valida a execução real da NEX-062, T26 ou da emissão NCE. Dados/migração não foram aplicados na VM.
- O fluxo JSON→XML fiscal do gateway (E402 `dDesMotEmi`), motivos 3/4/8, USD/BRL, anexos e consulta automática efetiva permanecem dependências de homologação real previamente documentadas.
- A guarda de tamanho por bytes UTF-8 do JSON continua preventiva; não equivale a uma prova de limite `pg_column_size(jsonb)` em PostgreSQL, e a integridade real permanece não executada.

## Encerramento e próxima etapa

**R01-01 está ENCERRADO.** Não enviar mais tarefa ao Claude referente ao T26 sem novo defeito concreto. **PRO-94 continua In Progress** aguardando planejamento/autorização humana da aplicação segura da NEX-062 e homologação operacional, não `Done`.

**NEX-062 NÃO APLICADA · T26 NÃO EXECUTADO EM POSTGRESQL · NCE NÃO HOMOLOGADA.** Antes de qualquer implantação, exigir autorização explícita do responsável e verificar pré-condições, backup, ordem de migrations e rollback na infraestrutura operacional. Nunca executar T26 no banco operacional.
