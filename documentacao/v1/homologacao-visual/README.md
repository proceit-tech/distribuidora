# Nexit V1 — Homologação visual e padrão de telas

**Objetivo:** reunir evidências visuais da V1 antes do aceite, com um padrão consistente de legibilidade, navegação e comportamento responsivo. O cliente CASA MINGO é piloto; defeitos de interface não constituem aceite de funcionalidade parcial.

## Pastas e convenção

- `capturas/`: imagens de evidência, **apenas depois de revisão para retirar dados pessoais, fiscais, credenciais e informações comerciais sigilosas**. Conferir previamente a visibilidade do repositório; se público, não armazenar imagens privadas sem autorização explícita.
- Nome de cada captura: `V1-[MODULO]-[TELA]-[DESKTOP|NOTEBOOK|MOBILE]-[AAAA-MM-DD]-[NN].png` (ex.: `V1-PROVEEDORES-NUEVO-NOTEBOOK-2026-10-10-01.png`).
- Para cada conjunto: registrar versão/commit e ambiente, largura/altura da janela, zoom, módulo/rota, observação e decisão (APROVADO, AJUSTAR, NÃO TESTADO) no registro de homologação.

## Padrão visual de referência

- Escala global: auxiliar 13px; rótulo 14px; texto/campos/tabelas/botões 15px; título principal 28px. Respeitar hierarquia, contraste e espaçamento.
- Nenhum texto funcional ilegível, corte, sobreposição ou truncamento indevido.
- Formulários: rótulos completos, campos e selects visíveis, mensagens de erro legíveis, botões acessíveis, abas navegáveis.
- Listagens: cabeçalhos, filtros, paginação e estados vazios legíveis; dados não ocultados indevidamente.
- Verificar com zoom 100% em notebook/desktop e em largura móvel; registrar eventuais exceções justificadas.

## Roteiro por módulo

1. Login e navegação lateral.
2. Dashboard.
3. Clientes: listagem, novo e edição, todas as abas.
4. Proveedores: listagem, novo e edição, todas as abas.
5. Productos: listagem, novo, edição e catálogos.
6. Listas de precios: listagem, novo e edição.
7. Movimientos: listagem, criação e detalhe.
8. Stock: listagem e detalhe.
9. Reportes: índice e os cinco relatórios.
10. Administração de empresas (somente usuário global autorizado).

## Processo

1. O responsável atualiza exclusivamente a aplicação na VM após aprovação do commit; nunca alterar PostgreSQL como parte do teste visual.
2. Reunir prints por tela, com zoom/resolução conhecidos e sem dados sigilosos. Capturas e registro serão adicionados após recebimento e autorização.
3. ChatGPT avalia as imagens, identifica ajustes objetivos por rota e prioridade, e mantém o GitHub como referência; Claude Code implementa uma tarefa autorizada por vez.
4. Um item visual só é APROVADO após inspeção da tela publicada e conferência de ausência de regressão. Não declarar homologação geral apenas porque CSS, TypeScript ou build passaram.

**Implementação de referência:** commit `cf576f7` (tipografia global da V1). **Status:** aguarda capturas e homologação visual após implantação na VM.
