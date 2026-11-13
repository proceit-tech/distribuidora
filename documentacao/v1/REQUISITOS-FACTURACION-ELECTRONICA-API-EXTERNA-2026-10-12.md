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

## Correção de auditoria — evidências já entregues e distinção dos contratos

**Revisão ChatGPT (12/10/2026):** o responsável **já forneceu** neste projeto um JSON completo e funcional de Factura Electrónica (contém `cdc`, `iTiDE: 1`, cabeçalho, dados do receptor, `FormaPago[]`, `Detalles[]` e `Subtotales[]`), o endereço real `POST /api/recepcion_de`, método de login `POST /api/login`, autenticação Bearer e consulta `POST /api/consulta_de` com exemplos de respostas. **Não pedir novamente o JSON FE ou os manuais SIFEN como se não existissem.** O Manual Técnico SIFEN v150 encontra-se na biblioteca de arquivos do usuário, com outras cópias e referências anteriores a Notas Técnicas; o Claude deve consultar a documentação legal/técnica disponível e suas versões sem confundir WS oficial SIFEN com a interface JSON proprietária do gateway.

**Distinção factual indispensável:**
- **Payload FE conhecido**: o JSON fornecido serve de modelo concreto de campos, estrutura e cálculos e deve guiar F-02. O usuário afirmou que esse formato funciona. Não invalidar sua evidência alegando ausência de JSON.
- **Transporte demonstrado**: endpoint e Bearer para `recepcion_de` foram apresentados em imagem do Postman. A imagem isolada mostra configuração de envio, mas não inclui corpo da requisição e resposta completos dessa chamada. Isso justifica apenas **validar retorno/status e requisito de campos de criação**, não bloquear toda a preparação da emissão.
- **Manual SIFEN**: define regras fiscais, obrigatoriedade e validação normativa; **não substitui** a documentação específica do gateway `e-factura-hub`. Verificar notas técnicas oficiais para exceções vigentes. Não exigir novamente o manual já disponibilizado.
- **Execução**: avançar com formulários Facturas e motor de construção/validação de JSON com dados dos cadastros e fixtures sintéticas; desacoplar transporte e reconciliar retornos. Para executar envio real, confirmar somente o detalhe de contrato efetivamente não comprovado pelos exemplos recuperados. Não fabricar sucesso fiscal nem emissão, e não usar senha/token compartilhados em arquivos do Git.

