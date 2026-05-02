import Script from "next/script";
import "./globals.css";
import type { Metadata } from "next";
import { Montserrat, Poppins, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import { ThemeProvider } from "next-themes";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-montserrat",
});

const lora = localFont({
  src: [
    { path: "./fonts/Lora-Regular.ttf",          weight: "400", style: "normal"  },
    { path: "./fonts/Lora-Italic.ttf",           weight: "400", style: "italic"  },
    { path: "./fonts/Lora-SemiBold.ttf",         weight: "600", style: "normal"  },
    { path: "./fonts/Lora-SemiBoldItalic.ttf",   weight: "600", style: "italic"  },
    { path: "./fonts/Lora-Bold.ttf",             weight: "700", style: "normal"  },
    { path: "./fonts/Lora-BoldItalic.ttf",       weight: "700", style: "italic"  },
  ],
  variable: "--font-lora",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-poppins",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Dormers' - Student Meals in Dubai",
  description: "Meals that don't Suck, delivered to your dorm",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className={`${montserrat.variable} ${poppins.variable} ${lora.variable} ${jetbrains.variable}`} style={{ fontFamily: 'var(--font-montserrat), Arial, Helvetica, sans-serif' }}>
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
