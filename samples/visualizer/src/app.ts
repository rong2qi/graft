/**
 * The application root. It is one fork, so the map has a single trunk, and it
 * loads the HTTP listener, the garden and the lens as its children.
 */
import { Effect } from "effect"

import { Graft, Plugin } from "@graftland/graft"
import server from "@graftland/plugin-http"
import router from "@graftland/plugin-http/router"

import { garden } from "./garden.ts"
import { visualizer } from "./visualizer.ts"

export const app = (port: number) =>
	Plugin.make({
		name: "@graftland/sample-visualizer/app",
		apply: Effect.fn("app.apply")(function* () {
			yield* (yield* Graft.plugin(router)).await
			yield* (yield* Graft.plugin(server, { port })).await
			yield* (yield* Graft.plugin(garden)).await
			yield* (yield* Graft.plugin(visualizer)).await
			yield* Effect.log("Graft Garden is ready")
		}),
	})
