# 苏丽娘实时语音桥接层

这个服务把浏览器里的苏丽娘 UI 和豆包端到端实时语音大模型 API 隔离开：

- 前端只连接本地 `ws://127.0.0.1:8788/voice`
- 火山引擎 `APP ID` / `Access Token` 只放在后端 `.env`
- 后端负责豆包 WebSocket 二进制协议、事件翻译、文本/RAG/音频事件转发
- 没有密钥时可用 `MOCK_MODE=1` 本地演示

## 启动

```bash
cd voice_bridge
copy .env.example .env
npm install
npm start
```

然后用本地 HTTP 服务打开前端：

```bash
cd ..
python -m http.server 8765
```

访问 `http://127.0.0.1:8765/suliniang_ui_demo/index.html`。

## 火山配置建议

- `VOLC_MODEL=2.2.0.0`：SC2.0，适合苏丽娘这种强人设数字导游
- `VOLC_INPUT_MOD=text`：第一版先走文本输入，稳定验证人设、工具和播报
- 后续麦克风实时输入改为 `speech_opus + keep_alive` 或服务端 PCM 编码链路

## 对话状态抽取模型

路线卡片和生成路线现在采用“大模型结构化总结为主、规则兜底为辅”的链路：

```text
多轮用户原话 → 状态抽取 LLM → routeDraft JSON → 确认卡片/生成路线
```

推荐在 `voice_bridge/.env` 增加任意一组 OpenAI 兼容配置：

```env
# 通用 OpenAI 兼容接口 / 中转站 / 火山方舟均可
STATE_LLM_API_KEY=sk-...
STATE_LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
STATE_LLM_MODEL=doubao-seed-1-6-250615
```

也兼容这些变量名：

```env
OPENAI_API_KEY=...
OPENAI_BASE_URL=...
OPENAI_MODEL=...

ARK_API_KEY=...
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=doubao-seed-1-6-250615
```

如果确实要复用 `VOLC_ACCESS_KEY` 作为方舟 Chat Completions 的 key，需要显式开启：

```env
VOLC_STATE_LLM=1
VOLC_STATE_MODEL=doubao-seed-1-6-250615
```

没有配置时服务仍可运行，但 `/health` 会显示 `stateLlmReady:false`，此时只走本地规则兜底。

