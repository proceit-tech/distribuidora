# REQ-DOC-UX-DESKTOP — Documentos electrónicos: painel operacional superior à referência de concorrência

**Data:** 20/10/2026. **Origem:** decisão do responsável após fornecer duas capturas do painel de documentos da concorrência. **Sistema alvo:** NEXIT / DistribuNex V1, **exclusivamente desktop**. **Branch:** `feature/NEXIT-2026-001-banco-demo`. **Status:** escopo visual/funcional proposto para implementação em etapa independente, após aceite estático do KuDE PRO-194. **Não declara superioridade comprovada nem homologação visual.**

## 1. Referência e diagnóstico

As imagens da concorrência exibem: filtro expansível com checkboxes e intervalos de emissão/assinatura, tipos FE/NCE/NDE/NRE/AFE, KPI de pendente/aprovado/rejeitado/email, tabela com seleção por linha, ações em ícones PDF/arquivo/e-mail, ordenação, agrupamento arrastável, exportação, ações massivas, eventos por linha e busca. Isso é **referência de objetivos**, não contrato de APIs do NEXIT; não copiar literalmente código, ícones, layout ou identidade visual do concorrente.

O NEXIT possui atualmente `/documentos` com 8 indicadores, busca por número/CDC/RUC/receptor, filtro tipo/sucursal/estado SIFEN/intervalo emissão, ordenação e paginação 20, estados separados (gateway/SIFEN/e-mail), consulta manual e reenvio controlado, detalhe/cronologia. O KuDE/PDF FE está em implementação P0 `PRO-194`; XML e outros downloads, e-mail, lote, exportação analítica, eventos/ações massivas **não estão confirmados como funcionais** e não devem receber controles falsos.

**Principais fraquezas de UX atual:**
- Indicadores confundem âmbito **global** com filtro ativo e aglutinam pendência de envio/erro/indeterminado, no-email e sem e-mail (DOC-D02/D03/D07).
- Resultados de consulta anterior continuam visíveis durante troca de filtros (DOC-D01 ALTA), inclusive botões; reentrada pode agir sobre documento do recorte anterior.
- Layout oferece detalhe longo expandido dentro da grade e botões com rótulos dispersos; falta hierarquia de ação principal KuDE/consultar/mais.
- Conversão `Number(total)` para valores fiscais (DOC-D04, potencial perda de precisão).
- Interface concorrente é densa, porém com filtros/ícones demais; NEXIT deve ser mais claro, não reproduzir uma sobrecarga.

## 2. Norte visual — desktop enterprise

Desenhar uma interface limpa, profissional, em **espanhol do Paraguai**, usando **design system/tokens existentes do NEXIT**; sem importar biblioteca de UI nova sem necessidade. Não redesenhar navegação global, autenticação ou telas de FE/NCE. Base 1366–1920px; tabela legível sem cards móveis. Evitar títulos gigantes e espaço desperdiçado; manter barra de ação visível.

1. **Cabeçalho compacto:** `Documentos electrónicos`, legenda curta `Control de emisión, SIFEN y entrega`, ação contextual `Actualizar`; indicação `Última actualización` baseada na consulta efetiva (não inventar conectividade). Sem gráficos decorativos.
2. **Resumo de estados com semântica honesta:** KPIs por **SIFEN aprovado/rejeitado/pending**, **Gateway pendente / indeterminado / erro**, e **Email enviado/erro/sem destinatário/não informado**, com scopes `Todos los documentos autorizados` vs `Resultados filtrados`. Uma cor por semântica; não usar mesma cor para categorias distintas; não criar contadores sem query real. Quando filtro altera, atualizar cartão somente com dados da consulta vigente, bloquear cards com contadores de recorte antigo e evitar atualização parcial (DOC-D01). Revisar DOC-D02/03/07 de forma localizada mediante documentação do SQL correspondente; se exigir reescrita de consultas de múltiplas transações, pedir revisão específica.
3. **Barra de filtro rápido:** busca textual (CDC/número/RUC/cliente), `Tipo`, `Estado SIFEN`, `Sucursal`, `Periodo`, `Limpiar`. Filtros avançados recolhidos: datas específicas, estado gateway, tipo de e-mail, ordenação; não mostrar filtro de lote/assinatura sem suporte da API. Exibir chips removíveis dos filtros ativos. Alteração invalida dados/ações imediatamente; debounce somente do HTTP (DOC-D01).
4. **Tabela desktop densa e clara:** columns `Tipo + N.º fiscal`, `Fecha emisión`, `Receptor/RUC`, `Monto exacto + moneda`, `Estado SIFEN`, `Envío gateway`, `Email`, `Acciones`. Ordenação e paginação já existentes preservadas; largura mínima, cabeçalho sticky se suportado, linhas legíveis e células com texto truncado+tooltip. Preferir formatação textual exata do NUMERIC fiscal (DOC-D04), PYG sem centavos, moeda estrangeira conforme valor persistido, sem `Number` para o total. Evitar uma coluna de “ícones misteriosos” sem rótulo. Não usar `open now` de backend ou status booleano fake.
5. **Ações por documento:** ação primária `Ver KuDE` para FE APROBADA com CDC e PDF funcional; ações `Consultar SIFEN`, `Ver historial`, `Reenviar` *somente em estados e permissões já permitidos*, dentro de menu contextual acessível quando houver excesso. `Reenviar` exige confirmação e conserva políticas de indeterminado; não permitir para NCE rejeitada. Ícones sempre tooltip + nome legível, foco teclado.
6. **Detalhe lateral** (drawer) por documento: identidade fiscal completa, CDC copiável, estados independentes + respectivas datas e mensagens, relacionamento NCE ↔ FE original, timeline dos últimos intentos do servidor (indicar limite de histórico 100), ações autorizadas e entrada modal KuDE. Se drawer não couber, expandir linha controladamente; nunca criar página independente fictícia.
7. **Modal KuDE PRO-194:** fullscreen parcial 85–90% largura/altura útil desktop, PDF incorporado, cabeçalho tipo+número, botões `Descargar`, `Imprimir`, `Cerrar`, loading/erro/retry, nova API cada abertura, sem persistência ou cache. O visualizador pertence à PRO-194 e **não deve ser reimplementado** na UX P1.
8. **Feedback operacional:** estados de loading vazios consistentes, skeleton/sinalização não intrusiva, erros corrigíveis, diferenciação `Gateway recibió` e `SIFEN aprobó`; não confundir documento fiscal aprovado com email enviado. Todas as ações críticas conservam confirmação e evidência existente.

