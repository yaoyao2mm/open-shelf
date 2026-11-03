import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./library.css";

const inter = localFont({
  src: "./fonts/inter-variable.woff2",
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title: "Game Shelf — open-source 3D library",
  description:
    "A small, open-source 3D shelf for browsing a game collection. Fictional demo data included.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
