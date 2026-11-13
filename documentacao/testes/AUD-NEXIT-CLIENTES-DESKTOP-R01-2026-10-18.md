# AUD-NEXIT-CLIENTES-DESKTOP-R01 — Auditoria específica do menu Clientes

**Fecha:** 2026-10-18. **Corte Git:** `fe9e64123c70053b83f3d34b66cee779f184fe62`, branch `feature/NEXIT-2026-001-banco-demo`.
**Escopo:** somente ERP **desktop**. Menu `Maestros / Clientes`, `/clientes`, `/clientes/nuevo`, `/clientes/[id]`, subabas Contactos/Direcciones/Documentos, filtros, permissões, APIs, helpers e migrations associadas.
**Estado:** **DIAGNÓSTICO ESTÁTICO DOCUMENTADO, CORREÇÕES SOLICITADAS, NÃO HOMOLOGADO**. Nenhum código funcional ou SQL foi alterado; não foram executados testes, DB, navegador ou VM. Auditoria anterior de Dashboard permanece pendente e documentada em sua própria ficha.
**Fontes normativas:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, `documentacao/v1/auditoria-por-menu/AUD-CLIENTES-V1.md` (histórico completo de CLI-A01…A06 e R02/R03 de 12/10); política fiscal Clientes da V1 já versionada; migrations NEX-005, NEX-022/023/024, NEX-030/032/053; código e casos `lib/clientes`.

## 1. Rastreamento auditado

| Camada | Arquivos / comportamento | Resultado |
|---|---|---|
| Menu e guardas | `lib/navigation/menu.ts` ~403–422, `app/(private)/clientes/layout.tsx` (9 linhas), `lib/auth/permissions.ts` | Inconsistência entre VER e CREAR no acesso (CLI-D01) |
| Listagem | `app/(private)/clientes/page.tsx` (857 linhas), `app/api/clientes/route.ts` GET ~391–599, `lib/clientes/aptitud-cliente.ts` | Filtros e resumo no client; GET lista completa por empresa, sem paginação SQL (CLI-D04 risco de escala anterior) |
| Alta | `app/(private)/clientes/nuevo/page.tsx` (2813), GET catálogos e geografia, `POST /api/clientes` ~602–1236, `lib/clientes/comercial.ts` e validações fiscais | Validação/autorização POST CLIENTES.CREAR presente; UX de criação não respeita essa permissão e geografia tem race (CLI-D01/D02/D03) |
| Edição | `app/(private)/clientes/[id]/page.tsx` (2491), `app/(private)/clientes/[id]/_components/hijos.tsx` (301), `GET/PUT /api/clientes/[id]` (594), `lib/clientes/referencias-version.ts`, `relacionados.ts` | GET VER, PUT EDITAR e CAS de `actualizadoEn` presente; ação Editar disponível no frontend sem observar EDITAR (CLI-D02); geografia race (CLI-D03) |
| Documentos/versiones | 6 rotas de documentos `/api/clientes/[id]/documentos/**`, `lib/clientes/documentos-http.ts`, `permisos-documentos.ts`, `documentos.ts` e editor UI | Políticas no servidor diferenciadas: VER download, EDITAR histórico/substituição/remoção lógica, CREAR carga inicial apenas com criador e estado aberto; empresa deriva da sessão e linhas limitadas por empresa/cliente; execução não verificada |
| Persistência e integridade | SQL versionado NEX-005/022/023/024/030/032/053; refs, domicílios e documentos com tenant, UNIQUE e privilegios previstos | SQL estático consultado; estado real das migrations/grants no PostgreSQL não foi consultado e **não pode ser declarado conforme na VM** |
| Regresiones de antigos hallazgos | `lib/clientes/referencias-version.ts`, `GET/PUT clientes/[id]`, `useProtegerCambios`, `lib/clientes/estabilizacion.casos.ts` | CLI-A01/02/03/04 constam **corrigidos em código** desde R02/R03 históricas; não reabrir por presunção. CLI-A06 grants SQL NEX-053 foi implementado, sem confirmação operacional; CLI-A05 permanece risco de escala, não bug comprovado |

## 2. Novos achados com evidência

### CLI-D01 — ALTA — Perfil com somente CLIENTES.CREAR não consegue utilizar a tela de alta

**Evidência:** `app/(private)/clientes/layout.tsx:6` exige `guardPage("CLIENTES","VER")` **também** para a rota `/clientes/nuevo`; `app/api/clientes/route.ts:414–418` exige VER em toda GET, inclusive `modo=catalogos` e `catalogo=distritos/ciudades`; a tela de alta faz GET `/api/clientes?modo=catalogos` em `nuevo/page.tsx:356–394`. Entretanto, `POST /api/clientes` autoriza CLIENTES.CREAR em `route.ts:630–637`, e `permisos-documentos.ts` permite carga inicial por criador com apenas CREAR. As permissões são recursos/ações independentes no modelo. Resultado: ator autorizado pelo servidor a criar um cliente, mas sem VER, não consegue abrir o formulário e ler seus catálogos pela interface. O próprio menu Clientes só aparece para VER.

**Impacto:** quebra o uso legítimo de um perfil restrito «alta de clientes», caso configurado pela empresa. Não confundir com escalada: APIs seguem protegidas. **Correção esperada:** desenhar guardas por rota (listagem/detalhe VER; alta CREAR), GET de catálogos/geografia explicitamente para CREAR OU VER, sem expor lista/ficha de clientes a criador sem VER; definir destino/entrada segura ao formulário para perfil create-only. Não conceder VER automaticamente. Testar perfil CREAR-only, VER-only, EDITAR-only, admin, sem permissão; impedir cadastro via GET e consulta de terceiros.

