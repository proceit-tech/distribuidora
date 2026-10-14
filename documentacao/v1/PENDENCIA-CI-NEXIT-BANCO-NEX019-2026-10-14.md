# Pendência de CI — workflow `nexit-banco-ci`, execução 38579656906 (14/10/2026)

**Registro separado da FAT-E1.** Não altera nem é causada pelas mudanças de Facturación (só `lib/facturacion/*` e documentação). Nenhuma migration foi alterada nem executada.

**Evidência recebida (relato do ChatGPT):** o primeiro erro ocorre em `NEX-019-codigos-empresa-ruc.sql`, linha 32, ao rodar sobre base limpa. **O log da execução não foi lido por Claude** (sem `gh`/acesso ao log); a análise abaixo é **estática** e deve ser confirmada com o log.

## Causa provável (estática)
- A linha 32 do arquivo é `END $$;`: o `psql` informa o fim do bloco `DO` em que o `RAISE EXCEPTION` ocorreu, não a linha do `RAISE`.
- O bloco (linhas 7–32) exige **exatamente duas empresas existentes** com códigos `casa_mingo`/`80003314` e `proceit`/`5469464` (`v_total <> 2` ⇒ exceção; depois verificação final). O cabeçalho do arquivo declara «migración para base ya inicializada».
- Nenhuma migration NEX-001…018 insere essas empresas (só NEX-012/015 definem *funções* que criam empresas sob demanda; `casa_mingo` só aparece na semente S-004 e `proceit` só é *consultado* em NEX-016). Numa base limpa a contagem é 0 e o bloco aborta: «se esperaban exactamente dos empresas… se encontraron 0».
- O CI (`scripts/ejecutar-pruebas.sh`, passo M1) aplica **todas** as migrações desde zero com `aplicar-migraciones.sh` (`ON_ERROR_STOP`, uma transação por migration) **antes** das sementes — logo NEX-019 não tem como passar nesse fluxo.

## Falhas decorrentes esperadas (a confirmar no log)
- M1 reporta FALLA e o runner para em NEX-019 ⇒ NEX-020 em diante (inclui NEX-047…051 de Facturación) **não são aplicadas** nessa base de CI.
- M2 (idempotência), M5 (concorrência), sementes S1–S4 e as baterias T* que dependem de tabelas posteriores falham por consequência, não por defeitos próprios.
- Não foi verificado se a falha existe desde a criação de NEX-019 (2026-10-09) ou desde outra mudança do workflow.

## Opções (nenhuma aplicada; exigem autorização específica)
1. **Não editar NEX-019** (já aplicada no banco real: mudar o arquivo muda o checksum e o runner aborta com código 4 no ambiente real).
2. Ajustar o fluxo de CI/teste para criar as duas empresas (`casa_mingo`, `proceit`, não demo, `ACTIVA`) **antes** de NEX-019 em base descartável (por exemplo, passo/semente específico do CI), preservando o runner e os checksums.
3. Alternativa: nova migration idempotente em vez de depender de NEX-019 em base limpa — só se o responsável a autorizar (impacta a ordem/numeração).
