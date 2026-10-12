const fs = require("fs");
function editar(f, fn) { let s = fs.readFileSync(f, "utf8"); const rep = (a, b) => { if (!s.includes(a)) throw new Error(f + " missing " + a.slice(0, 70)); s = s.replace(a, () => b); }; fn(rep); fs.writeFileSync(f, s); }

editar("app/(private)/clientes/[id]/page.tsx", (rep) => {
  rep(`import { validarDireccionFiscalRequerida } from "@/lib/clientes/obligatoriedad-fiscal";`, `import { validarDireccionFiscalRequerida } from "@/lib/clientes/obligatoriedad-fiscal";
import { useProtegerCambios } from "@/lib/ui/proteger-cambios";`);

  // baseline + borrador de documentos
  rep(`  const [hijos, setHijos] =
    useState<HijosForm>(hijosVacios);
`, `  const [hijos, setHijos] =
    useState<HijosForm>(hijosVacios);

  // CLI-A02: huella de lo que el servidor entregó (ficha + contactos + direcciones) y borrador de documento sin enviar; avisa al recargar/cerrar y al usar enlaces.
  const [huellaBase, setHuellaBase] = useState("");
  const [borradorDocumento, setBorradorDocumento] = useState(false);
  const sucio = !saving && ((huellaBase !== "" && JSON.stringify({ form, hijos }) !== huellaBase) || borradorDocumento);

  useProtegerCambios(sucio);
`);

  // CLI-A04: catálogo con error no se interpreta como vacío; CLI-A01: referencias históricas inactivas
  rep(`        const cat =
          (await rCatalogos.json()) as {
            catalogos?: Partial<Catalogos>;
          };

        if (activo) {
          setCatalogos({
            ...CATALOGOS_VACIOS,
            ...(cat.catalogos ?? {}),
          });
          setHijos(hijosDesdeApi(datos));
          setDocumentos(datos.documentos ?? []);
          setAptitud(datos.aptitudSifen ?? null);
          setCliente(datos.cliente);
          setForm(
            fromCliente(datos.cliente),
          );
        }`, `        // CLI-A04: un fallo del catálogo (401/403/500) NO se convierte en listas vacías: eso borraría vínculos al guardar y parecería un cliente normal.
        if (!rCatalogos.ok) {
          const detalle = (await rCatalogos.json().catch(() => ({}))) as { error?: string };

          throw new Error(
            \`No fue posible cargar los catálogos del cliente (código \${rCatalogos.status}): \${
              detalle.error ?? (rCatalogos.status === 401 || rCatalogos.status === 403 ? "no tiene permiso para consultarlos." : "el servicio no respondió correctamente.")
            } La ficha no se muestra para no perder sus vínculos; recargue la página o pida acceso.\`,
          );
        }

        const cat =
          (await rCatalogos.json()) as {
            catalogos?: Partial<Catalogos>;
          };
        const catalogosCompletos = { ...CATALOGOS_VACIOS, ...(cat.catalogos ?? {}) };
        const formularioInicial = fromCliente(datos.cliente);
        const hijosIniciales = hijosDesdeApi(datos);

        if (activo) {
          // CLI-A01: una referencia que el cliente ya tiene pero hoy está inactiva se muestra (marcada) para conservarla; no se ofrece como elección nueva.
          const historicas = datos.referenciasHistoricas ?? {};
          const conHistorica = (lista: Opcion[], campo: string) => {
            const h = historicas[campo];

            return h && !lista.some((o) => o.id === h.id) ? [...lista, { id: h.id, nombre: \`\${h.nombre} (inactivo)\` }] : lista;
          };

          setCatalogos({
            ...catalogosCompletos,
            grupos: conHistorica(catalogosCompletos.grupos, "grupoClienteId"),
            listasPrecio: conHistorica(catalogosCompletos.listasPrecio, "listaPrecioId"),
            canalesVenta: conHistorica(catalogosCompletos.canalesVenta, "canalVentaId"),
            vendedores: conHistorica(catalogosCompletos.vendedores, "vendedorId"),
            rutasEntrega: conHistorica(catalogosCompletos.rutasEntrega, "rutaEntregaId"),
            zonasComerciales: conHistorica(catalogosCompletos.zonasComerciales, "zonaComercialId"),
          });
          setHijos(hijosIniciales);
          setDocumentos(datos.documentos ?? []);
          setAptitud(datos.aptitudSifen ?? null);
          setCliente(datos.cliente);
          setForm(formularioInicial);
          setHuellaBase(JSON.stringify({ form: formularioInicial, hijos: hijosIniciales }));
        }`);
  rep(`            aptitudSifen?: { apto: boolean; pendientes: string[] };
            error?: string;
          };

        if (
          !rCliente.ok ||`, `            aptitudSifen?: { apto: boolean; pendientes: string[] };
            referenciasHistoricas?: Record<string, { id: string; codigo: string; nombre: string }>;
            error?: string;
          };

        if (
          !rCliente.ok ||`);

  // CLI-A03: versión
  rep(`          body: JSON.stringify({
            naturaleza: form.naturaleza,
            tipoOperacion:
              form.tipoOperacion,`, `          body: JSON.stringify({
            // CLI-A03: versión de la ficha cargada; el servidor rechaza (409) si otro usuario guardó antes.
            actualizadoEn: cliente.actualizadoEn,
            naturaleza: form.naturaleza,
            tipoOperacion:
              form.tipoOperacion,`);
  rep(`              onRecargar={recargarDocumentos}
            />`, `              onRecargar={recargarDocumentos}
              onBorrador={setBorradorDocumento}
            />`);
});

editar("app/(private)/clientes/[id]/_components/documentos.tsx", (rep) => {
  rep(`import { useState } from "react";`, `import { useEffect, useState } from "react";`);
  rep(`  onError,
  onAviso,
}: {
  clienteId: string;
  documentos: DocumentoCliente[];
  onRecargar: () => Promise<void>;
  onError: (mensaje: string) => void;
  onAviso: (mensaje: string) => void;
}) {`, `  onError,
  onAviso,
  onBorrador,
}: {
  clienteId: string;
  documentos: DocumentoCliente[];
  onRecargar: () => Promise<void>;
  onError: (mensaje: string) => void;
  onAviso: (mensaje: string) => void;
  /** Informa si hay un documento en preparación (alta o edición) que aún no se envió: la pantalla lo usa para avisar antes de perderlo. */
  onBorrador?: (hay: boolean) => void;
}) {`);
  rep(`  const [ocupado, setOcupado] = useState(false);
`, `  const [ocupado, setOcupado] = useState(false);
  const hayBorrador = nuevo !== null || editando !== null;

  useEffect(() => {
    onBorrador?.(hayBorrador);

    return () => onBorrador?.(false);
  }, [hayBorrador, onBorrador]);
`);
});
