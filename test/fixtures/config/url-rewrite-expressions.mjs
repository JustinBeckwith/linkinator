export default {
	urlRewriteExpressions: [
		{
			pattern: /\/legacy-target$/,
			replacement: '/rewritten-target',
		},
	],
};
