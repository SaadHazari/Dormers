# Zoho Books: the refund email

[zoho-refund-issued.html](zoho-refund-issued.html) is the "Refund Issued"
email, built to match the invoice and receipt templates already in Zoho Books:
same card, same orange, same Helvetica, same sign-off and footer.

## Pasting it

Zoho Books, Settings, Preferences, then the module the refund belongs to
(Credit Notes for a customer refund), Email Templates, and either edit the
existing refund template or create one. Switch the editor to HTML source and
paste the whole file.

## The placeholders, which you must confirm

Zoho names its placeholders per module, and the names differ between Credit
Notes, Retainer Invoices and Payments. The file uses these four:

| In the file | What it should show |
|---|---|
| `%CustomerName%` | the customer's name |
| `%CreditNoteNumber%` | the credit note or refund reference |
| `%RefundDate%` | the date the refund was issued |
| `%RefundAmount%` | the amount refunded |

`%CustomerName%` is the same everywhere, so it is safe. Check the other three
against the "Insert Placeholder" dropdown in that template before saving. If
Zoho offers a different name, swap the text between the percent signs and
leave everything else alone. Common variants are `%RefundedDate%`,
`%AmountRefunded%` and `%ReferenceNumber%`.

Send yourself a test from Zoho once it is saved.

## What this template is for

Refunds you raise inside Zoho Books by hand. The season refunds the app
processes go straight through Stripe and do not create a Zoho credit note
today, so they do not trigger this email. The customer still hears about
those: Stripe's refund message and the app's own refund email cover them.
Wiring Zoho credit notes to season refunds is on the follow-up list in the
design document, not built.
