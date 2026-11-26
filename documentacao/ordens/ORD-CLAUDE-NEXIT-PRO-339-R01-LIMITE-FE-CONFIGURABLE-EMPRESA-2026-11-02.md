# ORDEN DE DESARROLLO — PRO-339-R01: límite de ítems FE configurable POR EMPRESA

**Fecha:** 02/11/2026  
**Proyecto:** NEXIT / `proceit-tech/distribuidora` · branch `feature/NEXIT-2026-001-banco-demo`  
**Linear:** [PRO-339](https://linear.app/proceit/issue/PRO-339) · **GitHub:** [#16](https://github.com/proceit-tech/distribuidora/issues/16)  
**Autoriza el responsable PROCEIT en la conversación:** *«colocar um controle que depois fazemos uma tela adm para controlar isso, que vai ser por cliente ... não quero fixo quero variavel um cliente 21 ou 63 outro 99»*.  
**Orden ACTIVA únicamente para desarrollo de la política/configuración**, no para implementar la futura pantalla de administración, ni para ejecutar SQL/migrations/tests/deploy.  
**Auditor:** ChatGPT después del SHA.

## 0. Interpretación exacta de «cliente» y regla de negocio

**«Cliente» significa EMPRESA CLIENTE que utiliza NEXIT (tenant, `empresas.id`), NO el comprador/receptor (`clientes` o `clienteId`) de una factura.**

No se implementa una excepción para «CASA MINGO» con una cifra fija. El producto debe admitir valores diferentes por empresa, por ejemplo:
- Empresa A: 21 líneas;
- Empresa B: 63 líneas;
- Empresa C: 99 líneas;
- Empresa sin configuración: 999 líneas (comportamiento actual).

**21, 63, 99 son ejemplos de VALORES, nunca reglas por nombre, RUC, ID ni constantes en el código.** La asignación del valor exacto a cada empresa es un acto administrativo distinto. No modificar los datos/configuración real de CASA MINGO ni de otra empresa durante esta orden.

**Alcance inicial:** solo FE NUEVAS (Factura Electrónica) por empresa; **NO NCE**, otros documentos ni FE antiguas; el número de líneas se calcula como `cuerpo.lineas.length`, **NO** suma de cantidades ni cuenta de SKU distintos. Mismo SKU que simplemente incrementa cantidad no aumenta el número de líneas; dos líneas distintas cuentan como dos aun si comparten SKU. El scroll de PRO-331 continúa mostrando 4 filas visibles y scroll a partir de la quinta, independientemente del tope. El límite fiscal general `MAX_LINEAS=999` permanece intacto.

## 1. Arquitectura de configuración preparatoria para pantalla ADMIN FUTURA

**Opción A aprobada por el responsable en su forma parametrizable:**
1. Crear migration **NUEVA, incremental y versionada** según última NEX disponible, con `empresas.fe_max_lineas integer NULL` y restricción `CHECK (fe_max_lineas IS NULL OR fe_max_lineas BETWEEN 1 AND 999)`. **NULL => 999**; no modificar `NEX-002` ni otras migrations históricas. No guardar una fila por cliente final en `clientes`, ni hardcodear CASA MINGO.
2. La columna pertenece al registro de la **empresa** y será editable más adelante mediante una pantalla administrativa separada (issue FUTURA de administración). Esta orden **NO** crea menús, paneles, endpoints CRUD administrativos, permisos nuevos ni formularios de administración. Garantizar que un futuro controlador de administración pueda leer/actualizar la columna por empresa con auditoría y autorización apropiadas; **no implementar tal controlador hoy**.
3. La única fuente de verdad del máximo efectivo es el **backend** leyendo la empresa autenticada; `COALESCE(fe_max_lineas,999)` y el máximo absoluto fiscal 999. Si falta la migration en la base, no permitir una FE nueva sin reconocer que la regla comercial podría quedar sin cumplir; diseñar un error controlado/fail closed en rutas impactadas, sin degradación silenciosa a 999 y sin tocar la BD operativa. Proponer preflight de despliegue para después, nunca ejecutarlo.

## 2. Backend — validación obligatoria y seguridad multiempresa

**Archivos a inspeccionar con versiones COMPLETAS, UNO por vez:** `lib/facturacion/emision.ts`, `lib/facturacion/payload-fe.ts`, `lib/facturacion/servidor.ts`, `app/api/facturas/previa/route.ts`, `app/api/facturas/route.ts`, módulos de envío e idempotencia vinculados. Leer todos antes de editar el archivo correspondiente.

**Contratos:**
- `leerCuerpoFactura` mantiene control de FORMA de 1..999 y `MAX_LINEAS=999` fiscal global. NO reemplazar sus 999 por 21/63/99.
- `prepararFactura(db,empresaId,usuarioId,cuerpo,opciones)` es punto común de control de negocio para **previa y emisión**. Obtener el límite mediante consulta paramétrica por `empresaId` de la **sesión autorizada**, nunca del cuerpo HTTP ni del cliente final/receptor. Si `cuerpo.lineas.length` excede el máximo efectivo, devolver `ErrorFacturacion(422,...)` en español con el límite REAL de esa empresa, **ANTES** de reservar numeración, emitir, enviar gateway o modificar stock.
- Si el límite cambia entre borrador y emisión, el servidor valida el valor **vigente en el momento de confirmar** y la UI muestra error claro que permite editar y revisar de nuevo. No falsear idempotencia.
- Un reintento idempotente **de un documento ya creado y probado equivalente** debe mantener su payload original aunque la configuración actual sea menor; no volver a consumir número/stock, no impedir consultar/descargar KuDE; si no es equivalente/no se puede verificar histórico, no saltarse la nueva validación ni emitir FE nueva fuera de política.
- Validar tanto `POST /api/facturas/previa` como `POST /api/facturas` con el mismo contrato servidor, con separación de permisos, empresa/sucursal y otros límites SIFEN. Ningún tenant puede leer el máximo ni modificar configuración de otro.
- No alterar NCE, FE históricas, stock, descuentos, IVA, redondeos, CDC, serialización, gateways, consulta PRO-338 ni KuDE.

## 3. Nueva factura — leer el máximo y avisar sin bloquear la edición normal

**Inspeccionar `app/(private)/facturas/nueva/page.tsx`, el GET de catálogos FE existente y componentes buscador/selector.** Exponer el máximo efectivo `maxLineasFE` desde un endpoint **ya autenticado y ligado a empresa de sesión**; preferir ampliar catálogos FE existentes si es compatible. No hacer que el frontend elija empresa o proporcione el máximo para validación. No mostrar pantalla de administración.

- Mostrar texto en español `N de M ítems`/límite actual de esta empresa, sin imponer M fijo. Mantener tabla de 4 filas visibles y scroll desde la quinta.
- Al añadir **una línea nueva** por lector/código/Enter/selector avanzado por encima de M, **no** añadirla; mostrar aviso claro `Esta empresa admite un máximo de M líneas por factura electrónica.`, permitir corregir sin perder borrador y preservar foco del buscador/selector según PRO-331. Repetir SKU ya presente (incremento de cantidad sin línea adicional) sigue permitido.
- Al eliminar una línea se puede volver a añadir otra. Cuando M es 21/63/99, pueden visualizarse 4 filas con scroll; ninguna limitación extra del scroll debe convertirse en un máximo.
- Si el backend comunica 422 por cambio de política mientras se editaba, mantener el estado del borrador y ofrecer corrección/revisión, sin intentar emitir automáticamente.

## 4. Migration / activación independiente

- Crear archivo SQL **solo versionado en GitHub** con número incremental verificado y `CHECK` correcto, `NULL` por omisión, sin ejecutar. Si conviene, incluir script de verificación/reversión **solo como fuente y con condiciones seguras**, también sin ejecutar.
- **PROHIBIDO** insertar `21` para CASA MINGO en la migration, cambiar registros reales, inventar UUID/RUC/nombre interno, activar un flag por tenant unilateralmente, editar `schema_migrations`, ejecutar comandos en VM/DB o deployment.
- La futura **pantalla ADMIN** modificará límites por empresa; hasta entonces, solo una operación administrativa separadamente autorizada podrá establecer el máximo concreto, tras verificar `empresas.id`, backup y auditabilidad. Sin configuración explícita, se mantienen 999.
- Identificar claramente dependencia: despliegue de código que depende de nueva columna requiere aplicar migration validada ANTES de habilitar esa versión en producción. Si no hay schema requerido, el backend debe fallar cerrado para FE nueva, no aplicar silenciosamente 999.

## 5. Casos a ESCRIBIR (NO ejecutar)

Casos de lectura `NULL->999`; empresas A=21, B=63, C=99; 0/1/4/5/20/21/22/62/63/64/98/99/100/999/1000; SKU repetido con aumento de cantidad (sin línea nueva), SKU en dos renglones distintos, borrar-reagregar; lector Enter, selector avanzado, foco, cuatro visibles/scroll; manipulación directa API; previa/emisión y cambio de política entre ambos; cambio de sesión/tenant; permisos ACL; migration ausente y error controlado; reintento idempotente FE histórico > nueva cuota; distintos tipos NCE intactos; fallos de stock/cantidad/cálculos y KuDE intactos. No generar pruebas de un caso demo que dependan de tenant real ni inventar datos.

**Todos los casos fuente declarados NO EJECUTADOS.**

## 6. PROTOCOLO Y ENTREGA

- Leer `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, [documento técnico de decisión](../decisiones/DEC-NEXIT-PRO-339-LIMITE-FE-POR-EMPRESA-2026-11-02.md), esta orden y las issues antes de tocar código.
- Leer **archivo COMPLETO y MÁS RECIENTE, trabajar 1 ARCHIVO por vez**. Mantener cambios mínimos y avisar de cualquier cambio potencialmente disruptivo; no eliminar comportamientos o credenciales actuales sin autorización.
- **NO EJECUTAR** tests, runner, lint, typecheck, build, CI manual, SQL, migrations, PostgreSQL, Docker/VM, gateway real, navegador del cliente ni deploy. No marcar Done.
- Commit y push, listar archivos, SHA completo, migrations nuevas **NO APLICADAS**, casos escritos **NO EJECUTADOS**, riesgos y gate schema; **PARAR para auditoría independiente ChatGPT PRO-339-R01**. No iniciar la pantalla administrativa en la misma entrega.
