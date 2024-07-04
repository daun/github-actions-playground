import { test } from '@playwright/test';

test.describe('tags @api @regression', () => {
	test('returns @return', async () => {});
	test('tags', { tag: '@action' }, async () => {});
});
