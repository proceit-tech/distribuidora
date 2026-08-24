"use client";

import { FormEvent, ReactNode, useMemo, useState } from "react";

type Section = "inicio" | "clientes" | "proveedores" | "productos" | "compras" | "inventario" | "pedidos" | "ventas" | "entregas" | "finanzas" | "facturacion";
type Row = (string | ReactNode)[];

const navGroups = [
  { label: "PRINCIPAL", items: [["inicio", "◫", "Panel general"]] },
  { label: "MAESTROS", items: [["clientes", "C", "Clientes"], ["proveedores", "P", "Proveedores"], ["productos", "#", "Productos"]] },
  { label: "OPERACIÓN", items: [["compras", "↙", "Compras"], ["inventario", "▦", "Inventario"], ["pedidos", "≡", "Pedidos"], ["ventas", "↗", "Ventas"], ["entregas", "→", "Entregas"]] },
  { label: "ADMINISTRACIÓN", items: [["finanzas", "$", "Finanzas"], ["facturacion", "F", "Facturación electrónica"]] },
] as const;

const titles: Record<Section, [string, string]> = {
  inicio: ["Panel general", "Resumen operativo de hoy, 18 de agosto de 2026"],
  clientes: ["Clientes", "Cartera comercial, crédito y actividad"],
  proveedores: ["Proveedores", "Condiciones de compra y abastecimiento"],
  productos: ["Productos", "Catálogo, precios y disponibilidad"],
  compras: ["Compras", "Órdenes, recepciones y cuentas por pagar"],
  inventario: ["Inventario", "Existencias por depósito y alertas"],
  pedidos: ["Pedidos", "Seguimiento desde la carga hasta el despacho"],
  ventas: ["Ventas", "Facturación, desempeño y márgenes"],
  entregas: ["Entregas", "Rutas, vehículos y cumplimiento diario"],
  finanzas: ["Finanzas", "Cobranzas, pagos y flujo de caja"],
  facturacion: ["Facturación electrónica", "Emisión y seguimiento de documentos ante SIFEN"],
};

const customers = [
  ["Supermercado El Sol S.A.", "80092341-2", "Asunción", "Gs. 12.850.000", "Activo"],
  ["Comercial San Miguel S.R.L.", "80114592-7", "San Lorenzo", "Gs. 8.640.000", "Activo"],
  ["Market Avenida E.A.S.", "80129983-1", "Fernando de la Mora", "Gs. 4.200.000", "Activo"],
  ["Despensa Don José", "4689021-5", "Lambaré", "Gs. 1.180.000", "En revisión"],
  ["Grupo Norte Comercial S.A.", "80077543-9", "Luque", "Gs. 0", "Activo"],
];

const products = [
  ["ALI-00124", "Aceite vegetal 900 ml", "Alimentos", "2.480 un.", "Gs. 14.500", "Disponible"],
  ["BEB-00218", "Agua mineral 500 ml x 12", "Bebidas", "168 un.", "Gs. 32.000", "Stock bajo"],
  ["LIM-00048", "Detergente líquido 500 ml", "Limpieza", "784 un.", "Gs. 9.800", "Disponible"],
  ["HIG-00103", "Papel higiénico 4 unidades", "Higiene", "74 un.", "Gs. 17.500", "Stock bajo"],
  ["ALI-00317", "Arroz premium 5 kg", "Alimentos", "960 un.", "Gs. 44.500", "Disponible"],
];

const orders = [
  ["PED-02684", "08:42", "Supermercado El Sol S.A.", "Carlos Vera", "Gs. 4.865.000", "En preparación"],
  ["PED-02683", "08:18", "Comercial San Miguel S.R.L.", "Ana Rojas", "Gs. 3.248.000", "Listo para despacho"],
  ["PED-02682", "07:55", "Market Avenida E.A.S.", "Carlos Vera", "Gs. 1.986.000", "Facturado"],
  ["PED-02681", "07:31", "Despensa Don José", "Miguel Benítez", "Gs. 875.000", "Pendiente"],
  ["PED-02680", "07:08", "Grupo Norte Comercial S.A.", "Ana Rojas", "Gs. 5.924.000", "En ruta"],
];

function Status({ children }: { children: string }) {
  const x = children.toLowerCase();
  const tone = x.includes("apro") || x.includes("activo") || x.includes("entregado") || x.includes("disponible") ? "ok" : x.includes("ruta") || x.includes("proces") || x.includes("prepar") ? "info" : x.includes("pend") || x.includes("bajo") || x.includes("revisión") || x.includes("demora") ? "warn" : "plain";
  return <span className={`status ${tone}`}>{children}</span>;
}

