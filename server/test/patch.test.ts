import { describe, it, expect, vi } from 'vitest';
import { highlightImage, patchInfo } from '../src/patch';

const BASE = 'https://www.leagueoflegends.com/fr-FR/news/game-updates/';
const IMG = 'https://cmsassets.rgpub.io/sanity/images/dsfx7636/news_live';
const page = (body = '') => `<html><head><meta property="og:image" content="${IMG}/cover.jpg?w=1200&amp;h=630"/></head><body>${body}</body></html>`;
const highlights = `<a class="skins cboxElement" target="_blank" rel="noopener noreferrer" href="${IMG}/highlights.png"><img src="x"/></a>`
  + `<a class="skins cboxElement" href="${IMG}/other.png"></a>`;

describe('patchInfo', () => {
  it('maps the game version to the patch, its notes page and highlights image', async () => {
    const fetchPage = vi.fn(async () => page(highlights));
    expect(await patchInfo('16.19.1', fetchPage)).toEqual({
      patch: '26.19', notesUrl: `${BASE}league-of-legends-patch-26-19-notes`, imageUrl: `${IMG}/highlights.png`,
    });
  });

  it('tries a zero-padded page for single-digit patches', async () => {
    const fetchPage = vi.fn(async (url: string) => (url.endsWith('patch-26-05-notes') ? page() : null));
    expect((await patchInfo('16.5.1', fetchPage)).notesUrl).toBe(`${BASE}league-of-legends-patch-26-05-notes`);
    expect(fetchPage).toHaveBeenCalledWith(`${BASE}league-of-legends-patch-26-5-notes`);
  });

  it('falls back to the patch index without an image when no page exists', async () => {
    expect(await patchInfo('16.19.1', async () => null)).toEqual({ patch: '26.19', notesUrl: BASE, imageUrl: null });
  });

  it('falls back to the patch index when the page fails to load', async () => {
    const fetchPage = async () => { throw new Error('offline'); };
    expect(await patchInfo('16.19.1', fetchPage)).toMatchObject({ notesUrl: BASE, imageUrl: null });
  });
});

describe('highlightImage', () => {
  it('takes the first highlighted image', () => {
    expect(highlightImage(page(highlights))).toBe(`${IMG}/highlights.png`);
  });

  it('falls back to the preview image', () => {
    expect(highlightImage(page())).toBe(`${IMG}/cover.jpg?w=1200&h=630`);
  });

  it('returns null when there is no image', () => {
    expect(highlightImage('<html></html>')).toBeNull();
  });

  it('ignores non-https images', () => {
    expect(highlightImage('<a class="skins cboxElement" href="javascript:alert(1)"></a>')).toBeNull();
  });
});
