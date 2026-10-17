# NEXIT V1 — Nota de Crédito Electrónica (NCE) · especificación funcional y técnica para implementación

**Estado:** REQUISITOS DE NEGOCIO CERRADOS, **IMPLEMENTACIÓN AUTORIZADA Y PENDIENTE**, **NO HOMOLOGADA**.  
**Propietario:** PROCEIT · **Fecha:** 2026-10-16 · **Linear:** [PRO-94](https://linear.app/proceit/issue/PRO-94/notas-de-credito-planificado).  
**Repositorio/branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`.  
**Jerarquía:** las reglas oficiales SIFEN + notas técnicas prevalecen sobre ejemplos; este documento fija decisiones de producto y criterios de aceptación. Los requisitos históricos de F-03 que marcaban NCE «pendiente de JSON» quedan superados por el ejemplo de **NCE Devolución emitida/aprobada con el mismo gateway** suministrado por el responsable el 16/10/2026. El documento previo de FE sigue siendo válido para FE y servicios compartidos.

## 1. Referencias obligatorias y prohibiciones

- Antes de escribir código: sincronizar branch oficial y leer **`CLAUDE.md`**, **`documentacao/PROTOCOLO-IA.md`**, `PROGRESSO-NEXIT-V1.md` (Facturación, PRO-129/131/133, FAT-E2), `documentacao/v1/REQUISITOS-FACTURACION-ELECTRONICA-API-EXTERNA-2026-10-12.md`, y las migrations/servicios reales de FE. Usar Manual Técnico SIFEN **v150** y NT aplicables **en `documentacao/referencias/sifen/`** y fuentes oficiales DNIT; no reemplazar el contrato real del gateway con un modelo de otra API.
- El responsable aportó en conversación un JSON real completo de NCE **aprobada** por ese gateway. Por privacidad, **no copiar el payload completo ni los datos del emisor/receptor a Git/Linear**, ni credenciales/tokens. **Estructura útil sanitizada**, ver sección 6. No afirmar que motivos 3/4/8 fueron observados en una NCE aprobada si la prueba lo hizo solo para el motivo 2: implementar los cuatro conforme manual/contrato, con validaciones específicas.
- Integración NCE se hace por **el gateway ya configurado** (autenticación existente, `POST /api/recepcion_de` y `POST /api/consulta_de` con `tipoDoc:"NCE"`), no por integración directa con SIFEN ni endpoints inventados.
- **Solo una VM con PostgreSQL real**, sin staging. Claude Code escribe/tests por mocks y versiona SQL incremental, rollback y procedimiento de operación; ChatGPT audita; **únicamente el responsable ejecuta/aplica en VM** después de autorización explícita. Nada de acceso remoto/SSH a las IAs, ni editar `.env` o ejecutar migraciones automáticamente. No modificar migrations ya aplicadas; numeración nueva después de verificar catálogo e historial. Mantener intacta emisión FE operativa.
- **No realizar más preguntas de negocio para iniciar esta implementación.** Lo definido abajo basta. Registrar hallazgos técnicos verificables y resolver por referencia oficial/tests; si un punto resulta estrictamente incompatible con SIFEN, aislarlo como bloqueo concreto con evidencia, sin presumir rechazo ni rehacer alcance.

## 2. Objetivo, UX y no-alcance

- **Facturación → Notas de crédito** (`/notas-credito`) abre **directamente** formulario de emisión, sin lista intermedia, sin borrador. Misma UI compacta en español Paraguay.
- Flujo: **buscar cliente** → listado automático paginado de facturas emitidas por NEXIT, aprobadas SIFEN, con saldo NCE disponible; orden fecha desc, búsqueda número/fecha/CDC → elegir factura → cargar snapshot de receptor, CDC, moneda, cambio y TODAS sus líneas → elegir motivo (según historial de la factura), sucursal/punto, ajustar cantidades o créditos, eliminar líneas, `Observación` opcional → **modal de revisión final** (factura+CDC, motivo, líneas, cantidades/valores, IVA, total, punto/NCE referencial) → confirmación → validación transaccional y reserva de número NCE → envío → navegación a **Documentos electrónicos** con el documento NCE y su estado.
- No crear pantallas duplicadas de histórico. `Documentos electrónicos` muestra FE y NCE con estados, intentos, consultas, CDC y acción `Corregir y emitir nueva` para rechazo definitivo. No editar NCE ya enviada.
- **No**: movimientos automáticos de Inventario, cuentas a cobrar/pagar, pagos, importaciones de facturas/NCE externas, borradores, solicitud de cancelación, nuevos motivos no aprobados, nuevas reglas de perfiles como subproyecto, monitor SIFEN específico ni cambios globales en escalonamiento de consultas de FE/NCE/otros DE. Mantener verificaciones normales de autorización de sesión/empresa/rama existentes; debatir permisos nuevos después.

## 3. Reglas de negocio (RN)

**RN-01 · Origen:** solo facturas `tipo=FE` **emitidas por NEXIT** (documento + solicitud original persistida), del cliente/empresa y sucursal en alcance, `estado_sifen=APROBADO` **y CDC confiable/valido**; `ENVIADO`/HTTP 200 de recepción no es aprobación. Consultar automáticamente las FE aún no confirmadas al buscar, con límites y sin llamadas N×listado ilimitadas. Si no es posible comprobar la aprobación, no seleccionar.

**Decisión específica MT-01 — 17/10/2026, alcance reducido expresamente por el responsable:** en la **pantalla de Notas de crédito**, al buscar clientes, **no permitir seleccionar un cliente Innominado** (tipo de documento de identidad SIFEN = `5`). Mantener visible el resultado con botón **«Seleccionar» deshabilitado** y una explicación breve en español, o excluirlo consistentemente de la lista sin romper paginación. Detectar el tipo mediante dato fiscal estructurado, **no por coincidencia de nombre**, RUC o texto de pantalla; ajustar solamente los datos necesarios de la búsqueda de clientes para que la interfaz conozca esa condición. **NO agregar por esta decisión una validación de bloqueo adicional al servicio de emisión TypeScript, al payload JSON, a la función `fe_documento_crear_nce` ni a la migration NEX-062.** No modificar las facturas FE ni los clientes maestros. Esta decisión define **únicamente una restricción de selección en interfaz**: no garantiza, por sí sola, que una llamada directa a la API de NCE sea impedida. Conservar ese riesgo explícito y no declarar validación fiscal integral lograda por el filtro visual. Pruebas dirigidas: cliente Innominado no seleccionable, cliente identificado seleccionable y paginación/listado/flujo NCE preservados.
  
**RN-02 · Lista:** paginación y filtros de número, fecha, CDC, más reciente primero. Ocultar facturas sin saldo susceptible de NCE. Mostrar factura aprobada con saldo pero con NCE pendiente/indeterminada como **`NCE pendiente` deshabilitada** (no ocultarla). Bloquear también al enviar aun si la pantalla se desactualizó.

**RN-03 · Asociación:** cada NCE se vincula a **una sola FE original** con su **CDC** en `DocumentosAsociados[0].dCdCDERef`; `iTipDocAso=1` en la muestra. No asociar otras FE ni crear CDC del original artificialmente. La NCE recibe su **propio** CDC del gateway/SIFEN y `iTiDE=5`.

**RN-04 · Motivos V1:** catálogo **2 Devolución**, **3 Descuento**, **4 Bonificación**, **8 Ajuste de precio** (nombres oficiales/códigos SIFEN). `iMotEmi` guarda el código. No habilitar 1/5/6/7 en UI V1.

**RN-05 · Motivo fijo:** el **primer motivo de una NCE APROBADA** fija permanentemente el motivo de futuras NCE asociadas a esa factura, **incluso si todas las NCE aprobadas se cancelan oficialmente después**. Antes de primera aprobación, NCE rechazadas no fijan. NCE pendientes/indeterminadas bloquean **toda emisión adicional**, del mismo u otro motivo, hasta resultado definitivo. Nunca mezclar motivos.

**RN-06 · Pluralidad:** una FE puede originar múltiples NCE **del mismo motivo** mientras quede saldo de cantidad/valor. Comprobar motivo e importes tanto en la consulta visual como **bajo lock transaccional/serialización al crear la NCE** para evitar simultaneidad.

**RN-07 · Estados y saldos:** NCE `APROBADO` consumen saldo; `RECHAZADO` definitivo no consume; `PENDIENTE`, `SIN_CONSULTA` tras recepción, `ENVIO_INDETERMINADO`, resultados desconocidos/errores de consulta **bloquean nueva NCE** hasta reconciliación. NCE oficialmente `CANCELADO`, confirmado por SIFEN/gateway, libera cantidad/valor pero no altera motivo histórico. Nunca inferir cancelación ni rechazo por falta de respuesta.

**RN-08 · Snapshot exacto:** cliente, identidad RUC/DV, razón social, dirección, país y campos fiscales originales de la FE **inmutables en la NCE**, aunque cambie el maestro. Toda línea usa el **snapshot persistido del payload FE emitido**, no catálogo vigente. No fusionar líneas repetidas: usar identificador estable **posición/ordinal de `Detalles[]` de la FE**, más documentoId. Llevar registro de qué línea original acreditó cada NCE.

**RN-09 · Detalles UI:** mostrar **todas** las líneas de la FE, incluso agotadas; cada línea muestra código/descripción, unidad, IVA, precio original, cantidad original, cantidad devuelta, cantidad disponible, valor original, valor ya creditado y saldo monetario. Líneas agotadas visibles **pero deshabilitadas**. Si la FE tiene mismo producto en dos filas con precios distintos, ambas siguen independientes.

**RN-10 · Devolución (2):** al cargar formulario precargar todas las **líneas disponibles** con su **cantidad máxima disponible**. El operador puede quitar cualquier fila y bajar cantidades (enteras/fraccionarias según unidad y precisión de la FE, estrictamente >0 y <=saldo). Unidad `cUniMed`, precio unitario original IVA incluido, `iAfecIVA`, `dPropIVA`, `dTasaIVA` y datos fiscales de cada línea **no editables**. Recalcular cada importe y el IVA en servidor desde valores históricos, nunca desde totales manipulados del browser. Sin stock automático.

**RN-11 · Descuento/Bonificación/Ajuste (3/4/8):** el operador selecciona líneas concretas (no descuento global ni porcentaje) y digita **un valor MONETARIO TOTAL a acreditar por línea con IVA incluido**; **no multiplicar por la cantidad de la FE**. Monto inicial cero, incluir solo líneas con monto >0, <=saldo monetario disponible, moneda de la FE. Cantidad original sirve como referencia, no se edita; no mover stock. Construir `Detalles[]` NCE conforme representabilidad y campos normativos/gateway para que el importe de línea sea exactamente el crédito (no heredar cantidad y aplicar el monto como precio unitario provocando multiplicación). Determinar una representación fiscal correcta de la NCE a partir de MT + contrato e implementarla con pruebas **para cada motivo**, sin inventar un ejemplo «ya aprobado» para motivos 3/4/8.

**RN-12 · Límite y conciliación:** nunca permitir `NCE_actual + NCE_previas_aprobadas > FE_original` en monto por línea o total. En Devolución además no exceder cantidades históricas de la línea, considerando NCE aprobadas y canceladas reconocidas. Redondeos exactos conforme FE/NT 13: cálculos server-side con decimales, conciliación `ΣDetalle = Subtotales`, IVA 5/10/exento/parcial y límites de precisión; PYG sin centavos en totales según motor FE existente. Ante diferencia no representable, bloquear antes de reservar número y mostrar error, no ajustar silenciosamente.

**RN-13 · Moneda/cambio:** `cMoneOpe` siempre la misma **PYG/USD/BRL** de la FE; campo no editable. Para USD/BRL copiar cambio original **sin edición**; validar legalidad con manual/NT antes de habilitar el envío de esos casos. No recalcular precios comerciales mediante cambio nuevo ni introducir diferencias de divisa.

**RN-14 · Fecha:** nueva fecha/hora del servidor en zona `America/Asuncion` al **emitir**; no editable. Fecha original de FE se conserva solo como referencia.

**RN-15 · Observación:** campo **opcional** `Observación`, enviar en `dInfAdic` con el contrato del gateway (validar tamaño/sanitizar texto); no reemplaza `iMotEmi`.

**RN-16 · Puntos compartidos, NO por tipo:** `001-001` se crea **una sola vez** y puede tener series independientes para FE, NCE, NDE, NRE, AFE. NEX-060 ya define `fe_punto_secuencias(empresa,punto,tipo_documento)`. La pantalla `Puntos de expedición` debe visualizar/configurar por **tipo dentro del mismo punto**: último/ próximo/ habilitación independiente, sin duplicar puntos ni sobrescribir FE. Para **NCE**, admin informa/confirma explícitamente último número realmente emitido (0 solo declarado si nunca emitió); nunca presumir 0, nunca retroceder ni reutilizar FE. NCE usa solo secuencia `NCE`, por punto permitido de la empresa/alcance. El punto original **no es obligatorio** para la NCE. Mantener identidades y locks de NEX-060.

**RN-17 · Resumen/final:** una confirmación explícita muestra número/CDC de la FE original, motivo, punto, moneda, líneas, cantidades o importes por línea, bases/IVA y total NCE. Sin borradores. Al confirmar, **revalidar la FE, saldos, motivo y inexistencia de NCE pendientes** con exclusión mutua de backend; reservar número fiscal NCE solo una vez y crear evidencia durable/idempotencia. Si falla preflight/validación, no consumir secuencia.

**RN-18 · Envío y estado:** reutilizar endurecimiento FAT-E2: login por empresa, `recepcion_de` NCE, almacenar solicitud inmutable, hash/idempotencia, número/respuesta/CDC, lote, HTTP/resultado, tentativas, bloqueo contra doble clic/envío inseguro; **HTTP 200 o lote no implica aprobación SIFEN**. Solo `consulta_de` con `tipoDoc:"NCE"` y CDC coherente actualiza aprobación/rechazo/cancelación. Errores de red, timeout o respuesta ambigua => indeterminada, **nunca reenviar a ciegas**.

**RN-19 · Documentos:** después del envío dirigir a `Documentos electrónicos`, con registro visible `NCE`, estados locales/fiscales, detalles, CDC, relación FE, motivo y auditoría. La consulta de NCE pendientes debe actualizar automáticamente sin clic manual; persistir estados e histórico.

**RN-20 · Consulta sin browser:** ejecutar consultas pendientes **del lado del servidor** con proceso/worker y pausas/retries controlados, aunque se cierre navegador. Al abrir FE para NCE, también consultar pendientes de la FE. Si mucho tiempo pendiente, etiqueta **`Requiere revisión`**, seguir consultando con menor frecuencia, NO liberar ni cancelar ni reenviar. **Cadencia escalonada y horizonte SIFEN de hasta 72 h serán definidos para TODOS los documentos en un proyecto común posterior**: no inventar ahora 30/60 minutos fijos ni crear dos planificadores incompatibles; preparar el mecanismo reutilizable, parametrizable y prudente. Si el proceso automático necesita infraestructura, versionar el runner/entrypoint seguro y verificar que funcione sin navegador, no simular que `setInterval` React sirve.

**RN-21 · Corrección:** NCE `RECHAZADO` definitivamente ofrece `Corregir y emitir nueva` en `Documentos electrónicos`; precarga los campos y detalle de esa tentativa **solo como nueva propuesta**, validando de nuevo FE/CDC/saldo/motivo. No edita ni elimina el DE rechazado ni reusa su número de modo incorrecto. No reenviar automáticamente.

**RN-22 · Cancelación:** no implementar solicitud de cancelación desde NEXIT en V1. Reconocer cancelación **solo oficialmente informada** vía consulta al SIFEN/gateway, liberar saldos en consecuencia, conservar histórico y motivo histórico fijado.

**RN-23 · Aislamiento y seguridad:** toda operación valida empresaId y usuario reales de sesión, alcance de sucursal, permisos **ya aplicables** según estándares del proyecto, FK compuestas/funciones SECURITY DEFINER con `search_path` restringido; las credenciales gateway jamás se envían al cliente. No convertir definición futura de perfiles en bloqueo de esta implementación, pero no abrir rutas sin autenticación/control.

**RN-24 · Operación:** nada de mover inventario, generar devoluciones físicas, cambiar cuentas por cobrar o pagar, pagos, saldo cliente comercial; NCE solo efecto fiscal y saldo creditable de FE.

## 4. Comportamiento previsto en formulario (español PY)

`Facturación > Notas de crédito`, cabecera sencilla: `Buscar cliente`, listado `Facturas aprobadas` con búsqueda/fecha/CDC y paginación, estado `NCE pendiente`, elegir FE; `Factura original` número + CDC + fecha + moneda/cambio solo lectura, `Motivo` (4 opciones, bloqueado por historial), `Punto de expedición` (solo puntos activos con secuencia NCE confirmada), `Observación` opcional, tabla de `Productos y servicios` con columnas originales/creditadas/saldo y control por tipo, botón quitar línea, totales exentos/5/10/IVA/total y `Emitir Nota de Crédito` con modal de confirmación. No exponer selección de tipo de documento por punto como creación de puntos separados. Facturas sin saldo quedan fuera de esta búsqueda, no del histórico.

## 5. Modelo/serialización/servicios: instrucciones de implementación

- **Reutilizar** `documentos_electronicos`, `documento_electronico_solicitudes`, intentos y consulta, gateway, permisos/sesión y UI de FE; crear **solo estructura incremental necesaria** para relación NCE→FE, motivo histórico irreversible, tracking de línea original, cantidad y monto acreditados. Diseñar integridad/concurrencia **en BD**, evitando doble crédito con 2 peticiones/instancias simultáneas. Un documento NCE cancelado sigue siendo registro histórico; el motivo histórico no debe perderse. No mutar snapshot ni registros anteriores.
- **Original FE:** obtener detalles y receptor **de la versión efectivamente enviada** en `documento_electronico_solicitudes.payload` (ver contrato real, no inferir esquema), no de productos; validación lado servidor de identidad/alcance/CDC/APROBADO.
- **Emisión NCE:** adaptar patrón `lib/facturacion/emision.ts`, `lib/facturacion/envio.ts`, `lib/facturacion/gateway.ts`, `lib/facturacion/payload-fe.ts` con un `payload-nce` propio, NCE `iTiDE:5`, `DocumentosAsociados` y `iMotEmi`; compartir calculadora decimal e infraestructura de consulta/envío si es seguro; no renomear ni quebrar contrato FE.
- **Puntos:** `lib/facturacion/puntos.ts`, APIs `/api/facturacion/puntos` y tela `/facturacion/puntos`: administrar secuencias por tipo en **el mismo punto**; manter FE atual. Usar uma função SQL nova/ajustada versionada para confirmar último NCE e habilitá-la; validações fiscais e locks.
- **Rutas:** `/notas-credito` (formulario); APIs de catálogo FE/clientes, detalle/saldos, emisión NCE y consulta/historial necesarias, siguiendo patrones de auth/errores. Activar `/notas-credito` en `V1_HREFS` únicamente cuando formulario y APIs realmente estén implementados.
- **Estado/worker:** integrar un mecanismo **server-side** de consulta por lotes de documentos pendientes, con control de rate limit/backoff, persistencia de próxima consulta y marca de en vuelo/lease para despliegues con más de una instancia. Documentar configuración operativa y runner sin ejecutar nada. **Cadencia global exacta para FE/NCE/otros queda separada**; implementar comportamiento NCE sin inventar umbrales como verdad normativa.
- **Migration:** crear siguiente `NEX-...` incremental luego del mayor código disponible; `rollback` defensivo + caso SQL (transaccional en BD descartable, **no ejecutar pruebas que crean clientes/empresas ficticias en BD real**) + runner/operación humana documentada. **No editar migrations aplicadas**; ver `schema_migrations` solo cuando el humano ejecute verificación en VM; la existencia del script no prueba aplicación.
- **Implantación:** Claude solo commitea/pushea; ChatGPT audita; el responsable ejecuta el procedimiento autorizado y prueba el sistema único. No requerir al responsable redactar SQL, editar `.env`, armar manualmente archivos o dar acceso SSH.

## 6. Contrato NCE: forma sustentada por ejemplo aprobado (sanitizado)

Ejemplo de **estructura** (NO copiar valores reales de emisor/receptor ni inventar CDC o reportar este ejemplo reducido como «enviado/aprobado»):

```json
{
  "iTiDE": 5,
  "iMotEmi": 2,
  "dEst": "002",
  "dPunExp": "001",
  "dNumDoc": "0043982",
  "dFeEmiDE": "2026-10-08T17:59:02",
  "cMoneOpe": "PYG",
  "DocumentosAsociados": [
    {
      "iTipDocAso": 1,
      "dCdCDERef": "<CDC_DE_LA_FACTURA_ORIGINAL>"
    }
  ],
  "Detalles": [
    {
      "dCodInt": "CODIGO_DE_EJEMPLO",
      "dDesProSer": "Producto de ejemplo",
      "cUniMed": 885,
      "dCantProSer": 2,
      "dPUniProSer": 10000,
      "dTotBruOpeItem": 20000,
      "dTotOpeItem": 20000,
      "iAfecIVA": 1,
      "dPropIVA": 100,
      "dTasaIVA": 10,
      "dBasGravIVA": 18181.81818182,
      "dLiqIVAItem": 1818.18181818,
      "dBasExe": 0
    }
  ],
  "Subtotales": [{"dTotGralOpe": 20000}],
  "dInfAdic": "Observación opcional"
}
```

**ATENCIÓN:** acima é *recorte parcial ilustrativo de campos* para desenvolvimento, não payload completo aceito; campo `Subtotales` foi resumido deliberadamente. O modelo real fornecido pelo responsável tinha `iTiDE=5`, `iMotEmi=2`, `DocumentosAsociados[0].iTipDocAso=1`, `dCdCDERef`, `Detalles[]` con precios/unidades/IVA, `Subtotales[]`, receptor fiscal, moneda y campos del emisor. No payload real, **o dInfoEmi/dInfoFisc são específicos da emissão original e não podem ser copiados para a nova NCE**. Alguns campos podem ser completados pelo gateway; seguir o contrato FE já validado ao decidir o que o NEXIT preenche.
- Valorar bien **3/4/8:** mismo endpoint y campos estructurales, `iMotEmi` según motivo, pero las partidas representan valores de crédito por línea sin multiplicar por cantidad original. Construir representación fiscal válida (nodo `Detalles`, cantidades unitarias/importe) desde Manual/NT y testear con proveedor en la futura operación humana, sin fingir validación real anterior de 3/4/8. No bloquear la preparación/codificación por falta de otro JSON.

**Referência SIFEN e fronteira de responsabilidades:** DNIT, [Manual Técnico Versión 150](https://www.dnit.gov.py/documents/20123/420592/Manual%2BT%C3%A9cnico%2BVersi%C3%B3n%2B150.pdf/e706f7c7-6d93-21d4-b45b-5d22d07b2d22?t=1687351495907). O grupo XML `gCamNCDE` (E400) e **todos os grupos do XML SIFEN** (incluindo documento associado) são montados **pelo gateway, não pelo NEXIT**. O contrato **JSON de entrada** comprovado pelo exemplo real aprovado contém os **códigos** `iTiDE=5`, `iMotEmi`, `DocumentosAsociados[0].iTipDocAso=1` e `dCdCDERef`, além dos campos comerciais/fiscais de detalhe e totais, mas **não envia** `gCamNCDE`, `gCamDEAsoc`, `dDesMotEmi` nem `dDesTipDocAso`. Não adicionar grupos XML, descrições ou novas chaves ao JSON sem contrato explícito do gateway; a ausência desses campos é **correta**, não falha ou bloqueio da API.

## 7. Critérios de aceite (CA)

**CA-01.** Menu ativo apenas com formulário + API funcionais; formulário abre direto e histórico permanece em `Documentos electrónicos`.  
**CA-02.** Busca por cliente + facturas NEXIT/empresa/sucursal autorizadas com `APROBADO`, CDC válido, saldo>0, filtros/paginação; tentativa sem CDC/reconciliação bloqueia.  
**CA-03.** FE com NCE pendente/indeterminada visível com `NCE pendiente`, seleção desabilitada; atualização automática do estado.  
**CA-04.** Snapshot FE real e original; alterações posteriores em cadastro não modificam receptor/item/IVA/preço da NCE.  
**CA-05.** Repetição de produto preserva linhas independentes com identificador ordinal.  
**CA-06.** Devolución precarga saldos e permite remover/reduzir quantidades, inclusive fração válida; preço/unidade/IVA imutáveis.  
**CA-07.** Descuento/Bonificación/Ajuste aceitam apenas crédito **monetário por linha, IVA incluído**, sem percentuais e sem multiplicar pela quantidade da FE.  
**CA-08.** Motivo fixado pelo primeiro **APROBADO** e persistente mesmo após cancelamentos; rejeição não fixa.  
**CA-09.** Uma FE recebe múltiplas NCE mesmo motivo, nunca créditos superiores a quantidade/valor original.  
**CA-10.** Qualquer NCE pendente/indeterminada bloqueia novas emissões da FE; SQL protege contra duas requisições simultâneas.  
**CA-11.** Cancelamento SIFEN confirmado libera saldo sem apagar histórico nem soltar motivo histórico.  
**CA-12.** NCE escolhe um ponto existente e sequência `NCE` confirmada, independente FE, sem duplicar ponto, exige último real por tipo.  
**CA-13.** Moeda da FE e câmbio original estrangeiro preservados; se norma inviabilizar combinação, erro validado antes da numeração.  
**CA-14.** Data/hora emissão Paraguai do servidor; `Observación` opcional em `dInfAdic`.  
**CA-15.** Modal final antes de reservar; validação servidor e idempotência de documento completo, falha prévia não consome sequência.  
**CA-16.** `iTiDE=5`, `iMotEmi`, associação do CDC original e `Detalles/Subtotales` conciliados; CDC da NCE independente; testes de motivo 2/3/4/8.  
**CA-17.** Pós-envio → `Documentos electrónicos`; HTTP 200 não marca `APROBADO`; consulta `tipoDoc=NCE` registra evidência.  
**CA-18.** Consulta automática em servidor funciona sem navegador e respeita falhas/rate limits; `Requiere revisión` sem afirmar rejeição; cadência completa global futura.  
**CA-19.** Rejeitada tem `Corregir y emitir nueva`, com histórico imutável e revalidação integral antes de nova emissão.  
**CA-20.** Nenhum lançamento em estoque/financeiro; histórico rastreável e restrição de tenant.  
**CA-21.** SQL/migration/rollback/runner versionados para operação humana; **NÃO aplicados** pela IA.  
**CA-22.** Regressões direcionadas da FE, FAT-E2, Puntos, status SIFEN, numeração, segurança/tenant e NT13 passam em testes honestamente executados.  
**CA-23.** Auditoria técnica independente após push, antes de qualquer indicação de implantação/homologação.

## 8. Casos de teste necessários (seleção mínima orientada)

- FE aprovada 5 linhas: devolver uma integral + parte de outra e remover 3; soma/IVA exatos e CDC associado.
- FE com mesma SKU em duas linhas com preços/IVA distintos: não agregar, duas contas independentes.
- Quantidade 10 → NCE 3 (aprovada) → outra NCE 4 (aprovada) → saldo 3; tentar 4 reprova antes de reservar número.
- Descuento de 20.000 e novo Descuento de 10.000 na mesma linha; testar número e IVA 10%/5%/exento/parcial; não multiplicar por qtd.
- Primeiro motivo aprovado 2, tentar 3/4/8: 409; primeiro 3, tentar 2/4/8: 409; motivo histórico permanece fixo após cancelar todas.
- Primeira NCE rejeitada libera saldo e não fixa motivo; NCE pendente/indeterminada impede outra de qualquer motivo; timeout e ausência documento não marcam rejeição.
- Dois requests ao mesmo tempo, tenants A/B e usuários com/sem alcance; impossibilidade de duplo crédito nem dupla reserva de número por idempotência.
- Cancelamento confirmado de NCE aprovada devolve quantidades/valores, sem excluir doc.
- Ponto 001-001: FE último 125 / NCE último 7; emitir NCE 8 preserva FE 125; NCE sem último número confirmado não emite; sem novas filas de pontos duplicados.
- Facturas `SIN_CONSULTA` no listado: consulta segura e desbloqueio somente ao receber APROBADO com CDC; sem chamadas desenfreadas.
- USD/BRL original: manter moeda/câmbio/precisão; caso proibido por regra fiscal bloqueado antes de número.
- Enviar→documentos, lista NCE, consulta NCE mesmo com navegador fechado, sem reenvio; rejeitada → `Corregir y emitir nueva` com revisão, sem sobrescrever original.
- Controlar erro por faltar migration sem devolver segredo, histórico e rollback não destrutivo.
  
## 9. Entrega de Claude Code

**Implementar V1 de ponta a ponta**, sem novas perguntas funcionais. Usar commits claros na branch oficial, migrations incrementais, rollback, testes e procedimento operacional versionados. Rodar **testes dirigidos e regressões relacionadas**, não suites globais desnecessárias; não executar PostgreSQL real/VM/Docker operacional/gateway real. **Parar após commit/push** e informar SHA integral, arquivos tocados, número de migration, casos testados e limitações reais para a **AUD-PRO94-NCE-R01** de ChatGPT. **Sem alegar homologação**.
