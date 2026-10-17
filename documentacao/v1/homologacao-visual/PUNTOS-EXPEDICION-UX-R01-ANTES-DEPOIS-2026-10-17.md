# Puntos de expedición — UX-R01-01 (alta única punto + tipo): evidências ANTES / DEPOIS

**Estado: NÃO HOMOLOGADA.** Nenhuma imagem está versionada no Git (as capturas do responsável foram enviadas na conversa e **não** estão no repositório; o ambiente de desenvolvimento da IA não tem navegador contra a aplicação com banco). As referências abaixo são textuais e ficam **pendentes** de captura e aceite humano.

| Item | ANTES (reprovado) | DEPOIS (implementado, aguarda aceite) |
|---|---|---|
| Captura | `image(20261017-140402).png` — **não está no Git** (pendente) | **Pendente**: captura do responsável após o deploy autorizado |
| Commit / versão | `e98641b…` / `ef5ae54…` (NEX-063) | commit desta entrega (ver `PROGRESSO-NEXIT-V1.md`, seção UX-R01-01) |
| Ambiente | navegador do responsável | a registrar pelo responsável (desktop 1440, tablet 768, móvil 375) |
| Fluxo | «Nuevo punto» pedia sucursal, código e nome **sem tipo**, criava o ponto e abria **um segundo diálogo**; para NCE em 001-001 já existente, dava «Ya existe un punto con ese código» | «Nuevo punto» abre **um único formulário**: sucursal, código, nome, **tipo (obrigatório)**, série, último número, próximo referencial, **uma confirmação** e ativação |
| Ponto existente | erro de duplicidade do ponto | reutiliza o ponto (nome somente leitura, tipos já configurados visíveis) e adiciona só o tipo novo |
| Tipo já configurado | — | erro junto ao campo: duplicidade do **TIPO** (série e último número atuais), sem enviar; acesso a «Configurar» na fila |
| Operação incompleta | podia ficar ponto sem tipo | ponto + tipo na **mesma transação SQL** (`fe_punto_alta_tipo`, NEX-064); se algo falha, não fica ponto vazio |
| Ativação | ponto e tipo em etapas confusas | uma só decisão: «Dejar disponible para emitir ahora» (ativa o tipo e, se necessário, o ponto; aviso do efeito sobre os outros tipos) |

Avaliação visual, defeitos e status: **pendentes** (responsável). Nenhum agente de IA marca esta tela como APROVADA.

## UX-R04-01 — ativação por tipo (NEX-065)
- **ANTES (reprovado):** cada linha ofereceria «Activar/Desactivar punto» (estado compartilhado) além do tipo; screenshot `image(20261017-160313).png` do responsável, **NÃO versionado no Git** (referência pendente).
- **DEPOIS (código):** apenas «Activar/Desactivar FE|NCE» por linha; status «Activo · disponible para emitir» / «Inactivo» dependem só do tipo; NRE/NDE/AFE «Configurado · emisión no disponible». Captura nova: **pendente** (não existe imagem no Git); aceite humano: **pendente**. Status: **não aprovado**.
