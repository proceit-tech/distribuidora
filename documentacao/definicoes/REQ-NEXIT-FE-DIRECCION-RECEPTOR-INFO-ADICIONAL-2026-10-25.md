# NEXIT FE — Dirección fiscal integral e Información adicional asistida

**Fecha:** 25/10/2026. **Estado:** definiciones funcionales confirmadas por el responsable; hallazgo estático de payload por corregir; **NO IMPLEMENTADO ni HOMOLOGADO**.
**UI:** español Paraguay (es-PY); aplicación desktop.
**Referencias oficiales:** DNIT, Manual Técnico SIFEN v150 (D203–D224, páginas impresas 71–73): https://www.dnit.gov.py/documents/20123/420592/Manual%2BT%C3%A9cnico%2BVersi%C3%B3n%2B150.pdf/e706f7c7-6d93-21d4-b45b-5d22d07b2d22?t=1687362295907.pdf. Confirmar, antes del desarrollo, vigencia y contrato exacto del proveedor JSON→SIFEN; los nombres de claves abajo corresponden al manual SIFEN, no necesariamente a un esquema distinto del proveedor.

## 1. Hallazgo técnico comprobado en el código de la branch

- `lib/facturacion/emision.ts::receptorDe` recupera `direccion`, `numero_casa`, `departamento_codigo`, `distrito_codigo`, `ciudad_codigo` de la dirección FISCAL del cliente.
- `lib/facturacion/payload-fe.ts::ReceptorFE` representa departamento/distrito/ciudad como strings.
- **BUG/INCOMPLETITUD REAL DEL CÓDIGO:** `construirPayloadFE` actualmente agrega `cPaisRec`, `dDirRec`, `dNumCasRec`, pero **NO** agrega `dDesPaisRe`, `cDepRec`, `dDesDepRec`, `cDisRec`, `dDesDisRec`, `cCiuRec`, `dDesCiuRec`. Es posible que el gateway derive algunas descripciones por contrato, **NO VERIFICADO**. La especificación de integración debe confirmar esto; no inventar que el proveedor recibe hoy las claves.
- `validarEntradaFE` requiere departamento y ciudad para un receptor PRY con dirección, tipo de operación distinto de B2F; **por ahora valida datos que la construcción del JSON no utiliza**. `dNumCasRec` se envía como 0 si dirección no vacía y número ausente/no válido; no inventar ni perpetuar 0 como sustituto de dato que el cliente conoce. El 0 corresponde solo a domicilio confirmado sin numeración.
- Este hallazgo no prueba por sí solo por qué un KuDE concreto salió vacío. El NEXIT consume el PDF de `POST /api/kude`, no lo genera.

## 2. Regla funcional confirmada — bloque FISCAL coherente, no valores sueltos

**Identificación del país (D203/D204) siempre presente según manual:** `cPaisRec` código + `dDesPaisRe` descripción coherente. No confundir país del cliente (receptor) con país de ENTREGA. Un país PRY no se convierte en blanco aunque no exista dirección fiscal informada.

**Bloque de domicilio fiscal del receptor:**
| Datos | Claves SIFEN | Regla |
|---|---|---|
| Calle/dirección | `dDirRec` D213 | 1–255, obligatorio en B2F y en casos específicos del DE, opcional según tipo de FE ordinaria |
| Número casa | `dNumCasRec` D218 | Requerido cuando se informa calle; usar 0 solo si el domicilio es **sin número** comprobado |
| Departamento | `cDepRec`, `dDesDepRec` D219/D220 | Código/descripcion por catálogo; requerido con calle salvo B2F |
| Distrito | `cDisRec`, `dDesDisRec` D221/D222 | Pareja opcional según condiciones normativas; cuando hay código, descripción obligatoria |
| Ciudad | `cCiuRec`, `dDesCiuRec` D223/D224 | Código/descripcion por catálogo; requerido con calle salvo B2F |

