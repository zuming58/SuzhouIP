# 苏丽娘 AI 数字导游项目 - 工作交接记录

**修改日期：** 2026年6月30日
**修改人员：** Hermes AI
**项目路径：** `F:/Hermes/suzhouIP/`

---

## 📋 本次修改概述

解决了 Codex 与 Hermes 两个项目文件夹端口冲突问题，优化了 UI 布局，修复了服务崩溃 Bug。

---

## 🔧 具体修改内容

### 1. 问答页面底部输入栏重构
**文件：** `suliniang_ui_demo/index.html`、`suliniang_ui_demo/styles.css`

**修改前：**
- 巨大的圆形麦克风按钮占据整个底部中央

**修改后：**
- 标准聊天软件布局：
  ```
  ┌─────────────────────────────────────────────┐
  │ [🔘语音]  输入你想问苏丽娘的问题...  [发送] │
  └─────────────────────────────────────────────┘
  ```
- 左边：圆形浅灰色语音按钮（按住说话）
- 中间：文字输入框
- 右边：深绿色渐变发送按钮
- 整体白色背景，圆角设计

### 2. 主页按钮布局优化
**文件：** `suliniang_ui_demo/index.html`、`suliniang_ui_demo/styles.css`

**修改前：**
- 5个按钮纵向排列，占3行

**修改后：**
- 2×2 网格布局，共4个按钮：
  ```
  ┌──────────────┬──────────────┐
  │  问苏丽娘    │  定制路线    │
  ├──────────────┼──────────────┤
  │  附近推荐    │  我的行程    │
  └──────────────┴──────────────┘
  ```
- 第一个按钮（问苏丽娘）使用主色调渐变突出显示

### 3. 删除重复的"问苏丽娘"页面
**文件：** `suliniang_ui_demo/index.html`

- 删除了原来独立的 `data-screen="ask"` 页面
- 统一合并到 `data-screen="voice"` 页面，标题改为"问答"
- 控制台页面切换按钮同步更新：删除"问答"按钮，语音按钮改名为"问答"

### 4. 删除控制台"数字人状态"区块
**文件：** `suliniang_ui_demo/index.html`

- 移除了 idle/listen/think/speak/guide/smile 等状态切换按钮
- 控制台更简洁

### 5. 端口彻底分离，解决 Codex 冲突
**文件：**
- `voice_bridge/.env` - `PORT=8787` → `PORT=8788`
- `suliniang_ui_demo/app.js` - WebSocket 地址 8787 → 8788

**端口分配：**

| 项目 | 静态页面端口 | 语音桥接端口 | 文件夹路径 |
|------|------------|------------|----------|
| **Codex（原来的）** | 5500 | 8787 | `F:/Codex/suzhouIP/` |
| **Hermes（本次修改）** | 5501 | 8788 | `F:/Hermes/suzhouIP/` |

**两个项目完全独立运行，互不干扰！**

### 6. 修复语音桥接服务崩溃 Bug
**文件：** `voice_bridge/server.js`

**问题：**
- `classifyMockIntent` 函数调用名写错成 `classifyIntent`
- 导致服务启动后立刻崩溃

**修复：**
- 修正函数调用名：`classifyIntent(text)` → `classifyMockIntent(text)`

### 7. 修复 MOCK_MODE 判断逻辑
**文件：** `voice_bridge/server.js`

**问题：**
- 原来的判断 `MOCK_MODE = process.env.MOCK === "true"` 写错了
- 导致即使有 VOLC_ACCESS_KEY 也进入 MOCK 模式

**修复：**
- 恢复正确的判断逻辑：`MOCK_MODE = process.env.MOCK_MODE !== "0" || !process.env.VOLC_ACCESS_KEY`

---

## 🌐 访问地址

### Hermes 项目（本次修改版本）：
```
http://127.0.0.1:5501/suliniang_ui_demo/index.html?screen=voice
```

### Codex 项目（原来的版本）：
```
http://127.0.0.1:5500/suliniang_ui_demo/index.html?screen=voice
```

---

## ✅ 服务启动方式

### 方式1：一键启动脚本
双击 `F:/Hermes/suzhouIP/启动苏丽娘演示.bat`

### 方式2：手动启动
```bash
# 启动静态页面服务（端口5501）
cd F:/Hermes/suzhouIP
python -m http.server 5501 --bind 127.0.0.1

# 启动语音桥接服务（端口8788）
cd F:/Hermes/suzhouIP/voice_bridge
node server.js
```

---

## ⚠️ 重要注意事项

1. **不要搞混两个项目！**
   - Hermes 改的是 `F:/Hermes/suzhouIP/`
   - Codex 改的是 `F:/Codex/suzhouIP/`
   - 两个文件夹完全独立，修改一个不影响另一个

2. **端口号很重要！**
   - 访问 Hermes 版本必须用 **5501** 端口
   - 访问 Codex 版本用 **5500** 端口
   - 不要搞混端口号，否则看到的是旧版本！

3. **浏览器缓存问题**
   - 如果修改后看不到变化，按 `Ctrl+Shift+R` 强制刷新
   - 或者用无痕模式（`Ctrl+Shift+N`）打开

---

## 📝 待完成事项（后续）

1. 语音生成路线后自动跳转到路线页面，并填充真实数据
2. 优化打断功能，说话时立即停止 TTS 播放
3. 完善景点讲解和附近美食的真实数据对接

---

**交接完成时间：** 2026年6月30日 12:05
