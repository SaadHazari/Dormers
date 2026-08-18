/**
 * The card-format shell for admin broadcasts, per
 * docs/email-templates/EMAIL-DESIGN.md. Rendered in OUR code — ZeptoMail
 * receives finished HTML, so Mustache semantics never apply here; the only
 * token is {{first_name}}, replaced server-side per recipient.
 *
 * Admin-authored text is escaped, never rendered as HTML: a composer that
 * can inject markup into 500 inboxes is an incident waiting for a typo.
 *
 * No server-only imports here (no next/*, no supabase, no process.env) —
 * this module is also imported client-side for the live composer preview.
 */

import { whatsAppHref } from '@/shared/contacts'

const FONT_STACK = "'Montserrat','Helvetica Neue',Helvetica,Arial,sans-serif"

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function personalizeBroadcast(text: string, firstName: string): string {
  return text.replace(/\{\{\s*first_name\s*\}\}/g, firstName)
}

/**
 * Merge keys for one season-reopen recipient (docs/email-templates/season-reopen.html).
 * The template serves two audiences: credit holders get the credit block +
 * "Use my credit"; everyone else gets "Restart my plan". credit_aed is
 * OMITTED from the result — never sent as '' — when there's no unspent
 * credit, because ZeptoMail's Mustache engine treats an empty string as
 * truthy and would render a blank amount.
 */
export function buildSeasonReopenMergeInfo(input: {
  firstName: string
  isWaitlistMember: boolean
  unspentCreditAed: number
}): Record<string, string> {
  const mergeInfo: Record<string, string> = {
    first_name: input.firstName,
    cta_label: input.unspentCreditAed > 0 ? 'Use my credit' : 'Restart my plan',
    footer_reason: input.isWaitlistMember
      ? 'You are getting this because you asked to hear when we reopened.'
      : 'You are getting this because you were on a Dormers plan before.',
  }
  if (input.unspentCreditAed > 0) mergeInfo.credit_aed = String(input.unspentCreditAed)
  return mergeInfo
}

export function reasonLineFor(audience: string): string {
  switch (audience) {
    case 'early_access':
      return 'You are getting this because you asked to hear from us.'
    case 'active_plans':
      return 'You are getting this because you have a Dormers plan.'
    case 'ended_not_renewed':
      return 'You are getting this because you were on a Dormers plan before.'
    default:
      return 'You are getting this because you have a Dormers account.'
  }
}

