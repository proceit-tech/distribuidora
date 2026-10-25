# AUD-NEXIT — usuários: correção A01/A02 (R02) — 25/10/2026

**Commit funcional examinado:** `5d098f8d742a1f00a3246b5c06d0f7bf611f3c95`, pai `288fd9640ee2aad39070d39760eacf1c69ce3582`, branch `feature/NEXIT-2026-001-banco-demo`. **Veredito: A01 CONFORME ESTATICAMENTE; A02 PARCIALMENTE CORRIGIDO quanto à linguagem de prova.** Auditoria apenas de leitura: sem testes, SQL, migrations, runner, VM, gateway, deploy ou FE real.

## A01 — Conforme estaticamente

O diff comprova a mesma regra em:
- `lib/usuarios/validacion.ts`: `/^[0-9]{1,10}$/` e rejeição `/^0+$/`;
- `NEX-074-usuarios-perfiles-vendedores.sql`: `usuarios_ci_chk` e `usr_exigir_datos` com `1–10` e não todos zeros;
- `lib/usuarios/servidor.ts` e `PROCEDIMIENTO-NEX-074.md`: mensagens alinhadas.

Preservados CI como texto, pontos/espaços normalizados sem converter a número, zeros iniciais, índice único por empresa, CI/telefone legados NULL. O valor de um dígito deixou de ser rejeitado arbitrariamente. Não houve mudança em perfis, vendedor da FE, D011 ou outras funções.

## A02 — SQL de verificação deixou de ser constante mas não demonstra proveniência do valor

`documentacao/banco/nexit/v1/scripts/verificar-NEX-074.sql` agora realiza consulta real:
```sql
NOT EXISTS (
 SELECT 1 FROM public.usuarios u
 WHERE (u.ci IS NOT NULL OR u.telefono IS NOT NULL)
   AND NOT EXISTS (
     SELECT 1 FROM public.eventos_seguridad e
     WHERE e.empresa_id = u.empresa_id
       AND e.tipo IN ('USUARIO_CREADO','USUARIO_ACTUALIZADO')
       AND e.detalle ->> 'usuario_id' = u.id::text
   )
)
```
**Ela comprova apenas a correlação de usuários preenchidos com algum evento registrado de criação/atualização.** O evento não contém CI/telefone (por privacidade), não informa que esses campos foram preenchidos naquele instante e pode ser anterior a uma mudança não rastreada. Portanto, a label atual `la migración no inventó ninguno` atribui ao controle uma prova que não possui.

**Correção residual MÍNIMA, DOCUMENTAL/DE VERIFICAÇÃO:**
1. Mudar o nome do controle para sua propriedade realmente testada, por exemplo `usuarios con CI/teléfono tienen evento de creación o actualización`, **sem afirmar que o resultado prova ausência de backfill**. Não é necessária nenhuma alteração na validação TypeScript, APIs ou migrations por este ponto.
2. Para fundamentar ausência de backfill histórico, a evidência estática é que a NEX-074 executa `ALTER TABLE public.usuarios ADD COLUMN ci text, ADD COLUMN telefono text` sem `DEFAULT` nem preenchimento de usuários legados. `usr_crear` e `usr_actualizar` apenas DEFINEM funções que modificarão dados depois, quando explicitamente chamadas. Se for necessário controle pós-aplicação realmente executável, verificar apenas propriedades observáveis (existência/tipo/nullable das duas colunas) ou usar baseline de estado antes/depois coletada por operador autorizado. Nunca apresentar consulta por eventos como auditoria temporal de valores de CI/telefone.
3. Não refazer cadastro, não incluir triggers, backfills ou novos campos. Não executar `verificar` neste mandato.

## Gate

A migration **NEX-074 ainda não aplicada** e o runner normal pode tentar NEX-072 e NEX-073 também pendentes, sem autorização. Nenhum teste ou deploy efetuado; interface ainda não homologada operacionalmente.

**Status recomendado:** aceitar A01 como resolvido; A02 **controle real mas rótulo excessivo**, requer somente precisão na descrição de sua evidência. Nada justifica reconstruir usuários/vendedores, mexer em `Nueva factura`, no combo de 13 tipos ou no problema independente de reintentos legados.


## Encerramento final A01/A02 — commit 2745f8c (25/10/2026)

**Commit confirmado:** `2745f8c963bd51f37204033b53705632ff9e5e99`, pai `48177092152f579bf37625fd95315358441f6e5b`, HEAD funcional/documental no momento da revisão. O diff contém **somente** `documentacao/banco/nexit/v1/scripts/verificar-NEX-074.sql`; a única linha alterada é o **rótulo** do controle que consulta `eventos_seguridad`. A consulta SQL não mudou.

**Decisão:** **A01 E A02 CONFORMES NA AUDITORIA ESTÁTICA**. A02 deixou de afirmar que os eventos comprovam ausência de backfill histórico: agora declara corretamente que todo usuário com `ci` ou `telefono` preenchidos tem ao menos um evento `USUARIO_CREADO`/`USUARIO_ACTUALIZADO`, e ressalva que isso não prova QUANDO houve preenchimento nem descarta sozinho uma migração retrospectiva. Esta afirmação corresponde à condição `NOT EXISTS (... NOT EXISTS(evento))` existente.

**Nenhum patch adicional solicitado.** Não prolongar A01/A02, não inventar nova exigência para usuário/vendedor, não reabrir o combo D011 nem lógica de reintentos de FE. O cumprimento é **estático apenas**: NEX-072, NEX-073 e NEX-074 permanecem **NÃO APLICADAS**, sem testes/lint/typecheck/build/SQL/runner/VM/gateway/emissão/deploy/homologação humana. PRO-293/109/72 continuam com os demais gates não resolvidos, não marcá-los Done por estas duas correções.
