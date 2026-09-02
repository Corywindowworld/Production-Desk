import type { Metadata, Viewport } from "next";
import "./globals.css";
export const viewport: Viewport = {themeColor: "#0055ed", width: "device-width", initialScale: 1};

export const metadata: Metadata = {
  title: "Production Desk",
  description: "Track job production, schedules, and field updates.",
  appleWebApp: {capable: true, title: "Production Desk", statusBarStyle: "default"},
  icons: {
    apple: "/apple-touch-icon.png",
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