function Metrics({ items }: { items: [string, string, string, string?][] }) {
  return <section className={`metrics ${items.length === 3 ? "three" : ""}`}>{items.map(([label, value, note, tone], index) => <article className="metric" key={label}><i className={tone || ["teal", "blue", "amber", "violet"][index]} /><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</section>;
}

function Table({ headers, rows, statusColumn }: { headers: string[]; rows: Row[]; statusColumn?: number }) {
  return <div className="table-scroll"><table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}<th /></tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td className={j === 0 || j === 1 ? "strong" : ""} key={j}>{statusColumn === j && typeof cell === "string" ? <Status>{cell}</Status> : cell}</td>)}<td><button className="more">•••</button></td></tr>)}</tbody></table></div>;
}

function PanelTable({ eyebrow, title, action, headers, rows, statusColumn }: { eyebrow: string; title: string; action: string; headers: string[]; rows: Row[]; statusColumn?: number }) {
  const [query, setQuery] = useState("");
  const filtered = rows.filter(row => row.some(cell => typeof cell === "string" && cell.toLowerCase().includes(query.toLowerCase())));
  return <section className="panel data-panel"><div className="panel-toolbar"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><div className="toolbar"><label className="search small"><b>⌕</b><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar..." /></label><button className="secondary">Exportar</button><button className="primary">＋ {action}</button></div></div><Table headers={headers} rows={filtered} statusColumn={statusColumn} /><footer className="table-footer"><span>Mostrando {filtered.length} de {rows.length} registros</span><div><button>‹</button><button className="selected">1</button><button>2</button><button>›</button></div></footer></section>;
}

function Dashboard({ go }: { go: (s: Section) => void }) {
  return <div className="stack">
    <Metrics items={[["VENTAS DE HOY", "Gs. 48.650.000", "↑ 12,4% frente al martes anterior"], ["PEDIDOS ACTIVOS", "38", "12 listos para despacho"], ["POR COBRAR", "Gs. 86.420.000", "Gs. 9.850.000 vencidos"], ["ENTREGAS DE HOY", "27 / 42", "64% del recorrido completado"]]} />
    <section className="dash-grid">
      <article className="panel chart-panel"><PanelHead eyebrow="DESEMPEÑO COMERCIAL" title="Ventas de los últimos 7 días" action={() => go("ventas")} /><div className="bar-chart"><div className="scale"><span>60M</span><span>45M</span><span>30M</span><span>15M</span><span>0</span></div><div className="bars">{[42,58,46,70,64,88,79].map((h,i)=><div className="bar-col" key={i}><i className={i===5?"active":""} style={{height:`${h}%`}}>{i===5&&<b>54,2M</b>}</i><span>{["Mié","Jue","Vie","Sáb","Lun","Mar","Hoy"][i]}</span></div>)}</div></div></article>
      <article className="panel alerts"><div className="panel-head"><div><span className="eyebrow">ATENCIÓN REQUERIDA</span><h2>Alertas operativas</h2></div><b className="count">5</b></div><Alert tone="amber" symbol="!" title="8 productos con stock bajo" note="Requieren reposición esta semana" click={() => go("inventario")} /><Alert tone="red" symbol="$" title="3 cobros vencidos" note="Total pendiente: Gs. 9.850.000" click={() => go("finanzas")} /><Alert tone="blue" symbol="→" title="2 entregas demoradas" note="Ruta 03 · Zona Central" click={() => go("entregas")} /></article>
    </section>
    <section className="dash-grid lower"><article className="panel"><PanelHead eyebrow="ACTIVIDAD RECIENTE" title="Últimos pedidos" action={() => go("pedidos")} /><Table headers={["Pedido","Cliente","Total","Estado"]} rows={orders.slice(0,4).map(r=>[r[0],r[2],r[4],r[5]])} statusColumn={3}/></article><article className="panel stock-card"><div className="panel-head"><div><span className="eyebrow">INVENTARIO</span><h2>Estado del stock</h2></div></div><div className="donut-wrap"><div className="donut"><span><b>1.248</b><small>productos</small></span></div><div className="legend"><p><i className="green"/>Disponible <b>1.173</b></p><p><i className="yellow"/>Stock bajo <b>58</b></p><p><i className="red"/>Sin stock <b>17</b></p></div></div></article></section>
  </div>;
}

