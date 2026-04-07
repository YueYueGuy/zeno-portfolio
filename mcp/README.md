# Portfolio Content MCP

这个 MCP 服务用于管理 `/Users/yueyue/zeno-portfolio/data/portfolio-content.json`，让作品详情页可以通过配置来维护图片、标题、说明文字和分区结构，而不是每次直接改 `index.html`。

## 当前前端支持的详情区块

- `text`: 文本内容区块，支持 `label`、`heading`、`summary`、`body`
- `image`: 单张大图区块，支持 `image`、`title`、`body`、`alt`、`href`
- `gallery`: 图集区块，支持 `items`
- `quote`: 引言区块，支持 `quote`、`source`

## 数据文件

- 内容配置: `/Users/yueyue/zeno-portfolio/data/portfolio-content.json`
- MCP 服务: `/Users/yueyue/zeno-portfolio/mcp/portfolio-content-server.mjs`

## 建议的 MCP 配置

```json
{
  "mcpServers": {
    "zeno-portfolio-content": {
      "command": "node",
      "args": [
        "/Users/yueyue/zeno-portfolio/mcp/portfolio-content-server.mjs"
      ]
    }
  }
}
```

## 工具列表

- `get_content_schema`: 查看完整 schema 和支持的区块类型
- `list_series`: 列出所有系列，支持按 tag 过滤
- `get_series`: 获取单个系列完整配置
- `upsert_series`: 新建或整体替换一个系列
- `update_series_detail`: 局部更新 detail 区域，比如 hero 和 summary
- `replace_series_sections`: 整体替换详情页 sections
- `delete_series`: 删除一个系列

## 示例 section

```json
{
  "id": "problem",
  "type": "text",
  "label": "Context",
  "heading": "Problem Framing",
  "summary": "What the product needed to achieve.",
  "body": "Users needed a clearer flow for trust, onboarding, and conversion."
}
```

```json
{
  "id": "hero-visual",
  "type": "image",
  "label": "Highlight",
  "heading": "Launch Visual",
  "title": "Homepage Hero",
  "body": "A refined landing page shot used as the main cover.",
  "image": "https://example.com/hero.png",
  "alt": "Homepage hero shot",
  "href": "https://dribbble.com/shots/example"
}
```

```json
{
  "id": "selected-works",
  "type": "gallery",
  "label": "Gallery",
  "heading": "Selected Works",
  "items": [
    {
      "title": "Dashboard",
      "meta": "Admin · Desktop",
      "image": "https://example.com/dashboard.png",
      "alt": "Dashboard shot",
      "href": "https://example.com/dashboard"
    }
  ]
}
```

## 本地可视化后台页

如果你想直接在页面里编辑内容，而不是只通过 MCP 工具或手改 JSON，现在后台已经拆成两页：

- 列表页: `/Users/yueyue/zeno-portfolio/admin.html`
- 编辑页: `/Users/yueyue/zeno-portfolio/admin-edit.html`

建议用本地静态服务打开项目根目录，例如：

```bash
cd /Users/yueyue/zeno-portfolio
python3 -m http.server 4173
```

然后访问：

- 列表页: `http://localhost:4173/admin.html`
- 编辑页: `http://localhost:4173/admin-edit.html?id=mosey-ai`

### 后台页支持

- 在列表页浏览所有系列并进入单独编辑页
- 在编辑页左侧修改内容，右侧实时预览详情页效果
- 编辑列表页标题、eyebrow、summary、tags
- 编辑详情页标题、summary、hero 图片与链接
- 新增、删除、排序 detail sections
- 编辑 `text / image / gallery / quote` 四类 section
- 绑定本地 `portfolio-content.json` 后一键保存
- 如果浏览器不支持直接写文件，仍可下载最新 JSON 作为备份
