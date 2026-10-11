# Arquivos históricos encontrados — DistribuNex SQL e documento funcional (09/10/2026)

**Origem:** dois lotes enviados pelo proprietário da PROCEIT nesta conversa. **Estado:** fontes históricas, NÃO migrations aprovadas nem executadas no banco `nexit`. O PostgreSQL da VM permanece intocado.

## Inventário recebido
- Primeiro lote: `001_base_oficial_distribunex.sql`, `002_integridade_relacional.sql`, `003_configuracion_inicial_y_seguridad.sql`, `004_compras_inventario.sql`, `005_logistica_entregas_devoluciones.sql`, `006_finanzas_cobranzas.sql`, `007_integraciones_comunicaciones.sql`, `008_notas_credito_debito_fiscal.sql`, `009_kardex_stock_inmutable.sql`, `010_integridade_comercial_fluxos_stock.sql`, `011_almacenamiento_terceros_costos_picking.sql`, `012_tesoreria_bancos_conciliacion.sql`, `013_auditoria_seguridad_cierres.sql`, `014_reportes_operativos.sql`, `015_comercial_cotizaciones_promociones.sql`, `016_correciones_criticas_y_numeracion.sql`, `017_administrador_inicial.sql`, `022_clientes_comercial_contactos_logistica.sql`.
- Segundo lote: `023_productos_completo_sifen.sql`, `024_clientes_final_sifen.sql`, `025_poblar_referencia_geografica_paraguay.sql` e `Documentacion_Funcional_DistribuNex_MVP.docx`.
- **Total: 21 migrations SQL + um documento funcional DOCX.**
- **LACUNA CONFIRMADA NOS ANEXOS: 018, 019, 020, 021 AUSENTES.** O SQL 022 exige `schema_migrations.version = '021'`; 023 exige 022; 024 exige 022; 025 exige 024. Não executar 022–025 até localizar a sequência intermediária e conciliar dependências.
- `001` avisa que foi escrita para banco denominado `distribuidora`; **o banco existente na VM é `nexit`**. Não executar inalterado sem revisar nomes e contratos.
- Identificada para revisão uma divergência possível entre referência a `depositos.empresa_id` nos scripts 010/023 e o desenho do 001 que relaciona `depositos` a `sucursales`. A 016 inclui correções relacionadas. Verificar em PostgreSQL 16 descartável antes de confiar na cadeia.
- `Documentacion_Funcional_DistribuNex_MVP.docx` (v1.0, setembro 2026, "Aprobado para diseño de base de datos y desarrollo") descreve um **MVP amplo** (compras, vendas, finanças, entregas, SIFEN). **Não é autorização para ampliar os nove itens da primeira demonstração** expressamente aprovados em 09/10/2026 na PR #7.

## Diretriz ao Claude
1. Tratar os SQL encontrados como **fonte histórica obrigatória para comparar**, evitando redesenhar cegamente o schema. Identificar objetos reaproveitáveis e conflitos com código implantado, PR #4 e os nove itens autorizados.
2. Procurar 018–021; se não encontrados, registrar dependências e propor substituição adaptada **sem inventar que foram executados**.
3. Reconciliar PG 16, função de migrations, `empresas`/usuários, `clientes`, `productos`, `proveedores`, preços, `stock`, movimentos e custo médio ponderado móvel.
4. Separar *SQL histórico completo* de *migrations aprovadas para Nexit*; não aplicar a cadeia inteira por conveniência. Documentar hash SHA256 de cada original quando os artefatos estiverem versionados.
5. Não executar no banco da VM, não modificar `nexit_pgdata`, não fazer merge. Criar e testar migrations adaptadas em ambiente descartável e submeter revisão.

## Limitação deste inventário
Este arquivo registra metadados/nomes informados e constatações preliminares. Os **bytes originais dos anexos devem ser adicionados ao Git separadamente**, sem alterações, em pasta histórica para o Claude fazer avaliação integral. O arquivo DOCX também deve permanecer original. Não declarar upload completo dos anexos até estarem efetivamente no repositório.
