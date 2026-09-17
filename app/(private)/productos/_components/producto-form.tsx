"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  PRODUCTO_CATEGORIAS,
  PRODUCTO_DEPOSITOS,
  PRODUCTO_IMPUESTOS,
  PRODUCTO_MARCAS,
  PRODUCTO_UNIDADES,
} from "@/lib/mocks/productos";

import {
  obtenerProductosDemo,
  obtenerProveedoresParaProducto,
} from "@/lib/mocks/productos-storage";

import {
  NuevoProductoDemo,
  ProductoAlternativo,
  ProductoCodigo,
  ProductoComponente,
  ProductoDemo,
  ProductoDeposito,
  ProductoDocumento,
  ProductoModoControlStock,
  ProductoPresentacion,
  ProductoProveedor,
  ProductoTipo,
} from "@/types/productos";

import styles from "./producto-form.module.css";

type Mode = "create" | "edit";

type TabId =
  | "general"
  | "sifen"
  | "stock"
  | "compras"
  | "logistica"
  | "kit"
  | "documentos";

type Props = {
  mode: Mode;
  initial?: ProductoDemo;
  onSave: (
    data: NuevoProductoDemo,
  ) => Promise<void> | void;
};

type ProveedorOpcion = {
  id: string;
  codigo: string;
  nombre: string;
};

const TABS: Array<{
  id: TabId;
  label: string;
}> = [
  { id: "general", label: "Información" },
  { id: "sifen", label: "SIFEN y códigos" },
  { id: "stock", label: "Inventario" },
  { id: "compras", label: "Compras" },
  { id: "logistica", label: "Logística" },
  { id: "kit", label: "Alternativos y kits" },
  { id: "documentos", label: "Documentos" },
];

const PAISES = [
  ["PRY", "Paraguay"],
  ["ARG", "Argentina"],
  ["BRA", "Brasil"],
  ["URY", "Uruguay"],
  ["BOL", "Bolivia"],
  ["FRA", "Francia"],
  ["ITA", "Italia"],
  ["ESP", "España"],
  ["CHN", "China"],
  ["OTR", "Otro"],
];

const FAMILIAS_INVENTARIO = [
  "ACCESORIOS DE VINO",
  "BOLS",
  "BOTELLA",
  "CACEROLA",
  "CAFETERA",
  "CAFETERIA",
  "CASEROLA",
  "CENICERO",
  "COCTELERA",
  "COCTELERIA",
  "COKTAIL",
  "COMPOTERAS",
  "COPAS EN ESTUCHES",
  "COPAS SUELTAS",
  "DECANTER",
  "DESCORCHADOR",
  "ENSALADERAS",
  "ESTUCHE DE COPAS",
  "ESTUCHE DE VASOS",
  "FLANERO",
  "FUENTE",
  "FUENTES",
  "HUEVERA",
  "JARRA",
  "JARRA MEDIDORA",
  "JARRO",
  "JGO DE JARRA DE VASOS",
  "JGO DE PLATOS",
  "MANIJAS",
  "MANTEQUERITA",
  "MIXING",
  "MOLDE",
  "MOLINILLO",
  "PLATO",
  "PLATOS",
  "RAMEQUIN",
  "SALERO",
  "SERVILLETAS",
  "TARRO C/ DISEÑO",
  "TARROS TRANSP",
  "TARTERA",
  "TAZA",
  "TAZA C/ PLATITO",
  "TAZA C/PLATO",
  "TAZA CAPUCHINO",
  "TAZA S/ PLATO",
  "TUPPERS",
  "UTENSILLOS DE COCINA",
  "VASOS EN ESTUCHES",
  "VASOS SUELTOS",
  "VINAGRERO"
] as const;

const LINEAS_POR_FAMILIA: Record<
  string,
  readonly string[]
> = {
  "ACCESORIOS DE VINO": [
    "DESCAPSULADOR",
    "SACACORCHO",
    "SACACORCHOS",
    "SARTEN"
  ],
  "BOLS": [
    "CARINE NOIR",
    "COSMOS",
    "EVOLUTION PEPS",
    "FLASHY",
    "HOTELIERE",
    "OCUISINE",
    "STRUCTURE TRANSPARENTE"
  ],
  "BOTELLA": [
    "FLUID"
  ],
  "CACEROLA": [
    "INDUCCION",
    "OCUISINE"
  ],
  "CAFETERA": [
    "A GAS",
    "INDUCCION",
    "PRENSA",
    "RECAMBIO"
  ],
  "CASEROLA": [
    "OCUISINE"
  ],
  "CENICERO": [
    "CENICEROS"
  ],
  "COCTELERA": [
    "COCKTAIL"
  ],
  "COKTAIL": [
    "NEW YORK"
  ],
  "COMPOTERAS": [
    "CARINE BLANCO",
    "CARINE NEGRO",
    "DIWALI BLANCO",
    "EVOLUTION PEPS",
    "QUADRATO BLANCO",
    "QUADRATO NEGRO",
    "STRUCTURE SHELLS BCO"
  ],
  "COPAS EN ESTUCHES": [
    "BALLON",
    "COCTKAIL",
    "ELEGANCE",
    "EUKLASE",
    "EXALTACION",
    "GRAND CHAIS",
    "MALVIDES",
    "OPEN UP",
    "PALMIER",
    "PRINCESA",
    "QUADRO",
    "REVEAL UP",
    "SO WINE",
    "SPIRITS",
    "SYMETRIE",
    "TULIPE"
  ],
  "COPAS SUELTAS": [
    "BROADWAY",
    "CERVOISE",
    "COCTKAIL",
    "COÑAC",
    "LICOR",
    "RAINDROP"
  ],
  "DECANTER": [
    "ABONDANCE",
    "MACARON",
    "OPEN UP"
  ],
  "ENSALADERAS": [
    "APILABLE",
    "CARINE BLANCO",
    "CARINE NOIR",
    "COSMOS",
    "DIWALI BLANCO",
    "EVOLUTION PEPS",
    "QUADRATO BLANCO",
    "QUADRATO NEGRO"
  ],
  "ESTUCHE DE COPAS": [
    "LADY DIAMOND",
    "LONGCHAMP",
    "MACASSAR"
  ],
  "ESTUCHE DE VASOS": [
    "LADY DIAMOND",
    "LONGCHAMP",
    "MACASSAR"
  ],
  "FLANERO": [
    "SMART  CUISINE BCO"
  ],
  "FUENTE": [
    "OCUISINE",
    "SMART  CUISINE BCO"
  ],
  "FUENTES": [
    "EVOLUTION PEPS",
    "QUADRATO NEGRO"
  ],
  "HUEVERA": [
    "POULE"
  ],
  "JARRA": [
    "ARC",
    "BRIGTON",
    "IMPERATOR",
    "KONE",
    "OCTIME",
    "ORIENT",
    "QUADRO",
    "ROC",
    "TIVOLI",
    "VICTORIA",
    "WHAVY"
  ],
  "JARRA MEDIDORA": [
    "OCUISINE"
  ],
  "JARRO": [
    "BONE",
    "EVOLUTIONS PEPS",
    "NEW MORNING",
    "NUEVO",
    "TRANSPORTABLE"
  ],
  "JGO DE JARRA DE VASOS": [
    "BRIGHTON",
    "IMPERATOR",
    "MARTIGUES - KONE",
    "NEO-KONE",
    "OCTIME",
    "PALM SPRINGS"
  ],
  "JGO DE PLATOS": [
    "CARINE FELITSA"
  ],
  "MANIJAS": [
    "CHOOP"
  ],
  "MANTEQUERITA": [
    "APILABLE"
  ],
  "MIXING": [
    "OCUISINE"
  ],
  "MOLDE": [
    "OCUISINE",
    "SMART  CUISINE BCO"
  ],
  "MOLINILLO": [
    "CAFETERIA",
    "PIMENTERO"
  ],
  "PLATO": [
    "DIWALI BLANCO"
  ],
  "PLATOS": [
    "CARINE BLANCO",
    "CARINE NEGRO",
    "CARINE NOIR",
    "COTTAGE GRANIT",
    "DIWALI LIGTH TURQUOISE",
    "EVOLUTION GRANIT",
    "EVOLUTION PEPS",
    "EVOLUTION PEPS NEGRO",
    "HOTELIERE",
    "INTENSITY BCO",
    "QUADRATO BLANCO",
    "QUADRATO NEGRO",
    "STRUCTURE SHELLS BCO"
  ],
  "RAMEQUIN": [
    "SMART  CUISINE BCO"
  ],
  "SALERO": [
    "SALERO"
  ],
  "SERVILLETAS": [
    "VARIADOS"
  ],
  "TARRO C/ DISEÑO": [
    "VARIADOS DISEÑOS"
  ],
  "TARROS TRANSP": [
    "PURE JAR CLUB"
  ],
  "TARTERA": [
    "OCUISINE"
  ],
  "TAZA": [
    "EVOLUTION PEPS"
  ],
  "TAZA C/ PLATITO": [
    "CARINE BLANCO",
    "EVOLUTION PEPS",
    "HOTELIERE"
  ],
  "TAZA C/PLATO": [
    "AROMA"
  ],
  "TAZA CAPUCHINO": [
    "FOOTED MUG",
    "IRISH COFFE",
    "LATINO"
  ],
  "TAZA S/ PLATO": [
    "AROMA",
    "FLASHY",
    "JUMBO"
  ],
  "TUPPERS": [
    "EASY BOX AZUL RECTANGULAR",
    "EASY BOX CUADRADO",
    "EASY BOX REDONDO",
    "KEEP LAGON CUADRADO",
    "KEEP LAGON RECTANGULAR",
    "KEEP LAGON REDONDO",
    "PURE BOX  REDONDO",
    "PURE BOX CUADRADO",
    "PURE BOX RECTANGULAR"
  ],
  "UTENSILLOS DE COCINA": [
    "CIERRA BOLSAS",
    "CORTADOR",
    "CUCHARA",
    "CUCHARON",
    "DISPENSADOR",
    "ENCENDEDOR",
    "ESPATULA",
    "ESPIRALIZADOR",
    "ESPUMADERA",
    "ESPÁTULA",
    "ESTANTE",
    "EXPRIMIDOR",
    "GUANTE",
    "MANDOLINA",
    "MANGA",
    "PALETA",
    "PELADOR",
    "PINCEL",
    "PINZA",
    "RALLADOR",
    "REBANADOR",
    "REMOVEDOR",
    "RODILLO",
    "ROMPE",
    "ROMPENUECES",
    "SOPLETE",
    "TABLA",
    "TAMIZADOR",
    "TRINCHAPOLLOS",
    "TRITURADOR"
  ],
  "VASOS EN ESTUCHES": [
    "ASCOT",
    "IMPERATOR",
    "ISLANDE",
    "OCTIME",
    "OCTIME DIAMOND",
    "OPEN UP",
    "SALTO ICE BLUE",
    "SALTO ICE PINK",
    "STERLING ICE BLUE",
    "STERLING ICE PINK",
    "STERLING TRANSP"
  ],
  "VASOS SUELTOS": [
    "ARCADIE",
    "BOURDON",
    "BRASIERE",
    "BROADWAY",
    "GASTON SKALE",
    "GIN",
    "GRANITY",
    "HOT SHOT",
    "ISLANDE",
    "LINZ",
    "MARTIGUES",
    "NEW AMERICA",
    "OLD SQUARE",
    "PRIMARY",
    "SALTO",
    "STARLINE"
  ],
  "VINAGRERO": [
    "VINAGRERO"
  ]
};

