import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Saheli — Voice-Activated AI Guardian",
  description:
    "A guardian that activates with your voice, verifies real emergencies before escalating, and seals tamper-evident evidence. Built for HERHACK 2026.",
};

export const viewport: Viewport = {
  themeColor: "#1a1030",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-[#140b26] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
