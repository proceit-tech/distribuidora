import { notFound } from "next/navigation";

// Módulo fuera del alcance de la V1: no accesible por URL hasta tener API y PostgreSQL reales.
export default function OutOfScopeLayout(): never {
  notFound();
}
