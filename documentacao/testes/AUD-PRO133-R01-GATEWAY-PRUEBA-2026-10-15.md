# AUD-PRO133-R01 — Gateway FE de prueba / CASA MINGO

**Analista:** ChatGPT · **Implementador:** Claude Code  
**Commit auditado:** [`e70f851d850e003399fbe32143ba1357d04691dc`](https://github.com/proceit-tech/distribuidora/commit/e70f851d850e003399fbe32143ba1357d04691dc)  
**Linear:** [PRO-133](https://linear.app/proceit/issue/PRO-133) · **GitHub:** [issue #11](https://github.com/proceit-tech/distribuidora/issues/11)  
**Parecer:** **REVISÃO ESTÁTICA PARCIALMENTE CONFORME; ENTREGA OPERACIONAL INCOMPLETA; NÃO HOMOLOGAR.**

## 1. Evidências verificadas no Git

- A API `GET /api/facturas/catalogos` recebe identidade `b.empresaId` derivada da sessão e inclui `gateway: await estadoGateway(b.db,b.empresaId)`. `estadoGateway` valida linha ATIVA em `fe_gateway_config`, URL, referência e presença de variáveis no processo Node. Retorna apenas enum + mensagem, não URL, referência, RUC, senha ou token. [`app/api/facturas/catalogos/route.ts`](https://github.com/proceit-tech/distribuidora/blob/e70f851d850e003399fbe32143ba1357d04691dc/app/api/facturas/catalogos/route.ts#L16); [`lib/facturacion/envio.ts`](https://github.com/proceit-tech/distribuidora/blob/e70f851d850e003399fbe32143ba1357d04691dc/lib/facturacion/envio.ts#L42).
- `Nueva factura` impede o botão `Enviar factura` enquanto readiness é nula ou diferente de `CONFIGURADO`, inclusive carregamento; preserva prévia para revisão. O preflight no POST permanece antes da reserva fiscal. [`app/(private)/facturas/nueva/page.tsx`](https://github.com/proceit-tech/distribuidora/blob/e70f851d850e003399fbe32143ba1357d04691dc/app/(private)/facturas/nueva/page.tsx#L1255), [`lib/facturacion/envio.ts`](https://github.com/proceit-tech/distribuidora/blob/e70f851d850e003399fbe32143ba1357d04691dc/lib/facturacion/envio.ts#L164).
- `documentacao/banco/nexit/v1/scripts/configurar-gateway-prueba-NEX-047.sql` insere **somente** linha de configuração, com URL de teste já fornecida e referência lógica; não grava segredos. Insere apenas se a empresa (identificada por `codigo`) existe unicamente e ainda não possui linha. A reversão desativa sem apagar. Os scripts não foram executados em PostgreSQL.
- `app.compose.yml` realmente injeta `./app.env` via `env_file` na aplicação `nexit-app`; `compose.yml` separa `nexit-db`. Nenhuma alteração Docker no commit.
- A URL, `login`, `recepcion_de`, `consulta_de` e JSON real já constam de `documentacao/v1/REQUISITOS-FACTURACION-ELECTRONICA-API-EXTERNA-2026-10-12.md`. Não solicitar novamente. Evidência operacional: na VM consultada a `fe_gateway_config` está vazia para ambas as empresas; NEX-047, NEX-048 e NEX-060 aparecem na lista de migrations aplicadas (sem prova de checksum/execução dos testes SQL).

## 2. Matriz de achados

| ID | Severidade | Causa / evidência | Impacto | Correção / aceite |
|---|---|---|---|---|
| **R01-01** | **BLOQUEIO DE ENTREGA, não defeito do motor** | `CONFIGURACION-GATEWAY-FE-PRUEBA.md` instrui o **responsável** a preencher `app.env`, executar SQL e recriar `app`, em vez de realizar o fluxo solicitado ao Claude. O Claude confirma não ter acesso SSH/PG e não ter aplicado nada. | O usuário continua vendo HTTP 409; não existe integração operacional, apenas artefatos. | Tornar o provisionamento **um procedimento automatizado, seguro e idempotente** a executar pelo agente com acesso explicitamente concedido, sem pedir ao usuário para escrever SQL/editar segredos manualmente. Sem SSH + acesso autorizado ao cofre privado, **parar e informar a dependência real**; não afirmar concluído. É impossível configurar remotamente somente com push Git. Não inventar senha. |
| **R01-02** | **MÉDIA — diagnóstico enganoso** | `estadoGateway` engole QUALQUER exceção de query e devolve `SIN_CONFIGURAR`, inclusive erro de rede com PostgreSQL, permissão negada ou falha transitória. [`lib/facturacion/envio.ts`](https://github.com/proceit-tech/distribuidora/blob/e70f851d850e003399fbe32143ba1357d04691dc/lib/facturacion/envio.ts#L55). | A UI afirma ausência de configuração quando a consulta falhou, podendo provocar cadastro duplicado/diagnóstico incorreto. | Falhas inesperadas do banco devem resultar em **falha de carregamento/estado indisponível distinto**, com Enviar desabilitado, sem expor detalhes sensíveis; `SIN_CONFIGURAR` só se leitura bem-sucedida demonstrar que falta linha ativa. Teste de erro DB diferente de retorno vazio. |
| **R01-03** | **ALTA / pré-validação operacional** | `configurar-gateway-prueba-NEX-047.sql` e `reversion-...` instruem `psql -U nexit_app -d nexit`, sem comprovação de que `nexit_app` seja a identidade real da VM ou tenha direito INSERT/UPDATE em `fe_gateway_config`. O responsável executou leituras pela identidade `$POSTGRES_USER/$POSTGRES_DB` no contêiner. | O procedimento documentado pode falhar ao aplicar, mesmo com SQL correto; nenhuma falha foi observada porque SQL não foi executado. | Usar conexão/usuário administrativo autorizados **derivados da configuração real**, sem presumir role, e verificar privilégios antes do provisionamento. Retornar erro seguro sem mudanças; teste de integração condicionado à execução autorizada. |
| **R01-04** | **BLOQUEIO EXTERNO / credenciais** | `app.env` e segredos não estão no Git e o Claude não possui acesso à VM/cofre. O catálogo de URLs/contrato está presente, mas **credenciais privadas não estão verificáveis por esta auditoria**. | `CONFIGURADO` não significa login bem-sucedido; NEXIT não pode transmitir sem duas variáveis realmente presentes no processo de app. | Agente autorizado precisa obter os segredos de fonte privada autorizada (sem expô-los em chats/repositórios), instalar e conferir presença booleana, sem tentativa de transmissão fiscal automática. **Não presumir que apenas informar a URL elimina 409**. |

## 3. Matriz de aceite

| Teste | Critério |
|---|---|
| GT-01 | Sem `fe_gateway_config` → `SIN_CONFIGURAR` e botão Enviar desabilitado, com prévia disponível, sem reserva. |
| GT-02 | Linha ativa, URL inválida → `INVALIDA`; nenhuma credencial exposta. |
| GT-03 | Linha ativa válida, variáveis ausentes → `SIN_CREDENCIALES`, Enviar bloqueado. |
| GT-04 | Linha ativa e duas variáveis presentes → `CONFIGURADO` sem prometer resposta da API ou SIFEN. |
| GT-05 | Consulta PostgreSQL falha por exceção → **erro de carregamento/serviço indisponível**; nunca declarar ausência de configuração por suposição. |
| GT-06 | Mesmo usuário muda para outra empresa: estado isolado por sessão; não herdar configuração/credenciais da primeira. |
| GT-07 | Provisionamento autorizado insere só na empresa correta, sem apagar dados, sem alterar números/CDC/migrations, sem credenciais no PostgreSQL/Git/log. |
| GT-08 | Execução repetida/problema no meio: aborta ou converge com segurança, não substitui configuração existente sem decisão, possui reversão. |
| GT-09 | Após reiniciar somente a app, verificar presença das duas variáveis sem imprimir valores; revisar estado `CONFIGURADO` no browser; login REAL apenas em etapa autorizada. |
| GT-10 | A captura do erro 409 de `POST /api/facturas` não prova erro de API externa; na ausência de configuração não houve `recepcion_de` nem reserva fiscal nessa tentativa. |

## 4. Limites / responsáveis

- **Auditor:** verificação estática de código, Compose, SQL de provisionamento, documentação, testes sintéticos e protocolo; não acessou a VM/PG/gateway, não repetiu testes.
- **Claude informou:** suíte dirigida PRO-133 + Facturación/FAT-E2/Fase A/PRO-128/PRO-131/Puntos = 0 falhas, mutação detectada, ESLint dos arquivos tocados limpo. Não forneceu contagem; sem PostgreSQL, build, CI, gateway e navegador.
- **Responsável:** determina quem pode operar no único ambiente real. O protocolo atual proíbe Claude de acessar VM/PG e executar mudanças; a ordem de trabalho exige resolver essa incompatibilidade **com acesso legítimo e alteração expressa da autorização operacional**, não simulando execução.
- **Estado:** PRO-133 continua In Progress / correção e provisionamento pendentes; PRO-134 (13 transações) continua independente e não foi implementada. Não enviar documentos fiscais durante a mera configuração.
- **Próxima etapa programável:** corrigir R01-02 (erro DB) e R01-03 (comando/identidade), preparar provisionamento **automatizado e sigiloso**, mas sua efetiva execução continua impossível ao Claude atual sem acesso permitido e segredos acessíveis. Não exigir ao usuário repetir endpoints/JSON/Manual e não transferir-lhe instruções manuais.

**Não declarar que o gateway foi configurado ou funciona na VM.**
