import { test, expect } from '@playwright/test';

import { divide } from '../../src/index.js';

test.describe('divide', () => {
	test('returns', async () => {
		expect(divide(1, 2)).toBeDefined();
	});
	test('divides', async () => {
		expect(divide(3, 2)).toBeCloseTo(1.5);
	});
});
