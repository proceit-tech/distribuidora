# Decisão — simplificar ações do cabeçalho Stock

**Aprovado pelo responsável em 2026-10-12.** Complementa `AUDITORIA-STOCK-BOTOES-REPOSICAO-V1-2026-10-12.md`. Apenas documentação; não houve alteração de código, dados ou VM.

- **Remover o botão "Exportar Excel"** do cabeçalho de `/stock`. O responsável confirmou que sua exportação de valorização já é atendida no módulo Reportes; não duplicar mecanismo ou relatório.
- **Remover o botão "Valorizado por marca"** do cabeçalho de `/stock`. A valorização por marca pertence à área de Reportes; verificar a rota/tela concreta e o escopo de dados antes de orientar qualquer redirecionamento. Se não houver exatamente esse relatório, registrar a lacuna, não inventar que já existe.
- **Manter o link "Movimientos"** e revisar destino/funcionamento na auditoria desse módulo.
- **Manter o botão "Reposición"**, corrigindo a ausência da página `/reposicion`, conforme auditoria Stock. Não gerar compras nem mutações automaticamente sem autorização.
- **Não remover** cards de custo, valor de venda de referência, filtros, detalhe de produto ou APIs só por retirar ações redundantes.
- Na implementação futura, remover imports/handlers de XLSX exclusivos das duas ações do cabeçalho se não houver outros consumidores, sem quebrar relatórios independentes.
- Seguir padrões visuais e de permissões do Nexit; Claude implementa após tarefa explícita, ChatGPT audita e o responsável homologa.
