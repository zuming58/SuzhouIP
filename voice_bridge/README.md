# 苏丽娘实时语音桥接层

这个服务把浏览器里的苏丽娘 UI 和豆包端到端实时语音大模型 API 隔离开：

- 前端只连接本地 `ws://127.0.0.1:8787/voice`
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

