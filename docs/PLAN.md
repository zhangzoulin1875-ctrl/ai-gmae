# WWI 多人競爭戰略遊戲 — 技術規劃書 v1.1

> 狀態：規劃階段
> 最後更新：2026-08-29
> 變更：v1.1 — 無人數上限、移除勝利條件、AI 為核心、新增管理員後台

---

## 一、遊戲概念

### 核心玩法
- **同時回合制（Simultaneous Turn）**：靈感來自桌遊 Diplomacy — 所有玩家在同一回合同時下指令，回合結束後系統統一結算，避免「先手優勢」
- **即時溝通 + 回合結算**：回合進行中玩家可即時聊天、談判、結盟；時間到後統一結算結果
- **WWI 背景**：1914 年世界格局，50+ 可選國家（協約國、同盟國、中立國）
- **無人數上限**：玩家數量不設上限，50+ 國家可供選擇，空位可由管理員指派 AI 接管

### 🎯 AI 為核心
本遊戲的靈魂是 AI。回合結算、戰報生成、兵種設計等核心機制都經過 AI（LLM）處理：

```
玩家下達指令
      │
      ▼
┌─────────────────────────┐
│   收集所有玩家指令         │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│   AI 結算引擎 (LLM API)   │  ← 管理員在後台設定 API Key & Model
│   ├─ 分析所有指令          │
│   ├─ 判定衝突 & 戰鬥       │
│   ├─ 生成戰報（敘事式）     │
│   ├─ 更新國家狀態          │
│   └─ 生成下一回合情境       │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│   廣播結果給所有玩家        │
│   ├─ AI 生成戰報動畫        │
│   ├─ 地圖狀態更新          │
│   └─ 進入下一回合           │
└─────────────────────────┘
```

**AI 負責的模組：**
- **回合結算**：分析所有玩家指令，判定戰鬥結果、領土變化、經濟變動
- **戰報生成**：以敘事風格生成每回合戰報（不只是數字，是有故事的戰報）
- **兵種設計**（未來）：AI 根據國家科技樹和時代生成兵種屬性
- **AI 玩家決策**：管理員指派的 AI 國家，由 AI 自主下達指令
- **事件系統**（未來）：AI 生成隨機歷史事件（流感、革命、技術突破等）

### 回合流程
```
┌─────────────────────────────────────────────┐
│  回合進行期 (即時)                             │
│  ├─ 所有玩家同時在地圖上操作                    │
│  ├─ 下達指令：移動軍隊、建設、外交、生產          │
│  ├─ 即時聊天 / 密信談判                        │
│  ├─ AI 國家同時由 AI 引擎決策                   │
│  └─ 倒計時結束或全員確認「結束回合」              │
├─────────────────────────────────────────────┤
│  AI 結算階段 (伺服器端，調用 LLM API)           │
│  ├─ 統一收集所有玩家 + AI 指令                  │
│  ├─ AI 分析全域局勢                            │
│  ├─ AI 判定衝突、戰鬥結果                       │
│  ├─ AI 生成敘事戰報                            │
│  ├─ 更新所有國家狀態                            │
│  └─ AI 生成回合事件                            │
├─────────────────────────────────────────────┤
│  結果展示期 (即時)                             │
│  ├─ 戰報動畫播放（AI 文字 + 地圖動畫）           │
│  ├─ 地圖更新（領土變化）                        │
│  ├─ 統計面板更新                               │
│  └─ 進入下一回合                               │
└─────────────────────────────────────────────┘
```

---

## 二、可選國家清單（50+ 國）

### 主要參戰國（列強）
| 陣營 | 國家 |
|------|------|
| 協約國 | 英國、法國、俄羅斯帝國、義大利、美國、塞爾維亞、比利時、羅馬尼亞、希臘、葡萄牙、日本 |
| 同盟國 | 德意志帝國、奧匈帝國、鄂圖曼帝國、保加利亞 |