### CLI-D02 — MEDIA — Interface oferece ações de criar/editar a perfis sem permissões correspondentes

**Evidência:** `app/(private)/clientes/page.tsx:513` e ~724 têm sempre `<Link href="/clientes/nuevo">Nuevo cliente</Link>` para qualquer usuário que possa entrar na listagem (VER); `app/(private)/clientes/[id]/page.tsx:2458–2484` mostra formulário editável e botão `Actualizar cliente` sem `CLIENTES.EDITAR` no frontend; API `PUT /api/clientes/[id]` ~216–220 exige EDITAR; `POST /api/clientes` exige CREAR.

**Impacto:** usuário somente de consulta consegue preencher ficha e tentar salvar, sendo rejeitado com 403 depois de todo o esforço; guia para cadastro que também não poderá concluir. **Correção esperada:** alinhar visibilidade/estado de botões e edição com permissões reais fornecidas pelo servidor (não confiar só na UI, preservar guardas API); a ficha pode permanecer somente leitura para VER sem EDITAR. Testes mínimos por perfis VER-only, CREAR-only, EDITAR e admin. Não refatorar fiscalidade.

### CLI-D03 — MEDIA — Respostas geográficas antigas podem substituir opções do departamento/distrito atual (alta e edição)

**Evidência:**
- `app/(private)/clientes/nuevo/page.tsx:514–553`: `seleccionarDepartamento(indice,codigo)` faz fetch assíncrono de distritos; conclusão escreve `setDistritosPorDireccion({ ...actual, [indice]: datos.datos })` sem conferir se o **departamento ainda é o mesmo**, sem abort/token; `seleccionarDistrito` ~557–600 faz o mesmo com cidades. Ao apagar uma direção, `direcciones.map` usa `key={indice}` (~1750) e os dados de opções são indexados pelo mesmo número; uma resposta tardia pode afetar **outra direção** que passou a ocupar aquele índice.
- `app/(private)/clientes/[id]/_components/hijos.tsx:159–207` repete a concorrência nas chamadas de precarga e edição: `elegirDepartamento/elegirDistrito` fazem fetch sem invalidar respostas antigas; a precarga com `cargados.current` conserva o código da primeira direção e pode chegar depois de mudança explícita.

**Reprodução lógica:** direção A → escolher departamento 1 e imediatamente departamento 2; fetch 2 retorna antes de fetch 1; lista final mostra distritos de 1 sob departamento 2. Usuário pode selecionar opção inconsistente. A API valida a geografia no servidor, então o risco confirmado é **UI incorreta/erro tardio**, não prova de persistir município inválido.

**Correção esperada:** invalidar/ignorar resposta por endereço identificado de forma estável + departamento/distrito atual, com cancelamento ou token por endereço; evitar estado por índice mutável quando filas podem ser removidas; preservar catálogos de país e validação server-side. Testes focalizados com promessas controladas e remoção/reordenação de endereço. Sem banco/VM.

## 3. Riscos observados, sem nova classificação bloqueante

### CLI-D04 — Observação de escala, já conhecida como CLI-A05

`GET /api/clientes?modo=lista` ~421–499 retorna todos os clientes da empresa, sem `LIMIT/OFFSET`. Em seguida `evaluarAptitudEmpresa` consulta novamente todas as linhas fiscais e direções, `clientes/page.tsx` filtra/ordena e pagina em memória em grupos pequenos. Cresce com a carteira; **não foi medida lentidão em produção** e não se prescreve paginação backend agora sem validar custo e contratos de total/aptidão.

### CLI-D05 — Observação de padrão visual

`clientes/nuevo/page.tsx` ainda contém `window.confirm` em decisões de alta/documentos e `window.alert` em arquivo já carregado. Há confirmação de ação; não alegar falta de confirmação nem corrigir regras por causa de um diálogo nativo. É melhoria estética de prioridade inferior às inconsistências de acesso e geografia. Não se exige layout de smartphone.

## 4. Contratos cuja integridade se conserva

- A versão `actualizadoEn` de GET é comparada dentro do PUT, após bloquear cliente (`FOR UPDATE`) e antes de escrever; conflito 409 — não declarar que corrida já está reproduzida no PostgreSQL.
- FKs comerciais previamente inativas podem permanecer sem nova validação, enquanto novas referências exigem mesma empresa e ativo.
- Falha de GET catálogos na edição lança erro em vez de apagar relações.
- `useProtegerCambios` tenta preservar edição não salva na saída; não reivindicar garantia universal de navegação programática sem teste.
- SIFEN (Innominado, RUC/DV, B2B/B2C/B2F, domicílio fiscal, formato de telefone, status de aptidão), transação de contatos/direções, documentos privados/versiones, isolamento por `empresa_id`, proibições de DELETE físico e preservação de histórico mantêm-se **como contratos sob inspeção estática**, não homologação end-to-end.
- Não executar testes globais, build, tsc global, lint global, Postgres real/VM nem alterar migrations aplicadas. Se Claude for autorizado a corrigir, fazer um menu de cada vez, testes locais estritamente direcionados, SHA e parada para auditoria.

## 5. Decisão

**Menu Clientes AUDITADO ESTATICAMENTE neste corte, com 1 ALTA + 2 MÉDIAS novos e 2 observações.** Não há novas implementações autorizadas por este documento. A revisão técnica por menu permite passar ao **próximo menu Proveedores** mediante continuidade do responsável, mantendo CLI-D01/D02/D03 pendentes na ficha. O aceite operacional de Clientes requer navegação real por perfis, endereço com requests concorrentes, upload/versionamento seguro, grants PostgreSQL, e validação humana desktop. **NÃO HOMOLOGADO**.
