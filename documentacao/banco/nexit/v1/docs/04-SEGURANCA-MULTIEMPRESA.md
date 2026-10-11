# 04 — Segurança multiempresa

## Modelo
- Toda tabela de negócio tem `empresa_id NOT NULL`. Filhos **herdam** a empresa do pai (trigger `nex_heredar_empresa`) e referenciam o pai por **FK composta `(empresa_id, id)`**: é impossível ligar registros de empresas diferentes (T03).
- Autenticação: `usuarios.password_hash` bcrypt (`$2a$`, custo ≥ 10; validado por `nex_validar_hash_bcrypt`). Bloqueio por tentativas (`intentos_fallidos`, `bloqueado_hasta`). Sessões em `sesiones_usuario` (token guardado como hash, expiração, revogação). Eventos em `eventos_seguridad` (login, falhas, inicialização, reset). Testes T02/T05.
- Perfis e permissões: `perfiles`, `permisos`, `perfil_permiso`, `usuario_perfil`; escopo por `usuario_sucursal`/`usuario_deposito`. `usuario_tiene_permiso(empresa, usuario, recurso, acción)` e `usuario_puede_deposito`. Perfil administrador passa tudo; permissões de tipo ACCION_CRITICA/DATO_SENSIBLE **não podem** entrar em perfis comuns (ESC-13) → `MOVIMIENTOS.ANULAR` só administrador.
- Estoque: toda escrita passa por `inventario_registrar_movimiento` / `inventario_anular_movimiento` (SECURITY DEFINER, `search_path=public,pg_temp`), que validam empresa, permissão e escopo de depósito do usuário informado.

## `nexit_runtime` (papel da aplicação)
Sem superusuário, sem `CREATEDB/CREATEROLE`, sem BYPASSRLS. Política (reaplicável por `nex_aplicar_grants_runtime()`, reexecutada pelo runner):
- SELECT em tudo, exceto `schema_migrations`.
- Escrita direta só em cadastros (clientes, proveedores, productos e filhos, listas de preços), `stock_lotes`, `sesiones_usuario`, `eventos_seguridad` e UPDATE por coluna em `usuarios` (`intentos_fallidos`, `bloqueado_hasta`, `ultimo_acceso_at`).
- **Sem** escrita direta em `stock_saldos`, `inventario_costos`, `movimientos_inventario`, `movimiento_lineas`.
- EXECUTE apenas nas funções públicas da lista (registrar/anular movimento, permissões, custo) e triggers; demais funções com EXECUTE revogado de PUBLIC (inclui `demo_*` e `nex_inicializar_empresa`).
- A senha do papel nunca está no Git: definida na implantação (`definir-clave-runtime`, por stdin, sem log da sentença).

## Limites honestos
- A aplicação continua responsável por **filtrar por `empresa_id` em cada consulta** (as ~66 consultas atuais fazem isso via sessão). O banco impede *vínculos* cruzados e *escritas* de estoque cruzadas, mas **não impede um SELECT sem filtro** por `nexit_runtime`. Contramedida disponível: RLS opcional (`migraciones/opcional/NEX-OPT-rls-empresa.sql`, testada em cópia, T08), que exige a app definir `SET nex.empresa_id` por conexão — decisão de rollout, não ativada.
- Se o hash bcrypt do projeto usar `$2b$`, a validação atual (`$2a$`) o rejeita; confirmar o gerador (`generar-hash-clave.sh`) — ver 07.
- Throughput: numeração de movimentos serializada por empresa.

## Provas (T02, T03, T05, T06, T09, T10, T11)
Isolamento entre duas empresas (leituras, vínculos, números, idempotência), permissões por perfil/depósito, sessões, runtime sem escrita direta, concorrência (corrida de idempotência, oversell, anulação concorrente, sem deadlocks) — detalhes em `documentacao/testes/TST-NEXIT-2026-002-banco-v1.md`.
