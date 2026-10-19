# Auditoría por menú — Dashboard (Panel general)

**Sistema:** NEXIT ERP exclusivamente para desktop. **Rota:** `/dashboard`. **Estado:** AUDITORÍA ESTÁTICA DEL MENÚ CONCLUIDA CON HALLAZGOS ABIERTOS — CORRECCIÓN SOLICITADA; **NO HOMOLOGADA** en navegador.
**Auditoría completa de esta rodada:** [AUD-NEXIT-DASHBOARD-DESKTOP-R01](../../testes/AUD-NEXIT-DASHBOARD-DESKTOP-R01-2026-10-18.md), snapshot de código `6a649403f12c52dcdb7fc92f9afd765655c92468`.

## Resultado por menú (18/10/2026)

| ID | Severidad | Hallazgo confirmado | Situación |
|---|---|---|---|
| F-DASH-01 | ALTA | Alertas de «Sin stock» incluyen productos fuera de depósitos accesibles al actor | Abierto |
| F-DASH-02 | MEDIA | Filtros actualizados muestran KPIs/gráfico antiguos tras error | Abierto |
| F-DASH-03 | MEDIA | «Últimos movimientos» no identifica ANULADO e inversos como tales | Abierto |
| F-DASH-04 | MEDIA | Sidebar ofrece Dashboard a perfiles sin DASHBOARD.VER y marca de plataforma apunta vía redirect | Abierto |
| F-DASH-05 | MEDIA | CTAs a Stock/Movimientos pese a carecer del permiso del módulo | Abierto |

**Auditoría técnica:** trazado de página, servidor, tipos, filtros, permisos, servicio, SQL, migrations y casos T07 en el corte citado. Sin ejecución de código/queries reales ni aprobación visual. No cambiar módulos ajenos para corregir este menú.

## Alcance obligatorio

El producto **NO es para celular**. No exigir UI móvil ni capturas 375/768 ni «hamburger» para resolver esta auditoría. Priorizar desktop, legibilidad, sidebar expandida 236px/reducida 72px, funcionalidades reales y control por empresa/depósito. El antiguo hallazgo `NGM-R01-01` de falta de botón móvil es **FUERA DE ALCANCE**, no defecto pendiente. Los informes AUD históricos permanecen inmutables; rige la aclaración del dueño en la auditoría nueva.

## Criterio de cierre

Claude no debe implementar nada sin orden del responsable. Corregir exclusivamente hallazgos del Dashboard con tests locales focais (no suites globales, build o tsc global, no SQL/VM), commit/push y ChatGPT reaudita; luego el responsable homologa en desktop. El siguiente menú previsto es **Clientes**, pero no se considera empezado ni auditado a fondo en esta ronda.


## AUD-R02 — reauditoria independente do Dashboard (18/10/2026)

**Fonte técnica atual:** [AUD-NEXIT-DASHBOARD-DESKTOP-R02](../../testes/AUD-NEXIT-DASHBOARD-DESKTOP-R02-2026-10-18.md). **Parecer: 2 ALTAS, 5 MÉDIAS, 1 BAIXA**, sem homologação, testes ou alterações de código. Os blobs de página, CSS, API, serviço, sidebar, navegação e histórico Movimientos são idênticos ao corte R01; não existe mudança recente desse menu a reverter.

- **F-DASH-06 ALTA NOVA — prioridade de segurança:** Dashboard inclui transferências por depósito de origem **OU** destino autorizado e expõe nome de depósito não autorizado, produto, quantidade, usuário e link. `lib/movimientos/historial.ts` e GET detalhe exigem **AMBOS** depósitos no alcance; alinhar o Dashboard sem ampliar grants, após autorização.
- **F-DASH-01 ALTA** continua defeito de interpretação de “sin stock” com catálogo global; gate comercial C24 obrigatório antes de alterar visibilidade de produtos.
- **F-DASH-02/03/04/05 MÉDIAS** reconfirmadas: dados de filtro anterior após erro; anulação sem estado; landing/sidebar sem permissão; links internos proibidos.
- **F-DASH-07 MÉDIA NOVA:** `numeric(18,4)` de valor de inventário convertido em `float8`/JS number, risco de precisão em grandes totais; efeito em produção não verificado.
- **F-DASH-08 BAIXA NOVA:** `periodo in PERIODOS` aceita chaves herdadas (`constructor`, `__proto__`) com erro 500 em vez de 400.
- Estados de lote/quantidades heterogêneas/timezone/snapshot são observações, não correções automáticas. Não exigir interface móvel nem fazer redesign. Teste/dados reais/print exigem aceite operacional do responsável.

**Próxima decisão:** responsável autoriza tarefa mínima (recomendação: F-DASH-06), ChatGPT especifica; Claude apenas desenvolve, commit/push e para; ChatGPT reaudita. Não iniciar Clientes nem C04 automaticamente.
