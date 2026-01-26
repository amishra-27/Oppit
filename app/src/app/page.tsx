import Link from "next/link";

export default function Home() {
  const defaultPlantId = process.env.NEXT_PUBLIC_DEFAULT_PLANT_ID;

  // In the future, this would come from auth + API
  const plants = defaultPlantId ? [
    { id: defaultPlantId, name: "Plant A", location: "Main Facility", machines: 3, status: "active" }
  ] : [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white overflow-hidden">
      {/* Subtle grid background */}
      <div 
        className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />
      
      {/* Gradient orbs */}
      <div className="fixed top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-emerald-500/20 blur-[120px]" />
      <div className="fixed bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-cyan-500/15 blur-[100px]" />

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight">Oppit</span>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Future: Sign in button */}
          <span className="text-sm text-zinc-500">
            Demo Mode
          </span>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-8 pt-12 pb-24">
        
        {/* Welcome Section */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            Welcome to Oppit
          </h1>
          <p className="text-zinc-400 text-lg">
            Select a plant to view real-time machine monitoring
          </p>
        </div>

        {/* Plants Grid */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              Your Plants
            </h2>
            {/* Future: Add plant button */}
            <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-1 rounded">
              {plants.length} plant{plants.length !== 1 ? 's' : ''}
            </span>
          </div>

          {plants.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plants.map((plant) => (
                <Link
                  key={plant.id}
                  href={`/plants/${plant.id}`}
                  className="group relative p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 transition-all"
                >
                  {/* Status indicator */}
                  <div className="absolute top-4 right-4">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-500/15 text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </span>
                  </div>

                  {/* Plant icon */}
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>

                  {/* Plant info */}
                  <h3 className="text-xl font-semibold mb-1">{plant.name}</h3>
                  <p className="text-sm text-zinc-500 mb-4">{plant.location}</p>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-zinc-400">
                      <span className="text-white font-medium">{plant.machines}</span> machines
                    </span>
                  </div>

                  {/* Arrow indicator */}
                  <div className="absolute bottom-6 right-6 text-zinc-600 group-hover:text-zinc-400 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </div>
                </Link>
              ))}

              {/* Add Plant Card - Future */}
              <div className="p-6 rounded-2xl border border-dashed border-zinc-800 hover:border-zinc-700 transition-colors flex flex-col items-center justify-center text-center min-h-[200px] cursor-not-allowed opacity-50">
                <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <p className="text-sm text-zinc-500 font-medium">Add Plant</p>
                <p className="text-xs text-zinc-600 mt-1">Coming soon</p>
              </div>
            </div>
          ) : (
            <div className="p-12 rounded-2xl border border-dashed border-zinc-800 text-center">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">No plants configured</h3>
              <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                Set <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs">NEXT_PUBLIC_DEFAULT_PLANT_ID</code> in your environment variables to get started.
              </p>
            </div>
          )}
        </section>

        {/* Features Preview */}
        <section className="pt-8 border-t border-zinc-800">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 mb-6">
            Platform Features
          </h2>
          
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-5 rounded-xl bg-zinc-900/50 border border-zinc-800">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-semibold mb-1">Real-time Monitoring</h3>
              <p className="text-sm text-zinc-500">
                Sub-second updates for all machine metrics
              </p>
            </div>

            <div className="p-5 rounded-xl bg-zinc-900/50 border border-zinc-800">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="font-semibold mb-1">Interactive Charts</h3>
              <p className="text-sm text-zinc-500">
                Historical trends with hover tooltips
              </p>
            </div>

            <div className="p-5 rounded-xl bg-zinc-900/50 border border-zinc-800">
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="font-semibold mb-1">Multi-tenant Ready</h3>
              <p className="text-sm text-zinc-500">
                Secure access per manufacturer (coming soon)
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-800 px-8 py-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-500">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-sm">Oppit © 2026</span>
          </div>
          <p className="text-sm text-zinc-600">
            Industrial IoT. Simplified.
          </p>
        </div>
      </footer>
    </div>
  );
}
