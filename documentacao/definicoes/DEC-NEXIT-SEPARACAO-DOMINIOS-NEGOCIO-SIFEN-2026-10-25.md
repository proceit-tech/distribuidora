# NEXIT — Decisión de arquitectura: gestión empresarial independiente del contrato SIFEN

**Fecha:** 25/10/2026. **Decisión del responsable: VINCULANTE.** Idioma funcional de la aplicación: español (Paraguay). Esta decisión no aprueba desarrollo, cambios SQL, despliegue, emisión fiscal ni ampliación de alcance.

## 1. Objetivo del producto

**NEXIT es un sistema de gestión comercial y operativa con integración de facturación electrónica al SIFEN, no un aplicativo cuyo objetivo sea únicamente emitir documentos SIFEN.** El estándar fiscal proporciona un marco de referencia y reglas de interoperabilidad; no determina ni limita los procesos, identificadores, pantallas, catálogos o datos que NEXIT necesita para sus propias operaciones empresariales.

**Regla de separación:** (A) contrato normativo de SIFEN y proveedor JSON→SIFEN; (B) reglas de negocio y persistencia interna de NEXIT. Una regla externa se aplica en el adaptador fiscal y en sus validaciones pertinentes, sin convertir los datos fiscales en fuente única del ERP.

## 2. Dominios de NEXIT y responsabilidad

| Dominio | Datos y procesos propios | Dependencia de SIFEN |
|---|---|---|
| Comercial | Clientes, direcciones, catálogos, productos, precios, pedidos, ventas, condiciones comerciales | Los datos pertinentes se proyectan al documento fiscal, cuando se emita |
| Inventario y stock | Empresas/sucursales, depósitos, ubicaciones, existencias, unidades identificadas, reservas, transferencias, movimientos y kardex, trazabilidad | SIFEN no define ni reemplaza el libro interno de stock ni sus movimientos |
| Logística y entregas | Destinos, referencias por ID, preparación, entrega y snapshots inmutables, seguimiento operativo | El domicilio de entrega NO es automáticamente el domicilio fiscal |
| Financiero | Cobros, pagos, crédito, saldos y obligaciones comerciales según módulo y alcance contratado | Condición/pagos informados a SIFEN no sustituyen el control financiero interno |
| Fiscal | FE/NCE, secuencias y CDC, validaciones legales, JSON al proveedor, estados y KuDE devuelto | Aquí rigen las condiciones específicas SIFEN y del proveedor |

La tabla describe **responsabilidades de arquitectura**, no declara todas las funciones implementadas ni autoriza construirlas.

## 3. Direcciones: dos identidades diferentes

1. **Dirección fiscal del receptor**: pertenece a Clientes, se usa exclusivamente para identificar correctamente al receptor en la FE; NEXIT aplica la política aprobada para domicilio nacional **completo o totalmente ausente** (cuando legalmente permitido). Cuando se informa: país, calle, número, departamento, distrito y ciudad completos; el adaptador fiscal envía solo códigos geográficos al proveedor, cuya resolución de descripciones requiere evidencia contractual.
2. **Dirección de entrega**: pertenece al proceso comercial/logístico. Su identidad es el **ID interno**, no el texto fiscal ni el texto escrito en `dInfAdic`. Se conserva una fotografía histórica inmutable del destino usado en la operación incluso si la ficha actual cambia o se elimina. Se permite que dirección fiscal y de entrega sean diferentes. Nunca tomar el destino para inventar el domicilio del receptor.

`dInfAdic` es un texto complementario de un documento fiscal, **NO es la fuente de verdad para la identidad de entrega, el vendedor, el movimiento de stock ni el kardex**. Puede incluir referencias comerciales de manera visible por decisión UI, pero eso no sustituye referencias estructuradas, trazabilidad ni permisos del dominio interno.

## 4. Movimientos e idempotencia: límites

- Una FE emitida tiene snapshot fiscal, numeración, CDC y estado fiscal propios; la operación de inventario/logística vinculada tiene IDs, registros, motivos, saldos y pruebas de ejecución propios. No deducir movimiento de stock de la mera presencia de campos en JSON SIFEN.
- Cuando la política de la operación requiera baja de stock asociada a emisión, preservar transaccionalidad/idempotencia de la operación existente sin redefinir las reglas de stock desde el manual SIFEN. No modificar el flujo NEX-067 por esta decisión.
- La idempotencia de creación de FE protege contra duplicados fiscales. La identidad del destino comercial se contrasta, si resulta necesario, con su registro interno histórico, **nunca con una línea de texto coincidente**. Datos financieros, comerciales y fiscales no deben mezclarse como si fuesen un único identificador.
- Un reintento fiscal no debe reejecutar movimientos de inventario o entrega ya confirmados; tampoco debe aceptar una nueva operación comercial que reutilice indebidamente una clave fiscal. Esta exigencia de seguridad se mantiene y se resuelve en su propio alcance.

## 5. Corte de alcance entre tareas

- **PRO-322 — DIRECCIÓN FISCAL / JSON SIFEN**: corregir únicamente la preparación y validación del domicilio del receptor y confirmar compatibilidad del proveedor, sin adjudicarle el rediseño de stock, entregas o movimientos. No marcar Done/homologado mientras falten requisitos fiscales, evidencia o errores de código realmente relevantes.
- **PRO-205 — HISTORIA LOGÍSTICA DE DIRECCIONES**: preservar referencia y snapshot de entregas independiente del JSON fiscal.
- **PRO-324 — IDENTIDAD HISTÓRICA DE ENTREGA / LECTURA SEGURA**: problema de acceso interno para controlar el vínculo de entrega cuando una clave de FE se reintenta. Mantener como cuestión **separada** de PRO-322; no bloquear la corrección del domicilio fiscal. Su planteamiento de una nueva función de lectura SQL es solo propuesta, **no autorizada** a desarrollar/aplicar; cualquier defecto real de reutilización indebida requiere control y tratamiento seguro, no aprobación ficticia.
- **PRO-323 — TEXTO `dInfAdic` Y ASISTENCIA DE UI**: asunto separado; no construir sin autorización. Nunca convertirlo en almacén primario de información operativa.

## 6. Condiciones de trabajo

Esta decisión es solo funcional/arquitectónica: **no cambia el código, esquema, migraciones o permisos, ni aprueba tests/build/CI/VM/gateway**. Mantener auditorías históricas como hechos del código visto, distinguiéndolas de una decisión de planificación de alcance. En particular, el bug real de idempotencia comparando destinos diferentes mediante el mismo texto se mantiene registrado, pero no obliga a encadenar el contrato de domicilio fiscal a una migración de logística.

**En una frase:** **el modelo y las operaciones de NEXIT son la fuente de verdad del negocio; el JSON SIFEN es una proyección fiscal validada de los datos aplicables.**
