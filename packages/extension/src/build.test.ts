// Build test: `pnpm test` builds first, then this checks dist/ is a loadable unpacked MV3 extension.
import { describe, expect, it } from 'vitest';
import backgroundJs from '../dist/background.js?raw';
import manifestRaw from '../dist/manifest.json?raw';
import openPageJs from '../dist/open-page.js?raw';
import pageHtml from '../dist/page.html?raw';
import pageJs from '../dist/page.js?raw';

const manifest = JSON.parse(manifestRaw) as Record<string, unknown> & {
  background: { service_worker: string; type: string };
  permissions: string[];
  host_permissions: string[];
};

describe('extension build', () => {
  it('is a Manifest V3 extension with a module service worker', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
    expect(backgroundJs).toContain('chrome.action.onClicked.addListener');
  });

  it('asks for no permissions yet (no CHPP code in the shell)', () => {
    expect(manifest.permissions).toEqual([]);
    expect(manifest.host_permissions).toEqual([]);
  });

  it('ships the page with its script and no inline code', () => {
    expect(pageHtml).toContain('<script type="module" src="page.js"></script>');
    expect(pageHtml).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(pageHtml).toContain('id="start"');
    expect(pageHtml).toContain('id="stop"');
    expect(pageJs).toContain("from './controller.js'");
  });

  it('emits browser-ready ES module imports', () => {
    expect(backgroundJs).toContain("from './open-page.js'");
    expect(openPageJs).toContain("PAGE_PATH = 'page.html'");
  });

  it('keeps audio out of the service worker', () => {
    expect(backgroundJs).not.toMatch(/AudioContext|speechSynthesis|Audio\(/);
  });
});
