# linkinator

[![npm version](https://img.shields.io/npm/v/linkinator.svg)](https://www.npmjs.org/package/linkinator)
[![Build Status](https://api.cirrus-ci.com/github/JustinBeckwith/linkinator.svg)](https://cirrus-ci.com/github/JustinBeckwith/linkinator)
[![codecov](https://codecov.io/gh/JustinBeckwith/linkinator/branch/master/graph/badge.svg)](https://codecov.io/gh/JustinBeckwith/linkinator)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

> A super simple site crawler and broken link checker.

## Status

This thing is fresh and hot off the compiler. It's uh, not ready for primetime just yet.

## Installation

You can use this as a library, or as a CLI.  Let's see the CLI!

```sh
$ npx linkinator http://jbeckwith.com
```

## Usage

That was fun.  What about local files?  The linkinator will stand up a static web server for yinz:

```sh
$ npx linkinator ./docs
```

But that only gets the top level of links.  Lets go deeper and do a full recursive scan!

```sh
$ npx linkinator ./docs --recurse
```

Aw, snap.  I didn't want that to check *those* links.  Let's skip em:

```sh
$ npx linkinator ./docs --skip www.googleapis.com
```

## License
[MIT](LICENSE)
