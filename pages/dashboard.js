
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Dashboard() {
  const [kpi, setKpi] = useState(null)

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('daily_kpis')
        .select('*')
        .eq('scope', 'account')
        .order('date', { ascending: false })
        .limit(1)
      if (error) console.error(error)
      if (data && data.length > 0) setKpi(data[0])
    })()
  }, [])

  if (!kpi) return <main className="p-6">Loading…</main>

  const tiles = [
    ['Revenue', kpi.revenue_bdt?.toLocaleString('en-US',{maximumFractionDigits:0})],
    ['Orders', kpi.orders],
    ['Ad Spend', kpi.ad_spend_bdt?.toLocaleString('en-US',{maximumFractionDigits:0})],
    ['Blended CPA', kpi.blended_cpa?.toFixed?.(0) ?? '—'],
    ['ROAS', kpi.roas?.toFixed?.(2) ?? '—'],
    ['Conv→Order %', kpi.conv_to_order_pct?.toFixed?.(2) ?? '—'],
    ['AOV', kpi.aov?.toFixed?.(0) ?? '—']
  ]

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <span className={`inline-block px-3 py-1 rounded-full text-white ${
          kpi.north_star_color==='Green'?'bg-green-600':kpi.north_star_color==='Yellow'?'bg-yellow-500':'bg-red-600'
        }`}>
          North Star: {kpi.north_star_color ?? '—'}
        </span>
      </div>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([label,val])=> (
          <div key={label} className="p-4 rounded-2xl shadow bg-white border">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-2xl font-bold">{val ?? '—'}</div>
          </div>
        ))}
      </div>
      <p className="text-sm mt-6">All times BST (UTC+6)</p>
    </main>
  )
}
