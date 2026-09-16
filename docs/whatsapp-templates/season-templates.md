# WhatsApp templates: the season wind-down (spec §12.4)

Ten templates carry the season story on WhatsApp. Every one is already wired
in the database dispatcher (`dispatch_customer_notifications_tick`) and in the
app; nothing is sent until each template is approved at Meta, its Vault secret
exists, and the matching env flag is on. Until then the email and the app tell
the same story on their own, so a customer never misses the fact.

## The four steps for each template

1. **Meta:** WhatsApp Manager, Message templates, Create template. Language
   English (the one that resolves to `en`). Named variables, exactly as
   listed. One button, Visit website, static URL.
2. **Vault:** add a secret named `tpl_<kind>` whose value is the template's
   approved name (for example `tpl_season_plan_held` = `season_plan_held`).
   Supabase, Project settings, Vault.
3. **Env (Netlify):** turn on the flag for the group, then redeploy:
   - `WHATSAPP_SEASON_TEMPLATES_ENABLED=true` for the eight `season_*` kinds
   - `WHATSAPP_SEASON_REOPEN_ENABLED=true` for `intake_reopened` and `intake_back_open`
   - `WHATSAPP_SEASON_ENDED_ENABLED=true` for `intake_ended_credit` and `intake_ended_offer` (already documented elsewhere)
4. **Check:** send yourself one from a preview customer. The dispatcher writes
   `skipped:no_template` when the Vault secret is missing, and a Meta 400 lands
   in `customer_notifications.meta_status_code` when a parameter name differs.

Meta decides the final category. If it moves a UTILITY template to MARKETING,
accept it.

Every template below has a **header** with one named variable `first_name`
(text) and a **body** with the named variables listed. Footer, when used, must
stay under 60 characters.

---

## 1. `season_plan_runs_past` (N2, UTILITY)

Sent at 10:00 the day after the wrap-up day is scheduled, to plans that run
past it. Button: **See my options**, `https://dormers.ae/dashboard`.

Header: `Hi {{first_name}}`

Body:

```
The semester wraps up on {{wrap_up_day}}. Your dinners run until then. Your last {{held_meals}} meals will be kept for next semester with AED {{credit_aed}} in your wallet, or you can ask for a refund for them once the break starts.
```

| Variable | Sample |
|---|---|
| `first_name` | `Omar` |
| `wrap_up_day` | `Saturday 3rd October` |
| `held_meals` | `9` |
| `credit_aed` | `20` |

## 2. `season_last_dinners` (N4, MARKETING)

Replaces the renewal reminder while the season winds down, when no plan can
follow before the wrap-up day. Button: **Save my spot**, `https://dormers.ae/dashboard`.

Header: `Hi {{first_name}}`

Body:

```
Your last dinner of the semester is on {{last_dinner}}. The semester wraps up on {{wrap_up_day}}, so no new plan fits in before the break. Save your spot for next semester and AED {{offer_aed}} goes to your wallet the moment you do.
```

| Variable | Sample |
|---|---|
| `first_name` | `Aisha` |
| `last_dinner` | `Thursday 1st October` |
| `wrap_up_day` | `Saturday 3rd October` |
| `offer_aed` | `15` |

## 3. `season_skip_credited` (N6, UTILITY)

Immediately after a skip that turns into credit. Button: **See my wallet**,
`https://dormers.ae/dashboard/credit`.

Header: `Hi {{first_name}}`

Body:

```
Skipped. There is no delivery day left before {{wrap_up_day}} to move this meal to, so AED {{credit_aed}} goes to your wallet instead.
```

| Variable | Sample |
|---|---|
| `first_name` | `Omar` |
| `wrap_up_day` | `Saturday 3rd October` |
| `credit_aed` | `19.80` |

## 4. `season_plan_held` (N8, UTILITY)

At 10:00 the morning the break starts, to every plan held for next semester.
Button: **See my options**, `https://dormers.ae/dashboard`.

