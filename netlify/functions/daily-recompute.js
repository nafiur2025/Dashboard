
const { createClient } = require('@supabase/supabase-js')

exports.handler = async () => {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const now = new Date()
  now.setUTCDate(now.getUTCDate() - 1)
  const runDate = now.toISOString().slice(0,10)
  await supabase.rpc('compute_daily_kpis', { run_date: runDate })
  await supabase.rpc('score_north_star', { run_date: runDate })
  const r5 = await supabase.rpc('generate_alerts', { run_date: runDate })
if (r5.error) {
  console.warn('generate_alerts (cron):', r5.error.message)
}
  return { statusCode: 200, body: JSON.stringify({ ok: true, runDate }) }
}
