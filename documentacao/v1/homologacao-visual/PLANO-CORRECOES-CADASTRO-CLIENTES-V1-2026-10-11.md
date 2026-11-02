# Nexit V1 — PLANO DE CORREÇÕES DO CADASTRO DE CLIENTES
**Data:** 2026-10-11 | **Estado:** PROPOSTA PARA APROVAÇÃO HUMANA, não autorização automática de implementação.
**Base:** CLAUDE.md, PROTOCOLO-IA.md, PROGRESSO-NEXIT-V1.md, AUD-R02, AUD-R03, MATRIZ-NORMATIVA-CADASTRO-CLIENTES-SIFEN-V150.md, CONFRONTO-CADASTRO-CLIENTES-API-DB-2026-10-11.md e pacote original DNIT versionado. Branch: `feature/NEXIT-2026-001-banco-demo`.
**Princípio:** Cadastro V1 de clientes é dado mestre; exigências de XML do DE e validações de emissão continuam V2. Não remover campos nem dados existentes por inferência SIFEN. Sem alterações em DB/API/normas antes de aprovação expressa da respectiva etapa.

## 1. Ordem executiva das mudanças
| Etapa | Natureza | Escopo exato | Condição de aprovação |
|---|---|---|---|
| P0 | Definição de regras e UX | Homologar matriz de cenários abaixo, comportamento condicional e asteriscos; apontar conflitos API/DB sem implementar | Responsável aprova cenários; Claude documenta, ChatGPT audita |
| P1 | UX e correções locais da UI | Reordenar campos, rótulos, dicas contextuais, remover falsas obrigações, indicar aba do erro, não descartar itens incompletos e melhorar navegação/feedback; **somente após autorização** | Não quebrar POST nem perder nenhum campo/flag |
| P2 | Regras funcionais UI + POST/PUT | Corrigir B2F vs NOT NULL, exclusividade fiscal, validação de formato/erro e inconsistências de natureza/operação, mediante decisões por item | Sem migration automática; contratos definidos, ChatGPT revisa |
| P3 | Alterações estruturais excepcionais | Só se P2 provar necessidade: nova migration incremental, sem reescrever NEX-001..021, sem aplicar no banco real | Autorização separada da migration e execução só pelo responsável |
| P4 | Homologação VM | Build, fluxo de criação e edição, persistência, isolamento por empresa, fotos antes/depois | Responsável aprova; somente então padrão poderá replicar outros formulários |

## 2. Regras e ordem da primeira seção
**Sequência proposta na UI:** Natureza → Tipo de pessoa (condicional/contextual) → Tipo de operação → País → identificação aplicável → Nome/Razón social/Fantasía → dados gerais de contato. Não usar mera posição do campo como definição fiscal.
| Cenário | Campos e UI propostos | Persistência e SIFEN |
|---|---|---|
| Contribuyente nacional PF/PJ | Natureza Contribuyente, tipo PF/PJ, operação admitida, PRY, RUC e DV obrigatórios, razão social/nome | D205/D206/D207 pertinentes à emissão, RUC texto, não converter identificadores a números |
| No contribuyente PRY B2C | Natureza, operação, país PRY, tipo/número documento, nome; tipo de pessoa comercial apenas se definido | Não preencher D205 no XML, mas BD atual requer tipo_persona. Pendente definir valor e visibilidade para não gerar dados inventados |
| No contribuyente exterior B2F | Natureza, operação B2F, país exterior, razão social/nome; identificar comercialmente se requerido; documento não rotular simultaneamente opcional e obrigatório | D208/D210 sujeitos à reconciliação NT002×NT023; API/DB atuais exigem número: **bloqueado para implementação** até decisão |
| Innominado PRY B2C | Documento INNOMINADO, número 0 conforme contexto; indicação do nome normativo conforme DE | Decidir um cliente por empresa vs vários; valor/tipo DE só validado na emissão V2 |
| Contribuyente OEE | Identificação RUC + tipo PF/PJ coerente; indicação B2G conforme NT020 | Regra de determinação de OEE depende de fonte de RUC oficial, indisponível no ERP; não inferir por nome |

**Definições em aberto P0 obrigatórias:** (a) tipo de pessoa para não contribuinte — dado ERP separado ou informação visível? (b) cliente B2F com número de documento ausente no cadastro; (c) política de Innominado; (d) como tratar cadastro incompleto versus apto a emitir, sem criar status novo sem aprovação. Não modificar coluna NOT NULL apenas para ocultar UI.

## 3. Checklist de correções por aba
### Información fiscal
- P1: primeiro Natureza, depois Tipo de pessoa contextual, Operação, País; opções de documento claras conforme cenário e origem; rótulos e erros condizentes com API.
- P2: resolver DIV-CLI-01/02/05; validar coerência das trocas de Natureza/Operação/País/Documento; RUC 3–8 dígitos e DV 1 no contexto SIFEN conforme versão normativa confirmada; confirmar se regras bloqueiam cadastro ou apenas emissão.
- P2/P3 sujeito a decisão: algoritmo DNIT DV com vetores oficiais, mínimos/máximos SIFEN vs limite ERP (razão social, nome fantasia, telefone, e-mail, documento), sem truncamento.
- Garantir que dados fiscais para XML são distintos de valores comerciais extras; não impor proibição de guardar CI de estrangeiro apenas porque o XML não a transmite.

