// Copyright 2021-2026 ONDEWO GmbH
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

// Mock-based unit tests for the S2T client example. The generated gRPC-web `api` namespace, the
// service client and the Keycloak token provider are all faked -- there is NO network access and no
// real gRPC server. They prove the example builds the right request, attaches the bearer metadata,
// reads the response, and always stops the token-refresh loop.
//   node --test examples/client.spec.js

'use strict';
/* global require, process */

const { test: runTestCase } = require('node:test');
const assert = require('node:assert/strict');

const {
	buildAuthMetadata,
	createSpeech2TextClient,
	listRegisteredPipelines,
	requireEnv,
	buildConfigFromEnv,
	runFromCli,
	main
} = require('./client');
const { TokenError } = require('../auth/offlineTokenProvider');

const BEARER_HEADER = 'Bearer test-access-token';

/**
 * A fake token provider recording whether its refresh loop was stopped.
 *
 * @returns {{ getAuthorizationHeader: () => string, stop: () => void, stopped: boolean }}
 *   The fake provider plus a live `stopped` flag.
 */
function makeTokenProvider() {
	const provider = {
		stopped: false,
		getAuthorizationHeader() {
			return BEARER_HEADER;
		},
		stop() {
			provider.stopped = true;
		}
	};
	return provider;
}

/**
 * A fake `ListS2tPipelinesRequest` capturing the setter calls the example makes.
 */
class FakeListPipelinesRequest {
	constructor() {
		/** @type {boolean | null} */
		this.registeredOnly = null;
		/** @type {string[] | null} */
		this.languages = null;
		/** @type {boolean} */
		this.setLanguagesCalled = false;
	}

	setRegisteredOnly(value) {
		this.registeredOnly = value;
	}

	setLanguagesList(value) {
		this.languages = value;
		this.setLanguagesCalled = true;
	}
}

/**
 * A fake `ListS2tPipelinesResponse` wrapping the given pipeline summaries as protobuf-style getters.
 *
 * @param {{ id: string, active: boolean }[]} summaries
 *   The pipeline summaries to expose through generated-style getters.
 * @returns {{ getPipelineConfigsList: () => { getId: () => string, getActive: () => boolean }[] }}
 *   The fake response object.
 */
function makeResponse(summaries) {
	const configs = summaries.map((summary) => ({
		getId() {
			return summary.id;
		},
		getActive() {
			return summary.active;
		}
	}));
	return {
		getPipelineConfigsList() {
			return configs;
		}
	};
}

/**
 * A fake `api` namespace whose client records constructor args and RPC calls and returns `response`.
 *
 * @param {object} response
 *   The response the fake `listS2tPipelines` resolves with.
 * @returns {{ api: object, capture: { host: string | null, credentials: unknown, options: unknown, request: object | null, metadata: object | null } }}
 *   The fake `api` namespace plus a live `capture` of what the example passed in.
 */
function makeApi(response) {
	const capture = {
		host: null,
		credentials: undefined,
		options: undefined,
		request: null,
		metadata: null
	};

	class FakeSpeech2TextPromiseClient {
		constructor(host, credentials, options) {
			capture.host = host;
			capture.credentials = credentials;
			capture.options = options;
		}

		listS2tPipelines(request, metadata) {
			capture.request = request;
			capture.metadata = metadata;
			return Promise.resolve(response);
		}
	}

	const api = {
		Speech2TextPromiseClient: FakeSpeech2TextPromiseClient,
		ListS2tPipelinesRequest: FakeListPipelinesRequest
	};
	return { api, capture };
}

/**
 * Every environment variable `buildConfigFromEnv` reads. Listed explicitly so a test starts from a
 * known-empty environment instead of inheriting whatever the developer's shell exports.
 *
 * @type {string[]}
 */
const CONFIG_ENV_KEYS = [
	'ONDEWO_HOST',
	'ONDEWO_PORT',
	'ONDEWO_USE_SECURE_CHANNEL',
	'ONDEWO_S2T_LANGUAGES',
	'KEYCLOAK_URL',
	'KEYCLOAK_REALM',
	'KEYCLOAK_CLIENT_ID',
	'KEYCLOAK_USER_NAME',
	'KEYCLOAK_PASSWORD',
	'KEYCLOAK_VERIFY_SSL'
];

