# DistribuNex — Modelo de dados atual

Requisito: REQ-2026-001 (RN-03, RN-06, CA-03) · Autor: Claude · Data: 2026-10-08 · Base: `main` @ `7f4230a`

## 1. Situação do inventário SQL: **NAO_VERIFICADO**

| Item | Situação | Motivo |
|---|---|---|
| Introspecção do PostgreSQL (tabelas, colunas, tipos, índices, constraints, funções, triggers, políticas) | **NAO_VERIFICADO** | Não houve acesso autorizado a nenhum banco do sistema (dependência declarada no REQ-2026-001). Nenhuma conexão foi tentada |
| Scripts SQL no repositório | **Inexistentes** | Busca em todo o histórico (`git log --all -- '*.sql'`): 0 arquivos em todas as branches (17 commits na `main`) |
| Scripts SQL fora do repositório | **NAO_VERIFICADO** | O `README.md` cita migrations numeradas até `017_administrador_inicial.sql`, que não estão em nenhum commit. Sua localização precisa ser informada pelo responsável (RN-06) |

**Consequência:** este documento descreve o modelo **que o código espera encontrar**, inferido das consultas SQL das 5 rotas de API e de `lib/auth`. Não é o esquema real. Tipos, nulabilidade, chaves, índices e constraints só serão confirmados pela introspecção (ver §5). Nenhum script de criação foi gerado, conforme o não escopo do REQ.

## 2. Tabelas referenciadas pelo código (46)

Colunas listadas = colunas citadas em `INSERT`, `SELECT` ou `WHERE`. A tabela pode ter outras colunas. "Escopo" indica se o código filtra por `empresa_id`.

### 2.1 Segurança e organização

| Tabela | Operações | Escopo | Colunas citadas | Referências |
|---|---|---|---|---|
| `empresas` | SELECT | — | id, codigo, activo | `app/api/auth/login/route.ts:128` |
| `usuarios` | SELECT, UPDATE | empresa | id, empresa_id, sucursal_id, usuario, nombre, apellido, email, estado, intentos_fallidos, bloqueado_hasta, ultimo_acceso_at, password_hash | `login/route.ts:128,172,181,225`; `lib/auth/session.ts:109` |
| `sesiones_usuario` | INSERT, SELECT, UPDATE | via usuário | id, usuario_id, token_hash, ip, user_agent, expira_at, revocada_at | `login/route.ts:234`; `logout/route.ts:41`; `session.ts:109` |
| `eventos_seguridad` | INSERT | empresa | empresa_id, usuario_id, tipo, detalle, ip, user_agent | `login/route.ts:150,193,249` |
| `perfiles` | SELECT | NAO_VERIFICADO | id, codigo, activo, es_administrador | `session.ts:109`; `lib/auth/permissions.ts:15` |
| `usuario_perfil` | SELECT | — | usuario_id, perfil_id | idem |
| `permisos` | SELECT | — | id, recurso, accion | `permissions.ts:15` (código sem uso) |
| `perfil_permiso` | SELECT | — | perfil_id, permiso_id | `permissions.ts:15` (código sem uso) |

`usuarios.sucursal_id` é lido, mas nenhuma regra o usa. Não existe tabela `sucursales` referenciada.

### 2.2 Clientes

