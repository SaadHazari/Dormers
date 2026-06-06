import Script from "next/script";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Montserrat, Poppins, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { WebVitalsReporter } from "@/ui-system/observability/web-vitals";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-montserrat",
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

// viewport-fit=cover is REQUIRED for env(safe-area-inset-*) to resolve to real
// values on iOS — without it the inset is 0, so bottom-pinned UI (modal/sheet
// CTA bands, the action toast) silently collapses to its fallback padding and
// can graze Safari's home indicator. Width/initialScale match Next's defaults.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className={`${montserrat.variable} ${poppins.variable} ${jetbrains.variable}`} style={{ fontFamily: 'var(--font-montserrat), Arial, Helvetica, sans-serif' }}>
        {/* Defeat the browser's auto scroll-restoration on hard refresh.
            Marketing /home shows a fixed preloader splash on mount — if the
            browser restores scroll to a deep section before React hydrates,
            the user sees that section flash through before the splash takes
            over. Manual mode keeps every refresh at scrollY=0 and lets us
            (or Next's App Router) decide when to scroll. Inline + sync so it
            wins the race against first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "if('scrollRestoration' in history){history.scrollRestoration='manual';}",
          }}
        />
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
        <WebVitalsReporter />
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
