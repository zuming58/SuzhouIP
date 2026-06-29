# 豆包 Realtime 实时语音接入实施方案

本文档记录“苏丽娘 AI 数字导游”接入豆包端到端实时语音大模型 API 的实现原理、系统分工和分阶段开发步骤。目标是避免后续开发时把“实时语音对话”误做成普通的“录音转文字 + 大模型 + TTS”流程。

## 1. 核心目标

项目最终要实现的是类似“和苏丽娘打电话”的体验：

1. 用户一边说话，系统一边上传音频流。
2. 豆包 RealtimeAPI 一边识别用户语音，一边维护实时对话状态。
3. 用户说完后，苏丽娘尽快用自然语音回复。
4. 用户可以在苏丽娘说话时插话打断。
5. 当用户表达“生成路线、讲解景点、推荐附近美食”等业务意图时，系统调用我们自己的后端工具生成可靠结果。
6. 工具结果再交给豆包，让豆包用苏丽娘的人设和音色自然播报。

这不是普通流程：

```text
录完整句话 -> ASR -> 文本大模型 -> TTS -> 播放
```

而是实时流式流程：

```text
用户语音流
  -> Voice Bridge
  -> 豆包 RealtimeAPI
  -> ASR/对话/TTS 音频流
  -> 前端实时字幕和实时播放
```

同时，业务任务走：

```text
豆包 ASRResponse
  -> Voice Bridge 判断业务意图
  -> 调用路线/景点/附近推荐后端
  -> 工具结果喂回豆包
  -> 豆包用苏丽娘声音播报
```

## 2. 为什么需要 Voice Bridge

前端不能直接连接豆包 RealtimeAPI，原因如下：

1. 火山引擎 `APP ID`、`Access Token` 不能暴露在浏览器里。
2. 豆包 RealtimeAPI 使用 WebSocket 二进制协议，不是普通 JSON WebSocket。
3. 音频需要按小包流式发送，通常推荐约 20ms 一包。
4. 前端不应该直接决定业务工具调用，路线规划、景点知识、附近推荐要由我们自己的后端控制。
5. 后续需要维护用户上下文、当前城市、当前位置、当前页面、已选路线等状态。

因此中间需要一个后端桥接层：

```text
浏览器苏丽娘 UI
  <-> Voice Bridge
  <-> 豆包 RealtimeAPI

Voice Bridge
  <-> 我们自己的业务后端 / 本地大模型 / 路线规划工具
```

Voice Bridge 不是普通监听器。它的职责是：

1. 保护火山引擎密钥。
2. 代理豆包实时 WebSocket 二进制协议。
3. 维护当前对话上下文。
4. 接收豆包实时 ASR 文本。
5. 判断是否需要调用业务工具。
6. 调用业务工具并获得可靠结果。
7. 把工具结果整理后喂给豆包播报。
8. 把豆包返回的 TTS 音频流转发给前端播放。
9. 把状态同步给前端，例如“正在听、正在思考、正在讲”。

## 3. 系统分工

### 3.1 豆包 RealtimeAPI 负责

- 实时语音输入。
- 实时 ASR 识别。
- 语音对话模型。
- 苏丽娘人设表达。
- TTS 音频流输出。
- 用户打断。
- 上下文对话能力。

### 3.2 Voice Bridge 负责

- WebSocket 鉴权和二进制协议封装。
- 前端和豆包之间的音频流转发。
- 维护业务上下文。
- 判断用户意图。
- 调用我们的后端工具。
- 将工具结果通过 `ChatRAGText` 或 `ChatTTSText` 喂回豆包。
- 将豆包事件转换成前端容易处理的 JSON 事件。

### 3.3 我们自己的后端负责

- 生成路线。
- 景点讲解。
- 附近美食和服务推荐。
- 用户行程管理。
- 本地大模型结构化理解。
- 数据库、知识库、地图和业务规则。

### 3.4 前端负责

- 苏丽娘数字人视频状态。
- 麦克风采集。
- 语音按钮和通话状态。
- 实时字幕。
- 音频流播放。
- 路线、导览、附近推荐、行程页面联动。

