# AUDITORÍA INDEPENDIENTE — PRO-339-R01 / Máximo variable de líneas FE por empresa

**Fecha:** 02/11/2026  
**SHA funcional auditado:** [1ab9d1d02bf09a78935eb7232c82b7b38a2bd87c](https://github.com/proceit-tech/distribuidora/commit/1ab9d1d02bf09a78935eb7232c82b7b38a2bd87c)  
**Issues:** [Linear PRO-339](https://linear.app/proceit/issue/PRO-339) · [GitHub #16](https://github.com/proceit-tech/distribuidora/issues/16)  
**Método:** revisión estática del diff completo y archivos actuales; ninguna ejecución de tests, runner, lint, TS checker, build, SQL, PostgreSQL, VM, gateway, navegador o deploy.  
**VEREDICTO:** **R01 NO CONFORME: un hallazgo funcional de coherencia en el alta rápida de productos, R01-F001**. La configuración por empresa y validación de backend están conformes estáticamente. **PRO-340 NO AUTORIZADA**.

## 1. Alcance del commit

Se modificaron exactamente **10 archivos**:
1. `app/(private)/facturas/nueva/page.tsx`
2. `documentacao/banco/nexit/v1/migraciones/NEX-078-empresas-fe-max-lineas.sql` (nuevo; sin aplicar)
3. `documentacao/banco/nexit/v1/scripts/preflight-NEX-078.sql` (nuevo; sin ejecutar)
4. `documentacao/banco/nexit/v1/scripts/reversion-NEX-078.sql` (nuevo; sin ejecutar)
5. `documentacao/banco/nexit/v1/scripts/verificar-NEX-078.sql` (nuevo; sin ejecutar)
6. `lib/facturacion/emision.ts`
7. `lib/facturacion/limite-lineas.casos.ts` (nuevo)
8. `lib/facturacion/limite-lineas.ts` (nuevo)
9. `lib/facturacion/shared.ts`
10. `scripts/casos-clientes/run.js` (registro de suite, runner sin ejecutar).

Se identifican **69 casos PRO339-01..69**, numeración íntegra y sin saltos. Son casos escritos pero **0 ejecutados**; la mayoría combina helpers reales con DB simulada y aserciones de código fuente, **no verifica PostgreSQL real ni navegador**.

## 2. Conformidad estática de arquitectura

- `NEX-078` crea `empresas.fe_max_lineas integer NULL`, `CHECK (NULL OR BETWEEN 1 AND 999)`; NO fija ningún valor ni hace UPDATE/INSERT. `NULL=999` conserva comportamiento anterior. No cambia `NEX-002` ni la constante fiscal `MAX_LINEAS=999`. La futura pantalla administrativa es [PRO-340](https://linear.app/proceit/issue/PRO-340), NO creada en este commit.
- `emision.ts::limiteLineasEmpresa`: consulta parametrizada con `empresaId` de sesión (`WHERE e.id=$1::uuid`); `to_jsonb(e) ? 'fe_max_lineas'` detecta columna ausente sin referenciarla directamente. Sin NEX-078 o empresa ilegible, no acepta FE nueva. Un NULL explícito retorna máximo 999; 21/63/99 son solo ejemplos sintéticos.
- `emision.ts::prepararFactura`: valida `cuerpo.lineas.length` frente al límite vigente antes de obtener vendedor, receptor, productos, stock, numeración/gateway. Comparte validación `POST /api/facturas/previa` y flujo `POST /api/facturas`. Los excesos generan `ErrorFacturacion(422)` y `maxLineasFE` en la respuesta de `shared.ts`. `leerCuerpoFactura` conserva 1..999 de forma, sin hard-cap por nombre de empresa.
- Reintentos idempotentes **con histórico persistido y verificado** pasan por `domicilioHistorico=true`, preservando payload y sin volver a aplicar cuota comercial nueva; sin histórico verificado, se somete a la cuota nueva. No hay cambios NCE o KuDE.
- Nueva factura obtiene el máximo desde catálogo autenticado, muestra contador y avisos, bloquea alta de línea nueva al máximo; aumentar cantidad de SKU existente sigue siendo posible. Cuatro filas visibles/scroll de PRO-331 no se modificaron. El máximo de la empresa se vuelve a validar en emisión; cliente no tiene control para elevarlo.
- La migration no está aplicada. **Dependencia de despliegue crítica:** esta versión falla cerrado sin NEX-078 y rechaza **TODA FE NUEVA**, incluso si la empresa nunca necesitó política propia. NEX-078 debe estar aplicada y verificada **ANTES de habilitar código R01 o en la misma ventana con corte controlado**; nunca desplegar código dependiente si el esquema no está listo. La NEX-078 por sí sola deja todas las empresas en NULL=999: no establece 21 ni ningún otro valor comercial. Verificar también estado real de migrations previas (NEX-073, 074, 076, 077) y backup, sin presuponer aplicación.

## 3. R01-F001 — MEDIA: altas consecutivas pueden anunciar éxito para una línea que NO se añadió

**Evidencia directa:**
- `page.tsx:878–889`: `agregar(p,...)` identifica SKU ya existente usando el arreglo `lineas` de la renderización actual, y conserva `siguienteClave` como valor del render.
- `page.tsx:891–917`: primero verifica `puedeAgregarLinea(lineas.length,maxLineasFE)` (también del render), luego encola `setLineas((ls)=>agregarSiCabe(ls,nueva,maxLineasFE))`. Ese actualizador **sí** mira el estado secuencial más reciente y puede descartar la adición para no exceder el máximo; **SIN EMBARGO**, a continuación el código ejecuta `setEditando(siguienteClave)`, actualiza foco/cantidad, incrementa `siguienteClave` y **devuelve la clave como si la línea existiera**, sin observar si `agregarSiCabe` realmente añadió.
- `SelectorProducto:316`: el selector avanzado muestra `«producto» añadido` para cualquier clave diferente de `ALTA_BLOQUEADA`; así, en el límite, dos acciones que observaron el mismo render podrían anunciar que ambas fueron añadidas aunque el actualizador descarte una.
- Si quedan **DOS lugares libres** y ocurren dos altas para SKU distintos antes de re-render, ambas acciones pueden capturar el MISMO `siguienteClave`; las dos filas podrían agregarse con `key`/`clave` duplicada, afectando la edición de cantidades, eliminación, foco, auditoría del borrador y lector. Este riesgo existía parcialmente antes, pero la PRO-339 alteró la lógica de límite y declara cubrir precisamente dobles lecturas. La prueba `PRO339-20` verifica el helper `agregarSiCabe` **secuencial**, no la función `agregar` real ni las señales de éxito/clave.
- Las acciones `setLineas` pueden agruparse en el procesamiento React y una secuencia de callbacks rápidos puede observar el mismo `lineas` y `siguienteClave` del render; no depende de haber ejecutado el navegador para identificar esta incoherencia entre decisión del actualizador y feedback de la acción.

**Impacto:** UI puede anunciar alta inexistente; en otro borde pueden existir claves duplicadas; edición manual, stock preventivo, foco y experiencia del lector pueden divergir. El límite del servidor sigue protegiendo emisión superior al máximo, pero no corrige el borrador ni el mensaje falso.

### Orden focal de corrección R02

1. Corregir **solo el flujo de alta del editor** para que la decisión de aceptación/rechazo, la identidad `clave` única y el feedback estén vinculados al estado efectivamente comprometido, no al snapshot previo. La actualización funcional / reducer debe evaluar simultáneamente existencia de SKU y cupo del estado más reciente; no anunciar éxito ni registrar `ultimo` si se rechazó; jamás producir `clave` duplicada. Evitar efectos colaterales dentro del updater React (puede ejecutarse/repetirse bajo Strict Mode); separar la resolución de la acción del efecto de foco/mensaje mediante un mecanismo determinístico compatible con React.
2. Mantener la semántica: mismo SKU suma cantidad sin línea adicional, incluso con límite alcanzado; nuevo SKU sólo entra con cupo; contador coincide con filas reales; no perder borrador ni cambiar clave de idempotencia; scanner/Enter devuelve foco de forma segura, editor fiscal y selector avanzado no pierden el suyo; una fila rechazada no abre panel fiscal ni recibe foco de cantidad. Mostrar el máximo REAL de empresa y 422 backend si la política cambió.
3. Actualizar casos fuente relevantes y añadir al menos: dos altas distintas antes de re-render con **1 cupo restante** (solo 1 entra, segunda muestra rechazo, no «añadido»); dos altas distintas con **2 cupos restantes** (dos claves distintas); dos altas mismo SKU antes de re-render (una línea, cantidad incrementada dos veces); selector avanzado y lector, reintentos, borrar/reagregar, Strict Mode y no side-effects en updater.
4. No modificar SQL/migrations/NEX-078, `emision.ts`, `shared.ts`, frontend de documentos/KuDE, PRO-338, NCE, stock, impuestos ni reglas ya conformes. Mantener módulo `limite-lineas.ts` o helpers si resultan precisos para resolver la atomicidad; **solo archivos completos y actuales uno a la vez**.
5. Casos escritos sin ejecución; commit+push SHA completo y **PARAR para auditoría ChatGPT PRO-339-R02**. No implementar PRO-340.

## 4. Observaciones operacionales no bloqueantes para el diff R01

- El frontend admite temporalmente altas hasta 999 si no recibió todavía el máximo (catálogo ausente/NEX-078 pendiente), pero el servidor no permite facturar sin esquema: se muestra mensaje de configuración y se rechaza en previa/emisión. No confundir aviso UX con bypass de backend.
- Scripts preflight/verificación/reversión son solo archivos, no garantías de instalación; requerir revisión operacional independiente de `schema_migrations`, roles, permisos, respaldo y política de rollback. No ejecutar scripts por IA.
- La verificación funcional de 1/21/22/63/99/999, dos tenants, reintento idempotente, errores 422 y concurrencia del scanner **requiere tests reales y browser autorizados**; la revisión estática no los sustituye.
- PRO-339 sigue `In Review`, no `Done`/homologada; PRO-340 sigue `Todo` y no autorizada para desarrollar.
