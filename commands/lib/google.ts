// Google OAuth 2.0 Device Authorization flow.
// Edit DEFAULT_SCOPES to match the Google APIs your agents need.

const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
].join(' ')

export type DeviceCodeResponse = {
  device_code: string
  user_code: string
  verification_url: string
  expires_in: number
  interval: number
}

export type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

export async function requestDeviceCode(clientId: string, scopes: string): Promise<DeviceCodeResponse> {
  const response = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, scope: scopes }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Device code request failed (${response.status}): ${text}`)
  }
  return response.json() as Promise<DeviceCodeResponse>
}

export async function pollForToken(
  clientId: string,
  clientSecret: string | undefined,
  deviceCode: string,
  intervalSeconds: number,
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    client_id: clientId,
    device_code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  })
  if (clientSecret) params.set('client_secret', clientSecret)

  while (true) {
    await new Promise<void>(resolve => setTimeout(resolve, intervalSeconds * 1000))

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })

    const data = await response.json() as Record<string, string>

    if (data['access_token']) return data as unknown as TokenResponse
    if (data['error'] === 'authorization_pending') continue
    if (data['error'] === 'slow_down') {
      intervalSeconds += 5
      continue
    }

    throw new Error(`Token request failed: ${data['error']} — ${data['error_description'] ?? ''}`)
  }
}
