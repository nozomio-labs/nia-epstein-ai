import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Naval Agent",
  description: "Ask Naval Ravikant anything — an AI agent grounded in his wisdom on wealth, happiness, and life, powered by Nia",
  openGraph: {
    title: "Naval Agent",
    description: "Ask Naval Ravikant anything — an AI agent grounded in his wisdom on wealth, happiness, and life, powered by Nia",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Naval Agent",
    description: "Ask Naval Ravikant anything — an AI agent grounded in his wisdom on wealth, happiness, and life, powered by Nia",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
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
