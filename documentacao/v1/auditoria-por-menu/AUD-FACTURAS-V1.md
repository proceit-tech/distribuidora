# Auditoria por menu — Facturas

**Rota principal:** `/facturas`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado:** ABERTA — NÃO AUDITADA INTEGRALMENTE — NÃO HOMOLOGADA  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Facturas**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

## Itens obrigatórios da auditoria completa

- [ ] Todas as rotas e subtelas: navegação, abas, ações, modais, estados de erro e vazio.
- [ ] Campos: origem, exigência, máscara, validação client/server, persistência e retorno.
- [ ] APIs: métodos, status HTTP, consultas, filtros, paginação, transação, concorrência e tratamento de exceções.
- [ ] Autenticação, permissões de ação, isolamento multiempresa e alcance de sucursal.
- [ ] SQL: relações, constraints, índices, FK, trigger, integridade e scripts vinculados.
- [ ] Integrações e dependências entre menus; compatibilidade de dados.
- [ ] Casos de teste: positivos, negativos, limites e regressões; evidências de execução.
- [ ] UX: responsividade 1440/768/375, foco, acessibilidade, textos, confirmação de ações, screenshots reais.
- [ ] Conclusão com todos os achados numerados, severidade, evidência e critério de aceite.

## Achados confirmados até agora (parciais)

- **Confirmado:** paginação de clientes/produtos retorna total zero em página vazia; proteção dirty é parcial; faturação exige vínculo unidade SIFEN.

## Pendências

Auditoria exaustiva deste menu ainda não executada. Não atribuir percentual de cobertura sem inventário de arquivos e linhas revisadas.

## Regra de migrations

O responsável mostrou NEX-001…051 já aplicadas na VM. Proibido editar scripts aplicados, checksums ou reexecutar SQL histórico como se fosse nova migration. Qualquer nova alteração estrutural exige justificativa, aprovação e migration incremental a partir de NEX-052.

## Complemento de auditoria cruzada Productos → Facturas (12/10/2026)

**FAT-X01 / ALTA / confirmado pelo SQL:** `lib/facturacion/emision.ts:82-92` não filtra `p.vendible`. `SELECT_PRODUCTOS` serve tanto ao seletor quanto a `prepararFactura` (`:201`), portanto a trava de negócio não existe no backend. Um produto de tipo MERCADERIA/SERVICIO e ativo pode ser faturado ainda que `productos.vendible=false`. A correção deve ser no contrato comum de busca e preparação no servidor, com regressão; não resolver apenas no browser.
 
**FAT-X02 / já confirmado:** ausência de equivalência fiscal em `unidades_medida.unidad_sifen_codigo` impede emissão, mas Productos permite gravar sem vínculo. Consultar `AUD-PRODUCTOS-V1.md`, casos PRD-A01/02/03.

## Regra upstream confirmada: Productos → Facturas (DEC-PRD-U02, 12/10/2026)

O responsável aprovou que nenhum produto **novo destinado à venda** seja cadastrado sem classificação IVA completa e campos fiscais SIFEN exigidos para sua operação. Fonte canônica: `documentacao/v1/auditoria-por-menu/AUD-PRODUCTOS-V1.md`, seção X. Facturas deve revalidar a aptidão fiscal de cada item no backend no momento da emissão, inclusive para produtos históricos, sem confiar somente na validação de cadastro; não ignorar `vendible=false` (FAT-X01). A decisão não autoriza inferir IVA, reaplicar migrations antigas nem alterar saldos/histórico.

## Dependência transversal adicional — faturação por apresentação, PRD-A20 (12/10/2026)

O responsável esclareceu que uma mercadoria possui unidade-base de estoque, múltiplas apresentações para compra/venda e que SIFEN aceita apenas sua tabela fiscal de unidades. `lib/facturacion/emision.ts:82-92,201,220-244` usa atualmente apenas `productos.unidad_medida_id` para resolver `unidadSifen`, independentemente de `producto_unidades` e seu fator. `lib/facturacion/payload-fe.ts:186-188` gera E709/E711/E721 com esses valores.

