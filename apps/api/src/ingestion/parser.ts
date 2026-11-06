import { convert } from 'html-to-text';
// Import the library entry directly: the package index runs a debug script when required.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse.js');

export async function extractFromFile(buffer: Buffer, filename: string, mime?: string): Promise<string> {
  const name = filename.toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    const { text } = await pdfParse(buffer);
    return text;
  }
  if (name.endsWith('.html') || name.endsWith('.htm') || mime === 'text/html') {
    return htmlToText(buffer.toString('utf8'));
  }
  // .md, .txt, .csv, .json and anything else text-like
  return buffer.toString('utf8');
}

export function htmlToText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
      { selector: 'nav', format: 'skip' },
      { selector: 'footer', format: 'skip' },
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
    ],
  });
}

export async function fetchUrl(url: string): Promise<{ title: string; text: string }> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'DocPilotBot/0.1 (+https://github.com/)' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/pdf')) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { title: url, text: (await pdfParse(buf)).text };
  }
  const body = await res.text();
  if (!type.includes('html')) return { title: url, text: body };
  const title = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || url;
  return { title, text: htmlToText(body) };
}
