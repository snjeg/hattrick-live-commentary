import { describe, expect, it } from 'vitest';
import { childInt, decodeXmlEntities, parseXml, XmlParseError } from './xml';

describe('parseXml', () => {
  it('reads elements, attributes, text, CDATA and comments', () => {
    const doc = parseXml(
      `<?xml version="1.0"?><!-- c --><Root a="1" b='x &amp; y'><Item Index="2">-3</Item><Empty/><T><![CDATA[<b>raw</b>]]></T></Root>`,
    );
    expect(doc.name).toBe('Root');
    expect(doc.attributes).toEqual({ a: '1', b: 'x & y' });
    expect(childInt(doc, 'Item')).toBe(-3);
    expect(doc.children.map((c) => c.name)).toEqual(['Item', 'Empty', 'T']);
    expect(doc.children[2]?.text).toBe('<b>raw</b>');
  });

  it('decodes entities once, leaving double-encoded ones for the HTML layer', () => {
    expect(decodeXmlEntities('&lt;br/&gt; &#245; &#x41; &amp;#39;')).toBe('<br/> õ A &#39;');
  });

  it('rejects malformed documents', () => {
    expect(() => parseXml('<a><b></a>')).toThrow(XmlParseError);
    expect(() => parseXml('<a>')).toThrow(XmlParseError);
    expect(() => parseXml('')).toThrow(XmlParseError);
  });
});
