/* Graft Garden: a small, dependency-free map of a live Graft fork tree. */

const NODE_WIDTH = 176
const NODE_HEIGHT = 60
const GAP_X = 56
const GAP_Y = 8
const ROOT_GAP = 30

const PRETTY_NAMES = new Map([
	["@graftland/sample-visualizer/app", "Graft"],
	["@graftland/sample-visualizer/garden", "花园"],
	["@graftland/sample-visualizer/lens", "观察器"],
	["@graftland/plugin-http", "HTTP"],
	["@graftland/plugin-http/router", "路由"],
	["@graftland/sample-visualizer/garden/soil", "土壤"],
	["@graftland/sample-visualizer/garden/sun", "阳光"],
	["@graftland/sample-visualizer/garden/water", "水"],
	["@graftland/sample-visualizer/garden/oak", "橡树"],
	["@graftland/sample-visualizer/garden/acorn", "橡果"],
	["@graftland/sample-visualizer/garden/orchid", "兰花"],
	["@graftland/sample-visualizer/garden/bramble", "荆棘"],
])

const STATE_NAMES = {
	Loading: "加载中",
	Pending: "等待中",
	Active: "运行中",
	Failed: "失败",
	Disposed: "已卸载",
}

const LEVEL_NAMES = {
	info: "信息",
	warn: "警告",
	error: "错误",
	fatal: "致命",
	debug: "调试",
	trace: "追踪",
	all: "全部",
	none: "无",
}

const elements = {
	viewport: document.getElementById("viewport"),
	canvas: document.getElementById("canvas"),
	nodes: document.getElementById("nodes"),
	links: document.getElementById("links"),
	empty: document.getElementById("empty"),
	stageSummary: document.getElementById("stage-summary"),
	countForks: document.getElementById("count-forks"),
	countActive: document.getElementById("count-active"),
	countLoading: document.getElementById("count-loading"),
	countPending: document.getElementById("count-pending"),
	countFailed: document.getElementById("count-failed"),
	failedMetric: document.getElementById("failed-metric"),
	connection: document.getElementById("connection"),
	connectionLabel: document.getElementById("connection-label"),
	selectionCount: document.getElementById("selection-count"),
	inspectorEmpty: document.getElementById("inspector-empty"),
	inspector: document.getElementById("inspector"),
	inspectKind: document.getElementById("inspect-kind"),
	inspectLabel: document.getElementById("inspect-label"),
	inspectName: document.getElementById("inspect-name"),
	inspectState: document.getElementById("inspect-state"),
	inspectId: document.getElementById("inspect-id"),
	inspectDepth: document.getElementById("inspect-depth"),
	inspectChildren: document.getElementById("inspect-children"),
	inspectDetailWrap: document.getElementById("inspect-detail-wrap"),
	inspectDetail: document.getElementById("inspect-detail"),
	inspectInputWrap: document.getElementById("inspect-input-wrap"),
	inspectInput: document.getElementById("inspect-input"),
	inspectHint: document.getElementById("inspect-hint"),
	restart: document.getElementById("restart"),
	prune: document.getElementById("prune"),
	waterButton: document.getElementById("water-button"),
	zoomOut: document.getElementById("zoom-out"),
	zoomIn: document.getElementById("zoom-in"),
	zoomFit: document.getElementById("zoom-fit"),
	logs: document.getElementById("logs"),
	logsToggle: document.getElementById("logs-toggle"),
	logList: document.getElementById("log-list"),
	logEmpty: document.getElementById("log-empty"),
	logCount: document.getElementById("log-count"),
	toast: document.getElementById("toast"),
}

const model = {
	roots: [],
	nodes: new Map(),
	parents: new Map(),
	depths: new Map(),
	layout: { nodes: [], links: [], width: 0, height: 0 },
	selected: null,
	pendingSelect: null,
	seen: new Set(),
	logs: [],
	firstSnapshot: true,
	busy: false,
	waterAvailable: false,
}

const view = {
	scale: 1,
	x: 0,
	y: 0,
	user: false,
}

let source = null
let greeted = false
let toastTimer = null
let pan = null

const wantedFork = Number(
	new URLSearchParams(window.location.search).get("fork") ?? "",
)

/* ------------------------------------------------------------------ helpers */

const prettyLabel = (node) => {
	const known = PRETTY_NAMES.get(node.name)
	if (known !== undefined) return known
	const seedling = /^seedling-(\d+)$/.exec(node.label)
	if (seedling !== null) return `幼苗 ${seedling[1]}`
	const bamboo = /^bamboo-(\d+)$/.exec(node.label)
	if (bamboo !== null) return `竹子 ${bamboo[1]}`
	return node.label
}

