# Season page redesign (2026-09-16)

Saad: "the entire seasonal pause UI is confusing, all over the place, makes me want to press it less."
Process: critique (interface-design:critique) → design (interface-design:interface-design) → critique the design → build.

## 1. Critique of the page as it was

- **No focal point.** "Where is the season, what do I do next" was the fifth thing on the page, under three KPI tiles and a six-row waitlist table.
- **The same fact three times, in clashing colours.** Winding down = red tile + orange banner. The break = red tile, red banner, green banner, yellow box, three tiles, four tables.
- **The buttons repel.** The loudest things were the red "Stop sales now" and "End the season today". The safe primary actions looked faded or sat at the bottom.
- **Twelve names for four ideas.** Pause, wind-down, wrap-up, close day, buffer, break, halt, sales stopped, waitlist, early-access list, saved spots, restart and reopen target. "Saved spots 6 of 15" sat above "Waitlist 1".
- **The season's shape is never drawn.** It is a timeline, but the page gave it as paragraphs, a date input and a scroll-clipped list.
- **Settings mixed with status.** A credit range sat in the status row. The customer-message editor and its preview were always open.
- **Craft.** Two stat-tile components. Every label was 10px uppercase. On a phone every table scrolled sideways.

## 2. Domain → direction

**Who:** Saad, the owner, a few times a season, on a laptop or phone. The decision is money and kitchen cost: when does the kitchen stop, and is it time to reopen?

**Domain:** term calendar, last service, the pass, make-up tickets, lights out, doors open, held plans on the books, people waiting at the door.