- **Si existe dirección fiscal y debe ser informada, nunca emitir bloque parcial**: resolver desde la misma dirección FISCAL del catálogo, validar identidad de empresa/cliente, consistencia geográfica de códigos y descripciones, departamento/ciudad/distrito y reglas por operación. **No mezclar valores de distintas direcciones del cliente**.
- **Si NO existe domicilio fiscal y es legal omitirlo**, omitir las claves opcionales de domicilio como un conjunto (o usar nulos según contrato validado del gateway). País obligatorio se conserva. **Si faltan datos en una dirección existente o el domicilio es obligatorio, BLOQUEAR con mensaje legible y enviar a corregir Clientes**; nunca silenciar parte de un bloque ni inventar geografía.
- **B2F**: calle obligatoria, número de casa condicional por calle, y **no informar cDepRec ni cCiuRec** según MT D219/D223; no forzar reglas de departamentos y ciudades paraguayos para dirección extranjera. Distrito y descripciones también requieren gate normativo B2F por proveedor. Validar país compatible con operación.
- **Receptor fiscal y entrega no se sustituyen:** el `direccionEntregaId` es un DESTINO comercial; no copiarlo a `dDirRec` ni usarlo para fabricar domicilio del RUC.
- **No cambiar catálogos ni FE ya emitidas** como efecto secundario. Snapshot histórico, CDC, idempotencia, otros tipos de documentos y NCE quedan intactos.
- Emitir una previa que muestre claramente `Dirección fiscal del receptor` y `Dirección de entrega` separadas. Validar la carga justo antes de preparar snapshot de FE.

## 3. Regla funcional confirmada — dInfAdic como editor libre ASISTIDO

**Decisión del responsable:** `dInfAdic` es **texto comercial libre y visible**, con selectores que insertan en el MISMO cuadro editable los datos de `Dirección de entrega` y `Vendedor`. Usuario puede redactar desde cero, seleccionar datos, agregar notas, editar y complementar sin depender de anexado invisible en servidor. El texto final que ve antes de confirmar es el texto exacto que deberá llegar en `dInfAdic` al confirmar; máximo 5000 caracteres según contrato actual, sin recortar silenciosamente.

**UI es-PY:**
- `Información adicional` visible con textarea grande editable y contador, se ubica después de productos/pago según flujo aprobado; selector `Dirección de entrega` con **destinos del cliente habilitados** y selector `Vendedor` con **vendedores activos autorizados de la empresa** (fuente de cadastro a definir con PRO-307/PRO-72; no asumir usuario emisor). Botones/acciones explícitas `Insertar dirección de entrega` y `Insertar vendedor`; o inserción al seleccionar con comportamiento visible y sin sustituciones silenciosas.
- Ejemplo `Dirección de entrega: Sucursal Centro — Av. España 1250, Asunción\nVendedor: Juan Pérez\n\nEntregar antes de las 15:00.` **Sólo ilustrativo**, nombres/direcciones deben salir del catálogo, no inventarse en operación real.
- El usuario puede editar todos los caracteres del texto final. Insertar una selección no borra observaciones anteriores. Cambiar una selección NO duplica etiquetas ni reemplaza silenciosamente notas ya editadas: reemplazar exclusivamente segmento generado identificable; si ese segmento fue alterado manualmente y su identidad ya no es verificable, pedir confirmación de sustitución o insertar explícitamente, sin pérdida de texto.
- No poblar automáticamente `Vendedor` con el nombre del usuario emisor: son funciones distintas. La elección del vendedor estructurado debe quedar correlacionada por ID validado en empresa/permisos, y, si se registra como dato comercial, su snapshot no depende del texto libre (que puede ser editado). No inferir identidad comercial de `Vendedor: ...` mecanografiado por el usuario. **Política definitiva del catálogo** pendiente de PRO-307.
- No concatenar a escondidas un segundo bloque `[Datos automáticos del sistema]` cuando ya se ve y edita el contenido generado. Migrar con cuidado las reglas existentes `componerInfoAdicional`, `huellaInfoAdicional`, `infoAdicionalPersistida`; no romper E1/NCE que comparten helper, ni la integridad de texto del original NCE NEX-071.
- El servidor valida los IDs estructurados, reconstituye/valida las selecciones y aplica límite; el texto final de `dInfAdic` se confirma con hash y **snapshot inmutable** al emitir. Si la selección o el texto final cambian antes de la confirmación, invalidar la previa. **Idempotencia**: para documento existente, siempre reutilizar `dInfAdic` histórico exacto, no recomponer con fichas/usuarios modificados.
- No convertir el texto comercial `dInfAdic` en campo fiscal del domicilio `dDirRec`. Mostrarlo en resumen previo, sin garantías falsas de que el generador de KuDE externo imprima todo el texto.