### 次要參戰 / 中立國
荷蘭、瑞士、丹麥、挪威、瑞典、西班牙、葡萄牙、巴西、阿根廷、智利、祕魯、哥倫比亞、墨西哥、中國（北洋政府）、暹羅（泰國）、波斯（伊朗）、阿富汗、蒙哥馬利、埃及、衣索比亞、賴比瑞亞、南非、羅德西亞、阿爾及利亞、突尼西亞、摩洛哥、利比亞、奈及利亞、黃金海岸、肯亞、烏干達、坦干伊喀、剛果、安哥拉、莫三比克、印度（英屬）、澳洲、紐西蘭、加拿大、古巴、菲律賓、越南（法屬）、馬來亞（英屬）、荷屬東印度、韓國（日屬）

> 共 50+ 國，每國有不同起始屬性：兵力、經濟、工業、海軍、外交傾向
> 無人數上限 — 空位國家預設為「待機」，管理員可從後台指派 AI 接管

---

## 三、技術架構

### 系統總覽
```
                         ┌──────────────┐
                         │   GitHub     │
                         │   (CI/CD)    │
                         └──────┬───────┘
                                │ push / deploy
              ┌─────────────────┼─────────────────┐
              │                 │                  │
       ┌──────▼──────┐  ┌──────▼───────┐  ┌──────▼──────┐
       │  前端 (SPA)  │  │ 管理員後台    │  │  AI 結算    │
       │  WebGPU 渲染 │  │ Admin Panel  │  │  Engine     │
       │  玩家介面    │  │ (獨立路由)    │  │ (LLM API)  │
       └──────┬──────┘  └──────┬───────┘  └──────┬──────┘
              │                │                  │
              └────────────────┼──────────────────┘
                               │ WebSocket + REST
                        ┌──────▼───────┐
                        │  後端伺服器    │
                        │  Node.js + WS │
                        │  Turn Engine  │
                        └──────┬───────┘
                               │
                 ┌─────────────┼─────────────┐
                 │             │              │
           ┌────▼─────┐ ┌────▼────┐ ┌──────▼──────┐
           │PostgreSQL│ │ Redis   │ │ Discord     │
           │ (遊戲存檔) ││(配對/緩存)│ │  OAuth      │
           └──────────┘ └─────────┘ └─────────────┘
```

### 技術棧

| 層級 | 技術選擇 | 理由 |
|------|---------|------|
| **前端框架** | React 18 + TypeScript | 生態成熟，型別安全 |
| **建置工具** | Vite | 快速 HMR，WebGPU 支援好 |
| **地圖渲染** | Babylon.js (WebGPU) 或原生 WebGPU API | WebGPU 引擎中 Babylon.js 最成熟；需精細控制時用原生 API |
| **地圖資料** | GeoJSON / TopoJSON (WWI 歷史邊界) | 需特製 1914 年世界邊界資料 |
| **WebSocket** | Socket.IO | 房間管理、斷線重連、房間廣播 |
| **後端框架** | Node.js + Express + TypeScript | 與前端共享型別定義 |
| **資料庫** | PostgreSQL (Prisma ORM) | 關聯式資料適合遊戲狀態 |
| **快取 / 配對** | Redis | 即時配對、Session、Pub/Sub |
| **認證** | Discord OAuth2 (玩家) + 密碼 (管理員) | 玩家用 Discord，管理員用獨立密碼 |
| **AI 引擎** | LLM API (管理員可設定 provider) | 回合結算、戰報、AI 玩家決策 |
| **部署** | 前端: Vercel/Netlify + 後端: Railway/Render | 免費額度足夠開發期 |

### WebGPU 地圖渲染策略

```
WorldMap Layer (WebGPU Render Pipeline)
├── 1. 底圖層：1914 世界地圖紋理（歷史地圖風格化）
├── 2. 邊界層：GeoJSON → GPU 線段渲染（動態線寬/顏色）
├── 3. 領土層：國家多邊形填色（動態顏色 = 控制方）
├── 4. 軍隊層：軍隊圖標/兵力數（Instanced Rendering）
├── 5. 互動層：hover 高亮、選取、指令箭頭
├── 6. 特效層：戰鬥動畫、炮火、煙霧（粒子系統）
└── 7. UI 疊加層：HUD、回合計時器、指令面板（DOM overlay）
```

