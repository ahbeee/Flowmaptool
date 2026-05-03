import { expect, test } from '@playwright/test';
import { addChild, launchApp } from './helpers';

test('left dragging connect handle creates a manual edge', async () => {
  const { app, window } = await launchApp();
  const edgePathLocator = window.locator('[data-testid^="edge-path-"]');
  const connectByHandle = async (fromId: string, toId: string) => {
    const sourceNode = window.getByTestId(`node-${fromId}`);
    const handle = sourceNode.locator('.node-connect-handle');
    const target = await window.getByTestId(`node-${toId}`).boundingBox();
    const source = await sourceNode.boundingBox();
    if (!source || !target) throw new Error('connect points not found');
    await window.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await expect(handle).toHaveCSS('opacity', '1');
    await handle.dragTo(window.getByTestId(`node-${toId}`), {
      targetPosition: { x: target.width / 2, y: target.height / 2 }
    });
  };

  await addChild(window, 'n1');
  await addChild(window, 'n2');
  await expect(edgePathLocator).toHaveCount(2);

  const rootNode = window.getByTestId('node-n1');
  const rootHandle = rootNode.locator('.node-connect-handle');
  await expect(rootHandle).toHaveCSS('opacity', '0');
  const rootBox = await rootNode.boundingBox();
  if (!rootBox) throw new Error('root node not found');
  await window.mouse.move(rootBox.x + rootBox.width / 2, rootBox.y + rootBox.height / 2);
  await expect(rootHandle).toHaveCSS('opacity', '1');
  await window.mouse.move(rootBox.x - 40, rootBox.y - 40);
  await expect(rootHandle).toHaveCSS('opacity', '0');

  await connectByHandle('n1', 'n3');
  await expect(edgePathLocator).toHaveCount(3);
  await app.close();
});

test('connect drag preview follows the pointer after zoom', async () => {
  const { app, window } = await launchApp();
  await addChild(window, 'n1');

  await window.keyboard.down('Control');
  await window.mouse.wheel(0, -900);
  await window.keyboard.up('Control');

  await expect
    .poll(async () =>
      window.getByTestId('canvas-surface').evaluate(element => Number((element as HTMLElement).style.zoom) || 1)
    )
    .toBeGreaterThan(1);

  const sourceNode = window.getByTestId('node-n1');
  await sourceNode.evaluate(element => element.classList.add('flow-node-connect-visible'));
  const handle = sourceNode.locator('.node-connect-handle');
  await expect(handle).toHaveCSS('pointer-events', 'auto');
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error('connect handle not found');

  const end = { x: handleBox.x + handleBox.width + 170, y: handleBox.y + handleBox.height + 120 };
  await handle.evaluate(
    (element, point) => {
      element.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          buttons: 1,
          clientX: point.x,
          clientY: point.y,
          pointerId: 1,
          pointerType: 'mouse'
        })
      );
    },
    { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 }
  );
  await window.evaluate(point => {
    globalThis.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        button: 0,
        buttons: 1,
        clientX: point.x,
        clientY: point.y,
        pointerId: 1,
        pointerType: 'mouse'
      })
    );
  }, end);

  const previewEnd = await window.locator('.edge-path-preview').evaluate(path => {
    const svgPath = path as SVGPathElement;
    const svg = svgPath.ownerSVGElement;
    const segments = (svgPath.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (!svg || segments.length < 6) return null;
    const rect = svg.getBoundingClientRect();
    const surface = document.querySelector('[data-testid="canvas-surface"]') as HTMLElement | null;
    const zoom = Number(surface?.style.zoom) || 1;
    return {
      x: rect.left + segments[segments.length - 2] * zoom,
      y: rect.top + segments[segments.length - 1] * zoom
    };
  });

  expect(previewEnd).not.toBeNull();
  expect(Math.abs((previewEnd?.x || 0) - end.x)).toBeLessThan(3);
  expect(Math.abs((previewEnd?.y || 0) - end.y)).toBeLessThan(3);

  await window.evaluate(point => {
    globalThis.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        button: 0,
        buttons: 0,
        clientX: point.x,
        clientY: point.y,
        pointerId: 1,
        pointerType: 'mouse'
      })
    );
  }, end);
  await app.close();
});
