export type AuthUser = {
  id: string;
  empresaId: string;
  sucursalId: string | null;
  nombre: string;
  apellido: string;
  usuario: string;
  email: string | null;
  perfiles: string[];
};

export type AuthSession = {
  id: string;
  expiraAt: Date;
  user: AuthUser;
  demo?: boolean;
};
