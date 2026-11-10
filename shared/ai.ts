/** Sanitize untrusted text before placing it in an AI data block. */
export const cleanAiData = (value: unknown, max = 120) =>
  String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Wrap JSON data in a single, predictable tag after feature code has projected its safe fields. */
export function taggedJson(tag: string, value: unknown): string {
  if (!/^[a-z][a-z0-9-]*$/.test(tag)) throw new Error('Invalid AI data tag');
  const json = JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  return `<${tag}>\n${json}\n</${tag}>`;
}

/** Model output shown in the UI is one capped plain-text paragraph. */
export function cleanAiText(value: unknown): string | null {
  const out = String(value ?? '').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  if (!out) return null;
  return out.length > 280 ? `${out.slice(0, 277).trimEnd()}...` : out;
}
