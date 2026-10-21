# Decisões CASA MINGO — Nota de Crédito / item DESCUENTO / KuDE NCE
**Data:** 20/10/2026. **Origem:** confirmação expressa do responsável após mensagens e áudio de José Franco. **Estado:** escopo aprovado; implementação NÃO realizada. Desenvolvimento por Claude, auditoria ChatGPT, VM/homologação pelo responsável.

## 1. FORA DE ESCOPO — proibição de tarefas nesta rodada
- NÃO alterar ambiente de teste SIFEN/gateway, trocar empresa/RUC, criar ambiente separado ou corrigir os dados exibidos do prestador nesse ambiente.
- NÃO alterar logotipo no teste: o cliente verá seu logotipo no ambiente de produção; não abrir tarefa para forçar logo da CASA MINGO no gateway de terceiros.
- NÃO alterar layout/modelo de KuDE de FE: não mexer em nome DISTRIBUIDORA DEL PARAGUAY, coluna Cod. Barra, largura de Código, limite de uma folha, 23 itens ou quaisquer outros pedidos de apresentação do KuDE. Não reescrever a integração FE que já existe.
- O único trabalho relacionado a KuDE autorizado nesta rodada é fazer o **KuDE da NCE** ficar acessível, usando o visor/API existentes e sem regressão FE.
- Itens não relacionados ao KuDE (foco da quantidade, desconto na FE por linha e geral, endereços e seleção total das linhas na NCE) continuam no backlog original, não fazem parte desta alteração isolada.

## 2. ITEM DESCUENTO — DECISÃO APROVADA
- Criar item identificável **DESCUENTO** para o fluxo de **NCE por motivo Descuento**. É um item conceitualmente não estocável: quantidade fiscal/comercial **1**, valor unitário igual ao **monto a acreditar** informado pelo operador (na moeda da FE), e **sem lançamento ou alteração de estoque**.
- A UI deve permitir informar apenas o valor desejado para a NCE; não obrigar usuário a marcar um produto original e editar o valor por linha quando escolhe este fluxo.
- O item deve exibir o nome DESCUENTO claramente na revisão da NCE e no detalhe fiscal quando o contrato permitir. Distinguir o **item de interface/catálogo** do **detalhe fiscal da NCE**: nunca inserir uma linha fiscal arbitrária sem vínculo seguro com a FE original.
- Validar que o valor do desconto > 0, respeite o saldo acreditável da factura, o motivo 3, os demais bloqueios de NCE pendente e a regra vigente de motivo fixado.
- Conservar a FE original, CDC de referência, receptor, moeda/câmbio original, controle de saldo, idempotência e numeração. No fluxo de desconto/bonificação, nenhuma movimentação de estoque.
- A decisão atual não inclui criar um segundo SKU chamado BONIFICACION. **Bonificación (motivo 4)** continua suportada como motivo; desenhar sua operacionalização por valor usando o mesmo tratamento contábil/fiscal seguro, sem inventar cadastro extra.
- **Limitação concreta do código atual:** `lib/facturacion/nce.ts`/SQL vinculam `linea` a um ordinal da FE original; `lib/facturacion/payload-nce.ts` constrói `Detalles` a partir dos itens originais, herdando código, unidade e IVA. Para aceitar o item DESCUENTO, adaptar a validação, o mapeamento da NCE ao documento referenciado e as regras de tributos/saldos. A simples criação de uma ficha `productos` DESCUENTO não habilita a NCE hoje.
- **DECISÃO POSTERIOR E VINCULANTE do responsável:** na NCE por motivo 3/4, emitir **somente um item DESCUENTO**, quantidade 1, valor digitado e **IVA 10% fixo (gravado 10%)**, sem rateio por produtos originais e sem itens fiscais auxiliares. Permitir remover as linhas originais na UI via `Seleccionar todos` + `Eliminar seleccionados`, sem afetar a FE original. Se houver linhas originais ainda incluídas com o serviço, bloquear emissão para permitir uma NCE apenas com DESCUENTO.
- **RISCO FISCAL NÃO HOMOLOGADO:** IVA 10% fixo pode não corresponder ao IVA da FE original de 5% ou exenta. Não afirmar conformidade SIFEN sem teste real e verificação fiscal, não modificar silenciosamente a opção decidida. Manter limite de crédito, motivo, CDC e vínculo da FE.

