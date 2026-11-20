# PARECER INDEPENDIENTE — PRO-342-D01 / Flujo fiscal integral CASA MINGO

**Fecha:** 11/11/2026
**Issue:** [PRO-342](https://linear.app/proceit/issue/PRO-342) · [GitHub #19](https://github.com/proceit-tech/distribuidora/issues/19)
**Informe Claude citado por el usuario:** `PRO-342-D01-auditoria-fiscal-integral-casa-mingo.md`, **no adjuntado ni publicado en la rama ni accesible en Linear/comentarios/archivos consultados**. El responsable informó que fue solo lectura, sin commit ni ejecución. **No afirmar que se auditó el documento completo**.
**Fuentes efectivamente examinadas:** resumen del D01 aportado por el responsable, capturas de NEXIT y del portal del proveedor, código fuente de la rama `feature/NEXIT-2026-001-banco-demo` y SQL versionada NEX-047/050/054/061/063/069/077, además de la auditoría P0 ya publicada `AUD-NEXIT-P0-FLUJO-FISCAL-INTEGRAL-ENVIO-CONSULTA-KUDE-2026-11-11.md`.
**Método:** revisión exclusivamente estática. **Sin test, SQL, lectura de producción, VM, llamada al gateway, deploy o modificación de estados fiscales**.
**VEREDICTO:** **APROBACIÓN PARCIAL DEL DIAGNÓSTICO ESTÁTICO; CAUSA-RAÍZ OPERATIVA NO HOMOLOGADA.** Requiere pruebas históricas de solo lectura por operador autorizado y confirmación del proveedor antes de autorizar correcciones o reenvíos. PRO-338-R06 suspendida; PRO-340 bloqueada.

## 1. Hallazgos confirmados por código y capturas

1. **Saneamiento global anterior es defectuoso.** Antes de R03, `sinSecretos` sustituyó literalmente contraseñas en todo `JSON.stringify` del resultado interpretado. Si la contraseña coincidía con una subcadena de CDC o lote, el valor operacional podía convertirse en `[omitido]`. Las capturas actuales muestran lote `[omitido]-1-001-001-0000001-20261111091028-793231042` y CDC local NULL + `CDC_DIVERGENTE`. Esto **hace plausible** que la sanitización explique ambos; no demuestra por sí sola que el ambiente operativo tuviera ese código ni que la subcadena correspondiese realmente a la contraseña.
2. **KuDE de otro emisor — defecto visible y ausencia de correlación en código.** Bajo título NEXIT `001-001-0000001 (AA)` se mostró PDF de DISTRIBUIDORA DEL PARAGUAY S.A. en vez de CASA MINGO S.A. `gateway.ts::interpretarKude` solo comprueba `status:success` + Base64/PDF válido (cabecera/EOF); ignora `CDC` de la respuesta y no valida RUC, serie, número ni emisor PDF. `shared.ts::obtenerKude` sí toma identidad persistida del documento seleccionado y envía `dSerieNum` al gateway, por lo que el riesgo se encuentra en la respuesta/correlación/proveedor o credencial histórica; ninguna fuente demuestra aún cuál de esas causas se dio.
3. **El envío registra intentos e historial.** `NEX-050::fe_documento_registrar_envio` inserta `ENVIO` y actualiza `estado_local/lote`; `NEX-054::fe_documento_registrar_consulta` inserta `CONSULTA` incluso cuando queda `CDC_DIVERGENTE`, pero no consolida estado fiscal inválido. Esto es control de integridad, NO ausencia total de persistencia. El problema radica en fidelidad del CDC/lote, correlación de origen y visibilidad del resultado bruto/estado final.
4. **Contexto de envío incompleto:** `documento_electronico_intentos` no conserva una instantánea inmutable de `base_url`, usuario API efectivo, `credenciales_version` y destino por intento. `fe_gateway_config_log` guarda cambios, pero no está vinculado inequívocamente con cada POST. Una prueba `/api/login` correcta a las 09:17 no certifica el intento de las 09:10.
5. **`XML firmado` ≠ SIFEN aprobado.** `estados.ts::estadoSifenDesdeGateway` admite sólo valores exactos Aprobado, Rechazado, Cancelado, Inutilizado, Pendiente; `XML firmado` → `NO_RECONOCIDO`. Es correcto preservar el texto bruto del gateway y distinguirlo de un estado final. Si el intento resulta `CDC_DIVERGENTE`, SQL deja el principal `SIN_CONSULTA`, aunque sí hubo consulta técnica. La UI requiere claridad de los DOS ejes.
6. **Coherencia de CDC insuficiente para emisores que colisionen:** TS `cdcCoherente` y SQL `fe_cdc_coherente` comprueban tipo/establecimiento/punto/número, pero no identifican el **RUC del emisor** del CDC contra la identidad fiscal del tenant. Una identidad externa de mismo EEE-PPP-NNNNNNN podría pasar esta comprobación parcial. DV y fecha tampoco son comprobados; necesidad y fuente temporal exacta deben definirse según contrato fiscal antes de bloquear documentos válidos. No generar ni corregir CDC, solo validar el de la API.
7. **Worker no probado en producción:** código `instrumentation.ts` + `consulta-automatica.ts` prevé tick ~60 segundos y requiere funciones NEX-077 (lease). La existencia de código o comentario SQL de estado `NO aplicada` no demuestra estado de DB ni ejecución VM.

## 2. Conclusiones D01 que aún son HIPÓTESIS

| Afirmación | Evaluación |
|---|---|
| «VM ejecuta código anterior a R03–R05» | **NO PROBADO** por lectura de repositorio o captura. Exigir SHA/identificador del artefacto realmente desplegado y configuración del proceso; Claude no dispone de acceso VM. |
| «La contraseña API es exactamente RUC» | **HIPÓTESIS PLAUSIBLE**, porque el prefijo del lote está saneado. La captura muestra usuario API numérico, no la contraseña. Confirmar solo por comparación booleana en entorno autorizado, sin imprimir, exportar ni publicar clave. |
| «El gateway `https://gateway.e-factura-hub.com` es ambiente de TESTE» | **NO DEMOSTRADO**. El código llama `URL_GATEWAY_PRUEBA` al valor y un comentario dice endpoint de test, pero nombre/comentario NO prueban cuenta/ambiente del proveedor; confirmar con soporte o documentación específica del tenant. |
| «Las cuatro FE anteriores fueron rechazadas» | Captura del portal indica rechazo y retorno 1101, pero no ha sido cotejada con los intentos guardados y documentos exactos. |
| «La nueva FE no existe en el proveedor» | **NO COMPROBADO**: el portal tenía `Ocultar pendientes` marcado, además de filtros; `XML firmado` no es resultado final. |
| «La misma causa explica el lote y el CDC_DIVERGENTE» | **CAUSALIDAD PLAUSIBLE**, no confirmada sin `i.respuesta`, `i.cdc_informado`, código desplegado y estado SQL real. |
| «El envío usó credenciales o host antiguo» | **NO PROBADO**. Se requiere correlacionar historial de config y provedor; quizá los registros actuales no permitan identificar destino exacto histórico. |

## 3. Riesgos y decisiones de arquitectura

- **INMUTABILIDAD CDC**: la API es la única fuente. NEXIT no envía CDC en consulta, no lo inventa/reconstruye/reemplaza ni modifica en datos fiscales. CDC válido de primera respuesta puede fijarse tras correlación completa, y un CDC diferente al ya registrado nunca se sobrescribe automáticamente.
- **FIDELIDAD LOTE**: guardar lote original recibido de la API en campo operacional protegido; **NUNCA** sustituir parte por `[omitido]` antes de persistencia. Los destinos de logs/UI pueden minimizar/redactar solo copias etiquetadas, sin falsear el valor original almacenado. Si contraseña coincide con RUC público, evaluar rotación de credencial del proveedor con autorización operativa separada, sin revelar clave ni alterar documento.
- **CHECK EMISOR**: validar RUC/DV del CDC desde fuente fiscal confiable de empresa/establecimiento y contrato proveedor, no desde credencial de login por suposición. Validación fecha/dígito final, si se incorpora, debe respetar la estructura SIFEN oficial y fecha pertinente (emisión vs firma), evitando falsos rechazos.
- **CORRELACIÓN DE ENVIO**: tener identidad de tenant, gateway efectivo, versión de config, usuario API no secreto, hash/ID del JSON, timestamp, HTTP, ACK, lote exacto, respuesta y request correlation. Evitar declarar `ENVIADO` ante ACK de otro emisor/serie. `ENVIADO` significa recibido por el gateway, NO aprobado SIFEN.
- **CONSULTA Y HISTÓRICO**: separar ultimo intento bruto, resultado técnico y estado fiscal validado; documentar transiciones intermedias como `XML firmado`; persistir todos los intentos con errores/códigos/fechas e identidad, sin usar HTTP 200 como aprobación; garantizar que `RECHAZADO` y `APROBADO` solo se consolidan con identidad fiscal comprobada.
- **KUDE**: no entregar un PDF ajeno como propio. Un PDF sintácticamente válido NO demuestra emisor. Preservar PRO-326 (permitir KuDE legítimo sin CDC/estado APROBADO), pero exigir correlación de titularidad usando contrato proveedor/metadata verificable; si no se puede validar, informar incertidumbre en lugar de mostrar PDF ajeno bajo título CASA MINGO. No modificar PDF ni usar OCR heurístico como prueba fiscal.
- **Seguridad**: no mostrar claves/tokens/CDC completos em logs, UI general, issues ou SELECT compartilhado; não coletar senha para auditoria. Não executar chamadas reais ao provedor sem autorização.

## 4. Evidência faltante antes de aprovar correção funcional

**Apenas o OPERADOR autorizado pode obter, por leitura; Claude NÃO executa:**
1. SHA/build efetivo da aplicação em VM no incidente + migrations NEX-050/054/061/063/069/077/078 realmente aplicadas.
2. `documentos_electronicos` + `documento_electronico_solicitudes` da FE `001-001-0000001 (AA)`, campos de identidade/serie, hash do JSON; outras 4 FE para comparação.
3. Tentativas `ENVIO` e `CONSULTA`: horários, HTTP, lote (ou marcadores longitud/corrupção), estado gateway bruto, código/mensagem, CDC informado (marcadores sem expor valor completo), sinal de `[omitido]` em valor fiscal, e histórico por documento.
4. `fe_gateway_config` actual e `fe_gateway_config_log` entre 08:45–10:00 local, usuário API/versão sem senha; cruzar com evidência do gateway sobre conta realmente receptora 09:10, lote e série `AA`. Histórico SQL isolado pode ser insuficiente.
5. Fornecedor: confirmar ambiente (teste/produção), autorização e conta do login, correlação real do lote, retorno fiscal, e porque `/api/kude` para CASA MINGO `001-001-0000001 (AA)` devolve PDF de DISTRIBUIDORA. Desmarcar `Ocultar pendientes` e considerar filtros.
6. Logs do worker + existência das funções NEX-077 e flags operacionais, somente por leitura.
7. **O documento integral `PRO-342-D01-auditoria-fiscal-integral-casa-mingo.md`** para auditar afirmações, SQL e proposta de correção linha a linha. Foi declarado finalizado mas não disponibilizado nas fontes do auditor.

## 5. Parecer e gate

- **D01 — aprovação parcial do diagnóstico estático**, com ressalva de que o arquivo Claude não foi auditado integralmente e várias atribuições causais permanecem hipóteses.
- **NÃO** autorizar por esta auditoria mudanças de código, SQL/migrations, configuração gateway, senha, série, lote, CDC, estados fiscais, worker, emissão/reenvio/cancelamento, consultas gateway, testes executados nem deploy.
- Manter CASA MINGO sem novas emissões até conferir o incidente e identidade/provedor. **PRO-338-R06 em espera; PRO-340 bloqueada**.
- Próximo marco: operador executa **apenas SELECTs de leitura já preparados**, com aprovação explícita, e obtém resposta do fornecedor sem reenvio; o relatório completo D01 é disponibilizado. Depois realizar auditoria documental integral e emitir **UMA ORDEM INTEGRAL DE CORREÇÃO** com critérios de aceite e homologação real.
