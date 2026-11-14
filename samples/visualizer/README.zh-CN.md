# 可视化

[English](README.md) | 简体中文 | [繁體中文](README.zh-TW.md)

一张 Graft 运行时的实时地图。每个方框是一个 fork，每条线表示归属关系；进程不停止，状态变化会直接出现在图上。

页面由它展示的对象自己提供：`lens`
插件挂载 HTTP 路由，它画出的 fork 树里也包含它自己。

## 你会学到

- `Graft.forks` 是整棵 fork 树的流，每次变化都会再次发出。
- `Graft.logs` 带有运行时的日志流，包括 `graft.fork` 注解。
- 插件可以在 `apply` 返回之后继续生长：在它拥有的 Scope 里加载新的 fork。
- 移除服务提供者会让消费者进入 `Pending`；恢复后它们会重新启动。

## 运行

在仓库根目录：

```sh
devenv shell -- pnpm build
devenv shell -- pnpm --filter @graftland/sample-visualizer start
```

打开 <http://127.0.0.1:4712>。监听器只绑定回环地址，没有认证。

## 可以试试

| 操作         | 观察什么                                                 |
| ------------ | -------------------------------------------------------- |
| **播种幼苗** | 花园下出现新的幼苗 fork，从加载中变成运行中。            |
| **种竹子**   | 较慢的分支会先停留在加载中，然后加入树冠。               |
| **染病**     | 荆棘会故意失败并停留在失败状态；选中它可以读到原因。     |
| **断水**     | 水源卸载，橡树、兰花、幼苗和竹子进入等待中，橡果离开树。 |
| **浇水**     | 水回来，这些分支重新加载，橡果也重新长出来。             |
| **重启**     | 花园分支重新加载，它下面的所有分支也一样。               |
| **移除**     | 花园分支和它的后代一起离开树。                           |
| `/?fork=8`   | 打开页面并选中 fork 8。                                  |

底部是实时的 `Graft.logs`
流。点击带 fork 标签的日志行，可以在地图上选中对应的 fork。

## 实现

| 文件                                     | 作用                                             |
| ---------------------------------------- | ------------------------------------------------ |
| [`src/app.ts`](src/app.ts)               | 应用根节点：加载路由、监听服务器、花园和观察器。 |
| [`src/garden.ts`](src/garden.ts)         | 花园的服务、植物和 `Garden` 命令服务。           |
| [`src/visualizer.ts`](src/visualizer.ts) | 提供页面、SSE 流和操作接口。                     |
| [`src/snapshot.ts`](src/snapshot.ts)     | 把 fork 树和日志编码给浏览器。                   |
| [`public/`](public)                      | HTML、CSS 和不依赖框架的客户端脚本。             |
| [`test/`](test)                          | 快照编码测试和 HTTP 集成测试。                   |

服务端事件流由两个来源合并而成：

```ts
Stream.merge(
	Graft.forks.pipe(Stream.map(snapshotEvent)),
	Graft.logs.pipe(Stream.map(logEvent)),
)
```

| 接口                | 用途                                              |
| ------------------- | ------------------------------------------------- |
| `GET /api/state`    | 当前 fork 树的编码结果。                          |
| `GET /api/events`   | 以服务端事件推送快照和日志。                      |
| `POST /api/grow`    | `{ "kind": "seedling" \| "bamboo" \| "bramble" }` |
| `POST /api/water`   | `{ "state": "drought" \| "rain" }`                |
| `POST /api/restart` | `{ "id": <fork id> }`                             |
| `POST /api/prune`   | `{ "id": <fork id> }`                             |

这是教学演示，不是生产监控面板：没有认证、持久化和多用户隔离。
