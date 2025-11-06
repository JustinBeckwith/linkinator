import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, assert, beforeEach, describe, it } from 'vitest';
import { check, LinkState } from '../src/index.js';

describe('json-ld', () => {
	let mockAgent: MockAgent;
	let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;

	beforeEach(() => {
		originalDispatcher = getGlobalDispatcher();
		mockAgent = new MockAgent();
		setGlobalDispatcher(mockAgent);
	});

	afterEach(async () => {
		await mockAgent.close();
		setGlobalDispatcher(originalDispatcher);
	});

	it('should find links in JSON-LD scripts', async () => {
		const mockPool = mockAgent.get('https://example.invalid');
		mockPool
			.intercept({ path: '/photos/1x1/photo.jpg', method: 'HEAD' })
			.reply(200, '');
		mockPool
			.intercept({ path: '/photos/4x3/photo.jpg', method: 'HEAD' })
			.reply(200, '');
		mockPool.intercept({ path: '/johndoe', method: 'HEAD' }).reply(200, '');
		mockPool
			.intercept({ path: '/regular-link', method: 'HEAD' })
			.reply(200, '');
		const mockInvalidPool = mockAgent.get('http://example.invalid');
		mockInvalidPool
			.intercept({ path: '/photos/16x9/photo.jpg', method: 'HEAD' })
			.reply(404, '');
		const googleMockPool = mockAgent.get('https://example.invalid');
		googleMockPool
			.intercept({ path: '/logo.jpg', method: 'HEAD' })
			.reply(200, '');

		const results = await check({ path: 'test/fixtures/json-ld' });
		assert.strictEqual(results.links.length, 7);
		const brokenLinks = results.links.filter(
			(link) => link.state === LinkState.BROKEN,
		);
		assert.strictEqual(brokenLinks.length, 1);

		assert.strictEqual(
			brokenLinks[0].url,
			'http://example.invalid/photos/16x9/photo.jpg',
		);

		const okLinks = results.links.filter((link) => link.state === LinkState.OK);
		// 1 starting page + 4 good links in json-ld + 1 regular link
		assert.strictEqual(okLinks.length, 6);
	});
});
