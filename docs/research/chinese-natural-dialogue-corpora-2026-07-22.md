# 中文自然闲聊与人格对话语料库调研（2026-07-22）

## 结论先行

有现成语料，但没有发现一个同时满足以下五项的数据集：

1. 原生中文；
2. 足够自然的真人日常对话；
3. 带稳定人格或关系信息；
4. 规模足以训练；
5. 数据许可明确允许商业产品使用。

现成数据可以立即支撑**研究隔离环境中的校准、评测设计和场景挖掘**，但不能把“论文公开”或“GitHub 仓库是 MIT/Apache-2.0”误解为“底层对话文本已获得商业训练授权”。尤其是微博、电视剧、字幕和真人/IP 角色数据，仓库作者未必拥有底层文本的完整再许可权。

对 persona16 最实用的组合是：

- **普通多轮接话与自然换题**：NaturalConv，质量证据最好；但官方严格限非商业。优先联系腾讯申请商业授权。
- **人格记忆与熟人回指**：DuLeMon；结构最合适，但不是自然口语金标准，数据专属许可也不够明确。
- **问候、道歉、冲突、拒绝、讽刺、安慰、结束等对话行为**：CPED；标签非常实用，但来自电视剧，商业版权风险高。
- **角色一致性、关系和人设显隐**：CharacterDial；研究价值高，公开数据明确仅供研究，且包含真人与影视/游戏 IP。
- **真实中文短句、语气词和即时接梗**：LiveChat；素材很自然，但评论—主播回复由算法对齐，公开子集也可见错配和 ASR 噪声，只能人工观察。
- **真实口语的节奏、停顿、自我修正和短接话**：RealTalk-CN、MagicData-RAMC；确实是真人语音对话，但均限制非商业。
- **真实熟人自然聊天且许可链可谈**：付费/受控的 LDC CALLHOME Mandarin；是最接近“真实人怎么聊”的资源之一，但年代较老，商业发布需 LDC For-Profit 会员及相应费用。

因此，严谨路线不是“挑一个库整库微调”，而是：

1. 用受限现成库在隔离环境里建立行为分类、评测协议与统计基线；
2. 不复制受限原句，让有商业权利转让协议的中文标注员按抽象场景原创正例/反例；
3. persona16 最终训练集只接收来源、同意、许可、去标识和质量审查均可追溯的数据；
4. 如希望快速获得大规模现成训练数据，第一优先是向腾讯申请 NaturalConv 商业授权，而不是从来源混杂的 LCCC 开始。

> 本文是产品与数据风险筛查，不是法律意见。进入商业训练链前仍应由法务确认具体授权文本、训练是否构成衍生使用、模型发布条件以及个人信息处理义务。

## 核验方法

本次只采用一手来源：论文原文、作者/机构官方仓库、官方数据卡、官方许可文本和官方分发页。第三方镜像只用于确认是否存在，不作为许可依据。

“下载可用”均指 2026-07-22 实测：

- NaturalConv 官方 ZIP 返回 HTTP 200，约 11.6 MB；解包后包含 19,919 段完整对话、文档 URL 和 train/dev/test ID。对 release JSON 实测为 400,562 条 utterance，比论文报告的 400,095 多 467 条。
- DuLeMon 官方 BCE ZIP 返回 HTTP 200，约 12 MB。
- KdConv、CPED、CharacterDial、XDailyDialog 的数据文件仍在作者官方 GitHub 仓库。
- LCCC 官方仓库仍提供百度网盘和 Google Drive 链接；Hugging Face loader 仍公开。
- RealTalk-CN 官方 Hugging Face 仓库公开但为人工审批 gated dataset。
- MagicData-RAMC 仍可从 OpenSLR 直接下载约 15 GB 全量语音和标注。
- CPED README 指向的 LUGE 页面在本次环境中无法完成 TLS 连接，但完整文本 CSV 已在作者仓库，因此不影响文本数据获取。

许可判定遵循一条硬规则：**代码许可与数据许可分开看**。如果只有仓库根 LICENSE，没有数据专属条款，就明确标记“不确定”，不会自动推定底层第三方文本可商用。

## 快速决策表

