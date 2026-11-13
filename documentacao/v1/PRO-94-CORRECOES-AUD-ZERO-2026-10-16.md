# PRO-94 — Ordem de implementação da auditoria NCE ZERO

**Data:** 2026-10-16. **Responsabilidades:** Claude Code implementa; ChatGPT audita o commit; responsável humano executa e valida no ambiente operacional. **Autorização do responsável nesta conversa:** programar ZERO-01, ZERO-02 e ZERO-03 e parar após push.

## Referências obrigatórias

- `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`.
- `documentacao/testes/AUD-PRO94-NCE-ZERO-2026-10-16.md` (origem dos achados).
- `documentacao/v1/REQUISITOS-NCE-V1-EMISION-2026-10-16.md` (24 RN e 23 CA).
- Branch oficial: `feature/NEXIT-2026-001-banco-demo`.

## ZERO-01 — ALTA: worker automático deve funcionar com usuário autorizado apenas a CREAR

**Causa comprovada:** a rota de emissão NCE exige `FACTURACION_ELECTRONICA.CREAR`. A função `fe_consulta_reservar` da NEX-062 seleciona `o_actor` somente entre operadores com `EDITAR`. Se a empresa tem apenas um operador ativo com `CREAR`, devolve nulo; `ejecutarLote` em `lib/facturacion/consulta-automatica.ts` salta a consulta. O registro de consulta NCE já dispõe da função `fe_documento_registrar_consulta_flujo_nce` (CREAR ou EDITAR, tenant/alcance, pendências e actor_id reais), invocável por `consultarEstado(...,{flujoNce:true})`.

**Implementar:**
1. Na **NEX-062 ainda não aplicada**, ajustar escolha de ator de `fe_consulta_reservar` para NCE. Preferir criador **ativo**, com CREAR ou EDITAR e sucursal no alcance; senão buscar outro usuário ativo, realmente autorizado e da mesma empresa/sucursal. Não presumir que a verificação de permissão valida estado ativo; conferir explicitamente.
2. No worker somente para tipo NCE, chamar `consultarEstado` com `{flujoNce:true}`, preservando lease, SKIP LOCKED, backoff, ritmo, bloqueio contra reenvio e o `sinActor` quando ninguém está autorizado. Não mudar a consulta manual com EDITAR.
3. Gravar no histórico a identidade real do usuário autorizado selecionado. Consulta automática não significa clique do humano; não inventar identidades ou ampliar permissões genericamente. Nenhum segredo do gateway em logs.

**Aceite W01–W05:** empresa A com único usuário ativo CREAR-only consulta NCE ENVIADO/SIN_CONSULTA sem browser; idem ENVIO_INDETERMINADO/PENDIENTE; criador inativo usa fallback autorizado, ou fica sinActor; usuário sem tenant/alcance não é escolhido; resultado inválido não aprova, não libera saldo nem reenvia; o worker continua apenas NCE.

**Arquivos:** `documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql`, `lib/facturacion/consulta-automatica.ts`, referência `lib/facturacion/shared.ts` e testes focados em `lib/facturacion/nce.casos.ts`/`T26-nex062-nce.sql`.

## ZERO-02 — MÉDIA: validar F023 dTotalGs em USD/BRL dentro do SQL

**Causa comprovada:** `lib/facturacion/payload-nce.ts` calcula `Subtotales[0].dTotalGs` a partir de `dTotGralOpe × dTiCam`. A NEX-062 atualmente só compara dTotalGs quando moeda = PYG. Por isso um payload USD/BRL alterado pode carregar um equivalente em guaranis incorreto e conservar o total fiscal.

**Implementar:** em `fe_documento_crear_nce`, antes de reservar número, conferir moeda PYG/USD/BRL, câmbio original imutável e `dCondTiCam` aplicável. Para USD/BRL, exigir `dTotalGs = dTotGralOpe × dTiCam` **exatamente**, respeitando a função `totalEnGuaranies` em `lib/facturacion/monedas.ts`: máximo 8 decimais e 15 dígitos inteiros para F023, sem arredondamento/truncamento. Campo omitido/nulo, limite extrapolado, cálculo inexato ou divergência => impedir reserva. Preservar PYG e os subtotalizadores IVA já corrigidos. Não pesquisar nova cotação, não converter preços e não alegar que SIFEN real homologou moeda estrangeira.

