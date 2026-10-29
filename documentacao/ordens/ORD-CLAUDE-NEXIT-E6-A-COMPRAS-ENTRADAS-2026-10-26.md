# ORDEM FOCAL PARA CLAUDE — E6-A / COMPRAS → ENTRADAS
**Data:** 26/10/2026 | Branch: feature/NEXIT-2026-001-banco-demo
**Norma de negócio obrigatória e fechada:** documentacao/definicoes/REQ-NEXIT-CM-E6-COMPRAS-ENTRADAS-2026-10-26.md.
**Origem da decisão:** responsável: «somente entradas no menu que vamos criar de compras».
**Esta é a ÚNICA ordem ativa; E6-B Informe de Compras só após auditoria e nova ordem ChatGPT.**

## 0. Identificar contexto e pré-condições
- Sincronizar branch/HEAD, ler integralmente CLAUDE.md, norma E6 e arquivos completos que pretende alterar.
- Conferir NEX-006, NEX-009, NEX-014 e NEX-066 e seus guardas/permissões. Identificar como inventario_registrar_movimiento cria várias linhas, seu K1/huella e NEX-066 conserva intenções duráveis e ACK em falhas de conexão.
- Conferir a implementação real de Movimientos, depósitos/permissões, catálogo de productos/proveedores e menú Compras.
- Confirmar que as migrations oficiais não contêm vínculo confiável de proveedor↔movimiento. Consultar árvore NEX para selecionar número novo sem conflito.
- Não usar facturas_proveedor nem a migration histórica 004, não usar RecepcionDemo/localStorage.

## 1. Entrega E6-A de código
Criar somente **Compras → Entradas**:
- Listado por entradas reais, filtros e paginação; Nova entrada com fornecedor obrigatório, data operativa, depósito autorizado, produto(s) reais, quantidade/unidade, costo unitario explícito, lote quando aplicável, referência livre opcional, observação opcional; prévia e confirmação; detalhe histórico e estado de anulação.
- Um único registro lógico com várias linhas corresponde a um só movimiento de inventario ENTRADA/COMPRA e deve usar motor oficial NEX-014. Produto em unidade identificada ainda não suportado: aviso/bloqueio, sem bypass. Moeda de costo é moneda BASE da empresa; sem IVA fiscal.
- Persistir fornecedor, snapshot mínimo, contexto e movimiento_id em tabla incremental de metadatos por entrada (1:1, FK tenant). Não duplicar costo nem saldos; custos reais continuam nas linhas do movimento; distinguir entradas da nova UI de movimentos manuais anteriores.
- **Garantia CRÍTICA:** metadata da entrada, movimento e N linhas devem COMMIT em uma única transação, sem parcialidade nem pós-save desvinculado; preservar fluxo DURABLE de intenção/idempotência/recuperação de NEX-066 e K1 da criação de movimento, inclusive resposta HTTP perdida. NUNCA ligar por texto livre documento_referencia, fazer dois POSTs independentes ou duplicar movimento em retry.
- Autorizar em servidor COMPRAS.VER / COMPRAS.CREAR apenas conforme permissões existentes e MOVIMIENTOS.CREAR + alcance de depósito no motor. Não criar novo perfil, grants indiscriminados nem alterar regras de autorização do inventário. Se permisos ou a transação durable não admitirem solução segura restrita ao escopo, **PARAR e informar o bloqueio antes de publicar uma UI fictícia ou fazer workaround inseguro**.
- Criar migration incremental só para vínculo de entrada↔proveedor e constraints/grants mínimos, sem aplicar, e documentación de preflight/reversión si imprescindible. Não aplicar SQL nem tocar VM.
- Habilitar no grupo Compras do menu V1 **somente Entradas** após haver API/serviço protegido, mantendo ordenes/recepciones/devoluciones/solicitudes ocultas e sem mexer no grupo Inventario. Se a migration ainda não estiver aplicada, UI/API devem indicar 503 No disponible, não criar números mock.
- Não criar Informe de Compras nem cartão de relatório E6-B nesta entrega. Não tocar E5 Ventas.

## 2. Invariantes e critérios
- Quando 3 produtos são registrados, validar conceptualmente uma entrada, um movimento, 3 linhas, proveedor correto e custos do motor, não três incrementos independentes.
- Idempotência real: repetir a mesma K1 retorna a operação única; K1 com payload diferente rejeita; queda após COMMIT mantém intenção recuperável e não autoriza chave nova automaticamente.
- Validar quantidade >0 até 4 decimais; costo expresso >=0; evitar falsear costo = 0 se foi omitido; depósito e proveedor devem pertencer à empresa.
- Registros históricos são inmutables; anulación pelo fluxo oficial (ou manter ação ausente até confirmada compatibilidade), sem DELETE nem editar costo do movimento; report futuro exclui anulados.
- Um movimiento manual com origen COMPRA mas sem metadata criada em E6-A nunca aparece no listado do módulo Compras.
- Não habilitar menú/POST se o vínculo transacional não puder ser comprovado estaticamente. Esta condição prevalece sobre incentivo a entrega parcial.

## 3. Limites e responsabilidade
- **Claude é exclusivamente desenvolvedor.** Não atualizar Linear, não modificar PROGRESSO-NEXIT-V1.md ou documentação de auditoria, não alterar definição comercial, não iniciar E6-B.
- Não executar: testes, lint, typecheck, build, CI, SQL/DB real, migrations, VM, Docker, browser, deploy, gateway/SIFEN ou ações externas.
- Ler arquivos completos antes e depois. Fazer somente mudanças comprovadamente indispensáveis. Publicar commit/push na branch oficial e entregar SHA, arquivos completos alterados, migrations apenas versionadas, estratégia de transação/recuperação, mudanças de menu e riscos. Se impossível em segurança, entregar relatório de impedimento antes de alterar componente operacional, sem forçar patch.
- **PARAR PARA AUDITORIA INDEPENDENTE DO CHATGPT.** O analista atualizará GitHub/Linear e emitirá ordem E6-B apenas depois dessa auditoria e da verificação de fonte.
