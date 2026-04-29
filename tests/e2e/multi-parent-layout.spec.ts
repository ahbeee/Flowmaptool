import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('same-component manual parent edge does not reflow existing layout', async () => {
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

  // root -> n2, root -> n3, n2 -> n4
  await createChild('n1');
  await createChild('n1');
  await createChild('n2');

  const n2Before = await window.getByTestId('node-n2').boundingBox();
  const n3Before = await window.getByTestId('node-n3').boundingBox();
  const n4Before = await window.getByTestId('node-n4').boundingBox();
  if (!n2Before || !n3Before || !n4Before) throw new Error('missing boxes before connect');

  await connectByShiftClick('n3', 'n4');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(4);

  const n4AfterConnect = await window.getByTestId('node-n4').boundingBox();
  if (!n4AfterConnect) throw new Error('missing n4 box after connect');

  expect(Math.abs(n4AfterConnect.x - n4Before.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(n4AfterConnect.y - n4Before.y)).toBeLessThanOrEqual(2);

  // e4 is the latest edge n3 -> n4
  await window.getByTestId('edge-path-e4').evaluate(element => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await window.keyboard.press('Delete');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(3);

  const n4AfterDelete = await window.getByTestId('node-n4').boundingBox();
  if (!n4AfterDelete) throw new Error('missing n4 box after delete');
  expect(Math.abs(n4AfterDelete.x - n4Before.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(n4AfterDelete.y - n4Before.y)).toBeLessThanOrEqual(2);

  await app.close();
});
