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
    // Default = static navy SVG (+ PNG fallback for no-JS / non-SVG browsers).
    // Safari keeps this navy icon in both modes (and adds its own light plate
    // in dark) — see the script in <body>, which only runs the live navy↔cream
    // swap on Chromium/Firefox, where re-rendering a JS-swapped favicon works.
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/icon-180.png",
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
        {/* Live navy↔cream favicon swap — Chromium/Firefox only. Safari/WebKit
            can't re-render a JS-swapped favicon after load (it only re-reads on
            navigation), so we skip it there and let Safari keep the static navy
            icon from the metadata above. On Chromium/Firefox, swapping the
            <link> on a matchMedia 'change' flips the icon live the instant the
            OS appearance toggles. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
  if (navigator.vendor === 'Apple Computer, Inc.') return;
  var m = window.matchMedia('(prefers-color-scheme: dark)');
  function apply(){
    document.querySelectorAll("link[rel~='icon'][type='image/svg+xml']").forEach(function(n){ n.remove(); });
    var l = document.createElement('link');
    l.rel = 'icon'; l.type = 'image/svg+xml';
    l.href = m.matches ? '/favicon-dark.svg' : '/favicon.svg';
    document.head.appendChild(l);
  }
  apply();
  if (m.addEventListener) m.addEventListener('change', apply);
  else if (m.addListener) m.addListener(apply);
}catch(e){}})();`,
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
