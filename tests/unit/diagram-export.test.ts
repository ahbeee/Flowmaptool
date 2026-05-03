import { describe, expect, it } from 'vitest';
import {
  exportPdfFromSvg,
  exportPngFromSvg,
  getExportDefaultPath,
  printSvgDiagram,
  renderSvgToPngBytes,
  type PngExportDependencies
} from '../../src/renderer/src/diagram-export';
import { PNG_FILTER } from '../../src/renderer/src/ui-config';

function createLoadedImage(width: number, height: number) {
  const image = {
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    naturalWidth: width,
    naturalHeight: height,
    width,
    height,
    value: '',
    get src() {
      return this.value;
    },
    set src(value: string) {
      this.value = value;
      this.onload?.();
    }
  };
  return image;
}

function createPngDependencies(bytes = new Uint8Array([1, 2, 3])) {
  const calls = {
    revokedUrls: [] as string[],
    canvas: { width: 0, height: 0 },
    drawn: false
  };
  const dependencies: PngExportDependencies = {
    createSvgBlob: svg => new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
    createObjectUrl: () => 'blob:test-svg',
    revokeObjectUrl: url => calls.revokedUrls.push(url),
    createImage: () => createLoadedImage(100, 50),
    createCanvas: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        scale: () => undefined,
        fillStyle: '',
        fillRect: () => undefined,
        drawImage: () => {
          calls.drawn = true;
        }
      }),
      toBlob: callback => callback(new Blob([bytes], { type: 'image/png' }))
    })
  };
  const originalCreateCanvas = dependencies.createCanvas;
  dependencies.createCanvas = () => {
    const canvas = originalCreateCanvas?.();
    if (!canvas) throw new Error('missing canvas');
    return {
      get width() {
        return calls.canvas.width;
      },
      set width(value: number) {
        calls.canvas.width = value;
      },
      get height() {
        return calls.canvas.height;
      },
      set height(value: number) {
        calls.canvas.height = value;
      },
      getContext: canvas.getContext,
      toBlob: canvas.toBlob
    };
  };
  return { dependencies, calls };
}

describe('diagram export helpers', () => {
  it('builds default export paths from qflow titles', () => {
    expect(getExportDefaultPath('Map.qflow', 'png')).toBe('Map.png');
    expect(getExportDefaultPath('Map', 'pdf')).toBe('Map.pdf');
  });

  it('renders SVG to PNG bytes, scales the canvas, and revokes the object URL', async () => {
    const { dependencies, calls } = createPngDependencies();

    await expect(renderSvgToPngBytes('<svg />', { width: 10, height: 10 }, dependencies)).resolves.toEqual(
      new Uint8Array([1, 2, 3])
    );
    expect(calls.canvas).toEqual({ width: 200, height: 100 });
    expect(calls.drawn).toBe(true);
    expect(calls.revokedUrls).toEqual(['blob:test-svg']);
  });

  it('exports PNG through saveBinary with base64 data and PNG filters', async () => {
    const { dependencies } = createPngDependencies();
    const payloads: unknown[] = [];
    const result = await exportPngFromSvg({
      svg: '<svg />',
      title: 'Diagram.qflow',
      canvasSize: { width: 10, height: 10 },
      dependencies,
      saveBinary: async payload => {
        payloads.push(payload);
        return { filePath: 'Diagram.png' };
      }
    });

    expect(result).toEqual({ ok: true, filePath: 'Diagram.png' });
    expect(payloads).toEqual([
      {
        dataBase64: 'AQID',
        defaultPath: 'Diagram.png',
        filters: PNG_FILTER
      }
    ]);
  });

  it('returns a PNG export error when rendering fails', async () => {
    const result = await exportPngFromSvg({
      svg: '<svg />',
      title: 'Diagram.qflow',
      canvasSize: { width: 10, height: 10 },
      dependencies: {
        ...createPngDependencies().dependencies,
        createCanvas: () => ({
          width: 0,
          height: 0,
          getContext: () => null,
          toBlob: () => undefined
        })
      },
      saveBinary: async () => ({ filePath: 'never.png' })
    });

    expect(result).toEqual({ ok: false, message: 'Canvas context unavailable' });
  });

  it('exports PDF through the preload API with canvas dimensions', async () => {
    const payloads: unknown[] = [];
    const result = await exportPdfFromSvg({
      svg: '<svg />',
      title: 'Diagram.qflow',
      canvasSize: { width: 320, height: 240 },
      exportPdfFromSvg: async payload => {
        payloads.push(payload);
        return { filePath: 'Diagram.pdf' };
      }
    });

    expect(result).toEqual({ ok: true, filePath: 'Diagram.pdf' });
    expect(payloads).toEqual([
      {
        svg: '<svg />',
        defaultPath: 'Diagram.pdf',
        width: 320,
        height: 240
      }
    ]);
  });

  it('returns print completion and cancellation messages', async () => {
    await expect(printSvgDiagram({ svg: '<svg />', printSvg: async () => ({ success: true }) })).resolves.toEqual({
      ok: true,
      message: 'Print completed'
    });
    await expect(printSvgDiagram({ svg: '<svg />', printSvg: async () => ({ success: false }) })).resolves.toEqual({
      ok: true,
      message: 'Print canceled'
    });
  });
});