## 3. Critérios de segurança, dados e não-regressão

- Multiempresa, alcance de sucursal e `FACTURACION_ELECTRONICA.VER/CREAR/EDITAR` validado no backend; a interface pode esconder ações, mas servidor deve revalidar.
- Preservar CDC/estado fiscal imutável, idempotência, consulta sem reenvio, NCE rejeitada em nova nota, no reenvio cego de ENVIO_INDETERMINADO.
- No `/documentos`, filtros q/tipo/sucursal/SIFEN/desde/hasta/orden/pagina têm contrato vigente: não introduzir filtros visuais que não cheguem ao backend ou que causem resultados inconsistentes.
- Não criar testes de autoaprovação fiscal, falsos KPIs, ícones PDF/XML/CSV/Email/Evento sem implementação REAL; na UI, esconder ou marcar inequivocamente `No disponible`. Export XLSX/CSV, seleção e ações massivas, eventos SIFEN, anexos XML, operações de e-mail, blacklist e agrupamento arrastável dependem de **especificações e APIs próprias** e NÃO são parte do redesenho P1 sem decisão explícita.
- NCE e FE continuam associadas corretamente; KuDE P0 somente FE até contrato de NCE real.
- Nenhuma mudança de migrations, esquema ou VM por Claude, nenhuma alteração em Facturas e Notas de crédito fora do `/documentos`.

## 4. Fases de entrega e aceites

**Fase P0 — PRO-194 (bloqueante):** corrigir retorno JSON Base64 do gateway, abrir KuDE em modal sem guardar PDF, nova API por abertura, testes e audit independente. Antes de iniciar P1, obter aceite técnico estático P0 e não mexer na implantação real.

**Fase P1 — este requisito:** implementar somente UI/documentos e testes adequados sem backend novo não autorizado. Preparar rascunho visual do layout no código e telas reais, sem gerar apenas imagem ilustrativa. O código precisa preservar queries/ACL/estados. Testes dirigidos: busca A→B em debounce, troca de filtro/página/ordem, ações não clicáveis em dados obsoletos, KPI âmbito correto, precisão monetária 16 dígitos, permissões (reexibir/ocultar), estados FE/NCE pendente/aprovado/rejeitado, modal KuDE FE integrado, teclado/tab/Escape, sem cliques na linha errada, sem alterações fiscais. Sem browser real, reconhecer lacuna.

**Fase P2 — backlog de paridade (NÃO autorizado):** export CSV/XLSX server-side por filtros e ACL, ações em lote, eventos fiscais, PDFs NCE/ XML, entrega email, filtros de lote/assinatura e agrupamento. Cada funcionalidade exige contrato, especificação e testes próprios.

**Governança:** Claude somente desenvolve e roda testes focais sob autorização; ChatGPT audita e organiza o Linear; responsável executa VM/SQL/build/deploy e homologação visual. Não marcar Done/homologado após testes simulados. Parada em **AUD-DOC-UX-R01** após commit funcional P1.
