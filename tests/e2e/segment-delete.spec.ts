import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('batch delete selected nodes removes related edges and keeps editor usable', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();
  const nodeLocator = window.locator('[data-testid^="node-"]');
  const edgeLocator = window.locator('[data-testid^="edge-path-"]');
  const createChild = async (parentId: string) => {
    const parent = window.getByTestId(`node-${parentId}`);
    await parent.click();
    await expect(parent).toHaveClass(/flow-node-selected/);
    await window.keyboard.press('Tab');
    await window.keyboard.press('Escape');
  };

  await createChild('n1'); // n2
  await createChild('n2'); // n3
  await createChild('n3'); // n4
  await createChild('n4'); // n5
  await expect(nodeLocator).toHaveCount(5);

  await window.getByTestId('node-n2').click();
  await window.getByTestId('node-n4').click({ modifiers: ['Control'] });
  await window.keyboard.press('Delete');

  await expect(nodeLocator).toHaveCount(3);
  await expect(edgeLocator).toHaveCount(0);

  await window.getByTestId('node-n1').click();
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');
  await expect(nodeLocator).toHaveCount(4);

  await app.close();
});
