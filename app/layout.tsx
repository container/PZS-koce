import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PZS Hut Availability Finder",
  description: "Check public Bentral availability for Vodnikov dom na Velem polju.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
