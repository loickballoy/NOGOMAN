'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getUser, clearUser, getReviews, saveReview } from '@/lib/store'
import { MOCK_REVIEWS } from '@/lib/mock-data'
import Stars from '@/components/Stars'
import {
  ArrowLeft, Star, User, Phone, LogOut,
  Sprout, Hammer, Edit3, ThumbsUp, Award
} from 'lucide-react'

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<ReturnType<typeof getUser>>(null)
  const [reviews, setReviews] = useState(MOCK_REVIEWS)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const u = getUser()
    if (!u) { router.push('/'); return }
    setUser(u)
    const stored = getReviews()
    setReviews([...stored, ...MOCK_REVIEWS])
  }, [router])

  const handleLogout = () => {
    clearUser()
    router.push('/')
  }

  const handleAddReview = () => {
    if (!user) return
    const review = {
      id: 'rv-' + Date.now(),
      fromId: 'other',
      fromName: 'Jean-Baptiste E.',
      toId: user.id,
      jobId: 'j3',
      rating: reviewRating,
      comment: reviewComment,
      createdAt: new Date().toISOString(),
    }
    saveReview(review)
    setReviews(r => [review, ...r])
    setShowReviewForm(false)
    setReviewComment('')
  }

  if (!mounted || !user) return (
    <div className="h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--forest)' }} />
    </div>
  )

  const avgRating = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'white', borderBottom: '1px solid var(--border)' }}>
        <Link href="/map" className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: '#f0f7f2' }}>
          <ArrowLeft className="w-5 h-5" style={{ color: 'var(--forest)' }} />
        </Link>
        <h1 className="font-bold text-lg" style={{ fontFamily: 'var(--font-display)' }}>Mon Profil</h1>
        <button onClick={handleLogout} className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: '#fff5f5' }}>
          <LogOut className="w-4 h-4" style={{ color: '#ef4444' }} />
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Profile card */}
        <div className="rounded-3xl overflow-hidden" style={{ background: 'var(--forest)' }}>
          <div className="px-6 pt-8 pb-6">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(255,255,255,0.15)' }}>
              {user.role === 'farmer'
                ? <Sprout className="w-10 h-10 text-white" />
                : <Hammer className="w-10 h-10 text-white" />
              }
            </div>
            <h2 className="text-3xl font-bold text-white text-center mb-1"
              style={{ fontFamily: 'var(--font-display)' }}>
              {user.name}
            </h2>
            <p className="text-center text-white/70 mb-4">
              {user.role === 'farmer' ? 'Agriculteur' : 'Travailleur agricole'}
            </p>
            <div className="flex justify-center mb-4">
              <Stars rating={avgRating} size="md" showCount={reviews.length} />
            </div>
            <div className="flex items-center justify-center gap-1.5 text-white/60 text-sm">
              <Phone className="w-4 h-4" />
              {user.phone}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 divide-x divide-white/10" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            {[
              { label: 'Note', val: avgRating > 0 ? avgRating.toFixed(1) : '—' },
              { label: 'Avis', val: reviews.length },
              { label: 'Missions', val: '3' },
            ].map(({ label, val }) => (
              <div key={label} className="py-4 text-center">
                <div className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>{val}</div>
                <div className="text-xs text-white/60">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Badge */}
        {reviews.length >= 2 && (
          <div className="flex items-center gap-3 px-5 py-4 rounded-2xl"
            style={{ background: '#fef3c7', border: '1px solid #fcd34d' }}>
            <Award className="w-6 h-6" style={{ color: '#d97706' }} />
            <div>
              <div className="font-semibold text-sm" style={{ color: '#92400e' }}>Profil vérifié</div>
              <div className="text-xs" style={{ color: '#b45309' }}>Membre actif de la communauté AgriLink</div>
            </div>
          </div>
        )}

        {/* Reviews */}
        <div className="rounded-2xl p-5" style={{ background: 'white', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              Avis reçus ({reviews.length})
            </h3>
            <button onClick={() => setShowReviewForm(true)}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: '#f0f7f2', color: 'var(--forest)' }}>
              + Ajouter
            </button>
          </div>

          {showReviewForm && (
            <div className="mb-4 p-4 rounded-xl" style={{ background: '#f9fafb', border: '1px solid var(--border)' }}>
              <p className="text-sm font-medium mb-3">Laisser un avis (démo)</p>
              <div className="flex gap-1 mb-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <button key={i} onClick={() => setReviewRating(i)}>
                    <Star className="w-7 h-7"
                      fill={i <= reviewRating ? '#f59e0b' : 'none'}
                      stroke={i <= reviewRating ? '#f59e0b' : '#d1d5db'} />
                  </button>
                ))}
              </div>
              <textarea
                placeholder="Commentaire…" value={reviewComment}
                onChange={e => setReviewComment(e.target.value)} rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm resize-none mb-3"
                style={{ background: 'white', border: '1px solid var(--border)', outline: 'none' }} />
              <div className="flex gap-2">
                <button onClick={handleAddReview}
                  className="flex-1 py-2 rounded-lg text-white text-sm font-semibold"
                  style={{ background: 'var(--forest)' }}>
                  Publier
                </button>
                <button onClick={() => setShowReviewForm(false)}
                  className="px-4 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--border)' }}>
                  Annuler
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {reviews.slice(0, 5).map(r => (
              <div key={r.id} className="pb-4 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{r.fromName}</span>
                  <Stars rating={r.rating} />
                </div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{r.comment}</p>
                <span className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                </span>
              </div>
            ))}
            {reviews.length === 0 && (
              <p className="text-center py-6 text-sm" style={{ color: 'var(--text-muted)' }}>
                Aucun avis pour le moment
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
