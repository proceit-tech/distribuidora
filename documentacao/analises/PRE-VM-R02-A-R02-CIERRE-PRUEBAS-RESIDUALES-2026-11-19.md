# PRE-VM-R02-A-R02 — Cierre de pruebas residuales (entrega para auditoría)

- **Fecha:** 19/11/2026.
- **Base:**
  - Commit `cc23de574541658160c8093eb44e96fd3f145825`.
  - CI de la aplicación: run 44517202146. 6.698 comprobaciones, 14 fallos.
  - CI de PostgreSQL: run 44517202020.
- **Alcance:** los 12 casos de la orden.
  - CORE-04, con la opción A autorizada.
  - 10 casos de F-01/F-02, revelados al dejar de abortar la suite.
  - EN-75 de E04.
- **Fuera de alcance, sin tocar:**
  - PRO334-29 (A-26).
  - El verificador C1 (A-29 / C-05).
  - T01 (C-01).
  - El bloque B de lint de la aplicación.
  - NEX-082.
- **No reabiertos:** T25, T26, V0, KUDE-21 ni las correcciones que ya pasaron.
- **Archivos tocados:** sólo `lib/facturacion/credito.casos.ts`, `lib/facturacion/facturacion.casos.ts` y `lib/facturacion/entrega-e04.casos.ts`.
- **Archivos sin tocar:** código funcional (incluido `emision.ts`), pantalla, migraciones, gateway, CDC, inventario, numeración y contratos fiscales.
- **Nada ejecutado:** ni tests, ni lint, ni typecheck, ni build, ni SQL, ni CI manual. Las expresiones regulares nuevas de UX-01/03/04, EN-75 y CORE-04 se contrastaron contra el texto fuente con `node -e` (`fs.readFileSync` + regex). No se compilaron ni ejecutaron los casos.

## 1. Matriz de los doce casos

