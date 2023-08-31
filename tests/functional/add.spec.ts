import { test, expect } from '@playwright/test';

import { add } from '../../src/index.js';

test.describe('add', () => {
	test('returns', async () => {
		expect(add(1, 2)).toBeDefined();
	});
	test('adds', async () => {
		expect(add(1, 2)).toBe(3);
	});
});
