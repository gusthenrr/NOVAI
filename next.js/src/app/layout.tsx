import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { UserProvider } from "../../userContext";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  icons: { icon: { url: "/site-apresentacao/assets/favicon.svg?v=rounded-20261105", type: "image/svg+xml" } },
  title: "NOVAI — Sua conta e seus resultados",
  description: "Analise anúncios, acompanhe sua conta e calcule suas margens com a NOVAI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <UserProvider>
        {children}
        </UserProvider>
      </body>
    </html>
  );
}
