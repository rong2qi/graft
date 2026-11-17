# Visualizer

English | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md)

A live map of a Graft runtime. Every box is a fork, every line is ownership, and
every state change happens while the process keeps running.

The page is served by the thing it shows: the `lens` plugin mounts the HTTP
routes, and the fork tree it renders includes the lens itself.

## What you will learn

- `Graft.forks` is a stream of the whole fork tree. It emits again on every
  change.
- `Graft.logs` carries the runtime's own log stream, including the `graft.fork`
  annotation.
- A plugin can keep growing after `apply` returns by loading new forks in a
  scope it owns.
- Removing a service provider moves its consumers to `Pending`; restoring it
  starts them again.

## Run it

From the repository root:

```sh
devenv shell -- pnpm build
devenv shell -- pnpm --filter @graftland/sample-visualizer start
```

Open <http://127.0.0.1:4712>. The listener binds to loopback only and has no
authentication.

The [launcher](scripts/start.sh) installs workspace dependencies and builds the
two runtime packages on first use. The macOS desktop shortcut calls the same
script.

## What to try

| Action           | What to watch                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| **Sow seedling** | A new seedling fork appears under the garden and turns from Loading to Active.                                  |
| **Bamboo**       | A slower branch stays Loading for a moment, then joins the canopy.                                              |
| **Infect**       | A bramble fails on purpose and stays Failed; select it to read the cause.                                       |
| **Drought**      | The water provider unloads. The oak, orchid, seedlings and bamboo become Pending and the acorn leaves the tree. |
| **Rain**         | Water returns. The same branches load again and the acorn grows back.                                           |
| **Restart**      | A garden branch reloads, and so does everything below it.                                                       |
| **Prune**        | A garden branch and its descendants leave the tree.                                                             |
| `/?fork=8`       | Opens the page with fork 8 selected.                                                                            |

The footer is the live `Graft.logs` stream. Click a log row with a fork badge to
select that fork on the map.

## How it works

| File                                     | Role                                                               |
| ---------------------------------------- | ------------------------------------------------------------------ |
| [`src/app.ts`](src/app.ts)               | The application root: loads the router, listener, garden and lens. |
| [`src/garden.ts`](src/garden.ts)         | The garden's services, plants and `Garden` command service.        |
| [`src/visualizer.ts`](src/visualizer.ts) | Serves the page, the SSE stream and the command API.               |
| [`src/snapshot.ts`](src/snapshot.ts)     | Encodes the fork tree and log entries for the browser.             |
| [`public/`](public)                      | The HTML, CSS and dependency-free client script.                   |
| [`test/`](test)                          | Snapshot encoding and an HTTP integration test.                    |

The server-sent event stream is built from two sources:

```ts
Stream.merge(
	Graft.forks.pipe(Stream.map(snapshotEvent)),
	Graft.logs.pipe(Stream.map(logEvent)),
)
```

| Endpoint            | Use                                               |
| ------------------- | ------------------------------------------------- |
| `GET /api/state`    | The current encoded fork tree.                    |
| `GET /api/events`   | Snapshots and logs as server-sent events.         |
| `POST /api/grow`    | `{ "kind": "seedling" \| "bamboo" \| "bramble" }` |
| `POST /api/water`   | `{ "state": "drought" \| "rain" }`                |
| `POST /api/restart` | `{ "id": <fork id> }`                             |
| `POST /api/prune`   | `{ "id": <fork id> }`                             |

The image is a teaching aid, not a production dashboard: it has no
authentication, no persistence and no multi-user isolation.
