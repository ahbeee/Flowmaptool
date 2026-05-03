import type { DragInsertPreviewRect, MarqueeRect } from './canvas-geometry';

type CanvasOverlaysLayerProps = {
  marquee: MarqueeRect | null;
  dragInsertPreview: DragInsertPreviewRect | null;
};

export function CanvasOverlaysLayer({ marquee, dragInsertPreview }: CanvasOverlaysLayerProps) {
  return (
    <>
      {marquee ? (
        <div
          className="marquee-selection"
          style={{
            left: Math.min(marquee.startX, marquee.currentX),
            top: Math.min(marquee.startY, marquee.currentY),
            width: Math.abs(marquee.currentX - marquee.startX),
            height: Math.abs(marquee.currentY - marquee.startY)
          }}
        />
      ) : null}
      {dragInsertPreview ? (
        <div
          className="drag-insert-preview"
          style={{
            left: dragInsertPreview.left,
            top: dragInsertPreview.top,
            width: dragInsertPreview.width,
            height: dragInsertPreview.height
          }}
        />
      ) : null}
    </>
  );
}
