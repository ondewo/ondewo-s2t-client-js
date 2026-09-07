# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Principles

Behavioral guidelines to reduce common mistakes. They bias toward caution over speed; for trivial tasks, use judgment.

### Think before coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### Simplicity first

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### Surgical changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that _your_ changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### Goal-driven execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```text
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and
clarifying questions come before implementation rather than after mistakes.

## Git Commits

- **Never include Claude as author or co-author** in commit messages, PR descriptions, or any other text. Do not add
  `Co-Authored-By: Claude…` trailers, "Generated with Claude Code" footers, or any similar attribution.
- The user's own git author identity (already configured in git) is the only identity that should appear on commits.
- This rule overrides the default Claude Code commit-template guidance.
- **Never prepend the JIRA ticket ID** (e.g. `[OND211-2386]`) to the commit subject yourself. The `giticket` pre-commit
  hook reads the ticket from the branch name (`(feature|bugfix|support|hotfix)/<TICKET>-…`) and prepends `[<ticket>]`
  (with a trailing space) automatically. Writing the prefix manually produces a duplicate like
  `[OND211-2386] [OND211-2386] feat: …`. Write the subject as plain Conventional Commits (`feat: …`, `fix(scope): …`,
  `docs(types): …`) and let the hook add the prefix on commit.

## General Principles

- Follow existing patterns before introducing new abstractions.
- Keep changes minimal and consistent with surrounding code.
- Validate inputs early with descriptive, context-rich error messages.
- Use context managers for files, sockets, and thread pools.
- Prefer region comments for grouping methods in files that already use them.
- End edited Markdown and YAML files with a trailing newline.

## What this repo is

Plain-JS gRPC-web SDK for the ONDEWO Speech-to-Text API, published to npm as `@ondewo/ondewo-s2t-client-js`.
Roughly 95% of the tree is generated: `api/ondewo_s2t_api{,.min}.js` is a webpack bundle
(`libraryTarget: 'var'`, reached in a browser through the global `ondewo_s2t_api`) produced by the
ondewo-proto-compiler from the protos in the `src/ondewo-s2t-api` submodule. **Never hand-edit `api/`** — the
next `make build` overwrites it.

The hand-written surface is exactly four files:

- `auth/offlineTokenProvider.js` — D18 Keycloak ROPC + `offline_access` token provider with a bounded
  background refresh loop (`login()` → `getAuthorizationHeader()` → `stop()`).
- `auth/offlineTokenProvider.spec.js`
- `examples/client.js` — the gRPC-web usage example plus its `node examples/client.js` CLI entrypoint.
- `examples/client.spec.js`

Two submodules: `src/ondewo-s2t-api` (protos, pinned by `S2T_API_GIT_BRANCH` — currently a **branch**, not a
tag) and `ondewo-proto-compiler` (codegen).

## Tests and the coverage gate

`npm test` is the only test command and the only functional gate CI has:

```shell
c8 --100 --per-file --all --include 'auth/**/*.js' --include 'examples/**/*.js' \
   --exclude '**/*.spec.js' --reporter text \
   node --test auth/offlineTokenProvider.spec.js examples/client.spec.js
```

- `--100` sets all four thresholds (statements/branches/functions/lines) to 100. `--per-file` stops a weak
  file being averaged away by a strong one. `--all` instruments hand-written files that no spec requires, so
  a NEW untested file under `auth/` or `examples/` fails the gate instead of sitting invisibly at 0%.
  Verified: dropping a never-required `examples/probeUntested.js` into the tree makes `npm test` exit 1.
- Fully hermetic — no network, no gRPC server, no Keycloak. The token endpoint is injected via the
  `fetchImpl` option, time via `node:test`'s `mock.timers`, and the example's api/client/login are faked.
  `mock.timers` needs Node >= 20.4; CI runs Node 20.
- The ONE narrow coverage exclusion is the `/* c8 ignore start|stop */` around the
  `if (require.main === module)` block in `examples/client.js`: ten lines of pure wiring (dotenv, resolving
  the webpack bundle, `process.exit`) that are unreachable under `node --test`. Every bit of logic it invokes
  lives in the exported `runFromCli(dependencies)`, which IS tested. Do not widen it — inject a seam and
  write a test instead.
- Two mutation checks worth re-running after touching auth: flipping `INSECURE_AGENT_OPTIONS` to
  `rejectUnauthorized: true`, and dropping the `.length > 0` half of the `bootstrap()` refresh-token guard.
  Both must make `npm test` exit 1.
- `npm run test:drift` asserts `package.json` and `.ci-package.json` still agree on every script and
  dependency the latter declares.

## CI: `.github/workflows/tests.yml`

The only workflow in this repo, on `push` to every branch and on `pull_request`, Node 20, no submodule
checkout (nothing under test reads the submodules). Three `run:` blocks, all of which must exit 0:

