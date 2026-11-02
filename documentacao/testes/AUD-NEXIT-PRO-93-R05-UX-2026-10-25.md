# Auditoria estática PRO-93-R05 — resumo FE, pesquisa avançada, KuDE

**Data:** 25/10/2026  
**Repositório/branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`  
**Commits funcionais examinados:** `4cc5f0c02dd5f604c9bf614ca07aef114aebf3fb` (resumo/busca) e `dada93410d3bc1b6efca40fdfb93765ec5076dec` (KuDE), este último é HEAD funcional da entrega.  
**Parecer:** **CONFORME NA AUDITORIA ESTÁTICA DOS 3 AJUSTES VISUAIS, NÃO HOMOLOGADO NO NAVEGADOR.** Não abrir outra rodada de Claude sem defeito real mostrado no ambiente.

## Resumo de la factura

- `app/(private)/facturas/nueva/page.module.css`: novos estilos finais `.resumenCuerpo {align-content:start;grid-auto-rows:auto}`, `.resumenGrupos {align-items:start}`, cartões com menos padding, `.resumenTabla {max-height:none;overflow-x:auto;overflow-y:visible}`, th com `position:static` e layout de 1 coluna para grupos em viewport abaixo de 900px. A remoção de `max-height:260px` e de altura esticada remove a causa comprovada da tabela quase invisível. O container `.resumenCuerpo` continua com `overflow-y:auto`, rodapé `resumenAcciones` externo preservado. **Nota CSS:** quando `overflow-x:auto`, o valor declarado `overflow-y:visible` computa como `auto` no CSS; como não há restrição de altura da tabela, normalmente não gera scrollbar vertical próprio. Comprovar visualmente, sem prometer ausência em qualquer viewport extrema.
- `page.tsx` conserva todas as linhas fiscais, quantidades, preços, IVA, totais, revisão e ações. `resumen.infoAdicional.length>160` usa `details/summary` para exibir o texto completo sob demanda; nenhum `dInfAdic` é editado no payload.
- **Aceite visual ainda pendente**: conferir 0/1/20/100 itens, margens, área visível de produtos, scroll único do conteúdo e rodapé sem sobreposição em 1366×768, 1440×900, 1698×864 e celular. Não tratar scroll horizontal condicional da tabela como erro automático.

## Búsqueda avanzada

- `page.tsx::BuscadorRapido` agora recebe `accion?:React.ReactNode` e inclui `buscadorControl` com `buscadorCampo` contendo input e lista; mensagem `b.aviso` foi movida FORA da linha de campo+botão. Componente preserva pesquisa Cliente/Produto/Vendedor, entrada de scanner/Enter, `onBlur` e autocomplete.
- No CSS final `.buscarFila {display:block}`, `.buscadorControl {display:flex;align-items:flex-end}`, `.buscadorCampo {position:relative;flex:1 1 320px}`, ação com altura 40px e, abaixo de 640px, largura 100%; dropdown `.opciones {position:absolute}` ancora no `.buscadorCampo`.
- Causa original de deslocamento removida estaticamente. Ainda não comprovado visualmente foco e layout em zoom/celular. Não solicitar reescrita sem regressão reproduzida.

## KuDE

- `app/(private)/documentos/kude-modal.tsx` cria `visor=estado.fase==='LISTO'`. Visor PDF conserva modal `min(1100px,100%)` e altura `min(92vh,100%)`; ERROR/CARGANDO usam `min(520px,100%)` e altura natural com área de conteúdo de texto. Botões Descargar/Imprimir só aparecem em LISTO, e Reintentar/Cerrar continuam no erro. Sem mudança no endpoint, controlador, regra de disponibilidade por estado fiscal PRO-194, Blob/iframe, redirecionamento ou credenciais.
- O gate visual de foco/escape e texto longo permanece dependente de navegador humano; não inventar erro sem evidência.

## Escopo e gate operacional

- O responsável **CONFIRMOU o incidente HTTP400 anterior como resolvido por ajuste no FORNECEDOR**. Não reabrir cadastro de empresa/token/payload, nem incluir gateway nas ordens de UX.
- O diff destes dois commits modifica somente `page.tsx`, `page.module.css` e `kude-modal.tsx`. Não há alteração em JSON fiscal, SQL, migrations, perfil Vendedor, estoque, cálculo, API KuDE ou recebimento.
- Nenhuma prova de browser, screenshot posterior, build, testes, lint, typecheck, CI, SQL, migrations, VM, API externa, SIFEN ou deploy nesta auditoria. NEX-072/073/074 continuam sob gate próprio e não foram aplicadas nesta ordem.
- **Status proposto:** PRO-93/128/194 continuam `In Review` até aceite visual em ambiente; PRO-115 mantém gate de validação visual. **R05 concluída estaticamente; não criar R06 por suposição.**
