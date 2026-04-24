# flowmaptool Issue 清單（重啟版）

文件版本：v0.1  
文件日期：2026-04-23

---

## A. 舊清單調整總結（先講結論）

### A1. 需要刪除（舊專案遺留，不適用新專案）

- 刪除舊有「移除帳號殘留」類 issue（新專案一開始就不做帳號）
- 刪除「跨平台打包收斂」類 issue（新專案直接 Windows-only）
- 刪除與 BlinkMind 舊插件耦合的修補型 issue（不沿用該技術債）

### A2. 需要新增（新專案必備）

- 新專案 bootstrap（架構、檔案格式、版本策略）
- Flow 邊的「選取/刪除」完整互動（舊清單只有描述，缺實作拆解）
- 自動化測試基礎（Model + Layout + E2E + 匯出 smoke）
- Windows portable app / installer 打包
- PNG 匯出完整視覺驗收
- 500 nodes / 1000 edges 大圖壓測
- 壞檔案、舊版本檔案、格式錯誤提示 UX
- 更完整的手動 Edge 路由、避讓、拖拉線段固定路徑

### A3. 明確不做（已由需求決策移除）

- 搜尋節點內容
- Node notes / off-canvas notes
- Task 狀態（todo / doing / done）
- Rich content（連結、圖片、清單、Markdown）
- Outliner / 左側大綱視圖
- GitHub Actions CI（已依需求移除，測試以本機執行為主）

---

## EPIC 0：專案骨架與品質閘（P0）

### ISSUE 0-1：初始化新專案骨架（Electron + React + TS）
- 類型：Chore
- 優先級：P0
- 驗收：
  - 能 `dev` 啟動主程序與渲染程序
  - 能 `build` 產出 Windows 可執行包（先 portable）

### ISSUE 0-2：定義 `.qflow` 檔案格式與版本欄位
- 類型：Feature
- 優先級：P0
- 驗收：
  - 具備 `schemaVersion`
  - 可讀寫最小文件（nodes + edges）

### ISSUE 0-3：建立自動化測試基礎（unit/integration/e2e）
- 類型：Test
- 優先級：P0
- 驗收：
  - `test:unit`、`test:integration`、`test:e2e` 可執行
  - 本機可自動跑完整回歸，不依賴手動逐項驗證

### ISSUE 0-4：Windows portable app / installer 打包
- 類型：Release
- 優先級：P1
- 狀態：已完成基本打包
- 驗收：
  - 已可在 Windows 產出 portable app 與 NSIS installer
  - 已驗證 `release/win-unpacked/Flowmaptool.exe` 與 portable exe 可啟動
  - 目前產物為未簽章本機 build，正式發布前需另補 code signing / app icon

---

## EPIC 1：Flow 核心能力（P0）

### ISSUE 1-1：Graph 資料模型（多入多出/回圈）
- 類型：Feature
- 優先級：P0
- 驗收：
  - 支援 `A->B`、`C->B`、`B->A`
  - 儲存重開不遺失

### ISSUE 1-2：節點與邊 CRUD
- 類型：Feature
- 優先級：P0
- 驗收：
  - 新增/刪除節點
  - 建立/刪除邊
  - 刪除節點會清除相關邊（不留 orphan edge）

### ISSUE 1-3：邊選取/高亮/刪除指定邊
- 類型：Feature
- 優先級：P0
- 驗收：
  - 可點選單條邊並高亮
  - Delete 只刪當前選中邊

### ISSUE 1-4：Undo/Redo（含 node + edge）
- 類型：Feature
- 優先級：P0
- 驗收：
  - 連續操作可撤銷重做
  - 模型一致性不破壞

---

## EPIC 2：自動排版與互動（P0）

### ISSUE 2-1：Auto layout 引擎（Horizontal）
- 類型：Feature
- 優先級：P0
- 驗收：
  - 新增/刪除節點與邊後，自動重排
  - 版面可讀，不重疊

