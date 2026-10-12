# NEXIT V1 — Requisito FACTURACIÓN: documentos electrónicos, factura manual y notas de crédito

**Estado:** especificación aprobada para preparación de desarrollo por solicitud del responsable, **NO implementada ni homologada**. Fuente: 8 capturas de interfaces/ejemplos API y payload JSON completo FE aportados el 12/10/2026, más decisiones/versiones actuales del GitHub. **No se incluyeron contraseñas, bearer tokens, ni datos personales del payload real.** Las imágenes originales fueron adjuntadas en la conversación con ChatGPT; no están subidas como binarios a este commit. No afirmar que existan capturas versionadas.

## 0. Lectura obligatoria y alcance

Antes de implementar, Claude debe sincronizar `feature/NEXIT-2026-001-banco-demo`, leer `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, porciones pertinentes de `PROGRESSO-NEXIT-V1.md` y este requisito. Confrontar el código/DDL existente (clientes, productos, impuestos, monedas, unidades SIFEN, sucursales, expedición, sesiones, roles, empresa, archivos), la NEX-046 todavía no homologada y `documentacao/v1/homologacao-visual/CONTRATO-INTEGRACION-MOVIMIENTOS-DOCUMENTOS-V1-2026-10-12.md`. No crear módulos automáticos de inventario, no editar migrations aplicadas, no desplegar ni ejecutar SQL en la VM. Mantener formularios compactos/actuales del Nexit en español PY, no reproducir defectos visuales del sistema externo.

## 1. Decisión de navegación

Grupo **FACTURACIÓN**, orden visible:
1. `Documentos electrónicos` → `/documentos`: TODOS los tipos emitidos por la empresa, estado SIFEN, e-mail, acciones PDF/XML, búsqueda, detalle, historial.
2. `Facturas` → `/facturas`: entrada directa al formulario de nueva factura electrónica manual (o ruta coherente `/facturas/nueva` mediante enlace directo, nunca un listado en lugar del formulario sin aprobación).
3. `Notas de crédito` → `/notas-credito`: vista propia y preparación del formulario que requiere documento original y sus reglas. La emisión completa de NC depende de su ejemplo JSON/contrato aún no proporcionado y NO se presume igual a Factura.

No activar aún `Notas de remisión`, `Monitor SIFEN` como pantallas distintas ni demás tipos solo porque existan entradas antiguas en `lib/navigation/menu.ts`. Los documentos de remisión, débito, autofactura y otros recibidos sí aparecen por tipo en Documentos electrónicos. Exponer únicamente rutas con página/API funcionales y permisos reales. Preservar grupo existente, permisos `FACTURACION_ELECTRONICA.*` si existen; comprobar seed y SQL y proponer migration incremental si faltan.

## 2. Mapa de las ocho capturas proporcionadas

| Ref | Pantalla aportada | Componentes y comportamiento para implementar |
|---|---|---|
| IMG-01 | `image(20261012-163628).png` — Documentos Electrónicos, resumen y filtros | Cabecera; filtros por lote, sucursal, fecha emisión/rango, fecha firma/rango, estados aprobado/rechazado/pendientes, reprocesos, envío a SIFEN, respuesta SIFEN, cancelados/inutilizados; tipos FE/NCE/NDE/NRE/AFE; búsqueda, indicadores separados de SIFEN y e-mail, listado con acciones e íconos de estados. Simplificar en Nexit manteniendo semántica. |
| IMG-02 | `image(20261012-163752).png` — fila expandida | Detalle por documento: Nro lote, CDC, fecha firma, último mensaje SIFEN y estado, eventos. Expandir o ficha de detalle con intentos cronológicos y referencias. |
| IMG-03 | `image(20261012-163826).png` — formulario factura superior | Cabecera: sucursal, descripción, punto expedición, secuencia, fecha, moneda, condición operación, tipo transacción, presencia e información adicional; cliente: naturaleza, tipo contribuyente, RUC/DV o identificación, razón social, dirección, contacto, caja; excepciones de exportación y contratación pública **FUERA de alcance**. |
| IMG-04 | `image(20261012-164006).png` — detalle factura y subtotales | Ítems buscados desde Productos, descripción, afectación IVA, tasa, unidad SIFEN, cantidad, precio, subtotal; pago; cálculos exento/5%/10%, bases, IVA, total; botones Guardar/Cancelar. El precio y impuesto requieren trazabilidad desde el catálogo y reglas vigentes. |
| IMG-05 | `image(20261012-164103).png` — autenticación Postman | POST `https://gateway-bebidas-py.e-factura-hub.com/api/login`, body JSON con `ruc` y `password`; respuesta observada 200 `{"status":"success","token":"…"}`. **Credenciales y JWT no copiar en Git ni respuesta de Claude.** |
| IMG-06 | `image(20261012-164153).png` — recepción Postman | POST `https://gateway-bebidas-py.e-factura-hub.com/api/recepcion_de` con Bearer Token. No hay en esa captura una respuesta de envío completa verificable; confirmar contrato del request/response antes de afirmar recepción o aprobación. |
| IMG-07 | `image(20261012-164618).png` — consulta negativa | POST `https://gateway-bebidas-py.e-factura-hub.com/api/consulta_de`: JSON muestra `dEst`, `dPunExp`, `dNumDoc`, `dSerieNum`, `tipoDoc`; 400 `status:error` / «Documento no encontrado». Manejar sin fingir rechazo fiscal. |
| IMG-08 | `image(20261012-164852).png` — consulta exitosa | POST mismo endpoint, consulta devuelve 200 `status:success`, `response.Estado:Aprobado`, `FechaRegistro`, `DE.CDC`, `FechaFirma`, `FechaEnvio`, `Retorno.CodRespuesta:0260`, `Retorno.Mensaje:Aprobado`, `Evento:[]`. No asumir que todas las respuestas tienen idéntica forma. |

