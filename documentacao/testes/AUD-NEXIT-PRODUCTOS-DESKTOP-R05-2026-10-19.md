# AUD-NEXIT-PRODUCTOS-DESKTOP-R05 — Reauditoria independente PRO-162 / PRD-R04-01

**Data:** 19/10/2026. **Auditor:** ChatGPT. **Sistema:** NEXIT / ERP DistribuNex (desktop). **Repositório:** `proceit-tech/distribuidora`; branch `feature/NEXIT-2026-001-banco-demo`. **Commit funcional auditado:** `8b507d72e31ae8be79503460129e9517fa04870c`, pai `36d73f93d82d056bfab895aaa1495587bf583b72`. HEAD da branch confirmado no commit auditado ao iniciar.

**PARECER: PRO-162 / PRD-R04-01 CONFORME ESTATICAMENTE PARA PENDÊNCIAS ORIGINAIS, MAS NÃO APROVADO PARA ENCERRAMENTO** por **PRD-R05-01 MÉDIA**, variante concreta de arquivo **novo** cujo upload falha **dentro da própria retomada** e é removido sem registro de abandono. **Productos NÃO HOMOLOGADO / NÃO ENCERRADO**. PRO-161 / C24 permanece gate funcional independente, sem solução inventada.

## 1. Material e limites da auditoria