| 数据集 | 自然性来源 | 规模 | 当前下载 | 数据许可/商业判断 | 对 persona16 的建议 |
|---|---|---:|---|---|---|
| NaturalConv | 两名真人众包者围绕新闻自由多轮聊天 | release 实测 19,919 对话；400,562 utterances | 官方 ZIP 可用 | 数据专属条款：仅个人非商业，商业需另行授权 | **研究主基准；优先谈授权** |
| DuLeMon | 两名真人众包者按双方 persona 对聊 | release 实测 27,501 对话；448,977 utterances | 官方 ZIP 可用 | 根仓库 Apache-2.0；无数据专属许可；上游 PersonaChat 有 CC BY 4.0 署名链 | 人格记忆/回指主基准；自然口语只作辅证 |
| CPED | 40 部中文电视剧的编剧台词 | 11,835 对话；132,762 utterances | 官方 CSV 可用 | 根仓库 Apache-2.0；无数据专属条款；影视版权高风险 | 对话行为/情绪标签挖掘；不要原句商业训练 |
| CharacterDial | 真人角色扮演为主；完整集另混合 GPT-4、文学抽取、人机修订 | 完整 4,233 对话；公开子集 1,034 对话 | 官方 JSON 可用 | 论文明确 released data 仅供研究；代码 Apache；模型另限非商业 | 角色/关系评测；禁止把口癖当自然口语金标准 |
| LCCC | 微博、论坛、字幕、旧机器人、电商等混合既有文本 | base 6.8M；large 12.0M 对话 | 官方链接/HF 可用 | 代码 MIT；README 明确数据和模型仅科研；上游权利混杂 | 只作研究候选池和负例挖掘 |
| PersonalDialog | 真人微博评论树 | 20.83M 会话；56.25M utterances | 需按官方流程申请/签约 | 爬虫 MIT，不是数据许可；论文限学术研究，禁止去匿名 | 最像真实社交口语，但隐私/商业风险最高之一 |
| LiveChat | 抖音直播评论与主播 ASR 回复自动对齐 | 1.332M single-turn pairs；351 位主播 | 官方 repo 仅 45 pairs/4 streamers 子集 | 根仓库 MIT；无上游直播内容商业授权；含错配/ASR 风险 | 观察真实短句与节奏的首选之一，绝不能自动当 gold |
| KdConv | 两名真人众包者看知识图谱编写对话 | 4,500 对话；85,596 utterances | 官方 repo 可用 | 根仓库 Apache-2.0；无数据专属条款；KG 上游权利不清 | 知识型话题转移，不作自然短接话 gold |
| XDailyDialog | 英文 DailyDialog 的专业中文翻译 | 中文约 13K 对话；约 103K utterances | 官方 repo 可用 | 数据继承 CC BY-NC-SA 4.0；代码 Apache-2.0 | 对话行为/情绪辅助评测；警惕翻译腔 |
| RealTalk-CN | 真人对真人、带自然口语不流利现象的任务对话 | 5,400 对话；60K+ utterances；约 150 小时 | 官方 HF gated | CC BY-NC-SA 4.0，仅非商业 | 真实口语节奏与修复行为研究 |
| MagicData-RAMC | 663 名真人手机录制的自发普通话对话 | 180 小时，15 个主题域 | OpenSLR 直下 | CC BY-NC-ND 4.0，仅学术/非商业且禁演绎 | 只做口语现象观察/评测，不进商业训练 |
| LDC CALLHOME Mandarin | 亲友间无脚本电话聊天 | 120 段电话，每段转写 5–10 分钟 | LDC 付费/受控获取 | LDC 协议；非会员初始限非商业，商业产品发布前须加入 For-Profit 并付费 | **最自然的受控参考之一；值得询价** |
| EmotionTalk | 19 名专业演员在预设场景中双人互动 | 23.6 小时；19,250 utterances | 官方 HF | CC BY-NC-SA 4.0 | 愤怒、受伤、讽刺、尴尬等情绪轨迹研究 |
| RoleBench / RoleLLM | 剧本角色 + GPT-4/GPT-3.5 合成 | 168,093 样本；仅 5 个中文角色 | 官方 HF | 数据卡 Apache-2.0，但底层剧本/IP 权利仍有风险 | 只借评测结构；不作为自然中文语料 |
| CharacterEval | 中文小说/剧本角色，GPT-4 初建、人工质检的评测数据 | README 称 1,785 dialogues/23,020 examples；release 实测口径不同 | 官方 repo 可用 | 根仓库 MIT；小说/剧本与百度百科来源权利未清晰商授 | 借评测维度，不当自然语料或训练集 |
| Character-LLM | GPT-3.5 合成 9 个英文角色经历与对话 | 每角色约 1.6K scenes | 官方 HF/repo | 数据 CC BY-NC 4.0；项目明确仅学术研究 | 只参考数据结构，不使用其语言内容 |

## 逐项核验

### 1. NaturalConv：最值得申请授权

**性质与自然性。** NaturalConv 是腾讯 AI Lab 为“多轮、话题驱动但允许自然发散”的中文对话构建的真人众包数据。两名参与者都能看到一篇新闻，必须设置场景、每人至少说 10 轮、至少一次涉及新闻，其余内容可以自由闲聊和自然换题。它不是自然发生的私人聊天，但比严格知识问答更少照抄材料。