**Impacto:** o sistema não tem fluxo comprovado para escolha e faturação de apresentação alternativa com quantidade/preço fiscal coerentes e movimento correto do estoque em unidade-base. A futura auditoria do menu Facturas deverá detalhar seleção de apresentação de venda, preço por apresentação, fator de conversão, validação SIFEN por apresentação, arredondamento, emissão de DE, KuDE e baixa/estorno de estoque. Não presumir que `Caja` sempre corresponde a fator 12, e não enviar código fiscal por simples nome da apresentação.

**Decisão confirmada em 12/10/2026:** quando a apresentação comercial não tiver equivalente fiscal apropriado, converter automaticamente quantidade e preço para a unidade-base fiscal SIFEN válida do produto, preservando o total (DEC-PRD-U03). A implementação permanece pendente de auditoria.

## Confirmação do responsável — unidade do documento eletrônico (12/10/2026)

**Declaração:** “sim, para sifen tem que ser a unidade que existe.”

**REGRA CONFIRMADA:** qualquer unidade enviada na factura eletrônica deve ser um código existente e fiscalmente válido no catálogo oficial SIFEN. Apresentações comerciais podem ser distintas e múltiplas por produto; sua descrição comercial não constitui, por si só, autorização para enviar tal descrição ou um código inventado ao SIFEN. Unidade fiscal, quantidade e preço precisam permanecer matematicamente coerentes.

**Aplicação na auditoria:** no cadastro de Productos, manter unidade-base de controle de estoque e apresentações com fatores próprios. Na emissão, validar no backend o código SIFEN efetivamente enviado no item; testar unidade de apresentação existente no catálogo e apresentação sem equivalente fiscal. **Não** considerar resolvido o defeito de que `lib/facturacion/emision.ts` hoje utiliza apenas a unidade-base do produto.

**ATUALIZAÇÃO POSTERIOR:** a decisão foi tomada pelo responsável: **CONVERSÃO AUTOMÁTICA** para unidade-base fiscal, com quantidade/preço equivalentes e preservação do total. O detalhamento está abaixo e na auditoria de Productos, seção XIII.

**Execução:** nenhuma alteração de código, SQL, VM ou migration autorizada; auditoria continua aberta.

## Decisão fiscal homologável em código — apresentação comercial sem unidade SIFEN (DEC-PRD-U03, 12/10/2026)

**Regra de negócio aprovada pelo responsável:** permitir venda por apresentação comercial não presente na tabela oficial SIFEN; **converter automaticamente** a linha para a unidade-base do produto com código SIFEN válido. Exemplo aprovado: **1 bandeja de 6 unidades → 6 UNI, SIFEN 77**, ajustando o preço unitário fiscal e preservando o valor total vendido.

**Requisitos de auditoria e futuros testes:**

1. Manter no contrato original apresentação, quantidade comercial, fator de conversão, preço comercial e total. A escolha da apresentação pode ser múltipla por produto, e a unidade-base comercial não deve ser alterada.
2. Na preparação no servidor, obter a apresentação e seu fator do banco, por empresa e produto; quando não houver equivalência fiscal própria, usar unidade-base com SIFEN válido/vigente. Não converter apenas com base no rótulo.
3. Converter quantidade fiscal = quantidade comercial × fator (na unidade-base); preço fiscal = total comercial ÷ quantidade fiscal, observando a escala permitida e a legislação. **Preservar o total** da operação e seus componentes tributários; não alterar o total por arredondamento silencioso. Se a representação exata não for possível nos limites do gateway, impedir apenas aquela emissão e apresentar motivo/possibilidade de correção.
4. Enviar ao SIFEN somente `cUniMed` oficial e quantidade/preço correspondentes nos campos `dCantProSer` e `dPUniProSer`; verificar também IVA, subtotal e arredondamento conforme manual/NTs.
5. Exigir validação no backend independentemente do navegador; preservar snapshot da apresentação comercial e dos dados convertidos para auditoria, documento eletrônico, XML/KuDE, consultas e eventuais notas de crédito/cancelamentos.
6. Confrontar a integração de Inventario: baixa/estorno, se e quando esse fluxo existir, deve usar a **quantidade em unidade-base**. A auditoria não pode presumir que a emissão FE atual já efetua baixa de estoque.
7. Casos regressivos: bandeja de 6 e 12 unidades equivalentes, equivalente fiscal próprio, fator de conversão inválido, preço sem divisão exata, produto não vendível, unidade-base sem SIFEN, unidade fiscal inativa, empresa/depósito fora do alcance.

