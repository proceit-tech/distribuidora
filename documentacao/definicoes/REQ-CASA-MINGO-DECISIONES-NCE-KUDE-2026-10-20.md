# Decisões CASA MINGO — Nota de Crédito / item DESCUENTO / KuDE NCE
**Data:** 20/10/2026. **Origem:** confirmação expressa do responsável após mensagens e áudio de José Franco. **Estado:** escopo aprovado; implementação NÃO realizada. Desenvolvimento por Claude, auditoria ChatGPT, VM/homologação pelo responsável.

## 1. FORA DE ESCOPO — proibição de tarefas nesta rodada
- NÃO alterar ambiente de teste SIFEN/gateway, trocar empresa/RUC, criar ambiente separado ou corrigir os dados exibidos do prestador nesse ambiente.
- NÃO alterar logotipo no teste: o cliente verá seu logotipo no ambiente de produção; não abrir tarefa para forçar logo da CASA MINGO no gateway de terceiros.
- NÃO alterar layout/modelo de KuDE de FE: não mexer em nome DISTRIBUIDORA DEL PARAGUAY, coluna Cod. Barra, largura de Código, limite de uma folha, 23 itens ou quaisquer outros pedidos de apresentação do KuDE. Não reescrever a integração FE que já existe.
- O único trabalho relacionado a KuDE autorizado nesta rodada é fazer o **KuDE da NCE** ficar acessível, usando o visor/API existentes e sem regressão FE.
- Itens não relacionados ao KuDE (foco da quantidade, desconto na FE por linha e geral, endereços e seleção total das linhas na NCE) continuam no backlog original, não fazem parte desta alteração isolada.

## 2. ITEM DESCUENTO — DECISÃO APROVADA
- Criar item identificável **DESCUENTO** para o fluxo de **NCE por motivo Descuento**. É um item conceitualmente não estocável: quantidade fiscal/comercial **1**, valor unitário igual ao **monto a acreditar** informado pelo operador (na moeda da FE), e **sem lançamento ou alteração de estoque**.
- A UI deve permitir informar apenas o valor desejado para a NCE; não obrigar usuário a marcar um produto original e editar o valor por linha quando escolhe este fluxo.
- O item deve exibir o nome DESCUENTO claramente na revisão da NCE e no detalhe fiscal quando o contrato permitir. Distinguir o **item de interface/catálogo** do **detalhe fiscal da NCE**: nunca inserir uma linha fiscal arbitrária sem vínculo seguro com a FE original.
- Validar que o valor do desconto > 0, respeite o saldo acreditável da factura, o motivo 3, os demais bloqueios de NCE pendente e a regra vigente de motivo fixado.
- Conservar a FE original, CDC de referência, receptor, moeda/câmbio original, controle de saldo, idempotência e numeração. No fluxo de desconto/bonificação, nenhuma movimentação de estoque.
- A decisão atual não inclui criar um segundo SKU chamado BONIFICACION. **Bonificación (motivo 4)** continua suportada como motivo; desenhar sua operacionalização por valor usando o mesmo tratamento contábil/fiscal seguro, sem inventar cadastro extra.
- **Limitação concreta do código atual:** `lib/facturacion/nce.ts`/SQL vinculam `linea` a um ordinal da FE original; `lib/facturacion/payload-nce.ts` constrói `Detalles` a partir dos itens originais, herdando código, unidade e IVA. Para aceitar o item DESCUENTO, adaptar a validação, o mapeamento da NCE ao documento referenciado e as regras de tributos/saldos. A simples criação de uma ficha `productos` DESCUENTO não habilita a NCE hoje.
- Se a FE original tiver itens com tratamentos de IVA diferentes, a aplicação deve preservar os tratamentos e distribuir internamente o valor por saldos/linhas fiscais compatíveis; mostrar ao usuário uma operação simples. Nunca colocar tudo automaticamente em IVA10 nem emitir uma única linha incompatível; detalhamento fiscal depende de aceite/homologação contra o gateway.

