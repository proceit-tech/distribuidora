# AUD-NEXIT-MOVIMIENTOS-DESKTOP-R04 — Reauditoria independente PRO-185 / PRO-186

**Data:** 19/10/2026. **Auditor:** ChatGPT. **Sistema:** NEXIT/DistribuNex V1, exclusivamente desktop.  
**Branch:** `feature/NEXIT-2026-001-banco-demo`, repositório `proceit-tech/distribuidora`.  
**Commit funcional auditado e HEAD funcional conferido:** `7aa11bb1a905a63c1e3508a4c178c54b892c144e` ([GitHub](https://github.com/proceit-tech/distribuidora/commit/7aa11bb1a905a63c1e3508a4c178c54b892c144e)).  
**Revisão predecessora:** [AUD-NEXIT-MOVIMIENTOS-DESKTOP-R03](./AUD-NEXIT-MOVIMIENTOS-DESKTOP-R03-2026-10-19.md).

## 1. Parecer

**PRO-185 / MOV-R03-01 (ALTA): CONFORME ESTATICAMENTE.**  
**PRO-186 / MOV-R03-02 (MÉDIA): CONFORME ESTATICAMENTE.**

O commit resolve os dois resíduos dentro do ciclo de vida de uma **mesma instância ativa da tela**: preserva chave/payload depois de retries rejeitados com resultado histórico indeterminado e impede efeitos visuais de conclusão assíncrona quando a instância foi desmontada. **Nenhum defeito corretivo novo ALTA/MÉDIA foi comprovado no diff delimitado.**

**Não homologado operacionalmente:** nenhuma prova de comportamento real em React/browser, servidor HTTP integrado, PostgreSQL ou VM. O menu **Movimientos/PRO-79 continua In Review** e ainda possui **PRO-183/MOV-D02** e **PRO-184/MOV-D03** abertas (ambas MÉDIA). A tarefa **PRO-182/MOV-D01** e os resíduos PRO-185/186 obtêm conformidade **estática dirigida**, não Done/homologação.

**Risco residual declarado e retido (MOV-O07; sem defeito novo automaticamente aberto):** como a intenção/K1 mora apenas no `useRef` da tela, sair ou recarregar em `INDETERMINADO` elimina K1 e um retorno à tela permite nova intenção K2. A navegação interna avisa para verificar Movimientos; isso mitiga erro humano, mas **não preserva idempotência entre instâncias**. A própria aprovação da saída é uma decisão expressa do operador, distinta de um retry dentro da tela. Não inferir duplicação efetiva nem exigir persistência de chave sem decisão funcional/segurança do responsável. Considerar em homologação humana antes de declarar proteção abrangente contra duplicidade em abandono/reload/back do navegador.

## 2. Escopo e fontes auditadas

Leitura no GitHub das normas `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, partes relevantes de `PROGRESSO-NEXIT-V1.md`, [AUD-R03](./AUD-NEXIT-MOVIMIENTOS-DESKTOP-R03-2026-10-19.md), diff exato e código atual de:
- `lib/movimientos/intento.ts` (máquina de intenção; `huboIndeterminado`; `aplicarResultadoSiVigente`);
- `lib/movimientos/cliente-api.ts` (classificador de resposta HTTP);
- `app/(private)/movimientos/nuevo/page.tsx` (guardas, fieldset, submit, validade da instância, saída e retry);
- `lib/movimientos/intento.casos.ts` (testes novos, helper real + servidor simulado);
- `lib/ui/proteger-cambios.ts` (verificação da integração do guarda de saída; **não alterado**);
- `app/api/movimientos/route.ts`, `lib/movimientos/shared.ts` e contrato SQL NEX-014 como fontes invariantes (**não alterados**).

Apenas cinco arquivos alterados pelo commit: `lib/movimientos/intento.ts`, `lib/movimientos/cliente-api.ts`, `app/(private)/movimientos/nuevo/page.tsx`, `lib/movimientos/intento.casos.ts`, `PROGRESSO-NEXIT-V1.md`. Não houve alteração em APIs, SQL/migrations, ACL, lista/detalhe, anulação, Stock nem outros menus.

## 3. Matriz de aceites

| Critério da R03 | Evidência no código | Veredito |
| --- | --- | --- |
| 185: preservar K1 após primeira indeterminação e retry 401/403/400/409 | `intento.ts:22,66–96`: `huboIndeterminado=true` após resposta indeterminada; `RECHAZADO` subsequente retorna `INDETERMINADO` com mensagem de risco, mantém `intento`, chave e `actual.payload` | **CONFORME** |
| 185: retry com mesmo payload, jamais regenerar K2 implicitamente | `intento.ts:67–77,82–96`: `intento ??` usa intenção existente; `deps.enviar({ ...actual.payload, claveIdempotencia: actual.clave })`; nenhum reset se rejeição posterior a indeterminado | **CONFORME** |
| 185: 4xx ilegível não significa não registro | `cliente-api.ts:84–95`: exige corpo JSON `error` não vazio; JSON inválido/sem error → `INDETERMINADO` | **CONFORME** |
| 185: primeira rejeição conclusiva permanece corrigível | `intento.ts:82–94`: RECHAZADO sem `huboIndeterminado` encerra intenção; validação/permite nova chave | **CONFORME, dependente do contrato da API** |
| 185: 409 não implica sucesso | `cliente-api.ts:84–95` e `intento.ts:82–96`: status 409 nunca vira OK por si só; após incerteza mantém K1 | **CONFORME** |
| 186: desmonte invalida tela | `nuevo/page.tsx:51–63`: `vigente.current` fica false no cleanup de efeito de montagem | **CONFORME ESTATICAMENTE** |
| 186: resposta tardia não navega nem altera estado após unmount | `nuevo/page.tsx:162–172` delega a `aplicarResultadoSiVigente`; `intento.ts:35–46` consulta validade **antes** de chamar `alEstado`, `alRegistrar` e `alMensaje` | **CONFORME ESTATICAMENTE** |
| 186: tela vigente mantém confirmação | `nuevo/page.tsx:164–172`: `alRegistrar` mantém `router.push('/movimientos?ok=...')` e refresh, condicionado à validade | **CONFORME ESTATICAMENTE** |
| 186: saída não afirma reversão/cancelamento | `nuevo/page.tsx:91–94,175–181`, `intento.ts:48–50` e `lib/ui/proteger-cambios.ts`: aviso e confirmação existentes preservados | **CONFORME NO DIFF** |
| Escopo e regressões | Commit não toca `app/api/movimientos`, `lib/movimientos/shared.ts`, `NEX-014`, `PRO-183/184`, `STK-D03` | **CONFORME** |

## 4. Testes e limitações

**Claude reportou, não reexecutados pelo ChatGPT:** 30 verificações de `intento` / 0 falhas (18 novas), 20 verificações Movimientos / 0 falhas, 275 Stock–Reposición / 0 falhas = **325/0**. Tipos pontuais reportados OK; ESLint pontual **sem erro, com 1 aviso** no arquivo `lib/movimientos/intento.casos.ts:240` por argumento `m` não usado. Aviso de lint não é bloqueio dos aceites, corrigível pontualmente em rodada autorizada futura. A asserção histórica `cruzados` sobre NEX-053 permanece preexistente e fora do diff.

Os novos testes exercitam `crearControlRegistro` e `registrarMovimientoResultado` reais com promessas e HTTP `Response` simulado, inclusive 401, 403, 400, 409 após COMMIT/resposta perdida e recuperação `repetido`; também simulam `vigente=true/false` e chamadas do helper `aplicarResultadoSiVigente`. A ligação real da página é verificada **estruturalmente por regex**, não por renderização React, eventos de navegador, navegação App Router ou ciclo real do efeito. Servidor SQL é simulado, não PostgreSQL.

**Auditor executou ZERO testes**, sem VM/Docker, SQL, migration, banco real, browser, HTTP integrado, CI manual, suíte global ou deploy. Não atribuir a esses testes garantia de inexistência de duplicações operacionais em recarga, logout, navegação Back ou abandono.

## 5. Continuidade

- **PRO-185 e PRO-186:** conformes na revisão estática, **In Review**, sem Done/homologação.
- **PRO-182/MOV-D01:** conforme estaticamente **para o ciclo de uma instância ativa**, com **MOV-O07** como limitação operacional expressa; tarefa principal continua In Review e não homologada.
- **PRO-79 Movimientos:** In Review, não homologado, **PRO-183/MOV-D02** (stale historial) e **PRO-184/MOV-D03** (virada de data) continuam Todo/pendentes e exigem suas próprias correções autorizadas.
- **STK-D03/PRO-179:** investigação separada; não iniciada.
- Não implementar persistência/reconciliação K1, PRO-183/184 ou outro menu sem autorização expressa. Se avançar para PRO-183, tomar por base esta AUD-R04 e o código HEAD, realizar testes focais e reauditoria independente da alteração subsequente.