const stateName = (state) => STATE_NAMES[state] ?? state

const levelName = (level) => LEVEL_NAMES[level] ?? level

const stateClass = (state) => state.toLowerCase()

const formatTime = (value) => {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return ""
	return date.toLocaleTimeString(undefined, {
		hour12: false,
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	})
}

const createSpan = (className, text) => {
	const span = document.createElement("span")
	span.className = className
	if (text !== undefined) span.textContent = text
	return span
}

const clamp = (value, minimum, maximum) =>
	Math.min(maximum, Math.max(minimum, value))

/* ------------------------------------------------------------------- layout */

const buildLayout = (roots) => {
	const placed = []
	const links = []
	let cursor = 0

	const place = (node, depth) => {
		const childPlaced = node.children.map((child) => place(child, depth + 1))
		let y
		if (childPlaced.length === 0) {
			y = cursor
			cursor += NODE_HEIGHT + GAP_Y
		} else {
			const first = childPlaced[0]
			const last = childPlaced[childPlaced.length - 1]
			y = (first.y + last.y) / 2
		}
		const item = {
			node,
			depth,
			x: depth * (NODE_WIDTH + GAP_X),
			y,
		}
		placed.push(item)
		for (const child of childPlaced) links.push({ from: item, to: child })
		return item
	}

	roots.forEach((root, index) => {
		place(root, 0)
		if (index < roots.length - 1) cursor += ROOT_GAP
	})

	return {
		nodes: placed,
		links,
		width: placed.reduce(
			(maximum, item) => Math.max(maximum, item.x + NODE_WIDTH),
			0,
		),
		height: placed.reduce(
			(maximum, item) => Math.max(maximum, item.y + NODE_HEIGHT),
			0,
		),
	}
}

const ancestorsOf = (id) => {
	const path = new Set()
	let current = id
	while (current !== null && current !== undefined) {
		path.add(current)
		current = model.parents.get(current)
	}
	return path
}

const gardenNode = () =>
	Array.from(model.nodes.values()).find(
		(node) => node.name === "@graftland/sample-visualizer/garden",
	)

const isManaged = (id) => {
	const garden = gardenNode()
	return garden !== undefined && model.parents.get(id) === garden.id
}

const findWater = () =>
	Array.from(model.nodes.values()).find((node) => node.name.endsWith("/water"))

/* ------------------------------------------------------------------- render */

const applySnapshot = (roots) => {
	const entered = new Set()
	const nodes = new Map()
	const parents = new Map()
	const depths = new Map()

	const walk = (node, parent, depth) => {
		nodes.set(node.id, node)
		parents.set(node.id, parent)
		depths.set(node.id, depth)
		if (!model.seen.has(node.id)) entered.add(node.id)
		for (const child of node.children) walk(child, node.id, depth + 1)
	}

	for (const root of roots) walk(root, null, 0)

	const focus = model.pendingSelect
	const layout = buildLayout(roots)

	model.roots = roots
	model.nodes = nodes
	model.parents = parents
	model.depths = depths
	model.layout = layout

	if (model.pendingSelect !== null && nodes.has(model.pendingSelect)) {
		model.selected = model.pendingSelect
		model.pendingSelect = null
	}
	if (
		model.firstSnapshot &&
		model.selected === null &&
		Number.isInteger(wantedFork) &&
		nodes.has(wantedFork)
	) {
		model.selected = wantedFork
	}
	if (model.selected !== null && !nodes.has(model.selected)) {
		model.selected = null
	}

	renderTree(entered)
	renderInspector()
	updateChrome()

	for (const id of nodes.keys()) model.seen.add(id)

	if (model.firstSnapshot) {
		model.firstSnapshot = false
		requestAnimationFrame(fit)
	} else if (focus !== null) {
		requestAnimationFrame(() => ensureVisible(focus))
	}
}

