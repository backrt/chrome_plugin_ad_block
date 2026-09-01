# 广告拦截（Chrome Manifest V3）

基于 Declarative Net Request 的 Chrome 广告拦截扩展：

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

## 在 Chrome 中加载

1. 打开 `chrome://extensions`
2. 打开右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本仓库根目录

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

本扩展不声明 `declarativeNetRequestFeedback`，以便符合 Chrome 网上应用店对调试权限的限制。

## 开发分支

- `feature/chrome`：Chrome 实现。GitHub Action「Update filter lists」每天把 EasyList 增量写到本分支的 `updates/`（GitHub 托管 `ubuntu-latest`，不自建 runner）。
- `feature/edge_store`：Edge 适配。扩展代码可以不同，过滤列表仍拉取 `feature/chrome` 的 `updates/`，不要再加一套 Action。
- `feature/firefox`：后续。

仓库默认分支保持 `feature/chrome`，否则定时任务不会跑。
