# AUD-PRO133-UI-R02 — Configuración de Facturación Electrónica

**Auditor independente:** ChatGPT · **Implementador:** Claude Code  
**Commit auditado:** [`011c6082925c552474b4685c0f87ec504bfb450f`](https://github.com/proceit-tech/distribuidora/commit/011c6082925c552474b4685c0f87ec504bfb450f) · **Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Auditoria anterior:** `documentacao/testes/AUD-PRO133-UI-R01-GATEWAY-CONFIGURACION-2026-10-16.md`  
**Linear:** [PRO-133](https://linear.app/proceit/issue/PRO-133) · **GitHub:** [issue #11](https://github.com/proceit-tech/distribuidora/issues/11)

## Decisão

**ACEITO NA AUDITORIA ESTÁTICA dos achados UI-R01-01 e UI-R01-02.** Nenhuma correção de código adicional exigida nesses dois itens. **NÃO HOMOLOGADO / NÃO IMPLANTADO:** NEX-061 e T25 não executados em PostgreSQL, nem navegador, Compose/VM ou login real no gateway. Não confundir aceite de código com autorização irrestrita para implantar. PRO-133 permanece **In Progress**, pendente de instalação e validação pelo responsável na única VM real.

## 1. Confronto dos achados R01

| Achado | Veredito | Evidência | Critério cumprido |
|---|---|---|---|
| **UI-R01-01 — modo exclusivo de banco** | **CONFORME** | [`lib/facturacion/gateway.ts`](https://github.com/proceit-tech/distribuidora/blob/011c6082925c552474b4685c0f87ec504bfb450f/lib/facturacion/gateway.ts#L43); [`lib/facturacion/gateway-credenciales.ts`](https://github.com/proceit-tech/distribuidora/blob/011c6082925c552474b4685c0f87ec504bfb450f/lib/facturacion/gateway-credenciales.ts#L19); [`lib/facturacion/envio.ts`](https://github.com/proceit-tech/distribuidora/blob/011c6082925c552474b4685c0f87ec504bfb450f/lib/facturacion/envio.ts#L48) | `credencialesDe` devolve credenciais da própria configuração só em `NEXIT_DB`; se ausentes, `null`. `leerCredenciales` rejeita explicitamente referência `NEXIT_DB`. `estadoGateway` retorna `SIN_CREDENCIALES` para empresa sem credenciais. `configuracionGateway` lança 409 antes de criar documento/reservar número. `consultarEstado` e envio não autenticam sem credencial. Referências legadas diferentes continuam em variáveis de ambiente. |
| **UI-R01-02 — resultado de teste vinculado à versão** | **CONFORME** | [`lib/facturacion/configuracion-gateway.ts`](https://github.com/proceit-tech/distribuidora/blob/011c6082925c552474b4685c0f87ec504bfb450f/lib/facturacion/configuracion-gateway.ts#L142); [`documentacao/banco/nexit/v1/migraciones/NEX-061-facturacion-gateway-credenciales-empresa.sql`](https://github.com/proceit-tech/distribuidora/blob/011c6082925c552474b4685c0f87ec504bfb450f/documentacao/banco/nexit/v1/migraciones/NEX-061-facturacion-gateway-credenciales-empresa.sql#L199); [`app/(private)/configuracion/facturacion-electronica/page.tsx`](https://github.com/proceit-tech/distribuidora/blob/011c6082925c552474b4685c0f87ec504bfb450f/app/(private)/configuracion/facturacion-electronica/page.tsx#L105) | O backend lê `o_version` na mesma leitura das credenciais, antes de `POST /api/login`; ao registrar, passa essa versão. `fe_gateway_prueba_registrar(...,p_version)` executa `UPDATE ... WHERE credenciales_version=p_version` e devolve booleano de aplicação. Se a senha for substituída durante o teste, o resultado é `ANTERIORES`, não modifica `ultima_prueba_*` da versão nova. A interface informa que o resultado antigo não foi aplicado. |
| **Compatibilidade da reversão NEX-061** | **CONFORME NO TEXTO** | [`documentacao/banco/nexit/v1/scripts/reversion-NEX-061.sql`](https://github.com/proceit-tech/distribuidora/blob/011c6082925c552474b4685c0f87ec504bfb450f/documentacao/banco/nexit/v1/scripts/reversion-NEX-061.sql#L24) | `DROP FUNCTION fe_gateway_prueba_registrar(uuid, uuid, text, boolean, integer)` acompanha a assinatura nova, não depende de assinatura obsoleta. |
| **Testes da correção** | **COBERTURA ADEQUADA EM SIMULAÇÃO** | [`lib/facturacion/configuracion-gateway.casos.ts`](https://github.com/proceit-tech/distribuidora/blob/011c6082925c552474b4685c0f87ec504bfb450f/lib/facturacion/configuracion-gateway.casos.ts#L254); [`documentacao/banco/nexit/v1/pruebas/T25-nex061-gateway-config.sql`](https://github.com/proceit-tech/distribuidora/blob/011c6082925c552474b4685c0f87ec504bfb450f/documentacao/banco/nexit/v1/pruebas/T25-nex061-gateway-config.sql#L51) | Casos no mock de dois tenants e env `NEXIT_DB` proibido, preflight 409, legado preservado, corrida versão 1→2, erro/timeout mesma versão; T25 de versão antiga/nova registrada. O SQL T25 é artefato preparado, não teste executado. |

## 2. Revisão de impacto

- **Sem alterações em payload, cálculos, CDC ou sequência SIFEN** neste commit; o preflight anterior à emissão permanece.
- **Sem redistribuição de segredos**: a senha da API continua armazenada sem criptografia, por decisão expressa do responsável, em tabela apartada, sem leitura direta para o papel de runtime da aplicação, e só acessível por rotinas SQL permissionadas do servidor. Não emitir senha nem token em rotas, auditoria ou console.
- **Prontidão não é prova de login**: `CONFIGURADO` significa presença de linha ativa e credenciais, e `ultima_prueba_estado='OK'` (se ocorrer) refere-se somente à versão testada, não à autorização de envio fiscal. A prova chama exclusivamente `POST /api/login`.
- **Limitação estética não bloqueante:** a tela pode apresentar `Conexión correcta` como título do resultado antigo `ANTERIORES` quando o gateway respondeu OK; o texto explícito diz que é de credenciais antigas e não foi aplicado. Não atribuir esse sucesso à configuração vigente. Validar entendimento na conferência funcional do responsável, sem abrir correção automática por esse detalhe.

## 3. Evidência inexistente que impede homologação

1. **NEX-061 nunca aplicada no banco real; T25 não executado**, pois o Claude trabalha sem PostgreSQL. A revisão por leitura não comprova DDL/SECURITY DEFINER/grants/trigger no motor de BD. T25 cria empresas e dados sintéticos: **não rodar no PostgreSQL operacional**. Não inventar staging que não existe.
2. Nenhum navegador real conferiu navegação/estados visuais; nenhum login real à API de teste ocorreu; nenhum envio foi autorizado ou realizado.
3. Claude informou suíte `configuracion-gateway.casos` e regressões Facturación/FAT-E2/Fase A/PRO-128/PRO-131/Puntos com **0 falhas**, ESLint/tsc dirigidos limpos; mutações de fallback/versão detectadas após reaplicar alterações locais. **O auditor não reexecutou** essas suítes nem simulações; relatório reproduz fielmente os limites.
4. **O contrato de acesso é definitivo:** Claude e ChatGPT jamais entram na VM. O responsável humano executa somente scripts/runner já versionados e auditados no terminal da VM; não escreve SQL nem edita `app.env` para cadastrar credenciais, que devem ser informadas depois pela interface administrativa.

## 4. Próxima etapa operacional, distinta de código

- Antes de tocar na única VM: confirmar por leitura status real do Git/branch, schema_migrations, disponibilidade de backup consistente, identidade de contêiner/usuário PostgreSQL e escopo exato do runner; não presumir credenciais de role ou clone Git na pasta Compose. **Não executar comandos aqui**.
- Após autorização expressa do responsável para atualizar: executar via procedimento canônico documentado `documentacao/infra/PROCEDIMENTO-ATUALIZACAO-AMBIENTE-NEXIT-VM.md` a **NEX-061 somente se pendente**, com backup e validação dos objetos/grants sem expor dados; depois atualizar a aplicação. Não executar T25 em produção, não reaplicar migrations anteriores, não afetar a numeração.
- Na UI, o administrador da empresa cadastra RUC e senha (sem os enviar ao chat/Git), usa **Guardar** e **Probar conexión**, confirma status por empresa e que `Nueva factura` apresenta prontidão coerente. **Não emitir factura** até autorização específica para teste fiscal.
- Registrar evidências de tela/execução sanitizadas, checksum/schema_migrations, resultado da prova e aceite humano, sem alegar HOMOLOGADO antecipadamente.

**Conclusão:** `AUD-PRO133-UI-R02 = ACEITO_ESTATICAMENTE; PRO-133 = PENDENTE_OPERACIONAL`. **Não solicitar UI-R03 nem nova implementação por padrão.** Priorizar aplicação/validação humana para finalmente disponibilizar configuração via UI.