/**
 * The minimal set of required variables a valid `environment.env` supplies.
 *
 * @type {Record<string, string>}
 */
const REQUIRED_ENV = {
	ONDEWO_HOST: 's2t.example.com',
	ONDEWO_PORT: '443',
	KEYCLOAK_URL: 'https://auth.example.com/auth',
	KEYCLOAK_REALM: 'ondewo-ccai-platform',
	KEYCLOAK_CLIENT_ID: 'ondewo-nlu-cai-sdk-public',
	KEYCLOAK_USER_NAME: 'tech-user@example.com',
	KEYCLOAK_PASSWORD: 'super-secret'
};

/**
 * Run `body` with exactly `variables` exported (every other config variable unset), then restore the
 * previous environment. Keeps the env-driven tests hermetic and order-independent.
 *
 * @param {Record<string, string>} variables
 *   The environment variables to export for the duration of the call.
 * @param {() => unknown} body
 *   The code to run under that environment; awaited, so an async `body` still sees the variables.
 * @returns {Promise<unknown>}
 *   Whatever `body` resolved to.
 */
async function withEnv(variables, body) {
	const saved = {};
	for (const key of CONFIG_ENV_KEYS) {
		saved[key] = process.env[key];
		delete process.env[key];
	}
	Object.assign(process.env, variables);
	try {
		return await body();
	} finally {
		for (const key of CONFIG_ENV_KEYS) {
			if (saved[key] === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = saved[key];
			}
		}
	}
}

/**
 * Capture everything written to `console.error` while `body` runs, so the CLI failure tests can assert
 * the diagnostics instead of printing them into the test output.
 *
 * @param {() => Promise<unknown>} body
 *   The code whose `console.error` output is captured.
 * @returns {Promise<string[]>}
 *   One entry per `console.error` call, arguments joined with a space.
 */
async function captureConsoleError(body) {
	const originalConsoleError = console.error;
	/** @type {string[]} */
	const lines = [];
	console.error = (...args) => {
		lines.push(args.map((arg) => String(arg)).join(' '));
	};
	try {
		await body();
	} finally {
		console.error = originalConsoleError;
	}
	return lines;
}

/**
 * The seams {@link runFromCli} needs, pre-wired to hermetic fakes and recording what it did.
 *
 * @param {(config: object) => Promise<unknown>} run
 *   The stand-in for `main`.
 * @returns {{ dependencies: object, capture: { envPath: string | null, config: object | null, exitCode: number | null } }}
 *   The dependencies object plus a live capture of the calls.
 */
function makeCliDependencies(run) {
	const capture = { envPath: null, config: null, exitCode: null };
	const dependencies = {
		loadEnv(envPath) {
			capture.envPath = envPath;
		},
		resolveApi() {
			return makeApi(makeResponse([])).api;
		},
		run(config) {
			capture.config = config;
			return run(config);
		},
		exit(code) {
			capture.exitCode = code;
		}
	};
	return { dependencies, capture };
}

runTestCase('buildAuthMetadata carries the bearer token in the authorization header', () => {
	const metadata = buildAuthMetadata(makeTokenProvider());
	assert.deepEqual(metadata, { Authorization: BEARER_HEADER });
});

runTestCase('createSpeech2TextClient constructs the generated client with (host, null, null)', () => {
	const grpcHost = 'https://s2t.example.com:443';
	const { api, capture } = makeApi(makeResponse([]));
	const client = createSpeech2TextClient(api, grpcHost);
	assert.ok(client instanceof api.Speech2TextPromiseClient);
	assert.equal(capture.host, grpcHost);
	assert.equal(capture.credentials, null);
	assert.equal(capture.options, null);
});

runTestCase(
	'listRegisteredPipelines sets the language filter, attaches bearer metadata and maps the response',
	async () => {
		const languages = ['de'];
		const { api, capture } = makeApi(makeResponse([{ id: 'pipeline_de', active: true }]));
		const client = createSpeech2TextClient(api, 'https://s2t.example.com:443');
		const provider = makeTokenProvider();

		const pipelines = await listRegisteredPipelines(api, client, provider, languages);

		assert.equal(capture.request.registeredOnly, true);
		assert.equal(capture.request.setLanguagesCalled, true);
		assert.deepEqual(capture.request.languages, languages);
		assert.deepEqual(capture.metadata, { Authorization: BEARER_HEADER });
		assert.deepEqual(pipelines, [{ id: 'pipeline_de', active: true }]);
	}
);

