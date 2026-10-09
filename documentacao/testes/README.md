# Testes, auditorias e homologação

Padrões: `TST-REQ-AAAA-NNN.md`, `AUD-REQ-AAAA-NNN-R01.md` (R02, R03...), `HOM-REQ-AAAA-NNN.md`.

## TST
Registrar PR/SHA, ambiente, matriz RN/CA x cenário x comando x resultado x evidência; marcar NAO_EXECUTADO quando aplicável; rastrear correção de cada achado pelo ID e commit.

## AUD — auditoria independente ChatGPT
Registrar PR/SHA exato, matriz RN/CA x arquivo/linha x teste, achados F-001 etc. com severidade BLOQUEANTE/ALTA/MEDIA/BAIXA, evidência, impacto, correção e teste de regressão; verificar regressões e achados anteriores; veredito REPROVADO/PENDENTE/APROVADO_TECNICAMENTE e nota com justificativa. Cada RNN é imutável. Não afirmar teste não executado.

## HOM — homologação humana
Registrar versão, ambiente, data, checklist manual por critério de aceite, resultado observado, evidências, decisão PENDENTE/APROVADO/REPROVADO e responsável. Somente o responsável humano aprova.
