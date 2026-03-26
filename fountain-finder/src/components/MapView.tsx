import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.7613 // Earth radius in miles
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

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
  searchRadiusMiles,
  onSearchRadiusMilesChange,
  searchCenter,
}: {
  userPosition: [number, number] | null
  fountains: OverpassElement[]
  loading: boolean
  error: string | null
  onSearchArea: (lat: number, lon: number, radiusMiles: number) => void
  demoMode: boolean
  onDemoModeChange: (value: boolean) => void
  searchRadiusMiles: number
  onSearchRadiusMilesChange: (value: number) => void
  searchCenter: [number, number] | null
}) {
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null)
  const markerRefs = useRef<Record<string, L.Marker | null>>({})

  const center = userPosition ?? searchCenter ?? DEFAULT_CENTER
  const distanceFrom = userPosition ?? searchCenter

  const handleSearchClick = () => {
    if (!mapInstance) return
    const c = mapInstance.getCenter()
    onSearchArea(c.lat, c.lng, searchRadiusMiles)
  }

  const handleMapReady = useCallback((map: L.Map) => {
    setMapInstance(map)
  }, [])

  const radiusPercent = useMemo(() => {
    const min = 1
    const max = 20
    return ((searchRadiusMiles - min) / (max - min)) * 100
  }, [searchRadiusMiles])

  const focusFountain = useCallback(
    (lat: number, lon: number, id: number | string) => {
      if (!mapInstance) return
      const key = String(id)
      const marker = markerRefs.current[key]
      mapInstance.flyTo([lat, lon], 17, { duration: 1.25 })
      if (!marker) return
      mapInstance.once('moveend', () => {
        marker.openPopup()
      })
    },
    [mapInstance]
  )

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-slate-950">
      <aside className="h-full w-full max-w-[390px] flex-shrink-0 overflow-hidden border-r border-white/10">
        <div className="h-full overflow-y-auto p-3">
          <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur-[10px] shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
            <div className="mb-4 text-center">
              <h1 className="text-base font-semibold tracking-tight text-white">
                Water Fountain Finder
              </h1>
              <p className="mt-1 text-xs text-white/70">
                Pan the map, then search within your chosen radius.
              </p>
            </div>

            <label className="mb-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/20 bg-white/15 px-3 py-2.5 text-sm">
              <span className="font-medium text-white/90">Demo mode</span>
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
                    demoMode ? 'bg-emerald-500' : 'bg-slate-300'
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

            <div className="mb-3 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-[10px]">
              <div className="relative mb-2">
                <div
                  className="pointer-events-none absolute -top-9 z-10 whitespace-nowrap rounded-full border border-white/20 bg-black/40 px-3 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur"
                  style={{
                    left: `${radiusPercent}%`,
                    transform: 'translateX(-50%)',
                  }}
                >
                  Search Radius: {searchRadiusMiles.toFixed(1)} miles
                </div>
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={0.1}
                  value={searchRadiusMiles}
                  onChange={(e) =>
                    onSearchRadiusMilesChange(Number(e.target.value))
                  }
                  className="w-full accent-white"
                  aria-label="Search radius in miles"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] font-medium text-white/60">
                <span>1 mi</span>
                <span>20 mi</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSearchClick}
              disabled={loading || !mapInstance}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/20 px-4 py-3.5 text-sm font-semibold text-white shadow-sm backdrop-blur-xl transition active:scale-[0.98] hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
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
              <p className="mt-3 rounded-lg border border-red-200/60 bg-red-500/10 px-3 py-2 text-center text-xs text-red-200">
                {error}
              </p>
            )}

            <div className="mt-4 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-[10px]">
              <div className="mb-2 px-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
                  Fountain Status
                </div>
              </div>

              {fountains.length === 0 ? (
                <p className="px-1 pb-1 text-xs text-white/60">
                  No fountains yet. Try searching your area.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {fountains.map((el) => {
                    const lat = el.lat
                    const lon = el.lon
                    if (lat == null || lon == null) return null

                    const name = fountainDisplayName(el.tags)
                    const miles =
                      distanceFrom == null
                        ? null
                        : haversineMiles(
                            distanceFrom[0],
                            distanceFrom[1],
                            lat,
                            lon
                          )
                    const milesLabel =
                      miles == null
                        ? '— miles away'
                        : miles < 0.05
                          ? '<0.1 miles away'
                          : `${miles.toFixed(1)} miles away`

                    const key = String(el.id)
                    return (
                      <button
                        key={`card-${el.type}-${el.id}`}
                        type="button"
                        onClick={() => focusFountain(lat, lon, key)}
                        className="text-left rounded-2xl border border-white/15 bg-white/15 p-3 transition hover:bg-white/20"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">
                              {name}
                            </div>
                            <div className="mt-1 text-xs font-bold text-emerald-200">
                              {milesLabel}
                            </div>
                          </div>

                          <span className="rounded-full bg-green-400 px-2.5 py-1 text-[11px] font-semibold text-green-950 shadow-sm">
                            Available
                          </span>
                        </div>

                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              openGoogleMapsDirections(lat, lon)
                            }}
                            className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-white/15 active:scale-[0.98]"
                          >
                            Get Directions
                          </button>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 relative">
        <MapContainer
          center={center}
          zoom={13}
          className="h-full w-full z-0"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}{r}.png"
          />
          <RecenterOnUser position={userPosition} />
          <MapInstanceBridge onReady={handleMapReady} />

          {userPosition && (
            <Marker position={userPosition} icon={userIcon}>
              <Popup>You are here</Popup>
            </Marker>
          )}

          {fountains.map((el) => {
            const lat = el.lat
            const lon = el.lon
            if (lat == null || lon == null) return null

            const key = String(el.id)
            const name = fountainDisplayName(el.tags)

            return (
              <Marker
                key={`${el.type}-${el.id}`}
                position={[lat, lon]}
                icon={fountainMarkerIcon}
                ref={(marker: L.Marker | null) => {
                  markerRefs.current[key] = marker
                }}
              >
                <Popup>
                  <FountainPopupBody name={name} lat={lat} lon={lon} />
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </div>
    </div>
  )
}
