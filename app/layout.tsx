import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF Killer",
  description: "Professional media conversion tools by deVee Boutique Label",
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <script src="/coi-serviceworker.js" defer></script>
      </head>
      <body className="antialiased h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}