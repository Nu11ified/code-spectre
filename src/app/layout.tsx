import "@/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"

import { TRPCReactProvider } from "@/trpc/react";

export const metadata: Metadata = {
  title: "Code Spectre",
  description: "Cloud IDE Orchestrator by Nu11ified @ Github",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable}`}>
      <body>
        <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
        >
          <TRPCReactProvider>
            {children}
            <Toaster />
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