Capturas sirven para **semántica y campos**, no copiar diseño obsoleto, colores, exceso de filtros ni tipografía microscópica. Priorizar claridad y responsividad (375 / 768 / desktop).

## 3. Flujo funcional de Factura manual

A) Usuario con permiso abre FACTURACIÓN → Facturas → formulario. B) Nexit obtiene sucursales, puntos de expedición, numeración/timbrado vigentes, moneda, configuración fiscal, clientes y productos **de su empresa, sesión y alcance**; no hardcodear RUC emisor, serie ni lote. C) Usuario escoge sucursal/P. expedición, condición contado/crédito, tipo de transacción, presencia, fecha válida, cliente y líneas. D) Elegir cliente autocompleta naturaleza, tipo contribuyente, RUC sin DV, DV, nombre, dirección, teléfono, e-mail y validación SIFEN según su configuración; no inventar valores obligatorios si faltan datos. E) Productos toman código interno, GTIN, descripción, unidad de medida SIFEN existente, precio, cantidad, IVA y afectación, conversión/factor según catálogo real. F) Motor de cálculo determina bruto, descuento si corresponde, exento/exonerado/5/10, base gravada, líquido IVA, total y pago; backend recalcula y valida independientemente del cliente. G) Al confirmar: construir payload del contrato externo, persistir solicitud durable + clave idempotente, autenticar en servidor, enviar a recepción, persistir HTTP/cuerpo/respuesta con datos secretos filtrados, guardar CDC/número/estado si provistos, consultar estado si la API lo requiere; ver documento en lista. H) Errores de red/timeout no deben provocar segundo documento por reenvío ciego: primero reconciliar consulta/identificador/CDC y contemplar estado indeterminado. I) PDF/KuDE y XML firmado mediante endpoints de proveedor **por confirmar**; guardar contenido/referencia en almacenamiento persistente existente y proteger acceso por empresa/permiso, no inferir rutas de descarga. J) No prometer correos automáticos: separar estado de email y definir fuente real.

**Exclusiones explícitas ahora:** exportación, contratación pública, flujos de compras/remisiones, factura automática por ERP externo, notas de crédito completas sin payload propio, efectos físicos de stock automáticos, integración directa Nexit→SIFEN reemplazando el gateway.

## 4. Payload FE: mapeo basado en ejemplo real aportado (no representa por sí solo toda la obligatoriedad legal)

El JSON FE válido proporcionado por el responsable tiene `iTiDE:1`, campos de cabecera, receptor, pago, `Detalles[]`, `Subtotales[]`. Mantener nombres exactos y tipos compatibles **con el contrato probado del gateway**, sin renombrarlos. **Importante:** el JSON aportado parece ser un documento *ya emitido* con CDC, número, fechas y sumas. Claude debe verificar cuáles campos necesita `recepcion_de` para crear uno nuevo: no presumir que el CDC se fabrica en la UI ni que el mismo JSON de lectura es necesariamente el contrato de escritura.

