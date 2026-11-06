import { describe, expect, it } from 'vitest';
import sampleXml from '../../../../fixtures/samples/matchdetails.synthetic.xml?raw';
import { parseMatchDetails } from './matchdetails';

describe('matchdetails 3.1 (synthetic sample)', () => {
  it('reads the documented Arena > WeatherID', () => {
    expect(parseMatchDetails(sampleXml).weatherId).toBe(3);
  });

  it('flags AddedMinutes as a spoiler instead of exposing it', () => {
    const details = parseMatchDetails(sampleXml);
    expect(details.spoilers).toEqual({ addedMinutes: 2 });
    expect(Object.keys(details)).toEqual(['weatherId', 'spoilers']);
  });

  it('tolerates missing fields', () => {
    expect(parseMatchDetails('<HattrickData><Match /></HattrickData>')).toEqual({ spoilers: {} });
  });
});
