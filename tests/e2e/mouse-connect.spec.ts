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