| Tabela | Operações | Escopo | Colunas citadas | Referências |
|---|---|---|---|---|
| `clientes` | SELECT, INSERT | empresa | 48 colunas, entre elas: empresa_id, codigo, codigo_externo, tipo_persona, naturaleza_receptor, tipo_operacion, tipo_contribuyente_sifen, tipo_documento, tipo_documento_identidad_sifen, numero_documento, dv, razon_social, nombre_fantasia, pais_codigo, pais_nombre, emails (4), telefono, celular, gln, grupo_cliente_id, lista_precio_id, condicion_pago_id, moneda_codigo_predeterminada, limite_credito, limite_credito_temporal, fecha_vencimiento_credito, descuento_comercial_pct, vendedor_id, zona_comercial_id, ruta_entrega_id, canal_venta_id, bloqueado_ventas(+_at, _por, motivo), recibe_documento_electronico, requiere_orden_compra, observacion_comercial, observacion_logistica | `app/api/clientes/route.ts:449,805,827` |
| `cliente_contactos` | INSERT | via cliente | cliente_id, nombre, apellido, cargo, departamento, email, telefono, celular, es_principal, recibe_* (6 flags) | `clientes/route.ts:950` |
| `direcciones_cliente` | INSERT | via cliente | cliente_id, tipo, etiqueta, es_fiscal, es_entrega_default, pais_*, departamento(+_codigo), distrito(+_codigo), ciudad(+_codigo), direccion, numero_casa, complemento, codigo_postal, latitud, longitud, contacto_*, horario_recepcion, observacion | `clientes/route.ts:996` |
| `cliente_documentos` | INSERT | via cliente | cliente_id, tipo, nombre_archivo, url_archivo, fecha_emision, fecha_vencimiento, observacion, cargado_por | `clientes/route.ts:1075` |

### 2.3 Proveedores

| Tabela | Operações | Escopo | Colunas citadas | Referências |
|---|---|---|---|---|
| `proveedores` | SELECT, INSERT | empresa | 42 colunas, entre elas: empresa_id, codigo, tipo_persona, tipo_documento, numero_documento, dv, razon_social, nombre_fantasia, pais_*, email, email_pagos, sitio_web, grupo_proveedor_id, condicion_pago_id, medio_pago_preferido_id, moneda_codigo_predeterminada, incoterm_codigo, estado_homologacion (+fechas), nivel_riesgo, calificacion_actual, bloqueado, motivo_bloqueo, plazo_entrega_dias, monto_minimo_compra, permite_anticipos, permite_entrega_parcial, requiere_orden_compra | `app/api/proveedores/route.ts:396,651`; `app/api/productos/route.ts:139` |
| `proveedor_contactos` | INSERT | via proveedor | proveedor_id, nombre, apellido, cargo, email, telefono, celular, es_principal, recibe_* (7 flags) | `proveedores/route.ts:718` |
| `proveedor_direcciones` | INSERT | via proveedor | proveedor_id, tipo, es_principal, pais_codigo, departamento/distrito/ciudad (+_codigo), direccion, numero_casa, codigo_postal, descripcion | `proveedores/route.ts:759` |
| `proveedor_cuentas_bancarias` | INSERT | via proveedor | proveedor_id, banco, sucursal_banco, tipo_cuenta, numero_cuenta, iban, codigo_swift, titular, documento_titular, alias_cuenta, moneda_codigo, es_principal | `proveedores/route.ts:792` — **dado financeiro sensível** |
| `proveedor_retenciones` | INSERT | via proveedor | proveedor_id, tipo, impuesto_id, porcentaje, fecha_vigencia_desde/hasta, certificado_obligatorio, observacion | `proveedores/route.ts:824` |
| `proveedor_documentos` | INSERT | via proveedor | proveedor_id, tipo, nombre_archivo, url_archivo, fechas, observacion, cargado_por | `proveedores/route.ts:852` |

### 2.4 Productos

