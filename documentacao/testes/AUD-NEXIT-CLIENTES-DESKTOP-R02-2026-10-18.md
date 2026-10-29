# AUD-NEXIT-CLIENTES-DESKTOP-R02 — Reauditoria independente por menu

**Data:** 2026-10-18. **Auditor:** ChatGPT. **Sistema:** NEXIT / ERP DistribuNex, exclusivamente **desktop**, repositório `proceit-tech/distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`. **HEAD funcional/documental inicial:** `93d53163b80bfbdaf5cd142d32c0bfb1c396107c`. **Corte de referência da R01:** `fe9e64123c70053b83f3d34b66cee779f184fe62`.

**PARECER:** menu Clientes em **AUDITORIA ESTÁTICA COM PENDÊNCIAS — NÃO HOMOLOGADO**. **Uma divergência ALTA condicionada à decisão de RBAC, quatro MÉDIAS** (incluindo duas novas); observações operacionais sem correção automática. Nenhum ajuste de aplicação nem ordem de desenvolvimento ao Claude. Auditoria original R01 preservada.

## 1. Integridade do escopo e fontes verificadas

- Protocolos atuais: `CLAUDE.md` e `documentacao/PROTOCOLO-IA.md`; `PROGRESSO-NEXIT-V1.md` (blocos Clientes 12/10, Clientes desktop 18/10, Dashboard R03); ficha `documentacao/v1/auditoria-por-menu/AUD-CLIENTES-V1.md`; `AUD-NEXIT-CLIENTES-DESKTOP-R01-2026-10-18.md` e plano de correções desktop (C11, C37).
- Cobertura seletiva e rastreio: listagem `app/(private)/clientes/page.tsx` (857 linhas); alta `nuevo/page.tsx` (2813); edição `[id]/page.tsx` (2491); editor de filhos `[id]/_components/hijos.tsx` (301); layout; endpoints `app/api/clientes/route.ts` (1236), `[id]/route.ts` (594) e família `[id]/documentos/**`; funções `lib/clientes/{relacionados,referencias-version,documentos-http,permisos-documentos,aptitud-cliente,filtros-listado,estabilizacion.casos}.ts` e fluxo do GET de geografia. Schemas históricos `NEX-005`, NEX-030/031 e grants `NEX-053` consultados; layout/shell e decisão de landing atual `resolverInicio` considerados.
- **Comparação obrigatória de código:** SHA dos blobs de lista, alta, detalhe, editor filhos, GET/POST, GET/PUT, relacionados e layout são **idênticos entre `fe9e64123...` (R01) e o HEAD desta R02**. Portanto **não houve alteração funcional recente nesses arquivos para reverter**. O commit de Dashboard R03 alterou o início por papel, mas não resolveu a política de CLIENTES.CREAR/VER.
- **Limites:** GitHub estático com revisão dirigida de trechos de arquivo e fluxos, não execução exaustiva linha por linha de todas as milhares de linhas. Zero execução de código/SQL, PostgreSQL, VM, navegador, screenshot, docker, build, lint ou testes pelo ChatGPT. Evidências de testes antigos do Claude são históricas e não foram reexecutadas aqui. Migrations versionadas não provam aplicação na VM.

## 2. Matriz de verificação de fluxos

| Fluxo | Rastro de UI → API → persistência / autorização | Resultado |
|---|---|---|
| Sidebar e entrada | `resolveNavigation` só oferece Clientes mediante `CLIENTES.VER`; `resolverInicio` (introduzido pelo Dashboard) destina perfil só CREAR a `/sin-acceso` caso não tenha outro módulo; layout Clientes exige `VER` | **CLI-D01 — gate RBAC** |
| Listagem, filtros, resumo, ordenação, paginação UI | GET `/api/clientes?modo=lista` exige VER, filtra `c.empresa_id`; cliente filtra/pagina em memória; aptidão fiscal avaliada separadamente | Dados de outras empresas não comprovados expostos; ações indevidas **CLI-D02** e risco de escala **CLI-D04** |
| Alta e catálogos | `nuevo/page.tsx` requer layout VER; GET catálogos e geografia exige VER; POST exige CREAR; carga inicial dos documentos permite criador com CREAR enquanto estado aberto | **CLI-D01**, contrato documental de CREAR-only inconsistente se papel é previsto |
| Edição / concorrência | GET `/api/clientes/[id]` requer VER, PUT requer EDITAR, `FOR UPDATE` + comparação de `actualizadoEn`/409; refs antigas preservadas por comparação | Guardas servidor mantidas; frontend editável para VER-only **CLI-D02**; CAS historicamente corrigido |
| Contatos e direções | `hijos.tsx` com chaves estáveis `k` na edição, mas respostas geográficas sem token; alta indexa opções pelo índice posicional e remove linhas | **CLI-D03**, novo **CLI-D06** na coerência entre tipo FISCAL e flag fiscal |
| Documentos | APIs por ação via `permisos-documentos.ts`; descarga VER, mudança/histórico EDITAR, alta inicial por criador CREAR; consultas com `empresa_id` da sessão, versões/eventos e remoção lógica | Sem regressão comprovada neste rastreio; estado efetivo de grants NEX-053 não verificado |
| Limite de crédito | PostgreSQL `clientes.limite_credito numeric(18,4)`; GET lista retorna decimal, mapeador converte com `Number`; resumo soma via number e formata Intl | **CLI-D07** — precisão monetária não garantida |
| Regras fiscais / condições | POST/PUT validam natureza/operação, RUC/DV, país/geografia, registros relacionados, aptidão e conflitos; SQL tem CHECKs e índices | Não alterar SIFEN nem schema fiscal em resposta a achados de UI; end-to-end operacional pendente |