| # | Caso | Causa raíz | Referencia contractual | Modificación | Criterios preservados |
|---|---|---|---|---|---|
| 1 | CORE-04 POST directo con Cuotas (`credito`) | Desde PRO-322-R02 (F002), `crearFacturaElectronica` lee si la clave existe antes de `prepararFactura`. El caso exigía cero consultas. | Matriz FE CORE-04: «respuesta dirigida antes de NEX-048». La opción A está autorizada por el responsable. | Se admite **exactamente** una consulta. Se comparan el SQL normalizado (`SELECT 1 AS ok FROM documentos_electronicos WHERE empresa_id = $1::uuid AND clave_idempotencia = $2`) y los parámetros (`[EMPRESA, "clave-de-prueba-0001"]`). No se acepta por la cantidad: otra tabla, empresa, clave, una segunda consulta o una escritura hacen fallar el caso. | 422 dirigido «suspendido». La lectura del cuerpo con 0 consultas. 0 escrituras, 0 `fe_documento_crear_fe`, 0 documentos y 0 consultas de stock, inventario, secuencia o numeración. `emision.ts` sin tocar. |
| 2 | Consulta: «CDC con formato inválido se descarta» (`facturacion`) | Regla revocada: desde R05 el CDC es un dato opaco. Se esperaba `null` y se obtiene `"123"`. | PRO-342-R05 (`gateway.ts::cdcInformadoPorApi`, CONTRATO_FISCAL_CONSULTA) | Detalle en el §2.1. | El estado lo informa la API (`Estado`), no el CDC. Única ruta contractual `response.DE.CDC`. |
| 3 | Validación del receptor: «PRY con dirección sin departamento/ciudad» (`facturacion`) | El mensaje «departamento y ciudad» fue sustituido por mensajes por campo (D219, D221, D223). | PRO-322-R05, REQ FE-DIR §4.2 (`erroresDomicilioReceptor`) | Detalle en el §2.2. | RUC/DV del contribuyente y documento del no contribuyente, igual que antes. |
| 4 | Recepción: «2xx success con CDC coherente → ENVIADO» (`facturacion`) | En R05 un CDC solo no confirma la recepción (se retiró `cdcCoherente`). Se obtiene RESPUESTA_INVALIDA / ENVIO_INDETERMINADO. | PRO-342-R05 (`interpretarRecepcion`) | Detalle en el §2.3. | Sin estado SIFEN por el CDC ni por el lote. El ACK sin identificación sigue sin confirmar. |
| 5 | AUD-FE-03: «no se envían cDepRec/cDisRec/cCiuRec» (`facturacion`) | Desde PRO-322 el domicilio nacional completo lleva los tres códigos geográficos. | PRO-322-R05. Contrato del gateway confirmado por el responsable (códigos numéricos; las descripciones las resuelve la API). | Detalle en el §2.4. | No se inventan opcionales. `cPaisRec` siempre presente. |
| 6 | Contrato: «lote con CDC ajeno o número devuelto distinto → indeterminado» (`facturacion`) | En R05 un CDC de otra composición no invalida un ACK correlacionado por lote. | PRO-342-R05 (y R05-R01 F001 para los ecos) | Detalle en el §2.5. | La protección contra ecos contradictorios se mantiene (número, punto y establecimiento). Sin estado SIFEN. |
| 7 | UX-03 cabecera (`facturacion`) | La cabecera muestra «Fecha de emisión: {fechaTexto} · Moneda», con la fecha editable (PRO-294). | FE-V1-01 / PRO-294 / NEX-073 | Se exige el texto vigente y que `fechaTexto` sea la fecha elegida (o la de hoy), formateada con `formatearFechaPy`. | Sin bloque de número, sin «Se asigna al enviar», sin «la fija el sistema», sin «Solo contado», sin «El servidor recalcula». Pantalla sin cambios. |
| 8 | UX-01 ficha del cliente (`facturacion`) | El texto revocado «0 (no cargado; se informa 0)» se reemplazó por la regla D218. | D218 (`payload-fe.ts`, ficha en `page.tsx`) | Se exige «no cargado: corríjalo en Clientes (no se reemplaza por 0)», la condición de 1 a 6 dígitos y que no exista «se informa 0». | Diálogo, ficha fiscal, tipo de contribuyente, dirección fiscal, Cambiar cliente, Regularizar en Clientes y `disabled={!c.apto}`. Pantalla sin cambios. |
| 9 | UX-04 fechas (`facturacion`) | La fecha de emisión editable es un `<input type="date">` con rango. El caso prohibía todo `type="date"` en el formulario. | FE-V1-01 / PRO-294 | Detalle en el §2.6. | Documentos sin `type="date"`, con `CampoFecha` y `formatearFechaHoraPy`, y sin `toLocale` de `Date`. |
| 10 | E1 contrato de claves, conjunto exacto (`facturacion`) | Con domicilio completo aparecen las tres claves geográficas. Era la única diferencia en el conjunto obtenido en el CI. | PRO-322-R05 | Detalle en el §2.7. | Ítems, subtotales, FormaPago y los 8 opcionales nulos se comprueban igual. Comprobación exacta (no por inclusión). |
| 11 | E1 contrato de claves, claves ausentes (`facturacion`) | Los códigos geográficos dejaron de ser siempre ausentes. | PRO-322-R05 | Detalle en el §2.8. | Las 11 claves AUD-FE-100 de cabecera, los 25 ausentes de ítem y la identidad/numeración (`cdc`, `dEst`, `dPunExp`, `dNumDoc`, `dSerieNum`, `dFeEmiDE`) siguen prohibidas. |
| 12 | EN-75 idempotencia del destino (`entrega-e04`) | La emisión ahora llama a `prepararFactura(..., { documentoExiste, domicilioHistorico: historico !== null })` después de leer el payload histórico (PRO-322-R02 F002). El caso buscaba la firma `{ documentoExiste }`. | PRO-322-R02 F002, PRO-328 | Detalle en el §2.9. | Destino no reexigido (`{ ok: true, opcion: null }`), sin nuevas bajas de stock (`!documentoExistente && lineasStock.some`) y sin escrituras en `direcciones_cliente`. Los casos de dirección editada/eliminada, UUID distinto, reintento equivalente y 409 de PRO328-* no se tocaron. **No se demostró defecto funcional.** |

## 2. Detalle de las modificaciones

### 2.1 Caso #2 — CDC literal en la consulta

- Se conservan literales `"123"` y `" 0123 "` (sin trim).
- `""` se trata como ausente.
- Un número, o un texto de más de 256 caracteres, da `null`.
- 256 caracteres se conservan.
- El estado APROBADO/RECHAZADO es el que informa la API.

### 2.2 Caso #3 — Domicilio del receptor por campo

