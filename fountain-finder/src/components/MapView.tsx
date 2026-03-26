import { useCallback, useEffect, useMemo, useState } from 'react'
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
  googleMapsDirectionsUrl,
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
  searchRadiusMiles,
  onSearchRadiusMilesChange,
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
}) {
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null)

  const center = userPosition ?? DEFAULT_CENTER

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

  const flyToFountain = useCallback(
    (lat: number, lon: number) => {
      if (!mapInstance) return
      mapInstance.flyTo([lat, lon], 17, { duration: 1.2 })
    },
    [mapInstance]
  )

  const copyCoordinates = useCallback(async (lat: number, lon: number) => {
    const text = `${lat.toFixed(6)}, ${lon.toFixed(6)}`
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
    // Fallback: prompt is ugly but guarantees "Copy" works.
    window.prompt('Copy coordinates:', text)
  }, [])

  const shareFountain = useCallback(async (name: string, lat: number, lon: number) => {
    const url = googleMapsDirectionsUrl(lat, lon)
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Water Fountain Finder',
          text: name,
          url,
        })
        return
      }
    } catch {
      // User cancelled share, etc.
    }
    // Fallback: copy a share-friendly text payload.
    await copyCoordinates(lat, lon)
  }, [copyCoordinates])

  return (
    <div className="relative h-dvh w-full">
      <MapContainer
        center={center}
        zoom={13}
        className="h-full w-full z-0"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          // Dark, grayscale base with no labels for shops/businesses.
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
          const lat = el.lat ?? 0
          const lon = el.lon ?? 0
          const name = fountainDisplayName(el.tags)
          return (
            <Marker
              key={`${el.type}-${el.id}`}
              position={[lat, lon]}
              icon={fountainMarkerIcon}
              eventHandlers={{
                click: () => {
                  // Smoothly focus the map on the tapped fountain.
                  flyToFountain(lat, lon)
                },
              }}
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
          className="pointer-events-auto w-full max-w-md rounded-3xl border border-white/15 bg-white/20 p-4 shadow-2xl shadow-black/10 backdrop-blur-[10px] ring-1 ring-white/20"
        >
          <div className="mb-3 text-center">
            <h1 className="text-base font-semibold tracking-tight text-slate-50">
              Water Fountain Finder
            </h1>
            <p className="mt-1 text-xs text-white/70">
              Pan the map, then search within your chosen radius.
            </p>
          </div>

          <label className="mb-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/20 bg-white/15 px-3 py-2.5 text-sm">
            <span className="font-medium text-white/90">
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

          <div className="mb-3 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-[10px]">
            <div className="relative mb-2">
              <div
                className="pointer-events-none absolute -top-9 z-10 whitespace-nowrap rounded-full border border-white/20 bg-black/40 px-3 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur"
                style={{ left: `${radiusPercent}%`, transform: 'translateX(-50%)' }}
              >
                Search Radius: {searchRadiusMiles.toFixed(1)} miles
              </div>
              <input
                type="range"
                min={1}
                max={20}
                step={0.1}
                value={searchRadiusMiles}
                onChange={(e) => onSearchRadiusMilesChange(Number(e.target.value))}
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

          <div className="mt-3 max-h-[38vh] overflow-y-auto rounded-2xl border border-white/15 bg-white/10 p-2.5 backdrop-blur-[10px]">
            <div className="px-2 pb-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
                Fountain Status
              </div>
            </div>

            {fountains.length === 0 ? (
              <p className="px-3 pb-3 text-xs text-white/60">
                No fountains yet. Try searching your area.
              </p>
            ) : (
              <div className="flex flex-col gap-2 px-2 pb-2">
                {fountains.map((el) => {
                  const lat = el.lat ?? 0
                  const lon = el.lon ?? 0
                  const name = fountainDisplayName(el.tags)
                  return (
                    <div
                      key={`card-${el.type}-${el.id}`}
                      className="rounded-xl border border-white/15 bg-white/15 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">
                            {name}
                          </div>
                          <div className="mt-1 text-[11px] font-medium text-white/70">
                            {lat.toFixed(5)}, {lon.toFixed(5)}
                          </div>
                        </div>
                        <span className="rounded-full bg-emerald-400/90 px-2.5 py-1 text-[11px] font-semibold text-emerald-950 shadow-sm">
                          Available
                        </span>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => copyCoordinates(lat, lon)}
                          className="flex-1 rounded-lg border border-white/20 bg-white/10 px-2 py-2 text-[12px] font-semibold text-white transition hover:bg-white/15 active:scale-[0.98]"
                        >
                          Copy Coordinates
                        </button>
                        <button
                          type="button"
                          onClick={() => shareFountain(name, lat, lon)}
                          className="flex-1 rounded-lg border border-white/20 bg-white/10 px-2 py-2 text-[12px] font-semibold text-white transition hover:bg-white/15 active:scale-[0.98]"
                        >
                          Share
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
