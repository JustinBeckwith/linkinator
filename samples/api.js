import link from 'linkinator';

/**
 * This is a simple example of using the API to do a basic scan. You can
 * include a bunch of other parameters to customize the behavior.
 */
async function simple() {
	const results = await link.check({
		path: 'http://example.com',
	});

	// To see if all the links passed, you can check `passed`
	console.log(`Passed: ${results.passed}`);

	// Show the list of scanned links and their results
	console.log(results);

	// Example output:
	// {
	//   passed: true,
	//   links: [
	//     {
	//       url: 'http://example.com',
	//       status: 200,
	//       state: 'OK'
	//     },
	//     {
	//       url: 'http://www.iana.org/domains/example',
	//       status: 200,
	//       state: 'OK'
	//     }
	//   ]
	// }
}

/**
 * This more complex example shows how
 */
async function complex() {
	// Create a new `LinkChecker` that we'll use to run the scan.
	const checker = new link.LinkChecker();

	// Respond to the beginning of a new page being scanned
	checker.on('pagestart', (url) => {
		console.log(`Scanning ${url}`);
	});

	// After a page is scanned, check out the results!
	checker.on('link', (result) => {
		// Check the specific url that was scanned
		console.log(`  ${result.url}`);

		// How did the scan go?  Potential states are `BROKEN`, `OK`, and `SKIPPED`
		console.log(`  ${result.state}`);

		// What was the status code of the response?
		console.log(`  ${result.status}`);
	});

	// Go ahead and start the scan! As events occur, we will see them above.
	const result = await checker.check({
		path: 'http://example.com',
		// Port: 8673,
		// recurse?: true,
		// linksToSkip: [
		//   'https://jbeckwith.com/some/link',
		//   'http://example.com'
		// ]
	});

	// Check to see if the scan passed!
	console.log(result.passed ? 'PASSED :D' : 'FAILED :(');

	// How many links did we scan?
	console.log(`Scanned total of ${result.links.length} links!`);

	// The final result will contain the list of checked links, and the pass/fail
	const brokeLinksCount = result.links.filter((x) => x.state === 'BROKEN');
	console.log(`Detected ${brokeLinksCount.length} broken links.`);
}

await simple(); // Or, complex();
