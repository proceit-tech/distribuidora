# REQ-DOC-KUDE-PDF-GATEWAY — KuDE/PDF de Factura Electrónica desde Documentos electrónicos

**Data:** 20/10/2026 · **Prioridade:** P0, demonstração próxima.  
**Origem:** evidência fornecida pelo responsável — captura Postman de POST `https://gateway-bebidas-py.e-factura-hub.com/api/kude`.  
**Status do contrato:** **REQUISIÇÃO FE observada, RESPOSTA NÃO FORNECIDA**. Não declarar download PDF comprovado apenas com captura do request.  
**Menu alvo:** `Facturación → Documentos electrónicos`, `/documentos`.  
**Tarefa Linear:** a ser vinculada à issue P0, filha de PRO-91.  
**Governança:** Claude desenvolve somente sob ordem do responsável; ChatGPT audita commit; responsável executa VM, build, deploy, credenciais, prova real e homologação. Sistema desktop.

## 1. Evidência concreta (Postman)

**Método:** `POST`.  
**Endpoint apresentado pelo responsável:** `https://gateway-bebidas-py.e-factura-hub.com/api/kude`.  
**Body JSON do caso FE exibido na captura:**

```json
{
  "tipOpe": "4",
  "dEst": "001",
  "dPunExp": "001",
  "dNumDoc": "0010004",
  "dSerieNum": null,
  "tipoDoc": "FE"
}
```

`dEst` e `dPunExp` têm 3 caracteres; `dNumDoc` tem 7 caracteres, **preservar zeros à esquerda e o tipo string**; `dSerieNum` é null se a série persistida for nula; `tipoDoc` é `FE` no único exemplo fornecido. `tipOpe` aparece como string `"4"` nesse exemplo, **sem confirmação de sua semântica ou da fonte para TODOS os documentos**. Não codificar constante `"4"` nem confundir automaticamente com `iTipTra`, `iTipOpe` ou o tipo de DE. Conferir mapping com campos/payload fiscal persistido e contrato do fornecedor. Se não for possível estabelecer campo correto, bloquear KuDE com aviso honesto e solicitar mais evidência ao responsável.

A aba de autorização aparece configurada no Postman, porém **não há imagem dos headers nem do formato do response**. O gateway NEXIT já autentica por empresa via `/api/login` e Bearer para `/api/consulta_de` e `/api/recepcion_de`; o novo endpoint deverá aproveitar a configuração existente e o mesmo isolamento de credenciais/token, **após confirmar que aceita esse Bearer**, sem credencial fixa/código no browser. Não inventar respostas do fornecedor.

**Pendente obrigatório para integração funcional comprovada:** exemplo sanitizado da aba **Response** do Postman com status HTTP, Content-Type, Content-Disposition se houver e estrutura da resposta (binário PDF / JSON base64 / URL / outro), além de evidência de como obter `tipOpe` para outra FE e, futuramente, NCE. Nunca registrar tokens, RUC/password privados nem PDF real de cliente no repositório.

## 2. Escopo P0 estrito

O menu `/documentos` atualmente mostra texto `PDF/KuDE y XML: descarga no disponible (endpoint del proveedor sin confirmar)` em `app/(private)/documentos/page.tsx:417`. Agora há evidência de ENDPOINT de KuDE FE, **não há confirmação do resultado**. Implementar caminho isolado para **visualizar/baixar KuDE em PDF de FE existente**, quando elegível e quando o fornecedor efetivamente entregar PDF válido. Conservar XML como não disponível e não prometer cobertura NCE, NDE, NRE ou AFE sem requisição/resposta real. Outras melhorias da auditoria DOC-D01…DOC-D08 ficam fora deste escopo. Não mexer na criação/emissão FE/NCE, em contagem/estados fiscais, numeração, CDC, estoque, grants ou migrations.