const PROCEDENCIAS_INVENTARIO = [
  "ESPAÑA",
  "FRANCIA",
  "FRANCIA/NAINJING",
  "ITALIA",
  "NAINJING"
] as const;

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

function findName(
  id: string,
  options: Array<{
    id: string;
    nombre: string;
  }>,
) {
  return (
    options.find(
      (item) => item.id === id,
    )?.nombre ?? ""
  );
}

function initialForm(
  initial?: ProductoDemo,
): NuevoProductoDemo {
  if (initial) {
    const {
      id: _id,
      creadoEn: _creadoEn,
      actualizadoEn: _actualizadoEn,
      ...rest
    } = initial;

    return {
      ...structuredClone(rest),
      codigoInventario:
        initial.codigoInventario ?? "",
      familiaNombre:
        initial.familiaNombre ?? "",
      lineaNombre:
        initial.lineaNombre ?? "",
      procedencia:
        initial.procedencia ?? "",
      inventarioInicial:
        initial.inventarioInicial ?? 0,
      precioVentaReferencia:
        initial.precioVentaReferencia ?? 0,
      valorVentaReferencia:
        initial.valorVentaReferencia ?? 0,
    };
  }

  return {
    codigo: "",
    codigoInventario: "",
    codigoSifen: "",
    codigoBarras: "",
    descripcion: "",
    descripcionFactura: "",
    tipoProducto: "MERCADERIA",

    categoriaId: "",
    categoriaNombre: "",
    marcaId: "",
    marcaNombre: "",
    familiaNombre: "",
    lineaNombre: "",
    procedencia: "",
    unidadMedidaId: "",
    unidadMedidaNombre: "",
    impuestoId: "iva10",
    impuestoNombre: "IVA 10%",

    controlaStock: true,
    modoControlStock: "CANTIDAD",
    permiteTerceros: false,
    requiereVencimiento: false,
    stockMinimo: 0,
    stockMaximo: 0,
    puntoReposicion: 0,
    stockActual: 0,
    inventarioInicial: 0,
    costoPromedio: 0,
    precioVentaReferencia: 0,
    valorVentaReferencia: 0,

    partidaArancelaria: "",
    ncm: "",
    dncpGeneral: "",
    dncpEspecifico: "",
    paisOrigenCodigo: "PRY",
    paisOrigenNombre: "Paraguay",
    informacionFactura: "",

    relacionMercaderia: "",
    porcentajeMerma: 0,
    cantidadMerma: 0,

    vendible: true,
    comprable: true,
    requiereInspeccionCalidad: false,
    vidaUtilDias: 0,

    pesoNetoKg: 0,
    pesoBrutoKg: 0,
    largoCm: 0,
    anchoCm: 0,
    altoCm: 0,
    volumenM3: 0,

    imagenUrl: "",
    observacion: "",
    activo: true,

    codigos: [],
    unidades: [],
    proveedores: [],
    depositos: [],
    alternativos: [],
    componentes: [],
    documentos: [],
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = "1",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(event) =>
          onChange(
            Number(
              event.target.value ||
                0,
            ),
          )
        }
      />
    </Field>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={styles.check}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) =>
          onChange(
            event.target.checked,
          )
        }
      />
      {label}
    </label>
  );
}

function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.sectionTitle}>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      {action}
    </div>
  );
}

function Empty({
  show,
  text,
}: {
  show: boolean;
  text: string;
}) {
  if (!show) {
    return null;
  }

  return (
    <div className={styles.empty}>
      <strong>{text}</strong>
      <span>
        Use el botón superior para
        agregar registros.
      </span>
    </div>
  );
}

