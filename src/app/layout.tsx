import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SnapPDF — Scan, Compress, Convert & Share Instantly",
  description:
    "India's #1 free document utility. Convert images to PDF, compress PDF to exact KB size, resize images, generate QR codes, and more. No login required. Works offline.",
  keywords: [
    "image to pdf",
    "pdf compressor",
    "compress pdf to 200kb",
    "reduce pdf size",
    "resize image for form",
    "passport size photo maker",
    "signature resize",
    "compress pdf for government form",
    "image below 50kb",
    "pdf scanner",
    "jpg to pdf",
    "merge pdf",
    "split pdf",
    "qr code generator",
    "snapdf",
    "pwa",
    "progressive web app",
    "offline document tools",
  ],
  authors: [{ name: "SnapPDF" }],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    title: "SnapPDF — India's #1 Document Utility",
    description:
      "Convert, compress, resize & share documents instantly. Free, no login, works offline.",
    type: "website",
    images: [
      { url: "/images/og-image.png", width: 1200, height: 630, alt: "SnapPDF — India's #1 Document Utility" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SnapPDF — India's #1 Document Utility",
    description:
      "Convert, compress, resize & share documents instantly. Free, no login, works offline.",
    images: ["/images/og-image.png"],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "SnapPDF",
    "theme-color": "#0A5BFF",
    "msapplication-TileColor": "#0A5BFF",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