1. `npm install --no-audit --no-fund`
2. `npm run test:drift`
3. `npm test`

That is the whole reproduction recipe for a red run — there is no deploy or publish step here.

**`uvx pre-commit run --all-files` is NOT in the workflow**, so a pre-commit failure is invisible to GitHub.
Run it by hand before pushing. `pre-commit` is not on `PATH` on the dev machines; use `uvx pre-commit`.

## Proto-compiler pin and how to bump it

`ONDEWO_PROTO_COMPILER_GIT_BRANCH` in the `Makefile` (currently `tags/5.14.0`) and the
`ondewo-proto-compiler` submodule gitlink must name the SAME version. A bump is exactly those two edits and
never codegen:

```shell
git -C ondewo-proto-compiler fetch --tags origin
git -C ondewo-proto-compiler checkout <VERSION>
git add ondewo-proto-compiler
perl -i -pe 's|^ONDEWO_PROTO_COMPILER_GIT_BRANCH=.*|ONDEWO_PROTO_COMPILER_GIT_BRANCH=tags/<VERSION>|' Makefile
git submodule status   # must show the peeled commit of <VERSION>
```

- **The release does NOT auto-pull the latest tag.** `make build` → `check_out_correct_submodule_versions`
  runs `git checkout ${ONDEWO_PROTO_COMPILER_GIT_BRANCH}` and then `git add`s the submodule, so the Makefile
  variable is authoritative and a gitlink ahead of it is silently DOWNGRADED and committed. That has already
  happened on this branch: `Update proto compiler dependency to version 5.12.0` (`c948eeb`) and `… 5.13.0`
  (`6d66d2b`) moved the gitlink alone, and the next release commit `Preparing for Release 7.4.1` (`6ac05e9`)
  put it straight back to 5.10.0 — the value the Makefile still named. **Always edit both, in the same
  commit.**
- **A pin bump changes nothing that is already generated.** The compiler's own fixes (e.g. 5.13.0's JS
  `public-api.js` self-export / doubled `'././'` prefix fixes) only reach this client through `make build`.
  Never write a RELEASE.md line claiming a regeneration that did not happen.
- The jq `src/package.json` dependency sync from the compiler's `update_proto_compiler_dependency.sh` is a
  no-op here: all five overlapping keys already hold the 5.14.0 image-data values. `Dockerfile.utils` already
  declares `ENV NODE_VERSION=24.14.0`, which is what 5.14.0's Makefile expects.

## Pre-commit — hook ORDER is load-bearing

`giticket` and `conventional-pre-commit` both run at the `commit-msg` stage and pre-commit executes repos in
declaration order. **conventional-pre-commit MUST be declared first.** giticket rewrites the subject to
`[OND231-624] feat: …`, which is no longer a valid Conventional Commit, so with giticket first every commit
on a ticket branch was rejected and only `--no-verify` got it through. Probe after any change to the file:
on a `feature/OND231-624-x` branch, `git commit --allow-empty -m 'chore: probe'` must succeed and produce
the subject `[OND231-624] chore: probe`.

Hook revisions (all verified newest-stable): markdownlint-cli2 `v0.23.2`, pre-commit-hooks `v6.0.0`,
conventional-pre-commit `v4.4.0`, giticket `'1.92'` (keep the quotes — unquoted `1.92` is a YAML float).
Reject `-pre1` tags that `pre-commit autoupdate` may propose for conventional-pre-commit.

`.markdownlint-cli2.yaml`:

- **MD053 stays disabled.** Its auto-fix DELETES the `[comment]: <> (START/END OF GITHUB README)` markers the
  release Makefile slices the published README between. Re-enabling it silently breaks the npm README.
- **There is no `globs:` key, and adding one corrupts `RELEASE.md`.** pre-commit hands the hook an explicit
  file list and splits it across PARALLEL `markdownlint-cli2` processes; `globs: ["*.md"]` made every one of
  those processes additionally pick up all root `*.md`, so two of them auto-fixed and rewrote `RELEASE.md`
  concurrently and their interleaved writes dropped characters mid-line (`ONDEWO` → `ONDEW`,
  `Version` → `Vesion`, `*****************` → `****************`, `## Release` → `# Release`). Reproduced on
  v0.23.2 in 18 of 25 runs of the two commands pre-commit actually issues — it is a concurrency bug, not a
  version bug. Consequence of the fix: a bare `markdownlint-cli2` with no arguments now lints nothing;
  always pass paths, or go through pre-commit.
- After ANY markdownlint change, diff `RELEASE.md` for content safety: every `## Release … <VERSION>`
  heading, every `*****` separator and every whitespace-normalized word token must survive, and `make TEST`
  must still print the current release notes.

## Prettier owns code, not tool config

