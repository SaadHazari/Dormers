# Dormers email design — the card format

Owner-approved 2026-08-18, verified in Gmail light + dark. This is the canonical
format for every new ZeptoMail email, including the broadcast composer shell.
The living reference implementation is [season-plan-ended.html](season-plan-ended.html);
[season-reopen.html](season-reopen.html) is the two-audience variant.
`_brand-reference-start-day.html` is the older live-production era: still useful
for client-survival mechanics, superseded on palette details, emojis, and headings.

## Skeleton

```
body (no background, no margin)
  hidden preheader div
  outer table, width 100%, style="padding:40px 10px", td align=center
    main card table: max-width 600px, white bg, 2px solid #f57f20 border,
                     border-radius 13px, overflow hidden, class="main-card"
      one td, padding 42px, class="card-pad text-content"
        brand lockup (see below)
        h1
        intro paragraph
        sub-containers, stacked, 26px bottom margins
        green support box last (42px bottom margin)
        footer table with 1px #eeeeee top border
```

## Brand lockup (never a banner)

48px `https://dormers.ae/email-mark.png` (favicon house + cream halo, PNG because
Gmail/Outlook/Yahoo strip SVG), 13px gap, then live text stacked to the icon's
height: `DORMERS'` at 19px/800/3px tracking in navy, `MEALS THAT DON'T SUCK` at
9px caps/1.9px tracking in `#8c4214`. Header bands were rejected twice; do not
reintroduce one.

## Tokens

| Piece | Light | Dark override |
|---|---|---|
| Card | white, 2px `#f57f20` border, radius 13px | `#1a1a1a`, same border |
| H1 / strong (`.strong-text`) | `#091825`, weight 800 | `#fcfcfc` |
| Body (`.text-content`) | `#5c6670`, 15-16px, weight 500 | `#d9d9d9` |
| Orange box (`.sub-container-orange`) | `#fffaf5` bg, 1.2px `#f57f20` border, radius 8px | `#261a0d` bg |
| Green box (`.sub-container-green`) | `#f2faf3` bg, 1.2px `#2e7d32` border | `#0d1a10` bg |
| Gray box (`.sub-container-gray`) | `#f7f7f7` bg, 1.2px `#dddddd` border | `#222222` bg, `#444444` border |
| Box labels (`.label-orange`) | `#8c4214` 13px bold caps 1px tracking | `#f57f20` |
| Green label (`.label-green`) | `#2e7d32` | `#5aa860` |
| Buttons (inside boxes, radius 6px, 12px 20px pad) | orange `#f57f20` / green `#2e7d32`, white text | unchanged |
| Muted (`.muted-line`) / footer (`.footer-text`) / divider (`.divider`) | `#9a9a9a` / `#b0b0b0` / `#eeeeee` | `#aaaaaa` / `#555555` / `#333333` |

Font: `'Montserrat','Helvetica Neue',Helvetica,Arial,sans-serif` plus the Google
Fonts link; the layout must still look deliberate when the webfont never loads.
Meta: `color-scheme: light dark` — dark mode is real, not re-asserted light.
Buttons live inside sub-containers, not floating. Support box links only to
`https://wa.me/971504619384`.

## Copy rules

No emoji, no em or en dashes ("to" for ranges; curly apostrophes fine).
Uppercase eyebrow label per box. `<b>` for key numbers. Name-anchored H1.
Footer: truthful reason line, then `MADE IN DUBAI`. Sign-off matches the moment.

## Traps that have already bitten

1. **Never add `table { border-collapse: collapse }`.** The collapsed model
   discards border-radius (squares every box) and Gmail drops the card's
   perimeter border. Tables default to `separate`; leave them alone.
2. **ZeptoMail Mustache treats `''` as truthy.** Hide a section by omitting the
   merge key entirely, never by sending `''` or `'0'`.
3. **No SVG images** — rasterise to PNG at 2x with explicit width/height/alt.
4. **`#f57f20` on near-white fails contrast for small text** — labels use
   `#8c4214` in light mode.
5. **Mobile stat cells:** widths must sum with the gap column (48% / 4% / 48%),
   or the gap collapses and the boxes fuse.

## Definition of done for any new email

Render with sample merge data and screenshot via the playwright-core recipe
(`/tmp/pw-runner`, cached Chromium): light, dark, and 375px wide. Then a real
test send to the owner through the ZeptoMail raw API before the template is
created in ZeptoMail.