## 3. KUDE NCE — ÚNICA EXCEÇÃO À PROIBIÇÃO KUDE
- O problema não é apenas o botão FE; foi **confirmado no código** um bloqueio em vários pontos:
  1. `lib/facturacion/kude-visor.ts`: `kudeDisponible` é `tipo === "FE"`.
  2. `lib/facturacion/shared.ts`: `obtenerKude` rejeita todo `doc.tipo !== "FE"`, e `nombreArchivoKude` força `KuDE-FE-`.
  3. `lib/facturacion/gateway.ts`: body de `POST /api/kude` envia `tipoDoc: "FE"` fixo.
  4. `app/(private)/documentos/page.tsx`: título `KuDE · Factura`, arquivo `KuDE-FE`, rótulos e mensagem de indisponibilidade codificados para FE.
  5. **ERRO ENCONTRADO:** o código atual exige `tipOpe` no gateway e o extrai de `iTiOpe`. **O contrato corrigido pelo responsável não inclui `tipOpe` nem para FE nem para NCE**. Remover essa dependência da solicitação do KuDE, sem alterar o payload de emissão fiscal.
- Escopo funcional: no listado `Documentos electrónicos`, oferecer o mesmo botão/visor de KuDE para documentos **NCE APROBADA com CDC próprio válido**, exclusivamente dentro de empresa/sucursal/permissões da sessão. Usar **identidade fiscal da NCE**, nunca número/CDC da FE associada. Retornar `KuDE-NCE-EEE-PPP-NNNNNNN[-SERIE].pdf`; título `KuDE · Nota de crédito`.
- **Contrato de requisição CONFIRMADO diretamente pelo responsável (20/10/2026):** `POST /api/kude` usa os MESMOS cinco campos para FE e NCE: `dEst`, `dPunExp`, `dNumDoc`, `dSerieNum`, `tipoDoc`. **Não enviar `tipOpe`**. O único campo que muda por tipo é `tipoDoc`, com `"FE"` ou `"NCE"`. Os números devem vir do documento persistido, mantendo zeros à esquerda. Não inventar parâmetros extras.

```json
{
  "dEst": "001",
  "dPunExp": "003",
  "dNumDoc": "0009001",
  "dSerieNum": null,
  "tipoDoc": "FE"
}
```

```json
{
  "dEst": "001",
  "dPunExp": "003",
  "dNumDoc": "0009001",
  "dSerieNum": null,
  "tipoDoc": "NCE"
}
```

- A resposta de sucesso segue o contrato já implementado para FE (`status:"success"`, `CDC` próprio do documento e `kude` Base64). Confirmar operacionalmente o KuDE NCE no gateway antes de declarar homologação; sem PDF falso.
- Reutilizar os limites, checagem de `CDC` retornado igual ao CDC próprio da NCE, decodificação Base64 segura, PDF íntegro, token/credenciais da empresa, uma renovação 401, no-store, solicitação nova ao abrir e baixar, isolamento de sessão e ausência de persistência de KuDE.
- NÃO mudar comportamento da FE, layout, colunas, logo, série, gateways configurados, numeração, banco, estoque nem SIFEN. O cliente verá o KuDE tal como o gateway de teste gerar.

## 4. ACEITE
1. FE APROBADA + CDC: KuDE e comportamento funcional existentes **preservados**, enviando apenas os cinco campos do contrato corrigido (`tipoDoc:"FE"`, sem `tipOpe`).
2. NCE APROBADA + CDC: botão KuDE disponível e visor com PDF da própria NCE; impressão/download, nome `KuDE-NCE`; nenhuma troca de documento na UI.
3. NCE PENDIENTE/RECHAZADA/sem CDC, outra empresa/sucursal ou sem permissão: não oferecer ou negar seguro, sem chamada insegura ao gateway.
4. Mock do gateway valida **exatamente os cinco campos** (sem `tipOpe`), `tipoDoc` FE/NCE, autenticação, CDC próprio, Base64/PDF, erro, timeout e isolamento. **Homologação real somente pelo responsável**, se gateway oferecer KuDE NCE.
5. DESCUENTO: somente uma linha de serviço, valor livre positivo, quantidade 1, IVA 10% fixo, sem estoque, sem exceder saldo; não alterar a FE original. Atenção: taxa fixa ainda requer validação fiscal em casos de FE com IVA 5%/exento/misto.
6. Não abrir PR/issue para alterar identidade do ambiente de testes, logotipo nem layout de KuDE FE.

