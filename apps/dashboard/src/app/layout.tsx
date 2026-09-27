import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "AutoFlow AI — Platform",
  description: "Unified AI-powered business platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex h-screen overflow-hidden bg-[#0d0f18]">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="min-h-full p-5 sm:p-6 lg:p-8 page-enter pb-20 md:pb-8">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