#### WebGPU vs WebGL2
- **WebGPU**：更低開銷、Compute Shader 支援（可用於地圖大量多邊形運算）、未來主流
- **降級方案**：偵測到不支援 WebGPU 時自動切回 WebGL2（Babylon.js 內建支援）
- **瀏覽器支援**：Chrome 113+、Edge 113+、Safari 18+、Firefox（實驗旗標）

---

## 四、AI 結算引擎

### 架構
```
┌─────────────────────────────────────────────────────────┐
│                    AI Resolution Engine                   │
│                                                           │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │  Context     │    │  LLM Call     │    │  Response   │ │
│  │  Builder     │───▶│  (API)       │───▶│  Parser     │ │
│  │              │    │              │    │              │ │
│  │ - 全部指令    │    │ - System     │    │ - 戰鬥結果   │ │
│  │ - 當前狀態    │    │   Prompt     │    │ - 領土變化   │ │
│  │ - 歷史戰報    │    │ - User       │    │ - 經濟變動   │ │
│  │ - 地形資料    │    │   (context)  │    │ - 敘事戰報   │ │
│  │ - 外交關係    │    │              │    │ - 事件       │ │
│  └─────────────┘    └──────────────┘    └──────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  State Updater                                       │ │
│  │  - 寫入資料庫（新狀態）                                │ │
│  │  - 生成廣播 payload                                   │ │
│  │  - 觸發前端動畫                                       │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### AI Prompt 結構（結算用）
```
System: 你是一戰戰略遊戲的戰略結算引擎。根據所有玩家的指令
        和當前世界狀態，判定戰鬥結果、領土變化、經濟影響，
        並以敘事風格生成戰報。回傳結構化 JSON。

User: {
  "turn": 7,
  "worldState": { ... },
  "orders": [ ... ],
  "diplomacyChanges": [ ... ]
}

Assistant: {
  "battles": [
    {
      "location": "阿爾薩斯-洛林",
      "attacker": "法國",
      "defender": "德國",
      "result": "法軍攻勢受挫，德軍坚守防線",
      "attackerLosses": 15000,
      "defenderLosses": 8000,
      "territoryChange": null
    }
  ],
  "narrative": "第七回合，法軍在阿爾薩斯發動進攻...",
  "stateUpdates": [ ... ],
  "events": [ ... ]
}
```

### AI 玩家決策
```
當管理員指派 AI 接管某國時：
1. 回合開始 → AI 引擎收到該國的狀態 + 全域情報
2. AI 分析局勢 → 生成策略性指令
3. 指令與人類玩家指令一起進入結算

AI 決策 Prompt:
System: 你是 {國家名} 的戰略 AI。根據當前局勢下達本回合指令。
        考慮軍事、外交、經濟三方面。

