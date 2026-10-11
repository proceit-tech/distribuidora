# Nexit V1 — Revisão funcional pós-homologação visual do Cadastro de Clientes (AUD-R02)
**Data:** 2026-10-11  
**Estado:** CORRECAO_SOLICITADA / decisões pendentes; **NÃO HOMOLOGADO**.  
**Origem:** seis capturas reais da VM fornecidas pelo responsável, mais captura de referência externa de um emissor dedicado ao SIFEN. PNGs recebidos na conversa, **não versionados no GitHub**.  
**Base consultada:** CLAUDE.md; documentacao/PROTOCOLO-IA.md; PROGRESSO-NEXIT-V1.md (Clientes); AUDITORIA-CADASTRO-CLIENTES-PADRAO-FORMULARIOS-V1.md; CONFRONTO-CADASTRO-CLIENTES-API-DB-2026-10-11.md; app/(private)/clientes/nuevo/page.tsx; app/api/clientes/route.ts; NEX-005-clientes.sql, com NEX-021 mencionada como alteração posterior. Versão do formulário examinada: 48043db. Não houve execução de testes, SQL, build, nem verificação do esquema real na VM.

## 1. Delimitação e decisão do responsável
A Etapa A demonstrou melhoria visual, mas **a homologação funcional não foi concedida**. O responsável exige revisar 100% da coerência de todos os campos, sobretudo diferenças entre Contribuyente e No contribuyente, antes de permitir replicar o padrão. Esta rodada especifica/verifica; **não autoriza Claude a implementar** até decisão expressa. Não alterar DB/migrations, algoritmo DV, API ou regras fiscais por suposição. SIFEN é fonte de requisitos de cadastro do receptor; transmissão DTE continua V2. Benchmark da concorrência é apenas referência de sequência e compactação, jamais fonte normativa.

## 2. Constatações de alta prioridade
1. **Natureza × tipo de pessoa** — Tela exibe Tipo de persona para qualquer Natureza. A API lê tipoPersona e o esquema NEX-005 exige tipo_persona e tipo_contribuyente_sifen para todos. A auditoria anterior já observa que tipo contribuinte SIFEN é contextual. NÃO simplesmente ocultar sem tratar contrato e armazenamento. **Proposta UX**: ordem Natureza → identificação condicional (Tipo de persona se aplicável) → Operação → País → RUC/DV ou Tipo/Número documento → Nome/Razón social. Decisão pendente: diferenciar natureza fiscal, tipo de pessoa comercial e tipo de contribuinte SIFEN, especialmente para No contribuyente. Comportamento das opções deve ser fundamentado na norma e no contrato existente.
2. **B2F, Brasil, documento paraguaio** — Captura mostra No contribuyente + B2F + Brasil + Cédula paraguaya. A UI oferece lista quase idêntica de documentos não contribuintes para nacionais/estrangeiros; a combinação merece análise normativa. **Não bloquear sem validar fonte DNIT**; matriz explícita de tipos permitidos por operação/país é requisito pendente.
3. **B2F rotulado opcional quando API não aceita vazio** — DIV-CLI-01: remover contradição após aprovação da regra; não fabricar número substituto.
4. **RUC/DV** — Campo DV manual e obrigatoriedade atuais; qualquer cálculo/validação automática exige fonte DNIT e vetores conhecidos, autorização própria (DIV-CLI-06). Revisar limites/formatos do RUC sem converter identificadores para número.
5. **Innominado** — conflito API vs índice da DB (DIV-CLI-02). Definir se 1 por empresa; não corrigir silenciosamente.
6. **Endereço FISCAL** — tipo e checkbox podem discordar; segundo tipo FISCAL produz índice único violado (DIV-CLI-03). Corrigir apenas após decisão; backend também deve mapear erro pela constraint (DIV-CLI-04).
7. **Campos com asterisco** — Asterisco/aria-required são semânticos, não validação; Nro. casa fiscal na UI difere da API; item parcialmente criado pode ser filtrado silenciosamente (DIV-CLI-09/12). A obrigatoriedade deve vir de matriz única com condicionais verificadas.
8. **Edição incompleta** — PROGRESSO registra que edição de contatos/direções/documentos ainda não existe no detalhe; distinguir criação e manutenção para não prometer edição completa.

## 3. Matriz obrigatória para auditoria campo a campo (Claude deve produzir ANTES de implementar)
Para **cada** campo e checkbox visível/condicional nos seis conjuntos, preencher: aba | campo técnico | etiqueta ES-PY | finalidade | cenário (Natureza/Operação/País/Tipo documento etc.) | visível? | editável? | obrigatório? | default | dependências/limpeza ao mudar seleções | limites/formato | regra UI | regra POST/PUT | coluna/check/FK/index após todas migrations | erro esperado/aba-foco | status (confirmado/divergente/decisão) | fonte no código/norma. Não declarar teste executado. Também confrontar campos ocultos: tipo_contribuyente_sifen, esFiscal, flags de contatos, código automático, relações de catálogos e audit fields.

