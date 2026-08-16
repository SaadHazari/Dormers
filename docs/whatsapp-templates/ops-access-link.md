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

```
Dormers Ops
```

### Button

**One button. Type: Visit website. URL type: Dynamic.**

| Field | Value |
|---|---|
| Button text | `Open` |
| Website URL | `https://dormers.ae/{{1}}` |
| Sample value for `{{1}}` | `kitchen/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6` |

**The trailing `{{1}}` is the whole point.** The code sends only the path
suffix (`kitchen/<token>` or `ops/<token>`) and Meta appends it to the base.

> This is exactly where the admin alert template went wrong. That one was
> created with a **static** URL, so the moment code sent button parameters Meta
> rejected it with error **132018**. If `ops_access_link` is ever recreated,
> the URL must keep the `{{1}}` on the end or sending breaks the same way.

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
