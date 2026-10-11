# Nexit V1 — AUD-R05 e ordem de execução: correção integral controlada de Clientes
**11/10/2026 — estado: CORREÇÃO FUNCIONAL AUTORIZADA PELO RESPONSÁVEL, pendente entrega de Claude e homologação humana.** Esta ordem substitui a exigência anterior de voltar apenas à P0. A implementação é feita por Claude Code; ChatGPT documenta e audita. NÃO significa autorizar SQL/deploy na VM, emissão SIFEN V2 ou migrations.
**Fontes obrigatórias:** CLAUDE.md, documentacao/PROTOCOLO-IA.md, PROGRESSO-NEXIT-V1.md, AUD-R02/R03/R04, matriz P0, MATRIZ-NORMATIVA-CADASTRO-CLIENTES-SIFEN-V150.md, pacote DNIT original arquivado, decisões DEC-CLI-01/02/03 (incluindo adendo NT002×NT023), componentes UI, POST e PUT, NEX-005 e modificações NEX-021. O documento não substitui as fontes.
**Objetivo:** pôr em funcionamento correto as regras aprovadas em Clientes, não apenas redesenhar; entregar em etapas pequenas auditáveis. Sem atingir outros cadastros, catálogo geral, DB real ou V2. Cada etapa termina em commit+push e STOP para revisão.

## Regras aprovadas pelo responsável (vinculantes)
- B2F = sempre **No contribuyente**; país exterior; **tipo e número do documento sempre obrigatórios no CADASTRO**; se OTRO, descrição obrigatória; nunca INNOMINADO em B2F. Repetir em UI e backend. **A obrigatoriedade de XML D208/D210 no DE B2F NÃO foi definitivamente estabelecida**, devido às diferenças NT002/NT023. Não implementar nem alterar XML V2 ou declarar a norma esclarecida.
- Contribuyente = selecionar explicitamente **Persona física ou Persona jurídica**, informar RUC; **DV calculado automaticamente com base no RUC** e coerência obrigatória no backend. **Antes de codificar o algoritmo, comprovar fonte oficial aplicável e vetores de teste de RUC/DV reais**, evitando aproximação, substituição inventada ou algoritmo CDC. Se faltar prova, isolar somente esse subitem e prosseguir com outros defeitos aprovados.
- INNOMINADO = **um único cliente oficial por empresa**; reutilizável. Preservar checagem na API; estratégia atômica contra duplicidade concorrente deve ser apresentada se exigir índice novo. **Não criar migration nem aplicá-la sem autorização própria**. Não permitir novo innominado indiscriminadamente e não inferir emissão permitida em qualquer valor.
- D-12 (**recibeNotificaciones**) NÃO foi decidido: preservar funcionalidade/valor existente e não introduzir controle ou regra sem decisão.
- D-01: tipo de pessoa em não contribuinte **não decidido**. Não esconder o campo nem persistir valor fictício. Reordenar a sequência sem mudar semântica.
- D-07 limites específicos SIFEN e obrigatoriedade geográfica na emissão não devem virar bloqueio do ERP indiscriminadamente; corrigir contradições UI/API que já tenham decisão aprovada.

