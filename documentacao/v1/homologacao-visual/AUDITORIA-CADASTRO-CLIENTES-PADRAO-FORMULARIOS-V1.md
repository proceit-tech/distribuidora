# Nexit V1 — Auditoria integral do cadastro de Clientes e padrão de formulários

**11/10/2026 · ESTADO: ESPECIFICAÇÃO DE AUDITORIA, NÃO IMPLEMENTADA, NÃO HOMOLOGADA.** Fonte: 9 prints reais de `/clientes/nuevo` recebidos pelo responsável nesta conversa; GitHub `app/(private)/clientes/nuevo/page.tsx`, `page.module.css`, migration `NEX-005-clientes.sql`, regras e decisões NEX-021 (localização opcional já aplicada pelo responsável). Base normativa de referência: Manual Técnico SIFEN v1.50 da DNIT (grupo D3 de receptor, não faturação ativa na V1), e boas práticas de sistemas ERP; esta última é proposta UX/ERP e **não exigência fiscal**.

**Responsabilidades:** ChatGPT audita/recomenda/documenta; Claude Code implementa **somente depois de autorização humana**, sem testes/build/servidores no notebook; responsável faz build/deploy na VM e homologa. Não ampliar V1 para faturação eletrônica (V2). Não mexer em DB, migrations e dados sem decisão específica. A documentação registra os prints como recebidos em conversa, mas seus PNGs **NÃO foram publicados no GitHub**. Nenhuma alegação de evidência binária versionada sem verificação.

## 1. Diagnóstico estrutural verificável nos prints

1. O topo repete `Nuevo cliente` como H1, eyebrow e breadcrumb, além de `Datos del cliente` como segundo título; ocupa espaço vertical em excesso. O breadcrumb `Distribuidora Central` destoa do menu `Maestros` e da identidade multiempresa. **Trocar por `Maestros / Clientes / Nuevo cliente`** (ou breadcrumb dinâmico equivalente).
2. Remover texto genérico `Registro comercial, logístico y fiscal para ventas y facturación electrónica` do cabeçalho, pois a FE SIFEN ainda não opera na V1. Remover textos redundantes de introdução nas seções, não os rótulos necessários.
3. Remover totalmente o bloco azul `Código automático / No se utiliza código cliente SIFEN`: código interno segue criado automaticamente e persistido; **não remover a regra**, só aviso decorativo.
4. O formulário usa floating labels muito pesadas e comprimidas com valores na mesma caixa (ex.: `Naturaleza / Contribuyente`, `Moneda / PYG`), campos e valores desalinhados e excesso de negrito; refinar com tokens de label/input/foco/erro consistentes e acessíveis.
5. Seis abas `Información fiscal`, `Comercial y crédito`, `Contactos`, `Direcciones`, `Entrega y ventas`, `Documentos` têm pouco contraste entre ativa/inativa e navegação extensa. Dar estado ativo inequívoco (contorno/fundo/linha, contraste), foco visível, erro por aba, rolagem horizontal controlada no notebook/mobile e preservação do rascunho ao navegar.
6. O rodapé `Guardar cliente` deve ser acessível sem grande scroll, mas não cobrir campos/erros; garantir ação salvar única, desabilitar duplo envio, feedback de validação e navegação para primeira aba com erro. Confirmar com navegador.
7. Contentores vazios `Aún no hay registros en esta sección` são desproporcionais nas abas vazias. Compactar e associar explicitamente às ações Agregar.
8. `Los campos con * son obligatorios` é repetido em várias seções; exibir uma vez por contexto e aplicar indicadores apenas aos campos realmente condicionais ao estado atual.

## 2. Padrão visual base obrigatório de formulários V1

