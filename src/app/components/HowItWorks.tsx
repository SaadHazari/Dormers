import { HowItWorksDesktop } from "./HowItWorksDesktop";
import { HowItWorksMobile } from "./HowItWorksMobile";

/**
 * Responsive wrapper — picks the desktop or mobile variant by breakpoint.
 * Default export so existing `import HowItWorks from "@/app/components/HowItWorks"`
 * keeps working.
 */
export default function HowItWorks() {
  return (
    <>
      <div className="hidden sm:block">
        <HowItWorksDesktop />
      </div>
      <div className="block sm:hidden">
        <HowItWorksMobile />
      </div>
    </>
  );
}
