# AUD-NEXIT-CATALOGOS-COMERCIALES-DESKTOP-R02 — Revalidação independente das três abas

**Data:** 19/10/2026. **Sistema:** NEXIT / ERP DistribuNex, somente desktop. **Auditor:** ChatGPT. **Repositório:** `proceit-tech/distribuidora`. **Branch:** `feature/NEXIT-2026-001-banco-demo`. **HEAD de corte:** `c03f06759bdf222c9fe92e1de27791b3fd588f4a`; **snapshot anterior R01:** `adcd75dee93955644977a1fa095647e95d6b327f` (18/10/2026).

## 1. Veredito

**CC-D01 ALTA, CC-D02 ALTA e CC-D03 MÉDIA (condicional): CONFIRMADOS, ABERTOS e não corrigidos na branch atual.** Não houve alteração dos arquivos de UI, serviços, rotas principais, testes ou migration NEX-045 desde a auditoria de 18/10. As correções históricas **CC-A01…A07 / CC-R03-01** permanecem presentes. Nenhuma nova falha de segurança ou alteração de preço foi demonstrada nesta passagem dirigida. **Maestros → Catálogos comerciales: NÃO HOMOLOGADO, NÃO ENCERRADO**. Não foram alterados arquivos de aplicação, SQL, migrations, permissões nem ambiente real.

## 2. Fontes, versão e alcance

