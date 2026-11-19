# 叉叉机 APK 打包说明

用 **Capacitor + GitHub Actions** 打包：代码推到 GitHub，服务器自动编译出 APK，你不用装 Android Studio。

---

## 一、你要做的只有两步

### 第 1 步：把改动推到 GitHub

在项目根目录（`D:\叉叉机`）打开终端，执行：

```
git add .
git commit -m "add apk packaging"
git push
```

### 第 2 步：去 GitHub 下载 APK

1. 打开你的仓库 `github.com/Suzi190/---`
2. 点顶部 **Actions** 标签
3. 左边选 **Build APK**，点最新那条正在跑（黄点）或刚跑完的记录
4. 等它变成 **绿勾**（约 5~10 分钟，第一次慢）
5. 页面拉到最下面，**Artifacts** 区域点 `chachaji-apk` → 下载得到 zip
6. 解压出 `app-debug.apk`，传到手机安装

> 装之前如果手机上有旧版，**先卸载**。签名不同会提示"应用未安装"。

---

## 二、你要的 4 件事，分别是怎么做到的

### 1. 全屏 + 刘海区用起来 + 输入框不被键盘挡

| 问题 | 原因 | 做法 |
|---|---|---|
| 顶部空一块 | 系统给状态栏留了位置，网页只能从状态栏下面开始 | 原生关掉系统栏占位（`setDecorFitsSystemWindows(false)`），状态栏/导航栏设成透明，并允许绘制到刘海区（`shortEdges`）。背景直接铺满整块屏幕 |
| 输入框被键盘挡住 | APK 里 WebView 不会因为键盘自己变矮，网页以为屏幕还是全高 | 原生监听键盘高度，**直接压缩 WebView**。键盘滑出的每一帧都同步缩，输入框永远贴在键盘上沿 |
| 毫无默契（先跳一下、收起后莫名回顶部） | 项目里 `keyboard-viewport-fix.js` 是给浏览器写的兜底：聚焦后**固定等 280ms** 才滚动，失焦后**强制 `scrollTo(0,0)`**。它和原生 resize 同时生效 → 必然打架 | 在 App 里**提前把它关掉**（置 `window.__keyboardViewportFixInstalled = true`，它自己会整体跳过）。浏览器里照旧生效，不受影响 |

另外：Android 的 WebView **不支持** `env(safe-area-inset-*)`（永远返回 0），所以由原生把真实数值传给网页，再把 CSS 里的 `env()` 换成有值的变量——这样页面顶部该避让的地方避让，该铺满的地方铺满。

### 2. 数据导入导出正常

APK 的 WebView 里 `<a download>` 和 Blob 下载**全部无效**，所以导出必须走原生。

项目里的 `js/native-bridge.js` 早就写好了对原生插件的调用，它要求插件名叫 `MixNativeBridge`，并且这 10 个方法必须存在：

```
startFileSaveSession / appendFileSaveChunk / finishFileSaveSession / abortFileSaveSession
saveFileToDownloads / checkNotificationPermission / requestNotificationPermission
showNotification / startForegroundTask / stopForegroundTask
```

我写了 `MixNativeBridgePlugin.java` 把这 10 个方法全部实现：

- **大文件**分块写临时文件 → 完成后放进系统「下载」文件夹
- **小文件**一次性写入
- Android 10 及以上走 `MediaStore`（**不需要存储权限**）；老系统直接写公共 Downloads 目录

导出后文件在手机的 **下载 / Download** 文件夹里，微信/QQ 里能直接发出去。

### 3. 左滑右滑退回上一页，而不是退出 App

Android 的边缘侧滑手势和返回键都会触发 `backButton` 事件。**默认行为是 `finish()` 直接关闭 App**——这就是"滑一下就没了"。

现在改成：

1. 先看当前有没有打开的页面（聊天天、设置页、QQ 页…）
2. 有 → 点它自己的返回按钮（让项目走完整的清理流程），点不到就把这层收起来
3. 已经在主屏 → **最小化到后台**，绝不直接退出

### 4. 通知权限

- Android 13+ 需要运行时授权，App 启动约 1.8 秒后会自动弹权限框
- 授权后角色消息、生成完成提醒都能弹通知
- 点通知直接回到 App
- 顺手也实现了"后台运行中"常驻通知（保活用）

---

## 三、不打包进去的东西

为了满足"不用的不要放进去"，`scripts/build-www.js` 会自动排除：

| 文件 | 为什么不放 |
|---|---|
| `cordova.js` / `cordova_plugins.js` | 0 字节，旧 Cordova 残留 |
| `js/backup-export-router.js` | 未被加载的死代码（备份实际由 `global-backup-v3.js` 完成） |
| `js/chat-dom-trim.js` | 未启用的性能补丁 |
| `js/image-lazy-unload.js` | 未启用的性能补丁 |
| 根目录 `_*.js` / `_*.txt` | 我的调试脚本，`.gitignore` 已排除 |

最终 www 目录：**111 个文件 / 17.3 MB**（其中 9.1 MB 是 `data/` 里的图片素材）。

---

## 四、关键技术参数

| 项 | 值 |
|---|---|
| 包名 | `com.chachaji.app` |
| 应用名 | 叉叉机 |
| 最低 Android | 6.0（API 23） |
| 目标 Android | 15（API 35） |
| 签名 | Debug 签名（可直接安装） |
| 屏幕方向 | 竖屏锁定 |

---

## 五、常见问题

**Q：Actions 里报错了怎么办？**
点开红色的那一步，把报错发我。`scripts/build-www.js` 和 `scripts/patch-android.js` 都自带校验，会在编译前就把问题指出来（比如注释引用缺失、插件方法漏了）。

**Q：想改成正式签名版（能上架/长期用）？**
需要生成一个 keystore，我再帮你加签名配置。

**Q：想换 App 图标？**
替换 `叉叉机/icon-512.png`（512×512），重新推送即可。

**Q：改了网页代码，要重新打包吗？**
要。每次推送 `main` 分支都会自动重新打包。

**Q：装完打开是白屏？**
告诉我，我把 WebView 调试打开排查。

---

## 六、文件清单（这次新增的）

```
package.json                                   依赖与命令
capacitor.config.json                          Capacitor 配置
.gitignore                                     排除调试文件和构建产物
.github/workflows/build-apk.yml                自动打包流程
scripts/build-www.js                           生成 www/（带引用校验）
scripts/patch-android.js                       打 Android 补丁（带完整性校验）
android-overlay/app/src/main/java/com/chachaji/app/MainActivity.java
                                               全屏 + 键盘 insets 联动
android-overlay/app/src/main/java/com/chachaji/app/MixNativeBridgePlugin.java
                                               导出/通知/保活 原生实现
android-overlay/app/src/main/res/values/styles.xml
                                               全屏沉浸主题
叉叉机/js/capacitor-shell.js                   网页侧适配（返回键/安全区/关掉旧键盘兜底）
叉叉机/index.html                              注入上面这个脚本（+59 字节）
```
