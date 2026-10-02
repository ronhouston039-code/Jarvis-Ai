import { test, expect } from '@playwright/test'

test.describe('API tests', () => {
  test('auth proxy forwards to auth worker', async ({ request }) => {
    const res = await request.get('/api/auth/ok')
    expect(res.ok()).toBeTruthy()
  })

  test('WebSocket endpoint exists', async ({ page }) => {
    // /home is a dynamic page (under src/pages/(app)/), so mounting it boots
    // the providers and auto-connects the records WebSocket. The static
    // landing at '/' deliberately does neither — see smoke.spec.ts.
    await page.goto('/home')
    // Wait for the app to connect its WebSocket (it auto-connects on mount)
    await page.waitForSelector('[data-testid="app-navigation"]', { timeout: 15000 })
    // If the app loaded and connected, the WS endpoint works
  })
})

test('JARVIS refuses unauthenticated writes and voice',async({request})=>{
 for(const path of ['reminders','memories','confirmations/request','confirmations/approve','voice/speak','voice/transcribe']){
 const result=await request.post(`/api/jarvis/${path}`,{data:{}});expect(result.status()).toBe(401)
 }
 expect((await request.get('/api/jarvis/capabilities')).status()).toBe(401)
})
