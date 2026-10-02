/**
 * Multi-user collaboration spec — verifies two users sign in into
 * separate browser contexts and the app distinguishes them.
 *
 * `users(2)` takes any two accounts from your pool, so this spec passes on a
 * fresh app with no setup beyond having two test accounts:
 *   npx deepspace test accounts list
 *   npx deepspace test accounts create --email a@deepspace.test --name "A" --password-stdin
 *
 * Ask for accounts *by name* (`users(['Alice', 'Bob'])`) only when the
 * behaviour under test depends on which identity acts — otherwise naming them
 * couples the spec to one machine's pool.
 *
 * The `users` fixture handles sign-in caching (per-account storageState
 * persisted to `~/.deepspace/playwright-states/`), context creation, and
 * cleanup. No need to manage browser contexts manually.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

// A machine that has never created test accounts is the normal state of a
// fresh checkout, and there `users()` throws — turning "you have no pool yet"
// into three red tests about the app, which it is not. Skip the file instead
// and say what creates the pool. The count is of accounts usable HERE: the
// pool is global per developer, but passwords live only on the machine that
// created the account.
const usableTestAccounts = loadAllTestAccounts().length
test.skip(
  usableTestAccounts < 2,
  `Needs 2 usable test accounts, found ${usableTestAccounts}. Create them with ` +
    '`npx deepspace test accounts create --email <name>@deepspace.test --name "<name>" ' +
    '--password-stdin`, or fetch existing pool accounts with `npx deepspace test accounts recover --all`.',
)

test('each browser renders its own signed-in account', async ({ users }) => {
  const [a, b] = await users(2)

  // /home is dynamic (under src/pages/(app)/), so it mounts the nav shell;
  // '/' is the static landing and has no navigation.
  await Promise.all([a.page.goto('/home'), b.page.goto('/home')])

  // Email, not name. The page renders the *session's* `name || email`, while
  // `user.name` here comes from the LOCAL account registry — and the two are
  // not the same fact: a display name is optional, and an account recovered on
  // another machine has none stored locally at all. The email is the credential
  // the context signed in with, so it is the one identity both sides agree on,
  // and asserting it proves the page is showing THIS browser's account.
  // The two accounts are distinct, so two exact matches is also the proof that
  // the contexts are not sharing one session.
  for (const user of [a, b]) {
    await expect(user.page.getByTestId('app-navigation')).toBeVisible({ timeout: 15_000 })

    // The identity chip shows `name || email`. Its text is not predictable, but
    // its presence is: something must be there once the profile has loaded.
    // (It is `hidden sm:inline` in some templates, so assert text, not
    // visibility.)
    await expect(user.page.getByTestId('nav-user-name')).toHaveText(/\S/, { timeout: 15_000 })

    await user.page.getByRole('button', { name: 'Account menu' }).click()
    await expect(user.page.getByTestId('nav-user-email')).toHaveText(user.email, {
      timeout: 15_000,
    })
  }
})

test('API status page renders loading success and error states', async ({ users }) => {
  const [user] = await users(1)
  let shouldFail = false
  let requestCount = 0

  await user.page.route('**/api/integrations', async (route) => {
    requestCount += 1
    if (shouldFail) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Catalog unavailable' }),
      })
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { integrations: { openai: {}, wikipedia: {} } } }),
    })
  })

  await user.page.goto('/api-status')
  await expect(user.page.getByText('Loading integration catalog...')).toBeVisible()
  await expect(user.page.getByText('Integration catalog ready')).toBeVisible()
  await expect(user.page.getByText('2 integrations available.')).toBeVisible()

  shouldFail = true
  await user.page.getByRole('button', { name: 'Refresh' }).click()
  await expect(user.page.getByText('Catalog unavailable')).toBeVisible()
  await expect(user.page.getByText('Showing the last loaded catalog')).toBeVisible()
  await expect(user.page.getByText('Integration catalog ready')).toBeVisible()

  const urlAfterFailure = user.page.url()
  const requestsAfterFailure = requestCount
  await user.page.getByRole('button', { name: 'Refresh' }).click()
  await expect.poll(() => requestCount).toBeGreaterThan(requestsAfterFailure)
  expect(user.page.url()).toBe(urlAfterFailure)
})

test('API status page shows local retry after first-load API failure', async ({ users }) => {
  const [user] = await users(1)
  let requestCount = 0

  await user.page.route('**/api/integrations', async (route) => {
    requestCount += 1
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'Catalog unavailable' }),
    })
  })

  await user.page.goto('/api-status')
  await expect(user.page.getByText('Loading integration catalog...')).toBeVisible()
  await expect(user.page.getByText('Could not load API data')).toBeVisible()
  await expect(user.page.getByText('Retried 1 time automatically.')).toBeVisible()

  const retryButton = user.page.getByRole('button', { name: 'Retry' })
  await expect(retryButton).toBeVisible()

  const urlAfterFailure = user.page.url()
  const requestsAfterFailure = requestCount
  await retryButton.click()
  await expect.poll(() => requestCount).toBeGreaterThan(requestsAfterFailure)
  expect(user.page.url()).toBe(urlAfterFailure)
})

