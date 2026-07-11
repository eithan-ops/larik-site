import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LARIK · לאריק — כסף עם חברים",
  description:
    "קאשבק על כל קנייה, ועמלה כשחברים קונים דרכך. אנונימי, שקוף, 92% חוזר אליכם.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0B0C11",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
