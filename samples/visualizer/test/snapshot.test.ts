import { Cause, String } from "effect"
import { assert, it } from "@effect/vitest"

import { Fork } from "@graftland/graft"

import { encodeTree, logEvent, snapshotEvent } from "../src/snapshot.ts"

const tree = (patch: Partial<Fork.ForkTree>): Fork.ForkTree => ({
	id: 1,
	name: "@graftland/sample-visualizer/garden/oak",
	input: undefined,
	state: Fork.ForkState.Active(),
	children: [],
	...patch,
})

it("labels a configured seedling by its input name", () => {
	const node = encodeTree(
		tree({
			name: "@graftland/sample-visualizer/garden/seedling",
			input: { name: "seedling-3" },
			state: Fork.ForkState.Loading(),
		}),
	)
	assert.strictEqual(node.label, "seedling-3")
	assert.strictEqual(node.state, "Loading")
	assert.strictEqual(node.detail, "Finding its place")
})

it("explains which services a pending fork waits for", () => {
	const node = encodeTree(
		tree({
			state: Fork.ForkState.Pending({
				missing: [
					"@graftland/sample-visualizer/garden/Water",
					"@graftland/sample-visualizer/garden/Soil",
				],
			}),
		}),
	)
	assert.include(node.detail, "Water")
	assert.include(node.detail, "Soil")
})

it("keeps the cause of a failed fork for the inspector", () => {
	const node = encodeTree(
		tree({ state: Fork.ForkState.Failed({ cause: Cause.fail("blight") }) }),
	)
	assert.isString(node.detail)
	assert.include(node.detail, "blight")
})

it("turns a circular config into a readable, finite string", () => {
	const input: Record<string, unknown> = { name: "loop" }
	input["self"] = input
	const node = encodeTree(tree({ input }))
	assert.isString(node.input)
	assert.include(node.input, "[circular]")
})

it("wraps a snapshot as one server-sent event", () => {
	const event = snapshotEvent([tree({ name: "app" })])
	assert.isTrue(String.startsWith("data: ")(event))
	assert.isTrue(String.endsWith("\n\n")(event))
	// @effect-diagnostics-next-line globalJson:off -- the event is the JSON contract under test.
	const payload = JSON.parse(String.slice(6, -2)(event))
	assert.strictEqual(payload.type, "snapshot")
	assert.strictEqual(payload.tree[0].name, "app")
})

it("formats a log entry with its fork and plugin annotations", () => {
	const event = logEvent({
		// @effect-diagnostics-next-line globalDate:off -- a fixed timestamp keeps the wire format deterministic.
		date: new Date("2026-11-14T05:00:00.000Z"),
		level: "Info",
		message: ["hello", { leaves: 2 }],
		annotations: {
			"graft.fork": 7,
			"graft.plugin": "garden/oak",
		},
	})
	// @effect-diagnostics-next-line globalJson:off -- the event is the JSON contract under test.
	const payload = JSON.parse(String.slice(6, -2)(event))
	assert.strictEqual(payload.type, "log")
	assert.strictEqual(payload.level, "Info")
	assert.include(payload.message, "hello")
	assert.include(payload.message, "leaves")
	assert.strictEqual(payload.fork, 7)
	assert.strictEqual(payload.plugin, "garden/oak")
	assert.strictEqual(payload.at, "2026-11-14T05:00:00.000Z")
})
