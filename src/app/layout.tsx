import type { Metadata, Viewport } from "next";
import { SupabaseProvider } from "@/lib/supabase-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stride Camp Manager",
  description: "Manage sports camps, schedules, and participants with Stride.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body><SupabaseProvider>{children}</SupabaseProvider></body>
    </html>
  );
}