- Consultados `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, relatório `documentacao/testes/AUD-NEXIT-PRODUCTOS-DESKTOP-R04-2026-10-19.md`, ficha `documentacao/v1/auditoria-por-menu/AUD-PRODUCTOS-V1.md`, metadados/diff do commit e código real dos quatro arquivos alterados.
- Commit mudou somente **4 arquivos; +67/−7 linhas**: `app/(private)/productos/_components/retomar-alta.tsx`, `lib/productos/alta.ts`, `lib/productos/productos-r02.casos.ts`, `PROGRESSO-NEXIT-V1.md`. Não houve mudança em APIs, autorização, SQL/migrations, foto/documentos no backend ou outros menus neste SHA.
- Conferidos especificamente `RetomarAlta`, `subir`, `Quitar` documentos/foto, `esAbandono`, `estadoTrasEnvio`, `cerrarRetomada`, `subirDocumentosPendientes` e `subirFoto`, além das verificações focais novas. Sem execução de testes por ChatGPT, sem React/navegador, requisições HTTP reais, PostgreSQL, VM, Docker, migrations, CI manual ou build/lint/tsc global.
- **Claude declarou:** `productos-r02` **53 verificações / 0 falhas** (+7), ESLint e checagem de tipos pontuais OK; não verificadas por execução do auditor. Os testes usam helpers reais com `fetch` injetado e inspeção estrutural, mas **não simulam um arquivo novo adicionado na retomada, que falha ao enviar e depois é removido**.

## 2. Matriz de aceite e regressões

| Caso | Inspeção estática | Parecer |
|---|---|---|
| A/B já falhados na criação; `pendientesIniciales=[A,B]` e `pendientesExactas=true`; remove A e B confirma 201 | `originales = pendientesIniciales.map(uid)`; `Quitar A` chama `esAbandono(uid, originales)` e `setAbandono(true)`; `estadoTrasEnvio(0,true,true)` não devolve `cierre` | **CONFORME** |
| Foto falhou na criação e foi removida na retomada | `fotoInicial!==null` marca `abandono=true` | **CONFORME** |
| Cancelar confirmação final | `cerrarRetomada(true)` não chama POST de cierre | **CONFORME** |
| Todos os arquivos originais enviados e nenhum removido | `estadoTrasEnvio(0,true,false)` permite `cierre` | **CONFORME** |
| Reload `pend=archivos` ou somente `pend=cierre`, sem POST duplicado | Mecanismo PRO-160 mantido neste diff | **PRESERVADO** |
| Documento novo adicionado durante a retomada, envio falha, depois removido, enquanto outro pendente original é enviado com sucesso | `esAbandono(uidNovo,originales)` retorna **false** pois `originales` é fixo; `estadoTrasEnvio(0,true,false)` marca `cierre` | **NÃO CONFORME — PRD-R05-01** |
| Foto nova escolhida na retomada, upload falha e é removida, enquanto outro pendente original é enviado com sucesso | `fotoInicial===null`, logo botão `Quitar foto` não chama `setAbandono(true)`; retry de outro pendente sem falhas muda para `cierre` | **NÃO CONFORME — PRD-R05-01** |

## 3. PRD-R05-01 — MÉDIA — arquivos novos com envio falhado não contam como abandono

**Prova de fluxo no código atual:**
1. Na mesma sessão, `RetomarAlta` inicia com documento **A** que falhou no POST inicial, `pendientesExactas=true`, `estado='archivos'`, `originales=[A.uid]`, `abandono=false`.
2. O usuário acrescenta documento **C** pela ação «+ Agregar documento», preenche dados e tenta `subir()` com `pendientes=[A,C]`. O serviço retorna falha HTTP para ambos. `setPendientes` conserva os dois; `fallas.length>0`, logo estado permanece `archivos`. **C agora é um arquivo cujo envio falhou.**
3. O usuário remove C pelo botão «Quitar». O código verifica `esAbandono(C.uid,[A.uid])` → **false**, então não registra seu descarte. `pendientes=[A]` e `abandono=false`.
4. O operador reenvia A, que recebe confirmação HTTP OK; `fallas.length===0`. `estadoTrasEnvio(0,true,false)` → **'cierre'**. O botão «Cerrar carga inicial» usa `cerrarRetomada(false, ...)`, sem confirmação. C nunca foi enviado nem explicitamente abandonado.
5. **Variação foto:** `fotoInicial=null`, usuário escolhe foto **F** na retomada e seu upload falha; «Quitar foto» remove F sem `setAbandono(true)` (guardado apenas por `fotoInicial!==null`). A é confirmado posteriormente, levando a `cierre` sem perguntar pelo abandono de F.
6. `productos-r02.casos.ts` afirma que `esAbandono('u-nuevo', originalesR04)===false`, o que faz sentido para arquivo **novo nunca enviado**, mas não diferencia o mesmo arquivo **depois de um envio falhar**.

**Impacto:** abandono silencioso de arquivo cuja tentativa de upload falhou durante a retomada. Trata-se da mesma invariante de integridade da PRO-162, em um conjunto maior de arquivos; não é acesso a outra empresa, vazamento de dados ou falha de autorização do backend.

**Correção mínima esperada (somente mediante nova autorização do responsável):**
- Diferenciar **novo arquivo ainda não enviado** (retirá-lo não exige confirmação) de **arquivo novo cujo envio foi tentado e falhou** (retirá-lo deve registrar abandono ou pedir confirmação). Aplica-se igualmente à foto escolhida durante a retomada.
- Fazer o estado derivar de todas as pendências **falhadas e não resolvidas da sessão**, não apenas de `pendientesIniciales`. Pode manter o rastreio de UIDs/foto com estado pequeno e local, sem dados de arquivo persistentes; preservar os IDs existentes e não duplicar upload.
- `cierre` direto somente quando todos os arquivos cujo upload falhou foram confirmados pelo servidor (ou o abandono tenha sido conscientemente confirmado). Caso contrário, manter `archivos` e pedir confirmação de cierre; cancelamento não chama servidor.
- Preservar `pend=archivos|cierre` após refresh, comportamento conservador de URL antiga, retry quando **só** cierre falhou, AUTORIZAÇÃO server-side, identidades de criador/empresa, sem SQL ou modificações de APIs.
- Testes **curtos e concretos**: original A + novo C; A/C falham, remove C, retry A OK → não marcar `cierre`; foto F nova falha, remove F, retry A OK → não marcar `cierre`; novo arquivo nunca tentado removido → não registrar falso abandono; A/C ambos confirmados → `cierre` direto; cancelar abandono; refresh/retry de cierre intactos. Evitar asserts apenas estruturais, testar helper ligado ao estado real.
- Não alterar PRO-161/C24, KIT/alternativos, catálogos, SIFEN, preços, estoque, migrações ou outros módulos. Nada de suíte geral/build/tsc/lint global/VM/PG/CI manual.

## 4. Decisão e continuidade

- **PRO-162 — correção implementada, ACEITE ESTÁTICO PARCIAL / In Review**, ainda não Done.
- **PRD-R05-01 — MÉDIA / Todo**: registrar tarefa técnica separada (subtarefa de PRO-68) e relacionar à PRO-162, mas não autorizar implementação automaticamente.
- **PRO-160 / PRO-155 — In Review**, sem prova de homologação; caminhos de reload permanecem tecnicamente conformes nos casos revisados.
- **PRO-154/156/157/158/159 — In Review, aceite estático da R03 preservado**.
- **PRO-161 / GATE C24 — Todo**, decisão funcional separada sobre visibilidade de produtos para KIT/alternativos CREAR-only. Não conceder acesso sem decisão humana.
- **Produtos NÃO HOMOLOGADO / NÃO ENCERRADO**; não iniciar Catálogos de Productos ou outro menu automaticamente. Após correção autorizada, reauditoria independente R06.
