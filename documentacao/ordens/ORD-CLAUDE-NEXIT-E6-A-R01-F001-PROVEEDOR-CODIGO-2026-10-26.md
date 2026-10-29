# ORDEM CORRETIVA FOCAL — E6-A R01-F001 / PRO-325 — fornecedor sem código interno
**Data:** 26/10/2026. **Branch:** feature/NEXIT-2026-001-banco-demo.
**Commit funcional base:** `7e4fabf15864897bb55bb350f57ec20a21a54fad`.
**Parecer vinculante:** `documentacao/testes/AUD-NEXIT-CM-E6-A-PRO-325-R01-2026-10-26.md`.
**Norma:** `documentacao/definicoes/REQ-NEXIT-CM-E6-COMPRAS-ENTRADAS-2026-10-26.md`.
**Estado NEX-075:** VERSIONADA, AINDA NÃO APLICADA. **Não aplicar.** Não criar nova migration ou mudar NEX-006.

## 1. Falha real a corrigir
`NEX-006-proveedores.sql` admite `proveedores.codigo NULL` (e não obriga string não vazia). A regra E6-A exige somente fornecedor da empresa, ATIVO e NÃO BLOQUEADO.

A nova NEX-075 declara `compras_entradas.proveedor_codigo text NOT NULL` e CHECK obrigando string não vazia, mas copia diretamente `pv.codigo`. Isto rejeita uma entrada válida por falta de código interno. O texto passado ao motor `'Compras → Entradas · proveedor ' || pv.codigo` também se torna NULL. O erro gera rejeição definitiva apesar de proveedor legítimo. UI/DTO/listagem assumem código sempre existente.

## 2. Implementar mínimo patch
1. Sincronizar HEAD, ler integralmente `CLAUDE.md`, parecer R01, norma E6, `NEX-006`, **NEX-075 inteira**, `lib/compras/entradas.ts`, `lib/compras/entradas-cliente.ts`, páginas listado/nueva/detalle e demais consumidores que exibem `proveedorCodigo`.
2. **Na migration NEX-075 não aplicada**, tornar o snapshot de código **opcional**. Preferir tipo SQL NULL e CHECK que aceite NULL ou vazio representando cadastro sem código; continuar exigindo proveedor_id, razão social e documento fiscal verdadeiros (sem inventar dados). Não remover FK tenant nem permissões.
3. Na função de registro, concatenar a descrição do movimento com **nome/documento verdadeiro** quando código não houver; nunca fabricar código ou gravar `null` textual. Manter fornecedor ativo/não bloqueado como única elegibilidade além da empresa.
4. Nos tipos e telas, mostrar nome/documento sem separador supérfluo para fornecedor sem código. Busca e filtros por ID permanecem corretos, sem valores `undefined`/`null` impressos.
5. Revisar integralmente outros pontos com leitura/acesso a `pv.codigo` ou `proveedorCodigo`, inclusive os catálogos e a mensagem de erro de fornecedor bloqueado, e ajustar somente os casos afetados. Não modificar os fornecedores existentes.
6. NÃO mudar transação, intenção K1/ACK, `inventario_registrar_movimiento`, stock, custo, motivo fiscal, migrations anteriores, catálogo de perfis/atribuições, outros menus ou relatório E6-B.
7. Documentar por raciocínio estático: fornecedor ativo+não bloqueado com código válido, código NULL, código vazio; fornecedor bloqueado/inativo; proveedor de outra empresa. 3 produtos/1 movimento/1 vínculo intactos; rollback e K1 permanecem.

## 3. Decisões de negócio já encerradas
- Permissões COMPRAS.VER e COMPRAS.CREAR **sem atribuição automática a perfis** nesta entrega; administrador da empresa é operador inicial conforme acesso existente. Não mudar perfis ou permissões do motor.
- Fornecedor elegível = mesma empresa + ativo + não bloqueado. Não exigir estado_homologacion=HOMOLOGADO, código interno ou conta bancária.
- E6-B Informe de Compras **não iniciado** e não autorizado nesta ordem; E5 intacta.

## 4. Entrega e parada
- Revisar código e SQL completos antes/depois, alterar apenas NEX-075 versionada e consumidores diretos de código opcional. NEX-075 **NÃO APLICADA**, não criar NEX-076, não executar SQL.
- Commit e push na branch oficial; informar SHA completo, arquivos alterados e explicação estática dos cenários. Nenhum teste/lint/typecheck/build/CI/PostgreSQL/VM/migrations/browser/deploy/integração fiscal. Claude não toca Linear, não faz auditoria nem atualiza documentação de gestão.
- **PARAR PARA REAUDITORIA INDEPENDENTE DO CHATGPT.** Não iniciar E6-B.
