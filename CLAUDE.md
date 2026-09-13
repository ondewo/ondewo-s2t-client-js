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

## Prettier, markdownlint and the husky ordering

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

## Releasing: preflight and the traps that have actually bitten

Written after a release program across every ONDEWO client in one session. Each item below
cost real time or a broken artefact; every statement is derived from THIS repo's Makefile.

### Before you touch the version, check the released tag is in `master`

Releases here are cut from a `release/<version>` branch and are **not always merged back**, so
`master` can be missing work that is already published — and because a later version number
sorts above the unmerged one, a consumer upgrading silently loses it. The ondewo-nlu-client-python
7.1.0 release was exactly this: it shipped from a `master` that had never seen 7.0.5's
offline-token hand-off, so PyPI's newest release was a regression against its predecessor.

```bash
latest=$(git tag --sort=-v:refname | head -1)
git merge-base --is-ancestor "$latest" master && echo "in master" || echo "NOT in master -- merge first"
```

A fast-forward (`git merge --ff-only <tag>`) is the common case. A true merge needs care: resolve
metadata toward `master` and keep BOTH release-note sections, newest first — a reader upgrading
from the older line still needs the older entry.

### `git add` on a dirty submodule stages the WRONG commit

This repo has submodules (`ondewo-proto-compiler`, `src/ondewo-s2t-api`). If a submodule's working
tree is dirty, `git add <submodule>` stages **its current HEAD**, not the pointer you resolved
during a merge — silently regressing it to an older commit. `git checkout master -- <submodule>`
fixes the index but the next `git add` re-breaks it. Move the working tree instead:

```bash
want=$(git ls-tree master <submodule> | awk '{print $3}')
git -C <submodule> checkout -q "$want" && git add <submodule>
```

### The release notes are sliced by an EXACTLY-CASED heading

`CURRENT_RELEASE_NOTES` slices `RELEASE.md` with a perl range. In THIS repo the opening
pattern is, verbatim:

```text
Release ONDEWO S2T Js Client ${ONDEWO_S2T_VERSION}
```

So the heading of a new entry must read exactly `## Release ONDEWO S2T Js Client <version>`. **This wording is
not consistent across the ONDEWO repos** — some say `... <Name> Client`, some `... Client
<Name>` with the words reversed, the API repos say `... API` with no `Client` at all, and the
casing varies (`Js`, `Nodejs`, `Typescript`, `Survey`). Do not carry a heading over from a
sibling repo. Copy the PREVIOUS entry in this file and change only the version, or read the
pattern above out of the Makefile.

A heading that does not match yields an **empty slice**, and the GitHub release is then
created with empty notes or fails outright. Verify before releasing:

```bash
grep -c '^## Release ONDEWO S2T Js Client ' RELEASE.md     # must be >= 1 for your new version
```

### `src/RELEASE.md` is the source of truth; the root file is GENERATED

The build runs `cp src/RELEASE.md .`, so an edit to the root `RELEASE.md` is **discarded by
the next build**. Write the entry in `src/RELEASE.md` (and copy it to the root if you want to
read it before building). This is silent: the release completes and the notes are simply gone.

### Publish order decides how a partial failure is recovered

`make release` in this repo runs:

1. `publish_npm_via_docker`
2. `create_release_branch`
3. `create_release_tag`
4. `release_to_github_via_docker_image`

The **npm publish happens FIRST**. So a failure in a later step (tag, GitHub release)
leaves the package already published. Do **not** re-run `make ondewo_release` to recover: the
`spc` guard refuses when the branch or tag already exists, and re-publishing the same version
is rejected by the registry. Re-run only the step that failed, passing the credential it needs.

### Verify against the registry, with the REAL package name

This package publishes as **`@ondewo/ondewo-s2t-client-js`**, which is not always the repository name — the JS client
publishes as `@ondewo/ondewo-nlu-client-js` (doubled `ondewo`), so a lookup by repo name returns
a 404 that reads like a failed release. Check the name in the manifest first, then:

```bash
npm view @ondewo/ondewo-s2t-client-js versions --json
```

**An npm publish can be STAGED but not yet served.** Immediately after a publish the registry may
answer 404 for the new version while refusing a re-publish with
`409 Cannot publish over previously staged version`. That is not a failure and the version is
not burned — wait and re-check before bumping to a new number.

### The release prints credentials — read the log BEFORE you scrub it

`make ondewo_release` clones `ondewo-devops-accounts` and passes the registry and GitHub tokens on
the make command line, so they are echoed into the console and into any transcript capturing it.
This is a known and accepted property of the shared release path: do **not** re-plumb the recipe.
Redirect the run to a file, read it through a filter, and shred the file afterwards — and read it
**before** shredding, or a genuine failure is lost with the secrets:

```bash
umask 077; make ondewo_release > /tmp/rel.log 2>&1; echo "RC=$?"
grep -avE 'TOKEN|PASSWORD|USERNAME|_authToken' /tmp/rel.log | tail -20   # read FIRST
shred -u /tmp/rel.log; rm -rf ondewo-devops-accounts                     # then scrub
```

### Run the release from `master`, and check with `git branch --show-current`

