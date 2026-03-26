import { useCallback, useEffect, useState } from 'react'
import { MapView } from './components/MapView'
import {
  fetchDrinkingWaterNear,
  getSampleFountainsNear,
  type OverpassElement,
} from './lib/overpass'

export default function App() {
  const [userPosition, setUserPosition] = useState<[number, number] | null>(
    null
  )
  const [geoError, setGeoError] = useState<string | null>(null)
  const [fountains, setFountains] = useState<OverpassElement[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const [searchRadiusMiles, setSearchRadiusMiles] = useState<number>(5.5)
  const [searchCenter, setSearchCenter] = useState<[number, number] | null>(
    null
  )

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by this browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPosition([pos.coords.latitude, pos.coords.longitude])
        setGeoError(null)
      },
      (err) => {
        setGeoError(
          err.message || 'Could not get your location. Pan the map to search.'
        )
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }, [])

  const handleSearchArea = useCallback(
    async (lat: number, lon: number, radiusMiles: number) => {
      setLoading(true)
      setSearchError(null)
      setSearchCenter([lat, lon])
      try {
        const radiusMeters = Math.round(radiusMiles * 1609.0)
        if (demoMode) {
          const anchorLat = userPosition?.[0] ?? lat
          const anchorLon = userPosition?.[1] ?? lon
          setFountains(getSampleFountainsNear(anchorLat, anchorLon))
        } else {
          const results = await fetchDrinkingWaterNear(lat, lon, radiusMeters)
          setFountains(results)
        }
      } catch (e) {
        setSearchError(
          e instanceof Error ? e.message : 'Failed to load fountains.'
        )
        setFountains([])
      } finally {
        setLoading(false)
      }
    },
    [demoMode, userPosition]
  )

  return (
    <div className="min-h-dvh bg-slate-200 dark:bg-slate-950">
      {geoError && (
        <div className="fixed left-0 right-0 top-0 z-[1100] border-b border-amber-200/80 bg-amber-50/95 px-4 py-2 text-center text-xs text-amber-950 backdrop-blur-sm dark:border-amber-900/50 dark:bg-amber-950/90 dark:text-amber-100">
          {geoError}
        </div>
      )}
      <MapView
        userPosition={userPosition}
        fountains={fountains}
        loading={loading}
        error={searchError}
        onSearchArea={handleSearchArea}
        demoMode={demoMode}
        onDemoModeChange={setDemoMode}
        searchRadiusMiles={searchRadiusMiles}
        onSearchRadiusMilesChange={setSearchRadiusMiles}
        searchCenter={searchCenter}
      />
    </div>
  )
}