Fontes lidas: `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, trecho Catálogos comerciais do `PROGRESSO-NEXIT-V1.md`, ficha canônica `documentacao/v1/auditoria-por-menu/AUD-CATALOGOS-COMERCIALES-V1.md` (§§I–IX), relatório da R01 `documentacao/testes/AUD-NEXIT-CATALOGOS-COMERCIALES-DESKTOP-R01-2026-10-18.md`, arquivos UI, helpers e oito rotas (`GET/POST` dos três catálogos, `PUT` de edição/correção, `POST` de anulação), `lib/comercial/servidor.ts`, `carga.ts`, `formulario.ts`, `validacion.ts`, `version.ts`, `vinculos.ts`, `cambio-decimal.ts`, `lib/comercial/estabilizacion.casos.ts` e contrato SQL NEX-045. Os fluxos de Clientes/Listas vinculados foram rastreados conforme inspeções canônicas anteriores; não houve execução transacional.

**Prova por SHA de blob idêntico entre R01 e HEAD:** `app/(private)/catalogos-comerciales/{layout,page}.tsx`, `lib/comercial/{carga,servidor,formulario,validacion,version,vinculos,cambio-decimal,estabilizacion.casos}.ts`, os três `app/api/catalogos-comerciales/{tipos-cambio,canales-venta,zonas}/route.ts`, e migration `documentacao/banco/nexit/v1/migraciones/NEX-045-catalogos-comerciales-tipos-cambio.sql`. São **14 arquivos idênticos**. O script de reversão está versionado em `documentacao/banco/nexit/v1/scripts/reversion-NEX-045.sql`; não se utilizou caminho alternativo `scripts/reversion-NEX-045.sql` como prova de leitura.

**Cobertura:** três abas `Tipos de cambio`, `Canales de venta`, `Zonas comerciales`, ações Novo/Editar/Corregir/Inactivar/Activar/Anular, filtros, histórico, feedbacks e upload inexistente; GET/POST/PUT/anular, empresa e RBAC, `numeric(18,6)`, versões/histórico, índices/grants declarados e validações. A R02 é verificação **dirigida do estado dos achados**, não revisão integral executada de cada índice/tabela nem homologação completa das telas.

**Executado pelo ChatGPT:** 0 testes, 0 React/navegador, 0 HTTP real, 0 PG/VM/Docker, 0 SQL/migrations, 0 CI manual, 0 build/lint/tsc global ou pontual, 0 deploy. Não afirmar que NEX-045 ou migrations posteriores estão aplicadas na VM sem consultar o ledger.

## 3. Achados confirmados e critérios de aceite

### CC-D01 — ALTA — usuário CREAR-only não pode acessar o alta

**Evidências na versão atual:**

- `app/(private)/catalogos-comerciales/layout.tsx` executa `guardPage("LISTAS_PRECIO","VER")` para **todo** o menu; `lib/navigation/menu.ts` oferece a entrada de Catálogos comerciales somente a `LISTAS_PRECIO.VER`.
- `lib/comercial/servidor.ts` exige `preparar("VER")` nos GET de listagem e `preparar("CREAR")` para criar cotação manual, canal e zona. Um perfil somente CREAR poderia autorizar POST, mas não chegar à interface nem obter os catálogos necessários para o formulário.
- A UI `page.tsx` habilita Novo apenas com `permisos.crear` carregado pelo GET de listagem, que não é acessível a CREAR-only.

**Aceite mínimo:** separar caminhos e autorização de listado/histórico **VER** e criação **CREAR**, com navegação própria de alta para CREATE-only e confirmação de sucesso sem link proibido, mantendo POST CREAR e PUT EDITAR. Catálogos auxiliares para cadastrar tipo de cambio (moedas ativas excluindo PYG) devem vir de endpoint/finalidade de alta mínima e autorizada, com empresa derivada da sessão, sem abrir histórico, canais/zonas/listas/clientes/custos a CREATE-only. Para canal/zona basta entrada de código/nome quando não forem necessárias referências existentes. Definir desenho de UX compatível com desktop; não conceder VER implícito, nem alargar respostas de GET listagem por `modo` inseguro. Casos focais por perfis CREAR-only, VER-only, ambos, EDITAR-only e nenhum, rota/menu/pós-alta e isolamento por empresa.

### CC-D02 — ALTA — mutação tardia contamina contexto de outra aba/formulário

**Evidências atuais:**

- `page.tsx`, `guardar()`: após `await enviar(POST|PUT)` executa **sem verificar o contexto vigente** `setAviso`, `cerrar()` e `await cargar()` (callback capturado de `meta.ruta`, `tab`, `historial`). O estado `guardando` desabilita **apenas** o submit; guardas nos handlers de troca de aba, Novo, Editar/Corregir, Cancelar, filtros/histórico e outras mutações estão ausentes.
- `cambiarTab` permite trocar contexto após confirmação de descarte, que não cancela nem desfaz POST/PUT em andamento. GET da nova aba pode terminar **antes** do PUT anterior. O PUT antigo então dispara novo `cargar()` da aba original e recebe token mais novo da `crearCompuerta`, podendo sobrescrever filas/moedas/permissões sob aba diferente e fechar um rascunho novo.
- `cambiarEstado` e `anular` também realizam mutações assíncronas e GET/avisos posteriores sem exclusão conjunta; devem ser tratados no mesmo desenho da proteção de contexto, preservando confirmação, 409 e revisão legítima de dados.

**Aceite mínimo:** exclusão de mutações e ações incompatíveis por guardas em **handler e botão**, ou invalidação robusta dos efeitos atrasados com token de geração + contexto. Ações a coordenar: tabs, Novo, Cancelar, Editar/Corregir, Activar/Inactivar, Anular, mudança de histórico que troca GET e reabertura de outra ficha; impedir segundo POST/PUT simultâneo. Não simular cancelamento de requisição já enviada. Após erro 409, manter rascunho certo e exibir motivo; após sucesso, atualizar **somente** contexto legítimo; liberar exclusão em `finally`. Testes focais de promessas POST/PUT lentas com troca de aba/histórico/Nuevo/Cancelar/segundo submit e callbacks em ordem invertida; evitar mistura `filas/permisos/monedas`, perda de formulário ou avisos fora de contexto. Manter `crearCompuerta` para GET sem reiniciar sua lógica e `useProtegerCambios` para rascunhos.

### CC-D03 — MÉDIA (condicional) — GET de cotações aceita ausência de `monedas`

**Evidências atuais:**

- `lib/comercial/carga.ts`: para resposta 200, exige array principal (`tiposCambio`) e flags de permissão booleanas, mas valida moedas **apenas se houver chave**: `if(j.monedas!==undefined&&!Array.isArray(j.monedas))`. Um `{tiposCambio:[],permisos:{crear:true,editar:true}}` retorna `error:""`, `monedas:null` e criação habilitada.
- `page.tsx` mantém `monedas` antigas quando `r.monedas` é null (`if(r.monedas)setMonedas(...)`), ou inicialmente lista vazia, portanto selector pode ficar vazio ou incompatível com os permissões e a aba atual.
- Endpoint **atual** `listarCambios` em `lib/comercial/servidor.ts` sempre devolve `monedas:monedas.rows` quando GET normal conclui com sucesso. Não declarar ocorrência de produção por este cenário sem uma resposta malformada ou mudança de contrato.

**Aceite mínimo:** para `ruta=tipos-cambio` ou `clave=tiposCambio`, exigir **`monedas` presente e array**, podendo ser vazio quando realmente não há moedas disponíveis; exigir permissões coerentes; falha de shape deve neutralizar `filas/permisos/monedas` incompatíveis, preservar rascunho e bloquear Novo/Guardar/Corregir até recarregar, com erro em espanhol; não exigir `monedas` nos GET legítimos de Canales/Zonas. Testes puros de 200 sem moedas, 200 monedas=[], 200 completo, 200 monedas malformado, 403/500 e retry sem reutilização de options anteriores. Não alterar API normal do servidor, tabelas ou migrations.

## 4. Preservações históricas e observações

**Aceites anteriores presentes em código:** CC-A01 versões de Canal/Zona em microssegundos `SQL_VERSION_COMERCIAL` e `FOR UPDATE` + 409; CC-A02 `useProtegerCambios(sucio)` e confirmação de descarte; CC-A03 `crearCompuerta` descarta GET antigo (não soluciona novo GET pós-mutação atrasada); CC-A04 GET 401/403/500 ou catálogo principal sem shape gera falha/bloqueio; CC-A05 + CC-R03-01 moeda e comparação cambial exata por strings até `numeric(18,6)`, sem perda de um milionésimo em valores altos; CC-A06 script de reversão NEX-045 com guarda de dependências posteriores, **sem executá-lo**; CC-A07 contagem/aviso de clientes vinculados a canal/zona e preservação de histórico.

**Contratos a manter:** cotação manual PYG por uma unidade estrangeira, moeda ≠ PYG, motivo de correção opcional, versão anterior retida e nova versão criada na correção, anular logicamente sem DELETE; limites `numeric(18,6)`; canais/zonas `activo` com vínculos históricos, usuário/empresa da sessão, POST CREAR/PUT EDITAR/GET VER, confirmação de inativação que inclui Clientes/Listas/Reglas, grants/índices já versionados em NEX-004/005/008/018/045. Não criar conversão automática, reforma no motor de preços, políticas financeiras novas ou exclusão física.

**Observações NÃO classificadas como defeito novo:** «Reemplazada» em caso de cotação anterior anulada e alta posterior depende de contrato de procedência da anulação; paginação local 20 sem medição; confirmação nativa `window.confirm` já existe; permissão compartilhada `LISTAS_PRECIO` é decisão de negócio. Nenhuma alteração SQL/VM é autorizada por esta auditoria.

## 5. Governança, tarefas e próximo passo

- Três tarefas técnicas individuais a registrar no Linear como filhas de **PRO-71**, `Todo`: **CC-D01 ALTA, CC-D02 ALTA, CC-D03 MÉDIA condicional**.
- **PRO-71** permanece `In Review`, com bloqueios corretivos explícitos, NÃO HOMOLOGADO/não Done.
- **Não implementar automaticamente:** Claude Code só recebe comando de correção após autorização do responsável, testa os cenários pontuais (sem suites globais/CI manual/build/tsc/lint global/VM/PG/SQL/deploy), faz commit/push e para para **AUD-NEXIT-CATALOGOS-COMERCIALES-DESKTOP-R03** independente do ChatGPT. O responsável homologa no ambiente operacional.
- Não iniciar o menu seguinte de Inventario ou outro automaticamente.