function PanelHead({ eyebrow, title, action }: { eyebrow: string; title: string; action: () => void }) {
  return <div className="panel-head"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button className="link" onClick={action}>Ver reporte →</button></div>;
}

function Alert({ tone, symbol, title, note, click }: { tone: string; symbol: string; title: string; note: string; click: () => void }) {
  return <button className="alert" onClick={click}><i className={tone}>{symbol}</i><span><b>{title}</b><small>{note}</small></span><strong>→</strong></button>;
}

const pageData: Partial<Record<Section, { stats: [string,string,string,string?][]; eyebrow: string; action: string; headers: string[]; rows: Row[]; status?: number }>> = {
  clientes: { stats:[["CLIENTES ACTIVOS","248","12 nuevos este mes"],["CRÉDITO UTILIZADO","Gs. 86.420.000","31% del límite total"],["CON SALDO VENCIDO","12","Gs. 9.850.000","amber"]], eyebrow:"GESTIÓN COMERCIAL", action:"Nuevo cliente", headers:["Cliente","RUC","Ciudad","Saldo pendiente","Estado"], rows:customers, status:4 },
  proveedores: { stats:[["PROVEEDORES ACTIVOS","32","4 categorías principales"],["COMPRAS DEL MES","Gs. 164.250.000","↑ 6,8% sobre julio"],["ÓRDENES ABIERTAS","9","3 en tránsito"]], eyebrow:"ABASTECIMIENTO", action:"Nuevo proveedor", headers:["Proveedor","RUC","Rubro","Condición","Compras del mes"], rows:[["Alimentos del Paraguay S.A.","80015442-8","Alimentos","30 días","Gs. 42.800.000"],["Bebidas Nacionales S.A.","80002119-4","Bebidas","45 días","Gs. 28.450.000"],["Importadora Central S.R.L.","80078312-1","Higiene","Contado","Gs. 12.200.000"],["Limpio Hogar E.A.S.","80124008-7","Limpieza","30 días","Gs. 8.970.000"]] },
  productos: { stats:[["PRODUCTOS ACTIVOS","1.248","18 categorías"],["VALOR DEL INVENTARIO","Gs. 584.320.000","3 depósitos"],["BAJO STOCK MÍNIMO","58","Requieren reposición","amber"]], eyebrow:"CATÁLOGO CENTRAL", action:"Nuevo producto", headers:["Código","Producto","Categoría","Stock","Precio mayorista","Situación"], rows:products, status:5 },
  compras: { stats:[["COMPRAS DEL MES","Gs. 164.250.000","24 órdenes"],["ÓRDENES ABIERTAS","9","3 en tránsito"],["PENDIENTE DE RECIBIR","Gs. 41.680.000","6 proveedores"]], eyebrow:"COMPRAS Y RECEPCIONES", action:"Nueva orden", headers:["Orden","Proveedor","Fecha","Total","Estado"], rows:[["OC-00418","Alimentos del Paraguay S.A.","16/08/2026","Gs. 18.460.000","En tránsito"],["OC-00417","Bebidas Nacionales S.A.","15/08/2026","Gs. 12.850.000","Procesando"],["OC-00416","Limpio Hogar E.A.S.","14/08/2026","Gs. 6.280.000","Aprobado"],["OC-00415","Importadora Central S.R.L.","13/08/2026","Gs. 9.720.000","Pendiente"]], status:4 },
  pedidos: { stats:[["PEDIDOS DE HOY","38","Gs. 81.420.000"],["EN PREPARACIÓN","12","Gs. 22.640.000"],["LISTOS PARA DESPACHO","6","Gs. 11.280.000"]], eyebrow:"FLUJO COMERCIAL", action:"Nuevo pedido", headers:["Pedido","Hora","Cliente","Vendedor","Total","Estado"], rows:orders, status:5 },
};

function StandardPage({ section }: { section: Section }) {
  const data = pageData[section]!;
  return <div className="stack"><Metrics items={data.stats}/><PanelTable eyebrow={data.eyebrow} title="Listado general" action={data.action} headers={data.headers} rows={data.rows} statusColumn={data.status}/></div>;
}