`.husky/pre-commit` runs `make prettier PRETTIER_WRITE=-w` BEFORE `pre-commit run`. Anything prettier
rewrites there lands unstaged, and `pre-commit run` then aborts with _"Your pre-commit configuration is
unstaged"_ (the hook guards against exactly that by skipping `pre-commit run` while
`.pre-commit-config.yaml` is dirty).

Two rules keep that quiet, and they are different rules:

- **Files prettier and markdownlint would fight over are prettier-ignored.** `.prettierrc` sets `useTabs`,
  so prettier re-tabs the fenced blocks markdownlint's MD010 de-tabs; `README.md` and `RELEASE.md` are
  therefore in `.prettierignore` and markdown style is markdownlint's alone. `coverage/` and `.nyc_output/`
  are there too — gitignored c8 output that `-w` would otherwise rewrite as churn.
- **Everything else stays prettier-clean rather than ignored**, including the tool config prettier does own:
  `.pre-commit-config.yaml`, `.markdownlint-cli2.yaml`, `.ci-package.json` and `CLAUDE.md`. After editing any
  of them run `make prettier PRETTIER_WRITE=-w`, or the next commit's husky hook will.

`make prettier` (check mode, no `PRETTIER_WRITE`) must report zero warnings on a clean checkout — if it does
not, the release masks the failure by running prettier in WRITE mode and leaves a dirty tree behind.

Note `eslint.config.mjs` **ignores `auth/*.js`**: the hand-written token provider is linted by nothing.
Its globals (`require`, `module`, `setTimeout`, `URLSearchParams`) are absent from the config's
browser-oriented globals list, so un-ignoring it needs a real config change, not just deleting the entry.

## The release regenerates root `package.json` — CI setup is preserved via `.ci-package.json`

The codegen (`cd src && npm run build`, whose output-volume is the repo ROOT) regenerates the root
`package.json` on every release from `src/package.json`, overwriting the CI scripts and stripping test
devDeps. The durable fix, present here:

- **`.ci-package.json`** holds the CI scripts (`test`, `test:drift`) and test-only devDeps (`c8`).
- **`make restore_ci_test_setup`** runs inside `build` BEFORE `create_npm_package` and merges it back. It is
  an inline `node -e` on purpose — a helper `.js` file gets caught by the release's eslint and fails it.
- **`remove_npm_script`** strips scripts from the `npm/` copy only, never the repo root.
- **Anything the regenerated root `package.json` must keep has to be declared in `src/package.json`** (the
  codegen source of truth). `undici` (needed by the auth helper) and `dotenv` (needed by the example CLI)
  live there.
- `npm run test:drift` is the guard that the mirror has not gone stale; CI runs it.

## Release

- `make ondewo_release` → clone devops-accounts → `make release`. `make release` runs the build, then
  `git push` three times without `--no-verify`: the "Preparing for Release <version>" commit,
  `release/<version>` and the tag. `.husky/pre-push` recognises all three and skips its test run, so a
  failure there cannot strand a release between the release commit and `npm publish`.
- The release `git commit` line is prefixed with `-` so make ignores the non-zero exit git returns when the
  build staged nothing; without it a no-op rebuild aborted the whole release.
- The release `git commit` uses `--no-verify` so husky cannot reformat the freshly generated
  `RELEASE.md`/`package.json` mid-commit.
- `.husky/pre-commit` skips `pre-commit run` when `.pre-commit-config.yaml` is unstaged: `make release` calls
  `make run_precommit_hooks`, which invokes the hook DIRECTLY (not through a git commit), and the codegen
  leaves the config dirty. Without the guard the whole release dies on _"Your pre-commit configuration is
  unstaged"_.
- **RELEASE.md is the authoritative changelog** and the release tag holds the complete history. If a
  markdownlint pass or a careless "dedup" ever drops `## Release … X.Y.Z` headings, restore `RELEASE.md` and
  `src/RELEASE.md` from the latest release tag.
- `make TEST` prints the sliced release notes and masks the tokens (`<set>`/`<unset>`); every token-bearing
  recipe line is `@`-prefixed so make never echoes a secret.
- `CURRENT_RELEASE_NOTES` ends its perl range at `/^\*{5}/`, anchored and five-wide on purpose: a bare
  `/\*\*/` matches the first inline `**bold**` span in an entry just as readily as the `*****` separator and
  would truncate the GitHub release notes there, with no error from `gh release create`.
- **Trust the registry, not the log.** After any release, verify the GitHub release AND the npm package
  directly — the orchestrating `make release_all_clients` in the API repo reports a failed client release as
  "already released".
- **The published npm package ships `api/`, `package.json`, `LICENSE` and `README.md` only**
  (`create_npm_package`). `auth/` and `examples/` are NOT published, so consumers of the npm package reach
  the token provider through the git repo, not the tarball.
