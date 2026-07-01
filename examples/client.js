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

// Minimal, idiomatic example for the ONDEWO S2T gRPC-web client.
//
// It shows the current auth flow (D18 Keycloak bearer tokens via `auth/offlineTokenProvider.js`),
// how to construct the generated `Speech2TextPromiseClient`, and how to call a representative unary
// RPC (`listS2tPipelines`) and read its response.
//
// The generated stubs are shipped as a browser bundle (`api/ondewo_s2t_api.js`, webpack
// `libraryTarget: 'var'`), so in a browser they are reached through the global `ondewo_s2t_api`:
//
//     <script src="api/ondewo_s2t_api.js"></script>
//     <script type="module">
//         import { main } from './examples/client.js';
//         await main({
//             api: ondewo_s2t_api,
//             grpcHost: 'https://s2t.example.com:443',
//             keycloakUrl: 'https://auth.example.com/auth',
//             realm: 'ondewo-ccai-platform',
//             clientId: 'ondewo-nlu-cai-sdk-public',
//             username: 'tech-user@example.com',
//             password: '••••••••',
//             languages: ['de']
//         });
//     </script>
//
// The generated `api` namespace and the constructed client are passed in as arguments (rather than
// referenced as globals) so the example logic stays hermetically unit-testable -- see `client.spec.js`.

'use strict';
/* global require, module */

const { login } = require('../auth/offlineTokenProvider');

/**
 * The generated gRPC-web namespace exported by the S2T bundle (`ondewo_s2t_api`). Only the members
 * this example touches are documented; the real object carries the full generated API surface.
 *
 * @typedef {object} S2tApi
 * @property {new (hostname: string, credentials: unknown, options: unknown) => S2tClient} Speech2TextPromiseClient
 *   Constructor for the promise-based Speech2Text service client.
 * @property {new () => S2tListPipelinesRequest} ListS2tPipelinesRequest
 *   Constructor for the `ListS2tPipelines` request message.
 */

/**
 * The subset of the generated `Speech2TextPromiseClient` this example calls.
 *
 * @typedef {object} S2tClient
 * @property {(request: S2tListPipelinesRequest, metadata: Record<string, string>) => Promise<S2tListPipelinesResponse>} listS2tPipelines
 *   Unary RPC returning the configured speech-to-text pipelines.
 */

/**
 * The generated `ListS2tPipelinesRequest` message surface this example sets.
 *
 * @typedef {object} S2tListPipelinesRequest
 * @property {(registeredOnly: boolean) => void} setRegisteredOnly
 *   Restrict the result to registered (running) pipelines.
 * @property {(languages: string[]) => void} setLanguagesList
 *   Filter the result to the given ISO language codes.
 */

/**
 * The generated `ListS2tPipelinesResponse` message surface this example reads.
 *
 * @typedef {object} S2tListPipelinesResponse
 * @property {() => S2tPipelineConfig[]} getPipelineConfigsList
 *   The configuration of every pipeline matching the request.
 */

/**
 * The generated `Speech2TextConfig` message surface this example reads.
 *
 * @typedef {object} S2tPipelineConfig
 * @property {() => string} getId
 *   The pipeline identifier.
 * @property {() => boolean} getActive
 *   Whether the pipeline is currently active.
 */

/**
 * A logged-in token provider (from `auth/offlineTokenProvider.login`) exposing the current bearer header.
 *
 * @typedef {object} TokenProvider
 * @property {() => string} getAuthorizationHeader
 *   The `Bearer <access_token>` value for the gRPC `authorization` metadata header.
 * @property {() => void} stop
 *   Stop the background token-refresh loop.
 */

/**
 * A flat summary of one pipeline, decoupled from the generated protobuf getters.
 *
 * @typedef {object} PipelineSummary
 * @property {string} id
 *   The pipeline identifier.
 * @property {boolean} active
 *   Whether the pipeline is currently active.
 */

