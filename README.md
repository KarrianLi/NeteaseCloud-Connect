# 网易云音乐 手机遥控

用手机控制**电脑上正在运行的网易云音乐客户端**：选歌单、点歌、暂停/切歌、拖进度、调音量、切播放模式、看歌词。

播放始终由官方客户端完成（音质、播放模式、歌词、听歌记录都与原生一致），本项目只做遥控，不接管音频输出、不修改客户端文件。

> 非官方项目，仅供个人学习与自用；请遵守网易云音乐的用户协议。

## 功能

- 歌单列表、歌曲列表，点播单曲或整个歌单
- 播放 / 暂停、上一首 / 下一首、进度拖动、音量滑块（带百分比）
- 四种播放模式：顺序播放、列表循环、单曲循环、随机播放
- 实时歌词（支持翻译），自动居中高亮；歌词偏移可调（±0.1 秒/次，长按连续调，全局生效并记忆）
- 播放队列查看与切歌
- 手机端为移动优先的深色网页，可添加到桌面；另附 Android APK 壳
- 开机自动启动，静默运行

## 工作原理

1. start.bat 以调试模式启动客户端：
   cloudmusic.exe --remote-debugging-port=9222
2. 桥接服务（Node.js）通过 CDP 连接客户端页面，定位页面里的 Redux store；
3. 控制动作等价于在客户端界面里点击：直接 dispatch 客户端自己的 action（播放、切歌、seek、音量、模式）；
4. 歌单、歌曲、歌词通过 NeteaseCloudMusicApiEnhanced 读取，并复用客户端已登录的 cookie。

因此不需要网易云开放 API，也不需要额外账号体系。

## 环境要求

- Windows 10 / 11（本项目只支持 Windows）
- 网易云音乐 PC 客户端 3.x（安装在任意盘符均可，脚本会自动查找）
- Node.js 18+（install.bat 会自动下载便携版，无需手动安装）
- 手机与电脑在同一局域网（同一 WiFi）

## 快速开始

1. 下载本仓库：Code → Download ZIP，或 git clone
2. 双击 **install.bat**：自动下载便携版 Node、安装依赖、设置开机自启
3. 双击 **start.bat**：以调试端口启动网易云，再启动遥控服务
4. 手机浏览器打开启动窗口里显示的地址，例如：

   http://192.168.1.10:3040/

   也可以点页面右上角的链接按钮，扫描二维码直接打开

启动窗口保持开着即可；关闭窗口或双击 stop.bat 停止服务（网易云音乐不会被关闭）。

## Android APK

安装包：**apk/musicremote.apk**（Android 5.0 及以上）。

安装后打开，填入电脑地址（可只填 IP:端口），点连接即可；长按页面可重新设置地址。

APK 只是一个 WebView 壳，电脑端服务仍需运行；首次连接需要在手机上允许该应用的网络访问。

## 开机自启与卸载

- install.bat 已在「启动」目录创建快捷方式，开机后静默启动服务
- uninstall.bat：停止服务并删除开机自启快捷方式

## 常见问题

**提示找不到网易云音乐客户端**
确认已安装客户端；如果装在非常规位置，设置环境变量 CLOUDMUSIC_EXE 指向 cloudmusic.exe 后重新运行。

**手机打不开页面**
1. 确认手机与电脑连的是同一个 WiFi；2. Windows 防火墙允许 Node.js 访问专用/公用网络；3. 部分公共 WiFi 或路由器开启了 AP 隔离，设备之间无法互访。

**页面显示「与客户端连接中断」**
调试端口没开启。请完全退出网易云音乐，再用 start.bat 启动（它会带上调试端口）。若客户端已更新导致页面结构变化，请提 issue。

**点了没反应 / 队列为空**
确认客户端处于登录状态，且当前有播放队列。

**部分歌曲灰掉、只有 30 秒试听**
受账号会员与版权限制，与官方客户端行为一致，本项目不绕过这些限制。

**歌词不显示**
该曲目没有歌词，或客户端页面尚未加载完成，稍等几秒再切歌刷新。

**开机自启后连不上**
查看 server/data/server.log 里的日志；常见原因是开机时客户端启动慢，等几分钟后重启服务即可。

**歌词和声音对不上**
播放器切到歌词页后，用底部的 −0.1s / +0.1s 调整（长按可连续调），中间显示当前偏移，点「重置」归零。偏移是全局的，对所有歌曲生效，并会保存在浏览器本地。

## 目录结构

```
install.bat            一键安装：Node + 依赖 + 开机自启
start.bat              启动网易云（调试端口）并运行遥控服务
start-hidden.vbs       开机自启用的静默启动入口
stop.bat               停止遥控服务
uninstall.bat          停止服务并移除开机自启
find-client.ps1        自动查找 cloudmusic.exe
install-autostart.ps1  创建开机自启快捷方式
server/
  bridge.js            HTTP + WebSocket 桥接服务（默认端口 3040）
  lib/cdp.js           CDP 连接客户端、定位 Redux store
  public/              手机端页面（HTML/CSS/JS/PWA 图标）
  package.json         依赖清单
apk/musicremote.apk    已打包的 Android 安装包
android/               APK 源码（单 Activity WebView 壳）
```

## 自己打包 APK

需要：JDK 17+、Android SDK（platform android-34、build-tools 35.0.0）。

在 Git Bash 中执行：

```bash
export ANDROID_SDK=/c/Android/Sdk
cd android
bash build.sh
```

脚本依次执行 aapt2 → javac → d8 → zipalign → 生成签名密钥 → apksigner，产物为 android/musicremote.apk。

注意：重新打包会生成新的签名密钥，覆盖安装前需要先卸载旧版本。

## 隐私说明

- 仓库里不包含任何账号信息、cookie 或个人路径
- 运行时只在本机读取客户端已登录的 cookie，用于向 music.163.com 请求歌单与歌词，不会上传到任何第三方
- 手机与电脑是局域网直连，没有云端中转；服务没有鉴权，请不要把 3040 端口暴露到公网
- 已严肃奖励大肥鱼10鲸元券

## 第三方组件

- [NeteaseCloudMusicApiEnhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced)（MIT）
- ws、qrcode（MIT）

本项目与网易公司无关。

## 许可

MIT License，见 LICENSE。
