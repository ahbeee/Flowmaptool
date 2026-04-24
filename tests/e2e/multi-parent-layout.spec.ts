import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('node moves to parent midpoint when connected by second parent and restores after edge delete', async () => {
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

  const n2AfterConnect = await window.getByTestId('node-n2').boundingBox();
  const n3AfterConnect = await window.getByTestId('node-n3').boundingBox();
  const n4AfterConnect = await window.getByTestId('node-n4').boundingBox();
  if (!n2AfterConnect || !n3AfterConnect || !n4AfterConnect) throw new Error('missing boxes after connect');

  const n2CenterY = n2AfterConnect.y + n2AfterConnect.height / 2;
  const n3CenterY = n3AfterConnect.y + n3AfterConnect.height / 2;
  const n4CenterY = n4AfterConnect.y + n4AfterConnect.height / 2;
  const parentMidY = (n2CenterY + n3CenterY) / 2;
  expect(Math.abs(n4CenterY - parentMidY)).toBeLessThanOrEqual(8);

  // e4 is the latest edge n3 -> n4
  await window.getByTestId('edge-path-e4').evaluate(element => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await window.keyboard.press('Delete');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(3);

  const n2AfterDelete = await window.getByTestId('node-n2').boundingBox();
  const n4AfterDelete = await window.getByTestId('node-n4').boundingBox();
  if (!n2AfterDelete || !n4AfterDelete) throw new Error('missing boxes after delete');
  const n2CenterYAfterDelete = n2AfterDelete.y + n2AfterDelete.height / 2;
  const n4CenterYAfterDelete = n4AfterDelete.y + n4AfterDelete.height / 2;

  expect(Math.abs(n4CenterYAfterDelete - n2CenterYAfterDelete)).toBeLessThanOrEqual(8);
  expect(Math.abs(n4CenterYAfterDelete - n4Before.y - n4Before.height / 2)).toBeLessThanOrEqual(20);

  await app.close();
});
