# DeepSeek API `402 Insufficient Balance` 与“1 元限额”核查

> 调研日期：2026-07-25
> 范围：DeepSeek 官方中文 API 文档与官方 FAQ
> 方法：只采用 DeepSeek 官方一手资料；未使用、读取或记录任何 API 密钥

## 结论摘要

1. **官方公开文档没有“默认 1 元消费限额”或“每个 API Key 只有 1 元额度”的说明。** 文档中最容易被误读的“1 元”是 `deepseek-v4-flash` 的缓存未命中输入单价：**1 元 / 百万 tokens**，不是限额。当前 `deepseek-v4-pro` 的缓存未命中输入与输出单价分别是 3 元和 6 元 / 百万 tokens。[模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)
2. **DeepSeek 对 HTTP 402 的官方定义是“账号余额不足”。** 官方给出的处理方法是确认账号余额并充值；它不是并发、RPM/TPM 或 API Key 限额错误。请求过快或超过并发上限对应 HTTP 429。[错误码](https://api-docs.deepseek.com/zh-cn/quick_start/error_codes/)、[限速与隔离](https://api-docs.deepseek.com/zh-cn/quick_start/rate_limit/)
3. **公开资料显示余额和主要限速都按账号管理，而不是按 Key 建独立钱包。** 官方协议写明 API Key 是“通过账号创建”的调用凭证，付费服务则要求账号预充值并保持余额充足。余额接口用 Bearer API Key 鉴权，但查询对象明确写作“账号余额”；限速文档还明确说并发限制以账号粒度计算、与 API Key 无关。FAQ 提供的是“按 Key 查看用量”，没有按 Key 充值或单独余额的说明。[开放平台服务协议](https://cdn.deepseek.com/policies/zh-CN/deepseek-open-platform-terms-of-service.html)、[查询余额](https://api-docs.deepseek.com/zh-cn/api/get-user-balance/)、[限速与隔离](https://api-docs.deepseek.com/zh-cn/quick_start/rate_limit/)、[常见问题](https://api-docs.deepseek.com/zh-cn/faq/)
4. **因此，没有一个可依据该接口文档“去掉”的官方 1 元限额。** 如果开放平台页面显示仍有 20 多元，而使用某个 Key 调用官方 API 得到 402，优先怀疑该 Key 所属账号与看到充值余额的登录账号不是同一个，或调用实际没有到官方 `api.deepseek.com`。应先用同一个 Key 调官方余额接口验证，而不是继续盲目充值。
5. **官方公开资料没有给出“消费限额”的开关或管理路径。** 公开平台入口只明确涉及充值、账单、用量信息和 API Key；并发限额另有扩容工单，但那会触发 429，不是可消费金额。因而不能在文档里替用户“关闭 1 元限额”；若登录后的控制台确实出现自定义金额上限，需要以该页面截图或官方工单为准，不能把价格表里的 1 元当成这个设置。

## 一、官方资料分别说明了什么

### 1. “1 元”是计量单价

当前官方价格表按“百万 tokens”计价：

| 模型 | 缓存命中输入 | 缓存未命中输入 | 输出 |
| --- | ---: | ---: | ---: |
| `deepseek-v4-flash` | 0.02 元 / 百万 tokens | **1 元 / 百万 tokens** | 2 元 / 百万 tokens |
| `deepseek-v4-pro` | 0.025 元 / 百万 tokens | 3 元 / 百万 tokens | 6 元 / 百万 tokens |

官方扣费规则是“token 消耗量 × 模型单价”，费用从赠送余额或充值余额扣减；二者同时存在时先扣赠送余额。[模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)

这张表没有“单次调用最多 1 元”“每天最多 1 元”或“每 Key 1 元”的字段。`1 元`只出现在 `deepseek-v4-flash` 缓存未命中输入的计量价格中。

### 2. 一次或一批调用为什么仍可能花到约 1 元

按官方单价，某次请求或一批请求的理论费用可以写成：

- `deepseek-v4-flash`：`0.02 × 缓存命中输入百万 tokens + 1 × 缓存未命中输入百万 tokens + 2 × 输出百万 tokens`；
- `deepseek-v4-pro`：`0.025 × 缓存命中输入百万 tokens + 3 × 缓存未命中输入百万 tokens + 6 × 输出百万 tokens`。

例如，`deepseek-v4-pro` 一批累计 20 万缓存未命中输入 tokens 和约 6.67 万输出 tokens，费用约为 `0.6 + 0.4 = 1 元`。这不是触发了限额，而是正常按量扣费。官方当前给两个模型的上下文长度都是 1M、最大输出长度是 384K；长上下文、长输出、重试、生成后再调用 Judge/仲裁器，都会累计 token 用量。[模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)、[对话补全](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)

上下文缓存对所有用户默认开启，但只对完整重复的前缀计为命中，而且官方明确说缓存是“尽力而为”，不保证每次命中。应从响应 `usage.prompt_cache_hit_tokens`、`usage.prompt_cache_miss_tokens` 和 `usage.completion_tokens` 核算，而不能仅凭肉眼看到的文本长度估计。思考模式的 `reasoning_tokens` 还会出现在 `completion_tokens_details` 中，因此可见答案很短也不代表输出用量一定很小。[上下文硬盘缓存](https://api-docs.deepseek.com/zh-cn/guides/kv_cache/)、[Token 用量计算](https://api-docs.deepseek.com/zh-cn/quick_start/token_usage/)、[对话补全](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)

### 3. 402 与限速是两类错误

DeepSeek 的官方错误码表将两者分开：

- HTTP 402：账号余额不足；
- HTTP 429：请求速率或并发达到上限。

当前并发限制是 `deepseek-v4-pro` 每账号 500、`deepseek-v4-flash` 每账号 2500；官方明确说明该限制按账号计算，与 API Key 无关。[错误码](https://api-docs.deepseek.com/zh-cn/quick_start/error_codes/)、[限速与隔离](https://api-docs.deepseek.com/zh-cn/quick_start/rate_limit/)

所以，增加并发额度或调整请求速率不能解释、也不能解除 402；若原始响应确实来自 DeepSeek 官方 API，402 指向的是该 Key 所认证账号在服务端被判定为没有可用余额。

### 4. 余额由账号持有，Key 用于鉴权和用量归因

《DeepSeek 开放平台服务协议》第 2.4 条说明，API Key 是用户通过账号创建的调用凭证；第 6.1 条说明付费服务采用预充值，余额充足时正常使用，余额不足时平台可停止服务；第 6.3 条特别要求充值时确认账号。[开放平台服务协议](https://cdn.deepseek.com/policies/zh-CN/deepseek-open-platform-terms-of-service.html)

官方提供：

```http
GET https://api.deepseek.com/user/balance
Authorization: Bearer <TOKEN>
```

接口名称和说明均是“查询账号余额”，返回：

- `is_available`：当前账号是否有余额可供 API 调用；
- `total_balance`：总可用余额，即未过期赠金与充值余额之和；
- `granted_balance`：未过期赠金余额；
- `topped_up_balance`：充值余额；
- `currency`：CNY 或 USD。

来源：[查询余额](https://api-docs.deepseek.com/zh-cn/api/get-user-balance/)

官方 FAQ 另有“如何分 Key 查看用量”：在开放平台“用量信息”页面按月份导出，压缩包中名为 `amount` 的 CSV 包含分 Key 用量明细。[常见问题](https://api-docs.deepseek.com/zh-cn/faq/)

据此可以作出受证据约束的判断：

- 官方公开模型是**账号余额 + 多个鉴权 Key + 分 Key 用量统计**；
- 公开文档没有 Key 独立充值余额、默认 1 元 Key 配额或 Key 消费上限设置；
- “所有 Key 一定不存在任何未公开风控或登录后自设项”无法仅凭公开文档证明；本报告能确认的是，公开资料没有默认 1 元 Key 限额，而且价格页上的 1 元不是限额。

### 5. 官方公开资料能管理什么、不能证明什么

官方 FAQ 和服务协议明确提到的财务管理入口是：

- “充值”页面：给账号预充值；
- “账单”页面：查充值结果、赠送余额有效期、发票和退款；
- “用量信息”页面：按月导出用量，并在 `amount` CSV 中查看分 Key 明细；
- `/user/balance`：查询该 Key 所认证账号的总余额、赠送余额和充值余额。

官方并发文档另提供“账号扩容申请工单”，管理的是并发量；超过并发上限返回 429。[常见问题](https://api-docs.deepseek.com/zh-cn/faq/)、[开放平台服务协议](https://cdn.deepseek.com/policies/zh-CN/deepseek-open-platform-terms-of-service.html)、[查询余额](https://api-docs.deepseek.com/zh-cn/api/get-user-balance/)、[限速与隔离](https://api-docs.deepseek.com/zh-cn/quick_start/rate_limit/)

截至本次核查，官方公开文档和 FAQ 没有“消费限额”“预算上限”“每 Key 金额封顶”的产品说明，也没有相应关闭路径。未登录的公开资料不能证明登录后台永远不存在实验性或未公开设置；但在没有控制台证据前，**没有可执行的官方步骤可以把所谓 1 元限额去掉**。

## 二、为什么“我明明充了 20 元”仍可能收到 402

### 高优先级：Key 与充值账号不是同一账号

DeepSeek 官方 FAQ 针对“充值余额金额不对”要求依次确认：

1. 充值账号与当前登录账号是否相同；
2. 如果使用过 Google 账号，尝试用 Google 登录检查历史充值是否在该账号；
3. 如果注销后重新注册，新旧账号相互独立，旧账号余额不能被新账号使用。

来源：[常见问题](https://api-docs.deepseek.com/zh-cn/faq/)

因此，控制台当前登录账号看到 20 多元，不足以证明正在调用的 Key 就属于这个账号。**以该 Key 调 `/user/balance` 的结果才是最直接的核对。**

### 次高优先级：调用并非落到 DeepSeek 官方 API

DeepSeek 官方 OpenAI 格式 Base URL 是 `https://api.deepseek.com`，Anthropic 格式是 `https://api.deepseek.com/anthropic`。[首次调用 API](https://api-docs.deepseek.com/zh-cn/)

如果程序配置了代理、聚合平台、自建网关或其他 Base URL，那么相同的 402 文案可能来自中间服务，不能直接套用 DeepSeek 的账号余额语义。应核对运行时实际 Base URL，但不要打印密钥。

### 另一种可能：余额确实已被本次批量评测消耗

`deepseek-v4-pro` 当前按输入与输出 tokens 分别计费，输出单价更高。一次批量评测通常包含多次生成、裁判和仲裁调用，不能用“完成了一批”推定只花了 1 元。实际消耗应以开放平台导出的分 Key `amount` 明细为准，而不是根据批次数猜测。[模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)、[常见问题](https://api-docs.deepseek.com/zh-cn/faq/)

## 三、建议的无歧义排查顺序

### 步骤 1：用正在报错的同一个 Key 查询账号余额

在已安全注入 `DEEPSEEK_API_KEY` 的临时环境中执行；不要把 Key 写入命令历史、日志、仓库或文档：

```bash
curl -sS -L 'https://api.deepseek.com/user/balance' \
  -H 'Accept: application/json' \
  -H "Authorization: Bearer ${DEEPSEEK_API_KEY}"
```

官方示例与字段定义：[查询余额](https://api-docs.deepseek.com/zh-cn/api/get-user-balance/)

解释结果：

- `is_available: false` 或 `total_balance` 接近 0：该 Key 对应账号确实没有可用余额；继续查账号归属和用量。
- `is_available: true` 且 `total_balance` 显示 20 多元：若同一个 Key、同一官方 Base URL 的模型调用仍返回 402，这与公开错误码说明不一致，应保存脱敏响应、北京时间、模型名和请求路径后联系 DeepSeek 技术支持。
- HTTP 401：Key 认证问题，不是余额问题。

### 步骤 2：在开放平台核对账号与充值记录

- 确认充值记录、余额页面和创建该 Key 的 API Keys 页面属于同一个登录账号；
- 若使用过邮箱、手机号或 Google 等不同登录方式，按 FAQ 逐一确认是否进入了不同账号；
- 在“账单”页面核对充值是否成功。官方说明充值结果可在账单页查询，充值余额永久有效，赠送余额则可能有有效期。

来源：[常见问题](https://api-docs.deepseek.com/zh-cn/faq/)

### 步骤 3：导出分 Key 用量

在开放平台的[用量信息](https://platform.deepseek.com/usage)页面：

1. 进入“用量信息”；
2. 选择对应月份并导出；
3. 解压导出包；
4. 查看名为 `amount` 的 CSV，确认该 Key 在本轮评测前后的实际扣费。

来源：[常见问题](https://api-docs.deepseek.com/zh-cn/faq/)

### 步骤 4：仍矛盾时联系官方技术支持

DeepSeek API 参考与开放平台服务协议列出的技术支持邮箱是 `api-service@deepseek.com`；协议还提供登录产品后点击“联系我们”的入口。[API 基本信息](https://api-docs.deepseek.com/zh-cn/api/deepseek-api)、[开放平台服务协议](https://cdn.deepseek.com/policies/zh-CN/deepseek-open-platform-terms-of-service.html)

建议只提交：

- 报错发生时间和时区；
- 请求使用的官方 Base URL、路径和模型名；
- HTTP 状态码及脱敏后的完整响应体；
- `/user/balance` 的脱敏结果；
- API Key 在控制台中的名称或末四位，而不是完整 Key；
- 对应充值和用量记录截图。

## 最终判断

**不是 DeepSeek 接口文档设置了 1 元限额。** 这 1 元是当前 `deepseek-v4-flash` 每百万个缓存未命中输入 tokens 的单价。官方 402 只表示账号余额不足；官方文档没有可供“去掉”的默认 1 元账号或 Key 消费上限。

当前最有判别力的下一步是：使用报错的同一个 Key 调官方 `/user/balance`。若它返回 0，查 Key 所属账号与分 Key 用量；若它明确返回 20 多元且 `is_available: true`，则停止继续充值，核对 Base URL 后把矛盾证据提交给 DeepSeek 技术支持。

## 本项目实测补充

随后已用报错时使用的同一 Key 完成只读核对，未保存或记录 Key：

- 官方 `/user/balance` 返回 `is_available=true`，人民币充值余额为 27.38 元；
- 对官方 `https://api.deepseek.com` 的 `deepseek-v4-pro` 9-token 最小调用成功；
- 仓库未设置 `DEEPSEEK_BASE_URL`，代码回退到官方地址；
- 同一冻结提交的后续两批完整评测均成功，第二、三批前后的可见余额依次为 27.38 → 27.30 元、27.27 → 27.07 元；中间 0.03 元体现余额展示存在延迟结算。

因此本次现场证据进一步排除了本地金额上限、官方默认 1 元限额和“一批评测消耗 20 元”。先前 402 发生时，DeepSeek 服务端对该请求所认证账号判定为余额不足；现有本地日志无法反推当时究竟是充值尚未进入该账号、运行时使用了另一把 Key，还是账户状态尚未刷新。若要区分，应以开放平台分 Key `amount` 用量明细和充值账单为准。
