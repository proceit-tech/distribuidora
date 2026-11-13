# AUD-NEXIT-FE-DIR-PRO-322-R05 — Parecer independente de revisão fiscal estática

> **ERRATA VINCULANTE SOBRE CONTRATO DO FORNECEDOR (25/10/2026):** a conclusão original abaixo confundiu "contrato de integração não definido" com "validação operacional não executada". **O responsável JÁ CONFIRMOU:** o JSON NEXIT envia códigos numéricos `cDepRec/cDisRec/cCiuRec` e país `cPaisRec`; a API consulta a base SIFEN, obtém as descrições e monta XML/KuDE. **Não existe pendência de perguntar/confirmar novamente esses três pontos com o fornecedor.** A auditoria de código R05 segue CONFORME ESTATICAMENTE; o fato de nenhum teste/emissão/VM/gateway ter sido executado é APENAS ausência de validação operacional, não dúvida de contrato. O defeito independente de idempotência de entrega permanece aberto em PRO-205/PRO-324. Esta errata prevalece sobre as frases históricas de “falta evidência do fornecedor” e “obter contrato” nesta AUD.


**Data:** 25/10/2026  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**SHA funcional confirmado:** `831773fb0dbb8e585f75c113295c23d6958921f8`  
**Conclusão:** **CONFORME ESTATICAMENTE NO ESCOPO FISCAL PRO-322; NÃO HOMOLOGADO EXTERNAMENTE.** Nenhum commit funcional R05 necessário; não reabrir alterações de endereço já implementadas. PRO-322 segue **In Review** por ausência de validação operacional autorizada, **não** por confirmação contratual; não declarar homologação prática/produção.

## Evidência consultada

Comparação da branch oficial contra o SHA funcional R04 mostrou **11 commits posteriores, somente documentais**, sem mudança de código. Arquivos completos consultados na branch: `lib/facturacion/payload-fe.ts`, `lib/facturacion/emision.ts`, `lib/facturacion/info-adicional.ts`, `documentacao/banco/nexit/v1/migraciones/NEX-068-facturacion-direccion-entrega.sql`; além da decisão de arquitetura ERP-first, requisitos fiscais e ordem R05.

**Não foram executados testes, lint, typecheck, build, CI manual, SQL, DB, VM, gateway nem emissão real** (protocolo do responsável).

## Matriz de conformidade estática R05

| Cenário | Parecer | Evidência |
|---|---|---|
| 1. FE nacional com endereço completo e número numérico real | OK estático | `payload-fe.ts::erroresDomicilioReceptor`, `domicilioFiscalJSON`, `construirPayloadFE`; país e três códigos no JSON |
| 2. FE nacional sem nenhum campo de domicílio, quando omissão permitida | OK estático | `domicilioFiscalJSON` devolve rua/número nulos e nenhum código geográfico; país permanece |
| 3. FE com rua e sem distrito, ou códigos sem rua | OK estático | `erroresDomicilioReceptor` rejeita parcial, `emision.ts::validarGeografiaReceptor` valida antes de reserva |
| 4. Departamento/distrito/cidade incompatíveis | OK estático | SQL de consulta parametrizada em `validarGeografiaReceptor`, hierarquia `departamento→distrito→cidade`, 422 |
| 5. B2F | OK estático | País distinto de PRY, rua obrigatória pelo validador principal, número com padrão de dígitos; sem códigos paraguaios |
| 6. Entrega diferente de domicílio fiscal | OK estático | `emision.ts::receptorDe` lê exclusivamente `direcciones_cliente` fiscal; `direccionEntregaId` é dado logístico separado |
| 7. Estoque, movimentos e texto livre | OK estático na revisão R05 | Nenhum código alterado nesta rodada; mapa fiscal separado do estoque/logística/`dInfAdic` |
| 8. Reintento com endereço logístico | **Risco operacional aberto, OUTRO DOMÍNIO** | `emision.ts::equivalente` (aprox. 665–678) compara entrega por texto de `dInfAdic`, não por ID interno imutável |

## Contratos e domínios — decisão vinculante

- **NEXIT** é ERP: gestão de comercial, clientes, estoque, depósitos, movimentações, entregas e financeiro. **SIFEN** é padrão de documento fiscal e integração; não é a finalidade nem fonte de identidade do ERP. Referência: `documentacao/definicoes/DEC-NEXIT-SEPARACAO-DOMINIOS-NEGOCIO-SIFEN-2026-10-25.md`.
- A FE nacional envia `cPaisRec`, `dDirRec`, `dNumCasRec`, `cDepRec`, `cDisRec`, `cCiuRec` conforme o endereço fiscal; se estiver ausente inteiramente e tal omissão for lícita, conservar país e omitir geografia. **Distrito obrigatório na política NEXIT** quando endereço fiscal nacional é informado. Não usar dados de entrega para inventar endereço fiscal.
- **Contrato confirmado pelo responsável:** NEXIT envia os códigos geográficos numéricos para departamento/distrito/cidade e o país como código; a API obtém as descrições na base SIFEN para XML/KuDE. Não reabrir confirmação do contrato. Como nenhuma execução de gateway/SIFEN foi autorizada, não alegar teste de integração executado ou homologação operacional.
- O risco R04 de entrega é real: dois `direccionEntregaId` diferentes mas com **mesma descrição textual** podem ser considerados equivalentes numa mesma chave de idempotência. A NEX-068 tem `documento_electronico_entregas.direccion_id` imutável, porém o papel runtime não possui leitura direta; PRO-324 (filha PRO-205) identifica a necessidade de uma solução segura **no domínio logístico**, sem subordinar o mapeamento fiscal PRO-322 a novas migrations. Essa situação **continua impedindo declarar emissão real segura**, mesmo com mapeamento fiscal estático conforme.
- `dInfAdic` é texto complementar fiscal, não identidade operacional da entrega. PRO-323 continua separada.

## Gate após auditoria R05

1. **PRO-322: revisão estática de código fiscal CONCLUÍDA; contrato funcional do fornecedor CONFIRMADO pelo responsável; In Review somente porque a validação operacional não foi executada/autorizada. Não solicitar R06 fiscal nem commits cosméticos.**
2. **PRO-205/PRO-324: incidente operacional de idempotência/entrega aberto e independente; NÃO afirmar que foi corrigido.** A aprovação de SQL/migration para uma eventual leitura segura requer instrução humana específica. Não usar comparação textual como chave.
3. **Próximo passo, quando autorizado pelo responsável:** validação operacional do fluxo completo conforme contrato JÁ confirmado; não pedir outra confirmação de JSON ao fornecedor. Sem emissão real ou testes agora.
4. **Fora de escopo:** PRO-323, NCE, stock, kardex, finanças, NEX-072, E03-A2/B/E08/E09, deploy. Não iniciar tarefa de código nova automaticamente.

Este registro **não altera código, schema nem histórico fiscal**, apenas documenta conclusão estática.
