# ORDEN ACTIVA DE DESARROLLO — CLAUDE — PRO-328 P0 — DIRECCIÓN SELECCIONADA COMO DOMICILIO DEL RECEPTOR SIFEN

**Fecha:** 29/10/2026. **Regla de negocio CERRADA por el responsable; no reinterpretar.**  
**Analista/auditor/Linear:** ChatGPT. **Desarrollador exclusivo:** Claude. **Operador VM/DB/DE reales:** responsable humano.  
**Repo:** `proceit-tech/distribuidora` · **branch:** `feature/NEXIT-2026-001-banco-demo` · **clone local:** `C:\projetos\PROCEIT\distribuidora`.  
**Issue:** [PRO-328](https://linear.app/proceit/issue/PRO-328). **Paquete:** [PRO-329](https://linear.app/proceit/issue/PRO-329). **Análisis cerrado:** [AUDITORÍA 29/10](../analises/AUD-NEXIT-CASA-MINGO-SOLICITUDES-2026-10-29.md). **Plan:** [PLAN 29/10](../planos/PLAN-NEXIT-CASA-MINGO-AJUSTES-29-OCT-2026.md).

**ESTA ES LA ÚNICA ORDEN DE CÓDIGO NUEVA ACTIVA.** La implementación UI/API de PRO-327 queda temporalmente pausada, no cancelada. El script de 561 productos ya tuvo COMMIT y poscheck real OK: NO ejecutar, modificar o volver a importar. Claude NO inicia PRO-330/331/332/333/334/335 ni tareas del proveedor por su cuenta: un único commit focal y PARA para auditoría ChatGPT.

## 1. Diagnóstico confirmado — no analizar otra vez la regla de negocio

- `lib/facturacion/emision.ts::receptorDe` obtiene dirección FISCAL del cliente, no la dirección que el operador seleccionó. `payload-fe.ts::domicilioFiscalJSON` la envía en `cPaisRec,dDirRec,dNumCasRec,cDepRec,cDisRec,cCiuRec`. El cambio de origen debe aplicarse **antes** de construir/validar/firmar el JSON para FE NUEVAS.
- `emision.ts::prepararFactura` resuelve `direccionEntregaId` con `opcionesEntrega` y hoy inserta `lineaEntrega()` en `dInfAdic` mediante `componerInfoAdicional`. **Eliminar solo ESTA inserción automática en nuevas FE**, no la observación del usuario ni el vendedor comercial.
- `direcciones_cliente` guarda `pais_codigo,direccion,numero_casa,departamento_codigo,distrito_codigo,ciudad_codigo` de la MISMA fila. La función SQL NEX-068 `fe_entrega_opciones` y la TS `OpcionEntrega` exponen país pero para departamento/distrito/ciudad solo descripciones libres. **No inferir códigos de descripciones.**
- `emision.ts::equivalente` actualmente intenta demostrar identidad del destino comparando el texto de `dInfAdic`; esto falla con la nueva regla y ya era una deuda identificada PRO-324. Los destinos se identifican por `direccion_id` persistido, jamás por texto ni ubicación. **Integrar preservando flujo de clave idempotente: distinto ID aunque texto idéntico = 409, ID original editado/eliminado no altera FE emitida; si no puede probar identidad, 409; jamás crear segunda FE.**
- `app/(private)/facturas/nueva/entrega-cliente.tsx` dice explícitamente que la dirección de entrega no cambia domicilio fiscal; este aviso quedará incorrecto para FE nuevas. Debe mostrar al operador cuál dirección irá al receptor SIFEN.
- La respuesta PDF KuDE la crea el gateway. NEXIT NO reescribe/edita PDF. Corregir JSON receptor y permitir luego homologación con proveedor en PRO-298.

## 2. Reglas EXACTAS para cada FE NUEVA

1. **Si existe una dirección elegible seleccionada** (por defecto seleccionada/selección manual) y hay `direccionEntregaId`, la dirección de ESA fila se convierte en el domicilio principal del receptor para esa FE: `cPaisRec` de `pais_codigo`, `dDirRec` de `direccion`, `dNumCasRec` de `numero_casa`, `cDepRec` de `departamento_codigo`, `cDisRec` de `distrito_codigo`, `cCiuRec` de `ciudad_codigo` cuando aplica. **Cero mezcla** con los valores del domicilio fiscal estándar.
2. Si **no hay destinos elegibles**, la FE sigue sin `direccionEntregaId` y utiliza **el domicilio fiscal original del cliente**, conforme al contrato vigente; nunca exigir crear un destino ni inventar datos. Si el cliente tiene destinos elegibles y el operador no elige, bloquear como ya hace NEX-068.
3. Dirección seleccionada debe pertenecer a **misma empresa, cliente y alcance/permiso de creación**. El operador no envía campos de domicilio, solo el UUID; servidor y función autorizada leen datos originales. No confiar en los textos del navegador. Si el destino no existe, no es elegible o fue modificado/revocado durante la preparación: rechazar SIN emitir ni reservar ni descontar stock.
4. **Validación fiscal actual intacta:** para operaciones B2B/B2C/B2G, país Paraguay y domicilio informado TODO completo (calle, número real `^\d{1,6}$`, códigos válidos dep→dis→ciu) o totalmente vacío solo cuando la regla permita; con dirección elegida NUNCA llenar huecos desde el domicilio fiscal anterior. En B2F, país extranjero y calle/número obligatorios, sin geografía PY. No cambiar `iTiOpe` ni naturaleza del receptor para que el dato encaje: si incompatible, 422 informado por campo. País/códigos numéricos fiscalmente equivalentes a la tabla, sin descripciones derivadas en NEXIT.
5. Si la dirección es incompleta o no concilia, **mostrar aviso claro** que identifique `Dirección seleccionada` y requiera corregirla en Clientes, no reemplazarla silenciosamente. Hacerlo en la previa antes de numerar y en la emisión de servidor. El estado APROBADO/CDC/PDF nunca se simula.
6. **`dInfAdic` para FE NUEVAS:** únicamente las observaciones crudas del operador + `Vendedor: ...` COMERCIAL elegido, según la composición ya existente. **NUNCA agregar línea automática `Dirección de entrega: ...`**. Si el operador escribe ese texto voluntariamente en observaciones, preservar literalmente su dato libre sin borrarlo; la marca `[Datos automáticos del sistema]` solo si existen otras líneas automáticas. Mantener hash/revisión y límite de 5000 caracteres.
7. La revisión antes de enviar debe mostrar dirección de receptor que efectivamente estará en JSON (desde servidor), con sus datos completos. El combobox y la información de ayuda deben indicar que la dirección elegida se usará para la FE, sin modificar el maestro del cliente. Cambiar cliente/sucursal/destino invalida una revisión anterior y descarta respuestas asíncronas obsoletas.
8. **No modificar** direcciones persistentes en `clientes`/`direcciones_cliente`; no alterar establecimiento del emisor, numeración, punto, estado fiscal, stock, precios, descuentos, IVA, métodos de pago ni otros campos del receptor.
9. **FE EXISTENTES INMUTABLES:** `documentos_electronicos`, payload y `dInfAdic` histórico, fechas, firma, CDC, snapshot de dirección y vendedor no se reescriben. Reintento válido usa payload histórico íntegro verificado por hash. El parser `descomponerInfoAdicional` debe seguir aceptando las FE LEGADAS que incluyen la línea automática, sin derivar identidad del destino de ese texto. Destino histórico se prueba por UUID persistido y ACL, no por el catálogo actual cuando fue editado/eliminado. Si el histórico es insuficiente, 409 sin side effects.
10. **NCE no se toca en esta orden**: no adaptar automáticamente su `dInfAdic`, su receptor o el flujo de NCE; no cambiar PRO-326 (KuDE FE/NCE por número sin bloqueo CDC). El operador y proveedor homologarán luego si el encabezado del PDF corresponde al JSON del receptor.

## 3. SQL de soporte — solo versión Git, jamás ejecutar

**NEX-076** está libre en la rama verificada el 29/10 (última NEX-075). Si para obtener los códigos del destino con seguridad se necesita función SQL, **crear solamente una migration aditiva `NEX-076-facturacion-fe-direccion-receptor-seleccionada.sql` y dejarla VERSIONADA, NO APLICADA**. Preservar archivos NEX-005/NEX-068/NEX-074 y todas migrations ya aplicadas; no editar retroactivamente.

Contrato recomendado de lectura: función `fe_direccion_receptor_elegida(p_empresa uuid,p_usuario uuid,p_cliente uuid,p_direccion uuid)` `SECURITY DEFINER`, `search_path = public, pg_temp`; devuelve exclusivamente `id,pais_codigo,direccion,numero_casa,departamento_codigo,distrito_codigo,ciudad_codigo` tomados **de la misma dirección** después de comprobar FACTURACION_ELECTRONICA.CREAR, empresa/cliente/elegibilidad y alcance del usuario. No otorgar SELECT abierto a `direcciones_cliente` ni a `documento_electronico_entregas`; `REVOKE PUBLIC`, `GRANT EXECUTE` mínimo a rol de ejecución autorizado y hook de reaplicación de grants NEX-037/052. Revisar firmas/orden de wrappers reales NEX-067/068/074 para no reducir validaciones. No cambiar declaraciones `RETURNS TABLE` de funciones instaladas mediante `CREATE OR REPLACE` incompatible; preferir nueva función.

**Condición de atomicidad obligatoria:** una lectura de dirección antes de emitir no prueba que no cambió hasta reservar FE: verificar la misma ID/versión/atributos reales del destino bajo bloqueo al crear la FE, y que **la foto logística persistida y el JSON de receptor del documento nuevo sean idénticos a la dirección validada**. Actualizar el wrapper vigente mediante migration aditiva si hace falta; ante cambio concurrente rollback completo, sin número consumido ni stock alterado. No alterar ni volver a firmar FE históricas. Si no se consigue este invariant con el esquema actual, **PARAR, informar bloqueo técnico exacto y no publicar implementación parcial insegura**.

**Obligación de revisión posterior humana:** el código nuevo que invoque una función de NEX-076 debe mostrar error controlado claro cuando NEX-076 no se encuentre en DB real, nunca simular datos ni volver silenciosamente al fiscal. ChatGPT audita migration y preflight antes de proponer su ejecución. Cliente no utiliza nuevos flujos hasta aplicación operativa autorizada.

## 4. Archivos autorizados (leerlos completos antes de editar)

1. `lib/facturacion/emision.ts` — `receptorDe`, `prepararFactura`, `equivalente`, `crearFacturaElectronica` y hash.
2. `lib/facturacion/entrega.ts`, `lib/facturacion/entrega-control.ts` — selector y lectura segura, únicamente si necesario.
3. `lib/facturacion/payload-fe.ts` — solo si preciso para mapeo validado del receptor.
4. `lib/facturacion/info-adicional.ts` — **nunca borrar parser legado**; modificar únicamente composición para nuevas FE si hace falta.
5. `app/(private)/facturas/nueva/entrega-cliente.tsx` y `app/(private)/facturas/nueva/page.tsx` — cambio de texto/resumen/revisión, sin rediseño global ni cambios de cálculo.
6. `documentacao/banco/nexit/v1/migraciones/NEX-076-facturacion-fe-direccion-receptor-seleccionada.sql` — solo versión de migration nueva, bajo requisitos anteriores.
7. Casos focales como código: `lib/facturacion/entrega-e04.casos.ts`, `lib/facturacion/info-adicional-e1.casos.ts`, y `lib/facturacion/facturacion.casos.ts` solo si realmente afectado.

Puedes leer otros archivos relevantes para entender dependencias; **no modificarlos** sin impedir un error directamente causado por esta orden: si hay necesidad de ampliar escopo, detener y explicar, no autopriorizar ni hacer refactor. PRO-327 (productos), PRO-330 (stock temprano), PRO-332 (reportes), PRO-333 (orden), PRO-334 (colores), PRO-335 (formatos), PRO-298 (PDF proveedor), PRO-336 (certificados) quedan FUERA de edición.

## 5. Matriz de aceptación obligatoria como casos de código

- **FE nueva, PY, destino válido**: JSON `dDirRec,dNumCasRec,cDepRec,cDisRec,cCiuRec,cPaisRec` corresponde EXACTAMENTE al destino seleccionado; dirección fiscal de cliente diferente no contamina.
- **Sin destinos registrados**: fiscal original; no info automática `Dirección de entrega`; no bloquear.
- **Con destinos pero sin elegir**: error legible, sin emisión.
- **Destinos de otra empresa/cliente/no elegible/inactivo**: rechazar sin filtrar datos.
- **Dirección inválida**: sin número, no numérico, falta código, geografía ajena a jerarquía, B2F extranjero o datos PY incompatibles; 422; nada se completa a escondidas.
- **Dirección editada entre previa/emisión**: no usar `repartoHuella/infoAdicionalHuella` antiguos para ocultar cambios; fallo transaccional seguro; no consumir FE/stock/número.
- **FE nueva con observaciones y vendedor**: `dInfAdic` tiene observaciones íntegros y vendedor, **NO** dirección automática.
- **FE histórica con línea automática**: reintento preserva snapshot/dInfAdic y reconoce o devuelve 409 seguro si identidad no comprobada, jamás modifica.
- **Distinto `direccionEntregaId` con texto igual**: 409, no reutiliza; destino original editado/eliminado no altera FE ya emitida. Histórico sin mecanismo autorizado de identidad -> 409.
- **Seguridad y compatibilidad**: ACL/empresa/sucursal, fecha, vendedor, 23 ítems y otras reglas actuales sin regresión; PRO-326 permanece disponible aun RECHAZADO/sin CDC (no cambiar código KuDE).
- **SQL/migration**: solo creación del archivo, guardas, grants, firma compatible, rollback ante conflicto; no ejecutar.

## 6. Ejecución permitida y entrega

1. Antes de tocar código: leer `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, esta orden, [AUD] y fuentes NEX-005/NEX-068/NEX-074. Ver `git status --short`, branch, `git fetch` y `git merge --ff-only`; jamás descartar trabajo local. Ante conflicto/parche previo, PARAR.
2. **SOLO DESARROLLAR, ESCRIBIR CASOS COMO CÓDIGO Y VERSIONAR MIGRACIÓN SI NECESARIA. NO EJECUTAR TESTS, LINT, TYPECHECK, BUILD, CI MANUAL, SQL, PSQL, POSTGRESQL, VM, DOCKER, HTTP GATEWAY, PDF REAL NI DEPLOY.** Esta excepción focal protege el ambiente y requiere auditoría estática posterior. No deshabilitar CI automático existente.
3. No emitir facturas REALES ni escribir datos; sin secretos en commits/logs. No abrir PR de otros cambios ni tomar tareas siguientes.
4. Hacer **un solo commit funcional focal** y push a branch `feature/NEXIT-2026-001-banco-demo`; reportar SHA completo, resumen conciso de reglas implementadas, archivos cambiados, cantidad de casos escritos, status pruebas **NO EJECUTADAS**, migration NEX-076 **SOLO VERSIONADA** si creada, bloqueos concretos.
5. **PARAR**. ChatGPT leerá GitHub/diff completo e emitirá auditoría independiente; **nunca Claude actualiza Linear, `CLAUDE.md`, `PROGRESSO-NEXIT-V1.md`, plan, auditoría ni estados de issues**. No declarar homologado/Done.

**MANDATO FINAL:** desarrollar exactamente PRO-328. Si un defecto real impide preservar atomicidad, payload fiscal, idempotencia o permisos, no inventar workaround; parar y presentar la imposibilidad con archivo/razón.
