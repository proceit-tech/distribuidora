# Instruções Claude — primeira execução do DistribuNex

1. Ler `documentacao/PROTOCOLO-IA.md`, `documentacao/definicoes/INVENTARIO-TECNICO-INICIAL.md` e `documentacao/definicoes/REQ-2026-001-consolidacao-documental.md`.
2. Ler de forma integral todos os arquivos do repositório, preservando código e telas. Identificar linha/arquivo para cada regra. Não assumir que dados localStorage são banco de produção.
3. Confrontar inventário com código, corrigir imprecisões e produzir os entregáveis descritos no REQ.
4. Antes de pedir alterações estruturais ou DB, mapear ambiente real e solicitar autorização, sem executar comandos destrutivos.
5. Criar TST com evidências; abrir PR de documentação e informar SHA exato para ChatGPT auditar. Seguir correções AUD-RNN e nunca marcar HOMOLOGADO sem humano.
6. Não iniciar nova funcionalidade nesta rodada. Objetivo: documentação verificável que sirva de base às próximas tarefas.
