# AUD-NEXIT-CM-E5 / PRO-296 — R01 — Auditoria independente do Informe de Ventas
**Data:** 26/10/2026 · **Repositório:** proceit-tech/distribuidora · **Branch:** feature/NEXIT-2026-001-banco-demo
**Commit funcional:** 105d787a747f09bf0aab75b24cfdfaf33c762c9c · 11 arquivos; sem migrações.
**Parecer:** **IMPLEMENTAÇÃO ESTATICAMENTE COERENTE COM RESSALVA DE RASTREABILIDADE DE NCE POR PRODUTO; NÃO HOMOLOGADA**, não liberar como conciliada em banco/produção.
**Base:** documentacao/definicoes/REQ-NEXIT-CM-E5-INFORME-VENTAS-PRO-296-2026-10-26.md; documentacao/ordens/ORD-CLAUDE-NEXIT-CM-E5-PRO-296-INFORME-VENTAS-2026-10-26.md; leitura dos diffs e fontes no GitHub, sem execução.

## 1. Arquivos examinados
- app/(private)/reportes/page.tsx; ventas/page.module.css e ventas/page.tsx;
- app/api/reportes/ventas/route.ts e exportar/route.ts;
- lib/navigation/menu.ts;
- lib/reportes/cliente-ventas.ts, export-ventas.ts, ventas-presentacion.ts, ventas.ts;
- types/reportes.ts;
- Comparação com schemas NEX-047/048/062/070/074, geração de payload FE/NCE e com os reportes compartilhados guard.ts, snapshot.ts, export.ts, pdf.ts, xlsx.ts, formato.ts.

O arquivo **E5-PRO-296-relatorio-final.md mencionado no diálogo NÃO foi encontrado na árvore Git do commit** e não foi disponibilizado como anexo na conversa; a auditoria se baseia nos arquivos reais e diffs auditáveis do GitHub, não nesse relatório separado. Não presumir seu conteúdo.

## 2. Conformidades de código
1. A nova página e o card de Reportes operativos existem e o menu V1 contém a rota; demais relatórios preservados.
2. GET exige REPORTES.VER; /exportar exige REPORTES.VER + REPORTES.EXPORTAR; empresa e usuário vêm da sessão. SQL exige empresa_id e sucursal_en_alcance; vínculos usam empresa_id. Não há exposição deliberada do número da FE original fora do alcance.
3. Fontes: documentos_electronicos + documento_electronico_solicitudes; nce_origen/nce_lineas/nce_descuentos e snapshot de vendedor NEX-074 quando disponível; vendedor não é criado_por.
4. Análise de resumo monetário em PostgreSQL numeric: FE APROBADA, NCE APROBADA, IVA histórico de Subtotales[0]; FE − NCE com IVA, IVA FE − IVA NCE e sem IVA; moedinhas separadas, NCE pelo mês de sua emissão.
5. CTE organiza documentos antes dos itens; agregações de documentos e de itens segregadas; document number, estado local e SIFEN distintos; dados incompletos entram em anomalias, não viram 0 fictício.
6. Filtros de datas real, sucursal, moeda e estado; consulta sem gateway e sem mutação de FE/NCE; exibições por documentos, produtos, clientes, vendedores e meses. A vista de vendedor falta somente quando esquema NEX-074 indisponível.
7. Download XLSX/PDF no endpoint autorizado; mesmos filtros e código de consulta, volume com limite existente, transação de leitura REPEATABLE READ READ ONLY, totais de todas as páginas.
8. PDF com divisão de colunas (âncoras), aviso de alterações por estado fiscal e de anomalias, UI desktop, nenhum código de compras/custo/margem/migração na entrega.

## 3. Ressalva R01-F001 — MÉDIA, rastreabilidade histórica por produto
**Fonte:** lib/reportes/ventas.ts (CTE `lin` linhas ~205–208, `fil.atribuible` ~250–256 e view `PRODUCTOS` ~393–418); NEX-062 e NEX-070.

