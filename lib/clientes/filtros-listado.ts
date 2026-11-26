/**
 * Búsqueda y filtros de la lista de Clientes (decisión final 8, 2026-10-11): búsqueda + situación, grupo, moneda, tipo de
 * operación, bloqueo y aptitud SIFEN (más naturaleza). Función PURA aplicada sobre los clientes de la empresa de la sesión
 * (la API ya filtra por `empresa_id` y exige CLIENTES.VER); la paginación y los contadores usan siempre el resultado filtrado.
 */
import type { ClienteLista } from "@/types/clientes";

export type FiltrosListado = {
  busqueda: string;
  estado: "TODOS" | "ACTIVOS" | "INACTIVOS";
  bloqueo: "TODOS" | "BLOQUEADOS" | "SIN_BLOQUEO";
  aptitud: "TODAS" | "APTOS" | "NO_APTOS";
  /** "" = todos; si no, id del grupo de cliente. */
  grupo: string;
  /** "" = todas; "SIN_MONEDA" = clientes sin moneda; si no, código de moneda. */
  moneda: string;
  naturaleza: "TODAS" | "CONTRIBUYENTE" | "NO_CONTRIBUYENTE";
  operacion: "TODAS" | "B2B" | "B2C" | "B2G" | "B2F";
};

export const FILTROS_VACIOS: FiltrosListado = {
  busqueda: "",
  estado: "TODOS",
  bloqueo: "TODOS",
  aptitud: "TODAS",
  grupo: "",
  moneda: "",
  naturaleza: "TODAS",
  operacion: "TODAS",
};

const soloDigitos = (valor: string) => valor.replace(/\D/g, "");

/** ¿El cliente cumple la búsqueda de texto? (nombre, código, documento, contacto principal, teléfonos por dígitos, GLN, vendedor…) */
export function coincideBusqueda(cliente: ClienteLista, busqueda: string): boolean {
  const termino = busqueda.trim().toLocaleLowerCase("es");

  if (!termino) return true;

  const principal = cliente.contactoPrincipal;
  const campos = [
    cliente.codigo,
    cliente.razonSocial,
    cliente.nombreFantasia,
    cliente.numeroDocumento,
    cliente.dv,
    cliente.email,
    cliente.telefono,
    cliente.celular,
    cliente.gln,
    cliente.grupoCliente,
    cliente.vendedor,
    cliente.rutaEntrega,
    cliente.zonaComercial,
    principal.nombre,
    principal.telefono,
    principal.celular,
  ];
  const digitos = soloDigitos(termino);
  // Teléfonos: se compara también solo por dígitos (con o sin DDI, espacios o guiones).
  const numeros = [cliente.telefono, cliente.celular, principal.telefono, principal.celular].map(soloDigitos).filter(Boolean);

  return campos.join(" ").toLocaleLowerCase("es").includes(termino) || (digitos.length >= 3 && numeros.some((n) => n.includes(digitos)));
}

export function cumpleFiltros(cliente: ClienteLista, f: FiltrosListado): boolean {
  if (f.estado === "ACTIVOS" && !cliente.activo) return false;
  if (f.estado === "INACTIVOS" && cliente.activo) return false;
  if (f.bloqueo === "BLOQUEADOS" && !cliente.bloqueadoVentas) return false;
  if (f.bloqueo === "SIN_BLOQUEO" && cliente.bloqueadoVentas) return false;
  if (f.aptitud === "APTOS" && !cliente.aptitudApto) return false;
  if (f.aptitud === "NO_APTOS" && cliente.aptitudApto) return false;
  if (f.grupo !== "" && cliente.grupoClienteId !== f.grupo) return false;
  if (f.moneda !== "" && (f.moneda === "SIN_MONEDA" ? cliente.moneda !== "" : cliente.moneda !== f.moneda)) return false;
  if (f.naturaleza !== "TODAS" && cliente.naturaleza !== f.naturaleza) return false;
  if (f.operacion !== "TODAS" && cliente.tipoOperacion !== f.operacion) return false;

  return coincideBusqueda(cliente, f.busqueda);
}

export function filtrarClientes(clientes: ClienteLista[], f: FiltrosListado): ClienteLista[] {
  return clientes.filter((cliente) => cumpleFiltros(cliente, f));
}