function Inventory() {
  const [filter,setFilter]=useState("Todos");
  const rows=products.filter(r=>filter==="Todos"||r[5]===filter);
  return <div className="stack"><Metrics items={[["VALOR DEL INVENTARIO","Gs. 584.320.000","3 depósitos"],["UNIDADES DISPONIBLES","28.642","1.248 productos"],["BAJO STOCK MÍNIMO","58","Requieren reposición","amber"]]}/><section className="panel warehouse"><div><span className="eyebrow">DEPÓSITOS</span><h2>Disponibilidad consolidada</h2></div>{[["Casa central",72],["Depósito Norte",61],["Depósito Este",84]].map(([name,pct])=><div className="warehouse-item" key={name}><span>{name}</span><b>{pct}%</b><i><em style={{width:`${pct}%`}}/></i></div>)}</section><section className="panel data-panel"><div className="panel-toolbar"><div><span className="eyebrow">CONTROL DE EXISTENCIAS</span><h2>Stock por producto</h2></div><div className="pills">{["Todos","Disponible","Stock bajo"].map(x=><button className={filter===x?"selected":""} onClick={()=>setFilter(x)} key={x}>{x}</button>)}</div></div><Table headers={["Código","Producto","Categoría","Stock","Precio","Situación"]} rows={rows} statusColumn={5}/></section></div>;
}

function Sales() {
  return <div className="stack"><Metrics items={[["VENTAS DEL MES","Gs. 842.650.000","↑ 8,7% sobre julio"],["MARGEN ESTIMADO","23,8%","Objetivo mensual: 24%"],["TICKET PROMEDIO","Gs. 1.284.000","656 operaciones"]]}/><section className="dash-grid"><article className="panel chart-panel"><div className="panel-head"><div><span className="eyebrow">TENDENCIA MENSUAL</span><h2>Ventas acumuladas</h2></div><span className="chip">Agosto 2026</span></div><div className="line-chart"><div className="line-bars">{[24,32,29,48,44,61,57,76,70,91].map((h,i)=><i key={i} style={{height:`${h}%`}}/>)}</div><div className="line-label"><span>01 Ago</span><span>05 Ago</span><span>10 Ago</span><span>15 Ago</span><span>Hoy</span></div></div></article><article className="panel"><div className="panel-head"><div><span className="eyebrow">CANALES</span><h2>Origen de ventas</h2></div></div><div className="channels">{[["Vendedores",58],["Televentas",24],["Venta directa",18]].map(([x,p])=><div key={x}><span>{x}</span><b>{p}%</b><i><em style={{width:`${p}%`}}/></i></div>)}</div></article></section><section className="panel sellers"><div className="panel-head"><div><span className="eyebrow">RENDIMIENTO</span><h2>Ventas por vendedor</h2></div></div><div className="seller-grid">{[["AR","Ana Rojas","Gs. 286.420.000","112%"],["CV","Carlos Vera","Gs. 248.850.000","104%"],["MB","Miguel Benítez","Gs. 192.300.000","92%"]].map(x=><article key={x[0]}><span>{x[0]}</span><div><b>{x[1]}</b><small>{x[2]}</small></div><strong>{x[3]}</strong></article>)}</div></section></div>;
}

function Deliveries() {
  const routes=[["Ruta 01 · Asunción","Carlos Martínez","10 / 12","En ruta",83],["Ruta 02 · San Lorenzo","Diego López","8 / 10","En ruta",80],["Ruta 03 · Zona Central","Luis Gómez","4 / 9","Demorado",44],["Ruta 04 · Luque","Mario Ferreira","5 / 5","Entregado",100]];
  return <div className="stack"><Metrics items={[["PROGRAMADAS","42","Gs. 72.840.000"],["COMPLETADAS","27","64% del total"],["EN RUTA","13","4 vehículos"],["CON DEMORA","2","Ruta 03","amber"]]}/><section className="route-grid">{routes.map((r,i)=><article className="route-card" key={r[0] as string}><div><span className="route-no">0{i+1}</span><Status>{r[3] as string}</Status></div><h3>{r[0]}</h3><p>Conductor: {r[1]}</p><span><b>{r[2]}</b> entregas</span><i><em style={{width:`${r[4]}%`}}/></i><button>Ver recorrido →</button></article>)}</section><section className="panel timeline"><div className="panel-head"><div><span className="eyebrow">SEGUIMIENTO EN VIVO</span><h2>Próximas paradas</h2></div></div><div><i className="done">✓</i><span><b>Supermercado El Sol S.A.</b><small>Entregado a las 09:18 · Recibió: Laura Méndez</small></span><strong>Gs. 4.865.000</strong></div><div><i className="current">→</i><span><b>Comercial San Miguel S.R.L.</b><small>En camino · Llegada estimada 10:05</small></span><strong>Gs. 3.248.000</strong></div><div><i>3</i><span><b>Despensa Don José</b><small>Próxima parada · 5,4 km</small></span><strong>Gs. 875.000</strong></div></section></div>;
}

