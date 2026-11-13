# Nexit V1 — Auditoria de Listas de Precios e proposta de Catálogos Comerciales

**Data:** 2026-10-12. **Responsabilidade:** ChatGPT (auditoria). **Estado:** PROPOSTA / NÃO HOMOLOGADO / SEM IMPLEMENTAÇÃO AUTORIZADA NESTE DOCUMENTO. **Ambiente:** nenhum SQL executado; nenhuma gravação em VM.

## 1. Evidências

Capturas reais do responsável: `image(20261012-111825).png` Información, `image(20261012-111837).png` Productos vacío, `image(20261012-111914).png` Productos com 1 item/escalón, `image(20261012-111938).png` Reglas comerciales. Formulário efetivamente aberto pelo usuário; ausência de produtos no estado inicial é esperada, não defeito.

**Git branch:** `feature/NEXIT-2026-001-banco-demo`. Código verificado:
- `app/(private)/listas-precio/page.tsx`
- `app/(private)/listas-precio/nuevo/page.tsx`
- `app/(private)/listas-precio/_components/lista-precio-form.tsx`
- `app/api/listas-precio/route.ts`
- `lib/listas-precio/shared.ts`
- `documentacao/banco/nexit/v1/migraciones/NEX-008-listas-precio.sql`
- `documentacao/banco/nexit/v1/migraciones/NEX-018-listas-precio-integridad.sql`
- `PROGRESSO-NEXIT-V1.md`, `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`.

Limites: as rotas `app/api/listas-precio/[id]`, migrations de origem de `zonas_comerciales`, `canales_venta`, catálogo de moedas e eventual tabela de taxas cambiais ainda precisam ser lidas/identificadas detalhadamente antes de modificar modelo. Sem execução de operações POST/PUT, navegador interativo ou banco real.

## 2. Matriz de auditoria

