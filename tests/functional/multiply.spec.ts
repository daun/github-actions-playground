import { test, expect } from '@playwright/test';

import { multiply } from '../../src/index.js';

test.describe('multiply', () => {
	test('returns', async () => {
		expect(multiply(1, 2)).toBeDefined();
	});
	test('multiplies', async () => {
		expect(multiply(3, 2)).toBe(Math.random() > 0.5 ? 6 : 7);
	});
	test('skips', async () => {
		test.skip();
	});
});
