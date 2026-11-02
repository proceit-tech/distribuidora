# AUD-NEXIT-CM-E6-A / PRO-325 — R01 — Auditoria independente de Compras → Entradas
**Data:** 26/10/2026. **Repositório:** proceit-tech/distribuidora. **Branch:** feature/NEXIT-2026-001-banco-demo.
**Commit funcional:** `7e4fabf15864897bb55bb350f57ec20a21a54fad` (HEAD confirmado no início da auditoria). **Escopo:** 22 arquivos, 21 novos e alteração apenas de `lib/navigation/menu.ts` entre os existentes; NEX-075 versionada e **NÃO APLICADA**.
**Resultado:** **R01 COM RESSALVA BLOQUEANTE F001 DE COMPATIBILIDADE COM FORNECEDOR SEM CÓDIGO.** Estrutura de atomicidade e recuperação conforme à leitura estática, mas a entrega não deve ser declarada homologada/pronta para aplicação de NEX-075 até correção e reauditoria.
**Norma:** `documentacao/definicoes/REQ-NEXIT-CM-E6-COMPRAS-ENTRADAS-2026-10-26.md` e `documentacao/ordens/ORD-CLAUDE-NEXIT-E6-A-COMPRAS-ENTRADAS-2026-10-26.md`.

## 1. Evidência e arquivos analisados
- Commit, árvore e branch diretamente no GitHub. Novos arquivos: telas `app/(private)/compras/entradas/{page.tsx,layout.tsx,nueva/*,[id]/page.tsx}`, endpoints `app/api/compras/entradas/{route.ts,[id]/route.ts,intencion/*}`, serviços `lib/compras/entradas{,-http,-reglas,-intento,-cliente}.ts`, `NEX-075-compras-entradas.sql`, docs, scripts preflight/verificar/reversion. `lib/navigation/menu.ts` teve o único arquivo pré-existente alterado.
- Lidos serviços inteiros e migration integral; inspecionadas páginas, helpers cliente, permissões e menu, NEX-006 proveedores (fonte chave da falha), NEX-014 motor oficial, NEX-066 idempotência, NEX-052 grants. **Não** executados testes, lint, build, PostgreSQL, SQL, VM, Docker, browser, migration, deploy ou operações fiscais.
- Documento externo `E6-A-compras-entradas-7e4fabf.md` não consta como artefato analisado no GitHub; relato do Claude não substitui código e migration inspecionados.

## 2. Resultados conformes estáticos
1. **Um movimento com N linhas:** `compras_entrada_registrar` constrói `v_lineas` e chama uma só vez `inventario_registrar_movimiento` ENTRADA/COMPRA NEX-014; não grava diretamente `stock_saldos` ou `inventario_costos`.
2. **Atomicidade:** `compras_entrada_ejecutar` executa subtransação de validação + motor + `compras_entradas` + estado CONFIRMADA. `lib/compras/entradas.ts::ejecutarEntrada` envolve chamada em BEGIN/COMMIT. Exceção antes da confirmação reverte toda a transação, sem vínculo parcial; rejeições definitivas só após rollback da subtransação.
3. **Idempotência/recuperação:** tabela `compras_entradas_intenciones` tem índice único de pendente por operador, snapshot+huella, K1 e ACK, reserva em COMMIT distinto, lock por empresa/usuário e `FOR UPDATE` na execução; tentativa repetida após confirmação retorna mesma entrada. Resposta indeterminada conserva intenção; sem confirmação não libera nova. A própria NEX-066 original fica intacta.
4. **Provedor e tenant:** SQL verifica `empresa_id`, fornecedor ativo e não bloqueado `FOR SHARE` e vínculo por FK composta a fornecedor e movimento. Documento de compras não se deduz de movimentos COMPRA manuais ou Recepciones DEMO.
5. **Permissões:** endpoints COMPRAS.VER/CREAR, motor MOVIMIENTOS.CREAR e `usuario_puede_deposito` em SQL, consultas limitadas por empresa/depósito; migração cria catálogo COMPRAS sem atribuir a perfis. É uma escolha consciente de **mínimo privilégio**, não uma falha: operação inicialmente restrita ao administrador de empresa (dependendo de seus privilégios de módulo). Nenhuma criação de novo perfil.
6. **UI:** Compras → Entradas habilitado e apenas esse subitem na allowlist V1; listado, nueva, detalhe com custo e estado, múltiplos produtos, estoque por lote, bloqueio de unidade identificada, mensagens sem IVA fiscal; sem implementar E6-B.
7. **Migração/operacional:** NEX-075 versionada, grants de runtime mínimos, trigger de imutabilidade, scripts de preflight/verificação/reversão; `moduloDisponible` retorna 503 se schema não está instalado. A aplicação real desses scripts **não foi verificada**.