/**
 * Build the gRPC-web call metadata carrying the Keycloak bearer token. This is the CURRENT auth
 * convention for ONDEWO clients: an `Authorization: Bearer <access_token>` header (the legacy
 * cai-token / HTTP-basic login was removed under the Keycloak migration).
 *
 * @param {TokenProvider} tokenProvider
 *   The logged-in provider returned by `login(...)`.
 * @returns {Record<string, string>}
 *   The per-call metadata object to pass as the second argument of any RPC.
 */
function buildAuthMetadata(tokenProvider) {
	return { authorization: tokenProvider.getAuthorizationHeader() };
}

/**
 * Construct the promise-based Speech2Text client against a gRPC-web (envoy) endpoint.
 *
 * @param {S2tApi} api
 *   The generated S2T namespace (`ondewo_s2t_api` global in the browser).
 * @param {string} grpcHost
 *   The gRPC-web endpoint, e.g. `https://s2t.example.com:443`.
 * @returns {S2tClient}
 *   The constructed Speech2Text promise client.
 */
function createSpeech2TextClient(api, grpcHost) {
	return new api.Speech2TextPromiseClient(grpcHost, null, null);
}

/**
 * Call the `listS2tPipelines` RPC and reduce the response to a plain array of pipeline summaries.
 *
 * @param {S2tApi} api
 *   The generated S2T namespace, used to build the request message.
 * @param {S2tClient} client
 *   The Speech2Text promise client from {@link createSpeech2TextClient}.
 * @param {TokenProvider} tokenProvider
 *   The logged-in provider supplying the bearer metadata.
 * @param {string[]} [languages]
 *   Optional ISO language codes to filter by; omit or pass `[]` for no language filter.
 * @returns {Promise<PipelineSummary[]>}
 *   One {@link PipelineSummary} per registered pipeline matching the filter.
 */
async function listRegisteredPipelines(api, client, tokenProvider, languages = []) {
	const request = new api.ListS2tPipelinesRequest();
	request.setRegisteredOnly(true);
	if (languages.length > 0) {
		request.setLanguagesList(languages);
	}
	const metadata = buildAuthMetadata(tokenProvider);
	const response = await client.listS2tPipelines(request, metadata);
	return response.getPipelineConfigsList().map((config) => ({
		id: config.getId(),
		active: config.getActive()
	}));
}

/**
 * End-to-end example: log in for a bearer token, build the client, list the registered pipelines and
 * print a short summary. The refresh loop is always stopped in the `finally` block.
 *
 * @param {object} config
 *   The example configuration.
 * @param {S2tApi} config.api
 *   The generated S2T namespace (`ondewo_s2t_api`).
 * @param {string} config.grpcHost
 *   The gRPC-web endpoint.
 * @param {string} config.keycloakUrl
 *   The Keycloak base URL.
 * @param {string} config.realm
 *   The Keycloak realm.
 * @param {string} config.clientId
 *   The PUBLIC SDK client id (`ondewo-nlu-cai-sdk-public`).
 * @param {string} config.username
 *   The resource-owner username for the ROPC login.
 * @param {string} config.password
 *   The resource-owner password for the ROPC login.
 * @param {string[]} [config.languages]
 *   Optional language filter forwarded to {@link listRegisteredPipelines}.
 * @param {{ login: typeof login }} [dependencies]
 *   Injectable seam for hermetic testing; defaults to the real `login` helper.
 * @returns {Promise<PipelineSummary[]>}
 *   The summarized pipelines that were listed.
 */
async function main(config, dependencies = { login }) {
	const tokenProvider = await dependencies.login({
		keycloakUrl: config.keycloakUrl,
		realm: config.realm,
		clientId: config.clientId,
		username: config.username,
		password: config.password
	});
	try {
		const client = createSpeech2TextClient(config.api, config.grpcHost);
		const pipelines = await listRegisteredPipelines(config.api, client, tokenProvider, config.languages);
		console.log(`Found ${pipelines.length} registered S2T pipeline(s):`);
		for (const pipeline of pipelines) {
			console.log(`  - ${pipeline.id} (active=${pipeline.active})`);
		}
		return pipelines;
	} finally {
		tokenProvider.stop();
	}
}

module.exports = { buildAuthMetadata, createSpeech2TextClient, listRegisteredPipelines, main };
