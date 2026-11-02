# ORDEM DE DESENVOLVIMENTO — E5 / PRO-296 Informe de Ventas

Projeto NEXIT / Casa Mingo. Branch oficial: feature/NEXIT-2026-001-banco-demo.
**Especificação canônica:** documentacao/definicoes/REQ-NEXIT-CM-E5-INFORME-VENTAS-PRO-296-2026-10-26.md.
**Contexto:** documentacao/analises/ANA-NEXIT-REPORTES-VENTAS-COMPRAS-MARGEN-MOVIMIENTOS-2026-10-26.md, CLAUDE.md e PROGRESSO-NEXIT-V1.md.
Esta ordem AUTORIZA SOMENTE IMPLEMENTAÇÃO DE CÓDIGO DO INFORME DE VENTAS. Compras, margem bruta e E4 estão fora do escopo.

## Antes de editar
1. Sincronizar a branch, conferir HEAD, ler integralmente especificação E5 e arquivos completos que serão alterados.
2. Inspecionar esquema histórico de FE/NCE: NEX-047/048/062/070/072/073/074, lib/facturacion/payload-fe.ts, payload-nce.ts, shared.ts e nce.ts.
3. Conferir padrões existentes de relatórios, navegação V1_HREFS, permissões REPORTES.VER e EXPORTAR, exportação XLSX/PDF, snapshot de leitura e tipos.
4. Identificar se a fonte permite relacionar versão do JSON efetivamente emitido, NCE DESCUENTO (serviço), NCE por linha, vendedor comercial histórico e FE original. Não inventar relações ausentes.

## Implementar segundo a especificação
- Reportes operativos → Informe de Ventas: página desktop profissional, filtros, indicadores, detalhe por documento, agrupações com dados confiáveis, paginação e Excel/PDF.
- Fonte única: documentos_electronicos com FE/NCE e seus snapshots históricos; contabilizar em totais SOMENTE estado SIFEN APROBADO. ENVIADO, PENDIENTE, RECHAZADO, CANCELADO, NO_RECONOCIDO e outros são indicadores separados.
- KPI por moeda: FE com IVA e IVA FE; NCE aprovadas com IVA e IVA NCE; vendas líquidas com IVA = FE − NCE; IVA líquido = IVA FE − IVA NCE; vendas líquidas sem IVA = líquido com IVA − IVA líquido. Sem combinar PYG/USD/BRL.
- Período por fecha_emision do próprio documento, na hora do Paraguai, e situação fiscal atual no instante da geração. Nunca imputar NCE no mês da FE original.
- Apurar uma vez cada documento ANTES dos JOINs de linhas; não repetir total conforme número de itens. IVA e descontos vêm do payload fiscal original, não preços/cadastros atuais.
- NCE de serviço DESCUENTO/BONIFICACIÓN: deduzir uma vez, mostrar ajuste não atribuível a produto quando não há ordinal original. Não atribuir artificialmente a SKU.
- Vendedor é o snapshot de documento_electronico_vendedor da FE, não emisor/creado_por; FE antiga sem vendedor deve mostrar ausência e a visão por vendedor depende de fonte verificada.
- API aplica empresa da sessão, sucursal_en_alcance, REPORTES.VER para consultar e REPORTES.EXPORTAR para download, inclusive vínculos de NCE com FE. Nunca confiar em filtros do navegador para segurança.
- Reusar componentes/formatos dos relatórios existentes, com montantes decimais exatos, leitura consistente REPEATABLE READ READ ONLY, totais de todo filtro e limites de exportação.
- Se faltarem migrações/fonte de NCE, versão histórica comprovável, CDC, IVA ou associações, sinalizar ANOMALIA/INCOMPLETO. Não mostrar NCE=0 ou lucro/neto artificial e não criar dados simulados.
- Adicionar card, rota e entrada no menu Reportes SOMENTE quando houver página e API verdadeiras e protegidas. Não criar outro módulo Ventas nem mobile.

## Restrições e entrega
Claude é exclusivamente desenvolvedor: não administra Linear, não escreve auditoria, não decide novos requisitos. Não modificar emissão FE/NCE, cálculos, gateway, estoque, compras, contas financeiras, perfis ou banco. Não executar tests/lint/build/CI, navegador, VM, SQL, migrations nem deploy.
Revisar integralmente os arquivos finais, fazer commit e push na branch oficial. Entregar SHAs completos, arquivos, decisões técnicas, limitações de fonte, evidência estática de filtros/totais/segurança e declarar que não houve testes operacionais.
**PARAR PARA AUDITORIA CHATGPT. NÃO COMEÇAR E6.**
