/**
 * A small garden that exercises the parts of Graft worth seeing: services that
 * come and go, a nested branch, slow starts, and a plugin that fails on purpose.
 *
 * The garden controller owns every top-level plant. Its captured activation
 * context lets HTTP requests grow and prune branches in the garden's scope long
 * after its own `apply` has finished.
 */
import {
	Array,
	Context,
	Effect,
	HashMap,
	Option,
	Ref,
	Schema,
	Scope,
} from "effect"

import { Graft, Plugin, type Fork } from "@graftland/graft"

export class Soil extends Context.Service<
	Soil,
	{ readonly kind: "loam" | "sand" }
>()("@graftland/sample-visualizer/garden/Soil") {}

export class Water extends Context.Service<
	Water,
	{ readonly source: "rain" | "well" }
>()("@graftland/sample-visualizer/garden/Water") {}

export class Sun extends Context.Service<Sun, { readonly warmth: number }>()(
	"@graftland/sample-visualizer/garden/Sun",
) {}

/** A garden command failed while releasing a fork. */
export class GardenError extends Schema.TaggedError<
	GardenError,
	{ readonly brand: unique symbol }
>()("GardenError", {
	reason: Schema.String,
	cause: Schema.optionalKey(Schema.Cause(Schema.Unknown, Schema.Unknown)),
}) {}

export class Blight extends Schema.TaggedError<
	Blight,
	{ readonly brand: unique symbol }
>()("Blight", { plant: Schema.String }) {
	override get message(): string {
		return `${this.plant} is blighted`
	}
}

const soil = Plugin.make({
	name: "@graftland/sample-visualizer/garden/soil",
	apply: () =>
		Effect.gen(function* () {
			yield* Effect.sleep("160 millis")
			yield* Effect.acquireRelease(Effect.log("Soil is ready"), () =>
				Effect.log("Soil rests"),
			)
			yield* Graft.provide(Soil, { kind: "loam" })
		}),
})

const water = Plugin.make({
	name: "@graftland/sample-visualizer/garden/water",
	apply: () =>
		Effect.gen(function* () {
			yield* Effect.sleep("240 millis")
			yield* Effect.acquireRelease(Effect.log("Water is flowing"), () =>
				Effect.log("Water stops flowing"),
			)
			yield* Graft.provide(Water, { source: "rain" })
		}),
})

const sun = Plugin.make({
	name: "@graftland/sample-visualizer/garden/sun",
	apply: () =>
		Effect.gen(function* () {
			yield* Effect.sleep("120 millis")
			yield* Effect.acquireRelease(
				Effect.log("Sunlight reaches the garden"),
				() => Effect.log("Sunlight fades"),
			)
			yield* Graft.provide(Sun, { warmth: 21 })
		}),
})

const acorn = Plugin.make({
	name: "@graftland/sample-visualizer/garden/acorn",
	inject: [Soil, Water],
	apply: () =>
		Effect.gen(function* () {
			yield* Effect.sleep("420 millis")
			yield* Effect.acquireRelease(
				Effect.log("Acorn opens its first leaf"),
				() => Effect.log("Acorn closes"),
			)
		}),
})

const oak = Plugin.make({
	name: "@graftland/sample-visualizer/garden/oak",
	inject: [Soil, Water, Sun],
	apply: () =>
		Effect.gen(function* () {
			yield* Effect.sleep("620 millis")
			yield* Effect.acquireRelease(Effect.log("Oak opens its canopy"), () =>
				Effect.log("Oak folds its canopy"),
			)
			const child = yield* Graft.plugin(acorn)
			yield* child.await
		}),
})

const orchid = Plugin.make({
	name: "@graftland/sample-visualizer/garden/orchid",
	inject: [Water, Sun],
	apply: () =>
		Effect.gen(function* () {
			yield* Effect.sleep("1400 millis")
			yield* Effect.acquireRelease(Effect.log("Orchid blooms"), () =>
				Effect.log("Orchid closes"),
			)
		}),
})

const seedling = Plugin.make({
	name: "@graftland/sample-visualizer/garden/seedling",
	config: Schema.Struct({ name: Schema.String }),
	inject: [Soil, Water],
	apply: Effect.fn("garden.seedling")(function* ({ name }) {
		yield* Effect.sleep("320 millis")
		yield* Effect.acquireRelease(Effect.log(`${name} breaks ground`), () =>
			Effect.log(`${name} returns to the soil`),
		)
	}),
})

const bamboo = Plugin.make({
	name: "@graftland/sample-visualizer/garden/bamboo",
	config: Schema.Struct({ name: Schema.String }),
	inject: [Water, Sun],
	apply: Effect.fn("garden.bamboo")(function* ({ name }) {
		yield* Effect.sleep("2600 millis")
		yield* Effect.acquireRelease(
			Effect.log(`${name} reaches for the light`),
			() => Effect.log(`${name} is cut back`),
		)
	}),
})

const bramble = Plugin.make({
	name: "@graftland/sample-visualizer/garden/bramble",
	apply: () =>
		Effect.sleep("600 millis").pipe(
			Effect.andThen(Effect.fail(Blight.make({ plant: "bramble" }))),
		),
})

export type GrowKind = "seedling" | "bamboo" | "bramble"

export interface Grown {
	readonly id: number
	readonly name: string
}

interface Managed {
	readonly id: number
	readonly name: string
	readonly kind: "water" | "plant"
	readonly dispose: Effect.Effect<void, Fork.CleanupError>
	readonly restart: Effect.Effect<void>
}

