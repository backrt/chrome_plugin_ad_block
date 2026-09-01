# Firefox Add-ons (AMO) — 隐私与权限说明（复制粘贴用）

扩展名称：AI广告拦截 / AI Ad Blocker  
隐私政策 URL（Firefox 分支推送后使用）：  
`https://github.com/backrt/chrome_plugin_ad_block/blob/feature/firefox/PRIVACY.md`

当前分支也可先用：  
`https://github.com/backrt/chrome_plugin_ad_block/blob/feature/edge_store/PRIVACY.md`

---

## 单一用途 / 扩展说明

```
本扩展的唯一用途是：在 Firefox 浏览器中拦截广告请求并隐藏残留广告元素。

扩展使用内置 EasyList / EasyList China 静态规则拦截常见广告网络请求，按化妆规则用 CSS 隐藏广告容器，并在弹窗中列出当前页已拦截请求与疑似广告候选项。用户勾选后才写入本地动态规则。扩展还会定期下载公开过滤列表 JSON 作为数据以更新增量规则。设置与规则仅保存在用户设备本地。
```

---

## 权限说明（AMO 审核 / 用户可见）

| 权限 | 理由 |
|------|------|
| `declarativeNetRequest` | 执行 EasyList 静态规则、用户动态规则与列表增量拦截 |
| `storage` / `unlimitedStorage` | 本地保存设置、动态规则与过滤列表缓存 |
| `alarms` | 每日拉取公开过滤列表 JSON（规则数据，不执行远程代码） |
| `activeTab` | 用户打开弹窗时读取当前标签页的拦截记录 |
| `webRequest` | 观察未被拦截的请求，供弹窗列出疑似广告候选项 |
| `<all_urls>` | 在任意站点拦截广告请求、隐藏广告元素并识别候选项 |

---

## 数据收集（AMO）

- **是否向开发者上传数据**：否，全部本地存储
- **建议勾选**：浏览活动 / 网站内容（仅本机用于拦截与隐藏广告，不上传）
- **远程代码**：否。会下载公开过滤列表 JSON 作为数据，不执行远程 JavaScript

---

## 隐私政策网址

```
https://github.com/backrt/chrome_plugin_ad_block/blob/feature/firefox/PRIVACY.md
```
