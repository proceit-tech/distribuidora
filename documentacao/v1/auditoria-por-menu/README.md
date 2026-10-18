# Índice de auditorias por menu — NEXIT V1

**Estado geral: EM ANDAMENTO.** Uma ficha existente NÃO significa auditoria concluída. Não alterar migrations NEX-001…051 aplicadas; qualquer futura NEX-052 requer autorização.

## Principal

- [AUD-DASHBOARD-V1.md](AUD-DASHBOARD-V1.md) — ABERTA, sem homologação

## Maestros

- [AUD-CLIENTES-V1.md](AUD-CLIENTES-V1.md) — ABERTA, sem homologação
- [AUD-PROVEEDORES-V1.md](AUD-PROVEEDORES-V1.md) — ABERTA, sem homologação
- [AUD-PRODUCTOS-V1.md](AUD-PRODUCTOS-V1.md) — ABERTA, sem homologação
- [AUD-CATALOGOS-PRODUCTOS-V1.md](AUD-CATALOGOS-PRODUCTOS-V1.md) — ABERTA, sem homologação
- [AUD-LISTAS-PRECIOS-V1.md](AUD-LISTAS-PRECIOS-V1.md) — ABERTA, sem homologação
- [AUD-CATALOGOS-COMERCIALES-V1.md](AUD-CATALOGOS-COMERCIALES-V1.md) — ABERTA, sem homologação

## Inventario

- [AUD-STOCK-V1.md](AUD-STOCK-V1.md) — ABERTA, sem homologação
- [AUD-MOVIMIENTOS-V1.md](AUD-MOVIMIENTOS-V1.md) — ABERTA, sem homologação
- [AUD-DEPOSITOS-V1.md](AUD-DEPOSITOS-V1.md) — ABERTA, sem homologação
- [AUD-REPOSICION-V1.md](AUD-REPOSICION-V1.md) — ABERTA, sem homologação

## Facturación

- [AUD-DOCUMENTOS-ELECTRONICOS-V1.md](AUD-DOCUMENTOS-ELECTRONICOS-V1.md) — ABERTA, sem homologação
- [AUD-FACTURAS-V1.md](AUD-FACTURAS-V1.md) — ABERTA, sem homologação

## Reportes

- [AUD-REPORTES-V1.md](AUD-REPORTES-V1.md) — ABERTA, sem homologação
- [AUD-REPORTE-STOCK-GENERAL-V1.md](AUD-REPORTE-STOCK-GENERAL-V1.md) — ABERTA, sem homologação
- [AUD-REPORTE-VALORIZACION-V1.md](AUD-REPORTE-VALORIZACION-V1.md) — ABERTA, sem homologação
- [AUD-REPORTE-KARDEX-V1.md](AUD-REPORTE-KARDEX-V1.md) — ABERTA, sem homologação
- [AUD-REPORTE-STOCK-CRITICO-V1.md](AUD-REPORTE-STOCK-CRITICO-V1.md) — ABERTA, sem homologação
- [AUD-REPORTE-LOTES-V1.md](AUD-REPORTE-LOTES-V1.md) — ABERTA, sem homologação

## Plataforma

- [AUD-EMPRESAS-PLATAFORMA-V1.md](AUD-EMPRESAS-PLATAFORMA-V1.md) — ABERTA, sem homologação

## Método

Auditar integralmente cada menu na ordem: regras oficiais e requisitos → código de páginas/componentes → API → serviço → SQL/migrations → permissões/isolamento → testes → UX real na VM → relatório final com achados e evidência. Separar 'comprovado pelo Git' de 'validado pelo responsável na VM'. Não enviar correções genéricas ao Claude antes de concluir o diagnóstico e a decisão do menu.


## Nova auditoria geral 18/10/2026 — estado atual

- [AUD-NEXIT-MENUS-GERAL-R01](../../testes/AUD-NEXIT-MENUS-GERAL-R01-2026-10-18.md): inventário de 38 páginas/94 rotas e achados transversais.
- [AUD-NEXIT-MENUS-GERAL-R02](../../testes/AUD-NEXIT-MENUS-GERAL-R02-2026-10-18.md): correção explícita da interpretação do Dashboard para administrador de plataforma e novo achado de CTA sem permissão.
- **NÃO encerrada:** cada ficha de menu continua ABERTA até ser auditada em profundidade (UI, rotas, serviços, SQL, permissões, testes, comportamento real); R01/R02 são apenas a fase inicial e a revisão do shell/Dashboard ainda não equivale a homologação. Não marcar as fichas como concluídas por possuir esta lista.
