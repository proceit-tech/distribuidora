import { redirect } from "next/navigation";

// «Facturas» abre directamente el formulario de nueva factura electrónica; el listado de todos los documentos vive en Documentos electrónicos.
export default function FacturasPage(): never {
  redirect("/facturas/nueva");
}
