/**
 * Run the visualizer: node src/main.ts
 *
 * Open http://127.0.0.1:4712 after the listener reports that it is ready.
 */
import { Effect, Layer, Logger } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"

import { Graft } from "@graftland/graft"

import { app } from "./app.ts"

const port = 4712

const program = Effect.gen(function* () {
	const root = yield* Graft.plugin(app(port))
	yield* root.await
	yield* Effect.log(`Graft Garden is open at http://127.0.0.1:${port}`)
	return yield* Effect.never
})

program.pipe(
	Effect.scoped,
	Effect.provide(
		Layer.provideMerge(
			Graft.layer,
			Layer.mergeAll(
				NodeServices.layer,
				Logger.layer([Logger.consolePretty()]),
			),
		),
	),
	NodeRuntime.runMain,
)