### Informação fiscal
Verificar Natureza; Tipo de persona (SIFEN versus dado ERP); Tipo de operación; País; RUC; DV; Tipo documento; Número; Descripción Otro; Nombre/Razón social; Nombre fantasía; e-mail/CC; teléfono/celular; transições contribuinte↔não, B2C↔B2F, PRY↔externo e tipo documento. Revisar a informação fornecida pelas opções nas capturas, inclusive B2F+Brasil+CI paraguaya. Não inferir obrigação fiscal só pelo benchmark.

### Comercial e crédito
Verificar Grupo; Condición de pago; Moneda predeterminada; Lista de precios; Límite crédito e temporal com rótulo Gs. versus moeda selecionada; Descuento %; Vencimiento; Día cobro; Email facturación/cobranzas; Recibir documento electrónico; Requiere orden compra; Bloquear ventas e Motivo; Observaciones; Canal venta; Código externo; GLN. Definir semântica de limite zero, datas reais versus texto, precisão decimal, moeda/lista e domínio do dia em meses curtos. Confirme consumo real de flags; não prometer funcionalidades V2.

### Contactos
Verificar Agregar/Eliminar; Nombre; Apellido; Cargo; Departamento laboral; Teléfono; Celular; Email; Principal; Recibe pedidos/facturación/cobranzas/documentos e o campo no estado **recibeNotificaciones** (existe no tipo e na API, não aparece entre os checks atuais). Explicitar diferença entre dados gerais do cliente, contato principal e preferências de envio; validar persistência e exclusividade.

### Direcciones
Verificar Tipo; Etiqueta; Dirección; Nro. casa; País; Complemento; Código postal; Departamento/Distrito/Ciudad em cascata; Contacto/telefono/horario recepción; Fiscal; Entrega predeterminada; Observación; campos latitud/longitud presentes no modelo mas não expostos. Validar NEX-021 versus DB real (sem executar nesta auditoria), condições de campo e coerência flag/tipo. Barrio fora da V1.

### Entrega y ventas
Verificar Ruta; Zona; Vendedor; Frecuencia; sete Días; Observación, inclusive combinações A demanda/Diaria/Semanal com dias marcados e efeitos ao trocar frequência. Não inventar bloqueio de combinações antes da definição comercial.

### Documentos
Verificar Agregar/Eliminar; Tipo; Nombre archivo; URL segura; Emisión; Vencimiento; Observación; linhas parcialmente preenchidas; validação de URL e datas; diferenciação link externo vs upload efetivo (não prometer upload inexistente); permissões e tenant.

## 4. Critérios de aceite para proposta de correção posterior
CA-01: matriz 100% dos campos e condicionais, com referências frontend/API/SQL e sem falsos obrigatórios.  
CA-02: cenários contribuinte PF/PJ PRY; não contribuinte PRY; B2F estrangeiro com documentos normativamente coerentes; innominado — todos têm resultado explícito, mesmo se bloqueados aguardando decisão.  
CA-03: transições entre Natureza/Operação/País/Documento não deixam estados invisíveis inconsistentes nem apagam valores sem entendimento; não alterar sem autorização.  
CA-04: backend e front devem concordar em exigências, limites, unicidade, erros e defaults; se divergirem, documentar decisão antes do código.  
CA-05: preservação dos seis conjuntos e todas as funcionalidades atuais, inclusive dados existentes e isolamento por empresa.  
CA-06: listas e relações obtidas de fonte real; geração de CLI pelo trigger intacta.  
CA-07: suporte a navegação para aba e campo com erro; sem perda dos dados preenchidos; acessibilidade e rodapé em tela longa/mobile.  
CA-08: homologação humana com capturas DEPOIS, cenário, versão, resolução/zoom e resultado; screenshots recebidos nesta conversa **não estão em Git**.  
CA-09: registrar claramente quais mudanças exigem API, migration ou autorização fiscal, sem implementar nesta fase.

## 5. Pendências separadas por natureza
**Erros já evidenciados por código:** DIV-CLI-01..04, 08, 09, 11, 12; reavaliar detalhe técnico antes de correção.  
**Decisões de negócio/fiscais:** matriz natureza/operacao/pais/documentos, significado tipoPessoa para não contribuintes, DV, GLN, crédito/moeda, frequência/dias, semântica de registros e flags.  
**Melhorias UX:** ordem/contexto de campos; mensagem por aba/campo; legenda de e-mails; indicação clara de links de documentos; comportamento de data; revisão dos vazios e responsividade.  
**Não escopo:** outros formulários, V2/SIFEN emissão, mudanças de banco e implantação.

## 6. Fluxo e próxima ação
Responsável decide prioridades e aprova implementação específica. **Claude, quando autorizado**, deve consultar novamente CLAUDE.md, PROTOCOLO-IA.md, PROGRESSO e esta auditoria; cruzar integralmente matrizes e contratos atuais, registrar divergências no GitHub, propor plano por correção, implementar **somente** o recorte autorizado, fazer commits/push e parar para revisão do ChatGPT. Sem testes/build/TypeScript/ESLint/Next.js/Docker/servidores/PG no notebook, sem VM, sem deploy conforme restrição vigente. Até lá: nenhuma alteração de código autorizada por esta auditoria.