## 3. KUDE NCE — ÚNICA EXCEÇÃO À PROIBIÇÃO KUDE
- O problema não é apenas o botão FE; foi **confirmado no código** um bloqueio em vários pontos:
  1. `lib/facturacion/kude-visor.ts`: `kudeDisponible` é `tipo === "FE"`.
  2. `lib/facturacion/shared.ts`: `obtenerKude` rejeita todo `doc.tipo !== "FE"`, e `nombreArchivoKude` força `KuDE-FE-`.
  3. `lib/facturacion/gateway.ts`: body de `POST /api/kude` envia `tipoDoc: "FE"` fixo.
  4. `app/(private)/documentos/page.tsx`: título `KuDE · Factura`, arquivo `KuDE-FE`, rótulos e mensagem de indisponibilidade codificados para FE.
  5. **ERRO ENCONTRADO:** o código atual exige `tipOpe` no gateway e o extrai de `iTiOpe`. **O contrato corrigido pelo responsável não inclui `tipOpe` nem para FE nem para NCE**. Remover essa dependência da solicitação do KuDE, sem alterar o payload de emissão fiscal.
- Escopo funcional: no listado `Documentos electrónicos`, oferecer o mesmo botão/visor de KuDE para documentos **NCE APROBADA com CDC próprio válido**, exclusivamente dentro de empresa/sucursal/permissões da sessão. Usar **identidade fiscal da NCE**, nunca número/CDC da FE associada. Retornar `KuDE-NCE-EEE-PPP-NNNNNNN[-SERIE].pdf`; título `KuDE · Nota de crédito`.
- **Contrato de requisição CONFIRMADO diretamente pelo responsável (20/10/2026):** `POST /api/kude` usa os MESMOS cinco campos para FE e NCE: `dEst`, `dPunExp`, `dNumDoc`, `dSerieNum`, `tipoDoc`. **Não enviar `tipOpe`**. O único campo que muda por tipo é `tipoDoc`, com `"FE"` ou `"NCE"`. Os números devem vir do documento persistido, mantendo zeros à esquerda. Não inventar parâmetros extras.

```json
{
  "dEst": "001",
  "dPunExp": "003",
  "dNumDoc": "0009001",
  "dSerieNum": null,
  "tipoDoc": "FE"
}
```

```json
{
  "dEst": "001",
  "dPunExp": "003",
  "dNumDoc": "0009001",
  "dSerieNum": null,
  "tipoDoc": "NCE"
}
```

- A resposta de sucesso segue o contrato já implementado para FE (`status:"success"`, `CDC` próprio do documento e `kude` Base64). Confirmar operacionalmente o KuDE NCE no gateway antes de declarar homologação; sem PDF falso.
- Reutilizar os limites, checagem de `CDC` retornado igual ao CDC próprio da NCE, decodificação Base64 segura, PDF íntegro, token/credenciais da empresa, uma renovação 401, no-store, solicitação nova ao abrir e baixar, isolamento de sessão e ausência de persistência de KuDE.
- NÃO mudar comportamento da FE, layout, colunas, logo, série, gateways configurados, numeração, banco, estoque nem SIFEN. O cliente verá o KuDE tal como o gateway de teste gerar.

## 4. ACEITE
1. FE APROBADA + CDC: KuDE e comportamento funcional existentes **preservados**, enviando apenas os cinco campos do contrato corrigido (`tipoDoc:"FE"`, sem `tipOpe`).
2. NCE APROBADA + CDC: botão KuDE disponível e visor com PDF da própria NCE; impressão/download, nome `KuDE-NCE`; nenhuma troca de documento na UI.
3. NCE PENDIENTE/RECHAZADA/sem CDC, outra empresa/sucursal ou sem permissão: não oferecer ou negar seguro, sem chamada insegura ao gateway.
4. Mock do gateway valida **exatamente os cinco campos** (sem `tipOpe`), `tipoDoc` FE/NCE, autenticação, CDC próprio, Base64/PDF, erro, timeout e isolamento. **Homologação real somente pelo responsável**, se gateway oferecer KuDE NCE.
5. DESCUENTO: operador informa valor e quantidade 1; resultado fiscal correto, sem alteração de estoque, sem exceder saldo; não alterar a FE original, respeitar IVA original (inclusive cenários mistos), motivos e bloqueios.
6. Não abrir PR/issue para alterar identidade do ambiente de testes, logotipo nem layout de KuDE FE.
