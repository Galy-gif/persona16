# persona16 前端 Design QA

## 2026-07-25 银白柔雾编辑式重设计

### 对比目标

- source visual truth path: `/Users/gouzi/Downloads/IMG_8194.JPG`
- implementation URL: `http://localhost:3016/`
- target viewport: `390 × 844`
- state: 首页默认选中林衡；单聊房空状态；浅色模式。
- visual direction: 参考图第一行中间与第二行中间的融合——银白留白、局部粉紫柔雾、编辑式大字、轻量工具图标、双层悬浮输入岛。
- implementation screenshot path: unavailable。内置浏览器的本地 URL 策略拒绝刷新 `http://localhost:3016/`，因此没有把重设计后的页面截图与参考图放入同一视觉比较输入。

### 已完成的实现

- 首页改为非对称编辑式构图：大字号衬线问句、玻璃人物选择器、角色舞台、人物色输入岛和悬浮底栏。
- 聊天房改为沉浸式柔雾空间：轻量房间头、玻璃成员条、编辑式空状态、半透明消息卡与双层 composer。
- 人物详情、对话历史、我的与抽屉统一到相同的字号、圆角、线条、阴影和玻璃表面系统。
- 四只雾面水晶猫继续使用现有独立 PNG；新增进入、悬浮、落影呼吸、选择反馈与按钮微动效，动画只改变 `transform` / `opacity`。
- “减少角色动态”已由视觉占位升级为真实全局偏好，并保留系统 `prefers-reduced-motion`。
- 没有新增路由、模型能力或产品承诺；主链仍是人物首页 → 单聊 → 邀请形成房间 → 历史与记忆回流。

### 当前 QA 结论

- 工程检查：Web TypeScript、Next.js 生产构建与 `git diff --check` 通过。
- 开发预览：`http://localhost:3016/` 返回 HTTP 200，开发与生产缓存仍然隔离。
- [P1 / blocked] 缺少实现截图，不能完成参考图与实际页面的同视口可见差异检查；在取得页面截图前，不把字体落地、首屏折叠、角色裁切和玻璃层叠记为视觉通过。
- 下一步：用户在内置浏览器中手动刷新本地页面后，补首页与空聊天房 390 × 844 截图、控制台检查和同图视觉比较。

---

## 2026-07-24 人物名字与选中环碰撞跟进

- source visual truth path: `/var/folders/5c/srj63hjs1213l4n6rzt6kv5r0000gn/T/codex-clipboard-7bd323ea-26f3-4b92-a9a8-2fdb6cf535bb.png`
- implementation URL: `http://localhost:3016/`
- 复现视口：`280 × 600` CSS px。
- 复现测量：60px 头像底部为 `247.11px`；64px 选中环加 5px 外扩后到 `256.11px`；名字从 `250.11px` 开始，形成约 6px 碰撞。
- 修复：选中环上移 2px 与头像垂直居中；头像和名字间距从 3px 增至 11px；人物槽位恢复为 104px；名字使用独立类和 1.45 行高。
- 修复后的确定性间距：普通选中环视觉底部与名字之间 4px；键盘焦点外圈与名字之间 2px。
- 工程验证：Web TypeScript、Next.js 生产构建与 `git diff --check` 通过；开发地址返回 HTTP 200。
- 视觉证据限制：开发服务重启后，已打开的 localhost 标签落入断线页，内置浏览器 URL 策略阻止自动刷新；需要用户手动刷新完成最后一次页面视觉确认。

follow-up visual status: pending manual refresh

---

## 2026-07-24 移动端滚动、遮挡与人物选择器修复

### 对比目标

- source visual truth paths:
  - `/var/folders/5c/srj63hjs1213l4n6rzt6kv5r0000gn/T/codex-clipboard-5bcf032b-a892-4872-88f2-9f37c6e33560.png`
  - `/var/folders/5c/srj63hjs1213l4n6rzt6kv5r0000gn/T/codex-clipboard-e06185a8-5705-4607-8ee5-9ad33557dd56.png`
- implementation URL: `http://localhost:3016/`
- implementation screenshot paths:
  - `/Users/gouzi/persona16/artifacts/design-qa/home-layout-after-390x844.png`
  - `/Users/gouzi/persona16/artifacts/design-qa/detail-layout-after-top-390x844.png`
  - `/Users/gouzi/persona16/artifacts/design-qa/detail-layout-after-scroll-390x844.png`
  - `/Users/gouzi/persona16/artifacts/design-qa/home-layout-after-867x802.png`
  - `/Users/gouzi/persona16/artifacts/design-qa/detail-layout-after-top-867x802.png`
  - `/Users/gouzi/persona16/artifacts/design-qa/detail-layout-after-scroll-867x802.png`