**Evidência do defeito técnico atual:** `lib/facturacion/emision.ts:82-92,201,220-244` lê somente a unidade-base, sem apresentação/fator por linha; `lib/facturacion/payload-fe.ts:186-188` constrói os campos fiscais a partir dos valores recebidos. A correção futura deve alcançar DTO, UI, backend, cálculos, armazenamento e relatórios; não é mero ajuste de select.

**Status:** decisão de **conversão automática APROVADA**, implementação ainda não autorizada, auditoria do menu **ABERTA**, não homologada. Não modificar NEX-001…051 nem executar scripts na VM.

## Complemento da auditoria Produtos × estoque × preço (12/10/2026)

**FAT-X03 / BLOQUEANTE / preço/quantidade por apresentação:** com a conversão automática aprovada (DEC-PRD-U03), a emissão deve usar snapshot fiscal e comercial e manter preço/quantidade coerentes. Contudo, `productos.unidad_medida_id` hoje pode ser editada após operações, e `lista_precio_items.unidad_medida_id` pode não acompanhar (`NEX-008/017`, `app/api/productos/[id]/route.ts`). Se o servidor de FE assumir o preço de referência como preço atual da unidade-base, há risco de faturação unitária e total errados.

**FAT-X04 / precisão:** fator de apresentação com 6 decimais contra estoque/linhas de movimentação a 4; validar integridade antes de calcular E709/E711/preço do item e impedir discrepância de valor total. Sem presumir que emitir FE hoje afeta o estoque.

**Fonte:** `AUD-PRODUCTOS-V1.md`, seção XIV; auditoria Facturas continua aberta.

## Bloqueador fiscal de unidade-base — complemento 12/10/2026

**FAT-X05 / ALTA:** `NEX-047:76-122` define estados local/SIFEN independentes, mas não possui linhas fiscais ligadas por FK ao produto; `NEX-048:50-64` congela payload JSONB com `dCodInt` e unidades fiscais, sem `productoId` relacional. Portanto não se consegue estabelecer automaticamente uma matriz de **FEs pendentes por produto** somente por chaves relacionais. Não bloquear todos os produtos por qualquer documento pendente da empresa e não ignorar documento pendente real do produto.

**Decisão DEC-PRD-U08 — APROVADA (12/10/2026):** factura com payload fiscal persistido e imutável **não bloqueia** a troca da unidade-base só por estar pendente de envio/consulta/resultado SIFEN, desde que o produto tenha estoque zerado e nenhuma operação física pendente. Unidade fiscal, quantidade, preço, IVA, total e snapshot histórico devem permanecer intocados inclusive em reenvio/consulta. Ver `AUD-PRODUCTOS-V1.md` §XVIII.

**Estado:** auditoria cruzada aberta, sem testes na VM/gateway.

## DEC-PRD-U08 — contrato de histórico fiscal imutável ao alterar unidade-base (12/10/2026)

**Aprovado pelo responsável:** permitir trocar a unidade-base com estoque zero e nenhuma movimentação física pendente, **mesmo se a FE do produto ainda aguarda envio ou resposta SIFEN**, mas somente quando seus dados fiscais já estiverem gravados/congelados.

