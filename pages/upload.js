
import { useState } from 'react'

export default function Upload() {
  const [adsFile, setAdsFile] = useState(null)
  const [ordersFile, setOrdersFile] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setMsg('')
    if (!adsFile || !ordersFile) { setMsg('⚠️ Please select BOTH files.'); return; }
    setBusy(true)
    try {
      const form = new FormData()
      form.append('ads', adsFile)
      form.append('orders', ordersFile)
      const res = await fetch('/api/ingest', { method: 'POST', body: form })
      const text = await res.text()
      let json
      try { json = JSON.parse(text) } catch { json = { raw: text } }
      if (!res.ok || json?.ok === false) {
        setMsg('❌ ' + (json?.error || res.statusText))
      } else {
        setMsg('✅ Ingested\n' + JSON.stringify(json, null, 2))
      }
    } catch (e) {
      setMsg('❌ Network error: ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Upload Daily Files (CSV/XLSX)</h1>
      <div className="space-y-3">
        <div>
          <div className="text-xs text-gray-600 mb-1">Meta Daily Report</div>
          <input type="file" onChange={e => setAdsFile(e.target.files?.[0] ?? null)} />
        </div>
        <div>
          <div className="text-xs text-gray-600 mb-1">Orders CSV</div>
          <input type="file" onChange={e => setOrdersFile(e.target.files?.[0] ?? null)} />
        </div>
        <button
          onClick={submit}
          disabled={busy}
          className={`px-4 py-2 rounded-2xl text-white ${busy?'bg-gray-500':'bg-black'}`}
        >
          {busy ? 'Uploading…' : 'Upload & Ingest'}
        </button>
      </div>
      {msg && <pre className="mt-6 p-4 bg-gray-50 rounded border text-xs whitespace-pre-wrap">{msg}</pre>}
    </main>
  )
}

