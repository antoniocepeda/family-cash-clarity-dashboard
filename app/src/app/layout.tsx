import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Cash Clarity — Family Dashboard",
  description: "Know your cash position at a glance. Track bills, income, and projections.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col bg-slate-50`}
      >
        <div className="flex-1 flex flex-col">
          {children}
        </div>
        <footer className="border-t border-slate-200 bg-white mt-auto">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex items-center justify-between text-xs text-slate-400">
            <span>Family Cash Clarity Dashboard v2</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
