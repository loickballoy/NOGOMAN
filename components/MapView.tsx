'use client'
import { useEffect, useRef } from 'react'
import { Job } from '@/lib/mock-data'

interface MapViewProps {
  jobs: Job[]
  userLat: number
  userLng: number
  onJobSelect: (job: Job) => void
  selectedJobId?: string
}

export default function MapView({ jobs, userLat, userLng, onJobSelect, selectedJobId }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<any>(null)

  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return

    const initMap = async () => {
      const L = (await import('leaflet')).default

      // Fix default icon issue with Next.js
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(mapRef.current!, {
        center: [userLat, userLng],
        zoom: 12,
        zoomControl: false,
      })

      L.control.zoom({ position: 'bottomright' }).addTo(map)

      // Tile layer — OpenStreetMap
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map)

      // User marker
      const userIcon = L.divIcon({
        html: `<div style="
          width:16px;height:16px;
          background:#1e5c38;
          border:3px solid white;
          border-radius:50%;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
        "></div>`,
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      })
      L.marker([userLat, userLng], { icon: userIcon })
        .addTo(map)
        .bindPopup('<strong>Vous êtes ici</strong>')

      // Job markers
      jobs.forEach(job => {
        const jobIcon = L.divIcon({
          html: `<div style="
            background:#f59e0b;
            color:white;
            border:2px solid white;
            border-radius:8px;
            padding:2px 7px;
            font-size:11px;
            font-weight:700;
            white-space:nowrap;
            box-shadow:0 2px 8px rgba(0,0,0,0.25);
            font-family:'DM Sans',sans-serif;
          ">${job.hectares}ha</div>`,
          className: '',
          iconSize: [48, 24],
          iconAnchor: [24, 12],
        })

        const marker = L.marker([job.lat, job.lng], { icon: jobIcon }).addTo(map)
        marker.on('click', () => onJobSelect(job))
      })

      leafletMap.current = map
    }

    initMap()

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove()
        leafletMap.current = null
      }
    }
  }, [])

  // Fly to selected job
  useEffect(() => {
    if (!leafletMap.current || !selectedJobId) return
    const job = jobs.find(j => j.id === selectedJobId)
    if (job) {
      leafletMap.current.flyTo([job.lat, job.lng], 14, { duration: 0.8 })
    }
  }, [selectedJobId, jobs])

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
}
