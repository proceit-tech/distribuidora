# HISTÓRICO REVOGADO — Análise anterior do KuDE por RUC/CDC
**27/10/2026.** Esta análise foi REVOGADA na sequência pelo responsável. **NÃO UTILIZAR COMO ESPECIFICAÇÃO DE DESENVOLVIMENTO.**

O responsável esclareceu que KuDE é obtido por tipo/estabelecimento/ponto/número/série do documento selecionado, mesmo com estado RECHAZADO ou CDC ausente. **Não confrontar CDC do gateway com RUC/DV, CDC local ou documentos aprovados como condição para visualizar.**

A localização do código que gerou o erro permanece comprovada: `lib/facturacion/shared.ts::obtenerKude()` contém comparação de CDC do PDF contra até dez CDCs históricos de outras FEs aprovadas; `lib/facturacion/gateway.ts::interpretarKude()` também veta PDF válido por CDC ausente/divergente. Ambos os vetos serão removidos SOMENTE no caminho KuDE, preservando controles de sessão/empresa/sucursal, identidade fiscal selecionada para o request, autenticação da empresa e validação do PDF.

**Requisito vigente:** `documentacao/definicoes/REQ-NEXIT-PRO-326-KUDE-POR-DOCUMENTO-SEM-CDC-2026-10-27.md`.

**Única ordem de desenvolvimento vigente:** `documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-326-KUDE-POR-NUMERO-SEM-CDC-2026-10-27.md`.