User: { 國家狀態, 鄰國狀態, 外交關係, 歷史戰報摘要 }
```

### API 配置（管理員設定）
管理員可在後台設定以下 AI API 參數：

```typescript
interface AIConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'custom';
  apiKey: string;           // 加密儲存
  model: string;            // e.g. "gpt-4o", "claude-sonnet-4-20250514"
  baseUrl?: string;         // 自訂 API endpoint（相容 OpenAI 格式）
  temperature: number;      // 結算隨機性 0.0-1.0
  maxTokens: number;       // 戰報最大長度
  // 結算設定
  resolutionPrompt: string;  // 可自訂系統 prompt
  decisionPrompt: string;    // AI 玩家決策 prompt
  // 速率限制
  requestsPerTurn: number;   // 每回合最多 API 調用次數
  timeoutMs: number;         // API 逾時
}
```

---

## 五、管理員後台

### 存取方式
- 獨立路由：`/admin`（不公開連結）
- 密碼登入：15 字元密碼（已生成並加密儲存）
- 登入後取得 JWT session

### 後台功能

```
┌─────────────────────────────────────────────────────────┐
│                    Admin Panel                           │
│                                                          │
│  📊 儀表板                                               │
│  ├─ 在線玩家數 / 活躍遊戲數                              │
│  ├─ API 調用統計（次數、成本、延遲）                      │
│  └─ 伺服器健康狀態                                       │
│                                                          │
│  ⚙️ AI API 設定                                          │
│  ├─ Provider 選擇 (OpenAI / Anthropic / Google / Custom) │
│  ├─ API Key 輸入（加密儲存）                              │
│  ├─ Model 選擇 / 自訂                                    │
│  ├─ Base URL（自訂 endpoint）                             │
│  ├─ Temperature / MaxTokens / Timeout                    │
│  ├─ System Prompt 自訂（結算 prompt / 決策 prompt）        │
│  └─ 測試連接按鈕                                          │
│                                                          │
│  🎮 遊戲管理                                             │
│  ├─ 查看所有遊戲房間                                      │
│  ├─ 指派 AI 接管空位國家                                  │
│  ├─ 移除 AI / 恢復為待機                                  │
│  ├─ 強制結束回合                                          │
│  ├─ 暫停 / 重啟遊戲                                      │
│  └─ 查看遊戲日誌                                         │
│                                                          │
│  🌍 地圖管理                                             │
│  ├─ 上傳 / 更新 GeoJSON 地圖                              │
│  ├─ 編輯國家起始屬性                                      │
│  └─ 預覽地圖渲染                                          │
│                                                          │
│  👥 玩家管理                                             │
│  ├─ 查看所有玩家                                         │
│  ├─ 封禁 / 解封                                          │
│  └─ 查看玩家歷史                                         │
│                                                          │
│  📝 日誌 & 監控                                          │
│  ├─ API 調用日誌                                         │
│  ├─ 結算日誌                                             │
│  └─ 錯誤日誌                                             │
└─────────────────────────────────────────────────────────┘
```

### 管理員認證流程
```
1. 進入 /admin → 密碼輸入頁
2. 輸入密碼 → 後端比對 ADMIN_PASSWORD (secret)
3. 驗證通過 → 簽發 admin JWT (httpOnly cookie, 24h 過期)
4. 之後所有 admin API 請求攜帶 JWT
5. 敏感操作（修改 API Key）需重新輸入密碼
```

---

## 六、資料模型

### 遊戲核心實體

```typescript
// 遊戲房間
interface GameRoom {
  id: string;
  name: string;
  status: 'waiting' | 'playing' | 'paused';
  currentTurn: number;
  turnPhase: 'planning' | 'resolving' | 'displaying';
  turnDeadline: Date;
  mapId: string;
  createdAt: Date;
  // 無 maxPlayers 限制
}

// 玩家
interface Player {
  id: string;
  userId: string;           // Discord user ID
  discordUsername: string;
  discordAvatar: string;
  countryId: string;
  roomId: string;
  isReady: boolean;
  status: 'active' | 'eliminated' | 'surrendered' | 'ai_controlled';
  // AI 玩家標記
  isAI: boolean;
  aiPersonality?: string;   // AI 性格設定（侵略型/防守型/外交型）
}

// 國家狀態（每回合快照）
interface CountryState {
  countryId: string;
  turn: number;
  playerId: string | null;  // null = 待機（無人且未被 AI 接管）
  isAIControlled: boolean;
  // 軍事
  army: number;
  navy: number;
  morale: number;
  // 經濟
  treasury: number;
  industry: number;
  manpower: number;
  // 外交
  atWar: string[];
  allies: string[];
  // 領土
  territories: string[];
}

// 玩家指令
interface Order {
  id: string;
  playerId: string;
  turn: number;
  type: 'move' | 'attack' | 'defend' | 'build_army' | 'build_navy' | 'fortify' | 'diplomacy' | 'research';
  fromTerritory?: string;
  toTerritory?: string;
  amount?: number;
  targetCountry?: string;
  diplomacyType?: 'declare_war' | 'peace' | 'alliance' | 'trade';
  isAIOrder: boolean;      // 標記是否為 AI 下達
  timestamp: Date;
}

// AI 結算結果
interface TurnResolution {
  id: string;
  roomId: string;
  turn: number;
  battles: BattleResult[];
  narrative: string;        // AI 生成的敘事戰報
  stateUpdates: StateUpdate[];
  events: GameEvent[];
  apiUsage: {
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
  };
  resolvedAt: Date;
}