export default function ProductoForm({
  mode,
  initial,
  onSave,
}: Props) {
  const [tab, setTab] =
    useState<TabId>("general");

  const [form, setForm] =
    useState<NuevoProductoDemo>(
      () => initialForm(initial),
    );

  const [
    proveedoresCatalogo,
    setProveedoresCatalogo,
  ] = useState<ProveedorOpcion[]>(
    [],
  );

  const [
    productosCatalogo,
    setProductosCatalogo,
  ] = useState<ProductoDemo[]>(
    [],
  );

  const [error, setError] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  useEffect(() => {
    const proveedores =
      obtenerProveedoresParaProducto();

    setProveedoresCatalogo(
      proveedores.length
        ? proveedores
        : [
            {
              id: "demo-prv-001",
              codigo: "PRV-000001",
              nombre:
                "ALIMENTOS DEL PARAGUAY S.A.",
            },
            {
              id: "demo-prv-002",
              codigo: "PRV-000002",
              nombre:
                "BEBIDAS NACIONALES S.A.",
            },
          ],
    );

    setProductosCatalogo(
      obtenerProductosDemo().filter(
        (producto) =>
          producto.id !==
          initial?.id,
      ),
    );
  }, [initial?.id]);

  function update<
    K extends keyof NuevoProductoDemo,
  >(
    key: K,
    value: NuevoProductoDemo[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  const sectionDone =
    useMemo(() => {
      return {
        general: Boolean(
          form.descripcion &&
            form.unidadMedidaId,
        ),
        sifen: Boolean(
          form.descripcionFactura ||
            form.codigoSifen ||
            form.codigos.length,
        ),
        stock:
          !form.controlaStock ||
          form.stockMinimo > 0 ||
          form.depositos.length > 0,
        compras:
          form.unidades.length > 0 ||
          form.proveedores.length > 0,
        logistica:
          form.pesoBrutoKg > 0 ||
          form.volumenM3 > 0,
        kit:
          form.alternativos.length > 0 ||
          form.componentes.length > 0,
        documentos:
          form.documentos.length > 0,
      } satisfies Record<
        TabId,
        boolean
      >;
    }, [form]);

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");

    if (!form.descripcion.trim()) {
      setTab("general");
      setError(
        "Ingrese la descripción interna del producto.",
      );
      return;
    }

    if (!form.unidadMedidaId) {
      setTab("general");
      setError(
        "Seleccione la unidad base.",
      );
      return;
    }

    if (
      !form.descripcionFactura.trim()
    ) {
      setTab("sifen");
      setError(
        "Ingrese la descripción para factura.",
      );
      return;
    }

    setSaving(true);

    try {
      await onSave({
        ...form,
        codigo: form.codigo.trim(),
        codigoInventario:
          form.codigoInventario.trim(),
        codigoSifen:
          form.codigoSifen.trim(),
        codigoBarras:
          form.codigoBarras.trim(),
        descripcion:
          form.descripcion
            .trim()
            .toUpperCase(),
        descripcionFactura:
          form.descripcionFactura.trim(),
        familiaNombre:
          form.familiaNombre.trim(),
        lineaNombre:
          form.lineaNombre.trim(),
        procedencia:
          form.procedencia.trim(),
        valorVentaReferencia:
          Number(
            form.precioVentaReferencia || 0,
          ) *
          Number(
            form.stockActual || 0,
          ),
        imagenUrl:
          form.imagenUrl.trim(),
        observacion:
          form.observacion.trim(),
      });
    } catch {
      setError(
        mode === "create"
          ? "No fue posible registrar el producto."
          : "No fue posible actualizar el producto.",
      );
    } finally {
      setSaving(false);
    }
  }

  function addCodigo() {
    const item: ProductoCodigo = {
      id: uid("codigo"),
      tipo: "GTIN",
      codigo: "",
      descripcion: "",
      esPrincipal:
        form.codigos.length === 0,
    };

    update("codigos", [
      ...form.codigos,
      item,
    ]);
  }

  function addPresentacion() {
    const item:
      ProductoPresentacion = {
      id: uid("presentacion"),
      unidadMedidaId: "",
      nombrePresentacion: "",
      factorConversion: 1,
      esUnidadBase: false,
      esUnidadCompra: false,
      esUnidadVenta: true,
      codigoBarras: "",
      pesoBrutoKg: 0,
      volumenM3: 0,
    };

    update("unidades", [
      ...form.unidades,
      item,
    ]);
  }

  function addProveedor() {
    const item:
      ProductoProveedor = {
      id: uid("proveedor"),
      proveedorId: "",
      proveedorNombre: "",
      codigoProveedor: "",
      descripcionProveedor: "",
      unidadMedidaId: "",
      factorConversion: 1,
      costoReferencia: 0,
      monedaCodigo: "PYG",
      cantidadMinimaCompra: 0,
      plazoEntregaDias: 0,
      esPrincipal:
        form.proveedores.length ===
        0,
    };

    update("proveedores", [
      ...form.proveedores,
      item,
    ]);
  }

  function addDeposito() {
    const item:
      ProductoDeposito = {
      id: uid("deposito"),
      depositoId: "",
      depositoNombre: "",
      ubicacionPreferidaId: "",
      stockMinimo: 0,
      stockMaximo: 0,
      puntoReposicion: 0,
      cantidadReposicion: 0,
    };

    update("depositos", [
      ...form.depositos,
      item,
    ]);
  }

  function addAlternativo() {
    const item:
      ProductoAlternativo = {
      id: uid("alternativo"),
      productoAlternativoId: "",
      productoAlternativoNombre: "",
      tipo: "SUSTITUTO",
      prioridad: 1,
    };

    update("alternativos", [
      ...form.alternativos,
      item,
    ]);
  }

  function addComponente() {
    const item:
      ProductoComponente = {
      id: uid("componente"),
      productoComponenteId: "",
      productoComponenteNombre: "",
      cantidad: 1,
      esOpcional: false,
      orden:
        form.componentes.length + 1,
    };

    update("componentes", [
      ...form.componentes,
      item,
    ]);
  }

  function addDocumento() {
    const item:
      ProductoDocumento = {
      id: uid("documento"),
      tipo: "FICHA_TECNICA",
      nombreArchivo: "",
      urlArchivo: "",
      fechaEmision: "",
      fechaVencimiento: "",
      observacion: "",
    };

    update("documentos", [
      ...form.documentos,
      item,
    ]);
  }

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.heroMeta}>
            <span className={styles.modulePill}>
              PRODUCTOS
            </span>
            <span className={styles.demoPill}>
              DEMO
            </span>
          </div>

          <h1>
            {mode === "create"
              ? "Nuevo producto"
              : "Editar producto"}
          </h1>

          <p>
            Catálogo comercial,
            inventario, compras y datos
            de facturación.
          </p>
        </div>

        <Link
          href="/productos"
          className={styles.secondaryButton}
        >
          ← Volver a productos
        </Link>
      </header>

      <form
        className={styles.card}
        onSubmit={submit}
      >
        <div className={styles.cardHeader}>
          <div>
            <span className={styles.cardEyebrow}>
              {mode === "create"
                ? "ALTA DE PRODUCTO"
                : "FICHA DEL PRODUCTO"}
            </span>

            <h2>
              {initial?.codigo ??
                "Código automático"}
            </h2>

            <p>
              {mode === "create"
                ? "El código interno se generará al guardar si se deja vacío."
                : `Última actualización: ${
                    initial
                      ? new Date(
                          initial.actualizadoEn,
                        ).toLocaleString(
                          "es-PY",
                        )
                      : ""
                  }`}
            </p>
          </div>

          {initial ? (
            <div className={styles.statusGroup}>
              <span
                className={
                  form.activo
                    ? styles.statusActive
                    : styles.statusInactive
                }
              >
                {form.activo
                  ? "Activo"
                  : "Inactivo"}
              </span>

              <span className={styles.statusNeutral}>
                {form.tipoProducto.replaceAll(
                  "_",
                  " ",
                )}
              </span>
            </div>
          ) : (
            <div className={styles.autoCode}>
              <span>✓</span>
              <div>
                <strong>
                  Código automático
                </strong>
                <small>
                  PRD-0000XX
                </small>
              </div>
            </div>
          )}
        </div>

        {error ? (
          <div className={styles.error}>
            {error}
          </div>
        ) : null}

        <nav className={styles.tabs}>
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={[
                styles.tab,
                tab === item.id
                  ? styles.tabActive
                  : "",
              ].join(" ")}
              onClick={() =>
                setTab(item.id)
              }
            >
              <span
                className={[
                  styles.tabDot,
                  sectionDone[item.id]
                    ? styles.tabDone
                    : "",
                ].join(" ")}
              >
                {sectionDone[item.id]
                  ? "✓"
                  : "•"}
              </span>

              {item.label}
            </button>
          ))}
        </nav>

        <div className={styles.content}>
          {tab === "general" ? (
            <>
              <SectionTitle
                title="Información comercial"
                description="Identificación, clasificación y disponibilidad comercial del producto."
              />

              <div className={styles.gridFour}>
                <Field label="Código interno">
                  <input
                    value={form.codigo}
                    placeholder="Automático"
                    onChange={(event) =>
                      update(
                        "codigo",
                        event.target.value,
                      )
                    }
                  />
                </Field>

                <Field label="Código inventario">
                  <input
                    value={form.codigoInventario}
                    placeholder="Código del inventario del cliente"
                    onChange={(event) =>
                      update(
                        "codigoInventario",
                        event.target.value,
                      )
                    }
                  />
                </Field>

                <Field label="Descripción interna *">
                  <input
                    value={form.descripcion}
                    onChange={(event) =>
                      update(
                        "descripcion",
                        event.target.value,
                      )
                    }
                  />
                </Field>

                <Field label="Descripción para factura *">
                  <input
                    maxLength={120}
                    value={form.descripcionFactura}
                    onChange={(event) =>
                      update(
                        "descripcionFactura",
                        event.target.value,
                      )
                    }
                  />
                </Field>
              </div>

              <div className={styles.gridFour}>
                <Field label="Tipo de producto *">
                  <select
                    value={form.tipoProducto}
                    onChange={(event) =>
                      update(
                        "tipoProducto",
                        event.target
                          .value as ProductoTipo,
                      )
                    }
                  >
                    <option value="MERCADERIA">
                      Mercadería
                    </option>
                    <option value="SERVICIO">
                      Servicio
                    </option>
                    <option value="KIT">
                      Kit / combo
                    </option>
                    <option value="ACTIVO_FIJO">
                      Activo fijo
                    </option>
                  </select>
                </Field>

                <Field label="Unidad base *">
                  <select
                    value={form.unidadMedidaId}
                    onChange={(event) => {
                      const id =
                        event.target.value;

                      update(
                        "unidadMedidaId",
                        id,
                      );
                      update(
                        "unidadMedidaNombre",
                        findName(
                          id,
                          PRODUCTO_UNIDADES,
                        ),
                      );
                    }}
                  >
                    <option value="">
                      Seleccione unidad
                    </option>

                    {PRODUCTO_UNIDADES.map(
                      (item) => (
                        <option
                          key={item.id}
                          value={item.id}
                        >
                          {item.codigo} ·{" "}
                          {item.nombre}
                        </option>
                      ),
                    )}
                  </select>
                </Field>

                <Field label="Categoría">
                  <select
                    value={form.categoriaId}
                    onChange={(event) => {
                      const id =
                        event.target.value;

                      update(
                        "categoriaId",
                        id,
                      );
                      update(
                        "categoriaNombre",
                        findName(
                          id,
                          PRODUCTO_CATEGORIAS,
                        ),
                      );
                    }}
                  >
                    <option value="">
                      Sin categoría
                    </option>

                    {PRODUCTO_CATEGORIAS.map(
                      (item) => (
                        <option
                          key={item.id}
                          value={item.id}
                        >
                          {item.codigo} ·{" "}
                          {item.nombre}
                        </option>
                      ),
                    )}
                  </select>
                </Field>

                <Field label="Marca">
                  <select
                    value={form.marcaId}
                    onChange={(event) => {
                      const id =
                        event.target.value;

                      update(
                        "marcaId",
                        id,
                      );
                      update(
                        "marcaNombre",
                        findName(
                          id,
                          PRODUCTO_MARCAS,
                        ),
                      );
                    }}
                  >
                    <option value="">
                      Sin marca
                    </option>

                    {PRODUCTO_MARCAS.map(
                      (item) => (
                        <option
                          key={item.id}
                          value={item.id}
                        >
                          {item.codigo} ·{" "}
                          {item.nombre}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
              </div>

              <div className={styles.gridFour}>
                <Field label="Familia">
                  <select
                    value={form.familiaNombre}
                    onChange={(event) => {
                      const value =
                        event.target.value;

                      update(
                        "familiaNombre",
                        value,
                      );

                      const lineas =
                        LINEAS_POR_FAMILIA[
                          value
                        ] ?? [];

                      if (
                        form.lineaNombre &&
                        !lineas.includes(
                          form.lineaNombre,
                        )
                      ) {
                        update(
                          "lineaNombre",
                          "",
                        );
                      }
                    }}
                  >
                    <option value="">
                      Seleccione familia
                    </option>

                    {FAMILIAS_INVENTARIO.map(
                      (familia) => (
                        <option
                          key={familia}
                          value={familia}
                        >
                          {familia}
                        </option>
                      ),
                    )}
                  </select>
                </Field>

                <Field label="Línea">
                  <select
                    value={form.lineaNombre}
                    disabled={!form.familiaNombre}
                    onChange={(event) =>
                      update(
                        "lineaNombre",
                        event.target.value,
                      )
                    }
                  >
                    <option value="">
                      {form.familiaNombre
                        ? "Seleccione línea"
                        : "Seleccione familia primero"}
                    </option>

                    {(
                      LINEAS_POR_FAMILIA[
                        form.familiaNombre
                      ] ?? []
                    ).map((linea) => (
                      <option
                        key={linea}
                        value={linea}
                      >
                        {linea}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Procedencia">
                  <select
                    value={form.procedencia}
                    onChange={(event) =>
                      update(
                        "procedencia",
                        event.target.value,
                      )
                    }
                  >
                    <option value="">
                      Seleccione procedencia
                    </option>

                    {PROCEDENCIAS_INVENTARIO.map(
                      (procedencia) => (
                        <option
                          key={procedencia}
                          value={procedencia}
                        >
                          {procedencia}
                        </option>
                      ),
                    )}
                  </select>
                </Field>

                <Field label="Impuesto / IVA">
                  <select
                    value={form.impuestoId}
                    onChange={(event) => {
                      const id =
                        event.target.value;

                      update(
                        "impuestoId",
                        id,
                      );
                      update(
                        "impuestoNombre",
                        findName(
                          id,
                          PRODUCTO_IMPUESTOS,
                        ),
                      );
                    }}
                  >
                    {PRODUCTO_IMPUESTOS.map(
                      (item) => (
                        <option
                          key={item.id}
                          value={item.id}
                        >
                          {item.nombre}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
              </div>

              <div className={styles.gridFour}>
                <NumberField
                  label="Precio venta referencia"
                  value={form.precioVentaReferencia}
                  onChange={(value) =>
                    update(
                      "precioVentaReferencia",
                      value,
                    )
                  }
                />

                <Field label="Valor venta referencia">
                  <input
                    value={new Intl.NumberFormat(
                      "es-PY",
                      {
                        maximumFractionDigits: 0,
                      },
                    ).format(
                      Number(
                        form.precioVentaReferencia ||
                          0,
                      ) *
                        Number(
                          form.stockActual || 0,
                        ),
                    )}
                    readOnly
                  />
                </Field>

                <Field label="Imagen URL">
                  <input
                    value={form.imagenUrl}
                    onChange={(event) =>
                      update(
                        "imagenUrl",
                        event.target.value,
                      )
                    }
                  />
                </Field>

                <Field label="País de origen">
                  <select
                    value={form.paisOrigenCodigo}
                    onChange={(event) => {
                      const code =
                        event.target.value;

                      const country =
                        PAISES.find(
                          ([value]) =>
                            value === code,
                        );

                      update(
                        "paisOrigenCodigo",
                        code,
                      );
                      update(
                        "paisOrigenNombre",
                        country?.[1] ?? "",
                      );
                    }}
                  >
                    {PAISES.map(
                      ([code, name]) => (
                        <option
                          key={code}
                          value={code}
                        >
                          {code} · {name}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
              </div>

              <div className={styles.checkGrid}>
                <Check
                  label="Producto vendible"
                  checked={form.vendible}
                  onChange={(value) =>
                    update("vendible", value)
                  }
                />

                <Check
                  label="Producto comprable"
                  checked={form.comprable}
                  onChange={(value) =>
                    update("comprable", value)
                  }
                />

                <Check
                  label="Permite stock de terceros"
                  checked={form.permiteTerceros}
                  onChange={(value) =>
                    update(
                      "permiteTerceros",
                      value,
                    )
                  }
                />

                {mode === "edit" ? (
                  <Check
                    label="Producto activo"
                    checked={form.activo}
                    onChange={(value) =>
                      update("activo", value)
                    }
                  />
                ) : null}
              </div>
            </>
          ) : null}

          {tab === "sifen" ? (
            <>
              <SectionTitle
                title="SIFEN y códigos"
                description="Datos que se utilizarán como ítem del Documento Electrónico."
              />

              <div className={styles.gridFour}>
                <Field label="Código SIFEN">
                  <input
                    maxLength={20}
                    value={form.codigoSifen}
                    onChange={(event) =>
                      update(
                        "codigoSifen",
                        event.target.value,
                      )
                    }
                  />
                </Field>

                <Field label="Descripción para factura *">
                  <input
                    maxLength={120}
                    value={form.descripcionFactura}
                    onChange={(event) =>
                      update(
                        "descripcionFactura",
                        event.target.value,
                      )
                    }
                  />
                </Field>

                <Field label="NCM">
                  <input
                    value={form.ncm}
                    onChange={(event) =>
                      update(
                        "ncm",
                        event.target.value,
                      )
                    }
                  />
                </Field>

                <Field label="Partida arancelaria">
                  <input
                    value={form.partidaArancelaria}
                    onChange={(event) =>
                      update(
                        "partidaArancelaria",
                        event.target.value,
                      )
                    }
                  />
                </Field>
              </div>

              <div className={styles.gridFour}>
                <Field label="DNCP general">
                  <input
                    value={form.dncpGeneral}
                    onChange={(event) =>
                      update(
                        "dncpGeneral",
                        event.target.value,
                      )
                    }
                  />
                </Field>

                <Field label="DNCP específico">
                  <input
                    value={form.dncpEspecifico}
                    onChange={(event) =>
                      update(
                        "dncpEspecifico",
                        event.target.value,
                      )
                    }
                  />
                </Field>

                <Field label="País de origen">
                  <select
                    value={form.paisOrigenCodigo}
                    onChange={(event) => {
                      const code =
                        event.target.value;

                      const country =
                        PAISES.find(
                          ([value]) =>
                            value === code,
                        );

                      update(
                        "paisOrigenCodigo",
                        code,
                      );
                      update(
                        "paisOrigenNombre",
                        country?.[1] ?? "",
                      );
                    }}
                  >
                    {PAISES.map(
                      ([code, name]) => (
                        <option
                          key={code}
                          value={code}
                        >
                          {code} · {name}
                        </option>
                      ),
                    )}
                  </select>
                </Field>

                <Field label="Código de barras principal">
                  <input
                    value={form.codigoBarras}
                    onChange={(event) =>
                      update(
                        "codigoBarras",
                        event.target.value,
                      )
                    }
                  />
                </Field>
              </div>

              <Field label="Información adicional en factura">
                <textarea
                  value={form.informacionFactura}
                  onChange={(event) =>
                    update(
                      "informacionFactura",
                      event.target.value,
                    )
                  }
                />
              </Field>

              <SectionTitle
                title="Códigos de barras y GTIN"
                description="Identificadores adicionales del producto."
                action={
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={addCodigo}
                  >
                    ＋ Agregar código
                  </button>
                }
              />

              <Empty
                show={form.codigos.length === 0}
                text="Sin códigos adicionales."
              />

              <div className={styles.repeaterList}>
                {form.codigos.map(
                  (codigo, index) => (
                    <article
                      key={codigo.id}
                      className={styles.repeaterCard}
                    >
                      <header>
                        <strong>
                          Código {index + 1}
                        </strong>
                        <button
                          type="button"
                          onClick={() =>
                            update(
                              "codigos",
                              form.codigos.filter(
                                (item) =>
                                  item.id !==
                                  codigo.id,
                              ),
                            )
                          }
                        >
                          Eliminar
                        </button>
                      </header>

                      <div className={styles.gridFour}>
                        <Field label="Tipo">
                          <select
                            value={codigo.tipo}
                            onChange={(event) =>
                              update(
                                "codigos",
                                form.codigos.map(
                                  (item) =>
                                    item.id ===
                                    codigo.id
                                      ? {
                                          ...item,
                                          tipo:
                                            event.target
                                              .value as ProductoCodigo["tipo"],
                                        }
                                      : item,
                                ),
                              )
                            }
                          >
                            <option value="GTIN">
                              GTIN producto
                            </option>
                            <option value="GTIN_EMPAQUE">
                              GTIN empaque
                            </option>
                            <option value="EAN">
                              EAN
                            </option>
                            <option value="UPC">
                              UPC
                            </option>
                            <option value="CODIGO_ALTERNO">
                              Código alterno
                            </option>
                            <option value="OTRO">
                              Otro
                            </option>
                          </select>
                        </Field>

                        <Field label="Código">
                          <input
                            value={codigo.codigo}
                            onChange={(event) =>
                              update(
                                "codigos",
                                form.codigos.map(
                                  (item) =>
                                    item.id ===
                                    codigo.id
                                      ? {
                                          ...item,
                                          codigo:
                                            event.target
                                              .value,
                                        }
                                      : item,
                                ),
                              )
                            }
                          />
                        </Field>

                        <Field label="Descripción">
                          <input
                            value={codigo.descripcion}
                            onChange={(event) =>
                              update(
                                "codigos",
                                form.codigos.map(
                                  (item) =>
                                    item.id ===
                                    codigo.id
                                      ? {
                                          ...item,
                                          descripcion:
                                            event.target
                                              .value,
                                        }
                                      : item,
                                ),
                              )
                            }
                          />
                        </Field>

                        <div className={styles.inlineCheck}>
                          <Check
                            label="Principal"
                            checked={codigo.esPrincipal}
                            onChange={(value) =>
                              update(
                                "codigos",
                                form.codigos.map(
                                  (item) => ({
                                    ...item,
                                    esPrincipal:
                                      item.id ===
                                      codigo.id
                                        ? value
                                        : value
                                          ? false
                                          : item.esPrincipal,
                                  }),
                                ),
                              )
                            }
                          />
                        </div>
                      </div>
                    </article>
                  ),
                )}
              </div>
            </>
          ) : null}

          {tab === "stock" ? (
            <>
              <SectionTitle
                title="Inventario y trazabilidad"
                description="Políticas del producto; el stock real será calculado por el kardex."
              />

              <div className={styles.gridFour}>
                <Field label="Control de stock">
                  <select
                    value={form.modoControlStock}
                    onChange={(event) =>
                      update(
                        "modoControlStock",
                        event.target
                          .value as ProductoModoControlStock,
                      )
                    }
                  >
                    <option value="CANTIDAD">
                      Por cantidad
                    </option>
                    <option value="LOTE">
                      Por lote
                    </option>
                    <option value="UNIDAD_ETIQUETADA">
                      Por serie / etiqueta
                    </option>
                  </select>
                </Field>

                <NumberField
                  label="Stock mínimo"
                  value={form.stockMinimo}
                  onChange={(value) =>
                    update(
                      "stockMinimo",
                      value,
                    )
                  }
                />

                <NumberField
                  label="Stock máximo"
                  value={form.stockMaximo}
                  onChange={(value) =>
                    update(
                      "stockMaximo",
                      value,
                    )
                  }
                />

                <NumberField
                  label="Punto de reposición"
                  value={form.puntoReposicion}
                  onChange={(value) =>
                    update(
                      "puntoReposicion",
                      value,
                    )
                  }
                />
              </div>

              <div className={styles.gridFour}>
                <NumberField
                  label="Inventario inicial"
                  value={form.inventarioInicial}
                  onChange={(value) => {
                    update(
                      "inventarioInicial",
                      value,
                    );

                    if (
                      mode === "create"
                    ) {
                      update(
                        "stockActual",
                        value,
                      );
                    }
                  }}
                />

                <NumberField
                  label="Stock actual demo"
                  value={form.stockActual}
                  onChange={(value) =>
                    update(
                      "stockActual",
                      value,
                    )
                  }
                />

                <NumberField
                  label="Costo promedio"
                  value={form.costoPromedio}
                  onChange={(value) =>
                    update(
                      "costoPromedio",
                      value,
                    )
                  }
                />

                <NumberField
                  label="Vida útil (días)"
                  value={form.vidaUtilDias}
                  onChange={(value) =>
                    update(
                      "vidaUtilDias",
                      value,
                    )
                  }
                />
              </div>

              <div className={styles.checkGrid}>
                <Check
                  label="Controla stock"
                  checked={form.controlaStock}
                  onChange={(value) =>
                    update(
                      "controlaStock",
                      value,
                    )
                  }
                />

                <Check
                  label="Requiere vencimiento"
                  checked={form.requiereVencimiento}
                  onChange={(value) =>
                    update(
                      "requiereVencimiento",
                      value,
                    )
                  }
                />

                <Check
                  label="Requiere inspección de calidad"
                  checked={form.requiereInspeccionCalidad}
                  onChange={(value) =>
                    update(
                      "requiereInspeccionCalidad",
                      value,
                    )
                  }
                />
              </div>

              <SectionTitle
                title="Políticas por depósito"
                description="Stock mínimo, máximo y reposición por depósito."
                action={
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={addDeposito}
                  >
                    ＋ Agregar depósito
                  </button>
                }
              />

              <Empty
                show={form.depositos.length === 0}
                text="Sin políticas por depósito."
              />

              <div className={styles.repeaterList}>
                {form.depositos.map(
                  (deposito, index) => (
                    <article
                      key={deposito.id}
                      className={styles.repeaterCard}
                    >
                      <header>
                        <strong>
                          Depósito {index + 1}
                        </strong>
                        <button
                          type="button"
                          onClick={() =>
                            update(
                              "depositos",
                              form.depositos.filter(
                                (item) =>
                                  item.id !==
                                  deposito.id,
                              ),
                            )
                          }
                        >
                          Eliminar
                        </button>
                      </header>

                      <div className={styles.gridFour}>
                        <Field label="Depósito">
                          <select
                            value={deposito.depositoId}
                            onChange={(event) => {
                              const id =
                                event.target.value;

                              update(
                                "depositos",
                                form.depositos.map(
                                  (item) =>
                                    item.id ===
                                    deposito.id
                                      ? {
                                          ...item,
                                          depositoId:
                                            id,
                                          depositoNombre:
                                            findName(
                                              id,
                                              PRODUCTO_DEPOSITOS,
                                            ),
                                        }
                                      : item,
                                ),
                              );
                            }}
                          >
                            <option value="">
                              Seleccione depósito
                            </option>

                            {PRODUCTO_DEPOSITOS.map(
                              (item) => (
                                <option
                                  key={item.id}
                                  value={item.id}
                                >
                                  {item.codigo} ·{" "}
                                  {item.nombre}
                                </option>
                              ),
                            )}
                          </select>
                        </Field>

                        <NumberField
                          label="Stock mínimo"
                          value={deposito.stockMinimo}
                          onChange={(value) =>
                            update(
                              "depositos",
                              form.depositos.map(
                                (item) =>
                                  item.id ===
                                  deposito.id
                                    ? {
                                        ...item,
                                        stockMinimo:
                                          value,
                                      }
                                    : item,
                              ),
                            )
                          }
                        />

                        <NumberField
                          label="Stock máximo"
                          value={deposito.stockMaximo}
                          onChange={(value) =>
                            update(
                              "depositos",
                              form.depositos.map(
                                (item) =>
                                  item.id ===
                                  deposito.id
                                    ? {
                                        ...item,
                                        stockMaximo:
                                          value,
                                      }
                                    : item,
                              ),
                            )
                          }
                        />

                        <NumberField
                          label="Cantidad a reponer"
                          value={deposito.cantidadReposicion}
                          onChange={(value) =>
                            update(
                              "depositos",
                              form.depositos.map(
                                (item) =>
                                  item.id ===
                                  deposito.id
                                    ? {
                                        ...item,
                                        cantidadReposicion:
                                          value,
                                      }
                                    : item,
                              ),
                            )
                          }
                        />
                      </div>
                    </article>
                  ),
                )}
              </div>
            </>
          ) : null}

          {tab === "compras" ? (
            <>
              <SectionTitle
                title="Presentaciones y conversiones"
                description="Unidades alternativas utilizadas en compras y ventas."
                action={
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={addPresentacion}
                  >
                    ＋ Agregar presentación
                  </button>
                }
              />

              <Empty
                show={form.unidades.length === 0}
                text="Sin presentaciones adicionales."
              />

              <div className={styles.repeaterList}>
                {form.unidades.map(
                  (unidad, index) => (
                    <article
                      key={unidad.id}
                      className={styles.repeaterCard}
                    >
                      <header>
                        <strong>
                          Presentación {index + 1}
                        </strong>
                        <button
                          type="button"
                          onClick={() =>
                            update(
                              "unidades",
                              form.unidades.filter(
                                (item) =>
                                  item.id !==
                                  unidad.id,
                              ),
                            )
                          }
                        >
                          Eliminar
                        </button>
                      </header>

                      <div className={styles.gridFour}>
                        <Field label="Unidad">
                          <select
                            value={unidad.unidadMedidaId}
                            onChange={(event) =>
                              update(
                                "unidades",
                                form.unidades.map(
                                  (item) =>
                                    item.id ===
                                    unidad.id
                                      ? {
                                          ...item,
                                          unidadMedidaId:
                                            event.target
                                              .value,
                                        }
                                      : item,
                                ),
                              )
                            }
                          >
                            <option value="">
                              Seleccione unidad
                            </option>

                            {PRODUCTO_UNIDADES.map(
                              (item) => (
                                <option
                                  key={item.id}
                                  value={item.id}
                                >
                                  {item.codigo} ·{" "}
                                  {item.nombre}
                                </option>
                              ),
                            )}
                          </select>
                        </Field>

                        <Field label="Presentación">
                          <input
                            value={unidad.nombrePresentacion}
                            onChange={(event) =>
                              update(
                                "unidades",
                                form.unidades.map(
                                  (item) =>
                                    item.id ===
                                    unidad.id
                                      ? {
                                          ...item,
                                          nombrePresentacion:
                                            event.target
                                              .value,
                                        }
                                      : item,
                                ),
                              )
                            }
                          />
                        </Field>

                        <NumberField
                          label="Factor"
                          value={unidad.factorConversion}
                          onChange={(value) =>
                            update(
                              "unidades",
                              form.unidades.map(
                                (item) =>
                                  item.id ===
                                  unidad.id
                                    ? {
                                        ...item,
                                        factorConversion:
                                          value,
                                      }
                                    : item,
                              ),
                            )
                          }
                        />

                        <Field label="Código de barras">
                          <input
                            value={unidad.codigoBarras}
                            onChange={(event) =>
                              update(
                                "unidades",
                                form.unidades.map(
                                  (item) =>
                                    item.id ===
                                    unidad.id
                                      ? {
                                          ...item,
                                          codigoBarras:
                                            event.target
                                              .value,
                                        }
                                      : item,
                                ),
                              )
                            }
                          />
                        </Field>
                      </div>
                    </article>
                  ),
                )}
              </div>

              <SectionTitle
                title="Proveedores del producto"
                description="Códigos, costos y condiciones de abastecimiento por proveedor."
                action={
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={addProveedor}
                  >
                    ＋ Agregar proveedor
                  </button>
                }
              />

              <Empty
                show={form.proveedores.length === 0}
                text="Sin proveedores asociados."
              />

              <div className={styles.repeaterList}>
                {form.proveedores.map(
                  (proveedor, index) => (
                    <article
                      key={proveedor.id}
                      className={styles.repeaterCard}
                    >
                      <header>
                        <strong>
                          Proveedor {index + 1}
                        </strong>
                        <button
                          type="button"
                          onClick={() =>
                            update(
                              "proveedores",
                              form.proveedores.filter(
                                (item) =>
                                  item.id !==
                                  proveedor.id,
                              ),
                            )
                          }
                        >
                          Eliminar
                        </button>
                      </header>

                      <div className={styles.gridFour}>
                        <Field label="Proveedor">
                          <select
                            value={proveedor.proveedorId}
                            onChange={(event) => {
                              const id =
                                event.target.value;
                              const found =
                                proveedoresCatalogo.find(
                                  (item) =>
                                    item.id === id,
                                );

                              update(
                                "proveedores",
                                form.proveedores.map(
                                  (item) =>
                                    item.id ===
                                    proveedor.id
                                      ? {
                                          ...item,
                                          proveedorId:
                                            id,
                                          proveedorNombre:
                                            found?.nombre ??
                                            "",
                                        }
                                      : item,
                                ),
                              );
                            }}
                          >
                            <option value="">
                              Seleccione proveedor
                            </option>

                            {proveedoresCatalogo.map(
                              (item) => (
                                <option
                                  key={item.id}
                                  value={item.id}
                                >
                                  {item.codigo} ·{" "}
                                  {item.nombre}
                                </option>
                              ),
                            )}
                          </select>
                        </Field>

                        <Field label="Código del proveedor">
                          <input
                            value={proveedor.codigoProveedor}
                            onChange={(event) =>
                              update(
                                "proveedores",
                                form.proveedores.map(
                                  (item) =>
                                    item.id ===
                                    proveedor.id
                                      ? {
                                          ...item,
                                          codigoProveedor:
                                            event.target
                                              .value,
                                        }
                                      : item,
                                ),
                              )
                            }
                          />
                        </Field>

                        <NumberField
                          label="Costo referencia"
                          value={proveedor.costoReferencia}
                          onChange={(value) =>
                            update(
                              "proveedores",
                              form.proveedores.map(
                                (item) =>
                                  item.id ===
                                  proveedor.id
                                    ? {
                                        ...item,
                                        costoReferencia:
                                          value,
                                      }
                                    : item,
                              ),
                            )
                          }
                        />

                        <NumberField
                          label="Plazo (días)"
                          value={proveedor.plazoEntregaDias}
                          onChange={(value) =>
                            update(
                              "proveedores",
                              form.proveedores.map(
                                (item) =>
                                  item.id ===
                                  proveedor.id
                                    ? {
                                        ...item,
                                        plazoEntregaDias:
                                          value,
                                      }
                                    : item,
                              ),
                            )
                          }
                        />
                      </div>

                      <div className={styles.checkGrid}>
                        <Check
                          label="Proveedor principal"
                          checked={proveedor.esPrincipal}
                          onChange={(value) =>
                            update(
                              "proveedores",
                              form.proveedores.map(
                                (item) => ({
                                  ...item,
                                  esPrincipal:
                                    item.id ===
                                    proveedor.id
                                      ? value
                                      : value
                                        ? false
                                        : item.esPrincipal,
                                }),
                              ),
                            )
                          }
                        />
                      </div>
                    </article>
                  ),
                )}
              </div>
            </>
          ) : null}

          {tab === "logistica" ? (
            <>
              <SectionTitle
                title="Logística y merma"
                description="Dimensiones, peso y reglas aplicables a la mercadería."
              />

              <div className={styles.gridFour}>
                <NumberField
                  label="Peso neto (kg)"
                  value={form.pesoNetoKg}
                  step="0.001"
                  onChange={(value) =>
                    update(
                      "pesoNetoKg",
                      value,
                    )
                  }
                />

                <NumberField
                  label="Peso bruto (kg)"
                  value={form.pesoBrutoKg}
                  step="0.001"
                  onChange={(value) =>
                    update(
                      "pesoBrutoKg",
                      value,
                    )
                  }
                />

                <NumberField
                  label="Largo (cm)"
                  value={form.largoCm}
                  step="0.01"
                  onChange={(value) =>
                    update(
                      "largoCm",
                      value,
                    )
                  }
                />

                <NumberField
                  label="Ancho (cm)"
                  value={form.anchoCm}
                  step="0.01"
                  onChange={(value) =>
                    update(
                      "anchoCm",
                      value,
                    )
                  }
                />
              </div>

              <div className={styles.gridThree}>
                <NumberField
                  label="Alto (cm)"
                  value={form.altoCm}
                  step="0.01"
                  onChange={(value) =>
                    update(
                      "altoCm",
                      value,
                    )
                  }
                />

                <NumberField
                  label="Volumen (m³)"
                  value={form.volumenM3}
                  step="0.0001"
                  onChange={(value) =>
                    update(
                      "volumenM3",
                      value,
                    )
                  }
                />

                <Field label="Relación mercadería">
                  <select
                    value={form.relacionMercaderia}
                    onChange={(event) =>
                      update(
                        "relacionMercaderia",
                        event.target.value,
                      )
                    }
                  >
                    <option value="">
                      Sin regla
                    </option>
                    <option value="1">
                      Tolerancia de quiebra
                    </option>
                    <option value="2">
                      Tolerancia de merma
                    </option>
                  </select>
                </Field>
              </div>

              <div className={styles.gridTwo}>
                <NumberField
                  label="Cantidad de merma"
                  value={form.cantidadMerma}
                  onChange={(value) =>
                    update(
                      "cantidadMerma",
                      value,
                    )
                  }
                />

                <NumberField
                  label="Porcentaje de merma"
                  value={form.porcentajeMerma}
                  step="0.01"
                  onChange={(value) =>
                    update(
                      "porcentajeMerma",
                      value,
                    )
                  }
                />
              </div>

              <Field label="Observación interna">
                <textarea
                  value={form.observacion}
                  onChange={(event) =>
                    update(
                      "observacion",
                      event.target.value,
                    )
                  }
                />
              </Field>
            </>
          ) : null}

          {tab === "kit" ? (
            <>
              <SectionTitle
                title="Productos alternativos"
                description="Sustitutos, complementarios y venta sugerida."
                action={
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={addAlternativo}
                  >
                    ＋ Agregar alternativo
                  </button>
                }
              />

              <Empty
                show={form.alternativos.length === 0}
                text="Sin productos alternativos."
              />

              <div className={styles.repeaterList}>
                {form.alternativos.map(
                  (alternativo, index) => (
                    <article
                      key={alternativo.id}
                      className={styles.repeaterCard}
                    >
                      <header>
                        <strong>
                          Alternativo {index + 1}
                        </strong>
                        <button
                          type="button"
                          onClick={() =>
                            update(
                              "alternativos",
                              form.alternativos.filter(
                                (item) =>
                                  item.id !==
                                  alternativo.id,
                              ),
                            )
                          }
                        >
                          Eliminar
                        </button>
                      </header>

                      <div className={styles.gridThree}>
                        <Field label="Producto">
                          <select
                            value={alternativo.productoAlternativoId}
                            onChange={(event) => {
                              const id =
                                event.target.value;
                              const found =
                                productosCatalogo.find(
                                  (item) =>
                                    item.id === id,
                                );

                              update(
                                "alternativos",
                                form.alternativos.map(
                                  (item) =>
                                    item.id ===
                                    alternativo.id
                                      ? {
                                          ...item,
                                          productoAlternativoId:
                                            id,
                                          productoAlternativoNombre:
                                            found?.descripcion ??
                                            "",
                                        }
                                      : item,
                                ),
                              );
                            }}
                          >
                            <option value="">
                              Seleccione producto
                            </option>

                            {productosCatalogo.map(
                              (item) => (
                                <option
                                  key={item.id}
                                  value={item.id}
                                >
                                  {item.codigo} ·{" "}
                                  {item.descripcion}
                                </option>
                              ),
                            )}
                          </select>
                        </Field>

                        <Field label="Tipo">
                          <select
                            value={alternativo.tipo}
                            onChange={(event) =>
                              update(
                                "alternativos",
                                form.alternativos.map(
                                  (item) =>
                                    item.id ===
                                    alternativo.id
                                      ? {
                                          ...item,
                                          tipo:
                                            event.target
                                              .value as ProductoAlternativo["tipo"],
                                        }
                                      : item,
                                ),
                              )
                            }
                          >
                            <option value="SUSTITUTO">
                              Sustituto
                            </option>
                            <option value="COMPLEMENTARIO">
                              Complementario
                            </option>
                            <option value="UPSELL">
                              Venta sugerida
                            </option>
                          </select>
                        </Field>

                        <NumberField
                          label="Prioridad"
                          value={alternativo.prioridad}
                          onChange={(value) =>
                            update(
                              "alternativos",
                              form.alternativos.map(
                                (item) =>
                                  item.id ===
                                  alternativo.id
                                    ? {
                                        ...item,
                                        prioridad:
                                          value,
                                      }
                                    : item,
                              ),
                            )
                          }
                        />
                      </div>
                    </article>
                  ),
                )}
              </div>

              <SectionTitle
                title="Componentes del kit"
                description="Productos y cantidades que componen el kit."
                action={
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={addComponente}
                  >
                    ＋ Agregar componente
                  </button>
                }
              />

              <Empty
                show={form.componentes.length === 0}
                text="Sin componentes."
              />

              <div className={styles.repeaterList}>
                {form.componentes.map(
                  (componente, index) => (
                    <article
                      key={componente.id}
                      className={styles.repeaterCard}
                    >
                      <header>
                        <strong>
                          Componente {index + 1}
                        </strong>
                        <button
                          type="button"
                          onClick={() =>
                            update(
                              "componentes",
                              form.componentes.filter(
                                (item) =>
                                  item.id !==
                                  componente.id,
                              ),
                            )
                          }
                        >
                          Eliminar
                        </button>
                      </header>

                      <div className={styles.gridFour}>
                        <Field label="Producto">
                          <select
                            value={componente.productoComponenteId}
                            onChange={(event) => {
                              const id =
                                event.target.value;
                              const found =
                                productosCatalogo.find(
                                  (item) =>
                                    item.id === id,
                                );

                              update(
                                "componentes",
                                form.componentes.map(
                                  (item) =>
                                    item.id ===
                                    componente.id
                                      ? {
                                          ...item,
                                          productoComponenteId:
                                            id,
                                          productoComponenteNombre:
                                            found?.descripcion ??
                                            "",
                                        }
                                      : item,
                                ),
                              );
                            }}
                          >
                            <option value="">
                              Seleccione producto
                            </option>

                            {productosCatalogo.map(
                              (item) => (
                                <option
                                  key={item.id}
                                  value={item.id}
                                >
                                  {item.codigo} ·{" "}
                                  {item.descripcion}
                                </option>
                              ),
                            )}
                          </select>
                        </Field>

                        <NumberField
                          label="Cantidad"
                          value={componente.cantidad}
                          onChange={(value) =>
                            update(
                              "componentes",
                              form.componentes.map(
                                (item) =>
                                  item.id ===
                                  componente.id
                                    ? {
                                        ...item,
                                        cantidad:
                                          value,
                                      }
                                    : item,
                              ),
                            )
                          }
                        />

                        <NumberField
                          label="Orden"
                          value={componente.orden}
                          onChange={(value) =>
                            update(
                              "componentes",
                              form.componentes.map(
                                (item) =>
                                  item.id ===
                                  componente.id
                                    ? {
                                        ...item,
                                        orden:
                                          value,
                                      }
                                    : item,
                              ),
                            )
                          }
                        />

                        <div className={styles.inlineCheck}>
                          <Check
                            label="Opcional"
                            checked={componente.esOpcional}
                            onChange={(value) =>
                              update(
                                "componentes",
                                form.componentes.map(
                                  (item) =>
                                    item.id ===
                                    componente.id
                                      ? {
                                          ...item,
                                          esOpcional:
                                            value,
                                        }
                                      : item,
                                ),
                              )
                            }
                          />
                        </div>
                      </div>
                    </article>
                  ),
                )}
              </div>
            </>
          ) : null}

          {tab === "documentos" ? (
            <>
              <SectionTitle
                title="Documentos técnicos"
                description="Fichas técnicas, certificados, hojas de seguridad e imágenes."
                action={
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={addDocumento}
                  >
                    ＋ Agregar documento
                  </button>
                }
              />

              <Empty
                show={form.documentos.length === 0}
                text="Sin documentos técnicos."
              />

              <div className={styles.repeaterList}>
                {form.documentos.map(
                  (documento, index) => (
                    <article
                      key={documento.id}
                      className={styles.repeaterCard}
                    >
                      <header>
                        <strong>
                          Documento {index + 1}
                        </strong>
                        <button
                          type="button"
                          onClick={() =>
                            update(
                              "documentos",
                              form.documentos.filter(
                                (item) =>
                                  item.id !==
                                  documento.id,
                              ),
                            )
                          }
                        >
                          Eliminar
                        </button>
                      </header>

                      <div className={styles.gridFour}>
                        <Field label="Tipo">
                          <select
                            value={documento.tipo}
                            onChange={(event) =>
                              update(
                                "documentos",
                                form.documentos.map(
                                  (item) =>
                                    item.id ===
                                    documento.id
                                      ? {
                                          ...item,
                                          tipo:
                                            event.target
                                              .value as ProductoDocumento["tipo"],
                                        }
                                      : item,
                                ),
                              )
                            }
                          >
                            <option value="FICHA_TECNICA">
                              Ficha técnica
                            </option>
                            <option value="HOJA_SEGURIDAD">
                              Hoja de seguridad
                            </option>
                            <option value="CERTIFICADO">
                              Certificado
                            </option>
                            <option value="IMAGEN">
                              Imagen
                            </option>
                            <option value="OTRO">
                              Otro
                            </option>
                          </select>
                        </Field>

                        <Field label="Nombre archivo">
                          <input
                            value={documento.nombreArchivo}
                            onChange={(event) =>
                              update(
                                "documentos",
                                form.documentos.map(
                                  (item) =>
                                    item.id ===
                                    documento.id
                                      ? {
                                          ...item,
                                          nombreArchivo:
                                            event.target
                                              .value,
                                        }
                                      : item,
                                ),
                              )
                            }
                          />
                        </Field>

                        <Field label="URL segura">
                          <input
                            value={documento.urlArchivo}
                            onChange={(event) =>
                              update(
                                "documentos",
                                form.documentos.map(
                                  (item) =>
                                    item.id ===
                                    documento.id
                                      ? {
                                          ...item,
                                          urlArchivo:
                                            event.target
                                              .value,
                                        }
                                      : item,
                                ),
                              )
                            }
                          />
                        </Field>

                        <Field label="Emisión">
                          <input
                            type="date"
                            value={documento.fechaEmision}
                            onChange={(event) =>
                              update(
                                "documentos",
                                form.documentos.map(
                                  (item) =>
                                    item.id ===
                                    documento.id
                                      ? {
                                          ...item,
                                          fechaEmision:
                                            event.target
                                              .value,
                                        }
                                      : item,
                                ),
                              )
                            }
                          />
                        </Field>
                      </div>

                      <div className={styles.gridTwo}>
                        <Field label="Vencimiento">
                          <input
                            type="date"
                            value={documento.fechaVencimiento}
                            onChange={(event) =>
                              update(
                                "documentos",
                                form.documentos.map(
                                  (item) =>
                                    item.id ===
                                    documento.id
                                      ? {
                                          ...item,
                                          fechaVencimiento:
                                            event.target
                                              .value,
                                        }
                                      : item,
                                ),
                              )
                            }
                          />
                        </Field>

                        <Field label="Observación">
                          <input
                            value={documento.observacion}
                            onChange={(event) =>
                              update(
                                "documentos",
                                form.documentos.map(
                                  (item) =>
                                    item.id ===
                                    documento.id
                                      ? {
                                          ...item,
                                          observacion:
                                            event.target
                                              .value,
                                        }
                                      : item,
                                ),
                              )
                            }
                          />
                        </Field>
                      </div>
                    </article>
                  ),
                )}
              </div>
            </>
          ) : null}
        </div>

        <footer className={styles.footer}>
          <div>
            <span>
              Modo demostración
            </span>
            <small>
              Los cambios quedan
              guardados localmente en
              este navegador.
            </small>
          </div>

          <div className={styles.footerActions}>
            <Link
              href="/productos"
              className={styles.cancelButton}
            >
              Cancelar
            </Link>

            <button
              type="submit"
              disabled={saving}
              className={styles.saveButton}
            >
              {saving
                ? mode === "create"
                  ? "Guardando..."
                  : "Actualizando..."
                : mode === "create"
                  ? "Guardar producto"
                  : "Actualizar producto"}
            </button>
          </div>
        </footer>
      </form>
    </section>
  );
}