## 5. REGLAS FUNCIONALES DEFINITIVAS — FE, STOCK, NCE Y EVENTOS (20/10/2026)

> Esta sección SUPERA las dudas preliminares del mismo 20/10/2026. Las respuestas del responsable son vinculantes. Estado: especificación cerrada en los puntos indicados, **NO IMPLEMENTADA/HOMOLOGADA**; no modificar datos ni VM sin una entrega auditada.

### A. Facturación FE + stock

1. Al elegir una mercadería, el sistema **consulta en cuáles depósitos/estados tiene stock DISPONIBLE de propiedad PROPIO**; no considerar físicamente disponible si está reservado, en cuarentena o tránsito. Solo permitir operar dentro de los depósitos autorizados de la empresa/sucursal y usuario.
2. **Impedir la venta por encima de la suma del stock DISPONIBLE de depósitos autorizados**. Bloqueo en backend/BD bajo concurrencia. Cada porción se descuenta del depósito de origen real, nunca del stock de otro depósito ni del saldo reservado o en tránsito; jamás permitir saldo negativo.
3. **Dar de baja el stock al emitir la factura**, en el acto confirmado por el operador. Registrar un movimiento normal de salida de Inventario/Kardex vinculado inequívocamente a la FE, sin doble baja por reintento, actualización de estado, consulta o click repetido. No reducir stock al agregar un producto a una factura aún no emitida.
4. **DECISIÓN CONFIRMADA: distribución automática entre depósitos.** Al vender un producto con stock distribuido, NEXIT asigna automáticamente la cantidad requerida entre los depósitos autorizados con saldo DISPONIBLE. El operador visualiza antes de confirmar de qué depósito saldrá cada porción y cuánto.
   - Ejemplo de aceptación: depósito A=3, depósito B=5, vender 6 => tomar 3 de A + 3 de B (u otra asignación automática válida documentada) y mostrar ambas salidas.
   - La factura conserva una única línea fiscal por producto por su cantidad total, sin duplicar líneas por depósito; el Kardex registra **una salida real por depósito**, vinculada a la misma FE.
   - El motor actual `inventario_registrar_movimiento` admite un solo depósito de origen por movimiento: agrupar las líneas asignadas por depósito y ejecutar movimientos SALIDA/VENTA distintos; conjunto atómico/idempotente con la emisión para no confirmar solo un retiro parcial.
   - Revalidación y bloqueo transaccional de saldos al confirmar, incluidas ventas simultáneas. Si el reparto mostrado queda obsoleto, exigir nueva revisión antes de confirmar o bloquear; no sustituir silenciosamente la distribución tras la aprobación del usuario.
   - Excluir depósitos de otra empresa, inactivos, sin alcance autorizado, o existencias reservadas, en cuarentena o tránsito. Nunca hacer una salida desde el depósito equivocado.
   - La precedencia entre depósitos igualmente aptos es un criterio técnico estable y documentado; no corresponde pedir selección manual obligatoria.
5. **Estados de gateway:** diseñar reversión vinculada y auditable por rechazo fiscal definitivo; no liberar por timeout/ENVIO_INDETERMINADO mientras SIFEN pudiera aprobar. Cancelación oficial de FE debe tener reversión de inventario idempotente según reglas de control. Estas son garantías técnicas requeridas por la decisión de bajar al emitir, NO una segunda pregunta sobre momento de baja.
6. El servicio DESCUENTO no controla stock, no está limitado por existencia y no genera movimiento. El resto de la mercancía sigue reglas de existencia.

### B. Cantidades fraccionarias

- **Todos los productos pueden ser facturados con fracciones, incluso los vinculados a unidad SIFEN 77/UNI; el operador decide.**
- Aceptar coma como separador decimal (`5,5`, `2,25`), normalizar la entrada a Decimal interno; no utilizar binarios con errores acumulativos ni truncar a entero; hasta **4 decimales** según E711 `dCantProSer` del MT SIFEN v150.
- Quitar la restricción actual de solo enteros para unidad 77 tanto en `app/(private)/facturas/nueva/page.tsx` (`cantidadValida`) como en `lib/facturacion/emision.ts` (validación de `unidadSifen===77`). Conservar precio, tributo y payload fiscales correctos.
- Bloqueo de stock también compara cantidades Decimal fraccionarias (5.5 disponibles, 5.6 solicitado => bloquear).

