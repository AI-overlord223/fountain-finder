import { useCallback, useEffect, useState } from 'react'
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import { Loader2 } from 'lucide-react'
import {
  fountainDisplayName,
  openGoogleMapsDirections,
  type OverpassElement,
} from '../lib/overpass'
import { fountainMarkerIcon } from '../lib/fountainMarkerIcon'

import 'leaflet/dist/leaflet.css'

const userIcon = L.divIcon({
  className: 'user-location-marker',
  html: `<div style="width:16px;height:16px;border-radius:9999px;border:2px solid #fff;background:#2563eb;box-shadow:0 1px 3px rgba(0,0,0,0.35),0 0 0 2px rgba(37,99,235,0.35);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

function RecenterOnUser({
  position,
}: {
  position: [number, number] | null
}) {
  const map = useMap()
  useEffect(() => {
    if (position) {
      map.flyTo(position, 15, { duration: 1.2 })
    }
  }, [map, position])
  return null
}

function MapInstanceBridge({
  onReady,
}: {
  onReady: (map: L.Map) => void
}) {
  const map = useMap()
  useEffect(() => {
    onReady(map)
  }, [map, onReady])
  return null
}

const DEFAULT_CENTER: [number, number] = [40.7128, -74.006]

function FountainPopupBody({
  name,
  lat,
  lon,
}: {
  name: string
  lat: number
  lon: number
}) {
  return (
    <div className="min-w-[10rem] space-y-3 text-sm">
      <p className="font-semibold text-gray-900">{name}</p>
      <button
        type="button"
        onClick={() => openGoogleMapsDirections(lat, lon)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98]"
      >
        Get Directions
      </button>
    </div>
  )
}

export function MapView({
  userPosition,
  fountains,
  loading,
  error,
  onSearchArea,
  demoMode,
  onDemoModeChange,
}: {
  userPosition: [number, number] | null
  fountains: OverpassElement[]
  loading: boolean
  error: string | null
  onSearchArea: (lat: number, lon: number) => void
  demoMode: boolean
  onDemoModeChange: (value: boolean) => void
}) {
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null)

  const center = userPosition ?? DEFAULT_CENTER

  const handleSearchClick = () => {
    if (!mapInstance) return
    const c = mapInstance.getCenter()
    onSearchArea(c.lat, c.lng)
  }

  const handleMapReady = useCallback((map: L.Map) => {
    setMapInstance(map)
  }, [])

  return (
    <div className="relative h-dvh w-full">
      <MapContainer
        center={center}
        zoom={13}
        className="h-full w-full z-0"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterOnUser position={userPosition} />
        <MapInstanceBridge onReady={handleMapReady} />
        {userPosition && (
          <Marker position={userPosition} icon={userIcon}>
            <Popup>You are here</Popup>
          </Marker>
        )}
        {fountains.map((el) => {
          const lat = el.lat!
          const lon = el.lon!
          const name = fountainDisplayName(el.tags)
          return (
            <Marker
              key={`${el.type}-${el.id}`}
              position={[lat, lon]}
              icon={fountainMarkerIcon}
            >
              <Popup>
                <FountainPopupBody name={name} lat={lat} lon={lon} />
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] flex justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
        <div
          className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/20 bg-white/35 p-4 shadow-2xl shadow-slate-900/10 backdrop-blur-xl ring-1 ring-white/30 dark:border-white/10 dark:bg-slate-900/45 dark:ring-white/10"
          style={{ WebkitBackdropFilter: 'blur(12px)' }}
        >
          <div className="mb-3 flex flex-col gap-1 text-center">
            <h1 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
              Water Fountain Finder
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Search within 2 km of the map center — pan first, then search.
            </p>
          </div>

          <label className="mb-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/30 bg-white/40 px-3 py-2.5 text-sm dark:border-white/10 dark:bg-white/10">
            <span className="font-medium text-slate-800 dark:text-slate-100">
              Demo mode
            </span>
            <span className="relative inline-flex h-7 w-12 shrink-0 items-center">
              <input
                type="checkbox"
                className="sr-only"
                checked={demoMode}
                onChange={(e) => onDemoModeChange(e.target.checked)}
                aria-label="Toggle demo mode: show sample fountains without internet"
              />
              <span
                className={`absolute inset-0 rounded-full transition ${
                  demoMode
                    ? 'bg-emerald-500'
                    : 'bg-slate-300 dark:bg-slate-600'
                }`}
                aria-hidden
              />
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                  demoMode ? 'left-6' : 'left-1'
                }`}
                aria-hidden
              />
            </span>
          </label>

          <button
            type="button"
            onClick={handleSearchClick}
            disabled={loading || !mapInstance}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]"
          >
            {loading ? (
              <>
                <Loader2
                  className="h-5 w-5 shrink-0 animate-spin"
                  aria-hidden
                />
                <span>Searching...</span>
              </>
            ) : (
              <span>Search This Area</span>
            )}
          </button>

          {error && (
            <p className="mt-3 rounded-lg border border-red-200/80 bg-red-50/90 px-3 py-2 text-center text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