A consulta classifica uma NCE como 'atribuible' com `lin_n = it_n`, `dsc_n = 0` e conciliação do SOMATÓRIO de valores, **sem juntar/verificar explicitamente cada par NCE.Detalles[x.ord] ↔ nce_lineas.linea (ordinal da FE original)**. O emissor SQL NEX-062/070 faz essa validação no momento da criação e isso reduz risco dos documentos criados pelo fluxo normal, porém o relatório aceita como histórica a correspondência sem a comprovar, mesmo tendo a relação por ordinal disponível. Se há dado legado/inconsistente ou outra versão, pode atribuir ajuste ao SKU errado embora total global continue certo. **Não há evidência de uma NCE real incorreta na base: é lacuna verificável de robustez e aderência estrita à exigência de rastreabilidade no próprio relatório.**

**Encaminhamento focal para ChatGPT/Claude se o responsável desejar aceite integral da vista Produtos:** usar `nce_lineas` por (empresa_id,nce_id,linea) e ord de payload; validar quantidade, monto e identificação histórica da FE; quando não comprovado, reclassificar a NCE como AJUSTE NÃO ATRIBUÍVEL ou ANOMALIA, sem afetar o total confiável por documento. Não inventar nova regra IVA, e não atribuir serviço DESCUENTO a produto. Evitar reimplementar relatório, apenas patch mínimo.

## 4. Observações/limitações não bloqueantes isoladas
- **Sem link 'Ver documento':** não existe atualmente rota /documentos/[id]. A ausência foi declarada pelo desenvolvedor e não autoriza criar uma rota nova para esta auditoria. O detalhamento numérico/CDC na linha permanece.
- **Migrations no banco operacional não verificadas:** NEX-047/048/062/070/073/074 versionadas em Git não provam sua aplicação em PostgreSQL. O relatório faz `to_regclass` e devolve 503 para falta estrutural essencial; quando falta NEX-074 desativa vendedor e quando falta NEX-070 distingue eventual NCE não conciliável. A segurança dessa estratégia **não substitui homologação no ambiente real**.
- **Anomalias:** totais de documentos aprovados mas sem dados fiscais conciliáveis aparecem em bloco à parte. Em cenários de NCE contra FE cancelada, o líquido é explicitamente incompleto; a tela deve evitar interpretação de fechamento contábil oficial.
- **Interface:** prazo default mês corrente PY e navegação desktop; aparência efetiva, responsividade dentro dos monitores e exportação real ainda sem comprovação.
- **Custo/performance:** SQL consulta JSON histórico com CTEs repetidos para KPIs, avisos, grillas e export; carga e limites reais não foram medidos. Não afirmar performance.
- **Exportação:** os dados do endpoint são gerados de nova leitura consistente e mesmos filtros, não o mesmo snapshot no tempo de uma consulta da UI feita anteriormente. Se estados fiscais mudarem entre as duas ações, os valores podem diferir legitimamente; selo de geração identifica quando a consulta ocorreu.
- **Relatório externo do Claude** não pôde ser verificado; não afirmar que suas dez respostas técnicas foram auditadas.

## 5. Gate e gestão
- **Parecer da entrega:** recebida, commit conforme escopo, **conforme estática da base principal com ressalva R01-F001** na atribuição por produto; não declarar homologação ou liberar produção.
- **PRO-296:** passar Todo → In Review (código entregue, revisão parcial e pendência de qualidade). **PRO-108** permanece Todo, pois Compras E6 não foi implementada. **PRO-115** permanece Todo.
- **Não realizar migrations, SQL, build, lint, testes, CI, VM, browser, download real, gateway, SIFEN nem deploy por IA.**
- **Próximo controle:** o analista ChatGPT deverá autorizar correção pontual R01-F001 ou documentar aceitação de risco antes de marcar a vista de Produtos conciliada. Revisar depois código/commit novo e executar homologação humana. Não iniciar E6 como derivação automática.
