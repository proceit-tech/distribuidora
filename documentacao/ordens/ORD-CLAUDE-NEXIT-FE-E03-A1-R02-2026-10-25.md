# ORD-CLAUDE-NEXIT-FE-E03-A1-R02 — ÚNICA ORDEM VIGENTE PARA CLAUDE

> **HISTÓRICO SUPERADO — SUBSTITUÍDO POR [ORD-E03-A1-R03](documentacao/ordens/ORD-CLAUDE-NEXIT-FE-E03-A1-R03-2026-10-25.md) (25/10/2026).** Claude entregou `c8af2dd7107346c1de954ebedda5d2b0c3d83936`. [AUD-R02](../testes/AUD-NEXIT-FE-E03-A1-PRO-321-R02-2026-10-25.md): F001/F003 fechados estaticamente; F002/F004 permanecem bloqueantes. A única ordem vigente é corrigir F002-R02 e F004-R02 no mesmo SQL NEX-072, commit/push, parar. NEX-072 não aplicada, outros módulos bloqueados.

**25/10/2026.** **Issue:** PRO-321 (filha PRO-312). **Branch:** `feature/NEXIT-2026-001-banco-demo` do `proceit-tech/distribuidora`.
**Origem:** Claude entregou SQL E03-A1 em `4b1ba2d21ea89924ab4eddade8fe9d4e0d690372` (+427 linhas, um arquivo, não aplicado).
**Auditoria ChatGPT NÃO CONFORME:** [AUD-NEXIT-FE-E03-A1-PRO-321-R01](../testes/AUD-NEXIT-FE-E03-A1-PRO-321-R01-2026-10-25.md). Ler **inteiramente** antes de modificar.
**Especificação:** [E03-R03](../definicoes/ESPEC-NEXIT-FE-E03-HISTORICO-REPROCESSAMENTOS-R03-2026-10-25.md).

## ORDEM DE EXECUÇÃO

Corrigir **SOMENTE** o arquivo completo `documentacao/banco/nexit/v1/migraciones/NEX-072-facturacion-e03-evidencia-envios.sql`. Não criar outra migration; ela continua NÃO APLICADA. **Quatro achados e NENHUM escopo adicional:**

1. **E03-A1-F001 ALTA — `NO_TRANSMITIDO` não pode preceder POST na mesma operação.** Uma vez registrado, bloquear `POST_INTENTADO`, `HTTP_RESPUESTA`, `ERROR_TRANSMISION` ou segundo `NO_TRANSMITIDO`; `CIERRE` compatível com falha de autenticação pode ocorrer. Se já houve POST, `NO_TRANSMITIDO` deve ser sempre proibido. Conferir unicidade e serialização por documento.
2. **E03-A1-F002 ALTA — `CIERRE OK` com evidência comprovável.** Antes de delegar ao `fe_documento_registrar_envio`, validar ligação entre POST numerado, sua saída efetiva, última resposta e `p_resultado/p_http/p_estado_local` do fechamento. Um HTTP antigo de erro NÃO valida sucesso de POST posterior sem resposta. Rejeitar estados contraditórios; manter `ENVIO_INDETERMINADO` quando houve POST com saída desconhecida e permitir `NO_TRANSMITIDO` quando comprovado. **Não alterar gateway, NEX-050/054 ou semântica fiscal SIFEN.**
3. **E03-A1-F003 MÉDIA bloqueante — SHA/bytes de resposta não verificados.** Para resposta completa, computar checksum e tamanho do **objeto saneado persistido** (representação explicitada e consistente); não alegar que o hash `jsonb::text` prova os bytes HTTP originais. Para truncamentos, guardar sinalização explícita e não considerar hash informado pelo chamador como evidência auditável verificada. Evitar quebrar contrato de limite de 64 KiB e garantir compatibilidade entre colunas/evento.
4. **E03-A1-F004 ALTA — tokens em valores JSON.** Além de nomes de chave sensíveis, proteger contra `Authorization: Bearer ...`, `Bearer ...` e outros segredos visíveis em VALORES da resposta saneada ou mensagens aninhadas. Nunca persistir nem imprimir token/segredo, mesmo em erros; usar rejeição ou sanitização SQL claramente documentada e defesas coerentes com `gateway.ts`. Sem alterar componentes TypeScript nesta etapa.

**Preservar exatamente o que está conforme:** tabela única append-only, FKs por empresa/documento/versão/operacao/intento, `UNIQUE` composto adicional da tabela legada, indexação por histórico, três wrappers `fe_e03_*`, grants com helper descoberto pela NEX-052; dados de histórico legado não recriados. Não substituir `nex_aplicar_grants_runtime`; a NEX-052 já o faz dinamicamente. Não modificar número/CDC, estado SIFEN, mecanismos de envio, editor, estoque, API, UI nem outras migrations.

**PROIBIÇÕES ABSOLUTAS:** NÃO criar nem executar testes, lint, typecheck, build, CI manual, banco/SQL/VM, Docker, gateway, SIFEN, migrações, browser, deploy; não ler ou manipular credenciais. Claude não modifica `CLAUDE.md`, Linear, `PROGRESSO-NEXIT-V1.md`, especificação ou documentos de auditoria.

**ENTREGA:** revisar o arquivo inteiro após correções, fazer commit/push SOMENTE da NEX-072 na branch oficial, informar o SHA completo e responder sucintamente: `E03-A1-R02 corrigida; migration SQL NÃO aplicada. Testes não executados (ordem do responsável). Bloqueios: ... SHA: ... Parado para auditoria ChatGPT.`

**GATE:** E03-A2/E03-B, E08/E09 e todas as demais etapas seguem BLOQUEADAS até nova auditoria ChatGPT da R02. Esta ordem sobrepõe a primeira E03-A1 e todos os gates anteriores apenas quanto às quatro correções acima.
