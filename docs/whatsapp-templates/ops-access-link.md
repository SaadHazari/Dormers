# WhatsApp template: `ops_access_link`

The message that carries a kitchen or rider access link from
`/admin/ops-tokens` to the person who needs it, sent from the Dormers business
number.

Until this template is approved and live, the Share panel still works: every
failed send falls back to a `wa.me` link that opens WhatsApp with the same
message already written, so nobody is ever blocked from handing out a link.

---

## Create it in Meta Business Manager

**WhatsApp Manager → Message templates → Create template**

| Field | Value |
|---|---|
| Name | `ops_access_link` |
| Category | **Utility** |
| Language | **English** — the one that resolves to `en`, not `en_US` or `en_GB` |

### Header

**None.** Leave it off. A header adds a rejection surface and buys nothing
here.

### Body

Use **named** variables, not numbered ones. Paste exactly:

```
Hi {{name}}, here is your Dormers {{link_name}} access link. Tap Open below, then add it to your home screen so you can get back in.

Please keep it to yourself. Anyone with this link can open it.
```

Sample values for the review submission:

| Variable | Sample |
|---|---|
| `name` | `Ali` |
| `link_name` | `Main kitchen` |

### Footer

**Meta's footer limit is 60 characters and it clips silently, mid-word, with no
warning.** Keep it short:

```
Keep this link to yourself.
```

### Button

**One button. Type: Visit website. URL type: Dynamic.**

| Field | Value |
|---|---|
| Button text | `Open` |
| Website URL | `https://dormers.ae/` |
| Sample URL | `https://dormers.ae/kitchen/0a804f4083660635407500ec2a98e92a` |

Note the two fields want different things, which is easy to get backwards:
**Website URL** takes the base only, while **Sample URL** takes the whole
thing including the suffix ("Enter full URL for https://dormers.ae/{{1}}").
Neither is what the code sends at runtime — that is the bare suffix
`kitchen/<token>`, which Meta joins onto the base.

> ⚠️ **Type the base URL only. Do NOT type `{{1}}` into the URL box.**
>
> Choosing "Dynamic" makes Meta append its own `{{1}}` for you — the UI shows
> it sitting at the end of what you typed. Typing the placeholder yourself
> gets it stored as literal text and percent-encoded, and Meta then adds a
> second variable after it:
>
> ```
> https://dormers.ae/%7B%7B1%7D%7D{{1}}     ← broken, every link 404s
> https://dormers.ae/{{1}}                  ← correct
> ```
>
> This one is nasty because Meta still **approves** it and the send still
> **succeeds**, so the wa.me fallback never fires. The rider just gets a dead
> button. Run `npm run check:whatsapp-template` after any template change —
> it reads back what Meta actually stored and fails on exactly this.

The code sends only the path suffix (`kitchen/<token>` or `ops/<token>`) and
Meta joins it onto the base.

> A **static** URL button breaks it a different way: Meta rejects the send with
> error **132018** the moment code passes button parameters. That is what
> happened to the admin alert template.

The sample token above is fabricated, not a live link. Never put a real token
into a template sample — it sits in Meta's review system indefinitely.

---

## Wire it up

Two environment variables, both optional — the defaults are already correct if
you name the template `ops_access_link` and pick plain English.

```
WHATSAPP_OPS_LINK_TEMPLATE_NAME=ops_access_link
WHATSAPP_OPS_LINK_TEMPLATE_LANG=en
```

Set these in Netlify for production. If Business Manager shows the language as
something other than `en` (it sometimes lands on `en_GB` or `en_AE`), set
`WHATSAPP_OPS_LINK_TEMPLATE_LANG` to match **exactly** — Meta returns a 404
saying the template does not exist in that language when it does not match.

---

## Check it works

**Run this first, before sending anything:**

```
npm run check:whatsapp-template
```

It reads the template back from Meta and fails on the mistakes that still pass
review: an encoded placeholder in the button URL, a static button, numbered
body variables where the code sends named ones, a language that does not match
the env var, and a footer clipped at 60 characters. APPROVED does not mean
correct — this is the only thing that tells the two apart without sending a
real message to a real person.

Then, end to end:

1. Open `/admin/ops-tokens` and add yourself to Ops Crew with your own number.
2. Press **Share** on any link, then **Send** next to your name.
3. A green "Sent to you on WhatsApp" means the template is live.
4. An amber box means it did not go through. The message names the Meta error,
   and the **Open WhatsApp with the message ready** link underneath is the way
   out. Common causes:

| What Meta says | What it means |
|---|---|
| `Template name does not exist in the translation (Meta 132001)` | The template is not live under that name and language yet. Either it is still in review, the name does not match `WHATSAPP_OPS_LINK_TEMPLATE_NAME`, or the language does not match `WHATSAPP_OPS_LINK_TEMPLATE_LANG`. This is the expected error until the template is approved. |
| `Meta 132018` | The button was created as static. Recreate the template with `https://dormers.ae/{{1}}`. |
| `param_name mismatch` | The body was created with numbered variables. Recreate it with `{{name}}` and `{{link_name}}`. |
| `Meta 131026` | The recipient's number is not on WhatsApp. Check the digits on the crew list. |

The full Graph error body is written to the server log and the audit trail even
though the panel only shows the readable line.

---

## Where the code lives

- Send: `sendOpsLinkWhatsApp()` in `src/infra/meta-whatsapp/client.ts`
- Caller and fallback: `sendOpsLink()` in `src/app/admin/ops-tokens/actions.ts`
- The fallback message text is kept word-for-word in step with the template
  body above, so a manual send reads the same as an automatic one.
