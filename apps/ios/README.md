# Persona16 iOS

`project.yml` 是工程真相源。客户端最低支持 iOS 17，使用 Swift 6、SwiftUI 和系统框架；首版不包含第三方运行时依赖。

## 生成工程

从仓库根目录执行：

```sh
xcodegen generate --spec apps/ios/project.yml
```

## Debug 构建

Debug 默认连接 `http://localhost:3016`，Info.plist 只为 `localhost` 添加 HTTP ATS 例外：

```sh
xcodebuild \
  -project apps/ios/Persona16.xcodeproj \
  -scheme Persona16 \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

## Release 配置

Release 默认使用 `.invalid` 占位地址，并会在构建阶段主动失败。构建时必须显式传入生产 HTTPS 地址；Bundle ID 也可通过标准构建设置覆盖：

```sh
xcodebuild \
  -project apps/ios/Persona16.xcodeproj \
  -scheme Persona16 \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  PERSONA16_API_BASE_URL=https://api.example.com \
  PRODUCT_BUNDLE_IDENTIFIER=com.example.persona16 \
  CODE_SIGNING_ALLOWED=NO \
  build
```

不要把模型供应商 Key、会话密钥或其他服务端凭据放入 App 配置。

## 测试

共享 `Persona16` scheme 同时包含 Swift 单元测试和 UI smoke test。先安装一个可用的 iOS Simulator runtime，再选择本机已有设备执行：

```sh
xcrun simctl list devices available

xcodebuild \
  -project apps/ios/Persona16.xcodeproj \
  -scheme Persona16 \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  CODE_SIGNING_ALLOWED=NO \
  test
```

UI smoke 只验证 App 能启动并显示根 Tab，不访问真实 API。Debug 的 `localhost` 配置不会让 smoke test 依赖本地服务。

## CI 与工程同步

`.github/workflows/ios.yml` 使用独立 macOS Job：安装 XcodeGen、重新生成工程并检查 `.xcodeproj` 无漂移、执行 generic Simulator 构建，再从 runner 已安装内容中动态选择最新 iOS runtime 和 iPhone device type，创建临时 Simulator 并运行共享 scheme 测试。临时 Simulator 在 Job 退出时始终删除；runner 没有可用 runtime 时会明确失败，不会跳过。

修改 `project.yml` 后必须重新生成并提交工程：

```sh
xcodegen generate --spec apps/ios/project.yml
git diff --exit-code -- apps/ios/Persona16.xcodeproj
```
