'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setUser } from '@/lib/store'
import { User } from '@/lib/mock-data'
import { Sprout, Hammer, Phone, ArrowRight, Star, Users, MapPin } from 'lucide-react'

const COUNTRY_CODES = [
  { code: '+225', flag: '🇨🇮', name: 'Côte d\'Ivoire' },
]

const DEMO_COORDS = [
  { lat: 5.348, lng: -4.012 },  // Abidjan
  { lat: 7.691, lng: -5.031 },  // Bouaké
  { lat: 6.819, lng: -5.274 },  // Yamoussoukro
  { lat: 4.748, lng: -6.636 },  // San-Pédro
  { lat: 7.549, lng: -7.554 },  // Man
]

export default function Home() {
  const router = useRouter()
  const [step, setStep] = useState<'landing' | 'phone' | 'verify' | 'name' | 'role'>('landing')
  const [countryCode, setCountryCode] = useState(COUNTRY_CODES[0])
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'farmer' | 'worker' | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSendOtp = () => {
    if (phone.length < 8) return
    setLoading(true)
    setTimeout(() => { setLoading(false); setStep('verify') }, 1200)
  }

  const handleVerifyOtp = () => {
    if (otp.length < 4) return
    setStep('name')
  }

  const handleNameSubmit = () => {
    if (name.length < 2) return
    setStep('role')
  }

  const handleRoleSubmit = () => {
    if (!role) return
    const coords = DEMO_COORDS[Math.floor(Math.random() * DEMO_COORDS.length)]
    const user: User = {
      id: 'demo-' + Date.now(),
      phone: countryCode.code + phone,
      name,
      role,
      rating: 0,
      reviewCount: 0,
      bio: '',
      lat: coords.lat + (Math.random() - 0.5) * 0.05,
      lng: coords.lng + (Math.random() - 0.5) * 0.05,
      createdAt: new Date().toISOString(),
    }
    setUser(user)
    router.push('/map')
  }

  if (step === 'landing') {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
        {/* Hero */}
        <div className="relative overflow-hidden flex-1 flex flex-col">
          {/* Decorative background */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10"
              style={{ background: 'var(--forest)', filter: 'blur(80px)', transform: 'translate(30%, -30%)' }} />
            <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full opacity-10"
              style={{ background: 'var(--amber)', filter: 'blur(80px)', transform: 'translate(-30%, 30%)' }} />
          </div>

          <div className="relative z-10 max-w-lg mx-auto w-full px-6 pt-16 pb-8 flex flex-col min-h-screen">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-16">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--forest)' }}>
                <Sprout className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
                Nogoman
              </span>
            </div>

            {/* Headline */}
            <div className="mb-10">
              <h1 className="text-5xl font-bold leading-tight mb-4"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>
                La terre<br />
                <em className="not-italic" style={{ color: 'var(--forest)' }}>rencontre</em><br />
                les bras
              </h1>
              <p className="text-lg" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                Trouvez du travail agricole ou des travailleurs qualifiés près de chez vous — en Afrique centrale.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-10">
              {[
                { icon: Users, label: 'Travailleurs', val: '2 400+' },
                { icon: MapPin, label: 'Pays couverts', val: '5' },
                { icon: Star, label: 'Note moyenne', val: '4.7' },
              ].map(({ icon: Icon, label, val }) => (
                <div key={label} className="rounded-2xl p-4 text-center"
                  style={{ background: 'white', border: '1px solid var(--border)' }}>
                  <Icon className="w-5 h-5 mx-auto mb-1" style={{ color: 'var(--forest)' }} />
                  <div className="text-lg font-bold" style={{ color: 'var(--text)' }}>{val}</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
                </div>
              ))}
            </div>

            <div className="flex-1" />

            {/* CTA */}
            <button
              onClick={() => setStep('phone')}
              className="w-full py-4 px-6 rounded-2xl text-white font-semibold text-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
              style={{ background: 'var(--forest)' }}
            >
              Commencer
              <ArrowRight className="w-5 h-5" />
            </button>
            <p className="text-center text-sm mt-4" style={{ color: 'var(--text-muted)' }}>
              Connexion rapide par numéro de téléphone
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        {/* Back + logo */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--forest)' }}>
            <Sprout className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold" style={{ fontFamily: 'var(--font-display)' }}>Nogoman</span>
        </div>

        {/* Phone step */}
        {step === 'phone' && (
          <div>
            <h2 className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Votre numéro
            </h2>
            <p className="mb-8" style={{ color: 'var(--text-muted)' }}>
              Nous vous enverrons un code de vérification par SMS.
            </p>

            <div className="flex gap-2 mb-4">
              <select
                value={countryCode.code}
                onChange={e => setCountryCode(COUNTRY_CODES.find(c => c.code === e.target.value)!)}
                className="px-3 py-4 rounded-xl font-medium text-sm"
                style={{ background: 'white', border: '2px solid var(--border)', color: 'var(--text)', outline: 'none' }}
              >
                {COUNTRY_CODES.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                ))}
              </select>
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                <input
                  type="tel"
                  placeholder="8x xxx xxxx"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                  className="w-full pl-10 pr-4 py-4 rounded-xl text-lg font-medium"
                  style={{ background: 'white', border: '2px solid var(--border)', color: 'var(--text)', outline: 'none' }}
                />
              </div>
            </div>

            <button
              onClick={handleSendOtp}
              disabled={phone.length < 8 || loading}
              className="w-full py-4 rounded-2xl text-white font-semibold text-lg flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
              style={{ background: 'var(--forest)' }}
            >
              {loading ? (
                <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>Envoyer le code <ArrowRight className="w-5 h-5" /></>
              )}
            </button>
          </div>
        )}

        {/* OTP step */}
        {step === 'verify' && (
          <div>
            <h2 className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Code SMS
            </h2>
            <p className="mb-8" style={{ color: 'var(--text-muted)' }}>
              Code envoyé au <strong>{countryCode.code} {phone}</strong>.
              <br />
              <span className="text-sm italic">(Demo : entrez n'importe quel code)</span>
            </p>

            <input
              type="number"
              placeholder="• • • •"
              value={otp}
              onChange={e => setOtp(e.target.value)}
              maxLength={6}
              className="w-full text-center py-4 rounded-xl text-2xl tracking-widest font-bold mb-4"
              style={{ background: 'white', border: '2px solid var(--border)', color: 'var(--text)', outline: 'none', letterSpacing: '0.5em' }}
            />

            <button
              onClick={handleVerifyOtp}
              disabled={otp.length < 4}
              className="w-full py-4 rounded-2xl text-white font-semibold text-lg disabled:opacity-40"
              style={{ background: 'var(--forest)' }}
            >
              Vérifier
            </button>
          </div>
        )}

        {/* Name step */}
        {step === 'name' && (
          <div>
            <h2 className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Votre prénom
            </h2>
            <p className="mb-8" style={{ color: 'var(--text-muted)' }}>
              Comment souhaitez-vous être appelé ?
            </p>

            <input
              type="text"
              placeholder="Jean-Baptiste, Fatou…"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-4 rounded-xl text-lg font-medium mb-4"
              style={{ background: 'white', border: '2px solid var(--border)', color: 'var(--text)', outline: 'none' }}
            />

            <button
              onClick={handleNameSubmit}
              disabled={name.length < 2}
              className="w-full py-4 rounded-2xl text-white font-semibold text-lg disabled:opacity-40"
              style={{ background: 'var(--forest)' }}
            >
              Continuer
            </button>
          </div>
        )}

        {/* Role step */}
        {step === 'role' && (
          <div>
            <h2 className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Je suis…
            </h2>
            <p className="mb-8" style={{ color: 'var(--text-muted)' }}>
              Choisissez votre profil sur Nogoman.
            </p>

            <div className="flex flex-col gap-4 mb-6">
              {[
                {
                  val: 'farmer' as const,
                  Icon: Sprout,
                  title: 'Agriculteur',
                  sub: "J'ai des terres et cherche des travailleurs",
                },
                {
                  val: 'worker' as const,
                  Icon: Hammer,
                  title: 'Travailleur',
                  sub: 'Je cherche du travail agricole',
                },
              ].map(({ val, Icon, title, sub }) => (
                <button
                  key={val}
                  onClick={() => setRole(val)}
                  className="flex items-center gap-4 p-5 rounded-2xl text-left transition-all"
                  style={{
                    background: role === val ? 'var(--forest)' : 'white',
                    border: `2px solid ${role === val ? 'var(--forest)' : 'var(--border)'}`,
                    color: role === val ? 'white' : 'var(--text)',
                  }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: role === val ? 'rgba(255,255,255,0.2)' : '#f0f7f2' }}>
                    <Icon className="w-6 h-6" style={{ color: role === val ? 'white' : 'var(--forest)' }} />
                  </div>
                  <div>
                    <div className="font-semibold text-lg">{title}</div>
                    <div className="text-sm opacity-70">{sub}</div>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={handleRoleSubmit}
              disabled={!role}
              className="w-full py-4 rounded-2xl text-white font-semibold text-lg disabled:opacity-40"
              style={{ background: 'var(--forest)' }}
            >
              Accéder à la carte
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
