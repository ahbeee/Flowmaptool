# quickflow Issue 清單（重啟版）

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
- CI 與 release pipeline（讓你不需手動回歸）

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
  - CI 可在 Windows runner 跑通

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

---

## EPIC 3：文件與輸出（P1）

### ISSUE 3-1：檔案流程（新建/開啟/儲存/另存）
- 類型：Feature
- 優先級：P1
- 驗收：
  - 基本文件流程完整

### ISSUE 3-2：PNG/PDF 匯出
- 類型：Feature
- 優先級：P1
- 驗收：
  - 可成功匯出並開啟

### ISSUE 3-3：列印與列印預覽
- 類型：Feature
- 優先級：P1
- 驗收：
  - 預覽與實際輸出一致性可接受

---

## EPIC 4：內容與效率（P1）

### ISSUE 4-1：搜尋（標題/內容）
- 類型：Feature
- 優先級：P1

### ISSUE 4-2：Rich node content（分階段）
- 類型：Feature
- 優先級：P1

### ISSUE 4-3：Interactive tasks
- 類型：Feature
- 優先級：P1

### ISSUE 4-4：Notes（off-canvas）
- 類型：Feature
- 優先級：P1

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

### ISSUE 5-4：CI Pipeline（Windows only）
- 類型：DevOps
- 優先級：P0
- 驗收：
  - PR 自動跑 lint + tests + build
  - 失敗可回傳 log/截圖 artifact

---

## 建議里程碑

- M1（1.5~2 週）：EPIC 0 + EPIC 1
- M2（2~3 週）：EPIC 2 + EPIC 3-1
- M3（1~2 週）：EPIC 3-2/3-3 + EPIC 5
- M4（彈性）：EPIC 4

