import type { Metadata } from "next";
import { Jura, Instrument_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const jura = Jura({
  subsets: ["latin"],
  variable: "--font-jura",
  display: "swap",
  weight: ["300", "400", "500"],
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wedja — The AI That Runs Your Property",
  description:
    "AI-powered property management platform for revenue protection and operational intelligence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent theme flash — apply saved theme before paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('wedja-theme');
                  if (theme === 'light') {
                    document.documentElement.classList.add('light');
                    document.documentElement.classList.remove('dark');
                  } else {
                    document.documentElement.classList.add('dark');
                    document.documentElement.classList.remove('light');
                  }
                } catch (e) {
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body className={`${jura.variable} ${instrumentSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
