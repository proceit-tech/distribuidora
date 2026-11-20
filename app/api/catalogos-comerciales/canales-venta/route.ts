import { crearSimple, listarSimple } from "@/lib/comercial/servidor";

// canales: GET (LISTAS_PRECIO.VER), POST (LISTAS_PRECIO.CREAR). Lógica compartida en lib/comercial/servidor.ts.
export const GET = () => listarSimple("canales");
export const POST = (request: Request) => crearSimple("canales", request);