| Tabela | Operações | Escopo | Colunas citadas | Referências |
|---|---|---|---|---|
| `productos` | SELECT, INSERT | empresa | 43 colunas, entre elas: empresa_id, codigo, codigo_sifen, codigo_barras, descripcion, descripcion_factura, tipo_producto, categoria_id, marca_id, impuesto_id, unidad_medida_id, controla_stock, modo_control_stock, requiere_vencimiento, stock_minimo, stock_maximo, punto_reposicion, costo_promedio, ncm, partida_arancelaria, dncp_general, dncp_especifico, pais_origen_*, dimensões e pesos, porcentaje_merma, vida_util_dias, vendible, comprable, permite_terceros, activo | `app/api/productos/route.ts:121,272` |
| `producto_codigos` | INSERT | via produto | producto_id, tipo, codigo, descripcion, es_principal | `productos/route.ts:320` |
| `producto_unidades` | INSERT | via produto | producto_id, unidad_medida_id, factor_conversion, nombre_presentacion, codigo_barras, es_unidad_base/compra/venta, peso_bruto_kg, volumen_m3 | `productos/route.ts:331` |
| `producto_proveedores` | INSERT | via produto | producto_id, proveedor_id, codigo_proveedor, descripcion_proveedor, costo_referencia, moneda_codigo, unidad_medida_id, factor_conversion, cantidad_minima_compra, plazo_entrega_dias, es_principal | `productos/route.ts:347` |
| `producto_deposito_configuracion` | INSERT | via produto | producto_id, deposito_id, stock_minimo, stock_maximo, punto_reposicion, cantidad_reposicion, ubicacion_preferida_id | `productos/route.ts:364` |
| `producto_alternativos` | INSERT | via produto | producto_id, producto_alternativo_id, tipo, prioridad | `productos/route.ts:377` |
| `producto_componentes` | INSERT | via produto | producto_kit_id, producto_componente_id, cantidad, es_opcional, orden | `productos/route.ts:387` |
| `producto_documentos` | INSERT | via produto | producto_id, tipo, nombre_archivo, url_archivo, fechas, observacion, cargado_por | `productos/route.ts:402` |

`ubicacion_preferida_id` aponta para uma entidade de ubicação que não é referenciada em nenhum outro ponto.

### 2.5 Catálogos

| Tabela | Escopo no código | Usada por |
|---|---|---|
| `grupos_cliente`, `listas_precio`, `rutas_entrega`, `zonas_comerciales`, `vendedores`, `canales_venta` | empresa (`empresa_id = $1 AND activo`) | `GET /api/clientes?modo=catalogos`; validadas no POST por `validarReferenciaEmpresa` (`clientes/route.ts:760-795`) |
| `grupos_proveedor`, `medios_pago` | empresa | proveedores; validadas no POST (`proveedores/route.ts:642-643`) |
| `categorias_producto`, `marcas_producto`, `depositos` | empresa | `GET /api/productos`; **não validadas no POST** |
| `condiciones_pago`, `monedas`, `incoterms`, `unidades_medida`, `impuestos` | **global** (sem `empresa_id` no filtro) | clientes, proveedores, productos. Proveedores valida as 3 primeiras (`proveedores/route.ts:644-646`); clientes e productos não validam |
| `referencia_geografica_paises`, `_departamentos`, `_distritos`, `_ciudades` | global | catálogos geográficos; validação da hierarquia em `validarDireccionParaguay` (`clientes/route.ts:299`) |

Que esses catálogos sejam globais é inferido da ausência de filtro. Não se sabe se a tabela tem `empresa_id` (NAO_VERIFICADO).

## 3. Recursos do PostgreSQL que o código pressupõe

| Recurso | Evidência | Situação |
|---|---|---|
| Extensão `pgcrypto` (`crypt`, `gen_salt('bf', 12)`) | `login/route.ts:237`, `session.ts:121` | Obrigatório; NAO_VERIFICADO |
| Tipo `inet` nos IPs | conversões `$n::inet` em `eventos_seguridad` e `sesiones_usuario` (`login/route.ts:155,198,238,252`) | NAO_VERIFICADO |
| `jsonb` em `eventos_seguridad.detalle` | `jsonb_build_object(...)` em `login/route.ts:154` | NAO_VERIFICADO |
| Variável de sessão `app.usuario_id` (`set_config`) | `login/route.ts:220` | Indica triggers de auditoria; NAO_VERIFICADO |
| Exceções `P0001` lançadas pelo banco | `proveedores/route.ts:892` | Indica triggers ou funções de validação; NAO_VERIFICADO |
| Constraints com nomes contendo `empresa_ruc`, `empresa_documento`, `cuenta_bancaria`, `contacto_principal`, `direccion_principal_tipo` | `proveedores/route.ts:882-886` | Únicas, provavelmente parciais ("activo"); NAO_VERIFICADO |
| Única de clientes por identificação ou código externo | mensagem do `23505` em `clientes/route.ts:1121` | NAO_VERIFICADO |
| Geração de `id` e de `codigo` | Nenhum INSERT informa `id`. `clientes` e `proveedores` não informam `codigo`, mas o leem no `RETURNING` (`clientes/route.ts:884`, `proveedores/route.ts:669`). `productos` recebe `codigo` da aplicação (`productos/route.ts:272`, parâmetro `$2`) | Default ou trigger no banco; NAO_VERIFICADO |
| Preenchimento de `proveedores.pais_nombre` | O INSERT não informa a coluna, mas o `RETURNING` a lê (`proveedores/route.ts:669`) | Provável trigger a partir de `pais_codigo`; NAO_VERIFICADO |
| Row Level Security | nenhum `SET ROLE` nem variável de tenant além de `app.usuario_id` | Isolamento depende só do `WHERE empresa_id` da aplicação; RLS NAO_VERIFICADO |

