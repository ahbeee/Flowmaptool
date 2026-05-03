import { describe, expect, it } from 'vitest';
import {
  createSvgPreviewHtml,
  sanitizeSvgForPreview,
  shouldAllowPreviewRequest,
  SVG_PREVIEW_CSP
} from '../../src/main/preview-security';

describe('SVG preview security helpers', () => {
  it('builds preview HTML with a restrictive CSP and sanitized SVG', () => {
    const html = createSvgPreviewHtml('<svg onload="alert(1)"><rect width="10" height="10" /></svg>');

    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain(SVG_PREVIEW_CSP);
    expect(html).toContain('<rect width="10" height="10" />');
    expect(html).not.toContain('onload');
  });

  it('rejects non-SVG preview input', () => {
    expect(() => sanitizeSvgForPreview('<html></html>')).toThrow('Export preview requires an SVG document.');
  });

  it('strips active SVG content and external resource attributes', () => {
    const sanitized = sanitizeSvgForPreview(`
      <svg>
        <script>alert(1)</script>
        <foreignObject><iframe src="https://example.com"></iframe></foreignObject>
        <image href="https://example.com/a.png" />
        <image href=data:image/svg+xml;base64,abc />
        <image href="data:image/png;base64,abc" />
        <a xlink:href="#node"><text>ok</text></a>
        <rect onmouseover=alert(1) onclick="alert(2)" style="fill:url(https://example.com/pattern.svg)" />
        <style>@import url("https://example.com/a.css");</style>
      </svg>
    `);

    expect(sanitized).not.toMatch(
      /script|foreignObject|iframe|https:\/\/example\.com|image\/svg|onmouseover|onclick|style=/i
    );
    expect(sanitized).toContain('href="data:image/png;base64,abc"');
    expect(sanitized).toContain('xlink:href="#node"');
  });

  it('allows only the preview document and inline data resources', () => {
    const previewUrl = 'data:text/html;charset=utf-8,%3Chtml%3E';

    expect(shouldAllowPreviewRequest(previewUrl, previewUrl, 'mainFrame')).toBe(true);
    expect(shouldAllowPreviewRequest('https://example.com', previewUrl, 'mainFrame')).toBe(false);
    expect(shouldAllowPreviewRequest('data:image/png;base64,abc', previewUrl, 'image')).toBe(true);
    expect(shouldAllowPreviewRequest('data:image/svg+xml;base64,abc', previewUrl, 'image')).toBe(false);
    expect(shouldAllowPreviewRequest('data:text/javascript,alert(1)', previewUrl, 'script')).toBe(false);
    expect(shouldAllowPreviewRequest('file:///tmp/a.png', previewUrl, 'image')).toBe(false);
    expect(shouldAllowPreviewRequest('https://example.com/a.png', previewUrl, 'image')).toBe(false);
  });
});
