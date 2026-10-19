import type { Metadata } from "next";
import { SupabaseProvider } from "@/lib/supabase-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stride Camp Manager",
  description: "Manage sports camps, schedules, and participants with Stride.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body><SupabaseProvider>{children}</SupabaseProvider></body>
    </html>
  );
}
