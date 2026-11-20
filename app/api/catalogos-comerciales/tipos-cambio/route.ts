import { crearCambio, listarCambios } from "@/lib/comercial/servidor";

// Tipos de cambio manuales: GET (LISTAS_PRECIO.VER; ?historial=1 incluye versiones retiradas), POST (LISTAS_PRECIO.CREAR).
export const GET = (request: Request) => listarCambios(request);
export const POST = (request: Request) => crearCambio(request);