| Componente | Padrão-alvo | Aceite |
|---|---|---|
| Breadcrumb | 12px/regular, `Maestros / Clientes / Nuevo cliente` | objetivo; não repetir nome no cartão |
| Título H1 | 24–26px/700; altura do topo ~54–68px com ação Volver | compacto e alinhado |
| Card | uma superfície principal sem segundo cabeçalho grande; padding interno 16–20px | economia de altura, sem perda de contexto |
| Abas | 13–14px/600, altura 40–44px, ativo com contraste e underline/fundo, foco visível | nomes completos e navegação teclado |
| Seção interna | 16px/650, subtítulo só quando operacionalmente necessário | hierarquia clara |
| Label | 12–13px/550–600, flutuante **somente quando não sobrepõe valor** | label continua visível com preenchimento/autofill |
| Valor de campo | 14–15px/400–500; 16px em mobile se necessário para evitar zoom | não cortar opção selecionada |
| Campos | altura 40–44px, padding 10–12px; textarea adaptável | seleção legível, sem negrito excessivo |
| Grid | 4 colunas apenas em desktop largo e quando adequado; 2 em notebook; 1 mobile | não comprimir texto nem dados |
| Botão primário | 38–40px, 13–14px/600, mesmo padrão das listagens | sem botões gigantes |
| Estado vazio | uma mensagem curta com ação contextual; não forçar 400px de altura | sem espaços vazios artificiais |
| Erro | próximo do campo, em sumário por aba; foco visível; aria-describedby | erros claros, sem perda de dados |

**Reutilização:** extrair tokens/componentes acessíveis compartilhados somente depois de confirmar a solução em Clientes, aplicando aos demais formulários gradualmente, com auditoria funcional própria por módulo. Não introduzir nova biblioteca visual nem reescrever módulos indiscriminadamente.

## 3. Auditoria campo a campo — Identificación fiscal

| Campo | Fonte/estado observado | Regra, validação e melhoria proposta |
|---|---|---|
| Naturaleza | `Contribuyente / No contribuyente`; seleção default Contribuyente | Distinção SIFEN iNatRec (1/2). Atualizar obrigatoriedade/visibilidade de RUC vs documento, tipo de pessoa e mensagens sem limpar dados sem aviso. Testar troca ida/volta. |
| Tipo de operación | B2B/B2C/B2G/B2F condicionado à natureza; default B2B | Regra SIFEN iTiOpe: B2F exterior e país diferente de PRY; outras operações PRY no escopo descrito. Validar no frontend **e backend**; valores e nomes coerentes. Não assumir que cadastro sempre emitirá FE. |
| País | PRY por padrão, seletor bloqueado para operação nacional | Usar catálogo SIFEN carregado; salvar ISO alfa-3 e nome derivado confiável; B2F estrangeiro. Confirmar se PRY indisponível corretamente e se todos países oficiais foram carregados (ex.: Francia). |
| Tipo de persona | Física/Jurídica, default Jurídica | Confirmar regra condicional: no SIFEN `tipo contribuyente` pertence ao receptor contribuyente; no contribuinte não obrigar erroneamente quando fiscalmente não aplica. No cadastro ERP pode ser dado auxiliar separado, devidamente identificado. |
| RUC | obrigatório contribuinte | Guardar apenas parte do RUC sem DV, conforme modelo; aceitar zeros significativos, normalizar separador controladamente, validar comprimento/charset/duplicidade por empresa e mostrar máscara coerente. Não converter para número. |
| DV | campo manual obrigatório contribuinte | **Proposta solicitada pelo piloto:** cálculo/validação automática por algoritmo DNIT aplicável ao RUC, usando fonte oficial e vetor de teste confiável; permitir reconciliação com cadastros reais e não inventar algoritmo de CDC. Frontend e backend devem concordar; checar erros e RUC estrangeiro. Não implementar sem auditoria da norma específica. |
| Tipo de documento | Para no contribuyente: CI PY, passaporte, CI estrangeira, residência, innominado etc. | Exibir catálogo SIFEN válido por cenário (incluindo B2F), separar campo de descrição quando Outro; verificar compatibilidade `tipo_documento_identidad_sifen` e enum BD; evitar valor escondido inválido após mudança natureza. |
| Número documento | obrigatório salvo condições externas específicas | Preservar alfanuméricos e zeros iniciais, limites por tipo, validação condicional na UI e API; nunca impor máscara paraguaia a passaporte estrangeiro. |
| Descripción del documento | condicional para Otro | Ocultar/inativar nos demais; exigir se Outro, validação frontend/backend. |
| Nombre o razón social | obrigatório | Valor texto livre com trims, comprimento e caracteres Unicode; duplicidade por documento não deve impedir filiais legítimas sem regra definida. |
| Nombre de fantasía | opcional | Diferenciar nome legal, fantasia e abreviaturas; evitar sobreposição de etiquetas. |
| Correo electrónico | opcional | Validação es-PY e coerência frontend/SQL; não impor e-mail ao cadastro. |
| Correo en copia | opcional | Explicitar destinatário CC de documentos, evitar prometer envio SIFEN operacional na V1. |
| Teléfono / Celular | opcionais | Código país/DDD, caracteres +/espaços, formatos internacionais e tolerância para PY e exterior; não impor 10 dígitos cegamente. |

