# AUD-NEXIT-CM-E6-A / PRO-325 — R02 — Reauditoria fornecedor sem código
**Data:** 26/10/2026. **Repositório:** proceit-tech/distribuidora. **Branch:** `feature/NEXIT-2026-001-banco-demo`.
**Commit funcional reaudidato:** `7884a2f671b82e449a1b73cb9b61778c8f9d312a`. Anterior: `7e4fabf15864897bb55bb350f57ec20a21a54fad`.
**Parecer:** **CORREÇÃO R01-F001 CONFORME ESTATICAMENTE; E6-A APROVADA NA AUDITORIA ESTÁTICA DE CÓDIGO, NÃO HOMOLOGADA NO AMBIENTE.** Nenhuma ordem corretiva E6-A ativa após esta R02.
**Fontes normativas:** `documentacao/definicoes/REQ-NEXIT-CM-E6-COMPRAS-ENTRADAS-2026-10-26.md`; `documentacao/testes/AUD-NEXIT-CM-E6-A-PRO-325-R01-2026-10-26.md`; `documentacao/ordens/ORD-CLAUDE-NEXIT-E6-A-R01-F001-PROVEEDOR-CODIGO-2026-10-26.md`.

## 1. Evidência diretamente revisada no GitHub
- O commit altera **exatamente 7 arquivos**: `documentacao/banco/nexit/v1/migraciones/NEX-075-compras-entradas.sql`, `documentacao/banco/nexit/v1/docs/PROCEDIMIENTO-NEX-075.md`, `lib/compras/entradas.ts`, `lib/compras/entradas-cliente.ts`, `app/(private)/compras/entradas/page.tsx`, `app/(private)/compras/entradas/[id]/page.tsx` e `app/(private)/compras/entradas/nueva/page.tsx`.
- Comparado o diff completo ao R01 e revistos o contrato NEX-006 `proveedores.codigo text` (NULL permitido), a NEX-075 corrigida e referências a `pv.codigo`, `proveedorCodigo`, `proveedor_nombre`/documento e motivo no motor oficial NEX-014. A tabela de movimentos NEX-009 armazena motivo `text`, sem limite fixo contraditório constatado.
- O relatório externo Claude «Desenvolver Compras → Entradas (E6-A)» não substitui a leitura da implementação e não foi usado como evidência de execução real.

## 2. R01-F001 — RESOLVIDA
A incompatibilidade original era `proveedores.codigo` nullable em NEX-006 × `compras_entradas.proveedor_codigo NOT NULL` em NEX-075, que indevidamente rejeitava fornecedor legítimo sem código interno.

A implementação revisada:
1. Torna `compras_entradas.proveedor_codigo text` opcional e restringe o CHECK para só exigir código não vazio QUANDO não nulo; continua exigindo `proveedor_nombre` e `proveedor_documento` reais não vazios e vínculo FK por empresa/proveedor.
2. Em `compras_entrada_registrar`, normaliza código `NULL`/branco para `v_prov_cod=NULL`. Obtém documento verdadeiro de tipo/número/DV e identificador legível `v_prov_id = COALESCE(código, razón social + documento)`, inclusive na mensagem de fornecedor bloqueado.
3. Passa ao motor a descrição `Compras → Entradas · proveedor ` + identificador real, nunca `NULL` pela ausência de código. Grava `v_prov_cod`, `pv.razon_social`, `v_prov_doc` no snapshot histórico da entrada; NÃO modifica o mestre do fornecedor nem gera código fictício.
4. `lib/compras/entradas.ts` fornece `COALESCE(proveedor_codigo,'')` no DTO e normalização do catálogo; o helper `conCodigo` exibe código apenas quando presente.
5. As três telas (lista/detalhe/nueva) usam `conCodigo`, sem renderizar `null`, `undefined` ou separador `·` isolado para código ausente. `PROCEDIMIENTO-NEX-075.md` foi atualizado com cenário C-08 para homologação posterior.
6. Elegibilidade de fornecedor permanece exatamente: mesma empresa, **ativo e não bloqueado**. Não há exigência adicional de `estado_homologacion`, conta bancária ou preenchimento de código.
7. Motivo, valor de custo, dados fiscais e moeda do movimento não receberam mudança funcional além do texto de identificação do fornecedor.