## Execução em duas entregas com parada entre elas
### E1 — UI + correções não estruturais do cadastro Novo Cliente, autorização presente
1. Reorganizar Identificación fiscal: Natureza → Tipo de persona contextual (sem ocultar para No contribuyente enquanto D-01 aberto) → Tipo de operación → País → identificação aplicável → Nombre/Razón social → contato geral. Preservar valores e evitar layout duplicado; idioma espanhol PY.
2. B2F: retirar rótulo '(opcional)' do número; tipo e número de identidade com *; OTRO exige descrição; preservar seleção de país ≠PRY e restrição de INNOMINADO. Contribuinte: explicitar PF/PJ, RUC e campo DV **somente leitura quando cálculo normativo comprovado**; não inventar DV provisório.
3. Mudança de Natureza/Operação/País/documento: preservar onde válido; ao perder dados já preenchidos, confirmação contextual antes de limpar; prevenir combinações invisíveis inválidas.
4. Validar os seis conjuntos antes do POST **sem descartes silenciosos**: contatos, endereços, documentos adicionados e parcialmente preenchidos apresentam erro acionável na aba e no campo; vazios novos somente ignorados após aviso/remoção explícita conforme caso; erros de API apontam seção adequada quando possível.
5. Endereço FISCAL: ao escolher outro tipo FISCAL, garantir coerência do `tipo` e `esFiscal` de todos os itens, sem criar duplicidade em POST; apenas um fiscal e um entrega default. Número da casa não pode mostrar * falso; registrar que exigência SIFEN é contextual ao DE.
6. Não sugerir moeda dinâmica como se limites fossem na moeda selecionada: remover promessa contraditória e manter 'Gs.' se moeda do crédito efetivamente fixa até D-10. Datas de UI devem corresponder a formato real do backend; sem interpretação silenciosa. Dias de cobrança inteiros.
7. Preservar campos e flags existentes de todas as abas, inclusive `recibeNotificaciones` invisível até D-12, código automático, geografia PRY NEX-021, dados comerciais e isolamento da empresa.
8. Nenhuma mudança API/SQL nesta E1; se problema não corrigível apenas UI, registrar e deixar para E2.
**Parar com commit E1 e aguardar revisão ChatGPT e homologação visual humana antes de E2.**

### E2 — API/validações/mensagens, autorização de ESCOPO, início somente após revisão E1
1. Impor no POST (e avaliar consistência do PUT existente, sem criar suporte novo a coleções) matriz Natureza×Operação, B2F/no contribuyente, país, identificação obrigatória/OTRO, sem confiar na UI. Não alterar fluxo V2.
2. Validar RUC como string numérica de comprimento conforme norma aplicável e UI, DV calculado/verificado somente com prova normativa e vetores. Alinhar tipo/número de documento do cadastro com limites escolhidos e evitar truncamento silencioso. Erros específicos para campo.
3. API reporta violações de índices/constraints por causa real (cliente duplicado, código externo, fiscal, entrega default, contato principal), nunca erro genérico enganoso.
4. Impor `diaPreferidoCobro` inteiro 1–31; validar URL http(s) de documentos (segurança de esquema); datas válidas; comprimento e nulidade explicados, sem perda silenciosa. Validar GLN somente conforme regra posteriormente autorizada; sempre rejeitar corte silencioso.
5. Innominado único por empresa: manter checagem e propor estratégia transacional/índice concorrente **sem executar migration**. Se precisar alteração de schema, parar esse subitem e solicitar autorização P3.
6. Não expandir edição PUT de contatos/endereço/documentos ou alterar contratos comerciais sem escopo separado.
**Parar em novo SHA para revisão.** Nenhum acesso VM.

## Critérios de aceite específicos (somente execução na VM pelo responsável)
- PF/PJ contribuinte com RUC e DV confirmado; B2C não contribuinte; B2F exterior com tipo/número/OTRO; Innominado único; mensagens claras.
- Alterar natureza e operação com dados escritos sem desaparecimento silencioso; não há campo condicional falso.
- Dois endereços FISCAL não geram 23505; dois contatos e um principal; documento/link; validação por aba.
- UI e POST recusam os mesmos estados inválidos; identificações não são truncadas; empresa/usuário da sessão, código CLI intacto.
- Respeitar catálogos reais, geografia opcional NEX-021, regras ERP e emissão V2 isolada.

## Pendências documentais / NÃO supor
NT021 ausente; cotejo integral de D3 nos PDFs; NT002 versus NT023 no XML B2F; planilha geográfica 2025 versus estado do banco NEX-021; vetores oficiais de DV; decisões D-01, D-08, D-10, D-12, D-13 onde não aprovadas. NÃO chamar 100% homologado sem resolver. **As pendências não bloqueiam E1 independente nem E2 nos itens comprovadamente resolvidos; bloqueiam somente alterações que dependam delas.**

## Proibições e reporte
Claude no clone local autorizado, sincronização segura, commits na branch, sem testes/build/TS/ESLint/Next.js/Docker/PostgreSQL/servidores no notebook, sem VM/deploy nem migrations reais, sem merge main. Reportar resultado, testes não executados, bloqueios concretos, SHA. Sempre atualizar progresso factual, preservar documentos AUD anteriores.
