# AUD-NEXIT-PRODUCTOS-DESKTOP-R06 — Reauditoria independente PRO-163 / PRD-R05-01

**Data:** 19/10/2026. **Auditor:** ChatGPT. **Sistema:** NEXIT / ERP DistribuNex, apenas desktop. **Repositório:** `proceit-tech/distribuidora`. **Branch:** `feature/NEXIT-2026-001-banco-demo`. **SHA funcional auditado:** `ac514da30cd69ee733cc2fe13269a6a792de0054`, pai `1d7ea55c0e37e5467daad6471d643a8ae8c191e4`. No início da revisão, a branch apontava exatamente ao SHA auditado.

## Parecer executivo

**PRO-163 / PRD-R05-01: CONFORME EM AUDITORIA ESTÁTICA DIRIGIDA.** O código agora distingue arquivos novos nunca submetidos de documentos ou fotos novos que sofreram falha de envio durante a retomada. Quando o usuário remove um arquivo cujo envio falhou, o fluxo conserva `abandono=true`, e o sucesso dos demais envios não libera `pend=cierre` nem suprime a confirmação de abandono. Os caminhos de **PRO-160 e PRO-162 foram preservados**. Não identifiquei novo bloqueio corretivo demonstrável dentro do diff e dos fluxos específicos inspecionados.

**Etapa de correções técnicas conhecidas de Productos: sem bloqueio corretivo aberto neste recorte.** Permanecem: **(a)** a **decisão FUNCIONAL pendente C24 / PRO-161** sobre referências de componentes KIT e alternativos para usuário somente PRODUCTOS.CREAR, sem ampliação automática de catálogo; **(b)** homologação operacional humana (browser, HTTP, PostgreSQL e ambiente real). **Produtos NÃO HOMOLOGADO**. A auditoria dirigida R06 não transforma o inventário completo de telas, APIs e migrations em revisão exaustiva ou homologação integral de cada função do menu.

## 1. Fontes, versão e limite de execução

Foram lidos `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` pertinente, `documentacao/testes/AUD-NEXIT-PRODUCTOS-DESKTOP-R05-2026-10-19.md`, contexto canônico do menu e as tarefas Linear PRO-163/162/160/161/68; inspecionados metadata/diff dos commits e código final, incluindo:

- `app/(private)/productos/_components/retomar-alta.tsx` — estado real da UI `fallidos/abandono`, callbacks `quitar`, `subir`, `cerrar`, foto e documentos, decisão `estadoTrasEnvio`.
- `lib/productos/alta.ts` — `subirFoto`, `subirDocumentosPendientes`, `registrarEnvio`, `quitarArchivo`, `estadoTrasEnvio`, `cerrarRetomada`, estados da URL de retomada.
- `lib/productos/productos-r02.casos.ts` — oito verificações focais adicionadas ao bloco R05-01, que exercitam os helpers de produção com `fetch` simulado e algumas afirmações estruturais de UI.
- `app/(private)/productos/nuevo/page.tsx` — recupera ID e `pend` sem segundo POST; `lib/productos/cierre-carga.ts` e `app/api/productos/[id]/documentos/finalizar/route.ts` — resposta HTTP, idempotência e autorização por sessão/empresa; não foram alterados no commit.

Commit funcional: **4 arquivos**, 127 adições e 13 exclusões: `app/(private)/productos/_components/retomar-alta.tsx`, `lib/productos/alta.ts`, `lib/productos/productos-r02.casos.ts`, `PROGRESSO-NEXIT-V1.md`.

**Testes comunicados pelo Claude, não reproduzidos pelo ChatGPT:** `productos-r02.casos.ts` **61 verificações, 0 falhas** (8 novas) e ESLint/types apenas nos arquivos tocados OK. Foram lidas as novas verificações e a conexão estrutural de chamadas na UI. Não houve renderização/click real de React, transações PostgreSQL, requisições HTTP reais, execução no navegador, VM, Docker, SQL/migrations, build, linter/tsc global, CI manual ou deploy pelo auditor.

## 2. Matriz de aceite da PRO-163