## 3. Ausência de regressão observável no diff
- Sem alteração em `lib/compras/entradas-intento.ts` ou protocolo K1/ACK, endpoints/API, NEX-014 ou NEX-066: reserva durável anterior, transação única `compras_entrada_ejecutar` (movimento, linhas, custos, `compras_entradas`, intenção CONFIRMADA), e tratamento de resultado indeterminado permanecem como auditados em R01.
- NEX-075 é a mesma migração **AINDA NÃO APLICADA** segundo a entrega e sem evidência de instalação no PG; não se criou NEX-076. O arquivo SQL foi corrigido na origem, sem ALTER posterior nem retrocompatibilidade inventada.
- Sem alteração de menu, módulo de reportes, E5 Ventas, perfis/permissões, fornecedor mestre ou integrador fiscal. `COMPRAS.VER/CREAR` continuam no catálogo da migration sem concessão automática a nenhum perfil; operação prevista inicialmente para administrador de empresa, condicionado ao acesso vigente.
- Nada altera o bloqueio de operação em ambiente sem NEX-075 (503), conforme código E6-A original. **Não se verificou a resposta 503 em rede**.

## 4. Limites e necessidade de homologação
**Nenhuma execução foi feita por ChatGPT ou Claude conforme o relato:** tests, lint, typecheck, build, CI, SQL, PostgreSQL, VM, Docker, aplicação de migration, navegador, verificações de grants ou deploy. A auditoria só certifica consistência de código/diff SQL.

Antes da operação no NEXIT real, o responsável deve autorizar processo de backup, revisar `preflight-NEX-075.sql`, confirmar compatibilidade e pendências do runner, aplicar NEX-075 por procedimento oficial SE autorizado, rodar verificação pós-migração, e homologar no navegador e banco:
- C-01: 3 produtos em uma entrada = 1 movimento, 3 linhas, custos/stock corretos.
- C-02: terceira linha com falha = rollback total, sem metadados órfãos.
- C-03: timeout/double click/refresh = mesma K1/movimento e ACK; sem duplicidade.
- C-04: fornecedor outra empresa, depósito fora do escopo, permissões insuficientes = bloqueio efetivo.
- C-05: quantidade/custo/lote/serie inválidos; explícito custo 0 vs custo ausente.
- C-06: anulação oficial do movimento, histórico preservado.
- C-07: movimentações COMPRA manuais/Recepciones DEMO excluídas.
- **C-08:** fornecedor ativo não bloqueado sem código (NULL e branco) registra corretamente, código snapshot NULL e apresentação razão social + documento.
- Conferir grant da role operacional, menu desktop, limites dos campos e custo/moneda base.

## 5. Governança e encaminhamento
- **E6-A / PRO-325:** código **CONFORME ESTATICAMENTE**; manter **In Review**, não Done/homologado, porque NEX-075 continua sem aplicação confirmada e o fluxo não foi testado no ambiente.
- **Nenhuma ordem corretiva E6-A ativa**. Claude não deve reexecutar E6-A/R01.
- **E6-B / PRO-297:** fonte e modelo foram **definidos no código**, mas **não há confirmação de fonte instalada e entradas reais registradas**; permanece `Todo` e `blockedBy PRO-325`. Não emitir ordem de implementação ou alegar dados disponíveis antes do gate de homologação/autorização. O futuro Informe de Compras reportará apenas entradas reais de Compras → Entradas a custo, sem IVA fiscal.
- PRO-108 `Todo`; PRO-115 `Todo`; E5/PRO-296 `In Review` até aceite operacional.
- ChatGPT atualiza GitHub/Linear e audita; Claude somente desenvolve quando houver ordem específica. **Sem SQL/VM/migrations/deploy por IA.**