**Checagens cruzadas:** `NEX-005` tem `naturaleza_receptor`, `tipo_operacion`, `tipo_persona`, `tipo_contribuyente_sifen`, `pais_codigo`, `tipo_documento`, `numero_documento`, `dv`, `razon_social`, além de checks de condicionalidade e unicidade. Não declarar todas as validações confirmadas em runtime sem testar a API/DB. Verificar divergência entre constraint no script inicial e estado real após migrations posteriores.

## 4. Auditoria campo a campo — Comercial y crédito

| Campo | Melhoria/verificação ERP |
|---|---|
| Grupo de cliente | Manter opcional e parametrizável; filtrar por empresa; distinguir grupo comercial de categoria fiscal. |
| Condición de pago | Confirmar opções cadastradas e se condição inadimplente/inativa pode ser selecionada; impacto em crédito e vendas futuras. |
| Moneda predeterminada | PYG por padrão; ISO 4217, exibir símbolo/nome; não presumir que `Límite de crédito (Gs.)` segue moeda selecionada sem regra explícita. |
| Lista de precios | Mostrar só listas válidas por empresa/moeda/vigência, ou indicar incompatibilidade; regra de preços de referência não é substituta automática de lista vazia. |
| Límite de crédito (Gs.) | Numérico decimal >=0, separador de milhar adequado, sem descartar zero; verificar semântica `0` = sem crédito ou ilimitado? **Decisão comercial necessária**. |
| Descuento comercial (%) | Faixa 0–100, precisão e arredondamento consistentes frontend/backend; não aplicar preço automaticamente nesta etapa. |
| Límite temporal (Gs.) | Só aplicável se vigência temporal coerente; checar intervalo e exceção para cliente bloqueado. |
| Vencimiento del crédito | Validar data real dd/mm/aaaa, passado/futuro, relação obrigatória com limite temporário. |
| Día preferido de cobro | 1–31 conforme BD; explicar como será tratado mês menor (28/29/30), ou impedir promessa funcional não implementada. |
| Correo de facturación | E-mail válido e finalidade clara; faturação SIFEN ainda V2. |
| Correo de cobranzas | E-mail válido; distinguir de e-mail principal. |
| Recibir documento electrónico | Checkbox default ativo; preferências comerciais V1, **não significa FE ativa**; explicar valor no contexto de envio futuro se mantido. |
| Requiere orden de compra | Preservar boolean; verificar uso efetivo em pedidos V1; sem comportamento falso. |
| Bloquear ventas | Exigir motivo, usuário/data e coerência com auditoria do backend; validar se bloquear realmente restringe operações quando habilitadas. |
| Motivo del bloqueo | Só se bloquear, obrigatório e registro de auditoria se aplicável. |
| Observaciones comerciales | Limites e privacidade; edição persiste e não sobrescreve vazios involuntariamente. |
| Canal de venta | Catálogo empresa; `Sin asignar` quando não obrigatório. |
| Código externo | Texto, zeros à esquerda, unicidade por empresa conforme constraint, origem ERP. |
| GLN | Validar se GLN exige 13 dígitos/check digit GS1, **não confundir com GTIN**; se permitir temporariamente vazio, não inventar GLN; checar semântica em integrações futuras. |

## 5. Contatos

