<div align="center">
  <table>
    <tr>
      <td>
        <a href="https://ondewo.com/en/products/natural-language-understanding/">
            <img width="400px" src="https://raw.githubusercontent.com/ondewo/ondewo-logos/master/ondewo_we_automate_your_phone_calls.png"/>
        </a>
      </td>
    </tr>
    <tr>
       <td align="center">
          <a href="https://www.linkedin.com/company/ondewo "><img width="40px" src="https://cdn-icons-png.flaticon.com/512/3536/3536505.png"></a>
          <a href="https://www.facebook.com/ondewo"><img width="40px" src="https://cdn-icons-png.flaticon.com/512/733/733547.png"></a>
          <a href="https://twitter.com/ondewo"><img width="40px" src="https://cdn-icons-png.flaticon.com/512/733/733579.png"> </a>
          <a href="https://www.instagram.com/ondewo.ai/"><img width="40px" src="https://cdn-icons-png.flaticon.com/512/174/174855.png"></a>
          <a href="https://badge.fury.io/js/%40ondewo%2Fondewo-s2t-client-js"><img src="https://badge.fury.io/js/%40ondewo%2Fondewo-s2t-client-js.svg" alt="npm version" height="32"></a>
       </td>
    </tr>
  </table>
  <h1 align="center">
    ONDEWO S2T Client Javascript
  </h1>
</div>

## Overview

`@ondewo/s2t-client-js` is a compiled version of the [ONDEWO S2T API](https://github.com/ondewo/ondewo-s2t-api) using the [ONDEWO PROTO COMPILER](https://github.com/ondewo/ondewo-proto-compiler). Here you can find the S2T API [documentation](https://ondewo.github.io).

ONDEWO APIs use [Protocol Buffers](https://github.com/google/protobuf) version 3 (proto3) as their Interface Definition Language (IDL) to define the API interface and the structure of the payload messages. The same interface definition is used for gRPC versions of the API in all languages.

## Setup

Using NPM:

```shell
npm i --save @ondewo/ondewo-s2t-client-js
```

Using GitHub:

```shell
git clone https://github.com/ondewo/ondewo-s2t-client-js.git ## Clone repository
cd ondewo-s2t-client-js                                      ## Change into repo-directoy
make setup_developer_environment_locally                     ## Install dependencies
```

## Package structure

```
npm
├── api
│   ├── ondewo_s2t_api.js
│   ├── ondewo_s2t_api.min.js
│   └── ondewo_s2t_api.min.js.map
├── LICENSE
├── package.json
└── README.md
```

[comment]: <> (START OF GITHUB README)

## Build

The `make build` command is dependent on 2 `repositories` and their speciefied `version`:

- [ondewo-s2t-api](https://github.com/ondewo/ondewo-s2t-api) -- `S2T_API_GIT_BRANCH` in `Makefile`
- [ondewo-proto-compiler](https://github.com/ondewo/ondewo-proto-compiler) -- `ONDEWO_PROTO_COMPILER_GIT_BRANCH` in `Makefile`

Other than creating the proto-code, `build` also installs the `dev-dependencies` and changes the owner of the proto-code-files from `root` to the `current user`.

`ONDEWO_PROTO_COMPILER_GIT_BRANCH` is currently `tags/5.14.0`. `make build` is what applies a new compiler version: bumping the pin alone moves the submodule but does **not** rewrite a single already-generated stub in `api/`.

> :white_check_mark: The js-compiler will prompt to download webpack -- write yes / y to finish the build

## Development

```shell
npm install                      ## Install dependencies (CI uses Node 20)
npm test                         ## Every spec + the 100% coverage gate
npm run test:drift               ## package.json <-> .ci-package.json mirror
make eslint                      ## Lint
make prettier PRETTIER_WRITE=-w  ## Format
uvx pre-commit run --all-files   ## markdownlint-cli2 + file-hygiene hooks
```

`npm test` is the only test gate, and the one `.github/workflows/tests.yml` runs. It executes every spec in a single `c8` process at a 100% statement/branch/function/line threshold over the hand-written sources (`auth/**/*.js`, `examples/**/*.js`) -- `--per-file` so no file can be averaged away, `--all` so a new hand-written file that no test requires cannot sit at 0%. The generated `api/` bundle, the two submodules and the `*.spec.js` files are out of scope.

Git hooks are activated by `make install_precommit_hooks`: `.husky/pre-commit` runs eslint, prettier and the pre-commit framework; `.husky/pre-push` runs `npm test` (and skips itself for the three pushes `make release` performs); `.husky/commit-msg` validates the Conventional Commit subject **before** giticket prepends the `[OND…-…]` ticket taken from the branch name.

## GitHub Repository - Release Automation

The repository is published to GitHub and NPM by the Automated Release Process of ONDEWO.

TODO after PR merge:

- checkout master

  ```shell
  git checkout master
  ```

- pull newest state

  ```shell
  git pull
  ```

- Adjust `ONDEWO_S2T_VERSION` in the `Makefile` <br><br>
- Add new Release Notes to `src/RELEASE.md` in following format:

  ```
  ## Release ONDEWO S2T Js Client X.X.X    <----- Beginning of Notes

  ...<NOTES>...

  *****************                             <----- End of Notes
  ```

- release

  ```shell
  make ondewo_release
  ```

  <br>
  The release process can be divided into 6 Steps:

1. `build` specified version of the `ondewo-s2t-api`
2. `commit and push` all changes in code resulting from the `build`
3. Publish the created `npm` folder to `npmjs.com`
4. Create and push the `release branch` e.g. `release/1.3.20`
5. Create and push the `release tag` e.g. `1.3.20`
6. Create a new `Release` on GitHub

> :warning: The Release Automation checks if the build has created all the proto-code files, but it does not check the code-integrity. Please build and test the generated code prior to starting the release process.

[comment]: <> (END OF GITHUB README)