const renderTree = (entered) => {
	const { nodes, links, width, height } = model.layout

	elements.nodes.replaceChildren()
	elements.links.replaceChildren()
	elements.links.setAttribute(
		"viewBox",
		`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`,
	)
	elements.links.setAttribute("width", String(Math.max(1, width)))
	elements.links.setAttribute("height", String(Math.max(1, height)))

	for (const item of nodes) {
		const { node, depth } = item
		const element = document.createElement("button")
		element.type = "button"
		element.className = `node state-${stateClass(node.state)}`
		element.style.left = `${item.x}px`
		element.style.top = `${item.y}px`
		element.dataset.id = String(node.id)
		element.setAttribute(
			"aria-label",
			`${prettyLabel(node)}，${stateName(node.state)}，fork ${node.id}`,
		)
		element.title = `${node.name}\n${stateName(node.state)} · fork #${node.id}`

		if (model.selected === node.id) element.classList.add("selected")
		if (entered.has(node.id)) element.classList.add("is-new")
		if (depth === 0) element.classList.add("is-root")

		const top = document.createElement("span")
		top.className = "node-top"
		top.append(
			createSpan("node-label", prettyLabel(node)),
			createSpan("node-fork", `#${node.id}`),
		)

		const meta = document.createElement("span")
		meta.className = "node-meta"
		meta.append(
			createSpan("dot", ""),
			createSpan("node-state", stateName(node.state)),
		)
		const detail = node.children.length > 0 ? `${node.children.length} 支` : ""
		if (detail !== "") meta.append(createSpan("node-pending-note", detail))

		element.append(top, meta)
		element.addEventListener("click", (event) => {
			event.stopPropagation()
			select(node.id)
		})
		elements.nodes.append(element)
	}

	renderLinks()
	elements.empty.hidden = nodes.length > 0
}

const linkPath = (link) => {
	const x1 = link.from.x + NODE_WIDTH
	const y1 = link.from.y + NODE_HEIGHT / 2
	const x2 = link.to.x
	const y2 = link.to.y + NODE_HEIGHT / 2
	const middle = (x1 + x2) / 2
	return `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`
}

const renderLinks = () => {
	elements.links.replaceChildren()
	const highlighted =
		model.selected === null ? new Set() : ancestorsOf(model.selected)
	for (const link of model.layout.links) {
		const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
		path.setAttribute("d", linkPath(link))
		if (highlighted.has(link.from.node.id) && highlighted.has(link.to.node.id))
			path.classList.add("is-selected")
		if (link.to.node.state === "Failed") path.classList.add("is-failed")
		elements.links.append(path)
	}
}

const select = (id) => {
	if (!model.nodes.has(id)) return
	model.selected = id
	updateSelectedClasses()
	renderLinks()
	renderInspector()
	updateActionButtons()
}

const clearSelection = () => {
	if (model.selected === null) return
	model.selected = null
	updateSelectedClasses()
	renderLinks()
	renderInspector()
	updateActionButtons()
}

const updateSelectedClasses = () => {
	for (const element of elements.nodes.children) {
		element.classList.toggle(
			"selected",
			Number(element.dataset.id) === model.selected,
		)
	}
}

/* ---------------------------------------------------------------- inspector */

const renderInspector = () => {
	const node =
		model.selected === null ? undefined : model.nodes.get(model.selected)
	elements.inspectorEmpty.hidden = node !== undefined
	elements.inspector.hidden = node === undefined
	elements.selectionCount.textContent =
		node === undefined ? "未选中" : `fork #${node.id}`

	if (node === undefined) {
		updateActionButtons()
		return
	}

	const depth = model.depths.get(node.id) ?? 0
	const managed = isManaged(node.id)
	elements.inspectKind.textContent =
		depth === 0 ? "根插件" : depth === 1 ? "主干插件" : "分支插件"
	elements.inspectLabel.textContent = prettyLabel(node)
	elements.inspectName.textContent = node.name
	elements.inspectState.className = `state-chip state-${stateClass(node.state)}`
	elements.inspectState.textContent = stateName(node.state)
	elements.inspectState.title = node.state
	elements.inspectId.textContent = `#${node.id}`
	elements.inspectDepth.textContent = String(depth)
	elements.inspectChildren.textContent = String(node.children.length)

	const detail =
		node.state === "Pending" && node.detail !== null
			? node.detail
					.replace(/^Waiting for /, "正在等待：")
					.replaceAll(", ", "、")
			: node.detail
	elements.inspectDetailWrap.hidden = detail === null
	if (detail !== null) {
		elements.inspectDetail.textContent = detail
		elements.inspectDetail.className =
			node.state === "Failed"
				? "detail-failed"
				: node.state === "Pending"
					? "detail-pending"
					: ""
	}

	elements.inspectInputWrap.hidden = node.input === null
	if (node.input !== null) elements.inspectInput.textContent = node.input

	let hint
	if (managed) {
		hint =
			"这个分支由花园直接拥有。重启会重新加载它，移除会卸载它和它下面的所有分支。"
	} else if (node.name === "@graftland/sample-visualizer/garden") {
		hint = "花园主干拥有它下面的所有分支。"
	} else if (depth === 0) {
		hint = "应用根节点，拥有监听服务器、花园和观察器。"
	} else if (node.name.startsWith("@graftland/plugin-http")) {
		hint = "HTTP 基础设施在这张地图中是固定的。"
	} else {
		hint = "这个分支由父分支拥有。请重启或移除拥有它的分支。"
	}
	elements.inspectHint.textContent = hint

	updateActionButtons()
}

