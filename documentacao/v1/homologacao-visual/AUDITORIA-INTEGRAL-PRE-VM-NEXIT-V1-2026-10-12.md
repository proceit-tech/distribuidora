# NEXIT V1 — AUDITORIA PREVIA A ACTUALIZACIÓN EN VM

**12/10/2026 · Responsable del análisis: ChatGPT · Estado: NO-GO / bloqueo de despliegue.**

**Alcance estático inspeccionado en GitHub**: rama `feature/NEXIT-2026-001-banco-demo`; commits de Productos `eafb74a`, `ea0a65e`, `83c1ea0`, `e19ba12`; `Dockerfile`, `compose.yml`, `app.compose.yml`, `next.config.ts`, `package.json`, `lib/auth/session.ts`, `app/(public)/login/page.tsx`, formulario de Clientes, APIs GET/POST/PUT de Productos, normalizador, sincronización, `NEX-038/039/040`, runner y procedimientos/reversiones, catalogación de unidades y propuestas SIFEN, más el manual permanente de operación VM. **No se realizó compilación, ejecución de tests, apertura de navegador, PostgreSQL, Docker ni acceso a la VM desde esta auditoría.** No se afirma auditoría exhaustiva de todas las rutas o todas las NEX-001…037 sin ejecutar una revisión automatizada y una prueba de integración. Reportes de 1275 pruebas y fallos anteriores provienen de Claude, no fueron reproducidos independientemente.

## Dictamen

**NO-GO**. No autorizar aún la ejecución de `NEX-038/039/040`, la sustitución de la imagen `nexit-app:teste` ni el reinicio de servicios. Los bloqueos son criterios de liberación, no autorización de cambios.

| ID | Gravedad | Evidencia estática o información conocida | Criterio para cerrar |
|---|---|---|---|
| VM-GATE-01 | **BLOQUEANTE** | Claude comunica fallo persistente del prerender de `/login` y `/clientes/nuevo` después de compilar. `Dockerfile` ejecuta `RUN npm run build`: un build fallido evita crear la imagen final. `/login` está en `app/(public)/login/page.tsx` y usa `getCurrentSession`; diagnosticar con traza completa, no asumir que `cookies()` es la causa. | `npm ci && npm run build` con exit 0, `Docker build` concluido localmente, login/Clientes sem regressão. |
| VM-GATE-02 | **BLOQUEANTE** | NEX-038/039/040 nuevas; sin ejecución PostgreSQL 16. Tests JS de SQL utilizan lectura estática/PSQL simulado. | PostgreSQL 16 **de prueba aislada**: aplicar runner real NEX-001…040, asserts DDL, FK, trigger código inmutable, E731/E733/E734, grants, rollback de transacciones, idempotencia y checksums; sin tocar la VM del cliente. |
| VM-GATE-03 | **BLOQUEANTE** | Historial comprobado de VM hasta NEX-032; estado 033…040 desconocido. | Obtener exclusivamente inventario `schema_migrations` y `--solo-listar` del entorno, confirmar rama/commit y checksums, **sin ejecutar migración**. |
| VM-GATE-04 | **BLOQUEANTE** | NEX-039 altera wrapper de `nex_aplicar_grants_runtime` y concede SELECT al papel `nexit_runtime`, niega acceso a log fiscal; usuario de conexión VM documentado como `nexit_app` (rol o miembro no demostrado). | Test con papel efectivamente usado por la aplicación: SELECT al catálogo SIFEN; permisos preservados de Clientes/Proveedores e inventário; denegación de escritura catálogo e acesso ao `fiscal_reconciliacion_log`; `nex_aplicar_grants_runtime()` tras migración, sin funciones faltantes. |
| VM-GATE-05 | **IMPORTANTE** | `NEX-039` deja Metro sin elección 87/108; Caja/Docena sin equivalencia. Seed legado S-001 había LT→87, MT→86; nuevo seed no corrige filas existentes `ON CONFLICT DO NOTHING`. | Consultar unidades reales, clasificar casos y aprobar mapeos explícitos; reconciliar UN/KG/LT solo tras validar y autorizar el script separado. |
| VM-GATE-06 | **IMPORTANTE** | `NEX-040` añade `afectacion_iva` NULL legado; `EXE` no puede distinguir exento/exonerado automáticamente. Existe script manual de reclasificación condicionado a autorización. | Mantener legacy sin reclasificación automática; comprobar interfaces para producto antiguo y nuevo, impuesto 0/5/10 y parcial. No ejecutar script de reclasificación IVA. |
| VM-GATE-07 | **IMPORTANTE** | Tipos GTIN E706/E707 ahora rechazan 9/10/11 dígitos; puede bloquear PUT de productos existentes con códigos legados. | Consulta de compatibilidad y política de saneamiento sin eliminar GTIN histórico; test de lectura y de cambios de un producto afectado. |
| VM-GATE-08 | **IMPORTANTE** | PUT de Productos sincroniza por ID (PRD-AUD-01 corrigido estáticamente); testes foram principalmente mock. | Provar em PostgreSQL isolamento empresa, remoção+edição+adição, FKs 23503, alteração de principal, concorrência/rollback e inventário ABERTURA. |
| VM-GATE-09 | **IMPORTANTE** | `app.compose.yml` usa `app.env` e volume persistente `/srv/stacks/distribuidora/data/nexit-archivos`, rede `proxy` externa e `nexit_internal`. | `docker compose config --quiet` e verificação só leitura de existência de diretórios/rede e permissões UID 1001; não imprimir segredos. |
| VM-GATE-10 | **IMPORTANTE** | Reversões SQL de NEX-039/040 bloqueiam perda de vínculos/classificações; histórico `schema_migrations` exige coerência de checksum. | Em base descartável, teste de reversões em ordem inversa, incluindo cenário onde a reversão deve abortar; procedimento de recuperação documentado. |
| VM-GATE-11 | **IMPORTANTE** | `scripts/aplicar-migraciones.sh` agora usa `to_regprocedure`, com abortar se o GRANT falha, mas avisa e segue se o wrapper não existir. Como NEX-039 requer NEX-037, ausência após aplicar 039 não seria cenário normal. | Em base teste com NEX-037 aplicado, **exigir** presença da função e grants; erro/aviso de ausência não deve ser tratado como sucesso numa implantação com NEX-039. |

