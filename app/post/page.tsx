'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getUser, saveJob } from '@/lib/store'
import { Job } from '@/lib/mock-data'
import { ArrowLeft, Sprout, CheckCircle } from 'lucide-react'

const CROPS = [
  'Manioc', 'Maïs', 'Cacao', 'Café', 'Palmier à huile',
  'Arachide', 'Légumes', 'Riz', 'Plantain', 'Autre'
]

const CURRENCIES: Record<string, string> = {
  '+243': 'CDF', '+242': 'XAF', '+237': 'XAF', '+241': 'XAF', '+236': 'XAF',
}

export default function PostPage() {
  const router = useRouter()
  const [user, setUser] = useState<ReturnType<typeof getUser>>(null)
  const [success, setSuccess] = useState(false)

  const [form, setForm] = useState({
    title: '',
    crop: '',
    description: '',
    hectares: '',
    pricePerDay: '',
    workersNeeded: '',
    startDate: '',
    duration: '',
  })

  useEffect(() => {
    const u = getUser()
    if (!u) { router.push('/'); return }
    if (u.role !== 'farmer') { router.push('/map'); return }
    setUser(u)
  }, [router])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const valid = form.title && form.hectares && form.pricePerDay && form.startDate && form.workersNeeded

  const handleSubmit = () => {
    if (!user || !valid) return
    const currency = CURRENCIES[user.phone.slice(0, 4)] || 'XAF'
    const job: Job = {
      id: 'j-' + Date.now(),
      farmerId: user.id,
      farmerName: user.name,
      farmerRating: user.rating || 0,
      farmerReviewCount: user.reviewCount || 0,
      title: form.title,
      description: form.description,
      hectares: parseFloat(form.hectares),
      pricePerDay: parseInt(form.pricePerDay),
      currency,
      lat: user.lat + (Math.random() - 0.5) * 0.01,
      lng: user.lng + (Math.random() - 0.5) * 0.01,
      city: 'Ma ville',
      country: 'Afrique Centrale',
      startDate: form.startDate,
      duration: parseInt(form.duration) || 7,
      workersNeeded: parseInt(form.workersNeeded),
      status: 'open',
      createdAt: new Date().toISOString(),
    }
    saveJob(job)
    setSuccess(true)
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{ background: 'var(--bg)' }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
          style={{ background: '#d1fae5' }}>
          <CheckCircle className="w-10 h-10" style={{ color: '#059669' }} />
        </div>
        <h2 className="text-3xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)' }}>
          Offre publiée !
        </h2>
        <p className="mb-8" style={{ color: 'var(--text-muted)' }}>
          Votre annonce est maintenant visible sur la carte. Les travailleurs proches peuvent postuler.
        </p>
        <Link href="/map"
          className="px-8 py-4 rounded-2xl text-white font-semibold"
          style={{ background: 'var(--forest)' }}>
          Voir la carte
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{ background: 'white', borderBottom: '1px solid var(--border)' }}>
        <Link href="/map" className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: '#f0f7f2' }}>
          <ArrowLeft className="w-5 h-5" style={{ color: 'var(--forest)' }} />
        </Link>
        <div>
          <h1 className="font-bold text-lg" style={{ fontFamily: 'var(--font-display)' }}>Publier une offre</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Trouvez des travailleurs qualifiés</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-5">

        <Section title="Type de travail">
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
            Culture / activité
          </label>
          <select value={form.crop} onChange={set('crop')}
            className="w-full px-4 py-3 rounded-xl mb-3"
            style={inputStyle}>
            <option value="">Sélectionner…</option>
            {CROPS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
            Titre de l'annonce *
          </label>
          <input type="text" placeholder="ex: Récolte de manioc — Grande exploitation"
            value={form.title} onChange={set('title')}
            className="w-full px-4 py-3 rounded-xl"
            style={inputStyle} />
        </Section>

        <Section title="Terrain & Rémunération">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>Hectares *</label>
              <input type="number" placeholder="ex: 5" value={form.hectares} onChange={set('hectares')}
                className="w-full px-4 py-3 rounded-xl" style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>Prix/jour *</label>
              <input type="number" placeholder="ex: 7000" value={form.pricePerDay} onChange={set('pricePerDay')}
                className="w-full px-4 py-3 rounded-xl" style={inputStyle} />
            </div>
          </div>
        </Section>

        <Section title="Équipe & Calendrier">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>Nb. travailleurs *</label>
              <input type="number" placeholder="ex: 4" value={form.workersNeeded} onChange={set('workersNeeded')}
                className="w-full px-4 py-3 rounded-xl" style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>Durée (jours)</label>
              <input type="number" placeholder="ex: 14" value={form.duration} onChange={set('duration')}
                className="w-full px-4 py-3 rounded-xl" style={inputStyle} />
            </div>
          </div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>Date de début *</label>
          <input type="date" value={form.startDate} onChange={set('startDate')}
            className="w-full px-4 py-3 rounded-xl" style={inputStyle} />
        </Section>

        <Section title="Description (optionnel)">
          <textarea
            placeholder="Hébergement fourni ? Repas inclus ? Matériel disponible ? Précisez tout ce qui peut aider un travailleur à se décider…"
            value={form.description} onChange={set('description')} rows={4}
            className="w-full px-4 py-3 rounded-xl resize-none"
            style={inputStyle} />
        </Section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-4 py-4"
        style={{ background: 'white', borderTop: '1px solid var(--border)' }}>
        <button onClick={handleSubmit} disabled={!valid}
          className="w-full py-4 rounded-2xl text-white font-semibold text-lg disabled:opacity-40"
          style={{ background: 'var(--forest)' }}>
          Publier l'offre
        </button>
      </div>
    </div>
  )
}

const inputStyle = {
  background: 'white',
  border: '2px solid var(--border)',
  color: 'var(--text)',
  outline: 'none',
  fontFamily: 'var(--font-body)',
  fontSize: '15px',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'white', border: '1px solid var(--border)' }}>
      <h2 className="font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text)' }}>
        <span className="w-1.5 h-5 rounded-full inline-block" style={{ background: 'var(--forest)' }} />
        {title}
      </h2>
      {children}
    </div>
  )
}