- **Snapshot fonte de verdade:** `NEX-048:50-64,67-90,153-163` prevê `documento_electronico_solicitudes.payload` JSONB imutável, com hash e versão; a transmissão/reconsulta deverá utilizar exatamente essa versão fiscal persistida, não um novo cálculo por `productos.unidad_medida_id` ou `producto_unidades.factor_conversion` vigentes.
- **Campos preservados por item:** `cUniMed` (E709), `dCantProSer` (E711), `dPUniProSer` (E721), preço/quantidade comerciais e apresentação/fator quando aplicáveis, descrição, IVA, total, CDC/número quando existentes; o processo fiscal não pode mudar por alteração posterior do cadastro.
- **Estados fiscais não equivalem a operação física:** `NEX-047:76-122` separa `estado_local` e `estado_sifen`; estados `PENDIENTE_ENVIO`, `ENVIO_INDETERMINADO` ou `ENVIANDO`, por si sós, não bloqueiam a mudança. Ação física pendente **sempre bloqueia**, pela DEC-PRD-U07.
- **Garantias ainda não implementadas:** a ausência de FK relacional por item `documento → producto` (FAT-X05) exige rastreabilidade determinística na futura integração estoque/FE. O contrato aprovado não dispensa resolver o histórico de apresentação do produto; prévia editável/não persistida não é FE fiscalmente congelada.
- **Cenários regressivos obrigatórios:** FE congelada aguardando envio e mudança de base; reconsulta/reenvio após a mudança com hashes e campos fiscais iguais; estoque reservado/terceiro positivo bloqueia; evento físico pendente bloqueia; falta de snapshot imutável não pode ser tratada como exceção aprovada.

**Estado:** DEC-PRD-U08 APROVADA, auditoria de Facturas continua ABERTA. NEX-047…050 não foram aplicadas/testadas nesta análise, nenhum código/SQL/VM alterado.

## Regra histórica de apresentações DEC-PRD-U09 (12/10/2026) — aprovada

O responsável aprovou que **apresentações já utilizadas** não tenham fator/unidade sobrescritos: mudança de Caja 12 UNI para Caja 10 UNI encerra a versão usada e cria uma nova versão vigente da MESMA apresentação; múltiplas apresentações distintas podem continuar ativas em paralelo. Ver `AUD-PRODUCTOS-V1.md`, seção XIX.

**Contrato de Facturas:** um documento emitido por Caja v1=12 UNI continua com sua apresentação/fator de 12, unidade SIFEN, quantidade fiscal, preço e IVA históricos inclusive em reconsulta/reenvio, nota de crédito ou devolução. Novas operações passam à versão v2=10 UNI. A operação fiscal não deve deduzir fator de nome comercial nem reconstruir item do cadastro atual.

**Lacuna transversal já confirmada:** `lib/facturacion/emision.ts:82-92,220-244` lê unidade-base, não versão da apresentação. `NEX-048` guarda o payload fiscal imutável, mas sem chave relacional por item para apresentação/versionamento no esquema atual. Adicionar critérios de teste para mudança de fator entre operações sem alterar documentos antigos.

**Estado:** regra de negócio aprovada; nenhuma implementação, SQL ou teste operacional executado; auditoria Facturas continua aberta.


## AUD-FAT-UX-R01 — confronto das referências da concorrência com a tela NEXIT (14/10/2026)

