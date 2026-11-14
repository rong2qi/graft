# 視覺化

[English](README.md) | [简体中文](README.zh-CN.md) | 繁體中文

一張 Graft 執行階段的即時地圖。每個方框是一個 fork，每條線代表歸屬關係；行程不會停止，狀態變化會直接出現在圖上。

頁面由它所展示的對象自己提供：`lens`
外掛掛載 HTTP 路由，它畫出的 fork 樹裡也包含它自己。

## 你會學到

- `Graft.forks` 是整棵 fork 樹的串流，每次變化都會再次送出。
- `Graft.logs` 帶有執行階段的日誌串流，包括 `graft.fork` 註解。
- 外掛可以在 `apply` 返回之後繼續生長：在它擁有的 Scope 裡載入新的 fork。
- 移除服務提供者會讓消費者進入 `Pending`；恢復後它們會重新啟動。

## 執行

在儲存庫根目錄：

```sh
devenv shell -- pnpm build
devenv shell -- pnpm --filter @graftland/sample-visualizer start
```

開啟 <http://127.0.0.1:4712>。監聽器只綁定回送位址，沒有驗證。

## 可以試試

| 操作         | 觀察什麼                                                 |
| ------------ | -------------------------------------------------------- |
| **播種幼苗** | 花園下出現新的幼苗 fork，從載入中變成執行中。            |
| **種竹子**   | 較慢的分支會先停留在載入中，然後加入樹冠。               |
| **染病**     | 荊棘會故意失敗並停留在失敗狀態；選取它可以讀到原因。     |
| **斷水**     | 水源卸載，橡樹、蘭花、幼苗和竹子進入等待中，橡果離開樹。 |
| **澆水**     | 水回來，這些分支重新載入，橡果也重新長出來。             |
| **重新啟動** | 花園分支重新載入，它下面的所有分支也一樣。               |
| **移除**     | 花園分支和它的後代一起離開樹。                           |
| `/?fork=8`   | 開啟頁面並選取 fork 8。                                  |

底部是即時的 `Graft.logs`
串流。點擊帶 fork 標籤的日誌列，可以在地圖上選取對應的 fork。

## 實作

| 檔案                                     | 作用                                                 |
| ---------------------------------------- | ---------------------------------------------------- |
| [`src/app.ts`](src/app.ts)               | 應用程式根節點：載入路由、監聽伺服器、花園和觀察器。 |
| [`src/garden.ts`](src/garden.ts)         | 花園的服務、植物和 `Garden` 指令服務。               |
| [`src/visualizer.ts`](src/visualizer.ts) | 提供頁面、SSE 串流和操作介面。                       |
| [`src/snapshot.ts`](src/snapshot.ts)     | 把 fork 樹和日誌編碼給瀏覽器。                       |
| [`public/`](public)                      | HTML、CSS 和不依賴框架的用戶端指令碼。               |
| [`test/`](test)                          | 快照編碼測試和 HTTP 整合測試。                       |

伺服器事件串流由兩個來源合併而成：

```ts
Stream.merge(
	Graft.forks.pipe(Stream.map(snapshotEvent)),
	Graft.logs.pipe(Stream.map(logEvent)),
)
```

| 介面                | 用途                                              |
| ------------------- | ------------------------------------------------- |
| `GET /api/state`    | 目前 fork 樹的編碼結果。                          |
| `GET /api/events`   | 以伺服器事件推送快照和日誌。                      |
| `POST /api/grow`    | `{ "kind": "seedling" \| "bamboo" \| "bramble" }` |
| `POST /api/water`   | `{ "state": "drought" \| "rain" }`                |
| `POST /api/restart` | `{ "id": <fork id> }`                             |
| `POST /api/prune`   | `{ "id": <fork id> }`                             |

這是教學示範，不是生產監控面板：沒有驗證、持久化和多使用者隔離。