| Campo/ação | Auditoria |
|---|---|
| Agregar contacto | Ação real, adiciona card/linha editável; sem página em branco grande; permitir remover/editar antes/depois salvar e múltiplos registros. |
| Nombre | Obrigatório para cada contato criado; erro por item, não obrigar lista de contatos se cliente puder nascer sem contatos. |
| Apellido, Cargo, Departamento | Opcionais; diferenciar departamento laboral de departamento geográfico da direção. |
| Teléfono, Celular, Email | Validação internacional e email coerente; dados ausentes permitidos conforme modelo. |
| Principal | Máximo um por cliente, proteção front + índice único da DB; ao marcar novo principal, desmarcar anterior sem perda de outros campos. |
| Recibe pedidos, facturación, cobranzas, documentos electrónicos, notificaciones | Flags independentes, nomes claros; validar persistência e relevância de integração, sem alegar envio efetivo V1. |
| Remoção/edição | Evitar excluir histórico de comunicação sem confirmação; confirmar que alteração de aba preserva rascunho. |

## 6. Direcciones

| Campo/ação | Auditoria |
|---|---|
| Agregar dirección | Ação real, editar/remover, múltiplos endereços; um fiscal e um de entrega default no máximo (índices únicos DB). |
| Tipo | Fiscal, Comercial, Entrega, Sucursal, Otra; quando tipo Fiscal, marcar coerentemente o flag esFiscal. |
| Etiqueta | Opcional; facilitar `Casa central`, `Depósito`, etc. sem inventar registros. |
| Dirección | Obrigatória se endereço foi criado; não obrigar endereço completo para salvar cliente sem endereço se regra funcional permitir. |
| Nro. de casa | Obrigação condicional atual para fiscal; confirmar base legal e casos `s/n` (sem número). Não impor valor inventado. |
| País | catálogo SIFEN; não assumir PRY para B2F; endereço pode estar em país distinto do país do receptor se operacionalmente permitido, sujeito a regra. |
| Departamento/Distrito/Ciudad | NEX-021 **já aplicada em VM**, hierarquia opcional e em cascata PRY: distrito requer departamento, ciudad distrito; estrangeiro sem geo PY. Verificar frontend + backend + DB real, e troca de país limpa filhos inválidos. |
| Complemento / Código postal | Opcionais; estrutura de texto e zero inicial, não converter CEP para número. |
| Contacto/telefone/horário recepción | Opcionais, horário legível, sem exigir contato duplicado na aba Contactos. |
| Fiscal / Entrega predeterminada | Exclusividade por cliente e efeitos claros; não pode apagar flags em troca de aba. |
| Latitud/Longitud | Se expostas em modal, validar limites numéricos, permitir vazio. |
| Observación | Texto livre não obrigatório. |
| Barrio | **Fora da V1 por decisão expressa**, não adicionar campo nem migração. |

## 7. Entrega y ventas

| Campo | Auditoria |
|---|---|
| Ruta de entrega | catálogo por empresa, opcional; não inventar rotas. |
| Zona comercial | catálogo por empresa, opcional. |
| Vendedor responsable | catálogo usuário/empresa e permissões, opcional. |
| Frecuencia de entrega | DIARIA, SEMANAL, QUINCENAL, MENSUAL, A_DEMANDA; opção vazia `A definir`, coerência BD. |
| Dias habituales | sete checkboxes, valores corretos e consistência com frequência. Verificar escolha A_DEMANDA sem obrigação de dias; não sobrescrever dias sem aviso. |
| Observaciones logísticas | Opcional; manter layout conciso e guardar valor. |

## 8. Documentos

| Campo/ação | Auditoria |
|---|---|
| Agregar documento | Deve abrir editor real: tipo, nome, URL, datas e observação. Não criar placeholder funcional. |
| Tipo | RUC/Contrato/Crédito/Exoneración/Otro; enum BD corresponde a UI; proteger campos por permissão. |
| Nombre archivo | obrigatório por item; não representa por si só um upload binário. |
| URL segura | obrigatório no modelo atual; validar URL HTTPS e controle de acesso/autorização; **não prometer upload de arquivo** quando só existe vínculo externo. |
| Fechas emisión/vencimiento | data válida, vencimento não anterior à emissão; formato de armazenamento e UX claros. |
| Observación | opcional. |
| Remover/editar | confirmação e histórico apropriado; não expor documento entre empresas. |

