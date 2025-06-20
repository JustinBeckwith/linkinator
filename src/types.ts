export enum LinkState {
	OK = 'OK',
	BROKEN = 'BROKEN',
	SKIPPED = 'SKIPPED',
}

export type RetryInfo = {
	url: string;
	secondsUntilRetry: number;
	status: number;
};

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
};

export type CrawlResult = {
	passed: boolean;
	links: LinkResult[];
};
