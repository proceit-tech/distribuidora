# AUD-NEXIT-DASHBOARD-DESKTOP-R01 — Auditoría por menú «Panel general»

**Fecha:** 2026-10-18. **Scope aclarado por el responsable:** NEXIT es un **ERP solo para escritorio**; no exigir interfaz de celular ni menú hamburguesa. **Primero auditar un menú, documentar sus hallazgos y no avanzar automáticamente al siguiente sin cerrar la entrega del menú actual.**
**Snapshot de código:** `6a649403f12c52dcdb7fc92f9afd765655c92468` (branch `feature/NEXIT-2026-001-banco-demo`); los commits posteriores de esta auditoría son exclusivamente documentos.
**Veredicto:** **CORRECCIONES SOLICITADAS EN DASHBOARD / NAVEGACIÓN DESKTOP (1 ALTA, 4 MEDIAS)**. Solo análisis estático; **NO HOMOLOGADO** en navegador.
**Fuentes:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, `documentacao/v1/auditoria-por-menu/AUD-DASHBOARD-V1.md`, `documentacao/v1/homologacao-visual/DASHBOARD-SIDEBAR-V1-REVISAO-2026-10-10.md`, historial `AUD-NEXIT-MENUS-GERAL-R01/R02-2026-10-18.md`; páginas, shell, permisos, API, `lib/dashboard/shared.ts`, `lib/dashboard/cliente-api.ts`, `types/dashboard.ts`, NEX-009/011/014 y T07.

## 0. Rectificación de la auditoría transversal anterior — criterio del dueño

**NGM-R01-01 «Falta botón para abrir sidebar móvil», anteriormente ALTA, queda RETIRADO POR FUERA DE ALCANCE.** No es un defecto exigible: el producto es exclusivamente desktop. **No pedir a Claude menú móvil, responsive de 375px ni otra implementación para celular; no actualizar CSS móvil sin orden expresa.** Conservar sin cambiar el código actual. El requisito visual es desktop: notebook/monitor, sidebar expandida (236px)/contraída (72px), navegación usable, campos legibles sin cortes, zoom usual del navegador; no inferir aprobación visual desde CSS o commit.

**Esta rectificación no reescribe documentos AUD históricos.** Tiene precedencia para cualquier auditoría, definición, cronograma de corrección y comando futuro relacionado con menús.

## 1. Alcance examinado de este menú

| Capa | Fuente y estado de revisión |
|---|---|
| Navegación y permissão | `lib/navigation/menu.ts`, `components/layout/sidebar/sidebar.tsx`, `app/(private)/dashboard/layout.tsx`, `lib/auth/permissions.ts`, `lib/auth/server-context.ts`: revisado el trazado de roles y destinos desktop |
| Interfaz | `app/(private)/dashboard/page.tsx` (468 líneas) y `page.module.css` (778 líneas): estudiados filtros período/depósito, actualizar, KPI, gráfico, alertas, movimientos recientes, CTA y estados de error/carga; CSS desktop y reglas dimensionales históricas inspeccionadas |
| HTTP | `app/api/dashboard/route.ts` (50 líneas) y `lib/dashboard/cliente-api.ts` (13): autenticação, permisos, entrada período/depósito, 400/401/403/503/500, no-store y error |
| Servicio/SQL | `lib/dashboard/shared.ts` (187 líneas): siete consultas paralelas, empresa/usuario, stock, depósito, movimiento, costos, lotes, agregación. Contrastados NEX-009 (movimientos, saldos, costos), NEX-011 (vistas), NEX-014 (estados/anulaciones/usuario_puede_deposito) |
| Tipos y pruebas | `types/dashboard.ts` (41 líneas), `documentacion/banco/nexit/v1/pruebas/T07-reportes-dashboard.sql`: lectura y comparación con la API actual. T07 comprueba mayoritariamente **vistas NEX-011**; NO prueba controller HTTP, sus filtros/guards ni la agregación `leerDashboard` actual |
| Homologación | NO hubo navegador, PostgreSQL real, screenshot actual, ejecutable UI, pruebas automatizadas nuevas, build o CI; no declarar que las consultas dieron valores concretos en producción |

## 2. Matriz de funciones y controles examinados