## 4. Armazenamento demonstrativo (navegador)

Nada disso existe no banco. Dados por navegador, sem servidor.

| Chave `localStorage` | Repositório | Entidade (tipo em `types/`) | Tabela correspondente nas consultas SQL |
|---|---|---|---|
| `distribunex.demo.clientes.v1` | `lib/mocks/clientes-storage.ts` | Cliente | Existe `clientes` |
| `distribunex.demo.proveedores.v1` | `proveedores-storage.ts` | Proveedor | Existe `proveedores` |
| `distribunex.demo.productos.v1` | `productos-storage.ts` | Producto | Existe `productos` |
| `distribunex.demo.listas-precio.v1` | `listas-precio-storage.ts` | ListaPrecio (+ itens, escalas, regras) | Só `listas_precio` (id, nombre); itens e regras sem tabela |
| `distribunex.demo.stock.v1` | `stock-storage.ts` | Saldo por produto e depósito | **Sem tabela** |
| `distribunex.demo.movimientos-stock.v1` | `movimientos-stock-storage.ts` | Movimento de stock | **Sem tabela** |
| `distribunex.demo.recepciones.v1` | `recepciones-storage.ts` | Recepção de compra | **Sem tabela** |
| `distribunex.demo.facturas.v1` | `facturas-storage.ts` | Factura e itens | **Sem tabela** |

Além dessas, há as chaves `distribunex.demo.<dominio>.flash` (`sessionStorage`, mensagens de sucesso) e `distribunex.shell.sidebar-collapsed` (preferência de interface).

Os tipos em `types/*.ts` (por exemplo, `types/stock.ts` e `types/facturas.ts`) são a melhor especificação disponível das entidades que ainda não têm tabela. Servem de **entrada** para requisitos futuros, mas não autorizam criar tabelas sem decisão de modelagem.

## 5. Plano para obter o modelo real (RN-03, RN-06)

Sem nenhum `CREATE` nem `DROP`; somente leitura.

1. **Autorização.** O responsável indica qual banco é a referência (desenvolvimento ou demo, nunca produção com dados reais de clientes sem necessidade) e fornece acesso **somente leitura**, por um usuário próprio (`GRANT CONNECT`, `USAGE` e `SELECT` em `information_schema`/`pg_catalog`). A credencial é entregue por segredo do GitHub ou executada pelo próprio responsável, nunca pelo chat.
2. **Localizar as migrations 001–017** citadas no README. Se existirem, versionar como linha de base em `documentacao/banco/baseline/`, com revisão para remover senhas e dados (por exemplo, a `017_administrador_inicial.sql` provavelmente contém um hash de senha).
3. **Extrair só a estrutura**: `pg_dump --schema-only --no-owner --no-privileges` e consultas a `information_schema.columns`, `pg_indexes`, `pg_constraint`, `pg_trigger`, `pg_proc` e `pg_policies`. Nunca `--data`.
4. **Conciliar código e banco**: comparar as 46 tabelas e as colunas da §2 com o resultado e registrar as divergências.
5. **Só então** iniciar as migrations incrementais, no padrão `documentacao/banco/REQ-AAAA-NNN-001-up.sql` e `-down.sql`, a partir da linha de base confirmada (ver `PLANO-EVOLUCAO.md`, REQ-2026-002).
