# DistribuNex — base de autenticación

Copie el contenido de `app`, `components`, `lib` y `types` a la raíz del proyecto Next.js.

## Dependencia

```bash
npm install pg
npm install -D @types/pg
```

## Configuración

1. Copie `.env.local.example` a `.env.local` y ajuste `DATABASE_URL`.
2. Ejecute las migrations hasta `017_administrador_inicial.sql`.
3. Inicialice la empresa y cree el administrador con la función incluida en la migration 017.
4. Reemplace el `app/page.tsx` actual y agregue las carpetas del paquete.
5. En el acceso use el código de `empresas.codigo`, el usuario y la contraseña definidos en la migration 017.

El proyecto debe conservar el alias estándar de Next.js en `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  }
}
```

El navegador recibe solo un identificador de sesión y un secreto aleatorio. El secreto se almacena como bcrypt en `sesiones_usuario`; cada petición protegida verifica que la sesión siga activa.
