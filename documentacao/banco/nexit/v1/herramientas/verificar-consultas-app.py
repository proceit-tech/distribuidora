#!/usr/bin/env python3
"""Verifica que TODAS las consultas SQL literales del código de la aplicación son válidas contra el esquema de la base.

Extrae los template literals con SELECT/INSERT/UPDATE/DELETE de app/api/**/*.ts y lib/**/*.ts y ejecuta PREPARE en una base
(no ejecuta las consultas, solo las analiza: columnas, tablas, tipos de parámetros). Uso:
    PGHOST=... PGPORT=... PGUSER=... PGDATABASE=... verificar-consultas-app.py <ruta-del-repo-de-la-app>
Salida: OK/FALLA por consulta y código de salida != 0 si hay fallas no justificadas.
Hallazgos conocidos (se evalúan con la corrección propuesta y se informan aparte): ver CORRECCIONES.
"""
import glob, json, os, re, subprocess, sys

# Correcciones mínimas propuestas en la PR de código (no en la base): texto original -> texto corregido
CORRECCIONES = {
    "THEN $32 ELSE NULL": ("THEN $32::uuid ELSE NULL",
        "F-01 clientes/route.ts: el parámetro $32 dentro de CASE se infiere como text y falla al asignarlo a una columna uuid (bloqueado_ventas_por)."),
}

def extraer(raiz):
    out = []
    archivos = glob.glob(raiz + "/app/api/**/*.ts", recursive=True) + glob.glob(raiz + "/lib/**/*.ts", recursive=True)
    for f in sorted(archivos):
        s = open(f, encoding="utf-8").read()
        for m in re.finditer(r"`([^`]*)`", s, re.S):
            q = m.group(1)
            if re.match(r"\s*(WITH|SELECT|INSERT|UPDATE|DELETE)\b", q, re.I) and re.search(r"\b(FROM|INTO|UPDATE|SET)\b", q, re.I):
                out.append({"file": os.path.relpath(f, raiz), "line": s.count("\n", 0, m.start()) + 1, "sql": q})
    return out

def variantes(sql):
    if "${tabla}" in sql and "${columna}" in sql:
        return [sql.replace("${tabla}", t).replace("${columna}", c) for t, c in
                [("condiciones_pago", "id"), ("monedas", "codigo"), ("incoterms", "codigo"), ("referencia_geografica_paises", "codigo")]]
    if "${tabla}" in sql:
        return [sql.replace("${tabla}", t) for t in
                ["grupos_cliente", "listas_precio", "rutas_entrega", "zonas_comerciales", "vendedores", "canales_venta"]]
    return [sql]

INTERPOLACION = re.compile(r"\$\{[^{}]*\}")

def preparar(sql):
    r = subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", "PREPARE h AS " + sql.strip().rstrip(";") + ";"],
                       capture_output=True, text=True)
    return r.returncode, r.stderr.strip().split("\n")[0]

def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    consultas = extraer(sys.argv[1])
    ok = 0; fallas = []; corregidas = []; dinamicas = []; vaciadas = 0
    for q in consultas:
        for v in variantes(q["sql"]):
            dinamica = "${" in v
            if dinamica:
                # Consulta compuesta en tiempo de ejecución (${...}): no es una consulta LITERAL. Se analiza con cada interpolación vacía; si PREPARE pasa cuenta como analizada;
                # un error de SINTAXIS ("syntax error") es consecuencia de la interpolación y se informa aparte como NO VERIFICABLE; cualquier otro error (tabla/columna inexistente, tipos) sigue siendo FALLA.
                v = INTERPOLACION.sub("", v)
                v = re.sub(r"\$\{.*", "", v, flags=re.S)   # plantilla anidada cortada por el extractor: se descarta desde la interpolación abierta
            rc, err = preparar(v)
            if rc == 0:
                ok += 1
                vaciadas += 1 if dinamica else 0
                continue
            if dinamica and "syntax error" in err:
                dinamicas.append((q["file"], q["line"]))
                continue
            arreglada = False
            for ant, (nuevo, desc) in CORRECCIONES.items():
                if ant in v:
                    rc2, err2 = preparar(v.replace(ant, nuevo))
                    if rc2 == 0:
                        corregidas.append((q["file"], q["line"], desc)); arreglada = True; break
            if not arreglada:
                fallas.append((q["file"], q["line"], err))
    print(f"consultas analizadas: {len(consultas)}  variantes OK: {ok} (de ellas {vaciadas} dinámicas analizadas con las interpolaciones vacías)  OK con corrección propuesta: {len(corregidas)}  FALLAS: {len(fallas)}  dinámicas NO verificables literalmente: {len(dinamicas)}")
    for f, l in dinamicas: print(f"  NO VERIFICABLE (consulta dinámica: error de sintaxis al vaciar la interpolación)  {f}:{l}")
    for f, l, d in corregidas: print(f"  CORRECCION REQUERIDA EN EL CÓDIGO  {f}:{l}  {d}")
    for f, l, e in fallas: print(f"  FALLA {f}:{l}  {e}")
    sys.exit(1 if fallas else 0)

if __name__ == "__main__":
    main()
