export function invertedPromise() {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((innerResolve, innerReject) => {
		resolve = innerResolve;
		reject = innerReject;
	});
	return { promise, resolve, reject };
}