论文报告 19,919 段对话、400,095 条 utterance、平均 20.1 轮，覆盖体育、娱乐、科技、游戏、教育、健康六类新闻；数据包 README 记载 6,500 个文档 URL。对官方 release JSON 的实测是 400,562 条 utterance，比论文多 467 条。进一步审计发现 18,331/19,919（92.0%）的对话恰好为 20 turns，18,575/19,919（93.3%）首句是问候。这说明它虽然由真人书写且人评自然度高，仍有非常明显的采集任务形状；不能把“20 轮 + 先问候”的频率直接学成产品行为。论文的抽样人工评测中，NaturalConv 自然度为 2.8/3，高于 DuConv 2.4 和 KdConv 2.0；其对背景文档的 BLEU-1/2 重叠也显著低于 KdConv，支持“不是照着材料念”的判断。

**许可。** 这是本次少数有清晰数据专属许可的项目。官方条款只授予 personal, non-commercial、不可转让、不可再许可、可撤销的研究/开发/测试权；禁止从腾讯以外来源再分发数据或衍生物。商业使用需联系 `ailab@tencent.com`。辅助代码仓库没有可见独立 LICENSE，不能自行推定其代码许可。

**用途判断。** 最适合建立普通问候、进入正题、共同评价、自然换题、约计划、结束对话等多轮行为基准。未获商业授权前，不应把原句、向量索引、微调权重或其他可被视作衍生使用的资产带入生产训练链。