| Área origen Nexit | Claves JSON ejemplificadas | Regla |
|---|---|---|
| Identidad y numeración | `cdc`, `dInfoEmi`, `dInfoFisc`, `dEst`, `dPunExp`, `dNumDoc`, `dSerieNum`, `dFeEmiDE`, `iTiDE` | `iTiDE=1` para FE. Numeración/CDC/fecha de emisión se originan bajo reglas reales de timbrado/proveedor; no inventar ni reutilizar CDC del ejemplo. Serialización de `null` conforme proveedor. |
| Tipo de operación | `iTipTra`, `iTImp`, `cMoneOpe`, `dCondTiCam`, `dTiCam`, `iIndPres`, `dFecEmNR` | Derivar de selecciones y catálogos fiscales; `PYG` cuando moneda guaraní; 1/2/3/4/etc solo según códigos documentados. |
| Datos adicionales | `dInfAdic`, `iCondAnt`, `iTipCont`, `gRespDE` | Campos opcionales/condicionales; no copiar texto comercial o URLs del cliente de ejemplo. |
| Receptor | `iNatRec`, `iTiOpe`, `cPaisRec`, `iTiContRec`, `dRucRec`, `dDVRec`, `iTipIDRec`, `dDTipIDRec`, `dNumIDRec`, `dNomRec`, `dNomFanRec`, `dDirRec`, `dNumCasRec`, `dTelRec`, `dCelRec`, `dEmailRec`, `dEmailAdic`, `dEmailAdmin`, `dCodCliente` | RUC/DV distintos; identificação alternativa quando não contribuinte; nome e endereço da ficha; condicionalidade por tipo real. Não mandar campos preenchidos com valores fictícios. |
| Condição e crédito | `iCondOpe`, `iCondCred`, `dPlazoCre`, `dCuotas`, `Cuotas[]` | Contado no exemplo com `iCondOpe:1`; crédito só se respaldado por payload/regra de API. |
| Pagamentos | `FormaPago[].iTiPago`, `dMonTiPag`, `cMoneTiPag`, `dTiCamTiPag` | Exemplo tem pago en efectivo por el total. Validar sumatoria y condición de operación. |
| Ítems | `Detalles[].dCodInt`, `dGtin`, `dDesProSer`, `cUniMed`, `dCantProSer`, `dPUniProSer`, `dTotBruOpeItem`, `dTotOpeItem`, `iAfecIVA`, `dPropIVA`, `dTasaIVA`, `dBasGravIVA`, `dLiqIVAItem`, `dBasExe` | Del catálogo Productos; unidad SIFEN **`cUniMed`**; no asumir que GTIN es siempre obligatorio. Recalcular totales/IVA en servidor y comparar con front. Ex. real: 3 líneas a 24.600 + 24.600 + 58.100 = 107.300 PYG, IVA 10% incluido = 9.754,54545. |
| Otros ítems | `dParAranc`, `dNCM`, `dGtinPq`, `cPaisOrig`, `dInfItem`, `cRelMerc`, `dCanQuiMer`, `dPorQuiMer`, `dCDCAnticipo`, descuentos, anticipos, lote, vencimiento, serie, datos de importación | Mantener campos condicionales del payload real, enviarlos según contrato; no introducir UI para casos no aprobados. |
| Subtotales | `Subtotales[].dSubExe`, `dSubExo`, `dSub5`, `dSub10`, `dTotOpe`, `dTotDesc`, `dTotDescGlotem`, `dTotAntItem`, `dTotAnt`, `dPorcDescTotal`, `dDescTotal`, `dAnticipo`, `dRedon`, `dTotGralOpe`, `dIVA5`, `dIVA10`, `dLiqTotIVA5`, `dLiqTotIVA10`, `dTotIVA`, `dBaseGrav5`, `dBaseGrav10`, `dTBasGraIVA`, `dTotalGs` | Exemplo: `dTotGralOpe=107300`, `dTotIVA=9754.54545454`. Confirmar escala/arrendondamentos exatos com SIFEN/gateway e motor comercial; jamais confiar em subtotal enviado pelo browser. |
| Contratación pública | `gCompPub`, `dModCont`, `dEntCont`, `dAnoCont`, `dSecCont`, `dFeCodCont` | **Fora de alcance**; não implementar formulário e não assumir valores obrigatórios. |
| Vehículo/importación especiales | `gVehNuevo`, `dNomImp`, `dDirImp`, `dNumFir`, `dNumReg`, `dNumRegEntCom` | Sem campos de UI nesta etapa. |

