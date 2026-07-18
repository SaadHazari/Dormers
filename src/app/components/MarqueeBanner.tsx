"use client";

import { useIsLight } from "@/ui-system/hooks/useIsLight";

const WORDS = [...Array(12)].map(() => "DORMERS’");
const ROW_WORDS = [...WORDS, ...WORDS];

const spanStyle: React.CSSProperties = {
  fontFamily: "var(--font-montserrat), Arial, Helvetica, sans-serif",
  fontSize: "18px",
  fontWeight: 700,
  lineHeight: "100%",
  letterSpacing: "0",
  transform: "rotate(-8.84deg)",
  opacity: 0.54,
};

interface RowProps {
  delay: string;
  textClass: string;
  rotation?: string;
  extraClass?: string;
}

function Row({ delay, textClass, rotation = "rotate(-8.84deg)", extraClass = "" }: RowProps) {
  return (
    <div className={`relative flex whitespace-nowrap ${extraClass}`}>
      <div className="marquee" style={{ animationDelay: delay }}>
        {ROW_WORDS.map((word, i) => (
          <span
            key={i}
            className={`inline-block ${textClass} mx-2`}
            style={{ ...spanStyle, transform: rotation }}
          >
            {word}
          </span>
        ))}
      </div>
    </div>
  );
}

interface MarqueeBannerProps {
  className?: string;
}

export default function MarqueeBanner({ className = "" }: MarqueeBannerProps) {
  // useIsLight (not raw useTheme) — avoids the SSR/first-render hydration
  // mismatch that leaves the server's dark classes stuck in the DOM.
  const isLight = useIsLight();
  const bg = isLight ? "bg-[#1E3A4F]" : "bg-[#EEE9DA]";
  const textClass = isLight ? "text-[#EEE9DA]" : "text-[#1E3A4F]";

  return (
    <div className={`relative w-full overflow-hidden ${bg} ${className}`}>
      <div className="flex flex-col gap-2 w-full h-full py-1">
        <Row delay="0s" textClass={textClass} />
        <Row delay="-7s" textClass={textClass} />
        <Row delay="-3s" textClass={textClass} rotation="rotate(-4.84deg)" extraClass="LastDomers" />
      </div>
    </div>
  );
}
