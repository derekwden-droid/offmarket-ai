import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/app/providers";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "OffMarket.AI",
    template: "%s · OffMarket.AI",
  },
  description:
    "AI-powered off-market property data, skip tracing, and automated lead qualification.",
  applicationName: "OffMarket.AI",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-[#0B0F19] text-gray-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
