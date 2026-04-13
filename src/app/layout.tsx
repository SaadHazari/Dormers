import Script from "next/script";
import "./globals.css";
import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { ThemeProvider } from "next-themes";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["900"],
});

export const metadata: Metadata = {
  title: "Dormers' - Student Meals in Dubai",
  description: "Meals that don't Suck, delivered to your dorm",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.cdnfonts.com/css/typo-round"
          rel="stylesheet"
        />
      </head>
      <body className={montserrat.className}>
        {/* --- START OF GOOGLE ADS CODE --- */}
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=AW-17901506705"
        strategy="afterInteractive"
      />
      <Script id="google-ads-tag" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'AW-17901506705');
        `}
      </Script>
      {/* --- END OF GOOGLE ADS CODE --- */}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          themes={["dark", "light"]}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
