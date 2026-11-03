# Game Shelf UI

一个用于浏览游戏收藏的开源 3D 书架界面，基于 Next.js、React 和 Three.js。

![Game Shelf 演示](docs/screenshot.jpg)

![分类墙](docs/wall.jpg)

这是一个独立的前端演示工程：没有账号、没有数据库、没有私人路径、没有部署脚本。演示里的游戏、工作室和封面全部是虚构的，可以直接公开或分享。

## 功能

- 3D 书架：9 张精选封面、悬停抬升、弹簧翻转、详情展示。
- 滚轮拉远或点击分类，展开整个收藏墙和层架。
- 动作、冒险、角色扮演、生存恐怖、竞速五个分类墙。
- 全收藏搜索。
- 每个条目都有独立详情页。
- 桌面和手机响应式布局。
- 支持静态导出，可部署到 GitHub Pages、Netlify、Vercel 或任意静态托管。
- 演示封面由脚本生成为 SVG，仓库里没有二进制图片素材。

## 技术栈

- Next.js 16（App Router）
- React 19
- Three.js
- TypeScript
- 没有 UI 框架、CSS-in-JS 或后端

## 快速开始

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

打开 <http://localhost:3000>。

其他命令：

```bash
npm run typecheck   # TypeScript 检查
npm run build       # 生产构建
npm run art         # 重新生成演示封面
```

## 换成你自己的收藏

收藏数据只有一份文件：[`src/data/games.json`](src/data/games.json)。每个条目长这样：

```json
{
  "id": "aurora-drift",
  "title": "Aurora Drift",
  "shortTitle": "Aurora Drift",
  "developer": "Northlight Studio",
  "year": "2025",
  "description": "悬停卡片上的一句话简介。",
  "longDescription": "详情页使用的长简介。",
  "categories": ["racing"],
  "featured": true,
  "palette": ["#07142b", "#31e1c4", "#8b7bff"],
  "motif": "orbit",
  "bgColor": "#07142b"
}
```

- `featured: true` 会把游戏放上首页书架。前 9 个条目排成两排，其余条目放在拉远后的收藏墙上。
- `categories` 可选 `action`、`adventure`、`rpg`、`horror`、`racing`。
- `palette` 是生成封面时使用的三色配色。
- `motif` 是封面图案。可选：`orbit`、`bloom`、`wave`、`prism`、`arc`、`grid`、`eclipse`、`monolith`、`stripes`、`spiral`、`constellation`、`rings`。

改完数据后运行：

```bash
npm run art
```

脚本会把方形封面写到 `public/demo/covers/`，把封底写到 `public/demo/backs/`。

### 使用自己的封面

用自己的图片替换生成的 SVG 即可。保持文件 id 不变，必要时修改 `games.ts` 里的扩展名：

```ts
cover: asset(`/covers/${game.id}.webp`),
back: asset(`/backs/${game.id}.webp`),
```

3D 场景和 `next/image` 共用同一对文件，所以每个游戏只需要一张约 1024×1024 的方形封面和一张封底。请不要把没有 redistribution 授权的商业游戏封面提交到公开仓库。

## 静态导出

```bash
NEXT_STATIC_EXPORT=1 npm run build
```

产物在 `out/`。如果要部署到子路径：

```bash
NEXT_STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/game-shelf npm run build
```

`basePath` 和 `assetPrefix` 已经接在 `next.config.ts` 里，所有素材地址都会跟随 `NEXT_PUBLIC_BASE_PATH`。

## 目录结构

```text
src/
  app/
    page.tsx                     # 书架首页
    games/[id]/page.tsx          # 详情页
    library.css                  # 书架界面样式
  components/library/
    GameShelf.tsx                # DOM 外壳、搜索、手机端、分类索引
    ShelfScene.ts                # Three.js 场景
    games.ts                     # 数据加载和辅助函数
    walls.ts                     # 分类墙条目
    layoutWall.ts                # 两排墙面布局
    layoutCollectionRack.ts      # 收藏层架布局
    icons.tsx
  data/games.json                # 收藏数据
  types/library.ts
public/demo/                     # 生成的虚构封面
scripts/generate-demo-art.mjs    # 封面/封底生成脚本
```

3D 书架、墙面、层板和塑封反光全部由 Three.js 基础几何体和 Canvas 纹理在浏览器里生成。仓库不包含第三方模型、字体或图片包。

## 素材与商标

演示中的游戏名、工作室、简介和封面均为本项目虚构。用户在使用本项目时提到的真实产品名、Logo 或商标仍归各自权利人所有。本仓库不包含商业游戏封面。

界面设计参考了网页上编辑风格的 3D 书架交互，但实现和演示素材均为独立创作。

## 许可证

[MIT](LICENSE)。代码和生成的演示封面都可以自由使用、修改和再分发。
