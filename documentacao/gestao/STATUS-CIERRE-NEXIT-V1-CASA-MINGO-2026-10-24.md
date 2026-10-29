# NEXIT V1 / CASA MINGO — Estado de alcance, implementación y liberación

> **ACTUALIZACIÓN DEL PLAN LINEAR — 24/10/2026 (después de la ampliación del plan):** confirmado mediante creación real que el workspace **YA permite crear nuevas issues**. El error de límite gratuito descrito abajo es histórico y queda superado. Fueron creadas y vinculadas las siguientes issues **Todo, NO homologadas**: **PRO-292** `[E1-R02-F001]` conservación de observaciones NCE históricas (subissue PRO-94; gate inmediato); **PRO-293** E2 Usuarios=Vendedores (PRO-109); **PRO-294** E3 fecha FE −30/+5 días (PRO-93); **PRO-295** E4 presentación de cantidades Movimientos (PRO-79); **PRO-296** E5 Informe de Ventas (PRO-108); **PRO-297** E6 fuente real e Informe de Compras (PRO-108); **PRO-298** cabecera y diseño KuDE FE/NCR a cargo del responsable/proveedor (PRO-91). Los vínculos de dependencia operativa siguen la secuencia **PRO-292 → PRO-293 → PRO-294 → PRO-295 → PRO-296 → PRO-297**, y todos ellos más PRO-298 bloquean la aceptación **PRO-115**. La secuencia es de autorización/auditoría, no una dependencia técnica que obliga a mezclar código. **Claude autorizado sólo a PRO-292**; debe parar para AUD E1-R03 antes de E2. Mantener estados y evidencias reales, sin Done por documentación. El proyecto anterior tenía 151 issues; tras esta acción debería tener 158, sujeto a confirmación de API. El indicador % de Linear puede variar con nuevas tareas y no es % de código terminado.

---


**Actualización:** 24/10/2026. **Función:** análisis de negocio/sistemas y reconciliación Linear ↔ Git; no sustituye auditoría funcional ni homologación humana.  
**Repositorio:** `proceit-tech/distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`.  
**Proyecto Linear:** https://linear.app/proceit/project/distribuidora-nexit-v1-c4619a4bc91d (`P-PRO-2`).  
**Último commit funcional E1 confirmado:** `945658d739960c92df6756adb2cc3b7d6e836f01`.  
**Auditoría vigente:** `documentacao/testes/AUD-NEXIT-CASA-MINGO-INFO-ADICIONAL-E1-R02-2026-10-24.md` — un hallazgo residual E1-R02-F001, F002/F003 aceptadas estáticamente.  
**Requisitos del cliente:** `documentacao/definicoes/REQ-NEXIT-CASA-MINGO-CIERRE-V1-2026-10-24.md`.  
**Protocolos:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`.

## 1. Por qué Linear mostraba 17 % y riesgo

La captura del responsable mostraba 147 issues activas y 17 % de progreso. La API Linear reportaba **151 registros** (147 activas + 4 canceladas): al inicio de esta reconciliación **99 In Review, 14 Todo, 34 Backlog, 4 Canceled**. El progreso del proyecto de Linear **NO mide porcentaje de líneas programadas ni capacidad de facturar**, y depende de la estructura/estados configurados. No manipular Done para incrementar la barra.

Se detectaron problemas de gobernanza: **84/151 sin milestone**, **151/151 sin assignee**, **151/151 sin estimate**, 6 defectos E01–E04 en Backlog pese a auditorías estáticas de corrección, y el épico mixto E01–E10 aún etiquetado como Backlog. Además, un mismo proyecto contenía trabajo operativo V1 y módulos previstos después de la V1.

**Reconciliación ejecutada el 24/10:** se asignaron los **84 milestones faltantes** al área dueña por jerarquía/tema; se corrigieron **PRO-201/202/203/204/205/206** a In Review con referencia a E01-R03, E02-R02, E03-R02 y E04-R02; se pasó **PRO-200** a In Review **parcial** (E01–E08 versionado, E09–E10 pendientes). Se crearon etiquetas `NEXIT-V1`, `NEXIT-POST-V1` y `NEXIT-HOMOLOGACAO` y se aplicaron a issues seleccionadas de referencia (no se ha intentado clasificar exhaustivamente los 151 ítems mediante etiquetas). **PRO-97/98** permanecen en evaluación de producción hasta comprobar si la consulta periódica/operativa SIFEN es necesaria: no se presumen V2.

**Conteos post-reconciliación:** 151 total: **106 In Review, 14 Todo, 27 Backlog, 4 Canceled**; **0 sin milestone**; 46 issues rotuladas `NEXIT-V1`, 20 `NEXIT-POST-V1`, 6 `NEXIT-HOMOLOGACAO`. Permanecen sin dueño/estimate las 151 (no se inventaron asignaciones/plazos). No se cambió a Done ninguna issue. Se definieron dependencias `PRO-115` (aceptación) bloqueada por `PRO-91/93/94/109/108/79/113/198`; `PRO-114` (deploy) bloqueada por `PRO-115/113/198`. Los estados de la aplicación no fueron verificados en PostgreSQL/VM.

**Limitación de workspace:** `save_issue` al crear `[E1-R02-F001]` devolvió exactamente `You've exceeded the free issue limit for this workspace`. **No se creó nueva tarea**; el defecto está registrado en PRO-93/94 y auditoría R02. Para nuevos tickets independientes hará falta elevar el límite del workspace o reorganizar el tracking con autorización. No borrar issues válidas sólo para modificar la métrica.

## 2. Inventario funcional — alcance V1 confirmado