**Exemplo de matemática derivada do JSON (não supor arredondamento legal):** subtotal `24.600 + 24.600 + 58.100 = 107.300`; base 10% ≈ `107.300/1,1 = 97.545,4545`; IVA embutido ≈ `9.754,5455`. O JSON exemplifica liquidação em casas decimais; investigar regra exata de arredondamento em backend, exibição em Gs inteiros conforme moeda.

## 5. Documentos electrónicos — consulta, estados e ações

Listagem multiempresa e por permissões: filtros combináveis por tipo FE/NCE/NDE/NRE/AFE, sucursal, número/CDC/RUC/nome, datas de emissão/assinatura, status, lote, pendência/reprocessamento, e-mail (se provedor fornece), aprovação/rejeição. Indicadores distintos: pendiente envío, pendiente respuesta, aprobado, rechazado, e-mail enviado, error e-mail, sin e-mail, total. Não inferir estados de email só pelo status fiscal. Paginação, busca e ordenação no servidor; resultado sem dados explicativo. Linha por número/tipo, fecha, cliente, monto, estado; expandir: CDC, lote, firma/envío, código e mensagem do retorno, eventos/histórico de tentativas. Ícones com texto/tooltip/acessibilidade para status (não depender apenas de cor). Baixar PDF/KuDE e XML somente quando arquivos disponíveis e endpoint real confirmado. Ações de reconsultar/reprocessar são explícitas, permissionadas, idempotentes; não incluir já no escopo de alteração sem evidência do contrato. Exportação da listagem não foi solicitada.

Separar ao menos **estado local de envío**, **estado SIFEN**, **estado email** e **estado download**, com timestamps/histórico. Evitar reduzir a um único booleano de «aprobado». Consultar `consulta_de` por identificadores de documento antes de concluir estado definitivo. Nunca modificar documento rejeitado apagando histórico; correções/reemissões sob política futura.

## 6. API externa: contrato observado, não inventado

Servidor base observado `https://gateway-bebidas-py.e-factura-hub.com`.

- `POST /api/login`: body JSON `{"ruc":"<configuración privada>","password":"<secreto>"}`; resposta demonstrada HTTP 200 `{"status":"success","token":"<bearer>"}`.
- `POST /api/recepcion_de`: cabeçalho `Authorization: Bearer <token>`. Exemplo JSON de FE recebido neste briefing; **confirmar com fornecedor/fixtures** corpo exato e contrato de retorno de envio. Uma imagem do Postman mostra tela de autorização, **não** confirmação de emissão.
- `POST /api/consulta_de`: cabeçalho Bearer, body exemplo `{"dEst":"001","dPunExp":"001","dNumDoc":"0005996","dSerieNum":null,"tipoDoc":"NCE"}`; resposta observada HTTP 200 contém `status:success`, `response.Estado: Aprobado`, `FechaRegistro`, `DE.CDC`, `DE.FechaFirma`, `DE.FechaEnvio`, `DE.Retorno.CodRespuesta`, `DE.Retorno.Mensaje`, `DE.Evento[]`. Documento inexistente: HTTP 400 com `status:error`, mensagem «Documento no encontrado» — diferenciar de rejeição SIFEN.
- Endpoints de download PDF/XML e consulta por CDC/lote ainda **não fornecidos**: NÃO inventar URLs.
- Credenciais fornecidas em screenshot são material confidencial: não persistir em docs/Git/frontend/client-side. Se a senha/token estavam válidos e foram expostos em imagens, recomendar rotação e adotar secret/env no backend. Não exibir `Authorization` em logs.
- Definir timeout, refresh de login quando necessário, retentativas seguras, proteção contra duplicidade e registro sanitizado. Não usar credenciais compartilhadas de uma empresa para outras empresas; configurar credenciais e emissor por empresa/ambiente, com administração permissionada.

## 7. Modelo e segurança: Claude confronta código/SQL antes de DDL

Modelar (ou reutilizar) documentos_electronicos: empresa_id, tipo, identificadores, CDC opcional até retorno, estado local, estado SIFEN, estado email separado, timestamps, versionamento de payload/retornos, cliente_id, sucursal/punto de expedición, moneda, total, linhas snapshot, tentativas de envio/consulta (incl. requestId e idempotência), referências de PDF/XML com hash e storage, rastreabilidade de ator e erros sanitizados. Nunca sobrescrever evidência histórica. Componente de gateway no backend, sem fetch cross-origin do navegador; transporte HTTPS, secrets isolados e sem logging de payload de autenticação. `FACTURACION_ELECTRONICA.VER/CREAR/EDITAR/ANULAR` apenas se realmente existir contrato/seed: comparar, não inventar grant. Ao receber CDC vincular de modo único na empresa; checar duplicidade de estabelecimento/punto/número/tipo. Validação no banco/API e auditoria.