**Orientação corretiva ao Claude:** após ler `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progresso pertinente, esta especificação e as decisões de emissão, auditar a F-01 contra o manual e o JSON já fornecidos, corrigir defeitos concretos pendentes, e preparar F-02 sem redesenhar toda a arquitetura nem perguntar novamente pelo JSON. A F-02 permanece sujeita a autorização normal de desenvolvimento e auditoria antes de deployment, SQL e gateway real.

## Decisões do responsável — operação FE em teste e fluxo Gravar → Enviar

**Decisões expressas (12/10/2026), prevalecem sobre as dúvidas anteriores do documento:**
- O **timbrado está configurado no sistema do fornecedor/gateway** e não é cadastrado no Nexit nesta etapa. O Nexit envia os identificadores do DE pelo contrato do fornecedor, sem fabricar dados de timbrado.
- Para o **ambiente de teste e empresa emissora configurada**, estabelecimento `001`, punto de expedición `002`, primeira factura desejada `001-002-0050000` (número comercial 50.000, representado em 7 dígitos). A NEX-048 atual calcula `v_num := ultimo_numero + 1`; portanto **inicializar `ultimo_numero=49999`** para que a primeira numeração seja 0050000. **Nunca gravar 50000 como último número se a intenção for emitir a factura 50000**. Configurar esses parâmetros para a empresa/ambiente de teste, não torná-los padrão para outras empresas e não repetir números já usados no gateway. Validar coerência com `sucursales.establecimiento_sifen` e nunca alterar a NEX-048 já aplicada por suposição.
- **Paraguay: preços comerciais com IVA embutido**. Considerar `dPUniProSer` como preço unitário com IVA incluído; calcular inversamente base gravada e liquidação a partir do total bruto sob MT SIFEN v150/Notas Técnicas. Usar o JSON real fornecido para teste inverso de fórmulas, por item, subtotal, taxa e arredondamento. No exemplo conhecido: itens 24.600 + 24.600 + 58.100 = **Gs. 107.300** e IVA 10% total **9754.54545454** (valor decimal do JSON, sem presumir arredondamento legal distinto). Preços não devem receber IVA novamente.
- **Fluxo obrigatório de UI**: operador preenche Facturas → pressiona **«Grabar»** → Nexit valida e apresenta **modal-resumo** com empresa/sucursal/punto, cliente, lista dos produtos/quantidades/preços, IVA e total → opções **«Volver a editar»** e **«Enviar factura»**. «Grabar» nesta etapa **não deve disparar transmissão externa**; diferenciar revisão, salvamento durável e emissão. Ao confirmar «Enviar factura» o servidor deve registrar/recuperar a intenção durável e idempotente, reservar numeração uma única vez (NEX-048) no momento apropriado, gerar o payload final, efetuar login server-side no gateway, transmitir `POST /api/recepcion_de` com Bearer e armazenar a resposta/histórico.
- **Modal técnico próprio do Nexit (provisório de teste)** durante envio: mostrar fases (autenticação obtida, envio iniciado, HTTP, resposta recebida), mensagem/validação/erro do gateway, se fornecidos número do lote/CDC/estado. Não mostrar senha, bearer token, headers secretos ou dump irrestrito de dados fiscais. Diferenciar `HTTP 200`, `recibido`, `pendiente`, `aprobado`, `rechazado` e falha de rede. **Número de lote apenas se a resposta realmente trouxer**; não inventá-lo e não chamar lote de aprovação. Após operação, integrar registro em `Documentos electrónicos`, com status, número, tentativa e retorno. Nunca criar outro número ou reenviar cegamente em timeout; reconciliar antes.
- Não está autorizado envio efetivo à API pelo Claude nem SQL/deploy na VM. Implementar **fluxo e contrato** com testes sintéticos e camada de transporte configurável; para transmissão real aguardar homologação operacional pelo responsável. Ao testar emissão no gateway, usar exclusivamente ambiente/empresa teste e idempotência.

**Pontos técnicos de análise para Claude:** a implementação atual de `POST /api/facturas` **já reserva número e cria documento PENDIENTE_ENVIO**. Adequá-la ao botão Grabar→modal→Enviar evitando consumir numeração quando o usuário somente revisa a factura; não duplicar criação em reenvios ou cliques repetidos. Compatibilizar cálculos backend/fonte de preços e NEX-048 com o ciclo autorizado. O JSON de 12/10 já foi fornecido pelo responsável e mapeado neste documento; não informar que ele não foi entregue. Confrontar `recepcion_de` com exemplos existentes e indicar **apenas** lacunas comprovadas de request/response, sem inventar sucesso ou bloqueio de todo o desenvolvimento.

**Critérios de aceite adicionais:** prévia calculada no servidor confere com formulário e JSON enviado; voltar a editar não consome sequência; enviar repetidamente a mesma operação mantém identidade/numeração; modal revela erros reais de validação sem vazar segredos; lote só aparece quando recebido; estado SIFEN só `APROBADO` quando comprovado; todos os passos persistidos consultáveis no histórico. Confirmar com responsável antes de alterar contratos já aplicados. Não habilitar envio real sem validação do payload/retorno no ambiente de teste e autorização do responsável.

## AUD-FE-CAMPOS — confronto JSON exemplo × motor × banco × MT v150

**Auditoria estática ChatGPT, 12/10/2026.** Base: JSON de factura funcional enviado pelo responsável (3 linhas, total 107300), MT SIFEN versão 150 disponível na biblioteca, documentação/decisões deste Git, `lib/facturacion/payload-fe.ts`, `lib/facturacion/calculo.ts`, `lib/facturacion/emision.ts`, NEX-047 e NEX-048. As Notas Técnicas 13/024 são **citadas pelo código**; seus arquivos oficiais completos não foram individualmente localizados nesta consulta, portanto não marcar sua verificação como completa. Não houve testes PostgreSQL, browser nem envio ao gateway. O manual fiscal e o contrato JSON proprietário do gateway são duas camadas diferentes; a obrigatoriedade exata do gateway deve ser confirmada com resposta real.

### Matriz de cobertura (o que existe × lacuna × decisão para teste)

| Bloco | JSON real fornecido | Implementação atual | Lacuna / decisão |
|---|---|---|---|
| Identidade | `iTiDE=1`, `cdc`, `dEst`, `dPunExp`, `dNumDoc`, `dSerieNum`, `dFeEmiDE` | `iTiDE=1` gerador; NEX-048 insere `001/002/0050000` conforme configuração (contador 49999); omite CDC | CDC não fabricado (apropriado se gateway o atribui); confirmar em envio. Timbrado fica no gateway, decisão aprovada. |
| Textos | `dInfoEmi`, `dInfoFisc` preenchidos; `dInfAdic` com conteúdo comercial | `dInfoEmi=null`, `dInfoFisc=null`; `dInfAdic` configurável | Não copiar texto de cliente de exemplo. Validar se gateway requer `dInfoEmi`/`dInfoFisc` e se podem ser montados após numeração. |
| Operação | `iTipTra=3`, `iTImp=1`, PYG, `iIndPres=4`, `dFecEmNR` preenchido | seleção tipo/presença, `iTImp=1`, PYG; `dFecEmNR=null` | Verificar condicionalidade de `dFecEmNR` conforme tipo de DE/recepción; não fixar 4 ou 3 para todas as facturas sem decisão. |
| Receptor fiscal | natureza, operação, país, tipo contribuinte, RUC/DV, razão social, endereço e e-mail | reusa `clientes` e `direcciones_cliente`; gera campos do receptor | Conferir tipo JSON de `dDVRec`: no exemplo é **número**, código envia string; `dNumCasRec` no exemplo é numérico, código serializa texto/null. RUC sem DV, conferir formato. |
| Localização receptor | exemplo **não contém** `cDepRec/cDisRec/cCiuRec` | gerador envia três tags com código/null | Não afirmar que campos extras são aceitos: confrontar documentação de payload do gateway ou teste controlado com resposta. |
| Cliente | `dCodCliente=null`, outros opcionais null | gerador envia código interno (não null) e outros opcionais | Escolher enviar código interno se aceito; diferença não é falha comprovada. |
| Pagamentos | `iCondOpe=1`, `FormaPago[0]`: `iTiPago=1`, `dMonTiPag=107300`, PYG | contado, uma forma, total calculado backend | Compatível no exemplo; outras formas previstas exigem validação de condicionais (cheque/cartão etc) antes de habilitar efetivamente. |
| Itens obrigatórios | `dCodInt,dGtin,dDesProSer,cUniMed,dCantProSer,dPUniProSer,dTotBruOpeItem,dTotOpeItem,iAfecIVA,dPropIVA,dTasaIVA,dBasGravIVA,dLiqIVAItem,dBasExe` | todos têm mapeamento no gerador | Preço IVA incluído aprovado. Confirmar equivalência SIFEN de `cUniMed` para cada item; `dPropIVA` numérica. |
| Itens opcionais | original inclui explicitamente muitas chaves `null` (NCM, arancelaria, descuentos, anticipos, lote, serie, importador, etc.) | gerador **omite** muitas chaves ausentes em vez de enviar null | **Decisão por validar**: gateway aceita omissão ou exige propriedades presentes com null? Teste controlado no gateway antes de ampliar payload cegamente. |
| Subtotales | 3 itens, total 107300, `dIVA10` e `dLiqTotIVA10` = 9754.54545454, `dTotIVA` idem, base 97545.45454546 | `dIVA10` calculado, **`dLiqTotIVA10=0` fixo**, `dLiqTotIVA5=0` fixo | **AUD-FE-01 confirmado**: divergência direta com exemplo. Corrigir mapeamento de `dLiqTotIVA5/10` após verificar papel semântico desses campos no gateway/manual; no cenário 10%, não deixar 0. |
| Outros subtotais | `dComi=null`, `dIVAComi=null` no JSON | ambas chaves omitidas | Confirmação de omissão versus null requerida. |
| Idempotência | payload funcional mostra documento já numerado | NEX-048 guarda solicitação e reserva número sem envio; não há status de lote persistido | F-02 envio, resposta e eventual lote exigem modelo/transação própria; não fabricar `APROBADO` por 200. |
| Estado/consulta | screenshot mostra `consulta_de` com NCE e resposta de aprovado | F-01 interpreta NCE, FE bloqueado até valor `tipoDoc` confirmado | Confirmar FE: não inventar. |
| PDF/XML/email | tela de referência disponibiliza ícones | endpoints de descarga e origem e-mail não presentes | Não implementar download fictício ou e-mail baseado em status SIFEN. |

### Valores existentes no banco/modelo (estáticos, sem SQL real)
- `sucursales.establecimiento_sifen` para estabelecimento; NEX-048 cria `fe_puntos_expedicion` com `codigo` e `ultimo_numero`, **sem tela cadastral**. Para este teste, configurar empresa/sucursal com estabelecimento `001`, ponto `002` e `ultimo_numero=49999`; não fixar globalmente. NEX-048 valida/gera `dEst,dPunExp,dNumDoc,dSerieNum,dFeEmiDE`.
- `clientes` tem RUC/documento/DV, natureza, operação, contribuyente, endereços e contatos; `evaluarAptitudCliente` pré-valida. Dados reais podem estar incompletos — não completar com valores fictícios no DE.
- `productos`, `unidades_medida.unidad_sifen_codigo`, impostos/afetação/proporção, `v_producto_precio_referencia`, GTIN e descrição da factura são lidos em `emision.ts`; **preço de catálogo assumido com IVA embutido**, agora decisão expressa.
- NEX-047 separa `documentos_electronicos`, `documento_electronico_intentos`, `fe_gateway_config`. NEX-048 cria `documento_electronico_solicitudes` e `fe_puntos_expedicion`. Nenhuma delas modela ainda resposta de **número de lote**; especificar armazenamento e vínculo ao enviar.
- Credenciais `NEXIT_FE_<REF>_RUC/PASSWORD` fora do Git. `FACTURACION_ELECTRONICA.VER/EDITAR/CREAR` no SQL versionado. Estado de aplicação real NEX-046/047/048 deve ser consultado no runner antes de tentar mudar arquivos/checksums.
- Por enquanto o formulário só admite PYG, contado, preço IVA incluído, sem descontos/anticipos, até decisão do responsável.

### Verificação inversa do exemplo (aritmética independente)
- Totais brutos: `24600 + 24600 + 58100 = 107300`.
- Base 10% sem imposto, com arredondamento em 8 casas por item: `22363.63636364 + 22363.63636364 + 52818.18181818 = 97545.45454546`.
- Liquidação correspondente: `2236.36363636 + 2236.36363636 + 5281.81818182 = 9754.54545454`.
- Os somatórios explicam os números do JSON informado. **O envio gerado precisa preencher TODOS os subtotais relacionados de modo coerente, inclusive dLiqTotIVA10; não deixar valor artificial 0.**

### Prioridade de correção e confirmação

**Bloqueante AUD-FE-01:** diferença `dLiqTotIVA10` no JSON versus código; revisar mapeamento de todos os Fxxx antes de enviar. **AUD-FE-02:** tipos de dados JSON de DV e número de casa; comparar contrato e serializador. **AUD-FE-03:** presença/ausência de tags opcionais null e tags extras localização; garantir perfil aceito pelo gateway. **AUD-FE-04:** fluxo Grabar→resumo→Enviar, número de lote/resultado do gateway, não consumo na simples prévia. **AUD-FE-05:** pontos de expedição não têm UI; configurar teste por empresa, sem hardcode global. **AUD-FE-06:** distinguir formas de pagamento disponíveis das efetivamente suportadas pelos condicionais fiscais. Nenhuma hipótese deve ser tratada como exigência comprovada sem contrato do gateway ou teste real.

**Regra para Claude:** antes de editar, ler protocolos e este documento, confrontar manual e versões das NT disponíveis, corrigir defeitos confirmados e preparar fixtures regressivas sintéticas equivalentes ao JSON entregue. Não dizer que o JSON foi perdido. Executar testes locais, commit/push, parar para auditoria ChatGPT; não executar PostgreSQL/VM/gateway real sem autorização.


## Decisões aprovadas — parâmetros da primeira emissão F-02 (2026-10-12)

**Decisão expressa do responsável, registrada para não ser rediscutida:**

1. **Número de casa do receptor:** na primeira prova, usar **`0` como valor fixo de teste somente se o cadastro do cliente não trouxer número de casa utilizável**. Se o cadastro trouxer número válido, preservar seu valor. Serializar `dNumCasRec` no tipo numérico exigido pelo JSON/gateway; não transformar a configuração temporária em regra global de produção, nem sobrescrever o cadastro do cliente. A regra fiscal/normativa e o contrato do gateway prevalecem se `0` for rejeitado.
2. **Cliente fiscalmente incompleto:** **bloquear** a emissão e mostrar ao operador os campos fiscais pendentes, utilizando as verificações existentes de aptidão SIFEN de Clientes. Não inventar RUC, DV, país, município, identificação ou outros valores para passar nas validações. A exceção expressa do número da casa para teste não autoriza completar automaticamente outros campos.
3. **Campos opcionais do gateway:** partir do **JSON funcional que o responsável já forneceu**, preservar sua estrutura e comparar campo por campo com o serializador atual. **Validar na integração** se opcionais ausentes devem ser enviados como `null` ou omitidos; não decidir genericamente sem evidência do gateway. Diferenças como `cDepRec/cDisRec/cCiuRec`, `dInfoEmi/dInfoFisc`, e outros campos exigem análise contratual específica.
4. **Primeira forma de pagamento:** habilitar **somente `Efectivo`**, `FormaPago[0].iTiPago=1`, com `dMonTiPag` igual ao total da factura em PYG. Ocultar/desabilitar outras formas no formulário e rejeitar outras opções também no backend enquanto vigorar esta etapa. Outras formas de pagamento somente após autorização/validação futura.

**Preservar decisões anteriores:** `dEst=001`, `dPunExp=002`, primeira numeración `0050000` (contador anterior `49999`), timbrado administrado pelo fornecedor, preços com IVA embutido, e fluxo Grabar → resumo → Enviar → modal técnico → Documentos electrónicos. Ambiente de teste por empresa, sem valores fixos globais. Corrigir **AUD-FE-01**: `dLiqTotIVA10` (e análogo 5% quando aplicável) deve ser coerente com o total de IVA e o JSON real, em vez de permanecer artificialmente em zero. Confrontar tipos numéricos do DV, número de casa, localizações e campos opcionais com o manual e o formato do gateway. A edição da especificação não constitui autorização para migrar SQL ou emitir documentos reais.

**Execução pelo Claude:** sincronizar branch; ler `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progresso pertinente, este documento e código/migrations reais antes de alterar. Implementar apenas o escopo aprovado, incluir testes locais/regressivos de valores de IVA e pagamento efectivo, sem segredos, sem acesso à VM ou gateway real; commit/push, entregar resultado curto, SHA e parar para auditoria ChatGPT.

## AUD-FE-100 — inventário exaustivo das chaves do JSON entregue (12/10/2026)

**Escopo exato:** conferência individual das **117 chaves distintas** presentes no exemplo enviado pelo responsável, separadas entre cabecera, FormaPago, Detalles e Subtotales; o array `Cuotas: []` não possui chaves-filhas. A contagem não duplica os 3 objetos de `Detalles`. O exemplo é uma **instância concreta**, não catálogo exaustivo de todo o Manual SIFEN. **Não confundir 100% do JSON enviado com 100% das variantes/condicionais do Manual/Notas Técnicas**. Verificação estática de presença textual das chaves em `lib/facturacion/payload-fe.ts`, e dos cinco campos atribuídos por `NEX-048`; status GERADO **não comprova tipo, valor, correção normativa ou envio aceito**. `cdc` vem do gateway, não deve ser fabricado. Arquivos PDF das Notas Técnicas citadas no código não foram todos localizados individualmente para homologação normativa completa.

