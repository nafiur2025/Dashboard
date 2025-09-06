import formidable from 'formidable'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

export const config = { api: { bodyParser: false, sizeLimit: '25mb' } }

const FX = parseFloat(process.env.FX_SGD_TO_BDT || '95')

// ---------------- helpers ----------------
function toNumber(x) {
  if (x===null || x===undefined || x==='') return null
  const s = String(x).replace(/,/g,'')
  const n = parseFloat(s)
  return Number.isNaN(n) ? null : n
}
function normStr(v) {
  return (v ?? '').toString().trim()
}
function pick(row, keys) {
  const map = {}
  for (const k of Object.keys(row||{})) map[k.trim().toLowerCase()] = row[k]
  for (const key of keys) {
    const k = key.trim().toLowerCase()
    if (map.hasOwnProperty(k)) return map[k]
    if (row[key] != null) return row[key] // exact fallback
  }
  return null
}
// Accepts ISO, RFC, dd.mm.yyyy, dd/mm/yyyy, dd-mm-yyyy, dd-MMM-yyyy, some Excel serials
function parseDateLoose(v) {
  if (!v) return null
  const s = String(v).trim()
  if (!s) return null

  // Excel serial (rough support)
  const num = Number(s)
  if (!Number.isNaN(num) && /^\d+(\.\d+)?$/.test(s) && num > 59 && num < 60000) {
    const base = new Date(Date.UTC(1899, 11, 30))
    const dt = new Date(base.getTime() + Math.floor(num) * 86400000)
    return dt.toISOString().slice(0,10)
  }

  // ISO/RFC
  const iso = new Date(s)
  if (!isNaN(iso)) return iso.toISOString().slice(0,10)

  // dd.mm.yyyy or dd/mm/yyyy or dd-mm-yyyy (optionally with time)
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/)
  if (m) {
    const d = +m[1], mo = +m[2], y = +m[3]
    const dt = new Date(Date.UTC(y, mo - 1, d))
    return dt.toISOString().slice(0,10)
  }

  // dd-MMM-yyyy (03-Sep-2025)
  m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3,})[ -](\d{4})$/)
  if (m) {
    const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11}
    const d = +m[1], mo = months[m[2].toLowerCase()], y = +m[3]
    if (mo != null) return new Date(Date.UTC(y, mo, d)).toISOString().slice(0,10)
  }

  return null
}
async function fsRead(path) { const fs = await import('fs/promises'); return fs.readFile(path) }

