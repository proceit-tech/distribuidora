# ORDEN ÚNICA DE IMPLEMENTACIÓN — NUEVA FACTURA ELECTRÓNICA · PENDIENTES VISIBLES Y FUNCIONALES

**Fecha:** 25/10/2026. **Responsable del producto:** instrucciones y cinco capturas de la pantalla actual. **Estado:** NO IMPLEMENTADO; orden para Claude, auditoría estática posterior del ChatGPT.  
**Repositorio:** `proceit-tech/distribuidora`. **Branch:** `feature/NEXIT-2026-001-banco-demo`.  
**Issue principal:** PRO-93. **Issues EXISTENTES que agrupa sin duplicar:** PRO-294 (fecha), PRO-134 (13 tipos de transacción), PRO-128 (UI/layout), PRO-72/PRO-307/PRO-109 (vendedores/usuarios/perfiles), PRO-323 (editor asistido dInfAdic), PRO-115 (aceptación de interfaz). Se mantienen como issues separados para rastreabilidad, pero **UNA SOLA orden consolidada** al desarrollador.

## 0. Corrección de conducción y prioridad

**La orden anterior de solo CSS `documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-128-UX-LAYOUT-INFERIOR-2026-10-25.md` NO FUE ENVIADA a Claude y QUEDA SUSTITUIDA por esta orden más completa.** No enviar ni ejecutar aquella orden por separado: dejaría pendientes fecha, 13 tipos, vendedores y alineación. No recrear frontend completo ni introducir nuevos módulos ajenos.

NEXIT es ERP; el estándar SIFEN determina solo el documento fiscal. **Contrato de códigos geográficos del proveedor YA CONFIRMADO por el responsable**: mandar códigos, API convierte a descripciones. No reabrir PRO-322.

**Objetivo:** cerrar problemas concretos de las cinco capturas de `Nueva factura electrónica`, no producir otro informe que solo cambie tarjetas.

## 1. Evidencia técnica actual VERIFICADA (NO suposiciones)

| Solicitud de usuario | Archivo / diagnóstico real | Estado |
|---|---|---|
| Fecha de emisión seleccionable | `app/(private)/facturas/nueva/page.tsx` utiliza `hoy`/ `hoyIso` informativos, `cuerpoFactura` NO envía fecha; `lib/facturacion/emision.ts::CuerpoFactura` tampoco la modela. `NEX-048` / `NEX-063` usan `now()` para `dFeEmiDE` y `fecha_emision` | No implementado; requiere UI+servidor+persistencia SQL NUEVA, no solo input |
| Establecimiento 001 antes del nombre | `catalogosFactura` lee `sucursales.establecimiento_sifen`; el combo JSX actual imprime `s.nombre · Establecimiento 001`, contrario a la jerarquía solicitada | Corrigir presentación sin modificar código fiscal de establecimiento |
| Tipos transacción 1 a 13 | `payload-fe.ts::CATALOGO_TIPOS_TRANSACCION` trae 1–13, pero `TIPOS_TRANSACCION` expone solo 1–4 y `validarEntradaFE` rechaza 5–13; `catalogosFactura` entrega solo lista habilitada | Solo 1–4 disponibles, no basta retocar select |
| Cliente/destino/botones | `page.tsx` bloque `.bandaCliente` (Cliente, EntregaCliente, acciones); CSS `flex-wrap` y tamaños flexibles no fijan alineación y el select largo domina el espacio | Revisar y alinear |
| Menú de Vendedores | `lib/navigation/menu.ts` YA contiene `Maestros → Vendedores` `/vendedores` con `VENDEDORES.VER`, pero `V1_HREFS` lo oculta. **No existe `app/(private)/vendedores/page.tsx` en la branch**. `Administración → Usuarios` también está definido pero oculto y sin página operacional `app/(private)/administracion/usuarios/page.tsx` | No hay CRUD ni página disponibles para cadastrar vendedor |
| Vendedor elegido en FE | `page.tsx` no tiene `vendedorId`; `emision.ts::prepararFactura` llama `vendedorDe(db, empresaId, usuarioId)` con el EMISOR autenticado; `info-adicional.ts` escribe automáticamente “Vendedor:” del emisor | No implementado; conceptos incorrectamente mezclados |
| Tabla y rodapié | `page.module.css`: `.colUnidad {width:56px}`; `overflow-wrap:anywhere` en todos `th/td`; `.barraResumen position:sticky;bottom:0;flex-wrap:wrap`, `.barraPanel position:absolute`; los cinco screenshots muestran `Unidad` rota, IVA/Precio mal dimensionados, barrita financiera corta/área en blanco y cliente desalineado | Reprobado visualmente |