const updateChrome = () => {
	const counts = { Loading: 0, Pending: 0, Active: 0, Failed: 0, Disposed: 0 }
	for (const node of model.nodes.values()) {
		if (counts[node.state] !== undefined) counts[node.state] += 1
	}

	elements.countForks.textContent = String(model.nodes.size)
	elements.countActive.textContent = String(counts.Active)
	elements.countLoading.textContent = String(counts.Loading)
	elements.countPending.textContent = String(counts.Pending)
	elements.countFailed.textContent = String(counts.Failed)
	elements.failedMetric.hidden = counts.Failed === 0

	const water = findWater()
	model.waterAvailable = water !== undefined
	elements.waterButton.textContent = water === undefined ? "浇水" : "断水"
	elements.waterButton.title =
		water === undefined ? "把水接回来（W）" : "移走水源（W）"

	if (counts.Failed > 0) {
		elements.stageSummary.textContent = `${model.nodes.size} 个 fork · ${counts.Active} 运行中 · ${counts.Failed} 失败`
	} else if (counts.Pending > 0) {
		elements.stageSummary.textContent = `${model.nodes.size} 个 fork · ${counts.Active} 运行中 · ${counts.Pending} 等待中`
	} else {
		elements.stageSummary.textContent = `${model.nodes.size} 个 fork · ${counts.Active} 运行中`
	}

	updateActionButtons()
}

const updateActionButtons = () => {
	for (const button of document.querySelectorAll("[data-grow]")) {
		button.disabled = model.busy
	}
	elements.waterButton.disabled = model.busy

	const managed = model.selected !== null && isManaged(model.selected)
	elements.restart.disabled = model.busy || !managed
	elements.prune.disabled = model.busy || !managed
}

/* -------------------------------------------------------------------- view */

const applyView = () => {
	elements.canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
}

const fit = () => {
	const width = elements.viewport.clientWidth
	const height = elements.viewport.clientHeight
	const map = model.layout
	if (map.width === 0 || map.height === 0) return

	const paddingX = 42
	const paddingTop = 26
	const paddingBottom = 48
	const scale = Math.min(
		1.08,
		(width - paddingX * 2) / map.width,
		(height - paddingTop - paddingBottom) / map.height,
	)
	view.scale = Math.max(0.22, scale)
	view.x = (width - map.width * view.scale) / 2
	view.y =
		paddingTop +
		(height - paddingTop - paddingBottom - map.height * view.scale) / 2
	view.user = false
	applyView()
}

const ensureVisible = (id) => {
	const item = model.layout.nodes.find((entry) => entry.node.id === id)
	if (item === undefined) return
	const width = elements.viewport.clientWidth
	const height = elements.viewport.clientHeight
	const left = view.x + item.x * view.scale
	const top = view.y + item.y * view.scale
	const right = left + NODE_WIDTH * view.scale
	const bottom = top + NODE_HEIGHT * view.scale
	const pad = 56
	let dx = 0
	let dy = 0
	if (left < pad) dx = pad - left
	else if (right > width - pad) dx = width - pad - right
	if (top < pad) dy = pad - top
	else if (bottom > height - pad) dy = height - pad - bottom
	if (dx === 0 && dy === 0) return
	view.x += dx
	view.y += dy
	view.user = true
	applyView()
}

const zoomBy = (factor) => {
	const width = elements.viewport.clientWidth
	const height = elements.viewport.clientHeight
	const centerX = width / 2
	const centerY = height / 2
	const next = clamp(view.scale * factor, 0.22, 2.4)
	view.x = centerX - ((centerX - view.x) / view.scale) * next
	view.y = centerY - ((centerY - view.y) / view.scale) * next
	view.scale = next
	view.user = true
	applyView()
}

/* ------------------------------------------------------------------- actions */

