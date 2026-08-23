import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bright Smile Clinic",
  description: "Dental clinic appointment booking assistant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
