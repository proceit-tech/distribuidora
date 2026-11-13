#!/usr/bin/env python3
"""Genera SQL a partir del catálogo de países publicado por SIFEN (Paises_v100.xsd).

NO crea datos inferidos: códigos y nombres salen únicamente del XSD oficial
(cada xs:enumeration trae el nombre en xs:annotation/xs:documentation).
Si el XSD no aporta nombre verificable, o hay un código repetido con nombres
distintos que no esté resuelto explícitamente más abajo, se detiene sin generar SQL.

Uso:
  python3 gerar_carga_paises_sifen.py                 # descarga el XSD oficial
  python3 gerar_carga_paises_sifen.py --xsd Paises_v100.xsd   # usa un XSD ya descargado
  python3 gerar_carga_paises_sifen.py --xsd X.xsd --salida /ruta/salida.sql
"""
import argparse
import hashlib
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

URL = "https://ekuatia.set.gov.py/sifen/xsd/Paises_v100.xsd"
DESTINO = Path(__file__).with_name("CARGA-PAISES-SIFEN.sql")
NS = {"xs": "http://www.w3.org/2001/XMLSchema"}

# Códigos repetidos en el XSD oficial con nombres distintos. La resolución es
# explícita y usa SIEMPRE uno de los textos del propio XSD (nunca un nombre propio):
# MKD aparece como "Macedonia del Norte" y, más adelante, como
# "ex República Yugoslava de Macedonia" (denominación anterior). Se conserva la vigente.
RESOLUCION_DUPLICADOS = {"MKD": "Macedonia del Norte"}

# Valores de enumeración que NO son países ISO alfa-3 y se descartan (se informan).
NO_PAIS = {"NN"}


def leer_xsd(ruta):
    if ruta:
        return Path(ruta).read_bytes()
    with urllib.request.urlopen(URL, timeout=30) as response:
        return response.read()


def extraer(xml):
    root = ET.fromstring(xml)
    por_codigo = {}
    descartados = []
    for item in root.findall(".//xs:enumeration", NS):
        valor = (item.get("value") or "").strip().upper()
        if not re.fullmatch(r"[A-Z]{3}", valor):
            descartados.append(valor)
            continue
        docs = [" ".join("".join(n.itertext()).split()) for n in item.findall(".//xs:documentation", NS)]
        nombres = [s for s in docs if s and not re.fullmatch(r"[A-Z]{3}", s)]
        if not nombres:
            raise SystemExit(f"El XSD no proporciona nombre verificable para {valor}. No se generó SQL.")
        por_codigo.setdefault(valor, []).append(nombres[0])

    catalogo = {}
    for codigo, nombres in por_codigo.items():
        distintos = list(dict.fromkeys(nombres))
        if len(distintos) == 1:
            catalogo[codigo] = distintos[0]
            continue
        elegido = RESOLUCION_DUPLICADOS.get(codigo)
        if elegido not in distintos:
            raise SystemExit(f"Código duplicado conflictivo sin resolución explícita: {codigo} -> {distintos}")
        print(f"AVISO: {codigo} repetido en el XSD {distintos}; se usa «{elegido}».", file=sys.stderr)
        catalogo[codigo] = elegido
    inesperados = [d for d in descartados if d not in NO_PAIS]
    if inesperados:
        raise SystemExit(f"Valores no ISO alfa-3 no previstos en el XSD: {inesperados}. Revisar la fuente; SQL NO generado.")
    return catalogo, descartados


def literal(valor):
    return "'" + valor.replace("'", "''") + "'"


def generar_sql(catalogo, origen, sha256):
    # La cabecera cita siempre la URL oficial (no rutas locales del equipo que genera);
    # con --xsd solo se añade el nombre del archivo usado.
    valores = ",\n".join(f"  ({literal(c)}, {literal(n)})" for c, n in sorted(catalogo.items()))
    return (
        "-- Catálogo de países desde Paises_v100.xsd publicado por SIFEN.\n"
        f"-- Fuente: {origen}\n"
        f"-- SHA-256 del XSD: {sha256}\n"
        f"-- Países verificados en el XSD: {len(catalogo)}\n"
        "-- Idempotente. Conserva todos los registros existentes: no elimina ni desactiva países y\n"
        "-- no cambia 'activo'. Solo inserta los faltantes y alinea 'nombre' con el XSD oficial\n"
        "-- cuando difiere (los nombres ya copiados en clientes/proveedores no se tocan).\n"
        "-- Ejecutar con: psql -v ON_ERROR_STOP=1 -1 -f CARGA-PAISES-SIFEN.sql\n"
        "BEGIN;\n"
        "INSERT INTO referencia_geografica_paises (codigo, nombre) VALUES\n"
        + valores +
        "\nON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, actualizado_at = now()\n"
        "  WHERE referencia_geografica_paises.nombre IS DISTINCT FROM EXCLUDED.nombre;\n"
        "COMMIT;\n"
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xsd", help="ruta de un Paises_v100.xsd ya descargado")
    ap.add_argument("--salida", default=str(DESTINO))
    ap.add_argument("--minimo", type=int, default=150, help="mínimo de países esperado (guarda de sanidad)")
    args = ap.parse_args()

    xml = leer_xsd(args.xsd)
    catalogo, descartados = extraer(xml)
    if len(catalogo) < args.minimo or not {"PRY", "BRA", "ARG"}.issubset(catalogo):
        raise SystemExit(f"Catálogo insuficiente ({len(catalogo)} países). Verificar estructura del XSD; SQL NO generado.")
    if catalogo["PRY"] != "Paraguay":
        raise SystemExit(f"PRY no figura como 'Paraguay' en el XSD ({catalogo['PRY']}). Revisar la fuente.")
    destino = Path(args.salida)
    origen = URL if not args.xsd else f"{URL} (archivo local: {Path(args.xsd).name})"
    # newline="\n": el SQL se publica con saltos LF aunque se genere en Windows.
    with open(destino, "w", encoding="utf-8", newline="\n") as f:
        f.write(generar_sql(catalogo, origen, hashlib.sha256(xml).hexdigest()))
    print(f"Generado {destino}: {len(catalogo)} países; descartados no ISO: {descartados or 'ninguno'}.")


if __name__ == "__main__":
    main()