### C. NCE — Devolución, Descuento y Bonificación

- **Motivos 3/4:** tanto **Descuento** como **Bonificación** muestran `+ Agregar DESCUENTO`. Es el **mismo servicio fijo**, cantidad 1, precio unitario = monto elegido, **IVA 10% fijo**, sin movimiento de stock, sin repartir valor ni IVA en productos originales. La NCE emitida con este servicio contiene solamente este ítem (tras eliminar las líneas seleccionadas de la nota).
- Permitir checkbox por línea y checkbox **seleccionar todos**, además de acción **Eliminar seleccionados** de la nota que se está creando. Se puede eliminar **todas las líneas originales de la NCE** y dejar exclusivamente el servicio `DESCUENTO`; no borrar el catálogo ni las líneas de la FE original.
- La NCE mantiene el CDC de asociación a la FE original y sus propios identificadores de emisión. El monto NCE no supera saldo acreditable ni otros controles ya definidos (motivo fijado, NCE pendiente, idempotencia).
- **Devolución (motivo 2):** permitir editar cantidad devuelta, con coma/fracción, sin exceder cantidad acreditable original. **La NCE NO genera entrada automática de inventario.** El operador realiza `Inventario → Movimientos → Entrada` por separado tras recibir la mercancía, con registro auditado; evitar entradas duplicadas.
- Las actuales `nce_lineas` y `fe_documento_crear_nce` exigen ordinal de línea original de FE. Servicio extra exige adaptación completa de esquema/validaciones, cálculo IVA correcto, consumo de saldo e idempotencia. La inserción de una fila de `productos` por sí sola NO resuelve el flujo.
- **DECISIÓN CERRADA:** IVA del servicio DESCUENTO **siempre 10%**, incluso si la FE original contiene otros IVA, sin prorrateo. Es una decisión comercial, no una certificación legal/fiscal; probar y validar con el SIFEN/gateway los casos de FE origen a 5%, exenta y mixta antes de producción. No crear documento fiscal ficticio si el proveedor lo rechaza.
- **DECISIÓN CERRADA:** NCE por servicio DESCUENTO contiene exclusivamente ese ítem. Permitir marcar todos los originales y eliminarlos de la SELECCIÓN NCE (sin tocar la FE original). Si quedan líneas seleccionadas, bloquear envío hasta quitarlas; no eliminarlas automáticamente al añadir DESCUENTO.

### D. Descuento particular y global en FE — normativa confirmada

- El operador podrá elegir **porcentaje (%) o monto monetario** en cada línea y también descuento general al final de la FE.
- MT SIFEN v150: `EA002 dDescItem` y `EA003 dPorcDesIt` son descuento particular por unidad y su porcentaje; `EA004 dDescGloItem` aplica el descuento global de la operación por ítem, incluso cuando ya existe descuento particular; `F010 dPorcDescTotal`, `F009 dTotDesc`, `F033 dTotDescGlotem`, `F011 dDescTotal` y totales/impuestos deben corresponder al cálculo.
- Nota Técnica nº 1 del MT v150 precisa `dDescGloItem = F010 * E721 / 100`, y totales particulares/globales multiplicados por E711. Descuento monetario global requiere cálculo consistente del porcentaje y conciliación sin redondear en silencio; validar resultados con las reglas SIFEN. Cálculos/IVA internamente conservan precisión fiscal; PYG sin centavos en totales visibles y transmitidos donde corresponde.
- Fuente oficial MT: https://ekuatia.set.gov.py/documents/20123/420592/Manual%2BT%C3%A9cnico%2BVersi%C3%B3n%2B150.pdf/e706f7c7-6d93-21d4-b45b-5d22d07b2d22
- Nota Técnica 1: https://www.dnit.gov.py/documents/20123/420595/NT_E_KUATIA_001_MT_V150.pdf/c4d2ab8e-632b-dc8f-d3f6-6a144a3a3d9c

### E. Cancelación de documentos (NO es edición de factura)

- Evento SIFEN `CANCELACION` para un DE aprobado:
  - **FE:** hasta **48 horas** desde aprobación SIFEN.
  - **NCE y demás DTE:** hasta **168 horas (7 días)** desde aprobación SIFEN.
