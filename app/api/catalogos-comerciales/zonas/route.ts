import { crearSimple, listarSimple } from "@/lib/comercial/servidor";

// zonas: GET (LISTAS_PRECIO.VER), POST (LISTAS_PRECIO.CREAR). Lógica compartida en lib/comercial/servidor.ts.
export const GET = () => listarSimple("zonas");
export const POST = (request: Request) => crearSimple("zonas", request);