runTestCase('listRegisteredPipelines omits the language filter when none is given', async () => {
	const { api, capture } = makeApi(makeResponse([{ id: 'pipeline_a', active: false }]));
	const client = createSpeech2TextClient(api, 'https://s2t.example.com:443');

	const pipelines = await listRegisteredPipelines(api, client, makeTokenProvider());

	assert.equal(capture.request.registeredOnly, true);
	assert.equal(capture.request.setLanguagesCalled, false);
	assert.equal(capture.request.languages, null);
	assert.deepEqual(pipelines, [{ id: 'pipeline_a', active: false }]);
});

runTestCase('main logs in, lists the pipelines and always stops the refresh loop', async () => {
	const grpcHost = 'https://s2t.example.com:443';
	const { api } = makeApi(makeResponse([{ id: 'pipeline_de', active: true }]));
	const provider = makeTokenProvider();
	/** @type {object | null} */
	let loginOptions = null;

	const pipelines = await main(
		{
			api,
			grpcHost,
			keycloakUrl: 'https://auth.example.com/auth',
			realm: 'ondewo-ccai-platform',
			clientId: 'ondewo-nlu-cai-sdk-public',
			username: 'tech-user@example.com',
			password: 'super-secret',
			languages: ['de']
		},
		{
			login(options) {
				loginOptions = options;
				return Promise.resolve(provider);
			}
		}
	);

	assert.deepEqual(pipelines, [{ id: 'pipeline_de', active: true }]);
	assert.equal(loginOptions.clientId, 'ondewo-nlu-cai-sdk-public');
	assert.equal(loginOptions.username, 'tech-user@example.com');
	assert.equal(provider.stopped, true);
});

runTestCase('main stops the refresh loop even when the RPC rejects', async () => {
	const provider = makeTokenProvider();
	const failure = new Error('UNAVAILABLE');
	const api = {
		Speech2TextPromiseClient: class {
			listS2tPipelines() {
				return Promise.reject(failure);
			}
		},
		ListS2tPipelinesRequest: FakeListPipelinesRequest
	};

	await assert.rejects(
		main(
			{
				api,
				grpcHost: 'https://s2t.example.com:443',
				keycloakUrl: 'https://auth.example.com/auth',
				realm: 'ondewo-ccai-platform',
				clientId: 'ondewo-nlu-cai-sdk-public',
				username: 'tech-user@example.com',
				password: 'super-secret'
			},
			{ login: () => Promise.resolve(provider) }
		),
		failure
	);
	assert.equal(provider.stopped, true);
});

runTestCase('main falls back to the real login helper when no dependencies are injected', async () => {
	// Exercises the `dependencies = { login }` default WITHOUT any network call: the real login()
	// validates its options first and rejects a blank realm before it ever reaches the token endpoint.
	const { api } = makeApi(makeResponse([]));
	await assert.rejects(
		main({
			api,
			grpcHost: 'https://s2t.example.com:443',
			keycloakUrl: 'https://auth.example.com/auth',
			realm: '',
			clientId: 'ondewo-nlu-cai-sdk-public',
			username: 'tech-user@example.com',
			password: 'super-secret'
		}),
		TokenError
	);
});

runTestCase('requireEnv returns the trimmed value of a populated variable', async () => {
	await withEnv({ ONDEWO_HOST: '  s2t.example.com  ' }, () => {
		assert.equal(requireEnv('ONDEWO_HOST'), 's2t.example.com');
	});
});

runTestCase('requireEnv names the missing variable and points at environment.env', async () => {
	await withEnv({}, () => {
		assert.throws(
			() => requireEnv('KEYCLOAK_URL'),
			(error) =>
				error instanceof Error &&
				/Missing required environment variable KEYCLOAK_URL \(set it in examples\/environment\.env\)/.test(
					error.message
				)
		);
	});
});