**Colour world (already in the product):**
- brand orange = a night the kitchen cooks
- faint orange outline = meals on the books that will be held
- white hairline ticket = make-up day (`MAKEUP_FILL`, the customer grid's own mark)
- navy running to dusk = the kitchen is dark (`CLOSURE_FILL`, the customer grid's closure mark)
- cream and navy for everything else

**Signature: the kitchen calendar.** It is a Mon to Sun week grid of kitchen days from this week to the break:
- Each cell shows that day's meals.
- The wrap-up day carries a pin.
- Make-up days are white tickets, and the break is navy.
- Days a plan would still be on the books after the wrap-up day are dashed orange: that is the held food, visible.
- **Tapping a day makes it the wrap-up day.** The native date input goes; the calendar is the control.

**Defaults rejected:**
1. KPI tile row → a phase rail (Open → Winding down → Break, with Reopen as the way back) plus one sentence that answers the question.
2. A traffic-light stack of banners → one amber **Needs you** list that appears only when something is waiting: refunds, settings drift, a plan cooking during the break, a credit never minted. A calm state says nothing.
3. A row of equal buttons, some red → one primary action per phase beside the calendar. Sales on or off is a quiet row. Clear and End today go into a closed **More moves** drawer at the bottom.
4. Always-open settings → **What customers see** collapsed to a one-line summary ("Live now" during a pause), expanded on demand with the preview beside it.

**Vocabulary (one name each):**
- Sales (open or stopped)
- Wrap-up day (the last regular dinner)
- Make-up days (buffer)
- Last kitchen day (the close day)
- Break
- Reopen
- Saved spots, and Reopen target

**Wireframe (winding down):**

```
Season                               ● Open ── ● Winding down ── ○ Break   ↺ Reopen
Winding down to Wed 30 Sep
12 kitchen days to go. Sales open for plans that finish by then.

┌ Kitchen calendar ───────────────────────────┬ If the season ends here ─────┐
│        Mon Tue Wed Thu Fri Sat Sun           │ 12 kitchen days              │
│ 14 Sep  4   4   ✕   4   4   3   ·            │ 13 meals held · AED 186 est. │
│ 21 Sep  4   4   4   4   4   3   ·            │ 2 run past · 1 starts after  │
│ 28 Sep  4   4   📍2 □   ▓   ▓   ▓  break     │ Make-up days  [0][1][2][3]   │
│  5 Oct  ┊3┊ ┊3┊ ┊1┊  (held)                  │ [ SAVE NEW DATES ]           │
│ Tap a day to make it the wrap-up day         │ Sales  Open        Stop sales│
│ ■ cooks □ make-up ┊ held ▓ break             │                              │
└──────────────────────────────────────────────┴──────────────────────────────┘
Needs you (only when non-empty)
Plans on the books (6)                         Saved spots  6 / 15  ▬▬▬▬───
                                               Academic City 3 · DIP 2 · …
What customers see   "We are between semesters." · AED 15–20   Live now  Edit ▾
More moves ▸   Clear the wrap-up day · End the season today
```

On the break, the right panel becomes **Ready to reopen?**: saved spots against the target, plans that become ready, and the Reopen button. The calendar shows the last kitchen days, then navy.

## 3. Critique of the proposed design, and the fixes applied

| Finding | Fix |
|---|---|
| "Reopen" drawn as a fourth phase is a lie: it is an action, not a state | Three-step rail; Reopen is the way back, shown only as the break's primary action |
| The grid can grow without bound (plans six weeks out; the break has no end) | Show this week through the later of the last meal on the books and the last kitchen day. The break shows one navy week, then "until you reopen" |
| Tappable cells are invisible as controls | A hint line, a pointer cursor, a hover ring, cells as real buttons with aria-labels. Sundays, past days and today are inert |
| Right panel repeats the header sentence | The header states what is saved. The panel shows the draft, and its title changes to "If you move it here" only when the draft differs |
| Five cell types need a legend or they are noise | A legend line under the grid, drawing only the types present |
| Saved spots beside a six-column plans table squeezes it | Plans take the wide column as a list of rows, not a table (it stacks on a phone). Saved spots take the narrow column |
| "Stop sales" as a quiet row could be missed | It keeps its confirm dialog and says the state in words ("Open" / "Stopped") next to the button |
| Hiding End today could make it unfindable in an emergency | "More moves" is labelled, sits at the page foot, and its contents are named in the summary line |
| Confirm dialogs were five paragraphs | Short title, a list of consequences with the numbers bolded, one sentence each |
| Uppercase eyebrows on every field made every label shout equally (craft) | Eyebrows only on section titles. Field labels use sentence case at 12px/600 |
| Spacing drifted (2.5, 1.5, 0.5 steps) | New code stays on the 4-grid: 4, 8, 12, 16, 24, 32 |
| Depth: the old page mixed tinted boxes, borders and cards | Borders-only, the admin's own `t.card`. Colour appears only in calendar cells, the one primary button and the Needs you list |
| Numbers in every calendar cell could turn the grid into a spreadsheet | The count is small and dimmed. The fill carries the read, and the number is there for the kitchen-count question |
| Needs you text inherited long paragraphs (the drift warning is 40 words) | One line per item: what, then the move ("Press Stop sales now once to line them up") |
| Mobile | The grid is 7 columns of about 40px at 390px. Rows stack; nothing scrolls sideways |

Button labels the runbook names are kept verbatim: Schedule, Save new dates, Stop sales now, Resume sales, Clear the wrap-up day, End the season today, Reopen, Approve, Decline, Retry, Send the reopening notice.

## 4. Plain words (Saad, 2026-09-16)

Keeping the runbook's button names was the wrong call: the names were the confusion. Every label now says what it does, and every button that changes something opens a dialog with **What happens** and **Can I undo this?**

| Was | Now |
|---|---|
| Winding down / Break | Ending soon / Closed for the break |
| Wrap-up day | Last dinner day |
| Close day, last kitchen day | Last cooking day |
| Buffer, make-up days | Catch-up days |
| Sales | New orders |
| Held | Kept for next semester |
| Saved spots, waitlist | Waiting list |
| Reopen target | Goal |
| Schedule / Save new dates | Set the last dinner day / Change the last dinner day |
| Stop sales now / Resume sales | Pause new orders / Take new orders again |
| Clear the wrap-up day | Cancel the season end |
| End the season today (type END SEASON) | Close the kitchen tonight (type CLOSE TONIGHT) |
| Reopen | Reopen the kitchen |
| Approve / Decline / Retry | Give the refund / Say no / Try the refund again |
| Send the reopening notice | Tell customers we are open |
| More moves | Other options |

The goal and the customer message also save through a dialog. The owner WhatsApp messages sent after scheduling, cancelling, reopening and a failed refund use the same words. The daily digest and the other alerts written in SQL still use the old words; they change with the next season migration.
