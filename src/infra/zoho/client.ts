/**
 * Zoho Books API client — used by the post-payment fan-out in the Stripe
 * webhook to mint FTA-compliant tax invoices in Zoho. Zoho keeps the
 * finance dashboards and emails the official invoice PDF to the customer;
 * our app owns the customer-facing confirmation experience.
 *
 * ──────────────────────────── ONE-TIME SETUP ────────────────────────────
 *  1. Go to https://api-console.zoho.com → "Add Client" → "Self Client".
 *     Note the Client ID + Client Secret.
 *
 *  2. In the Self Client → "Generate Code" tab, request a code with scope:
 *        ZohoBooks.invoices.CREATE,ZohoBooks.invoices.READ,
 *        ZohoBooks.invoices.UPDATE,ZohoBooks.contacts.CREATE,
 *        ZohoBooks.contacts.READ,ZohoBooks.customerpayments.CREATE
 *     Time duration: 10 minutes. Hit "Create" → copy the code.
 *
 *  3. Exchange the code for a refresh token (one-shot, do it within 10min):
 *        curl -X POST 'https://accounts.zoho.com/oauth/v2/token' \
 *          -d 'grant_type=authorization_code' \
 *          -d 'client_id=<CLIENT_ID>' \
 *          -d 'client_secret=<CLIENT_SECRET>' \
 *          -d 'code=<CODE>'
 *     The response contains `refresh_token` — save it. The refresh token
 *     itself does not expire unless revoked; the access token expires
 *     hourly and is rotated automatically by this client.
 *
 *  4. Find your Org ID in Zoho Books → Settings → Organization Profile
 *     (top-right of every Zoho Books page when there are multiple orgs).
 *
 *  5. Set the following env vars (both .env.local AND Netlify dashboard):
 *        ZOHO_CLIENT_ID
 *        ZOHO_CLIENT_SECRET
 *        ZOHO_REFRESH_TOKEN
 *        ZOHO_ORG_ID
 *        ZOHO_REGION         (optional, defaults to 'com')
 *
 *  VAT (optional — only when Dormers becomes TRN-registered): once the
 *  company crosses the FTA voluntary registration threshold and gets a
 *  TRN, add a 5% VAT tax in Zoho Books (Settings → Taxes), grab its ID
 *  via `GET /settings/taxes`, and set:
 *        ZOHO_VAT_TAX_ID
 *        ZOHO_VAT_INCLUSIVE  (defaults to 'true')
 *  Until then, invoices are minted without a tax line — same shape as the
 *  current Make.com → Zoho flow.
 *
 *  Regional notes: UAE-based Zoho orgs usually live on the global ('.com')
 *  data centre. EU orgs use '.eu', India '.in', AU '.com.au', SA '.sa'.
 *  Check the URL when you log into Zoho — that's your region.
 */

const REGION = process.env.ZOHO_REGION ?? 'com';
const ACCOUNTS_BASE = `https://accounts.zoho.${REGION}`;
const API_BASE = `https://www.zohoapis.${REGION}/books/v3`;

let cachedToken: { token: string; expiresAt: number } | null = null;

async function refreshAccessToken(): Promise<string> {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Zoho credentials missing — set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN',
    );
  }
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
  const res = await fetch(`${ACCOUNTS_BASE}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`Zoho token refresh failed: ${json.error ?? res.statusText}`);
  }
  // 60s safety margin so we never hand out a token that's about to expire
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000,
  };
  return json.access_token;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  return refreshAccessToken();
}

export type ZohoFetchInit = Omit<RequestInit, 'body'> & { body?: unknown };

function buildUrl(path: string): string {
  const orgId = process.env.ZOHO_ORG_ID;
  if (!orgId) throw new Error('ZOHO_ORG_ID is not set');
  return `${API_BASE}${path}${path.includes('?') ? '&' : '?'}organization_id=${orgId}`;
}

export async function zohoFetch<T = unknown>(
  path: string,
  init: ZohoFetchInit = {},
): Promise<T> {
  const url = buildUrl(path);

  // FormData passes through untouched (browser/Node sets Content-Type with
  // boundary). Strings pass through. Objects get JSON-serialised.
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const serialisedBody =
    init.body === undefined
      ? undefined
      : isFormData
        ? (init.body as FormData)
        : typeof init.body === 'string'
          ? init.body
          : JSON.stringify(init.body);

  const baseHeaders: Record<string, string> = isFormData
    ? {} // multipart: let fetch set Content-Type with the boundary
    : { 'Content-Type': 'application/json' };

  const doRequest = async (token: string) =>
    fetch(url, {
      ...init,
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        ...baseHeaders,
        ...(init.headers ?? {}),
      },
      body: serialisedBody as BodyInit | undefined,
    });

  let res = await doRequest(await getAccessToken());
  if (res.status === 401) {
    cachedToken = null;
    res = await doRequest(await getAccessToken());
  }

  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text };
  }

  if (!res.ok) {
    const msg =
      (json as { message?: string; _raw?: string }).message ??
      (json as { _raw?: string })._raw ??
      res.statusText;
    throw new Error(`Zoho ${init.method ?? 'GET'} ${path} → ${res.status}: ${msg}`);
  }
  return json as T;
}

/**
 * Fetch a binary response from Zoho (e.g. invoice PDF). Returns the raw
 * bytes as a Buffer. Reuses the same token-refresh + retry flow as
 * `zohoFetch`. Used by the post-payment fan-out to grab the invoice PDF
 * before re-uploading it as an attachment on the payment.
 */
export async function zohoFetchBinary(path: string): Promise<Buffer> {
  const url = buildUrl(path);
  const doRequest = async (token: string) =>
    fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });

  let res = await doRequest(await getAccessToken());
  if (res.status === 401) {
    cachedToken = null;
    res = await doRequest(await getAccessToken());
  }
  if (!res.ok) {
    throw new Error(`Zoho GET ${path} (binary) → ${res.status}: ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