// ---------------- main ----------------
export default async function handler(req, res) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ ok:false, error: 'Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' })
  }

  try {
    // Parse form
    const form = formidable({ multiples: true })
    const { files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => err ? reject(err) : resolve({ files }))
    })
    const one = f => Array.isArray(f) ? f[0] : f
    const adsFile = one(files?.ads)
    const ordersFile = one(files?.orders)
    if (!adsFile || !ordersFile) return res.status(400).json({ ok:false, error: 'Both files are required: ads + orders' })

    // ---- ADS (CSV/XLSX) ----
    async function parseAds(file) {
      const buf = await fsRead(file.filepath || file.path)
      const mime = (file.mimetype || file.type || '')
      let rows = []
      if (mime.includes('excel') || mime.includes('spreadsheet')) {
        const wb = XLSX.read(buf)
        const ws = wb.Sheets['Raw Data Report'] || wb.Sheets[wb.SheetNames[0]]
        const rowsArr = XLSX.utils.sheet_to_json(ws, { header: 1 })
        let headerRow = rowsArr.findIndex(r => (r||[]).some(c => String(c||'').toLowerCase().includes('campaign name')))
        if (headerRow === -1) headerRow = 0
        rows = XLSX.utils.sheet_to_json(ws, { range: headerRow, defval: null })
      } else {
        const txt = buf.toString('utf8')
        rows = Papa.parse(txt, { header: true }).data
      }

      let total = 0, skipped = 0
      const out = []
      for (const r of rows) {
        total++
        const delivery = normStr(pick(r, ['Delivery level','Delivery Level']))
        const dateISO  = parseDateLoose(pick(r, ['Reporting ends','Date','Reporting date']))
        const campaign = normStr(pick(r, ['Campaign name','Campaign Name','Campaign']))
        const adset    = normStr(pick(r, ['Ad Set Name','Ad set name','Adset Name','Adset']))
        const ad       = normStr(pick(r, ['Ad name','Ad Name','Ad']))

        const isTotalRow = ['total','grand total'].includes(campaign.toLowerCase())
        if (!dateISO || !campaign || isTotalRow) { skipped++; continue }

        const isCampaign = delivery.toLowerCase() === 'campaign'
        const spendSGD   = toNumber(pick(r, ['Amount spent (SGD)','Amount Spent (SGD)']))
        const spendBDT   = spendSGD!=null ? spendSGD*FX : toNumber(pick(r, ['Amount spent (BDT)','Spend (BDT)']))
        const conv       = toNumber(pick(r, ['Messaging conversations started','Results']))

        out.push({
          date: dateISO,
          campaign_name: campaign,
          adset_name: adset || '',
          ad_name: ad || '',
          delivery_level: delivery || '',
          is_prospecting: (function() {
            const hay = `${campaign||''} ${adset||''}`.toLowerCase()
            const cold = ['prospecting','cold','broad']
            const warm = ['remarketing','retarget','rmk','retargeting','rm']
            return cold.some(k=>hay.includes(k)) && !warm.some(k=>hay.includes(k))
          })(),
          spend_bdt: isCampaign ? spendBDT : 0,
          impressions: toNumber(pick(r, ['Impressions'])),
          ctr_all: toNumber(pick(r, ['CTR (all)','CTR All'])),
          frequency: toNumber(pick(r, ['Frequency'])),
          conversations: isCampaign ? conv : 0
        })
      }
      return { rows: out, stats: { total, skipped, inserted: out.length } }
    }

    // ---- ORDERS (CSV) ----
    async function parseOrders(file) {
      const buf = await fsRead(file.filepath || file.path)
      const txt = buf.toString('utf8')
      const rows = Papa.parse(txt, { header: true }).data

      let total = 0, inserted = 0, skipped = 0
      const out = []

      for (const r of rows) {
        total++
        const orderId = normStr(pick(r, ['Invoice Number','Order ID']))
        const dateISO = parseDateLoose(pick(r, ['Creation Date','Order Date']))
        if (!orderId || !dateISO) { skipped++; continue }

        const paid = toNumber(pick(r, ['Paid Amount','Paid Amount (BDT)'])) || 0
        const due  = toNumber(pick(r, ['Due Amount','Due Amount (BDT)'])) || 0

        out.push({
          order_id: orderId,
          order_date: dateISO,
          order_status: normStr(pick(r, ['Order Status','Status'])),
          paid_amount_bdt: paid,
          due_amount_bdt: due,
          conversation_id: normStr(pick(r, ['Conversation ID']))
        })
        inserted++
      }
      return { rows: out, stats: { total, inserted, skipped } }
    }

    const ads = await parseAds(adsFile)
    const orders = await parseOrders(ordersFile)

    // ---- write + compute ----
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    const r1 = await supabase.rpc('upsert_ads_norm', { rows: ads.rows });      if (r1.error) throw new Error('upsert_ads_norm: ' + r1.error.message)
    const r2 = await supabase.rpc('upsert_orders_norm', { rows: orders.rows }); if (r2.error) throw new Error('upsert_orders_norm: ' + r2.error.message)

    const runDate = orders.rows[0]?.order_date || ads.rows[0]?.date
    const r3 = await supabase.rpc('compute_daily_kpis', { run_date: runDate }); if (r3.error) throw new Error('compute_daily_kpis: ' + r3.error.message)
    const r4 = await supabase.rpc('score_north_star', { run_date: runDate });   if (r4.error) throw new Error('score_north_star: ' + r4.error.message)
    await supabase.rpc('generate_alerts', { run_date: runDate }).catch(()=>null)

    return res.status(200).json({
      ok: true,
      stats: {
        ads_total_rows: ads.stats.total, ads_skipped: ads.stats.skipped, ads_inserted: ads.stats.inserted,
        orders_total_rows: orders.stats.total, orders_skipped: orders.stats.skipped, orders_inserted: orders.stats.inserted
      },
      date: runDate
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ ok:false, error: (err?.message || String(err)) })
  }
}