**Legenda:** GERADO=chave presente no serializador; NEX-048=adicionada na função SQL que reserva o número; RETORNO GATEWAY=obtida depois do envio; AUSENTE=chave não é produzida pelo serializador atual, sua exigência pelo gateway ainda deve ser confirmada; zeros/null obrigatórios e condicionais exigem comparação de tipos.

| Bloco | Chave exata no JSON entregue | Situação no código atual | Ponto de auditoria |
|---|---|---|---|
| Cabecera | `cdc` | RETORNO GATEWAY | — |
| Cabecera | `dInfoEmi` | GERADO | — |
| Cabecera | `dInfoFisc` | GERADO | — |
| Cabecera | `dInfAdic` | GERADO | — |
| Cabecera | `dEst` | NEX-048 | — |
| Cabecera | `dPunExp` | NEX-048 | — |
| Cabecera | `dNumDoc` | NEX-048 | — |
| Cabecera | `dSerieNum` | NEX-048 | — |
| Cabecera | `dFeEmiDE` | NEX-048 | — |
| Cabecera | `iTipTra` | GERADO | — |
| Cabecera | `iTImp` | GERADO | — |
| Cabecera | `cMoneOpe` | GERADO | — |
| Cabecera | `dCondTiCam` | GERADO | — |
| Cabecera | `dTiCam` | GERADO | — |
| Cabecera | `iCondAnt` | AUSENTE | Verificar condicionalidade/null |
| Cabecera | `iTipCont` | AUSENTE | Verificar condicionalidade/null |
| Cabecera | `gRespDE` | AUSENTE | Verificar condicionalidade/null |
| Cabecera | `iNatRec` | GERADO | — |
| Cabecera | `iTiOpe` | GERADO | — |
| Cabecera | `cPaisRec` | GERADO | — |
| Cabecera | `iTiContRec` | GERADO | — |
| Cabecera | `dRucRec` | GERADO | — |
| Cabecera | `dDVRec` | GERADO | TIPO a conferir |
| Cabecera | `iTipIDRec` | GERADO | — |
| Cabecera | `dDTipIDRec` | GERADO | — |
| Cabecera | `dNumIDRec` | GERADO | — |
| Cabecera | `dNomRec` | GERADO | — |
| Cabecera | `dNomFanRec` | GERADO | — |
| Cabecera | `dDirRec` | GERADO | — |
| Cabecera | `dNumCasRec` | GERADO | TIPO a conferir |
| Cabecera | `dTelRec` | GERADO | — |
| Cabecera | `dCelRec` | GERADO | — |
| Cabecera | `dEmailRec` | GERADO | — |
| Cabecera | `dEmailAdic` | GERADO | — |
| Cabecera | `dEmailAdmin` | GERADO | — |
| Cabecera | `dCodCliente` | GERADO | — |
| Cabecera | `iIndPres` | GERADO | — |
| Cabecera | `dFecEmNR` | GERADO | — |
| Cabecera | `gCompPub` | AUSENTE | Verificar condicionalidade/null |
| Cabecera | `iCondOpe` | GERADO | — |
| Cabecera | `iCondCred` | GERADO | — |
| Cabecera | `dPlazoCre` | GERADO | — |
| Cabecera | `dCuotas` | GERADO | — |
| Cabecera | `dModCont` | AUSENTE | Verificar condicionalidade/null |
| Cabecera | `dEntCont` | AUSENTE | Verificar condicionalidade/null |
| Cabecera | `dAnoCont` | AUSENTE | Verificar condicionalidade/null |
| Cabecera | `dSecCont` | AUSENTE | Verificar condicionalidade/null |
| Cabecera | `dFeCodCont` | AUSENTE | Verificar condicionalidade/null |
| Cabecera | `iTiDE` | GERADO | — |
| FormaPago | `iTiPago` | GERADO | — |
| FormaPago | `dMonTiPag` | GERADO | — |
| FormaPago | `cMoneTiPag` | GERADO | — |
| FormaPago | `dTiCamTiPag` | GERADO | — |
| Detalles | `dCodInt` | GERADO | — |
| Detalles | `dParAranc` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dNCM` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dGtin` | GERADO | — |
| Detalles | `dGtinPq` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dDesProSer` | GERADO | — |
| Detalles | `cUniMed` | GERADO | — |
| Detalles | `dCantProSer` | GERADO | — |
| Detalles | `cPaisOrig` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dInfItem` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `cRelMerc` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dCanQuiMer` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dPorQuiMer` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dCDCAnticipo` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dPUniProSer` | GERADO | — |
| Detalles | `dTotBruOpeItem` | GERADO | — |
| Detalles | `dDescItem` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dPorcDesIt` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dDescGloItem` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dAntPreUniIt` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dAntGloPreUniIt` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dTotOpeItem` | GERADO | — |
| Detalles | `iAfecIVA` | GERADO | — |
| Detalles | `dPropIVA` | GERADO | — |
| Detalles | `dTasaIVA` | GERADO | — |
| Detalles | `dBasGravIVA` | GERADO | — |
| Detalles | `dLiqIVAItem` | GERADO | — |
| Detalles | `gVehNuevo` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dBasExe` | GERADO | — |
| Detalles | `dNumLote` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dVencMerc` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dNSerie` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dNumPedi` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dNumSegui` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dNomImp` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dDirImp` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dNumFir` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dNumReg` | AUSENTE | Verificar condicionalidade/null |
| Detalles | `dNumRegEntCom` | AUSENTE | Verificar condicionalidade/null |
| Subtotales | `dSubExe` | GERADO | — |
| Subtotales | `dSubExo` | GERADO | — |
| Subtotales | `dSub5` | GERADO | — |
| Subtotales | `dSub10` | GERADO | — |
| Subtotales | `dTotOpe` | GERADO | — |
| Subtotales | `dTotDesc` | GERADO | — |
| Subtotales | `dTotDescGlotem` | GERADO | — |
| Subtotales | `dTotAntItem` | GERADO | — |
| Subtotales | `dTotAnt` | GERADO | — |
| Subtotales | `dPorcDescTotal` | GERADO | — |
| Subtotales | `dDescTotal` | GERADO | — |
| Subtotales | `dAnticipo` | GERADO | — |
| Subtotales | `dRedon` | GERADO | — |
| Subtotales | `dComi` | AUSENTE | Verificar condicionalidade/null |
| Subtotales | `dTotGralOpe` | GERADO | — |
| Subtotales | `dIVA5` | GERADO | — |
| Subtotales | `dIVA10` | GERADO | — |
| Subtotales | `dLiqTotIVA5` | GERADO | VALOR zero incorreto |
| Subtotales | `dLiqTotIVA10` | GERADO | VALOR zero incorreto |
| Subtotales | `dIVAComi` | AUSENTE | Verificar condicionalidade/null |
| Subtotales | `dTotIVA` | GERADO | — |
| Subtotales | `dBaseGrav5` | GERADO | — |
| Subtotales | `dBaseGrav10` | GERADO | — |
| Subtotales | `dTBasGraIVA` | GERADO | — |
| Subtotales | `dTotalGs` | GERADO | — |

**Ações obrigatórias Claude:** (1) comparar com o JSON literal original disponível na mensagem do responsável e com cada ocorrência de item; (2) conferir tipos (número versus string, null versus ausência), cardinalidade e regras condicionais de cada chave, incluindo `Cuotas[]`; (3) confrontar schema das migrations NEX-047/048 e cadastros `clientes/direcciones_cliente/productos/unidades_medida/impuestos/v_producto_precio_referencia/sucursales/fe_puntos_expedicion` e identificar a origem ou valor fixo aprovado de cada chave; (4) confrontar MT v150 e cada Nota Técnica citada, reportando se o documento integral estiver indisponível, sem afirmar revisão normativa completa; (5) corrigir subtotal `dLiqTotIVA10` e `dLiqTotIVA5` zerados contrariando o exemplo, com teste reverso item a item; (6) mapear as **36 chaves AUSENTES** sem inventar exigência: perguntar só o que o contrato do gateway não resolver; (7) respeitar decisões `001/002/0050000`, IVA incluído, `Efectivo`, casa `0` temporária, cliente incompleto bloqueado, e modal Grabar→Enviar. Não incluir CDC do exemplo, senha, token ou RUC pessoal em fixtures; não efetuar envio real. Commit/push e parar para auditoria.

**Contagem por bloco:** Cabecera: 49; Cuotas: 0; FormaPago: 4; Detalles: 39; Subtotales: 25. AUSENTES = 36: `iCondAnt`, `iTipCont`, `gRespDE`, `gCompPub`, `dModCont`, `dEntCont`, `dAnoCont`, `dSecCont`, `dFeCodCont`, `dParAranc`, `dNCM`, `dGtinPq`, `cPaisOrig`, `dInfItem`, `cRelMerc`, `dCanQuiMer`, `dPorQuiMer`, `dCDCAnticipo`, `dDescItem`, `dPorcDesIt`, `dDescGloItem`, `dAntPreUniIt`, `dAntGloPreUniIt`, `gVehNuevo`, `dNumLote`, `dVencMerc`, `dNSerie`, `dNumPedi`, `dNumSegui`, `dNomImp`, `dDirImp`, `dNumFir`, `dNumReg`, `dNumRegEntCom`, `dComi`, `dIVAComi`.

## AUD-FE-DECISION — análise funcional conclusiva para implementação (ChatGPT)

**Responsabilidade:** a análise de negócio é do ChatGPT; Claude implementa o que foi decidido abaixo e apenas informa bloqueios técnicos específicos. Esta seção SUBSTITUI o comando genérico na AUD-FE-100 de mandar Claude «decidir» as 117 chaves. A matriz AUD-FE-100 continua sendo checklist analítico do exemplo, não um requisito de reproduzir indiscriminadamente todos os campos `null`.