- viewport:
  - 用户问题截图为裁切后的高密度屏幕截图，无法可靠还原 CSS viewport 和 deviceScaleFactor。
  - 实现按 `390 × 844` CSS px 与内置浏览器默认 `867 × 802` CSS px 两个状态验证；浏览器截图按 CSS 像素输出，无额外密度归一化。
- state: 首页夏栩选中；夏栩详情页顶部与滚动到底部；浅色模式。
- full-view comparison evidence: 用户详情页问题图与 `detail-layout-after-scroll-390x844.png`、用户选择器问题图与 `home-layout-after-390x844.png` 已在同一视觉比较输入中检查。
- focused region comparison evidence: 人物选择器焦点框、详情页底部 CTA 与开场话题区域均单独检查；这些正是用户截图指出的高风险区域，不需要额外裁切。

### Findings

- 没有仍需处理的 P0、P1 或 P2 问题。
- [已修复 P0] 详情页无法向下滚动
  - Root cause: `@media (min-width: 431px)` 把 `.app-shell` 固定为 `calc(100dvh - 36px)`，同时设置 `overflow: hidden`；实测容器高 766px、详情内容高 1006px，后 240px 无法抵达。
  - Fix: 普通页面容器改为独立 `overflow-y: auto`，聊天房继续保留固定高度和隐藏溢出；桌面预览实测 `.app-shell` 从 `scrollTop 0` 滚到 `162`，移动端文档从 `scrollY 0` 滚到 `84`。
- [已修复 P1] 固定 CTA 遮住详情内容
  - Fix: 详情底部安全空间增至 132px，主角从 190px 收紧到 168px，压缩 Hero、正文卡和开场话题间距；在两个视口的最大滚动位置，两条开场话题均完整位于 CTA 上方。
- [已修复 P2] 人物选择器出现蓝色外框和双重选中环
  - Root cause: 全局 `button:focus-visible` 的矩形轮廓套在整张人物按钮上，叠加角色色圆形选中环。
  - Fix: 人物按钮取消矩形焦点框，把键盘焦点反馈转移到头像圆环；头像从 72px 调为 68px，槽位保持 104px，并为圆环、焦点外圈和名字预留独立垂直间距。

### Required fidelity surfaces

- 字体与排版：字体栈、标题层级和文案未改；详情正文收至 13–14px 后仍保持清晰行高，没有截断或不自然换行。
- 间距与版式：390 × 844 首页完整容纳标题、四人选择器、主人物、双层 CTA 与底栏；详情页允许正常滚动，固定 CTA 不再阻挡开场话题。
- 颜色与视觉令牌：保持原有角色色、白色背景和蓝色主按钮；焦点态改用当前人物的 accent 色，不再出现无关蓝色大框。
- 图片质量与资产一致性：角色位图、比例与材质未重生成；详情主图缩小后仍清晰，四个 68px 头像仍可辨认人物和视线。
- 文案与内容：未修改人物文案、按钮语义或信息顺序。
- Accessibility: 四个人物仍是语义按钮并保留 `aria-pressed`；键盘焦点仍可见，只从整卡矩形改为头像圆环；触控槽位仍高于 44px。

### Comparison history

#### Pass 1 — blocked

- earlier findings: P0 详情页被锁死不能滚动；P1 底部 CTA 覆盖未完成内容；P2 人物选择器焦点框与选中环冲突。
- evidence: 两张用户截图；浏览器测量 `.app-shell clientHeight=766 / scrollHeight=1006 / overflowY=hidden`。

#### Pass 2 — passed

- fixes made: 普通 app shell 独立纵向滚动、详情安全空间和密度收紧、人物焦点环重定位。
- post-fix evidence: 六张浏览器截图；867 × 802 与 390 × 844 均完成真实滚动；首页真实点击夏栩后只有人物色圆形焦点/选中反馈。
- console: `0` error，`0` warn。
- engineering: Web TypeScript、Next.js 生产构建与 `git diff --check` 通过。

### Primary interactions tested

- 首页点击夏栩：人物图、姓名、片段、CTA 与详情链接同步切换。
- 867 × 802 桌面预览：详情内部滚动到最大 `scrollTop=162`。
- 390 × 844 移动端：页面滚动到最大 `scrollY=84`，两条开场话题完整可见且可点击。
- 返回首页后，四人选择器没有裁切、矩形焦点框或双重边框。
- 浏览器控制台已检查：`0` 条 error，`0` 条 warn。

### Residual P3 polish

- 开发模式左下角仍有 Next.js Dev Tools 浮层；生产构建不存在。
- 用户原始截图是裁切后的高密度图，不能做逐像素同视口比较；本轮以可操作性、无遮挡和响应式实测作为通过依据。

---

## 2026-07-23 磨砂蛋白石眼睛落地

### 对比目标

