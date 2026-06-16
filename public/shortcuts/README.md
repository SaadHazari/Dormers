# Dormers Delivery Shortcuts — iOS Setup Guide

Set up 5 shortcuts on your iPhone (one per dorm). Each shortcut confirms delivery for that dorm with one tap.

**Before you start:** Go to /admin/ops-tokens and copy the rider token URL. You need the token value (the 32-character code at the end of the URL).

---

## Create one shortcut (repeat for each dorm)

1. Open the **Shortcuts** app on your iPhone
2. Tap **+** (top right) to create a new shortcut
3. Tap **Add Action**
4. Search for **"Get Contents of URL"** and tap it
5. Tap the URL field and type:
   ```
   https://dormers.ae/api/ops/mark-delivered
   ```
6. Tap **Show More** (below the URL field)
7. Set **Method** to **POST**
8. Set **Request Body** to **JSON**
9. Tap **Add new field** and add:
   - Key: `dorm_name`   Value: `The Myriad`   _(change per dorm — see list below)_
10. Tap **Add new field** again and add:
    - Key: `token`   Value: `[paste your rider token here]`
11. Tap the shortcut name at the top and rename it: **"Myriad Delivered"**
12. Tap **Done**

Repeat steps 1-12 for each dorm, changing `dorm_name` and the shortcut name each time.

---

## Dorm names (copy exactly — spelling matters)

| Dorm | dorm_name value | Shortcut name |
|------|----------------|---------------|
| The Myriad | `The Myriad` | Myriad Delivered |
| KSK Homes | `KSK Homes` | KSK Delivered |
| Yugo | `Yugo` | Yugo Delivered |
| DSOA Residence | `DSOA Residence` | DSOA Delivered |
| Study World | `Study World` | Study World Delivered |

---

## Share with other devices

1. Long-press a shortcut > **Share**
2. Tap **Copy iCloud Link**
3. Send the link to another iPhone — they can install the shortcut directly

---

## Why you need to build these manually

Apple requires all shortcut files to be cryptographically signed (since iOS 15). Pre-built `.shortcut` files from outside the Shortcuts app cannot be installed. The iCloud link method is the only supported way to share.

---

## Troubleshooting

**Shortcut returns an error dialog:** Check that the rider token is still active in /admin/ops-tokens. If it was rotated, update the `token` field in each shortcut to the new value.

**"No matching delivery event found":** The rider has not confirmed pickup for that dorm yet today. The delivery event is created at pickup time. Try again after pickup.

**Token was rotated — how to update all 5 shortcuts:**
1. Go to /admin/ops-tokens, rotate the rider token, copy the new token value (from the modal)
2. In the Shortcuts app, open each shortcut, edit the `token` JSON field, paste the new value, save