原始来源：[AAAI 论文](https://ojs.aaai.org/index.php/AAAI/article/view/17649)、[腾讯官方数据页](https://ailab.tencent.com/ailab/nlp/dialogue/)、[官方数据条款](https://ailab.tencent.com/ailab/nlp/dialogue/papers/NaturalConv_Release_license.pdf)、[官方 ZIP](https://ailab.tencent.com/ailab/nlp/dialogue/datasets/NaturalConv_Release_20210318.zip)、[辅助代码](https://github.com/naturalconv/NaturalConvDataSet)。

### 2. DuLeMon：人格记忆结构最好，语言自然度一般

**性质与自然性。** DuLeMon 用两名 crowd worker 随机配对，一人扮 chatbot、一人扮普通 user，双方按随机 persona 进行至少 8 轮/人对话。persona 主要由 PersonaChat 翻译与改写。数据分为只知道 bot persona 的 SELF，以及 bot 还知道部分 user persona 的 BOTH；每个 utterance 可以标注实际 grounding 到哪条 persona。

论文表格报告 SELF 24,500 段/400,472 utterances，BOTH 3,001 段/48,522 utterances，合计应为 27,501 段/448,994 utterances；但对官方 release 文件实测为 27,501 段/448,977 utterances，少 17 条。后续实验应以锁定版本的 release 实测值为准，并在数据 manifest 中记录哈希。论文提供 IRB 与来源权利声明。

但它不应当作自然短回复金标准：任务明确要求尽量丰富表达、围绕 persona 展开且避免直接复制，这种采集目标会诱发持续追问、主动套 persona 和“嗯嗯/那挺好的”式模板。

**许可。** DuLeMon 子目录和官方 ZIP 内没有数据专属 LICENSE。所在 PaddlePaddle/Research 根仓库是 Apache-2.0，但不能无条件断言根许可明确覆盖独立下载的数据包。上游 [PersonaChat 官方任务许可](https://github.com/facebookresearch/ParlAI/blob/main/parlai/tasks/personachat/LICENSE_DOCUMENTATION) 为 CC BY 4.0，翻译/改写仍需保留署名链。商业使用前应向作者确认 Apache 的数据覆盖范围。

**用途判断。** 很适合评测“什么时候应该使用已知用户事实”“什么时候保持沉默”“如何避免每句重复人格”“熟人回指是否自然”。它应校准 TurnActPlan 的记忆 grounding，而不是直接定义中文表层语气。

原始来源：[ACL 论文](https://aclanthology.org/2022.findings-acl.207/)、[官方仓库](https://github.com/PaddlePaddle/Research/tree/master/NLP/ACL2022-DuLeMon)、[官方 ZIP](https://dialogue.bj.bcebos.com/Knover/DuLeMon.zip)、[根仓库 Apache-2.0](https://github.com/PaddlePaddle/Research/blob/master/LICENSE)。

### 3. CPED：对话行为标签最有用，影视版权是硬伤

**性质与自然性。** CPED 从 100 部日常题材中文电视剧中选出 40 部，切分为 11,835 段、132,762 条 utterance、392 个角色；README 常四舍五入为 12K/133K。平均 utterance 约 8.3 字。三名心理学背景标注者结合视频、音频与文本标注 13 种情绪、3 种 sentiment、19 种 dialogue act、年龄、性别、Big Five 和场景。

19 种行为包含 greeting、question、answer、apology、agreement/acceptance、disagreement、acknowledge、interjection、closing、thanking、reject、irony、comfort 等，对 persona16 当前“问候后别自报人格”“被嫌装后做修复”“被骂后仍要自然接话”非常直接。

**许可。** 官方仓库根 LICENSE 是 Apache-2.0，文本 CSV 也在仓库，但没有单独的数据授权说明。底层台词来自腾讯视频、优酷、爱奇艺上的电视剧；论文说明因版权、隐私和平台条款只发布文本及特征、不发布音视频片段。这并不等于影视台词已经清算为可商用训练素材。

**用途判断。** 适合在研究环境里按行为标签抽样、总结抽象模式，再由内部人员原创改写为正反例。电视剧语言是真人编剧文本，冲突和情绪丰富，但比真实聊天更戏剧化，不能直接充当普通人日常聊天分布。

原始来源：[论文](https://arxiv.org/abs/2205.14727)、[官方仓库与 CSV](https://github.com/scutcyr/CPED)、[仓库 LICENSE](https://github.com/scutcyr/CPED/blob/main/LICENSE)。

### 4. CharacterDial / CharacterGLM：最贴近角色任务，也最容易把“刻意”学回来

**性质与规模。** CharacterDial 是 CharacterGLM 论文中的角色对话任务与数据，不是另一个同名通用闲聊库。完整构建集包含 1,930 个角色、4,233 段对话、145,954 条 utterance，平均 17.03 轮。数据来源分为：

- Human Role-Playing：2,783 段，真人成对扮演角色；
- GPT-4 synthesis：783 段，生成后由工人改写得更口语；
- literary extraction：520 段，从剧本/小说人工抽取；
- Human-Prototype Interaction：147 段，真人与初版模型互动并修改回复。

官方仓库当前公开的 `CharacterDial_bilingual.json` 是 1,034 段中英双语对话子集，包含 250 个角色、32,816 条 utterance，平均 15.78 轮，并附 character/user profile、关系和 greeting。公开子集主要是 human role-playing，但可见李雪琴等真人以及影视/游戏角色。

**许可。** 代码仓库根 LICENSE 是 Apache-2.0，模型另有明确“仅非商业研究”的 MODEL_LICENSE；数据文件没有独立 LICENSE。更关键的是论文 Ethical Considerations 直接写明 released data is for research use only。因此不能把 Apache 代码许可当作数据商业许可。真人姓名、肖像/声音联想和影视游戏 IP 还带来人格权、商标和角色版权风险。

**用途判断。** 适合建立角色一致性、关系感、人设显隐、OOC 和主动性评测；不适合整库 SFT。它的目标本身要求角色表达 distinct social behaviors，若未经自然度约束，正会放大截图中的“上来就表演自己是什么人”和固定口癖。

原始来源：[EMNLP 论文](https://aclanthology.org/2024.emnlp-industry.107/)、[官方仓库](https://github.com/thu-coai/CharacterGLM-6B)、[公开数据目录](https://github.com/thu-coai/CharacterGLM-6B/tree/main/CharacterDial_data)、[代码 LICENSE](https://github.com/thu-coai/CharacterGLM-6B/blob/main/LICENSE)、[模型许可](https://github.com/thu-coai/CharacterGLM-6B/blob/main/MODEL_LICENSE)。

### 5. LCCC：规模大，但来源与许可都不适合产品直接使用

**性质与规模。** LCCC-base 从 79M 微博对话清洗，最终约 3.35M 双 utterance session + 3.47M 多 utterance session，共约 6.82M；LCCC-large 再混合 PTT、字幕、小黄鸡、贴吧、青云、豆瓣、电商和 Chinese Chat Corpus，共约 12.01M session。清洗使用规则和由 110K 人工标注数据训练的分类器，过滤敏感/脏词、特殊符号、emoji、语病和上下文不一致。

真实微博/论坛让它拥有大量短回复、吐槽、口头语和脏话语境，但同时失去原始场景、关系、同意链和可靠说话人信息；large 还混入字幕与旧机器人数据，不能简单称为“真人自然聊天”。严格过滤 emoji 和脏话也会削掉真实社交语言的一部分。

**许可。** 官方仓库代码 LICENSE 为 MIT，但中文 README 明确写“本项目所提供的 LCCC 数据集和预训练对话模型仅限科研用途”。large 的每个上游来源还有各自或不明的权利条件。数据许可不是 MIT。

**风险与用途。** 真人社交媒体抓取没有清晰的用户逐项同意或完整 PII 删除承诺，隐私、版权、毒性和偏见风险高。适合科研中的大规模候选挖掘、长度分布与常见回应统计、寻找负例，不适合作为产品训练语料或严谨自然度 gold。

原始来源：[论文](https://arxiv.org/abs/2008.03946)、[官方仓库、下载与来源表](https://github.com/thu-coai/CDial-GPT)、[仓库 LICENSE](https://github.com/thu-coai/CDial-GPT/blob/master/LICENSE)、[官方 Hugging Face 数据卡](https://huggingface.co/datasets/thu-coai/lccc)。

### 6. PersonalDialog：真实口语分布最好之一，隐私与商用风险也最高之一

**性质与规模。** PersonalDialog 来自真实微博用户的帖子/评论树。论文报告 20.83M 会话、56.25M utterances、8.47M 用户，并附性别、年龄、地区、兴趣标签等 profile。它包含真实短接话、玩笑、反讽、骂人和平台口语，是本次候选中最接近“普通网民实际上怎么说”的大型文本之一。

**许可与隐私。** 爬取代码是 MIT，但这不构成微博文本的数据许可。官方数据页面/论文面向学术研究者，要求申请或签约，并禁止去匿名；官方 HF 卡标记 `license: other`。即使 ID、@ 和数字等经过处理，人口属性与真实社交内容仍带来重识别和敏感信息风险。

**用途判断。** 只有在获批的研究环境中才适合做聚合统计或少量人工审阅，不应把原文、用户画像或可恢复身份的对话放进商业训练链。若只需要“被骂后真人通常怎么接”等分布，可以从中定义行为类别与长度统计，再让自有标注员原创实例。

原始来源：[论文](https://arxiv.org/abs/1901.09672)、[作者数据页](https://www.zhengyinhe.com/datasets/)、[官方 HF](https://huggingface.co/datasets/silver/personal_dialog)、[官方爬取代码](https://github.com/silverriver/PersonalDilaog)。

### 7. LiveChat：真实短句很自然，但自动对齐不可靠

**性质与规模。** LiveChat 从抖音直播中提取观众评论与主播语音回复，再用 bag-of-words 与 BERT 自动匹配成 single-turn pair。论文报告 1.332M 对、351 位主播；它的语言确实来自真实直播互动，包含普通文本库很少保留的短接话、语气词、口头修正和即时反应。

**数据质量。** 这不是人工确认的一问一答。直播中主播可能回应另一条评论、画面事件或更早上下文；ASR 还会引入错字与断句。论文局限部分明确承认 ASR 噪声、缺少视频/历史上下文以及匹配仍需改进。对官方公开子集的实测只有 45 pairs、4 位主播，人工检查即可观察到自然短句，同时也能看到错配和 ASR 痕迹。

**隐私与许可。** 论文伦理段称对姓名、电话、email 等做转换、删除和匿名化，这是积极信号；但数据仍来自公开直播。官方仓库根 LICENSE 为 MIT，没有证据表明它单独授予抖音主播、观众和平台内容的商业训练权。代码 MIT 不等于直播内容 MIT。

**用途判断。** 它是观察“真人短句到底有多短、怎样停顿和接梗”的首选候选之一，但只能人工抽样并把错配当作待审对象，绝不能自动当 gold、few-shot prompt 或商业 SFT 数据。最好的用法是提取长度、语气词、是否追问等聚合特征，再由自有人员原创。

原始来源：[ACL 论文](https://aclanthology.org/2023.acl-long.858/)、[官方仓库与公开子集](https://github.com/gaojingsheng/LiveChat)、[仓库 LICENSE](https://github.com/gaojingsheng/LiveChat/blob/main/LICENSE)。

### 8. KdConv：适合知识型话题转移，不适合低信息社交行为

**性质与自然性。** KdConv 有 4,500 段、85,596 条 utterance、平均 19.0 轮，电影、音乐、旅行各 1,500 段。两名 crowd worker 从头编写，双方都能看到知识图谱，无固定最终目标，并被鼓励进行多话题转移；每句标注使用的知识三元组。

它是 human-written，但强制使用知识让大量回复像“看资料聊天”。NaturalConv 论文的对比人评中 KdConv 自然度仅 2.0/3，背景重叠 BLEU-1/2 为 35.69/26.27，明显高于 NaturalConv。

**许可。** 官方仓库根 LICENSE 是 Apache-2.0，数据文件直接在 repo，但没有数据专属许可。知识图谱来自 XLORE，起始实体/文本还涉及豆瓣电影、豆瓣音乐 Top250 和去哪儿旅行，上游权利未逐项清算。

**用途判断。** 可用于连续话题转移、事实 grounding 和内容丰富度评测；不适合问候、辱骂、风格修复、倾诉等低信息社会行为，也不应作为自然短接话 gold。

原始来源：[ACL 论文](https://aclanthology.org/2020.acl-main.635/)、[官方仓库与数据](https://github.com/thu-coai/KdConv)、[仓库 LICENSE](https://github.com/thu-coai/KdConv/blob/master/LICENSE)。

### 9. XDailyDialog：标签整齐，但中文是翻译文本

**性质。** XDailyDialog 把 human-written 的英文 DailyDialog 专业翻译为中文、德文和意大利文。总计 52,472 个语言版本对话、约 411K utterances，即每种语言约 13K 段、约 103K utterances，保留 topic、emotion 和 dialogue-act 标签。论文对随机 100 段中文做三名翻译专家的准确、口语与连贯性检查，中文合格率 0.98。

**许可。** 仓库代码为 Apache-2.0；README 明确数据继承 DailyDialog 的 CC BY-NC-SA 4.0，不可商用。两者已在官方 README 中明确区分。

**用途判断。** 可用于问候、提问、感谢、告别等基础行为的辅助评测，且标签格式干净。但它不是原生中文人际对话，英语日常教材式语境与翻译选择会带来翻译腔，不应覆盖 NaturalConv 或真实口语数据的结论。

原始来源：[ACL 论文](https://aclanthology.org/2023.acl-long.684/)、[官方仓库与数据](https://github.com/liuzeming01/XDailyDialog)、[README 许可说明](https://github.com/liuzeming01/XDailyDialog#8-license)。

### 10. RealTalk-CN：真实口语现象最完整的新数据之一

**性质。** RealTalk-CN 是真人对真人的中文语音—文本任务型对话：5,400 段、60K+ utterances、约 150 小时、113 名说话人、58 个任务域，平均约 12 轮。人工逐字转写保留延长、重复、自我修正和犹豫，并带 intent、slot 和说话人年龄/性别/地区等元数据。

它比文本众包库更能回答“真实人开口时如何迟疑、改口、打断和修复”，但内容是为任务域收集，不等于朋友间开放闲聊。

**许可与下载。** 官方 Hugging Face 数据卡是 CC BY-NC-SA 4.0，明确仅非商业研究。仓库公开但数据为 manual gated，需要提交并等待批准。

**用途判断。** 适合建立口语不流利、澄清、改口、跨模态切换和任务失败修复的研究评测；不适合商业训练或把 demographic metadata 带入生产。

原始来源：[论文](https://aclanthology.org/2026.acl-long.131/)、[官方数据卡](https://huggingface.co/datasets/BAAI/RealTalk-CN)。

### 11. MagicData-RAMC：自发普通话语音，但许可最严格之一

**性质。** MagicData-RAMC 是 663 名中国不同口音区域说话人通过手机录制的 180 小时自发普通话对话，覆盖 15 类话题，从科技到日常生活；转写和时间戳由人工标注并由专业质检员复核。

**许可。** OpenSLR 官方页面明确为 CC BY-NC-ND 4.0，并写明只供 academic use。NC 阻止商业使用，ND 又限制演绎/修改；不能因为作者 GitHub 仓库未放 LICENSE 就自行扩大数据权利。

**用途判断。** 很适合观察真实口语的句长、应答词、重叠、停顿和话题结构；最多用于合规研究评测，不建议抽取或改写后进入训练集。

原始来源：[OpenSLR 官方分发与许可](https://www.openslr.org/123/)、[作者官方仓库](https://github.com/MagicHub-io/MagicData-RAMC)、[论文](https://arxiv.org/abs/2203.16844)。

### 12. LDC CALLHOME / HUB5 Mandarin：付费受控，但是真正自然

**性质。** CALLHOME Mandarin 转写覆盖 120 段无脚本普通话电话，每段连续 5 或 10 分钟。多数参与者是家人或朋友，话题不限；这比随机众包者按任务对聊更接近真实关系中的自然接话。HUB5 Mandarin 第二版则包含 42 段亲友自由话题电话、约 19 小时语音和转写。

**许可。** 数据不是开源，需要从 LDC 购买并签署 User Agreement。非会员协议只允许非商业语言教育、研究和技术开发；如果使用结果进入商业产品，发布前必须加入 LDC For-Profit Member 并支付适用费用。也就是说，它不是“免费可商用”，但存在比爬取社交平台更明确的商业合规路径。

**限制。** 数据主要采集于 1990 年代，语言代际、海外华人语境和电话媒介与 2026 年移动聊天有差异；真实亲友聊天还可能含个人信息，不应向标注员无控制地暴露或让模型复述原句。

**用途判断。** 如果愿意付费并完成许可，CALLHOME 是构建真人自然度统计基线、应答词/修复/沉默模式和盲测材料的强候选。它仍不包含 persona16 所需的稳定角色 schema，需要另行标注。

原始来源：[CALLHOME Mandarin Transcripts](https://catalog.ldc.upenn.edu/LDC96T16)、[CALLHOME XML 版](https://catalog.ldc.upenn.edu/LDC2008T17)、[HUB5 Mandarin 第二版](https://catalog.ldc.upenn.edu/LDC2018S18)、[LDC 非会员协议](https://catalog.ldc.upenn.edu/license/ldc-non-members-agreement.pdf)。

### 13. EmotionTalk：情绪表达好，不是自然发生的私人聊天

**性质。** EmotionTalk 是 2026 ACL 数据，19 名专业演员在预设场景中进行中文双人互动，23.6 小时、19,250 条 utterance，带 7 类情绪、5 档 sentiment 和细粒度说话风格描述。论文将其描述为 interactive/spontaneous，但参与者是演员、场景有设计，因此应理解为“受控即兴互动”，不是私人生活中自然发生的对话。

**许可。** 官方 Hugging Face 数据卡为 CC BY-NC-SA 4.0，不能用于商业训练。

**用途判断。** 适合研究愤怒、受伤、讽刺、尴尬、担忧等状态下的短句和情绪轨迹；不提供长期 persona。尤其可为“用户辱骂后角色如何不僵死、不说教、又保持边界”提供行为类别，但最终文本仍应自有原创。

原始来源：[ACL 论文](https://aclanthology.org/2026.findings-acl.440/)、[官方数据卡](https://huggingface.co/datasets/BAAI/Emotiontalk)。

### 14. RoleBench / RoleLLM：不要拿角色口癖库解决“说话太刻意”

**性质。** RoleBench/RoleLLM 有 168,093 条样本、23,463 个 unique instructions、95 个英文角色和仅 5 个中文角色。大量内容是 GPT-4 把通用 instruction 改写成角色化回答，角色知识 QA 则由 GPT-3.5 生成；角色资料来自大量剧本。论文明确评估 catchphrase 和 lexical consistency。

**许可。** 官方 HF 数据卡标 Apache-2.0，但底层剧本、影视角色和第三方表达仍可能受版权、商标或角色权利限制；官方 GitHub 也不能替所有底层 IP 清权。

**用途判断。** 它可以启发 OOC/角色知识评测，但其“固定口癖 + 词汇一致性”目标正会制造 persona16 当前要修复的角色水印。不要纳入自然中文训练候选。

原始来源：[ACL 论文](https://aclanthology.org/2024.findings-acl.878/)、[官方数据卡](https://huggingface.co/datasets/ZenMoore/RoleBench)、[官方仓库](https://github.com/InteractiveNLP-Team/RoleLLM-public)。

### 15. CharacterEval：值得借评测协议，不是自然语料库

**性质与规模。** CharacterEval 是中文角色扮演能力评测，不是普通闲聊语料。角色与材料来自中文小说/剧本，角色资料还参考百度百科；GPT-4 用于初始构建，再由人工质量控制。它可用于研究角色知识、语气和行为一致性，但这些目标并不保证表面语言自然。

**规模口径。** README 宣称 1,785 dialogues、23,020 examples；对当前官方 release 的实测则是 `test_data` 4,564 个 contexts、`rm_train_data` 7,228 个 ratings。两组 release 文件的任务单位与 README 的 examples 口径不同，不能把 4,564 + 7,228 相加后称为 23,020，也不能用 README 总数代替实际读取的当前版本。评测接入前必须锁定 commit、文件和 schema。

**许可。** 官方仓库根 LICENSE 是 MIT，但没有证据说明小说、剧本角色文本及百度百科内容均已获得商业训练/再分发授权；仓库代码许可不能自动消除底层第三方版权和角色/IP 风险。

**用途判断。** 可借它的角色维度、rating 结构和人工质检流程补 persona16 的角色一致性评测；不应当作自然中文语料、few-shot 台词库或商业训练集。

原始来源：[ACL 论文](https://aclanthology.org/2024.acl-long.638/)、[官方仓库与 release 数据](https://github.com/morecry/CharacterEval)、[仓库 LICENSE](https://github.com/morecry/CharacterEval/blob/main/LICENSE)。

### 16. Character-LLM：方法可参考，内容不合适

**性质。** Character-LLM 用 GPT-3.5 为 9 个英文历史/虚构人物合成经历场景和对话；平均每角色约 1.6K scenes、754K words、13.2 turns。它不是中文，也不是真人对话。

**许可。** 官方 HF 数据卡为 CC BY-NC 4.0，项目 README 也明确全部资源仅限学术研究；模型还涉及 Llama 1 许可。

**用途判断。** 可以参考“场景—经历—动态状态—对话”的数据结构，但不能把内容当作中文自然语言证据。

原始来源：[EMNLP 论文](https://aclanthology.org/2023.emnlp-main.814/)、[官方仓库](https://github.com/choosewhatulike/trainable-agents)、[官方数据](https://huggingface.co/datasets/OpenMOSS-Team/character-llm-data)。

## 最终 shortlist

### A. 现在就能用于研究版校准集

1. **NaturalConv**：普通多轮接话和换题的第一基准。
2. **DuLeMon-BOTH**：已知用户事实、双方 persona 和记忆 grounding。
3. **CPED**：按 19 类 dialogue act 和 13 类情绪建立场景切片。
4. **CharacterDial 公开 human-role-playing 子集**：角色一致性、关系与人设显隐。
5. **LiveChat 官方小子集**：只做人工节奏观察与错配研究，不作为 gold。
6. **RealTalk-CN / EmotionTalk**：补真实口语修复和情绪轨迹；需通过 gated/非商用流程。

这组只能在受限研究环境里做评测和抽象规律提取。不要把原句混入商业训练集，也不要把多个非商业库拼接后改名为“自有语料”。

### B. 值得立即联系授权方

1. **腾讯 NaturalConv**：发送商业授权询问至 `ailab@tencent.com`。它在规模、自然性证据、完整多轮结构和隐私可控性之间最平衡。
2. **LDC CALLHOME/HUB5 Mandarin**：向 LDC 询价并确认 For-Profit 会员下用于生成模型训练、模型权重发布和 SaaS 输出的具体权利。
3. **DuLeMon 作者团队**：书面确认根 Apache-2.0 是否覆盖 BCE ZIP 中的数据，以及 PersonaChat 翻译/改写的署名义务。

### C. 只用于挖场景/负例，不进入商业训练

- LCCC、PersonalDialog：真实但来源、隐私和许可风险高。
- KdConv：知识腔明显，适合对照“为什么不像普通人”。
- CPED 的影视原句：可总结行为，不可假定台词商用权。
- CharacterDial 的真人/IP 与文学抽取部分：用于 OOC/刻意度评测，不作输出模板。
- LiveChat 未人工确认的自动匹配对：适合作为“不能把真实来源自动等同于正确一问一答”的质量负例。
- RoleBench、CharacterEval、Character-LLM：适合作为角色评测方法或“角色化过度、口癖水印、模型合成腔”的负例来源。

## 对 persona16 的落地方式

### 第一阶段：研究版，不训练

从 A 组各抽取少量样本，只保存引用 ID、来源和内部标注，不把原文提交到生产 prompt。统一映射成 persona16 的行为 schema，例如：

- `greeting`
- `style_repair`
- `direct_confrontation`
- `acknowledge`
- `apology`
- `reject`
- `comfort`
- `irony`
- `topic_shift`
- `memory_grounding`
- `closing`

对每个行为只总结：回应长度分布、是否先承认、是否追问、是否使用已知事实、是否自我解释、是否显式宣布人格、是否重复口癖。

### 第二阶段：自有商业语料

由签署权利转让和保密协议的原生中文标注员，根据抽象场景原创：

- 每个场景至少 3 个自然正例；
- 至少 2 个刻意/解释腔/人格说明书式负例；
- 四个角色分别给出“相同对话动作、轻微不同采样”，不能给四套固定口癖；
- 盲审时先评“像不像人”，再评“像不像这个角色”；
- 记录 writer、reviewer、来源依据、许可状态、重复检测和 PII 检查。

### 第三阶段：授权后再决定是否训练

即使获得 NaturalConv 或其他库的商业授权，也建议先用作：

1. 评测集和长度/行为统计；
2. 检索相似行为结构，而不是检索可直接复述的台词；
3. 小比例 SFT 或 preference 数据；
4. n-gram 与语义近重复拦截，避免复现原句；
5. 与自有原创语料分桶，保留可删除性和来源追踪。

最终产品资产应命名为“自然接话校准集”，而不是“通俗金句库”。现成语料的价值在于告诉系统**当前这一轮人在做什么、通常多短、哪里会显得刻意**，而不是给角色一批可背诵的话。