- source visual truth path: `/Users/gouzi/.codex/generated_images/019f8528-46d4-7692-a29d-bf0ce451519d/exec-f7ef2242-e60a-420f-b837-0e69e26b0650.png`
- implementation URL: `http://localhost:3016/`
- implementation screenshot path: unavailable；Codex 内置浏览器的 URL 安全策略阻止了本地地址刷新，不能取得可信的浏览器渲染截图。
- viewport: 目标 `390 × 844`；本轮未取得浏览器截图，因此没有进行密度归一化。
- state: 首页、林衡选中、浅色模式、默认静止状态。
- full-view comparison evidence: blocked；没有实现截图，未把参考图与页面渲染放入同一比较输入。
- focused region comparison evidence: 已逐张检查四个 512 × 512 生产位图，但这不能替代页面内小尺寸渲染对比。

### Findings

- [P1] 缺少浏览器渲染证据
  - Location: 首页人物选择器、190px 主角色、房间页 34–122px 头像。
  - Evidence: 四张新资源已经生成并由 `characters.ts` 引用，开发服务也能以 HTTP 200 返回资源；但内置浏览器拒绝刷新 `http://localhost:3016/`，没有可比较的实现截图。
  - Impact: 无法确认白底位图在真实页面中的边缘融合、小头像辨识度、裁切比例和视觉重量。
  - Fix: 用户在现有内置浏览器中手动刷新本地页面后，再补同视口截图、控制台检查和参考/实现合并对比。

### 已完成的资产级检查

- 字体与排版：本轮未改动。
- 间距与版式：本轮未改动。
- 颜色与视觉令牌：四只角色继续使用蓝、橙、薄荷绿、紫的单色系身体；眼睛统一为磨砂蛋白石眼白和非黑色烟紫蓝瞳孔。
- 图片质量与资产一致性：四张生产位图均为 512 × 512 RGB PNG；没有 CSS 绘图、SVG、emoji 或占位符。
- 眼睛约束：开放眼睛没有静态眼皮、黑色瞳孔或白色高光点；林衡侧看、夏栩上看、周禾为整颗眼睛压扁的睡眠状态、许野侧下看。
- 文案与交互：本轮未改动。
- 工程检查：Web TypeScript 通过；Next.js 生产构建通过；四张新资源均由开发服务返回 HTTP 200，首页 HTML 引用了全部四张新图。

### Comparison history

- Pass 1 — blocked
  - earlier findings: 无浏览器渲染截图，不能执行页面级视觉对比。
  - fixes made: 无可在代码侧修复的视觉问题；资产和引用已完成。
  - post-fix visual evidence: unavailable，等待本地页面手动刷新后的同视口截图。

### Implementation checklist

- [x] 使用用户选中的第三版眼睛作为视觉真相。
- [x] 为四个现有姿态生成独立生产位图。
- [x] 接入现有角色数据源，不改页面结构和交互。
- [x] 通过 TypeScript、生产构建和静态资源 HTTP 检查。
- [ ] 取得 390 × 844 浏览器渲染截图。
- [ ] 合并参考图与实现截图并完成页面级 Design QA。
- [ ] 检查控制台错误和小尺寸头像辨识度。

---

## 历史首页基线

## 对比目标

- source visual truth path: `/Users/gouzi/.codex/generated_images/019f8528-46d4-7692-a29d-bf0ce451519d/exec-34f2b082-fafe-4fa8-8c02-c51f694511df.png`
- implementation URL: `http://localhost:3016/`
- implementation screenshot path: `/Users/gouzi/persona16/artifacts/design-qa/home-390x844-cache-fix-final.png`
- viewport: `390 × 844`
- state: 首页、林衡选中、浅色模式、默认静止状态
- full-view comparison evidence: `/Users/gouzi/persona16/artifacts/design-qa/home-comparison-cache-fix.png`
- focused region comparison evidence: 未单独裁切。最终合并图以原始 800 × 884 尺寸呈现，首页的标题、四个人物、主形象、按钮和底栏图标均可清楚辨认；参考图也只有一个完整手机视图，没有需要放大才能判断的高密度区域。

## Findings

