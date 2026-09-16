# Season emails: what to create in ZeptoMail

Eight templates, one per moment, so ZeptoMail reports opens and delivery for
each moment separately. The HTML files in this folder are the templates; the
app only chooses which one to send and fills in the numbers.

Nothing sends until a template exists in ZeptoMail and its key is in the
environment. Until then the app records the failure and retries, and the
customer still sees the fact in the app.

## Creating one (about two minutes each)

1. **ZeptoMail, Mail Agents, Templates, Create template.** Name it exactly as
   the "Template name" column says, and paste the **Subject** exactly.
2. Choose the **HTML / code** editor, delete whatever is there, and paste the
   whole contents of the file in the "File" column.
3. Save. ZeptoMail shows a **template key** on the template. Copy it.
4. Put that key in **two** places under the name in the "Environment variable"
   column: your local `.env.local`, and Netlify (Site configuration,
   Environment variables). Redeploy after the last one.

Do not rename the merge fields. The app sends exactly the ones listed, and a
test fails if a template asks for anything else.

## The eight

| Moment | Template name | Subject | File | Environment variable | Merge fields |
|---|---|---|---|---|---|
| The wrap-up day is set and their meals run past it | `season-plan-runs-past` | The semester wraps up on {{wrap_up_day}} | [season-plan-runs-past.html](season-plan-runs-past.html) | `ZEPTOMAIL_TPL_SEASON_PLAN_RUNS_PAST` | first_name, wrap_up_day, held_meals, credit_aed (optional) |
| Their plan is finishing and no new plan fits before the break | `season-last-dinners` | Your last dinners of the semester | [season-last-dinners.html](season-last-dinners.html) | `ZEPTOMAIL_TPL_SEASON_LAST_DINNERS` | first_name, last_dinner, wrap_up_day, offer_aed (optional) |
| The break starts and their meals are kept | `season-plan-held` | Your meals are kept for next semester | [season-plan-held.html](season-plan-held.html) | `ZEPTOMAIL_TPL_SEASON_PLAN_HELD` | first_name, plan_name, held_meals, credit_aed (optional) |
| The break starts and their own pause carries over | `season-pause-carries` | Your plan waits for you | [season-pause-carries.html](season-pause-carries.html) | `ZEPTOMAIL_TPL_SEASON_PAUSE_CARRIES` | first_name, plan_name, offer_aed (optional) |
| You reopen and their kept meals are ready | `season-plan-ready` | We are back. Your meals are ready | [season-plan-ready.html](season-plan-ready.html) | `ZEPTOMAIL_TPL_SEASON_PLAN_READY` | first_name, plan_name, held_meals, credit_aed (optional) |
| Five days after reopening, their credit is unspent | `season-credit-waiting` | AED {{credit_aed}} is waiting in your wallet | [season-credit-waiting.html](season-credit-waiting.html) | `ZEPTOMAIL_TPL_SEASON_CREDIT_WAITING` | first_name, credit_aed |
| They save their spot for next semester | `season-spot-saved` | Your spot is saved | [season-spot-saved.html](season-spot-saved.html) | `ZEPTOMAIL_TPL_SEASON_SPOT_SAVED` | first_name, credit_aed |
| You decline a refund | `season-refund-declined` | About your refund request | [season-refund-declined.html](season-refund-declined.html) | `ZEPTOMAIL_TPL_SEASON_REFUND_DECLINED` | first_name, plan_name, held_meals, reason |

An optional field is simply left out when there is no amount, and the block
that mentions it disappears. That is why the code never sends a zero.

## Testing them

After adding one or more keys to `.env.local`:

```
npm run mail:season-test
```

It sends one of each to `saadhazari01@gmail.com` with sample numbers, skips
any template whose key is not set yet, and lists what it skipped. To send just
one, or somewhere else:

```
ONLY=season-plan-held npm run mail:season-test
TEST_TO_EMAIL=you@example.com npm run mail:season-test
```

## The two that already exist

`season-plan-ended` and `season-reopen` are live templates and are unchanged.
The order confirmation needs one small edit: a line that shows the wallet
credit used on the order. The app already sends `credit_used_aed` and leaves
it out when no credit was used, so the block is safe to add:

```html
{{#credit_used_aed}}
<p style="margin:0 0 6px;font-size:15px;line-height:24px;">
  Wallet credit used: <b>AED {{credit_used_aed}}</b>
</p>
{{/credit_used_aed}}
```

## The design

All eight follow [EMAIL-DESIGN.md](EMAIL-DESIGN.md): white card, 2px orange
border, Montserrat, real dark mode, no emoji and no dashes. The brand banner
at the top, with the mark beside the wordmark and a divider under it, was
added 2026-09-16 at the owner's request, matching the sign-in code email.
Regenerate the screenshots any time with the render script in the season
scratchpad, or read the files directly in a browser.
