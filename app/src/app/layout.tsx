import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AuthGate from "@/components/auth/AuthGate";
import { AuthProvider } from "@/components/auth/AuthProvider";
import MobileTabs from "@/components/MobileTabs";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cash Clarity — Family Dashboard",
  description: "Know your cash position at a glance. Track bills, income, and projections.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Clarity",
  },
};

export const viewport: Viewport = {
  themeColor: "#090a0c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="antialiased min-h-screen flex flex-col">
        <AuthProvider>
          <div className="flex-1 flex flex-col">
            <AuthGate>{children}</AuthGate>
          </div>
          <footer className="site-footer">
            <span>Family Cash Clarity Dashboard v2</span>
            <span>Authenticated users share the current temporary SQLite data store.</span>
          </footer>
          <MobileTabs />
        </AuthProvider>
      </body>
    </html>
  );
}
