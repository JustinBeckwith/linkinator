import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

export const server = setupServer();

beforeAll(() => {
	server.listen({
		onUnhandledRequest: (req, print) => {
			const url = new URL(req.url);
			if (url.hostname === 'localhost') {
				return;
			}
			print.warning();
		},
	});
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
