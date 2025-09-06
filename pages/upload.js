
import { useState } from 'react'

export default function Upload() {
  const [adsFile, setAdsFile] = useState(null)
  const [ordersFile, setOrdersFile] = useState(null)
  const [msg, setMsg] = useState('')

  const submit = async () => {
    if (!adsFile || !ordersFile) { setMsg('Please select both files.'); return; }
    const form = new FormData()
    form.append('ads', adsFile)
    form.append('orders', ordersFile)
    const res = await fetch('/api/ingest', { method: 'POST', body: form })
    const json = await res.json()
    setMsg(JSON.stringify(json, null, 2))
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Upload Daily Files (CSV/XLSX)</h1>
      <div className="space-y-3">
        <input type="file" onChange={e => setAdsFile(e.target.files?.[0] ?? null)} />
        <input type="file" onChange={e => setOrdersFile(e.target.files?.[0] ?? null)} />
        <button onClick={submit} className="px-4 py-2 rounded-2xl bg-black text-white">Upload & Ingest</button>
      </div>
      {msg && <pre className="mt-6 p-4 bg-gray-50 rounded border text-xs whitespace-pre-wrap">{msg}</pre>}
    </main>
  )
}
