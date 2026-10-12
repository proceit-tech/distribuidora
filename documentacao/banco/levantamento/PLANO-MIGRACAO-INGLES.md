# PLANO DE MIGRAÇÃO PARA INGLÊS — V1

Requisito: REQ-2026-003 · PR #4 · Resposta a **AUD-REQ-2026-003-R01 / F-004 e F-006** · Escopo V1 (Clientes, Proveedores, Productos, Depósitos, Stock, Movimientos, custo/vendas ao custo, base de segurança).

> **Este plano não executa nada.** Nenhuma migration é aplicada no banco real nesta etapa. O esquema real continua **NAO_VERIFICADO** (F-001: depende do roteiro somente-leitura `CONSULTAS-CATALOGO-SOMENTE-LEITURA.sql` executado pelo responsável). Os SQL P001–P007 são **propostas** validadas só em PostgreSQL descartável. Nota 10/10 não é declarada para nada que não tenha sido verificado no banco real.

## 1. Estratégia (decisão de abordagem)

O legado é parcial: a API real só persiste `auth`, `clientes`, `productos` e `proveedores` (GET/POST); stock, movimentos, listas de preço, faturas e dashboard existem apenas em `localStorage`. Portanto a migração para inglês **não é renomear tudo de uma vez**:

1. **Tabelas que já existem no banco real** (`empresas`, `usuarios`, `perfiles`, `permisos`, `clientes`, `proveedores`, `productos`, `depositos` e filhas): migrar por **expand/contract** — criar a tabela/coluna em inglês, copiar com verificação de contagem, trocar a aplicação (API atualmente com SQL em espanhol) e só então remover o nome antigo; durante a transição, **views com o nome antigo** podem manter a API funcionando. Não há DDL real antes de F-001.
2. **Tabelas que não existem** (stock, movimentos, custo, vendas ao custo): nascem **direto em inglês** (greenfield) via P005/P006/P007. Não há dado histórico a migrar e **não se fabrica custo histórico** para faturas antigas.
3. UI continua em espanhol; só os nomes físicos mudam (`PADRAO-NOMENCLATURA-BANCO-E-INTERFACE.md`).

## 2. Mapa de nomes (tabelas V1; gerado do mapa campo a campo)

| Grupo | Tabela-alvo (inglês) | Tabela(s) legada(s) provadas pelo código |
|---|---|---|
| Segurança e estrutura da empresa | `companies` | `empresas` |
| Segurança e estrutura da empresa | `branches` | — (nova) |
| Segurança e estrutura da empresa | `warehouses` | `depositos` |
| Segurança e estrutura da empresa | `users` | `usuarios` |
| Segurança e estrutura da empresa | `roles` | `perfiles` |
| Segurança e estrutura da empresa | `permissions` | `permisos` |
| Segurança e estrutura da empresa | `role_permissions` | `perfil_permiso` |
| Segurança e estrutura da empresa | `user_roles` | `usuario_perfil` |
| Segurança e estrutura da empresa | `user_branches` | — (nova) |
| Segurança e estrutura da empresa | `user_warehouses` | — (nova) |
| Segurança e estrutura da empresa | `user_sessions` | `sesiones_usuario` |
| Segurança e estrutura da empresa | `security_events` | `eventos_seguridad` |
| Segurança e estrutura da empresa | `document_sequences` | — (nova) |
| Catálogos globais | `currencies` | `monedas` |
| Catálogos globais | `units_of_measure` | `unidades_medida` |
| Catálogos globais | `geo_countries` | `referencia_geografica_paises` |
| Catálogos globais | `geo_departments` | `referencia_geografica_departamentos` |
| Catálogos globais | `geo_cities` | `referencia_geografica_ciudades` |
| Catálogos globais | `geo_districts` | `referencia_geografica_distritos` |
| Catálogos globais | `payment_methods` | `medios_pago` |
| Catálogos globais | `taxes` | `impuestos` |
| Catálogos globais | `incoterms` | `incoterms` |
| Clientes | `customers` | `clientes` |
| Clientes | `customer_addresses` | `direcciones_cliente` |
| Clientes | `customer_contacts` | `cliente_contactos` |
| Clientes | `customer_documents` | `cliente_documentos` |
| Clientes | `customer_groups` | `grupos_cliente` |
| Clientes | `commercial_zones` | `zonas_comerciales` |
| Clientes | `sales_channels` | `canales_venta` |
| Clientes | `salespeople` | `vendedores` |
| Clientes | `delivery_routes` | `rutas_entrega` |
| Clientes | `payment_terms` | `condiciones_pago` |
| Proveedores | `suppliers` | `proveedores` |
| Proveedores | `supplier_addresses` | `proveedor_direcciones` |
| Proveedores | `supplier_contacts` | `proveedor_contactos` |
| Proveedores | `supplier_bank_accounts` | `proveedor_cuentas_bancarias` |
| Proveedores | `supplier_documents` | `proveedor_documentos` |
| Proveedores | `supplier_groups` | `grupos_proveedor` |
| Proveedores | `supplier_withholdings` | `proveedor_retenciones` |
| Productos | `products` | `producto_documentos`, `productos` |
| Productos | `product_brands` | `marcas_producto` |
| Productos | `product_categories` | `categorias_producto` |
| Productos | `product_codes` | `producto_codigos` |
| Productos | `product_units` | `producto_unidades` |
| Productos | `product_warehouse_settings` | `producto_deposito_configuracion`, `productos` |
| Productos | `product_suppliers` | `producto_proveedores` |
| Productos | `product_alternatives` | `producto_alternativos` |
| Productos | `product_components` | `producto_componentes` |
| Productos | `product_documents` | `producto_documentos` |
| Stock, movimientos e custo | `stock_balances` | `depositos` |
| Stock, movimientos e custo | `stock_lots` | — (nova) |
| Stock, movimientos e custo | `inventory_movements` | — (nova) |
| Stock, movimientos e custo | `inventory_movement_lines` | — (nova) |
| Stock, movimientos e custo | `inventory_costs` | — (nova) |
| Ventas — somente o necessário para o relatório ao custo | `invoices` | — (nova) |
| Ventas — somente o necessário para o relatório ao custo | `invoice_lines` | — (nova) |