function Finance() {
  const rows=[["18/08/2026","Cobro · Supermercado El Sol","REC-00812","Aprobado","+ Gs. 12.500.000"],["18/08/2026","Pago · Bebidas Nacionales","PAG-00428","Procesando","− Gs. 8.420.000"],["17/08/2026","Cobro · Market Avenida","REC-00811","Aprobado","+ Gs. 4.850.000"]];
  return <div className="stack"><Metrics items={[["SALDO DISPONIBLE","Gs. 124.680.000","Cajas y cuentas bancarias"],["CUENTAS POR COBRAR","Gs. 86.420.000","Gs. 9.850.000 vencidos","amber"],["CUENTAS POR PAGAR","Gs. 54.280.000","Próximos 30 días"]]}/><section className="dash-grid"><article className="panel cash"><div className="panel-head"><div><span className="eyebrow">FLUJO PROYECTADO</span><h2>Ingresos y egresos</h2></div><span className="chip">30 días</span></div><p><span>Ingresos</span><b>Gs. 182.450.000</b></p><i><em style={{width:"78%"}}/></i><p><span>Egresos</span><b>Gs. 132.680.000</b></p><i className="out"><em style={{width:"57%"}}/></i><div><span>Saldo proyectado</span><b>Gs. 49.770.000</b></div></article><article className="panel due"><div className="panel-head"><div><span className="eyebrow">COBRANZAS</span><h2>Vencimientos</h2></div></div><p><span>Vencido</span><b>Gs. 9.850.000</b><Status>Pendiente</Status></p><p><span>Esta semana</span><b>Gs. 28.420.000</b><small>14 documentos</small></p><p><span>Próximos 30 días</span><b>Gs. 48.150.000</b><small>31 documentos</small></p></article></section><PanelTable eyebrow="MOVIMIENTOS" title="Operaciones recientes" action="Registrar movimiento" headers={["Fecha","Concepto","Referencia","Estado","Importe"]} rows={rows} statusColumn={3}/></div>;
}

function Billing() {
  const [modal,setModal]=useState(false); const [success,setSuccess]=useState(false);
  const docs:Row[]=[["001-001-0001842","18/08/2026 09:24","Factura electrónica","Supermercado El Sol S.A.","Gs. 4.865.000","Aprobado"],["001-001-0001841","18/08/2026 08:57","Factura electrónica","Market Avenida E.A.S.","Gs. 1.986.000","Aprobado"],["001-001-0001840","18/08/2026 08:36","Factura electrónica","Grupo Norte Comercial S.A.","Gs. 5.924.000","Procesando"],["001-001-0000273","18/08/2026 08:02","Nota de crédito","Comercial San Miguel S.R.L.","Gs. 248.000","Aprobado"]];
  const emit=(e:FormEvent)=>{e.preventDefault();setModal(false);setSuccess(true);setTimeout(()=>setSuccess(false),5000)};
  return <div className="stack">{success&&<div className="toast"><i>✓</i><span><b>Factura emitida correctamente</b><small>El documento fue enviado a SIFEN para su aprobación.</small></span><button onClick={()=>setSuccess(false)}>×</button></div>}<section className="sifen"><div><i>S</i><span><small>CONEXIÓN EN LÍNEA</small><b>SIFEN operativo</b><em>Última sincronización: hoy a las 09:42</em></span></div><section><span><small>Aprobados hoy</small><b>46</b></span><span><small>Procesando</small><b>2</b></span><span><small>Rechazados</small><b>0</b></span></section><button onClick={()=>setModal(true)}>＋ Emitir documento</button></section><Metrics items={[["FACTURADO HOY","Gs. 48.650.000","48 documentos"],["APROBACIÓN SIFEN","100%","Sin documentos rechazados"],["TIEMPO PROMEDIO","4,2 seg.","Emisión y aprobación"]]}/><PanelTable eyebrow="DOCUMENTOS ELECTRÓNICOS" title="Emisiones recientes" action="Emitir documento" headers={["Documento","Fecha","Tipo","Cliente","Importe","Estado SIFEN"]} rows={docs} statusColumn={5}/>{modal&&<div className="modal-bg" onMouseDown={e=>{if(e.currentTarget===e.target)setModal(false)}}><form className="modal" onSubmit={emit}><header><div><span className="eyebrow">NUEVO DOCUMENTO</span><h2>Emitir factura electrónica</h2></div><button type="button" onClick={()=>setModal(false)}>×</button></header><div className="form-grid"><label className="full"><span>Cliente</span><select required defaultValue=""><option value="" disabled>Seleccionar cliente</option>{customers.map(c=><option key={c[1]}>{c[0]} · {c[1]}</option>)}</select></label><label><span>Condición de venta</span><select><option>Crédito</option><option>Contado</option></select></label><label><span>Moneda</span><select><option>Guaraníes (PYG)</option><option>Dólares (USD)</option></select></label></div><section className="items"><header><b>Detalle de productos</b><button type="button">＋ Agregar producto</button></header><div className="item labels"><span>Producto</span><span>Cant.</span><span>Precio unitario</span><span>Total</span></div><div className="item"><span><b>Aceite vegetal 900 ml</b><small>ALI-00124</small></span><span>120</span><span>Gs. 14.500</span><span>Gs. 1.740.000</span></div><div className="item"><span><b>Arroz premium 5 kg</b><small>ALI-00317</small></span><span>48</span><span>Gs. 44.500</span><span>Gs. 2.136.000</span></div></section><div className="total"><span><small>Subtotal</small><b>Gs. 3.876.000</b></span><span><small>IVA incluido</small><b>Gs. 352.364</b></span><span className="grand"><small>Total a pagar</small><b>Gs. 3.876.000</b></span></div><footer><button type="button" className="secondary" onClick={()=>setModal(false)}>Cancelar</button><button className="primary">Emitir y enviar a SIFEN</button></footer></form></div>}</div>;
}

