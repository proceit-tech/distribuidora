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
