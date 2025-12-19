import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const canela = localFont({
  src: "../public/fonts/Canela-Regular-Trial.otf",
  variable: "--font-canela",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ChromAgent",
  description: "Ask Chromium anything — an AI agent grounded in your indexed Chromium repository + documentation, powered by Nia",
  openGraph: {
    title: "ChromAgent",
    description: "Ask Chromium anything — an AI agent grounded in your indexed Chromium repository + documentation, powered by Nia",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ChromAgent",
    description: "Ask Chromium anything — an AI agent grounded in your indexed Chromium repository + documentation, powered by Nia",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
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
        className={`${geistSans.variable} ${geistMono.variable} ${canela.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