## 9. Fluxos essenciais para V1 (homologação real, não apenas telas)

1. Criar contribuinte PRY B2B: RUC+DV, jurídica/física, código automático, salvar e reabrir edição; verificar isolamento da empresa CASA MINGO.
2. Criar não contribuinte PY B2C com CI, conferir que campos RUC/DV não são obrigados.
3. Criar receptor B2F exterior com passaporte/documento permitido, país estrangeiro, dados de identidade válidos.
4. Alternar Natureza e Tipo operação mantendo consistência e sem deixar campo invisível inválido.
5. Cadastrar contato principal e outro secundário, alternar principal, persistir; testar duplicidade.
6. Cadastrar endereço PRY sem geografia, com departamento apenas, completo e endereço estrangeiro; confirmar NEX-021.
7. Cadastrar dados comerciais, limites 0/decimal, moeda/lista, bloqueio com motivo e datas; garantir persistência.
8. Cadastrar entrega por dias e documento por URL; editar/remover relações sem apagar outros itens.
9. Simular erro de servidor/validação: o formulário não perde valores; aba com erro identificável e foco correto; evitar POST duplo.
10. Verificar usuário sem permissão e outra empresa: não pode ler/editar o cliente por URL.
11. Conferir compatibilidade com criação/edição no backend real, NEX-005 + migrations até NEX-021, e código automático após guardar.
12. Verificar loading dos catálogos, campos desabilitados, responsividade notebook/mobile, teclado, zoom 100%, rolagem e ação Cancelar.

## 10. Análise arquitetural e decisão de escopo

**Requisitos fiscais SIFEN v1.50:** receptor natureza iNatRec, operação iTiOpe, país cPaisRec, descrição derivada dDesPaisRe, tipo pessoa/contribuinte quando aplicável, RUC e DV ou identificação de não contribuinte e suas condicionais. Esta modelagem V1 **prepara dados**; transmissão de DTE, validação SIFEN online e emissão de FE são V2.

**Funcionalidades de ERP avançado (BENCHMARK, não requisitos atualmente comprovados):** 360º do cliente, múltiplas entidades relacionadas, limites por moeda, crédito por filial, scoring, segmentação, audit trail, aprovação de crédito, importação Excel, integração GS1/GLN, contrato/anexos, consentimento LGPD, deduplicação e histórico de alterações. Não criar novos módulos por simples analogia a SAP/Oracle/Microsoft Dynamics; priorizar cadastros íntegros e workflows existentes.

**Possíveis divergências:** SQL NEX-005 original exige endereços PY completos, mas NEX-021 já altera essa regra no banco real — auditar migrations finais e não confiar somente no SQL inicial. Comparar o formato em UI, a rota POST/PUT, SQL runtime e constraints reais antes de mudar validação. A função DV DNIT, validação de GLN, significado do limite zero, efeito do bloqueio e vínculo moeda/lista exigem teste e, se houver conflito, decisão do responsável.

## 11. Plano proposto de implementação

**Etapa A (só UI, após autorização):** criar padrão de formulário compactado em Clientes, preservar seis abas/campos atuais e regras, remover avisos desnecessários, corrigir estados visuais. Não alterar banco e nem prometer funcionalidades futuras.
**Etapa B (funcional, somente após auditoria da API e autorização):** correções comprovadas do cadastro/edição/validações, DV conforme norma verificada, erros/foco/persistência e associações; não aplicar migração sem consentimento.
**Etapa C:** homologação humana na VM com os 12 cenários e prints reais ANTES/DEPOIS.
**Etapa D:** replicar padrão visual comprovado para Proveedores, Productos, Catálogos, Listas de precios, Stock/Movimientos e Administração quando tiver formulários, com auditoria campo-a-campo própria.

**Estado final:** análise técnica preliminar baseada em prints, TSX e migração-base, suficiente para requisitos de UI, mas **não declarar validação 100% das APIs/rules DB** sem inspeção e testes completos. Toda divergência observada é pendência explícita. Não implementar nada neste commit.
