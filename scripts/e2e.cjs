// End-to-end smoke test: drives the real app (big screen + phones) through every phase.
//
//   node scripts/e2e.cjs                 # host + 2 phones
//   node scripts/e2e.cjs --solo          # host + 1 phone + 2 test bots
//   BASE=http://localhost:3001 SHOTS=./shots node scripts/e2e.cjs
//
// Needs the app (npm run dev in web/) and SpacetimeDB (scripts/dev-spacetime.sh) running, plus
// Playwright: npm i -g playwright && npx playwright install chromium
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:3001';
const SHOTS = process.env.SHOTS || '';
const SOLO = process.argv.includes('--solo');
const HUMANS = SOLO ? ['Ana'] : ['Ana', 'Ben'];
const BOTS = SOLO ? 2 : 0;
const TOTAL = HUMANS.length + BOTS;

function step(msg) {
  console.log(`• ${msg}`);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (page, who) => {
    page.on('console', m => m.type() === 'error' && errors.push(`[${who}] ${m.text()}`));
    page.on('pageerror', e => errors.push(`[${who}] ${e.message}`));
  };
  const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

  const host = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  watch(host, 'host');
  await host.goto(`${BASE}/host`);
  await host.getByRole('button', { name: /Start game/ }).click({ timeout: 20000 });
  await host.waitForURL(/\/host\/[A-Z]{4}$/, { timeout: 15000 });
  const code = host.url().slice(-4);
  step(`lobby ${code}`);

  for (let i = 0; i < BOTS; i++) await host.getByRole('button', { name: /Add test bot/ }).click();
  const phones = [];
  for (const name of HUMANS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    watch(p, name);
    await p.goto(`${BASE}/play/${code}`);
    await p.getByPlaceholder('Your name').fill(name);
    await p.getByRole('button', { name: /Join the fight/ }).click();
    await p.getByText("You're in!").waitFor({ timeout: 15000 });
    phones.push(p);
  }
  await host.getByText(`Players (${TOTAL})`).waitFor();
  await shot(host, '01-lobby');
  await host.getByRole('button', { name: /Start$/ }).click();
  await host.getByRole('heading', { name: 'Tell me what you want' }).waitFor();
  step(`${HUMANS.length} human(s) + ${BOTS} bot(s) joined; answering questions`);

  for (const [i, p] of phones.entries()) {
    await p.getByRole('button', { name: /^\$\$ / }).click();
    await p.getByRole('button', { name: i ? /Vegetarian/ : /Anything/ }).click();
    await p.getByRole('button', { name: /Short ride/ }).click();
    await p.getByRole('button', { name: 'Tonight' }).click();
    await p.getByRole('button', { name: 'Next', exact: true }).click();
    await p.getByRole('button', { name: i ? /Do something/ : /Tacos/ }).click();
    await p.getByText("Here's what we'll share").waitFor();
    await p.getByRole('button', { name: /Approve/ }).click();
    await p.getByText('Locked in').waitFor({ timeout: 10000 });
  }
  await host.getByText(`${TOTAL}/${TOTAL} answered`).waitFor();
  await host.getByRole('button', { name: /Find our spots/ }).click();
  await host.getByRole('heading', { name: 'The contenders' }).waitFor({ timeout: 30000 });
  step('options found and assigned');
  await shot(host, '02-options');

  await host.getByRole('button', { name: /Start pitching/ }).click();
  for (const [i, p] of phones.entries()) {
    await p.getByRole('button', { name: /Type/ }).click();
    await p.getByPlaceholder(/jury/).fill(`Pitch from ${HUMANS[i]}: this place is the move, trust me.`);
    await p.getByRole('button', { name: /Lock it in/ }).click();
    await p.getByText('Pitch locked').waitFor();
  }
  // Bot pitches are written by the AI host and submitted by the big screen.
  await host.getByText(`${TOTAL}/${TOTAL} pitches locked in`).waitFor({ timeout: 20000 });
  step('all pitches in');

  await host.getByRole('button', { name: /Showtime/ }).click();
  await host.getByText(/CONTENDER 1 OF/).waitFor();
  const n = Number((await host.getByText(/CONTENDER 1 OF/).innerText()).match(/OF (\d+)/)[1]);
  for (let i = 0; i < n; i++) {
    await host.locator('.speech.host').last().waitFor();
    await shot(host, `03-showtime-${i + 1}`);
    await host.getByRole('button', { name: 'Next ▶' }).click();
  }
  await host.getByText("That's a wrap!").waitFor();
  await host.getByRole('button', { name: /Open voting/ }).click();
  step(`showtime done (${n} contenders)`);

  for (const p of phones) {
    await p.getByText('Where are we going?').waitFor();
    if ((await p.locator('button.choice[disabled]').count()) !== 1) throw new Error('own option should be disabled');
    await p.locator('button.choice:not([disabled])').first().click();
    await p.getByRole('button', { name: 'Cast my vote' }).click();
  }
  // The server closes voting by itself once the last vote lands.
  await host.getByText(/🏆 THE WINNER/).waitFor({ timeout: 15000 });
  step(`winner: ${await host.locator('h1').first().innerText()}`);
  await shot(host, '04-result');

  await host.getByRole('button', { name: /Make it the plan/ }).click();
  await host.locator('.plan-card').waitFor();
  for (const p of phones) await p.getByRole('button', { name: /I'm in/ }).click();
  await host.getByText(`In (${HUMANS.length})`).waitFor({ timeout: 10000 });
  await shot(host, '05-plan');
  step(`plan: ${(await host.locator('.plan-card').innerText()).split('\n').slice(1, 3).join(' | ')}`);

  await browser.close();
  if (errors.length) {
    console.error('Console errors:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log(`✅ ${SOLO ? 'SOLO ' : ''}E2E PASSED`);
})().catch(e => {
  console.error('❌ E2E FAILED:', e.message);
  process.exit(1);
});
