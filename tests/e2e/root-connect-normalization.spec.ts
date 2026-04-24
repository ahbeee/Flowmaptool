import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('connecting a node to root normalizes to root as source', async () => {
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

  const connectByShiftClick = async (fromId: string, toId: string) => {
    await window.getByTestId(`node-${fromId}`).click();
    await window.getByTestId(`node-${toId}`).click({ modifiers: ['Shift'] });
  };

  await createChild('n1');
  await createChild('n1');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(2);

  await window.getByTestId('edge-path-e2').evaluate(element => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await window.keyboard.press('Delete');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(1);

  await connectByShiftClick('n3', 'n1');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(2);

  const rootBox = await window.getByTestId('node-n1').boundingBox();
  const dBox = await window.getByTestId('node-n3').boundingBox();
  if (!rootBox || !dBox) throw new Error('node boxes missing');
  expect(rootBox.x).toBeLessThan(dBox.x);

  await app.close();
});
