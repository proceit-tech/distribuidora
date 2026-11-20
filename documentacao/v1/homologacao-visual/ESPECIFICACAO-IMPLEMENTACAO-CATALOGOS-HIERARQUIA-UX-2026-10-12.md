# Especificação de implementação — Catálogos de Productos: hierarquia e padrão visual V1

**2026-10-12. Origem:** auditoria independente ChatGPT nas quatro capturas originais do usuário e nos arquivos de código do GitHub. **Decisão aprovada:** Categoría → Familia → Línea, com Marca independente, conforme `DECISAO-CAT-012-HIERARQUIA-CATALOGOS-2026-10-12.md`. **Status:** documentação para desenvolvimento condicionado; NÃO autoriza migração de dados reais, deploy ou homologação. Claude implementa, ChatGPT audita, responsável humano opera VM.

## Evidência consultada

- Quatro capturas reais da conversa: `image(20261012-103601).png`, `image(20261012-103616).png`, `image(20261012-103628).png`, `image(20261012-103641).png`. Nenhuma imagem externa; os formulários estavam abertos pela ação do usuário, não presumir abertura automática.
- `app/(private)/productos/catalogos/page.tsx`, `page.module.css`, `lib/productos/catalogos-admin.ts`, `app/api/productos/{categorias,marcas,familias,lineas}/route.ts`, `app/(private)/productos/_components/pestanas/informacion.tsx`, `lib/productos/normalizar.ts`; padrões visuais `app/(private)/proveedores/page.tsx`, `app/(private)/clientes/page.tsx`, `components/ui/lista-padrao/*`.
- Matrizes `MATRIZ-AUDITORIA-CATALOGOS-PRODUCTOS-V1-2026-10-12.md` e decisão CAT-012; protocolos `CLAUDE.md` e `documentacao/PROTOCOLO-IA.md`.
- Migraciones NEX-017/NEX-020 devem ser localizadas pelo Claude por listagem do diretório Git e inspecionadas antes de preparar SQL; **ChatGPT não validou a DDL exata dessas duas neste turno**.

## Achados realmente sustentados

1. Visual: a listagem usa `components/ui/lista-padrao`, assim como Proveedores, portanto **não é correto alegar que toda a tela esteja fora do padrão**. O formulário inline usa CSS local (`page.module.css`) e controles HTML com alturas 38 px, enquanto outros formulários possuem componentes/padrões próprios: padronização justificada **apenas** de campos, mensagens, foco, estados, espaçamentos e ações, sem substituição gratuita de todo o layout.
2. Nas telas existe grande área livre ao lado de `Código/Nombre` nas três primeiras abas; `Familias/Líneas` adicionam Descripción em linha separada. A compactação é aprimoramento visual, não falha funcional. Preservar distribuição responsiva e legibilidade.
3. Em `cambiarTab`, `setForm(null)` descarta formulário alterado sem aviso; **defeito de UX confirmado**. Também o botão `Nueva ...` substitui o formulário aberto e `Editar` muda o registro; aplicar política única para estado dirty.
4. `guardar` mostra erros apenas em alerta geral, `Nombre` e `Familia` têm `*`; falta feedback por campo/foco apropriado. Implementar comportamento existente do padrão Nexit.
5. `cambiarEstado` PUT imediato, sem confirmação; quando existem produtos associados, mostrar consequência antes do envio. Não cancelar vínculo/impedir histórico sem decisão.
6. O contador Productos faz `count(*)` por associação direta, incluindo inativos; não chamar de 'produtos ativos'. Preservar SQL e especificar rótulo/ajuda 'total asociado' ou contador diferenciado somente se aprovado.
7. **Hierarquia ainda não implementada:** página Familia não seleciona Categoria; a API/BD Familia não expõe `categoriaId` atualmente; página de Produtos filtra Línea por Família, mas não Família por Categoria; `normalizar.ts` só exige Família quando Línea preenchida, sem validar relação Categoria↔Família; hierarquia não pode ser considerada pronta.
8. Campos de código são **opcionais** e registros importados exibem 'Sin código': não inventar código retroativo nem tornar código obrigatório.
9. Quatro capturas têm Categorías=4, Marcas=3, Familias=51, Líneas=203. São **dados reais mostrados**; nunca atribuir Famílias a Categorias automaticamente pelo texto nem apagar relações.
10. Testes de segurança/carga/API e unicidade exigem verificação dos índices DDL exatos e cenários entre empresas; implementação sem base real é apenas candidata, não homologação.

## Escopo de implementação aprovado tecnicamente, separado em duas etapas de segurança

### ETAPA A — UX/visual, sem mudança de regra fiscal/DB