- 没有仍需处理的 P0、P1 或 P2 问题。
- 字体与层级：实现采用系统 SF Pro/PingFang 字体栈，标题字号、字重、行高和字距已与参考的 iOS 视觉层级对齐；中文没有截断或异常换行。
- 间距与版式：390 × 844 下四列人物、主形象、双层 CTA 与固定底栏均完整可见，没有横向滚动、遮挡或离屏主操作。
- 颜色与视觉令牌：白色页面、浅灰辅助文字、同色系蓝色渐变按钮、轻阴影和角色单色渐变符合参考方向；选中态保持清楚但不过度强调。
- 图片质量：四个角色均使用独立生成的雾面水晶小猫位图，没有 emoji、占位图、CSS 绘图或手写 SVG 替代；缩放后边缘与阴影自然。
- 图标：历史、人物、对话、我的均来自同一 Phosphor 图标家族，描边与激活态一致，触控区域不小于 44px。
- 文案：首页文案与参考一致；人物详情、数据边界和未开放能力的占位说明使用产品语气，没有暴露 16 型标签。
- accessibility：语义按钮/链接、`aria-pressed`、导航当前态、图片替代文本、焦点轮廓与 reduced-motion 均已覆盖。
- 运行稳定性：开发预览与生产构建已分别使用 `.next-dev` 和 `.next`，生产构建不再覆盖正在打开页面的 CSS 与 React Client Manifest；角色图缩至 512px 并直接加载，消除了冷启动时的空白头像。

## Comparison history

### Pass 1 — blocked

- earlier findings:
  - [P2] 首页主形象被额外白色圆形容器包裹，改变了参考中悬浮小猫的视觉轮廓。
  - [P2] 主按钮过宽且圆角不足，页面下半部分密度比参考更重。
  - [P2] 四个人物选择器头像和标签偏小，顶部节奏与参考不一致。
  - [P2] 品牌字标与首页标题略大，破坏参考中的轻盈留白。
- fixes made:
  - 移除首页主形象的圆形卡片表面，保留位图自身柔光和投影。
  - 将首页 CTA 收窄至内容区的 82%，提高为 60px，并改为同色系渐变胶囊按钮。
  - 放大人物选择器槽位和头像，调整小图裁切比例。
  - 收紧字标与标题字号，并将底栏人物图标改为更接近参考的人形图标。
- post-fix visual evidence: `/Users/gouzi/persona16/artifacts/design-qa/home-comparison-v2.png`

### Pass 2 — passed

- earlier finding: [P2] 首页主形象仍比参考偏小，角色存在感不足。
- fix made: 将首页主形象从 164px 调整为 190px，并保持透明式表面处理。
- post-fix visual evidence: `/Users/gouzi/persona16/artifacts/design-qa/home-comparison-final.png`

### Pass 3 — blocked（用户现场反馈）

- earlier findings:
  - [P0] 当前打开的本地页面没有加载 CSS，出现裸 HTML、四个大方框、超大角色图和缺失底栏样式；此前的旧截图不能代表用户实际看到的状态。
  - [P1] 林衡图片在冷启动时短暂空白，首屏会出现空选择环和大块留白。
- root cause:
  - 开发服务与 `next build` 共用 `.next`，生产构建覆盖了开发服务正在使用的 CSS、Client Manifest 和 vendor chunks。
  - 1254px PNG 依赖开发态图片优化首请求，冷缓存生成期间角色图不可见。
- fixes made:
  - 开发态改用 `.next-dev`，生产构建继续使用 `.next`；完整重启开发服务，并将 `.next-dev/` 加入 gitignore。
  - 四张角色图从 1254px 等比缩至 512px，单张从约 757–872KB 降至 191–219KB；本地角色组件直接加载静态位图。
- post-fix visual evidence: `/Users/gouzi/persona16/artifacts/design-qa/home-comparison-cache-fix.png`

### Pass 4 — passed

- 390 × 844 首屏重新加载后四个角色和主角色均立即可见，字体、留白、胶囊 CTA、历史入口与底栏全部恢复。
- 浏览器控制台为 0 error / 0 warn。
- 在开发服务持续运行时重新执行生产构建，7 个页面全部生成成功；开发进程使用独立 `.next-dev`，构建期间与构建后无缓存或 Client Manifest 报错。

## Primary interactions tested

- 首页切换人物，主形象、文案、CTA 与详情入口同步更新。
- 首页进入人物详情并返回。
- 对话页的全部/单聊/多人筛选状态。
- 我的页记忆开关、动态开关、读取空状态与准备中占位。
- 从首页创建真实单聊房间、打开成员面板、邀请第二个成员、输入消息并确认发送按钮启用。
- 浏览器控制台已检查：`0` 条 error，`0` 条 warn。

## Residual P3 polish

- 参考图中的猫素材是概念稿内嵌渲染；实现使用用户选定的独立同色渐变角色资产，因此姿态和局部高光不会逐像素相同。当前差异不改变风格、层级或操作理解。
- 开发模式可能出现 Next.js Dev Tools 浮层；生产构建中不存在。

## Implementation checklist

- [x] 参考与实现以同一手机视口、同一人物选中态合并对比。
- [x] 修复全部 P0/P1/P2 视觉差异。
- [x] 逐页验证核心交互、加载态、空态、选中态和成员面板。
- [x] 检查浏览器控制台。
- [x] 通过 TypeScript、测试和生产构建。

historical result: passed

historical result: blocked

final result: blocked
