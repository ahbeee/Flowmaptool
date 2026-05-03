import { bytesToBase64 } from './export-utils';
import { PNG_FILTER } from './ui-config';

type SaveBinary = (payload: {
  dataBase64: string;
  defaultPath: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}) => Promise<{ filePath: string } | null>;

type ExportPdfFromSvg = (payload: {
  svg: string;
  defaultPath: string;
  width: number;
  height: number;
}) => Promise<{ filePath: string } | null>;

type PrintSvg = (payload: { svg: string }) => Promise<{ success: boolean }>;

type ImageLike = {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  width: number;
  height: number;
};

type CanvasContextLike = {
  scale: (x: number, y: number) => void;
  fillStyle: string;
  fillRect: (x: number, y: number, width: number, height: number) => void;
  drawImage: (image: ImageLike, x: number, y: number) => void;
};

type CanvasLike = {
  width: number;
  height: number;
  getContext: (contextId: '2d') => CanvasContextLike | null;
  toBlob: (callback: (blob: Blob | null) => void, type: string) => void;
};

export type PngExportDependencies = {
  createSvgBlob?: (svg: string) => Blob;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  createImage?: () => ImageLike;
  createCanvas?: () => CanvasLike;
};

export type ExportResult = { ok: true; filePath?: string; message?: string } | { ok: false; message: string };

export function getExportDefaultPath(title: string, extension: 'png' | 'pdf'): string {
  return `${title.replace('.qflow', '')}.${extension}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function loadImage(image: ImageLike, src: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to render export image'));
    image.src = src;
  });
}

function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return blob.arrayBuffer().then(buffer => new Uint8Array(buffer));
}

function createDefaultPngDependencies(): Required<PngExportDependencies> {
  return {
    createSvgBlob: svg => new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
    createObjectUrl: blob => URL.createObjectURL(blob),
    revokeObjectUrl: url => URL.revokeObjectURL(url),
    createImage: () => new Image() as unknown as ImageLike,
    createCanvas: () => document.createElement('canvas') as unknown as CanvasLike
  };
}

export async function renderSvgToPngBytes(
  svg: string,
  fallbackSize: { width: number; height: number },
  dependencies: PngExportDependencies = {}
): Promise<Uint8Array> {
  const deps = { ...createDefaultPngDependencies(), ...dependencies };
  const svgBlob = deps.createSvgBlob(svg);
  const svgUrl = deps.createObjectUrl(svgBlob);
  try {
    const image = deps.createImage();
    await loadImage(image, svgUrl);
    const scale = 2;
    const canvas = deps.createCanvas();
    const exportWidth = image.naturalWidth || image.width || fallbackSize.width;
    const exportHeight = image.naturalHeight || image.height || fallbackSize.height;
    canvas.width = exportWidth * scale;
    canvas.height = exportHeight * scale;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context unavailable');
    context.scale(scale, scale);
    context.fillStyle = '#f8fafc';
    context.fillRect(0, 0, exportWidth, exportHeight);
    context.drawImage(image, 0, 0);
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('PNG encode failed'))), 'image/png');
    });
    return blobToBytes(pngBlob);
  } finally {
    deps.revokeObjectUrl(svgUrl);
  }
}

export async function exportPngFromSvg(options: {
  svg: string;
  title: string;
  canvasSize: { width: number; height: number };
  saveBinary: SaveBinary;
  dependencies?: PngExportDependencies;
}): Promise<ExportResult> {
  try {
    const bytes = await renderSvgToPngBytes(options.svg, options.canvasSize, options.dependencies);
    const result = await options.saveBinary({
      dataBase64: bytesToBase64(bytes),
      defaultPath: getExportDefaultPath(options.title, 'png'),
      filters: PNG_FILTER
    });
    return result ? { ok: true, filePath: result.filePath } : { ok: true };
  } catch (error) {
    return { ok: false, message: getErrorMessage(error, 'PNG export failed') };
  }
}

export async function exportPdfFromSvg(options: {
  svg: string;
  title: string;
  canvasSize: { width: number; height: number };
  exportPdfFromSvg: ExportPdfFromSvg;
}): Promise<ExportResult> {
  try {
    const result = await options.exportPdfFromSvg({
      svg: options.svg,
      defaultPath: getExportDefaultPath(options.title, 'pdf'),
      width: options.canvasSize.width,
      height: options.canvasSize.height
    });
    return result ? { ok: true, filePath: result.filePath } : { ok: true };
  } catch (error) {
    return { ok: false, message: getErrorMessage(error, 'PDF export failed') };
  }
}

export async function printSvgDiagram(options: { svg: string; printSvg: PrintSvg }): Promise<ExportResult> {
  try {
    const result = await options.printSvg({ svg: options.svg });
    return { ok: true, message: result.success ? 'Print completed' : 'Print canceled' };
  } catch (error) {
    return { ok: false, message: getErrorMessage(error, 'Print failed') };
  }
}
