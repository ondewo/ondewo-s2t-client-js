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
/* global require */

const { test: runTestCase } = require('node:test');
const assert = require('node:assert/strict');

const { buildAuthMetadata, createSpeech2TextClient, listRegisteredPipelines, main } = require('./client');

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

runTestCase('buildAuthMetadata carries the bearer token in the authorization header', () => {
	const metadata = buildAuthMetadata(makeTokenProvider());
	assert.deepEqual(metadata, { authorization: BEARER_HEADER });
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
		assert.deepEqual(capture.metadata, { authorization: BEARER_HEADER });
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
