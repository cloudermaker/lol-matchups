import type { PatchResponse } from '@lol/shared';

const NOTES_INDEX = 'https://www.leagueoflegends.com/fr-FR/news/game-updates/';

// page HTML, or null when it does not exist
export type FetchPage = (url: string) => Promise<string | null>;

export const fetchPage: FetchPage = async (url) => {
  const res = await fetch(url, { redirect: 'follow' });
  return res.ok ? res.text() : null;
};

const https = (url: string | undefined) => {
  const decoded = url?.replace(/&amp;/g, '&');
  return decoded?.startsWith('https://') ? decoded : null;
};

// "Patch highlights" is the first zoomable image; else the page preview image
export function highlightImage(html: string): string | null {
  return https(html.match(/<a class="skins cboxElement"[^>]*href="([^"]+)"/)?.[1])
    ?? https(html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/)?.[1]);
}

// game version 16.19.x is patch 26.19; its notes page is read once, else the index is used
export async function patchInfo(version: string, load: FetchPage = fetchPage): Promise<PatchResponse> {
  const [major, minor] = version.split('.').map(Number);
  const year = major + 10;
  const patch = `${year}.${minor}`;
  const pages = [`${minor}`, `${minor}`.padStart(2, '0')]
    .filter((m, i, all) => all.indexOf(m) === i)
    .map((m) => `${NOTES_INDEX}league-of-legends-patch-${year}-${m}-notes`);
  for (const url of pages) {
    const html = await load(url).catch(() => null);
    if (html !== null) return { patch, notesUrl: url, imageUrl: highlightImage(html) };
  }
  return { patch, notesUrl: NOTES_INDEX, imageUrl: null };
}
