# ORDEM PARA CLAUDE — Nueva factura: tabela da revisão, busca avançada, gateway HTTP 400 e erro KuDE

**Data:** 25/10/2026 · **Repositório:** `proceit-tech/distribuidora` · **Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Base inspecionada:** `755460645083538b1c931e2f51b6bd4e5f1d01e6`.  
**Auditoria obrigatória:** `documentacao/analises/AUD-NEXIT-FE-ENVIO-400-UX-RESUMEN-2026-10-25.md`.  
**Esta ordem é focal. Executá-la APENAS se o responsável a enviar. Nenhum envio HTTP real/SQL/VM/deploy está autorizado.**

## 0. Leia tudo antes de editar

`CLAUDE.md`; auditoria acima; arquivos COMPLETOS `app/(private)/facturas/nueva/page.tsx`, `page.module.css`, `app/(private)/documentos/kude-modal.tsx`, `app/(private)/documentos/page.tsx`, `lib/facturacion/gateway.ts`, `envio.ts`, `gateway-credenciales.ts`, `gateway-estado.ts`, `payload-fe.ts`, `emision.ts`, `lib/facturacion/kude-visor.ts`, `app/api/documentos/[id]/kude/route.ts`, `app/api/documentos/[id]/enviar/route.ts`; `NEX-049/050/061/067/068/072/073/074` aplicáveis; `PRO-93`, `PRO-128`, `PRO-133`, `PRO-194`, `PRO-115`, `PRO-310` no Linear. Consulte o contrato API externo já documentado; não presumir dados de produção.

**Capturas fornecidas ao ChatGPT (não incluídas no Git; uma expõe SENHA/TOKEN, portanto NÃO copiar imagens para GitHub ou Linear, não transcrever nenhum segredo).** A primeira mostra resumo com tabela quase invisível; quinta mostra botão `Búsqueda avanzada` deslocado após adicionar produto; segunda/terceira/quarta demonstram login 200, recepcion_de 400 e KuDE 400 no documento 001-003-0009010.

## 1. UX P1 — PRIORIDADE DA MODAL DE RESUMO: PRODUTOS SÃO A PARTE CENTRAL

Erro real: modal `Resumen de la factura` usa `.resumenCuerpo { display:grid; flex:1; overflow-y:auto }` e `.resumenTabla { max-height:260px; overflow:auto }`. Os cartões de `Cliente y entrega`, `Operación`, `Pagos` esticam verticalmente e a tabela de produtos apresenta quase nenhuma linha, com segundo scroll vertical. O operador NÃO consegue verificar os produtos antes de emitir.

**Implementar:**
- Modal responsiva com cabeçalho compacto `Empresa`, código `Establecimiento`, ponto e data; manter todas as informações.
- Três grupos comerciais/fiscais com altura NATURAL, nenhum cartão vazio preenchendo 1/3 da tela. Endereços e `dInfAdic` extensos devem poder ser examinados integralmente (pode usar detalhe expandível), mas não dominar a vista principal nem duplicar vendedor/destino por apresentação.
- **Tabela de produtos visualmente dominante e imediatamente legível**, com Produto (descrição e código), Unidad, Cantidad, Precio IVA incluido, IVA, Descuento quando existente e Total; tabelas com 0, 1, 20 e 100 linhas, descrições longas, valores grandes, IVA e descontos. Não omitir campos calculados.
- **SEM rolagem vertical independente dentro da tabela**; usar no máximo UMA rolagem vertical do CORPO da modal se conteúdo exceder viewport. Rodapé de totais/ações visível e não sobreposto. Não criar outra modal ou overlay.
- Não alterar payload, arredondamento, cálculo, descontos, reserva, quantidade, stock nem autorização de envio; preserve fluxo `Volver a editar` e `Enviar factura`, revisão congelada, foco, Tab, Esc, scroll/teclado e acessibilidade.
- Revisão estática de CSS global + CSS Modules para conflitos/últimas regras/viewport 1366x768, 1440x900, 1698x864; não afirmar teste visual sem navegador. Layout móvel legível.

## 2. UX P1 — BOTÃO BÚSQUEDA AVANZADA ESTÁ DESCENDO

Causa comprovada: o `BuscadorRapido` inclui o aviso `b.aviso` no mesmo bloco `.buscador` que o campo, enquanto `.buscarFila` tem `display:flex;flex-wrap:wrap;align-items:flex-end`. Quando mostra `«…» añadido`, o bloco esquerdo cresce para baixo e o botão fica alinhado ao fim do aviso, não ao INPUT.

**Corrigir estruturalmente**: campo de inclusão e `Búsqueda avanzada` sempre alinhados na mesma linha do desktop, mensagem de sucesso / erro abaixo da linha de controles, lista de autocompletar sem sobreposição; mobile com quebra responsiva deliberada. Não aplicar hack de margem arbitrária dependente de fonte/zoom. Pode usar slot de ação exclusivo do buscador de produtos, mantendo sem regressão buscadores de Cliente e Vendedor e eventos scanner/Enter/quantidade/foco.

## 3. GATEWAY P0 — ERRO HTTP 400 DA EMPRESA NA VALIDAÇÃO DO LOTE

**Evidência fornecida:** Postman `/api/login` retornou 200 e token (NÃO publicar token); NEXIT para FE `001-003-0009010` informa autenticação obtida, `POST /api/recepcion_de` HTTP 400, `No se encontraron datos de la empresa para validar el lote`; KuDE 400 `Número de documento no encontrado`.

