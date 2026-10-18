# Controle mestre — auditoria sequencial de todos os menus NEXIT V1 (18/10/2026)

**Rama:** `feature/NEXIT-2026-001-banco-demo` — **STATUS: AUDITORIA GLOBAL EM ANDAMENTO. NÃO HOMOLOGADA. SEM AUTORIZAÇÃO DE IMPLEMENTAÇÃO.**
**Decisão expressa do responsável (18/10/2026):** «Registra tudo, ainda falta menus». **Não** liberar tarefas de correção/implementação, migração, testes em VM, deploy ou homologação a Claude por ter concluído um menu. Continuar auditoria **menu por menu, individualmente**, documentando funcionalidades, bugs, observações de risco, integrações com outros menus, acessos e lacunas face ao escopo. O responsável definirá quando se encerram as auditorias e quais correções autoriza, sem supor autorização automática.
**Ambiente:** ERP apenas DESKTOP (não exigir versão celular). Branch GitHub é fonte única de código/documentação; nenhum relatório está homologado na VM.

## 1. Auditorias estáticas já documentadas nesta rodada

| Grupo | Menu | Documento |
| --- | --- | --- |
| Principal | Panel general / Dashboard | [AUD-DASHBOARD-V1](AUD-DASHBOARD-V1.md) |
| Maestros | Clientes | [AUD-CLIENTES-V1](AUD-CLIENTES-V1.md) |
| Maestros | Proveedores | [AUD-PROVEEDORES-V1](AUD-PROVEEDORES-V1.md) |
| Maestros | Productos | [AUD-PRODUCTOS-V1](AUD-PRODUCTOS-V1.md) |
| Maestros | Catálogos de productos | [AUD-CATALOGOS-PRODUCTOS-V1](AUD-CATALOGOS-PRODUCTOS-V1.md) |
| Maestros | Listas de precios | [AUD-LISTAS-PRECIOS-V1](AUD-LISTAS-PRECIOS-V1.md) |
| Maestros | Catálogos comerciales | [AUD-CATALOGOS-COMERCIALES-V1](AUD-CATALOGOS-COMERCIALES-V1.md) |
| Inventario | Stock | [AUD-STOCK-V1](AUD-STOCK-V1.md) |
| Inventario | Movimientos | [AUD-MOVIMIENTOS-V1](AUD-MOVIMIENTOS-V1.md) |
| Inventario | Depósitos | [AUD-DEPOSITOS-V1](AUD-DEPOSITOS-V1.md) |
| Inventario | Reposición | [AUD-REPOSICION-V1](AUD-REPOSICION-V1.md) |
| Reportes | Reportes operativos (índice/transversal) | [AUD-REPORTES-V1](AUD-REPORTES-V1.md); índice lido em RPT-R01 transversal, não é sexto cálculo |
| Reportes | Stock general | [AUD-REPORTE-STOCK-GENERAL-V1](AUD-REPORTE-STOCK-GENERAL-V1.md) |
| Reportes | Valorización de inventario | [AUD-REPORTE-VALORIZACION-V1](AUD-REPORTE-VALORIZACION-V1.md) |
| Reportes | Kardex de movimientos | [AUD-REPORTE-KARDEX-V1](AUD-REPORTE-KARDEX-V1.md) |
| Reportes | Stock crítico y reposición | [AUD-REPORTE-STOCK-CRITICO-V1](AUD-REPORTE-STOCK-CRITICO-V1.md) |
| Reportes | Lotes y vencimientos | [AUD-REPORTE-LOTES-V1](AUD-REPORTE-LOTES-V1.md) |
| Facturación | Documentos electrónicos | [AUD-DOCUMENTOS-ELECTRONICOS-V1](AUD-DOCUMENTOS-ELECTRONICOS-V1.md) e [relatório R01](../../testes/AUD-NEXIT-DOCUMENTOS-ELECTRONICOS-DESKTOP-R01-2026-10-18.md) |

**Interpretação:** 18 entradas com **diagnóstico estático registrado** (11 até Inventario, 6 incluindo o índice Reportes, 1 Documentos). Não significam 18 homologações, testes reais ou garantia de ausência de outros defeitos. O índice Reportes já foi lido na auditoria geral transversal, enquanto seus 5 reportes receberam relatórios independentes. Achados compartilhados devem ser contados apenas uma vez.

### Documentos electrónicos — preservar integralmente até a fase autorizada

- **8 achados de código:** DOC-D01…D08 = 1 ALTA, 6 MÉDIAS, 1 BAIXA; a situação das consultas obsoletas, KPIs, precisão monetária, snapshot, datas, e-mail e detalhes está em `documentacao/testes/AUD-NEXIT-DOCUMENTOS-ELECTRONICOS-DESKTOP-R01-2026-10-18.md`.
- **Referência de concorrência apresentada pelo usuário:** duas capturas da central fiscal: uma com filtros avançados, ícones de estados, 9 indicadores (transmissão, SIFEN, e-mail e blacklist); outra com grade de registros, seleção, ações PDF/XML/e-mail e eventos por documento. O relatório R01 descreve o confronto **C01…C28**; **E01…E15** são melhorias propostas além do concorrente e DOC-T01…T20 são testes futuros. O texto registra a análise das capturas da conversa; **os arquivos binários das imagens não foram anexados ao repositório**, logo não fingir cópia no Git.
- **Não confundir GAP com bug:** KuDE/PDF/XML não estão disponíveis por contrato não confirmado do provedor; eventos/cancelación/inutilización e email dependem da integração/regra legal real; consulta SIFEN confirma FE e NCE, não os três outros tipos NDE/NRE/AFE.
- **Regras imutáveis sem aprovação:** transmissão ao gateway != APROBADO SIFEN, CDC coerente para estado definitivo, nenhum reenvio automático do indeterminado, NCE rejeitada emitida de novo com número próprio sob regras de saldo, autorização multiempresa/sucursal e segredos nunca expostos. As próximas auditorias de Facturas/NCE/Puntos/Configuração devem considerar estas dependências, sem refazer fluxos separados.