| Critério | Evidência no código em SHA ac514da | Parecer |
|---|---|---|
| Falha de A original e C novo; remover C e confirmar A | `subir` registra em `fallos` os UIDs de todos os documentos cujo envio falhou, incluindo recém-adicionados; `registrarEnvio` armazena o UID de C; `quitar(C.uid)` usa `quitarArchivo(fallidos,C.uid)` e seta `abandono=true`; `estadoTrasEnvio(0,true,true)` não marca cierre | **CONFORME** |
| Foto nova F falha e é removida | `subir` adiciona `ID_FOTO` aos `fallos`; `quitar(ID_FOTO)` registra abandono mesmo quando `fotoInicial=null` | **CONFORME** |
| Documento/foto novo nunca enviado removido | Não faz parte de `fallidos`; `quitarArchivo` devolve `abandono=false`; não gera advertência falsa | **CONFORME** |
| Arquivo falhado confirmado em nova tentativa | `registrarEnvio(fallidos,confirmados,fallos)` remove todo UID confirmado; componente também remove da lista os documentos confirmados e zera a foto confirmada | **CONFORME** |
| Todos confirmados, nenhum abandono | `estadoTrasEnvio(0,true,false)` devolve `cierre` e confirma fechamento sem pergunta indevida | **CONFORME** |
| Abandono não resolvido | `estadoTrasEnvio` mantém `archivos`; `cerrarRetomada(estado==='archivos')` pede confirmação, cancelar não chama servidor, sucesso somente com cierre HTTP OK | **CONFORME** |
| Estado URL após reload e falha apenas no cierre | `nuevo/page.tsx` mantém `pend=archivos|cierre`; valor desconhecido/antigo é tratado conservadoramente; id de produto preservado, só cierre falho permite retry direto | **PRESERVADO** |
| Segurança server-side | Fluxo não altera GET, POST criação, autorização, isolamento por empresa, nem endpoint de fechamento; dados da URL não concedem acesso | **SEM REGRESSÃO ENCONTRADA NO DIFF** |

**Qualificação:** esta matriz é evidência de código e simulação focal. Não se infere funcionamento real de `window.confirm`, navegação, sessão, PostgreSQL ou persistência de todos os anexos. O identificador `pend` é dica de fluxo no cliente, não prova assinada de integridade do servidor; a autorização segue no backend.

## 3. Status canônico após R06

- **PRO-163 / PRD-R05-01:** entregue e aceito **estaticamente**; Linear `In Review`, **não Done** até homologação humana.
- **PRO-162 / PRD-R04-01 e PRO-160 / PRD-R03-01:** pendências de abandono original e de refresh deixaram de ter o bloqueio corretivo conhecido; permanecem `In Review` aguardando homologação.
- **PRO-155 / PRD-D02:** retomada/alta pós-POST agora sem bloqueio técnico conhecido no recorte revisado. PRO-154/156/157/158/159 mantêm aceite estático das rodadas anteriores. Todas permanecem `In Review`.
- **PRO-161 / PRD-GATE-C24:** `Todo`; depende de **decisão humana** da política C24, relacionada a PRO-137. CREATE-only recebe `catalogos.productos=[]` por segurança, portanto seletores de KIT/alternativos não oferecem componentes. **Não foi autorizado liberar catálogo nem implementar PRO-161.**
- **PRO-68 / Productos:** recorte corretivo técnico R02→R06 aceito estaticamente, **ainda NÃO HOMOLOGADO**, com C24 como decisão funcional pendente e validação operacional necessária. Não marcar Done. Se o responsável autorizar, é possível **iniciar auditoria estática do menu seguinte (Catálogos de productos)** sem supor que Productos foi homologado ou que C24 foi decidido.
- Não criar mais uma tarefa Claude na ausência de novo defeito comprovado; não mudar SQL, migrations, políticas fiscais ou outros menus.

**Conclusão:** **AUD-R06 favorável no escopo de PRO-163 e correções técnicas correlatas.** GitHub é a fonte de código/relatório, Linear rastreia aceite estático/homologação/decisões e o responsável humano valida no ambiente operacional.
