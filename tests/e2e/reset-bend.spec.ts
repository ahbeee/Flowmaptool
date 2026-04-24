import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('reset bend restores selected edge to automatic path', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();

  const createChild = async (parentId: string) => {
    const parent = window.getByTestId(`node-${parentId}`);
    await parent.click();
    await expect(parent).toHaveClass(/flow-node-selected/);
    await window.keyboard.press('Tab');
    await window.keyboard.press('Escape');
  };

  const selectEdge = async (edgeId: string) => {
    await window.getByTestId(`edge-path-${edgeId}`).evaluate(element => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await expect(window.locator('.edge-bend-handle')).toHaveCount(1);
  };

  const bendHandleCenter = async () => {
    const box = await window.locator('.edge-bend-handle').boundingBox();
    if (!box) throw new Error('edge bend handle not found');
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  const edgePathD = () => window.getByTestId('edge-path-e2').getAttribute('d');

  await createChild('n1');
  await createChild('n1');

  await selectEdge('e2');
  const automaticPath = await edgePathD();
  const resetButton = window.getByRole('button', { name: 'Reset Bend' });
  await expect(resetButton).toBeDisabled();

  const center = await bendHandleCenter();
  await window.mouse.move(center.x, center.y);
  await window.mouse.down();
  await window.mouse.move(center.x, center.y + 80);
  await window.mouse.up();

  await expect(resetButton).toBeEnabled();
  await expect.poll(edgePathD).not.toBe(automaticPath);

  await resetButton.click();

  await expect(resetButton).toBeDisabled();
  await expect.poll(edgePathD).toBe(automaticPath);

  await app.close();
});
