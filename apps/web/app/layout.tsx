import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppNavigation } from "../components/app-navigation";
import { LifeOsAuthProvider } from "../components/life-os-auth-provider";
import "./globals.css";
import "./v3-overrides.css";

export const metadata: Metadata = {
  title: "Life OS",
  description: "A private operating system for direction, memory, deliberate growth, and returning after drift.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ECE9E1",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LifeOsAuthProvider>
          <AppNavigation />
          {children}
        </LifeOsAuthProvider>
      </body>
    </html>
  );
}