Fluxo alvo:
1. Operador acessa `Documentos electrónicos` e abre detalhe de uma FE **da empresa e sucursal autorizadas**, preferencialmente `estadoSifen=APROBADO` com CDC coerente para demonstração.
2. O frontend apresenta **`Ver KuDE (PDF)`** e/ou **`Descargar KuDE`** só quando o contrato estiver tecnicamente viável e a FE elegível. Durante carregamento exibe progress/erro (espanhol PY), bloqueia múltiplos cliques, não exibe PDF de outro registro.
3. A chamada é ao **backend autenticado NEXIT por ID imutável do documento** (sugerida `GET /api/documentos/[id]/kude`), sem enviar empresa, `tipOpe`, número, URL arbitrária ou chave de gateway pelo browser. A API recupera a FE **usando empresa e usuário da sessão + alcance de sucursal + FACTURACION_ELECTRONICA.VER**, aproveitando as funções `prepararFacturacion('VER')` e `obtenerDocumento`/leitura existente, e valida `tipo='FE'`, elegibilidade de estado e identidade fiscal armazenada. Negar acesso cruzado, ID inválido, usuário sem permissão, documento fora do escopo e tipo não suportado. Erros neutros 401/403/404/409/502/503 coerentes; sem revelar dados de outro tenant.
4. Formar POST para `{config.baseUrl}/api/kude` em **backend server-only**, com `dEst`, `dPunExp`, `dNumDoc`, `dSerieNum` do **documento imutável no PostgreSQL**. `tipoDoc='FE'` no P0. Definir `tipOpe` a partir de evidência confirmada do fornecedor e/ou snapshot fiscal persistido: **não hardcode `"4"`**; não assumir mapeamento arbitrário. Usar config e autenticação da empresa (modo `NEXIT_DB` não cai para variáveis globais; tokens isolados). Timeout, uma renovação de token apenas em 401 comprovado, sem registrar segredos.
5. **Tratar resposta segundo contrato real obtido.** Se vier binário `application/pdf`, validar assinatura PDF (`%PDF-`), tamanho máximo razoável e status HTTP antes de devolver bytes. Se vier JSON base64, só habilitar parser depois de comprovar o schema com exemplo; validar base64/assinatura/tamanho e não confiar cegamente em `status:success`. Se for URL, não fazer fetch de endereço arbitrário (SSRF), pedir aprovação de domínio/caminho e tratar autenticação. Resposta não reconhecida => erro seguro e sem download. Nunca gerar PDF fictício, texto nomeado `.pdf` ou assumir que `text()` retorna bytes binários.
6. Se PDF comprovado, enviar resposta ao navegador com `Content-Type: application/pdf`, `Content-Disposition: inline` e/ou `attachment` com nome derivado **exclusivamente dos campos saneados do registro** (por exemplo `KuDE-FE-001-001-0010004.pdf`), `Cache-Control: private, no-store`, headers seguros. Evitar gravar PDF em DB, logs ou disco na P0, a menos que haja necessidade comprovada/autorizada. Não expor baseURL/token no frontend, não criar link externo direto ao gateway.
7. Caso não exista prova do formato de resposta antes do prazo, entregar backend/UI em modo **seguro e não operacional**, documentando a evidência faltante; não inventar sucesso nem entregar um PDF inválido.

## 3. Arquivos/código a examinar antes de editar

- `app/(private)/documentos/page.tsx` e CSS local (somente para botão e estados).
- `app/api/documentos/[id]/route.ts`, `/consultar/route.ts`, `app/api/documentos/route.ts`.
- `lib/facturacion/shared.ts`, `servidor.ts`, `gateway.ts`, `gateway-credenciales.ts`, `gateway-estado.ts`.
- `documentacao/banco/nexit/v1/migraciones/NEX-047-...sql` e `NEX-048-...sql`: `documentos_electronicos` guarda empresa, sucursal, tipo, estabelecimento/ponto/número/serie, CDC, estados; `documento_electronico_solicitudes.payload` é snapshot fiscal imutável. Só **ler** essas migrations, já aplicadas conforme histórico, nunca modificá-las.
- `documentacao/testes/AUD-NEXIT-DOCUMENTOS-ELECTRONICOS-DESKTOP-R01-2026-10-18.md` GAP-01; `documentacao/v1/auditoria-por-menu/AUD-DOCUMENTOS-ELECTRONICOS-V1.md`.

## 4. Aceite dirigido, testes e segurança

**Provar com testes direcionados**, por mock de gateway e handlers reais quando possível:
- FE autorizada e aprovada, identidade `001/001/0010004`, série null, POST `/api/kude` correto **sem perder zeros**, token da empresa correta, resposta PDF binária mock válida -> 200 PDF + headers corretos + bytes intactos + nome seguro.
- Não aceitar `tipOpe` ausente/incerto por fallback inventado. Cobrir caso válido que não seja `"4"` se houver contrato.
- Outra empresa, sucursal sem alcance, VER ausente, sessão expirada, documento inexistente, tipo diferente de FE, status inelegível, credenciais ausentes -> sem chamada externa e sem vazamento.
- Gateway 401/403, timeout, 404, 500, PDF inválido, content-type inesperado, JSON sem schema confirmado, PDF excessivo, token renovado uma vez -> erro controlado, nunca download falso.
- Dois documentos abertos na UI, múltiplos cliques, erro/retry, fechamento da visualização; nenhum KuDE trocado entre IDs.
- Nenhuma mutação de estados SIFEN, envio, número, saldos, lote, idempotência ou estoque; XML permanece explícito como não disponível.
- Regressões só de Documentos / autenticação gateway, lint/tsc **pontuais** (sem suíte/build global/CI, sem PostgreSQL real, VM ou navegador por Claude).
- Separar 'contrato demonstrado por Postman' de 'teste de mock' e 'validação real pelo responsável'. Não marcar homologado.

## 5. Entrega e parada

Claude pode implementar somente **esta funcionalidade P0 autorizada**, mantendo branch oficial `feature/NEXIT-2026-001-banco-demo`, editando arquivos mínimos, testes dirigidos e documentação. Relatar quais pontos impedem habilitar PDF real por falta de resposta do fornecedor, com exemplo de retorno necessário; não solicitar nem registrar tokens/senhas. Commit/push SHA completo, atualizar progresso e Linear em In Review, parar para **AUD-DOC-KUDE-R01 independente pelo ChatGPT**. **Nenhuma IA executa DB/VM/Docker/deploy; só o responsável.**
