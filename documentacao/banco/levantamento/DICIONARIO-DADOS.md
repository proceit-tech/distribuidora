# DICIONÁRIO DE DADOS — V1 (esquema-alvo em inglês)

Requisito: REQ-2026-003 · PR #4 · Resposta a **AUD-REQ-2026-003-R01 / F-004** · Escopo: **somente V1** (Clientes, Proveedores, Productos, Depósitos, Stock, Movimientos, custo e vendas ao custo, base de segurança).

**Como foi gerado (reprodutível, nenhum banco real):** aplicar P001→P007 em PostgreSQL descartável (`validacoes/executar-propostas.sh`) e extrair `information_schema`/`pg_catalog`; as colunas "Legado" e "Origem hoje" vêm do mapa campo a campo (`levantamento/campos/*.md`, coluna *Coluna destino*). O esquema legado (espanhol) continua **NAO_VERIFICADO** — o que está aqui é o esquema **proposto**, não o banco real.

Legenda de **Origem hoje**: `API-SQL` = a API lê/grava hoje (código); `DEMO-localStorage` = só existe no demo do navegador (não é dado real); `SESSAO` = vem da sessão; `—` = coluna nova, sem origem no código (nasce de decisão/ requisito). **Mapa** = ID do campo em `levantamento/campos/` (`—` = não mapeado; coluna técnica, de auditoria ou de P007).

Convenções: `company_id` em toda tabela de negócio; FKs entre tabelas de negócio são compostas `(company_id, x_id)`; RLS `ENABLE`+`FORCE` com política `company_id = app_company_id()`; moeda base por empresa em `companies.base_currency_code` (padrão PYG, DEFINIR); valores monetários de custo `numeric(18,4)`, arredondados conforme `CUSTEIO-V1.md` §7.


## Segurança e estrutura da empresa (P001)


### `companies`  — 10 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK | empresas.id | API-SQL | AUT-029 |
| `code` | text | NÃO |  | UQ; CHECK `companies_code_check` | empresas.codigo | API-SQL | AUT-001 |
| `legal_name` | text | NÃO |  | CHECK `companies_legal_name_check` | empresas.razon_social | UI-only, DERIVADO, SESSAO | AUT-002, AUT-074, DSH-054 |
| `tax_id` | text | sim |  |  | — | UI-only | AUT-003 |
| `tax_id_check_digit` | text | sim |  |  | — | UI-only | AUT-003 |
| `status` | text | NÃO | `'ACTIVA'::text` | CHECK `companies_status_check` | — | — | — |
| `access_version` | integer | NÃO | `1` |  | — | — | — |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `base_currency_code` | text | NÃO | `'PYG'::text` | FK→currencies(code) | — | — | — |

### `branches`  — 8 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | — | — | — |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id) | — | — | — |
| `code` | text | NÃO |  | UQ | — | — | — |
| `name` | text | NÃO |  |  | — | — | — |
| `sifen_establishment` | text | sim |  | CHECK `branches_sifen_est_chk` | — | — | — |
| `is_active` | boolean | NÃO | `true` |  | — | — | — |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `warehouses`  — 9 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | depositos.id | API-SQL | PRO-137 |
| `company_id` | uuid | NÃO |  | UQ; FK→branches(company_id,id); FK→companies(id) | — | — | — |
| `branch_id` | uuid | NÃO |  | FK→branches(company_id,id) | — | — | — |
| `code` | text | NÃO |  | UQ | depositos.codigo | API-SQL | PRO-138 |
| `name` | text | NÃO |  |  | depositos.nombre | API-SQL | PRO-139 |
| `is_third_party` | boolean | NÃO | `false` |  | — | — | — |
| `is_active` | boolean | NÃO | `true` |  | — | — | — |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `users`  — 24 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | — | — | — |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→users(company_id,id); FK→branches(company_id,id) | — | — | — |
| `home_branch_id` | uuid | sim |  | FK→branches(company_id,id) | — | — | — |
| `username` | text | NÃO |  | UQ; CHECK `users_username_check` | usuarios.usuario | API-SQL | AUT-004 |
| `first_name` | text | NÃO |  |  | usuarios.nombre, usuarios.nombre; usuarios.apellido | API-SQL, DERIVADO | AUT-021, AUT-071 |
| `last_name` | text | sim |  |  | usuarios.apellido, usuarios.nombre; usuarios.apellido | API-SQL, DERIVADO | AUT-022, AUT-071 |
| `email` | text | sim |  |  | — | — | — |
| `password_hash` | text | NÃO |  |  | usuarios.password_hash | API-SQL | AUT-005 |
| `status` | text | NÃO | `'ACTIVO'::text` | CHECK `users_status_check` | usuarios.estado | API-SQL | AUT-025 |
| `branch_scope` | text | NÃO | `'ASIGNADAS'::text` | CHECK `users_branch_scope_check` | — | — | — |
| `warehouse_scope` | text | NÃO | `'ASIGNADOS'::text` | CHECK `users_warehouse_scope_check` | — | — | — |
| `failed_login_attempts` | integer | NÃO | `0` | CHECK `users_failed_login_attempts_check` | usuarios.intentos_fallidos | API-SQL | AUT-027 |
| `locked_until` | timestamp with time zone | sim |  |  | — | — | — |
| `last_login_at` | timestamp with time zone | sim |  |  | usuarios.ultimo_acceso_at | API-SQL | AUT-028 |
| `must_change_password` | boolean | NÃO | `false` |  | — | — | — |
| `deactivated_at` | timestamp with time zone | sim |  |  | — | — | — |
| `access_version` | integer | NÃO | `1` |  | — | — | — |
| `created_by` | uuid | sim |  | FK→users(company_id,id); CHECK `users_created_by_chk` | — | — | — |
| `created_by_type` | text | NÃO | `'PLATAFORMA'::text` | CHECK `users_created_by_chk`; CHECK `users_created_by_type_check` | — | — | — |
| `document_hash` | text | sim |  |  | — | — | — |
| `email_verified` | boolean | NÃO | `false` |  | — | — | — |
| `mfa_enabled` | boolean | NÃO | `false` |  | — | — | — |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `roles`  — 10 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | perfiles.id | API-SQL | AUT-047 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id) | perfiles.empresa_id | API-SQL | AUT-058 |
| `code` | text | NÃO |  | UQ | perfiles.codigo | DERIVADO | AUT-072 |
| `name` | text | NÃO |  |  | — | — | — |
| `is_administrator` | boolean | NÃO | `false` |  | perfiles.es_administrador | API-SQL | AUT-049 |
| `is_system` | boolean | NÃO | `false` |  | — | — | — |
| `is_active` | boolean | NÃO | `true` |  | perfiles.activo | API-SQL | AUT-048 |
| `version` | integer | NÃO | `1` |  | — | — | — |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `permissions`  — 7 colunas · RLS não (catálogo global)

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK | permisos.id | API-SQL | AUT-054 |
| `code` | text | NÃO |  | UQ; CHECK `permissions_code_chk` | permisos.recurso/accion | DERIVADO | AUT-078 |
| `resource` | text | NÃO |  | UQ; CHECK `permissions_code_chk` | permisos.recurso | API-SQL | AUT-055 |
| `action` | text | NÃO |  | UQ; CHECK `permissions_code_chk` | permisos.accion | API-SQL | AUT-056 |
| `module` | text | sim |  |  | — | — | — |
| `scope_level` | text | NÃO | `'EMPRESA'::text` | CHECK `permissions_scope_level_check` | — | — | — |
| `class` | text | NÃO | `'OPERACIONAL'::text` | CHECK `permissions_class_check` | — | — | — |

### `role_permissions`  — 3 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `company_id` | uuid | NÃO |  | PK; FK→roles(company_id,id) | — | — | — |
| `role_id` | uuid | NÃO |  | PK; FK→roles(company_id,id) | perfil_permiso.perfil_id | API-SQL | AUT-052 |
| `permission_id` | uuid | NÃO |  | PK; FK→permissions(id) | perfil_permiso.permiso_id | API-SQL | AUT-053 |