**Conclusão da auditoria de fonte (JSON exemplo × código e migrations atuais):** 117 chaves distintas presentes no exemplo (49 cabeçalho, 4 FormaPago, 39 ítem, 25 subtotais; array Cuotas vazio). Não equivalem a 117 campos obrigatórios. Na última revisão, `payload-fe.ts` já produz `dDVRec` e `dNumCasRec` numéricos e já preenche `dLiqTotIVA5/10` com os valores calculados, portanto esses três itens da análise histórica **já foram corrigidos no Git atual e NÃO devem ser reimplementados**. `NEX-048` adiciona identidade e data; `cdc` não deve ser fabricado. Migrations NEX-046/047/048 não foram validadas em PostgreSQL real.

### Decisão por famílias — contrato fechado para teste FE normal

| Família | Chaves do JSON | Fonte/ação fechada |
|---|---|---|
| Identidade | `iTiDE,cdc,dEst,dPunExp,dNumDoc,dSerieNum,dFeEmiDE` | `iTiDE=1`; empresa/sucursal/ponto de teste `001-002`, primeira `0050000` por contador anterior `49999`; data e número pela transação NEX-048, apenas quando Enviar for confirmado. CDC somente após resposta válida. Timbrado no gateway. |
| Textos | `dInfoEmi,dInfoFisc,dInfAdic` | Informações comerciais opcionais, `dInfAdic` do operador. `dInfoEmi`/`dInfoFisc`: no exemplo vêm preenchidas, mas são do gateway/documento gerado; NÃO inventar textos nem derivar automaticamente sem exigência confirmada do provedor. |
| Operação | `iTipTra,iTImp,cMoneOpe,dCondTiCam,dTiCam,iIndPres,dFecEmNR` | Tipo de transação e presença escolhidos da lista válida; `iTImp=1`, `cMoneOpe=PYG`, câmbio `null`; `dFecEmNR` não preenchida automaticamente sem regra comprovada, inclusive se exemplo tiver data. |
| Receptor | `iNatRec,iTiOpe,cPaisRec,iTiContRec,dRucRec,dDVRec,iTipIDRec,dDTipIDRec,dNumIDRec,dNomRec,dNomFanRec,dDirRec,dNumCasRec,dTelRec,dCelRec,dEmailRec,dEmailAdic,dEmailAdmin,dCodCliente` | Inteiramente pelo cadastro `clientes` e endereço fiscal, com aptidão SIFEN; não contribuyente segue identificação condicional; `dDVRec` número conforme exemplo, `dNumCasRec` número do cadastro ou `0` *somente no teste* se endereço informado e número ausente; sem outros defaults fictícios; bloquear cliente inapto e explicar faltantes. |
| Receptor localização EXTRA | `cDepRec,cDisRec,cCiuRec` | Não constam do JSON do gateway enviado; são códigos no banco. NÃO incluir na carga de prova até confirmar que o gateway os aceita; manter dados no cadastro/validação exigida pelo SIFEN. |
| Condição e pagamento | `iCondOpe,iCondCred,dPlazoCre,dCuotas,Cuotas,FormaPago[].iTiPago,dMonTiPag,cMoneTiPag,dTiCamTiPag` | Contado `iCondOpe=1`, efectivo `iTiPago=1`, valor igual ao total PYG; crédito e cuotas sem dados (`null` / `[]` conforme perfil do gateway) e não apresentar entrada de crédito. |
| Itens normais | `dCodInt,dGtin,dDesProSer,cUniMed,dCantProSer,dPUniProSer,dTotBruOpeItem,dTotOpeItem,iAfecIVA,dPropIVA,dTasaIVA,dBasGravIVA,dLiqIVAItem,dBasExe` | Código, GTIN (se cadastrado), descrição, unidade SIFEN, preço IVA incluído, afetação, taxa e proporção do cadastro de productos/impuestos/precios; quantidade do usuário; base/IVA/totais calculados só no servidor. Sem valores fixos para produto, preço, unidade, IVA ou GTIN. |
| Totais normais | `dSubExe,dSubExo,dSub5,dSub10,dTotOpe,dTotGralOpe,dIVA5,dIVA10,dLiqTotIVA5,dLiqTotIVA10,dTotIVA,dBaseGrav5,dBaseGrav10,dTBasGraIVA,dTotalGs` | Calcular matematicamente e cruzar com item; o exemplo de 10% tem total 107300, base 97545.45454546 e IVA 9754.54545454. Código **já corrigiu** dLiqTotIVA5/10; adicionar/regredir teste exato do exemplo sem dados pessoais. Não fixar bases/IVA artificiais. |
| Sem efeito nesta prova | `iCondAnt,iTipCont,gRespDE,gCompPub,dModCont,dEntCont,dAnoCont,dSecCont,dFeCodCont` | Não há anticipo, contratación pública ou responsável terceiro no escopo aprovado. Manter `null` ou omissão conforme gateway, sem UI. |
| Itens especiais opcionais | `dParAranc,dNCM,dGtinPq,cPaisOrig,dInfItem,cRelMerc,dCanQuiMer,dPorQuiMer,dCDCAnticipo,dDescItem,dPorcDesIt,dDescGloItem,dAntPreUniIt,dAntGloPreUniIt,gVehNuevo,dNumLote,dVencMerc,dNSerie,dNumPedi,dNumSegui,dNomImp,dDirImp,dNumFir,dNumReg,dNumRegEntCom` | Sem importação, incentivos, anticipo, descontos, veículo novo, serialização e informação comercial especial nessa prova; **não criar formulários nem tabelas** para elas agora. Ausência não é defeito normativo por si só. Enviar `null` somente se o gateway exigir a chave no envelope. |
| Outros subtotais | `dTotDesc,dTotDescGlotem,dTotAntItem,dTotAnt,dPorcDescTotal,dDescTotal,dAnticipo,dRedon,dComi,dIVAComi` | Operação sem descontos/anticipos/comissão/arredondamento: zeros nos acumulados numéricos e `null` nos condicionais, apenas se o gateway exigir presença. Não ativar ajustes sem regra aprovada. |

**ÚNICO PONTO CONTRATUAL QUE NÃO SE DEDUZ DO MANUAL SIFEN:** o gateway proprietário aceitará serialização com chaves opcionais omitidas ou requer `null` explícito, e quais campos gera automaticamente/retorna em `recepcion_de`. Desenvolver serializador testável baseado no exemplo com campos normais + opcionais permitidos, capturar validações reais no modal de diagnóstico do ambiente de teste. O Manual v150 define validações XML/SIFEN, mas não o envelope JSON específico de e-factura-hub. Não tratar `HTTP 200` nem lote como aprovação.

**Pendências técnicas objetivas, não novas decisões de negócio:**
A. Confirmar que a árvore de campos enviada contempla condição de contado, receptor e produto válidos sem conflito de tipos.
B. Garantir no código o fluxo Grabar=prévia **sem consumir número**; Enviar persiste operação com mesma idempotência, envia e grava resposta/lote quando real.
C. Completar cliente gateway de `recepcion_de` com saneamento, timeout, resposta, reconciliação e estado indeterminado; não inventar retorno.
D. Configurar ponto teste `001/002/49999` por empresa fora do Git e verificar se faixa 0050000 ainda não foi usada no gateway.
E. **Avaliar matriz de pagamentos**: mesmo que código ofereça mais formas, testar agora só Efectivo em UI e servidor.
F. Conferir se nova rota de facturas não duplica módulos, se API tenant/alcance, numeração e migrations seguem política de não aplicar SQL no Claude.

**Critério de trabalho:** Claude **não refaz análise de negócios de 117 chaves** nem pergunta ao responsável pelo JSON já fornecido; implementa esta decisão e assinala somente bloqueios concretos que uma resposta real do gateway revele. Atualizar testes do JSON sem usar dados pessoais ou segredos. O ChatGPT reaudita o commit; responsável realiza única homologação no ambiente real. Não marcar implementação como homologada.

## AUD-FE-F02 — parecer após commit b3ae9ba e matriz funcional de 117 chaves

**ChatGPT analisou código real da branch após `b3ae9bae540c7ab229d458acd16eb6dbef2bda90` e a AUD-FE-DECISION.** Status: **correção/validação antes da publicação**. A F-02 já tem prévia sem efeito fiscal, envio autenticado backend, exclusão mútua no SQL, lote/CDC se informado e `ENVIO_INDETERMINADO`. A NEX-049 está versionada e não aplicada. Testes locais relatados pelo Claude (1985) não são execução do SQL/gateway/browser.

**Matriz aplicável:** as 117 chaves da seção AUD-FE-100 estão agrupadas em decisões de origem e preenchimento na seção AUD-FE-DECISION; NÃO pedir ao Claude que faça análise de negócios novamente. Conferência pós-commit confirma gerador de `dDVRec` e `dNumCasRec` numéricos, `dLiqTotIVA5/10` iguais ao IVA calculado, pagamento Efectivo, remoção das chaves extras de localização, `dEst/dPunExp/dNumDoc/dSerieNum/dFeEmiDE` acrescidos no SQL. As 36 chaves ausentes do JSON de exemplo concentram campos condicionais/opcionais fora do cenário simples; não adicionar funcionalidades sem motivo. O gateway poderá exigir `null` explícito para algumas chaves: validar quando houver evidência.

