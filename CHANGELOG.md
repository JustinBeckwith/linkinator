# Changelog

## [7.5.3](https://github.com/JustinBeckwith/linkinator/compare/linkinator-v7.5.2...linkinator-v7.5.3) (2025-12-27)


### Bug Fixes

* include build/package.json in npm package ([#764](https://github.com/JustinBeckwith/linkinator/issues/764)) ([1f83f3b](https://github.com/JustinBeckwith/linkinator/commit/1f83f3bbf8553812879d48ce3c8b016964a75cbf))

## [7.5.2](https://github.com/JustinBeckwith/linkinator/compare/linkinator-v7.5.1...linkinator-v7.5.2) (2025-12-26)


### Bug Fixes

* exclude local static server from requireHttps enforcement ([#762](https://github.com/JustinBeckwith/linkinator/issues/762)) ([0805320](https://github.com/JustinBeckwith/linkinator/commit/0805320c24a703fc80468071338e352864ad0747))
* make --version flag work in compiled binaries ([#760](https://github.com/JustinBeckwith/linkinator/issues/760)) ([455fd37](https://github.com/JustinBeckwith/linkinator/commit/455fd373bc6fa7220ef51f75e44fdf9df6294edb))

## [7.5.1](https://github.com/JustinBeckwith/linkinator/compare/linkinator-v7.5.0...linkinator-v7.5.1) (2025-12-04)


### Bug Fixes

* **deps:** update dependency glob to v11 [security] ([#748](https://github.com/JustinBeckwith/linkinator/issues/748)) ([b9f6660](https://github.com/JustinBeckwith/linkinator/commit/b9f6660d6366963fc6a0a59d9a765817361d0490))
* **deps:** update dependency glob to v13 ([#751](https://github.com/JustinBeckwith/linkinator/issues/751)) ([de4f2df](https://github.com/JustinBeckwith/linkinator/commit/de4f2dff8219f7a23e770489783aaf7e656fac3a))
* **deps:** update dependency marked to v17 ([#744](https://github.com/JustinBeckwith/linkinator/issues/744)) ([57306c5](https://github.com/JustinBeckwith/linkinator/commit/57306c576993b6a84da54e92e0ec1e734847379d))
* handle unhandled promise rejections in retry behavior ([#754](https://github.com/JustinBeckwith/linkinator/issues/754)) ([#757](https://github.com/JustinBeckwith/linkinator/issues/757)) ([e16ce35](https://github.com/JustinBeckwith/linkinator/commit/e16ce3509008d47ec8075f7afeb06085952628d1))
* only report duplicate results for broken links ([#750](https://github.com/JustinBeckwith/linkinator/issues/750)) ([#755](https://github.com/JustinBeckwith/linkinator/issues/755)) ([6941006](https://github.com/JustinBeckwith/linkinator/commit/6941006b2f95ba4746c0c7670560b4bb2e9a4767))
* prevent port exhaustion by reusing HTTP agents ([#753](https://github.com/JustinBeckwith/linkinator/issues/753)) ([#756](https://github.com/JustinBeckwith/linkinator/issues/756)) ([a8f7605](https://github.com/JustinBeckwith/linkinator/commit/a8f7605b67d8b78877d07878431ddb2209de1a25))

## [7.5.0](https://github.com/JustinBeckwith/linkinator/compare/linkinator-v7.4.2...linkinator-v7.5.0) (2025-11-06)


### Features

* add support for scanning JSON-LD ([#742](https://github.com/JustinBeckwith/linkinator/issues/742)) ([6e82632](https://github.com/JustinBeckwith/linkinator/commit/6e82632286ed26a13a432b12674fa6151d25957b))

## [7.4.2](https://github.com/JustinBeckwith/linkinator/compare/linkinator-v7.4.1...linkinator-v7.4.2) (2025-11-04)


### Bug Fixes

* ensure --allow-insecure-certs works on native builds ([#740](https://github.com/JustinBeckwith/linkinator/issues/740)) ([c4d02ca](https://github.com/JustinBeckwith/linkinator/commit/c4d02caa359fc2d5f171b3ff4f7b7bd9bba11590))

## [7.4.1](https://github.com/JustinBeckwith/linkinator/compare/linkinator-v7.4.0...linkinator-v7.4.1) (2025-10-31)


### Bug Fixes

* add GitHub-style heading IDs for markdown fragment validation ([#735](https://github.com/JustinBeckwith/linkinator/issues/735)) ([9516653](https://github.com/JustinBeckwith/linkinator/commit/9516653362afdab825b3f2b0b752aea726bf8f97))

## [7.4.0](https://github.com/JustinBeckwith/linkinator/compare/linkinator-v7.3.0...linkinator-v7.4.0) (2025-10-29)


### Features

* add configurable status code handling ([#627](https://github.com/JustinBeckwith/linkinator/issues/627), [#718](https://github.com/JustinBeckwith/linkinator/issues/718)) ([#733](https://github.com/JustinBeckwith/linkinator/issues/733)) ([b5ef84c](https://github.com/JustinBeckwith/linkinator/commit/b5ef84c849d3adc7007c9b42d2cf634cefdb5565))


### Bug Fixes

* normalize base URLs for correct relative link resolution ([#374](https://github.com/JustinBeckwith/linkinator/issues/374)) ([#732](https://github.com/JustinBeckwith/linkinator/issues/732)) ([1b8c330](https://github.com/JustinBeckwith/linkinator/commit/1b8c33024ec2ae7aeac9d1c8c23c5fe67a893f35))
* replace emojis with Unicode symbols for Windows compatibility ([#730](https://github.com/JustinBeckwith/linkinator/issues/730)) ([321ff07](https://github.com/JustinBeckwith/linkinator/commit/321ff0741937fa384110009fa72168ba87db0b5d))

## [7.3.0](https://github.com/JustinBeckwith/linkinator/compare/linkinator-v7.2.0...linkinator-v7.3.0) (2025-10-24)


### Features

* add clean URLs support for extensionless links ([#727](https://github.com/JustinBeckwith/linkinator/issues/727)) ([7a622c6](https://github.com/JustinBeckwith/linkinator/commit/7a622c672e66ccb32233cdabe7c58aaab79805ca))
* add CSS URL extraction support ([#722](https://github.com/JustinBeckwith/linkinator/issues/722)) ([565c71d](https://github.com/JustinBeckwith/linkinator/commit/565c71df552063785e8cc0bdac73a336acf1482b))
* add fragment identifier validation ([#79](https://github.com/JustinBeckwith/linkinator/issues/79)) ([#723](https://github.com/JustinBeckwith/linkinator/issues/723)) ([1ac4526](https://github.com/JustinBeckwith/linkinator/commit/1ac452640b82ee032131db50ca140a0bd42d439a))
* add support for meta refresh redirects ([#719](https://github.com/JustinBeckwith/linkinator/issues/719)) ([86d7271](https://github.com/JustinBeckwith/linkinator/commit/86d72714cde797ba232a2c7a0997948d47a60a7a))


### Bug Fixes

* remove default browser User-Agent to prevent redirect loops ([#721](https://github.com/JustinBeckwith/linkinator/issues/721)) ([811a833](https://github.com/JustinBeckwith/linkinator/commit/811a833ac87f26b7cdf2cb80d89d9ccd840f4aa9))
* skip fragment validation for non-2xx responses and soft 404s ([#726](https://github.com/JustinBeckwith/linkinator/issues/726)) ([7cd2b49](https://github.com/JustinBeckwith/linkinator/commit/7cd2b4934b32b0ce230c8fb7d55853a4159b7d31))

## [7.2.0](https://github.com/JustinBeckwith/linkinator/compare/linkinator-v7.1.3...linkinator-v7.2.0) (2025-10-20)


### Features

* add --allow-insecure-certs flag for local development ([#716](https://github.com/JustinBeckwith/linkinator/issues/716)) ([6aa769c](https://github.com/JustinBeckwith/linkinator/commit/6aa769c77e7d66f408278acd84a9510629e37dd5))
* add --require-https flag for HTTPS enforcement ([#715](https://github.com/JustinBeckwith/linkinator/issues/715)) ([439451f](https://github.com/JustinBeckwith/linkinator/commit/439451f8ceb930807c1e10a2fdb4539e2ef42b1e))
* add support for custom HTTP headers ([#711](https://github.com/JustinBeckwith/linkinator/issues/711)) ([14f4ebf](https://github.com/JustinBeckwith/linkinator/commit/14f4ebf5f31e67ab6e7dfcdbd6187969f4a2b158))
* handle 429s without retry-after header as error ([#674](https://github.com/JustinBeckwith/linkinator/issues/674)) ([9280037](https://github.com/JustinBeckwith/linkinator/commit/92800372567767c45bcfa406e7f5d7e03fb6eed9))
* introduce flag for managing redirects ([#712](https://github.com/JustinBeckwith/linkinator/issues/712)) ([27824d4](https://github.com/JustinBeckwith/linkinator/commit/27824d451c1c4f9d1dfe822809474539c72c1a5e))
* support non-standard retry-after header formats ([#713](https://github.com/JustinBeckwith/linkinator/issues/713)) ([8f9ca39](https://github.com/JustinBeckwith/linkinator/commit/8f9ca39f1a1b967670b6a19f4abc75f85570925a))


### Bug Fixes

* address LinkedIn and Cloudflare bot protection as skipped ([#709](https://github.com/JustinBeckwith/linkinator/issues/709)) ([bc08e2b](https://github.com/JustinBeckwith/linkinator/commit/bc08e2bad2b27768af2bef16fe1c13e28e902d8b))
* preserve query parameters in directory redirects ([#714](https://github.com/JustinBeckwith/linkinator/issues/714)) ([689c20f](https://github.com/JustinBeckwith/linkinator/commit/689c20fe119975e2726bb926be96a1a50152bae0))

## [7.1.3](https://github.com/JustinBeckwith/linkinator/compare/linkinator-v7.1.2...linkinator-v7.1.3) (2025-10-05)

### release

* cut 7.0 release ([#687](https://github.com/JustinBeckwith/linkinator/issues/687)) ([c39b0f0](https://github.com/JustinBeckwith/linkinator/commit/c39b0f07f5f3010385e48870b00feb877a76230a))

### Features

* accept globs for paths ([#199](https://github.com/JustinBeckwith/linkinator/issues/199)) ([b47f4b6](https://github.com/JustinBeckwith/linkinator/commit/b47f4b6827c6af6aa4bdd1110f4d08a5383bacc0))
* add --server-root flag ([#191](https://github.com/JustinBeckwith/linkinator/issues/191)) ([bae9d38](https://github.com/JustinBeckwith/linkinator/commit/bae9d3899f861b1db6af3f4d16fdda3d5e80cbcb))
* add `filter` function as an option to linkinator.check() ([#120](https://github.com/JustinBeckwith/linkinator/issues/120)) ([8240159](https://github.com/JustinBeckwith/linkinator/commit/82401590f7032d35d3b70174079f53b7b4b54c89))
* add a --format flag to allow output in json or csv ([#54](https://github.com/JustinBeckwith/linkinator/issues/54)) ([fdb2311](https://github.com/JustinBeckwith/linkinator/commit/fdb2311d85be8c84cc5980d1fce09a1146c8e0be))
* add basic support for markdown ([#188](https://github.com/JustinBeckwith/linkinator/issues/188)) ([524f600](https://github.com/JustinBeckwith/linkinator/commit/524f600b0d2f44af42c34df28d11ed00f089a30e))
* add option for setting user agent ([#612](https://github.com/JustinBeckwith/linkinator/issues/612)) ([929caa7](https://github.com/JustinBeckwith/linkinator/commit/929caa7e776ed22393a2437364d502925322563e))
* add retry-errors option ([#354](https://github.com/JustinBeckwith/linkinator/issues/354)) ([2ca5a36](https://github.com/JustinBeckwith/linkinator/commit/2ca5a36e2cc2d0dd3e7839cd3ad59857c8981de1))
* add srcset attribute support ([#51](https://github.com/JustinBeckwith/linkinator/issues/51)) ([3569d51](https://github.com/JustinBeckwith/linkinator/commit/3569d51002a20b10e5143bdbc22de0a690302f50))
* add support for config files ([#74](https://github.com/JustinBeckwith/linkinator/issues/74)) ([2c118b3](https://github.com/JustinBeckwith/linkinator/commit/2c118b329d5b0148e129a5d2072010df6731ba04))
* add support for multiple paths ([#194](https://github.com/JustinBeckwith/linkinator/issues/194)) ([e70dff6](https://github.com/JustinBeckwith/linkinator/commit/e70dff6b36793f8ec056ad9c0f44d6f7faab0af0))
* add support for url rewrites ([#317](https://github.com/JustinBeckwith/linkinator/issues/317)) ([2f1b5b1](https://github.com/JustinBeckwith/linkinator/commit/2f1b5b1a83d251c2765280fc4e0a4a72824223d4))
* add support for xhtml ([#93](https://github.com/JustinBeckwith/linkinator/issues/93)) ([08084de](https://github.com/JustinBeckwith/linkinator/commit/08084de12a49e64af858bf72ab37acb7b6a401c4))
* add timeout config option ([#168](https://github.com/JustinBeckwith/linkinator/issues/168)) ([2f3a6d3](https://github.com/JustinBeckwith/linkinator/commit/2f3a6d3527d4c85cdd09c9e6b6f6d86e7da793de))
* add verbosity flag to CLI ([#214](https://github.com/JustinBeckwith/linkinator/issues/214)) ([d20cff5](https://github.com/JustinBeckwith/linkinator/commit/d20cff50e4cf7c09ece7fa6d7345ae66d9ce3dec))
* allow --skip to be defined multiple times ([#399](https://github.com/JustinBeckwith/linkinator/issues/399)) ([5ca5a46](https://github.com/JustinBeckwith/linkinator/commit/5ca5a461508e688de12e5ae6b4cfb6565f832ebf))
* auto-enable markdown parsing when in path ([#200](https://github.com/JustinBeckwith/linkinator/issues/200)) ([c40be4b](https://github.com/JustinBeckwith/linkinator/commit/c40be4b5827a8a33bcf29a4235d3b2f4ef2521c3))
* **cli:** add silent flag ([#58](https://github.com/JustinBeckwith/linkinator/issues/58)) ([10d6fb1](https://github.com/JustinBeckwith/linkinator/commit/10d6fb1353b499adbd2fae3cfcc61bc0b119b3ac))
* **Config:** Support for Javascript based config files ([#516](https://github.com/JustinBeckwith/linkinator/issues/516)) ([1013780](https://github.com/JustinBeckwith/linkinator/commit/10137807345359cc2d746ffd992c3ade97905356))
* convert to es modules, drop node 10 ([#359](https://github.com/JustinBeckwith/linkinator/issues/359)) ([efee299](https://github.com/JustinBeckwith/linkinator/commit/efee299ab8a805accef751eecf8538915a4e7783))
* create new release with notes ([#508](https://github.com/JustinBeckwith/linkinator/issues/508)) ([2cab633](https://github.com/JustinBeckwith/linkinator/commit/2cab633c9659eb10794a4bac06f8b0acdc3e2c0c))
* distribute bundled binaries ([#204](https://github.com/JustinBeckwith/linkinator/issues/204)) ([8d8472a](https://github.com/JustinBeckwith/linkinator/commit/8d8472a551e2c66c11c5990147d5604bbdc565d4))
* drop support for node 18 ([#670](https://github.com/JustinBeckwith/linkinator/issues/670)) ([25711d9](https://github.com/JustinBeckwith/linkinator/commit/25711d934a6aa881590910d859f2b5936164ebae))
* enable concurrent requests ([#101](https://github.com/JustinBeckwith/linkinator/issues/101)) ([9c3d184](https://github.com/JustinBeckwith/linkinator/commit/9c3d18425af2f8bc677e9cec5a7f822b014b68e9))
* exponential backoff ([#355](https://github.com/JustinBeckwith/linkinator/issues/355)) ([3f24ea6](https://github.com/JustinBeckwith/linkinator/commit/3f24ea60dbf45699ed007912046f297db6213293))
* expose error details when verbosity=DEBUG ([#215](https://github.com/JustinBeckwith/linkinator/issues/215)) ([cf29469](https://github.com/JustinBeckwith/linkinator/commit/cf2946949cd56e80848bb1e85147e452d8de69ff))
* handle cloudflare bot protection ([#686](https://github.com/JustinBeckwith/linkinator/issues/686)) ([e59fcd8](https://github.com/JustinBeckwith/linkinator/commit/e59fcd8abd6d572b4477d7d2702bad8856149216))
* introduce retry-after detection ([#221](https://github.com/JustinBeckwith/linkinator/issues/221)) ([cebea21](https://github.com/JustinBeckwith/linkinator/commit/cebea2190332c4befb8d26a0a0a1e96eb7eaf897))
* re-enable binary releases ([#697](https://github.com/JustinBeckwith/linkinator/issues/697)) ([f083dd9](https://github.com/JustinBeckwith/linkinator/commit/f083dd9f04780524c4668338417e5e683a1c52b1))
* release 7.0 ([#689](https://github.com/JustinBeckwith/linkinator/issues/689)) ([45121ca](https://github.com/JustinBeckwith/linkinator/commit/45121cab03ade9e4e6d7fd7fbf9ec6877dd198f5))
* release 7.0 ([#690](https://github.com/JustinBeckwith/linkinator/issues/690)) ([839f3b8](https://github.com/JustinBeckwith/linkinator/commit/839f3b8c6217615fc28c9d05a2fe759c93e78241))
* release 7.0 actually ([#688](https://github.com/JustinBeckwith/linkinator/issues/688)) ([223b5f2](https://github.com/JustinBeckwith/linkinator/commit/223b5f206066d97d37b20c4e42eae9935db7f64c))
* require node.js 16 and up ([#550](https://github.com/JustinBeckwith/linkinator/issues/550)) ([4310692](https://github.com/JustinBeckwith/linkinator/commit/431069291a200c336f58fe4683709182bfde3917))
* require node.js 16 and up ([#551](https://github.com/JustinBeckwith/linkinator/issues/551)) ([4d682bf](https://github.com/JustinBeckwith/linkinator/commit/4d682bf477321054cfa633354be365518f1f1d22))
* scan all href, src, or other valid url attrs ([#25](https://github.com/JustinBeckwith/linkinator/issues/25)) ([ddf1fa4](https://github.com/JustinBeckwith/linkinator/commit/ddf1fa42ee8449b2b90051779d76eaf5c26ec835))
* scan opengraph and twittercard style meta links ([#217](https://github.com/JustinBeckwith/linkinator/issues/217)) ([a8c0a43](https://github.com/JustinBeckwith/linkinator/commit/a8c0a431088bda16811bb2267746e72c92955191))
* Send requests with human User-Agent header to reduce false positives. ([#134](https://github.com/JustinBeckwith/linkinator/issues/134)) ([9a32354](https://github.com/JustinBeckwith/linkinator/commit/9a32354f8769c5434fb1910b619395b2a4f9a7a9))
* support directory listings ([#225](https://github.com/JustinBeckwith/linkinator/issues/225)) ([39cf9d2](https://github.com/JustinBeckwith/linkinator/commit/39cf9d2743a83b467df05264601407000a17598b))


### Bug Fixes

* add caching to avoid cycles ([4d130d2](https://github.com/JustinBeckwith/linkinator/commit/4d130d259309ff4fd1ae98a942d95f5f70380f36))
* add cleanup setInterval() ([#358](https://github.com/JustinBeckwith/linkinator/issues/358)) ([39a8da2](https://github.com/JustinBeckwith/linkinator/commit/39a8da26ddea8edb787a6bc0ea9ff935e03224cb))
* add declaration true to compilerOptions to generate d.ts files ([#576](https://github.com/JustinBeckwith/linkinator/issues/576)) ([b806665](https://github.com/JustinBeckwith/linkinator/commit/b8066657c492d15773f90dd32d29365067e1d8f6))
* add try/catch for malformed links ([#50](https://github.com/JustinBeckwith/linkinator/issues/50)) ([477d749](https://github.com/JustinBeckwith/linkinator/commit/477d749cafb0d28ed1cc50a68d74ac497d361dbc))
* address srcset parsing with multiple spaces ([#512](https://github.com/JustinBeckwith/linkinator/issues/512)) ([fefb5b6](https://github.com/JustinBeckwith/linkinator/commit/fefb5b6734fc4ab335793358c5f491338ecbeb90))
* allow server root with trailing slash ([#370](https://github.com/JustinBeckwith/linkinator/issues/370)) ([8adf6b0](https://github.com/JustinBeckwith/linkinator/commit/8adf6b025fda250e38461f1cdad40fe08c3b3b7c))
* allow skip to be defined as an array ([#222](https://github.com/JustinBeckwith/linkinator/issues/222)) ([c752724](https://github.com/JustinBeckwith/linkinator/commit/c752724c25552ee1d1d5f78a5aa8336b4486c818))
* allow system to generate random port when desired ([#319](https://github.com/JustinBeckwith/linkinator/issues/319)) ([#328](https://github.com/JustinBeckwith/linkinator/issues/328)) ([7b9d493](https://github.com/JustinBeckwith/linkinator/commit/7b9d4936b09a56a8e130de2a70ca17dea3feb41b))
* always send custom User-Agent ([#210](https://github.com/JustinBeckwith/linkinator/issues/210)) ([7c84936](https://github.com/JustinBeckwith/linkinator/commit/7c8493620baa6de0fded745ccddf9e47273077e1))
* bug where it would fail urls that were valid ([#159](https://github.com/JustinBeckwith/linkinator/issues/159)) ([2f5599b](https://github.com/JustinBeckwith/linkinator/commit/2f5599bd50057b28461e0c4c46816fdb4eeb1455))
* bump dependencies ([#94](https://github.com/JustinBeckwith/linkinator/issues/94)) ([f651772](https://github.com/JustinBeckwith/linkinator/commit/f651772ddbdead0752589cf8a150e9b4d0d89a5d))
* calc relative paths based on current url ([#42](https://github.com/JustinBeckwith/linkinator/issues/42)) ([56a74e8](https://github.com/JustinBeckwith/linkinator/commit/56a74e8f5d4acbcbe794cec7a4d07a89fc8aaa6b))
* **cli:** load linkinator.config.json by default ([#611](https://github.com/JustinBeckwith/linkinator/issues/611)) ([0aea0f1](https://github.com/JustinBeckwith/linkinator/commit/0aea0f1db7a0f7408c356ff80bbd00a6f1514216))
* configure OIDC publishing, attempt 2 ([#702](https://github.com/JustinBeckwith/linkinator/issues/702)) ([7b6f64e](https://github.com/JustinBeckwith/linkinator/commit/7b6f64eb3437d72f33c640dc4f5c59b9bdebb481))
* decode path parts in local web server ([#369](https://github.com/JustinBeckwith/linkinator/issues/369)) ([4696a0c](https://github.com/JustinBeckwith/linkinator/commit/4696a0c38c341b178ed815f47371fca955979feb))
* **deps:** revert back to marked 13 ([#665](https://github.com/JustinBeckwith/linkinator/issues/665)) ([ddb7f92](https://github.com/JustinBeckwith/linkinator/commit/ddb7f928f3d628b3fee6c5bdabbb4556f4cbb26d))
* **deps:** update dependency chalk to v3 ([#100](https://github.com/JustinBeckwith/linkinator/issues/100)) ([407684f](https://github.com/JustinBeckwith/linkinator/commit/407684f8447c8d04ded04c81d6e1863b39b83d4f))
* **deps:** update dependency chalk to v4 ([#162](https://github.com/JustinBeckwith/linkinator/issues/162)) ([9c26c5a](https://github.com/JustinBeckwith/linkinator/commit/9c26c5aedbb25f099e863e579d52f4661d396949))
* **deps:** update dependency chalk to v5 ([#362](https://github.com/JustinBeckwith/linkinator/issues/362)) ([4b17a8d](https://github.com/JustinBeckwith/linkinator/commit/4b17a8d87b649eaf813428f8ee6955e1d21dae4f))
* **deps:** update dependency ecstatic to v4 ([#52](https://github.com/JustinBeckwith/linkinator/issues/52)) ([35362db](https://github.com/JustinBeckwith/linkinator/commit/35362db176acebbaaf9cf2d15d4b6569a3f6372d))
* **deps:** update dependency gaxios to v2 ([#56](https://github.com/JustinBeckwith/linkinator/issues/56)) ([343fe12](https://github.com/JustinBeckwith/linkinator/commit/343fe122018865cc07086020cd5f09fae8ad79aa))
* **deps:** update dependency gaxios to v3 ([#157](https://github.com/JustinBeckwith/linkinator/issues/157)) ([d27cbfb](https://github.com/JustinBeckwith/linkinator/commit/d27cbfb1fc6582d7bb46e7c1ed2238cb04cc7d33))
* **deps:** update dependency gaxios to v4 ([#185](https://github.com/JustinBeckwith/linkinator/issues/185)) ([c915959](https://github.com/JustinBeckwith/linkinator/commit/c915959529247b1177baf975a04a3bc0ef8cca72))
* **deps:** update dependency gaxios to v5 ([#391](https://github.com/JustinBeckwith/linkinator/issues/391)) ([48af50e](https://github.com/JustinBeckwith/linkinator/commit/48af50e787731204aeb7eff41325c62291311e45))
* **deps:** update dependency htmlparser2 to v9 ([#547](https://github.com/JustinBeckwith/linkinator/issues/547)) ([1a58441](https://github.com/JustinBeckwith/linkinator/commit/1a5844187f3db7c823d0be2f9e7c01b8afdb0d02))
* **deps:** update dependency jsonexport to v3 ([#170](https://github.com/JustinBeckwith/linkinator/issues/170)) ([f7c6b3a](https://github.com/JustinBeckwith/linkinator/commit/f7c6b3aa516d613276d02161a69f587b9d6b6340))
* **deps:** update dependency marked to v10 ([#578](https://github.com/JustinBeckwith/linkinator/issues/578)) ([9abb602](https://github.com/JustinBeckwith/linkinator/commit/9abb602710de474115f22016595817fe177d81b9))
* **deps:** update dependency marked to v13 ([#606](https://github.com/JustinBeckwith/linkinator/issues/606)) ([5d4e747](https://github.com/JustinBeckwith/linkinator/commit/5d4e747132e4536f384973679ee71bd6eb88e41f))
* **deps:** update dependency marked to v16 ([#660](https://github.com/JustinBeckwith/linkinator/issues/660)) ([cb2dadb](https://github.com/JustinBeckwith/linkinator/commit/cb2dadbd8cf2dcf852b34ec2e2d5d1dca4d1e4c5))
* **deps:** update dependency marked to v2 [security] ([#271](https://github.com/JustinBeckwith/linkinator/issues/271)) ([f9c13e9](https://github.com/JustinBeckwith/linkinator/commit/f9c13e9ba7daaa60b8400774468db36b4cc8ff02))
* **deps:** update dependency meow to v13 ([#584](https://github.com/JustinBeckwith/linkinator/issues/584)) ([c50b02f](https://github.com/JustinBeckwith/linkinator/commit/c50b02f562d63234d4d6dcc4f683c4cda3630495))
* **deps:** update dependency meow to v6 ([#125](https://github.com/JustinBeckwith/linkinator/issues/125)) ([3bd911c](https://github.com/JustinBeckwith/linkinator/commit/3bd911ca2f0cefa04dfc770e484cb36a2b0c1bf9))
* **deps:** update dependency meow to v7 ([#169](https://github.com/JustinBeckwith/linkinator/issues/169)) ([a6ed6f0](https://github.com/JustinBeckwith/linkinator/commit/a6ed6f0ebb5207329296b78588a379851b984ced))
* **deps:** update dependency meow to v8 ([#186](https://github.com/JustinBeckwith/linkinator/issues/186)) ([e23c0dd](https://github.com/JustinBeckwith/linkinator/commit/e23c0dd3094ce2402ab61a7cc40c6b2bf960fbed))
* **deps:** update dependency meow to v9 ([#232](https://github.com/JustinBeckwith/linkinator/issues/232)) ([6374c60](https://github.com/JustinBeckwith/linkinator/commit/6374c60af45148971a04eebc38b56ad25f6e032e))
* **deps:** update dependency mime to v3 ([#351](https://github.com/JustinBeckwith/linkinator/issues/351)) ([e51c8a8](https://github.com/JustinBeckwith/linkinator/commit/e51c8a8580ad34f37426dba0f1e1e810269959ba))
* **deps:** update dependency update-notifier to v3 ([#65](https://github.com/JustinBeckwith/linkinator/issues/65)) ([4c44706](https://github.com/JustinBeckwith/linkinator/commit/4c4470632ea86aa590b777bd18222acf1f31e886))
* **deps:** update dependency update-notifier to v4 ([#126](https://github.com/JustinBeckwith/linkinator/issues/126)) ([6f1ecdb](https://github.com/JustinBeckwith/linkinator/commit/6f1ecdbfb1b7bf9f3d1f173a01cc7b9861bf521d))
* **deps:** update dependency update-notifier to v5 ([#181](https://github.com/JustinBeckwith/linkinator/issues/181)) ([e5b1aca](https://github.com/JustinBeckwith/linkinator/commit/e5b1acab043187dd102a788a1ecd56b9a37bef3e))
* **deps:** update to the latest version of cheerio ([#316](https://github.com/JustinBeckwith/linkinator/issues/316)) ([999fca3](https://github.com/JustinBeckwith/linkinator/commit/999fca386c4e8853a613c06f2069cd76cc282009))
* **deps:** upgrade marked to v7 ([#564](https://github.com/JustinBeckwith/linkinator/issues/564)) ([07013cc](https://github.com/JustinBeckwith/linkinator/commit/07013cc91088ec436c71bab2db4b8857ff0fc864))
* **deps:** upgrade node-glob to v8 ([#397](https://github.com/JustinBeckwith/linkinator/issues/397)) ([d334dc6](https://github.com/JustinBeckwith/linkinator/commit/d334dc6734cd7c2b73d7ed3dea0550a6c3072ad5))
* **deps:** upgrade to cheerio 1.0.0-rc.5 ([#229](https://github.com/JustinBeckwith/linkinator/issues/229)) ([936af89](https://github.com/JustinBeckwith/linkinator/commit/936af89c1bf480d2957744eec68372599fd4ff59))
* **deps:** upgrade to glob 9.x ([#542](https://github.com/JustinBeckwith/linkinator/issues/542)) ([18780cb](https://github.com/JustinBeckwith/linkinator/commit/18780cbf6731f4064dd3b01e25db312cdac8565f))
* **deps:** upgrade to htmlparser10 ([#661](https://github.com/JustinBeckwith/linkinator/issues/661)) ([8f366fd](https://github.com/JustinBeckwith/linkinator/commit/8f366fdac887eac0dcd1a3bbbf2249b2dfd92ec8))
* **deps:** upgrade to htmlparser2 v8.0.1 ([#396](https://github.com/JustinBeckwith/linkinator/issues/396)) ([ba3b9a8](https://github.com/JustinBeckwith/linkinator/commit/ba3b9a8a9b19d39af6ed91790135e833b80c1eb6))
* **deps:** upgrade to marked 16 ([#671](https://github.com/JustinBeckwith/linkinator/issues/671)) ([2dd258b](https://github.com/JustinBeckwith/linkinator/commit/2dd258b4e71558a08bf71fbc6558defd2138ee47))
* **deps:** upgrade to marked v12 ([#603](https://github.com/JustinBeckwith/linkinator/issues/603)) ([862d89e](https://github.com/JustinBeckwith/linkinator/commit/862d89ef1a4b7257eb1076fc4c1a5830060107bd))
* **deps:** upgrade to meow 12.x ([#549](https://github.com/JustinBeckwith/linkinator/issues/549)) ([03417c4](https://github.com/JustinBeckwith/linkinator/commit/03417c4d6a300e9f08f184ccf839e74005e5d03f))
* **deps:** upgrade to meow 14 ([#683](https://github.com/JustinBeckwith/linkinator/issues/683)) ([291cbc0](https://github.com/JustinBeckwith/linkinator/commit/291cbc006bc8412b01f24831567b9145f7949db1))
* **deps:** upgrade to the latest meow ([#530](https://github.com/JustinBeckwith/linkinator/issues/530)) ([e3d929b](https://github.com/JustinBeckwith/linkinator/commit/e3d929bbda79d28fb46d20c04a2a6f9a9bce6f5c))
* do not crash on unresolved domain ([#22](https://github.com/JustinBeckwith/linkinator/issues/22)) ([629b83c](https://github.com/JustinBeckwith/linkinator/commit/629b83cf7d4a4d4cec4301f4e888e75709cd72a8))
* do not follow data URIs ([#98](https://github.com/JustinBeckwith/linkinator/issues/98)) ([f8eefcb](https://github.com/JustinBeckwith/linkinator/commit/f8eefcb1e53570a2d0f9d8e22f14030a73062c47))
* do not follow irc links ([#97](https://github.com/JustinBeckwith/linkinator/issues/97)) ([e55edb1](https://github.com/JustinBeckwith/linkinator/commit/e55edb113d2167d71bf4b64e7ed648dd33a0e6d4))
* do not include skipped links in the final link count ([#277](https://github.com/JustinBeckwith/linkinator/issues/277)) ([ea89b42](https://github.com/JustinBeckwith/linkinator/commit/ea89b421e1ddabdfd00263800e85ef7a3a2020d8))
* **docs:** fix spelling errors ([#109](https://github.com/JustinBeckwith/linkinator/issues/109)) ([1d10a00](https://github.com/JustinBeckwith/linkinator/commit/1d10a00475789044ec312fda12b87649d8714530))
* drop CSV quotes when not needed ([#692](https://github.com/JustinBeckwith/linkinator/issues/692)) ([0109d35](https://github.com/JustinBeckwith/linkinator/commit/0109d356009c05c6b287e28ea1e91abbce4c77c2))
* ensure cli process exits ([#698](https://github.com/JustinBeckwith/linkinator/issues/698)) ([6b365ea](https://github.com/JustinBeckwith/linkinator/commit/6b365ead09849b0b205d39d765fd84455815e1ff))
* ensure verbosity flag is enabled for config ([#266](https://github.com/JustinBeckwith/linkinator/issues/266)) ([668aad6](https://github.com/JustinBeckwith/linkinator/commit/668aad64d77809366145e619ef24d8c69ee5430b))
* export getConfig from index ([#371](https://github.com/JustinBeckwith/linkinator/issues/371)) ([0bc0355](https://github.com/JustinBeckwith/linkinator/commit/0bc0355c7e2ea457f247e6b52d1577b8c4ecb3a1))
* export getConfig from index ([#626](https://github.com/JustinBeckwith/linkinator/issues/626)) ([ba65cf0](https://github.com/JustinBeckwith/linkinator/commit/ba65cf0b26b5382bc69d4d60388f121599e2c4ad))
* follow verbosity rules for JSON and CSV ([#216](https://github.com/JustinBeckwith/linkinator/issues/216)) ([9eb5590](https://github.com/JustinBeckwith/linkinator/commit/9eb5590137ce6886915d1675c3e5ba921da9bc17))
* get the tests passing ([#17](https://github.com/JustinBeckwith/linkinator/issues/17)) ([e2faf3f](https://github.com/JustinBeckwith/linkinator/commit/e2faf3fb85cef9bc9d84053ed3143e902e22bc37))
* handle base correctly ([#114](https://github.com/JustinBeckwith/linkinator/issues/114)) ([9813a61](https://github.com/JustinBeckwith/linkinator/commit/9813a61ad31a413fad621193241d5efd34044cbe))
* handle querystring parameters in path ([#276](https://github.com/JustinBeckwith/linkinator/issues/276)) ([245b3bd](https://github.com/JustinBeckwith/linkinator/commit/245b3bd4ea7ad0acdab6f62141a28519608c511a))
* handle trailing slash on redirects ([#699](https://github.com/JustinBeckwith/linkinator/issues/699)) ([5f62d75](https://github.com/JustinBeckwith/linkinator/commit/5f62d752cef61894cd9963b278f8734c86ab9666))
* hide links with no results in silent mode ([#102](https://github.com/JustinBeckwith/linkinator/issues/102)) ([164a074](https://github.com/JustinBeckwith/linkinator/commit/164a074b58a31f3e4bf30ed23694fe615df84621))
* ignore all non-http[s] links ([#111](https://github.com/JustinBeckwith/linkinator/issues/111)) ([2f28114](https://github.com/JustinBeckwith/linkinator/commit/2f281142106502157f694ca26db0db13d9e71617))
* ignore prefetch and connect for link ([#145](https://github.com/JustinBeckwith/linkinator/issues/145)) ([154eb2b](https://github.com/JustinBeckwith/linkinator/commit/154eb2b6c3ac8dab8f55e7d05566ad7aff1e5d9a))
* improve the output style ([a3ee71d](https://github.com/JustinBeckwith/linkinator/commit/a3ee71d176a2cd8533a222649d413843e63ee88b))
* JSON stringify failure details for CSV ([#613](https://github.com/JustinBeckwith/linkinator/issues/613)) ([13ab5b0](https://github.com/JustinBeckwith/linkinator/commit/13ab5b0caf3dc8916ce4de80203e54104e144a6f))
* map paths in results back to filesystem ([#231](https://github.com/JustinBeckwith/linkinator/issues/231)) ([5f7bb18](https://github.com/JustinBeckwith/linkinator/commit/5f7bb1881a697c0aeaa86ac4f97103dae2718fcd))
* migrate from gaxios to undici ([#684](https://github.com/JustinBeckwith/linkinator/issues/684)) ([8df9423](https://github.com/JustinBeckwith/linkinator/commit/8df9423ebf5653b2d2107674bc8dbbaf0b2315e5))
* migrate to release-please ([#704](https://github.com/JustinBeckwith/linkinator/issues/704)) ([5460ddc](https://github.com/JustinBeckwith/linkinator/commit/5460ddc25e4b86fd98ee7c93a8331ddee56c8e21))
* only crawl exact host matches ([#99](https://github.com/JustinBeckwith/linkinator/issues/99)) ([846f545](https://github.com/JustinBeckwith/linkinator/commit/846f5459fb3ef54158185132b60388e570efef1b))
* **perf:** links are queued just once ([#154](https://github.com/JustinBeckwith/linkinator/issues/154)) ([5f89458](https://github.com/JustinBeckwith/linkinator/commit/5f894587b80060617b19fedd2784a3d76f1822b3))
* **perf:** reduce total memory consumption ([#153](https://github.com/JustinBeckwith/linkinator/issues/153)) ([aa139da](https://github.com/JustinBeckwith/linkinator/commit/aa139dae442f6353f14c9d233ded18609e8addbe))
* **perf:** refactor to use htmlparser2 ([#335](https://github.com/JustinBeckwith/linkinator/issues/335)) ([ce88410](https://github.com/JustinBeckwith/linkinator/commit/ce88410fe810915aacf79c385b3bbbc8e50c219b))
* **perf:** use request streams to reduce memory usage ([#336](https://github.com/JustinBeckwith/linkinator/issues/336)) ([6e33b39](https://github.com/JustinBeckwith/linkinator/commit/6e33b39804d296d1785c4c7722eb3ecff1670250))
* print the stats even after a fail ([#38](https://github.com/JustinBeckwith/linkinator/issues/38)) ([a4136aa](https://github.com/JustinBeckwith/linkinator/commit/a4136aa8359376ca5af2845868f362c3cac13ca8))
* properly calculate relative paths ([#40](https://github.com/JustinBeckwith/linkinator/issues/40)) ([aa2e9c9](https://github.com/JustinBeckwith/linkinator/commit/aa2e9c94c1dbcc53fcf432e69bc103e2eff3a088))
* properly parse srcset attribute ([#510](https://github.com/JustinBeckwith/linkinator/issues/510)) ([9a8a83c](https://github.com/JustinBeckwith/linkinator/commit/9a8a83c35182b3cd4daee62a00f156767fe5c6a7))
* remove express dependency ([#198](https://github.com/JustinBeckwith/linkinator/issues/198)) ([429b325](https://github.com/JustinBeckwith/linkinator/commit/429b325c0a16b24318ede97306dfc889ce3e8b4c))
* remove file import prefix to please ncc ([#526](https://github.com/JustinBeckwith/linkinator/issues/526)) ([ca3f275](https://github.com/JustinBeckwith/linkinator/commit/ca3f2753e2f38955eacd6e8324363de7a47f4514))
* remove update-notifier ([#519](https://github.com/JustinBeckwith/linkinator/issues/519)) ([90fa80e](https://github.com/JustinBeckwith/linkinator/commit/90fa80eb2ef47b1417c6953d0c3de7b527c6a720))
* repair windows support, add CI ([#64](https://github.com/JustinBeckwith/linkinator/issues/64)) ([2f4e462](https://github.com/JustinBeckwith/linkinator/commit/2f4e462eb764a22bc1aaefa70543d424b7a3ba9c))
* report links in all parent contexts ([#696](https://github.com/JustinBeckwith/linkinator/issues/696)) ([b4b1088](https://github.com/JustinBeckwith/linkinator/commit/b4b10880ce97c52906a685409e52aa10c6824164))
* resolve conflict with -s short flag ([#72](https://github.com/JustinBeckwith/linkinator/issues/72)) ([1784b38](https://github.com/JustinBeckwith/linkinator/commit/1784b38d6b82ecfaf4469120178e2afa6d3770a9))
* resolve glob paths based on server root ([#218](https://github.com/JustinBeckwith/linkinator/issues/218)) ([fee112b](https://github.com/JustinBeckwith/linkinator/commit/fee112b7208e25986111cf88deb510e43da671a7))
* respect recursive rules ([#26](https://github.com/JustinBeckwith/linkinator/issues/26)) ([877a32b](https://github.com/JustinBeckwith/linkinator/commit/877a32bd194803f9645f4dcafc9c4786d33e9666))
* retry on href not host ([#357](https://github.com/JustinBeckwith/linkinator/issues/357)) ([54a1994](https://github.com/JustinBeckwith/linkinator/commit/54a1994c316e7e4f4189b7d00903458525b55341))
* send a HEAD instead of GET at first ([#29](https://github.com/JustinBeckwith/linkinator/issues/29)) ([7dc7139](https://github.com/JustinBeckwith/linkinator/commit/7dc7139cb104200fe8db150eac921376ec660b9e))
* skip mailto links ([#23](https://github.com/JustinBeckwith/linkinator/issues/23)) ([25e1882](https://github.com/JustinBeckwith/linkinator/commit/25e1882f14871581e27c2f7d2e1264ad71f0ebde))
* skip scanning non-html files ([#31](https://github.com/JustinBeckwith/linkinator/issues/31)) ([28c52b1](https://github.com/JustinBeckwith/linkinator/commit/28c52b193ee8c9ceb954405a0890dce8a6fa8551))
* special handling of srcset attribute ([#342](https://github.com/JustinBeckwith/linkinator/issues/342)) ([ea23759](https://github.com/JustinBeckwith/linkinator/commit/ea23759592560c9a64d406a1293c8f5115da1f01))
* stream CSV results ([#507](https://github.com/JustinBeckwith/linkinator/issues/507)) ([a376199](https://github.com/JustinBeckwith/linkinator/commit/a376199a423ba075b620eeb5497e86e45dd71720))
* stringify js for json ([#118](https://github.com/JustinBeckwith/linkinator/issues/118)) ([d653f2c](https://github.com/JustinBeckwith/linkinator/commit/d653f2cfd6459f0597e351e5e3606c6e6129f098))
* support commas and spaces in linksToSkip ([#226](https://github.com/JustinBeckwith/linkinator/issues/226)) ([a7d8625](https://github.com/JustinBeckwith/linkinator/commit/a7d86253269a901420928613355704e95d9d7f04))
* throw error when glob returns no results ([#207](https://github.com/JustinBeckwith/linkinator/issues/207)) ([217074e](https://github.com/JustinBeckwith/linkinator/commit/217074e13826b25c18a1398a5a468e064ea48c5f))
* upgrade to mime v4 ([#586](https://github.com/JustinBeckwith/linkinator/issues/586)) ([4009fa9](https://github.com/JustinBeckwith/linkinator/commit/4009fa99c65561403dd5edac472a5ce17a7f3b2c))
* use custom HTTP server ([#265](https://github.com/JustinBeckwith/linkinator/issues/265)) ([9b0b206](https://github.com/JustinBeckwith/linkinator/commit/9b0b2061d5cf302137ed0bea3d4f07fde76e0762))
* use GET instead of HEAD for now ([a59e7aa](https://github.com/JustinBeckwith/linkinator/commit/a59e7aa0c77a53a661d855c9a10aa0445e6f8e91))
* use OIDC for releases ([#700](https://github.com/JustinBeckwith/linkinator/issues/700)) ([5f9c5b9](https://github.com/JustinBeckwith/linkinator/commit/5f9c5b947c03e23e1490be2a128ef4b625bf3006))
* use OIDC for releases, attempt 3 ([#703](https://github.com/JustinBeckwith/linkinator/issues/703)) ([fe9a8dd](https://github.com/JustinBeckwith/linkinator/commit/fe9a8ddecbfb1eb27603c0bd0bf3af42de29c148))
* use recursive scanning ([850d5b0](https://github.com/JustinBeckwith/linkinator/commit/850d5b02ac3d5a1cc912c0acf60c72c3dfc8f1ed))


### Build System

* drop support for node 16 ([#575](https://github.com/JustinBeckwith/linkinator/issues/575)) ([351a7c9](https://github.com/JustinBeckwith/linkinator/commit/351a7c9ebf46d48a5d05b51d8c390f398eba6af1))
* drop support for node.js 8.x ([#142](https://github.com/JustinBeckwith/linkinator/issues/142)) ([85642bd](https://github.com/JustinBeckwith/linkinator/commit/85642bdb1ccead89dc6d25f7891054f28e6ce609))
* drop support for nodejs 12.x ([#506](https://github.com/JustinBeckwith/linkinator/issues/506)) ([5ef0e1e](https://github.com/JustinBeckwith/linkinator/commit/5ef0e1e71b6bb069d3660df962633d77f802b698))
