# NEXIT V1 — reconciliación global Linear × GitHub — 24/11/2026

## Alcance y metodología
Proyecto [Distribuidora — NEXIT V1](https://linear.app/proceit/project/distribuidora-nexit-v1-c4619a4bc91d), totalidad de 203 issues no archivadas recuperadas en una página (sin página siguiente). PR #7 Draft: 1477 paths modificados/añadidos, 228 documentos AUD en testes/auditorias; inventario de archivos completo recuperado. HEAD consultado 5a5fafccf86313c151cd128bb4e22133d6e19442; código funcional auditado e289d25340fd89d4e59f6946a012a907c180546f. Cruce de inventario Linear, plan funcional vigente, menú real, registro de progreso, auditorías focales, fuentes actuales relevantes y logs CI. **No es una nueva auditoría línea por línea de los 1477 archivos ni prueba de los 203 criterios de aceptación.** Otros proyectos Linear no se alteran. No existe una orden de desarrollo activa.

Fuente: [plan R02 17/11](https://github.com/proceit-tech/distribuidora/blob/5a5fafccf86313c151cd128bb4e22133d6e19442/documentacao/planos/PLAN-NEXIT-AJUSTES-FUNCIONALES-R02-2026-11-17.md), [PROGRESSO](https://github.com/proceit-tech/distribuidora/blob/5a5fafccf86313c151cd128bb4e22133d6e19442/PROGRESSO-NEXIT-V1.md), [menú](https://github.com/proceit-tech/distribuidora/blob/5a5fafccf86313c151cd128bb4e22133d6e19442/lib/navigation/menu.ts), [VM](https://github.com/proceit-tech/distribuidora/blob/5a5fafccf86313c151cd128bb4e22133d6e19442/documentacao/infra/PROCEDIMENTO-ATUALIZACAO-AMBIENTE-NEXIT-VM.md), [CI app](https://github.com/proceit-tech/distribuidora/actions/runs/45472758228), [CI banco](https://github.com/proceit-tech/distribuidora/actions/runs/45472759016). 6860 app + 1125 banco = 7985 comprobaciones, 0 fallos. T01, T19/T21/T24/T25/T26/T27–T34 y C1 PASS. 83 migrations instaladas y verificaciones NEX-082 15/15 y NEX-083 16/16 registradas 23/11. Responsable informa app VM actualizada el 24/11, sin evidencia terminal nueva del SHA. No nuevas migrations ni ejecución SQL/VM por ChatGPT.

## Estado de gestión
Antes: 203 total, In Review 137, In Progress 3, Todo 28, Backlog 30, Canceled 5, Done 0.
Después: In Review 147; Backlog 27; Canceled 5; Todo 21; In Progress 1; Done 2. Activas no canceladas: 198. Done 2; In Review 147; ambos 75.3% por cantidad, NO porcentaje de esfuerzo ni software homologado. Incluye padres/subtareas. Hojas (sin hijos dentro del inventario): 171, In Review 119; Backlog 26; Canceled 5; Todo 18; In Progress 1; Done 2. In Review no significa que todo el alcance haya sido implementado/homologado. Done solo con evidencia del alcance específico; no cerrar módulos por CI.
Se actualizaron 24 issues: 14 cambios de estado (2 Done, 12 a In Review) y 10 actualizaciones de evidencia sin cambio de estado.

## Cola funcional real y decisiones
- PRO-311 + PRO-309: corrección de FE rechazada, revisiones/CDC/identidad y normas; no reabrir PRO-310 (Canceled). Salida física una vez al emitir; rechazo fiscal no revierte venta.
- PRO-312: consulta automática FE/NCE E08 y E01/E02 ya existen; E03-A2 instrumentación exacta de HTTP y E03-B vistas de revisiones siguen pendientes de comprobar/implementar, no repetir historial existente.
- PRO-304/308/305/306/110: MASTER crea empresa/admin y habilita módulos contratados; matriz nueve perfiles fijos, unión y restricciones; núcleo usuarios/vendedores existente (PRO-109/293/72/307 en revisión), no presumir habilitación modular completa.
- PRO-179: consistencia snapshot stock/costos. PRO-324: identidad histórica logística de entrega; sin cambiar reglas fiscales.
- PRO-327: UI/API códigos texto/ceros; SQL histórico 561 corregido, no repetir. PRO-294: límite fiscal de fecha vs -30/+5; PRO-323: reconciliar requisitos residuales de dInfAdic (observaciones+vendedor ya existe, entrega en domicilio).
- PRO-297 Informe Compras real, PRO-332 detalle ventas cruzado, PRO-340 configuración administrativa de límite FE (backend PRO-339 existente). PRO-108/329 agregadores abiertos.
- PRO-137/161/171: decisiones de catálogo/visibilidad. PRO-119/357: cobertura C1 residual, no fallo SQL probado.
- PRO-313/199: cancelación no operativa, fuente oficial fecha/tipo/evento y contrato/reversión stock pendientes; F03 solo presentación. PRO-298/336 dependencia proveedor, no manipular PDF ni certificados/secretos.
- PRO-121/125/126: ampliaciones fiscales condicionales. Otros módulos ocultos planeados (Compras solicitudes/órdenes/recepciones/devoluciones, Ventas pedidos/entregas, Finanzas, remisión/monitor, roles/config/auditoría, zonas/rutas) requieren decisión V1/V2 y orden propia, no considerarlos desarrollados.
- PRO-115: homologación por menú, evidencia visual y funcional real; PRO-114 despliegue/GO integral; PRO-113 control operacional de schema/rollback. PRO-369 F01 histórico insuficiente, KuDE aprobado técnicamente; PRO-370 conforme en código/CI, condición por evento sintética; PRO-365 revisión visual pendiente.
- PRO-130/132 y T25/T26: fallas CI históricas superadas en run actual; no repetir correcciones sin defecto nuevo demostrado. PRO-198 carga 561 histórica confirmada; no presumir saldo actual.

## Inventario completo de issues posterior a actualización

| Linear | Tarea | Padre | Estado real | Clasificación de revisión |
|---|---|---|---|---|
| [PRO-61](https://linear.app/proceit/issue/PRO-61) | FAT-E2 — Concluir envio FE ao gateway e confirmação SIFEN | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-62](https://linear.app/proceit/issue/PRO-62) | CI NEXIT — PostgreSQL T01, verificador SQL C1 y cobertura | — | In Review | Reconciliada con evidencia específica |
| [PRO-63](https://linear.app/proceit/issue/PRO-63) | Navegación por perfiles y permisos — implementado, pendente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-64](https://linear.app/proceit/issue/PRO-64) | Dashboard y indicadores — implementado, pendente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-65](https://linear.app/proceit/issue/PRO-65) | Plataforma · Empresas — implementado, pendente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-66](https://linear.app/proceit/issue/PRO-66) | Clientes — implementado, pendente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-67](https://linear.app/proceit/issue/PRO-67) | Proveedores — implementado, pendente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-68](https://linear.app/proceit/issue/PRO-68) | Productos — implementado, pendente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-69](https://linear.app/proceit/issue/PRO-69) | Catálogos de productos — implementado, pendente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-70](https://linear.app/proceit/issue/PRO-70) | Listas de precios — implementado, pendente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-71](https://linear.app/proceit/issue/PRO-71) | Catálogos comerciales — implementado, pendente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-72](https://linear.app/proceit/issue/PRO-72) | Vendedores — rol comercial por empresa, distinto del usuario emisor (regla pendiente) | — | In Review | Reconciliada con evidencia específica |
| [PRO-73](https://linear.app/proceit/issue/PRO-73) | Zonas y rutas — planificado | — | Backlog | Mantener; no cierre demostrado |
| [PRO-74](https://linear.app/proceit/issue/PRO-74) | Solicitudes — planificado | — | Backlog | Mantener; no cierre demostrado |
| [PRO-75](https://linear.app/proceit/issue/PRO-75) | Órdenes de compra — planificado | — | Backlog | Mantener; no cierre demostrado |
| [PRO-76](https://linear.app/proceit/issue/PRO-76) | Recepciones — planificado | — | Backlog | Mantener; no cierre demostrado |
| [PRO-77](https://linear.app/proceit/issue/PRO-77) | Devoluciones de compra — planificado | — | Backlog | Mantener; no cierre demostrado |
| [PRO-78](https://linear.app/proceit/issue/PRO-78) | Stock — implementado, pendente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-79](https://linear.app/proceit/issue/PRO-79) | Movimientos — implementado, pendente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-80](https://linear.app/proceit/issue/PRO-80) | Depósitos — implementado, pendente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-81](https://linear.app/proceit/issue/PRO-81) | Reposición — implementado, pendente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-82](https://linear.app/proceit/issue/PRO-82) | Inventario · integración y unidades identificadas — planificado | — | Backlog | Mantener; no cierre demostrado |
| [PRO-83](https://linear.app/proceit/issue/PRO-83) | Pedidos — planificado | — | Backlog | Mantener; no cierre demostrado |
| [PRO-84](https://linear.app/proceit/issue/PRO-84) | Ventas — planificado | — | Backlog | Mantener; no cierre demostrado |
| [PRO-85](https://linear.app/proceit/issue/PRO-85) | Entregas — planificado | — | Backlog | Mantener; no cierre demostrado |
| [PRO-86](https://linear.app/proceit/issue/PRO-86) | Cuentas por cobrar — planificado | — | Backlog | Mantener; no cierre demostrado |
| [PRO-87](https://linear.app/proceit/issue/PRO-87) | Cobros — planificado | — | Backlog | Mantener; no cierre demostrado |
| [PRO-88](https://linear.app/proceit/issue/PRO-88) | Cuentas por pagar — planificado | — | Backlog | Mantener; no cierre demostrado |
| [PRO-89](https://linear.app/proceit/issue/PRO-89) | Pagos — planificado | — | Backlog | Mantener; no cierre demostrado |
| [PRO-90](https://linear.app/proceit/issue/PRO-90) | Caja — planificado | — | Backlog | Mantener; no cierre demostrado |
| [PRO-91](https://linear.app/proceit/issue/PRO-91) | Documentos electrónicos — implementado, pendiente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-92](https://linear.app/proceit/issue/PRO-92) | Factura Electrónica · FAT-E1 cálculo fiscal — implementado, pendiente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-93](https://linear.app/proceit/issue/PRO-93) | Factura Electrónica · interfaz Nueva factura — implementado, pendiente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-94](https://linear.app/proceit/issue/PRO-94) | MFE-NCE V1 · Emitir notas de crédito con motivos, CDC y saldos | — | In Review | Reconciliada con evidencia específica |
| [PRO-95](https://linear.app/proceit/issue/PRO-95) | Notas de remisión — planificado | — | Backlog | Mantener; no cierre demostrado |
| [PRO-96](https://linear.app/proceit/issue/PRO-96) | Monitor SIFEN — planificado | — | Backlog | Mantener; no cierre demostrado |
| [PRO-97](https://linear.app/proceit/issue/PRO-97) | FAT-E3 · conciliación periódica — planificado | — | In Review | Reconciliada con evidencia específica |
| [PRO-98](https://linear.app/proceit/issue/PRO-98) | FAT-E4 · consulta y sincronización operativa — planificado | — | In Review | Reconciliada con evidencia específica |
| [PRO-99](https://linear.app/proceit/issue/PRO-99) | Stock general — implementado, pendiente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-100](https://linear.app/proceit/issue/PRO-100) | Valorización de inventario — implementado, pendiente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-101](https://linear.app/proceit/issue/PRO-101) | Kardex de movimientos — implementado, pendiente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-102](https://linear.app/proceit/issue/PRO-102) | Stock crítico y reposición — implementado, pendiente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-103](https://linear.app/proceit/issue/PRO-103) | Stock general — implementado, pendiente homologación | — | Canceled | Excluida |
| [PRO-104](https://linear.app/proceit/issue/PRO-104) | Valorización de inventario — implementado, pendiente homologación | — | Canceled | Excluida |
| [PRO-105](https://linear.app/proceit/issue/PRO-105) | Kardex de movimientos — implementado, pendiente homologación | — | Canceled | Excluida |
| [PRO-106](https://linear.app/proceit/issue/PRO-106) | Stock crítico y reposición — implementado, pendiente homologación | — | Canceled | Excluida |
| [PRO-107](https://linear.app/proceit/issue/PRO-107) | Lotes y vencimientos — implementado, pendiente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-108](https://linear.app/proceit/issue/PRO-108) | Reportes operativos — sumar Informe de Ventas e Informe de Compras (CASA MINGO V1) | — | Todo | Reconciliada con evidencia específica |
| [PRO-109](https://linear.app/proceit/issue/PRO-109) | Administración empresarial — usuarios por empresa y asignación de múltiples perfiles | — | In Review | Reconciliada con evidencia específica |
| [PRO-110](https://linear.app/proceit/issue/PRO-110) | Perfiles y permisos — nueve perfiles fijos; matriz de permisos pendiente | — | Backlog | Mantener; no cierre demostrado |
| [PRO-111](https://linear.app/proceit/issue/PRO-111) | Configuración — planificado | — | Backlog | Mantener; no cierre demostrado |
| [PRO-112](https://linear.app/proceit/issue/PRO-112) | Auditoría — planificado | — | Backlog | Mantener; no cierre demostrado |
| [PRO-113](https://linear.app/proceit/issue/PRO-113) | PostgreSQL · control de migrations — pendiente | — | In Review | Reconciliada con evidencia específica |
| [PRO-114](https://linear.app/proceit/issue/PRO-114) | VM/Docker · despliegue controlado — pendiente | — | In Review | Reconciliada con evidencia específica |
| [PRO-115](https://linear.app/proceit/issue/PRO-115) | Homologación visual y funcional por menú — pendiente | — | Todo | Reconciliada con evidencia específica |
| [PRO-116](https://linear.app/proceit/issue/PRO-116) | Seguridad multiempresa y permisos — implementado, pendiente homologación | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-117](https://linear.app/proceit/issue/PRO-117) | FAT-E2-R01-01 · Respuesta de envío debe coincidir con estado realmente persistido | PRO-61 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-118](https://linear.app/proceit/issue/PRO-118) | FAT-E2-R01-02 · Proteger estados finales SIFEN dentro de transacción SQL | PRO-61 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-119](https://linear.app/proceit/issue/PRO-119) | C1 — Rastrear ocorrências repetidas na linha base de SQL dinâmico | — | Backlog | Mantener; no cierre demostrado |
| [PRO-120](https://linear.app/proceit/issue/PRO-120) | Fase A — impedir alteração do IVA do produto por replay de factura | PRO-93 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-121](https://linear.app/proceit/issue/PRO-121) | MFE-B1 · Factura Crédito, Plazo y Cuotas | PRO-93 | Backlog | Mantener; no cierre demostrado |
| [PRO-122](https://linear.app/proceit/issue/PRO-122) | MFE-B2 · Medios de pago y datos condicionales | PRO-93 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-123](https://linear.app/proceit/issue/PRO-123) | MFE-C · Factura PYG USD BRL y tipo de cambio manual | PRO-93 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-124](https://linear.app/proceit/issue/PRO-124) | MFE-D1 · Descuentos de factura por ítem y globales | PRO-93 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-125](https://linear.app/proceit/issue/PRO-125) | MFE-D2 · Datos complementarios fiscales y anticipos | PRO-93 | Backlog | Mantener; no cierre demostrado |
| [PRO-126](https://linear.app/proceit/issue/PRO-126) | MFE-E · Casos SIFEN especiales y campos sectoriales | PRO-93 | Backlog | Mantener; no cierre demostrado |
| [PRO-127](https://linear.app/proceit/issue/PRO-127) | MFE-P0 · Completar producto en factura y habilitar solo Crédito a Plazo | PRO-93 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-128](https://linear.app/proceit/issue/PRO-128) | MFE-UX · Compactar Nueva factura, IVA directo y unidades | PRO-93 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-129](https://linear.app/proceit/issue/PRO-129) | MFE-ADMIN · Gestión segura de puntos de expedición | PRO-93 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-130](https://linear.app/proceit/issue/PRO-130) | AUD-FISC · Correções fiscais NEXIT — sequências, pontos, transações e gateway | — | In Review | Reconciliada con evidencia específica |
| [PRO-131](https://linear.app/proceit/issue/PRO-131) | AUD-FISC P0 · Sequência fiscal independente por tipo de documento | PRO-130 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-132](https://linear.app/proceit/issue/PRO-132) | AUD-FISC P1 · Pontos de expedición e ativação por tipo documental | PRO-130 | In Review | Reconciliada con evidencia específica |
| [PRO-133](https://linear.app/proceit/issue/PRO-133) | AUD-FISC P1 · Diagnóstico gateway e estados de revisão/envio FE | PRO-130 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-134](https://linear.app/proceit/issue/PRO-134) | AUD-FISC P2 · Tipos de transacción iTipTra 5–13 com validação fiscal | PRO-130 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-135](https://linear.app/proceit/issue/PRO-135) | [PRV-R03-01] Proveedores · impedir leitura da lista com CREAR-only via catálogo vazio | PRO-67 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-136](https://linear.app/proceit/issue/PRO-136) | [PRV-R03-02] Proveedores · liberar retry geográfico em ficha somente VER | PRO-67 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-137](https://linear.app/proceit/issue/PRO-137) | [F-DASH-01] Dashboard · definir política de catálogo e indicador Sin stock | PRO-64 | Todo | Mantener; no cierre demostrado |
| [PRO-138](https://linear.app/proceit/issue/PRO-138) | [F-DASH-02] Dashboard · invalidar dados após troca de filtros | PRO-64 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-139](https://linear.app/proceit/issue/PRO-139) | [F-DASH-03] Dashboard · distinguir movimientos anulados e inversos | PRO-64 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-140](https://linear.app/proceit/issue/PRO-140) | [F-DASH-04] Dashboard · landing segura por papel sem loops | PRO-64 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-141](https://linear.app/proceit/issue/PRO-141) | [F-DASH-05] Dashboard · esconder links Stock/Movimientos sem permissão | PRO-64 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-142](https://linear.app/proceit/issue/PRO-142) | [F-DASH-06] Dashboard · alcance integral de depósitos em movimientos | PRO-64 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-143](https://linear.app/proceit/issue/PRO-143) | [F-DASH-07] Dashboard · manter somas monetárias decimais exatas | PRO-64 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-144](https://linear.app/proceit/issue/PRO-144) | [F-DASH-08] Dashboard · whitelist de períodos na API | PRO-64 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-145](https://linear.app/proceit/issue/PRO-145) | [CLI-D01] Clientes · alta CREAR-only com catálogos mínimos | PRO-66 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-146](https://linear.app/proceit/issue/PRO-146) | [CLI-D02] Clientes · UI consulta/edit segundo permissão | PRO-66 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-147](https://linear.app/proceit/issue/PRO-147) | [CLI-D03] Clientes · resolver corrida de catálogos geográficos | PRO-66 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-148](https://linear.app/proceit/issue/PRO-148) | [CLI-D06] Clientes · sincronizar tipo e flag de dirección fiscal | PRO-66 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-149](https://linear.app/proceit/issue/PRO-149) | [CLI-D07] Clientes · limite de crédito decimal exato | PRO-66 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-150](https://linear.app/proceit/issue/PRO-150) | [CLI-R03-01] Clientes · corrigir aviso pós-finalização de documentos | PRO-66 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-151](https://linear.app/proceit/issue/PRO-151) | [PRV-D01] Proveedores · cadastro com somente CREAR sem acesso a lista | PRO-67 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-152](https://linear.app/proceit/issue/PRO-152) | [PRV-D02] Proveedores · interface read-only sem EDITAR e ações autônomas | PRO-67 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-153](https://linear.app/proceit/issue/PRO-153) | [PRV-D03] Proveedores · diferenciar falhas de geografia de lista vazia | PRO-67 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-154](https://linear.app/proceit/issue/PRO-154) | [PRD-D01] Productos — alta CREAR-only e catálogos mínimos sem expor lista | PRO-68 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-155](https://linear.app/proceit/issue/PRO-155) | [PRD-D02] Productos — retomar alta e uploads parciais sem duplicar produto | PRO-68 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-156](https://linear.app/proceit/issue/PRO-156) | [PRD-D03] Productos — impedir lost update por PUT sem versão | PRO-68 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-157](https://linear.app/proceit/issue/PRO-157) | [PRD-D04] Productos — fechamento documental idempotente para criador | PRO-68 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-158](https://linear.app/proceit/issue/PRO-158) | [PRD-D05] Productos — botões e ficha respeitam CREAR/EDITAR | PRO-68 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-159](https://linear.app/proceit/issue/PRO-159) | [PRD-D06] Productos — preservar rascunho de documentos ao trocar aba | PRO-68 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-160](https://linear.app/proceit/issue/PRO-160) | [PRD-R03-01] Productos — impedir cierre silencioso de anexos pendentes após reload da alta | PRO-68 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-161](https://linear.app/proceit/issue/PRO-161) | [PRD-GATE-C24] Productos KIT/alternativos CREAR-only — decidir visibilidade do catálogo | PRO-68 | Todo | Mantener; no cierre demostrado |
| [PRO-162](https://linear.app/proceit/issue/PRO-162) | [PRD-R04-01] Productos — impedir descarte parcial de uploads sem confirmação na retomada | PRO-68 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-163](https://linear.app/proceit/issue/PRO-163) | [PRD-R05-01] Productos — rastrear abandono de uploads novos que falham na retomada | PRO-68 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-164](https://linear.app/proceit/issue/PRO-164) | [CAT-D01] Catálogos de productos — impedir corrida de gravação entre abas/formulários | PRO-69 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-165](https://linear.app/proceit/issue/PRO-165) | [CAT-D02] Catálogos de productos — preservar erro de ativar/inativar após recarga | PRO-69 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-166](https://linear.app/proceit/issue/PRO-166) | [LPR-D01] Listas de precios — habilitar alta CREAR-only sem expor dados de VER | PRO-70 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-167](https://linear.app/proceit/issue/PRO-167) | [LPR-D02] Listas de precios — respeitar CREAR/EDITAR na listagem e ficha | PRO-70 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-168](https://linear.app/proceit/issue/PRO-168) | [LPR-D03] Listas de precios — corrigir estado de vigência e KPI em calendário PY | PRO-70 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-169](https://linear.app/proceit/issue/PRO-169) | [LPR-D04] Listas de precios — bloquear Guardar sem catálogos confiáveis e permitir retry | PRO-70 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-170](https://linear.app/proceit/issue/PRO-170) | [LPR-R03-01] Listas de precios — atualizar vigência ao passar meia-noite PY sem remontar página | PRO-70 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-171](https://linear.app/proceit/issue/PRO-171) | [LPR-GATE-VISIBILIDADE] Listas de precios CREAR-only — decidir catálogo mínimo de clientes, produtos e lista-base | PRO-70 | Todo | Mantener; no cierre demostrado |
| [PRO-172](https://linear.app/proceit/issue/PRO-172) | [LPR-R04-01] Listas de precios — sincronizar data React ao instalar vigilante em meia-noite | PRO-70 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-173](https://linear.app/proceit/issue/PRO-173) | [CC-D01] Catálogos comerciales — permitir alta CREAR-only sem expor listagem VER | PRO-71 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-174](https://linear.app/proceit/issue/PRO-174) | [CC-D02] Catálogos comerciales — impedir mutação tardia cruzar abas e destruir formulários | PRO-71 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-175](https://linear.app/proceit/issue/PRO-175) | [CC-D03] Catálogos comerciales — exigir catálogo de moedas no GET de Tipos de cambio | PRO-71 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-176](https://linear.app/proceit/issue/PRO-176) | [CC-R03-01] Catálogos comerciales — impedir perda de edição nos campos durante POST/PUT | PRO-71 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-177](https://linear.app/proceit/issue/PRO-177) | [CC-R03-02] Catálogos comerciales — devolver 400 em modo monedas inválido para CREAR-only | PRO-71 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-178](https://linear.app/proceit/issue/PRO-178) | [STK-D02] Inventario Stock — isolar moeda-base por instância e ignorar GET tardio | PRO-78 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-179](https://linear.app/proceit/issue/PRO-179) | [STK-D03] Inventario Stock — investigar snapshot inconsistente em movimentos simultâneos | PRO-78 | Todo | Mantener; no cierre demostrado |
| [PRO-180](https://linear.app/proceit/issue/PRO-180) | [C24-R04-01] Stock — distinguir «Sin disponible» no depósito selecionado | PRO-78 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-181](https://linear.app/proceit/issue/PRO-181) | [C24-R04-02] Stock — não mostrar saldo zero a usuário sem depósitos | PRO-78 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-182](https://linear.app/proceit/issue/PRO-182) | [MOV-D01] Movimientos — preservar intenção e chave de idempotência no POST | PRO-79 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-183](https://linear.app/proceit/issue/PRO-183) | [MOV-D02] Movimientos — descartar histórico de filtro anterior durante carga | PRO-79 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-184](https://linear.app/proceit/issue/PRO-184) | [MOV-D03] Movimientos — preservar rascunho durante virada de data PY | PRO-79 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-185](https://linear.app/proceit/issue/PRO-185) | [MOV-R03-01] Movimientos — preservar K1 após 4xx em retry indeterminado | PRO-182 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-186](https://linear.app/proceit/issue/PRO-186) | [MOV-R03-02] Movimientos — ignorar resposta tardia após saída da tela | PRO-182 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-187](https://linear.app/proceit/issue/PRO-187) | [MOV-R06-01] Movimientos — publicar catálogos mesmo com rascunho editado na carga | PRO-184 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-188](https://linear.app/proceit/issue/PRO-188) | [MOV-O07] Movimientos — recuperar K1 e impedir duplicação entre sessões e abas | PRO-182 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-189](https://linear.app/proceit/issue/PRO-189) | [MOV-R08-01] Movimientos — confirmação sem resposta deve recuperar K1 e número | PRO-188 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-190](https://linear.app/proceit/issue/PRO-190) | [MOV-R08-02] Movimientos — bloquear POST legado sem reserva NEX-066 | PRO-188 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-191](https://linear.app/proceit/issue/PRO-191) | [MOV-R09-01] Movimientos — exigir ACK por clique após mostrar número | PRO-188 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-192](https://linear.app/proceit/issue/PRO-192) | [MOV-R09-02] Movimientos — ocultar snapshot sem VER ou alcance atual | PRO-188 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-193](https://linear.app/proceit/issue/PRO-193) | [MOV-R10-01] Movimientos — revalidar visibilidade ao repetir reserva K1 | PRO-192 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-194](https://linear.app/proceit/issue/PRO-194) | [DOC-KUDE-P0] Documentos electrónicos — ver/baixar KuDE PDF da FE via /api/kude | PRO-91 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-195](https://linear.app/proceit/issue/PRO-195) | [DOC-UX-P1] Documentos electrónicos — painel desktop superior à referência comercial | PRO-91 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-196](https://linear.app/proceit/issue/PRO-196) | [DOC-KUDE-R01-01] KuDE — limitar leitura JSON do gateway durante streaming | PRO-194 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-197](https://linear.app/proceit/issue/PRO-197) | [DOC-KUDE-R01-02] KuDE — baixar PDF com nova consulta ao gateway | PRO-194 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-198](https://linear.app/proceit/issue/PRO-198) | [CM-IMP-01] CASA MINGO — importar 561 productos reales IVA10, familia/marca/línea | — | In Review | Reconciliada con evidencia específica |
| [PRO-199](https://linear.app/proceit/issue/PRO-199) | [PENDIENTE CONTRATO COMPLETO] Cancelación SIFEN FE/NCE y reversión de stock | — | Backlog | Mantener; no cierre demostrado |
| [PRO-200](https://linear.app/proceit/issue/PRO-200) | NEXIT CASA MINGO · Pacote fechado de correções para Claude (E01–E10) | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-201](https://linear.app/proceit/issue/PRO-201) | [E01-R01-01] Facturas — editar Cantidad inmediatamente al añadir en selector avanzado | PRO-200 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-202](https://linear.app/proceit/issue/PRO-202) | [E02-R01-F001] Bloquear anulación manual de SALIDAS vinculadas a FE | PRO-200 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-203](https://linear.app/proceit/issue/PRO-203) | [E02-R01-F002] Validar todos los detalles fiscales en conciliación de stock SQL | PRO-200 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-204](https://linear.app/proceit/issue/PRO-204) | [E03-R01-F001] Reiniciar descuentos monetarios al cambiar moneda de FE | PRO-200 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-205](https://linear.app/proceit/issue/PRO-205) | [E04-R01-F001] Preservar snapshot de FE sem bloquear exclusão de direções | PRO-200 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-206](https://linear.app/proceit/issue/PRO-206) | [E04-R01-F002] Mostrar filiais COMERCIAL registradas como destinos | PRO-200 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-207](https://linear.app/proceit/issue/PRO-207) | [G01] Configuración FE — editar e guardar URL e credenciais API por empresa | PRO-200 | In Review | Reconciliada con evidencia específica |
| [PRO-208](https://linear.app/proceit/issue/PRO-208) | [G01-R01-F001] Bloquear IPv4 mapeada en IPv6 hexadecimal en protección SSRF | PRO-207 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-209](https://linear.app/proceit/issue/PRO-209) | [G01-R01-F002] Eliminar DNS rebinding entre validación y conexión TLS del gateway | PRO-207 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-210](https://linear.app/proceit/issue/PRO-210) | [AUD-E06-F001] Restaurar línea sin perder cantidad o monto editado | PRO-200 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-211](https://linear.app/proceit/issue/PRO-211) | [AUD-E07-F001] Saldo de facturas elegibles debe incluir NCE DESCUENTO aprobadas | PRO-200 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-292](https://linear.app/proceit/issue/PRO-292) | [E1-R02-F001] NCE: preservar observaciones históricas con marcador textual | PRO-94 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-293](https://linear.app/proceit/issue/PRO-293) | [V1-E2] Usuarios multiempresa y asignación de perfiles existentes — pendiente de análisis | PRO-109 | In Review | Reconciliada con evidencia específica |
| [PRO-294](https://linear.app/proceit/issue/PRO-294) | [CM-V1-E3] FE: fecha de emisión editable (−30/+5 días) con validación fiscal | PRO-93 | Todo | Reconciliada con evidencia específica |
| [PRO-295](https://linear.app/proceit/issue/PRO-295) | [CM-V1-E4] Movimientos: cantidades enteras sin ceros decimales, preservando fracciones | PRO-79 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-296](https://linear.app/proceit/issue/PRO-296) | [CM-V1-E5] Informe de Ventas: FE/NCE reales, estados SIFEN y conciliación | PRO-108 | In Review | Reconciliada con evidencia específica |
| [PRO-297](https://linear.app/proceit/issue/PRO-297) | [CM-V1-E6-B] Informe de Compras: entradas reales a costo, sin IVA fiscal | PRO-108 | Todo | Mantener; no cierre demostrado |
| [PRO-298](https://linear.app/proceit/issue/PRO-298) | [CM-V1-PROVEDOR] Validar cabecera y formato KuDE FE/NCR con proveedor API | PRO-91 | Todo | Mantener; no cierre demostrado |
| [PRO-300](https://linear.app/proceit/issue/PRO-300) | [E1-R03-F002] NCE: idempotencia compara observación original, no dInfAdic compuesto | PRO-94 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-301](https://linear.app/proceit/issue/PRO-301) | [E1-R04-F001] NCE DESCUENTO: reintento debe comparar monto del servicio | PRO-94 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-302](https://linear.app/proceit/issue/PRO-302) | [E1-R04-F002] NEX-071: conservar observación cruda exacta en registro e idempotencia | PRO-94 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-303](https://linear.app/proceit/issue/PRO-303) | [E1-R05-F001] NEX-071: validar observación original también en reutilización SQL | PRO-94 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-304](https://linear.app/proceit/issue/PRO-304) | [ARCH-V1] Aprobar modelo MASTER, administradores por empresa, perfiles múltiples y permisos | — | Todo | Mantener; no cierre demostrado |
| [PRO-305](https://linear.app/proceit/issue/PRO-305) | [MASTER-V1] Plataforma: registrar empresas/clientes e criar primeiro admin empresarial | PRO-65 | Backlog | Mantener; no cierre demostrado |
| [PRO-306](https://linear.app/proceit/issue/PRO-306) | [PERFILES-V1] Catálogo único de nueve perfiles y asignación múltiple por empresa | PRO-110 | Backlog | Mantener; no cierre demostrado |
| [PRO-307](https://linear.app/proceit/issue/PRO-307) | [COMERCIAL-V1] Definir vendedor comercial versus operador emissor FE/NCE | PRO-72 | In Review | Reconciliada con evidencia específica |
| [PRO-308](https://linear.app/proceit/issue/PRO-308) | [MASTER-V1] Habilitación de módulos contratados por empresa — definición funcional y autorización | PRO-65 | Todo | Mantener; no cierre demostrado |
| [PRO-309](https://linear.app/proceit/issue/PRO-309) | [FE-V1-GATE] Cerrar decisiones P01–P08 antes de implementar stock, correcciones y estados | — | Todo | Mantener; no cierre demostrado |
| [PRO-310](https://linear.app/proceit/issue/PRO-310) | [FE-V1-P0] Reserva por depósito al enviar y SALIDA real al aprobar SIFEN | — | Canceled | Excluida |
| [PRO-311](https://linear.app/proceit/issue/PRO-311) | [FE-V1-P0] Corrección de FE rechazada con versiones y CDC auditables | — | Todo | Mantener; no cierre demostrado |
| [PRO-312](https://linear.app/proceit/issue/PRO-312) | [FE-V1-P0] Historial JSON de envíos/respuestas y consulta automática FE | — | Todo | Reconciliada con evidencia específica |
| [PRO-313](https://linear.app/proceit/issue/PRO-313) | [FE-V1-UI] Cancelar documento — elegibilidad 48h y motivo obligatorio | — | In Progress | Mantener; no cierre demostrado |
| [PRO-314](https://linear.app/proceit/issue/PRO-314) | [FE-E01] Documentos electrónicos — visualizar JSON fiscal e resposta de intento existentes (somente leitura) | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-315](https://linear.app/proceit/issue/PRO-315) | [FE-E02] Documentos electrónicos — histórico completo paginado de envíos y consultas | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-321](https://linear.app/proceit/issue/PRO-321) | [FE-E03-A1] Base SQL inmutable de evidencia HTTP por versión fiscal | PRO-312 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-322](https://linear.app/proceit/issue/PRO-322) | [FE-DIR] Serializar e validar dirección fiscal completa del receptor en JSON SIFEN | PRO-93 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-323](https://linear.app/proceit/issue/PRO-323) | [FE-INF] dInfAdic editable con inserción asistida de entrega y vendedor | PRO-93 | Todo | Reconciliada con evidencia específica |
| [PRO-324](https://linear.app/proceit/issue/PRO-324) | [LOGÍSTICA-IDEMP] Identidade histórica segura do destino de entrega (PRO-205) | PRO-205 | Todo | Mantener; no cierre demostrado |
| [PRO-325](https://linear.app/proceit/issue/PRO-325) | [CM-V1-E6-A] Compras → Entradas: proveedor, stock y costo con registro atómico | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-326](https://linear.app/proceit/issue/PRO-326) | [CM-V1-P0] KuDE FE/NCE: mostrar PDF por documento selecionado, sem exigir CDC nem APROBADO | PRO-194 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-327](https://linear.app/proceit/issue/PRO-327) | [CM-V1-P0] Productos: restaurar códigos con ceros y habilitar códigos alfanuméricos en alta | — | Todo | Reconciliada con evidencia específica |
| [PRO-328](https://linear.app/proceit/issue/PRO-328) | [CM-V1-P0] FE: dirección elegida como domicilio principal del receptor SIFEN, sin dInfAdic automático | PRO-329 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-329](https://linear.app/proceit/issue/PRO-329) | [CM-29OCT] CASA MINGO — paquete de 10 ajustes FE, documentos, reportes y proveedor | — | Todo | Reconciliada con evidencia específica |
| [PRO-330](https://linear.app/proceit/issue/PRO-330) | [CM-P0] Nueva factura — avisar stock insuficiente al añadir/cambiar cada línea | PRO-329 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-331](https://linear.app/proceit/issue/PRO-331) | [CM-P1] Nueva factura — ordinal, scroll de ítems y foco automático al buscador de código | PRO-329 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-332](https://linear.app/proceit/issue/PRO-332) | [CM-P1] Informe de Ventas — exportar detalle por factura × producto × vendedor × fecha | PRO-329 | Todo | Mantener; no cierre demostrado |
| [PRO-333](https://linear.app/proceit/issue/PRO-333) | [CM-P1] Documentos electrónicos — ordenar columna Documento por número numérico | PRO-329 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-334](https://linear.app/proceit/issue/PRO-334) | [CM-P1] Documentos electrónicos — FE azul, NCE amarillo suave sin mezclar estados SIFEN | PRO-329 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-335](https://linear.app/proceit/issue/PRO-335) | [CM-P0] TODAS las pantallas — importes PYG sin decimales y USD máximo 2, sin alterar cálculos | PRO-329 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-336](https://linear.app/proceit/issue/PRO-336) | [CM-TERCERO] Certificado digital gateway — reemplazo con clave existente y consulta DTE APROBADOS | PRO-329 | Todo | Mantener; no cierre demostrado |
| [PRO-337](https://linear.app/proceit/issue/PRO-337) | [CM-P0-UX] Informe de Ventas — corregir tarjeta cortada, títulos compactos y tabla informativa responsive | PRO-329 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-338](https://linear.app/proceit/issue/PRO-338) | [DOC-SIFEN-P0] Consulta automática FE y estados fiscales visibles con alertas de inconsistencias | PRO-312 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-339](https://linear.app/proceit/issue/PRO-339) | [NEXIT FE] Limite de linhas configurável por empresa (1–999; tela ADMIN futura) | PRO-329 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-340](https://linear.app/proceit/issue/PRO-340) | [ADMIN FUTURO] Configurar máximo de líneas FE por empresa desde panel administrativo | PRO-329 | Todo | Mantener; no cierre demostrado |
| [PRO-341](https://linear.app/proceit/issue/PRO-341) | [CM-P1] Nueva factura: código de producto completo y foco en Cantidad al añadir | PRO-329 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-342](https://linear.app/proceit/issue/PRO-342) | [P0 CASA MINGO] Auditoría integral FE — envío, lote, consulta SIFEN, histórico y KuDE de otro emisor | PRO-329 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-354](https://linear.app/proceit/issue/PRO-354) | [NEXIT-P1] Política de stock insuficiente por empresa y bajas pendientes de FE | — | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-357](https://linear.app/proceit/issue/PRO-357) | [C1-OBS-01] Historial de Movimientos — consulta de conteo sin cobertura del verificador SQL | — | Backlog | Mantener; no cierre demostrado |
| [PRO-361](https://linear.app/proceit/issue/PRO-361) | [NEXIT-T01-R01] NEX-082 — triggers actualizado_at en 3 tablas (solo autoría SQL) | PRO-62 | Done | Reconciliada con evidencia específica |
| [PRO-363](https://linear.app/proceit/issue/PRO-363) | [T01-FK-01] Diagnosticar FK empresa_id faltante na NEX-081 sem alterar migrations históricas | PRO-62 | Done | Reconciliada con evidencia específica |
| [PRO-365](https://linear.app/proceit/issue/PRO-365) | [NEXIT-UX-P0] Alinear Documentos electrónicos con la referencia visual de la competencia | PRO-195 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-369](https://linear.app/proceit/issue/PRO-369) | [NEXIT PRO-365 C02-C01] Aviso neutro APROBADO e alerta KuDE não verificado em linguagem simples | PRO-365 | In Review | Revisión registrada; homologación/alcance por confirmar |
| [PRO-370](https://linear.app/proceit/issue/PRO-370) | [NEXIT PRO-365 C02-C03 / F03] Indicador visual de FE aprobada y posteriormente cancelada | PRO-365 | In Review | Revisión registrada; homologación/alcance por confirmar |

No autorización de Claude, nuevo desarrollo, merge, VM, SQL o deploy en este documento.