**Motivação:** o responsável considera o layout atual pouco profissional e solicitou comprovar o material da concorrência já enviado e revisar a experiência, **sem autorização de implementação nesta solicitação**. **SHA-base:** `d4f66624d29458fed9f4ca3e078b59bf0a1c263e`, branch `feature/NEXIT-2026-001-banco-demo`. **Fontes inspecionadas:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progresso pertinente, `documentacao/v1/REQUISITOS-FACTURACION-ELECTRONICA-API-EXTERNA-2026-10-12.md:1-37`, `app/(private)/facturas/nueva/page.tsx` (787 linhas), `page.module.css` (613 linhas), `app/(private)/facturas/{layout,page}.tsx`, `components/ui/lista-padrao/lista.module.css`, `app/(private)/layout.tsx`, `components/layout/app-shell/app-shell.tsx`, `lib/navigation/menu.ts`, `documentacao/v1/homologacao-visual/{README,AUDITORIA-CADASTRO-CLIENTES-PADRAO-FORMULARIOS-V1}.md`, `AUD-DOCUMENTOS-ELECTRONICOS-V1.md` e árvore de arquivos do GitHub. **Inspeção de código e CSS, não da imagem renderizada**. Sem navegador, VM, PostgreSQL, testes, capturas reais ou deploy. Nenhuma declaração de APROVAÇÃO VISUAL.

### 1. Rastreabilidade das referências recebidas da concorrência

**Confirmado:** o requisito de Facturación (§2) já relaciona as oito referências fornecidas em 12/10/2026, com nomes originais e função:
- `IMG-01 image(20261012-163628).png` — Documentos electrónicos: indicadores, filtros, estados, ações.
- `IMG-02 image(20261012-163752).png` — documento expandido: lote, CDC, datas e mensagem SIFEN/eventos.
- `IMG-03 image(20261012-163826).png` — Factura: cabeçalho fiscal, sucursal/expedição, cliente e operação.
- `IMG-04 image(20261012-164006).png` — Factura: linhas, IVA, subtotais, pagamento e ações.
- `IMG-05…08` — Postman: login, recepção, consulta não encontrada e consulta aprovada via gateway externo; **não** são quatro telas visuais do ERP.
**Importante:** a própria especificação documenta que os PNG originais foram anexados ao chat anterior, **não versionados como binários no GitHub**. A árvore Git inspecionada não inclui PNG/JPG/WebP de telas concorrentes nem capturas de faturação: somente `public/favicon.svg` e PDF fiscal entre imagens/arquivos de referência. A busca por nomes exatos das capturas entre arquivos de conversas/Library acessíveis nesta sessão não recuperou esses originais. **Portanto NÃO ocorreu comparação pixel a pixel contra os quatro screenshots de tela.** A comparação abaixo usa o mapeamento funcional preservado no requisito, o padrão visual aprovado e a implementação textual/CSS real. Não solicitar que o responsável repita decisões nem presumir que as imagens estejam no Git; para confronto visual literal, os quatro originais precisariam estar acessíveis e um screenshot recente da aplicação publicada, sanitizados.

**Decisão vigente:** concorrente de SIFEN é referência de fluxo/campos, **não** modelo para copiar CSS, cores, tipografia pequena ou excesso de filtros. NEXIT deve ter linguagem de produto própria, profissional, compacta e consistente.

### 2. Diagnóstico da tela existente (não equivale a homologação visual)

