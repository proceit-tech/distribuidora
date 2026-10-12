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

**Decisão DEC-PRD-U08:** confirmar se uma FE cujo payload está imutável e estoque zero deve bloquear a troca da base até estado fiscal concluído, ou se o documento fiscal por si só não bloqueia e somente o fato físico pendente bloqueia. Ver `AUD-PRODUCTOS-V1.md` §XVII. Nenhum impacto retroativo sobre DE, preço, IVA ou estoque pode ser presumido.

**Estado:** auditoria cruzada aberta, sem testes na VM/gateway.