export default function Home() {
  const [section,setSection]=useState<Section>("inicio"); const [menu,setMenu]=useState(false); const [notice,setNotice]=useState(false); const [search,setSearch]=useState("");
  const title=useMemo(()=>titles[section],[section]);
  const go=(s:Section)=>{setSection(s);setMenu(false);window.scrollTo({top:0,behavior:"smooth"})};
  return <div className="app"><aside className={menu?"sidebar open":"sidebar"}><div className="brand"><div><i/><i/><i/></div><span><b>Distribu<em>Nex</em></b><small>una solución PROCEIT</small></span></div><nav>{navGroups.map(g=><section key={g.label}><p>{g.label}</p>{g.items.map(item=><button className={section===item[0]?"active":""} onClick={()=>go(item[0])} key={item[0]}><i>{item[1]}</i><span>{item[2]}</span>{item[0]==="inventario"&&<b>8</b>}</button>)}</section>)}</nav><footer><div className="company"><i>DC</i><span><b>Distribuidora Central</b><small>Casa central</small></span><button>⌄</button></div></footer></aside>{menu&&<button className="overlay" onClick={()=>setMenu(false)}/>}<main><header className="topbar"><button className="hamb" onClick={()=>setMenu(true)}>☰</button><label className="search"><b>⌕</b><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar clientes, productos o pedidos..."/><kbd>⌘ K</kbd></label><div className="actions"><button className="help">?</button><button className="bell" onClick={()=>setNotice(!notice)}>○<i/></button><div className="user"><i>MO</i><span><b>Magno Oliveira</b><small>Administrador</small></span><button>⌄</button></div></div>{notice&&<div className="notices"><b>Notificaciones</b><p>La Ruta 01 completó 10 de 12 entregas.</p><p>La orden OC-00418 está en tránsito.</p></div>}</header><div className="content"><header className="page-title"><div><span>Distribuidora Central <b>/</b> {title[0]}</span><h1>{title[0]}</h1><p>{title[1]}</p></div>{section==="inicio"&&<button className="primary" onClick={()=>go("facturacion")}>＋ Emitir factura</button>}</header>{section==="inicio"&&<Dashboard go={go}/>} {pageData[section]&&<StandardPage section={section}/>} {section==="inventario"&&<Inventory/>} {section==="ventas"&&<Sales/>} {section==="entregas"&&<Deliveries/>} {section==="finanzas"&&<Finance/>} {section==="facturacion"&&<Billing/>}</div></main></div>;
}
