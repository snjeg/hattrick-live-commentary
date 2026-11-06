/**
 * Minimal XML reader for CHPP responses: elements, attributes, text, CDATA, comments and
 * entities. No DTDs or namespaces (CHPP sends neither). Runs anywhere: browser page, worker, Node.
 */

export interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  /** Concatenated, entity-decoded text directly inside this element. */
  text: string;
}

export class XmlParseError extends Error {
  override name = 'XmlParseError';
}

const NAMED_XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Decodes the five XML entities and numeric character references. */
export function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, ref: string) => {
    if (ref.startsWith('#x')) return fromCodePoint(parseInt(ref.slice(2), 16), whole);
    if (ref.startsWith('#')) return fromCodePoint(parseInt(ref.slice(1), 10), whole);
    return NAMED_XML_ENTITIES[ref] ?? whole;
  });
}

function fromCodePoint(code: number, fallback: string): string {
  return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : fallback;
}

export function parseXml(source: string): XmlElement {
  const root: XmlElement = { name: '#document', attributes: {}, children: [], text: '' };
  const stack: XmlElement[] = [root];
  let i = 0;
  const n = source.length;

  const top = (): XmlElement => {
    const el = stack[stack.length - 1];
    if (!el) throw new XmlParseError('Unbalanced document');
    return el;
  };

  while (i < n) {
    const lt = source.indexOf('<', i);
    if (lt === -1) {
      top().text += decodeXmlEntities(source.slice(i));
      break;
    }
    if (lt > i) top().text += decodeXmlEntities(source.slice(i, lt));

    if (source.startsWith('<?', lt)) {
      i = indexAfter(source, '?>', lt);
    } else if (source.startsWith('<!--', lt)) {
      i = indexAfter(source, '-->', lt);
    } else if (source.startsWith('<![CDATA[', lt)) {
      const end = source.indexOf(']]>', lt);
      if (end === -1) throw new XmlParseError('Unterminated CDATA');
      top().text += source.slice(lt + 9, end);
      i = end + 3;
    } else if (source.startsWith('<!', lt)) {
      i = indexAfter(source, '>', lt);
    } else if (source.startsWith('</', lt)) {
      const end = indexAfter(source, '>', lt);
      const name = source.slice(lt + 2, end - 1).trim();
      const open = stack.pop();
      if (!open || open.name !== name) {
        throw new XmlParseError(`Unexpected </${name}> at ${lt}`);
      }
      i = end;
    } else {
      const end = tagEnd(source, lt);
      let body = source.slice(lt + 1, end);
      const selfClosing = body.endsWith('/');
      if (selfClosing) body = body.slice(0, -1);
      const m = /^([^\s/>]+)([\s\S]*)$/.exec(body);
      if (!m?.[1]) throw new XmlParseError(`Bad tag at ${lt}`);
      const el: XmlElement = {
        name: m[1],
        attributes: parseAttributes(m[2] ?? ''),
        children: [],
        text: '',
      };
      top().children.push(el);
      if (!selfClosing) stack.push(el);
      i = end + 1;
    }
  }
  if (stack.length !== 1) throw new XmlParseError(`Unclosed <${top().name}>`);
  const [doc] = root.children;
  if (!doc) throw new XmlParseError('Empty document');
  return doc;
}

function indexAfter(source: string, token: string, from: number): number {
  const at = source.indexOf(token, from);
  if (at === -1) throw new XmlParseError(`Missing "${token}" after ${from}`);
  return at + token.length;
}

/** Index of the `>` closing a start tag, skipping quoted attribute values. */
function tagEnd(source: string, from: number): number {
  let quote: string | undefined;
  for (let j = from + 1; j < source.length; j++) {
    const c = source[j];
    if (quote) {
      if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return j;
    }
  }
  throw new XmlParseError(`Unterminated tag at ${from}`);
}

function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    const name = m[1];
    if (name) attributes[name] = decodeXmlEntities(m[3] ?? m[4] ?? '');
  }
  return attributes;
}

// Navigation helpers

export function child(el: XmlElement | undefined, name: string): XmlElement | undefined {
  return el?.children.find((c) => c.name === name);
}

export function children(el: XmlElement | undefined, name: string): XmlElement[] {
  return el ? el.children.filter((c) => c.name === name) : [];
}

export function childText(el: XmlElement | undefined, name: string): string | undefined {
  const c = child(el, name);
  return c ? c.text.trim() : undefined;
}

/** Integer child value; undefined when missing or not an integer. Accepts negative values. */
export function childInt(el: XmlElement | undefined, name: string): number | undefined {
  const t = childText(el, name);
  if (t === undefined || !/^-?\d+$/.test(t)) return undefined;
  return Number(t);
}

/** First descendant with the given name, depth-first. */
export function descendant(el: XmlElement | undefined, name: string): XmlElement | undefined {
  if (!el) return undefined;
  for (const c of el.children) {
    if (c.name === name) return c;
    const found = descendant(c, name);
    if (found) return found;
  }
  return undefined;
}