## 3. Achados abertos, severidade e plano mínimo de comprovação

### CLI-D01 — ALTA CONDICIONAL, GATE DE CONTRATO RBAC — CREATE-only sem acesso à própria alta

`app/(private)/clientes/layout.tsx:6` exige `guardPage('CLIENTES','VER')` também para `/clientes/nuevo`; `app/api/clientes/route.ts:414–418` aplica VER à rota GET inteira (inclusive `modo=catalogos` e `catalogo=distritos/ciudades`); `route.ts:630–638` exige apenas CREAR para POST. `lib/navigation/menu.ts` só exibe Cliente para VER e `resolverInicio` introduzido no Dashboard pode enviar papel só CREAR a `/sin-acceso`. O fluxo de documentos de alta já tem suporte expresso ao criador CREAR-only (`permisos-documentos.ts`). **Divergência de contrato REAL; gravidade operacional depende de o perfil apenas CREAR ser intencionalmente utilizável pela UI.** Não conceder VER automaticamente nem abrir listagens/detalhes/catálogos amplos por suposição. **Decisão requerida ao responsável:** quem tem somente CLIENTES.CREAR deve acessar uma alta guiada e catálogos mínimos sem acesso à listagem/ficha alheia, ou CREAR é sempre acompanhado por VER na política oficial? A primeira opção exige guard específico, catálogo limitado e destino seguro; a segunda exige documentar a invariável RBAC e rever atribuições, não desmontar ACL em massa. Testes por papéis CREATE-only / VIEW-only / EDIT-only / admin / sem permissão.

### CLI-D02 — MÉDIA, CONFIRMADA — interface oferece criar/editar sem autorização

`app/(private)/clientes/page.tsx:512–516,720–727` mostra «Nuevo cliente» para o ator apenas VER; `app/(private)/clientes/[id]/page.tsx:1090–1130,2458–2485` mostra formulário editável e botão «Actualizar cliente» sem gate `CLIENTES.EDITAR`. APIs POST/PUT negam CREAR/EDITAR ausentes. Evitar fazê-lo preencher formulário impossível de salvar; preservar modo leitura para VER e ações conforme papéis reais, sem aumentar permissões. O tratamento de creator-only deve obedecer decisão CLI-D01.

### CLI-D03 — MÉDIA, CONFIRMADA — corrida geográfica na alta e na edição

`nuevo/page.tsx:514–605`: fetch de distritos/cidades sem invalidar resposta anterior nem vincular ao departamento/distrito atual; `setDistritosPorDireccion`/`setCiudadesPorDireccion` indexam posição de array, e `direcciones.map(key={indice})` / remoção deslocam índices (`:1741–1755`). `[id]/_components/hijos.tsx:154–206`: chave de endereço `d.k` é estável (ponto positivo), mas fetch e precarga com `cargados.current` não invalidam seleção antiga/removida e podem repor opção geográfica desatualizada. API de validação geográfica mitiga persistência errada; bug comprovado é lista e UX incorretos com erro tardio. Corrigir somente identidade/cancelamento de requisição por endereço + contexto de seletores, preservando endereços previamente carregados. Testar A→B fora de ordem, remoção de direção 1 enquanto resposta chega, edição pré-carregada e seleção do operador.

### CLI-D06 — MÉDIA NOVA, CONFIRMADA — tipo FISCAL e flag fiscal divergem ao transferir endereço fiscal