## Matriz de aceite funcional antes do deploy

| Módulo | Casos mínimos |
|---|---|
| Login/Auth | Login válido/inválido; logout; sessão expirada; bloqueio acesso sem sessão; demo desligado em produção; isolamento multiempresa |
| Clientes | GET/POST/PUT, dados fiscais, contatos, direcciones, documentos privados, erros e upload, sem regressão no `/clientes/nuevo` |
| Proveedores | GET/POST/PUT; contas bancárias, estados de aprovação/reativação/admin, anexos e RBAC |
| Productos | Todas 7 abas; GET/POST/PUT; código imutável, sincronização filhos por ID, FK/409, GTIN, catálogo E709/E710, E731/E733/E734, preço referência, quantidade/custo exatos, stock real |
| Inventário | Abertura somente via movimento, saldo por depósito/empresa, custo médio só leitura, sem alteração por PUT mestre |
| UI | Responsivo desktop/mobile, datas dd/mm/aaaa, validação por aba, erros acessíveis, navegação após salvar, formulários sem campos perdidos |
| Infra | Build standalone completo; Dockerfile; redes; env; volume privado UID 1001; saúde app/db; verificação de logs sem segredos |

## Comandos de INVENTÁRIO SOMENTE LEITURA na VM (não executar ainda updates)

```bash
cd /tmp/nexit-instalacao
git status --short
git branch --show-current
git rev-parse HEAD
docker exec nexit-db psql -U nexit_app -d nexit -c "SELECT version, nombre FROM public.schema_migrations ORDER BY version;"
docker exec nexit-db psql -U nexit_app -d nexit -c "SELECT codigo, nombre, codigo_sifen, descripcion_sifen FROM public.unidades_medida ORDER BY codigo;"
docker exec nexit-db psql -U nexit_app -d nexit -c "SELECT codigo, nombre, porcentaje FROM public.impuestos ORDER BY codigo;"
docker exec nexit-db psql -U nexit_app -d nexit -c "SELECT tipo, length(codigo) longitud, count(*) FROM public.producto_codigos WHERE tipo IN ('GTIN','GTIN_EMPAQUE','EAN','UPC') GROUP BY tipo, length(codigo) ORDER BY tipo, longitud;"
```

**Cuidado:** se o catálogo em VM já tiver dados sensíveis, não compartilhar valores individuais nem `.env` no chat. Não executar `--permitir-banco-real` sem `--solo-listar`, `docker compose up`, `docker build`, SQL de reconciliação ou reclassificação antes de fechar os gates.

## Sequência de aprovação futura (somente depois de fechar gates)

1. Claude reproduz e corrige build em ambiente de desenvolvimento e realiza integração de migrations em PostgreSQL 16 descartável, evidenciando logs/verificações; entrega commit e relatório. Não aplicar na VM.
2. ChatGPT audita commit final, testes, checksums e casos funcionais, e emite GO/NO-GO documentado.
3. Responsável obtém estado real da VM e verifica pendentes no runner oficial; valida plano específico da VM.
4. Responsável autoriza execução do runner; verifica novas versões, grants, smoke tests, somente então substitui a app por imagem que já tenha build aprovado.
5. Reconciliación de unidades existentes e reclasificación IVA permanecem **ações opcionais e separadas**, não pressupostas pelo deploy.
