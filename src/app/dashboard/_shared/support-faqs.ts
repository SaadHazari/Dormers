// One FAQ list for both support trees (desktop SupportClient, MobileSupport).
// The two used to carry separate copies that drifted — mobile had six
// questions to desktop's eight, and both sent preference / allergen edits to
// the Plan page, which is read-only for them (editing lives on Profile).
export interface SupportFaq { q: string; a: string }

export const SUPPORT_FAQS: SupportFaq[] = [
  {
    q: 'When is my meal delivered?',
    a: 'Every weekday (Monday–Saturday) by 7–8 PM, directly to your dorm building. Sunday is always a rest day — no delivery.',
  },
  {
    q: 'Can I skip a meal?',
    a: 'Yes — Weekly Flex includes 1 skip, Monthly Premium and Monthly Max include 3 skips per cycle. To skip tonight, tap Skip before 2 PM (Dubai time); after that you can still skip any upcoming day. You never lose the meal — your end date just moves out by a day.',
  },
  {
    q: 'How does pausing work?',
    a: 'Monthly Premium and Monthly Max subscribers get 1 free pause per cycle (indefinite duration). When you resume, your end date extends by the exact number of days paused — you never lose meals.',
  },
  {
    q: 'Can I change my meal preference (Veg/Non-Veg)?',
    a: 'Yes — update your preference on the Profile page under Edit preferences. Changes apply from your next subscription. Mid-cycle changes are not supported.',
  },
  {
    q: 'What if I have an allergy?',
    a: 'Update your allergens on the Profile page under Edit preferences. Our kitchen team reviews all allergen flags before preparing your meal. For severe allergies, message us on WhatsApp directly.',
  },
  {
    q: 'How do I renew my plan?',
    a: 'Tap "Renew plan" on your dashboard before your end date. Your new cycle starts immediately after the current one ends.',
  },
  {
    q: 'Do you deliver to my dorm?',
    a: 'We currently deliver to YUGO, Study World, and partnered university accommodations in Dubai. Message us on WhatsApp to confirm your building.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept all major cards (Visa, Mastercard, Amex) via Stripe. All transactions are encrypted — we never store your card details.',
  },
]
