import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Nogoman — Connecter la terre et les bras',
  description: 'Plateforme qui connecte agriculteurs et travailleurs agricoles en Afrique centrale',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      </head>
      <body>{children}</body>
    </html>
  )
}
