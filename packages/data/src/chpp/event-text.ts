import type { Beat, Mention, Side } from '@hlc/core';

/**
 * CHPP EventText is HTML (already XML-decoded by the time it reaches here). In live-texts mode
 * each `<br/>` separates one dramatic beat; in report mode texts are plain sentences or empty.
 */

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

export function decodeHtmlEntities(value: string): string {
  let out = value;
  // Double-encoded entities (e.g. `&amp;#39;`) appear in real data; decode until stable.
  for (let pass = 0; pass < 3; pass++) {
    const next = out.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, ref: string) => {
      if (ref.startsWith('#x')) return safeCodePoint(parseInt(ref.slice(2), 16), whole);
      if (ref.startsWith('#')) return safeCodePoint(parseInt(ref.slice(1), 10), whole);
      return HTML_ENTITIES[ref.toLowerCase()] ?? whole;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

function safeCodePoint(code: number, fallback: string): string {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : fallback;
}

const BREAK = /<br\s*\/?>/gi;
const REPLACEMENT_ERROR = /\[Replacement Error:[^\]]*\]/g;

export interface SplitOptions {
  /** Text to put where Hattrick failed to fill in a formation; removed when absent. */
  formationLabel?: string;
}

/** Splits an EventText into spoken beats with player and team mentions. */
export function splitBeats(html: string, options: SplitOptions = {}): Beat[] {
  const filled = html.replace(REPLACEMENT_ERROR, (match) =>
    /formation/i.test(match) && options.formationLabel ? options.formationLabel : '',
  );
  const beats: Beat[] = [];
  for (const piece of filled.split(BREAK)) {
    const mentions = extractMentions(piece);
    const text = tidy(decodeHtmlEntities(piece.replace(/<[^>]*>/g, '')));
    if (text) beats.push({ text, mentions });
  }
  return beats;
}

function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

function extractMentions(html: string): Mention[] {
  const mentions: Mention[] = [];
  const re = /<(span|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const attrs = m[2] ?? '';
    const cls = /class\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? '';
    const name = tidy(decodeHtmlEntities((m[3] ?? '').replace(/<[^>]*>/g, '')));
    if (!name) continue;
    const kind = /\b(home|away)player\b/.exec(cls);
    const team = /\b(home|away)team\b/.exec(cls);
    if (kind) {
      const id = /playerId=(\d+)/i.exec(attrs)?.[1];
      mentions.push({
        kind: 'player',
        name,
        side: kind[1] as Side,
        ...(id ? { playerId: Number(id) } : {}),
      });
    } else if (team) {
      mentions.push({ kind: 'team', name, side: team[1] as Side });
    }
  }
  return mentions;
}

/** All text of an event as one plain string (for searching, not for speaking). */
export function plainText(html: string): string {
  return tidy(decodeHtmlEntities(html.replace(BREAK, ' ').replace(/<[^>]*>/g, '')));
}