test('private memory isolates users and deletion requires an action-bound confirmation',async({users})=>{
 const [a,b]=await users(2)
 await Promise.all([a.page.goto('/personal'),b.page.goto('/personal')])
 const content=`Private memory ${Date.now()}`
 await a.page.getByRole('textbox',{name:'New memory'}).fill(content)
 await a.page.getByRole('button',{name:'Remember',exact:true}).click()
 await expect(a.page.getByText(content,{exact:true})).toBeVisible()
 await expect(b.page.getByText(content,{exact:true})).toHaveCount(0)
 const card=a.page.locator('.personal-card').filter({hasText:content})
 await card.getByRole('button',{name:'Delete',exact:true}).click()
 await expect(a.page.getByRole('dialog')).toBeVisible()
 await expect(card).toBeVisible()
 await a.page.getByRole('button',{name:'Cancel',exact:true}).click()
 await expect(card).toBeVisible()
 await card.getByRole('button',{name:'Delete',exact:true}).click()
 await a.page.getByRole('button',{name:'Delete permanently',exact:true}).click()
 await expect(a.page.getByText(content,{exact:true})).toHaveCount(0)
})

test('iPhone keeps the full desktop dashboard with horizontal panning',async({users})=>{
 const [a]=await users(1);await a.page.setViewportSize({width:390,height:844});await a.page.goto('/home')
 await expect(a.page.getByRole('textbox',{name:'Message JARVIS'})).toBeVisible()
 await expect(a.page.getByRole('button',{name:'Start voice input'})).toBeVisible()
 expect(await a.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
 await expect(a.page.getByRole('button',{name:'Zoom dashboard',exact:true})).toBeVisible()
 await a.page.screenshot({path:'test-results/jarvis-mobile-overview.png',fullPage:true})
 await a.page.getByRole('button',{name:'Zoom dashboard',exact:true}).click()
 const layout=await a.page.evaluate(()=>{const viewport=document.querySelector('.hud-viewport');const dashboard=document.querySelector('.hud-dashboard');const support=document.querySelector('.hud-support');return {width:dashboard.getBoundingClientRect().width,scrollable:viewport.scrollWidth>viewport.clientWidth,supportVisible:getComputedStyle(support).display!=='none'}})
 expect(layout.width).toBeGreaterThanOrEqual(1280)
 expect(layout.scrollable).toBe(true)
 expect(layout.supportVisible).toBe(true)
 await a.page.getByRole('button',{name:'CHAT',exact:true}).click()
 await expect(a.page.getByText('Conversation channel open.')).toBeVisible()
 await a.page.getByRole('button',{name:'HOME',exact:true}).click()

 await a.page.screenshot({path:'test-results/jarvis-mobile.png',fullPage:true})
})

test('holographic dashboard shows honest connection states and working navigation',async({users})=>{
 const [a]=await users(1);await a.page.setViewportSize({width:1440,height:1000});await a.page.goto('/home')
 await expect(a.page.locator('.hud-brand h1')).toHaveText('JARVIS')
 await expect(a.page.locator('.hud-reactor')).toBeVisible()
 await expect(a.page.locator('.hud-weather')).toContainText('Provider not connected')
 await expect(a.page.getByRole('button',{name:'SMART HOME',exact:true})).toBeDisabled()
 await expect(a.page.locator('.location-panel')).toContainText('Location access is not enabled')
 await a.page.screenshot({path:'test-results/jarvis-desktop.png',fullPage:true})
 await a.page.getByRole('button',{name:'CHAT',exact:true}).click()
 await expect(a.page.getByText('Conversation channel open.')).toBeVisible()
 await a.page.getByRole('button',{name:'HOME',exact:true}).click()
 await expect(a.page.locator('.hud-reactor')).toBeVisible()
 await a.page.getByRole('link',{name:'PRODUCTIVITY',exact:true}).click()
 await expect(a.page.getByRole('heading',{name:'My space',exact:true})).toBeVisible()
})

test('streamed chat executes registered time tool and persists across reload',async({users})=>{
 test.skip(process.env.JARVIS_TEST_AI!=='1','Requires paid-provider boundary fixture; app internals stay real.')
 const [a,b]=await users(2);await a.page.goto('/home');await b.page.goto('/home')
 await a.page.getByRole('textbox',{name:'Message JARVIS'}).fill('Please get the current UTC time.')
 await a.page.getByRole('button',{name:'Send message',exact:true}).click()
 await expect(a.page.getByText('The current time was retrieved successfully.',{exact:true})).toBeVisible({timeout:20000})
 await expect(b.page.getByText('The current time was retrieved successfully.',{exact:true})).toHaveCount(0)
 await a.page.reload()
 await a.page.locator('.history-item').first().click()
 await expect(a.page.getByText('The current time was retrieved successfully.',{exact:true})).toBeVisible()
 await a.page.goto('/personal')
 const card=a.page.locator('.personal-card').filter({hasText:'Please get the current UTC time.'}).first()
 await card.getByRole('button',{name:'Delete conversation'}).click()
 await a.page.getByRole('button',{name:'Delete permanently'}).click()
 await expect(card).toHaveCount(0)
})

test('confirmation token cannot cross users or replay',async({users})=>{
 const [a,b]=await users(2);await Promise.all([a.page.goto('/home'),b.page.goto('/home')])
 const call=async(page:typeof a.page,path:string,body:unknown)=>page.evaluate(async({path,body})=>{const modulePath='/src/jarvis/client.ts';const module=await import(modulePath);const r=await module.authenticatedFetch(path,body);return {status:r.status,data:await r.json()}},{path,body})
 const created=await call(a.page,'/api/jarvis/memories',{content:`__test-${Date.now()}__ token`,category:'preference'})
 expect(created.status).toBe(201)
 const recordId=created.data.data.record.recordId
 const approval=await call(a.page,'/api/jarvis/confirmations/request',{collection:'memories',recordId})
 expect(approval.status).toBe(200)
 expect((await call(b.page,'/api/jarvis/confirmations/approve',{token:approval.data.token})).status).toBe(409)
 expect((await call(a.page,'/api/jarvis/confirmations/approve',{token:approval.data.token})).status).toBe(200)
 expect((await call(a.page,'/api/jarvis/confirmations/approve',{token:approval.data.token})).status).toBe(409)
})

test('scheduled reminders deliver a private notification',async({users})=>{
 test.setTimeout(90000)
 const [a,b]=await users(2);await Promise.all([a.page.goto('/personal'),b.page.goto('/personal')])
 const title=`__test-${Date.now()}__ due reminder`
 const created=await a.page.evaluate(async({title})=>{const path='/src/jarvis/client.ts';const module=await import(path);const result=await module.authenticatedFetch('/api/jarvis/reminders',{title,dueAt:new Date(Date.now()+3000).toISOString(),timezone:'UTC'});return {status:result.status,data:await result.json()}},{title})
 expect(created.status).toBe(201)
 await expect(a.page.locator('.personal-card').filter({hasText:title})).toHaveCount(2,{timeout:75000})
 await expect(b.page.getByText(title,{exact:true})).toHaveCount(0)
 const reminder=a.page.locator('.personal-card').filter({hasText:title}).filter({has:a.page.getByRole('button',{name:'Delete',exact:true})})
 await reminder.getByRole('button',{name:'Delete',exact:true}).click()
 await a.page.getByRole('button',{name:'Delete permanently'}).click()
 await expect(reminder).toHaveCount(0)
})

test('other users cannot spend owner Groq or Fish credentials',async({users})=>{
 const [a]=await users(1);await a.page.goto('/home')
 const results=await a.page.evaluate(async()=>{const path='/src/jarvis/client.ts';const module=await import(path);const caps=await module.authenticatedFetch('/api/jarvis/capabilities');const voice=await module.authenticatedFetch('/api/jarvis/voice/speak',{text:'Do not bill the owner'});const greeting=await module.authenticatedFetch('/api/jarvis/voice/greeting');return {capabilities:await caps.json(),voiceStatus:voice.status,greetingStatus:greeting.status}})
 expect(results.capabilities.llmMode).toBe('deepspace')
 expect(results.capabilities.fishVoice).toBe(false)
 expect(results.greetingStatus).toBe(403)
 expect(results.voiceStatus).toBe(403)
})

test('preferences persist and action quota returns 429',async({users})=>{
 const [a]=await users(1);await a.page.goto('/settings')
 await a.page.getByLabel('Your timezone').fill('America/New_York')
 await a.page.getByLabel('brief',{exact:true}).check()
 await a.page.getByRole('button',{name:'Save preferences'}).click()
 await expect(a.page.getByText('Preferences saved.',{exact:true})).toBeVisible()
 const statuses=await a.page.evaluate(async()=>{const path='/src/jarvis/client.ts';const module=await import(path);const statuses:number[]=[];for(let i=0;i<35;i++){const r=await module.authenticatedFetch('/api/jarvis/memories',{});statuses.push(r.status);if(r.status===429)break}return statuses})
 expect(statuses).toContain(429)
})
