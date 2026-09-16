import type { Metadata, Viewport } from "next";
import "./globals.css";
import { InstallApp } from "@/components/pwa/install-app";
import "./responsive.css";
import "./diagnostico.css";
import "./comercial.css";
import "./reading.css";

export const metadata: Metadata = {
  title: "FS Soluções Tributárias | Gestão",
  description: "Sistema de gestão operacional da FS Soluções Tributárias.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "FS Diagnóstico", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
  icons: {
    icon: "/favicon.svg",
    apple: "/icons/icon-192.png",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = { themeColor: "#10283d", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}<InstallApp/></body>
    </html>
  );
}
