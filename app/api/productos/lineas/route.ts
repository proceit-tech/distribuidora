import { crearCatalogo, listarCatalogo } from "@/lib/productos/catalogos-admin";

// Catálogo de producto "lineas": GET (PRODUCTOS.VER), POST (PRODUCTOS.CREAR). Lógica compartida en lib/productos/catalogos-admin.ts.
export const GET = (request: Request) => listarCatalogo("lineas", request);
export const POST = (request: Request) => crearCatalogo("lineas", request);
