import {
  Activity, CreditCard, Globe, Headphones, LayoutGrid, Leaf, PauseCircle,
  RotateCcw, ShieldCheck, SkipForward, Star, Truck, Utensils, Wallet,
} from "lucide-react";

export interface CardData {
  id: number;
  bg: string;
  textColor: string;
  desktopStyle: React.CSSProperties;
  mobileClass: string;
  backBg: string;
  backTextColor: string;
  backBodyColor: string;
  backTitle: string;
  backBody: string;
  content: React.ReactNode;
}

const iconStyle = { opacity: 0.65, flexShrink: 0 };

export const cards: CardData[] = [
  {
    id: 1, bg: "linear-gradient(135deg, #FF8C00 0%, #FF6500 100%)", textColor: "#1E3A4F",
    desktopStyle: { gridColumn: "1 / 3", gridRow: "1 / 2" }, mobileClass: "col-span-2",
    backBg: "#e06d10", backTextColor: "#ede8da", backBodyColor: "rgba(237,232,218,0.9)",
    backTitle: "48 Dishes Every Month",
    backBody: "A new dish daily. Chef-crafted menus guarantee 48 unique options every month with zero repeats.",
    content: (
      <div className="flex items-end justify-between h-full">
        <div className="flex flex-col gap-[13px]">
          <RotateCcw size={21} strokeWidth={2.5} style={iconStyle} />
          <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(47px, 8vw, 76px)", lineHeight: 1 }}>48</p>
          <p style={{ fontFamily: "var(--font-montserrat), Arial, Helvetica, sans-serif", fontSize: "clamp(18px, 2.5vw, 29px)", lineHeight: 1.15, fontWeight: 700 }}>Dishes Every Month</p>
          <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "11px", opacity: 0.6, marginTop: "2px" }}>New dish daily · Monthly rotating menu</p>
        </div>
        <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(76px, 12vw, 123px)", lineHeight: 1, opacity: 0.07, userSelect: "none", alignSelf: "flex-end" }}>48</p>
      </div>
    ),
  },
  {
    id: 2, bg: "#1E3A4F", textColor: "#ffffff",
    desktopStyle: { gridColumn: "3 / 4", gridRow: "1 / 2" }, mobileClass: "col-span-1",
    backBg: "#091825", backTextColor: "#ede8da", backBodyColor: "rgba(237,232,218,0.75)",
    backTitle: "11+ Cuisines",
    backBody: "Explore global flavors daily: Italian, Arabic, Asian, Indian, Mediterranean, and more.",
    content: (
      <div className="flex flex-col justify-between h-full gap-[13px]">
        <Globe size={21} strokeWidth={1.5} style={iconStyle} />
        <div className="flex flex-col gap-[8px]">
          <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(34px, 5vw, 47px)", lineHeight: 1, color: "#FF7F00" }}>11+</p>
          <p style={{ fontFamily: "var(--font-montserrat), Arial, Helvetica, sans-serif", fontSize: "clamp(13px, 1.5vw, 18px)", fontWeight: 700, lineHeight: 1.25 }}>International Cuisines</p>
          <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "11px", opacity: 0.5 }}>From all over the world</p>
        </div>
      </div>
    ),
  },
  {
    id: 3, bg: "#EEE9DA", textColor: "#1E3A4F",
    desktopStyle: { gridColumn: "4 / 5", gridRow: "1 / 2" }, mobileClass: "col-span-1",
    backBg: "#d9d4c5", backTextColor: "#091825", backBodyColor: "rgba(9,24,37,0.8)",
    backTitle: "100% Refund",
    backBody: "Cancel anytime before your delivery window for a full refund on unused meals. No hassle.",
    content: (
      <div className="flex flex-col justify-between h-full gap-[13px]">
        <ShieldCheck size={21} strokeWidth={1.5} style={iconStyle} />
        <div className="flex flex-col gap-[8px]">
          <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(34px, 5vw, 47px)", lineHeight: 1 }}>100%</p>
          <p style={{ fontFamily: "var(--font-montserrat), Arial, Helvetica, sans-serif", fontSize: "clamp(13px, 1.5vw, 18px)", fontWeight: 700, lineHeight: 1.25 }}>Refund Policy</p>
          <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "11px", opacity: 0.55 }}>On all remaining meals</p>
        </div>
      </div>
    ),
  },
  {
    id: 4, bg: "#EEE9DA", textColor: "#1E3A4F",
    desktopStyle: { gridColumn: "1 / 2", gridRow: "2 / 3" }, mobileClass: "col-span-1",
    backBg: "#d9d4c5", backTextColor: "#091825", backBodyColor: "rgba(9,24,37,0.8)",
    backTitle: "3× Meal Skips",
    backBody: "Skip up to 3 deliveries per month with zero penalties. Your plan automatically adjusts.",
    content: (
      <div className="flex flex-col justify-between h-full gap-[8px]">
        <SkipForward size={18} strokeWidth={2} style={iconStyle} />
        <div className="flex flex-col gap-[5px]">
          <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(29px, 4vw, 34px)", lineHeight: 1 }}>3×</p>
          <p style={{ fontFamily: "var(--font-montserrat), Arial, Helvetica, sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.3 }}>Meal Skips</p>
          <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.55 }}>Per month</p>
        </div>
      </div>
    ),
  },
  {
    id: 5, bg: "#1E3A4F", textColor: "#ffffff",
    desktopStyle: { gridColumn: "2 / 3", gridRow: "2 / 3" }, mobileClass: "col-span-1",
    backBg: "#091825", backTextColor: "#ede8da", backBodyColor: "rgba(237,232,218,0.75)",
    backTitle: "Pause Anytime",
    backBody: "Traveling? Pause your subscription anytime and resume when you return. No hidden charges.",
    content: (
      <div className="flex flex-col justify-between h-full gap-[8px]">
        <PauseCircle size={21} strokeWidth={1.5} style={{ ...iconStyle, color: "#FF7F00" }} />
        <div className="flex flex-col gap-[5px]">
          <p style={{ fontFamily: "var(--font-montserrat), Arial, Helvetica, sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.35 }}>Pause<br />Anytime</p>
          <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.5 }}>Going on vacation? Pause and come back.</p>
        </div>
      </div>
    ),
  },
  {
    id: 6, bg: "#0C1E2C", textColor: "#ffffff",
    desktopStyle: { gridColumn: "3 / 5", gridRow: "2 / 4" }, mobileClass: "col-span-2",
    backBg: "#091825", backTextColor: "#ede8da", backBodyColor: "rgba(237,232,218,0.85)",
    backTitle: "FREE Delivery",
    backBody: "Zero delivery fees or minimums, ever. We deliver to all supported dorms across Dubai completely free of charge.",
    content: (
      <div className="flex flex-col justify-between h-full" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.065) 1px, transparent 1px)", backgroundSize: "21px 21px" }}>
        <Truck size={29} strokeWidth={1.5} style={{ ...iconStyle, color: "#FF7F00" }} />
        <div className="flex flex-col gap-[8px]">
          <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(47px, 8vw, 76px)", lineHeight: 1, color: "#FF7F00" }}>FREE</p>
          <p style={{ fontFamily: "var(--font-montserrat), Arial, Helvetica, sans-serif", fontSize: "clamp(18px, 2.5vw, 29px)", fontWeight: 700, lineHeight: 1.15 }}>Delivery</p>
          <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", opacity: 0.55 }}>To all dorms across Dubai</p>
        </div>
      </div>
    ),
  },
  {
    id: 10, bg: "#EEE9DA", textColor: "#1E3A4F",
    desktopStyle: { gridColumn: "3 / 4", gridRow: "4 / 5" }, mobileClass: "col-span-1",
    backBg: "#d9d4c5", backTextColor: "#091825", backBodyColor: "rgba(9,24,37,0.8)",
    backTitle: "Dietary Needs",
    backBody: "We accommodate your dietary needs: veg, non-veg, halal, and religious preferences.",
    content: (
      <div className="flex flex-col justify-between h-full gap-[8px]">
        <Utensils size={18} strokeWidth={1.5} style={iconStyle} />
        <div className="flex flex-col gap-[5px]">
          <p style={{ fontFamily: "var(--font-montserrat), Arial, Helvetica, sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.35 }}>Veg, Non-Veg<br />& Religious</p>
          <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.55 }}>We respect your preferences</p>
        </div>
      </div>
    ),
  },
  {
    id: 12, bg: "#FF7F00", textColor: "#1E3A4F",
    desktopStyle: { gridColumn: "1 / 2", gridRow: "5 / 6" }, mobileClass: "col-span-1",
    backBg: "#e06d10", backTextColor: "#ede8da", backBodyColor: "rgba(237,232,218,0.9)",
    backTitle: "3 Plans",
    backBody: "Choose from Monthly, Weekly, or a Trial pack. Flexible options to fit your schedule.",
    content: (
      <div className="flex flex-col justify-between h-full gap-[8px]">
        <LayoutGrid size={18} strokeWidth={2} style={iconStyle} />
        <div className="flex flex-col gap-[5px]">
          <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(29px, 4vw, 34px)", lineHeight: 1 }}>3</p>
          <p style={{ fontFamily: "var(--font-montserrat), Arial, Helvetica, sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700 }}>Plans</p>
          <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.6 }}>Monthly · Weekly · Trial</p>
        </div>
      </div>
    ),
  },
  {
    id: 9, bg: "#1E3A4F", textColor: "#ffffff",
    desktopStyle: { gridColumn: "1 / 3", gridRow: "4 / 5" }, mobileClass: "col-span-2",
    backBg: "#091825", backTextColor: "#ede8da", backBodyColor: "rgba(237,232,218,0.8)",
    backTitle: "Flexible Payments",
    backBody: "Pay your way: cash, card, bank transfer, or crypto. Built specifically to fit your student lifestyle.",
    content: (
      <div className="flex items-start h-full gap-[21px]">
        <div className="flex flex-col gap-[13px]">
          <CreditCard size={21} strokeWidth={1.5} style={iconStyle} />
          <p style={{ fontFamily: "var(--font-montserrat), Arial, Helvetica, sans-serif", fontSize: "clamp(13px, 1.8vw, 18px)", fontWeight: 700 }}>Flexible Payments</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "2px" }}>
            {["Cash", "Card", "Online", "Bank Transfer", "Crypto"].map((m) => (
              <span key={m} style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", background: "rgba(255,255,255,0.1)", color: "#ffffff", borderRadius: "999px", padding: "3px 10px" }}>{m}</span>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 7, bg: "#1E3A4F", textColor: "#ffffff",
    desktopStyle: { gridColumn: "1 / 2", gridRow: "3 / 4" }, mobileClass: "col-span-1",
    backBg: "#091825", backTextColor: "#ede8da", backBodyColor: "rgba(237,232,218,0.75)",
    backTitle: "Eco Packaging",
    backBody: "Our packaging is sustainably sourced. Good for you, good for the planet.",
    content: (
      <div className="flex flex-col justify-between h-full gap-[8px]">
        <Leaf size={18} strokeWidth={1.5} style={{ ...iconStyle, color: "#4ade80" }} />
        <div className="flex flex-col gap-[5px]">
          <p style={{ fontFamily: "var(--font-montserrat), Arial, Helvetica, sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.35 }}>Eco-Friendly<br />Packaging</p>
          <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.5 }}>Sustainably made</p>
        </div>
      </div>
    ),
  },
  {
    id: 8, bg: "#FF7F00", textColor: "#1E3A4F",
    desktopStyle: { gridColumn: "2 / 3", gridRow: "3 / 4" }, mobileClass: "col-span-1",
    backBg: "#e06d10", backTextColor: "#ede8da", backBodyColor: "rgba(237,232,218,0.9)",
    backTitle: "Macros Counted",
    backBody: "Every meal includes full nutritional info (calories, protein, carbs, fats) so you can eat smart.",
    content: (
      <div className="flex flex-col justify-between h-full gap-[8px]">
        <Activity size={18} strokeWidth={2} style={iconStyle} />
        <div className="flex flex-col gap-[5px]">
          <p style={{ fontFamily: "var(--font-montserrat), Arial, Helvetica, sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.35 }}>Calculated<br />Macros</p>
          <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.6 }}>Know exactly what you eat</p>
        </div>
      </div>
    ),
  },
  {
    id: 11, bg: "#EEE9DA", textColor: "#1E3A4F",
    desktopStyle: { gridColumn: "4 / 5", gridRow: "4 / 5" }, mobileClass: "col-span-1",
    backBg: "#d9d4c5", backTextColor: "#091825", backBodyColor: "rgba(9,24,37,0.8)",
    backTitle: "Student Support",
    backBody: "Get help 7 days a week. Chat with our real support team via the app for fast answers.",
    content: (
      <div className="flex flex-col justify-between h-full gap-[8px]">
        <Headphones size={18} strokeWidth={1.5} style={iconStyle} />
        <div className="flex flex-col gap-[5px]">
          <p style={{ fontFamily: "var(--font-montserrat), Arial, Helvetica, sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.35 }}>Dedicated<br />Student Support</p>
          <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.55 }}>Always here for you</p>
        </div>
      </div>
    ),
  },
  {
    id: 13, bg: "#1E3A4F", textColor: "#ffffff",
    desktopStyle: { gridColumn: "2 / 3", gridRow: "5 / 6" }, mobileClass: "col-span-1",
    backBg: "#091825", backTextColor: "#ede8da", backBodyColor: "rgba(237,232,218,0.75)",
    backTitle: "Budget Friendly",
    backBody: "Premium quality meals crafted for students, at prices that won't hurt your wallet.",
    content: (
      <div className="flex flex-col justify-between h-full gap-[8px]">
        <Wallet size={18} strokeWidth={1.5} style={iconStyle} />
        <div className="flex flex-col gap-[5px]">
          <p style={{ fontFamily: "var(--font-montserrat), Arial, Helvetica, sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.35 }}>Student<br />Budget Friendly</p>
          <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.5 }}>Made for your wallet</p>
        </div>
      </div>
    ),
  },
  {
    id: 14, bg: "#EEE9DA", textColor: "#1E3A4F",
    desktopStyle: { gridColumn: "3 / 5", gridRow: "5 / 6" }, mobileClass: "col-span-2",
    backBg: "#d9d4c5", backTextColor: "#091825", backBodyColor: "rgba(9,24,37,0.85)",
    backTitle: "Quality Ingredients",
    backBody: "We source only premium ingredients. No shortcuts or compromises on what goes into your food.",
    content: (
      <div className="flex items-center justify-between h-full gap-[21px]">
        <div className="flex flex-col gap-[13px]">
          <Star size={21} strokeWidth={1.5} style={iconStyle} />
          <p style={{ fontFamily: "var(--font-montserrat), Arial, Helvetica, sans-serif", fontSize: "clamp(13px, 1.8vw, 18px)", fontWeight: 700 }}>Best Quality Ingredients</p>
          <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "11px", opacity: 0.55 }}>No compromises on what goes into your meals</p>
        </div>
        <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(76px, 10vw, 110px)", lineHeight: 1, opacity: 0.06, userSelect: "none", flexShrink: 0 }}>★</p>
      </div>
    ),
  },
];
