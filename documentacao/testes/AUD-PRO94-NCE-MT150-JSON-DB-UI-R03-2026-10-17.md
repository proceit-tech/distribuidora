# AUD-PRO94-NCE-MT150-JSON-DB-UI-R03 — Nova revisão fiscal e funcional independente

**Data:** 2026-10-17 · **Revisor:** ChatGPT · **Status:** CORREÇÕES E PROVAS OBRIGATÓRIAS PENDENTES · **Linear:** [PRO-94](https://linear.app/proceit/issue/PRO-94).  
**Repositório/branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`; código atual do ramo lido após o commit de correções INT-01/02/03 `834fd72279f9b592f4832ecc49a6c523502617da` e documento de auditoria R02.  
**Escopo deste ciclo:** revisão do zero de pontos críticos NCE contra **Manual Técnico SIFEN v150 vigente + Notas Técnicas 013, 021, 023, 024, 026 e 027**, construtor real do JSON NEXIT, snapshot FE, schema/migrations PostgreSQL, envio/consulta gateway, UI/modal e exigências RN-01..24/CA-01..23. 
**Método:** leitura direta de documentos oficiais disponíveis no portal DNIT e inspeção de arquivos reais do GitHub; **nenhum PostgreSQL, T26, browser, VM, gateway, SIFEN ou suíte executados**. Não dizer que o ZIP com 27 notas foi conferido integralmente arquivo a arquivo, nem que 217 páginas do manual foram reconciliadas individualmente; a revisão normativa foi **direcionada aos grupos e notas relevantes para NCE**. O repositório possui o pacote original em ZIP (`documentacao/referencias/sifen/NT_E_KUATIA_027_MT_V150(3).zip`) e manifesto; seu conteúdo não foi reextraído nessa auditoria. O manifesto aponta falta da NT 021 no pacote; consultou-se a **NT 021 diretamente na DNIT**.

## Fontes oficiais verificadas

- [Manual Técnico v150 DNIT, 217 páginas](https://www.dnit.gov.py/documents/20123/420592/Manual%2BT%C3%A9cnico%2BVersi%C3%B3n%2B150.pdf/e706f7c7-6d93-21d4-b45b-5d22d07b2d22?t=1687351495907): **página 78 (índice PDF 77)** E400 grupo obrigatório NCE, E401 iMotEmi, E402 dDesMotEmi 6–30 (obrigatório); **página 109 (índice PDF 108)** H001 obrigatório NCE, H002 iTipDocAso, H003 dDesTipDocAso 7–11 (obrigatório), H004 dCdCDERef 44 se eletrônico; **página 171 (índice PDF 170)** validação 1450 e 1452 da NCE.
- [NT 013/MT150](https://www.dnit.gov.py/documents/20123/420595/NT_E_KUATIA_013_MT_V150.pdf/ba73ec3b-5901-ae28-5d8c-9bed5632ab89?t=1687364547529): fórmulas de base gravada IVA E735, exenta E737, subtotais F002/F004/F005 e precisão 8 decimais.
- [NT 021/MT150](https://www.dnit.gov.py/documents/20123/420595/NT_E_KUATIA_021_MT_V150%2B30.12.24.pdf/ab12f22b-42a2-9bd4-e3a0-7141d9e4b8d0?t=1735592286335): limite histórico de Innominado (Gs 35 milhões), **alterado pela NT 024**.
- [NT 023/MT150](https://www.dnit.gov.py/documents/20123/420595/NT_E_KUATIA_023_MT_V150.pdf/9580922b-5dd5-60f9-4857-ae66a757898f?t=1724967650006): **validação D208e código 1331**: para NCE/NDE/NRE o tipo de documento do receptor **não pode ser Innominado (D208 ≠5)**, independentemente do valor; H001 documento associado obrigatório; H004g valida vínculo com emissor/RUC fusionado; E711 quantidade 1–10p(0–8).
- [NT 024/MT150](https://www.dnit.gov.py/documents/20123/420595/NT_E_KUATIA_024_MT_V150.pdf/8f8c0fc6-ee49-74b6-469d-0f79c18065ed?t=1734614145050): FE com Innominado admitido abaixo de Gs 7 milhões, salvo condições; **não revoga D208e da NT 023 para NCE**.
- [NT 026/MT150](https://www.dnit.gov.py/documents/20123/420595/NT_E_KUATIA_026_MT_V150.pdf/605010d6-22fe-b732-24ab-c6e9d7868b4f?t=1749487559733): ajustes de DNCP/compra pública e catálogo de item, sem alteração direta identificada de E401/E402/H003.
- [NT 027/MT150, de 09/03/2026](https://www.dnit.gov.py/documents/20123/420595/NT_E_KUATIA_027_MT_V150.pdf/e5376c97-64cf-3fe0-e962-b6f22c8c207a?t=1773076266295): alterações de evento de nominação FE; não identificou revogação das regras NCE examinadas.
- [Índice oficial de documentação DNIT](https://www.dnit.gov.py/en/web/e-kuatia/documentacion-tecnica): Manual v150, NT 001..027, arquivos XML/XSD. **Sem validação XSD de XML realmente gerado**.

## Resumo executivo

**NCE V1 NÃO APROVADA PARA HOMOLOGAÇÃO/IMPLANTAÇÃO.** Esta revisão encontrou **1 lacuna fiscal ALTA demonstrada no código** e **1 falha de garantia de confirmação da UI (MÉDIA)**, além de **2 campos XML mandatórios sem comprovação da transformação pelo gateway**. As correções anteriores INT-01/02/03 permanecem visíveis no código, mas **não substituem essa revisão normativa**.

| ID | Severidade | Estado | Resultado |
|---|---|---|---|
| **MT-01** | **ALTA** | Falha comprovada de pré-validação fiscal | NCE herda `iTipIDRec=5` de uma FE Innominado válida, embora NCE proíba essa identidade (NT023 D208e) |
| **UI-01** | **MÉDIA** | Garantia ausente no código; requer cenário de UI real para demonstrar acionamento | O corpo usado em **Emitir** é recalculado e pode diferir do corpo revisado sem confirmação renovada |
| **XML-01** | **BLOQUEIO DE PROVA**, não bug comprovado | Contrato gateway não verificado | Campo **E402 dDesMotEmi** obrigatório no XML NCE; JSON NEXIT só fornece iMotEmi |
| **XML-02** | **BLOQUEIO DE PROVA**, não bug comprovado | Contrato gateway não verificado | Campo **H003 dDesTipDocAso** obrigatório no XML do documento associado; JSON NEXIT fornece iTipDocAso + dCdCDERef sem descrição |
| **EXT-01** | Dependência | Sem execução real | Motivos 3/4/8, USD/BRL, XML/XSD/KuDE/resultado SIFEN real não demonstrados |
| **DB-01** | Dependência | Sem execução real | NEX-062, T26 e funções SQL somente versionados; banco real não verificado |

### MT-01 — ALTA: FE legal com Innominado pode gerar NCE incompatível com D208e

**Prova cruzada:**
1. A FE possui validação explícita permitindo `tipoDocumentoIdentidad===5` em B2C abaixo de Gs. 7.000.000 com nome/documento adequados: [`lib/facturacion/payload-fe.ts:230`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/payload-fe.ts#L230)–245; seus campos `iTipIDRec`/ `dDTipIDRec` são serializados no JSON FE.
2. A NCE carrega **sem alteração** os 19 campos do receptor de seu snapshot FE, inclusive `iTipIDRec`: [`lib/facturacion/payload-nce.ts:60`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/payload-nce.ts#L60)–63 e [`lib/facturacion/payload-nce.ts:258`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/payload-nce.ts#L258)–269.
3. `leerFacturaOriginal` verifica apenas status aprovado/CDC/snapshot e extrai todos os receptores, mas não o veto a Innominado na NCE: [`lib/facturacion/nce.ts:124`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/nce.ts#L124)–188.
4. O preflight `validarEntradaNce` não tem essa regra e a função SQL `fe_documento_crear_nce` confronta que o receptor seja **igual ao original** mas não nega `iTipIDRec=5`: [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql:185`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L185)–200.
5. A NT023 D208e **proíbe** `iTipIDRec=5` para NCE. Uma FE B2C aprovada de Gs. 100.000 com receptor Innominado é um exemplo plausível de FE que o sistema admite, mas cuja NCE copiaria a identidade fiscal proibida.

