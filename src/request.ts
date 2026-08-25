import process from 'node:process';
import {
	Agent,
	EnvHttpProxyAgent,
	type RequestInit,
	fetch as undiciFetch,
} from 'undici';
import { drainStream } from './stream-utils.js';

export type HttpResponse = {
	status: number;
	headers: Record<string, string>;
	body?: ReadableStream;
	url?: string;
};

export type RequestResponse = HttpResponse & { redirectSkipped?: string };

export type RedirectTarget = {
	url: string;
	shouldSkip: boolean;
};

type ProcessRedirectTarget = (url: string) => Promise<RedirectTarget>;

type RequestOptions = {
	headers?: Record<string, string>;
	timeout?: number;
	signal?: AbortSignal;
	redirect: 'follow' | 'manual';
	allowInsecureCerts?: boolean;
	processRedirectTarget?: ProcessRedirectTarget;
};

const DEFAULT_HEADERS: Record<string, string> = {
	Accept:
		'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
	'Accept-Language': 'en-US,en;q=0.9',
	'Accept-Encoding': 'gzip, deflate, br',
	'Cache-Control': 'no-cache',
	Pragma: 'no-cache',
	'Sec-Fetch-Dest': 'document',
	'Sec-Fetch-Mode': 'navigate',
	'Sec-Fetch-Site': 'none',
	'Upgrade-Insecure-Requests': '1',
	'User-Agent': 'node',
};

const SENSITIVE_HEADERS = new Set([
	'authorization',
	'cookie',
	'proxy-authorization',
]);

let sharedInsecureAgent: Agent | undefined;
let sharedProxyAgent: EnvHttpProxyAgent | undefined;
let cachedProxyUrl: string | undefined;

/** Reset shared HTTP agents, primarily to isolate tests. */
export function resetSharedAgents(): void {
	sharedInsecureAgent = undefined;
	sharedProxyAgent = undefined;
	cachedProxyUrl = undefined;
}

/** Make an HTTP request, applying redirect policy when one is provided. */
export async function makeRequest(
	method: string,
	url: string,
	options: RequestOptions,
): Promise<RequestResponse> {
	let currentUrl = url;
	let currentHeaders = { ...DEFAULT_HEADERS, ...options.headers };
	const processRedirectTarget = options.processRedirectTarget;
	const timeoutSignal = options.timeout
		? AbortSignal.timeout(options.timeout)
		: undefined;
	const signal =
		options.signal && timeoutSignal
			? AbortSignal.any([options.signal, timeoutSignal])
			: (options.signal ?? timeoutSignal);

	for (let redirectCount = 0; ; redirectCount++) {
		const requestOptions: RequestInit = {
			method,
			headers: currentHeaders,
			redirect: processRedirectTarget ? 'manual' : options.redirect,
			signal,
		};
		const response = await fetchUrl(
			currentUrl,
			requestOptions,
			options.allowInsecureCerts,
		);
		const headers = Object.fromEntries(response.headers.entries());
		const result: HttpResponse = {
			status: response.status,
			headers,
			body: (response.body ?? undefined) as ReadableStream | undefined,
			url: processRedirectTarget ? currentUrl : response.url,
		};

		const location = headers.location;
		if (
			!processRedirectTarget ||
			!isFetchRedirectStatus(response.status) ||
			!location
		) {
			return result;
		}

		const resolvedTargetUrl = new URL(location, currentUrl).href;
		const target = await processRedirectTarget(resolvedTargetUrl);
		if (target.shouldSkip) {
			await drainStream(result.body);
			return { ...result, body: undefined, redirectSkipped: target.url };
		}
		if (redirectCount >= 20) {
			await drainStream(result.body);
			throw new TypeError('redirect count exceeded');
		}

		if (new URL(currentUrl).origin !== new URL(target.url).origin) {
			currentHeaders = stripSensitiveHeaders(currentHeaders);
		}
		await drainStream(result.body);
		currentUrl = target.url;
	}
}

async function fetchUrl(
	url: string,
	requestOptions: RequestInit,
	allowInsecureCerts?: boolean,
) {
	if (allowInsecureCerts) {
		return undiciFetch(url, {
			...requestOptions,
			dispatcher: getSharedInsecureAgent(),
		});
	}

	const proxyUrl = getProxyUrl();
	return proxyUrl
		? undiciFetch(url, {
				...requestOptions,
				dispatcher: getSharedProxyAgent(proxyUrl),
			})
		: undiciFetch(url, requestOptions);
}

function getProxyUrl(): string | undefined {
	const url =
		process.env.https_proxy ??
		process.env.HTTPS_PROXY ??
		process.env.http_proxy ??
		process.env.HTTP_PROXY;
	return url || undefined;
}

function getSharedProxyAgent(proxyUrl: string): EnvHttpProxyAgent {
	if (!sharedProxyAgent || cachedProxyUrl !== proxyUrl) {
		sharedProxyAgent = new EnvHttpProxyAgent({
			httpProxy: proxyUrl,
			httpsProxy: proxyUrl,
		});
		cachedProxyUrl = proxyUrl;
	}
	return sharedProxyAgent;
}

function getSharedInsecureAgent(): Agent {
	sharedInsecureAgent ??= new Agent({
		connect: { rejectUnauthorized: false },
		keepAliveTimeout: 30_000,
		keepAliveMaxTimeout: 60_000,
		connections: 100,
	});
	return sharedInsecureAgent;
}

function isFetchRedirectStatus(status: number): boolean {
	return [301, 302, 303, 307, 308].includes(status);
}

function stripSensitiveHeaders(
	headers: Record<string, string>,
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(headers).filter(
			([name]) => !SENSITIVE_HEADERS.has(name.toLowerCase()),
		),
	);
}
