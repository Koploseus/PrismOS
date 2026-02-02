import type { Metadata } from "next";
import { Manrope, Azeret_Mono } from "next/font/google";
import { Providers } from "./providers";
import { Navbar } from "@/components/navbar";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const azeretMono = Azeret_Mono({
  variable: "--font-azeret-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PrismOS - Agent Marketplace",
  description: "Discover and deploy autonomous agents to automate your workflows",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${manrope.variable} ${azeretMono.variable} antialiased`}>
        <Providers>
          <div className="min-h-screen grid-background">
            <div className="noise-overlay" />
            <Navbar />
            <main>{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