- Domicilio parcial: rechazo nombrando cada campo.
  - Sin departamento → D219.
  - Sin distrito → D221.
  - Sin ciudad → D223.
  - Sin número → D218.
  - Sin calle → D213.
- Códigos no numéricos (`"Central"`, `"0"`, `"x1"`): se rechazan con D219, D221 y D223.
- Domicilio completo o totalmente vacío: valida sin errores.

### 2.3 Caso #4 — Recepción con solo CDC

- Un ACK con solo CDC da ENVIO_INDETERMINADO:
  - sin lote ni estado;
  - con `cdcInformado` literal.
- Con lote correlacionado da ENVIADO:
  - con el lote;
  - con el mismo CDC literal (`cdc` y `cdcInformado`).

### 2.4 Caso #5 — Geografía del receptor (AUD-FE-03)

- Nacional completo:
  - `cPaisRec` «PRY»;
  - `cDepRec`, `cDisRec` y `cCiuRec` = `[1,1,1]`, numéricos.
- Sin domicilio:
  - sin geografía;
  - `dDirRec` y `dNumCasRec` nulos.
- B2F:
  - sin geografía paraguaya;
  - `cPaisRec` «ARG», calle y número.
- Nunca aparecen `dDesPaisRe`, `dDesDepRec`, `dDesDisRec` ni `dDesCiuRec`.

### 2.5 Caso #6 — Lote con CDC de otra composición

- Lote con el CDC de otra NCE, o con «123»: ENVIADO, con el lote y el CDC literal.
- Número, punto o establecimiento devuelto distinto: indeterminado, sin lote atribuido.

### 2.6 Caso #9 — Selector de fecha de emisión

- Se exige un **único** `type="date"`: el de «Fecha de emisión», con `min`, `max` y `required`.
- La revisión muestra la fecha con `formatearFechaPy`.

### 2.7 Caso #10 — Conjunto exacto de claves por escenario

- Nacional completo = `CLAVES_CABECERA` + `cDepRec`, `cDisRec` y `cCiuRec`.
- Sin domicilio = `CLAVES_CABECERA` exactas.
- B2F = `CLAVES_CABECERA` exactas.

### 2.8 Caso #11 — Claves prohibidas por escenario

- Las claves prohibidas se comprueban en los tres escenarios.
- Se añaden las cuatro descripciones de localización (dDes*), que siguen prohibidas siempre.
- Se exige que los códigos geográficos estén **sólo** con domicilio nacional completo.

### 2.9 Caso #12 — Orden de la emisión (EN-75)

Se exige, en este orden:

1. La lectura de existencia.
2. `payloadHistorico`.
3. `prepararFactura` con `domicilioHistorico`.
4. `equivalente` → `ErrorFacturacion(409)`.
5. `payload = historico ? historico.payload : preparada.payload`, es decir, el snapshot persistido.
6. `receptorSeleccionado` sólo para una FE nueva.

## 3. Defectos funcionales

- No se demostró ninguno. Los 12 fallos eran expectativas obsoletas frente a reglas ya vigentes y auditadas:
  - PRO-342-R05;
  - PRO-322-R02/R05;
  - PRO-328;
  - PRO-294 / FE-V1-01;
  - D218.
- CORE-04 se resolvió con la opción A autorizada, sin modificar `emision.ts`. El comentario de `emision.ts` que dice que la lectura es «perezosa: después de las validaciones previas» sigue siendo inexacto desde PRO-322-R02. Queda anotado para una futura orden; no se corrigió porque es código funcional.

## 4. Limitaciones

- Nada se ejecutó. El resultado depende del CI de GitHub Actions.
- **Resultado esperado por el análisis:**
  - quedan corregidos 12 de los 14 fallos;
  - siguen fallando 2, fuera de alcance: PRO334-29 y el verificador C1.
  - T01 y C1 de la batería PG y el lint de la aplicación tampoco se tocan.
- **Riesgo de los casos nuevos:** los casos #2, #4, #5, #6, #10 y #11 comprueban comportamiento real de `interpretarConsulta`, `interpretarRecepcion` y `construirPayloadFE`. Se derivaron leyendo el código. Si un detalle no previsto difiere, por ejemplo el límite exacto de 256 caracteres o el `estadoGateway`, el CI lo mostrará como fallo de prueba, no como regresión funcional.
