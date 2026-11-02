# Nexit V1 — Avaliação visual da tela de login

**Rota:** `/login` · **Ambiente:** `https://nexit.proceit.net/login`
**Origem:** captura enviada pelo responsável na homologação visual, em 10/10/2026. **Situação:** REPROVADA VISUALMENTE; correções pendentes e **não autorizadas para implementação por este registro isolado**.
**Referência do print:** `V1-LOGIN-DESKTOP-2026-10-10-01.png`. Captura original recebida em conversa; o arquivo de imagem **ainda não foi incorporado ao GitHub**. Solicitar o arquivo ao responsável para colocar em `capturas/` somente após confirmar ausência de informação sensível e acesso adequado. Não inventar que a imagem está no repositório.

## Observações diretamente verificáveis na captura

| ID | Prioridade | Evidência observada | Ajuste esperado | Critério de aceite |
|---|---|---|---|---|
| VIS-LOGIN-01 | Alta | Marca principal mostra **DistribuNex**, embora o responsável tenha definido o nome do sistema **Nexit** | Padronizar **Nexit** nos elementos visíveis do login; conferir título da aba e metadados associados, sem renomear infraestrutura, URLs, banco, rotas, cookies ou variáveis sem decisão específica | Login apresenta **Nexit** consistentemente; marcas antigas não aparecem nesta tela; autenticação permanece funcional |
| VIS-LOGIN-02 | Alta | Campo **Código de empresa** usa o exemplo `proceit o casa_mingo` | Remover exemplos internos e nomes concretos do placeholder, substituindo por `Ingrese el código de empresa` ou equivalente claro. Código é identificador atribuído à empresa, **não presumir que seja o RUC nem forçar valor numérico** | Campo apresenta apenas orientação neutra; aceita o mesmo identificador configurado no backend e autentica todas as empresas legitimamente cadastradas |
| VIS-LOGIN-03 | Alta | Inputs de Código, Usuario e Contraseña têm apresentações diferentes (fundo, recortes e alinhamentos) | Padronizar borda, fundo, altura, radius, padding, ícones, texto e placeholder; estilos de foco, hover, erro, preenchimento automático e desabilitado | Três campos coerentes e legíveis, inclusive com preenchimento automático e navegação por teclado |
| VIS-LOGIN-04 | Média-alta | Ação `Mostrar` da senha ocupa segmento com contraste e alinhamento distintos | Integrar visualmente a ação ao campo, mantendo operação de mostrar/ocultar, tipo correto do input e acessibilidade | Alinhamento consistente, função de alternar senha operante, foco visível e sem deslocamento |
| VIS-LOGIN-05 | Alta | O responsável considera os campos visualmente insatisfatórios | Refinar espaçamento vertical/horizontal, contraste, tipografia e hierarquia visual com padrão V1 (auxiliar >=13px, labels >=14px, entrada >=15px) | Login legível a 100% em desktop/notebook e mobile, sem cortes, sobreposição ou perda de funcionalidade |
| VIS-LOGIN-06 | Média | Painel de apresentação menciona `ventas, inventario, entregas, finanzas y facturación electrónica`, que não devem ser apresentados como funcionalidades V1 já operantes sem comprovação | Ajustar mensagem institucional ao escopo efetivamente disponível, sem prometer módulos futuros. Preservar identidade PROCEIT | Texto institucional verdadeiro, consistente com status V1; sem simular Facturación ou outros módulos futuros |
| VIS-LOGIN-07 | Alta | Não há comprovação de homologação funcional a partir de um print | Testar login válido/inválido, empresa desconhecida, estado de erro, sessão, navegação via Enter, autofill e responsividade após ajustes | Build/testes pertinentes passam e navegador confirma autenticação e visual conforme padrões, sem mudança indevida de API, banco e credenciais |

## Restrições técnicas

- Corrigir **somente** login, textos e estilos vinculados à tela, exceto dependências compartilhadas estritamente necessárias e justificadas.
- **Não** alterar regra de identificação/autenticação da empresa, não converter códigos para RUC ou números por suposição.
- Não alterar banco, migrations, ambientes ou configurações Docker para uma tarefa visual.
- Não colocar dados reais de login, senha, token ou cookie no GitHub.
- Registrar captura antes/depois e resultado da homologação em `documentacao/v1/homologacao-visual/`.
- Respeitar `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md` e o fluxo uma tarefa/commit/revisão/deploy humano.
- Resposta do Claude deve ser breve: resultado, testes, bloqueios e SHA; sem despejar arquivos, código ou diffs no chat.

## Critério de conclusão

**PENDENTE** até implementação autorizada, revisão do commit pelo ChatGPT, deploy controlado pelo responsável e aceitação visual + funcional no navegador. O print atual é evidência do estado anterior à correção.

## Implementação (2026-10-10) — aguardando revisão e homologação
Itens VIS-LOGIN-01 a 06 implementados em código (marca Nexit e título da aba; placeholder neutro "Ingrese el código de empresa", sem alterar a regra de identificação nem a autenticação; três campos com a mesma caixa e ícone; "Mostrar/Ocultar" integrado ao campo, com `aria-pressed`/`aria-label`; texto institucional restrito ao escopo V1; tipografia 15/16/≥13). Verificações estáticas: `tsc` e `eslint` sem erros. **VIS-LOGIN-07 (teste funcional e visual no navegador) pendente**, a cargo da homologação na VM. O sidebar interno ainda exibe "DistribuNex" (fora do escopo desta tela).
