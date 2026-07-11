import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://larik-site.vercel.app"),
  title: "LARIK — חברים שווים כסף",
  description:
    "קאשבק על כל קנייה. רווח מכל קנייה של החברים שלך — והשושלת שלהם. לנצח. אנונימי וחינם.",
  manifest: "/manifest.json",
  openGraph: {
    title: "LARIK — חברים שווים כסף 💸",
    description:
      "קאשבק על כל קנייה + רווח מכל קנייה של מי שתצרף. לנצח. אנונימי וחינם.",
    url: "https://larik-site.vercel.app",
    siteName: "LARIK",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    locale: "he_IL",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LARIK — חברים שווים כסף 💸",
    description: "קאשבק על כל קנייה + רווח מהשושלת שלך. לנצח.",
    images: ["/og.png"],
  },
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
