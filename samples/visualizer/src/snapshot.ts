/**
 * Wire formats for the browser. These functions are pure so the tree encoding
 * can be tested without starting a server.
 */
import { Array, Cause, Option, String } from "effect"

import type { Fork } from "@graftland/graft"

export type StateTag = "Loading" | "Pending" | "Active" | "Failed" | "Disposed"

export interface NodeView {
	readonly id: number
	readonly name: string
	readonly label: string
	readonly state: StateTag
	readonly detail: string | null
	readonly input: string | null
	readonly children: ReadonlyArray<NodeView>
}

export interface SnapshotEvent {
	readonly type: "snapshot"
	readonly tree: ReadonlyArray<NodeView>
}

export interface LogLike {
	readonly date: Date
	readonly level: string
	readonly message: unknown
	readonly annotations: Readonly<Record<string, unknown>>
}

export interface LogEvent {
	readonly type: "log"
	readonly at: string
	readonly level: string
	readonly message: string
	readonly fork: number | null
	readonly plugin: string | null
}

export type StreamEvent = SnapshotEvent | LogEvent

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
	typeof value === "object" && value !== null && !Array.isArray(value)

const lastSegment = (name: string): string =>
	Option.getOrElse(Array.last(String.split(name, "/")), () => name)

const truncate = (value: string, limit: number): string =>
	String.length(value) > limit ? `${String.slice(0, limit)(value)}…` : value

const encodeInput = (input: unknown): string | null => {
	if (input === undefined) return null
	const seen = new WeakSet<object>()
	try {
		// @effect-diagnostics-next-line globalJson:off -- plugin input is arbitrary host data; this is a best-effort display copy.
		const encoded = JSON.stringify(
			input,
			(_key, value: unknown) => {
				if (typeof value === "bigint") return `${value.toString()}n`
				if (typeof value === "function") return "[function]"
				if (typeof value === "symbol") return value.toString()
				if (typeof value === "object" && value !== null) {
					if (seen.has(value)) return "[circular]"
					seen.add(value)
				}
				return value
			},
			2,
		)
		return encoded === undefined ? null : truncate(encoded, 2400)
	} catch {
		return null
	}
}

const renderValue = (value: unknown): string => {
	if (typeof value === "string") return value
	if (value === null || value === undefined) return globalThis.String(value)
	try {
		// @effect-diagnostics-next-line globalJson:off -- log payloads are arbitrary; serialization is best-effort for display.
		const encoded = JSON.stringify(value)
		return encoded === undefined ? globalThis.String(value) : encoded
	} catch {
		return globalThis.String(value)
	}
}

const messageText = (message: unknown): string =>
	truncate(
		Array.isArray(message)
			? Array.join(
					Array.map(message, (part) => renderValue(part)),
					" ",
				)
			: renderValue(message),
		1200,
	)

const detailOf = (state: Fork.ForkState): string | null => {
	switch (state._tag) {
		case "Pending":
			return `Waiting for ${Array.join(state.missing, ", ")}`
		case "Failed":
			return truncate(Cause.pretty(state.cause), 1600)
		case "Loading":
			return "Finding its place"
		default:
			return null
	}
}

export const encodeTree = (tree: Fork.ForkTree): NodeView => {
	const inputName =
		isRecord(tree.input) && typeof tree.input["name"] === "string"
			? tree.input["name"]
			: undefined
	return {
		id: tree.id,
		name: tree.name,
		label: inputName ?? lastSegment(tree.name),
		state: tree.state._tag,
		detail: detailOf(tree.state),
		input: encodeInput(tree.input),
		children: Array.map(tree.children, encodeTree),
	}
}

export const encodeForest = (
	trees: ReadonlyArray<Fork.ForkTree>,
): ReadonlyArray<NodeView> => Array.map(trees, encodeTree)

const encodeEvent = (event: StreamEvent): string => {
	// @effect-diagnostics-next-line globalJson:off -- the event is built from primitives and pre-encoded strings.
	const data = JSON.stringify(event)
	return `data: ${data}\n\n`
}

export const snapshotEvent = (trees: ReadonlyArray<Fork.ForkTree>): string =>
	encodeEvent({ type: "snapshot", tree: encodeForest(trees) })

export const logEvent = (entry: LogLike): string => {
	const fork = entry.annotations["graft.fork"]
	const plugin = entry.annotations["graft.plugin"]
	return encodeEvent({
		type: "log",
		at: entry.date.toISOString(),
		level: entry.level,
		message: messageText(entry.message),
		fork: typeof fork === "number" ? fork : null,
		plugin: typeof plugin === "string" ? plugin : null,
	})
}
