# PLANO MESTRE NEXIT V1 — PRODUÇÃO 30/11/2026
**Decisão do responsável em 26/11/2026:** todos os 18 menus anteriormente ocultos são obrigatórios na V1; não deslocar nenhum para V2. Meta conclusão domingo 29/11, produção segunda 30/11, America/Asuncion. Meta, não promessa de execução/GO. Escopo ampliado torna o prazo de alto risco. Se qualquer menu obrigatório não estiver aceito, não declarar V1 completa; alteração de escopo/data exige decisão explícita do responsável. Nenhuma autorização de código nova por este plano.

## 1. Baseline e governança
- PR #7 Draft, branch feature/NEXIT-2026-001-banco-demo, baseline 7e927c46e957c81e55f2394a5f5c360a0f780ad0. 203 tarefas inventariadas (198 não canceladas), 2 Done, 148 In Review, 1 In Progress, 20 Todo, 27 Backlog, 5 Canceled. Status de origem, antes da promoção administrativa dos 19 IDs correspondentes aos 18 menus (PRO-110/306 = um menu). Sem duplicar tarefas. Os 148 In Review são fila de aceitação, não 148 funcionalidades novas.
- Única ordem de desenvolvimento ativa PRO-312-R03 Lote B; manter HEAD autorizado e CLAUDE.md no PR intactos. Este plano está em branch documental separada para não interromper trabalho do Claude; não fazer merge/cherry-pick automaticamente. Cada nova ordem requer liberação específica, auditoria independente e parada. ChatGPT analista/auditor; Claude desenvolvedor; responsável VM, homologação e GO.
- Infra: Google Cloud VM, Docker, PostgreSQL; não incluir Vercel. Última evidência 85 migrations NEX-001..085, 65/65 controles, 523 casos SQL/operacionais escritos pendentes; nenhuma nova base de testes. Não executar SQL/tests/build/CI manual por ChatGPT/Claude, CI automático existente. Confirmar SHA e configuração efetivamente instalados antes de produção. NEX-001..085 imutáveis; eventual migration nova somente por ordem fundamentada.
- Fontes: [menu atual](https://github.com/proceit-tech/distribuidora/blob/7e927c46e957c81e55f2394a5f5c360a0f780ad0/lib/navigation/menu.ts), [reconciliação anterior](https://github.com/proceit-tech/distribuidora/blob/7e927c46e957c81e55f2394a5f5c360a0f780ad0/documentacao/planos/RECONCILIACAO-GLOBAL-NEXIT-V1-LINEAR-GITHUB-2026-11-24.md), [roadmap histórico](https://github.com/proceit-tech/distribuidora/blob/7e927c46e957c81e55f2394a5f5c360a0f780ad0/documentacao/v2/NEXIT-V2-AUDITORIA-FUNCIONAL-Y-ROADMAP.md), [SIFEN histórico](https://github.com/proceit-tech/distribuidora/blob/7e927c46e957c81e55f2394a5f5c360a0f780ad0/documentacao/v2/sifen-paraguay/01-ANALISIS-SIFEN-V150-MENUS-Y-REQUISITOS.md), [R03 ativa](https://github.com/proceit-tech/distribuidora/blob/7e927c46e957c81e55f2394a5f5c360a0f780ad0/documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-312-R03-LOTE-B-INSTRUMENTACION-R05-2026-11-25.md), [Linear projeto](https://linear.app/proceit/project/distribuidora-nexit-v1).

## 2. Inventário de menus — sem omissões no NAVIGATION_GROUPS
49 opções empresariais (31 habilitáveis incluindo 5 atalhos; 18 ocultas agora obrigatórias), mais Dashboard/Plataforma e Informe Compras ausente. Habilitável não equivale a homologado; Recepciones usa mock/localStorage e não pode ser habilitado assim.
| Grupo | Menus | Estado/decisão | Pacote |
|---|---|---|---|
| Maestros | Clientes, Nuevo cliente; Proveedores, Nuevo proveedor; Productos, Nuevo producto; Catálogos de productos; Listas de precios, Nueva lista de precios; Catálogos comerciales, Nuevo catálogo comercial; Vendedores | 12 habilitáveis; atalhos 5 por perfil | P02 |
| Maestros | Zonas y rutas | Oculto, V1 obrigatório PRO-73 | P02 |
| Compras | Entradas | Habilitável PRO-325 | P05 |
| Compras | Solicitudes; Órdenes de compra; Recepciones; Devoluciones | 4 ocultos V1 PRO-74/75/76/77; Recepciones DEMO | P05 |
| Inventario | Stock; Movimientos; Depósitos; Bajas pendientes de stock; Reposición | 5 habilitáveis | P03 |
| Ventas | Pedidos; Ventas; Entregas | 3 ocultos V1 PRO-83/84/85 | P06 |
| Finanzas | Cuentas por cobrar; Cobros; Cuentas por pagar; Pagos; Caja | 5 ocultos V1 PRO-86–90 | P07 |
| Facturación | Documentos electrónicos; Facturas; Puntos de expedición; Notas de crédito | 4 habilitáveis; lacunas fiscais | P04 |
| Facturación | Notas de remisión; Monitor SIFEN | 2 ocultos V1 PRO-95/96 | P08 |
| Reportes | Reportes operativos; Stock general; Valorización de inventario; Kardex de movimientos; Stock crítico y reposición; Lotes y vencimientos; Informe de Ventas | 7 habilitáveis | P09 |
| Administración | Usuarios; Facturación electrónica | 2 habilitáveis | P01/P10 |
| Administración | Roles y permisos; Configuración; Auditoría | 3 ocultos V1 PRO-110/306/111/112 | P01/P10 |
| Adicionais | Panel general; Plataforma → Empresas | 2 entradas fora das 49 opções | P02/P01 |
| Ausente | Informe de Compras | PRO-297, acrescentar à V1 | P09 |

## 3. Pacotes e aceitação funcional
### P01 — Plataforma MASTER, usuários e segurança
Contratação, criação de empresa e primeiro administrador, nove perfis, acesso por empresa/módulo/alcance, senha e sessão. MASTER separado, ADMIN empresa opera apenas módulos contratados; usuários união dos perfis. Aprovar matriz e política de alcance antes do desenvolvimento; não criar segunda plataforma.
**Tarefas vinculadas:** PRO-63, PRO-65, PRO-109, PRO-110, PRO-116, PRO-293, PRO-304, PRO-305, PRO-306, PRO-307, PRO-308.
Aceite: operação real ponta a ponta, persistência, permissões empresa/módulo/perfil/alcance, erros/idempotência, concorrência relevante, integridade e regressão dos fluxos dependentes; evidência do responsável na VM existente. Não exibir menus incompletos/dados fictícios como operacionais.

### P02 — Dashboard e Maestros
CRUD real, catálogos e anexos, códigos texto, zonas e rotas (reusar zonas existentes), vendedor; decisões PRO-137/161/171. Preservar 561 produtos, não repetir importação corretiva.
**Tarefas vinculadas:** PRO-64, PRO-66, PRO-67, PRO-68, PRO-69, PRO-70, PRO-71, PRO-72, PRO-73, PRO-135, PRO-136, PRO-137, PRO-138, PRO-139, PRO-140, PRO-141, PRO-142, PRO-143, PRO-144, PRO-145, PRO-146, PRO-147, PRO-148, PRO-149, PRO-150, PRO-151, PRO-152, PRO-153, PRO-154, PRO-155, PRO-156, PRO-157, PRO-158, PRO-159, PRO-160, PRO-161, PRO-162, PRO-163, PRO-164, PRO-165, PRO-166, PRO-167, PRO-168, PRO-169, PRO-170, PRO-171, PRO-172, PRO-173, PRO-174, PRO-175, PRO-176, PRO-177, PRO-198, PRO-327.
Aceite: operação real ponta a ponta, persistência, permissões empresa/módulo/perfil/alcance, erros/idempotência, concorrência relevante, integridade e regressão dos fluxos dependentes; evidência do responsável na VM existente. Não exibir menus incompletos/dados fictícios como operacionais.

### P03 — Inventario e motor de movimentos
Estoque por depósito, entradas/saídas/transferências/anulação, reposição, baixas pendentes, consistência saldo/custo, integração com compras/vendas/cancelamento. Unidades identificadas PRO-82: especificar escopo antes de codificar; sem reabrir reservas canceladas.
**Tarefas vinculadas:** PRO-78, PRO-79, PRO-80, PRO-81, PRO-82, PRO-178, PRO-179, PRO-180, PRO-181, PRO-182, PRO-183, PRO-184, PRO-185, PRO-186, PRO-187, PRO-188, PRO-189, PRO-190, PRO-191, PRO-192, PRO-193, PRO-202, PRO-203, PRO-295, PRO-330, PRO-354, PRO-357.
Aceite: operação real ponta a ponta, persistência, permissões empresa/módulo/perfil/alcance, erros/idempotência, concorrência relevante, integridade e regressão dos fluxos dependentes; evidência do responsável na VM existente. Não exibir menus incompletos/dados fictícios como operacionais.

### P04 — Facturación FE/NCE e Documentos electrónicos
R03 B em desenvolvimento, C histórico, gates fiscais, correção rejeitados, cancelamento e estoque, data/dInfAdic, KuDE, XML/Correo (ações sem integração), consulta mesma conta, FE/NCE, Puntos. D6 e D8-B/999 itens antes de ativar. PRO-121/125/126 especificar casos oferecidos, sem ampliar silenciosamente. PRO-310 cancelada.
**Tarefas vinculadas:** PRO-61, PRO-91, PRO-92, PRO-93, PRO-94, PRO-97, PRO-98, PRO-117, PRO-118, PRO-120, PRO-121, PRO-122, PRO-123, PRO-124, PRO-125, PRO-126, PRO-127, PRO-128, PRO-129, PRO-130, PRO-131, PRO-132, PRO-133, PRO-134, PRO-194, PRO-195, PRO-196, PRO-197, PRO-199, PRO-200, PRO-201, PRO-204, PRO-205, PRO-206, PRO-210, PRO-211, PRO-292, PRO-294, PRO-298, PRO-300, PRO-301, PRO-302, PRO-303, PRO-309, PRO-310, PRO-311, PRO-312, PRO-313, PRO-314, PRO-315, PRO-321, PRO-322, PRO-323, PRO-324, PRO-326, PRO-328, PRO-329, PRO-331, PRO-333, PRO-334, PRO-335, PRO-336, PRO-338, PRO-339, PRO-341, PRO-342, PRO-365, PRO-369, PRO-370.
Aceite: operação real ponta a ponta, persistência, permissões empresa/módulo/perfil/alcance, erros/idempotência, concorrência relevante, integridade e regressão dos fluxos dependentes; evidência do responsável na VM existente. Não exibir menus incompletos/dados fictícios como operacionais.

### P05 — Compras
Solicitudes → Órdenes → Recepciones parciais/totais → Entradas → Devoluciones. Recepciones atual DEMO; integrar real. Definir aprovações, quantidades, custos, referência de origem, idempotência; não duplicar entrada já registrada; obrigação financeira somente no evento de negócio definido.
**Tarefas vinculadas:** PRO-74, PRO-75, PRO-76, PRO-77, PRO-325.
Aceite: operação real ponta a ponta, persistência, permissões empresa/módulo/perfil/alcance, erros/idempotência, concorrência relevante, integridade e regressão dos fluxos dependentes; evidência do responsável na VM existente. Não exibir menus incompletos/dados fictícios como operacionais.

### P06 — Ventas e logística
Pedidos → Ventas → Entregas, integração clientes/preços/stock/FE. Definir estados e momento único da baixa, sem reintroduzir reserva fiscal nem dupla baixa. Zonas/rutas de P02; confirmar necessidades cotação e transporte.
**Tarefas vinculadas:** PRO-83, PRO-84, PRO-85.
Aceite: operação real ponta a ponta, persistência, permissões empresa/módulo/perfil/alcance, erros/idempotência, concorrência relevante, integridade e regressão dos fluxos dependentes; evidência do responsável na VM existente. Não exibir menus incompletos/dados fictícios como operacionais.

### P07 — Finanzas
Cuentas por cobrar/pagar, Cobros, Pagos, Caja. Definir origem da obrigação, vencimento/moeda, liquidação parcial, reversas e caixa; integrar FE/NCE/compras sem duplicação. Não inventar contabilidade/conciliación bancária fora de definição.
**Tarefas vinculadas:** PRO-86, PRO-87, PRO-88, PRO-89, PRO-90.
Aceite: operação real ponta a ponta, persistência, permissões empresa/módulo/perfil/alcance, erros/idempotência, concorrência relevante, integridade e regressão dos fluxos dependentes; evidência do responsável na VM existente. Não exibir menus incompletos/dados fictícios como operacionais.

### P08 — Notas de remisión e Monitor SIFEN
NRE: contrato real gateway, identidade, origem/destino, mercadorias, transporte, sequência, estados e KuDE quando suportado; vínculos físicos sem dupla baixa. Monitor: usar evidências reais e estados, sem novo POST cego. Decidir catálogo mínimo Choferes/Transportistas/Vehículos e eventos necessários; separar funcionalidades futuras.
**Tarefas vinculadas:** PRO-95, PRO-96.
Aceite: operação real ponta a ponta, persistência, permissões empresa/módulo/perfil/alcance, erros/idempotência, concorrência relevante, integridade e regressão dos fluxos dependentes; evidência do responsável na VM existente. Não exibir menus incompletos/dados fictícios como operacionais.

### P09 — Reportes
Cinco relatórios de inventário e vendas, Informe Compras, exportação cruzada vendas por item×vendedor×documento×data; totais por moeda, ACL, PDF/XLSX. Relatórios financeiros/logísticos mínimos conforme contratos dos novos módulos, sem inventar novos indicadores.
**Tarefas vinculadas:** PRO-99, PRO-100, PRO-101, PRO-102, PRO-103, PRO-104, PRO-105, PRO-106, PRO-107, PRO-108, PRO-296, PRO-297, PRO-332, PRO-337.
Aceite: operação real ponta a ponta, persistência, permissões empresa/módulo/perfil/alcance, erros/idempotência, concorrência relevante, integridade e regressão dos fluxos dependentes; evidência do responsável na VM existente. Não exibir menus incompletos/dados fictícios como operacionais.

### P10 — Administración, configuración y auditoría
Configuração empresarial, política de estoque e limite FE, gestão gateway sem expor segredos, auditoria operacional e administrativa. Roles/permisos no P01; administração não edita catálogo fixo de perfis.
**Tarefas vinculadas:** PRO-111, PRO-112, PRO-207, PRO-208, PRO-209, PRO-340.
Aceite: operação real ponta a ponta, persistência, permissões empresa/módulo/perfil/alcance, erros/idempotência, concorrência relevante, integridade e regressão dos fluxos dependentes; evidência do responsável na VM existente. Não exibir menus incompletos/dados fictícios como operacionais.

### P11 — Infraestrutura, integração e homologação
VM Google Cloud, Docker/PostgreSQL, CI automático existente, evidência versão app, migrations e runtime, domínio/HTTPS, backups/recuperação de produção, monitoramento, homologação por menu, autorização GO/NO-GO. Sem Vercel ou nova base de testes.
**Tarefas vinculadas:** PRO-62, PRO-113, PRO-114, PRO-115, PRO-119, PRO-361, PRO-363.
Aceite: operação real ponta a ponta, persistência, permissões empresa/módulo/perfil/alcance, erros/idempotência, concorrência relevante, integridade e regressão dos fluxos dependentes; evidência do responsável na VM existente. Não exibir menus incompletos/dados fictícios como operacionais.

## 4. Sequência de dependências e meta 26–30/11
| Data alvo | Frentes | Resultado de controle |
|---|---|---|
| Qui 26/11 | Concluir ordem ativa P04 R03-B, auditoria, definir regras fiscais e contratos mínimos P01/P05/P06/P07/P08; seguir P04-C e correções conforme gates | Sem ativar R05 antes de D6/D8/aceite; contratos fechados, decisões explícitas, sem autorizar outras ordens automaticamente |
| Sex 27/11 | P01 MASTER/perfis, P10 administração; P02 zonas/cadastros e P03 motor; P05 compras se dependências prontas | Módulos contratados e ACL servidor; entradas/reversas consistentes; nenhuma dupla movimentação |
| Sáb 28/11 | P05 restante → P06 vendas → P07 financeiro; P08 NRE/monitor conforme contratos; P09 relatórios | Fluxos reais integrados, saldos e documentos conciliados, sem mock; dependências de fornecedor em aberto sinalizadas |
| Dom 29/11 | P11 homologação integrada dos 11 pacotes; corrigir somente falhas demonstradas; congelar release | Evidência por menu/fluxo, todos requisitos V1 aceitos, sem bloqueios ou resultados desconhecidos |
| Seg 30/11 | GO/NO-GO do responsável | Produção somente com gates concluídos; não garantir entrega pelo calendário |

Sequência de precedência: ordem ativa R03 → auditoria → próximas ordens expressas; P01 é transversal para habilitação real; P02/P03 suportam P05/P06; compras e vendas alimentam P07 sem duplicação; P08 depende logística/fiscal/contrato; P09 lê fatos reais; P11 desde cada entrega, não somente domingo. As janelas são metas, não estimativas de capacidade confirmada; não há autorização para ordens concorrentes ou corte de escopo. Reavaliar diariamente e comunicar desvios.

## 5. Requisitos históricos adicionais — preservar, decidir sem promoção implícita
A aprovação dos 18 menus não converte automaticamente toda proposta V2 em V1. Identificar requisitos necessários para os menus agora aprovados e submetê-los a decisão focal; conservar restante.
| Requisito | Origem/ação |
|---|---|
| Choferes, Transportistas, Vehículos | SIFEN/logística; definir mínimo necessário à NRE e Entregas; não duplicar maestros |
| Eventos SIFEN: cancelamento, inutilização, nominação, atualização transporte | Cancelamento já V1 PRO-313/199; demais dependem contrato e decisão, sem inferir evento por estado genérico |
| NDE/AFE e demais tipos fiscais | Pontos/numeração não provam emissão; PRO-125/126 e decisão de escopo |
| XML fiscal e Correo | Lacunas explícitas Documentos, P04; confirmar endpoints/provedor, sem inventar XML/status |
| Importação Excel produtos com preview/atualização | Requisito V2 aprovado 10/10; não equivale à carga pontual 561; manter registrado |
| Sucursales e organização | P01: definir mínimo necessário ao onboarding e alcance; gestão avançada depende decisão |
| Cotações fornecedores/comerciais, factura fornecedor | P05/P06: definir mínimo dos fluxos aprovados |
| WMS, localizações, picking/packing, serialização, inventário físico | PRO-82 / V2-004; decisão do recorte; preservar PRO-310 cancelada |
| Bancos, conciliação, antecipações, quotas, inadimplência | P07 / PRO-121: definir mínimo de contas, pagamentos e caixa, demais decisões |
| Importaciones, Exportaciones | V2-006/008; não excluir, não antecipar sem autorização |
| Portal B2B, app entregas, monitor de integrações, API/EDI, BI | V2-010/011; preservar roadmap; requisitos mínimos de Entregas/Monitor SIFEN não se confundem com expansão |

## 6. Critério de GO/NO-GO e rastreabilidade
Para cada menu: rota/página real, API/SQL, permissões, estados, fluxo feliz e falhas, exportação quando aplicável, integração, evidência de homologação, versão e responsável. Validar isolamento multiempresa e módulos contratados, acesso direto e menus, sem DEMO; fechar D6/D8/999 itens e contrato cancelamento/fornecedor; R05 flag off até autorização e evidência; nenhuma emissão real não autorizada. Verificar CI automático, SHA/imagem instalada, backups e recuperação de produção, domínio/TLS, monitoramento, certificado/ambiente/numeração, configuração PostgreSQL runtime e migrations. Não reverter migrations aplicadas por improviso. Não mover In Review para Done sem aceite. Nenhum bloqueio crítico aceito tacitamente. Em caso de prazo vencido sem aceite, NO-GO ou nova decisão expressa de escopo/data, jamais declarar concluído.
Issues GitHub abertas #8–19: reconciliar com Linear e evidência de aceite, sem fechar automaticamente. PRO-103/104/105/106 duplicatas canceladas, PRO-310 cancelada por decisão; preservar histórico. 2 Done preservadas. Plano não executa VM, SQL, testes, merge, deploy nem altera código.

## 7. Inventário integral das 203 tarefas existentes
Baseline anterior às atualizações administrativas desta decisão. Cada ID aparece uma vez com seu pacote primário; vínculos transversais não implicam duplicação. 19 IDs de menus promovidos ao escopo V1: PRO-73, PRO-74, PRO-75, PRO-76, PRO-77, PRO-83, PRO-84, PRO-85, PRO-86, PRO-87, PRO-88, PRO-89, PRO-90, PRO-95, PRO-96, PRO-110, PRO-306, PRO-111, PRO-112. Proposta administrativa: passar de Backlog para Todo, sem iniciar desenvolvimento.
| Tarefa | Pacote | Status na origem | Título |
|---|---|---|---|
| [PRO-61](https://linear.app/proceit/issue/PRO-61) | P04 | In Review | FAT-E2 — Concluir envio FE ao gateway e confirmação SIFEN |
| [PRO-62](https://linear.app/proceit/issue/PRO-62) | P11 | In Review | CI NEXIT — PostgreSQL T01, verificador SQL C1 y cobertura |
| [PRO-63](https://linear.app/proceit/issue/PRO-63) | P01 | In Review | Navegación por perfiles y permisos — implementado, pendente homologación |
| [PRO-64](https://linear.app/proceit/issue/PRO-64) | P02 | In Review | Dashboard y indicadores — implementado, pendente homologación |
| [PRO-65](https://linear.app/proceit/issue/PRO-65) | P01 | In Review | Plataforma · Empresas — implementado, pendente homologación |
| [PRO-66](https://linear.app/proceit/issue/PRO-66) | P02 | In Review | Clientes — implementado, pendente homologación |
| [PRO-67](https://linear.app/proceit/issue/PRO-67) | P02 | In Review | Proveedores — implementado, pendente homologación |
| [PRO-68](https://linear.app/proceit/issue/PRO-68) | P02 | In Review | Productos — implementado, pendente homologación |
| [PRO-69](https://linear.app/proceit/issue/PRO-69) | P02 | In Review | Catálogos de productos — implementado, pendente homologación |
| [PRO-70](https://linear.app/proceit/issue/PRO-70) | P02 | In Review | Listas de precios — implementado, pendente homologación |
| [PRO-71](https://linear.app/proceit/issue/PRO-71) | P02 | In Review | Catálogos comerciales — implementado, pendente homologación |
| [PRO-72](https://linear.app/proceit/issue/PRO-72) | P02 | In Review | Vendedores — rol comercial por empresa, distinto del usuario emisor (regla pendiente) |
| [PRO-73](https://linear.app/proceit/issue/PRO-73) | P02 | Backlog | Zonas y rutas — planificado |
| [PRO-74](https://linear.app/proceit/issue/PRO-74) | P05 | Backlog | Solicitudes — planificado |
| [PRO-75](https://linear.app/proceit/issue/PRO-75) | P05 | Backlog | Órdenes de compra — planificado |
| [PRO-76](https://linear.app/proceit/issue/PRO-76) | P05 | Backlog | Recepciones — planificado |
| [PRO-77](https://linear.app/proceit/issue/PRO-77) | P05 | Backlog | Devoluciones de compra — planificado |
| [PRO-78](https://linear.app/proceit/issue/PRO-78) | P03 | In Review | Stock — implementado, pendente homologación |
| [PRO-79](https://linear.app/proceit/issue/PRO-79) | P03 | In Review | Movimientos — implementado, pendente homologación |
| [PRO-80](https://linear.app/proceit/issue/PRO-80) | P03 | In Review | Depósitos — implementado, pendente homologación |
| [PRO-81](https://linear.app/proceit/issue/PRO-81) | P03 | In Review | Reposición — implementado, pendente homologación |
| [PRO-82](https://linear.app/proceit/issue/PRO-82) | P03 | Backlog | Inventario · integración y unidades identificadas — planificado |
| [PRO-83](https://linear.app/proceit/issue/PRO-83) | P06 | Backlog | Pedidos — planificado |
| [PRO-84](https://linear.app/proceit/issue/PRO-84) | P06 | Backlog | Ventas — planificado |
| [PRO-85](https://linear.app/proceit/issue/PRO-85) | P06 | Backlog | Entregas — planificado |
| [PRO-86](https://linear.app/proceit/issue/PRO-86) | P07 | Backlog | Cuentas por cobrar — planificado |
| [PRO-87](https://linear.app/proceit/issue/PRO-87) | P07 | Backlog | Cobros — planificado |
| [PRO-88](https://linear.app/proceit/issue/PRO-88) | P07 | Backlog | Cuentas por pagar — planificado |
| [PRO-89](https://linear.app/proceit/issue/PRO-89) | P07 | Backlog | Pagos — planificado |
| [PRO-90](https://linear.app/proceit/issue/PRO-90) | P07 | Backlog | Caja — planificado |
| [PRO-91](https://linear.app/proceit/issue/PRO-91) | P04 | In Review | Documentos electrónicos — implementado, pendiente homologación |
| [PRO-92](https://linear.app/proceit/issue/PRO-92) | P04 | In Review | Factura Electrónica · FAT-E1 cálculo fiscal — implementado, pendiente homologación |
| [PRO-93](https://linear.app/proceit/issue/PRO-93) | P04 | In Review | Factura Electrónica · interfaz Nueva factura — implementado, pendiente homologación |
| [PRO-94](https://linear.app/proceit/issue/PRO-94) | P04 | In Review | MFE-NCE V1 · Emitir notas de crédito con motivos, CDC y saldos |
| [PRO-95](https://linear.app/proceit/issue/PRO-95) | P08 | Backlog | Notas de remisión — planificado |
| [PRO-96](https://linear.app/proceit/issue/PRO-96) | P08 | Backlog | Monitor SIFEN — planificado |
| [PRO-97](https://linear.app/proceit/issue/PRO-97) | P04 | In Review | FAT-E3 · conciliación periódica — planificado |
| [PRO-98](https://linear.app/proceit/issue/PRO-98) | P04 | In Review | FAT-E4 · consulta y sincronización operativa — planificado |
| [PRO-99](https://linear.app/proceit/issue/PRO-99) | P09 | In Review | Stock general — implementado, pendiente homologación |
| [PRO-100](https://linear.app/proceit/issue/PRO-100) | P09 | In Review | Valorización de inventario — implementado, pendiente homologación |
| [PRO-101](https://linear.app/proceit/issue/PRO-101) | P09 | In Review | Kardex de movimientos — implementado, pendiente homologación |
| [PRO-102](https://linear.app/proceit/issue/PRO-102) | P09 | In Review | Stock crítico y reposición — implementado, pendiente homologación |
| [PRO-103](https://linear.app/proceit/issue/PRO-103) | P09 | Canceled | Stock general — implementado, pendiente homologación |
| [PRO-104](https://linear.app/proceit/issue/PRO-104) | P09 | Canceled | Valorización de inventario — implementado, pendiente homologación |
| [PRO-105](https://linear.app/proceit/issue/PRO-105) | P09 | Canceled | Kardex de movimientos — implementado, pendiente homologación |
| [PRO-106](https://linear.app/proceit/issue/PRO-106) | P09 | Canceled | Stock crítico y reposición — implementado, pendiente homologación |
| [PRO-107](https://linear.app/proceit/issue/PRO-107) | P09 | In Review | Lotes y vencimientos — implementado, pendiente homologación |
| [PRO-108](https://linear.app/proceit/issue/PRO-108) | P09 | Todo | Reportes operativos — sumar Informe de Ventas e Informe de Compras (CASA MINGO V1) |
| [PRO-109](https://linear.app/proceit/issue/PRO-109) | P01 | In Review | Administración empresarial — usuarios por empresa y asignación de múltiples perfiles |
| [PRO-110](https://linear.app/proceit/issue/PRO-110) | P01 | Backlog | Perfiles y permisos — nueve perfiles fijos; matriz de permisos pendiente |
| [PRO-111](https://linear.app/proceit/issue/PRO-111) | P10 | Backlog | Configuración — planificado |
| [PRO-112](https://linear.app/proceit/issue/PRO-112) | P10 | Backlog | Auditoría — planificado |
| [PRO-113](https://linear.app/proceit/issue/PRO-113) | P11 | In Review | PostgreSQL · control de migrations — pendiente |
| [PRO-114](https://linear.app/proceit/issue/PRO-114) | P11 | In Review | VM/Docker · despliegue controlado — pendiente |
| [PRO-115](https://linear.app/proceit/issue/PRO-115) | P11 | Todo | Homologación visual y funcional por menú — pendiente |
| [PRO-116](https://linear.app/proceit/issue/PRO-116) | P01 | In Review | Seguridad multiempresa y permisos — implementado, pendiente homologación |
| [PRO-117](https://linear.app/proceit/issue/PRO-117) | P04 | In Review | FAT-E2-R01-01 · Respuesta de envío debe coincidir con estado realmente persistido |
| [PRO-118](https://linear.app/proceit/issue/PRO-118) | P04 | In Review | FAT-E2-R01-02 · Proteger estados finales SIFEN dentro de transacción SQL |
| [PRO-119](https://linear.app/proceit/issue/PRO-119) | P11 | Backlog | C1 — Rastrear ocorrências repetidas na linha base de SQL dinâmico |
| [PRO-120](https://linear.app/proceit/issue/PRO-120) | P04 | In Review | Fase A — impedir alteração do IVA do produto por replay de factura |
| [PRO-121](https://linear.app/proceit/issue/PRO-121) | P04 | Backlog | MFE-B1 · Factura Crédito, Plazo y Cuotas |
| [PRO-122](https://linear.app/proceit/issue/PRO-122) | P04 | In Review | MFE-B2 · Medios de pago y datos condicionales |
| [PRO-123](https://linear.app/proceit/issue/PRO-123) | P04 | In Review | MFE-C · Factura PYG USD BRL y tipo de cambio manual |
| [PRO-124](https://linear.app/proceit/issue/PRO-124) | P04 | In Review | MFE-D1 · Descuentos de factura por ítem y globales |
| [PRO-125](https://linear.app/proceit/issue/PRO-125) | P04 | Backlog | MFE-D2 · Datos complementarios fiscales y anticipos |
| [PRO-126](https://linear.app/proceit/issue/PRO-126) | P04 | Backlog | MFE-E · Casos SIFEN especiales y campos sectoriales |
| [PRO-127](https://linear.app/proceit/issue/PRO-127) | P04 | In Review | MFE-P0 · Completar producto en factura y habilitar solo Crédito a Plazo |
| [PRO-128](https://linear.app/proceit/issue/PRO-128) | P04 | In Review | MFE-UX · Compactar Nueva factura, IVA directo y unidades |
| [PRO-129](https://linear.app/proceit/issue/PRO-129) | P04 | In Review | MFE-ADMIN · Gestión segura de puntos de expedición |
| [PRO-130](https://linear.app/proceit/issue/PRO-130) | P04 | In Review | AUD-FISC · Correções fiscais NEXIT — sequências, pontos, transações e gateway |
| [PRO-131](https://linear.app/proceit/issue/PRO-131) | P04 | In Review | AUD-FISC P0 · Sequência fiscal independente por tipo de documento |
| [PRO-132](https://linear.app/proceit/issue/PRO-132) | P04 | In Review | AUD-FISC P1 · Pontos de expedición e ativação por tipo documental |
| [PRO-133](https://linear.app/proceit/issue/PRO-133) | P04 | In Review | AUD-FISC P1 · Diagnóstico gateway e estados de revisão/envio FE |
| [PRO-134](https://linear.app/proceit/issue/PRO-134) | P04 | In Review | AUD-FISC P2 · Tipos de transacción iTipTra 5–13 com validação fiscal |
| [PRO-135](https://linear.app/proceit/issue/PRO-135) | P02 | In Review | [PRV-R03-01] Proveedores · impedir leitura da lista com CREAR-only via catálogo vazio |
| [PRO-136](https://linear.app/proceit/issue/PRO-136) | P02 | In Review | [PRV-R03-02] Proveedores · liberar retry geográfico em ficha somente VER |
| [PRO-137](https://linear.app/proceit/issue/PRO-137) | P02 | Todo | [F-DASH-01] Dashboard · definir política de catálogo e indicador Sin stock |
| [PRO-138](https://linear.app/proceit/issue/PRO-138) | P02 | In Review | [F-DASH-02] Dashboard · invalidar dados após troca de filtros |
| [PRO-139](https://linear.app/proceit/issue/PRO-139) | P02 | In Review | [F-DASH-03] Dashboard · distinguir movimientos anulados e inversos |
| [PRO-140](https://linear.app/proceit/issue/PRO-140) | P02 | In Review | [F-DASH-04] Dashboard · landing segura por papel sem loops |
| [PRO-141](https://linear.app/proceit/issue/PRO-141) | P02 | In Review | [F-DASH-05] Dashboard · esconder links Stock/Movimientos sem permissão |
| [PRO-142](https://linear.app/proceit/issue/PRO-142) | P02 | In Review | [F-DASH-06] Dashboard · alcance integral de depósitos em movimientos |
| [PRO-143](https://linear.app/proceit/issue/PRO-143) | P02 | In Review | [F-DASH-07] Dashboard · manter somas monetárias decimais exatas |
| [PRO-144](https://linear.app/proceit/issue/PRO-144) | P02 | In Review | [F-DASH-08] Dashboard · whitelist de períodos na API |
| [PRO-145](https://linear.app/proceit/issue/PRO-145) | P02 | In Review | [CLI-D01] Clientes · alta CREAR-only com catálogos mínimos |
| [PRO-146](https://linear.app/proceit/issue/PRO-146) | P02 | In Review | [CLI-D02] Clientes · UI consulta/edit segundo permissão |
| [PRO-147](https://linear.app/proceit/issue/PRO-147) | P02 | In Review | [CLI-D03] Clientes · resolver corrida de catálogos geográficos |
| [PRO-148](https://linear.app/proceit/issue/PRO-148) | P02 | In Review | [CLI-D06] Clientes · sincronizar tipo e flag de dirección fiscal |
| [PRO-149](https://linear.app/proceit/issue/PRO-149) | P02 | In Review | [CLI-D07] Clientes · limite de crédito decimal exato |
| [PRO-150](https://linear.app/proceit/issue/PRO-150) | P02 | In Review | [CLI-R03-01] Clientes · corrigir aviso pós-finalização de documentos |
| [PRO-151](https://linear.app/proceit/issue/PRO-151) | P02 | In Review | [PRV-D01] Proveedores · cadastro com somente CREAR sem acesso a lista |
| [PRO-152](https://linear.app/proceit/issue/PRO-152) | P02 | In Review | [PRV-D02] Proveedores · interface read-only sem EDITAR e ações autônomas |
| [PRO-153](https://linear.app/proceit/issue/PRO-153) | P02 | In Review | [PRV-D03] Proveedores · diferenciar falhas de geografia de lista vazia |
| [PRO-154](https://linear.app/proceit/issue/PRO-154) | P02 | In Review | [PRD-D01] Productos — alta CREAR-only e catálogos mínimos sem expor lista |
| [PRO-155](https://linear.app/proceit/issue/PRO-155) | P02 | In Review | [PRD-D02] Productos — retomar alta e uploads parciais sem duplicar produto |
| [PRO-156](https://linear.app/proceit/issue/PRO-156) | P02 | In Review | [PRD-D03] Productos — impedir lost update por PUT sem versão |
| [PRO-157](https://linear.app/proceit/issue/PRO-157) | P02 | In Review | [PRD-D04] Productos — fechamento documental idempotente para criador |
| [PRO-158](https://linear.app/proceit/issue/PRO-158) | P02 | In Review | [PRD-D05] Productos — botões e ficha respeitam CREAR/EDITAR |
| [PRO-159](https://linear.app/proceit/issue/PRO-159) | P02 | In Review | [PRD-D06] Productos — preservar rascunho de documentos ao trocar aba |
| [PRO-160](https://linear.app/proceit/issue/PRO-160) | P02 | In Review | [PRD-R03-01] Productos — impedir cierre silencioso de anexos pendentes após reload da alta |
| [PRO-161](https://linear.app/proceit/issue/PRO-161) | P02 | Todo | [PRD-GATE-C24] Productos KIT/alternativos CREAR-only — decidir visibilidade do catálogo |
| [PRO-162](https://linear.app/proceit/issue/PRO-162) | P02 | In Review | [PRD-R04-01] Productos — impedir descarte parcial de uploads sem confirmação na retomada |
| [PRO-163](https://linear.app/proceit/issue/PRO-163) | P02 | In Review | [PRD-R05-01] Productos — rastrear abandono de uploads novos que falham na retomada |
| [PRO-164](https://linear.app/proceit/issue/PRO-164) | P02 | In Review | [CAT-D01] Catálogos de productos — impedir corrida de gravação entre abas/formulários |
| [PRO-165](https://linear.app/proceit/issue/PRO-165) | P02 | In Review | [CAT-D02] Catálogos de productos — preservar erro de ativar/inativar após recarga |
| [PRO-166](https://linear.app/proceit/issue/PRO-166) | P02 | In Review | [LPR-D01] Listas de precios — habilitar alta CREAR-only sem expor dados de VER |
| [PRO-167](https://linear.app/proceit/issue/PRO-167) | P02 | In Review | [LPR-D02] Listas de precios — respeitar CREAR/EDITAR na listagem e ficha |
| [PRO-168](https://linear.app/proceit/issue/PRO-168) | P02 | In Review | [LPR-D03] Listas de precios — corrigir estado de vigência e KPI em calendário PY |
| [PRO-169](https://linear.app/proceit/issue/PRO-169) | P02 | In Review | [LPR-D04] Listas de precios — bloquear Guardar sem catálogos confiáveis e permitir retry |
| [PRO-170](https://linear.app/proceit/issue/PRO-170) | P02 | In Review | [LPR-R03-01] Listas de precios — atualizar vigência ao passar meia-noite PY sem remontar página |
| [PRO-171](https://linear.app/proceit/issue/PRO-171) | P02 | Todo | [LPR-GATE-VISIBILIDADE] Listas de precios CREAR-only — decidir catálogo mínimo de clientes, produtos e lista-base |
| [PRO-172](https://linear.app/proceit/issue/PRO-172) | P02 | In Review | [LPR-R04-01] Listas de precios — sincronizar data React ao instalar vigilante em meia-noite |
| [PRO-173](https://linear.app/proceit/issue/PRO-173) | P02 | In Review | [CC-D01] Catálogos comerciales — permitir alta CREAR-only sem expor listagem VER |
| [PRO-174](https://linear.app/proceit/issue/PRO-174) | P02 | In Review | [CC-D02] Catálogos comerciales — impedir mutação tardia cruzar abas e destruir formulários |
| [PRO-175](https://linear.app/proceit/issue/PRO-175) | P02 | In Review | [CC-D03] Catálogos comerciales — exigir catálogo de moedas no GET de Tipos de cambio |
| [PRO-176](https://linear.app/proceit/issue/PRO-176) | P02 | In Review | [CC-R03-01] Catálogos comerciales — impedir perda de edição nos campos durante POST/PUT |
| [PRO-177](https://linear.app/proceit/issue/PRO-177) | P02 | In Review | [CC-R03-02] Catálogos comerciales — devolver 400 em modo monedas inválido para CREAR-only |
| [PRO-178](https://linear.app/proceit/issue/PRO-178) | P03 | In Review | [STK-D02] Inventario Stock — isolar moeda-base por instância e ignorar GET tardio |
| [PRO-179](https://linear.app/proceit/issue/PRO-179) | P03 | Todo | [STK-D03] Inventario Stock — investigar snapshot inconsistente em movimentos simultâneos |
| [PRO-180](https://linear.app/proceit/issue/PRO-180) | P03 | In Review | [C24-R04-01] Stock — distinguir «Sin disponible» no depósito selecionado |
| [PRO-181](https://linear.app/proceit/issue/PRO-181) | P03 | In Review | [C24-R04-02] Stock — não mostrar saldo zero a usuário sem depósitos |
| [PRO-182](https://linear.app/proceit/issue/PRO-182) | P03 | In Review | [MOV-D01] Movimientos — preservar intenção e chave de idempotência no POST |
| [PRO-183](https://linear.app/proceit/issue/PRO-183) | P03 | In Review | [MOV-D02] Movimientos — descartar histórico de filtro anterior durante carga |
| [PRO-184](https://linear.app/proceit/issue/PRO-184) | P03 | In Review | [MOV-D03] Movimientos — preservar rascunho durante virada de data PY |
| [PRO-185](https://linear.app/proceit/issue/PRO-185) | P03 | In Review | [MOV-R03-01] Movimientos — preservar K1 após 4xx em retry indeterminado |
| [PRO-186](https://linear.app/proceit/issue/PRO-186) | P03 | In Review | [MOV-R03-02] Movimientos — ignorar resposta tardia após saída da tela |
| [PRO-187](https://linear.app/proceit/issue/PRO-187) | P03 | In Review | [MOV-R06-01] Movimientos — publicar catálogos mesmo com rascunho editado na carga |
| [PRO-188](https://linear.app/proceit/issue/PRO-188) | P03 | In Review | [MOV-O07] Movimientos — recuperar K1 e impedir duplicação entre sessões e abas |
| [PRO-189](https://linear.app/proceit/issue/PRO-189) | P03 | In Review | [MOV-R08-01] Movimientos — confirmação sem resposta deve recuperar K1 e número |
| [PRO-190](https://linear.app/proceit/issue/PRO-190) | P03 | In Review | [MOV-R08-02] Movimientos — bloquear POST legado sem reserva NEX-066 |
| [PRO-191](https://linear.app/proceit/issue/PRO-191) | P03 | In Review | [MOV-R09-01] Movimientos — exigir ACK por clique após mostrar número |
| [PRO-192](https://linear.app/proceit/issue/PRO-192) | P03 | In Review | [MOV-R09-02] Movimientos — ocultar snapshot sem VER ou alcance atual |
| [PRO-193](https://linear.app/proceit/issue/PRO-193) | P03 | In Review | [MOV-R10-01] Movimientos — revalidar visibilidade ao repetir reserva K1 |
| [PRO-194](https://linear.app/proceit/issue/PRO-194) | P04 | In Review | [DOC-KUDE-P0] Documentos electrónicos — ver/baixar KuDE PDF da FE via /api/kude |
| [PRO-195](https://linear.app/proceit/issue/PRO-195) | P04 | In Review | [DOC-UX-P1] Documentos electrónicos — painel desktop superior à referência comercial |
| [PRO-196](https://linear.app/proceit/issue/PRO-196) | P04 | In Review | [DOC-KUDE-R01-01] KuDE — limitar leitura JSON do gateway durante streaming |
| [PRO-197](https://linear.app/proceit/issue/PRO-197) | P04 | In Review | [DOC-KUDE-R01-02] KuDE — baixar PDF com nova consulta ao gateway |
| [PRO-198](https://linear.app/proceit/issue/PRO-198) | P02 | In Review | [CM-IMP-01] CASA MINGO — importar 561 productos reales IVA10, familia/marca/línea |
| [PRO-199](https://linear.app/proceit/issue/PRO-199) | P04 | Backlog | [PENDIENTE CONTRATO COMPLETO] Cancelación SIFEN FE/NCE y reversión de stock |
| [PRO-200](https://linear.app/proceit/issue/PRO-200) | P04 | In Review | NEXIT CASA MINGO · Pacote fechado de correções para Claude (E01–E10) |
| [PRO-201](https://linear.app/proceit/issue/PRO-201) | P04 | In Review | [E01-R01-01] Facturas — editar Cantidad inmediatamente al añadir en selector avanzado |
| [PRO-202](https://linear.app/proceit/issue/PRO-202) | P03 | In Review | [E02-R01-F001] Bloquear anulación manual de SALIDAS vinculadas a FE |
| [PRO-203](https://linear.app/proceit/issue/PRO-203) | P03 | In Review | [E02-R01-F002] Validar todos los detalles fiscales en conciliación de stock SQL |
| [PRO-204](https://linear.app/proceit/issue/PRO-204) | P04 | In Review | [E03-R01-F001] Reiniciar descuentos monetarios al cambiar moneda de FE |
| [PRO-205](https://linear.app/proceit/issue/PRO-205) | P04 | In Review | [E04-R01-F001] Preservar snapshot de FE sem bloquear exclusão de direções |
| [PRO-206](https://linear.app/proceit/issue/PRO-206) | P04 | In Review | [E04-R01-F002] Mostrar filiais COMERCIAL registradas como destinos |
| [PRO-207](https://linear.app/proceit/issue/PRO-207) | P10 | In Review | [G01] Configuración FE — editar e guardar URL e credenciais API por empresa |
| [PRO-208](https://linear.app/proceit/issue/PRO-208) | P10 | In Review | [G01-R01-F001] Bloquear IPv4 mapeada en IPv6 hexadecimal en protección SSRF |
| [PRO-209](https://linear.app/proceit/issue/PRO-209) | P10 | In Review | [G01-R01-F002] Eliminar DNS rebinding entre validación y conexión TLS del gateway |
| [PRO-210](https://linear.app/proceit/issue/PRO-210) | P04 | In Review | [AUD-E06-F001] Restaurar línea sin perder cantidad o monto editado |
| [PRO-211](https://linear.app/proceit/issue/PRO-211) | P04 | In Review | [AUD-E07-F001] Saldo de facturas elegibles debe incluir NCE DESCUENTO aprobadas |
| [PRO-292](https://linear.app/proceit/issue/PRO-292) | P04 | In Review | [E1-R02-F001] NCE: preservar observaciones históricas con marcador textual |
| [PRO-293](https://linear.app/proceit/issue/PRO-293) | P01 | In Review | [V1-E2] Usuarios multiempresa y asignación de perfiles existentes — pendiente de análisis |
| [PRO-294](https://linear.app/proceit/issue/PRO-294) | P04 | Todo | [CM-V1-E3] FE: fecha de emisión editable (−30/+5 días) con validación fiscal |
| [PRO-295](https://linear.app/proceit/issue/PRO-295) | P03 | In Review | [CM-V1-E4] Movimientos: cantidades enteras sin ceros decimales, preservando fracciones |
| [PRO-296](https://linear.app/proceit/issue/PRO-296) | P09 | In Review | [CM-V1-E5] Informe de Ventas: FE/NCE reales, estados SIFEN y conciliación |
| [PRO-297](https://linear.app/proceit/issue/PRO-297) | P09 | Todo | [CM-V1-E6-B] Informe de Compras: entradas reales a costo, sin IVA fiscal |
| [PRO-298](https://linear.app/proceit/issue/PRO-298) | P04 | Todo | [CM-V1-PROVEDOR] Validar cabecera y formato KuDE FE/NCR con proveedor API |
| [PRO-300](https://linear.app/proceit/issue/PRO-300) | P04 | In Review | [E1-R03-F002] NCE: idempotencia compara observación original, no dInfAdic compuesto |
| [PRO-301](https://linear.app/proceit/issue/PRO-301) | P04 | In Review | [E1-R04-F001] NCE DESCUENTO: reintento debe comparar monto del servicio |
| [PRO-302](https://linear.app/proceit/issue/PRO-302) | P04 | In Review | [E1-R04-F002] NEX-071: conservar observación cruda exacta en registro e idempotencia |
| [PRO-303](https://linear.app/proceit/issue/PRO-303) | P04 | In Review | [E1-R05-F001] NEX-071: validar observación original también en reutilización SQL |
| [PRO-304](https://linear.app/proceit/issue/PRO-304) | P01 | Todo | [ARCH-V1] Aprobar modelo MASTER, administradores por empresa, perfiles múltiples y permisos |
| [PRO-305](https://linear.app/proceit/issue/PRO-305) | P01 | Backlog | [MASTER-V1] Plataforma: registrar empresas/clientes e criar primeiro admin empresarial |
| [PRO-306](https://linear.app/proceit/issue/PRO-306) | P01 | Backlog | [PERFILES-V1] Catálogo único de nueve perfiles y asignación múltiple por empresa |
| [PRO-307](https://linear.app/proceit/issue/PRO-307) | P01 | In Review | [COMERCIAL-V1] Definir vendedor comercial versus operador emissor FE/NCE |
| [PRO-308](https://linear.app/proceit/issue/PRO-308) | P01 | Todo | [MASTER-V1] Habilitación de módulos contratados por empresa — definición funcional y autorización |
| [PRO-309](https://linear.app/proceit/issue/PRO-309) | P04 | Todo | [FE-V1-GATE] Cerrar decisiones P01–P08 antes de implementar stock, correcciones y estados |
| [PRO-310](https://linear.app/proceit/issue/PRO-310) | P04 | Canceled | [FE-V1-P0] Reserva por depósito al enviar y SALIDA real al aprobar SIFEN |
| [PRO-311](https://linear.app/proceit/issue/PRO-311) | P04 | Todo | [FE-V1-P0] Corrección de FE rechazada con versiones y CDC auditables |
| [PRO-312](https://linear.app/proceit/issue/PRO-312) | P04 | In Progress | [FE-V1-P0] Historial JSON de envíos/respuestas y consulta automática FE |
| [PRO-313](https://linear.app/proceit/issue/PRO-313) | P04 | Todo | [FE-V1-UI] Cancelar documento — elegibilidad 48h y motivo obligatorio |
| [PRO-314](https://linear.app/proceit/issue/PRO-314) | P04 | In Review | [FE-E01] Documentos electrónicos — visualizar JSON fiscal e resposta de intento existentes (somente leitura) |
| [PRO-315](https://linear.app/proceit/issue/PRO-315) | P04 | In Review | [FE-E02] Documentos electrónicos — histórico completo paginado de envíos y consultas |
| [PRO-321](https://linear.app/proceit/issue/PRO-321) | P04 | In Review | [FE-E03-A1] Base SQL inmutable de evidencia HTTP por versión fiscal |
| [PRO-322](https://linear.app/proceit/issue/PRO-322) | P04 | In Review | [FE-DIR] Serializar e validar dirección fiscal completa del receptor en JSON SIFEN |
| [PRO-323](https://linear.app/proceit/issue/PRO-323) | P04 | Todo | [FE-INF] dInfAdic editable con inserción asistida de entrega y vendedor |
| [PRO-324](https://linear.app/proceit/issue/PRO-324) | P04 | In Review | [LOGÍSTICA-IDEMP] Identidade histórica segura do destino de entrega (PRO-205) |
| [PRO-325](https://linear.app/proceit/issue/PRO-325) | P05 | In Review | [CM-V1-E6-A] Compras → Entradas: proveedor, stock y costo con registro atómico |
| [PRO-326](https://linear.app/proceit/issue/PRO-326) | P04 | In Review | [CM-V1-P0] KuDE FE/NCE: mostrar PDF por documento selecionado, sem exigir CDC nem APROBADO |
| [PRO-327](https://linear.app/proceit/issue/PRO-327) | P02 | Todo | [CM-V1-P0] Productos: restaurar códigos con ceros y habilitar códigos alfanuméricos en alta |
| [PRO-328](https://linear.app/proceit/issue/PRO-328) | P04 | In Review | [CM-V1-P0] FE: dirección elegida como domicilio principal del receptor SIFEN, sin dInfAdic automático |
| [PRO-329](https://linear.app/proceit/issue/PRO-329) | P04 | Todo | [CM-29OCT] CASA MINGO — paquete de 10 ajustes FE, documentos, reportes y proveedor |
| [PRO-330](https://linear.app/proceit/issue/PRO-330) | P03 | In Review | [CM-P0] Nueva factura — avisar stock insuficiente al añadir/cambiar cada línea |
| [PRO-331](https://linear.app/proceit/issue/PRO-331) | P04 | In Review | [CM-P1] Nueva factura — ordinal, scroll de ítems y foco automático al buscador de código |
| [PRO-332](https://linear.app/proceit/issue/PRO-332) | P09 | Todo | [CM-P1] Informe de Ventas — exportar detalle por factura × producto × vendedor × fecha |
| [PRO-333](https://linear.app/proceit/issue/PRO-333) | P04 | In Review | [CM-P1] Documentos electrónicos — ordenar columna Documento por número numérico |
| [PRO-334](https://linear.app/proceit/issue/PRO-334) | P04 | In Review | [CM-P1] Documentos electrónicos — FE azul, NCE amarillo suave sin mezclar estados SIFEN |
| [PRO-335](https://linear.app/proceit/issue/PRO-335) | P04 | In Review | [CM-P0] TODAS las pantallas — importes PYG sin decimales y USD máximo 2, sin alterar cálculos |
| [PRO-336](https://linear.app/proceit/issue/PRO-336) | P04 | Todo | [CM-TERCERO] Certificado digital gateway — reemplazo con clave existente y consulta DTE APROBADOS |
| [PRO-337](https://linear.app/proceit/issue/PRO-337) | P09 | In Review | [CM-P0-UX] Informe de Ventas — corregir tarjeta cortada, títulos compactos y tabla informativa responsive |
| [PRO-338](https://linear.app/proceit/issue/PRO-338) | P04 | In Review | [DOC-SIFEN-P0] Consulta automática FE y estados fiscales visibles con alertas de inconsistencias |
| [PRO-339](https://linear.app/proceit/issue/PRO-339) | P04 | In Review | [NEXIT FE] Limite de linhas configurável por empresa (1–999; tela ADMIN futura) |
| [PRO-340](https://linear.app/proceit/issue/PRO-340) | P10 | Todo | [ADMIN FUTURO] Configurar máximo de líneas FE por empresa desde panel administrativo |
| [PRO-341](https://linear.app/proceit/issue/PRO-341) | P04 | In Review | [CM-P1] Nueva factura: código de producto completo y foco en Cantidad al añadir |
| [PRO-342](https://linear.app/proceit/issue/PRO-342) | P04 | In Review | [P0 CASA MINGO] Auditoría integral FE — envío, lote, consulta SIFEN, histórico y KuDE de otro emisor |
| [PRO-354](https://linear.app/proceit/issue/PRO-354) | P03 | In Review | [NEXIT-P1] Política de stock insuficiente por empresa y bajas pendientes de FE |
| [PRO-357](https://linear.app/proceit/issue/PRO-357) | P03 | Backlog | [C1-OBS-01] Historial de Movimientos — consulta de conteo sin cobertura del verificador SQL |
| [PRO-361](https://linear.app/proceit/issue/PRO-361) | P11 | Done | [NEXIT-T01-R01] NEX-082 — triggers actualizado_at en 3 tablas (solo autoría SQL) |
| [PRO-363](https://linear.app/proceit/issue/PRO-363) | P11 | Done | [T01-FK-01] Diagnosticar FK empresa_id faltante na NEX-081 sem alterar migrations históricas |
| [PRO-365](https://linear.app/proceit/issue/PRO-365) | P04 | In Review | [NEXIT-UX-P0] Alinear Documentos electrónicos con la referencia visual de la competencia |
| [PRO-369](https://linear.app/proceit/issue/PRO-369) | P04 | In Review | [NEXIT PRO-365 C02-C01] Aviso neutro APROBADO e alerta KuDE não verificado em linguagem simples |
| [PRO-370](https://linear.app/proceit/issue/PRO-370) | P04 | In Review | [NEXIT PRO-365 C02-C03 / F03] Indicador visual de FE aprobada y posteriormente cancelada |


## 8. Atualização administrativa de rastreabilidade — 26/11/2026 (R01)
Este adendo prevalece sobre as quantidades/status de baseline nas seções 1 e 7. Os 203 IDs originais permanecem preservados e mapeados; três novas tarefas específicas foram criadas para lacunas sem tarefa dedicada, total 206 (201 não canceladas). Não são novas ordens de Claude.

| Nova tarefa | Pacote primário | Status | Entrega |
|---|---|---|---|
| [PRO-372](https://linear.app/proceit/issue/PRO-372) | P04 | Todo | XML fiscal real por documento/conta, contrato fornecedor; filha PRO-91, complementa PRO-195 sem duplicar JSON/KuDE |
| [PRO-373](https://linear.app/proceit/issue/PRO-373) | P04 | Todo | Correo: envio/reenvio comprovado, contrato fornecedor, destinatário, autorização, idempotência e retorno; filha PRO-91 |
| [PRO-374](https://linear.app/proceit/issue/PRO-374) | P11 | Todo | Gate de definição das dependências mínimas dos 18 menus e rastreabilidade histórica V2; não promove escopo extra nem autoriza código |

**Distribuição atual:** In Progress 1; Todo 44; In Review 148; Backlog 6; Done 2; Canceled 5. P01=11, P02=54, P03=27, P04=71, P05=5, P06=3, P07=5, P08=2, P09=14, P10=6, P11=8; total 206. Todas as 19 tarefas dos 18 menus em Todo; PRO-199/305 promovidas de Backlog para Todo por integrarem pacotes V1. Critérios focais de entrega anotados nas 19 tarefas dos menus, PRO-199/305/115/312. Os 148 In Review continuam sem aceite definitivo.
**Sequência:** PRO-312-R03 B → auditoria → autorização separada para C → PRO-309/311 → PRO-313/199 → demais pacotes pela dependência. PRO-374 deve orientar decisões antes das respectivas ordens de NRE, Compras, Ventas, Finanzas, etc.; não iniciar trabalho concorrente por este registro. 18 menus obrigatórios, 49 opções existentes + Dashboard/Plataforma + Informe Compras; XML/Correo são ações do menu Documentos, não menus novos. Não declarar produção completa se houver bloqueio de fornecedor ou gate não resolvido.
**Comando vigente**: [ordem R03 B](https://github.com/proceit-tech/distribuidora/blob/333a7f336c73e4bb8d54172238ebfa60a530e88d/documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-312-R03-LOTE-B-INSTRUMENTACION-R05-2026-11-25.md), HEAD autorizado 7e927c46e957c81e55f2394a5f5c360a0f780ad0. HEAD observado no PR #7: 7e927c46e957c81e55f2394a5f5c360a0f780ad0; Draft=true, merged=false. Não alterar CLAUDE.md ou branch de desenvolvimento por este planejamento. Sem Vercel, VM/SQL/testes manuais/deploy/merge. Nenhuma nova base de testes.

**STOP:** PRO-312-R03 única ordem ativa. Este plano é organização do produto, não comando Claude. Próxima ordem somente após auditoria e autorização do responsável.