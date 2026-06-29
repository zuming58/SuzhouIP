# Normalized 3D Character Assets

这是经过统一画布和统一人物比例处理后的苏丽娘动作资产，后续开发和状态切换优先使用本目录。

## 处理标准

- 画布统一：1080 x 1536。
- 背景统一：白色。
- 人物高度统一：约 1320px。
- 脚底基线统一：约 y=1470。
- 人物水平中心统一：x=540。
- 原始图片保留在 `../assets_3d_character/`，本目录只放开发调用版。

## 文件

| File | Meaning | Best For |
|---|---|---|
| `pose_inviting_bow.png` | 颔首邀请 | welcome, CTA, start guide |
| `expression_eyes_closed.png` | 闭眼 | recital, quiet transition, standby |
| `pose_listening.png` | 侧耳倾听 | voice input, Q&A listening state |
| `pose_point_to_scene.png` | 抬手指景 | scenic explanation, route guidance |
| `pose_thinking.png` | 托腮思考 | generating route, thinking state |
| `pose_sleeve_laugh.png` | 掩口轻笑 | success, easter egg, friendly feedback |
| `pose_arrange_sleeves.png` | 整理水袖 | idle, loading, transition |
| `expression_mouth_open.png` | 张嘴 | speaking state, talking avatar placeholder |
| `prop_fan_half_cover.png` | 执扇半遮 | cover visual, character intro, poster |
| `_normalized_preview_contact_sheet.png` | 九宫格预览 | quick visual check |

## 开发建议

状态机、网页 UI、短视频起始帧都优先使用本目录图片。这样不同状态之间切换时，人物不会忽高忽低、忽大忽小。