## 4. Pruebas de aceptación propuestas para implementación futura

**Fiscal:** (A) Cliente PRY con dirección completa D203/204 y D213/218/219-224 con descripciones y claves válidas; (B) cliente PRY sin domicilio opcional -> claves de domicilio omitidas, país válido; (C) dirección parcial -> 422 antes de reservar número o enviar HTTP, explicación de campo faltante; (D) no número real -> 0 sólo como caso declarado; (E) código ciudad no corresponde a departamento -> bloqueo; (F) distrito informado sin descripción -> bloqueo; (G) B2F sin calle -> bloqueo y con calle -> omisión de campos geográficos nacionales no admitidos; (H) cliente con varias direcciones -> usar únicamente la FISCAL para D200.
**Info adicional:** (I) libre puro; (J) solo dirección; (K) solo vendedor; (L) ambos + comentario libre; (M) cambio del vendedor/destino no duplica ni apaga anotaciones; (N) reintento de misma clave y cambios posteriores de maestros mantienen snapshot; (O) NCE/E1 existentes sin regresión; (P) 5000 caracteres completos y 5001 se bloquea; (Q) secuencia revisar/confirmar/cambiar invalida huella, sin reservar número; (R) permisos/empresa/cliente.
**KuDE:** comparar misma FE: `dInfAdic` persistido vs. PDF del gateway e identificar si impresión del proveedor omite líneas (PRO-298). Ninguna inferencia de producción sin prueba real.

**Linear de implementación:** [PRO-322](https://linear.app/proceit/issue/PRO-322/fe-dir-serializar-e-validar-direccion-fiscal-completa-del-receptor-en) (dirección fiscal integral), [PRO-323](https://linear.app/proceit/issue/PRO-323/fe-inf-dinfadic-editable-con-insercion-asistida-de-entrega-y-vendedor) (editor asistido), ambos subissues de PRO-93 y estado Todo, no implementados.

## 5. Separación de alcance y gate

- **Trilha fiscal receptor**: ticket separado, hijo de PRO-93; análisis estático de formato y contrato gateway primero; después patch min. `payload-fe.ts`, `emision.ts` y catálogo de códigos/descripciones, con tests focalizados bajo autorización.
- **Trilha UX dInfAdic**: ticket separado, hijo de PRO-93; depende de elección de vendedor PRO-307/PRO-72; preservar E1/NCE y snapshots inmutables; contrato de envío e histórico vigente.
- **PRO-298** PDF KuDE de proveedor: responsabilidad de validar impresión; NEXIT no remaqueta PDF del proveedor.
- **PRO-321 E03-A1** revisão estática conforme, migration NEX-072 NÃO aplicada; **E03-A2/E03-B/E08/E09 siguen bloqueadas**. Estas reglas de FE no autorizan esas etapas ni aplicación SQL.
- En esta definición: **NO CAMBIOS DE CÓDIGO, NO SQL, NO TESTES, NO VM, NO ENVÍOS**. Solo documentación y tareas. No marcar issues Done ni homologado.