## 3. F001 — BLOQUEANTE: fornecedor sem código interno permitido pela NEX-006
**Evidência verificável:**
- `documentacao/banco/nexit/v1/migraciones/NEX-006-proveedores.sql` define `proveedores.codigo text` **sem NOT NULL**; as regras de elegibilidade de E6-A só exigem fornecedor **ativo e não bloqueado** e pertencente à empresa.
- `NEX-075-compras-entradas.sql` na tabela `compras_entradas`: `proveedor_codigo text NOT NULL` (aprox. linha 52), `compras_entradas_snapshot_chk` exige `length(btrim(proveedor_codigo))>0` (~69).
- `compras_entrada_registrar` seleciona `pv.codigo` sem proibir `NULL` (~261) e insere diretamente `pv.codigo` (~362), gerando falha `NOT NULL`/CHECK para fornecedor legítimo sem código. No mesmo procedimento, `'Compras → Entradas · proveedor ' || pv.codigo` (~356) resulta NULL quando não há código.
- `catalogosEntrada` e listagem carregam código opcional; a UI e o DTO o tratam como presente. Mesmo se algum cliente atual sempre preenche o campo, esse é um defeito **do contrato geral**, não somente especulação; não foi acessado dado real.

**Resultado:** entrada de fornecedor legítimo é rejeitada como `RECHAZADA_DEFINITIVA`, sem incremento de estoque, embora devesse ser permitida. Atomicidade impede dano parcial mas não resolve a rejeição indevida.

**Correção focal determinada pelo analista:** tornar snapshot `proveedor_codigo` verdadeiramente **opcional** (NULL e eventual string vazia, segundo validação do cadastro real) na nova migration NEX-075 AINDA NÃO APLICADA; preservar `proveedor_id`, razão social e documento obrigatórios. Não inventar códigos, não atualizar cadastro proveedor nem mudar NEX-006. No motivo/observação usar identificador existente do fornecedor quando não há código (nome/documento), nunca `NULL` por simples concatenação. Adaptar tipos/apresentação/listagem para código opcional sem exibir `null` ou `undefined`. Filtro por fornecedor permanece pelo ID. Manter mesma transação, K1, ACL e total custo. Conferir se há outros acessos a código nulo.
**NÃO modificar** estado de homologação do fornecedor ou exigir homologación=HOMOLOGADO: a regra aprovada é só **ativo, não bloqueado e empresa correta**.

## 4. Decisões funcionais fechadas nesta auditoria
- **Permissões:** manter `COMPRAS.VER` e `COMPRAS.CREAR` criados, mas **SEM atribuição automática a perfis** em NEX-075. Inicialmente administrador da empresa opera, sujeito ao controle de módulo vigente; outros perfis somente por processo de autorização posteriormente definido. Não inventar perfil; não alterar permisos fiscal/Movimientos.
- **Fornecedor:** basta ser da mesma empresa, `activo = true` e `bloqueado = false`; não impor `estado_homologacion`, prazo, conta bancária, condição de pagamento nem código interno como requisito adicional.
- **Anulação:** apenas via função de Movimientos já autorizada; sem alterar o movimento ou o registro original.
- **Relatório E6-B:** NÃO INICIAR. O documento `Informe de Compras` continua baseado exclusivamente em futuras entradas E6-A reais e custo de inventário, não IVA ou faturas fiscais.

## 5. Gate e gestão
- **R01 não aprovada integralmente devido a F001.** Publicar uma única ordem corretiva localizada NEX-075 + apresentação de código opcional. Por ser migration **ainda não aplicada**, corrigir no arquivo versionado antes da aprovação para instalação; não criar NEX-076 ou alterar NEX-006.
- **PRO-325 passa a In Review**, não Done (código entregue e auditado, F001 pendente). PRO-297 segue Todo e bloqueada por PRO-325; PRO-108 Todo; PRO-115 Todo; E5 PRO-296 In Review.
- Não executar SQL/VM/migrations/tests/build/browser/deploy por esta auditoria. Após patch commit, Claude PARA para reauditoria ChatGPT. Homologação humana só com migration revisada e aplicação expressamente autorizada.