**No afirmar SHA actualmente servido por VM**: el screenshot no demuestra versión ni assets activos; la rama sí contiene problemas CSS verificables. No acceder a VM sin aprobación.

## 2. Requisitos funcionales cerrados para implementar

### A. Fecha de emisión editable — PRO-294

1. Dentro de `Operación`, campo `Fecha de emisión *` con date-picker/input tipo fecha; valor inicial = día en zona **America/Asuncion**, formato visible local PY. Encabezado y diálogo final muestran **fecha seleccionada**, no `hoy` fijo.
2. Regla comercial existente: selección desde **30 días atrás hasta 5 días adelante**, calculados desde día local PY. Fecha inexistente o fuera del rango → error; cambios posteriores invalidan previsualización previa (dirty-state). No convertir automáticamente en fecha actual al enviar.
3. Implementar extremo a extremo: `page.tsx::cuerpoFactura` → API/body `leerCuerpoFactura` → validación de servidor `prepararFactura`/payload → fecha exacta en el `dFeEmiDE` y `documentos_electronicos.fecha_emision` por función SQL versionada → snapshot/huella/idempotencia → previa/envío/consulta. Si hay función envoltorio de stock/entrega, inspeccionar y propagar sin alterar sus efectos. Conservar hora local/firma/transmisión distintas; no modificar documentos existentes.
4. **Distinción legal crítica:** la DNIT describe transmisión NORMAL con emisión y transmisión dentro de 120h, y firma/transmisión dentro de 72h; días -6…-30 o futuros pueden requerir tratamiento/validación diferente. **La ventana de SELECCIÓN -30/+5 no significa que cualquier fecha sea autorizada por SIFEN**. Hacer clasificación y bloqueo/advertencia explicitamente antes de reservar número si la operación no está fiscalmente habilitada; nunca falsificar fecha/hora o transformar silenciosamente en hoy. Fuente DNIT: https://www.dnit.gov.py/en/web/e-kuatia/preguntas-frecuentes/-/categories/2705333.
5. Inspeccionar TODAS las migrations y firmas SQL antes de editar. **Únicamente AUTORÍA de nueva migration aditiva y scripts versionados si indispensables**, sin reaplicar/editar NEX-048/063/067/068/072 y **SIN EJECUTAR SQL**. Si un contrato no soporta fecha, documentar bloqueo verificable, no fingir funcionalidad completa. No ofrecer una selección aparentemente operativa sin avisar si el envío está bloqueado.

### B. Establecimiento y orden visual — PRO-128/PRO-93

1. Combo `Sucursal / Establecimiento`: cada opción `001 — Casa central` (código SIFEN de tres dígitos PRIMERO, nombre después). `Punto de expedición`: `003 — CAJA TEST`. Encabezado/resumen/confirmación: `Establecimiento 001 · Punto 003`, y número `001-003-0009010` referencial según secuencia real. **No confundir código de sucursal interna con establecimiento SIFEN** y no concatenar `001` dos veces.
2. No cambiar IDs, número, sucursal/punto autorizados, catálogos ni secuencia de PostgreSQL. Texto `Próximo N.º (referencial)` discreto y sin salto de línea incoherente.

### C. Tipo de transacción — RETIFICACIÓN EXPRESA DEL RESPONSABLE (PRO-134)

**Pedido exacto: mostrar el combo completo con los TRECE tipos oficiales. NO pidió agregar campos ni implementar nuevas operaciones fiscales.**

1. En `Tipo de transacción`, mostrar en el **mismo selector** las trece opciones `iTipTra` (D011), con nombres en español y valores seleccionables, reutilizando `CATALOGO_TIPOS_TRANSACCION`.
2. **Alcance limitado al combo**: no crear campos condicionales, pantallas, flujos tributarios especiales, Autofactura, anticipo, divisas, nuevas migraciones o reglas adicionales por este pedido.
3. Mantener intactas las validaciones fiscales existentes en el backend. Que una opción se pueda seleccionar no significa que se haya implementado legalmente una emisión para ese tipo; no quitar controles para simular esa capacidad.
4. **Ya realizado en `03623ec4a7daf32f4f832c47f5fbc0b8112cb9fc`**: las 13 opciones están visibles y seleccionables. NO ordenar nuevo trabajo sobre el combo por considerar necesario soporte de emisión 5–13. La limitación actual de backend puede documentarse de manera separada, pero **no es un encargo del responsable de construir campos adicionales**.

