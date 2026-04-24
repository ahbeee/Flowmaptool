# QuickFlow 軟體需求規格書（重啟版）

文件版本：v0.1  
文件日期：2026-04-23  
專案代號：`quickflow`  
主要參考：[QuikFlow 官網](https://www.quikflow.app/en)

---

## 1. 文件目的

本文件定義新專案 `quickflow` 的需求範圍、功能需求與驗收標準，作為開發與測試的唯一依據。

---

## 2. 產品定位

`quickflow` 是一款 **Windows 單機桌面流程編輯器**，核心體驗是：

- 用 mind map 一樣直覺的互動建立 flow
- 非樹狀限制（支援匯流與回圈）
- 自動排版（使用者專注內容，不手動拉線對齊）

對齊 QuikFlow 網站核心敘事（Create flows not just mind maps / Auto layout / Drag & drop reorg / Paste subflow / Delete intertwined parts / PNG/PDF export）。

---

## 3. 目標使用者

- 個人知識工作者（需求分析、流程梳理、決策流程）
- PM / BA / 工程師（系統流程與業務流程草圖）
- 學習與研究者（觀念流程化）

---

## 4. 系統範圍（固定約束）

### 4.1 In Scope

- 平台：僅 Windows 11（x64）
- 架構：Desktop App（Electron）
- 儲存：本機檔案（離線）
- 格式：自有 JSON 檔案格式（副檔名 `.qflow`）
- 編輯模式：Mind-map style flow editing + Outliner（後續）

### 4.2 Out of Scope（本階段不做）

- 雲端同步
- 即時多人協作
- 帳號系統 / 登入
- 訂閱與付費牆
- 行動版（iOS / Android）

---

## 5. 功能需求

### 5.1 Flow Graph 模型（核心）

- FR-001：節點可多輸入、多輸出。
- FR-002：支援匯流（A->C, B->C）與回圈（B->A）。
- FR-003：節點與連線需可序列化/反序列化，重開檔不遺失。
- FR-004：舊版檔案升級策略需有版本欄位與 migration。

### 5.2 連線互動

- FR-005：可從任一節點建立多條輸出邊。
- FR-006：邊可被選取（高亮狀態可見）。
- FR-007：可刪除指定邊，不影響其他邊。
- FR-008：大量交錯邊仍可操作（不因遮擋而無法點選）。

### 5.3 自動排版

- FR-009：新增/刪除節點或邊後，自動更新版面。
- FR-010：支援水平（Horizontal）與垂直（Vertical）排版方向。
- FR-011：拖放重組後觸發局部重排，避免整圖大抖動。
- FR-012：貼上子流程到中段時，自動重接與重排。

### 5.4 編輯內容

- FR-013：節點標題與基本文字內容編輯。
- FR-014：節點支援 rich content（清單/連結/圖片）分階段交付。
- FR-015：支援 notes（畫布外補充資訊）。
- FR-016：支援任務節點狀態（todo / doing / done）。

### 5.5 輸出與分享

- FR-017：匯出 PNG。
- FR-018：匯出 PDF。
- FR-019：列印（Print/Print Preview）。
- FR-020：輸出品質需可讀（避免裁切與糊化）。

### 5.6 一般編輯能力

- FR-021：新建、開啟、儲存、另存。
- FR-022：Undo / Redo。
- FR-023：搜尋節點。
- FR-024：主題樣式與模板（後續分期）。

---

## 6. 非功能需求

- NFR-001：一般操作（新增節點、刪邊）100ms 內可見回饋。
- NFR-002：500 節點 / 1000 邊情境可編輯，不可長時間凍結。
- NFR-003：異常不得直接崩潰，需回報可恢復錯誤訊息。
- NFR-004：檔案損壞或版本不符時，需可判斷並提示。
- NFR-005：測試需可在無 GUI 互動情境下自動執行（CI 可跑）。

---

## 7. 驗收標準（MVP）

- AC-001：可建立 `A->B`、`C->B`、`B->A`，儲存後重開仍存在。
- AC-002：可選取單一邊並刪除，其他邊不受影響。
- AC-003：新增節點、改連線後，版面自動更新且維持可讀性。
- AC-004：可切換 Horizontal / Vertical 並即時生效。
- AC-005：可匯出 PNG/PDF，內容不裁切且可讀。
- AC-006：整體流程在 Windows 單機離線可完整運作。

---

## 8. 需求優先級

- P0：FR-001~FR-012、FR-021~FR-023、AC-001~AC-004
- P1：FR-017~FR-020（輸出品質）、FR-013~FR-016（rich content/tasks）
- P2：模板、進階樣式、文字格式匯出（Markdown/Mermaid 等）

---

## 9. 來源追溯

- QuikFlow 官網頁面（2026-04-23 檢視）：
  - “Create flows, not just mind maps”
  - “The layout happens automatically while you are working”
  - “reorganize elements using drag-and-drop”
  - “Paste a whole subflow... Delete any part...”
  - “Export ... PDF and PNG”
  - “Multiple inputs and outputs per node”
  - “Horizontal / Vertical layout directions”

