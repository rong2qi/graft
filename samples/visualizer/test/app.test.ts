import { Deferred, Effect, Layer, String } from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"
import { NodeServices } from "@effect/platform-node"
import { assert, it } from "@effect/vitest"

import { Graft, Plugin } from "@graftland/graft"
import * as Http from "@graftland/plugin-http/Http"

import { app } from "../src/app.ts"

const run = <A, E>(
	effect: Effect.Effect<
		A,
		E,
		Graft.Graft | import("effect/Scope").Scope | HttpClient.HttpClient
	>,
) =>
	effect.pipe(
		Effect.scoped,
		Effect.provide(
			Layer.provideMerge(
				Layer.fresh(Graft.layer),
				Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer),
			),
		),
	)

it.live("serves the garden and its live fork tree", () =>
	Effect.gen(function* () {
		const ready = yield* Deferred.make<string>()
		yield* Graft.plugin(
			Plugin.make({
				name: "test/capture-server",
				inject: [Http.Server],
				apply: () =>
					Effect.gen(function* () {
						const server = yield* Http.Server
						yield* Deferred.succeed(ready, server.url)
					}),
			}),
		)
		const root = yield* Graft.plugin(app(0))
		yield* root.await
		const url = yield* Deferred.await(ready)
		const client = yield* HttpClient.HttpClient

		const home = yield* client.get(url)
		assert.strictEqual(home.status, 200)
		const html = yield* home.text
		assert.isTrue(String.includes("Graft <em>花园</em>")(html))

		const stateResponse = yield* client.get(`${url}/api/state`)
		assert.strictEqual(stateResponse.status, 200)
		const state = yield* stateResponse.text
		assert.isTrue(String.includes("@graftland/sample-visualizer/garden")(state))
		assert.isTrue(String.includes('"state":"Active"')(state))
	}).pipe(run),
)
