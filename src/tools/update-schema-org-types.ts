import fs from 'node:fs/promises';

/**
 * When checking json-ld, we need to know which fields are URLs.
 * This function fetches the schema.org JSON-LD context and extracts the fields that are defined as URLs.
 */

const contextUrl = 'https://schema.org/docs/jsonldcontext.jsonld';

console.log('Fetching schema.org context...');
const res = await fetch(contextUrl);
const data = await res.json();
const context = data['@context'];
const urlFields = new Set();
for (const [key, value] of Object.entries(context)) {
	if (value && (value as Record<string, string>)['@type'] === '@id') {
		urlFields.add(key);
	}
}

await fs.writeFile(
	'src/schema-org-url-fields.json',
	JSON.stringify([...urlFields], null, 2),
);
console.log('Schema.org URL fields updated.');
