import { expect, test } from "@playwright/test";
import { openDevelopmentStorage, setRawMarkdown, switchToRawMode, switchToWysiwygMode, wysiwygEditor, rawMarkdown } from "../helpers/editor";

const dangerous = [
  '<script>window.__jotExecuted=true</script>',
  '<img src=x onerror="window.__jotExecuted=true">',
  '<svg onload="window.__jotExecuted=true"><foreignObject><iframe srcdoc="<script>parent.__jotExecuted=true</script>"></iframe></foreignObject></svg>',
  '[script](javascript:window.__jotExecuted=true)',
  '[encoded](java&#x73;cript:window.__jotExecuted=true)',
  '[control](java&#x09;script:window.__jotExecuted=true)',
  '[data](data:text/html,test)',
  '[good tag](jot:tag/security-review)',
  '[bad tag](jot:tag/../javascript:alert)',
  '[encoded tag](jot:tag/%73ecurity)',
  '[web](https://example.test/safe)',
  '$$\\href{javascript:alert(1)}{unsafe}$$',
  '$$\\htmlClass{injected}{x}$$',
  '$$\\includegraphics{https://probe.invalid/math.png}$$',
  '$$\\def\\loop{\\loop}\\loop$$',
  '$$\\sqrt{2}$$'
].join('\n\n');

async function expectInert(page: import('@playwright/test').Page) {
  const editor = wysiwygEditor(page);
  await expect(editor.locator('script, iframe, object, embed, foreignObject, [onerror], [onload], .injected')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__jotExecuted)).toBeUndefined();
  const hrefs = await editor.locator('a').evaluateAll(nodes => nodes.map(n => n.getAttribute('href') ?? ''));
  expect(hrefs.filter(h => /^(?:javascript|data|vbscript):/i.test(h.replace(/[\s\u0000-\u0020]/g, '')))).toEqual([]);
}

test('untrusted Markdown stays inert through raw rendering and file import', async ({ page }) => {
  const requests: string[] = [];
  await page.route('https://probe.invalid/**', route => { requests.push(route.request().url()); return route.abort(); });
  await openDevelopmentStorage(page, '/', 'disabled');
  await setRawMarkdown(page, dangerous);
  await switchToWysiwygMode(page);
  await expectInert(page);
  await expect(wysiwygEditor(page).locator('a[href="jot:tag/security-review"]')).toHaveCount(1);
  await expect(wysiwygEditor(page).locator('a[href^="jot:"]')).toHaveCount(1);
  await expect(wysiwygEditor(page).locator('.katex svg')).not.toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__jotOpened = [];
    window.open = ((...args: unknown[]) => {
      ((window as unknown as Record<string, unknown>).__jotOpened as unknown[]).push(args);
      return null;
    }) as typeof window.open;
  });
  await wysiwygEditor(page).getByRole('link', { name: 'script', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__jotOpened)).toEqual([]);
  await wysiwygEditor(page).getByRole('link', { name: 'web', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__jotOpened)).toEqual([['https://example.test/safe', '_blank', 'noopener,noreferrer']]);
  await switchToRawMode(page);
  expect(await rawMarkdown(page)).toBe(dangerous);
  await page.locator('input[accept=".md,text/markdown"]').setInputFiles({ name: '2030-02-03.md', mimeType: 'text/markdown', buffer: Buffer.from(dangerous) });
  await expect(page.getByText('Uploaded 1 daily note.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Selected date' }).fill('2030-02-03');
  await page.getByRole('textbox', { name: 'Selected date' }).press('Enter');
  await expect.poll(() => rawMarkdown(page)).toBe(dangerous);
  await switchToWysiwygMode(page);
  await expectInert(page);
  expect(requests).toEqual([]);
});

test('HTML clipboard admits schema content without executable attributes', async ({ page }) => {
  await openDevelopmentStorage(page, '/', 'disabled');
  await setRawMarkdown(page, 'Paste here');
  await switchToWysiwygMode(page);
  await wysiwygEditor(page).focus();
  await page.keyboard.press('ControlOrMeta+End');
  await wysiwygEditor(page).evaluate(editor => {
    const data = new DataTransfer();
    data.setData('text/plain', 'benign unsafe tag');
    data.setData('text/html', '<p><strong>benign</strong><script>window.__jotExecuted=true</script><img src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 onload=%22parent.__jotExecuted=true%22/%3E" onerror="window.__jotExecuted=true"><a href="java&#9;script:window.__jotExecuted=true">unsafe</a><a href="jot:tag/security-review">tag</a></p>');
    editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect(wysiwygEditor(page).locator('strong')).toHaveText('benign');
  await expectInert(page);
  await switchToRawMode(page);
  const source = await rawMarkdown(page);
  expect(source).toContain('**benign**');
  await switchToWysiwygMode(page);
  await expectInert(page);
});

test('external Markdown images make automatic unauthenticated requests', async ({ page }) => {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  await page.route('https://probe.invalid/**', async route => {
    requests.push({ url: route.request().url(), headers: await route.request().allHeaders() });
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' });
  });
  await openDevelopmentStorage(page, '/', 'disabled');
  await setRawMarkdown(page, '![remote](https://probe.invalid/unique-note-marker.png)');
  await switchToWysiwygMode(page);
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests[0]?.url).toBe('https://probe.invalid/unique-note-marker.png');
  expect(requests[0]?.headers.authorization).toBeUndefined();
  expect(requests[0]?.headers.referer).toBe(new URL(page.url()).origin + '/');
});

test('bounded large Markdown and nested math leave the editor usable', async ({ page }) => {
  await openDevelopmentStorage(page, '/', 'disabled');
  const markdown = 'Bounded review\n\n' + 'ordinary words '.repeat(4000) + '\n\n$$' + '\\sqrt{'.repeat(40) + '2' + '}'.repeat(40) + '$$';
  await setRawMarkdown(page, markdown);
  await switchToWysiwygMode(page);
  await expect(wysiwygEditor(page)).toContainText('Bounded review');
  await switchToRawMode(page);
  expect(await rawMarkdown(page)).toBe(markdown);
});