Coluna a coluna: ver `DICIONARIO-DADOS.md` (colunas *Legado* e *Mapa*) e os 7 arquivos de `campos/`.

## 3. Matriz de dependências das propostas (P001–P007)

| Proposta | Conteúdo | Depende de | Tabelas acumuladas | Teste (verificações OK no PG 16 descartável) |
|---|---|---|---|---|
| P001 | empresas, sucursais, depósitos, usuários, perfis, permissões, sessões, eventos; funções `app_company_id()`, `set_updated_at()`; RLS FORCE | — | 12 | `TESTE-P001-isolamento.sql` — 22 |
| P002 | catálogos globais, clientes e filhas | P001 | 31 | `TESTE-P002-catalogos-clientes.sql` — 157 |
| P003 | proveedores, productos e filhas | P001, P002 (catálogos) | 48 | `TESTE-P003-fornecedores-produtos.sql` — 178 |
| P004 | listas de preço (fora da V1) | P001–P003 | 52 | `TESTE-P004-listas-preco.sql` — 85 |
| P005 | stock, lotes, movimentos, recepções | P001, P003 | 58 | `TESTE-P005-estoque-recepciones.sql` — 141 |
| P006 | faturamento (V1: só `invoices`/`invoice_lines` p/ venda ao custo) | P001–P003, P005 | 65 | `TESTE-P006-faturamento.sql` — 172 |
| P007 | moeda base, `inventory_costs`, custo nas linhas, `inventory_post_line`, views dos relatórios | P001, P002 (moedas), P003, P005, P006 | 66 | `TESTE-P007-custeio.sql` — 61 |

Ordem obrigatória de **up**: P001→P007. Ordem obrigatória de **down**: P007→P001 (P007 depende de colunas de P005/P006). Contagens de "verificações OK" = linhas `NOTICE: OK` dos testes (soma 816). O encadeamento e os resultados são reproduzíveis com `validacoes/executar-propostas.sh` (ver `validacoes/REPRODUCAO-TESTES.md`).

Para a V1 mínima com relatórios reais é necessário **P001+P002+P003+P005+P006+P007** (P004 só se listas de preço entrarem; P006 só pelas tabelas de venda — a separação em arquivos próprios é decisão futura, não feita aqui para não duplicar estruturas).

## 4. Fases de execução (quando houver autorização)

| Fase | O que | Pré-requisito | Evidência de saída | Quem executa |
|---|---|---|---|---|
| 0 | Introspecção somente leitura do banco real e comparação com o dicionário | Autorização do responsável | Relatório com as divergências reais; `NAO_VERIFICADO` → `CONFIRMADO`/`DIVERGE` no mapa | Responsável (roteiro) → Claude lê o resultado |
| 1 | Revisão das propostas contra o resultado da fase 0; geração de migrations **numeradas** (`REQ-2026-003-NNN-up/down`) em PR de código próprio | Fase 0; nova auditoria | Testes repetidos em cópia estrutural | Claude (PR específico) |
| 2 | Aplicar em homologação com dados sintéticos | Fase 1 aprovada | `executar-propostas.sh` equivalente verde + RLS com papel sem `BYPASSRLS` | Responsável |
| 3 | Expand/contract das tabelas existentes (copiar, comparar contagens, trocar API) | Fase 2 | Contagens iguais; API testada | Responsável + PR de código |
| 4 | Produção | Homologação humana | Plano de rollback testado | Responsável |

