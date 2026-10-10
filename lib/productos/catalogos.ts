import { NextResponse } from "next/server";

import { opcional, texto } from "@/lib/productos/shared";

/** Validación común de Familias y Líneas de producto (catálogos auxiliares, NEX-017). */
export function validarCatalogo(d: Record<string, unknown>) {
  const nombre = texto(d.nombre, 120);
  if (!nombre) throw new Error("El nombre es obligatorio.");
  return { nombre, codigo: opcional(d.codigo, 40), descripcion: opcional(d.descripcion, 500) };
}

export function respuestaCatalogo(error: unknown, que: "familia" | "línea") {
  console.error(`Error al registrar ${que}:`, error);
  const pg = error as { code?: string; constraint?: string };
  if (pg.code === "23505") {
    const porCodigo = (pg.constraint ?? "").includes("codigo");
    return NextResponse.json(
      { error: porCodigo ? `Ya existe una ${que} con ese código.` : `Ya existe una ${que} con ese nombre.` },
      { status: 409 },
    );
  }
  if (pg.code === "23503") {
    return NextResponse.json({ error: "La familia indicada no existe en su empresa." }, { status: 400 });
  }
  if (pg.code) return NextResponse.json({ error: `No fue posible registrar la ${que}.` }, { status: 500 });
  return NextResponse.json({ error: error instanceof Error ? error.message : `No fue posible registrar la ${que}.` }, { status: 400 });
}