- La posibilidad de solicitar evento debe considerar estado fiscal, vencimiento del plazo y restricciones de documentos asociados, no editar directamente una FE aprobada en BD ni usar NCE para simular cancelación.
- Cancelación se confirma por resultado oficial del evento; estados locales y saldos se reconcilian después. Cancelar NCE y liberar saldo original es distinto de entrada automática de inventario.
- Fuentes oficiales: RG 23/2019 art.22 https://ekuatia.set.gov.py/en/web/portal-institucional/w/resolucion-general-n-23-19 ; FAQ https://www.dnit.gov.py/web/e-kuatia/preguntas-frecuentes/-/categories/400231

### F. Lista de pendientes no resueltos por estas decisiones

1. FE: **RESUELTO** — asignación automática entre depósitos disponibles/autorizados con desglose visible y salidas por cada origen; implementación pendiente.
2. NCE DESCUENTO: **resuelto** IVA 10% fijo, un ítem, no ratear ni combinar con originales; **pendiente** homologación fiscal para FE 5%/exenta/mixta.
3. Evento de cancelación: verificar primero disponibilidad/cuerpo de API de gateway, estrategia técnica y compensación de stock/fiscal sin duplicidades.
4. Solicitudes previas fuera de estas 8 respuestas: destino/dirección de entrega del cliente; foco automático en cantidad de nuevo producto; código de producto con ceros iniciales; descuentos en UI; resumen en PYG sin decimales; seleccionar todos y eliminar en NCE; KuDE NCE con los cinco campos contractuales sin `tipOpe`; texto `Establecimiento 001`. El layout/logo/empresa de KuDE TEST quedan fuera de alcance.

### Pruebas mínimas obligatorias (ninguna ejecutada en esta decisión)

- Dos depósitos: A=3 y B=5, factura de 6 permite asignación automática de 3+3 y registrar dos salidas, conservando una única línea fiscal de 6; sin saldos negativos, doble baja ni consumo concurrente del mismo stock.
- Reintentos FE y estados fiscales: baja única, reversión única sólo ante rechazo definitivo/cancelación oficial, estado indeterminado mantiene consistencia.
- Cantidad `5,5` en UI, FE, Kardex y stock; cantidades sin redondeo; 0, diferencia mínima `0,0001`, inventario fraccionario.
- NCE 2/3/4: devolución parcial fraccionaria sin entrada de stock; en 3/4, DESCUENTO único (cantidad 1, IVA 10%), sin líneas originales, sin reparto, con CDC/saldo correcto; probar FE original 5/10/exenta/mixta y aceptación fiscal en el gateway real.
- FE con descuentos de línea/global en % y Gs., IVA 5/10/exento y sumatorias F/EA exactas.
- FE cancelación <=48h; NCE <=168h; fuera del plazo/cross-tenant/permisos => bloqueo, sin falsa aceptación.


## 6. NUEVO GATEWAY DE PRUEBA — 20/10/2026

- Endpoint confirmado por captura Postman: base `https://gateway.e-factura-hub.com`. `POST /api/login` respondió HTTP 200 con JSON `status:success` y token. **Esto verifica solo el login; no demuestra emisión, consulta, KuDE NCE ni validez de IVA fijo.**
- La captura contiene credenciales y token reales: no replicar RUC de acceso, password ni token en Git, Linear o mensajes, y renovar contraseña antes de producción.
- Código: `lib/facturacion/gateway-credenciales.ts` cambia `URL_GATEWAY_PRUEBA` a nuevo host, utilizado al GUARDAR configuración de la empresa en `Configuración → Facturación electrónica`. **No cambia automáticamente base_url ya persistido en `fe_gateway_config`.**
- Para CASA MINGO actualizar por formulario autenticado y autorizado del NEXIT, preservando `NEXIT_DB` por empresa. Volver a guardar el usuario/clave de API mediante la interfaz segura y usar `Probar conexión`. No insertar secretos en SQL/terminal/README ni copiar login de una empresa como identidad fiscal de otra.
- El gateway de pruebas puede usar identidad de emisor diferente a CASA MINGO, ya aceptado por el responsable. NO alterar el layout del KuDE ni RUC/empresa fiscal/CDC de CASA MINGO por cambiar URL de autenticación.
- Las empresas ya configuradas conservan su URL registrada mientras no se actualicen expresamente; ninguna migración global debe reemplazar sus configuraciones.

**Estado:** default de URL cambiado en Git, sin modificar VM/BD ni probar el nuevo gateway desde el NEXIT; pruebas simuladas del código pendientes de ejecutar.