- Preservar navegação Maestros/Productos/Catálogos, 4 abas, tabela compartilhada, pesquisa, filtros, classificação, paginação, ações, status e nomenclatura em espanhol Paraguay.
- Alinhar formulário inline de 4 abas com convenções visuais comprovadas do Nexit: bordas, tipografia, alinhamento de labels, densidade uniforme, agrupamento, espaços e estado de foco/erro; compactar espaço excessivo sem esconder campos e sem introduzir cabeçalho duplicado.
- Validação inline Nome, Família e demais erros da API; primeiro foco e descrição acessível; evitar mensagem de sucesso falsa ou erro genérico sem contexto.
- Proteção dirty ao navegar entre abas, iniciar outro cadastro, Editar outro registro ou Cancelar. Só confirmar descarte se houve alteração efetiva; evitar popup desnecessário se não editado.
- Confirmação de Inactivar quando registro possuir produtos associados; mensagem sem prometer impacto cascata, e considerar efeitos dependentes Família→Línea. Reativar e atualizar mantendo feedback claro.
- Comportamento responsivo com 320/375/768/desktop e acessibilidade básica em aba e formulários; não reimplementar lista padrão sem necessidade. Usar tabela e componentes compartilhados existentes. Manter 20 itens/página e filtros.
- **Não** trocar códigos históricos `Sin código` nem inventar sequência automática.

### ETAPA B — Hierarquia funcional e preparação de migration **sem preencher dados históricos**

- Criar estrutura incremental para `familias_producto.categoria_id` **inicialmente nullable**, com FK composta `(empresa_id,categoria_id) → categorias_producto(empresa_id,id)`, índice e validações, conforme constraints vigentes. **Antes**, conferir estrutura e versão de migrations no repo; usar próximo NEX disponível após 043 e evitar editar scripts aplicados.
- A tela Familia deve pedir Categoría nas novas associações; Linha continua exigindo Família. No GET da lista e nos selects, incluir `categoriaId` e nome da categoria, com filtro por Categoria na aba Familia e, conforme utilidade, na aba Línea.
- API deve validar que Categoria selecionada pertence à mesma empresa e está ativa para novas associações; preservar referências inativas antigas para edição segura.
- No Produto: filtro encadeado Categoría → Familia → Línea; ao mudar Categoria limpar apenas seleções descendentes incompatíveis (com aviso/controle se há edição não salva), e ao mudar Familia limpar Línea incompatível. Validar coerência no servidor **inclusive requests diretas**. A implementação não deve obrigar os três níveis no produto: a obrigatoriedade de classificação integral do produto ainda está pendente. Se Família for selecionada, deve pertencer à Categoria; se Linha selecionada, deve pertencer à Família.
- **Problema de transição:** enquanto 51 famílias importadas não forem classificadas, não ativar constraint NOT NULL em Familia, não bloquear arbitrariamente a edição de produtos históricos, não presumir Categoria das familias com nomes de origem/nacionalidade ou outras descrições. Fornecer relatório SQL de leitura (familias sin categoría, productos incoherentes, familias/lineas dependientes) e interface de atribuição manual com permissão; decisão sobre mapeamento cabe ao usuário. Política para novos cadastros pode exigir Categoria, sem quebrar legados.
- Impedir mudança de Categoria de uma Familia usada por Produtos/Líneas se produzir incompatibilidade; fornecer mensagem clara e não reclassificar automaticamente descendentes; proteção de integridade em SQL e API com isolamento multiempresa. Confirmar qual política é possível sem bloquear dados antigos.
- **NÃO** atualizar famílias antigas em massa, executar migration, deploy ou alterar dados reais. Não incorporar outros módulos, regras SIFEN, código externo ERP nem permissões novas presumidas.

## Critérios de aceite

1. Formulário vazio abre corretamente, nomes e família são validados, editar/cancelar/trocar aba não descarta alterações inadvertidamente; ao salvar erro de servidor não desaparece.
2. Nenhum campo visível das quatro telas removido, nenhum layout/captura genérica, tabelas responsivas/ordenáveis/paginadas preservadas.
3. Nova família tem Categoria, nova Linha tem Família; Produto de classificação incoerente é rejeitado pela API e, onde viável, por constraint/trigger; legado sem categorização é preservado e listado para saneamento, sem update automático.
4. Unicidade dentro empresa e nomes/IDs não alterados; contadores preservados; objetos inativos e vínculos legados não desaparecem por filtro indiscriminado.
5. Migration incremental com rollback defensivo, sem checksum editado, runner apenas preparado, não aplicado no banco; explicitar etapa posterior de saneamento e eventual NOT NULL.
6. Claude publica commit+push e para para auditoria ChatGPT; apenas humano fará SQL/Docker/VM.

**Decisões ainda pendentes:** obrigar classificações completas no Produto; política de codificação automática; mapeamento das 51 famílias existentes; migração para NOT NULL e realocação de famílias com produtos já vinculados.
