import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const workspace = process.cwd();

function git(...args) {
	return execFileSync('git', args, {
		cwd: workspace,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
	}).trim();
}

function resolveBase() {
	if (process.argv[2]) {
		return process.argv[2];
	}
	if (process.env.COVERAGE_BASE) {
		return process.env.COVERAGE_BASE;
	}
	if (process.env.GITHUB_EVENT_NAME === 'push') {
		return 'HEAD^';
	}

	const branch = process.env.GITHUB_BASE_REF || 'main';
	try {
		return git('merge-base', 'HEAD', `origin/${branch}`);
	} catch {
		return 'HEAD^';
	}
}

function parseAddedLines(diff) {
	const files = new Map();
	let file;
	let newLine = 0;

	for (const line of diff.split('\n')) {
		if (line.startsWith('+++ b/')) {
			file = line.slice(6);
			if (file.startsWith('src/') && file.endsWith('.ts')) {
				files.set(file, new Set());
			} else {
				file = undefined;
			}
			continue;
		}

		const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
		if (hunk) {
			newLine = Number(hunk[1]);
			continue;
		}
		if (!file || line.startsWith('---')) {
			continue;
		}
		if (line.startsWith('+')) {
			files.get(file)?.add(newLine);
			newLine++;
		} else if (!line.startsWith('-')) {
			newLine++;
		}
	}

	return files;
}

const coveragePath = path.join(workspace, 'coverage', 'coverage-final.json');
if (!fs.existsSync(coveragePath)) {
	throw new Error(`Coverage data not found at ${coveragePath}`);
}

const base = resolveBase();
const addedLines = parseAddedLines(
	git('diff', '--unified=0', base, '--', 'src'),
);
const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
let failed = false;

for (const [relativeFile, lines] of addedLines) {
	const absoluteFile = path.join(workspace, relativeFile);
	const fileCoverage = coverage[absoluteFile];
	if (!fileCoverage) {
		console.error(`${relativeFile}: no coverage data found`);
		failed = true;
		continue;
	}

	const statements = Object.entries(fileCoverage.statementMap).filter(
		([, statement]) => lines.has(statement.start.line),
	);
	const functions = Object.entries(fileCoverage.fnMap).filter(([, fn]) =>
		lines.has(fn.loc.start.line),
	);
	const branches = Object.entries(fileCoverage.branchMap).filter(
		([, branch]) =>
			lines.has(branch.loc.start.line) ||
			branch.locations.some((location) => lines.has(location.start.line)),
	);

	const uncoveredStatements = statements
		.filter(([id]) => fileCoverage.s[id] === 0)
		.map(([, statement]) => statement.start.line);
	const uncoveredFunctions = functions
		.filter(([id]) => fileCoverage.f[id] === 0)
		.map(([, fn]) => fn.loc.start.line);
	const uncoveredBranches = branches.flatMap(([id, branch]) =>
		fileCoverage.b[id].flatMap((count, index) =>
			count === 0
				? [{ index, line: branch.locations[index]?.start.line ?? branch.loc.start.line }]
				: [],
		),
	);
	const branchCount = branches.reduce(
		(total, [id]) => total + fileCoverage.b[id].length,
		0,
	);

	console.log(
		`${relativeFile}: ` +
			`${statements.length - uncoveredStatements.length}/${statements.length} statements, ` +
			`${branchCount - uncoveredBranches.length}/${branchCount} branches, ` +
			`${functions.length - uncoveredFunctions.length}/${functions.length} functions`,
	);
	if (
		uncoveredStatements.length > 0 ||
		uncoveredBranches.length > 0 ||
		uncoveredFunctions.length > 0
	) {
		console.error(
			JSON.stringify({
				file: relativeFile,
				uncoveredStatements,
				uncoveredBranches,
				uncoveredFunctions,
			}),
		);
		failed = true;
	}
}

if (addedLines.size === 0) {
	console.log(`No changed production TypeScript files relative to ${base}.`);
} else if (!failed) {
	console.log(`Patch coverage is 100% relative to ${base}.`);
}

process.exitCode = failed ? 1 : 0;
