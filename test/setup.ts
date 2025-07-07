import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

export const server = setupServer();

// Global variable to track domains that should be ignored
let ignoredDomains: string[] = [];

// Helper function to temporarily ignore specific domains for tests that expect requests to fail
export function ignoreUnhandledRequests(domains: string[]) {
	ignoredDomains = domains;

	// Return a function to restore the original handler
	return () => {
		ignoredDomains = [];
	};
}

beforeAll(() => {
	server.listen({
		onUnhandledRequest: (req, print) => {
			const url = new URL(req.url);
			if (
				url.hostname === 'localhost' ||
				ignoredDomains.includes(url.hostname)
			) {
				return;
			}
			print.warning();
		},
	});
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
