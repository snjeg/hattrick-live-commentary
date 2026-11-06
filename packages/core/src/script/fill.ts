/** Fills `{name}` placeholders. Returns undefined when any placeholder has no value. */
export function fillTemplate(
  text: string,
  values: Readonly<Record<string, string | undefined>>,
): string | undefined {
  let missing = false;
  const out = text.replace(/\{(\w+)\}/g, (_whole, name: string) => {
    const value = values[name];
    if (value === undefined || value === '') {
      missing = true;
      return '';
    }
    return value;
  });
  return missing ? undefined : out;
}

/** 1 -> "1st", 22 -> "22nd", 93 -> "93rd", 111 -> "111th". */
export function ordinal(n: number): string {
  const mod100 = Math.abs(n) % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (Math.abs(n) % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
