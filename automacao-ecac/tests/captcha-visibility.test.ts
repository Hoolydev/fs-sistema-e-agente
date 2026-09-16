import { afterAll, beforeAll, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { isCaptchaPending } from '../src/rpa/ecac-playwright.js';

let browser: Browser;
beforeAll(async()=>{browser=await chromium.launch({channel:'chrome',headless:true});});
afterAll(async()=>{await browser?.close();});
it('ignores a preloaded invisible CAPTCHA and detects its visible unresolved challenge',async()=>{
  const page=await browser.newPage();
  await page.route('**/*',route=>route.fulfill({body:'',contentType:'text/html'}));
  await page.setContent('<iframe style="display:none" src="https://hcaptcha.test/challenge"></iframe><textarea name="h-captcha-response" style="display:none"></textarea>');
  expect(await isCaptchaPending(page)).toBe(false);
  await page.locator('iframe').evaluate(el=>{el.style.display='block';});
  expect(await isCaptchaPending(page)).toBe(true);
  await page.locator('iframe').evaluate(el=>{el.style.position='absolute';el.style.top='-9999px';});
  expect(await isCaptchaPending(page)).toBe(false);
  await page.locator('iframe').evaluate(el=>{el.style.top='0px';});
  await page.locator('textarea').evaluate(el=>{(el as HTMLTextAreaElement).value='test-response';});
  expect(await isCaptchaPending(page)).toBe(false);
  await page.close();
});
