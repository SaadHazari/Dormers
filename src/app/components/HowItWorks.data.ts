// Shared data for HowItWorks (consumed by both desktop + mobile variants).

export interface CardDef {
  num: string;
  numGrad: string;
  numGradLight: string;
  title: string;
  body: string;
  subline: string;
}

export const CARDS: CardDef[] = [
  {
    num: "01",
    numGrad: "linear-gradient(180deg, rgba(237,232,218,0.60) 0%, rgba(237,232,218,0.03) 80%, rgba(237,232,218,0) 100%)",
    numGradLight: "linear-gradient(180deg, rgba(9,24,37,0.40) 0%, rgba(9,24,37,0.03) 80%, rgba(9,24,37,0) 100%)",
    title: "YOU",
    body: "One quick sign-up. That's your whole part.",
    subline: "Way quicker than deciding what to eat.",
  },
  {
    num: "02",
    numGrad: "linear-gradient(180deg, rgba(245,127,32,0.65) 0%, rgba(245,127,32,0.03) 80%, rgba(245,127,32,0) 100%)",
    numGradLight: "linear-gradient(180deg, rgba(245,127,32,0.65) 0%, rgba(245,127,32,0.03) 80%, rgba(245,127,32,0) 100%)",
    title: "CHOOSE",
    body: "Pick how long you want dinner sorted.",
    subline: "A week, a month, or one meal to try us.",
  },
  {
    num: "03",
    numGrad: "linear-gradient(180deg, rgba(237,232,218,0.60) 0%, rgba(237,232,218,0.03) 80%, rgba(237,232,218,0) 100%)",
    numGradLight: "linear-gradient(180deg, rgba(9,24,37,0.40) 0%, rgba(9,24,37,0.03) 80%, rgba(9,24,37,0) 100%)",
    title: "US",
    body: "We cook. We pack. We deliver. Mon – Sat.",
    subline: "New dish. Warm box. At your door. Like clockwork.",
  },
];
