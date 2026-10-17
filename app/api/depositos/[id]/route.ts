import { NextResponse } from "next/server";

import { leerCuerpo, prepararDepositos, textoCuerpo } from "@/lib/depositos/servidor";
import { enTransaccion, esUuid, leerDeposito, respuestaErrorDeposito, validarDeposito } from "@/lib/depositos/shared";

type Contexto = { params: Promise<{ id: string }> };

const noEncontrado = () => NextResponse.json({ error: "Depósito no encontrado." }, { status: 404 });

// GET (INVENTARIO.VER) y PATCH (INVENTARIO.EDITAR: nombre y sucursal; el código NO se modifica). Fuera del alcance del usuario = 404.
export async function GET(_request: Request, contexto: Contexto) {
  const b = await prepararDepositos("VER");

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;

  if (!esUuid(id)) return noEncontrado();

  try {
    const d = await leerDeposito(b.db, b.empresaId, b.usuarioId, id);

    return d ? NextResponse.json({ deposito: d, permisos: b.permisos }) : noEncontrado();
  } catch (error) {
    return respuestaErrorDeposito(error, "cargar");
  }
}

export async function PATCH(request: Request, contexto: Contexto) {
  const cuerpo = await leerCuerpo(request);

  if (cuerpo instanceof NextResponse) return cuerpo;

  const b = await prepararDepositos("EDITAR");

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;

  if (!esUuid(id)) return noEncontrado();
  if (cuerpo.codigo !== undefined) return NextResponse.json({ error: "El código del depósito no se puede modificar.", campo: "codigo" }, { status: 400 });

  const f = { codigo: "", nombre: textoCuerpo(cuerpo.nombre), sucursalId: textoCuerpo(cuerpo.sucursalId) };
  const errores = validarDeposito(f, false);
  const campo = Object.keys(errores)[0] as keyof typeof errores | undefined;

  if (campo) return NextResponse.json({ error: errores[campo], campo }, { status: 400 });

  try {
    await enTransaccion(b.db, (c) => c.query(`SELECT public.deposito_editar($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid)`, [b.empresaId, b.usuarioId, id, f.nombre.trim(), f.sucursalId]));

    return NextResponse.json({ message: "Depósito actualizado.", deposito: await leerDeposito(b.db, b.empresaId, b.usuarioId, id) });
  } catch (error) {
    return respuestaErrorDeposito(error, "actualizar");
  }
}