### ISSUE 2-2：Auto layout 引擎（Vertical）
- 類型：Feature
- 優先級：P0
- 驗收：
  - 切換方向即時生效
  - 既有圖可穩定重排

### ISSUE 2-3：拖放重組 + 局部重排
- 類型：Feature
- 優先級：P0
- 驗收：
  - 拖放後只局部重排，避免全圖抖動

### ISSUE 2-4：子流程貼上到中段
- 類型：Feature
- 優先級：P0
- 驗收：
  - 貼上後主流程保持可讀
  - 子流程節點與邊完整保留

### ISSUE 2-5：刪除交織區段後版面修復
- 類型：Feature
- 優先級：P0
- 驗收：
  - 批次刪除後無孤兒邊
  - 仍可繼續編輯

### ISSUE 2-6：手動 Edge 路由、避讓、拖拉線段
- 類型：Feature
- 優先級：P1
- 驗收：
  - 手動跨層或回接連線不應不必要地改變既有節點位置
  - 連線路徑避免直接覆蓋節點
  - 可拖拉線段調整路徑，並可 Reset Bend 回復自動路由

### ISSUE 2-7：QuikFlow 級高階手動畫線效果
- 類型：Feature
- 優先級：P2
- 驗收：
  - 跨層回接、自動避讓與手動線路調整效果逐步對齊 QuikFlow

---

## EPIC 3：文件與輸出（P1）

### ISSUE 3-1：檔案流程（新建/開啟/儲存/另存）
- 類型：Feature
- 優先級：P1
- 驗收：
  - 基本文件流程完整

### ISSUE 3-2：PNG 匯出完整視覺驗收
- 類型：Feature
- 優先級：P1
- 狀態：已完成基本驗證
- 驗收：
  - 已可成功匯出 PNG
  - PNG 以圖形內容範圍輸出，避免巨大空白畫布
  - 已有自動化 smoke 測試與人工視覺驗收樣本

### ISSUE 3-3：壞檔案、舊版本檔案、格式錯誤提示 UX
- 類型：Feature
- 優先級：P1
- 驗收：
  - 開啟壞 JSON 時顯示可理解錯誤
  - 開啟版本不符檔案時顯示可理解錯誤
  - 開啟可 migration 的舊版檔案時正常升級

### ISSUE 3-4：大圖效能壓測
- 類型：Performance
- 優先級：P1
- 驗收：
  - 500 nodes / 1000 edges fixture 可載入
  - 基本操作不長時間凍結
  - 壓測結果記錄在測試輸出或文件中

---

## EPIC 4：已取消內容功能（本階段不做）

- 搜尋節點內容
- Rich node content
- Interactive tasks
- Notes / off-canvas notes
- Outliner / 左側大綱視圖

---

## EPIC 5：測試與發佈自動化（P0）

### ISSUE 5-1：Model property tests（圖一致性）
- 類型：Test
- 優先級：P0
- 驗收：
  - 隨機增刪節點/邊後 invariants 皆成立

### ISSUE 5-2：Layout regression tests（快照）
- 類型：Test
- 優先級：P0
- 驗收：
  - 固定 fixtures 的 layout 座標差異在容忍範圍內

### ISSUE 5-3：E2E（Playwright + Electron）
- 類型：Test
- 優先級：P0
- 驗收：
  - 建立節點、建立邊、刪邊、儲存重開全自動通過

### ISSUE 5-4：本機完整測試指令維護
- 類型：Test
- 優先級：P1
- 驗收：
  - `pnpm test:all` 可涵蓋 lint、unit、integration、e2e
  - 不依賴 GitHub Actions CI

---

## 建議里程碑

- M1：EPIC 0 + EPIC 1
- M2：EPIC 2 + EPIC 3-1
- M3：PNG 視覺驗收 + 壞檔 UX + 大圖壓測 + 打包
- M4：手動 Edge 路由與 QuikFlow 級高階線路效果
