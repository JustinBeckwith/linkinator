export enum LinkState {
	OK = 'OK',
	BROKEN = 'BROKEN',
	SKIPPED = 'SKIPPED',
}

export type RetryAfterHeaderInfo = {
	type: 'retry-after';
	url: string;
	status: number;
	secondsUntilRetry: number;
	retryAfterRaw: string;
};

export type RetryNoHeaderInfo = {
	type: 'retry-no-header';
	url: string;
	status: number;
	secondsUntilRetry: number;
	currentAttempt: number;
	maxAttempts: number;
};

export type RetryErrorInfo = {
	type: 'retry-error';
	url: string;
	status: number;
	secondsUntilRetry: number;
	currentAttempt: number;
	maxAttempts: number;
	jitter: number;
};

export type RetryInfo =
	| RetryAfterHeaderInfo
	| RetryNoHeaderInfo
	| RetryErrorInfo;

export type FailureDetails =
	| {
			cause: unknown;
			message: string;
	  }
	| {
			status: number;
			statusText: string;
			headers: { [k: string]: string };
			ok: boolean;
			url: string;
			body: ReadableStream | null;
	  };

export type LinkResult = {
	url: string;
	status?: number;
	state: LinkState;
	parent?: string;
	failureDetails?: Array<FailureDetails>;
	elementMetadata?: Record<string, string>;
};

export type CrawlResult = {
	passed: boolean;
	links: LinkResult[];
};
