export const SVG_PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "img-src data:",
  "style-src 'unsafe-inline'"
].join('; ');

const SAFE_DATA_IMAGE_URL = /^data:image\/(?:png|jpe?g|gif|webp|bmp);/i;

const BLOCKED_SVG_ELEMENTS = [
  'script',
  'foreignObject',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select'
];

function stripBlockedElements(svg: string): string {
  return BLOCKED_SVG_ELEMENTS.reduce((next, tag) => {
    const paired = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, 'gi');
    const selfClosing = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi');
    return next.replace(paired, '').replace(selfClosing, '');
  }, svg);
}

function stripUnsafeUrlAttributes(svg: string): string {
  return svg.replace(
    /\s(?:href|xlink:href|src|action|formaction)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (
      attribute,
      doubleQuotedValue: string | undefined,
      singleQuotedValue: string | undefined,
      unquotedValue: string | undefined
    ) => {
      const value = doubleQuotedValue ?? singleQuotedValue ?? unquotedValue ?? '';
      const trimmed = value.trim();
      const allowed = trimmed.startsWith('#') || SAFE_DATA_IMAGE_URL.test(trimmed);
      return allowed ? attribute : '';
    }
  );
}

function stripUnsafeStyleAttributes(svg: string): string {
  return svg.replace(
    /\s+style\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (
      attribute,
      doubleQuotedValue: string | undefined,
      singleQuotedValue: string | undefined,
      unquotedValue: string | undefined
    ) => {
      const value = doubleQuotedValue ?? singleQuotedValue ?? unquotedValue ?? '';
      return /url\s*\(|@import/i.test(value) ? '' : attribute;
    }
  );
}

export function sanitizeSvgForPreview(svg: string): string {
  const trimmed = svg.trim();
  if (!/^<svg\b/i.test(trimmed)) {
    throw new Error('Export preview requires an SVG document.');
  }

  const withoutActiveContent = stripUnsafeUrlAttributes(stripBlockedElements(trimmed))
    .replace(/<!doctype[\s\S]*?>/gi, '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');

  return stripUnsafeStyleAttributes(withoutActiveContent);
}

export function createSvgPreviewHtml(svg: string): string {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${SVG_PREVIEW_CSP}">`,
    '<title>Flowmaptool export</title>',
    '</head>',
    '<body style="margin:0;background:#fff;display:flex;align-items:center;justify-content:center;">',
    sanitizeSvgForPreview(svg),
    '</body>',
    '</html>'
  ].join('');
}

export function shouldAllowPreviewRequest(url: string, allowedMainFrameUrl: string, resourceType?: string): boolean {
  if (resourceType === 'mainFrame') return url === allowedMainFrameUrl;
  if (resourceType === 'image') return SAFE_DATA_IMAGE_URL.test(url);
  return false;
}