// 省份/區域
interface Territory {
  id: string;
  name: string;
  countryId: string;
  type: 'land' | 'coastal' | 'capital';
  terrain: 'plains' | 'mountains' | 'forest' | 'desert' | 'urban';
  supply: number;
  fortification: number;
  resources: string[];
}
```

---

## 七、回合結算流程（AI 版）

```
1. 收集所有玩家的本回合指令（人類 + AI）
2. Context Builder 組裝：
   - 當前世界狀態快照
   - 所有指令
   - 歷史戰報摘要
   - 地形/外交資料
3. 調用 LLM API：
   - System Prompt（管理員可自訂）
   - User Message = 結構化 JSON context
   - 要求回傳結構化 JSON 結果
4. Response Parser 解析 AI 回應：
   - 戰鬥結果
   - 領土變化
   - 經濟更新
   - 敘事戰報
   - 隨機事件
5. State Updater 寫入資料庫
6. 廣播結果給所有玩家
7. AI 玩家生成下一回合指令
```

**注意**：結算公式不再硬編碼，由 AI 根據上下文判定。
但 AI 回傳的必須是結構化 JSON，確保狀態可正確更新。

---

## 八、Discord OAuth 登入流程

```
1. 玩家點擊「用 Discord 登入」
2. 重導至 Discord OAuth2 授權頁面
   GET https://discord.com/api/oauth2/authorize
     ?client_id=APP_ID
     &redirect_uri=REDIRECT_URL
     &response_type=code
     &scope=identify guilds
3. 玩家授權後 Discord 回調帶 code
4. 後端用 code 換取 access_token
   POST https://discord.com/api/oauth2/token
5. 用 access_token 取得使用者資料
   GET https://discord.com/api/users/@me