| ID | Severidade | Evidência de código | Problema / direção de aceite |
|---|---|---|---|
| `FAT-UX-R01-01` | **ALTA visual** | `facturas/nueva/page.tsx:425-437,451-683`: H1 separado seguido de **cinco cards verticais** Cabecera, Cliente, Detalle, Totales e Información adicional; `page.module.css:2-50` usa `flex-direction:column`, `grid-template-columns:repeat(auto-fit,minmax(190px,1fr))`. | O fluxo de emissão depende de várias rolagens e coloca os totais após todos os itens, fora da área de decisão. Redesenhar **workspace de emissão** com hierarquia documento→cliente→ítems no painel principal e resumo fiscal/validação à direita em desktop, preservando todas as informações e campos atuais; não multiplicar cabeçalhos, badges ou caixas sem função. |
| `FAT-UX-R01-02` | **ALTA UX** | `page.module.css:51-85,141-153,205-220` usa label 12.5, entrada 13, altura 36px, `dt` 11.5 e th 11.5; padrão de formulários `AUDITORIA-CADASTRO-CLIENTES-PADRAO-FORMULARIOS-V1.md:20-31` pede valor 14–15 e input 40–44. | Hierarquia visual/legibilidade inconsistentes com padrão mais novo. Utilizar escala de tipografia e campos do design system real; não encolher texto para simular densidade ERP; manter foco, erros e acessibilidade. |
| `FAT-UX-R01-03` | **ALTA UX** | `page.tsx:513-557` expande ficha do cliente com 8–9 pares `dt/dd`; `:154-251,559-636` adiciona produtos exclusivamente via modal com pesquisa/paginação de dez resultados; grade de itens com `min-width:860px` (`CSS:198-203`). | Cliente ocupa altura desnecessária e seleção de itens interrompe o fluxo; notebook/tablet/mobile herdam rolagem horizontal. Propor cliente compacto (razão social, documento, aptidão, ações; detalhes fiscais em expansão), pesquisa rápida de produto por nome/GTIN/código ao lado da grade e lista/modal avançado apenas quando necessário; grade legível no desktop e representação responsiva própria para 768/375. Não remover campos SIFEN nem acessos por teclado. |
| `FAT-UX-R01-04` | **MÉDIA/ALTA UX** | `page.tsx:638-683` exibe total após a tabela, CTA `Grabar` na barra sticky só com texto de faltantes; `page.module.css:305-387,583-597` redefine `.totalGeneral` após definição prévia, alterando o destaque de gradiente para painel pálido sem consolidar a regra. | Total a pagar, componentes de IVA, validação e ação principal não possuem uma área persistente de decisão consistente. Consolidar resumo fiscal visível em desktop (lateral sticky ou equivalente), barra de ação móvel clara (total + revisar/confirmar) e estilo único por token, sem dupla definição acidental. Separar preparação, revisão e resultado SIFEN sem mostrar aprovação antes da confirmação real. |
| `FAT-UX-R01-05` | **ALTA funcional/UX** | `page.tsx:483-486`: `<select value="1" onChange={() => undefined} disabled={Object.keys(...).length < 2}>`; com 2+ opções o controle parece habilitado, mas nunca salva a escolha. | Corrigir apenas após confrontar o contrato de operação contado/crédito, formas de pagamento e regra fiscal. Não dar aparência de campo editável que não muda; mostrar campo bloqueado **de forma explícita** se esta V1 aceita somente Contado, ou permitir seleção real com validação backend, sem inventar financiamento. |
| `FAT-UX-R01-06` | **ALTA navegação** | `page.tsx:443-448,675-680` aponta `Ver documentos electrónicos` e `Cancelar` para `/documentos`; árvore Git atual não contém `app/(private)/documentos/page.tsx` nem rota implementada em `/notas-credito`. `lib/navigation/menu.ts:211-250` registra itens de Facturación, porém nem todos têm páginas. | Não conduzir o usuário a rotas ainda não implementadas; substituir ações pelo fluxo/rota real autorizado, sem ativar páginas demo ou criar listagem artificial. Definir tela Documento electrónicos antes de expor como destino da emissão ou Cancelar. |
| `FAT-UX-R01-07` | **MÉDIA** | `page.tsx:745+` contém modal «Envío al gateway (diagnóstico de prueba)» e `:442-448` mistura mensagem de status local com links de documentos ainda ausentes. | Linguagem de diagnóstico e protocolo não deve dominar UX comercial; exibir resultado humanizado e status fiscal distinto do HTTP local, detalhe técnico em expansão permissionada/auditoria. Não chamar “Aprobado” até consulta SIFEN real. |
| `FAT-UX-R01-08` | **MÉDIA** | `page.module.css` possui 613 linhas com CSS muito específico, overrides finais de `.totalGeneral`, `.cardHead h2`, `.field select/input/textarea` (`:583-607`), e estilos inline em `page.tsx`; layout se baseia em CSS local + `lista.module.css`. | Risco de divergência visual e custo de manutenção. Reutilizar tokens/componentes já aceitos para Clientes/Productos/listados, evitando reescrita global do app e nova biblioteca; extrair componentes estruturais apenas onde melhora clareza e regressão. |
| `FAT-UX-R01-09` | **MÉDIA/escopo** | `page.tsx:454-455` exibe apenas data/moneda no cabeçalho; sucursal/expedição selecionadas não se tornam contexto compacto persistente; status/série/numeração não podem ser inventados. Em `page.tsx:498+` várias decisões fiscais aparecem como selects equivalentes. | Redesenhar cabeçalho com referência de operação e agrupamento progressivo: dados primários (sucursal/punto/documento/cliente), parâmetros avançados separados. Mostrar numeração **somente** quando o serviço a conhecer, ou «Se asigna al emitir», nunca estimar série/CDC. Respeitar campos fiscais condicionais e dados reais. |