**Integração Inventário:** seguir `CONTRATO-INTEGRACION-MOVIMIENTOS-DOCUMENTOS-V1-2026-10-12.md`; **nenhuma baixa física automática por factura** nesta primeira etapa. Não há ainda unicidade persistida de evento físico entre Factura e Nota Remisión; não ativar movimento até decisão expressa e implementações de vínculo que evitem baixa dupla.

## 8. Ordem de implementação para Claude (entregas auditáveis, sem módulos simulados)

**Etapa F-01 — arquitetura/contrato e Documentos electrónicos:** confrontar tabelas e permissões existentes; preparar migrations incrementais indispensáveis em novo número disponível após NEX-046 (não alterar NEX-046 pendente sem autorização); implementar componente backend de autenticação + cliente de consulta com testes unitários mocks **somente nos testes**, modelo persistente, menu Documentos electrónicos, lista/indicadores/estados e detalhe com dados REAIS persistidos; download PDF/XML somente se endpoint confirmado. NÃO tentar autenticação com senha real em ambiente não autorizado.

**Etapa F-02 — formulario FE + generador fiscal:** telas Facturas com cliente/produto real e seleção fiscal, cálculos e payload FE compatível, emissão protegida por idempotência + persistência de solicitação/resposta + consulta. Integrar recepcion_de após verificar esquema de request/response real. Implementar acesso ao histórico e estados desde Documentos electrónicos. Sem exportación/contratación pública.

**Etapa F-03 — Nota de crédito:** apresentar menu e lista própria se já há registros; antes de emissão exigir contrato JSON NC, documento vinculado CDC, limites e motivo, sem transformar factura FE em NCE por alterar `iTiDE` isoladamente. Não executar efeitos físicos de estoque por NC.

O responsável quer fluxo completo, mas Claude deve **entregar etapa técnica por vez**, commit/push e parar para auditoria ChatGPT antes de passar à próxima. Não declarar pronto por testes em mocks.

## 9. Critérios de aceite

CA-01 menu nos três itens aprovados, com guardas e sem rotas vazias/mocks; CA-02 preencher factura selecionando cliente/produtos reais da empresa e gerar JSON com todas as condições obrigatórias suportadas; CA-03 servidor faz login com credenciais privadas e cache/renovação de bearer sem expor secrets; CA-04 recebe resposta do gateway, trata sucesso/error/timeout e grava documento/CDC/estado em transação confiável; CA-05 reconsulta via API e atualiza status sem transformar HTTP 200 em aprovado automaticamente; CA-06 lista com filtros reais e históricos, separa status SIFEN/e-mail; CA-07 PDF/XML baixáveis somente via endpoints reais protegidos; CA-08 isolamento tenant e alcance de sucursal/documentos; CA-09 duplicação e retentativa não geram factura fiscal duplicada; CA-10 nenhum movimento de estoque automático; CA-11 exportación/compra pública ausentes; CA-12 tsc, lint, build e testes locais, revisão ChatGPT e homologação no único ambiente real antes de declarar concluído.

## 10. Perguntas exclusivamente bloqueantes (não presumir respostas)

1. Contrato do `recepcion_de`: body EXATO exigido para criar FE (versus JSON pós-emissão), retorno HTTP e assíncrono, CDC/numeração/controle.
2. Endpoints de PDF/KuDE e XML e parâmetros de autenticação/identificadores.
3. Regras/série de timbrado, numerador e relação entre empresa/sucursal/punto expedición no catálogo Nexit atual (ver SQL existente antes de perguntar).
4. Credenciais por empresa/ambiente: servidor atual observado `gateway-bebidas-py`; **não presumir que esse gateway é o serviço multiempresa de todos os clientes**.
5. Tipo e payload da NCE antes da emissão de notas de crédito. Enquanto pendente, não inventar API ou JSON.

**Fonte primária do JSON:** mensagem do responsável na conversa (12/10/2026); valores pessoais, CDC, links comerciais e token foram propositadamente omitidos deste documento. Reconstituir fixtures sintéticas a partir do mapeamento, nunca salvar secrets nem dados de cliente do exemplo.
