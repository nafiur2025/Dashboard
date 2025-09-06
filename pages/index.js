
export default function Home() {
  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">FB Media Buyer Copilot (JS-only)</h1>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <a href="/upload" className="p-6 rounded-2xl shadow bg-white border">Upload Daily Files</a>
        <a href="/dashboard" className="p-6 rounded-2xl shadow bg-white border">Dashboard</a>
        <a href="/alerts" className="p-6 rounded-2xl shadow bg-white border">Alert Center</a>
      </div>
      <p className="text-sm mt-6">All times BST (UTC+6).</p>
    </main>
  )
}