## 4. 关键上下文设计

不能让豆包在没有上下文的情况下随便回答。每次会话都要让系统知道当前业务场景。

Voice Bridge 应维护类似下面的上下文：

```json
{
  "city": "苏州",
  "currentLocation": "拙政园",
  "currentSpot": "与谁同坐轩",
  "currentPage": "guide",
  "userProfile": {
    "group": "普通游客",
    "pace": "轻松"
  },
  "tripState": {
    "selectedRoute": null,
    "visitedSpots": []
  }
}
```

这个上下文有两类用途：

1. 给意图识别层使用，用来判断用户到底想做什么。
2. 给豆包播报使用，让苏丽娘知道当前是在苏州、拙政园、导游场景，而不是泛泛聊天。

## 5. 典型业务流程

### 5.1 用户想生成路线

用户说：

```text
我想安排半天苏州路线，少走路，中午想吃苏州小吃。
```

流程：

```text
1. 前端实时上传用户音频。
2. Voice Bridge 转发音频给豆包 RealtimeAPI。
3. 豆包返回 ASRResponse：
   “我想安排半天苏州路线，少走路，中午想吃苏州小吃。”
4. Voice Bridge 判断 intent = generate_route。
5. Voice Bridge 提炼参数：
   duration = half_day
   city = 苏州
   prefs = 园林、美食、少走路
6. Voice Bridge 调用 /api/plan。
7. 后端返回路线 JSON。
8. Voice Bridge 将路线结果整理成 RAG 文本。
9. Voice Bridge 发送 ChatRAGText 给豆包。
10. 豆包用苏丽娘音色自然播报路线。
11. 前端同步显示路线页面。
```

工具调用结果示例：

```json
{
  "title": "半天苏州轻松路线",
  "nodes": [
    {
      "time": "09:30",
      "title": "拙政园",
      "description": "先看远香堂和与谁同坐轩，适合园林精讲。"
    },
    {
      "time": "12:00",
      "title": "平江路",
      "description": "推荐苏式汤面、桂花糖粥和评弹茶馆。"
    }
  ]
}
```

喂给豆包的内容示例：

```text
用户想安排半天苏州路线，偏好少走路和苏州美食。
当前位置：苏州。
请你作为苏丽娘，用自然、温柔、适合语音播报的方式介绍下面这条路线：

09:30 拙政园：先看远香堂和与谁同坐轩。
12:00 平江路：推荐苏式汤面、桂花糖粥和评弹茶馆。

要求：不要超过 40 秒，口语化，不要读 JSON。
```

### 5.2 用户想看附近美食

用户说：

```text
我想看看周边有什么好吃的。
```

流程：

```text
1. 豆包识别用户语音。
2. Voice Bridge 判断 intent = nearby_recommend。
3. 根据上下文知道当前地点是拙政园。
4. 调用 /api/nearby?location=拙政园&type=food。
5. 得到附近推荐结果。
6. 将结果喂给豆包。
7. 豆包用苏丽娘音色播报。
8. 前端切换或更新“附近推荐”页面。
```

### 5.3 用户想听景点讲解

用户说：

```text
讲讲与谁同坐轩。
```

流程：

```text
1. 豆包返回 ASRResponse。
2. Voice Bridge 判断 intent = spot_explain。
3. 提取 spot = 与谁同坐轩。
4. 调用 /api/spot?id=yushui。
5. 得到讲解内容。
6. 使用 ChatRAGText 或 ChatTTSText 让豆包播报。
7. 前端同步选中对应点位。
```

## 6. 意图识别设计

第一版先支持四类意图：

```text
generate_route      生成路线
spot_explain        景点讲解
nearby_recommend    附近推荐
smalltalk           普通聊天
```

输出结构建议：

```json
{
  "intent": "generate_route",
  "confidence": 0.92,
  "params": {
    "duration": "half_day",
    "city": "苏州",
    "prefs": ["园林", "美食", "少走路"],
    "people": "未指定"
  }
}
```

第一版可以用规则实现，例如：