| ID | Área | Evidência encontrada | Risco/resultado | Prioridade | Ação recomendada |
|---|---|---|---|---|---|
| LP-01 | Cabeçalho | Pill LISTAS DE PRECIOS + h1 + descrição + card NUEVA LISTA + código automático | Hierarquia visual redundante frente à linguagem compacta de outros módulos | P1 UX | Um título e subtítulo só quando necessário; remover aviso visual de LP-XXX sem perder geração automática |
| LP-02 | Três abas | Información, Productos y precios, Reglas comerciales | Presente | Conforme | Manter, estados consistentes e erros por aba |
| LP-03 | Código | `LP-nnn` por empresa documentado, campo opcional | Não retirar geração | Conforme | Confirmar unique constraint e concorrência |
| LP-04 | Nome | Obrigatório; frontend verifica | Erro geral sem localização por campo | P1 | Padrão inline/foco por campo |
| LP-05 | Tipo Venta/Compra | Modelo e UI oferecem ambos | Políticas de preço e aplicação não necessariamente equivalentes | P1 investigação | Auditar compatibilidade de regras de cliente com Compra; diferenciar negócio |
| LP-06 | Moeda | `monedas` globais, FK e itens mesma moeda por NEX-018 | Seleção não comprova conversão; importar custo/preço de referência em outra moeda sem conversão demonstrada | P0 funcional | Definir par de moedas, cotação efetiva e bloqueio explícito para valores não convertidos; jamais aplicar câmbio inventado |
| LP-07 | Estado x Lista activa | `estado` e `activo` independentes | Interface pode transmitir dois estados contraditórios | P1 | Definir estados e precedência, evitar checkbox redundante se duplicado |
| LP-08 | Modo de precio | PRECIO_FIJO, AJUSTE_PORCENTAJE, MARGEN_SOBRE_COSTO | Exibido mas cálculo efetivo desses modos e lista-base requer revisão ponta a ponta | P0 | Testes unitários + SQL para cada modo e encadeamento |
| LP-09 | Lista base | FK para outra lista, validador anticiclo no backend relatado | Conferir compatibilidade de tipo/moeda e atualização da derivada | P1 | Revisar método de precificação sem alterar histórico arbitrariamente |
| LP-10 | Ajuste general % | Valor no cabeçalho | Potencial duplicidade com ações -5/-10/+5 da aba Produto | P1 | Separar ajuste configurado da lista vs modificação em massa de preço; explicar se cumulativo |
| LP-11 | Vigências | Controle `type=date`, screenshot vazio `mm/dd/yyyy` | Locale exibido fora do esperado es-PY; default `new Date().toISOString().slice(0,10)` usa UTC e pode deslocar data em PY próximo da meia-noite | P1 | Data local Assunção, formatação dd/mm/yyyy sem alterar semântica SQL |
| LP-12 | Prioridade | 10 por padrão; regra tem prioridade própria | Precedência e empate não demonstrados | P0 negócio | Definir algoritmo explícito + testes e documento |
| LP-13 | IVA incluido | Checkbox | Semântica muda preços e margem | P1 | Não recalcular tributos automaticamente sem regra aprovada, validar diferenças por taxa/produto |
| LP-14 | Descuento máximo + adicional | Cabeçalho e regra, mais desconto por item e escalón | Possível empilhamento e superação de limites | P0 negócio | Especificar precedência/combinação, impedir descontos não autorizados |
| LP-15 | Produto sem preço referência | `producto.precioReferencia ?? producto.costoPromedio` | Se não há referência, **custo vira preço de venda proposto**; risco comercial silencioso | P0 | Não usar custo como preço sem aviso/aprovação; sinalizar SIN PRECIO e exigir decisão |
| LP-16 | Margem importada | `margenPct: 0` ao adicionar/importar; captura 180.000 custo / 336.000 venda / 0% margem | **Defeito reproduzível por inspeção**: margem exibida não deriva do preço inicial | P0 | Fórmula explícita: margem bruta (venda − custo)/venda *100; com valores capturados =46,43%. Distinguir markup |
| LP-17 | Divisão por zero | `((value - costo)/value)*100` no onchange e `((precio - costo)/precio)*100` no ajuste | Preço 0 com custo >0 produz infinito, que pode quebrar `toFixed`/validação | P0 | Guarda para preço <=0 e comportamento definido; testes |
| LP-18 | Ajustes massivos | `aplicarAjuste` base=`precioBase || costoReferencia`; `Math.round` sempre arredonda para inteiro; configura também `descuentoPct` | Repetição de clique não é incremental; desconto e preço podem representar benefício duplicado; arredondamento independe da moeda | P0 | Cálculo determinístico e explicitação da base; confirmar no diálogo quantos itens mudam, pré-visualização/undo; arredondar por precisão da moeda e regra |
| LP-19 | Preço médio | média simples incluindo inativos, sem símbolo moeda | Indicador ambíguo; pode induzir decisão inadequada | P2 | Rotular e informar moeda, decidir usar itens ativos |
| LP-20 | Campos numéricos | Inputs HTML numbers e valores JS float; servidor `numeric(18,4)` | Arredondamento, precisão e importações em moedas com centavos | P1 | Regras centralizadas de moeda/precisão e backend; evitar Double para valores críticos sem delimitação |
| LP-21 | Produto/Preço | Custo editável, preço base e lista, margem, cant. mín. | Mistura campo informativo e campo persistido | P1 | Identificar claramente custo de referência vs preço editável; recalcular margem ao editar custo/base/lista |
| LP-22 | Escalones | Inclui min/max/preço/desc/%/vigência | Backend verifica min<=max, mas sobreposição/ordem entre escalões ainda não confirmada | P1 investigação | Rejeitar intervalos sobrepostos se regra comercial exigir; garantir seleção determinística |
| LP-23 | Importar todos | Insere produtos ativos retornados pela API; frontend sem filtros | Em catálogos grandes cria formulário enorme e pode incluir preços derivados de custo | P1 | Importação seletiva/filtro, processamento escalável e prévia antes de aplicar |
| LP-24 | Regla comercial | GENERAL/GRUPO_CLIENTE/CLIENTE/ZONA/CANAL_VENTA; `referencia_id` validada via trigger NEX-018 | Proteção multiempresa documentada, mas execução real não testada agora | Conforme/QA | Testar referências inválidas, inativas, empresas cruzadas |
| LP-25 | Aplicação simultânea | Cabeçalho inclui grupo/cliente/zona/canal e regras específicas | Precedência e combinação não esclarecidas nesta revisão | P0 negócio | Estabelecer ordem de prioridade, data, quantidade, exclusividade; documento algoritmo |
| LP-26 | Salvar 3 abas | `submit` valida só nome e vigência antes do POST, erros gerais | Erro em aba não visível pode dificultar correção | P1 UX | Validar campo por campo, trocar para aba errada e focar |
| LP-27 | Navegação insegura | `Volver a listas` é Link direto; não observei confirmação de dirty no componente | Possível perda de edição | P1 | Confirmar em saída/cancelamento com dirty, mesmo padrão Produtos |
| LP-28 | Responsividade | Grid 4 colunas, escalones e tabela extensa | Avaliar 375/768/desktop real | P1 | Card responsivo, scroll horizontal só na grade de preços, ações legíveis |
| LP-29 | Estado persistente | POST/PUT transacionais relatados no Progresso | Integridade declarada, não testada no PostgreSQL real neste turno | QA | POST/PUT/GET/reload e reversão em erro por tipo/moeda/empresa |
| LP-30 | Historico de preços | Não demonstrado nas capturas; UPDATE substitui itens/escalões/regras conforme progresso | Risco de perder versões de precificação sem trilha operacional | P1 investigação | Verificar auditoria/histórico antes de definir snapshot/revisões |
| LP-31 | Permissões | LISTAS_PRECIO.VER/CREAR/EDITAR na API | Esperado | QA | Verificar 401/403 multiempresa, inclusive novos cadastros |
| LP-32 | Diferença estética | Tipografia de labels muito pesada e h1 leve na captura, diferente de Catálogos recém-ajustados | Inconsistência visual real | P1 UX | Usar tokens e padrões existentes de Cliente, Proveedores, Productos, Catálogos, sem redesenhar módulo completo |

