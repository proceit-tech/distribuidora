# 03 — Matriz de compatibilidade com as APIs atuais

Método: `herramientas/matriz-compatibilidad.py` extrai as consultas SQL de `app/api/**` e `lib/auth/**` e executa `PREPARE` contra (a) a V1 e (b) a cadeia histórica com 003/018–021 simulados. **`PREPARE` prova que tabelas, colunas e tipos resolvem; não prova o comportamento ponta a ponta com a aplicação Next.js (E2E pendente).**

| Archivo de la app | Consultas | V1 (NEX) | Cadena histórica (con 003/018–021 simulados) | Tablas |
|---|---:|---|---|---|
| `app/api/auth/login/route.ts` | 8 | 8 OK | 1 OK, **7 FALLA** | empresas, eventos_seguridad, sesiones_usuario, usuarios |
| `app/api/auth/logout/route.ts` | 1 | 1 OK | 1 OK | sesiones_usuario |
| `app/api/clientes/route.ts` | 20 | 19 OK, 1 con corrección | 5 OK, **15 FALLA** | canales_venta, cliente_contactos, cliente_documentos, clientes, condiciones_pago, direcciones_cliente, grupos_cliente, listas_precio, monedas, referencia_geografica_ciudades, referencia_geografica_departamentos, referencia_geografica_distritos, rutas_entrega, vendedores, zonas_comerciales |
| `app/api/productos/route.ts` | 15 | 15 OK | 4 OK, **11 FALLA** | categorias_producto, depositos, impuestos, marcas_producto, producto_alternativos, producto_codigos, producto_componentes, producto_deposito_configuracion, producto_documentos, producto_proveedores, producto_unidades, productos, proveedores, unidades_medida |
| `app/api/proveedores/route.ts` | 20 | 20 OK | 2 OK, **18 FALLA** | canales_venta, condiciones_pago, grupos_cliente, grupos_proveedor, incoterms, listas_precio, medios_pago, monedas, proveedor_contactos, proveedor_cuentas_bancarias, proveedor_direcciones, proveedor_documentos, proveedor_retenciones, proveedores, referencia_geografica_ciudades, referencia_geografica_departamentos, referencia_geografica_distritos, referencia_geografica_paises, rutas_entrega, vendedores, zonas_comerciales |
| `lib/auth/permissions.ts` | 1 | 1 OK | 1 OK | perfil_permiso, perfiles, permisos, usuario_perfil |
| `lib/auth/session.ts` | 1 | 1 OK | 0 OK, **1 FALLA** | perfiles, sesiones_usuario, usuario_perfil, usuarios |

**Total:** 66 consultas — **65 compatíveis com a V1**; 1 com correção necessária no código da app.

## F-01 (bug da app, não do banco)
`app/api/clientes/route.ts` (≈ linha 827): o parâmetro `$32` dentro de um `CASE` é inferido como `text` e falha ao ser atribuído à coluna `uuid` `bloqueado_ventas_por`. Correção: `$32::uuid`. Vai na **PR de código separada**; o banco não foi distorcido para acomodar o erro.

## Não coberto
Telas Stock/Movimientos/Reportes/Dashboard ainda não têm API (usam `localStorage`); as funções `inventario_registrar_movimiento`, `inventario_anular_movimiento` e as views `v_*` são a interface proposta para essa PR de código.