### D. Vendedores: cadastro visível + seleção independente — PRO-72, PRO-307, PRO-109

1. **Existe rótulo/URL previamente planejado, mas escondido:** `Maestros → Vendedores` `/vendedores`; **implementar rota operacional**, e somente então habilitá-la em `V1_HREFS` com permissões reais. Não criar outro menu fictício ou links que dão 404.
2. NEXIT possui `usuarios`, `perfiles`, `usuario_perfil` na NEX-002 e perfis fixos, inclusive **Vendedor**; **nem todo usuário é vendedor, nem todo emissor é o vendedor**. Antes de criar estrutura nova, mapear o modelo aprovado: o administrador da empresa pode cadastrar/gerir usuários da sua empresa e atribuir o perfil PREEXISTENTE `Vendedor`; não pode criar/editar perfis. A listagem de vendedores deve incluir apenas contas com habilitação comercial válida/ativas dessa empresa, nunca usuários arbitrários. **Preferir reaproveitar usuário + perfil fixo** em vez de criar cadastro duplicado sem necessidade; se o fluxo de cadastro de vendedor exigir outro registro/tabela ou vinculación sem conta de acesso, explicar conflito e pedir decisão antes de criar schema desnecessário. NÃO misturar papel Vendedor com operador que emite.
3. `Maestros → Vendedores`: tela real com listado, busca, estado Activo/Inactivo, alta/edição/desativação conforme autorizações e modelo de usuários existente; o admin de empresa só vê a empresa atual, MASTER não é conta empresarial. Credenciais seguras; nunca gerar senhas padrão, grants amplos ou duplicados.
4. `Nueva factura` mostra `Vendedor` com pesquisa/combobox de vendedores ativos da empresa (com alcance aplicado quando existir), seleção por ID, nome exibido. **Sem default automático para usuário logado**; emitir em nome de outro vendedor autorizado mantendo `usuario_emisor` no log. Não permitir vendedor de outra empresa, inativo ou sem perfil comercial válido.
5. Registrar **ID do vendedor e snapshot legível** como dados estruturados do NEXIT: não depender exclusivamente de texto livre `dInfAdic`. O nome de vendedor escolhido entra em `dInfAdic` na forma `Vendedor: ...`, mas esse texto pode ser editado e não prova identidade. Mantém foto histórica e não altera emissões anteriores. Se requer SQL novo, só versionar migration aditiva para revisão, **não executar**.
6. Respeitar requisito da PRO-323 já fechado: textarea `Información adicional` livre, visível e assistido por seleção de vendedor/endereço (sem anexos escondidos/duplicados), com texto final revisado exatamente como enviado, limite 5000; não destruir comentários manuais. Seleção de endereço comercial não altera domicílio fiscal. Se implementar a assistência neste mesmo conjunto de UI, marcar como parte PRO-323 e não expandir NCE/stock.
7. Em empresa sem vendedor válido, mostrar `Sin vendedores registrados` com link REAL à tela autorizada, sem inventar dados e sem converter automaticamente o operador em vendedor.

### E. Cliente, endereço de entrega e botões — PRO-128

1. Refatorar `.bandaCliente` para composição CSS grid/flex responsiva estável: **identidade cliente**, **dirección de entrega** e **acciones Cambiar cliente/Quitar** alinhadas verticalmente na mesma linha para desktop (não deixar botão acima/abaixo do select); mobile empilhar por coluna. Endereço longo deve truncar visualmente sem invadir botões e ter `title` acessível.
2. `Ficha fiscal completa` na linha inferior, com espaçamento discreto; badge `Apto para facturar` próximo ao nome. Nunca substituir o destino de entrega pelo endereço fiscal nem alterar regras de seleção obrigatória já aprovadas.
3. Exibir `Vendedor` numa zona comercial clara da tela, sem espremê-lo ao lado dos botões de cliente; cabem Operación, Cliente/Entrega/Vendedor, Detalle, Pago.

### F. Tabla, Unidade e rodapé financeiro — PRO-128