const post = async (path, body) => {
	const response = await fetch(path, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	})
	const payload = await response.json().catch(() => ({}))
	if (!response.ok) {
		throw new Error(payload.error ?? `Request failed (${response.status})`)
	}
	return payload
}

const setBusy = (busy) => {
	model.busy = busy
	document.body.classList.toggle("busy", busy)
	updateActionButtons()
}

const withBusy = async (action) => {
	if (model.busy) return
	setBusy(true)
	try {
		await action()
	} catch (error) {
		console.error(error)
		toast("操作没有完成，请查看实时日志。", "error")
	} finally {
		setBusy(false)
	}
}

const grow = (kind) =>
	withBusy(async () => {
		const result = await post("/api/grow", { kind })
		if (result.fork && Number.isInteger(result.fork.id)) {
			model.pendingSelect = result.fork.id
		}
		if (kind === "bramble") {
			toast("荆棘已经种下，它会故意失败。", "warn")
		} else if (kind === "bamboo") {
			toast("竹子已经种下，它需要一点时间才能长高。", "ok")
		} else {
			toast("一株幼苗正在破土。", "ok")
		}
	})

const toggleWater = () =>
	withBusy(async () => {
		const withdrawing = model.waterAvailable
		const result = await post("/api/water", {
			state: withdrawing ? "drought" : "rain",
		})
		if (!result.changed) {
			toast(withdrawing ? "现在没有水可以断。" : "水已经在流动了。", "info")
			return
		}
		toast(
			withdrawing
				? "水断了，需要水的分支开始等待。"
				: "水回来了，花园正在苏醒。",
			withdrawing ? "warn" : "ok",
		)
	})

const restartSelected = () =>
	withBusy(async () => {
		const node =
			model.selected === null ? undefined : model.nodes.get(model.selected)
		if (node === undefined) return
		await post("/api/restart", { id: node.id })
		toast(`正在重启「${prettyLabel(node)}」。`, "ok")
	})

const pruneSelected = () =>
	withBusy(async () => {
		const node =
			model.selected === null ? undefined : model.nodes.get(model.selected)
		if (node === undefined) return
		await post("/api/prune", { id: node.id })
		model.selected = null
		updateSelectedClasses()
		renderLinks()
		renderInspector()
		toast(`已移除「${prettyLabel(node)}」。`, "ok")
	})

/* -------------------------------------------------------------------- logs */

const renderLogRow = (entry) => {
	const row = document.createElement("div")
	const level = String(entry.level ?? "Info").toLowerCase()
	row.className = `log-row level-${level}`
	row.append(
		createSpan("log-time", formatTime(entry.at)),
		createSpan("log-level", levelName(level)),
		createSpan("log-msg", entry.message ?? ""),
	)

	const fork = typeof entry.fork === "number" ? entry.fork : null
	if (fork !== null && model.nodes.has(fork)) {
		const node = model.nodes.get(fork)
		row.append(createSpan("log-origin", `${prettyLabel(node)} #${fork}`))
		row.classList.add("is-linked")
		row.title = "选中这个 fork"
		row.addEventListener("click", () => select(fork))
	} else if (fork !== null) {
		row.append(createSpan("log-origin", `#${fork}`))
	} else {
		row.append(createSpan("log-origin", ""))
	}

	return row
}

const appendLog = (entry) => {
	if (
		entry.plugin === "@graftland/plugin-http" &&
		entry.message === "Sent HTTP response"
	)
		return
	model.logs.push(entry)
	if (model.logs.length > 300) model.logs.shift()

	elements.logEmpty.hidden = true
	const atBottom =
		elements.logList.scrollHeight -
			elements.logList.scrollTop -
			elements.logList.clientHeight <
		48
	elements.logList.append(renderLogRow(entry))

	while (elements.logList.querySelectorAll(".log-row").length > 240) {
		elements.logList.querySelector(".log-row")?.remove()
	}
	elements.logCount.textContent = String(model.logs.length)
	if (atBottom) elements.logList.scrollTop = elements.logList.scrollHeight
}

const toggleLogs = () => {
	const collapsed = elements.logs.classList.toggle("collapsed")
	elements.logsToggle.textContent = collapsed ? "展开" : "收起"
	elements.logsToggle.setAttribute("aria-expanded", String(!collapsed))
}

/* ------------------------------------------------------------------- toast */

