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

export function fountainDisplayName(tags: Record<string, string> | undefined): string {
  if (!tags) return 'Drinking fountain'
  return (
    tags.name ??
    tags['name:en'] ??
    tags['name:local'] ??
    tags.ref ??
    'Drinking fountain'
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