### `user_roles`  — 5 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `company_id` | uuid | NÃO |  | PK; FK→users(company_id,id); FK→roles(company_id,id) | — | — | — |
| `user_id` | uuid | NÃO |  | PK; FK→users(company_id,id) | usuario_perfil.usuario_id | API-SQL | AUT-050 |
| `role_id` | uuid | NÃO |  | PK; FK→roles(company_id,id) | usuario_perfil.perfil_id | API-SQL | AUT-051 |
| `assigned_by` | uuid | sim |  | FK→users(company_id,id) | — | — | — |
| `assigned_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `user_branches`  — 5 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `company_id` | uuid | NÃO |  | PK; FK→branches(company_id,id); FK→users(company_id,id) | — | — | — |
| `user_id` | uuid | NÃO |  | PK; FK→users(company_id,id) | — | — | — |
| `branch_id` | uuid | NÃO |  | PK; FK→branches(company_id,id) | — | — | — |
| `assigned_by` | uuid | sim |  | FK→users(company_id,id) | — | — | — |
| `assigned_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `user_warehouses`  — 5 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `company_id` | uuid | NÃO |  | PK; FK→users(company_id,id); FK→warehouses(company_id,id) | — | — | — |
| `user_id` | uuid | NÃO |  | PK; FK→users(company_id,id) | — | — | — |
| `warehouse_id` | uuid | NÃO |  | PK; FK→warehouses(company_id,id) | — | — | — |
| `assigned_by` | uuid | sim |  | FK→users(company_id,id) | — | — | — |
| `assigned_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `user_sessions`  — 9 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK | sesiones_usuario.id | SESSAO, API-SQL | AUT-010, AUT-011, AUT-036 |
| `company_id` | uuid | NÃO |  | FK→users(company_id,id) | — | — | — |
| `user_id` | uuid | NÃO |  | FK→users(company_id,id) | sesiones_usuario.usuario_id | API-SQL | AUT-031 |
| `token_hash` | text | NÃO |  | UQ | sesiones_usuario.token_hash | API-SQL | AUT-012 |
| `ip` | inet | sim |  |  | sesiones_usuario.ip | API-SQL | AUT-032 |
| `user_agent` | text | sim |  |  | sesiones_usuario.user_agent | API-SQL | AUT-033 |
| `created_at` | timestamp with time zone | NÃO | `now()` | CHECK `user_sessions_exp_chk` | — | — | — |
| `expires_at` | timestamp with time zone | NÃO |  | CHECK `user_sessions_exp_chk` | sesiones_usuario.expira_at | DERIVADO, API-SQL | AUT-015, AUT-034 |
| `revoked_at` | timestamp with time zone | sim |  |  | sesiones_usuario.revocada_at | API-SQL | AUT-035 |

### `security_events`  — 8 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK | eventos_seguridad.id / data do evento | API-SQL | AUT-043 |
| `company_id` | uuid | NÃO |  | FK→companies(id); FK→users(company_id,id) | eventos_seguridad.empresa_id | API-SQL | AUT-037 |
| `user_id` | uuid | sim |  | FK→users(company_id,id) | eventos_seguridad.usuario_id | API-SQL | AUT-038 |
| `event_type` | text | NÃO |  |  | eventos_seguridad.tipo | API-SQL | AUT-039 |
| `details` | jsonb | sim |  |  | eventos_seguridad.detalle | API-SQL | AUT-040 |
| `ip` | inet | sim |  |  | eventos_seguridad.ip | API-SQL | AUT-041 |
| `user_agent` | text | sim |  |  | eventos_seguridad.user_agent | API-SQL | AUT-042 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | eventos_seguridad.id / data do evento | API-SQL | AUT-043 |

### `document_sequences`  — 8 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | — | — | — |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id) | — | — | — |
| `sequence_type` | text | NÃO |  | UQ; CHECK `document_sequences_scope_chk`; CHECK `document_sequences_type_chk` | — | — | — |
| `establishment_code` | text | NÃO | `''::text` | UQ; CHECK `document_sequences_scope_chk` | — | — | — |
| `issuance_point_code` | text | NÃO | `''::text` | UQ; CHECK `document_sequences_scope_chk` | — | — | — |
| `last_value` | bigint | NÃO | `0` | CHECK `document_sequences_scope_chk` | — | — | — |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

## Catálogos globais (sem empresa; P002/P003/P007)


### `currencies`  — 7 colunas · RLS não (catálogo global)

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `code` | text | NÃO |  | PK; CHECK `currencies_code_check` | monedas.codigo | API-SQL | CLI-151, PRV-137 |
| `name` | text | NÃO |  | CHECK `currencies_name_check` | monedas.nombre | API-SQL, DERIVADO | CLI-152, PRV-022, PRV-138 |
| `symbol` | text | sim |  |  | monedas.simbolo | API-SQL | PRV-139 |
| `is_active` | boolean | NÃO | `true` |  | monedas.activo | API-SQL | CLI-153, PRV-140 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `minor_units` | smallint | sim |  | CHECK `currencies_minor_units_chk` | — | — | — |

### `units_of_measure`  — 8 colunas · RLS não (catálogo global)

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK | unidades_medida.id | API-SQL | PRO-125 |
| `code` | text | NÃO |  | UQ; CHECK `units_of_measure_code_check` | unidades_medida.codigo | API-SQL | PRO-126 |
| `name` | text | NÃO |  | CHECK `units_of_measure_name_check` | unidades_medida.nombre | DEMO-localStorage, API-SQL | FAC-106, PRO-127 |
| `sifen_code` | text | sim |  |  | unidades_medida.codigo_sifen | API-SQL | PRO-128 |
| `sifen_description` | text | sim |  |  | unidades_medida.descripcion_sifen | API-SQL | PRO-129 |
| `is_active` | boolean | NÃO | `true` |  | — | — | — |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `geo_countries`  — 5 colunas · RLS não (catálogo global)

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `code` | text | NÃO |  | PK; CHECK `geo_countries_code_check` | referencia_geografica_paises.codigo | UI-only, API-SQL | CLI-162, PRV-147 |
| `name` | text | NÃO |  | CHECK `geo_countries_name_check` | referencia_geografica_paises.nombre | UI-only, API-SQL | CLI-162, PRV-148 |
| `is_active` | boolean | NÃO | `true` |  | referencia_geografica_paises.activo | API-SQL | PRV-149 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `geo_departments`  — 5 colunas · RLS não (catálogo global)

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `code` | integer | NÃO |  | PK; CHECK `geo_departments_code_check` | referencia_geografica_departamentos.codigo | API-SQL | CLI-154, PRV-153 |
| `name` | text | NÃO |  | CHECK `geo_departments_name_check` | referencia_geografica_departamentos.nombre | API-SQL | CLI-155, PRV-154 |
| `is_active` | boolean | NÃO | `true` |  | referencia_geografica_departamentos.activo | API-SQL | PRV-155 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `geo_cities`  — 7 colunas · RLS não (catálogo global)

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `department_code` | integer | NÃO |  | PK; FK→geo_districts(department_code,code) | referencia_geografica_ciudades.departamento_codigo; referenc | API-SQL | CLI-161, PRV-162 |
| `district_code` | integer | NÃO |  | PK; FK→geo_districts(department_code,code) | referencia_geografica_ciudades.departamento_codigo; referenc | API-SQL | CLI-161, PRV-163 |
| `code` | integer | NÃO |  | PK; CHECK `geo_cities_code_check` | referencia_geografica_ciudades.codigo | API-SQL | CLI-159, PRV-160 |
| `name` | text | NÃO |  | CHECK `geo_cities_name_check` | referencia_geografica_ciudades.nombre | API-SQL | CLI-160, PRV-161 |
| `is_active` | boolean | NÃO | `true` |  | referencia_geografica_ciudades.activo | API-SQL | PRV-164 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `geo_districts`  — 6 colunas · RLS não (catálogo global)

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `department_code` | integer | NÃO |  | PK; FK→geo_departments(code) | referencia_geografica_distritos.departamento_codigo | API-SQL | CLI-158, PRV-158 |
| `code` | integer | NÃO |  | PK; CHECK `geo_districts_code_check` | referencia_geografica_distritos.codigo | API-SQL | CLI-156, PRV-156 |
| `name` | text | NÃO |  | CHECK `geo_districts_name_check` | referencia_geografica_distritos.nombre | API-SQL | CLI-157, PRV-157 |
| `is_active` | boolean | NÃO | `true` |  | referencia_geografica_distritos.activo | API-SQL | PRV-159 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `payment_methods`  — 7 colunas · RLS não (catálogo global)

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK | medios_pago.id | API-SQL | PRV-141 |
| `code` | text | NÃO |  | UQ; CHECK `payment_methods_code_check` | medios_pago.codigo | API-SQL | PRV-142 |
| `name` | text | NÃO |  | CHECK `payment_methods_name_check` | medios_pago.nombre | DERIVADO, API-SQL | PRV-025, PRV-143 |
| `type` | text | sim |  |  | medios_pago.tipo | API-SQL | PRV-144 |
| `is_active` | boolean | NÃO | `true` |  | medios_pago.activo | API-SQL | PRV-146 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `taxes`  — 7 colunas · RLS não (catálogo global)

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK | impuestos.id | API-SQL | PRO-130 |
| `code` | text | NÃO |  | UQ; CHECK `taxes_code_check` | impuestos.codigo | API-SQL | PRO-131 |
| `name` | text | NÃO |  | CHECK `taxes_name_check` | impuestos.nombre | DEMO-localStorage, API-SQL | FAC-107, PRO-132 |
| `rate_percent` | numeric(5,2) | NÃO |  | CHECK `taxes_rate_percent_check` | impuestos.porcentaje | API-SQL | PRO-133 |
| `is_active` | boolean | NÃO | `true` |  | — | — | — |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `incoterms`  — 5 colunas · RLS não (catálogo global)

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `code` | text | NÃO |  | PK; CHECK `incoterms_code_check` | incoterms.codigo | API-SQL | PRV-150 |
| `name` | text | sim |  |  | incoterms.nombre | DERIVADO, API-SQL | PRV-041, PRV-151 |
| `is_active` | boolean | NÃO | `true` |  | incoterms.activo | API-SQL | PRV-152 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

## Clientes (P002)


### `customers`  — 50 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | clientes.id | API-SQL, DEMO-localStorage | CLI-001, FAC-091 |
| `company_id` | uuid | NÃO |  | UQ; FK→commercial_zones(company_id,id); FK→companies(id); FK→users(company_id,id); FK→customer_groups(company_id,id); FK→delivery_routes(company_id,id); FK→payment_terms(company_id,id); FK→price_lists(company_id,id); FK→sales_channels(company_id,id); FK→salespeople(company_id,id) | clientes.empresa_id | SESSAO | CLI-003 |
| `code` | character varying(50) | NÃO |  | UQ | clientes.codigo | API-SQL, DEMO-localStorage | CLI-002, FAC-092 |
| `recipient_nature_code` | smallint | NÃO |  | CHECK `customers_contributor_chk`; CHECK `customers_noncontributor_chk`; CHECK `customers_recipient_nature_code_check` | clientes.naturaleza_receptor | API-SQL | CLI-004 |
| `operation_type_code` | smallint | NÃO |  | CHECK `customers_operation_type_code_check` | clientes.tipo_operacion | API-SQL | CLI-005 |
| `person_type` | text | NÃO |  | CHECK `customers_person_type_check`; CHECK `customers_taxpayer_type_chk` | clientes.tipo_persona | API-SQL, DEMO-localStorage | CLI-006, FAC-094 |
| `taxpayer_type_code` | smallint | NÃO |  | CHECK `customers_taxpayer_type_chk`; CHECK `customers_taxpayer_type_code_check` | clientes.tipo_contribuyente_sifen | API-SQL | CLI-007 |
| `country_code` | text | NÃO |  | FK→geo_countries(code) | clientes.pais_codigo | API-SQL | CLI-008 |
| `document_type` | character varying(30) | NÃO |  | CHECK `customers_contributor_chk`; CHECK `customers_document_type_check`; CHECK `customers_noncontributor_chk`; CHECK `customers_other_doc_description_chk` | clientes.tipo_documento | API-SQL, DEMO-localStorage | CLI-010, FAC-095 |
| `identity_document_type_code` | smallint | sim |  | CHECK `customers_contributor_chk`; CHECK `customers_identity_document_type_code_check`; CHECK `customers_noncontributor_chk` | clientes.tipo_documento_identidad_sifen | API-SQL | CLI-011 |
| `identity_document_description` | character varying(100) | sim |  | CHECK `customers_contributor_chk`; CHECK `customers_other_doc_description_chk` | clientes.descripcion_documento_identidad | API-SQL | CLI-012 |
| `tax_id` | character varying(30) | NÃO |  | CHECK `customers_tax_id_check` | clientes.numero_documento | API-SQL, DEMO-localStorage | CLI-013, FAC-096 |
| `tax_id_check_digit` | character varying(5) | sim |  | CHECK `customers_contributor_chk`; CHECK `customers_noncontributor_chk` | clientes.dv | API-SQL, DEMO-localStorage | CLI-014, FAC-097 |
| `legal_name` | character varying(200) | NÃO |  | CHECK `customers_legal_name_check` | clientes.razon_social | API-SQL, DEMO-localStorage | CLI-015, FAC-098 |
| `trade_name` | character varying(200) | sim |  |  | clientes.nombre_fantasia | API-SQL | CLI-016 |
| `email` | character varying(150) | sim |  | CHECK `customers_email_check` | clientes.email | API-SQL, DEMO-localStorage | CLI-017, FAC-099 |
| `cc_email` | character varying(150) | sim |  | CHECK `customers_cc_email_check` | clientes.email_copia | API-SQL | CLI-018 |
| `phone` | character varying(30) | sim |  |  | clientes.telefono | API-SQL, DEMO-localStorage | CLI-019, FAC-100 |
| `mobile_phone` | character varying(30) | sim |  |  | clientes.celular | API-SQL | CLI-020 |
| `credit_limit` | numeric(18,4) | NÃO | `0` | CHECK `customers_credit_limit_check` | clientes.limite_credito | API-SQL | CLI-021 |
| `temporary_credit_limit` | numeric(18,4) | sim |  | CHECK `customers_temp_credit_chk`; CHECK `customers_temporary_credit_limit_check` | clientes.limite_credito_temporal | API-SQL | CLI-022 |
| `temporary_credit_expires_on` | date | sim |  | CHECK `customers_temp_credit_chk` | clientes.fecha_vencimiento_credito | API-SQL | CLI-023 |
| `customer_group_id` | uuid | sim |  | FK→customer_groups(company_id,id) | clientes.grupo_cliente_id | API-SQL | CLI-024 |
| `payment_term_id` | uuid | sim |  | FK→payment_terms(company_id,id) | clientes.condicion_pago_id | API-SQL | CLI-025 |
| `default_currency_code` | text | sim |  | FK→currencies(code) | clientes.moneda_codigo_predeterminada | API-SQL | CLI-026 |
| `price_list_id` | uuid | sim |  | FK→price_lists(company_id,id) | clientes.lista_precio_id | API-SQL | CLI-027, LPR-037 |
| `sales_channel_id` | uuid | sim |  | FK→sales_channels(company_id,id) | clientes.canal_venta_id | API-SQL | CLI-028 |
| `salesperson_id` | uuid | sim |  | FK→salespeople(company_id,id) | clientes.vendedor_id | API-SQL | CLI-029 |
| `external_code` | character varying(100) | sim |  | UQ | clientes.codigo_externo | API-SQL | CLI-030 |
| `gln` | character varying(13) | sim |  |  | clientes.gln | API-SQL | CLI-031 |
| `commercial_discount_pct` | numeric(5,2) | NÃO | `0` | CHECK `customers_commercial_discount_pct_check` | clientes.descuento_comercial_pct | API-SQL | CLI-032 |
| `is_sales_blocked` | boolean | NÃO | `false` | CHECK `customers_block_audit_chk`; CHECK `customers_block_reason_chk` | clientes.bloqueado_ventas | API-SQL | CLI-033 |
| `sales_block_reason` | character varying(500) | sim |  | CHECK `customers_block_reason_chk` | clientes.motivo_bloqueo_ventas | API-SQL | CLI-034 |
| `sales_blocked_at` | timestamp with time zone | sim |  | CHECK `customers_block_audit_chk` | clientes.bloqueado_ventas_at | API-SQL | CLI-035 |
| `sales_blocked_by` | uuid | sim |  | FK→users(company_id,id); CHECK `customers_block_audit_chk` | clientes.bloqueado_ventas_por | SESSAO | CLI-036 |
| `preferred_collection_day` | smallint | sim |  | CHECK `customers_preferred_collection_day_check` | clientes.dia_preferido_cobro | API-SQL | CLI-037 |
| `requires_purchase_order` | boolean | NÃO | `false` |  | clientes.requiere_orden_compra | API-SQL | CLI-038 |
| `billing_email` | character varying(150) | sim |  | CHECK `customers_billing_email_check` | clientes.email_facturacion | API-SQL | CLI-039 |
| `collections_email` | character varying(150) | sim |  | CHECK `customers_collections_email_check` | clientes.email_cobranzas | API-SQL | CLI-040 |
| `receives_electronic_documents` | boolean | NÃO | `true` |  | clientes.recibe_documento_electronico | API-SQL | CLI-041 |
| `delivery_route_id` | uuid | sim |  | FK→delivery_routes(company_id,id) | clientes.ruta_entrega_id | API-SQL | CLI-042 |
| `commercial_zone_id` | uuid | sim |  | FK→commercial_zones(company_id,id) | clientes.zona_comercial_id | API-SQL | CLI-043 |
| `delivery_frequency` | text | sim |  | CHECK `customers_delivery_frequency_check` | clientes.frecuencia_entrega | API-SQL | CLI-044 |
| `delivery_days` | smallint[] | sim |  | CHECK `customers_delivery_days_check` | clientes.dias_entrega | API-SQL | CLI-045 |
| `commercial_notes` | character varying(1000) | sim |  |  | clientes.observacion_comercial | API-SQL | CLI-046 |
| `logistics_notes` | character varying(1000) | sim |  |  | clientes.observacion_logistica | API-SQL | CLI-047 |
| `is_active` | boolean | NÃO | `true` |  | clientes.activo | API-SQL | CLI-048 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | DEMO-localStorage | CLI-050 |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | DEMO-localStorage | CLI-049 |
| `created_by` | uuid | sim |  | FK→users(company_id,id) | — | DEMO-localStorage | CLI-051 |

### `customer_addresses`  — 27 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | direcciones_cliente.id | API-SQL | CLI-077 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→customers(company_id,id) | — | API-SQL | CLI-078 |
| `customer_id` | uuid | NÃO |  | FK→customers(company_id,id) | direcciones_cliente.cliente_id | API-SQL | CLI-079 |
| `description` | character varying(100) | sim |  |  | direcciones_cliente.descripcion | API-SQL | CLI-080 |
| `address_type` | text | NÃO | `'COMERCIAL'::text` | CHECK `customer_addresses_address_type_check`; CHECK `customer_addresses_fiscal_chk` | direcciones_cliente.tipo | API-SQL | CLI-081 |
| `label` | character varying(100) | sim |  |  | direcciones_cliente.etiqueta | API-SQL | CLI-082 |
| `street` | character varying(300) | NÃO |  | CHECK `customer_addresses_street_check` | direcciones_cliente.direccion | API-SQL | CLI-083 |
| `house_number` | character varying(20) | sim |  |  | direcciones_cliente.numero_casa | API-SQL | CLI-084 |
| `address_line2` | character varying(200) | sim |  |  | — | — | — |
| `country_code` | text | NÃO |  | FK→geo_countries(code); CHECK `customer_addresses_pry_geo_chk` | direcciones_cliente.pais_codigo | API-SQL | CLI-086 |
| `department_code` | integer | sim |  | FK→geo_cities(department_code,district_code,code)MATCHFULL; CHECK `customer_addresses_pry_geo_chk` | direcciones_cliente.departamento_codigo | API-SQL | CLI-088 |
| `district_code` | integer | sim |  | FK→geo_cities(department_code,district_code,code)MATCHFULL; CHECK `customer_addresses_pry_geo_chk` | direcciones_cliente.distrito_codigo | API-SQL | CLI-090 |
| `city_code` | integer | sim |  | FK→geo_cities(department_code,district_code,code)MATCHFULL; CHECK `customer_addresses_pry_geo_chk` | direcciones_cliente.ciudad_codigo | API-SQL | CLI-092 |
| `department_name` | character varying(100) | sim |  |  | direcciones_cliente.departamento | API-SQL | CLI-089 |
| `district_name` | character varying(100) | sim |  |  | direcciones_cliente.distrito | API-SQL | CLI-091 |
| `city_name` | character varying(100) | sim |  |  | direcciones_cliente.ciudad | API-SQL | CLI-093 |
| `postal_code` | character varying(15) | sim |  |  | direcciones_cliente.codigo_postal | API-SQL | CLI-094 |
| `receiving_contact_name` | character varying(200) | sim |  |  | direcciones_cliente.contacto_nombre | API-SQL | CLI-095 |
| `receiving_contact_phone` | character varying(30) | sim |  |  | direcciones_cliente.contacto_telefono | API-SQL | CLI-096 |
| `receiving_hours` | character varying(200) | sim |  |  | direcciones_cliente.horario_recepcion | API-SQL | CLI-097 |
| `notes` | character varying(500) | sim |  |  | direcciones_cliente.observacion | API-SQL | CLI-098 |
| `is_fiscal` | boolean | NÃO | `false` | CHECK `customer_addresses_fiscal_chk` | direcciones_cliente.es_fiscal | API-SQL | CLI-099 |
| `is_default_delivery` | boolean | NÃO | `false` |  | direcciones_cliente.es_entrega_default | API-SQL | CLI-100 |
| `latitude` | numeric(9,6) | sim |  | CHECK `customer_addresses_latitude_check` | direcciones_cliente.latitud | API-SQL | CLI-101 |
| `longitude` | numeric(9,6) | sim |  | CHECK `customer_addresses_longitude_check` | direcciones_cliente.longitud | API-SQL | CLI-102 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `customer_contacts`  — 18 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | cliente_contactos.id | API-SQL | CLI-061 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→customers(company_id,id) | — | API-SQL | CLI-062 |
| `customer_id` | uuid | NÃO |  | FK→customers(company_id,id) | cliente_contactos.cliente_id | API-SQL | CLI-063 |
| `first_name` | character varying(100) | NÃO |  | CHECK `customer_contacts_first_name_check` | cliente_contactos.nombre | API-SQL | CLI-064 |
| `last_name` | character varying(100) | sim |  |  | cliente_contactos.apellido | API-SQL | CLI-065 |
| `job_title` | character varying(100) | sim |  |  | cliente_contactos.cargo | API-SQL | CLI-066 |
| `department` | character varying(100) | sim |  |  | cliente_contactos.departamento | API-SQL | CLI-067 |
| `phone` | character varying(30) | sim |  |  | cliente_contactos.telefono | API-SQL | CLI-068 |
| `mobile_phone` | character varying(30) | sim |  |  | cliente_contactos.celular | API-SQL | CLI-069 |
| `email` | character varying(150) | sim |  | CHECK `customer_contacts_email_check` | cliente_contactos.email | API-SQL | CLI-070 |
| `is_primary` | boolean | NÃO | `false` |  | cliente_contactos.es_principal | API-SQL | CLI-071 |
| `receives_orders` | boolean | NÃO | `false` |  | cliente_contactos.recibe_pedidos | API-SQL | CLI-072 |
| `receives_invoices` | boolean | NÃO | `false` |  | cliente_contactos.recibe_facturacion | API-SQL | CLI-073 |
| `receives_collections` | boolean | NÃO | `false` |  | cliente_contactos.recibe_cobranzas | API-SQL | CLI-074 |
| `receives_electronic_documents` | boolean | NÃO | `false` |  | cliente_contactos.recibe_documentos_electronicos | API-SQL | CLI-075 |
| `receives_notifications` | boolean | NÃO | `true` |  | cliente_contactos.recibe_notificaciones | API-SQL | CLI-076 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `customer_documents`  — 12 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | cliente_documentos.id | API-SQL | CLI-103 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→customers(company_id,id); FK→users(company_id,id) | — | API-SQL | CLI-104 |
| `customer_id` | uuid | NÃO |  | FK→customers(company_id,id) | cliente_documentos.cliente_id | API-SQL | CLI-105 |
| `document_type` | text | NÃO | `'OTRO'::text` | CHECK `customer_documents_document_type_check` | cliente_documentos.tipo | API-SQL | CLI-106 |
| `file_name` | character varying(255) | NÃO |  | CHECK `customer_documents_file_name_check` | cliente_documentos.nombre_archivo | API-SQL | CLI-107 |
| `file_url` | text | NÃO |  | CHECK `customer_documents_file_url_check` | cliente_documentos.url_archivo | API-SQL | CLI-108 |
| `issued_on` | date | sim |  | CHECK `customer_documents_dates_chk` | cliente_documentos.fecha_emision | API-SQL | CLI-109 |
| `expires_on` | date | sim |  | CHECK `customer_documents_dates_chk` | cliente_documentos.fecha_vencimiento | API-SQL | CLI-110 |
| `notes` | character varying(500) | sim |  |  | cliente_documentos.observacion | API-SQL | CLI-111 |
| `uploaded_by` | uuid | sim |  | FK→users(company_id,id) | cliente_documentos.cargado_por | SESSAO | CLI-112 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `customer_groups`  — 7 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | grupos_cliente.id | API-SQL | CLI-113 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id) | grupos_cliente.empresa_id | API-SQL | CLI-114 |
| `code` | text | NÃO |  | UQ; CHECK `customer_groups_code_check` | grupos_cliente.codigo | API-SQL | CLI-115 |
| `name` | text | NÃO |  | CHECK `customer_groups_name_check` | grupos_cliente.nombre | DERIVADO, API-SQL | CLI-052, CLI-116 |
| `is_active` | boolean | NÃO | `true` |  | grupos_cliente.activo | API-SQL | CLI-117 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `commercial_zones`  — 7 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | zonas_comerciales.id | API-SQL | CLI-129 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id) | zonas_comerciales.empresa_id | API-SQL | CLI-130 |
| `code` | text | NÃO |  | UQ; CHECK `commercial_zones_code_check` | zonas_comerciales.codigo | API-SQL | CLI-131 |
| `name` | text | NÃO |  | CHECK `commercial_zones_name_check` | zonas_comerciales.nombre | API-SQL | CLI-132 |
| `is_active` | boolean | NÃO | `true` |  | zonas_comerciales.activo | API-SQL | CLI-133 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `sales_channels`  — 7 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | canales_venta.id | API-SQL | CLI-134 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id) | canales_venta.empresa_id | API-SQL | CLI-135 |
| `code` | text | NÃO |  | UQ; CHECK `sales_channels_code_check` | canales_venta.codigo | API-SQL | CLI-136 |
| `name` | text | NÃO |  | CHECK `sales_channels_name_check` | canales_venta.nombre | API-SQL | CLI-137 |
| `is_active` | boolean | NÃO | `true` |  | canales_venta.activo | API-SQL | CLI-138 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `salespeople`  — 7 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | vendedores.id | API-SQL | CLI-118 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id) | vendedores.empresa_id | API-SQL | CLI-119 |
| `code` | text | NÃO |  | UQ; CHECK `salespeople_code_check` | vendedores.codigo | API-SQL | CLI-120 |
| `name` | text | NÃO |  | CHECK `salespeople_name_check` | vendedores.nombre | DERIVADO, API-SQL | CLI-055, CLI-121 |
| `is_active` | boolean | NÃO | `true` |  | vendedores.activo | API-SQL | CLI-122 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `delivery_routes`  — 8 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | rutas_entrega.id | API-SQL | CLI-123 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id) | rutas_entrega.empresa_id | API-SQL | CLI-124 |
| `code` | text | NÃO |  | UQ; CHECK `delivery_routes_code_check` | rutas_entrega.codigo | API-SQL | CLI-125 |
| `name` | text | NÃO |  | CHECK `delivery_routes_name_check` | rutas_entrega.nombre | DERIVADO, API-SQL | CLI-056, CLI-126 |
| `zone` | text | sim |  |  | rutas_entrega.zona | API-SQL | CLI-128 |
| `is_active` | boolean | NÃO | `true` |  | rutas_entrega.activo | API-SQL | CLI-127 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `payment_terms`  — 9 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | condiciones_pago.id | API-SQL | CLI-145, PRV-132 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id) | — | — | — |
| `code` | text | NÃO |  | UQ; CHECK `payment_terms_code_check` | condiciones_pago.codigo | API-SQL | CLI-146, PRV-133 |
| `name` | text | NÃO |  | CHECK `payment_terms_name_check` | condiciones_pago.nombre | DERIVADO, API-SQL | CLI-053, CLI-147, PRV-020 … |
| `due_days` | integer | sim |  |  | condiciones_pago.dias_vencimiento | API-SQL | CLI-149, PRV-135 |
| `requires_credit` | boolean | NÃO | `false` |  | condiciones_pago.requiere_credito | API-SQL | CLI-150 |
| `is_active` | boolean | NÃO | `true` |  | condiciones_pago.activo | API-SQL | CLI-148, PRV-136 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

## Proveedores (P003)


### `suppliers`  — 43 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | proveedores.id | API-SQL | PRO-134, PRV-001 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→users(company_id,id); FK→supplier_groups(company_id,id); FK→payment_terms(company_id,id) | proveedores.empresa_id | SESSAO | PRV-002 |
| `code` | text | sim |  | UQ | proveedores.codigo | API-SQL | PRO-135, PRV-003 |
| `person_type` | text | NÃO | `'JURIDICA'::text` | CHECK `suppliers_person_type_chk` | proveedores.tipo_persona | API-SQL | PRV-004 |
| `supplier_group_id` | uuid | sim |  | FK→supplier_groups(company_id,id) | proveedores.grupo_proveedor_id | API-SQL | PRV-006 |
| `tax_id_type` | text | NÃO | `'RUC'::text` | UQ; CHECK `suppliers_dv_only_ruc_chk`; CHECK `suppliers_pry_ruc_chk`; CHECK `suppliers_ruc_chk`; CHECK `suppliers_tax_id_type_chk` | proveedores.tipo_documento | API-SQL | PRV-008 |
| `tax_id` | text | NÃO |  | UQ; CHECK `suppliers_ruc_chk`; CHECK `suppliers_tax_id_chk` | proveedores.numero_documento | API-SQL | PRV-009 |
| `tax_id_check_digit` | text | sim |  | CHECK `suppliers_dv_chk`; CHECK `suppliers_dv_only_ruc_chk`; CHECK `suppliers_ruc_chk` | proveedores.dv | API-SQL | PRV-010 |
| `legal_name` | text | NÃO |  | CHECK `suppliers_legal_name_chk` | proveedores.razon_social | API-SQL | PRO-136, PRV-011 |
| `trade_name` | text | sim |  | CHECK `suppliers_trade_name_chk` | proveedores.nombre_fantasia | API-SQL | PRV-012 |
| `country_code` | text | NÃO | `'PRY'::text` | CHECK `suppliers_country_code_chk`; CHECK `suppliers_pry_ruc_chk` | proveedores.pais_codigo | API-SQL | PRV-013 |
| `email` | text | sim |  | CHECK `suppliers_email_chk` | proveedores.email | API-SQL | PRV-015 |
| `phone` | text | sim |  | CHECK `suppliers_phone_chk` | proveedores.telefono | API-SQL | PRV-016 |
| `website` | text | sim |  | CHECK `suppliers_website_chk` | proveedores.sitio_web | API-SQL | PRV-017 |
| `payment_term_id` | uuid | sim |  | FK→payment_terms(company_id,id) | proveedores.condicion_pago_id | API-SQL | PRV-019 |
| `default_currency_code` | text | sim |  | FK→currencies(code) | proveedores.moneda_codigo_predeterminada | API-SQL | PRV-021 |
| `preferred_payment_method_id` | uuid | sim |  | FK→payment_methods(id) | proveedores.medio_pago_preferido_id | API-SQL | PRV-024 |
| `preferred_payment_day` | integer | sim |  | CHECK `suppliers_pay_day_chk` | — | — | — |
| `lead_time_days` | integer | sim |  | CHECK `suppliers_lead_time_chk` | — | — | — |
| `commercial_discount_pct` | numeric(5,2) | NÃO | `0` | CHECK `suppliers_discount_chk` | proveedores.descuento_comercial_pct | API-SQL | PRV-028 |
| `minimum_purchase_amount` | numeric(18,2) | NÃO | `0` | CHECK `suppliers_min_amount_chk` | proveedores.monto_minimo_compra | API-SQL | PRV-029 |
| `allows_advances` | boolean | NÃO | `false` |  | proveedores.permite_anticipos | API-SQL | PRV-030 |
| `requires_purchase_order` | boolean | NÃO | `false` |  | proveedores.requiere_orden_compra | API-SQL | PRV-031 |
| `payments_email` | text | sim |  | CHECK `suppliers_pay_email_chk` | proveedores.email_pagos | API-SQL | PRV-032 |
| `relationship_start_date` | date | sim |  | CHECK `suppliers_relationship_dates_chk` | proveedores.fecha_inicio_relacion | API-SQL | PRV-033 |
| `relationship_end_date` | date | sim |  | CHECK `suppliers_relationship_dates_chk` | proveedores.fecha_fin_relacion | API-SQL | PRV-034 |
| `homologation_status` | text | NÃO | `'PENDIENTE'::text` | CHECK `suppliers_homologation_chk` | proveedores.estado_homologacion | API-SQL | PRV-035 |
| `homologation_date` | date | sim |  | CHECK `suppliers_homologation_dates_chk` | proveedores.fecha_homologacion | API-SQL | PRV-036 |
| `homologation_expiry_date` | date | sim |  | CHECK `suppliers_homologation_dates_chk` | proveedores.fecha_vencimiento_homologacion | API-SQL | PRV-037 |
| `risk_level` | text | NÃO | `'NO_EVALUADO'::text` | CHECK `suppliers_risk_chk` | proveedores.nivel_riesgo | API-SQL | PRV-038 |
| `current_rating` | numeric(5,2) | sim |  | CHECK `suppliers_rating_chk` | — | — | — |
| `incoterm_code` | text | sim |  | FK→incoterms(code) | proveedores.incoterm_codigo | API-SQL | PRV-040 |
| `delivery_terms` | text | sim |  | CHECK `suppliers_delivery_terms_chk` | proveedores.condicion_entrega | API-SQL | PRV-042 |
| `preferred_transport_method` | text | sim |  | CHECK `suppliers_transport_chk` | proveedores.metodo_transporte_preferido | API-SQL | PRV-043 |
| `order_confirmation_days` | integer | sim |  | CHECK `suppliers_confirm_days_chk` | — | — | — |
| `allows_partial_delivery` | boolean | NÃO | `true` |  | proveedores.permite_entrega_parcial | API-SQL | PRV-045 |
| `notes` | text | sim |  | CHECK `suppliers_notes_chk` | proveedores.observacion | API-SQL | PRV-046 |
| `is_active` | boolean | NÃO | `true` |  | proveedores.activo | API-SQL | PRV-047 |
| `is_blocked` | boolean | NÃO | `false` |  | proveedores.bloqueado | API-SQL | PRV-048 |
| `block_reason` | text | sim |  |  | proveedores.motivo_bloqueo | API-SQL | PRV-049 |
| `created_by` | uuid | sim |  | FK→users(company_id,id) | — | SESSAO | PRV-052 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | DEMO-localStorage | PRV-050 |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | DEMO-localStorage | PRV-051 |

### `supplier_addresses`  — 18 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | proveedor_direcciones.id | API-SQL | PRV-076 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→suppliers(company_id,id) | — | DERIVADO | PRV-078 |
| `supplier_id` | uuid | NÃO |  | FK→suppliers(company_id,id) | proveedor_direcciones.proveedor_id | API-SQL | PRV-077 |
| `address_type` | text | NÃO |  | CHECK `supplier_addresses_type_chk` | — | — | — |
| `description` | text | NÃO |  | CHECK `supplier_addresses_description_check` | proveedor_direcciones.descripcion | API-SQL | PRV-080 |
| `street_address` | text | NÃO |  | CHECK `supplier_addresses_street_address_check` | proveedor_direcciones.direccion | API-SQL | PRV-081 |
| `house_number` | text | sim |  | CHECK `supplier_addresses_house_number_check` | proveedor_direcciones.numero_casa | API-SQL | PRV-082 |
| `country_code` | text | NÃO |  | CHECK `supplier_addresses_country_chk`; CHECK `supplier_addresses_geo_codes_chk` | proveedor_direcciones.pais_codigo | API-SQL | PRV-083 |
| `department_code` | integer | sim |  | CHECK `supplier_addresses_dep_chk`; CHECK `supplier_addresses_geo_codes_chk` | proveedor_direcciones.departamento_codigo | API-SQL | PRV-085 |
| `district_code` | integer | sim |  | CHECK `supplier_addresses_dis_chk`; CHECK `supplier_addresses_geo_codes_chk` | proveedor_direcciones.distrito_codigo | API-SQL | PRV-086 |
| `city_code` | integer | sim |  | CHECK `supplier_addresses_city_chk`; CHECK `supplier_addresses_geo_codes_chk` | proveedor_direcciones.ciudad_codigo | API-SQL | PRV-087 |
| `department_name` | text | sim |  | CHECK `supplier_addresses_department_name_check` | proveedor_direcciones.departamento | API-SQL | PRV-088 |
| `district_name` | text | sim |  | CHECK `supplier_addresses_district_name_check` | proveedor_direcciones.distrito | API-SQL | PRV-089 |
| `city_name` | text | sim |  | CHECK `supplier_addresses_city_name_check` | proveedor_direcciones.ciudad | API-SQL | PRV-090 |
| `postal_code` | text | sim |  | CHECK `supplier_addresses_postal_code_check` | proveedor_direcciones.codigo_postal | API-SQL | PRV-091 |
| `is_primary` | boolean | NÃO | `false` |  | proveedor_direcciones.es_principal | API-SQL | PRV-092 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `supplier_contacts`  — 20 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | proveedor_contactos.id | API-SQL | PRV-058 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→suppliers(company_id,id) | — | DERIVADO | PRV-060 |
| `supplier_id` | uuid | NÃO |  | FK→suppliers(company_id,id) | proveedor_contactos.proveedor_id | API-SQL | PRV-059 |
| `first_name` | text | NÃO |  | CHECK `supplier_contacts_first_name_check` | proveedor_contactos.nombre | API-SQL | PRV-061 |
| `last_name` | text | sim |  | CHECK `supplier_contacts_last_name_check` | proveedor_contactos.apellido | API-SQL | PRV-062 |
| `job_title` | text | sim |  | CHECK `supplier_contacts_job_title_check` | proveedor_contactos.cargo | API-SQL | PRV-063 |
| `department` | text | sim |  | CHECK `supplier_contacts_department_check` | proveedor_contactos.departamento | API-SQL | PRV-064 |
| `phone` | text | sim |  | CHECK `supplier_contacts_phone_check` | proveedor_contactos.telefono | API-SQL | PRV-065 |
| `mobile` | text | sim |  | CHECK `supplier_contacts_mobile_check` | proveedor_contactos.celular | API-SQL | PRV-066 |
| `email` | text | sim |  | CHECK `supplier_contacts_email_check` | proveedor_contactos.email | API-SQL | PRV-067 |
| `is_primary` | boolean | NÃO | `false` |  | proveedor_contactos.es_principal | API-SQL | PRV-068 |
| `receives_quotations` | boolean | NÃO | `false` |  | proveedor_contactos.recibe_cotizaciones | API-SQL | PRV-069 |
| `receives_purchase_orders` | boolean | NÃO | `false` |  | proveedor_contactos.recibe_ordenes_compra | API-SQL | PRV-070 |
| `receives_logistics` | boolean | NÃO | `false` |  | proveedor_contactos.recibe_logistica | API-SQL | PRV-071 |
| `receives_returns` | boolean | NÃO | `false` |  | proveedor_contactos.recibe_devoluciones | API-SQL | PRV-072 |
| `receives_payments` | boolean | NÃO | `false` |  | proveedor_contactos.recibe_pagos | API-SQL | PRV-073 |
| `receives_quality` | boolean | NÃO | `false` |  | proveedor_contactos.recibe_calidad | API-SQL | PRV-074 |
| `receives_notifications` | boolean | NÃO | `true` |  | proveedor_contactos.recibe_notificaciones | API-SQL | PRV-075 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `supplier_bank_accounts`  — 16 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | proveedor_cuentas_bancarias.id | API-SQL | PRV-093 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→suppliers(company_id,id) | — | DERIVADO | PRV-095 |
| `supplier_id` | uuid | NÃO |  | UQ; FK→suppliers(company_id,id) | proveedor_cuentas_bancarias.proveedor_id | API-SQL | PRV-094 |
| `bank_name` | text | NÃO |  | CHECK `supplier_bank_accounts_bank_name_check` | proveedor_cuentas_bancarias.banco | API-SQL | PRV-096 |
| `bank_branch` | text | sim |  | CHECK `supplier_bank_accounts_bank_branch_check` | proveedor_cuentas_bancarias.sucursal_banco | API-SQL | PRV-097 |
| `account_holder` | text | NÃO |  | CHECK `supplier_bank_accounts_account_holder_check` | proveedor_cuentas_bancarias.titular | API-SQL | PRV-098 |
| `holder_tax_id` | text | sim |  | CHECK `supplier_bank_accounts_holder_tax_id_check` | proveedor_cuentas_bancarias.documento_titular | API-SQL | PRV-099 |
| `account_type` | text | NÃO | `'CORRIENTE'::text` | CHECK `supplier_bank_accounts_type_chk` | — | — | — |
| `account_number` | text | NÃO |  | UQ; CHECK `supplier_bank_accounts_account_number_check` | proveedor_cuentas_bancarias.numero_cuenta | API-SQL | PRV-101 |
| `currency_code` | text | NÃO |  | FK→currencies(code) | proveedor_cuentas_bancarias.moneda_codigo | API-SQL | PRV-102 |
| `alias` | text | sim |  | CHECK `supplier_bank_accounts_alias_check` | proveedor_cuentas_bancarias.alias_cuenta | API-SQL | PRV-103 |
| `swift_code` | text | sim |  | CHECK `supplier_bank_accounts_swift_code_check` | proveedor_cuentas_bancarias.codigo_swift | API-SQL | PRV-104 |
| `iban` | text | sim |  | CHECK `supplier_bank_accounts_iban_check` | proveedor_cuentas_bancarias.iban | API-SQL | PRV-105 |
| `is_primary` | boolean | NÃO | `false` |  | proveedor_cuentas_bancarias.es_principal | API-SQL | PRV-106 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `supplier_documents`  — 12 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | proveedor_documentos.id | API-SQL | PRV-117 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→users(company_id,id); FK→suppliers(company_id,id) | — | DERIVADO | PRV-119 |
| `supplier_id` | uuid | NÃO |  | FK→suppliers(company_id,id) | proveedor_documentos.proveedor_id | API-SQL | PRV-118 |
| `document_type` | text | NÃO | `'OTRO'::text` | CHECK `supplier_documents_type_chk` | — | — | — |
| `file_name` | text | NÃO |  | CHECK `supplier_documents_file_name_check` | proveedor_documentos.nombre_archivo | API-SQL | PRV-121 |
| `file_url` | text | NÃO |  | CHECK `supplier_documents_file_url_check` | proveedor_documentos.url_archivo | API-SQL | PRV-122 |
| `issue_date` | date | sim |  | CHECK `supplier_documents_dates_chk` | proveedor_documentos.fecha_emision | API-SQL | PRV-123 |
| `expiry_date` | date | sim |  | CHECK `supplier_documents_dates_chk` | proveedor_documentos.fecha_vencimiento | API-SQL | PRV-124 |
| `notes` | text | sim |  | CHECK `supplier_documents_notes_check` | proveedor_documentos.observacion | API-SQL | PRV-125 |
| `created_by` | uuid | sim |  | FK→users(company_id,id) | proveedor_documentos.cargado_por | SESSAO | PRV-126 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `supplier_groups`  — 7 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | grupos_proveedor.id | API-SQL | PRV-127 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id) | grupos_proveedor.empresa_id | API-SQL | PRV-130 |
| `code` | text | sim |  |  | grupos_proveedor.codigo | API-SQL | PRV-128 |
| `name` | text | NÃO |  | CHECK `supplier_groups_name_check` | grupos_proveedor.nombre | DERIVADO, API-SQL | PRV-007, PRV-129 |
| `is_active` | boolean | NÃO | `true` |  | grupos_proveedor.activo | API-SQL | PRV-131 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `supplier_withholdings`  — 12 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | proveedor_retenciones.id | API-SQL | PRV-107 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→suppliers(company_id,id) | — | DERIVADO | PRV-109 |
| `supplier_id` | uuid | NÃO |  | FK→suppliers(company_id,id) | proveedor_retenciones.proveedor_id | API-SQL | PRV-108 |
| `withholding_type` | text | NÃO |  | CHECK `supplier_withholdings_type_chk` | — | — | — |
| `rate_pct` | numeric(5,2) | NÃO |  | CHECK `supplier_withholdings_rate_chk` | proveedor_retenciones.porcentaje | API-SQL | PRV-111 |
| `certificate_required` | boolean | NÃO | `false` |  | proveedor_retenciones.certificado_obligatorio | API-SQL | PRV-112 |
| `valid_from` | date | sim |  | CHECK `supplier_withholdings_valid_chk` | proveedor_retenciones.fecha_vigencia_desde | API-SQL | PRV-113 |
| `valid_to` | date | sim |  | CHECK `supplier_withholdings_valid_chk` | proveedor_retenciones.fecha_vigencia_hasta | API-SQL | PRV-114 |
| `notes` | text | sim |  | CHECK `supplier_withholdings_notes_check` | proveedor_retenciones.observacion | API-SQL | PRV-115 |
| `tax_id` | uuid | sim |  | FK→taxes(id) | proveedor_retenciones.impuesto_id | API-SQL | PRV-116 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

## Productos (P003)


### `products`  — 50 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | productos.id | DEMO-localStorage, API-SQL | FAC-103, PRO-001 |
| `company_id` | uuid | NÃO |  | UQ; FK→product_brands(company_id,id); FK→product_categories(company_id,id); FK→companies(id); FK→users(company_id,id) | productos.empresa_id | SESSAO | PRO-002 |
| `code` | text | NÃO |  | UQ; CHECK `products_code_chk` | productos.codigo | DEMO-localStorage, API-SQL | FAC-104, PRO-003 |
| `inventory_code` | text | sim |  |  | — | DEMO-localStorage | PRO-004 |
| `sifen_code` | text | sim |  | CHECK `products_sifen_code_chk` | productos.codigo_sifen | API-SQL | PRO-005 |
| `barcode` | text | sim |  | CHECK `products_barcode_chk` | productos.codigo_barras | API-SQL | PRO-006 |
| `description` | text | NÃO |  | CHECK `products_description_chk` | productos.descripcion | DEMO-localStorage, API-SQL | FAC-105, PRO-007 |
| `invoice_description` | text | NÃO |  | CHECK `products_invoice_desc_chk` | productos.descripcion_factura | API-SQL | PRO-008 |
| `product_type` | text | NÃO | `'MERCADERIA'::text` | CHECK `products_type_chk` | productos.tipo_producto | API-SQL | PRO-009 |
| `category_id` | uuid | sim |  | FK→product_categories(company_id,id) | productos.categoria_id | API-SQL | PRO-010 |
| `brand_id` | uuid | sim |  | FK→product_brands(company_id,id) | productos.marca_id | API-SQL | PRO-012 |
| `family_id` | uuid | sim |  |  | — | DEMO-localStorage | PRO-014 |
| `line_id` | uuid | sim |  |  | — | DEMO-localStorage | PRO-015 |
| `origin_label` | text | sim |  |  | — | DEMO-localStorage | PRO-016 |
| `unit_of_measure_id` | uuid | NÃO |  | FK→units_of_measure(id) | productos.unidad_medida_id | API-SQL | PRO-017 |
| `tax_id` | uuid | sim |  | FK→taxes(id) | productos.impuesto_id | API-SQL | PRO-019 |
| `tracks_stock` | boolean | NÃO | `true` |  | productos.controla_stock | API-SQL | PRO-021 |
| `stock_control_mode` | text | NÃO | `'CANTIDAD'::text` | CHECK `products_stock_mode_chk` | productos.modo_control_stock | API-SQL | PRO-022 |
| `allows_third_party_stock` | boolean | NÃO | `false` |  | productos.permite_terceros | API-SQL | PRO-023 |
| `requires_expiry` | boolean | NÃO | `false` |  | productos.requiere_vencimiento | API-SQL | PRO-024 |
| `min_stock` | numeric(18,4) | NÃO | `0` | CHECK `products_min_stock_chk` | productos.stock_minimo | DEMO-localStorage, API-SQL | STK-015, PRO-025 |
| `max_stock` | numeric(18,4) | sim |  | CHECK `products_max_stock_chk` | productos.stock_maximo; producto_deposito_configuracion.stoc | DEMO-localStorage, API-SQL | STK-016, PRO-026 |
| `reorder_point` | numeric(18,4) | sim |  | CHECK `products_reorder_point_chk` | productos.punto_reposicion; producto_deposito_configuracion. | DEMO-localStorage, API-SQL | STK-017, PRO-027 |
| `average_cost` | numeric(18,4) | NÃO | `0` | CHECK `products_average_cost_chk` | productos.costo_promedio | DEMO-localStorage, API-SQL | STK-028, PRO-030 |
| `tariff_heading` | text | sim |  | CHECK `products_tariff_chk` | productos.partida_arancelaria | API-SQL | PRO-033 |
| `ncm` | text | sim |  | CHECK `products_ncm_chk` | productos.ncm | API-SQL | PRO-034 |
| `dncp_general_code` | text | sim |  | CHECK `products_dncp_gen_chk` | productos.dncp_general | API-SQL | PRO-035 |
| `dncp_specific_code` | text | sim |  | CHECK `products_dncp_spec_chk` | productos.dncp_especifico | API-SQL | PRO-036 |
| `origin_country_code` | text | sim |  | CHECK `products_origin_country_chk` | productos.pais_origen_codigo | API-SQL | PRO-037 |
| `origin_country_name` | text | sim |  | CHECK `products_origin_country_name_chk` | productos.pais_origen_nombre | API-SQL | PRO-038 |
| `invoice_additional_info` | text | sim |  | CHECK `products_invoice_info_chk` | productos.informacion_factura | API-SQL | PRO-039 |
| `goods_relation` | smallint | sim |  | CHECK `products_goods_relation_chk` | productos.relacion_mercaderia | API-SQL | PRO-040 |
| `shrinkage_percent` | numeric(7,4) | sim |  | CHECK `products_shrink_pct_chk` | productos.porcentaje_merma | API-SQL | PRO-041 |
| `shrinkage_quantity` | numeric(18,4) | sim |  | CHECK `products_shrink_qty_chk` | productos.cantidad_merma | API-SQL | PRO-042 |
| `is_sellable` | boolean | NÃO | `true` |  | productos.vendible | API-SQL | PRO-043 |
| `is_purchasable` | boolean | NÃO | `true` |  | productos.comprable | API-SQL | PRO-044 |
| `requires_quality_inspection` | boolean | NÃO | `false` |  | productos.requiere_inspeccion_calidad | API-SQL | PRO-045 |
| `shelf_life_days` | integer | sim |  | CHECK `products_shelf_life_chk` | productos.vida_util_dias | API-SQL | PRO-046 |
| `net_weight_kg` | numeric(18,4) | sim |  | CHECK `products_net_weight_chk` | productos.peso_neto_kg | API-SQL | PRO-047 |
| `gross_weight_kg` | numeric(18,4) | sim |  | CHECK `products_gross_weight_chk` | productos.peso_bruto_kg | API-SQL | PRO-048 |
| `length_cm` | numeric(18,4) | sim |  | CHECK `products_length_chk` | productos.largo_cm | API-SQL | PRO-049 |
| `width_cm` | numeric(18,4) | sim |  | CHECK `products_width_chk` | productos.ancho_cm | API-SQL | PRO-050 |
| `height_cm` | numeric(18,4) | sim |  | CHECK `products_height_chk` | productos.alto_cm | API-SQL | PRO-051 |
| `volume_m3` | numeric(18,4) | sim |  | CHECK `products_volume_chk` | — | — | — |
| `image_url` | text | sim |  |  | productos.imagen_url | API-SQL | PRO-053 |
| `notes` | text | sim |  | CHECK `products_notes_chk` | productos.observacion | API-SQL | PRO-054 |
| `is_active` | boolean | NÃO | `true` |  | productos.activo | API-SQL | PRO-055 |
| `created_by` | uuid | sim |  | FK→users(company_id,id) | — | SESSAO | PRO-065 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | DEMO-localStorage | PRO-063 |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | DEMO-localStorage | PRO-064 |

### `product_brands`  — 7 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | marcas_producto.id | API-SQL | PRO-123 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id) | — | — | — |
| `code` | text | sim |  |  | — | — | — |
| `name` | text | NÃO |  | CHECK `product_brands_name_check` | marcas_producto.nombre | API-SQL | PRO-124 |
| `is_active` | boolean | NÃO | `true` |  | — | — | — |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `product_categories`  — 7 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | categorias_producto.id | API-SQL | PRO-120 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id) | — | — | — |
| `code` | text | sim |  |  | categorias_producto.codigo | API-SQL | PRO-121 |
| `name` | text | NÃO |  | CHECK `product_categories_name_check` | categorias_producto.nombre | API-SQL | PRO-122 |
| `is_active` | boolean | NÃO | `true` |  | — | — | — |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `product_codes`  — 9 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | — | — | — |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→products(company_id,id) | — | — | — |
| `product_id` | uuid | NÃO |  | UQ; FK→products(company_id,id) | producto_codigos.producto_id | API-SQL | PRO-161 |
| `code_type` | text | NÃO | `'GTIN'::text` | UQ; CHECK `product_codes_gtin_format_chk`; CHECK `product_codes_type_chk` | producto_codigos.tipo | API-SQL | PRO-067 |
| `code` | text | NÃO |  | UQ; CHECK `product_codes_code_check`; CHECK `product_codes_gtin_format_chk` | producto_codigos.codigo | API-SQL | PRO-068 |
| `description` | text | sim |  | CHECK `product_codes_description_check` | producto_codigos.descripcion | API-SQL | PRO-069 |
| `is_primary` | boolean | NÃO | `false` |  | producto_codigos.es_principal | API-SQL | PRO-070 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `product_units`  — 14 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | — | — | — |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→products(company_id,id) | — | — | — |
| `product_id` | uuid | NÃO |  | FK→products(company_id,id) | producto_unidades.producto_id | API-SQL | PRO-162 |
| `unit_of_measure_id` | uuid | NÃO |  | FK→units_of_measure(id) | producto_unidades.unidad_medida_id | API-SQL | PRO-072 |
| `presentation_name` | text | NÃO |  | CHECK `product_units_presentation_name_check` | producto_unidades.nombre_presentacion | API-SQL | PRO-073 |
| `conversion_factor` | numeric(18,6) | NÃO |  | CHECK `product_units_factor_chk` | producto_unidades.factor_conversion | API-SQL | PRO-074 |
| `is_base_unit` | boolean | NÃO | `false` |  | producto_unidades.es_unidad_base | API-SQL | PRO-075 |
| `is_purchase_unit` | boolean | NÃO | `false` |  | producto_unidades.es_unidad_compra | API-SQL | PRO-076 |
| `is_sales_unit` | boolean | NÃO | `true` |  | producto_unidades.es_unidad_venta | API-SQL | PRO-077 |
| `barcode` | text | sim |  | CHECK `product_units_barcode_check` | producto_unidades.codigo_barras | API-SQL | PRO-078 |
| `gross_weight_kg` | numeric(18,4) | sim |  | CHECK `product_units_weight_chk` | producto_unidades.peso_bruto_kg | API-SQL | PRO-079 |
| `volume_m3` | numeric(18,4) | sim |  | CHECK `product_units_volume_chk` | — | — | — |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `product_warehouse_settings`  — 11 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | — | — | — |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→products(company_id,id); FK→warehouses(company_id,id) | — | — | — |
| `product_id` | uuid | NÃO |  | UQ; FK→products(company_id,id) | producto_deposito_configuracion.producto_id | API-SQL | PRO-164 |
| `warehouse_id` | uuid | NÃO |  | UQ; FK→warehouses(company_id,id) | producto_deposito_configuracion.deposito_id | API-SQL | PRO-094 |
| `preferred_location_id` | uuid | sim |  |  | producto_deposito_configuracion.ubicacion_preferida_id | API-SQL | PRO-096 |
| `min_stock` | numeric(18,4) | sim |  | CHECK `pws_min_chk` | productos.stock_minimo, producto_deposito_configuracion.stoc | DEMO-localStorage, API-SQL | STK-015, PRO-097 |
| `max_stock` | numeric(18,4) | sim |  | CHECK `pws_max_chk` | productos.stock_maximo; producto_deposito_configuracion.stoc | DEMO-localStorage, API-SQL | STK-016, PRO-098 |
| `reorder_point` | numeric(18,4) | sim |  | CHECK `pws_reorder_point_chk` | productos.punto_reposicion; producto_deposito_configuracion. | DEMO-localStorage, API-SQL | STK-017, PRO-099 |
| `reorder_quantity` | numeric(18,4) | sim |  | CHECK `pws_reorder_qty_chk` | producto_deposito_configuracion.cantidad_reposicion | API-SQL | PRO-100 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `product_suppliers`  — 15 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | — | — | — |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→products(company_id,id); FK→suppliers(company_id,id) | — | — | — |
| `product_id` | uuid | NÃO |  | FK→products(company_id,id) | producto_proveedores.producto_id | API-SQL | PRO-163 |
| `supplier_id` | uuid | NÃO |  | FK→suppliers(company_id,id) | producto_proveedores.proveedor_id | API-SQL | PRO-082 |
| `supplier_code` | text | sim |  | CHECK `product_suppliers_supplier_code_check` | producto_proveedores.codigo_proveedor | API-SQL | PRO-084 |
| `supplier_description` | text | sim |  | CHECK `product_suppliers_supplier_description_check` | producto_proveedores.descripcion_proveedor | API-SQL | PRO-085 |
| `unit_of_measure_id` | uuid | sim |  | FK→units_of_measure(id) | producto_proveedores.unidad_medida_id | API-SQL | PRO-086 |
| `conversion_factor` | numeric(18,6) | NÃO | `1` | CHECK `product_suppliers_factor_chk` | producto_proveedores.factor_conversion | API-SQL | PRO-087 |
| `reference_cost` | numeric(18,4) | sim |  | CHECK `product_suppliers_cost_chk` | producto_proveedores.costo_referencia | API-SQL | PRO-088 |
| `currency_code` | text | sim |  | FK→currencies(code) | producto_proveedores.moneda_codigo | API-SQL | PRO-089 |
| `min_purchase_quantity` | numeric(18,4) | sim |  | CHECK `product_suppliers_minqty_chk` | producto_proveedores.cantidad_minima_compra | API-SQL | PRO-090 |
| `lead_time_days` | integer | sim |  | CHECK `product_suppliers_lead_chk` | producto_proveedores.plazo_entrega_dias | API-SQL | PRO-091 |
| `is_primary` | boolean | NÃO | `false` |  | producto_proveedores.es_principal | API-SQL | PRO-092 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `product_alternatives`  — 8 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | — | — | — |
| `company_id` | uuid | NÃO |  | UQ; FK→products(company_id,id); FK→companies(id) | — | — | — |
| `product_id` | uuid | NÃO |  | FK→products(company_id,id); CHECK `product_alternatives_not_self_chk` | producto_alternativos.producto_id | API-SQL | PRO-165 |
| `alternative_product_id` | uuid | NÃO |  | FK→products(company_id,id); CHECK `product_alternatives_not_self_chk` | producto_alternativos.producto_alternativo_id | API-SQL | PRO-102 |
| `alternative_type` | text | NÃO | `'SUSTITUTO'::text` | CHECK `product_alternatives_type_chk` | producto_alternativos.tipo | API-SQL | PRO-104 |
| `priority` | integer | NÃO | `1` | CHECK `product_alternatives_priority_chk` | producto_alternativos.prioridad | API-SQL | PRO-105 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `product_components`  — 9 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | — | — | — |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→products(company_id,id) | — | — | — |
| `kit_product_id` | uuid | NÃO |  | FK→products(company_id,id); CHECK `product_components_not_self_chk` | producto_componentes.producto_kit_id | API-SQL | PRO-166 |
| `component_product_id` | uuid | NÃO |  | FK→products(company_id,id); CHECK `product_components_not_self_chk` | producto_componentes.producto_componente_id | API-SQL | PRO-107 |
| `quantity` | numeric(18,4) | NÃO |  | CHECK `product_components_qty_chk` | producto_componentes.cantidad | API-SQL | PRO-109 |
| `is_optional` | boolean | NÃO | `false` |  | producto_componentes.es_opcional | API-SQL | PRO-110 |
| `sort_order` | integer | NÃO | `1` | CHECK `product_components_order_chk` | producto_componentes.orden | API-SQL | PRO-111 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `product_documents`  — 12 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | — | — | — |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→products(company_id,id); FK→users(company_id,id) | — | — | — |
| `product_id` | uuid | NÃO |  | FK→products(company_id,id) | producto_documentos.producto_id | API-SQL | PRO-167 |
| `document_type` | text | NÃO | `'FICHA_TECNICA'::text` | CHECK `product_documents_type_chk` | producto_documentos.tipo | API-SQL | PRO-113 |
| `file_name` | text | NÃO |  | CHECK `product_documents_file_name_check` | producto_documentos.nombre_archivo | API-SQL | PRO-114 |
| `file_url` | text | NÃO |  | CHECK `product_documents_file_url_check` | producto_documentos.url_archivo | API-SQL | PRO-115 |
| `issued_on` | date | sim |  | CHECK `product_documents_dates_chk` | producto_documentos.fecha_emision | API-SQL | PRO-116 |
| `expires_on` | date | sim |  | CHECK `product_documents_dates_chk` | producto_documentos.fecha_vencimiento | API-SQL | PRO-117 |
| `notes` | text | sim |  | CHECK `product_documents_notes_check` | producto_documentos.observacion | API-SQL | PRO-118 |
| `uploaded_by` | uuid | sim |  | FK→users(company_id,id) | producto_documentos.cargado_por | SESSAO | PRO-119 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

## Stock, movimientos e custo (P005/P007)


### `stock_balances`  — 11 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | — | — | — |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→stock_lots(company_id,product_id,id); FK→products(company_id,id); FK→warehouses(company_id,id) | — | SESSAO | STK-080 |
| `product_id` | uuid | NÃO |  | FK→stock_lots(company_id,product_id,id); FK→products(company_id,id) | — | DEMO-localStorage | STK-002 |
| `warehouse_id` | uuid | NÃO |  | FK→warehouses(company_id,id) | — | DEMO-localStorage | STK-036, STK-050 |
| `stock_state` | text | NÃO |  | CHECK `stock_balances_state_chk` | — | DEMO-localStorage | STK-049 |
| `lot_id` | uuid | sim |  | FK→stock_lots(company_id,product_id,id) | — | DEMO-localStorage, DERIVADO | STK-033, STK-081 |
| `ownership` | text | NÃO | `'PROPIO'::text` | CHECK `stock_balances_owner_chk`; CHECK `stock_balances_ownership_chk` | — | — | — |
| `owner_id` | uuid | sim |  | CHECK `stock_balances_owner_chk` | — | DEMO-localStorage | STK-025, STK-051 |
| `quantity` | numeric(18,4) | NÃO | `0` | CHECK `stock_balances_qty_chk` | — | DEMO-localStorage | STK-018, STK-019, STK-020 … |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | DEMO-localStorage | STK-034 |

### `stock_lots`  — 7 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | — | DEMO-localStorage | STK-045 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→products(company_id,id) | — | — | — |
| `product_id` | uuid | NÃO |  | UQ; FK→products(company_id,id) | — | DERIVADO | STK-082 |
| `lot_code` | text | NÃO |  | UQ; CHECK `stock_lots_code_chk` | — | DEMO-localStorage | STK-046 |
| `expiry_date` | date | sim |  |  | — | DEMO-localStorage | STK-047 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `inventory_movements`  — 18 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | — | DEMO-localStorage | MOV-001 |
| `company_id` | uuid | NÃO |  | UQ; FK→branches(company_id,id); FK→companies(id); FK→users(company_id,id); FK→warehouses(company_id,id) | — | SESSAO | MOV-030 |
| `movement_number` | text | NÃO |  | UQ; CHECK `inventory_movements_number_chk` | — | DEMO-localStorage | MOV-002 |
| `movement_type` | text | NÃO |  | CHECK `inventory_movements_transfer_chk`; CHECK `inventory_movements_type_chk`; CHECK `inventory_movements_warehouses_chk` | — | DEMO-localStorage | MOV-003 |
| `source_type` | text | NÃO |  | CHECK `inventory_movements_source_type_chk` | — | DEMO-localStorage | MOV-004 |
| `status` | text | NÃO | `'REGISTRADO'::text` | CHECK `inventory_movements_status_chk` | — | DEMO-localStorage | MOV-005 |
| `movement_date` | date | NÃO |  |  | — | DEMO-localStorage | MOV-006 |
| `movement_time` | time without time zone | NÃO |  |  | — | DEMO-localStorage | MOV-007 |
| `branch_id` | uuid | sim |  | FK→branches(company_id,id) | — | DERIVADO | MOV-031 |
| `source_warehouse_id` | uuid | sim |  | FK→warehouses(company_id,id); CHECK `inventory_movements_transfer_chk`; CHECK `inventory_movements_warehouses_chk` | — | DEMO-localStorage | MOV-012 |
| `destination_warehouse_id` | uuid | sim |  | FK→warehouses(company_id,id); CHECK `inventory_movements_transfer_chk`; CHECK `inventory_movements_warehouses_chk` | — | DEMO-localStorage | MOV-015 |
| `reference_document` | text | sim |  |  | — | DEMO-localStorage, DERIVADO | MOV-024, REC-037 |
| `reason` | text | sim |  |  | — | DEMO-localStorage | MOV-025 |
| `notes` | text | sim |  |  | — | DEMO-localStorage | MOV-026 |
| `authorization_id` | uuid | sim |  |  | — | DERIVADO | MOV-032 |
| `created_by` | uuid | NÃO |  | FK→users(company_id,id) | — | DEMO-localStorage | MOV-027 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | DEMO-localStorage | MOV-028 |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

### `inventory_movement_lines`  — 14 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | — | — | — |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→stock_lots(company_id,product_id,id); FK→inventory_movements(company_id,id); FK→products(company_id,id); FK→goods_receipt_lines(company_id,id) | — | — | — |
| `movement_id` | uuid | NÃO |  | FK→inventory_movements(company_id,id) | — | DERIVADO | MOV-041 |
| `product_id` | uuid | NÃO |  | FK→stock_lots(company_id,product_id,id); FK→products(company_id,id) | — | DEMO-localStorage | MOV-008 |
| `quantity` | numeric(18,4) | NÃO |  | CHECK `inventory_movement_lines_qty_chk` | — | DEMO-localStorage | MOV-018 |
| `lot_id` | uuid | sim |  | FK→stock_lots(company_id,product_id,id) | — | DEMO-localStorage | MOV-019 |
| `expiry_date` | date | sim |  |  | — | DEMO-localStorage | MOV-020 |
| `ownership` | text | NÃO | `'PROPIO'::text` | CHECK `inventory_movement_lines_owner_chk`; CHECK `inventory_movement_lines_ownership_chk` | — | — | — |
| `owner_id` | uuid | sim |  | CHECK `inventory_movement_lines_owner_chk` | — | DEMO-localStorage | MOV-022 |
| `goods_receipt_line_id` | uuid | sim |  | FK→goods_receipt_lines(company_id,id) | — | — | — |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `unit_cost` | numeric(18,4) | sim |  | CHECK `inventory_movement_lines_cost_chk` | — | — | — |
| `total_cost` | numeric(18,4) | sim |  | CHECK `inventory_movement_lines_cost_chk` | — | — | — |
| `cost_currency_code` | text | sim |  | FK→currencies(code); CHECK `inventory_movement_lines_cost_chk` | — | — | — |

### `inventory_costs`  — 9 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | — | — | — |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→products(company_id,id); FK→warehouses(company_id,id) | — | — | — |
| `product_id` | uuid | NÃO |  | UQ; FK→products(company_id,id) | — | — | — |
| `warehouse_id` | uuid | NÃO |  | UQ; FK→warehouses(company_id,id) | — | — | — |
| `valued_quantity` | numeric(18,4) | NÃO | `0` | CHECK `inventory_costs_qty_chk`; CHECK `inventory_costs_zero_chk` | — | — | — |
| `total_value` | numeric(18,4) | NÃO | `0` | CHECK `inventory_costs_value_chk`; CHECK `inventory_costs_zero_chk` | — | — | — |
| `average_cost` | numeric(18,4) | NÃO | `0` | CHECK `inventory_costs_avg_chk` | — | — | — |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |

## Ventas — somente o necessário para o relatório ao custo (P006/P007)


### `invoices`  — 35 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | — | DEMO-localStorage | FAC-001 |
| `company_id` | uuid | NÃO |  | UQ; FK→branches(company_id,id); FK→companies(id); FK→users(company_id,id); FK→customers(company_id,id) | — | SESSAO | FAC-002 |
| `branch_id` | uuid | NÃO |  | FK→branches(company_id,id) | — | UI-only | FAC-003 |
| `customer_id` | uuid | NÃO |  | FK→customers(company_id,id) | — | DEMO-localStorage | FAC-017, FAC-018 |
| `internal_number` | text | NÃO |  | UQ; CHECK `invoices_internal_number_chk` | — | DEMO-localStorage | FAC-004 |
| `status` | text | NÃO | `'BORRADOR'::text` | CHECK `invoices_status_chk` | — | DEMO-localStorage, DERIVADO | FAC-005, FAC-110, FAC-111 |
| `establishment_code` | text | NÃO | `'001'::text` | UQ; CHECK `invoices_establishment_chk` | — | DEMO-localStorage | FAC-006 |
| `establishment_description` | text | NÃO |  |  | — | DEMO-localStorage | FAC-007 |
| `issuance_point_code` | text | NÃO | `'001'::text` | UQ; CHECK `invoices_issuance_point_chk` | — | DEMO-localStorage | FAC-008 |
| `issuance_point_description` | text | NÃO |  |  | — | DEMO-localStorage | FAC-009 |
| `sequence_number` | text | NÃO |  | UQ; CHECK `invoices_sequence_chk` | — | DEMO-localStorage | FAC-010 |
| `issue_date` | date | NÃO |  |  | — | DEMO-localStorage | FAC-011 |
| `currency_code` | text | NÃO | `'PYG'::text` | FK→currencies(code); CHECK `invoices_currency_chk` | — | DEMO-localStorage | FAC-012 |
| `operation_condition` | text | NÃO | `'CONTADO'::text` | CHECK `invoices_operation_condition_chk` | — | DEMO-localStorage | FAC-013 |
| `transaction_type` | text | NÃO | `'VENTA_MERCADERIA'::text` | CHECK `invoices_transaction_type_chk` | — | DEMO-localStorage | FAC-014 |
| `presence_indicator` | text | NÃO | `'PRESENCIAL'::text` | CHECK `invoices_presence_indicator_chk` | — | DEMO-localStorage | FAC-015 |
| `additional_information` | text | sim | `''::text` |  | — | DEMO-localStorage | FAC-016 |
| `customer_code` | text | NÃO |  |  | — | DEMO-localStorage | FAC-019 |
| `customer_nature` | text | NÃO | `'CONTRIBUYENTE'::text` | CHECK `invoices_customer_nature_chk` | — | DEMO-localStorage | FAC-020 |
| `customer_taxpayer_type` | text | NÃO | `'PERSONA_JURIDICA'::text` | CHECK `invoices_customer_taxpayer_type_chk` | — | DEMO-localStorage | FAC-021 |
| `customer_document_type` | text | NÃO | `'RUC'::text` |  | — | DEMO-localStorage | FAC-022 |
| `customer_tax_id` | text | sim | `''::text` |  | — | DEMO-localStorage | FAC-023 |
| `customer_tax_id_check_digit` | text | sim | `''::text` |  | — | DEMO-localStorage | FAC-024 |
| `customer_legal_name` | text | NÃO | `'SIN NOMBRE'::text` |  | — | DEMO-localStorage | FAC-025 |
| `customer_email` | text | sim | `''::text` |  | — | DEMO-localStorage | FAC-026 |
| `customer_phone` | text | sim | `''::text` |  | — | DEMO-localStorage | FAC-027 |
| `customer_mobile` | text | sim | `''::text` |  | — | DEMO-localStorage | FAC-028 |
| `customer_address` | text | sim | `''::text` |  | — | DEMO-localStorage | FAC-029 |
| `customer_house_number` | text | NÃO | `'0'::text` |  | — | DEMO-localStorage | FAC-030 |
| `total_amount` | numeric(18,4) | NÃO |  | CHECK `invoices_total_amount_check` | — | DERIVADO | FAC-071, FAC-084, FAC-112 … |
| `cdc` | text | sim |  | UQ; CHECK `invoices_cdc_digits_chk` | — | DEMO-localStorage | FAC-085 |
| `sifen_message` | text | sim |  |  | — | DEMO-localStorage | FAC-086 |
| `created_by` | uuid | sim |  | FK→users(company_id,id) | — | SESSAO | FAC-089 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | DEMO-localStorage | FAC-087 |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | DEMO-localStorage | FAC-088 |

### `invoice_lines`  — 17 colunas · RLS ENABLE+FORCE

| Coluna | Tipo | Nulo | Default | Chave / restrição | Legado | Origem hoje | Mapa |
|---|---|---|---|---|---|---|---|
| `id` | uuid | NÃO | `gen_random_uuid()` | PK; UQ | — | DEMO-localStorage | FAC-056 |
| `company_id` | uuid | NÃO |  | UQ; FK→companies(id); FK→invoices(company_id,id); FK→inventory_movement_lines(company_id,id); FK→products(company_id,id) | — | UI-only | FAC-067 |
| `invoice_id` | uuid | NÃO |  | UQ; FK→invoices(company_id,id) | — | UI-only | FAC-067 |
| `line_number` | integer | NÃO |  | UQ; CHECK `invoice_lines_line_number_check` | — | UI-only | FAC-066 |
| `product_id` | uuid | NÃO |  | FK→products(company_id,id) | — | DEMO-localStorage | FAC-057 |
| `product_code` | text | NÃO |  |  | — | DEMO-localStorage | FAC-058 |
| `description` | text | NÃO |  |  | — | DEMO-localStorage | FAC-059 |
| `vat_treatment` | text | NÃO |  | CHECK `invoice_lines_vat_treatment_chk` | — | DEMO-localStorage | FAC-060 |
| `vat_rate` | smallint | NÃO |  | CHECK `invoice_lines_vat_rate_chk` | — | DEMO-localStorage | FAC-061 |
| `tax_id` | uuid | sim |  | FK→taxes(id) | — | — | — |
| `unit_of_measure_name` | text | NÃO | `'Unidad'::text` |  | — | DEMO-localStorage | FAC-062 |
| `quantity` | numeric(18,4) | NÃO | `1` | CHECK `invoice_lines_quantity_chk`; CHECK `invoice_lines_total_chk` | — | DEMO-localStorage | FAC-063 |
| `unit_price` | numeric(18,4) | NÃO |  | CHECK `invoice_lines_total_chk`; CHECK `invoice_lines_unit_price_chk` | — | DEMO-localStorage | FAC-064 |
| `line_total` | numeric(18,4) | NÃO |  | CHECK `invoice_lines_total_chk` | — | DERIVADO | FAC-065 |
| `created_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `updated_at` | timestamp with time zone | NÃO | `now()` |  | — | — | — |
| `inventory_movement_line_id` | uuid | sim |  | FK→inventory_movement_lines(company_id,id) | — | — | — |

## Fora da V1 (existem no esquema proposto, **não** documentados aqui)

`goods_receipt_lines`, `goods_receipts`, `invoice_exports`, `invoice_payments`, `invoice_public_procurements`, `invoice_taxes`, `price_list_item_tiers`, `price_list_items`, `price_list_rules`, `price_lists`

São listas de preços (P004), recepções (P006/P005), faturamento além das linhas de venda (P006). Seguem no mapa campo a campo e nas propostas, sem prioridade V1.


## Funções e views de P007

- `weighted_average_cost(prev_qty, prev_value, in_qty, in_value)` — custo médio ponderado (retorna 0 se a quantidade total for 0).
- `inventory_post_line(...)` — única porta para movimentar saldo e custo; ver `CUSTEIO-V1.md`.
- Views `inventory_valuation_v`, `sales_at_cost_v`, `inventory_cost_reconciliation_v` (`security_invoker`, exigem PostgreSQL ≥ 15).


## Autoverificação

- Tabelas documentadas: 56 · colunas documentadas: 701 (extraídas do catálogo, não digitadas).
- Verdadeiro apenas para o **esquema proposto** validado em PostgreSQL 16 descartável; nenhuma coluna foi comparada ao banco real (F-001 externo).