CI (REQ-004) ainda não roda os testes SQL: ver `validacoes/REPRODUCAO-TESTES.md` §5.

## 5. P001 × REQ-2026-002 v5 — inventário de lacunas (F-006)

P001 foi escrita antes das decisões D-09..D-12 (desenho v3/v4 em diante) e nunca foi reconciliada com a v5. O desenho final (v5, SHA `58352ad`, auditoria R05 pendente) acrescenta entidades e regras. **P001 não é o esquema final do REQ-002** e não deve ser aplicada como tal.

| Item do REQ-002 v5 | Em P001? | Lacuna | Fase |
|---|---|---|---|
| `companies`, `branches`, `warehouses`, `users`, `roles`, `permissions` (com `class`), `role_permissions`, `user_roles`, `user_branches`, `user_warehouses` | Sim | Revisar nomes/colunas contra a fase 0 | — |
| Alcance por sucursal/depósito (`branch_scope`, `warehouse_scope`, vazio nega) | Sim (colunas e tabelas) | Aplicação no servidor é código futuro | REQ-002 fases 3–4 |
| Evidência de identidade (`document_hash`, `email_verified`, `mfa_enabled`) | Colunas sim | Verificação/MFA em si é aplicação; `usuarios_plataforma` (MFA PROCEIT) **ausente** | REQ-002 fase 2/4 |
| `concesiones_permiso` + `concesiones_permiso_eventos` (D-09/D-10) | **Não** | Criar tabelas, estados, histórico imutável | REQ-002 fase 2 |
| `autorizaciones_operacion` (D-11, uso único, `objeto_huella`) | **Não** | Criar tabela, expiração, consumo atômico | REQ-002 fase 4 |
| `parametros_concesion` + `_historial` (D-12: 180/365/7/7 com limites rígidos) | **Não** | Criar tabelas e limites | REQ-002 fase 2 |
| `usuario_poder_eventos` (antiguidade do poder de aprovar) | **Não** | Criar tabela só-inserção | REQ-002 fase 2 |
| `auditoria_acceso` (só inserção, retenção D-07) | Parcial (`security_events`, sem antes/depois/motivo/ator tipo) | Substituir/estender; D-07 depende de validação jurídica | REQ-002 fase 2 |
| `usuarios_plataforma`, `accesos_soporte` | **Não** | Criar (contas PROCEIT com MFA e prazo) | REQ-002 fase 4 |
| Revogação e contrato temporal (`access_version`, eventos) | `access_version` sim | Tabela de eventos e regra de corrida são código/DDL futuro | REQ-002 fase 3 |
| Classificação `DATO_SENSIBLE`/`ACCION_CRITICA` (D-06), p.ex. `PRODUCTOS_COSTO.VER` | Coluna `class` sim | Carga do catálogo (matriz v5: 39 recursos/142 permissões + 8 de plataforma) **não** está em P001 | REQ-002 fase 2 |
| Bloqueio de edição de permissão controlada em perfil | Sim (`role_permissions_block_controlled`) | Revisar após D-09..D-12 | — |

**Plano em fases (somente documental aqui):** (A) esperar a auditoria R05 do REQ-002 e decisões pendentes (72 h de validade da autorização, janela de aviso, revisão periódica, D-04, D-07); (B) criar **P008 — concessões e autorizações** (tabelas acima) em proposta separada, sem tocar P001; (C) só então ligar a leitura de `PRODUCTOS_COSTO.VER` nas views de custo. Até lá, **os relatórios de custo não devem ser expostos a ninguém por perfil comum**: o enforcement depende de código e de P008, fora desta etapa.

## 6. Riscos e limites declarados

- Tudo acima é validado só em PG 16 descartável; a versão do PostgreSQL real é desconhecida (views `security_invoker` exigem ≥ 15).
- O legado pode ter colunas/constraints não vistas no código: a fase 0 pode alterar nomes e tipos.
- P007 e `inventory_post_line` só são seguras se **todo** acesso a saldo passar pela função e o papel da aplicação não tiver `UPDATE` direto em `stock_balances`/`inventory_costs` (fase 1 de código).
