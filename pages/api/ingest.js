
import formidable from 'formidable'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

export const config = { api: { bodyParser: false } }

const FX = parseFloat(process.env.FX_SGD_TO_BDT || '95')

function toNumber(x) {
  if (x===null || x===undefined || x==='') return null
  const s = String(x).replace(/,/g,'')
  const n = parseFloat(s)
  return Number.isNaN(n) ? null : n
}

function inferProspecting(campaign, adset) {
  const hay = `${campaign||''} ${adset||''}`.toLowerCase()
  const cold = ['prospecting','cold','broad']
  const warm = ['remarketing','retarget','rmk','retargeting','rm']
  return cold.some(k=>hay.includes(k)) && !warm.some(k=>hay.includes(k))
}

async function fsRead(path) {
  const fs = await import('fs/promises')
  return fs.readFile(path)
}

export default async function handler(req, res) {
  const form = formidable({ multiples: true })
  const { files } = await new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => err ? reject(err) : resolve({files}))
  })

  const adsFile = files['ads']
  const ordersFile = files['orders']

  async function parseAds(file) {
    const buf = await fsRead(file.filepath)
    let rows = []
    if ((file.mimetype||'').includes('excel') || (file.mimetype||'').includes('spreadsheet')) {
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

    const out = rows.map(r => {
      const delivery = (r['Delivery level'] || r['Delivery Level'] || '').toString()
      const isCampaign = delivery.toLowerCase()==='campaign'
      const spendSGD = toNumber(r['Amount spent (SGD)'] ?? r['Amount Spent (SGD)'])
      const spendBDT = (spendSGD!=null) ? spendSGD * FX : toNumber(r['Amount spent (BDT)'])
      const conv = toNumber(r['Messaging conversations started']) ?? toNumber(r['Results'])
      return {
        date: (r['Reporting ends'] || r['Date']),
        campaign_name: r['Campaign name'] || r['Campaign'],
        adset_name: r['Ad Set Name'] || r['Ad set name'],
        ad_name: r['Ad name'],
        delivery_level: delivery,
        is_prospecting: inferProspecting(r['Campaign name'], r['Ad Set Name']),
        spend_bdt: isCampaign ? spendBDT : 0,
        impressions: toNumber(r['Impressions']),
        ctr_all: toNumber(r['CTR (all)']),
        frequency: toNumber(r['Frequency']),
        conversations: isCampaign ? conv : 0
      }
    })
    return out
  }

  async function parseOrders(file) {
    const buf = await fsRead(file.filepath)
    const txt = buf.toString('utf8')
    const rows = Papa.parse(txt, { header: true }).data
    const out = rows.map(r => {
      const paid = toNumber(r['Paid Amount'] || r['Paid Amount (BDT)']) || 0
      const due = toNumber(r['Due Amount'] || r['Due Amount (BDT)']) || 0
      return {
        order_id: r['Invoice Number'] || r['Order ID'],
        order_date: r['Creation Date'] || r['Order Date'],
        order_status: r['Order Status'] || r['Status'],
        paid_amount_bdt: paid,
        due_amount_bdt: due,
        conversation_id: r['Conversation ID'] || null
      }
    })
    return out
  }

  const adsRows = await parseAds(adsFile)
  const ordersRows = await parseOrders(ordersFile)

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  await supabase.rpc('upsert_ads_norm', { rows: adsRows })
  await supabase.rpc('upsert_orders_norm', { rows: ordersRows })

  const runDate = (ordersRows[0]?.order_date) || (adsRows[0]?.date)
  await supabase.rpc('compute_daily_kpis', { run_date: runDate })
  await supabase.rpc('score_north_star', { run_date: runDate })
  await supabase.rpc('generate_alerts', { run_date: runDate }).catch(()=>null)

  res.status(200).json({ ok: true, rows: { ads: adsRows.length, orders: ordersRows.length }, date: runDate })
}
