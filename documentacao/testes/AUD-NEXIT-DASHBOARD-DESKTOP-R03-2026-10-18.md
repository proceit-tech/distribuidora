# AUD-NEXIT-DASHBOARD-DESKTOP-R03 — Reauditoria independente do commit b1242a5

**Data:** 18/10/2026. **Sistema exclusivo:** NEXIT / ERP DistribuNex — `proceit-tech/distribuidora`. **Branch:** `feature/NEXIT-2026-001-banco-demo`. **SHA funcional auditado:** `b1242a53777e99708171218f3970ed79dad3ccf8`. **HEAD da branch igual ao SHA ao iniciar a reauditoria.**  
**Auditor:** ChatGPT; Claude apenas implementou. **Parecer:** **APROVADAS TECNICAMENTE EM INSPEÇÃO ESTÁTICA as implementações F-DASH-02 a F-DASH-08, com ressalvas de validação abaixo.** **F-DASH-01 ALTA permanece EM ABERTO por decisão funcional C24.** Dashboard completo **NÃO HOMOLOGADO / NÃO ENCERRADO**, sem autorização automática para Clientes ou C04.

## 1. Evidências lidas

- `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, `AUD-NEXIT-DASHBOARD-DESKTOP-R02-2026-10-18.md`; metadados e alterações do commit `b1242a5`, arquivo a arquivo.
- Conferidos código efetivo em `lib/dashboard/shared.ts`, `carga.ts`, `formato.ts`, `dashboard.casos.ts`, `app/(private)/dashboard/page.tsx`, layout, `app/api/dashboard/route.ts`, `types/dashboard.ts`, `lib/navigation/menu.ts`, `app/page.tsx`, login/formulário, sidebar, app-shell, shell-context, tipos, rota `/sin-acceso`, `lib/movimientos/historial.ts`, guardas de destinos e utilitário decimal compartilhado. Contrastada a matriz de aceite com testes e a política de acesso dos depósitos.
- Foram **19 arquivos alterados**, incluindo progresso e executor de testes. Comparação de SHA `b1242a5..HEAD`: idêntica na inspeção. Não foram executados por ChatGPT testes TypeScript, SQL/PostgreSQL, navegador, VM, Docker, deploy, build ou CI; resultados de 46 + 271 testes são **relato do Claude não reproduzido pelo auditor**.

## 2. Matriz de reauditoria

| Achado R02 | Implementação e evidência | Revisão R03 |
|---|---|---|
| **F-DASH-06 ALTA** alcance integral | `shared.ts` importa `ALCANCE_MOVIMIENTO` real de `lib/movimientos/historial.ts` e rebaseia placeholder de usuário para `$5` no gráfico e `$3` na lista; `mp=[empresa,deps,desde,hasta,usuarioId]`, lista `[empresa,deps,usuarioId]`; filtro selecionado OR origem/destino separado da autorização integral | **CONFORME ESTATICAMENTE**: evita expor transferência A→B a ator só A sem mudar motor/ACL; SQL executável real NÃO testado, testes verificam consulta/predicado/params em mock |
| **F-DASH-02 MÉDIA** contexto assíncrono | `crearCargaDashboard` token de pedido e invalidate no cleanup; tela guarda `{clave,datos}` e `{clave,mensaje}` e só exibe chave período+depósito atual, mantendo opções separadas; `Actualizar` continua disponível | **CONFORME ESTATICAMENTE**: A→B, erro e ordem atrasada controlados. Não houve navegador |
| **F-DASH-03 MÉDIA** situação anulação | Lista SQL devolve `situacion` por `m.anula_a_id` / `m.estado`, número fiscal do movimento anulado (JOIN mesma empresa), render mostra registrado, anulado ou inverso com vínculo; gráfico conserva `MOV_OK` | **CONFORME ESTATICAMENTE**: exibição do histórico sem confundir com números efetivos; browser pendente |
| **F-DASH-04 MÉDIA** landing por papel | `resolverInicio` usa plataforma→Empresas; `puedeVerDashboard`; senão primeira rota dos módulos V1 com permissão, senão `/sin-acceso`; raiz, login, layout, shell, sidebar usam a decisão; página sem-acesso não redireciona; checados guards de Stock/Movimientos/Reportes/Productos/Listas/Config/NCE | **CONFORME ESTATICAMENTE** no contrato de permissões, sem grants extras; não houve navegação real |
| **F-DASH-05 MÉDIA** links | Três CTAs dependem de `datos?.acceso.movimientos`/`stock`, derivados de `hasPermission` na rota; alertas só retornam com STOCK.VER | **CONFORME ESTATICAMENTE**: sem expansão de acesso |
| **F-DASH-07 MÉDIA** dinheiro | PostgreSQL `coalesce(sum(valor_total),0)::text`, DTO com `valor:string`; `redondearDecimalTexto` usa `BigInt` para arredondar com precisão e utilitário `formatearDecimalTexto` para es-PY; nenhum `float8` no valor monetário do KPI | **CONFORME ESTATICAMENTE**: arredondamentos e números grandes reportados em testes focais; outras quantidades continuam number porque não eram escopo monetário |
| **F-DASH-08 BAIXA** whitelist | Rota valida `esPeriodo(periodoTexto)`; serviço repete validação; `hasOwnProperty.call(PERIODOS,v)` rejeita `constructor`/`__proto__` | **CONFORME ESTATICAMENTE**: entradas inválidas → 400; sem nova API alternativa |
| **F-DASH-01 ALTA** catálogo/stock | Query de produtos global com `LEFT JOIN stock_saldos` inalterada explicitamente, decisão C24 não localizada | **PENDENTE COM BLOQUEIO NEGOCIAL**, preservada intencionalmente. Não aplicar INNER JOIN, não inventar decisão |

## 3. Observações R03 — integridade do relato de testes (não são defeitos funcionais comprovados)

**OBS-R03-01 — BAIXA (evidência de lint parcialmente contraditória):** o relatório do Claude afirma que `app-shell.tsx` e `sidebar.tsx` «não foram tocados» ao relatar erros antigos `setState` em effect. **Ambos foram alterados pelo próprio commit b1242a5** (passagem de props de início/permissões e link condicional). Os **trechos acusados podem ser anteriores à implementação**, mas isso é diferente de afirmar que os **arquivos** não foram modificados. Assim, não classificar o ESLint do conjunto integral de arquivos alterados como comprovadamente limpo. Registrar corretamente: erros preexistentes nessas linhas, porém dois arquivos tocados ainda apresentam erros; relatar a saída com precisão no próximo ciclo de desenvolvimento. Não pedir alteração de lógica pré-existente `useEffect` sem regressão concreta ou autorização do responsável.

**OBS-R03-02 — cobertura do SQL: o teste direcionado de F-DASH-06, em `dashboard.casos.ts`, capta e compara `SQL` e parâmetros enviados por DB falsa**. Ele NÃO executa transferência A→B num PostgreSQL, nem mede autorização via `usuario_puede_deposito` da VM. Este limite está descrito no código e no relatório e não invalida o raciocínio estático, mas impede alegar teste integrado A/B ou homologação. O responsável verifica funcionamento no único ambiente real, em data autorizada, com credenciais/testes sem exposição de outros tenants.

**OBS-R03-03 — precisão e UI:** testes `montoTexto` usam casos >2^53 e arredondamento, mas navegador não foi usado para conferir transbordamento visual de número extremo. Não alterar CSS desktop por suposição nem exigir celular. A política fiscal de PYG é preservada na apresentação de 0 casas.

## 4. Preservações verificadas

- F-DASH-01 não foi tocada; `stock_saldos` próprio, empresa, custo e depósito permanecem isolados pela regra anterior. Nenhuma mudança de origem de saldo/valorização, motor de Movimientos, migrations, gateways, emissão FE/NCE, C01/C02/C03/C04 ou escopo de celular.
- Nenhuma correção nova de aplicação é demandada por esta R03 para os achados F-DASH-02…08 com base no código inspecionado. A observação sobre lint não autoriza refatorar módulos transversais por iniciativa do Claude.

## 5. Estado e próximo passo

**Parecer da entrega b1242a5:** sete achados (F-DASH-02…08) **RESOLVIDOS ESTATICAMENTE**; nenhuma falha ALTA/MÉDIA NOVA comprovada no diff; **F-DASH-01 ALTA ainda ABERTA, aguardando decisão funcional sobre a visibilidade de produtos sem saldo nos depósitos acessíveis**. **Não atribuir nota 10/10 nem homologação ao Dashboard.**

Responsabilidades: ChatGPT faz auditoria; Claude desenvolve apenas tarefa expressamente autorizada; responsável decide C24/F-DASH-01 e executa eventual verificação operacional no único ambiente. **Não iniciar Clientes ou C04 automaticamente.**

**Testes auditados (informados pelo Claude, não executados pelo ChatGPT):** `dashboard.casos.ts` 46 / 0 falhas, regressão `facturacion` 271 / 0 falhas; verificações de lint/tipos focalizadas relatadas, ressalva OBS-R03-01. Nenhum SQL/PG/browser/VM/CI geral nesta rodada.