6. 建立 Session (JWT) → 前端存於 httpOnly cookie
7. 之後 WebSocket 連線攜帶 JWT 驗證身份
```

### 需要的 Discord 設定
- 在 Discord Developer Portal 建立 Application
- 設定 OAuth2 Redirect URI
- 取得 Client ID + Client Secret → 存入 secrets
- 不需要 Discord Bot（無廣播需求）

---

## 九、地圖資料來源

WWI 1914 年的歷史邊界需要特殊處理，現代 GeoJSON 不能直接用。

### 方案
1. **歷史地圖專案**：參考 [GeoNexus](https://github.com/aourednik/historical-basemaps) 等歷史 GeoJSON 集合
2. **自行繪製**：以現代邊界為基礎，根據 1914 年歷史地圖手動調整
3. **省級劃分**：大國（德、法、俄、奧匈）需切成多個省份/戰區

### 資料格式
```json
{
  "version": "1914_wwi",
  "countries": [
    {
      "id": "germany_empire",
      "name": "德意志帝國",
      "color": "#4a4a4a",
      "provinces": [
        { "id": "prussia", "name": "普魯士", "polygon": [...] },
        { "id": "bavaria", "name": "巴伐利亞", "polygon": [...] }
      ]
    }
  ]
}
```

---

## 十、開發階段規劃

### Phase 0：專案骨架 (1 週)
- [ ] 建立 monorepo 結構（前端 + 後端 + 共享型別）
- [ ] 設定 Vite + React + TypeScript
- [ ] 設定 Node.js + Express + Socket.IO 後端
- [ ] 設定 PostgreSQL + Prisma
- [ ] Discord OAuth2 串接（登入頁 + 回調 + Session）
- [ ] 管理員後台骨架（密碼登入 + JWT）
- [ ] AI API 設定頁面（provider / key / model）
- [ ] GitHub repo 建立 + CI/CD pipeline
- [ ] 基礎部署流程

### Phase 1：地圖渲染 (1-2 週)
- [ ] 取得/製作 1914 世界 GeoJSON
- [ ] WebGPU 渲染管線搭建
- [ ] 地圖互動：pan、zoom、hover 高亮
- [ ] 國家選取、省份顯示
- [ ] 軍隊圖標 Instanced Rendering
- [ ] WebGPU → WebGL2 降級方案

### Phase 2：遊戲核心 (2 週)
- [ ] 房間系統（建立、加入、大廳）— 無人數上限
- [ ] 國家選擇介面
- [ ] 回合計時器 + 階段切換
- [ ] 指令下達 UI（移動、攻擊、生產、外交）
- [ ] AI 結算引擎串接（Context Builder → LLM API → Parser → State Updater）
- [ ] 戰報生成 + 結果動畫

### Phase 3：管理員後台完整版 (1 週)
- [ ] 儀表板（在線統計、API 用量）
- [ ] AI API 設定完整 UI
- [ ] 遊戲管理（指派 AI、強制結束回合、暫停遊戲）
- [ ] 玩家管理（查看、封禁）
- [ ] 地圖管理（上傳 GeoJSON、編輯國家屬性）
- [ ] 日誌 & 監控

### Phase 4：多人即時 + AI 玩家 (1-2 週)
- [ ] WebSocket 即時同步
- [ ] 即時聊天系統（全頻道 + 私信）
- [ ] 斷線重連機制
- [ ] AI 玩家決策引擎
- [ ] 管理員指派 AI 接管空位

### Phase 5：打磨 (1-2 週)
- [ ] 音效 / 背景音樂
- [ ] 戰鬥特效動畫
- [ ] 教學模式 / 新手引導
- [ ] 響應式設計
- [ ] 效能優化

### 預計總工時：7-10 週

---

## 十一、部署策略

| 服務 | 平台 | 免費額度 | 說明 |
|------|------|---------|------|
| 前端 | Vercel / Netlify | 充足 | 自動從 GitHub 部署 |
| 後端 | Railway / Render | 有限 | 500hr/月免費 |
| 資料庫 | Neon / Supabase | 充足 | 0.5GB 免費 |
| Redis | Upstash | 充足 | 10k req/day 免費 |

### GitHub 部署流程
```
每次完成功能 →
1. git add + commit
2. git push (使用 GITHUB_TOKEN)
3. 前端：Vercel/Netlify 自動偵測 push → 建置部署
4. 後端：Railway/Render 自動偵測 push → 建置部署
5. 回報部署結果給使用者
```

---

## 十二、風險與待決問題

| 風險 | 嚴重度 | 緩解方案 |
|------|-----------------|
| WebGPU 瀏覽器支援不全 | 高 | 降級到 WebGL2（Babylon.js 內建） |
| 1914 歷史邊界 GeoJSON 難取得 | 中 | 手動製作或找開源歷史地圖專案 |
| 多人同步延遲 | 中 | Server-authoritative + 客端預測 |
| AI 結算穩定性（幻覺/格式錯誤） | 高 | JSON Schema 驗證 + fallback 確定性結算 |
| AI API 成本 | 高 | 管理員可設定速率限制 + 模型選擇 |
| 無人數上限的效能 | 中 | 分區處理 + Redis pub/sub 擴展 |
| AI API 延遲影響遊戲體驗 | 中 | 串流輸出 + 進度指示器 |

### 已確認決策
- ✅ 玩家無上限
- ✅ 暫不製作勝利/結局條件
- ✅ 管理員後台可指派 AI 接管空位
- ✅ 不需要 Discord Bot 廣播
- ✅ AI 為遊戲核心（結算、戰報、兵種設計都走 AI）
- ✅ 管理員後台有 AI API 設定頁面
- ✅ 管理員密碼已生成（15 字元，加密儲存）

### 仍待確認
1. **回合時長**：每回合規劃期多久？可調？
2. **跨平台**：只做桌面網頁？還是要支援平板/手機？
3. **語言**：主要中文介面？還是多語言？
4. **Discord App**：你已經有 Discord Application 了嗎？還是需要建立？
5. **GitHub repo**：已經有 repo 了嗎？還是我新建？
6. **AI Provider**：偏好用哪家？OpenAI / Anthropic / Google / 其他？

---

## 下一步

規劃確認後，從 Phase 0 開始：
1. 建立 monorepo 骨架
2. 串接 Discord OAuth
3. 管理員後台 + AI API 設定
4. 搭建 WebGPU 地圖渲染管線
5. AI 結算引擎
6. 每完成一個里程碑 → push 到 GitHub → 自動部署