1. `Unidad` não pode quebrar em `Unida / d`. Aumentar coluna mínima para ~80–90px, rever `overflow-wrap:anywhere` aplicado em th, dimensionar IVA/Cantidad/Precio/Descuento/Subtotal, Produto fica com a maior largura útil. Controles numéricos e botões não devem colidir; usar truncamento apenas em descrição longa e tooltip completo. Produto cabe em até 2 linhas + código/GTIN.
2. `Detalle de la factura` ocupa largura da página; tabela com 1/20/100 itens, sem scroll vertical INTERNO, sem sumir linhas ou edições. Uma única rolagem da página.
3. Barra `Total general / IVA / descuentos / pendientes / Cancelar / Revisar y confirmar` em faixa inferior COMPACTA alinhada com a largura útil completa. Sem flutuar em cartão estreito à esquerda, sem sobrepor `Descuento general`, `Forma de pago`, `Observaciones`, últimos ítems ou foco por teclado. Se sticky não conseguir evitar sobreposição, usar **footer em fluxo normal**, sem popover. Expandir `Detalle de impuestos` e `Pendientes` **em fluxo**, não overlay absoluto sobre os itens.
4. Operación: inputs proporcionados; seletor de Establecimiento e fecha com leitura correta, Tipo transacción todos. Sem espaçamento inútil nos cards. Modais de seleção e **modal de revisão final antes de emitir** permanecem.
5. Preservar QR/CDC, cálculos Decimal/IVA, descontos, créditos, preços, unidades, autorização, teclado/leitor/código e todos estados.

## 3. Sequência única de execução e entregas

**Fase 1 — FECHA / TIPOS / VENDEDOR: primeiro as faltas funcionais, não começar por cosmética.** Ler todos arquivos reais e mapear contratos UI→API→SQL/snapshots. Implementar a menor solução íntegra para os casos já legalmente suportados; quando precisar de migration nova para data ou vendedor estruturado, criar somente o ARQUIVO versionado aditivo + documentação de aplicação/rollback, **nunca executar**. Não reescrever migrations antigas e não aplicar NEX-072. Evitar rotas fantasmas. **Não criar suporte indiscriminado para operações fiscais especiais.**

**Fase 2 — COMPONENTES/LAYOUT:** aplicar as correções da captura em `page.tsx`, `page.module.css`, menu real de Vendedores e componentes necessários; mensagens em espanhol (Paraguay). Reconciliar todo estado/dirty-state/modal de prévia.

**Fase 3 — AUDITORIA ESTÁTICA DE COBERTURA:** inspeção de ARQUIVOS COMPLETOS antes e após; indicar tabela de itens (a–f) `implementado no código / depende de migration versionada ainda NÃO APLICADA / limitado pela normativa fiscal / pendente de validação visual`. **Não afirmar 100% pronto se faltar botão, endpoint, schema ou fonte de dados.** Listar arquivos mudados, SHA de commits agrupados por responsabilidade (ou um commit coeso), push branch oficial e PARAR para ChatGPT. Não marcar issues Done/homologação.

**Proibição da ordem atual (mantida):** não executar tests, lint, typecheck, build, CI manual, SQL/PostgreSQL, migration, VM, deploy, gateway/SIFEN, emissão real ou automação de screenshot. Não modificar stock, baixa, reservas, NCE, PRO-205/324, KuDE, PRO-322 (endereço fiscal) ou E03/NEX-072. A regra de códigos geo já foi confirmada. Caso uma alteração de negócio dependa de mudança fora da área autorizada, **documentar o bloqueio de forma concreta**, não simular conclusão.

## 4. Critérios de homologação visual posterior (sem execução agora)

- **Capturas reproduzidas**: Operación inclui data editável e 001 primeiro; 13 opções no tipo; Cliente alinhado com entrega e botões; Vendedor registrado via menu e escolhido por ID; tabela legível; barra de totais integrada.
- **0/1/20/100 produtos**, 1366×768, 1440×900, 1698×864, sidebar presente, zoom 100% e 125%; nenhuma rolagem interna/controle cortado.
- **Validação funcional futura autorizada**: data default, -30, +5 e extremos, extemporânea, preview/hash/SQL, vendedor A vs usuário emissor B, outra empresa, ativos/inativos, tipo fiscal 1 a 13 com elegibilidade explícita, nenhuma numeração reservada em erro e nenhum movimento duplicado.
- **GATE:** validação visual e fiscal REAL é posterior pelo responsável humano; **o commit não prova implantação**.