**Correção esperada após autorização:** bloquear a seleção/preparação de NCE de FE com receptor Innominado e mostrar motivo fiscal claro **antes de reservar número**; guardar defesa SQL no NEX-062 (ainda não aplicada); **não alterar o receptor original, não criar documento de identidade fictício, não alterar FE já emitida**. Se a operação exigir regularização, deixar o procedimento externo para definição fiscal humana, sem automatizar. Testes pontuais: FE Innominado válida para FE, NCE recusa antes da sequência; NCE receptor identificado aceita; servidor e SQL concordam, sem afetar motivos/IVA.

### UI-01 — MÉDIA: conteúdo emitido não é vinculado à prévia revisada

**Prova de código:** [`app/(private)/notas-credito/page.tsx:201`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/app/(private)/notas-credito/page.tsx#L201)–225 `revisar()` cria `c = cuerpo()`, manda à API `/previa` e guarda só o `resumen`. [`app/(private)/notas-credito/page.tsx:232`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/app/(private)/notas-credito/page.tsx#L232)–244 `emitir()` **chama `cuerpo()` novamente**, sem comparar assinatura/hash/corpo com o utilizado na prévia. O componente mantém inputs originais ativos, e o overlay declara `role=dialog aria-modal`, mas não torna fundo inerte nem fixa o foco, conforme [`app/(private)/notas-credito/page.tsx:426`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/app/(private)/notas-credito/page.tsx#L426)–461.

**Consequência:** se algum campo for alterado enquanto o modal está aberto (por exemplo, navegação por teclado para um input de fundo), o operador pode confirmar valores **diferentes** daqueles que a prévia exibiu. O backend recalcula e valida, portanto isso **não demonstra violação do cálculo fiscal ou reserva dupla**, mas demonstra ausência da garantia de confirmação da RN-17.

**Correção esperada após autorização:** guardar corpo canônico da prévia para enviar **exatamente ele** após o aceite, invalidar/fechar prévia em qualquer mudança ou exigir nova revisão se o corpo divergente, impedir que campos do fundo recebam foco/interação quando modal aberto; manter idempotência, segurança servidor e prioridade dos erros. Casos pontuais: prévia A→mudar valor B→não permitir emitir B sem nova prévia; confirmar A emite A; erro do servidor não duplica número; fechamento/retorno a editar funciona. Validação visual/navegador ficará humana.

### XML-01/XML-02 — Campos mandatórios do XML NCE não visíveis no JSON de entrada

**Constatação:** o builder de [`lib/facturacion/payload-nce.ts:243`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/payload-nce.ts#L243)–294 serializa `iTiDE=5`, `iMotEmi`, `DocumentosAsociados:[{iTipDocAso:1,dCdCDERef}]`, `Detalles`, `Subtotales`, receptor original e `dInfAdic` opcional. Não inclui `dDesMotEmi` nem `dDesTipDocAso`. O Manual v150 exige os campos **E402 e H003** no XML final, com descrições que correspondem aos códigos.

**Limite da conclusão:** isto NÃO prova que o JSON está errado **para o gateway proprietário**. O gateway pode gerar automaticamente `gCamNCDE.E402` e `gCamDEAsoc.H003` ao construir o XML. A especificação arquivada confirma que houve um JSON NCE motivo 2 aprovado mas o XML **efetivamente gerado por aquela amostra** não foi apresentado nem verificado nesta sessão. Não adicionar chaves planas ou grupos XML na API por suposição.

**Prova indispensável:** obter, por procedimento humano autorizado, **exemplo sanitizado do XML assinado gerado pelo mesmo gateway** a partir do JSON da NCE, verificar E400/E401/E402 e H001/H002/H003/H004 em seu lugar certo e com textos coerentes, comparar com XSD/NT relevantes, conferir CDC próprio e da FE original, impostos/cálculos para quatro motivos e moedas. Se o gateway NÃO produz E402/H003, então será necessário adaptar exatamente o contrato do fornecedor (mediante documentação oficial dele), nunca inventar endpoint ou nome de propriedade. Guardar evidência de aceitação/rejeição SIFEN em homologação humana.

## Quadro de auditoria cruzada por camada

| Camada | O que foi efetivamente encontrado em código | Limitação |
|---|---|---|
| **JSON NCE** | `iTiDE=5`, códigos de motivo 2/3/4/8, `DocumentosAsociados[0].dCdCDERef` (44), `iTipDocAso=1`, detalhes de unidade/qty/preço/IVA, subtotais, moeda e câmbio, observação, receptor FE | XML E402/H003 não explícitos; receptor Innominado inválido para NCE não é barrado |
| **IVA/NT13** | Fórmula do motor TS e SQL para base gravada, IVA e base exenta (inclusive parcial), até 8 decimais, totais e F023 estrangeiro, confirmado por inspeção contra NT013 | Paridade de PostgreSQL e validação SIFEN reais **não executadas** |
| **Gateway** | Configuração por empresa, autenticação em servidor, `/api/recepcion_de` e `/api/consulta_de` (`tipoDoc:"NCE"`), distinção do lote/HTTP versus APROBADO, timeout bloqueado, RECHAZO genérico corrigido em INT-01 | contrato XML interno real não confirmado; sucesso para motivos 3/4/8 não comprovado |
| **PostgreSQL lógico** | `documentos_electronicos` por FE/NCE e CDC próprio; `nce_origen` por NCE/FE/CDC original; `nce_lineas` por ordinal, FK composta; `solicitudes` JSON e `intentos`; lock FE/seq, saldos e motivo histórico | sem D208e na função SQL; NEX-062 não executada |
| **Campos/precisão** | CDC 44, número 7, ponto/est 3, `nce_lineas.cantidad numeric(20,8)`, `monto numeric(24,8)`, `documentos_electronicos.total numeric(20,4)` com fail-fast exato, obs 5000, JSONB `pg_column_size<262144` | apenas código/DDL, não estado real; 240k bytes JSON antes da reserva é limite preventivo, não garantia do armazenamento binário do JSONB |
| **Tela NCE** | busca cliente/FE, apenas aprovadas com CDC e saldo, NCE pendente desabilitada, quatro motivos, linhas originais sem mesclar, IVA/câmbio, ponto com sequência, prévia/modal e redirecionamento a Documentos | corpo confirmado não é vinculado à prévia; aparência e foco do modal não vistos em navegador |
| **Estados/worker** | server-side NCE, lease/`SKIP LOCKED`, usuário ativo CREAR/EDITAR com alcance; retries e histórico; indeterminado bloqueia | funcionamento real na VM não verificado; reconsulta de NCE já APROBADO para detectar CANCELADO ficou explicitamente fora de escopo |
| **Segurança** | empresa/usuário da sessão, `sucursal_en_alcance`, `SECURITY DEFINER`, privilégios runtime SELECT + execução de funções; gateway secrets em servidor | provas reais concorrência, permissões de PostgreSQL e carga não executadas |
| **Homologação** | uma estrutura sanitizada de NCE motivo 2 aprovada foi documentada pelo usuário; testes `nce.casos`/FAT-E2 locais relatados 0 falhas em commits prévios | amostra real não substitui XML/XSD dos quatro motivos, USD/BRL, eventos e fluxo final; T26 não executado |

## Requisitos afetados

- **RN-01 / RN-08 / RN-12 / RN-23 e CA-04/CA-16:** fonte FE original imutável, porém **NCE com receptor fiscal Innominado deve ser recusada pela proibição normativa D208e**. Manter identidade imutável e bloquear, não corrigir falsificando documento.
- **RN-17 e CA-15:** confirmar somente o mesmo conteúdo que foi mostrado na prévia, backend revalida e reserva atomicamente.
- **RN-03 / RN-11 / RN-13 / RN-18 e CA-16/CA-17:** campos/semântica de XML NCE, motivos 3/4/8 e moeda estrangeira dependem de prova com o gateway.
- **RN-20 / CA-18 e critérios SQL de concorrência:** há implementação estática, mas execução e infraestrutura não verificadas.
- Os demais RN/CA documentados no checklist oficial permanecem **NÃO HOMOLOGADOS**. Não substituir a matriz integral por percentual falso de sucesso sem evidências correspondentes. Evitar prometer “não falta nada” baseado em testes mock.

## Estado e providências

**Bloqueio:** não aplicar `NEX-062`, não declarar NCE 100% concluída, não habilitar emissão fiscal real neste parecer.

**Recomendação técnica (não é autorização):** corrigir **MT-01** e **UI-01** em um único ciclo Claude após autorização do responsável; ChatGPT audita o SHA; após isso, homologar **XML-01/XML-02** e motivos/multimoeda pelo provedor real, com plano humano seguro de migration, backup e operações. **Não executar T26 em PostgreSQL operacional**, pois gera fixtures artificiais e existe uma única base operacional. Sem nova suíte global automática nem novos subprojetos.

**Resultado:** `AUD-PRO94-NCE-MT150-JSON-DB-UI-R03 = CORRECOES_NECESSARIAS + CONTRATO_GATEWAY_NAO_COMPROVADO`; `PRO-94 = In Progress`; `NEX-062 = NÃO APLICADA`; `NCE = NÃO HOMOLOGADA`.
