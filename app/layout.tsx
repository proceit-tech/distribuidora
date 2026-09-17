import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DistribuNex",
  description: "Sistema de gestión para distribuidoras",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-PY">
      <body>{children}</body>
    </html>
  );
}