## 3. Novo menu proposto: Catálogos Comerciales

Rota sugerida `/catalogos-comerciales` (conferir navegação/perfis existentes antes de inserir); título em espanhol **Catálogos comerciales**. Abas: **Tipos de cambio**, **Canales de venta**, **Zonas comerciales**. Adotar layout da lista-padrão e formulários compactos dos Catálogos de Productos: título único, abas, busca, filtros de status, paginação/ordenação, ação Novo/Editar/Inactivar, avisos por campo, confirmação dirty, sem apagar registros referenciados.

| Aba | Campos propostos (sujeitos à DDL efetiva) | Regras |
|---|---|---|
| Tipos de cambio | Moneda origen; moneda destino; cotización; tipo compra/venta (somente se negócio exigir); fecha/hora vigencia; fuente/referencia; activo; observación | Preservar `monedas` atual; valores >0, origem!=destino, precisão controlada, histórico imutável ou versionado conforme decisão; jamais sobrescrever cotação usada por transação |
| Canales de venta | Código, Nombre, Descripción opcional, Activo | Usar `canales_venta` existente, empresa da sessão, únicos por empresa, não apagar se referenciado |
| Zonas comerciales | Código, Nombre, Descripción opcional, Activo; eventual hierarquia geográfica **só após requisito** | Usar `zonas_comerciales` existente, empresa da sessão, únicos por empresa, histórico preservado |

**Escopo condicionado:** não foi ainda confirmado no repositório se existe tabela de taxas `tipos_cambio` ou outra, nem qual fonte/semântica de câmbio (cotação manual vs automática) é desejada. Antes de qualquer migration, pesquisar DDL e usos de moeda/câmbio em outros módulos. Não chamar câmbio de cadastro de moedas: moedas já têm catálogo próprio.