```text
包含“路线、安排、半天、一天” -> generate_route
包含“附近、周边、美食、小吃、餐厅” -> nearby_recommend
包含“讲讲、介绍、拙政园、与谁同坐轩、小飞虹” -> spot_explain
其他 -> smalltalk
```

第二版再换成本地大模型或专门的结构化解析模型。

## 7. 豆包 RealtimeAPI 使用方式

### 7.1 建立连接

WebSocket 地址：

```text
wss://openspeech.bytedance.com/api/v3/realtime/dialogue
```

需要的请求头：

```text
X-Api-App-ID
X-Api-Access-Key
X-Api-Resource-Id = volc.speech.dialog
X-Api-App-Key = PlgvMymc7f3tQnJ6
X-Api-Connect-Id
```

这些信息只允许放在后端 `.env`，不要放前端。

### 7.2 推荐模型

苏丽娘是强人设数字导游，建议优先用 SC2.0：

```json
{
  "dialog": {
    "extra": {
      "model": "2.2.0.0"
    }
  }
}
```

如果先测试官方精品音色，也可以用 O2.0：

```json
{
  "dialog": {
    "extra": {
      "model": "1.2.1.1"
    }
  }
}
```

### 7.3 苏丽娘人设

SC2.0 使用 `character_manifest`：

```json
{
  "dialog": {
    "character_manifest": "你是苏丽娘，苏州AI数字导游。你温柔、灵动、有昆曲和江南园林气质。回答要短句、口语化，适合边走边听。用户问路线、景点、附近服务时，先自然回应，再给出清楚建议。"
  }
}
```

### 7.4 音色

前期可以先用官方音色测试。

后期如果制作苏丽娘专属音色，拿到音色 ID 后配置：

```json
{
  "tts": {
    "speaker": "你的苏丽娘音色ID"
  }
}
```

注意事项：

1. 音色 ID 要和模型版本匹配。
2. 如果报 `InvalidSpeaker`，优先检查模型版本和音色类型。
3. SC2.0 音色克隆常见为 `saturn_` 或 `S_` 开头。

### 7.5 麦克风音频

推荐实时输入方式：

```json
{
  "asr": {
    "audio_info": {
      "format": "speech_opus",
      "sample_rate": 16000,
      "channel": 1
    }
  },
  "dialog": {
    "extra": {
      "input_mod": "keep_alive"
    }
  }
}
```

如果使用按住说话模式，可以使用：

```json
{
  "dialog": {
    "extra": {
      "input_mod": "push_to_talk"
    }
  }
}
```

实时音频上传原则：

```text
约 20ms 一包
持续流式上传
不要等整句话录完再发
```

## 8. 前端和 Bridge 的自定义协议

前端不直接处理豆包协议，只处理我们自己的简化协议。

### 8.1 前端发给 Bridge

开始会话：

```json
{
  "type": "session.start",
  "model": "2.2.0.0"
}
```

文本测试：

```json
{
  "type": "text.query",
  "content": "帮我安排半天苏州路线"
}
```

音频流：

```text
binary audio chunk
```

结束会话：

```json
{
  "type": "session.end"
}
```

### 8.2 Bridge 发给前端

会话开始：

```json
{
  "type": "session.started",
  "dialogId": "xxx"
}
```

ASR 最终文本：

```json
{
  "type": "asr.final",
  "text": "我想安排半天苏州路线"
}
```

业务意图：

```json
{
  "type": "business.intent",
  "intent": "generate_route",
  "params": {
    "duration": "half_day"
  }
}
```

豆包文本回复：

```json
{
  "type": "chat.partial",
  "text": "好呀，我给你安排一条...",
  "fullText": "好呀，我给你安排一条轻松路线..."
}
```

TTS 音频：

```text
binary audio chunk
```

状态：

```json
{
  "type": "state.changed",
  "state": "speaking"
}
```

## 9. 分阶段实施计划

### 阶段 1：整理语音 UI

目标：把当前工程骨架改成真正的语音对话页。

页面结构：