**Aceite FX01–FX04:** USD e BRL coerentes admitidos; `dTotalGs` falsificado (+1, ausente ou fora de limite), `dCondTiCam` incompatível e valor inexato bloqueados sem consumir número; alteração posterior do câmbio cadastral não muda a NCE; PYG e motivos 2/3/4/8 preservados.

**Arquivos:** NEX-062, `lib/facturacion/monedas.ts` (norma existente), `lib/facturacion/payload-nce.ts` (comparação) e T26 (novos cenários apenas versionados).

## ZERO-03 — MÉDIA condicional: saldo de listagem usa apenas o snapshot fiscal efetivo

**Causa comprovada:** `lib/facturacion/nce.ts`, função `listarFacturasElegibles`, soma `Detalles[].dTotOpeItem` de TODAS as versões da tabela `documento_electronico_solicitudes` para uma FE, enquanto `leerFacturaOriginal` e `fe_documento_crear_nce` usam `ORDER BY version DESC LIMIT 1`.

**Implementar:** escolher **uma** versão fiscal do payload da FE primeiro e só depois somar seus Detalles. Preferir subconsulta LATERAL. Manter coerência exata com leitura de detalhe e reserva SQL; preservar saldo creditado por NCE APROBADO, estado NCE pendiente, empresa/sucursal, CDC, filtros, data, paginação, contador e ordenação. Não inventar dados de produção com versões múltiplas: é risco condicional.

**Aceite L01–L04:** FE com v1=120 -> total 120; FE sintética v1=100 e v2=120 -> total original 120, não 220; descontar somente o crédito aprovado; saldo zero oculto, NCE pendente exibida mas indisponível, outros tenants inacessíveis; buscas e paginação inalteradas.

**Arquivo:** `lib/facturacion/nce.ts` e teste pontual com versões sintéticas, sem acessar PostgreSQL real.

## ZERO-04 — NÃO IMPLEMENTAR NESTA ORDEM

Detectar automaticamente cancelamento posterior de uma NCE já APROBADO pertence à política global futura de consulta/cadência. O código reconhece CANCELADO por consulta manual oficial; não ampliar worker para documentos finais, não inferir cancelamento por tempo e não inventar scheduler global.

## Invariantes e escopo excluído

Preservar FE, as NCE de motivos 2/3/4/8, uma FE por NCE, motivo fixado após primeira aprovada, saldo por ordinal, lock, idempotência, sequências FE/NCE independentes no MESMO ponto, números apenas na emissão, erro indeterminado sem reenvio cego, consulta SIFEN como única confirmação, isolamento por empresa/sucursal, auditabilidade, fiscal IVA NT13 e impossibilidade de efeitos automáticos em estoque/financeiro. Não desenvolver NDE/NRE/AFE, perfis, novas telas, cancelamento, cadência global nem alterar migrations já aplicadas.

## Testes estritamente necessários e entrega

- Antes: sincronizar branch, ler integralmente os dois protocolos, progresso PRO-94 e esta ordem; verificar estado Git e histórico; não usar contexto de memória em substituição.
- Implementar as três correções **em um ciclo**. Executar **somente testes básicos dirigidos**: ator CREAR-only/EDITAR/sucursal/sem usuário e worker em modo NCE; F023 estrangeiro válido/inválido; lista com uma e duas versões. O roteiro T26 pode ser alterado, mas **não executado na base operacional**.
- Não reexecutar suítes globais ou regressões antigas não afetadas; não rodar build/lint/tsc gerais nem CI manual. Compilação/verificação pontual somente se necessária. Registrar número de testes realmente executados, sem alegar execução SQL ou homologação.
- NEX-062 está **NÃO APLICADA**. Não acessar VM/SSH/Docker/PostgreSQL real, gateway, SIFEN ou navegador real. Não fazer deploy, não alterar `main`, não editar arquivos de auditoria e não pedir mais requisitos comerciais.
- Se mudanças operacionais exigirem ajuste de rollback/grants/T26, versionar junto e manter procedimento seguro de execução humana; jamais aplicar por IA.
- Fazer commit/push na branch oficial; atualizar `PROGRESSO-NEXIT-V1.md` só com mudanças e limitações. Informar **SHA completo**, lista concisa de arquivos alterados e verificações focadas. **PARAR para AUD-PRO94-NCE-ZERO-R01 pelo ChatGPT**. ChatGPT auditará o diff, os três achados e seus riscos, sem pedir testes repetitivos.
