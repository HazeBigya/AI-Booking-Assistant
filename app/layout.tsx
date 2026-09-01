import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

export const metadata: Metadata = {
  title: "Bright Smile Clinic",
  description: "AI Booking Assistant — books clinic appointments by chat or voice",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className="bg-zinc-50 font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
