import type { Metadata } from "next";
import { Suspense } from "react";
import { FONT_STYLESHEET, geist } from "@/lib/fonts";
import "./globals.css";


export const metadata: Metadata = {
  icons: { icon: "/brand/mark.svg" },
  title: "Streamnow Website Builder",
  description: "Project websites for new-build sales and lettings",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONT_STYLESHEET} />
      </head>
      <body className="min-h-full flex flex-col"><Suspense>{children}</Suspense></body>
    </html>
  );
}