**Constatações estáticas específicas e prioridade:**
1. **AUD-FE-ENV-01 (alta):** `lib/facturacion/gateway.ts` `interpretarRecepcion` trata qualquer 2xx + `status="success"` como `ENVIADO`. Contrato completo da recepção ainda não comprovado; definir classificação conservadora fundamentada na resposta real, sem interpretar isso como `APROBADO` do SIFEN. Se resposta recebida não certificar recepção de um documento específico, registrar condição não confirmada/indeterminada.
2. **AUD-FE-ENV-02 (alta):** todo 4xx passa a `ERROR_ENVIO`, permitindo reenvio do mesmo documento. Antes de habilitar a política genérica, classificar erros seguramente pré-processamento versus ambiguidades ou possíveis duplicidades. Não permitir reenvio inseguro, preservar request/response e número fiscal.
3. **AUD-FE-ENV-03 (bloqueante operacional):** consulta `tipoDoc` para FE não está confirmada; no código F-01 somente NCE habilitada. Recuperação do envio indeterminado não fica operacional sem consulta confiável; impedir reenvio automático, registrar necessidade de verificação via gateway. Não inventar parâmetro `FE` sem comprovação.
4. **AUD-FE-ENV-04 (alta):** conferir compatibilidade do retorno real de `recepcion_de` com nomes de lote, CDC, mensagens e status; exibir valor apenas se realmente vindo do provedor. Se resposta não suportada, estado indeterminado e evidência sanitizada.
5. **AUD-FE-NUM-01 (alta):** NEX-048 reserva `001-002-0050000` no teste com contador `49999` antes da transmissão. Após rejeição, **não reciclar o mesmo número nem gerar outro silenciosamente**. Política de inutilização/correção fiscal posterior depende do fornecedor e de decisão específica; para teste manter histórico e ação segura no mesmo documento, sujeita à semântica validada.
6. **AUD-FE-SQL-01 (alta):** execução PostgreSQL das NEX-046/047/048/049 e rollback não comprovados. Não afirmar que a integração e o controle concorrente foram testados, nem orientar execução antes de revisão e autorização operacional.
7. **AUD-FE-PAYLOAD-01 (alta):** os campos comuns do JSON exemplo estão mapeados; conferir regressões e tipos no payload que sai da NEX-048, não só o objeto pré-numeração. `dInfoEmi,dInfoFisc,dFecEmNR` ficam `null` no código, apesar de preenchidos no exemplo pós-emissão; validar somente com contrato do gateway, não fabricar. 36 opcionais omitidos: não classificar como erro sem retorno concreto.
8. **AUD-FE-PAYLOAD-02 (média):** obrigatoriedade condicional do Manual SIFEN v150/NT disponível para receptor, forma de pagamento, presença e unidade fiscal; cenário de teste é PYG, contado, efectivo, cliente apto, produtos válidos, preços com IVA incluído e número de casa zero só em teste.
9. **AUD-FE-UX-01 (média):** modal técnico é diagnóstico temporário; confirmar não mostrar bearer, senha, headers privados; não dizer que sessão autenticada implica documento processado.

**Instrução de desenvolvimento fechada:** Claude deve corrigir SOMENTE achados concretos desta auditoria, usando AUD-FE-100 + AUD-FE-DECISION como matriz vinculante; evitar revisões repetidas e escopo de crédito, exportação, contratação pública e outros. Sem novos testes com credenciais reais, sem deploy, sem SQL no banco real. Enviar commit/SHA e parar para auditoria ChatGPT. O responsável executará homologação apenas no único ambiente real após autorização.

## Contrato confirmado del gateway — recepcion_de, validación y consulta FE (12/10/2026)

**Evidencia nueva entregada por el responsable:** pantalla Postman contra `POST /api/recepcion_de`, respuesta de rechazo por validación, respuesta de recepción exitosa y valor de consulta FE. Estos ejemplos reales del proveedor prevalecen sobre las hipótesis anteriores que exigían un CDC o número reflejado para certificar la **recepción**. No confundir recepción (lote emitido) con aprobación SIFEN (consulta posterior).

1. **Consulta de Factura Electrónica:** `POST /api/consulta_de` con `tipoDoc: "FE"` (confirmado). Seguir con `dEst,dPunExp,dNumDoc,dSerieNum` y Bearer. Implementar en `lib/facturacion/gateway.ts` `TIPO_DOC_CONSULTA.FE="FE"`, conservando NCE. Esto desbloquea reconsulta de FE y el plan de reconciliación para estados indeterminados. No habilitar reenvío de estado indeterminado sin verificar identidad y respuesta.
2. **Recepción aceptada por el gateway (ejemplo real):**
   ```json
   {"status":"success","message":"Documento recibido correctamente","nro_lote":"80020653-1-001-001-0017009-20261012151546-212066495"}
   ```
   `HTTP 2xx + status:"success" + nro_lote no vacío` confirma **recepción del documento para procesamiento en ese gateway**, aunque NO venga CDC ni campos de número separados, si la respuesta no contiene datos contradictorios. Persistir `nro_lote` y estado local `ENVIADO` (no `APROBADO`), registrar solicitud y respuesta. No fabricar CDC. `nro_lote` debe incluirse entre claves reconocidas del parser; el código actual solo contempla `lote/nroLote/numeroLote`. Respuestas success sin lote, CDC ni identificación documental siguen indeterminadas. Si la respuesta contiene identificadores incompatibles, prevalece indeterminado incluso si hay lote. Validar formato y longitud del lote con la restricción SQL actual (<=60).
3. **Rechazo validatorio del gateway (ejemplo real):**
   ```json
   {"status":"error","message":"Se detectaron valores inválidos en algunos documentos","aceptados":0,"rechazados":1,"response":{"Aceptados":[],"Rechazados":[{"001-001-0017007":{"iCondOpe":"Campo obligatorio requerido."}}]}}
   ```
   El parser debe entender `response.Rechazados[]` con objeto indexado por número fiscal `EEE-PPP-NNNNNNN` y valores `campo:mensaje`, y mostrar la ruta exacta de cada error, incluido campo obligatorio. Si `rechazados>0` y `aceptados=0`, clasificar error de validación del gateway y preservar documento/número e intento. Manejar respuestas parcialmente aceptadas por documento, nunca atribuir error o lote de otro documento. No usar un reenvío ciego: confirmar antes, y cuando corresponda mostrar ajustes necesarios sin sobrescribir payload fiscal inmutable.
4. **Token inválido:** imagen Postman muestra HTTP 400 `{"status":"error","message":"Token inválido"}` en `recepcion_de`. Es error de **autorización**, NO de validación del JSON ni rechazo fiscal. El código actual clasifica por status HTTP y podría tratarlo como `RECHAZO`; detectar el mensaje específico de token no válido/vencido y clasificar `AUTENTICACION` sin registrar rechazo de factura. Cuando sea seguro, reautenticar con `/api/login` y reintentar con token fresco **una vez**. No mostrar ni guardar token/credenciales, no depender de que el proveedor use siempre HTTP 401.
5. **JSON de transmisión** mostrado en la captura incluye campos numéricos y `dEst,dPunExp,dNumDoc,dFeEmiDE`, `iCondOpe` debe estar presente en el payload del NEXIT. El rechazo citado ejemplifica obligatoriedad; no demuestra que el parser acepte todas las demás claves opcionales. Conservar decisiones de `AUD-FE-DECISION` y escenario inicial: `001/002/0050000`, efectivo, PYG, IVA embutido y casa 0 de prueba si falta.

**Defectos concretos identificados en el código actual:** (a) `TIPO_DOC_CONSULTA` no incluye FE; (b) `CLAVES_LOTE` no incluye `nro_lote` normalizado como `nrolote`? Verificar: normalización elimina guion bajo, por lo que `nro_lote` ya coincide con `nrolote` — **no duplicar corrección innecesaria**; (c) `interpretarRecepcion` exige CDC o identidad, erróneo con el éxito real solo por lote; (d) `listaErrores` debe extraer errores anidados `response.Rechazados` con número y campo; (e) autenticación inválida 400 actualmente puede quedar tratada como RECHAZO. Validar estado de NEX-047 a NEX-050/rollback y longitud de lote antes de recomendar aplicación; no modificar migration ya aplicada.

**Entrega solicitada al Claude:** actualizar cliente del gateway, clasificación, form modal/lista, casos unitarios con estas respuestas sintéticas (sin datos personales ni bearer), y reporte del estado de `consulta_de` para FE. Mantener aislamiento por empresa, idempotencia, historial inmutable y ninguna emisión real desde Claude. Leer `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` pertinente. Commit/push y parar para revisión ChatGPT. No retomar campos del JSON fuera del alcance de la primera emisión.

## AUD-FE-UX-02 — reprovação da tela publicada e redesenho integral do formulário

**Estado: REPROVADO VISUAL E FUNCIONALMENTE pelo responsável (capturas de 12/10/2026).** O ChatGPT assume a falha da aprovação anterior sem evidência visual real. Esta auditoria confronta a tela da VM, código `app/(private)/facturas/nueva/page.tsx`, seu CSS e referências fornecidas da concorrência. **Não alterar gateway, payload, numeração ou migrations nesta tarefa**; preservar emissor existente.

