# Nexit V1 — Pendências de validação do piloto CASA MINGO

**Origem:** feedback do testador encaminhado pelo responsável em 10/10/2026, com capturas de WhatsApp e planilha `INVENTARIO ENERO 2026-Mingo Familia y Sub Familia.xlsx`.
**Natureza:** backlog de correções, verificações e solicitações, **não** comprovação de defeito em todos os itens.
**Regra de aceite:** toda funcionalidade efetivamente incluída na V1 deve funcionar ponta a ponta. CASA MINGO é **cliente piloto**, não aceite de funcionalidade parcial. Uma implementação ou teste isolado não equivale à homologação na VM.
**Status geral:** **pendente de homologação**. Nenhuma tarefa de implementação é autorizada por este documento. Executar uma tarefa de cada vez, com testes e revisão antes do deploy.

| ID | Prioridade | Item / origem | Estado e ação de verificação | Critério de aceite |
|---|---|---|---|---|
| PIL-01 | Alta | Textos muito pequenos em Proveedores e outros módulos | Correção de CSS publicada no commit `cf576f7` (575 ajustes); ainda sem homologação visual do deploy | Todas as telas V1 legíveis no navegador a 100%, sem cortes, sobreposições, controles truncados ou problemas em notebook e mobile |
| PIL-02 | Alta | DV / dígito verificador do RUC calculado automaticamente (pedido do piloto) | Solicitação ainda não homologada; verificar regras DNIT e comportamento atual | RUC válido tem DV calculado/validado consistentemente em Clientes e Proveedores, com tratamento de casos inválidos, sem sobrescrever indevidamente dados |
| PIL-03 | Alta | País FRANCIA não aparece no seletor de Proveedores | O SQL SIFEN contém `FRA — Francia`; carga de países foi executada pelo responsável, mas disponibilidade/atividade e filtro na tela precisam ser conferidos | Francia pesquisável/selecionável e código `FRA` persistido, com demais países válidos disponíveis |
| PIL-04 | Alta | Importação por Excel de Clientes e Productos (pedido do piloto) | Escopo detalhado, formato, volume e validações devem ser definidos com base nas planilhas reais; não considerar entregue | Pré-visualização/mapeamento, validação de obrigatórios, erros por linha, duplicados e isolamento por empresa; importação correta com resultado verificável, sem perda ou corrupção de dados |
| PIL-05 | Alta | Código do produto mantém zeros à esquerda na planilha de inventário | Regra expressa do piloto; Excel pode armazenar valor numérico com formato de exibição que acrescenta zeros | Importar e exportar códigos como **texto preservando exatamente a representação exibida** (exemplo do cliente: `0026102469514`), sem conversão numérica que retire zeros |
| PIL-06 | Alta | Stock mínimo apaga o valor zero na criação/edição de Producto | Defeito reportado; revisar formulário, serialização e persistência | Zero continua visível antes/depois de salvar e reabrir, separado de valor ausente; validar casos positivos e nulos permitidos |
| PIL-07 | Média-alta | Separador de milhares em Precio de Venta e Costo Unitario | Pedido do piloto; revisar formatação e parsing de valores | Exibição/digitação conforme convenção es-PY, incluindo decimais e separadores; armazenar valor numérico exato e reabrir sem corrupção |
| PIL-08 | Alta | Planilha usa campo `Procedencia`; testador solicitou associar a `Categoria` | **Necessita validação semântica antes da importação**: não presumir que país de origem e categoria comercial sejam o mesmo conceito | Mapeamento explícito aprovado, informação original preservada, famílias/linhas/marcas/categorias não misturadas indevidamente |
| PIL-09 | Alta | Localização de Paraguay opcional em Clientes e Proveedores | NEX-021 **aplicada e registrada no banco real, confirmada pelo responsável**; documentação histórica ainda diz não aplicada. UI sem teste ponta a ponta | Criar, editar e reabrir endereço vazio/parcial/completo, cascata Departamento → Distrito → Ciudad correta; país estrangeiro sem campos PY; sem Barrio |
| PIL-10 | Planejamento V2 | Solicitação para demonstrar Facturación na segunda-feira | Facturación/SIFEN **não faz parte da V1 operacional atualmente aprovada**; pedido do testador não é autorização automática para alterar escopo | Decisão expressa do responsável sobre demonstração e cronograma, sem prometer funcionalidade ainda inexistente ou mostrar mock como real |
| PIL-11 | Alta | Homologação integrada da V1 | Cadastros de Producto, Proveedor, categoria/procedência e lista de preços foram relatados como criados com êxito pelo testador, mas isso não homologa fluxos completos | Construção/deploy da versão candidata, testes reais de cadastro/edição, permissões, inventário, dashboard, relatórios, erros e consistência no PostgreSQL; nenhuma funcionalidade V1 parcial considerada concluída |
| PIL-12 | Média | Rastreabilidade da planilha de referência | Planilha enviada nesta conversa; **não há confirmação de versão publicada no GitHub** | Arquivo-fonte e origem acessíveis às duas IAs por meio autorizado e seguro, sem presumir que a planilha já está versionada; não publicar dados empresariais sem decisão do responsável |

## Evidências e decisões

- Testador: já conseguiu criar Producto, Proveedor, associar Procedencia/Categoria e criar lista de preços; relatou tipografia pequena, França ausente, stock mínimo zero que desaparece, necessidade de DV, separador monetário e importação Excel.
- No arquivo `CARGA-PAISES-SIFEN.sql`, `FRA` está presente como `Francia`. Isso **não** comprova a consulta do combo ou o estado `activo` no banco real.
- O responsável confirmou a aplicação de NEX-021 no banco real com entrada `NEX-021 | NEX-021-ubicacion-opcional` em `schema_migrations`. Não repetir a migration.
- Barrio está explicitamente fora do escopo V1.
- A correção de tipografia `cf576f7` passou por revisão estática; falta confirmar sua versão implantada e conferir visualmente.
- A documentação histórica `PROGRESSO-NEXIT-V1.md` contém estados anteriores; esta confirmação operacional prevalece para NEX-021, sem reescrever o histórico.
- **O Excel original não foi incorporado por esta mudança documental.** Na importação, preservar zeros à esquerda, respeitar colunas originais e conferir o significado de Procedencia.
- Não incorporar Facturación à V1 nem registrar data prometida sem decisão explícita.

## Processo de execução

Selecionar um item autorizado por vez; Claude Code sincroniza e lê os protocolos, implementa e testa em ambiente isolado, publica SHA e para. ChatGPT revisa no GitHub. O responsável controla aplicação na VM, migrations e homologação. Relatórios de chat curtos; detalhes de implementação ficam no código e no histórico Git.
