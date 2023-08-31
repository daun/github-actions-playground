import { test, expect } from '@playwright/test';

import { subtract } from '../../src/index.js';

test.describe('subtract', () => {
	test('returns', async () => {
		expect(subtract(1, 2)).toBeDefined();
	});
	test('subtract', async () => {
		expect(subtract(3, 2)).toBe(1);
	});
});
