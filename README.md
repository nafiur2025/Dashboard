
# FB Media Buyer Copilot — JS-only Starter (no TypeScript)

**Stack**: Next.js + Netlify + Supabase (Postgres). Timezone: Asia/Dhaka (UTC+6).

## Deploy (zero local tooling)
1. Create Supabase project → SQL Editor → run `supabase_schema.sql` from this repo.
2. RLS read access (run in SQL Editor):
   ```sql
   grant usage on schema fbmb to anon, authenticated;
   alter table fbmb.daily_kpis enable row level security;
   alter table fbmb.alerts     enable row level security;
   grant select on fbmb.daily_kpis to anon, authenticated;
   grant select on fbmb.alerts     to anon, authenticated;
   create policy "public read kpis" on fbmb.daily_kpis for select using (true);
   create policy "public read alerts" on fbmb.alerts     for select using (true);
   ```
3. Netlify → New site from Git → set env:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
   - `TZ=Asia/Dhaka`
   - `FX_SGD_TO_BDT=95`
   - `NODE_VERSION=20`
4. Build command: `npm run build` • Publish dir: `.next`
5. Deploy. Then go to `/upload` to ingest daily ads + orders.

## Data contract (campaign-level totals)
- **Spend**: sum of `Amount spent (SGD)` at `Delivery level = Campaign` × 95.
- **Conversations**: sum of `Messaging conversations started` at `Delivery level = Campaign`.
- Orders count excludes any status containing “cancelled” (case-insensitive).
