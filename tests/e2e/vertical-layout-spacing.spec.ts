import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('vertical layout keeps complex branches from overlapping', async () => {
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

  // root -> n2, n3
  await createChild('n1');
  await createChild('n1');
  // n2 -> n4, n5; n3 -> n6, n7
  await createChild('n2');
  await createChild('n2');
  await createChild('n3');
  await createChild('n3');
  // n5 -> n8, n9; n7 -> n10, n11
  await createChild('n5');
  await createChild('n5');
  await createChild('n7');
  await createChild('n7');

  await window.getByTestId('canvas-surface').click({ position: { x: 5, y: 5 } });
  await window.getByLabel('Layout').selectOption('vertical');
  await expect(window.getByTestId('node-n11')).toBeVisible();

  const boxes = [];
  for (let index = 1; index <= 11; index += 1) {
    const box = await window.getByTestId(`node-n${index}`).boundingBox();
    if (!box) throw new Error(`node-n${index} missing`);
    boxes.push({ id: `n${index}`, ...box });
  }

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlaps =
        a.x < b.x + b.width - 2 &&
        a.x + a.width > b.x + 2 &&
        a.y < b.y + b.height - 2 &&
        a.y + a.height > b.y + 2;
      expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }

  await app.close();
});