A release ends by checking out `release/<version>`, and **nothing checks you out back**. Start the
next release from that leftover checkout and `git commit` + `git push` land on the OLD release
branch: the new `release/<version>` is cut from it, the tag points into it, and `master` never sees
the release at all. Measured on ondewo-csi-client-typescript 5.5.1 -- npm had it, the tag had it,
and `origin/master` was still at 5.5.0. Recovery was a fast-forward (`git merge --ff-only
release/5.5.1`), which worked only because nothing else had moved; a diverged `master` needs a real
merge.

```bash
git branch --show-current            # must print master BEFORE `make ondewo_release`
```

### The release `git add` list is an ALLOW-LIST, so anything outside it ships but is never committed

`make build` writes files the release target then stages from a fixed list of paths. Anything the
build touches that is not on that list reaches the registry and is **absent from the tag of that
same version** -- two different things under one name, with nothing anywhere reporting it.

- **`auth/`** -- the hand-written Keycloak provider and its spec. It is top-level, so `git add src`
  does not cover it. csi-client-js and csi-client-typescript 5.5.1 went to npm carrying the refresh
  fix and tagged a commit without it; 5.5.2 exists only to make the two agree.

- **`README.md`**, which is a BUILD OUTPUT -- `make build` runs `cp src/README.md .`. Anything
  written only in the root copy is destroyed by the next build. The typescript NLU client's
  "Authentication" section lived in git history and nowhere else for exactly that reason; it belongs
  in `src/README.md`, which is the source of truth.

The general check costs nothing:

```bash
git status --porcelain    # MUST be empty after a release; anything left is published-but-uncommitted
```

### `git commit` exits 1 on a clean tree and takes the whole target down with it

If the release content was already committed by hand, `git commit` finds nothing to commit, returns
1, and make abandons the target -- **before** the publish, the branch, the tag and the GitHub
release -- while printing only `nothing to commit, working tree clean`. Read as a build failure it
sends you hunting a compile error that is not there. The line is prefixed with `-` so the step is
advisory; `spc` still refuses an existing branch or tag, so the guard cannot mask a double release.

### Write the RELEASE.md section BEFORE releasing, or the release body is silently empty

`CURRENT_RELEASE_NOTES` slices RELEASE.md between the heading naming this exact version and the next
`*****` separator. No heading means an EMPTY slice, `gh release create -n ""` succeeds, and you get a
release with no notes and no error anywhere. ondewo-nlu-client-js and -typescript 7.1.1 shipped that
way and had to be repaired after the fact.

```bash
cat RELEASE.md | perl -ne 'print if /<the exact heading> <version>/../^\*{5}/' | wc -l   # must be > 0
```

### Verify the three artefacts separately -- they fail independently

GitHub's release API returned 500 twice in one session, leaving the registry and the tag correct and
**no release object at all** (nlu-client-js and -angular 7.1.1); `gh release create` after the fact
repairs it without touching the artefact.
And npm answering `409 Cannot publish over previously staged
version` is NOT a failure -- the publish SUCCEEDED and the registry has not served it yet, so a 404
from `npm view` in the same minute is the same fact from the other side. Do not burn a version
number over it; wait and re-check.

```bash
npm view <pkg> version ; git tag --list <version> ; gh release view <version> --json body --jq '.body|length'
```

### The published artefact can be broken while every source-level check is green

The generated protobuf code and the `google-protobuf` RUNTIME are two separate things, and nothing
in a normal test run compares them. The proto compiler began emitting
`reader.readStringRequireUtf8()`; that method does not exist in `google-protobuf` 3.21.4, and the
manifests pinned `3.21.4` / `^3.21.4` — ranges that can never reach the 4.x line where it was added.
A package built from those two **cannot decode a single string field**, and it shipped that way:
nlu-client-js and -typescript 7.1.0-7.1.2, csi-client-js 5.5.0-5.5.3 and -typescript 5.5.0-5.5.2,
vtsi-client-js and -typescript 8.7.0.

Every source-level signal was green the whole time — the `.proto` files, the generated code, the auth
suite, the 100% coverage gate. Two properties are what made it invisible:

- **A `-js` bundle EMBEDS its runtime.** `api/ondewo_*_api.js` is self-contained, so the defect is
  frozen into the artefact at build time and a consumer's own `google-protobuf` cannot repair it.
- **The committed artefact lags the compiler.** A repository whose bundle predates the compiler change
  looks fine and is still armed: the defect appears at the NEXT release and not before. That is
  exactly what a plain `make build` demonstrated here — 106 new `readStringRequireUtf8` call sites
  against a runtime with none.

**The guard is `tests/bundleStringRoundTrip.spec.js` (or `.spec.ts`): it loads the SHIPPED ARTEFACT
and decodes a string with multi-byte characters.** Only a test at that level can see this. It is
verified falsifiable — against the old pin it reports 0 passed, 2 failed with that exact `TypeError`.

```bash
node --test tests/bundleStringRoundTrip.spec.js     # must pass before any release
grep -m1 google-protobuf src/package.json           # must be on the 4.x line
```

**Two general rules fall out of it.** When a package ships a BUILT artefact, test the artefact and not
only its sources — a green suite over inputs says nothing about the output. And when a generator and a
runtime are pinned separately, a generator upgrade is a runtime decision: check the pair, because
neither side reports the mismatch.