`[id]/_components/hijos.tsx:255–257` ao escolher tipo `FISCAL` para endereço B define `esFiscal:true` para B e `esFiscal:false` para outros, **mas mantém `tipo:'FISCAL'` em eventual endereço A anterior**. `:289–291` ao desmarcar checkbox «Dirección fiscal» só troca `esFiscal`, mantendo `tipo:'FISCAL'`. O serviço `lib/clientes/relacionados.ts:282–313` calcula `fiscal = esFiscal || tipo==='FISCAL'` e rejeita mais de uma fiscal; `NEX-005-clientes.sql:227,232` também impõe `tipo=FISCAL ⇒ es_fiscal=true` e unicidade por cliente. **Cenário determinístico:** A fiscal, B comercial; escolher Fiscal para B deixa A tipo FISCAL com flag false → serviço ainda considera A fiscal e rejeita o PUT «Solo puede haber una dirección fiscal»; desmarcar fiscal em A sem mudar o tipo não retira a condição fiscal. Isto NÃO é falha da constraint; é divergência da UI em relação à regra. Corrigir apenas sincronização tipo+flag em todas as linhas ao escolher/desmarcar/alternar uma fiscal, preservando tipos não fiscais legítimos e a regra de um único domicílio fiscal; testes isolados com dois endereços, checkbox, mudança de tipo, edição de legado e gravação.

### CLI-D07 — MÉDIA NOVA, confirmado percurso numérico / efeito de arredondamento condicional — limite de crédito da lista

`NEX-005-clientes.sql:39–40` define limite `numeric(18,4)`; `app/api/clientes/route.ts:430–500` devolve `c.limite_credito`; `app/(private)/clientes/page.tsx:120–134` usa `Number(fila.limite_credito) || 0`, `:330–355` soma totais por moeda em `number`, `:53–59` formata `number` e `:455–470` ordena por subtração. A conversão não preserva de maneira exata 4 casas nem grandes decimais: por exemplo `numeric(18,4)` `99999999999999.9999` é convertido pelo JS para `100000000000000`. **A magnitude desse erro nos dados reais não foi medida.** Não alterar o valor gravado nem a regra do limite; corrigir apenas leitura/soma/ordenação e formato da listagem usando decimal texto/aritmética exata de código já existente, se autorizado. Testes com limite grande, fração de 4 casas, totais de múltiplos clientes e moedas separadas.

## 4. Observações não bloqueantes / regressões antigas preservadas

- **CLI-D04 / antiga CLI-A05:** GET lista todos os clientes e executa `evaluarAptitudEmpresa` sobre toda carteira; cliente ordena e pagina em memória (8/pg). É risco real de complexidade mas latência/volume da empresa não foi medida. Não prescrever reescrita geral ou paginação backend sem métrica.
- **CLI-D05:** diálogos nativos de confirmação na alta; não converter escolha de UI em bug de integridade e não trabalhar mobile.
- **CLI-A01…A04:** tratamento de refs inativas, 409 concorrência, falha de catálogo e proteção de saída continuam no código; nenhum desses itens foi reproduzido como nova regressão. Não reimplementar.
- **CLI-A06 / NEX-053:** helper de grants de documentos existe, explicitamente versionado e marcado não aplicado nos registros consultados; nesta rodada **não se verificou o PostgreSQL real**. Não assumir estado operacional nem instruir aplicação/reversão de migrations.
- **Documentos:** rota de upload bloqueia estado de criação dentro da transação, histórico EDITAR, remoção lógica, tenant da sessão; consulta estática não confirma operações reais no filesystem/DB. Não propor rollback por suposição.
- A edição pode reutilizar estado e refs assíncronas em navegação dinâmica; não classificar nova falha sem teste específico. Navegador desktop, prints e experiência de edição com perfis são de responsabilidade da homologação operacional.

## 5. Ordem recomendada para posterior implementação, apenas após autorização

1. **CLI-D06**: corrigir coerência de domicilio fiscal na edição (bug certo e sem gate de negócio).
2. **CLI-D03**: respostas geográficas obsoletas e identidade estável em alta/edição.
3. **CLI-D02**: estado de leitura / botões conforme CREAR/EDITAR com guardas API preservadas; coordenar com decisão RBAC CLI-D01.
4. **CLI-D07**: formatação e soma decimal exata na listagem.
5. **CLI-D01**: concluir política expressa de CREATE-only antes de abrir guard/catálogo/routing; não supor autorização.

**Sem autorização para Claude nesta R02.** ChatGPT audita, responsável decide, Claude implementa tarefa pontual e testa apenas o pertinente, ChatGPT reaudita. Não avançar Proveedores ou nova funcionalidade automaticamente. Nenhuma alteração de aplicação, SQL/PG, VM, Docker, CI, deploy ou homologação foi realizada.