**Código ya implementado/versionado, homologación real todavía parcial:** login, navegación/alcances existentes y dashboard; Clientes, Proveedores, Productos/catálogos, listas/precios, stock, depósitos, movimientos; cinco reportes de stock; emisión FE, previsualización, pagos, descuentos y dirección de entrega; NCE con motivos, saldos y devoluciones; documentos y KuDE FE/NCR, puntos de expedición, gateway configurable. **No reimplementar** estas áreas por el solo estado In Review. La tabla `V1_HREFS` de `lib/navigation/menu.ts` enumera las rutas visibles; confirmar que la versión deployada use la misma revisión.

**Trabajo de cliente todavía requerido en NEXIT:**
1. **E1 — `dInfAdic` FE/NCE:** versión E1-R02 en Git con huella de previsualización y vendedor autenticado, pero **E1-R02-F001 sigue abierto** por marcador textual en observaciones históricas. Corrección puntual + auditoría E1-R03 antes de avanzar a E2. PRO-93/94.
2. **E2 — Usuarios = Vendedores:** gestión segura de usuarios por empresa y permisos en UI V1, no master paralelo de Vendedores. PRO-109/72. La sesión ya existe; eso no equivale a poder administrar usuarios.
3. **E3 — Fecha de emisión FE:** editable en ventana pedida −30/+5 días, con reglas DNIT, diferencia entre emisión/firma/transmisión y coherencia de CDC/revisión. PRO-93.
4. **E4 — Movimientos:** presentación `1` y no `1,0000`, sin redondear `2,5`; sólo formato visual. PRO-79.
5. **E5 — Informe de Ventas:** datos reales FE/NCE, estados SIFEN correctos, filtros/ACL y conciliación. PRO-108.
6. **E6 — Informe de Compras:** primero documentar fuente real disponible. Los módulos de compras completos están fuera de V1 hasta decisión de alcance, por lo que no se pueden inventar datos ni un reporte con ceros simulados. PRO-108.
7. **Otros riesgos fiscales ya registrados:** verificar cobertura real de consulta/conciliación operativa PRO-97/98 antes de diferir; P0/P1 fiscal PRO-130/131/132/133, casos de transacción especial sólo donde corresponde a V1.

**Responsabilidad del proveedor/humano, no de Claude:** cabecera KuDE (RUC, domicilio/contactos) y formato PDF estándar FE/NCE (A4, Código, líneas, una vía, disposición visual Información de interés). NEXIT alimenta **`dInfAdic` J003** por JSON del proveedor, no reescribe PDF.

**Aplazado explícitamente o condicionado:** módulos completos Solicitudes/Órdenes/Recepciones/Devoluciones de compra; Pedidos/Ventas/Entregas; Finanzas; Zonas y rutas; NRE y otras pantallas fuera de `V1_HREFS`, salvo nueva decisión escrita. Cuotas permanece suspendida, no afirmar disponible. Informe gerencial de costo/ganancia bruta es opción condicionada del cliente. Cancelación SIFEN automática sin contrato de API no se improvisa.

## 3. Gates de homologación y producción (ninguno cumplido por este reporte)

| Gate | Referencia | Evidencia necesaria |
|---|---|---|
| Corrección técnica E1 | PRO-93/94; E1-R02-F001 | Commit corregido + AUD E1-R03, pruebas focales, sin pérdida de observaciones históricas |
| Usuarios / trazabilidad | PRO-109/72 | Alta/roles/inactivación por empresa y 2 usuarios, vendedor correcto en FE/NCE y KuDE |
| Fecha, reportes, movimientos | PRO-93/108/79 | UI real + API/SQL/estados + pruebas de negocio con facturas y stock |
| Proveedor y fiscalidad | PRO-91/61/130 | Certificado/CSC/timbrado/RUC correcto, FE/NCE KuDE legítimo y estado SIFEN; PDF no equivale a aprobación |
| Migraciones e integridad | PRO-113 | Estado real y compatibilidad de NEX-066..070; backup/preflight/verificación/rollback y comprobación de NEX-067/068/069/070 |
| Datos maestros | PRO-198 | Script de 561 productos aplicado/verificado 561/561, y **stock de apertura ACTUAL** por depósito validado por cliente; no usar enero 2026 como saldo vigente |
| Homologación integrada | PRO-115 | Factura → stock/saldo → NCE → reportes, idempotencia/carreras, permisos tenant, navegador/teclado, documentos/impresión y aceptación del responsable |
| Go-live controlado | PRO-114 | Versión/tag desplegada trazable al commit, backups restaurables, credenciales, rollback, aprobación expresa del responsable |

## 4. Próximos pasos bajo el protocolo

- **Ahora:** Claude corrige únicamente **E1-R02-F001** y PARA para ChatGPT AUD E1-R03. No iniciar E2 en paralelo.
- **Después:** E2, E3, E4, E5 y E6 en secuencia de autorización + auditoría; se puede revisar priorización si hay decisión expresa.
- **Gobernanza Linear:** se precisa designar propietarios humanos y estimaciones reales. No inferir fecha objetivo del badge de riesgo: `targetDate` del proyecto está nula en la API consultada; confirmar el plazo real en Linear antes de publicar cronograma. `In Review` no equivale a código homologado ni a Done.
- **Límite plan Linear:** imposibilidad verificada de nuevos tickets por límite de issue; usar y actualizar tickets existentes mientras se resuelve, sin duplicados ni tareas ficticias.
- **Cualquier go-live:** solamente con validación humana de VM, proveedor, PostgreSQL y documentos fiscales; ChatGPT no debe afirmar ejecución de pruebas que no hizo.

**Criterio de avance legítimo:** código implementado/versionado (commit) → AUD técnica sin hallazgos → homologación operativa/aceite del responsable → Done/release. El porcentaje de Linear crecerá con trabajo y aceptación reales, no con cambios cosméticos del estado.
