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
    // Every current browser uses the SVG — Safari included, verified by
    // serving a deliberately mismatched pair and seeing which one it painted.
    // The PNG is a fallback for clients that can't render SVG icons at all.
    // All the light/dark handling lives inside favicon-auto.svg; read the
    // comment in that file before changing either entry, because Safari
    // resolves its media queries as light no matter the OS appearance and the
    // artwork is built around that.
    // ORDER MATTERS — PNG first, SVG last. Browsers take the last usable
    // candidate, so flipping these hands them the un-themed PNG instead.
    icon: [
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-auto.svg", type: "image/svg+xml" },
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
        {/* Harden React's DOM teardown against third-party node mutation.
            Browser translation extensions (Chrome / Google Translate is the
            big one for our UAE/Saudi users, who browse English pages in an
            Arabic locale) wrap text nodes in injected <font> tags. When React
            later unmounts those nodes, the parent it recorded is no longer the
            real parent, so removeChild()/insertBefore() throw
            "Cannot read properties of null (reading 'removeChild')" deep in
            the commit phase — an UNHANDLED crash that error boundaries can't
            catch and that white-screens the whole app (Sentry
            JAVASCRIPT-NEXTJS-16/17 on /dashboard/explore-plans).
            Guarding the two prototype methods turns that pathological case
            (operating on a node whose parent isn't `this`) into a no-op
            instead of a throw — React recovers, the user keeps their session.
            Must run inline + sync so it wins the race against hydration. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
  if (typeof Node !== 'function' || !Node.prototype) return;
  var rm = Node.prototype.removeChild;
  Node.prototype.removeChild = function(child){
    if (child && child.parentNode !== this) { return child; }
    return rm.apply(this, arguments);
  };
  var ib = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function(newNode, refNode){
    if (refNode && refNode.parentNode !== this) { return newNode; }
    return ib.apply(this, arguments);
  };
}catch(e){}})();`,
          }}
        />
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