### 3. Padrão de experiência a detalhar antes de implementar

**Desktop ≥ 1200px — tela de operação em duas zonas, e não cinco cartões verticais iguais:**
1. **Topo compacto:** `Facturación / Facturas / Nueva factura`, estado «Borrador local» somente quando aplicável (nunca fingir persistência), sucursal, ponto de expedição, data e informação de numeração gerada pelo servidor quando disponível. CTA com hierarquia primária clara.
2. **Painel principal ~70%:** Cliente com busca direta, status fiscal e ficha fiscal expansível; ítems como principal área de trabalho, pesquisa de código/GTIN/descrição, tabela com coluna unidade/apresentação/IVA/quantidade/preço/total, mensagens por linha; controles adicionais em acordeão ou subseções lógicas. Apresentação comercial e conversão fiscal obedecem `DEC-PRD-U03/U08/U09` e nunca se resolvem só no CSS.
3. **Painel lateral ~30%:** visão de subtotal, exento/5%/10%, IVA, total PYG, condição/pagamento, pendências, e botão de revisar/confirmar; sticky sem bloquear layout e rolável internamente se necessário. Em mobile/tablet empilhar e oferecer resumo/ação acessíveis sem ocupar excessivamente a área.
4. **Fluxo explícito:** preparar → revisar documento/IVA → confirmação de intenção persistida/idempotente → estado local de envio → confirmação SIFEN apenas via retorno/consulta comprovados. Campos complexos condicionais não devem sobrecarregar a primeira visão.

**Design system obrigatório:** H1 24–26px, seção 16px/650, labels 12–13, valores 14–15 (16 mobile), campos 40–44, botões 38–40, espaçamentos consistentes, contraste WCAG, foco/teclado, mensagens por campo e responsividade **1440 / 768 / 375 px** a 100% de zoom. Reutilizar o padrão visual atual autorizado da V1; evitar cópia da concorrência, símbolos decorativos e duplicação de descrições. **Não eliminar campos/funcionalidades aprovados em nome da estética.**

**Confronto com concorrência recuperável:** IMG-03/04 sustentam blocos funcionais cabecera, cliente, itens e totais, mas o NEXIT deve superar o excesso de formulário plano; IMG-01/02 dizem respeito a **Documentos electrónicos**, que não tem página implantada nesta branch, portanto não cabe declarar sua aparência como comparável; IMG-05…08 são testes de gateway Postman, não referências visuais de software de faturação.

**Próxima ação, somente após autorização do responsável:** Claude realiza uma **Etapa A UI exclusivamente para Facturas** com contrato/campos preservados, pode extrair componentes reutilizáveis localmente, registra capturas ANTES/DEPOIS 1440/768/375 quando realmente tiver navegador autorizado, testes UI e regressões fiscais/funcionais pertinentes, build, commit/push, PARA para reauditoria. Não editar `AUD-*` e não tocar em VM/PG/migrations. **Não iniciar Documentos electrónicos ou Notas de crédito por inferência**; cada menu tem auditoria própria. A auditoria funcional de Facturas segue **ABERTA**, com `FAT-X01…05` e decisões fiscais já registradas. Não atribuir status HOMOLOGADO nem nota numérica visual sem comparar screenshots da versão publicada.
