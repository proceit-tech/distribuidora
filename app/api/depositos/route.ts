import { NextResponse } from "next/server";

import { leerCuerpo, prepararDepositos, textoCuerpo } from "@/lib/depositos/servidor";
import { enTransaccion, leerDeposito, listarDepositos, respuestaErrorDeposito, validarDeposito } from "@/lib/depositos/shared";

// Depósitos: GET (INVENTARIO.VER) lista los del alcance del usuario, activos e inactivos; POST (INVENTARIO.CREAR) crea con deposito_crear.
export async function GET() {
  const b = await prepararDepositos("VER");

  if (!b.ok) return b.respuesta;

  try {
    return NextResponse.json({ ...(await listarDepositos(b.db, b.empresaId, b.usuarioId)), permisos: b.permisos });
  } catch (error) {
    return respuestaErrorDeposito(error, "cargar");
  }
}

export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);

  if (cuerpo instanceof NextResponse) return cuerpo;

  const b = await prepararDepositos("CREAR");

  if (!b.ok) return b.respuesta;

  const f = { codigo: textoCuerpo(cuerpo.codigo), nombre: textoCuerpo(cuerpo.nombre), sucursalId: textoCuerpo(cuerpo.sucursalId) };
  const errores = validarDeposito(f, true);
  const campo = Object.keys(errores)[0] as keyof typeof errores | undefined;

  if (campo) return NextResponse.json({ error: errores[campo], campo }, { status: 400 });

  try {
    const id = await enTransaccion(b.db, async (c) => {
      const r = await c.query(`SELECT public.deposito_crear($1::uuid, $2::uuid, $3::uuid, $4, $5) AS id`, [b.empresaId, b.usuarioId, f.sucursalId, f.codigo.trim(), f.nombre.trim()]);

      return (r.rows[0] as { id: string }).id;
    });

    return NextResponse.json({ message: "Depósito creado.", deposito: await leerDeposito(b.db, b.empresaId, b.usuarioId, id) }, { status: 201 });
  } catch (error) {
    return respuestaErrorDeposito(error, "crear");
  }
}
