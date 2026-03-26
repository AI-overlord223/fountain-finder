import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Loader2 } from 'lucide-react'
import {
  getFountainDisplayInfo,
  googleMapsDirectionsUrl,
  type OverpassElement,
} from '../lib/overpass'
import { fountainMarkerIcon } from '../lib/fountainMarkerIcon'

const DEFAULT_CENTER: [number, number] = [40.7128, -74.006]

const userIcon = L.divIcon({
  className: 'user-location-marker',
  html: `<div class="user-location-pulse" aria-hidden="true"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

function RecenterOnUser({ position }: { position: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (position) map.flyTo(position, 15, { duration: 1.2 })
  }, [map, position])
  return null
}

function MapInstanceBridge({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap()
  useEffect(() => {
    onReady(map)
  }, [map, onReady])
  return null
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  // Full Haversine implementation (great-circle distance).
  // Returns distance in miles.
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return NaN

  const R = 3958.7613 // Earth radius in miles

  const phi1 = toRadians(lat1)
  const phi2 = toRadians(lat2)
  const dPhi = toRadians(lat2 - lat1)
  const dLambda = toRadians(lon2 - lon1)

  const sinDphi = Math.sin(dPhi / 2)
  const sinDlambda = Math.sin(dLambda / 2)

  const a =
    sinDphi * sinDphi + Math.cos(phi1) * Math.cos(phi2) * sinDlambda * sinDlambda
  // Guard against tiny floating point drift.
  const aClamped = Math.min(1, Math.max(0, a))

  const c = 2 * Math.atan2(Math.sqrt(aClamped), Math.sqrt(1 - aClamped))
  return R * c
}

function sortFountainsByMiles<T extends { milesAway: number | null; stableId: string }>(
  items: T[]
): T[] {
  // Full sorting logic:
  // - smallest `milesAway` first
  // - `null`/NaN distances go last
  // - stableId tie-breaker for deterministic ordering
  return [...items].sort((a, b) => {
    const aVal =
      a.milesAway == null || Number.isNaN(a.milesAway) ? Number.POSITIVE_INFINITY : a.milesAway
    const bVal =
      b.milesAway == null || Number.isNaN(b.milesAway) ? Number.POSITIVE_INFINITY : b.milesAway

    if (aVal !== bVal) return aVal - bVal
    return a.stableId.localeCompare(b.stableId)
  })
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
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const [activeStableId, setActiveStableId] = useState<string | null>(null)
  const mapHostRef = useRef<HTMLDivElement | null>(null)
  const dragStartYRef = useRef<number | null>(null)

  const fountainsLayerRef = useRef<L.FeatureGroup | null>(null)
  const fountainMarkersRef = useRef<Record<string, L.Marker>>({})

  const origin = userPosition
  const center = userPosition ?? searchCenter ?? DEFAULT_CENTER

  const handleMapReady = useCallback((map: L.Map) => setMapInstance(map), [])

  const radiusPercent = useMemo(() => {
    const min = 1
    const max = 20
    return ((searchRadiusMiles - min) / (max - min)) * 100
  }, [searchRadiusMiles])

  const handleSearchClick = () => {
    if (!mapInstance) return
    const c = mapInstance.getCenter()
    onSearchArea(c.lat, c.lng, searchRadiusMiles)
  }

  const selectFountain = useCallback(
    (lat: number, lon: number, stableId: string) => {
      setActiveStableId(stableId)
      if (!mapInstance) return
      mapInstance.flyTo([lat, lon], 17, { duration: 1.3 })
      mapInstance.once('moveend', () => {
        const marker = fountainMarkersRef.current[stableId]
        marker?.openPopup()
      })
    },
    [mapInstance]
  )

  const escapeHtml = useCallback((input: string): string => {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }, [])

  const getStreetLabel = useCallback((el: OverpassElement): string | null => {
    const t = el.tags
    return (
      t?.['addr:street'] ??
      t?.street ??
      t?.road ??
      t?.['addr:route'] ??
      null
    )
  }, [])

  const getBaseFountainName = useCallback(
    (el: OverpassElement): string => {
      const tags = el.tags

      const rawName =
        tags?.['name'] ??
        tags?.['name:en'] ??
        tags?.['name:local'] ??
        tags?.alt_name ??
        tags?.['alt_name:en']

      const name = rawName?.trim()
      if (name) return name

      const street = getStreetLabel(el)
      if (street) return street

      const lat = el.lat
      const lon = el.lon
      if (lat != null && lon != null) {
        return `Water Station near ${lat.toFixed(4)}, ${lon.toFixed(4)}`
      }

      return 'Water Station'
    },
    [getStreetLabel]
  )

  const getCardTitle = useCallback((el: OverpassElement): string => {
    return getBaseFountainName(el)
  }, [getBaseFountainName])

  const fountainCards = useMemo(() => {
    type FountainCard = {
      stableId: string
      lat: number
      lon: number
      milesAway: number | null
      displayTitle: string
      displaySubtitle?: string
    }

    const cards: FountainCard[] = []

    for (const el of fountains) {
      const lat = el.lat
      const lon = el.lon
      if (lat == null || lon == null) continue

      const { stableId, subtitle } = getFountainDisplayInfo(el)
      const milesAway =
        origin == null ? null : haversineMiles(origin[0], origin[1], lat, lon)

      const displayTitle = getCardTitle(el)
      const street = getStreetLabel(el)
      const displaySubtitle = subtitle ?? street ?? undefined

      cards.push({
        stableId,
        lat,
        lon,
        milesAway: milesAway == null || Number.isNaN(milesAway) ? null : milesAway,
        displayTitle,
        displaySubtitle,
      })
    }

    return sortFountainsByMiles(cards)
  }, [fountains, origin, getCardTitle, getStreetLabel])

  // Force correct map rendering when layout changes (sidebar open/close, drawer, rotation).
  useEffect(() => {
    if (!mapInstance || !mapHostRef.current) return

    const host = mapHostRef.current
    const ro = new ResizeObserver(() => {
      mapInstance.invalidateSize()
    })
    ro.observe(host)

    const onWinResize = () => mapInstance.invalidateSize()
    window.addEventListener('resize', onWinResize)

    // Also invalidate after the next paint; avoids the common "top-left ghost markers" symptom.
    const t = window.setTimeout(() => mapInstance.invalidateSize(), 50)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onWinResize)
      window.clearTimeout(t)
    }
  }, [mapInstance])

  // Rebuild fountain markers in a FeatureGroup (clear-before-add on each new search).
  useEffect(() => {
    if (!mapInstance) return

    if (!fountainsLayerRef.current) {
      fountainsLayerRef.current = L.featureGroup().addTo(mapInstance)
    }

    fountainsLayerRef.current.clearLayers()
    fountainMarkersRef.current = {}

    for (const card of fountainCards) {
      const { stableId, lat, lon, displayTitle, displaySubtitle } = card

      const directionsUrl = googleMapsDirectionsUrl(lat, lon)
      const popupHtml = `
        <div class="min-w-[16rem] space-y-2">
          <div class="font-semibold text-slate-950">${escapeHtml(displayTitle)}</div>
          ${
            displaySubtitle
              ? `<div class="text-xs text-slate-600">${escapeHtml(displaySubtitle)}</div>`
              : ''
          }
          <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer"
             class="inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98]">
             Get Directions
          </a>
        </div>
      `

      const marker = L.marker([lat, lon], {
        icon: fountainMarkerIcon,
        title: stableId,
        zIndexOffset: 200,
      })

      marker.bindPopup(popupHtml, { maxWidth: 280 })
      marker.on('click', () => setActiveStableId(stableId))
      marker.addTo(fountainsLayerRef.current)
      fountainMarkersRef.current[stableId] = marker
    }

    // Make sure tiles/markers match container size.
    mapInstance.invalidateSize()
  }, [
    mapInstance,
    fountainCards,
    escapeHtml,
  ])

  // If a card was selected before the search finished, re-open popup after rebuild.
  useEffect(() => {
    if (!mapInstance || !activeStableId) return
    fountainMarkersRef.current[activeStableId]?.openPopup()
  }, [mapInstance, activeStableId, fountains])

  // After every search, zoom the map to the bounds of all found markers.
  useEffect(() => {
    if (!mapInstance) return
    const latlngs: [number, number][] = []
    for (const el of fountains) {
      if (el.lat == null || el.lon == null) continue
      latlngs.push([el.lat, el.lon])
    }
    if (latlngs.length === 0) return

    mapInstance.fitBounds(L.latLngBounds(latlngs), {
      padding: [30, 30],
      maxZoom: 17,
      animate: true,
    })
  }, [mapInstance, fountains])

  // Drawer open/close can affect perceived container sizing on mobile.
  useEffect(() => {
    if (!mapInstance) return
    const t = window.setTimeout(() => mapInstance.invalidateSize(), 0)
    return () => window.clearTimeout(t)
  }, [mapInstance, mobileSheetOpen])

  // Mobile swipe handling (drawer).
  const onSheetTouchStart = (e: React.TouchEvent) => {
    dragStartYRef.current = e.touches[0]?.clientY ?? null
  }

  const onSheetTouchMove = (e: React.TouchEvent) => {
    if (dragStartYRef.current == null) return
    const currentY = e.touches[0]?.clientY
    if (currentY == null) return
    const dy = currentY - dragStartYRef.current
    // Swipe up => open, swipe down => close
    if (!mobileSheetOpen && dy < -50) setMobileSheetOpen(true)
    if (mobileSheetOpen && dy > 50) setMobileSheetOpen(false)
  }

  const PanelContent = ({ dense }: { dense?: boolean }) => {
    return (
      <div
        className={[
          'rounded-3xl border border-white/15 bg-white/10 p-4 shadow-[0_30px_90px_rgba(0,0,0,0.35)] backdrop-blur-[10px] ring-1 ring-white/10',
          dense ? 'p-3' : '',
        ].join(' ')}
      >
        <div className={dense ? 'mb-3' : 'mb-4 text-center'}>
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
              <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
              <span>Searching...</span>
            </>
          ) : (
            <span>Search This Area</span>
          )}
        </button>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200/60 bg-red-500/10 px-3 py-2 text-center text-xs text-red-200">
            {error}
          </p>
        ) : null}

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
              {fountainCards.map((card) => {
                    const { stableId, lat, lon, milesAway, displayTitle, displaySubtitle } = card
                    const milesLabel =
                      milesAway == null ? 'Distance unavailable' : `${milesAway.toFixed(2)} miles away`

                return (
                  <button
                    key={`card-${stableId}`}
                    type="button"
                    onClick={() => selectFountain(lat, lon, stableId)}
                    className={[
                      'text-left rounded-2xl border p-3 transition',
                      'bg-white/15 border-white/15 hover:bg-white/20',
                      activeStableId === stableId ? 'ring-2 ring-emerald-400/70' : '',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">
                              {displayTitle}
                            </div>
                            {displaySubtitle ? (
                              <div className="mt-0.5 truncate text-[11px] text-white/70">
                                {displaySubtitle}
                              </div>
                            ) : null}
                            <div className="mt-1 text-xs font-bold text-emerald-200">
                              {milesLabel}
                            </div>
                      </div>

                      <span className="rounded-full bg-emerald-400 px-2.5 py-1 text-[11px] font-semibold text-emerald-950 shadow-sm">
                        Available
                      </span>
                    </div>

                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          window.open(
                            googleMapsDirectionsUrl(lat, lon),
                            '_blank',
                            'noopener,noreferrer'
                          )
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
    )
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-slate-950">
      <div className="hidden lg:block w-[380px] overflow-y-auto border-r border-white/10 p-3">
        <PanelContent />
      </div>

      <div className="relative flex-1" ref={mapHostRef}>
        <MapContainer
          center={center}
          zoom={13}
          className="h-full w-full"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            // High-visibility street-style with labels.
            url="https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png"
          />
          <RecenterOnUser position={userPosition} />
          <MapInstanceBridge onReady={handleMapReady} />

          {userPosition ? (
            <Marker position={userPosition} icon={userIcon}>
            </Marker>
          ) : null}
        </MapContainer>
      </div>

      {/* Mobile: Bottom sheet for search + results */}
      <div className="lg:hidden">
        {/* Collapsed drawer (default): ~15% height, shows only Search button. */}
        <div className="fixed inset-x-0 bottom-0 z-[1250]">
          {/* Backdrop only when expanded */}
          {mobileSheetOpen ? (
            <button
              type="button"
              onClick={() => setMobileSheetOpen(false)}
              className="absolute inset-0 bg-black/30"
              aria-label="Close results"
            />
          ) : null}

          <div
            className="relative rounded-t-3xl border-t border-white/10 bg-white/10 p-3 backdrop-blur-[12px] shadow-[0_-30px_90px_rgba(0,0,0,0.35)]"
            style={{
              height: mobileSheetOpen ? '85vh' : '15vh',
              transition: 'height 220ms ease',
              overflow: 'hidden',
            }}
          >
            {/* Swipe handle */}
            <div
              className="mb-2 flex h-6 cursor-grab items-center justify-center"
              onTouchStart={onSheetTouchStart}
              onTouchMove={onSheetTouchMove}
            >
              <div className="h-1.5 w-12 rounded-full bg-white/30" />
            </div>

            {/* Collapsed content */}
            {!mobileSheetOpen ? (
              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSearchClick}
                  disabled={loading || !mapInstance}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/20 px-4 py-3.5 text-sm font-semibold text-white shadow-sm backdrop-blur-xl transition active:scale-[0.98] hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                      <span>Searching...</span>
                    </>
                  ) : (
                    <span>Search</span>
                  )}
                </button>
              </div>
            ) : (
              <div className="h-full overflow-y-auto">
                <PanelContent dense />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
