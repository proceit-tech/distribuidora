# Proposta derivada do código (ENSAIO, não autoritativa)

Esquema Nexit em espanhol, derivado do código implantado + propostas REQ-2026-003 (P001–P007), restrito aos nove itens da V1.
**Não substitui os SQLs históricos** (`../fontes-historicas/`); serve como alternativa/referência já testada enquanto a decisão de caminho de banco não é validada pelo responsável.

- `migraciones/` NEX-001…013 (+ `opcional/` RLS) · `seeds/` S-001…003 · `scripts/` runner, hash de senha DEMO, bateria de testes · `pruebas/` T01–T08 · `herramientas/` verificação das consultas SQL do app.
- Execução somente em PostgreSQL descartável: `APP_REPO=<repo> scripts/ejecutar-pruebas.sh` (último resultado: 125 verificações PASS, 0 falhas; ver `documentacao/testes/TST-NEXIT-2026-001-ensaio-derivado.md`).
- Nada foi executado na VM nem no banco `nexit`. Nenhuma senha/hash real no repositório (`scripts/verificar-sin-secretos.sh`).
