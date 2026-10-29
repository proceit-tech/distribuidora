# AUD-NEXIT — cadastro completo de usuários (R01, 25/10/2026)

**Commits examinados estaticamente:** `b29fd10a5dd5af8904943713d3482745e5d8940e` (NEX-074 e scripts), `36f8f723e07487e16b21916d93f289dc965ea15f` (APIs/React/validação). **Veredito: PARCIALMENTE CONFORME, não homologado, não implantar.** Não foram executados SQL, migrations, runner, testes, lint, build, CI, VM, gateway ou deploy.

## Conforme na análise estática

- `Administración → Usuarios` e `Maestros → Vendedores` compartilham `GestionUsuarios`: nome, sobrenome, CI, e-mail, telefone, nome de usuário e senha inicial obrigatórios; edição sem senha e sem troca de ID.
- `POST /api/usuarios` e `PATCH /api/usuarios/[id]` validam dados; `usr_crear` (10 argumentos) e `usr_actualizar` (8) foram compatibilizadas; scripts de revogação/grants/rollback usam assinaturas novas.
- `usuarios.ci` e `usuarios.telefono` são texto, inicialmente NULL para legados; normalização mantém zeros iniciais; índice único parcial por `empresa_id, ci` protege duplicação entre contas da mesma empresa, sem bloquear CI iguais entre empresas distintas.
- Vendedor continua **o mesmo `usuarios.id`** com perfil `VENDEDOR`, sem tabela paralela; seletor da FE devolve apenas UUID, login e nome completo; API do cadastro aplica tenant/administrador e a API pública de vendedores filtra contato/CI dos usuários não administradores. Sem alterar faturação, tipo D011 ou reintentos legados.

## A01 — Regra de CI de mínimo 4 dígitos é injustificada e rejeita números legítimos

`lib/usuarios/validacion.ts` usa `/^[0-9]{4,10}$/`; `NEX-074` usa o mesmo mínimo na constraint `usuarios_ci_chk` e em `usr_exigir_datos`, e os textos de erro reiteram `4 a 10`. O responsável pediu **CI obrigatória**, não definiu mínimo de quatro caracteres. O Departamento de Identificaciones da Policía Nacional registra expressamente que a primeira cédula expedida teve **número 1**, e que a numeração começou no 1. Fonte oficial: https://www.policianacional.gov.py/identificaciones/quienes-somos/. Portanto, não rejeitar legitimamente números de 1–3 dígitos por uma hipótese sem respaldo.

**Correção mínima:** rever coerentemente o regex e mensagens de `lib/usuarios/validacion.ts`, `NEX-074` CHECK e `usr_exigir_datos`, `lib/usuarios/servidor.ts`, textos de orientação nos scripts e documentação. Manter CI como texto só de dígitos, ponto/espaços removidos, zeros preservados, unicidade por empresa e dados históricos não fabricados. Não inventar outro requisito de CI. Se houver limite superior, fundamentar contra catálogo oficial e não rejeitar números oficiais por palpite.

## A02 — Verificação de histórico usa `true` constante

`documentacao/banco/nexit/v1/scripts/verificar-NEX-074.sql` contém o controle `los usuarios históricos conservan ci/telefono NULL (ninguno inventado por la migración)`, mas a expressão de resultado é literalmente `true`. Ela **não verifica** o estado do banco. Trocar por checagem possível e comprovável ou classificar apenas como declaração de comportamento da migration, removendo o falso `ok=true`. Não executar script.

## Gates que não mudam

- NEX-072, NEX-073 e NEX-074 **NÃO APLICADAS**; runner executa outras pendências não autorizadas. Não executar, nem declarar homologação/produção; consulta visual ainda pendente.
- A questão de texto `Vendedor: ...` em FE pré-NEX-074 é separada; não fazer mudanças de idempotência ou perfil a partir desta auditoria.
- Combo completo 13 tipos foi pedido somente como seleção; não introduzir novos campos fiscais.
- Solicitar **uma única correção limitada A01/A02** no mesmo cadastro, não reiniciar projeto ou criar tabelas adicionais.