const toast = (message, tone = "info") => {
	elements.toast.textContent = message
	elements.toast.className = `toast show ${tone}`
	if (toastTimer !== null) clearTimeout(toastTimer)
	toastTimer = setTimeout(() => {
		elements.toast.className = "toast"
	}, 3400)
}

const setConnection = (kind) => {
	elements.connection.className = `connection is-${kind}`
	elements.connectionLabel.textContent =
		kind === "live"
			? "实时"
			: kind === "reconnecting"
				? "重连中"
				: kind === "offline"
					? "已断开"
					: "连接中"
}

/* ---------------------------------------------------------------- event stream */

const connect = () => {
	if (source !== null) source.close()
	setConnection("connecting")
	source = new EventSource("/api/events")

	source.onopen = () => {
		setConnection("live")
		if (!greeted) {
			greeted = true
			appendLog({
				type: "log",
				at: new Date().toISOString(),
				level: "Info",
				message: "观察器已连接，花园开始说话。",
				fork: null,
				plugin: null,
			})
		}
	}

	source.onerror = () => {
		setConnection(
			source.readyState === EventSource.CLOSED ? "offline" : "reconnecting",
		)
		if (source.readyState === EventSource.CLOSED) {
			setTimeout(connect, 1800)
		}
	}

	source.onmessage = (event) => {
		let message
		try {
			message = JSON.parse(event.data)
		} catch {
			return
		}
		if (message.type === "snapshot") {
			setConnection("live")
			applySnapshot(message.tree)
		} else if (message.type === "log") {
			appendLog(message)
		}
	}
}

/* ------------------------------------------------------------------ events */

for (const button of document.querySelectorAll("[data-grow]")) {
	button.addEventListener("click", () => grow(button.dataset.grow))
}

elements.waterButton.addEventListener("click", toggleWater)
elements.restart.addEventListener("click", restartSelected)
elements.prune.addEventListener("click", pruneSelected)
elements.zoomOut.addEventListener("click", () => zoomBy(0.88))
elements.zoomIn.addEventListener("click", () => zoomBy(1.14))
elements.zoomFit.addEventListener("click", fit)
elements.logsToggle.addEventListener("click", toggleLogs)

elements.viewport.addEventListener(
	"wheel",
	(event) => {
		event.preventDefault()
		zoomBy(event.deltaY > 0 ? 0.92 : 1.08)
	},
	{ passive: false },
)

elements.viewport.addEventListener("pointerdown", (event) => {
	if (event.button !== 0) return
	const target = event.target
	if (
		!(target instanceof Element) ||
		target.closest(".node") ||
		target.closest(".zoom") ||
		target.closest(".legend")
	)
		return
	pan = {
		pointerId: event.pointerId,
		x: event.clientX,
		y: event.clientY,
		vx: view.x,
		vy: view.y,
		moved: false,
	}
	elements.viewport.setPointerCapture(event.pointerId)
	elements.viewport.classList.add("is-dragging")
})

elements.viewport.addEventListener("pointermove", (event) => {
	if (pan === null || event.pointerId !== pan.pointerId) return
	const dx = event.clientX - pan.x
	const dy = event.clientY - pan.y
	if (Math.abs(dx) + Math.abs(dy) > 3) pan.moved = true
	view.x = pan.vx + dx
	view.y = pan.vy + dy
	if (pan.moved) view.user = true
	applyView()
})

const finishPan = (event) => {
	if (pan === null || event.pointerId !== pan.pointerId) return
	const wasClick = !pan.moved
	pan = null
	elements.viewport.classList.remove("is-dragging")
	if (wasClick) clearSelection()
}

elements.viewport.addEventListener("pointerup", finishPan)
elements.viewport.addEventListener("pointercancel", finishPan)

document.addEventListener("keydown", (event) => {
	if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
		return
	const target = event.target
	if (
		target instanceof HTMLElement &&
		(target.isContentEditable ||
			target.tagName === "INPUT" ||
			target.tagName === "TEXTAREA" ||
			target.tagName === "SELECT")
	)
		return

	switch (event.key.toLowerCase()) {
		case "s":
			grow("seedling")
			break
		case "b":
			grow("bamboo")
			break
		case "i":
			grow("bramble")
			break
		case "w":
			toggleWater()
			break
		case "r":
			restartSelected()
			break
		case "p":
			pruneSelected()
			break
		case "f":
			fit()
			break
		case "escape":
			clearSelection()
			break
	}
})

const observer = new ResizeObserver(() => {
	if (!view.user) fit()
})
observer.observe(elements.viewport)

renderInspector()
connect()