Header: `Hi {{first_name}}`

Body:

```
The kitchen is closed between semesters, so your last {{held_meals}} meals of {{plan_name}} are kept for you. AED {{credit_aed}} is in your wallet too. When we are back, tap Resume. If you would rather have your money back, you can ask for a refund in your dashboard.
```

| Variable | Sample |
|---|---|
| `first_name` | `Omar` |
| `plan_name` | `Monthly Premium` |
| `held_meals` | `9` |
| `credit_aed` | `20` |

## 5. `season_pause_carries` (N9, UTILITY)

At 10:00 the morning the break starts, to a customer whose own pause is still
on. Button: **See my options**, `https://dormers.ae/dashboard`.

A WhatsApp template cannot show one line to some people and not others, and a
refund needs a card payment behind it, so the refund is worded as something to
check rather than something promised. The dashboard shows the truth.

Header: `Hi {{first_name}}`

Body:

```
Your {{plan_name}} is still paused, and the kitchen is now closed between semesters. Your meals wait for you until we reopen. If you would rather not wait, open your dashboard: if your plan was paid by card you can ask for a refund there. Save your spot now and AED {{offer_aed}} goes to your wallet.
```

| Variable | Sample |
|---|---|
| `first_name` | `Priya` |
| `plan_name` | `Monthly Premium` |
| `offer_aed` | `15` |

## 6. `season_spot_saved` (N12, UTILITY)

Immediately after Save my spot. Button: **See my wallet**,
`https://dormers.ae/dashboard/credit`.

Header: `Hi {{first_name}}`

Body:

```
Your spot is saved. AED {{credit_aed}} is in your Credit Wallet for your first Monthly plan when we reopen, and it does not expire. We will message you here the day the kitchen is back.
```

| Variable | Sample |
|---|---|
| `first_name` | `Aisha` |
| `credit_aed` | `20` |

## 7. `season_plan_ready` (N17, MARKETING)

When the reopening notice is launched, to every plan held for next semester.
Button: **Resume my plan**, `https://dormers.ae/dashboard`.

Header: `Hi {{first_name}}`

Body:

```
We are back. Your {{held_meals}} meals of {{plan_name}} are ready. Tap Resume on your home page when you want your dinners to start again. Nothing restarts on its own.
```

| Variable | Sample |
|---|---|
| `first_name` | `Omar` |
| `held_meals` | `9` |
| `plan_name` | `Monthly Premium` |

## 8. `season_credit_waiting` (N18, MARKETING)

Once, five days after reopening, to credit holders who have not bought a plan.
Button: **Pick my plan**, `https://dormers.ae/dashboard/plan`.

Header: `Hi {{first_name}}`

Body:

```
We reopened a few days ago and AED {{credit_aed}} is still waiting in your wallet from last semester. It comes off your next Monthly plan at checkout and does not expire.
```

| Variable | Sample |
|---|---|
| `first_name` | `Yusuf` |
| `credit_aed` | `20` |

---

## The two reopening templates (N15, N16)

These were approved at Meta before this work, and their copy is not in the
repo. The dispatcher sends them with the parameter names below. **Open each
template in WhatsApp Manager and compare the variable names before adding the
Vault secrets.** If they differ, either edit the template to these names or
tell the developer the real names; a mismatch is a Meta 400 on every send.

| Kind | Header | Body variables | Sent to |
|---|---|---|---|
| `intake_reopened` | `first_name` | `credit_aed` | Everyone holding unspent waitlist credit from any season |
| `intake_back_open` | `first_name` | `plan_name` | Past customers without credit |

Both ride the reopening notice from the Season page: the email goes first, the
WhatsApp follows from the same per-recipient facts. Vault secrets:
`tpl_intake_reopened`, `tpl_intake_back_open`. Flag: `WHATSAPP_SEASON_REOPEN_ENABLED`.