**Achados específicos comprovados:**
- **UX-01 — busca equivocada de Clientes:** componente atual dispara `GET /api/facturas/clientes?q=` automaticamente enquanto campo está vazio e exibe uma lista de registros da empresa sem ato de «Buscar»; não há botão dedicado nem modal de pesquisa. Captura mostra «ALES S.A.» listado antes de pesquisa. O operador exige botão **Buscar cliente**, modal/selector com pesquisa por código, nome, documento, seleção explícita, limpar/trocar; após escolher, apresentar ficha fiscal resumida com razão social, RUC/DV, tipo de contribuinte, endereço, telefone/e-mail, número casa (0 de teste se ausente), aptidão/pendências, sem editar o cadastro mestre silenciosamente. Busca só quando acionada; sem listar todos por padrão.
- **UX-02 — busca equivocada de Produtos:** o formulário atual consulta `GET /api/facturas/productos?q=` e mostra cartões/lista de produtos automaticamente, mesmo sem busca, ocupando área central; não existe botão **Añadir producto** com seletor/modal dedicado. Exigir busca por código, SKU, GTIN e descrição, filtros úteis se já houver catálogos, selecionar por ação; não mostrar lista aberta até clique. Produto com classificação IVA ou unidade SIFEN ausente deve mostrar impedimento preciso + ação para corrigir em Productos, não simplesmente parecer selecionável.
- **UX-03 — detalhe de linhas incompleto:** `Linea` armazena apenas `producto` e `cantidad`; tabela mostra preço como texto fixo `l.producto.precio`, **não tem campo editável de preço unitário**, não mostra **unidade de medida** nem afetação/taxa IVA de modo operacional. O usuário exige tabela compacta com **Produto, Descripción, Afectación IVA, % IVA, Unidad, Cantidad, Precio unitario IVA incl., Subtotal, Acciones**, com **quantidade e preço unitário editáveis por linha** e unidade visível (editável só se houver conversões comerciais/SIFEN válidas); ao alterar valores recalcular total/IVA e alinhar contrato backend. Se preço negociável ainda não for aceito no backend, Claude deve confrontar `leerCuerpoFactura`, `prepararFactura`, `crearFacturaElectronica` e regra SQL atual e implementar suporte seguro, **sem confiar em preço do browser**, com validação de positivo, permissão de editar preço e snapshot fiscal, ou reportar decisão bloqueante específica. Não acrescentar IVA novamente (preço embutido). Não permitir quantidades inconsistentes com unidade, produto não classificado ou unidade SIFEN ausente.
- **UX-04 — data e formatação paraguaia:** captura concorrente com data `12/10/2026`; operador indica que em tela aparece `mm/dd/yyyy`. A página Git atual não possui input de data fiscal, pois a emissão é atribuída no servidor; não afirmar que este código originou o formato exibido sem identificar a tela exata. Entretanto, exigir **formatação visual `dd/MM/yyyy` em todas as datas mostradas no fluxo Facturas/Documentos**, `es-PY` e timezone coerente, sem depender do locale do Chrome. Manter valor ISO de transporte/DB e data/hora fiscal real definida pelo backend; caso proponha edição da data, obter autorização antes de mudar a regra de geração.
- **UX-05 — composição e visual:** screenshot publicada mostra títulos/sections empilhados, separações insuficientes, tabela vazia muito alta, layout pouco compacto e padrão visual inferior ao de Clientes/Productos/Catálogos. Construir formulário limpo e profissional com seção **Cabecera** (empresa/sucursal, punto expedición, código/numeração só na confirmação ou após envio, condição Contado-Efectivo, operação/presença, moeda PYG), **Cliente** (campo de resumo e botão Buscar), **Detalle de la factura** (botão Añadir producto, tabela com linhas editáveis), **Totales** (exento/exonerado/base/IVA e total destacados), **Información adicional**, barra de ações clara. Rótulos em espanhol PY; responsividade 375/768/desktop, alinhamento e estados de erro por campo, prevenção de perda de alterações e acessibilidade. Não copiar identidade visual do concorrente; entregar **melhor usabilidade** e aparência coesa com o Nexit.
- **UX-06 — modal fiscal:** preservar fluxo já aprovado `Grabar` → prévia calculada no servidor → modal-resumo → `Enviar factura` → modal técnico sem segredos → Documentos electrónicos. Grabar não consome número. Evitar mudança de API/histórico sem motivo; banco continua com RUC etc real.
- **UX-07 — lista Documentos electrónicos:** screenshot com oito KPI e zero documentos é comportamento de primeira instalação (não defeito factual). Mas mostrar painéis compactos, filtros e status bem hierarquizados, sem cartões quebrados desnecessariamente; nenhuma lista fictícia. Ajustar estilo em consonância com formulário, sem alterar estados fiscais.

**Critérios de aceite / evidência:** (1) Ao entrar, NENHUM cliente/produto é listado automaticamente. (2) Botões distintos **Buscar cliente** / **Añadir producto** abrem seleção dedicada e busca só mediante interação. (3) selecionar cliente exibe dados fiscais e permite trocar. (4) adicionar produto cria linha editável com quantidade, preço IVA incluído e unidade/IVA visíveis; total muda após alteração; backend valida recalculando e não aceita preço arbitrário sem regra aprovada. (5) formulário não emite cliente/producto inapto. (6) datas exibidas `dd/MM/yyyy`; nenhum `mm/dd/yyyy`. (7) prévia/valor enviado usa o que foi efetivamente validado. (8) layout coerente e responsivo, sem cabeçalhos duplicados nem grandes vazios. (9) capturas ANTES/DEPOIS **reais** em navegador são necessárias para homologação, não declarar visual conferido só por build; se Claude não tem browser da VM, fornecer comparação local clara e assinalar que responsável valida na VM. (10) sem alterações desnecessárias em SQL/gateway e sem acessos Claude à VM.

**Diretriz de execução:** Claude deve ler `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progresso e esta auditoria, confrontar APIs e modelos de catálogo reais e padrões visuais existentes antes de editar; implementar UX-01..07 em uma entrega coesa, sem páginas falsas nem dados mockados. **Se preço negociado exigir uma decisão nova de negócio** (regras por perfil, desconto, override), apontar concretamente e não inventar autorização. Commit/push na branch oficial, tsc/ESLint/build + verificações locais; parar para auditoria ChatGPT. Esta reprovação visual não revoga decisões de emissão, nem é autorização de deploy/SQL.

## AUD-FE-UX-03 — reprovação da segunda interface e contrato definitivo de campos e seletores

**Status: REPROVADO pelo responsável após capturas reais de 12/10/2026.** O redesenho c52c4cd NÃO passou na homologação visual nem de operação. ChatGPT confrontou screenshots com `app/(private)/facturas/nueva/page.tsx`, `lib/facturacion/emision.ts` e `lib/facturacion/payload-fe.ts`. Esta decisão **substitui** as regras anteriores de seletor com busca mínima de 2 caracteres e apresentação combinada dos pagamentos. Não publicar o mesmo formulário apenas trocando borda/CSS. Manter fluxo de envio e cálculo funcionais.

### Problemas confirmados e solução fechada

1. **Visual sem padrão aceitável:** remover borda negra de destaque no KPI TOTAL de Documentos electrónicos e qualquer contraste ornamental pesado; usar padrão leve de cards de Clientes/Productos/Catálogos, hierarquia limpa, tipografia consistente, espaços equilibrados, controle de overflow, responsividade. A ausência de documentos é natural e não deve ser preenchida com mocks. O trabalho demanda revisão visual real em 1440, 768 e 375 px; testes de código NÃO comprovam aparência.
2. **Cabeçalho — data:** retirar de dentro do formulário caixa grande contendo `12/10/2026 · la fija el sistema al enviar`; não mostrar explicações de implementação ao operador. Data fiscal não é editável na etapa atual e é atribuída pelo servidor ao enviar: se necessário exibir uma linha compacta `Fecha: 12/10/2026`, sem texto explicativo; sempre `dd/MM/yyyy` e hora de emissão real calculada ao enviar. Não exibir input `mm/dd/yyyy`.
3. **Cabeçalho — número:** remover totalmente bloco `Número: Se asigna al enviar la factura` do formulário de entrada. Somente mostrar número após reserva/confirmar emissão ou na prévia se já existente; nunca reservar ao apenas abrir/Grabar. Não colocar placeholders explicativos em lugar de dados do negócio.
4. **Sucursal/estabelecimento/punto expedición:** O código possui `sucursales.establecimiento_sifen=001` e busca exclusivamente pontos ativos em `fe_puntos_expedicion` por empresa/sucursal. Estabelecimento **001** e ponto **002** são entidades distintas; tela na VM afirma não haver pontos porque não há registro ativo correspondente (ou está fora de alcance). A decisão já aprovada é empresa/sucursal TESTE `001`, punto `002` e último número **49999** → primeira `0050000`. NÃO inventar ponto no frontend, NÃO esconder o erro. A tarefa inclui diagnosticar configuração real via SQL/seed/roteiro versionado e entregar configuração explícita e segura de ponto 002 para o responsável aplicar, sem executar SQL ou alterar contador existente sem conferir emissão prévia. Não insistir que cadastro de sucursal 001 basta para existir ponto 002.
5. **Condição versus forma de pagamento:** campos separados, com rótulos **Condición de la operación** (por ora Contado, código `iCondOpe=1`) e **Forma de pago** (por ora Efectivo, `FormaPago[].iTiPago=1`). Não juntar os dois em único select. Mesmo valores fixos devem ter representação correta, com componentes compactos de leitura ou selects individuais conforme padrão visual. Moneda PYG pode ser um campo discreto só-leitura, sem caixa inútil grande.
6. **Tipo de transacción e Indicador de presencia:** o código atual só declara `TIPOS_TRANSACCION={1,2,3}` e `INDICADORES_PRESENCIA={1,2,3,4,5,6}`. O responsável exige o catálogo integral que se aplique a FE no Manual Técnico SIFEN e Notas Técnicas vigentes. ChatGPT **não está autorizando códigos inventados**: a implementação deve confrontar catálogo normativo de `iTipTra`/`iIndPres` e, em caso de inexistência de opção de norma, documentar evidência técnica específica antes de criar código. Não confundir enum completo com todos os valores sempre aplicáveis. Separar valores permitidos por tipo FE/condição fiscal; manter enums backend/cliente idênticos e validar. Verificar se todas as seis presenças atuais já representam catálogo completo aplicável; não adicionar artificialmente por reclamação.
7. **Seletor de clientes — escolha sem saber o nome:** botão **Buscar cliente** abre seletor com **listagem paginada de todos os clientes elegíveis da empresa** imediatamente, com busca opcional por código, razão social, nome fantasia, RUC com/sem DV ou CI/documento; filtros atuam sobre lista; nenhum requisito de digitar 2 caracteres para visualizar. Seleção por clique, inclusive caso só exista um cliente; não pré-selecionar sem escolha do operador. Mostrar situação/aptidão SIFEN e razão de bloqueio, acessos por empresa e escopo. Usar paginação/limite no servidor e busca indexável, não carregar toda base sem paginação. Reutilizar cadastro de Clientes e padrões existentes.
8. **Seletor de produtos — mesmo padrão:** botão **Añadir producto** abre grade paginada imediatamente, listando produtos ativos da empresa com SKU, descrição, GTIN, código barras, unidade, preço IVA incluído, tributação e aptidão. Pesquisa opcional por código, descrição, GTIN, códigos alternativos/barra; sem obrigação de digitar 2 caracteres; paginação server-side. Permitir adicionar com uma ação e atualizar tabela sem sair da factura; impedir produto inapto com mensagem exata e link a Productos. Não listar produtos soltos no formulário.
9. **Linhas da factura:** preservar colunas produto, afetação, IVA %, unidade, quantidade, preço IVA incluído, subtotal e remover, com inputs alinhados, totais recalculados e edição de preço só com permissão de negócio. Não fixar nomes/valores comerciais. Os controles devem parecer parte de um ERP pronto, não um protótipo.
10. **Cabeçalho sem verbosidade:** eliminar frases operacionais extensas sobre como o sistema atribui números, como calcula impostos ou limita a fase. Exibir somente campos de negócio, validação contextual e um aviso real quando necessário; não duplicar rótulos ou painéis.
11. **Antes de enviar:** preservar `Grabar → modal resumen → Enviar → modal técnico → Documentos electrónicos`. Nenhum número consumido no Grabar. Não modificar a arquitetura do gateway, SQL de emissão ou cálculos fiscais por mero redesenho.

### Critérios objetivos / evidências para auditoria

- KPI de Documentos sem borda negra e sem efeito visual desproporcional; grid responsivo coerente.
- Cabeçalho sem `Se asigna al enviar` e sem texto `la fija el sistema`; data legível no padrão PY; condição e pagamento independentes.
- Sucursal do TESTE `001`, punto TESTE `002` devem aparecer juntos somente com configuração real, nunca por hardcode de UI. Consulta e inicialização segura documentadas, prontas para operação pelo responsável.
- Selector Cliente abre lista mesmo com `q=""`, com paginação; admite pesquisa por nome, RUC e CI, sem filtro obrigatório mínimo. Selector Producto equivalente e permite adicionar.
- Validar corretamente todos os códigos de `iTipTra`/`iIndPres` aplicáveis no Manual, sem inventar nem supor quantidade; catálogo e backend consistentes.
- Visual avaliado por capturas reais da versão publicada em desktop/mobile. Se Claude não dispuser de browser da VM, não declarar homologação. Não solicitar capturas do responsável antes de concluir a implementação/código revisado.

**Escopo do Claude:** ler `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progresso, esta especificação; confrontar APIs e SQL atuais; implementar UX e consultas paginadas, obter catálogos fiscais normativos, corrigir apresentação de cabeçalho, sem alterar migrations já aplicadas ou acessar VM. Commit/push e parar para ChatGPT auditar. O responsável opera implantação. A permissão especial de alteração de preço permanece sem atribuição automática; não presumir decisão por perfil.