```text
顶部：返回 / 实时语音 / 连接状态
中间：苏丽娘数字人视频
状态：待机 / 正在听 / 正在思考 / 正在讲
字幕：用户问题 + 苏丽娘回复
底部：开始对话 / 结束对话 / 快捷问题
```

不做真实豆包接入，只整理体验。

### 阶段 2：Mock Bridge 跑通

目标：不用火山密钥，先验证产品闭环。

流程：

```text
点击开始对话
-> 连接本地 Voice Bridge
-> 发送文本测试问题
-> Bridge 模拟 ASR
-> Bridge 判断 intent
-> Bridge 返回模拟回复
-> 前端更新路线/导览/附近页面
```

验收问题：

```text
帮我安排半天苏州路线
讲讲与谁同坐轩
附近有什么苏州小吃
```

### 阶段 3：接豆包文本模式

目标：验证账号、模型、人设、音色。

使用事件：

```text
StartConnection
StartSession
ChatTextQuery
ChatResponse
TTSResponse
FinishSession
```

这一步仍然不是最终语音体验，但可以先确认：

1. 火山账号能连通。
2. 苏丽娘人设是否生效。
3. 音色是否可用。
4. TTS 音频是否能播放。

### 阶段 4：接业务工具调用

目标：让语音驱动真实业务。

Bridge 收到 `ASRResponse` 后：

```text
ASRResponse
-> Intent Router
-> /api/plan 或 /api/spot 或 /api/nearby
-> 工具结果
-> ChatRAGText / ChatTTSText
-> 豆包播报
```

第一版工具可以先调用前端已有本地数据，后续再替换成真实后端。

### 阶段 5：接真实麦克风实时流

目标：真正做到端到端实时语音。

流程：

```text
浏览器麦克风
-> 20ms 音频包
-> Voice Bridge
-> 豆包 TaskRequest
-> ASRResponse / TTSResponse
-> 前端实时字幕 / 实时播放
```

需要解决：

1. 麦克风权限。
2. 浏览器音频采集。
3. Opus 或 PCM 编码。
4. 20ms 分包。
5. 播放队列。
6. 用户打断。
7. 断线重连。

### 阶段 6：接苏丽娘专属音色

目标：替换官方音色，使用更符合苏丽娘角色的声音。

步骤：

```text
1. 在火山控制台训练或注册音色。
2. 获取 speaker ID。
3. 确认 speaker ID 和模型版本匹配。
4. 配置 VOLC_SPEAKER。
5. 测试语速、音量、人设表达。
```

## 10. 风险和注意事项

1. 目前文档里没有明确看到 RealtimeAPI 的原生 `ToolCall` / `FunctionCall` 事件。
2. 因此不要假设豆包会自动调用我们的后端工具。
3. 工具调用应由 Voice Bridge 编排。
4. 豆包负责自然语音和人设表达，我们的后端负责可靠业务结果。
5. 如果未来 RealtimeAPI 支持原生工具调用，可以把 Intent Router 替换成官方 ToolCall 机制。
6. 不要把火山密钥放到前端。
7. 不要让豆包自由编路线，路线结果必须来自我们的工具或数据。
8. 不要一开始就做真实麦克风，先跑通 mock 和文本模式。

## 11. 当前项目里的相关文件

当前已经有一个初步骨架：

```text
voice_bridge/
  server.js
  src/doubao-realtime-client.js
  src/doubao-realtime-codec.js
  .env.example
  README.md

suliniang_ui_demo/
  index.html
  app.js
  data/app-content.js
  data/app-content.json
```

后续建议先整理 `suliniang_ui_demo` 的语音页面，再继续完善 `voice_bridge`。

## 12. 下一步最小可行任务

下一轮开发建议只做三件事：

1. 重做语音 UI，让它像正式通话页面。
2. 完善 Mock Bridge，让它输出 `asr.final -> business.intent -> tool_result -> chat.partial`。
3. 用 mock 跑通三句话：

```text
帮我安排半天苏州路线
讲讲与谁同坐轩
附近有什么苏州小吃
```

这三句话跑通后，再接火山真实密钥和真实 RealtimeAPI。