## 2. Menus V1 ainda pendentes de AUDITORIA POR MENU completa

O `V1_HREFS` atual em `lib/navigation/menu.ts:358–380` libera 21 rotas de itens de menu de empresa. **Quatro** ainda carecem de nova revisão sequencial específica desta rodada. A rota principal de Dashboard está fora do filtro desses itens e a área de plataforma tem menu diferente.

| Ordem sugerida | Menu V1 | Rota | Estado / atenção de auditoria |
| --- | --- | --- | --- |
| 1 | **Facturación → Facturas** | `/facturas` → `/facturas/nueva` | **PENDENTE** de fechamento de auditoria individual atual. Há testes e auditorias históricas FE/FAT-E2/fiscal; NÃO equivalem à reauditoria completa de menu em 18/10. Examinar formulário, revisões, impostos, contas, moedas, ponto, número e envio/SIFEN |
| 2 | **Facturación → Puntos de expedición** | `/facturacion/puntos` | **PENDENTE** de revisão individual, apesar de históricos PRO-129/NEX-063/064/065; serialização, ponto×tipo, série/rollover, usuário, numeração e SQL aplicadas |
| 3 | **Facturación → Notas de crédito** | `/notas-credito` | **PENDENTE** da revisão menu completa; há várias auditorias recentes PRO-94 de busca e UI aceitas estaticamente que NÃO devem ser reabertas sem prova. Ver motivos/saldo/idempotência/relação FE, bloqueios, consulta e correção rejeitada |
| 4 | **Administración → Facturación electrónica** | `/configuracion/facturacion-electronica` | **PENDENTE** revisão individual; credenciais por empresa, pronto gateway, permisos, prova conexão, segredo, NEX-061 e variantes de estado |
| Separado | **Plataforma → Empresas** (somente admin global) | `/administracion/empresas` | **PENDENTE** revisão completa em fluxo próprio, ficha [AUD-EMPRESAS-PLATAFORMA-V1](AUD-EMPRESAS-PLATAFORMA-V1.md); não confundir usuário empresa e administrador global |

**Observação:** `/reportes` foi auditado como índice na revisão transversal, não como um sexto relatório financeiro independente. Se se exigir ficha individual de finalização do índice, manter esse item como **pendência de formalização documental**, nunca omiti-lo do controle. O fato de cada ficha existente dizer «ABERTA» significa **pendente de homologação e correção** mesmo quando já existe relatório estático R01.

## 3. Menus apenas declarados/ocultos fora das rotas V1 liberadas

**Não classificá-los como defeitos ou como módulos entregues apenas por aparecerem em `NAVIGATION_GROUPS`**. Precisam de decisão posterior sobre inclusão no escopo da V1/produto antes de auditoria de implementação: Maestros → Vendedores, Zonas y rutas; Compras → Solicitudes, Órdenes de compra, Recepciones, Devoluciones; Ventas → Pedidos, Ventas, Entregas; Finanzas → Cuentas por cobrar, Cobros, Cuentas por pagar, Pagos, Caja; Facturación → Notas de remisión, Monitor SIFEN; Administración → Usuarios, Roles y permisos, Configuración geral, Auditoría. Área Plataforma/Empresas fica separada e ativa somente para administrador global.

**Protocolo para menu oculto:** se existe código parcial/histórico, registrar inventário sem declarar que funciona no sistema; avaliar se o responsável quer abrir seu escopo. Não habilitar menu ou criar módulo por iniciativa da IA.

## 4. Regra obrigatória para a continuação

1. O responsável escolhe **um menu por vez**. Antes de auditar, atualizar a branch, ler `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progresso pertinente e auditorias relacionadas.
2. Auditar todas as telas, campos, componentes, APIs, SQL/migrations, autorização/alcance, integração com menus e estados, desktop e resultados, com fonte/linha/aceite. Ler o código ATUAL; não presumir que um erro antigo reapareceu.
3. Escrever relatório `documentacao/testes/AUD-NEXIT-<MENU>-DESKTOP-R01-2026-10-18.md`, atualizar ficha canônica, índice e `PROGRESSO-NEXIT-V1.md`. Separar **bug demonstrado por código**, risco não reproduzido, decisão de negócio, dependência externa e melhoria opcional.
4. **Sem implementação nem delegação ao Claude antes de autorização expressa após revisão dos menus.** Sem execução de VM/DB, mudanças fiscais/SQL ou migrações por ChatGPT. Testes dirigidos podem ser planejados; qualquer homologação cabe ao responsável.
5. Fechamento da fase de auditoria somente após o responsável confirmar que o conjunto de menus está completo. **Não** interpretar conclusão de Reportes (5/5) ou de Documentos como conclusão de NEXIT.

**Próximo menu sugerido para auditoria, SOMENTE quando solicitado:** Facturación → Facturas.
