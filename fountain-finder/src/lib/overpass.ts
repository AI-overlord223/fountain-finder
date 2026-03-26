const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

const FETCH_TIMEOUT_MS = 10_000
/** Initial attempt plus this many automatic retries (3 retries = 4 attempts total). */
const RETRY_COUNT = 3
const MAX_ATTEMPTS = 1 + RETRY_COUNT
const RETRY_DELAY_MS = 800

export interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
}

interface OverpassResponse {
  elements: OverpassElement[]
}

function tag(tags: Record<string, string> | undefined, key: string): string | undefined {
  return tags?.[key]
}

function firstTag(
  tags: Record<string, string> | undefined,
  keys: string[]
): string | undefined {
  for (const k of keys) {
    const v = tag(tags, k)
    if (v != null && v.trim().length > 0) return v
  }
  return undefined
}

export function getFountainDisplayInfo(el: OverpassElement): {
  stableId: string
  title: string
  subtitle?: string
} {
  const lat = el.lat
  const lon = el.lon
  const tags = el.tags

  const roundedLat = lat != null ? lat.toFixed(5) : '0.00000'
  const roundedLon = lon != null ? lon.toFixed(5) : '0.00000'
  const stableId = `fountain-${roundedLat}-${roundedLon}`

  // "Human" naming preference:
  // 1) any name-* fields
  // 2) brand/operator/ref
  // 3) address-ish fields
  // 4) fallback to a location-based identifier (no generic placeholders)
  const title =
    firstTag(tags, ['name', 'name:en', 'name:local', 'alt_name']) ??
    firstTag(tags, ['brand']) ??
    firstTag(tags, ['ref']) ??
    firstTag(tags, ['description', 'operator', 'amenity']) ??
    (() => {
      const street = firstTag(tags, ['addr:street', 'street', 'road'])
      const house = firstTag(tags, ['addr:housenumber', 'housenumber'])
      const place = street
        ? house
          ? `${house} ${street}`
          : street
        : undefined
      return place
        ? `Drinking water — ${place}`
        : `Drinking water — ${roundedLat}, ${roundedLon}`
    })()

  // Subtitle: show address/operator context when available.
  const addrStreet = firstTag(tags, ['addr:street', 'street', 'road'])
  const addrHouse = firstTag(tags, ['addr:housenumber', 'housenumber'])
  const operator = firstTag(tags, ['operator', 'brand'])

  const subtitleCandidates: string[] = []
  if (addrStreet) subtitleCandidates.push(addrHouse ? `${addrHouse} ${addrStreet}` : addrStreet)
  if (operator && operator !== title) subtitleCandidates.push(operator)

  const subtitle = subtitleCandidates.length ? subtitleCandidates.slice(0, 2).join(' • ') : undefined

  return { stableId, title, subtitle }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 504 || status === 502 || status === 503 || status === 429
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof TypeError) return true
  return false
}

/**
 * Fetches all OSM nodes tagged amenity=drinking_water within radiusMeters of (lat, lon).
 * Uses a 10s client timeout and up to 3 automatic retries (4 attempts total) on failure.
 */
export async function fetchDrinkingWaterNear(
  lat: number,
  lon: number,
  radiusMeters = 2000
): Promise<OverpassElement[]> {
  const query = `
[out:json][timeout:10];
(
  node["amenity"="drinking_water"](around:${radiusMeters},${lat},${lon});
);
out body;
`
  const body = `data=${encodeURIComponent(query)}`
  let lastError: Error = new Error('Overpass request failed')

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchWithTimeout(
        OVERPASS_URL,
        {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
        FETCH_TIMEOUT_MS
      )

      if (isRetryableStatus(res.status) && attempt < MAX_ATTEMPTS) {
        await delay(RETRY_DELAY_MS * attempt)
        continue
      }

      if (!res.ok) {
        throw new Error(`Overpass request failed (${res.status})`)
      }

      const data: OverpassResponse = await res.json()
      return data.elements.filter(
        (e) => e.type === 'node' && e.lat != null && e.lon != null
      )
    } catch (e) {
      const message =
        e instanceof DOMException && e.name === 'AbortError'
          ? 'Request timed out (10s)'
          : e instanceof Error
            ? e.message
            : 'Network error'
      lastError = new Error(message)

      const retry =
        attempt < MAX_ATTEMPTS &&
        (isRetryableError(e) ||
          (e instanceof Error && /50[234]|timed out|timeout/i.test(e.message)))

      if (retry) {
        await delay(RETRY_DELAY_MS * attempt)
        continue
      }
      throw lastError
    }
  }

  throw lastError
}

/** Three demo fountains offset from (lat, lon) for offline presentations. */
export function getSampleFountainsNear(
  lat: number,
  lon: number
): OverpassElement[] {
  const d = 0.0022
  return [
    {
      type: 'node',
      id: -1001,
      lat: lat + d * 0.9,
      lon: lon + d * 0.4,
      tags: { name: 'Sample Fountain — Plaza' },
    },
    {
      type: 'node',
      id: -1002,
      lat: lat - d * 0.7,
      lon: lon + d * 0.85,
      tags: { name: 'Sample Fountain — Campus Walk' },
    },
    {
      type: 'node',
      id: -1003,
      lat: lat + d * 0.35,
      lon: lon - d * 0.95,
      tags: { name: 'Sample Fountain — Park Entrance' },
    },
  ]
}

// Backwards-compatible helper (used in older UI code).
export function fountainDisplayName(tags: Record<string, string> | undefined): string {
  return (
    firstTag(tags, ['name', 'name:en', 'name:local', 'alt_name']) ??
    firstTag(tags, ['brand', 'ref', 'description', 'operator']) ??
    'Drinking water'
  )
}

export function googleMapsDirectionsUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${lat},${lon}`,
  })
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export function openGoogleMapsDirections(lat: number, lon: number): void {
  const url = googleMapsDirectionsUrl(lat, lon)
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.click()
}