| Función | Flujo y verificación | Resultado |
|---|---|---|
| Períodos 7/15/30/90 días | UI select → `GET /api/dashboard?periodo=` → `PERIODOS` whitelist → serie diaria/semanal | Consistente en código; incorrecta persistencia UI ante error (F-DASH-02) |
| Depósito | Selector → UUID API → `depositosPermitidos()` por empresa/usuario → rechazo 403 del depósito no permitido; consultas de saldos con `ANY($2::uuid[])` | Autorización del depósito **presente**; población de productos para alertas incumple el alcance del filtro (F-DASH-01) |
| KPI productos/clientes | `count(*) FILTER WHERE activo` por empresa, solo si respectivo permiso | Conforme como KPI de empresa global; no afirmar que los filtros de depósito/período sean aplicados a estas métricas |
| KPI inventario | `sum(inventario_costos.valor_total)` limitado por depósitos autorizados | Conforme en inspección estática; moneda sin ejecución real |
| KPI movimientos y gráfico | m.empresa, `estado='REGISTRADO'` y `anula_a_id IS NULL`; agrupación fecha 7/15/30/90 | Contador filtra estado; cifras «unidades» entre diferentes unidades comerciales requieren revisión semántica con requisitos, no clasificadas como defecto sin decisión |
| Alertas stock | Productos activos con controla_stock y LEFT JOIN saldos de depósitos permitidos; determina sin/bajo/cuarentena e incluye nombres | **NO CONFORME F-DASH-01** |
| Alertas vencimiento | Cuenta lotes con saldo positivo en depósitos permitidos, fechas actuales y 30 días | Consulta limitada por empresa y depósitos; no fue probada con lotes compartidos/propiedad de terceros |
| Últimos movimientos | Filtra empresa y depósitos, ordena creado_at y limita 6; UI presenta estado visual por tipo | **NO CONFORME F-DASH-03** (no excluye/rotula ANULADO ni movimientos inversos) |
| Permisos y links | `DASHBOARD.VER` exigido API; datos de módulos sometidos a `PRODUCTOS/CLIENTES/STOCK/MOVIMIENTOS.VER` | Datos protegidos pero navegación/CTA inconsistente (F-DASH-04/05) |
| Panel visual desktop | Cabecera de 56–72px, sidebar 236/72px, KPIs en grid, gráfico y alertas; requisitos de revisión anterior | Sin cambio encontrado por esta auditoría; aceptación visual desktop **PENDIENTE** |

## 3. Hallazgos concretos con severidad, causa, impacto, corrección y regresión

### F-DASH-01 — ALTA — Alertas «Sin stock» falsamente calculadas para productos fuera del alcance de depósito

**Evidencia:** `lib/dashboard/shared.ts` ~líneas 27–49, 68–78 y 145–163. `depositosPermitidos` limita el conjunto de depósitos. La consulta principal inicia `FROM productos p` y `LEFT JOIN stock_saldos s ... AND s.deposito_id = ANY($2::uuid[])`; **no exige que el producto exista en un depósito autorizado**. Para producto que solo tiene saldo en depósito B no autorizado, bajo selección de depósito A o usuario limitado, la junção s retorna NULL → `disponible=0`. Después `sin = filas.filter(f=>f.disponible <=0)` y `alertas.push` incluye su nombre en `nombres(sin)`. Si el usuario no tiene depósitos permitidos, `deps=[]`: todos los productos activos que controlan stock son tratados como «Sin stock» pese a no poder consultarlos por depósito.

**Impacto:** falsos avisos/KPIs de reposición para alcance equivocado; un operador con STOCK.VER puede recibir descripciones de productos no presentes en sus depósitos accesibles. Esto no demuestra acceso a las cifras del depósito B, pero sí una fuga de metadatos/erro de escopo. La vista `v_stock_producto` de NEX-011 muestra todos os produtos por empresa como modelo global, mas el filtrado restringido del Dashboard no puede reutilizar ese universo sin decisión explícita.

**Corrección esperada:** definir de forma consistente qué productos pertenecen al alcance del depósito seleccionado/autorizado y no marcar «sin stock» los que nunca existieron allí. Mantener caso de producto **relevante** con saldo agotado en depósito accesible sin ocultarlo por simple INNER JOIN en saldos >0 (se requieren antecedentes/relaciones de inventario para cero, si la RN lo exige). Ajustar consulta y reglas cuidadosamente, sin inventar stock; comprobar con actor permiso A, producto únicamente en B, producto agotado en A y selección de todos. No expandir acceso multiempresa.

### F-DASH-02 — MEDIA — KPIs y gráfico del período anterior quedan asociados al filtro actual después de un error

**Evidencia:** `app/(private)/dashboard/page.tsx` ~líneas 102–151: `useEffect` hace `setCargando(true)` y `setError("")` al cambiar período/deposito/recarga; `then` asigna `datos`, pero `catch` solo guarda `error`, sin limpiar `datos` anterior. `armarTarjetas(datos)`, `serie = datos?.serie` y títulos derivados de `periodoInfo` se renderizan con filtros recién elegidos.

**Reproducción conceptual:** carga válida 7d depósito A → elegir 90d depósito B → GET falla → título muestra 90d y mantiene KPIs/gráfico de A/7d bajo mensaje de error. También puede pasar durante estado «Actualizando...».

