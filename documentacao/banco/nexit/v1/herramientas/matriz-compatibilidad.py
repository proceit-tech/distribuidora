#!/usr/bin/env python3
"""Matriz de compatibilidad: consultas SQL literales del código de la app (app/api, lib) x esquema de una base.
Genera JSON (por consulta: archivo, línea, tablas, resultado) para compararlo entre dos bases (V1 vs cadena histórica) y un resumen Markdown.
Uso:  PGDATABASE=<base> matriz-compatibilidad.py <repo-app> json   > resultado.json
      matriz-compatibilidad.py <repo-app> md <v1.json> [<legado.json>]  > matriz.md
Solo PREPARE (análisis de columnas, tablas y tipos); no ejecuta las consultas ni cambia datos."""
import importlib.util, json, os, re, sys
spec = importlib.util.spec_from_file_location("vca", os.path.join(os.path.dirname(os.path.abspath(__file__)), "verificar-consultas-app.py"))
vca = importlib.util.module_from_spec(spec); spec.loader.exec_module(vca)

def tablas(sql):
    t = set(re.findall(r"\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)", sql, re.I))
    return sorted(x.lower() for x in t if x.lower() not in {"select", "set", "lateral", "unnest", "generate_series", "jsonb_to_recordset"})

def medir(raiz):
    out = []
    for q in vca.extraer(raiz):
        vs = vca.variantes(q["sql"]); estado = "OK"; err = ""
        for v in vs:
            rc, e = vca.preparar(v)
            if rc != 0:
                corr = None
                for ant, (nuevo, _d) in vca.CORRECCIONES.items():
                    if ant in v and vca.preparar(v.replace(ant, nuevo))[0] == 0: corr = ant
                if corr: estado = "CORRECCION" if estado == "OK" else estado
                else: estado = "FALLA"; err = e
        out.append({"file": q["file"], "line": q["line"], "tablas": sorted({t for v in vs for t in tablas(v)}), "estado": estado, "error": err})
    return out

def md(v1, legado):
    L = {(r["file"], r["line"]): r for r in legado} if legado else {}
    por = {}
    for r in v1: por.setdefault(r["file"], []).append(r)
    print("| Archivo de la app | Consultas | V1 (NEX) | Cadena histórica (con 003/018–021 simulados) | Tablas |")
    print("|---|---:|---|---|---|")
    for f, rs in sorted(por.items()):
        ok = sum(r["estado"] == "OK" for r in rs); co = sum(r["estado"] == "CORRECCION" for r in rs); fa = sum(r["estado"] == "FALLA" for r in rs)
        v1s = f"{ok} OK" + (f", {co} con corrección" if co else "") + (f", **{fa} FALLA**" if fa else "")
        if legado:
            lo = sum(L.get((r["file"], r["line"]), {}).get("estado") in ("OK", "CORRECCION") for r in rs); lf = len(rs) - lo
            ls = f"{lo} OK" + (f", **{lf} FALLA**" if lf else "")
        else: ls = "n/d"
        ts = sorted({t for r in rs for t in r["tablas"]})
        print(f"| `{f}` | {len(rs)} | {v1s} | {ls} | {', '.join(ts)} |")

if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[2] == "json": json.dump(medir(sys.argv[1]), sys.stdout, indent=1)
    elif len(sys.argv) >= 4 and sys.argv[2] == "md": md(json.load(open(sys.argv[3])), json.load(open(sys.argv[4])) if len(sys.argv) > 4 else None)
    else: sys.exit(__doc__)
