# AUD-NEXIT-PRODUCTOS-DESKTOP-R04 — Reauditoria independente PRO-160 / PRD-R03-01

**Data:** 19/10/2026. **Auditor:** ChatGPT. **Sistema:** NEXIT / DistribuNex, desktop. **Repositório:** `proceit-tech/distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`. **SHA funcional auditado:** `32a9196827ceb43a3bb38839f531076d14bf731c`. **Pai:** `1d88b47adcdafbdb9e1e953fa181504d9970228c`. O HEAD da branch foi conferido nesse SHA no início da auditoria.

**PARECER:** **PRO-160 / PRD-R03-01: CORREÇÃO SUBSTANCIAL E CONFORME PARA O CENÁRIO ORIGINAL DE RELOAD, MAS ACEITE ESTÁTICO PARCIAL**, devido à nova regressão **PRD-R04-01 MÉDIA**, descarte silencioso de **parte** dos arquivos pendentes na **mesma sessão**. **Productos NÃO HOMOLOGADO E NÃO ENCERRADO.** C24 / PRO-161 permanece gate funcional humano independente. Não avançar outro menu automaticamente.

## 1. Evidências de origem e limites

Lidos `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progresso pertinente, `AUD-NEXIT-PRODUCTOS-DESKTOP-R03-2026-10-19.md`, diff do commit e código vigente das telas de alta/retomada, helpers de arquivo, contrato de encerramento e autorização. O commit alterou **6 arquivos, +120/-22 linhas**: `lib/productos/alta.ts`, `app/(private)/productos/nuevo/page.tsx`, `app/(private)/productos/_components/retomar-alta.tsx`, `lib/productos/productos-r02.casos.ts`, `lib/productos/documentos-archivos.casos.ts` e `PROGRESSO-NEXIT-V1.md`.

Revisados diretamente `urlRetomada`, `leerEstadoRetomada`, `cerrarRetomada`, `subirFoto`, `subirDocumentosPendientes`, componentes `NuevoProductoPage`/`RetomarAlta`, `validarPendientes` e `cerrarCargaInicial`, endpoint de cierre `app/api/productos/[id]/documentos/finalizar/route.ts`. Comparadas invariantes anteriores D01–D06 e contratos CREAR-only e isolamento já avaliados na AUD-R03. **Não houve execução de testes pelo ChatGPT**, montagem de React, HTTP real, navegador, banco PostgreSQL, VM, Docker, SQL/migration, build, lint/tsc global ou CI manual.

Claude reportou `productos-r02.casos.ts` **46 comprovações / 0 falhas** (10 novas), `documentos-archivos.casos.ts` 135/0, lint e tipos isolados OK. **Resultados relatados, não reproduzidos pelo auditor.** Casos novos exercitam helpers com `fetch` injetado, decisão pura de confirmação e asserts estruturais; não exercitam interação de remover parte da lista seguida de upload.

## 2. Matriz de aceite da entrega PRO-160

| Cenário | Evidência do código | Parecer |
|---|---|---|
| Retomar após upload falhado e refresh | `nuevo/page.tsx` guarda `?pend=archivos`; ao recarregar interpreta URL antiga/desconhecida como `archivos` com `exacta=false`; `retomar-alta.tsx` exige confirmação de abandono antes de cierre | **CONFORME ESTATICAMENTE** |
| Cancelar confirmação de abandono | `cerrarRetomada(true)` retorna cancelada sem chamar a função de cierre; mantém a retomada | **CONFORME ESTATICAMENTE** |
| Confirmar fechamento e servidor falhar | `cerrarRetomada` só retorna `cerrada:true` se `cerrarCargaInicial` responder OK; falha conserva tela/estado e mensagem | **CONFORME ESTATICAMENTE** |
| Falha somente da requisição de encerramento | Quando todos os arquivos foram confirmados e o cierre falha, salva `?pend=cierre` para retry direto, sem advertência de arquivo ausente | **CONFORME ESTATICAMENTE** |
| Resultado incerto de upload | Queda de rede mantém arquivo na lista e avisa para verificar se foi anexado antes de reenviar | **CONFORME ESTATICAMENTE**, sem reconciliação real com servidor |
| Sem duplicar o produto/anexo já confirmado | `RetomarAlta` usa ID persistido e endpoints de upload do mesmo ID; retira UIDs confirmados, não refaz POST do produto | **PRESERVADO**, sem integração HTTP |
| Parte dos anexos pendentes removida localmente | `Quitar` remove linha sem registrar abandono; `subir` passa a `cierre` se não houve falhas entre os **arquivos restantes**, apesar da remoção | **NÃO CONFORME — PRD-R04-01 MÉDIA** |

## 3. PRD-R04-01 — MÉDIA — remoção parcial de pendências permite fechamento sem confirmação

**Prova determinística em `app/(private)/productos/_components/retomar-alta.tsx`:**

1. **Entrada após o POST na mesma sessão:** `nuevo/page.tsx` cria `RetomarAlta` com `estadoInicial='archivos'`, `pendientesIniciales=[A,B]` (dois anexos falhados), e `pendientesExactas=true` (linhas que sobraram do POST).
2. **Remoção de um pendente:** o botão de cada linha `Quitar` executa somente `setPendientes(pendientes.filter((x) => x.uid !== p.uid))`, **sem confirmação e sem marcar que um pendente foi abandonado**. O botão `Quitar foto` similarmente faz `setFoto(null)` sem registrar abandono.
3. **Reenvio do restante:** `subir()` carrega somente a lista atual `pendientes`; por exemplo, A foi removido e B responde HTTP 201, então `fallas.length===0`.
4. **Falso estado sem pendência:** `if (fallas.length === 0 && pendientesExactas) marcarEstado('cierre')`. A prop `pendientesExactas` não muda quando o usuário remove A; portanto altera também a URL para `pend=cierre` apesar de A jamais ter sido anexado nem explicitamente descartado.
5. **Conclusão:** `faltan=false` e `cerrar()` chama `cerrarRetomada(estado === 'archivos', ...)`; com `estado='cierre'`, **não pede confirmação**, fecha a janela de arquivos e mostra produto registrado. O usuário nunca confirmou o descarte de A.
6. **Variação foto:** foto falhada removida pelo botão `Quitar foto` + documento B enviado com sucesso → mesmo `fallas.length=0` e `pendientesExactas=true`, sem confirmação da foto abandonada.

**Impacto:** anexos/foto originalmente falhados podem ficar definitivamente ausentes após conclusão sem decisão expressa; usuário somente CREAR perde possibilidade de retomar upload depois do cierre. **Não é bypass de autorização de outros produtos/empresas nem prova de perda de arquivo já confirmado.** Prioridade MÉDIA.

**Correção mínima esperada (precisa de autorização separada do responsável):** conservar, durante a sessão de retomada, informação de que **qualquer** pendente original foi abandonado/removido, ou exigir confirmação específica ao clicar `Quitar`; só marcar `pend=cierre` automaticamente quando *todos* os pendentes originais tiverem sido efetivamente confirmados pelo servidor, sem abandono não confirmado. Quem confirma o abandono deve receber decisão explícita; cancelamento preserva anexos; erro de upload preserva retry; remoção de foto segue mesma regra. Manter comportamento de `pend=archivos` após reload sem indicador conhecido e não forçar falsa confirmação no caso `pend=cierre` em que realmente só falhou o fechamento. Não alterar backend, autorização, SQL nem outras correções.

**Testes focais necessários:** duas falhas A/B → Quitar A, reupload B com 201, permanecer `archivos` ou confirmar A; cenário foto removida + documento enviado; cancelamento da remoção/abandono; dois reenviados confirmados → `cierre` sem aviso; refresh após remoção não faz presumir ausência de pendentes; todos os arquivos já confirmados + erro só de cierre mantém retry sem aviso; nenhum POST duplicado. Poucas verificações novas em `productos-r02.casos.ts`; não rerodar suites históricas longas, nem testes globais/VM/PG.

**Observação não bloqueante quanto à URL:** o indicador `pend=cierre` é dado de navegação editável pelo usuário, não atestado do servidor. Não concede autorização de backend; deve ser tratado só como *dica de fluxo*, nunca prova de integridade. A correção de remoção parcial deve impedir sua geração indevida pelo fluxo normal. Não pedir mecanismo de assinatura/novo endpoint sem decisão, pois isso extrapola o escopo autorizado.

## 4. Outros achados e decisão C24

PRD-D01, D03, D04, D05, D06 continuam estaticamente aceitos na R03 e não foram reabertos pelo diff. A recuperação PRD-D02 / PRO-155 e PRO-160 permanece com ressalva limitada à PRD-R04-01. A política C24 / PRO-161 para seletores KIT/alternativos do usuário CREATE-only é decisão humana ainda aberta; **não liberar `catalogos.productos` para CREAR-only** nem alterar escopo de depósitos sem decisão.

## 5. Situação e continuidade

- **PRO-160: In Review — parcialmente atendida e não homologada.**
- **PRD-R04-01: nova tarefa técnica MÉDIA / Todo**, somente após autorização Claude implementa e para para AUD-R05 ChatGPT.
- **PRO-161: Todo, aguarda definição C24/PRO-137**, sem autorização de implementação.
- **Produtos: NÃO ENCERRADO, NÃO HOMOLOGADO**, mesmo que 5/6 correções originais tenham aceite estático. Sem avançar Catálogos de Productos automaticamente. Auditor não modificou código funcional.
