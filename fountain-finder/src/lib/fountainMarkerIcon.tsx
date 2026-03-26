import { renderToStaticMarkup } from 'react-dom/server'
import { Droplet } from 'lucide-react'
import L from 'leaflet'

/**
 * Lucide Droplet as a blue water-themed pin for Leaflet markers (modern, on-brand).
 */
const dropletMarkup = renderToStaticMarkup(
  <div
    style={{
      width: 40,
      height: 40,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      filter: 'drop-shadow(0 2px 5px rgba(15, 23, 42, 0.4))',
    }}
    aria-hidden
  >
    <Droplet size={36} strokeWidth={1.75} stroke="#ffffff" fill="#0ea5e9" />
  </div>
)

export const fountainMarkerIcon = L.divIcon({
  className: 'fountain-droplet-marker',
  html: dropletMarkup,
  iconSize: [40, 40],
  iconAnchor: [20, 36],
  popupAnchor: [0, -32],
})
