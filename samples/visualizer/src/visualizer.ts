/**
 * The lens. It serves the garden map and the small command API that lets the
 * browser grow and prune branches without ever touching a fork handle.
 */
import { Effect, FileSystem, Option, Schema, Stream } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"

import { Graft, Plugin } from "@graftland/graft"
import * as Http from "@graftland/plugin-http/Http"

import { Garden } from "./garden.ts"
import { encodeForest, logEvent, snapshotEvent } from "./snapshot.ts"

const GrowCommand = Schema.Struct({
	kind: Schema.Literals(["seedling", "bamboo", "bramble"]),
})
const ForkCommand = Schema.Struct({ id: Schema.Int })
const WaterCommand = Schema.Struct({
	state: Schema.Literals(["drought", "rain"]),
})

const badRequest = (reason: string) =>
	HttpServerResponse.jsonUnsafe(
		{ ok: false, error: reason },
		{ status: 400, headers: { "cache-control": "no-store" } },
	)

const conflict = (reason: string) =>
	HttpServerResponse.jsonUnsafe(
		{ ok: false, error: reason },
		{ status: 409, headers: { "cache-control": "no-store" } },
	)

const ok = (body: Readonly<Record<string, unknown>>) =>
	HttpServerResponse.jsonUnsafe(body, {
		headers: { "cache-control": "no-store" },
	})

const readBody = <A>(
	schema: Schema.ConstraintDecoder<A>,
): Effect.Effect<
	Option.Option<A>,
	never,
	HttpServerRequest.HttpServerRequest
> =>
	HttpServerRequest.schemaBodyJson(schema).pipe(
		Effect.asSome,
		// A local UI treats an unreadable body as a missing command.
		Effect.orElseSucceed(() => Option.none<A>()),
	)

/** Every route sees the request and the plugin runtime; the mount supplies both. */
type RouteEnvironment = HttpServerRequest.HttpServerRequest | Graft.Graft

type RouteMethod = "GET" | "POST"

const route = (
	method: RouteMethod,
	path: `/${string}`,
	handler: Effect.Effect<
		HttpServerResponse.HttpServerResponse,
		never,
		RouteEnvironment
	>,
) => HttpRouter.route(method, path, handler)

const publicDirectory = decodeURIComponent(
	new URL("../public/", import.meta.url).pathname,
)

export const visualizer = Plugin.make({
	name: "@graftland/sample-visualizer/lens",
	inject: [Garden, FileSystem.FileSystem],
	apply: Effect.fnUntraced(function* () {
		const garden = yield* Garden
		const fs = yield* FileSystem.FileSystem
		const assets = yield* Effect.all(
			{
				index: fs.readFileString(`${publicDirectory}index.html`),
				script: fs.readFileString(`${publicDirectory}app.js`),
				style: fs.readFileString(`${publicDirectory}style.css`),
			},
			{ concurrency: "unbounded" },
		)

		const routes = HttpRouter.addAll([
			route("GET", "/", Effect.succeed(HttpServerResponse.html(assets.index))),
			route(
				"GET",
				"/app.js",
				Effect.succeed(
					HttpServerResponse.text(assets.script, {
						contentType: "text/javascript; charset=utf-8",
						headers: { "cache-control": "no-store" },
					}),
				),
			),
			route(
				"GET",
				"/style.css",
				Effect.succeed(
					HttpServerResponse.text(assets.style, {
						contentType: "text/css; charset=utf-8",
						headers: { "cache-control": "no-store" },
					}),
				),
			),
			route(
				"GET",
				"/api/health",
				Effect.succeed(
					HttpServerResponse.text("ok\n", {
						headers: { "cache-control": "no-store" },
					}),
				),
			),
			route(
				"GET",
				"/api/state",
				Effect.gen(function* () {
					const forest = yield* Stream.runHead(Graft.forks)
					return ok({
						tree: encodeForest(Option.getOrElse(forest, () => [])),
					})
				}),
			),
			route(
				"GET",
				"/api/events",
				Effect.gen(function* () {
					const graft = yield* Graft.Graft
					const events = Stream.merge(
						Graft.forks.pipe(Stream.map(snapshotEvent)),
						Graft.logs.pipe(Stream.map(logEvent)),
					).pipe(Stream.provideService(Graft.Graft, graft))
					return HttpServerResponse.stream(events.pipe(Stream.encodeText), {
						contentType: "text/event-stream; charset=utf-8",
						headers: {
							"cache-control": "no-cache",
							connection: "keep-alive",
							"x-accel-buffering": "no",
						},
					})
				}),
			),
			route(
				"POST",
				"/api/grow",
				Effect.gen(function* () {
					const command = yield* readBody(GrowCommand)
					if (Option.isNone(command))
						return badRequest("Expected a kind of seedling, bamboo or bramble")
					const grown = yield* garden.grow(command.value.kind)
					return ok({ ok: true, fork: grown })
				}),
			),
			route(
				"POST",
				"/api/prune",
				Effect.gen(function* () {
					const command = yield* readBody(ForkCommand)
					if (Option.isNone(command))
						return badRequest("Expected the fork id to prune")
					const removed = yield* garden.prune(command.value.id).pipe(
						Effect.catchTag("GardenError", (error) =>
							Effect.gen(function* () {
								yield* Effect.logError(error.reason, error.cause)
								return false
							}),
						),
					)
					return removed
						? ok({ ok: true })
						: conflict(
								"This branch belongs to another fork. Prune the branch that owns it.",
							)
				}),
			),
			route(
				"POST",
				"/api/restart",
				Effect.gen(function* () {
					const command = yield* readBody(ForkCommand)
					if (Option.isNone(command))
						return badRequest("Expected the fork id to restart")
					const restarted = yield* garden.restart(command.value.id)
					return restarted
						? ok({ ok: true })
						: conflict(
								"This branch belongs to another fork. Restart the branch that owns it.",
							)
				}),
			),
			route(
				"POST",
				"/api/water",
				Effect.gen(function* () {
					const command = yield* readBody(WaterCommand)
					if (Option.isNone(command))
						return badRequest("Expected either drought or rain")
					const changed =
						command.value.state === "drought"
							? yield* garden.drought.pipe(
									Effect.catchTag("GardenError", (error) =>
										Effect.gen(function* () {
											yield* Effect.logError(error.reason, error.cause)
											return false
										}),
									),
								)
							: yield* garden.rain
					return ok({ ok: true, changed })
				}),
			),
		])

		yield* Http.mount(routes)
		yield* Effect.log("Graft Garden is open")
	}),
})