runTestCase('requireEnv rejects a whitespace-only variable exactly like a missing one', async () => {
	await withEnv({ KEYCLOAK_PASSWORD: '   ' }, () => {
		assert.throws(() => requireEnv('KEYCLOAK_PASSWORD'), /Missing required environment variable KEYCLOAK_PASSWORD/);
	});
});

runTestCase('buildConfigFromEnv defaults to a secure channel, TLS verification on and no language filter', async () => {
	const { api } = makeApi(makeResponse([]));
	const config = await withEnv({ ...REQUIRED_ENV }, () => buildConfigFromEnv(api));
	assert.equal(config.api, api);
	assert.equal(config.grpcHost, 'https://s2t.example.com:443');
	assert.equal(config.keycloakUrl, 'https://auth.example.com/auth');
	assert.equal(config.realm, 'ondewo-ccai-platform');
	assert.equal(config.clientId, 'ondewo-nlu-cai-sdk-public');
	assert.equal(config.username, 'tech-user@example.com');
	assert.equal(config.password, 'super-secret');
	assert.equal(config.keycloakVerifySsl, true);
	assert.deepEqual(config.languages, []);
});

runTestCase('buildConfigFromEnv honours the plaintext/insecure/language opt-outs', async () => {
	const { api } = makeApi(makeResponse([]));
	const config = await withEnv(
		{
			...REQUIRED_ENV,
			ONDEWO_USE_SECURE_CHANNEL: ' FALSE ',
			KEYCLOAK_VERIFY_SSL: 'false',
			// Blank entries (a trailing comma / stray spaces in environment.env) must be dropped.
			ONDEWO_S2T_LANGUAGES: ' de , , en,'
		},
		() => buildConfigFromEnv(api)
	);
	assert.equal(config.grpcHost, 'http://s2t.example.com:443');
	assert.equal(config.keycloakVerifySsl, false);
	assert.deepEqual(config.languages, ['de', 'en']);
});

runTestCase('runFromCli loads environment.env, runs the example and exits 0', async () => {
	const { dependencies, capture } = makeCliDependencies(() => Promise.resolve([{ id: 'pipeline_de', active: true }]));

	await withEnv({ ...REQUIRED_ENV }, () => runFromCli(dependencies));

	assert.match(capture.envPath, /examples[/\\]environment\.env$/);
	assert.equal(capture.config.grpcHost, 'https://s2t.example.com:443');
	assert.equal(capture.exitCode, 0);
});

runTestCase('runFromCli reports a gRPC-web status code and exits 1', async () => {
	const failure = Object.assign(new Error('pipeline service unavailable'), { code: 14 });
	const { dependencies, capture } = makeCliDependencies(() => Promise.reject(failure));

	const lines = await captureConsoleError(() => withEnv({ ...REQUIRED_ENV }, () => runFromCli(dependencies)));

	assert.equal(capture.exitCode, 1);
	assert.equal(lines.length, 2);
	assert.match(lines[0], /FAILED to list S2T pipelines/);
	assert.match(lines[1], /gRPC-web status code=14 details=pipeline service unavailable/);
});

runTestCase('runFromCli exits 1 on a missing environment variable without a status-code line', async () => {
	const { dependencies, capture } = makeCliDependencies(() => Promise.resolve([]));

	// No environment at all: buildConfigFromEnv throws a plain Error carrying no `code`.
	const lines = await captureConsoleError(() => withEnv({}, () => runFromCli(dependencies)));

	assert.equal(capture.exitCode, 1);
	assert.equal(lines.length, 1);
	assert.match(lines[0], /Missing required environment variable ONDEWO_HOST/);
});

runTestCase('runFromCli survives a rejection with no reason at all', async () => {
	// `error && error.code` also guards the falsy-rejection case; reading `.code` off null would turn a
	// failed run into an unhandled TypeError and lose the exit code.
	const { dependencies, capture } = makeCliDependencies(() => Promise.reject(null));

	const lines = await captureConsoleError(() => withEnv({ ...REQUIRED_ENV }, () => runFromCli(dependencies)));

	assert.equal(capture.exitCode, 1);
	assert.equal(lines.length, 1);
});