**Integrações:** aba Reglas Comerciales das Listas de Precios deve consumir Canais/Zonas recém administrados, respeitando ativos e preservando antigos. Em campos por cliente, decidir se a zona/canal deve ser inferida do cadastro do cliente, da operação, ou selecionada explicitamente; não supor. Não implementar conversão automática de preço por câmbio sem especificação, taxa efetiva e trilha de auditoria.

## 4. Benchmark de mercado — recomendações, não requisitos copiados

- **Odoo:** price lists oferecem múltiplas moedas, vigências, quantidades e segmentação por cliente/local; https://www.odoo.com/documentation/19.0/applications/websites/ecommerce/configuration/prices.html
- **SAP Business One:** preços especiais por parceiro e períodos/volumes; https://help.sap.com/docs/sap_business_one/68a2e87fb29941b5bf959a184d9c6727/452365669e152b31e10000000a1553f7.html
- **Dynamics 365 Commerce:** price groups e prioridades associadas a canais/entidades comerciais; https://learn.microsoft.com/en-us/dynamics365/commerce/price-management
- **Priorização Nexit V1:** validar cálculo, hierarquia de regras, conversões e rastreabilidade antes de adicionar funcionalidades sofisticadas ou promoções automáticas.

## 5. Execução proposta por fase

**Fase 0 / Especificação e auditoria técnica (antes de Claude alterar código):** confirmar DDL real de moeda, zona, canal, câmbio; calcular margens/escala/precisão; rastrear chamadas de listas em Clientes, Productos e futura Venda; documentar precedência (lista base, prioridade, cliente, grupo, zona, canal, descontos e datas). Solicitar decisão do responsável para câmbio e regras que alteram valores financeiros.

**Fase A / UX e erros comprovados:** padronizar três abas, cabeçalho e formulários; eliminar redundâncias; margem calculada corretamente na importação, em custo/valor editado, proteger 0; confirmar ajuste em massa; mensagens inline e dirty. Não modificar semântica de descontos e arredondamento sem aprovação.

**Fase B / Catálogos comerciales:** desenvolver separadamente as abas Canales de venta e Zonas comerciales usando tabelas existentes, após comparar SQL/FKs/grants; migrar somente o que falta (nova migração sequencial, sem alterar já aplicadas); verificar menu e permissões existentes; aba câmbio depende de confirmação do modelo.

**Fase C / Câmbio:** decidir se manual, comprado/vendido, fonte, taxa temporal e aplicação nos módulos; definir tabela/migração somente se necessária, com histórico e isolamento por empresa.

**Fase D / Homologação:** testes reais PostgreSQL e navegador pelo responsável, preços 0, custo>0, moedas PYG/USD/BRL, produtos sem preço, sobreposição escalões, descontos cumulativos, regras de zona/canal, permissões/empresa, mudança de câmbio e histórico; nenhum SQL real por Claude/ChatGPT.

## 6. Pendências que exigem decisão humana
1. **Tipos de cambio**: cotação **manual** (valor digitado) ou integração externa, ou ambos? Taxas de compra e venda distintas? Cotação por data ou timestamp?
2. Como a lista escolhe preço quando Cliente + Grupo + Zona + Canal combinam? **Não definir precedência silenciosamente**.
3. Política de conversão de moeda na lista e do custo de produto; permitir importação sem preço configurado?
4. Arredondamento por moeda, se descontos são cumulativos e como determinar a margem.
5. Grupos de clientes já são usados: incluir no mesmo menu ou manter administração em Clientes? Esta auditoria não aprova criar grupo novo sem verificar o cadastro atual.

## 7. Ações não realizadas
Nenhuma implementação, migration, SQL, deploy ou teste real. Documento de auditoria para deliberação e posterior tarefa única ao Claude.
