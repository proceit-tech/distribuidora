# Nexit V1 — revisão das dez capturas após f028e38

**Data:** 2026-10-11. **Estado:** avaliação estática visual, sem homologação funcional. Prints recebidos em conversa e ainda NÃO versionados fisicamente no GitHub. Não marcar APROVADO pelo responsável sem aceite expresso. Preservar referência ANTES/DEPOIS.

**Capturas:** Clientes, Proveedores, Productos, Catálogos/Categorías, Catálogos/Marcas, Catálogos/Familias, Catálogos/Líneas, Listas de precios, Stock, Movimientos. A captura de Stock mostra o botão ?, mas não o painel aberto.

## Conclusões

- Sidebar Nexit, cabeçalhos, KPIs, botões primários, tabelas e ações convergiram para estilo uniforme. Não propor nova alteração global de fontes ou redesenho geral.
- Clientes: estado vazio visualmente coerente; dados, ordenação e paginação com registros não comprovados.
- Proveedores: uma linha real; hierarquia, badges e botão proporcionais. Busca/ordenação não comprovadas pela captura.
- Productos: pesos e hierarquia melhorados; `FRANCIA` na procedência e `Sin categoría` continuam como pendência de associação de dados — não alterar por suposição. Código `026102469668` exige confronto com planilha original.
- Catálogos/Categorías, Marcas: nomes e ações agora proporcionais; Código opcional mostra `Sin código`, conforme modelo. Não obrigar preenchimento.
- Catálogos/Familias e Líneas: capturas mostram contadores `51 de 51` e `203 de 203` na toolbar, além da primeira parte da tabela. **Estes contadores são resultados filtrados e não comprovam ausência de paginação**. Inspeção estática da rota confirmou `PAGE_SIZE = 20`, slice antes de renderizar e controles de paginação no rodapé, que está fora da área fotografada. Verificar efetivamente a transição de página e resultado total no navegador. Não classificar como bug sem esse teste.
- Listas de precios: nome, código, quantidade, moeda e descrição hierarquizados; conferir acesso ao texto completo em interface touch/teclado, pois `title` sozinho não cobre todos os dispositivos.
- Stock: layout de 6 KPIs, busca + filtros está mais equilibrado. O botão `?` deve ser aberto no navegador para verificar o painel, sobreposição e acesso por teclado. Sobrestock é conforme regra documentada, mas o máximo cadastrado ainda deve ser validado.
- Movimientos: dados, datas e ações organizados; teste de filtro/ordenação e navegação pendente.

## Critérios restantes

1. Confirmar filtros, ordenação, paginação com dezenas/centenas de registros, sobretudo Familias e Líneas, com registros reais.
2. Capturar Stock com ajuda `?` aberta, verificar corte/posição, foco e fechamento.
3. Validar tabela Clientes com registros reais, sem criar ou editar dados só para melhorar captura.
4. Resolver com fonte Excel a procedência/categoria e zeros à esquerda; não atualizar dados automaticamente.
5. Verificar exportação Excel, ações permitidas e navegação em ambiente VM por testes manuais.
6. Incorporar imagens reais ANTES e DEPOIS ao GitHub somente com autorização, verificação de privacidade e prova de upload; atualmente são referências em conversa.

**Decisão técnica:** nenhuma alteração de código recomendada até surgirem defeitos verificáveis nos testes funcionais ou novo requisito do responsável. Claude só implementa quando expressamente autorizado, sem testes/processos no notebook.
