#!/usr/bin/env node
import 'zx/globals';

/* eslint-disable */

// Following the guide at https://nodejs.org/api/single-executable-applications.html

const exe = 'linkinator';

switch (process.platform) {
	case 'win32': {
		await generateWindowsBuild();
		break;
	}

	case 'darwin': {
		await generateMacBuild();
		break;
	}

	default: {
		await generateLinuxBuild();
	}
}

async function generateWindowsBuild() {
	await $`node -e "require('fs').copyFileSync(process.execPath, '${exe}.exe')"`;
	await $`signtool remove /s ${exe}.exe`;
	await $`npx postject ${exe}.exe NODE_SEA_BLOB sea-prep.blob ^
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`;
	await $`signtool sign /fd SHA256 ${exe}.exe`;
}

async function generateMacBuild() {
	await $`cp $(command -v node) ${exe}`;
	await $`codesign --remove-signature ${exe}`;
	await $`npx postject hello NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
    --macho-segment-name NODE_SEA`;
	await $`codesign --sign - ${exe}`;
}

async function generateLinuxBuild() {
	await $`cp $(command -v node) ${exe}`;
	await $`npx postject ${exe} NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`;
}
