# Release History

*****************

## Release ONDEWO S2T Js Client 7.4.1

### Bug Fixes

* [[OND221-2830]](https://ondewo.atlassian.net/browse/OND221-2830) Regenerated with [ondewo-proto-compiler 5.13.0](https://github.com/ondewo/ondewo-proto-compiler/releases/tag/5.13.0).
* [[OND221-2830]](https://ondewo.atlassian.net/browse/OND221-2830) No change to how the auth helper is consumed: this package ships a webpack bundle rather than a public-api barrel, and the auth helper is a Node-only `undici` consumer that does not belong in a browser bundle. It ships as its own CommonJS entry and is imported directly (`require('<pkg>/auth/offlineTokenProvider')`).
* [[OND221-2830]](https://ondewo.atlassian.net/browse/OND221-2830) Tooling: `conventional-pre-commit` now runs before `giticket` at the commit-msg stage - with giticket first, its `[OND221-2830] fix: ...` rewrite was no longer valid Conventional Commits and every commit on a ticket branch failed. `README.md` is prettier-ignored where `.prettierrc` sets `useTabs` and markdownlint's MD010 de-tabs the same blocks, and the codegen `docker run` invocations no longer pass `-it`, which fails outside a TTY.

***************** 
## Release ONDEWO S2T Js Client 7.4.0 
 
### Improvements 
 * Tracking API Version [7.4.0](https://github.com/ondewo/ondewo-s2t-api/releases/tag/7.4.0) ( [Documentation](https://ondewo.github.io/ondewo-s2t-api/) ) 


***************** 
## Release ONDEWO S2T Js Client 7.3.0 
 
### Improvements 
 * Tracking API Version [7.3.0](https://github.com/ondewo/ondewo-s2t-api/releases/tag/7.3.0) ( [Documentation](https://ondewo.github.io/ondewo-s2t-api/) ) 


***************** 
## Release ONDEWO S2T Js Client 7.2.0 
 
### Improvements 
 * Tracking API Version [7.2.0](https://github.com/ondewo/ondewo-s2t-api/releases/tag/7.2.0) ( [Documentation](https://ondewo.github.io/ondewo-s2t-api/) ) 


***************** 
## Release ONDEWO S2T Js Client 7.2.0 
 
### Improvements 
 * Tracking API Version [7.2.0](https://github.com/ondewo/ondewo-s2t-api/releases/tag/7.2.0) ( [Documentation](https://ondewo.github.io/ondewo-s2t-api/) ) 


***************** 
## Release ONDEWO S2T Js Client 7.1.0 
 
### Improvements 
 * Tracking API Version [7.1.0](https://github.com/ondewo/ondewo-s2t-api/releases/tag/7.1.0) ( [Documentation](https://ondewo.github.io/ondewo-s2t-api/) ) 


***************** 
## Release ONDEWO S2T Js Client 7.0.0 
 
### Improvements 
 * Tracking API Version [7.0.0](https://github.com/ondewo/ondewo-s2t-api/releases/tag/7.0.0) ( [Documentation](https://ondewo.github.io/ondewo-s2t-api/) ) 


***************** 
## Release ONDEWO S2T Js Client 6.1.0 
 
### Improvements 
 * Tracking API Version [6.1.0](https://github.com/ondewo/ondewo-s2t-api/releases/tag/6.1.0) ( [Documentation](https://ondewo.github.io/ondewo-s2t-api/) ) 


***************** 
## Release ONDEWO S2T Js Client 6.0.0 
 
### Improvements 
 * Tracking API Version [6.0.0](https://github.com/ondewo/ondewo-s2t-api/releases/tag/6.0.0) ( [Documentation](https://ondewo.github.io/ondewo-s2t-api/) ) 


*****************
## Release ONDEWO S2T Js Client 4.0.0

### Improvements
* Tracking API Version [4.0.0](https://github.com/ondewo/ondewo-s2t-api/releases/tag/4.0.0) ( [Documentation](https://ondewo.github.io/ondewo-s2t-api/) )


*****************

## Release ONDEWO S2T Js Client 3.3.0

### Improvements
* Tracking API Version [3.3.0](https://github.com/ondewo/ondewo-s2t-api/releases/tag/3.3.0) ( [Documentation](https://ondewo.github.io/ondewo-s2t-api/) )


*****************

## Release ONDEWO S2T Js Client 3.3.0

### Improvements
* Track version 3.3.0 of [ONDEWO S2T API](https://github.com/ondewo/ondewo-s2t-api/releases/3.3.0)
* [[OND211-2039]](https://ondewo.atlassian.net/browse/OND211-2039) Implemented automated release for GitHub and NPM
* [[OND211-2039]](https://ondewo.atlassian.net/browse/OND211-2039) Added pre-commit hooks and adjusted files to them


*****************
