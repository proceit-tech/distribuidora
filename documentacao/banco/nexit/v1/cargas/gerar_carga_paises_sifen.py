#!/usr/bin/env python3
"""Genera SQL a partir del catálogo de países publicado por SIFEN.

NO crea datos inferidos. Si el XSD no aporta nombres oficiales o códigos,
detiene el proceso y exige verificar la fuente antes de importar.
Uso (VM, repositorio): python3 documentacao/banco/nexit/v1/cargas/gerar_carga_paises_sifen.py
"""
from pathlib import Path
import re
import urllib.request
import xml.etree.ElementTree as ET

URL = "https://ekuatia.set.gov.py/sifen/xsd/Paises_v100.xsd"
DESTINO = Path(__file__).with_name("CARGA-PAISES-SIFEN.sql")
NS = {"xs": "http://www.w3.org/2001/XMLSchema"}

def main():
    with urllib.request.urlopen(URL, timeout=30) as response:
        xml = response.read()
    root = ET.fromstring(xml)
    catalogo = {}
    for item in root.findall(".//xs:enumeration", NS):
        codigo = (item.get("value") or "").strip().upper()
        if not re.fullmatch(r"[A-Z]{3}", codigo):
            continue
        docs = [" ".join("".join(n.itertext()).split()) for n in item.findall(".//xs:documentation", NS)]
        nombres = [s for s in docs if s and not re.fullmatch(r"[A-Z]{3}", s)]
        if not nombres:
            raise SystemExit(f"El XSD no proporciona nombre verificable para {codigo}. No se generó SQL.")
        nombre = nombres[0]
        if codigo in catalogo and catalogo[codigo] != nombre:
            raise SystemExit(f"Código duplicado conflictivo: {codigo}")
        catalogo[codigo] = nombre

    if len(catalogo) < 150 or not {"PRY", "BRA", "ARG"}.issubset(catalogo):
        raise SystemExit(f"Catálogo insuficiente ({len(catalogo)} países). Verificar estructura del XSD; SQL NO generado.")

    def literal(valor):
        return "'" + valor.replace("'", "''") + "'"

    valores = ",\n".join(f"  ({literal(c)}, {literal(n)}, true)" for c, n in sorted(catalogo.items()))
    sql = (
        "-- Catálogo de países desde Paises_v100.xsd publicado por SIFEN.\n"
        f"-- Fuente: {URL}\n"
        f"-- Países verificados en el XSD: {len(catalogo)}\n"
        "-- NO elimina ni desactiva registros existentes. Ejecutar con psql -1 y ON_ERROR_STOP=1.\n"
        "BEGIN;\n"
        "INSERT INTO referencia_geografica_paises (codigo, nombre, activo) VALUES\n"
        + valores +
        "\nON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, activo = true;\n"
        "COMMIT;\n"
    )
    DESTINO.write_text(sql, encoding="utf-8")
    print(f"Generado {DESTINO}: {len(catalogo)} países. Verificar antes de aplicar.")

if __name__ == "__main__":
    main()
