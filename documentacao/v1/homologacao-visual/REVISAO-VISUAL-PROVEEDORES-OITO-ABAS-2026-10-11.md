# Proveedores V1 — revisão visual das oito abas (2026-10-11)

**Base:** oito capturas reais fornecidas pelo responsável após o deploy visual. **Resultado:** ETAPA 1 ACEITA COMO BASE VISUAL, com ressalvas para Etapa 2. Não equivale a homologação funcional ou mobile. Capturas não foram versionadas neste commit.

## Evidência visual por aba

1. **Información**: cabeçalho único, breadcrumb, quatro/ três colunas, rodapé consistente; RUC/DV não demonstra cálculo automático, próximo passo funcional. A observación general aparece.
2. **Compras y pagos**: campos alinhados; datas aparecem como mm/dd/yyyy no navegador, sem padrão visual PY; observación general repetida.
3. **Homologación y logística**: status e risco são selects comuns; regra já aprovada exige permissão específica e auditoria na etapa funcional; observación repetida.
4. **Contactos**: sete flags de comunicação e marcador de contato principal não aparecem na captura (pode haver UI parcial/oculta; auditar código antes de afirmar ausência). Card consistente; observación repetida.
5. **Direcciones**: campos descripción e dirección sem indicadores de obrigatoriedade na captura; geografia PY encadeada visível. Observación repetida.
6. **Cuentas bancarias**: labels bancários corrigidos; SWIFT/IBAN/principal não aparecem na captura, conferir TSX e regras da matriz. Observación repetida.
7. **Retenciones**: imposto, certificado obrigatório e observação por item não aparecem na captura; conferir código/contrato. Observación repetida.
8. **Documentos**: continua campo URL, previsto para substituição por upload privado já aprovado; sem alteração nesta fase.

**Correção transversal recomendada:** `observacion` mestre deve aparecer em um único lugar (Información), sem eliminar campo do payload/SQL nem perder o valor. Nas outras abas, remover apenas repetição visual.

## Próxima etapa proposta para autorização: identificação e integridade fiscal própria do fornecedor

**ETAPA 2A:** implementar PRV-01-001 a PRV-01-012 e campos gerais pertinentes da matriz aprovada; configurar geração/código estável, RUC PY 3–8 dígitos ASCII sem DV, DV módulo 11 DNIT calculado e verificado servidor, documentos estrangeiros do país de origem (sem impor SIFEN receptor), coerência tipo de pessoa/tipo documental, duplicidade tenant, nomes/limites do SQL vigente com migration incremental se necessária, país e catálogos, telefone/email/site; corrigir precisão dos erros por campo e exibição sem campo técnico; remover repetição visual de observación. Confrontar `GET/POST/PUT` e tipos/DDL antes de codificar; não desenvolver homologação, bancários, retenções ou upload nesta etapa. Obter autorização explícita antes de qualquer implementação.

**Etapa 2B subsequente:** campos comerciais/logística, integridade dos filhos por IDs, e depois aprovação/homologação, bancos, retenções e documentos; ordem final conforme plano oficial.

**Limites:** nenhum código, migration, SQL, VM ou Docker alterado por esta revisão. Testes de navegador mobile e banco ainda pendentes. Oito screenshots não comprovam preservação dinâmica de todos os campos ocultos ou persistência.
