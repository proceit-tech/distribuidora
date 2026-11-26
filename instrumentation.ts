// Se ejecuta una vez al arrancar el servidor Next.js (runtime Node). Inicia el planificador SERVIDOR de consultas de estado fiscal (PRO-94): funciona sin navegador y es seguro con varias
// instancias (lease en la base). Desactivable con NEXIT_CONSULTA_AUTOMATICA=0. No hace nada en modo DEMO ni sin DATABASE_URL.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { iniciarPlanificador } = await import("@/lib/facturacion/consulta-automatica");

  iniciarPlanificador();
}
