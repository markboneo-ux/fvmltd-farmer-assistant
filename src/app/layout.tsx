import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { PRODUCT_NAME, PRODUCT_SUBTITLE } from "@/lib/brand";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: `${PRODUCT_SUBTITLE} from Farmersvaluemart Ltd. Ask about your crop or send a photo.`,
  applicationName: PRODUCT_NAME,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: PRODUCT_NAME,
    statusBarStyle: "default",
  },
  icons: {
    icon: "/brand/farmersvaluemart-logo.png",
    apple: "/brand/farmersvaluemart-logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#1b4332",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full overflow-x-hidden antialiased">{children}</body>
    </html>
  );
}