## AUD-FE-UX-04 — navegação com alterações não salvas e disciplina SQL incremental

**Revisão ChatGPT das capturas reais (diálogo 'nexit.proceit.net says', botão OK/Cancel) e do código vigente na branch. Estado REPROVADO para navegação interna.** Origem confirmada: `lib/ui/proteger-cambios.ts`, hook `useProtegerCambios(sucio)` em `app/(private)/facturas/nueva/page.tsx`, chama `window.confirm(mensaje)` na captura de clique em `a[href]`. A página usa `Link href="/documentos"` em Cancelar e em outros pontos; por isso surge diálogo nativo com nome do domínio, não um modal Nexit. O `beforeunload` é distinto e não permite personalizar mensagem.

**Requisitos fechados para Claude:**
1. Substituir `window.confirm` **somente em navegação interna** por componente de diálogo profissional do Nexit, com título `¿Descartar cambios?`, corpo `Hay cambios sin guardar en esta factura. Si sale ahora, perderá la información ingresada.`, ações `Seguir editando` (default, foco) e `Salir sin guardar` (destrutiva). Modal acessível (dialog, aria-modal, gestão de foco, Escape cancela, sem atravessar click/scroll, retorno do foco), responsivo e no padrão de UI de Clientes/Productos. Não usar `alert`, `confirm` ou `prompt` em ações internas.
2. Centralizar proteção para Cancelar, links de sidebar, breadcrumb e links internos da tela: reter destino e impedir a navegação até confirmação; depois navegar **uma única vez**, sem repetir interceptação e sem perder query; ignorar âncoras do mesmo documento, downloads, links externos, ctrl/cmd-click e navegação sem modificações. Evitar hack de mutação de DOM ou loop recursivo de clique; revisar compatibilidade App Router. Testar cenários de navegação interna, cancelamento, confirmação, edição após cancelamento, mudança de cliente, consulta de Produtos e múltiplos cliques. Não perder mudanças silenciosamente.
3. Preservar `beforeunload` **somente** para recarregar/fechar aba/sair do site, como permissão do navegador. Não prometer modal customizado nesses casos. O histórico Voltar/Avançar interno pode exigir mecanismo de bloqueio próprio; se não houver API segura, documentar limitação sem afirmar cobertura inexistente e não bloquear browser com popstate frágil.
4. Avaliar detecção de dirty atual: `resultado === null && (cliente !== null || lineas.length > 0 || infoAdicional !== "")`. Também deve considerar alterações de sucursal, ponto, tipo de transação, presença, forma de pagamento e valores dos itens, **comparando com estado inicial carregado**, para não considerar preseleções do servidor como edição voluntária; fechar modais de seleção não deve marcar sujo sem seleção. Após sucesso/finalização não continuar bloqueando a navegação.
5. Repassar visual da tela real: compactação, texto de negócio, modal, tabelas, foco e rolagem na faixa de 1440/768/375 px. A estética da tela e a do modal exigem validação real no navegador pelo responsável. Não supor que os testes locais comprovam a aparência.

**SQL / migrações — REGRA ABSOLUTA:**
- A captura operacional da VM, apresentada pelo responsável, mostra `ya aplicada NEX-046` … `ya aplicada NEX-051`, sem pendências e com build/deploy bem-sucedido. Portanto **NEX-051 e todas as anteriores JÁ FORAM EXECUTADAS**. Não editá-las, renomeá-las, mudar checksum ou reaplicá-las; o runner oficial verifica `schema_migrations`.
- Esta tarefa de confirmação de navegação **não exige SQL novo**. NÃO criar NEX-052 ornamental. Se ao examinar o comportamento surgir alteração persistente realmente necessária, apresentar primeiro justificativa, schema, impactos, validação e reversão; somente após aprovação criar **NEX-052** incremental, transacional e idempotente, sem executar scripts anteriores nem recriar tabelas/dados existentes.
- Em deploy, só migrar se houver nova migration autorizada e listada como `pendiente` no runner oficial. Não instruir a usar SQL direto ou resetar sequência/contador e não tocar no ponto de expedição `002` neste reparo visual.