**Isto não prova JSON malformado.** Diagnosticar estaticamente o fluxo REAL, isolado por tenant:
1. `empresaId` da sessão → `fe_gateway_config` e `fe_gateway_credenciales` dessa empresa → URL/ambiente usado efetivamente → `/api/login` → token da mesma conta → payload FE **imutável** guardado no documento → `/api/recepcion_de` com Bearer. Postman de login pode usar OUTRO RUC, URL ou conta. Comparar lógica, **não ler senhas em ferramentas nem pedir ao responsável que cole credenciais**.
2. Verificar se código usa o emissor CASA MINGO realmente vinculado a essa conta do gateway. RUC cadastral do NEXIT vs credencial API vs empresa provisionada no fornecedor são identidades relacionadas, NÃO automaticamente iguais. Verificar mapeamento/dados de emisor, habilitação de emissão/lote, estabelecimento/ponto, ambiente e campos obrigatórios do contrato **apenas onde evidência existir**. Não acrescentar `dRucEm`, `dInfoEmi`, cabeçalho ou valor hardcoded sem documentação de recepcion_de; não alterar geográficos PRO-322 (somente códigos, descrições derivadas pelo fornecedor).
3. Na resposta, distinguir **HTTP login OK**, **requisição HTTP de envio transmitida**, **recepção pelo gateway NÃO confirmada/rejeitada** e **estado SIFEN ainda NÃO confirmado**. `interpretarRecepcion` atualmente enquadra genericamente FE HTTP 400 como `ERROR_ENVIO/RECHAZO`: isso é falha do gateway na identidade de empresa, não prova RECHAZADO SIFEN. Ajustar mensagens/classificação **somente se possível sem quebrar contratos SQL/estados**; não falsificar estados, não chamar rejeição fiscal sem `Rechazados` inequívoco.
4. Elaborar matriz diagnóstica de hipóteses sustentadas (conta API de outra empresa; gateway/ambiente errado; empresa não provisionada/habilitada; payload de emisor sem contrato); para cada hipótese, evidência existente e prova ainda pendente. **SEM executar** login, recepcion_de, consulta, KuDE ou qualquer teste com credencial real.
5. Se depender do fornecedor, deixar solicitação técnica curta **em espanhol** pronta para operador: confirmar vínculo da conta API e RUC da empresa emissora, ambiente, autorização de lote e causa de HTTP400, usando apenas identificadores/erro autorizados. **NÃO** colar a senha, token, headers, JSON completo, dados pessoais nem imagens com segredos.
6. **Não reenviar 001-003-0009010 automaticamente, não gerar outra factura ou número.** O código reserva FE ANTES da transmissão; `NEX-067` ainda executa baixa de estoque no CRIAR, mesmo com rejeição do gateway. Registrar a necessidade de conciliação documental e da saída/estoque, sem presumir que ocorreu no banco da captura e sem mudança de inventário nesta ordem. O tratamento correto de reserva/saída somente na aprovação já existe em **PRO-310/PRO-309** e NÃO está autorizado nesta tarefa.
7. O estado e migrations reais da VM da captura são DESCONHECIDOS: a documentação diz que NEX-072/073/074 não foram aplicadas, mas uma tela pode estar servida por outro commit/DB. Registrar diferenças e indicar exatamente quais leituras de versão/`schema_migrations`/configuração seriam necessárias **para autorização humana futura**, não executá-las.

## 4. KuDE P1 — MODAL DE ERRO É UM QUADRO BRANCO DE 92vh

`app/(private)/documentos/kude-modal.tsx` usa altura `min(92vh,100%)` para **TODAS** as fases. Em `ERROR` (`/api/kude` HTTP400), deixa um quadro enorme vazio com aviso no centro.

- Manter visualizador amplo **apenas quando existir PDF**; para erro ou indisponibilidade usar **diálogo compacto adaptável à mensagem**, centralizado, com `Cerrar`/ação de nova consulta de KuDE claramente identificada, sem iframe/altura vazia.
- Indicar que `Número de documento no encontrado` significa **ausente no gateway**, NÃO defeito de template PDF; permitir inspecionar estado/envio no módulo de Documentos electrónicos.
- **Respeitar PRO-194**: KuDE pode ser solicitado para FE/NCE em QUALQUER estado fiscal, inclusive sem CDC. NÃO esconder/desabilitar o botão por estado nem exigir `APROBADO`/CDC. Proteger foco/escape, não fazer request automática adicional além do fluxo anterior.
- Não modificar endpoint ou payload de KuDE sem evidência de erro de contrato distinto.

## 5. Entrega / proibições

- Rastrear arquivos COMPLETOS antes e depois. Preservar combo com **13 tipos no mesmo select sem campos extras**, `001` primeiro, cadastro usuário+Vendedor, regras da NEX-073 e endereço fiscal PRO-322; sem trabalho de NCE, STOCK, KuDE externo ou migrations fora de escopo.
- **NÃO executar** testes, lint, typecheck, build, CI manual, SQL/migrations/runner, VM, Postman, endpoints HTTP externos, gateway, emissão FE real, consulta de estado real, download PDF real ou deploy. NÃO tocar segredos, não versionar screenshots.
- Implementar patches UX e quaisquer correções de código realmente provadas e pequenas na classificação/mensagens; não simular integração do fornecedor. Registrar separadamente as dependências externas que código nenhum resolve.
- Commit/push separado (resumo UX, botão, modal KuDE, ajustes necessários de mensagens de gateway se comprovados). SHA completo de cada; matriz de achados com `implementado`, `hipótese`, `bloqueado por fornecedor/DB`, `não testado`. **PARAR PARA AUDITORIA DO CHATGPT; NÃO começar outra tarefa.**
