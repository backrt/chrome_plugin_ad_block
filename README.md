# AI广告拦截（Microsoft Edge Manifest V3）

基于 Declarative Net Request 的 Edge 广告拦截扩展。与 Chrome 共用同一份 EasyList 增量（由 `feature/chrome` 上的 GitHub Action 生成），本分支只放 Edge 适配。

- 使用 EasyList / EasyList China 静态规则自动拦截常见广告请求
- 用 content script 按化妆规则隐藏残留广告元素
- 识别当前页面上尚未拦截的疑似广告，并在弹窗中列表展示
- 由你勾选后，才写入用户动态规则（ID 1–5000）
- 每日拉取公开列表增量，写入列表动态规则（ID 5001–30000）

## 准备规则集

首次加载扩展前，先生成静态 DNR 规则（需要网络）：

```bash
npm install
npm run build:rules
npm run build:icons
```

`npm run build:rules` 会下载 EasyList 并转换为 `rules/*.json` 与 `cosmetics/snapshot.json`，同时更新 `manifest.json` 中的 `rule_resources`。`npm run build:updates` 生成 `updates/` 下的增量 DNR 与全量化妆表，供扩展定时拉取。转换依赖本机可编译 `@eyeo/abp2dnr`（需要 Python 与 C++ 工具链）。仓库中已包含生成好的规则文件，日常加载扩展不必重新构建。

## 在 Edge 中加载

1. 打开 `edge://extensions`
2. 打开左下角「开发人员模式」
3. 点击「加载解压缩的扩展」
4. 选择本仓库根目录

过滤列表更新地址固定为 `feature/chrome` 的 `updates/`，不必在本分支再跑「Update filter lists」。

## 使用

- 打开含广告的网页，工具栏图标会显示拦截计数
- 点击图标：
  - **本页已拦截**：当前标签页最近被 DNR 拦住的请求
  - **本页疑似广告**：静态规则未拦住、但被识别为广告的候选项，勾选后点「将勾选项加入动态规则」
  - **我的动态规则**：启用、停用或删除你添加的规则
- 「设置」页可开关 EasyList / EasyList China、元素隐藏，并手动更新过滤列表

添加或删除动态规则后，刷新页面即可验证效果。

## 权限说明

- `declarativeNetRequest`：执行拦截
- `webRequest` + `<all_urls>`：观察未被拦截的请求，用于识别候选项
- `activeTab`：弹窗打开时读取当前标签页的命中规则
- `storage` / `unlimitedStorage`：保存动态规则、化妆表与更新状态
- `alarms`：每日拉取增量过滤列表

本扩展不声明 `declarativeNetRequestFeedback`，以便符合应用商店对调试权限的限制。

## 开发分支

- 当前分支 `feature/edge_store`：Edge 适配。
- 过滤列表由默认分支 `feature/chrome` 上的 Action 生成并写入 `updates/`。扩展运行时仍拉取该地址，不在本分支新增 runner 或 workflow。
- 仓库需为 Public，否则 GitHub raw 无法被扩展访问。

## 打包

```bash
npm run pack:edge
```

会生成 `dist/ai-ad-block-edge-<version>.zip`（不含 `scripts/`、`store/`、`updates/`）。隐私政策见 [PRIVACY.md](PRIVACY.md) 与 [docs/privacy.html](docs/privacy.html)。

## Edge Add-ons / Firefox AMO 素材

目录对齐同级项目 `chrome_plugin_traffic_mirror`：`store/edge/` 与 `store/firefox/`。

生成各语言宣传图、截图与 listing 文案（需 Pillow：`pip3 install pillow`）：

```bash
npm run store:edge
npm run store:firefox
```

各语言目录 `store/<edge|firefox>/<locale>/`：

- `listing-description.txt` — 商店描述
- `listing-keywords.txt` — 搜索关键词
- `promo-small-440x280.png` / `promo-large-1400x560.png` — 宣传图
- `extension-icon-300x300.png` — 商店图标
- `screenshots/*.png` — 1280×800（弹窗 / 设置 / 列表更新）

Partner Center / AMO 权限与隐私表单粘贴稿：

- `store/edge/partner-center-privacy-zh_CN.md`
- `store/firefox/partner-center-privacy-zh_CN.md`