**Critérios de aceite:** nenhum diálogo de `nexit.proceit.net says` em navegação interna com dirty; `Seguir editando` mantém dados; `Salir sin guardar` vai ao destino correto; refresh continua sujeito ao browser; sem regressão fiscal (JSON, gateway, número, IVA, permissões, modal Grabar→Enviar), sem alteração dos NEX-001…051; provas locais dos fluxos e relato honesto de ausência de homologação em navegador. Claude deve sincronizar branch, reler `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progresso pertinente e esta decisão, implementar somente escopo aprovado, commit/push e parar para auditoria ChatGPT.


---

## ADENDA 14/10/2026 — Nueva factura electrónica: ampliación funcional solicitada

**Fonte:** seis capturas anexadas pelo responsável nesta conversa (duas telas da **versão nova** e quatro referências da versão anterior/externa) e pedido verbal de preservar o **layout novo**. As imagens originais estão **somente na conversa**, não foram arquivadas como binários no Git; não declarar capturas versionadas. Dados de clientes/produtos nas imagens **não devem ser copiados** para Git. Este acréscimo **substitui o limite comercial de escopo futuro** (PYG/Contado/Efectivo) mediante desenvolvimento e auditoria próprios; **não altera automaticamente** o escopo já entregue/auditado da FAT-E1/E2 nem libera envio real.

### Contexto real auditado: UI, API, motor e SQL

- `app/(private)/facturas/nueva/page.tsx` conserva layout novo em cartões, pesquisa com combobox, resumo lateral e aviso de pendências; `puntoId` vem de `/api/facturas/catalogos`. Esse GET só devolve pontos **ativos** de `fe_puntos_expedicion` da sucursal autorizada. Na captura a sucursal escolhida não apresenta ponto; não inventar ponto 001.
- `NEX-048` explicitamente **não insere pontos**: cadastro/ativação inicial é responsabilidade controlada, exigindo `ultimo_numero` correto (incl. emissões de outros sistemas), para evitar duplicidade. Identidade do ponto e numeração são protegidas por triggers.
- `emision.ts`, `payload-fe.ts` e `page.tsx` forçam `moneda=PYG`, `condicion=Contado`, `FormaPago=Efectivo` e 1 pagamento. `catalogos` oferece somente `TIPOS_TRANSACCION 1–4`; **catálogo técnico completo 1–13** está em `CATALOGO_TIPOS_TRANSACCION`, mas códigos 5–13 têm regras próprias, não devem ser liberados com o cálculo genérico de mercadorias.
- Produto incompleto hoje é bloqueado até em seleção: faltam `unidad_sifen`, `afectacion_iva`, preço de referência PYG. O backend lê somente cadastro, não aceita substituição fiscal informada por item pelo operador; preço só pode mudar com permissão `FACTURACION_ELECTRONICA.PRECIO`.
- `NEX-047` guarda `moneda`, `total`, data e payload imutável; `NEX-048` fixa número/data na função SQL e atualmente o servidor grava sempre PYG. Alterar condições, moedas e item requer remodelar contratos e garantir snapshot e não duplicar numeração.
- A decisão comercial [Tipos de cambio manual](../v1/homologacao-visual/DECISAO-LISTAS-PRECIO-CAMBIO-MANUAL-2026-10-12.md) define cotação **PYG por uma unidade da moeda escolhida**; não pressupor taxa automática.
- [Matriz fiscal FAT-E1](MATRIZ-FISCAL-FE-E1-2026-10-14.md) mantém pendências **P-02, P-11 e P-12**, que proíbem suposição sobre contrato do gateway, redondeos e gravado parcial. Não comprometer 3.186 simulações TS nem as provas CI de NEX-054/055.

### Requisitos funcionais propostos para a experiência completa

| ID | Grupo / componente (espanhol PY) | Comportamento solicitado e regra de negócio |
|---|---|---|
| FE-UX-01 | **Operación — Sucursal / Punto de expedición** | Manter escolha de sucursal e ponto autorizados; diagnosticar ponto inexistente/inativo com link contextual **somente se** o operador tiver permissão de configurar. Não permitir informar código ou último número aleatoriamente na fatura; administração fiscal separada, validação de estabelecimento/timbrado/numeração e auditoria. Indicar ponto ativo / última sequência sem expor segredos. |
| FE-UX-02 | **Condición de la operación** | Habilitar **Contado / Crédito** conforme contrato fiscal. Se Crédito: `Condición del crédito` (Plazo/Cuotas), `Plazo (días)`, data de vencimento ou `Cantidad de cuotas`; quando Cuotas: grade de número, valor e vencimento; somatório deve conciliar exatamente com total; sem `FormaPago` contado aplicada indevidamente a crédito. Conferir códigos SIFEN E601–E605 e o formato do gateway antes de emitir. |
| FE-UX-03 | **Forma de pago** | Para Contado, oferecer formas válidas do catálogo SIFEN/gateway (não só Efectivo) com campos condicionais documentados: ex. transferência, cheque, cartão etc., **somente se contratos/validações específicos estiverem implementados**. Múltiplas formas e valores apenas após regra de conciliação e payload `FormaPago[]` testados; impedir que tipos não implementados sejam transmitidos. |
| FE-UX-04 | **Moneda / Tipo de cambio** | Seleção PYG, USD, BRL, e outras moedas **habilitadas no cadastro** se o contrato permitir; mostrar cotação manual (PYG por 1 unidade estrangeira) e equivalente PYG em tempo real, data/vigência e fonte; opção de digitar/substituir cotação somente com permissão e motivo auditado. Congelar cotação por documento, controlar precisão sem floats, validar obrigatórios condicionais `cMoneOpe`, `dCondTiCam`, `dTiCam`, `dTotalGs`, `dTiCamTiPag` conforme MT/NT e JSON **confirmado**. Não converter preços de lista arbitrariamente nem perder moeda/cotação originais. |
| FE-UX-05 | **Fecha de emisión / Competencia** | Exibir data/hora de emissão fiscal como dado controlado pelo servidor/fornecedor, não editável livremente para burlar período/assinatura. Pedido sobre **competência/período** deve ser diferenciado de `fecha_emision`: se for período da prestação/serviço, expor `Competencia (mes/año)` opcional **somente após confirmação do significado e mapeamento**; caso se refira à data de emissão, definir janela/validações legais e contrato antes de permitir edição. |
| FE-UX-06 | **Tipo de transacción** | Apresentar catálogo completo 1–13 **como informação de possibilidades**, com códigos especiais desabilitados + motivo até que tenham validação fiscal e payload próprios; liberar uma a uma as modalidades realmente aplicáveis a **Factura Electrónica**, sem tratar Compra/Autofactura, antecipos, doações ou câmbio como simples venda de mercadoria. Tipo deve ser coerente com a mercadoria/serviço e o receptor. |
| FE-UX-07 | **Detalle de la factura — ajuste fiscal por item** | Manter busca e avisos úteis, mas **permitir adicionar** item com campos de cadastro incompletos como `Pendiente de completar`; na linha oferecer descrição fiscal, unidade SIFEN vigente, afectación (Gravado, Exonerado, Exento, Parcial), `% IVA`, proporção quando parcial, quantidade e preço na moeda da fatura. Validar coerência cruzada servidor/MT; não emitir documento com campo obrigatório faltante. Para unidade, respeitar conversão/apresentação do item e estoque: não trocar unidade base nem fator silenciosamente. |
| FE-UX-08 | **Actualizar producto (consentimento explícito)** | Após ajuste dos dados fiscais na linha: escolha por campo `Solo en esta factura` (**default**) ou `Guardar también en Productos` mediante confirmação explícita, permissão de edição do mestre, ACL `empresa_id`, validação das regras do módulo Productos e trilha de auditoria. Gravar snapshot imutável no documento e **não** sincronizar dados errados de uma transação para o cadastro. Se permissão ausente, só permitir ajuste do documento com permissão fiscal específica aprovada. |
| FE-UX-09 | **Composición y datos opcionales** | Grupo recolhível por item e outro para cabeçalho, exibindo opcionais **somente se aplicáveis**: `dInfItem`, detalhes complementares de mercadoria/serviço, GTIN, lote, vencimento, descontos/antecipos, informações adicionais; dados especializados de importação, setor ou operação devem respeitar contratos e condição fiscal, sem inventar campos obrigatórios. Não confundir BOM (`producto_componentes`) com detalhamento fiscal do item. |
| FE-UX-10 | **Resumen y revisión** | Manter resumo lateral; alternar moeda com total original + contravalor PYG e taxa utilizada, IVA/bases, vencimentos e pagamento/condição. Indicadores de `dato faltante`, `información completa` e `sin permiso`; revisão confirma o payload pelo backend sem reservar número; transmissão só após confirmação e com idempotência. Não marcar `SIFEN APROBADO` por mera aceitação do gateway. |

### Prioridade, dependências e divisão de entregas

**Fase A — UX fiscal da emissão em PYG, sem mudar cálculo FAT-E1/E2:** diagnóstico claro do ponto de expedição; selecionar produtos incompletos e editar **somente campos fiscais do item** sob política segura de permissões, com opção separada de confirmação de atualização do mestre; detalhamento opcional conservador e revisão/snapshot. Exigir que escolha fiscal inválida continue bloqueando a transmissão. Se for necessário DDL, usar migration NOVA, nunca editar NEX-001…055 (já registradas no banco operacional pelo responsável).

**Fase B — Crédito com plazo/cuotas e Formas de pago de Contado:** mapear MT/SIFEN e JSON do fornecedor antes de habilitar; funcionalidades condicionais e cálculos decimais, vencimentos, parcelas, serialização, validações e regressões de crédito e múltiplas formas. **Sem simular pagamento de crédito como contado.**

**Fase C — multi-moeda e câmbio:** integrar exclusivamente `Tipos de cambio` manual já aprovado; PYG, USD, BRL; converter/snapshot/câmbio e totais/IVA/precision com contrato e evidência. Não liberar apenas com campo de UI. **P-02/P-12** exigem confirmação do gateway para emitir.

**Fase D — tipos especiais (5–13) e composição/opcionais avançados:** matriz por tipo/doc, obrigatoriedade condicional, suportes fiscais e regras de negócio específicas; liberar apenas modalidades válidas e comprovadas. Não extrapolar FE para outros tipos de DE.

**Testes de aceite obrigatórios:** sem ponto → diagnóstico e bloqueio; ponto inativo/outro tenant → nunca selecionável; numeração não regride; item incompleto pode ser escolhido mas não emitido até validação; edição por documento não altera mestre; confirmação de gravar mestre com ACL e auditoria; crédito por prazo e por N cuotas com soma exata; troca PYG/USD/BRL com taxas e datas; moeda sem taxa → bloqueio; várias formas contado com conciliação; taxa/afectación/unidade condicional fiscal; snapshot/idempotência/reserva de número; layout responsivo e mesma hierarquia de cartões; não regressão da emissão **PYG/Contado/Efectivo** e dos estados SIFEN. Testar com mocks e PG descartável quando requerido, **nunca** VM/PG real pela IA.

**Pendências que NÃO podem ser resolvidas por adivinhação:** (i) o termo `competencia` usado no pedido pode significar período de serviço ou edição da emissão; confirmar semanticamente antes de codificar; (ii) classes/condicionais de formas de pagamento do JSON do fornecedor não comprovadas para todas as formas; (iii) cotação aplicada à moeda do documento e pagamentos em moeda diferente requer decisão e validação gateway; (iv) pontos de expedição/última numeração dependem de dados operacionais reais do emissor. Não criar presets de pontos ou timbrados.


---

## DECISIÓN CONTRACTUAL MFE-02 — nombres y tipos JSON idénticos al Manual SIFEN (15/10/2026)

**Confirmado expresamente por el responsable:** todos los campos JSON del gateway tienen **los mismos nombres y tipos** de campos del Manual SIFEN. El ejemplo entregado era una factura particular que **no incluía otros campos porque no correspondían a esa operación**. No deducir falta de soporte del gateway por ausencia en el ejemplo. Esto **reemplaza cualquier frase previa en este documento** que exija conseguir un ejemplo adicional del proveedor para implementar Crédito, Plazo, Cuotas, cheque, tarjeta, moneda extranjera o descuentos solo porque no aparecieron en el ejemplo. La estructura de arrays/grupos se arma siguiendo el contrato JSON del NEXIT y los nombres/tipos MT, sin inventar sinónimos.

**Fuente normativa y matriz vinculante:** [MFE-02 — matriz maestra completa](MATRIZ-MAESTRA-FE-TELA-JSON-SQL-SIFEN-2026-10-15.md), sección 0, 117 claves JSON y campos complementarios del MT. ChatGPT especifica y audita; Claude implementa **una fase por vez**: MFE-B1 (Crédito Plazo/Cuotas), B2 pagos, C monedas/tasa, D1 descuentos, D2 opcionales, E especiales.

**Consecuencia inmediata:** para MFE-B1 implementar los grupos obligatorios y condicionales del Manual con los **mismos nombres y tipos** en el JSON, persistir snapshot, validar suma/fechas/tasa y preservar PYG/Contado/Efectivo. **No bloquear la emisión Crédito con el argumento genérico `CONTRATO_GATEWAY_NO_CONFIRMADO` debido a que el ejemplo no contiene Cuotas.** Seguir bloqueando una transacción concretamente inválida, una funcionalidad aún no implementada o discrepancias reales de cálculo/contrato/norma. Esto no prueba aceptación SIFEN y **no autoriza emisión real por la IA**.

**P-02/P-11/P-12 continúan abiertas en cuanto a valores/cálculos** por diferencias concretas detectadas entre JSON funcional, MT/NT y XML, que no se resuelven por la equivalencia de nombres/tipos. No ocultarlas, y no modificar valores documentados sin resolución específica. No acceder a VM, no aplicar migrations ni iniciar suites completas salvo pedido expreso.