export function buildBroadcastEmailHtml(input: {
  firstName: string
  heading: string
  bodyText: string
  ctaLabel?: string
  ctaUrl?: string
  reasonLine: string
}): string {
  const heading = esc(personalizeBroadcast(input.heading, input.firstName))
  const paragraphs = personalizeBroadcast(input.bodyText, input.firstName)
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p style="margin:0 0 20px 0; font-size:16px; line-height:26px;">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n')

  const ctaBox =
    input.ctaLabel && input.ctaUrl
      ? `
              <table class="sub-container-orange" role="presentation" width="100%" border="0" cellspacing="0"
                cellpadding="0"
                style="background-color:#fffaf5; border:1.2px solid #f57f20; border-radius:8px; margin-bottom:26px;">
                <tr>
                  <td style="padding:26px; text-align:center;">
                    <a class="cta cta-button" href="${esc(input.ctaUrl)}"
                      style="background-color:#f57f20; color:#ffffff; padding:12px 20px; font-size:14px; font-weight:700; border-radius:6px; display:inline-block; font-family:${FONT_STACK};">
                      ${esc(input.ctaLabel)}
                    </a>
                  </td>
                </tr>
              </table>`
      : ''

  return `<!doctype html>
<html lang="en">

<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${heading}</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
    }

    img {
      border: 0;
      outline: none;
      text-decoration: none;
      -ms-interpolation-mode: bicubic;
    }

    a {
      text-decoration: none;
    }

    @media (prefers-color-scheme: dark) {
      .main-card {
        border: 2px solid #f57f20 !important;
        background-color: #1a1a1a !important;
      }

      .text-content {
        color: #d9d9d9 !important;
      }

      .strong-text {
        color: #fcfcfc !important;
      }

      .sub-container-orange {
        background-color: #261a0d !important;
        border: 1.2px solid #f57f20 !important;
      }

      .sub-container-green {
        background-color: #0d1a10 !important;
        border: 1.2px solid #2e7d32 !important;
      }

      .sub-container-gray {
        background-color: #222222 !important;
        border: 1.2px solid #444444 !important;
      }

      .label-orange {
        color: #f57f20 !important;
      }

      .label-green {
        color: #5aa860 !important;
      }

      .divider {
        border-top: 1px solid #333333 !important;
      }

      .footer-text {
        color: #555555 !important;
      }

      .muted-line {
        color: #aaaaaa !important;
      }
    }

    @media only screen and (max-width: 620px) {
      .card-pad {
        padding: 30px 22px !important;
      }

      .h1 {
        font-size: 24px !important;
        line-height: 1.24 !important;
      }

      .cta {
        display: block !important;
        text-align: center !important;
      }
    }
  </style>
</head>

<body style="margin:0; padding:0;">

  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="padding:40px 10px;">
    <tr>
      <td align="center">

        <table class="main-card" role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"
          style="max-width:600px; background-color:#ffffff; border:2px solid #f57f20; border-radius:13px; overflow:hidden;">
          <tr>
            <td class="card-pad text-content"
              style="padding:42px; font-family:${FONT_STACK}; color:#5c6670; font-weight:500;">

              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 26px 0;">
                <tr>
                  <td width="48" valign="middle">
                    <img src="https://dormers.ae/email-mark.png" width="48" height="48" alt="Dormers"
                      style="display:block; width:48px; height:48px;">
                  </td>
                  <td width="13" style="font-size:0; line-height:0;">&nbsp;</td>
                  <td valign="middle">
                    <div class="strong-text"
                      style="font-size:19px; font-weight:800; letter-spacing:3px; color:#091825; line-height:1; font-family:${FONT_STACK};">
                      DORMERS&rsquo;</div>
                    <div class="label-orange"
                      style="font-size:9px; font-weight:700; letter-spacing:1.9px; color:#8c4214; margin-top:6px; line-height:1; text-transform:uppercase; font-family:${FONT_STACK};">
                      Meals that don&rsquo;t suck</div>
                  </td>
                </tr>
              </table>

              <h1 class="h1 strong-text"
                style="margin:0 0 16px 0; font-size:26px; line-height:1.22; font-weight:800; color:#091825; letter-spacing:-0.3px;">
                ${heading}
              </h1>

              ${paragraphs}
${ctaBox}
              <table class="sub-container-green" role="presentation" width="100%" border="0" cellspacing="0"
                cellpadding="0"
                style="background-color:#f2faf3; border:1.2px solid #2e7d32; border-radius:8px; margin-bottom:42px;">
                <tr>
                  <td style="padding:26px;">
                    <p class="label-green"
                      style="margin:0 0 8px 0; font-size:13px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#2e7d32;">
                      Questions?
                    </p>
                    <p style="margin:0 0 16px 0; font-size:15px; line-height:24px;">
                      We are a tap away on WhatsApp, usually replying within an hour.
                    </p>
                    <a href="${esc(whatsAppHref())}"
                      style="background-color:#2e7d32; color:#ffffff; padding:12px 20px; font-size:14px; font-weight:700; border-radius:6px; display:inline-block; font-family:${FONT_STACK};">
                      Chat with Support
                    </a>
                  </td>
                </tr>
              </table>

              <table class="divider" role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"
                style="border-top:1px solid #eeeeee;">
                <tr>
                  <td style="padding-top:26px; font-size:14px; line-height:22px;">
                    Warmly,<br>
                    <b class="strong-text" style="color:#091825; font-size:16px;">Team Dormers</b>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:42px;">
                    <p class="muted-line" style="margin:0 0 6px 0; font-size:12px; line-height:20px; color:#9a9a9a;">
                      ${esc(input.reasonLine)}
                    </p>
                    <p class="footer-text"
                      style="margin:0; font-size:12px; letter-spacing:1px; text-transform:uppercase; color:#b0b0b0;">
                      Made in Dubai
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>

</html>`
}
