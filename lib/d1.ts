/**
 * Cloudflare D1 HTTP API client.
 * Used from Next.js Server Components / Route Handlers (NEVER from the browser).
 */

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID!
const DATABASE_ID = process.env.CF_D1_DATABASE_ID!
const API_TOKEN  = process.env.CF_D1_API_TOKEN!

type D1Result<T = any> = {
  results: T[]
  success: boolean
  meta: { duration: number; last_row_id?: number; changes?: number }
}

type D1Response<T = any> = {
  result: D1Result<T>[]
  success: boolean
  errors?: { code: number; message: string }[]
}

if (!ACCOUNT_ID || !DATABASE_ID || !API_TOKEN) {
  // throw at first call instead of at import — let pages render an error
  console.warn('[d1] Missing CF env vars (CF_ACCOUNT_ID / CF_D1_DATABASE_ID / CF_D1_API_TOKEN)')
}

async function d1Fetch(sql: string, params: any[] = []): Promise<D1Response> {
  if (!ACCOUNT_ID || !DATABASE_ID || !API_TOKEN) {
    throw new Error('D1 credentials not configured')
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params: params.map(p => p == null ? null : String(p)) }),
    cache: 'no-store',
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '<no body>')
    throw new Error(`D1 HTTP ${res.status}: ${txt.slice(0, 200)}`)
  }
  const json = (await res.json()) as D1Response
  if (!json.success) {
    throw new Error(`D1 error: ${JSON.stringify(json.errors)}`)
  }
  return json
}

/** Run a query that returns rows. */
export async function d1Query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const r = await d1Fetch(sql, params)
  return (r.result[0]?.results || []) as T[]
}

/** Run a single-row query, returns the first row or null. */
export async function d1First<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await d1Query<T>(sql, params)
  return rows[0] ?? null
}

/** Run an INSERT/UPDATE/DELETE, returns meta. */
export async function d1Exec(sql: string, params: any[] = []): Promise<{ changes: number; lastRowId?: number }> {
  const r = await d1Fetch(sql, params)
  const meta = r.result[0]?.meta
  return { changes: meta?.changes ?? 0, lastRowId: meta?.last_row_id }
}

/**
 * Run multiple statements as a "batch". D1 HTTP doesn't support multi-statement
 * payloads natively over a single request, so we send them sequentially. For
 * atomic transactions you'd need to use a Worker binding — acceptable for our
 * single-tenant use case.
 */
export async function d1Batch(statements: { sql: string; params?: any[] }[]): Promise<void> {
  for (const s of statements) {
    await d1Fetch(s.sql, s.params || [])
  }
}