### Comercial y crédito
- P1: rótulos de limite não podem dizer Gs. se moeda padrão for diferente; exibir informação coerente sem converter valores arbitrariamente.
- P2 após regra comercial: significado de limite 0, moeda limite/lista de preço, limites temporários e vencimento, dia de cobrança inteiro 1–31 e meses curtos; valores decimais sem perda de precisão.
- P1/P2: feedback de e-mails, flags de recebimento e bloqueio com motivo; confirmar efeitos operacionais de Requiere OC/Recibe DE/Bloqueado antes de anunciar funcionalidade inexistente.

### Contactos
- P1: diferenciar contato geral da pessoa designada como principal; sinalizar campos obrigatórios apenas em cartão adicionado.
- P2: rejeitar/explicar linhas parciais em vez de filtrar silenciosamente (DIV-CLI-12); confirmar máximo um contato principal, inclusão da flag `recibeNotificaciones` hoje no estado/API porém não exposta e persistência.
- P2: edição de contatos já cadastrados está pendente no módulo de detalhe (PROGRESSO); não chamar cadastro V1 de completo até especificar essa capacidade.

### Direcciones
- P1: rótulo Nro. casa não deve exibir * se API não exigir; informar diferença entre endereço cadastral e completude fiscal para futuro DE.
- P2: sincronizar `tipo=FISCAL` e `esFiscal` sem criar duplicidade (DIV-CLI-03); mostrar erro por índice/constraint (DIV-CLI-04); somente um fiscal e um default entrega.
- P2: não impor geografia PRY completa no cadastro sem reavaliar NEX-021; testar cascata e país estrangeiro; Bairro fora da V1.

### Entrega y ventas
- P1: preservar todos os campos e 7 dias, explicar a frequência.
- P2 após decisão: coerência dos dias com frequência (Diaria/Semanal/A demanda) sem limpar marcações silenciosamente; validar catálogos por empresa e permissões.

### Documentos
- P1: informar que o modelo é nome + URL, não upload; campos/data claros.
- P2: não filtrar documento incompleto silenciosamente, validar URL, data emissão/vencimento; restrições por empresa, sem modificar armazenamento sem autorização.

## 4. Regras transversais inegociáveis
- Frontend e backend concordam em obrigatoriedade, limites, coerência, mensagens; erro indica aba e campo; não perder rascunho.
- Preservar `CLI-NNNNNN` automático e multi-tenant `empresa_id` da sessão; sem mocks, novos catálogos fixos ou alterações de outras telas.
- Sem validações SIFEN de contexto do DE aplicadas cegamente no cadastro mestre. Sem apresentar recursos V2 como concluídos na V1.
- Não eliminar os seis conjuntos, nem campos, checkboxes, documentos ou dados existentes.
- Diferenciar **defeito confirmado**, **proposta UX**, **decisão de negócio**, **regra SIFEN**, **dependência normativa**.

## 5. Testes de aceite na VM (apenas responsável)
1. Contribuinte PF/PJ PRY, RUC/DV, código automático, persistência e edição.
2. Não contribuinte PRY B2C com tipo/número corretos; RUC e DV não exigidos.
3. B2F Brasil, identificação comercial, país, registro e mapeamento fiscal coerentes.
4. Innominado repetido, erros e política de unicidade.
5. Duas direções FISCAL, um contato principal e um endereço de entrega default, com mensagens corretas.
6. Moeda diferente de PYG, limite 0/decimal, data inválida e dia 31.
7. Contato e documento parciais: nenhum dado desaparece silenciosamente.
8. Trocas de abas, responsividade, barra sticky, erros, permissão e isolamento entre empresas.
9. Catálogos e geografia da NEX-021 versus XLSX oficial, mediante conferência em ambiente autorizado.
10. Fluxo de leitura/edição dos filhos: registrar lacunas de edição, sem alegar suporte não implementado.

## 6. Dependências normativas
NT 021 ausente no pacote; NT002×NT023 B2F com interpretação a conciliar; conferência D3 página por página; planilha geográfica vs NEX-021; vetores oficiais DV. Podem bloquear **mudanças fiscais específicas**, não justificam adiar a documentação/UX independente que preserve contratos.

## 7. Autorização e próximo ciclo
Este documento é proposta de escopo, **não é autorização de implementação**. Sugestão: responsável autorizar primeiramente **P1, somente correções visuais/UX sem alterar validações ou contratos**. Claude deve consultar protocolos e matriz no GitHub, implementar tarefa única autorizada, commit/push, parar para ChatGPT revisar. Não usar notebook para testes/build/TS/ESLint/Next.js/Docker/PG, não acessar VM, não deploy.
