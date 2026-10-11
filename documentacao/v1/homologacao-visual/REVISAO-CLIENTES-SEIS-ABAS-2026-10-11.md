# Revisão das seis abas — Novo cliente — 2026-10-11

Status: **AUDITORIA VISUAL/ESTÁTICA — PENDENTE DE IMPLEMENTAÇÃO E ACEITE HUMANO**. Origem: seis capturas fornecidas pelo responsável, ambiente do usuário (sem prints versionados no Git nesta entrega). Revisadas com a regra oficial `documentacao/regras/REGRA-CADASTRO-CLIENTES-NEXIT-V1.md` e `app/(private)/clientes/nuevo/page.tsx`. Não foram executados testes, SQL nem deploy. Esta revisão **não autoriza implementação**.

## Achados comprovados / requisitos já aprovados

- **CLI-VIS-01 (ALTA): Documentos.** A aba exibe `URL segura *` e instrução para cadastrar link; o código atual tem `label="URL segura *"`, `urlArchivo` e mensagem de URL obrigatória. **Conflito com decisão posterior aprovada**: upload efetivo e armazenamento privado em volume persistente na VM, fora de `public/`, isolado por empresa e autenticado. **Não** substituir apenas o label: requer fluxo de upload/download, metadados, autorização, validações, proteção a caminhos e especificação de formatos/limites/exclusão. Compatibilizar API e banco via nova migration se necessária, somente no Git; nenhuma ação na VM por IA.
- **CLI-VIS-02 (MÉDIA/UX): Informação fiscal.** A seção `Contacto principal` agrupa e-mail/telefone do cliente e pode sugerir que é o contato marcado como principal na aba Contactos. Recomenda-se `Datos de contacto del cliente`, sem mudar a semântica dos campos.
- **CLI-VIS-03 (MÉDIA/UX): telefone e celular.** Campo de busca por país + seletor de país/DDI + número geram excesso de espaço e texto instrutivo de duas linhas. Consolidar/compactar apresentação **sem eliminar** busca mundial, país/ISO, DDI, área quando aplicável, zeros ou suporte a números repetidos. País fiscal independente do país do telefone. Revisar mobile.
- **CLI-VIS-04 (MÉDIA/UX): comercial.** A legenda `Vencimiento del crédito` está próxima de `Límite temporal` e gera ambiguidade sobre qual prazo é representado. Confrontar `fecha_vencimiento_credito` e regras atuais antes de alterar label; usar distinção explícita se for vencimento do limite temporário. Mostrar moeda selecionada junto aos limites (sem assumir PYG).
- **CLI-VIS-05 (ALTA/REGRA): comercial.** Decisão aprovada de mudança de moeda exige taxa informada, conversão e confirmação expressa, com arredondamento controlado, nas **edições** quando houver mudança de moeda; não presumir implementação porque não está visível na tela de criação. Primeiro especificar e auditar edição + API.
- **CLI-VIS-06 (ALTA/REGRA): fiscal e direções.** Aplicar nova obrigatoriedade fiscal condicional por natureza/operação; verificar a matriz para exigência de endereço fiscal no salvamento. A captura mostra checkbox desmarcado, o que isoladamente não prova defeito no backend. Não impor endereço a operações em que seja facultativo pela regra.
- **CLI-VIS-07 (MÉDIA/REGRA): entrega.** Validação de dias conforme frequência diária, semanal e quinzenal já aprovada; faltam regras para mensal e sob demanda. Captura mostra seleção livre, não prova ausência de validação na API.
- **CLI-VIS-08 (BAIXA/UX): repetição.** `Los campos con * son obligatorios` aparece em todas as abas, inclusive seções com apenas campos opcionais; revisar relevância sem esconder obrigatoriedade específica.
- **CLI-VIS-09 (BAIXA/UX): cabeçalho.** Código, razão social, situação, bloqueio e aptidão fiscal foram aprovados para a ficha de cliente; verificar na tela de **edição/detalhe**, pois screenshots são de criação e não podem comprovar omissão lá.

## Preservar
- Seis abas, padrões visuais recentes, interface espanhol PY, responsividade, formulário sem reescrita integral.
- Código automático, telefone mundial, contato opcional e no máximo um principal, endereço único fiscal+entrega padrão, limites e descontos decimais como texto.
- Operações de pedidos, vendas, cobrança e XML fiscal fora do menu Clientes V1 (integração preparada).

## Pendente de verificação, não alegar falha só pela captura
- Verificação integral UI→JSON→API→SQL, persistência, multitenancy, salvamento, estados de erro, aptidão SIFEN, GET/POST/PUT, edição e regras de não perder dados ao navegar.
- Decisões de GLN (D-08), filtros listagem (questão 14), formatos e tamanho dos arquivos, exclusão/retenção, detalhes de auditoria e arredondamento da conversão.

## Evidências e autorização
- Capturas: seis imagens anexadas à conversa do responsável, **não gravadas no repositório nesta entrega** (pendente arquivamento de imagens originais). 
- É especificação/auditoria apenas. Claude implementa somente com autorização posterior do responsável. Nenhuma aplicação SQL, Docker ou VM autorizada.