**Corrección:** conservar datos antiguos solo si identificados explícitamente por el filtro de origen o limpiar/suspender KPIs y gráficos cuando no correspondan al último contexto solicitado; test enfocado success A→error B, refresh del mismo filtro, race de varias respuestas.

### F-DASH-03 — MEDIA — «Últimos movimientos» presenta anulaciones y contrapartidas sin su estado

**Evidencia:** `lib/dashboard/shared.ts` líneas ~58–60 define `MOV_OK` (`REGISTRADO` y `anula_a_id IS NULL`) y lo utiliza en la serie ~93–102. Pero la consulta de `ultimos` ~104–121 solo filtra `m.empresa_id` y depósito, omite `m.estado`, `m.anula_a_id` y no selecciona el estado. UI `dashboard/page.tsx` ~367–385 presenta cada fila con `TIPOS[m.tipo]` (tipo, no estado), dando impresión de actividad vigente aunque sea `ANULADO` o contraparte de anulación.

**Corrección:** decidir si «Últimos movimientos» debe mostrar apenas os efetivos ou histórico completo; no segundo caso mostrar estado ANULADO/REVERTIDO y vínculo con inverso, sin presentarlo como operativo. Alinear título y totales del gráfico; test con registrado, anulado y contrapartida.

### F-DASH-04 — MEDIA — Link fijo Dashboard para perfil empresarial sin permiso

**Evidencia:** `components/layout/sidebar/sidebar.tsx` ~líneas 133–180 ofrece marca y link `/dashboard` siempre, sin consultar `DASHBOARD.VER`. `app/(private)/dashboard/layout.tsx` redirige plataforma a `/administracion/empresas` (es correcto; **NO 403 para plataforma**), pero permite entrar al page a usuário empresarial sin DASHBOARD.VER; el GET `app/api/dashboard/route.ts` ~17–23 retorna 403. La marca del admin de plataforma también navega via dashboard antes de ser redirigida.

**Corrección:** resolver landing y link condicionado por perfil sin conceder permisos automáticamente; plataforma a Empresas, empresa con Dashboard.VER a dashboard, perfiles restrictos a página permitida. Test de navegación/permisos dirigido. **No hay demostración de exposición de datos.**

### F-DASH-05 — MEDIA — Botones de navegación Dashboard apuntan a recursos prohibidos

**Evidencia:** `app/(private)/dashboard/page.tsx` ~líneas 234, 360 y 413: links `/movimientos` y `/stock` siempre renderizados incluso si `datos.serie/ultimos/stock = null` por falta de permiso; `lib/dashboard/shared.ts` retorna null para módulos sin permiso y `app/(private)/movimientos/layout.tsx` usa guardPage. Los KPI cards individuales hacen gating correctamente, **pero no los enlaces secundarios**.

**Corrección:** ocultar o deshabilitar rutas de acción que el backend negará, aprovechar indicadores de permiso existentes sin sustituirlas por grant extra. Test empresarial Dashboard.VER sin STOCK/MOVIMIENTOS.VER.

## 4. Pruebas focales requeridas para eventual corrección (no ejecutadas)

- Saldos: depósito permitido A vs B no permitido; productos exclusivamente B; producto con cero en A; multiempresa; actor sin ningún depósito.
- Filtros: período y depósito A→B, error, reintento y respuestas fuera de orden.
- Movimientos: REGISTRADO, ANULADO e inverso; consistencia serie/lista.
- Permisos: dashboard solo; plataforma → Empresas; DASHBOARD.VER sin permisos STOCK/MOVIMIENTOS; admin de empresa completo.
- Compatibilidad con NEX-009/011/014 y SQL; sin reaplicar migrations ni alterar DDL histórico. Solo test básico de partes tocadas (regra 14/10); no ejecutar tsc global/build/lint global/CI ni VM por IA.

## 5. Decisión de la auditoría

- **Hallazgos:** F-DASH-01 ALTA; F-DASH-02/03/04/05 MEDIA. No hay defectos de celular exigibles.
- **Sin evidencia runtime:** ningún query PostgreSQL ejecutado; los tests `T07-reportes-dashboard.sql` son históricos sobre vistas, no pruebas del servicio actual ni de roles/errores; falta prueba E2E autorizada/aceite visual desktop por el responsable.
- **No modificar ahora por iniciativa propia:** este informe es diagnóstico, no orden de reescritura. Claude recibe solo una tarea focal cuando el responsable la autorice. No avanzar automáticamente a otro módulo: revisión **menu por menu**, cerrar o aceptar pendientes del Dashboard antes de Maestros/Clientes.
