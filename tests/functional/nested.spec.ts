import { test } from '@playwright/test';

test('1', () => {});

test.describe('a', () => {
	test('a-1', () => {});
	test.describe('a-a', () => {
		test('a-a-1', () => {});
		test('a-a-2', () => {});
	});
	test.describe('a-b', () => {
		test('a-b-1', () => {});
		test.describe('a-b-a', () => {
			test('a-b-a-1', () => {});
		});
	});
});

test.describe('b', () => {
	test('b-1', () => {});
	test('b-2', () => {});
	test.describe('b-a', () => {
		test('b-a-1', () => {});
		test.describe('b-a-a', () => {
			test('b-a-a-1', () => {});
			test('b-a-a-2', () => {});
		});
		test.describe('b-a-b', () => {
			test('b-a-b-1', () => {});
			test('b-a-b-2', () => {});
		});
	});
});
