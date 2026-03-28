'use client'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getUser } from '@/lib/store'
import { MOCK_JOBS, Job } from '@/lib/mock-data'
import Stars from '@/components/Stars'
import {
  MapPin, Plus, User, ChevronRight, ArrowLeft,
  Calendar, Layers, Banknote, Users, LogOut, Sprout
} from 'lucide-react'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

function distance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function MapPage() {
  const router = useRouter()
  const [user, setUserState] = useState<ReturnType<typeof getUser>>(null)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const u = getUser()
    if (!u) { router.push('/'); return }
    setUserState(u)
  }, [router])

  if (!mounted || !user) return (
    <div className="h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--forest)' }} />
    </div>
  )

  const allJobs = MOCK_JOBS

  const jobsWithDist = allJobs.map(j => ({
    ...j,
    dist: distance(user.lat, user.lng, j.lat, j.lng),
  })).sort((a, b) => a.dist - b.dist)

  const handleJobSelect = (job: Job) => {
    setSelectedJob(job)
    setPanelOpen(false)
    setTimeout(() => setPanelOpen(true), 100)
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between px-4 py-3"
        style={{ background: 'white', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--forest)' }}>
            <Sprout className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg" style={{ fontFamily: 'var(--font-display)', color: 'var(--forest)' }}>AgriLink</span>
        </div>
        <div className="flex items-center gap-2">
          {user.role === 'farmer' && (
            <Link href="/post"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'var(--forest)' }}>
              <Plus className="w-4 h-4" />
              Publier
            </Link>
          )}
          <Link href="/profile"
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: '#f0f7f2' }}>
            <User className="w-4 h-4" style={{ color: 'var(--forest)' }} />
          </Link>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {/* Map */}
        <div className="absolute inset-0 z-0">
          <MapView
            jobs={allJobs}
            userLat={user.lat}
            userLng={user.lng}
            onJobSelect={handleJobSelect}
            selectedJobId={selectedJob?.id}
          />
        </div>

        {/* Bottom panel */}
        <div className="absolute bottom-0 left-0 right-0 z-10"
          style={{
            maxHeight: panelOpen ? '65vh' : '0',
            transition: 'max-height 0.3s ease',
            overflow: 'hidden',
          }}>
          <div className="rounded-t-3xl overflow-hidden"
            style={{ background: 'white', boxShadow: '0 -4px 30px rgba(0,0,0,0.12)' }}>
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
            </div>

            {/* Selected job detail */}
            {selectedJob ? (
              <div className="px-4 pb-6">
                <button onClick={() => setSelectedJob(null)}
                  className="flex items-center gap-1 text-sm mb-4"
                  style={{ color: 'var(--text-muted)' }}>
                  <ArrowLeft className="w-4 h-4" /> Retour à la liste
                </button>
                <JobDetail job={selectedJob} role={user.role} />
              </div>
            ) : (
              <div className="px-4 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-lg" style={{ fontFamily: 'var(--font-display)' }}>
                    Offres proches
                  </h2>
                  <span className="text-sm px-2 py-1 rounded-full" style={{ background: '#f0f7f2', color: 'var(--forest)', fontWeight: 600 }}>
                    {jobsWithDist.length} offres
                  </span>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 'calc(65vh - 100px)' }}>
                  {jobsWithDist.map(job => (
                    <JobCard key={job.id} job={job} dist={job.dist} onClick={() => handleJobSelect(job)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Toggle panel btn when hidden */}
        {!panelOpen && (
          <button
            onClick={() => setPanelOpen(true)}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-5 py-2.5 rounded-full font-semibold text-sm text-white shadow-lg"
            style={{ background: 'var(--forest)' }}>
            Voir les offres
          </button>
        )}
      </div>
    </div>
  )
}

function JobCard({ job, dist, onClick }: { job: Job; dist: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left flex items-center gap-3 py-3 border-b last:border-0"
      style={{ borderColor: 'var(--border)' }}>
      <div className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center"
        style={{ background: '#f0f7f2' }}>
        <Layers className="w-5 h-5" style={{ color: 'var(--forest)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{job.title}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <Stars rating={job.farmerRating} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{job.farmerName}</span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs font-medium" style={{ color: 'var(--forest)' }}>
            {job.hectares} ha · {job.pricePerDay.toLocaleString()} {job.currency}/j
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {dist < 1 ? `${(dist * 1000).toFixed(0)}m` : `${dist.toFixed(1)}km`}
          </span>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
    </button>
  )
}

function JobDetail({ job, role }: { job: Job; role: string }) {
  const [applied, setApplied] = useState(false)
  return (
    <div>
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
          {job.title}
        </h3>
        <span className="ml-2 flex-shrink-0 px-2 py-1 rounded-lg text-xs font-semibold"
          style={{ background: '#d1fae5', color: '#065f46' }}>
          Ouvert
        </span>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Stars rating={job.farmerRating} size="sm" showCount={job.farmerReviewCount} />
        <span className="text-sm font-medium">{job.farmerName}</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>· {job.country}</span>
      </div>

      <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>{job.description}</p>

      <div className="grid grid-cols-2 gap-3 mb-5">
        {[
          { icon: Layers, label: 'Surface', val: `${job.hectares} hectares` },
          { icon: Banknote, label: 'Rémunération', val: `${job.pricePerDay.toLocaleString()} ${job.currency}/j` },
          { icon: Calendar, label: 'Début', val: new Date(job.startDate).toLocaleDateString('fr-FR') },
          { icon: Users, label: 'Travailleurs', val: `${job.workersNeeded} personnes` },
        ].map(({ icon: Icon, label, val }) => (
          <div key={label} className="rounded-xl p-3" style={{ background: '#f9fafb' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
            </div>
            <span className="text-sm font-semibold">{val}</span>
          </div>
        ))}
      </div>

      {role === 'worker' && (
        <button
          onClick={() => setApplied(true)}
          className="w-full py-3.5 rounded-xl font-semibold text-base transition-all"
          style={{
            background: applied ? '#d1fae5' : 'var(--forest)',
            color: applied ? '#065f46' : 'white',
          }}
        >
          {applied ? '✓ Candidature envoyée !' : 'Postuler à cette offre'}
        </button>
      )}
    </div>
  )
}
