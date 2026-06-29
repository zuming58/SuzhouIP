# Suliniang 3D State Videos

这里保存苏丽娘状态短视频资产。

## 目录

- `original/`：从桌面复制进来的原始视频，未改动。
- `normalized/`：已按首帧统一人物大小和位置的视频，后续开发优先使用。
- `_normalized_video_first_frames_contact_sheet.jpg`：对齐后首帧预览。
- `normalization_metadata.json`：每条视频的首帧检测框、缩放和偏移参数。

## 对齐标准

- 输出尺寸：1080 x 1920。
- 输出格式：mp4 / H.264 / 24fps。
- 背景：白色。
- 首帧人物目标高度：约 1740px。
- 首帧人物脚底基线：约 y=1848。
- 首帧人物水平中心：x=540。
- 处理方式：只根据首帧计算一次缩放和位移，然后整条视频使用同一组参数，避免逐帧追踪造成抖动。

## 视频清单

| File | Meaning |
|---|---|
| `idle_loop.mp4` | 待机循环 |
| `welcome_once.mp4` | 欢迎动作 |
| `listening_loop.mp4` | 倾听循环 |
| `thinking_loop.mp4` | 思考循环 |
| `speaking_loop.mp4` | 说话循环 |
| `guide_once.mp4` | 景点讲解动作 |
| `recital_once.mp4` | 诗词吟诵动作 |
| `smile_once.mp4` | 微笑反馈动作 |

## 开发建议

网页、演示 Demo、剪辑包装优先调用 `normalized/` 里的视频。`original/` 只用于备份和必要时重新处理。