export interface GardenShape {
	/** Grows a new top-level plant in the garden's scope. */
	readonly grow: (kind: GrowKind) => Effect.Effect<Grown>
	/** Unloads a plant the garden owns. Returns false when the fork is not ours. */
	readonly prune: (id: number) => Effect.Effect<boolean, GardenError>
	/** Restarts a plant the garden owns. Returns false when the fork is not ours. */
	readonly restart: (id: number) => Effect.Effect<boolean>
	/** Unloads the water provider, making every plant that injects Water Pending. */
	readonly drought: Effect.Effect<boolean, GardenError>
	/** Loads the water provider again. Returns false when water is already running. */
	readonly rain: Effect.Effect<boolean>
}

export class Garden extends Context.Service<Garden, GardenShape>()(
	"@graftland/sample-visualizer/garden",
) {}

export const garden = Plugin.make({
	name: "@graftland/sample-visualizer/garden",
	apply: () =>
		Effect.gen(function* () {
			// The garden's own context owns every later growth, so a request can
			// plant a fork without becoming its parent.
			const context = yield* Effect.context<Graft.Graft | Scope.Scope>()
			const managed = yield* Ref.make(HashMap.empty<number, Managed>())
			const seedlings = yield* Ref.make(0)
			const bamboos = yield* Ref.make(0)

			const register = (
				fork: {
					readonly id: number
					readonly dispose: Effect.Effect<void, Fork.CleanupError>
					readonly restart: Effect.Effect<void>
				},
				name: string,
				kind: Managed["kind"],
			) =>
				Ref.update(
					managed,
					HashMap.set(fork.id, {
						id: fork.id,
						name,
						kind,
						dispose: fork.dispose,
						restart: fork.restart,
					}),
				)

			const findWater = Effect.map(Ref.get(managed), (current) =>
				Array.findFirst(
					Array.fromIterable(HashMap.values(current)),
					(entry) => entry.kind === "water",
				),
			)

			const release = (entry: Managed) =>
				entry.dispose.pipe(
					Effect.mapError((error) =>
						GardenError.make({
							reason: `Could not release ${entry.name}`,
							cause: error.cause,
						}),
					),
					Effect.ensuring(Ref.update(managed, HashMap.remove(entry.id))),
				)

			// Providers settle first so the first plants start Active.
			const soilFork = yield* Graft.plugin(soil)
			yield* register(soilFork, soil.name, "plant")
			yield* soilFork.await

			const sunFork = yield* Graft.plugin(sun)
			yield* register(sunFork, sun.name, "plant")
			yield* sunFork.await

			const waterFork = yield* Graft.plugin(water)
			yield* register(waterFork, water.name, "water")
			yield* waterFork.await

			for (const plant of [oak, orchid]) {
				const fork = yield* Graft.plugin(plant)
				yield* register(fork, plant.name, "plant")
			}

			const grow = (kind: GrowKind): Effect.Effect<Grown> =>
				Effect.gen(function* () {
					if (kind === "seedling") {
						const index = yield* Ref.updateAndGet(
							seedlings,
							(current) => current + 1,
						)
						const name = `seedling-${index}`
						const fork = yield* Graft.plugin(seedling, { name }).pipe(
							Effect.provideContext(context),
						)
						yield* register(fork, seedling.name, "plant")
						return { id: fork.id, name }
					}
					if (kind === "bamboo") {
						const index = yield* Ref.updateAndGet(
							bamboos,
							(current) => current + 1,
						)
						const name = `bamboo-${index}`
						const fork = yield* Graft.plugin(bamboo, { name }).pipe(
							Effect.provideContext(context),
						)
						yield* register(fork, bamboo.name, "plant")
						return { id: fork.id, name }
					}
					const fork = yield* Graft.plugin(bramble).pipe(
						Effect.provideContext(context),
					)
					yield* register(fork, bramble.name, "plant")
					return { id: fork.id, name: "bramble" }
				})

			const prune = (id: number): Effect.Effect<boolean, GardenError> =>
				Effect.gen(function* () {
					const current = yield* Ref.get(managed)
					const entry = Option.getOrUndefined(HashMap.get(current, id))
					if (entry === undefined) return false
					yield* release(entry)
					yield* Effect.log(`Pruned ${entry.name}`)
					return true
				})

			const restart = (id: number): Effect.Effect<boolean> =>
				Effect.gen(function* () {
					const current = yield* Ref.get(managed)
					const entry = Option.getOrUndefined(HashMap.get(current, id))
					if (entry === undefined) return false
					yield* entry.restart
					yield* Effect.log(`Restarted ${entry.name}`)
					return true
				})

			const drought: Effect.Effect<boolean, GardenError> = Effect.gen(
				function* () {
					const existing = yield* findWater
					if (Option.isNone(existing)) return false
					yield* release(existing.value)
					yield* Effect.log("The garden is dry")
					return true
				},
			)

			const rain: Effect.Effect<boolean> = Effect.gen(function* () {
				const existing = yield* findWater
				if (Option.isSome(existing)) return false
				const fork = yield* Graft.plugin(water).pipe(
					Effect.provideContext(context),
				)
				yield* register(fork, water.name, "water")
				yield* Effect.log("Rain returns to the garden")
				return true
			})

			yield* Graft.provide(Garden, {
				grow,
				prune,
				restart,
				drought,
				rain,
			})
		}),
})
