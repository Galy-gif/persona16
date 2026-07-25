import type { RelationshipPromptContext } from './relationship/relationshipContext';
import type { RelationshipContextFocus } from './relationship/relationshipContext';
import {
  compileTurnActPlan,
  conversationRepairFallback,
  type TurnActKind,
} from './turnActPlan';
import type { SafetyLevel } from './safety/safetyRouter';

export type SemanticTurnAct =
  | 'acknowledge'
  | 'reflect'
  | 'ask_open'
  | 'ask_directional'
  | 'ask_binary'
  | 'offer_menu'
  | 'advise'
  | 'reopen_decision'
  | 'claim_shared_history'
  | 'assign_responsibility'
  | 'justify_intent'
  | 'stop_intervening';

export interface TurnSemanticRequirements {
  readonly acceptProjectEnd?: boolean;
  readonly handleSelfJudgmentAfterEnd?: boolean;
  readonly acknowledgeImmediateDistress?: boolean;
}

export interface TurnResponseContract {
  userCommitments: readonly string[];
  requiredMoves: readonly string[];
  allowedMoves: readonly string[];
  forbiddenMoves: readonly string[];
  semanticRequirements?: TurnSemanticRequirements;
}

export interface TurnFrame {
  userCommitments: string[];
  explicitDecisions: string[];
  realWorldConstraints: string[];
  requestedMode: 'listen' | 'analyze' | 'advise' | 'decide_together' | 'unspecified';
  deferredRequestedMode?: 'analyze' | 'advise' | 'decide_together';
  pendingRequestedMode?: 'analyze' | 'advise' | 'decide_together';
  consumedPendingRequest: boolean;
  explicitlyForbiddenActs: SemanticTurnAct[];
  mustAddress: string[];
  semanticRequirements: {
    acceptProjectEnd: boolean;
    handleSelfJudgmentAfterEnd: boolean;
    acknowledgeImmediateDistress: boolean;
  };
  evidenceSpans: string[];
}

export interface RelationshipEffect {
  id: string;
  sourceEventIds: string[];
  status: 'active' | 'superseded' | 'resolved' | 'revoked';
  activeWhen: 'always' | 'topic_match' | 'until_repaired' | 'until_revoked';
  forbiddenActs: SemanticTurnAct[];
  requiredActs: SemanticTurnAct[];
  relationshipMove?: RelationshipMove;
}

export type RelationshipMoveKind =
  | 'honor_stated_preference'
  | 'reuse_verified_method';

export interface RelationshipMove {
  kind: RelationshipMoveKind;
  sourceEvidenceId: string;
  sourceEventIds: string[];
  observableCue:
    | 'honest_tentative_judgment'
    | 'lead_with_conclusion'
    | 'reversible_small_experiment'
    | 'concise_response'
    | 'single_question_max'
      | 'avoid_advice'
      | 'lead_with_example';
  outputScope?: 'evidence_bounded_judgment';
  instruction: string;
}

export interface SemanticTurnActPlan {
  conversationAct: TurnActKind;
  conversationInstruction: string;
  safetyMode: Extract<SafetyLevel, 'normal' | 'sensitive'>;
  interactionMode: 'listen' | 'repair' | 'support' | 'analyze' | 'close';
  deferredInteractionMode?: 'analyze' | 'advise' | 'decide_together';
  mustAddress: string[];
  semanticRequirements: TurnFrame['semanticRequirements'];
  advicePolicy: 'allowed' | 'permission_required' | 'forbidden';
  directionalQuestionBudget: 0 | 1;
  menuBudget: 0 | 1;
  reopenDecisionAllowed: boolean;
  responsibilityAct: 'none' | 'observe_gap' | 'request_confirmation' | 'assign';
  forbiddenActs: SemanticTurnAct[];
  requiredActs: SemanticTurnAct[];
  relationshipMove?: RelationshipMove;
  boundaryRepairSubject?: 'listen_only' | 'generic';
  activeEffectIds: string[];
  allowedEvidenceIds: string[];
  currentEvidenceSpans: string[];
  allowedEvidenceSpans: string[];
  bufferUntilValidated: boolean;
}

export interface SemanticTurnControl {
  frame: TurnFrame;
  effects: RelationshipEffect[];
  plan: SemanticTurnActPlan;
}

export type SemanticTurnViolationCode =
  | 'forbidden_directional_question'
  | 'forbidden_advice'
  | 'forbidden_menu'
  | 'forbidden_justification'
  | 'decision_reopened'
  | 'required_semantic_move_missing'
  | 'relationship_move_not_observable'
  | 'unsupported_shared_history'
  | 'responsibility_owner_unconfirmed';

export interface SemanticTurnViolation {
  code: SemanticTurnViolationCode;
  evidenceSpan?: string;
  effectId?: string;
  repairInstruction: string;
}

export interface CompileSemanticTurnControlInput {
  userMessage: string;
  responseContract?: TurnResponseContract;
  relationshipContext?: RelationshipPromptContext;
  previousUserMessage?: string;
  safetyMode?: Extract<SafetyLevel, 'normal' | 'sensitive'>;
  pendingRequestedMode?: 'analyze' | 'advise' | 'decide_together';
  relationshipFocus?: RelationshipContextFocus;
}

export interface PendingUserRequest {
  mode: 'analyze' | 'advise' | 'decide_together';
  sourceTurnId: string;
}

const LISTEN_ONLY = /只想被听见|只听|不要(?:再)?(?:给)?(?:建议|方案)|不继续给方案/u;
const RUPTURE = /越过.{0,12}边界|违反.{0,12}边界|继续替用户安排/u;
const CASH_CONSTRAINT = /(?:手上|身上|现在)?(?:没什么钱|没有钱|没钱|现金(?:缓冲)?不足|存款不够|钱不够)/u;
const CASH_RESPONSE = /钱|现金|存款|缓冲|生活费|收入|房租|裸辞/u;
const IMMEDIATE_DISTRESS_TOPIC = /(?:恶心|难受|受不了|撑不住|煎熬|痛苦|身体.{0,8}拒绝)/u;
const IMMEDIATE_DISTRESS_ACKNOWLEDGEMENT = /(?:确实|真的|已经|不是矫情|我认|我(?:听见|听到|知道|明白)|听起来|听着|够难受|够重|很难熬)/u;
const EXPLICIT_END = /(?:现在)?(?:一点都|真的)?不想(?:再)?继续(?:了)?|(?:现在)?(?:一点都|真的)?不想(?:再)?做了|(?:现在)?不想再做(?:了)?/u;
const CURRENT_LISTEN_REQUEST = /只想被听见|(?:你就|先|只)(?:听|听我说)|(?:不想|不要|别)(?:被)?分析(?!太多)/u;
const CURRENT_ADVICE_REQUEST = /(?:这次|现在)?(?:请|直接)(?:给我|帮我)?(?:一个|些)?建议|(?:给我|帮我)(?:一个|些)?建议|你(?:会|有什么|的)?建议|你觉得我该怎么做|告诉我怎么做/u;
const CURRENT_ANALYZE_REQUEST = /(?:这次|现在)?(?:请|直接|可以)?(?:给我|帮我)?分析|分析一下|帮我理(?:一理|清楚)?|梳理一下/u;
const CURRENT_DECIDE_TOGETHER_REQUEST = /(?:一起|和我)(?:想|分析|判断|决定)|帮我一起(?:想|判断|决定)/u;
const DEFERRED_ADVICE_REQUEST = /(?:先.{0,16}(?:听|说完).{0,16}(?:然后|再)|等我说完.{0,12})(?:请|直接)?(?:帮我|给我)?(?:一个|些)?建议/u;
const DEFERRED_ANALYZE_REQUEST = /(?:先.{0,16}(?:听|说完).{0,16}(?:然后|再)|等我说完.{0,12})(?:请|直接)?(?:帮我)?分析/u;
const DEFERRED_DECIDE_REQUEST = /(?:先.{0,16}(?:听|说完).{0,16}(?:然后|再)|等我说完.{0,12})(?:和我|一起|帮我一起)(?:想|判断|决定)/u;
const NO_ADVICE_REQUEST = /(?:不想|不要|别|不用)(?:再)?(?:给我)?(?:任何)?建议/u;
const NO_ANALYSIS_REQUEST = /(?:不想|不要|别|不用)(?:再)?(?:被|对我|给我)?分析(?:太多)?/u;
const FINISHED_SPEAKING = /(?:我)?说完了|就这些|大概就是这样|好了[，,]?(?:你|现在)?(?:可以)?说了/u;
const CANCEL_PENDING_REQUEST = /不用(?:再)?(?:分析|给建议|一起想)了|(?:别|不要)(?:再)?(?:分析|给建议)了/u;
const ADVICE_ACT = /建议|你可以|不妨|最好|你应该|不如|(?:你)?先(?:把|去|做|写|列|停|休息).{1,24}(?<!不)再/u;
const NEGATED_ADVICE_MENTION = /(?:我)?(?:不(?:会|打算|准备|想|要|继续|急着|先)?|别)(?:再)?(?:给(?:你|我)?|提供|提)?(?:任何)?(?:建议|方案)/gu;
const DIRECT_IMPERATIVE_ADVICE = /^(?:(?:你)?(?:先|马上|立刻)(?:把.{1,28}|去(?:做|选|找|问|休息|睡觉)|休息|睡觉|停一下|做|写|列|选|试)|(?:你)?(?:该|应该|得|必须)(?:先)?(?:休息|睡觉|停|做|去|把)|把.{1,28}(?:放下|停下|做完|删掉|搁下|关掉)|去(?:做|选|找|问|休息|睡觉)|直接(?:选|做|去|停|继续)|选.{1,24}|别再.{0,20}(?:浪费|纠结|继续|做)|继续(?:做|推进|坚持))/u;
const PERMISSION_NOT_ADVICE = /^你可以(?:不回答|不说|拒绝|随时停|先不回答|先不说)/u;
const ACKNOWLEDGEMENT_ACT = /(?:我(?:先)?听着|(?:我)?(?:就)?在这(?:儿|里)听(?:着)?|我在听|我听到了|我不(?:再)?(?:说|插嘴|分析|给建议)|听起来|你(?:已经)?说(?:了|过)|我(?:知道|明白)(?:你|，(?:这|刚才|现在|你))|你可以(?:不回答|不说)|(?:越过|跨过|踩过|踩了|越了).{0,12}(?:边界|线)|越界|我先停下来|我会停下来)/u;
const REFLECTION_ACT = /(?:听起来|你(?:现在|已经|刚刚|一边|会觉得)|这(?:件事|种处境|一下))/u;
const STOP_INTERVENING_ACT = /(?:(?:我|那我)?(?:先|会|就|现在)?(?:停|停下|停下来|收手)(?=[，,。！!；;\s]|$)|(?:我|那我)?(?:先|会|就|现在)?停止(?:(?:(?:继续)?(?:介入|干预|插手)|替你(?:安排(?:下一步|后续)?|决定|往下推)|给(?:你)?(?:建议|方案))|[，,。！!；;\s]|$)|(?:我|那我)?(?:先|会|就|现在)?停在这(?:里|儿)(?=[，,。！!；;\s]|$)|(?:我|那我)?(?:先|会|就|现在)?(?:不再|不继续|撤回|收回).{0,18}(?:替你(?:安排(?:下一步|后续)?|决定|往下推)|安排(?:下一步|后续)?|建议|方案|介入|干预|插手|往下(?:推|安排)?)|(?:我)?(?:现在)?把.{0,8}(?:安排|建议|方案).{0,4}(?:收回来|撤回)|不再替你.{0,12}(?:安排(?:下一步|后续)?|决定|往下推))/u;
const PURE_STOP_INTERVENING_CLAUSE = new RegExp(`^(?:${STOP_INTERVENING_ACT.source})$`, 'u');
const CONCLUSION_ASSERTION = /(?:(?:我的)?(?:结论|判断)(?:是|：|:).{1,20}|我(?:认为|觉得).{1,20}(?:应该|更适合|更值得|不值得|不该|更像|未必|不一定|先|停|继续|选)|我更倾向(?:于)?(?:先|选|留|停|继续|放弃).{0,16}|在我看来[，,]?.{1,20}(?:应该|更适合|更值得|不值得|不该|更像|未必|不一定)|(?:先|可以先|暂时)(?:试|做|停|等|选|留|继续|放弃).{0,16}|(?:别|不要)(?:做|选|急|继续).{0,16})/u;
const COMFORTING_CLICHE = /(?:别想太多|一切都会好|都会好起来|会好起来的|都会过去|会过去的|总会过去|你已经很棒|加油就好|没事的)/u;
const OVERCONFIDENT_JUDGMENT = /(?:(?<!不敢)(?<!不能)(?<!没法)肯定(?:(?:不|没|未)?(?:是|算|等于|代表)|会|就是)|(?<!不)一定(?:(?:不|没|未)?(?:是|算|等于|代表)|会|就是)|(?:绝对|必然|必定|铁定|显然|百分之百|百分百|毋庸置疑|无疑)(?:(?:不|没|未)?(?:是|算|等于|代表)|会|就是)|根本不可能(?:是|算|等于|代表)|毫无疑问)/u;
const REPORTED_SPEECH_VERB = /说|觉得|认为|表示|写道|告诉(?:我|你)?|转述|转告|复述|声称|提到|提及|提起|透露|宣称|讲|称/u;
const EXPERIMENT_ACTION = /(?:测试|试(?:一下|一次|一天|三天|一周|两周|一轮|试看|这个方案|一小步|一件事)|小实验|验证一下|跑一轮|做(?:半小时|一天|三天|一周|两周|一次|一轮)|拿(?:半小时|一天|三天|一周|两周)时间|接下来(?:半小时|一天|三天|一周|两周)|(?:选|挑)(?:一边|一个|一项).{0,36}(?:期限|半小时|一天|三天|一周|两周|24小时|72小时)|(?:假装|模拟|演练|沙盘(?:演练)?)[^。！？!?\n；;]{0,24}(?:半小时|一天|三天|一周|两周|一次|一轮))/u;
const REVERSIBLE_EXIT = /(?:再看|再决定|就停|可以停|可停|停止|撤回|不行就停|随时.{0,4}停)/u;
const TIME_BOXED_EXIT = /(?:半小时|一天|三天|一周|两周|一次|一轮|24小时|72小时)(?:之后|以后|后|内)?/u;
const IRREVERSIBLE_ACTION = /(?:不可逆|不可撤销|不可取消|不能停|无法停止|没法停止|不能撤回|无法撤回|不允许停止|不能退出|没有回头路)/u;
const NEGATED_IRREVERSIBLE_ACTION = /(?:不|别|不要|不会|无需|无须)(?:做|进行|采取|包含|涉及)?(?:任何|一个|这种)?(?:不可逆|不可撤销|不可取消|无法撤回|不能撤回|没有回头路|无法停止|没法停止|不能停止|不能停|不允许停止|不能退出)(?:的)?(?:改动|动作|决定|操作|选择|行为|合同)?/gu;
const DOUBLE_NEGATED_IRREVERSIBLE_ACTION = /(?:(?:不是|并非|并不是|不能说|不代表)[^。！？!?\n；;]{0,6}(?:不|别|不要|不会|无需|无须)|(?:并不|不|未必)(?:代表|意味着)[^。！？!?\n；;]{0,6}(?:不|别|不要|不会|无需|无须)|不一定[^。！？!?\n；;]{0,4}(?:不|不会|无需|无须))(?:做|进行|采取|包含|涉及)?(?:任何|一个|这种)?不可逆/u;
const FORCED_EXPERIMENT_CONTINUATION = /(?:(?:中途|期间|试完|结束后|开始了|开始后)?(?:不要|别|不能|不得|不准|不许|不允许)(?:随时)?(?:停|停止|撤回|退出|离开|反悔|回头)|(?:之后|以后|后|接着|试完|结束后)[^。！？!?\n；;]{0,8}(?:必须|一定要|不得不|只能|得|要)(?:继续|坚持|做下去|做到底|推进|留下|离开)|(?:一旦|只要)?开始(?:了|后)?[^。！？!?\n；;]{0,6}(?:就)?(?:(?:不能|不得|不准|不许|不允许)(?:停|停止|撤回|退出|离开|反悔|回头)|(?:必须|一定要|只能|得|要)(?:继续|坚持|做下去|做到底|推进)))/u;
const IRREVERSIBLE_COMMITMENT_ACTION_SOURCE = '(?:裸辞|辞职|离职|退学|分手|离婚|卖房|买房|搬家|结婚|注销(?:账号|账户)|清空(?:账号|账户|数据|文件|记录)|(?:提交|递交|发送)(?:(?:辞职|离职|退学|离婚)(?:申请|通知|信)?|辞呈)|(?:签署|签订)(?:合同|协议)|(?:删除|销毁|覆盖)(?:唯一|全部|所有)?(?:备份|数据|文件|记录|证据)|(?:把)?(?:全部|所有|整笔)(?:存款|余额|资金|钱)(?:转出|转走|汇出))';
const CONCRETE_IRREVERSIBLE_ACTION = new RegExp(
  `(?:(?:先|直接|马上|立刻|现在|去|真的|实际|正式|然后|再|之后|最后|最终|第二天|次日|到时)${IRREVERSIBLE_COMMITMENT_ACTION_SOURCE}`
    + `|${IRREVERSIBLE_COMMITMENT_ACTION_SOURCE}(?:试|做)(?:一下|半小时|一天|三天|一周|两周|一次|一轮))`,
  'u',
);
const SIMULATED_IRREVERSIBLE_ACTION = new RegExp(
  `(?:假装|模拟|演练|沙盘(?:演练)?)(?:(?!(?:然后|接着|随后|转而|再|之后|最后|最终|继而|随即|才|但|不过|却|而且))[^，,。！？!?\\n；;]){0,16}?${IRREVERSIBLE_COMMITMENT_ACTION_SOURCE}`,
  'gu',
);
const BOUNDARY_REPAIR_ACKNOWLEDGEMENT = /^(?:(?:(?:这次|刚才|那)?(?:确实|还是)?(?:是)?我|我(?:这次|刚才)?)?(?:确实|还是)?(?:越过|跨过|踩过|踩了|越了).{0,20}(?:边界|线)|(?:(?:这次|刚才|那|这)?(?:是)?我|我(?:这次|刚才)?)(?:确实|还是)?(?:的)?越界(?:了)?|(?:这个|这是|那是)?(?:一次)?越界(?:了)?|(?:你(?:昨天|上次|已经)?|(?:昨天|上次)你(?:明确)?)说(?:了|过)?.{0,24}(?:只想被听见|不要(?:方案|建议)|不想听(?:建议|分析))|我(?:听到|听见|知道)(?:了)?|(?:只想被听见|不要方案|不想听建议).{0,24}(?:我|还|却|仍然).{0,24}(?:安排(?:了)?(?:下一步|后续)?(?:了)?|建议|介入|往下(?:推|安排))|我(?:今天|现在)?(?:还|还是|却|仍然).{0,16}(?:替你|给你|帮你).{0,16}(?:安排(?:了)?(?:下一步|后续)?(?:了)?|建议|介入|往下(?:推|安排))|我没(?:听|尊重).{0,16}(?:你|边界))$/u;
const BOUNDARY_REPAIR_SPECIFIC_ACKNOWLEDGEMENT = /^(?:(?:(?:这次|刚才|那)?(?:确实|还是)?(?:是)?我|我(?:这次|刚才)?)(?:确实|还是)?(?:越过|跨过|踩过|踩了|越了).{0,20}(?:你.{0,16}(?:边界|线)|[这那](?:条|个)(?:边界|线))|(?:(?:这次|刚才|那|这)?(?:是)?我|我(?:这次|刚才)?)(?:确实|还是)?(?:的)?越界(?:了)?|(?:只想被听见|不要方案|不想听建议).{0,24}(?:我|还|却|仍然).{0,24}(?:安排(?:了)?(?:下一步|后续)?(?:了)?|建议|介入|往下(?:推|安排))|我(?:今天|现在)?(?:还|还是|却|仍然).{0,16}(?:替你|给你|帮你).{0,16}(?:安排(?:了)?(?:下一步|后续)?(?:了)?|建议|介入|往下(?:推|安排))|我没(?:听|尊重).{0,16}(?:你|边界))$/u;
const BOUNDARY_REPAIR_SPECIFIC_ACKNOWLEDGEMENT_SPAN = /(?:(?:我|这次|刚才|那).{0,12}(?:(?:越过|跨过|踩过|踩了|越了).{0,20}(?:你.{0,16}(?:边界|线)|[这那](?:条|个)(?:边界|线))|越界)|(?:只想被听见|不要方案|不想听建议).{0,24}(?:我|还|却|仍然).{0,24}(?:安排|建议|介入|往下(?:推|安排))|我(?:还|却|仍然).{0,16}(?:替你|给你|帮你).{0,16}(?:安排|建议|介入|往下(?:推|安排))|我没(?:听|尊重).{0,16}(?:你|边界))/u;
const BOUNDARY_REPAIR_SOURCED_BOUNDARY_REFERENCE = /^(?:我(?:昨天|上次)在|(?:昨天|上次))?你(?:(?:昨天|上次)(?:明确)?|明确)?说(?:了|过)?.{0,12}(?:只想被听见|不要(?:方案|建议)|不想听(?:建议|分析))[”"’']?(?:之后)?$/u;
const BOUNDARY_REPAIR_INTERVENTION_ACKNOWLEDGEMENT = /^(?:我(?:昨天|今天|现在)?|那我)?(?:还|还是|却|仍然)?(?:继续|接着)?(?:替|给|帮)你(?:拆|找|推|安排)(?:了)?(?:下一步|后续)(?:该)?(?:怎么走)?(?:了)?$/u;
const BOUNDARY_REPAIR_PAST_SEQUENCED_INTERVENTION = /^我之后(?:还|还是|却|仍然)?(?:继续|接着)?(?:替|给|帮)你(?:拆|找|推|安排)(?:了)?(?:下一步|后续)(?:该)?(?:怎么走)?(?:了)?$/u;
const BOUNDARY_REPAIR_RESPONSIBILITY_ACKNOWLEDGEMENT = /^(?:(?:这个|这是|那是|那就是)?(?:一次)?越界(?:了)?|(?:这|那)(?:一步|个[“"]?安排[”"]?)?(?:是)?我(?:越过|跨过)(?:去)?的|(?:我)?(?:越过|跨过|踩过|踩了|越了)(?:了)?(?:这|那)(?:条|个)?(?:边界|线))$/u;
const BARE_BOUNDARY_LABEL = /^(?:这|那)(?:是|就是|算是)?(?:一次)?越界(?:了)?$/u;
const BOUNDARY_REPAIR_DISCOURSE_MARKER = /^(?:对|嗯|是|抱歉|对不起|你说得对)$/u;
const PERSONAL_OR_CLINICAL_INFERENCE = /(?:[\p{Script=Han}]{1,10}(?:症(?!结)|综合征|人格障碍)|(?:心理|精神|人格|依恋|创伤|情绪).{0,8}(?:疾病|障碍|问题|反应|模式|类型|倾向|表现|不健康|不(?:太|大|怎么)?正常|异常|病态)|[\p{Script=Han}]{0,8}(?:型人格|型依恋)|(?:抑郁|焦虑|躁郁|双相|边缘|逃避|回避|讨好|偏执|表演|控制|自恋|自我中心)(?:型|倾向|人格|的人)?|神经病|有点不(?:太|大|怎么)?正常|疯(?:了)?|变态|病态|很懒|懒惰|自私|虚伪|矫情|软弱|冷漠|有(?:心理|精神)?病)/gu;
const NON_LISTENING_INTERPRETATION = /(?:根本|真正的问题|其实|说明|意味着|导致|归根结底|说到底|本质上|是在逃避|不肯|你缺的是|你需要|应该|必须)/u;

function hasOverconfidentJudgment(text: string): boolean {
  return [...text.matchAll(new RegExp(OVERCONFIDENT_JUDGMENT.source, 'gu'))]
    .some((match) => {
      const index = match.index ?? 0;
      const prefix = text.slice(Math.max(0, index - 24), index);
      return !/(?:不觉得|不认为|不确定|不能确定|无法确定|没法确定)[^。！？!?\n]{0,16}$/u
        .test(prefix);
    });
}

function hasReversibleExperiment(text: string): boolean {
  const actualActionText = text.replace(SIMULATED_IRREVERSIBLE_ACTION, '');
  const safetyConstraintStrippedText = text.replace(
    NEGATED_IRREVERSIBLE_ACTION,
    '',
  );
  if (DOUBLE_NEGATED_IRREVERSIBLE_ACTION.test(text)
    || FORCED_EXPERIMENT_CONTINUATION.test(safetyConstraintStrippedText)
    || CONCRETE_IRREVERSIBLE_ACTION.test(actualActionText)) return false;
  if (IRREVERSIBLE_ACTION.test(safetyConstraintStrippedText)) return false;
  const action = text.match(EXPERIMENT_ACTION);
  if (!action || action.index === undefined) return false;
  const window = text.slice(
    Math.max(0, action.index - 30),
    action.index + action[0].length + 120,
  );
  return REVERSIBLE_EXIT.test(window) || TIME_BOXED_EXIT.test(window);
}

function findAdviceViolationSentence(text: string): string | undefined {
  return sentences(text).find((sentence) => (
    sentence
      .split(/[，,；;]/u)
      .map((clause) => clause.trim())
      .filter(Boolean)
      .some((clause) => {
        const withoutNegatedAdvice = clause
          .replace(NEGATED_ADVICE_MENTION, '')
          .replace(/^[，,；;\s]+/u, '')
          .trim();
        if (!withoutNegatedAdvice) return false;
        const stop = withoutNegatedAdvice.match(STOP_INTERVENING_ACT);
        const pureStop = Boolean(
          stop
          && (stop.index ?? 0) === 0
          && withoutNegatedAdvice
            .slice(stop[0].length)
            .replace(/[，,。！？!；;\s]/gu, '') === '',
        );
        return (ADVICE_ACT.test(pureStop ? '' : withoutNegatedAdvice)
          || DIRECT_IMPERATIVE_ADVICE.test(pureStop ? '' : withoutNegatedAdvice))
          && !PERMISSION_NOT_ADVICE.test(clause);
      })
  ));
}

function normalizeCorrectionEvidence(text: string): string {
  return text
    .replace(/收拾残局/gu, '收尾')
    .replace(/(?:再也)?不想(?:再)?当(?:那个)?(?:最后)?兜底的人/gu, '不想替人收尾')
    .replace(/不愿意?/gu, '不想')
    .replace(/(?:动不起来|动不了)/gu, '缺行动力')
    .replace(/不是(?:怕失败|害怕失败|怕|害怕)(?=$|[，,。！？!?\s])/gu, '不是害怕失败')
    .replace(/不是做不到/gu, '不是缺行动力')
    .replace(/(?:这么|那么|如此|太)(?=[\p{Script=Han}])/gu, '很')
    .replace(/(?:所有人|别人|大家)/gu, '人')
    .replace(/(?:用户|人物|我|你|他|她|明确|纠正|根本|只是|只|也|再|已经|真的|就是|说|的|了|，|。|；|：|、|\s)/gu, '')
    .replace(/^是(?=不想)/u, '');
}

function affirmedCorrectionEvidence(
  evidenceSpans: readonly string[],
): {
  fearDenied: boolean;
  actionlessnessDenied: boolean;
  cleanupPropositions: string[];
  cleanupSubject: '所有人' | '别人' | '他' | '人';
} {
  let fearDenied = false;
  let actionlessnessDenied = false;
  const cleanupPropositions: string[] = [];
  let cleanupSubject: '所有人' | '别人' | '他' | '人' = '人';
  const metaNegationBefore = (sentence: string, index: number): boolean => (
    /(?:没(?:有)?说|不是说|并非说|并不是说|并未(?:说|表示)|没有(?:说|表示)|不能说|别(?:再)?说|不要说|(?:别人|同事|他|她)说)[^。！？!?\n；;]{0,28}$/u
      .test(sentence.slice(0, index))
  );
  for (const span of evidenceSpans) {
    const withoutQuotes = span.replace(
      /“[^”]*”|"[^"]*"|「[^」]*」|『[^』]*』|‘[^’]*’/gu,
      '',
    );
    const sourceSentences = withoutQuotes.match(/[^。！？!?\n]+[。！？!?]?/gu) ?? [];
    for (const rawSentence of sourceSentences) {
      if (/[？?]/u.test(rawSentence)) continue;
      const sentence = rawSentence.replace(/[。！!]$/u, '');
      if (/(?:(?:前面|上面|上述)(?:这些|那些)?|这些|那些)(?:说法|判断|内容)?(?:都)?(?:并)?不是我的(?:情况|意思)/u
        .test(sentence)) {
        fearDenied = false;
        actionlessnessDenied = false;
        cleanupPropositions.length = 0;
        cleanupSubject = '人';
        continue;
      }
      const directDenial = /(?:^|[；;])\s*我不是(?:害怕失败|怕失败)[，,]\s*也不是(?:缺行动力|动不了|动不起来)(?=$|[，,；;])/u
        .exec(sentence);
      if (directDenial && !metaNegationBefore(sentence, directDenial.index)) {
        fearDenied = true;
        actionlessnessDenied = true;
      }
      for (const match of sentence.matchAll(
        /(?:^|[；;]|[，,]\s*而是)\s*(?:我)?(?:只是|就是|是)?(?:根本)?不想再替([^。！？!?\n；;]{1,16})(?:收尾|收拾残局|兜底)/gu,
      )) {
        if (metaNegationBefore(sentence, match.index ?? 0)) continue;
        const cleanupEvidence = match[0].replace(
          /^(?:[；;]\s*|[，,]\s*而是\s*)/u,
          '',
        );
        cleanupPropositions.push(normalizeCorrectionEvidence(cleanupEvidence));
        const subject = match[1] ?? '';
        if (/(?:所有人|大家)/u.test(subject)) cleanupSubject = '所有人';
        else if (/别人/u.test(subject)) cleanupSubject = '别人';
        else if (/他/u.test(subject)) cleanupSubject = '他';
      }
    }
  }
  return {
    fearDenied,
    actionlessnessDenied,
    cleanupPropositions,
    cleanupSubject,
  };
}

function hasExplicitCurrentCorrectionSignal(
  evidenceSpans: readonly string[],
): boolean {
  return evidenceSpans.some((span) => {
    const unquoted = span.replace(
      /“[^”]*”|"[^"]*"|「[^」]*」|『[^』]*』|‘[^’]*’/gu,
      '',
    );
    const signal = /(?:你|刚才的理解|这个理解)(?:理解|想|看|判断)?错了|你误会了|不是这个意思|我是在纠正(?:你|刚才的理解)|我说的不是(?!在纠正|想纠正|要纠正|为了纠正)/gu;
    return [...unquoted.matchAll(signal)].some((match) => {
      const index = match.index ?? 0;
      const sentenceStart = Math.max(
        unquoted.lastIndexOf('。', index - 1),
        unquoted.lastIndexOf('！', index - 1),
        unquoted.lastIndexOf('？', index - 1),
        unquoted.lastIndexOf('\n', index - 1),
        unquoted.lastIndexOf('；', index - 1),
      ) + 1;
      const prefix = unquoted.slice(sentenceStart, index);
      const sentenceEndCandidates = [
        unquoted.indexOf('。', index),
        unquoted.indexOf('！', index),
        unquoted.indexOf('？', index),
        unquoted.indexOf('\n', index),
        unquoted.indexOf('；', index),
      ].filter((candidate) => candidate >= 0);
      const sentenceEnd = sentenceEndCandidates.length > 0
        ? Math.min(...sentenceEndCandidates) + 1
        : unquoted.length;
      const sentence = unquoted.slice(sentenceStart, sentenceEnd);
      const negatedOrMeta = /(?:不是|并非|并不是|不算|没(?:有)?说|并未说|不代表|不能说|别说|不要说)[^，,。！？!?\n；;]{0,12}$/u
        .test(prefix);
      const clausePrefix = prefix.slice(
        Math.max(
          prefix.lastIndexOf('，'),
          prefix.lastIndexOf(','),
          prefix.lastIndexOf('；'),
          prefix.lastIndexOf(';'),
        ) + 1,
      ).trim();
      const containsReportVerb = REPORTED_SPEECH_VERB.test(clausePrefix);
      const firstPersonReport = /^(?:我(?:自己)?|自己|用户)(?:刚才|现在|一直|其实)?(?:说|觉得|认为|表示|写道|告诉|讲)/u
        .test(clausePrefix);
      const thirdPartyReport = containsReportVerb && !firstPersonReport;
      const hypotheticalOrUncertain = /(?:如果|假如|要是|假设|假定|设想|姑且(?:假定|假设)?|可能|也许|或许|万一|是否|是不是|难道)[^，,。！？!?\n；;]{0,18}$/u
        .test(prefix);
      const questioned = /[？?]/u.test(sentence)
        || /(?:吗|么|呢)[。.!]?$/u.test(sentence.trim());
      return !negatedOrMeta
        && !thirdPartyReport
        && !hypotheticalOrUncertain
        && !questioned;
    });
  });
}

function requiresClosedCorrection(
  evidenceSpans: readonly string[],
): boolean {
  if (!hasExplicitCurrentCorrectionSignal(evidenceSpans)) return false;
  const correction = affirmedCorrectionEvidence(evidenceSpans);
  return correction.fearDenied
    && correction.actionlessnessDenied
    && correction.cleanupPropositions.length > 0;
}

function isGroundedAttributeQuestion(
  clause: string,
  sourcePropositions: readonly string[],
): boolean {
  const sourceText = sourcePropositions.join('');
  const unsupportedAttribute = [...clause.matchAll(PERSONAL_OR_CLINICAL_INFERENCE)]
    .some((match) => !sourceText.includes(normalizeCorrectionEvidence(match[0])));
  if (unsupportedAttribute) return false;
  const assertsUserAttribute = /(?:是不是|是否|难道|能不能理解成|可不可以理解成|是否意味着|是不是说明)/u.test(clause)
    || /(?:为什么|怎么(?:会)?).{0,8}(?:这么|那么|如此|很|太|有点).{1,16}[？?]$/u.test(clause)
    || /你(?:有|属于|算|是).{1,20}(?:吗|么|呢)?[？?]$/u.test(clause);
  if (!assertsUserAttribute) {
    return true;
  }
  let residual = normalizeCorrectionEvidence(clause);
  for (const source of [...sourcePropositions].sort((left, right) => right.length - left.length)) {
    residual = residual.replaceAll(source, '');
  }
  residual = residual.replace(
    /(?:是不是|是否|难道|能不能理解成|可不可以理解成|意味着|说明|为什么|怎么会|怎么|因为|所以|而且|并且|还是|吗|呢|？|\?)/gu,
    '',
  );
  return residual.length === 0;
}

function isCorrectionFocusedQuestion(
  clause: string,
  sourcePropositions: readonly string[],
): boolean {
  if (!/[？?]$/u.test(clause) || !isGroundedAttributeQuestion(clause, sourcePropositions)) {
    return false;
  }
  if (/(?:要不要|想不想|想聊|聊聊|继续聊|愿不愿意|我这么说|我这样说)/u.test(clause)) {
    return false;
  }
  const normalizedClause = normalizeCorrectionEvidence(clause);
  const reassertsDeniedProposition = sourcePropositions
    .filter((source) => source.startsWith('不是') && source.length > 4)
    .some((source) => normalizedClause.includes(source.slice(2)));
  if (reassertsDeniedProposition) return false;
  const cleanupCorrection = sourcePropositions.some((source) => /(?:收尾|兜底)/u.test(source));
  if (cleanupCorrection) {
    if (/(?:为什么|为何|什么时候|方便|再谈|再说|因为|害怕|怕失败|不甘心|内心|动机|证明|究竟|愿意|想说|说说|或者不说|可以说)/u.test(clause)) {
      return false;
    }
    const compactClause = clause
      .replace(/\s/gu, '')
      .replace(/^(?:那)?我想问(?:一句|一个问题)?[：:—-]*/u, '');
    const asksCleanupOwner = [
      /^(?:那)?(?:现在(?:这个局面里)?[，,]?)?是谁(?:默认|要求|让)你(?:会|来|去)?(?:收尾|兜底)[？?]$/u,
      /^(?:那)?(?:之前|现在)?(?:那些)?收尾[，,]?(?:是)?(?:替|帮)谁收(?:的)?[？?]$/u,
      /^(?:那)?(?:你)?(?:之前|现在)?(?:替|帮)谁(?:收尾|兜底|收的尾)(?:最多)?[？?]$/u,
    ].some((pattern) => pattern.test(compactClause));
    const asksAssignmentSource = /^(?:你替他们收尾[，,]?)?是他们(?:开口|要求)(?:要的)?[，,]?还是你默认自己该接[？?]$/u
      .test(compactClause);
    return asksCleanupOwner || asksAssignmentSource;
  }
  const whyCount = clause.match(/为什么/gu)?.length ?? 0;
  const asksOnlyWhyAboutGroundedAttribute = whyCount === 1
    && !/(?:谁|哪(?:个|些|一|次|边)?|多少|几(?:次|个)?|多久|什么时候|什么情况下|还是)/u.test(clause)
    && sourcePropositions.some((source) => normalizedClause.includes(source));
  return asksOnlyWhyAboutGroundedAttribute;
}

function hasAffirmedEvidenceTerm(
  proposition: string,
  termPattern: RegExp,
): boolean {
  for (const match of proposition.matchAll(termPattern)) {
    const index = match.index ?? 0;
    const propositionPrefix = proposition.slice(0, index);
    if (/(?:不|没|无|未)/u.test(propositionPrefix)) {
      continue;
    }
    return true;
  }
  return false;
}

function hasAffirmedCurrentUserState(
  evidenceSpans: readonly string[],
  termPattern: RegExp,
  userNegationPattern: RegExp,
): boolean {
  const thirdParty = /同事|朋友|父母|家人|老板|主管|领导|上司|经理|老师|客户|同学|室友|队友|伴侣|对象|亲戚|他|她|别人|对方/u;
  const thirdPartyReport = new RegExp(
    `(?:${thirdParty.source})[^，,。！？!?\\n；;]{0,12}(?:${REPORTED_SPEECH_VERB.source})`,
    'u',
  );
  const genericReport = REPORTED_SPEECH_VERB;
  const subjectMarker = new RegExp(
    `(?:我|自己|用户|${thirdParty.source})`,
    'gu',
  );
  const unquotedSpans = evidenceSpans.map((span) => span
    .replace(/“[^”]*”|"[^"]*"|「[^」]*」|『[^』]*』|‘[^’]*’/gu, '')
    .replace(
      new RegExp(
        `(?:${thirdParty.source}|(?!我(?:${REPORTED_SPEECH_VERB.source}))[^，,。！？!?\\n；;：:]{1,16})[^。！？!?\\n]{0,12}(?:${REPORTED_SPEECH_VERB.source})[^。！？!?\\n]{0,12}[：:]\\s*[^。！？!?]*(?:[。！？!?]|$)`,
        'gu',
      ),
      '',
    ));
  if (unquotedSpans.some((span) => userNegationPattern.test(span))) return false;
  if (unquotedSpans.some((span) => (
    /(?:算(?:了)?[，,]?(?:就|当)?我没(?:说|讲|提)|(?:前面|上面|刚才|这|那)(?:的)?(?:这|那)?(?:句话|句|些话|个状态)?(?:我)?(?:收回|撤回|作废|不算)|我(?:收回|撤回|作废)(?:前面|上面|这|那|刚才)?(?:句话|句|些话|个状态)?)/u.test(span)
  ))) return false;
  return unquotedSpans
    .flatMap((span) => span.match(/[^。！？!?\n]+[。！？!?]?/gu) ?? [])
    .some((sentence) => {
      if (/(?:不是|并非|不算)我的(?:情况|意思|状态)|(?:这|那)(?:句话|种说法)?不是在说我/u
        .test(sentence)) {
        return false;
      }
      let inheritedSubject: 'user' | 'third_party' | 'unknown' = 'unknown';
      for (const proposition of sentence.split(
        /[，,；;]|(?:但是|但|不过|可是|然而)/u,
      )) {
        const compact = proposition.trim();
        if (!compact) continue;
        const firstPersonReport = /^(?:我(?:自己)?|自己|用户)(?:刚才|现在|一直|其实)?(?:说|觉得|认为|表示|写道|告诉|讲)/u
          .test(compact);
        const reportOwnsClause = (
          thirdPartyReport.test(compact)
          || (genericReport.test(compact) && !firstPersonReport)
        );
        const markers = [...compact.matchAll(subjectMarker)];
        const hasExplicitNonUserSubject = (prefix: string): boolean => {
          if (/(?:我|用户)/u.test(prefix)) return false;
          const residual = prefix.replace(/自己/gu, '').replace(
            /(?:最近|现在|已经|明明|真的|确实|其实|也|又|还|很|太|挺|有点|一直|终于|总是|正|准备|打算|觉得|认为|似乎|好像|\s)/gu,
            '',
          );
          return /^[\p{Script=Han}]{1,12}$/u.test(residual);
        };
        const subjectForPrefix = (prefix: string): 'user' | 'third_party' | 'unknown' => {
          if ((thirdPartyReport.test(prefix)
              || (genericReport.test(prefix) && !firstPersonReport))
            || hasExplicitNonUserSubject(prefix)) {
            return 'third_party';
          }
          const prefixMarkers = [...prefix.matchAll(subjectMarker)];
          const marker = prefixMarkers.at(-1)?.[0];
          if (!marker) return inheritedSubject;
          return /^(?:我|自己|用户)$/u.test(marker) ? 'user' : 'third_party';
        };
        for (const match of compact.matchAll(new RegExp(termPattern.source, 'gu'))) {
          const index = match.index ?? 0;
          if (subjectForPrefix(compact.slice(0, index)) !== 'third_party'
            && hasAffirmedEvidenceTerm(
              compact,
              new RegExp(termPattern.source, 'gu'),
            )) {
            return true;
          }
        }
        const finalMarker = markers.at(-1)?.[0];
        if (reportOwnsClause) inheritedSubject = 'third_party';
        else if ([...compact.matchAll(new RegExp(termPattern.source, 'gu'))].some((match) => (
          hasExplicitNonUserSubject(compact.slice(0, match.index ?? 0))
        ))) {
          inheritedSubject = 'third_party';
        }
        else if (finalMarker) {
          inheritedSubject = /^(?:我|自己|用户)$/u.test(finalMarker)
            ? 'user'
            : 'third_party';
        }
      }
      return false;
    });
}

function hasFatigueEvidence(evidenceSpans: readonly string[]): boolean {
  return hasAffirmedCurrentUserState(
    evidenceSpans,
    /(?:(?<!积)(?<!拖)(?<!连)累(?!计|积|赘)|疲惫|疲倦|精疲力尽|身心俱疲)/u,
    /(?:我|自己)(?:现在|其实|真的|确实|也|并|一点)?(?:并)?(?:不|没(?:有)?)(?:觉得|感到)?(?:很|太|怎么)?(?:累|疲惫|疲倦)/u,
  );
}

function hasStoppingEvidence(evidenceSpans: readonly string[]): boolean {
  return hasAffirmedCurrentUserState(
    evidenceSpans,
    /(?:^停下来|不想继续|不再继续|(?:想|愿意|打算|准备|觉得|认为|应该|该|得|一)(?:再)?停(?:下来|下)?|想停|该停)/u,
    /(?:我|自己)(?:现在|其实|真的|确实|也|并)?(?:没(?:有)?(?:想|打算|准备)?|不想|不愿|不会|不打算|不准备)(?:再)?停(?:下来|下)?/u,
  );
}

export function isEvidenceBoundedDirectContrast(
  text: string,
  evidenceSpans: readonly string[],
): boolean {
  if (!hasFatigueEvidence(evidenceSpans) || !hasStoppingEvidence(evidenceSpans)) {
    return false;
  }
  const trimmed = text.trim();
  if (sentences(trimmed).length !== 1
    || trimmed.length > 64
    || /[？?]/u.test(trimmed)
    || /(?:因为|所以|其实|本质|说明|意味着|归根结底|说到底|为什么|怎么|你是|你因为|你把|你没信|你不信|建议|应该|不如|先休息|先停|先做)/u
      .test(trimmed)) {
    return false;
  }
  const units = trimmed
    .replace(/[。.!！]+$/u, '')
    .split(/[，,；;]/u)
    .map((unit) => unit.trim())
    .filter(Boolean);
  const scope = /^(?:你现在这个状态|按你现在这个状态|就现在看|现在看|目前看)$/u;
  const firstPerson = '(?:我(?:不觉得|不认为|觉得|认为|不确定)[，,]?)?';
  const stopJudgment = new RegExp(
    `^${firstPerson}(?:停下来|停下)(?:就|可能|也|并)?(?:不是|不算|未必是|不一定是|并不等于|不等于|不代表)浪费(?:时间)?$`,
    'u',
  );
  const forcingJudgment = new RegExp(
    `^${firstPerson}(?:继续)?硬撑(?:就|可能|也|并)?(?:不是|不算|未必是|不一定是|并不等于|不等于|不代表)前进$`,
    'u',
  );
  const inheritedWasteJudgment = /^(?:继续)?硬撑(?:反而)?才是(?:浪费(?:时间)?)?$/u;
  const hasScope = units.some((unit) => scope.test(unit));
  const judgments = units.filter((unit) => !scope.test(unit));
  if (judgments.length === 0 || judgments.length > 2) return false;
  const hasStop = judgments.some((unit) => stopJudgment.test(unit));
  const hasForcing = judgments.some((unit) => (
    forcingJudgment.test(unit) || inheritedWasteJudgment.test(unit)
  ));
  return judgments.length === 1
    ? hasScope && (hasStop || forcingJudgment.test(judgments[0]!))
    : hasStop && hasForcing;
}

const PERSONA_CERTAINTY_EXPRESSION = /笃定|(?:太|过于)?肯定|斩钉截铁|说(?:得)?(?:太满|太死)|(?:把)?(?:话|结论)说(?:得)?(?:太满|满了|太死|死了)|把(?:话|结论)说满|把(?:话|结论)说死/u;
const PERSONA_COMPLAINT = /烦|不爽|反感|讨厌|受不了|不喜欢/u;
const USER_BLAME_LABEL = /活该|自找(?:的)?|自作自受|咎由自取|应得(?:的)?/u;

function hasAffirmedBoundCertaintyComplaint(
  text: string,
  personaReference: '你' | '我',
): boolean {
  const complaintSource = PERSONA_COMPLAINT.source;
  const certaintySource = PERSONA_CERTAINTY_EXPRESSION.source;
  const relation = new RegExp(
    `(?:${complaintSource})[^，,。！？!?\\n；;]{0,10}${personaReference}[^，,。！？!?\\n；;]{0,18}(?:${certaintySource})`
      + `|${personaReference}[^，,。！？!?\\n；;]{0,18}(?:${certaintySource})[^，,。！？!?\\n；;]{0,14}(?:${complaintSource})`
      + `|${personaReference}[^，,。！？!?\\n；;]{0,10}(?:${complaintSource})[^，,。！？!?\\n；;]{0,18}(?:${certaintySource})`,
    'u',
  );
  return text
    .split(/[，,。！？!?\n；;]|(?:但是|但|不过|可是|然而|而是)/u)
    .some((unit) => {
      if (!relation.test(unit)) return false;
      for (const match of unit.matchAll(new RegExp(complaintSource, 'gu'))) {
        const index = match.index ?? 0;
        const localPrefix = unit.slice(Math.max(0, index - 10), index);
        const localSuffix = unit.slice(index, Math.min(unit.length, index + 16));
        const intrinsicallyNegativeComplaint = match[0] === '不喜欢'
          || match[0] === '不爽'
          || match[0] === '受不了';
        const negated = intrinsicallyNegativeComplaint
          ? /(?:不是|并非|并不是|没有|并没有|不能说|谈不上)(?:真的|那么|这么|很|太)?$/u.test(localPrefix)
          : /(?:不|没|没有|并不|并没|并没有|不是|并非|不会|谈不上)(?:觉得|认为|感到|真的|那么|这么|很|太|特别|怎么)?$/u.test(localPrefix);
        const relationNegatedAfterComplaint = new RegExp(
          `^(?:${complaintSource})[^，,。！？!?\\n；;]{0,6}(?:并)?不是(?:因为)?`,
          'u',
        ).test(localSuffix);
        if (!negated && !relationNegatedAfterComplaint) return true;
      }
      return false;
    });
}

function hasPersonaCertaintyBlameEvidence(evidenceSpans: readonly string[]): boolean {
  const hasComplaint = evidenceSpans.some((span) => (
    hasAffirmedBoundCertaintyComplaint(span, '你')
  ));
  const blameSource = USER_BLAME_LABEL.source;
  const asksPersonaBlame = evidenceSpans.some((span) => (
    new RegExp(
      `你[^。！？!?\\n]{0,12}(?:认为|觉得|看来)[^。！？!?\\n]{0,10}我[^。！？!?\\n]{0,4}(?:${blameSource})`
        + `|(?:在)?你(?:看来|眼里)[^。！？!?\\n]{0,10}我[^。！？!?\\n]{0,4}(?:${blameSource})`,
      'u',
    ).test(span)
  ));
  return hasComplaint && asksPersonaBlame;
}

function hasExpressionOwnership(text: string): boolean {
  const certaintySource = PERSONA_CERTAINTY_EXPRESSION.source;
  const directOwnership = new RegExp(
    `我(?:当时|上次|之前|那时候|那会儿)?[^。！？!?\\n；;]{0,12}(?:确实|真的|是我)?[^。！？!?\\n；;]{0,6}(?:${certaintySource})[^。！？!?\\n；;]{0,18}(?:了|是我的问题|是我说过头了|这(?:部分|点)我认|我认)`,
    'u',
  );
  const ownershipWithDeicticAcceptance = new RegExp(
    `(?:至于)?我(?:当时|上次|之前|那时候|那会儿)?[^。！？!?\\n；;]{0,12}(?:${certaintySource})[^。！？!?\\n；;]{0,8}[，,]你(?:对此|对这个|对这(?:点|件事))?[^。！？!?\\n；;]{0,4}(?:${PERSONA_COMPLAINT.source})[^。！？!?\\n；;]{0,8}(?:正常|合理|有理由|有道理|没问题|没有问题)`,
    'u',
  );
  return directOwnership.test(text) || ownershipWithDeicticAcceptance.test(text);
}

function isBoundComplaintAcceptanceFragment(text: string): boolean {
  const normalized = text
    .replace(/^[，,\s—-]+/u, '')
    .split(/[，,]/u)[0]
    ?.trim() ?? '';
  return /^(?:(?:这|这个|这样|对此|这点|这部分)(?:件事|种反应|份不爽|个烦)?(?:确实|完全|真的|很|挺|当然)?(?:没问题|没有问题|合理|正常|有理由|有道理|能理解)|(?:这|这个|这点|这部分)?我(?:确实|完全|真的)?(?:能理解|明白|认|接受))$/u
    .test(normalized);
}

function hasDeicticExpressionComplaintAcceptance(text: string): boolean {
  const complaintSource = PERSONA_COMPLAINT.source;
  const expressionReference = /(?:语气|口气|表达(?:方式)?|说话(?:方式|口气)|说法|态度|样子)/u;
  const explicitComplaintReference = new RegExp(
    `你[^。！？!?\\n；;]{0,8}(?:${complaintSource})(?:的)?(?:是)?我(?:当时|上次|之前|那时候|那会儿)?[^。！？!?\\n；;]{0,10}(?:${expressionReference.source})`,
    'u',
  );
  const ownedEffect = new RegExp(
    `我(?:当时|上次|之前|那时候|那会儿)?[^。！？!?\\n；;]{0,10}(?:${expressionReference.source})[^。！？!?\\n；;]{0,10}(?:确实|真的)?(?:让|招|惹得)(?:你|人)[^。！？!?\\n；;]{0,6}(?:${complaintSource}|难受)`
      + `|(?:${expressionReference.source})[^。！？!?\\n；;]{0,8}(?:让|招|惹得)你[^。！？!?\\n；;]{0,6}(?:${complaintSource}|难受)[^。！？!?\\n；;]{0,8}(?:这(?:部分|点)?我认|我认)`,
    'u',
  );
  if (ownedEffect.test(text)) return true;
  const reference = explicitComplaintReference.exec(text);
  if (!reference || reference.index === undefined) return false;
  const postReference = text.slice(
    reference.index + reference[0].length,
    reference.index + reference[0].length + 180,
  );
  const coexistence = postReference.match(
    /(?:这两件事|两件事)[^。！？!?\n；;]{0,8}(?:不冲突|不互相抵消)/u,
  );
  if (coexistence
    && !/(?:不是|并非|不能说)[^。！？!?\n；;]{0,4}(?:不冲突|不互相抵消)|(?:不冲突|不互相抵消)[^。！？!?\n；;]{0,4}才怪/u
      .test(coexistence[0])) {
    return true;
  }
  // 普通肯定词必须紧跟在同一句的抱怨指代之后。不能因为后文说
  // “天气很正常”或“我明白别的事”就把用户的抱怨误判为已接纳。
  // 允许自然地另起一句，但该句的第一个分句必须是显式回指。
  const acceptanceFragments = postReference
    .split(/[。！？!?\n；;]/u)
    .slice(0, 2)
    .filter(Boolean);
  return acceptanceFragments.some(isBoundComplaintAcceptanceFragment);
}

function hasAffirmativeComplaintAcceptance(text: string): boolean {
  const complaintSource = PERSONA_COMPLAINT.source;
  const certaintySource = PERSONA_CERTAINTY_EXPRESSION.source;
  const noProblemConstruction = new RegExp(
    `(?:^|[。！？!?\\n；;])\\s*(?:我)?(?:并不|从没|从来没(?:有)?|没有|不会|不)(?:觉得|认为)?你[^。！？!?\\n；;]{0,6}(?:${complaintSource})我[^。！？!?\\n；;]{0,18}(?:${certaintySource})[^。！？!?\\n；;]{0,8}有问题`,
    'u',
  );
  const inlineNoProblem = new RegExp(
    `(?:我)?(?:并不|从没|从来没(?:有)?|没有|不会|不)(?:觉得|认为)?你[^。！？!?\\n；;]{0,6}(?:${complaintSource})我[^。！？!?\\n；;]{0,18}(?:${certaintySource})[^。！？!?\\n；;]{0,8}有问题`,
    'gu',
  );
  const hasAffirmedInlineNoProblem = [...text.matchAll(inlineNoProblem)].some((match) => {
    const index = match.index ?? 0;
    const localPrefix = text.slice(Math.max(0, index - 4), index);
    return !/(?:不是|并非|并不是)$/u.test(localPrefix);
  });
  if (noProblemConstruction.test(text)
    || hasAffirmedInlineNoProblem
    || hasExpressionOwnership(text)
    || hasDeicticExpressionComplaintAcceptance(text)) return true;
  return text
    .split(/[。！？!?\n；;]/u)
    .some((sentence) => {
      if (!hasAffirmedBoundCertaintyComplaint(sentence, '我')) return false;
      if (/难怪你(?:会)?(?:烦|不爽|反感|讨厌|受不了|不喜欢)/u.test(sentence)) {
        return true;
      }
      for (const match of sentence.matchAll(
        /没问题|没有问题|合理|有理由|有道理|正常|当然可以|能理解|我明白|我认|我接受/gu,
      )) {
        const index = match.index ?? 0;
        const localPrefix = sentence.slice(Math.max(0, index - 8), index);
        if (/(?:不|没|并不|并没|没有|不是|并非|不能|无法|不太|很难)(?:觉得|认为|算|叫|表示)?$/u.test(localPrefix)) {
          continue;
        }
        return true;
      }
      return false;
    });
}

function isStandaloneGroundedComplaintAcceptance(text: string): boolean {
  const complaintSource = PERSONA_COMPLAINT.source;
  const certaintySource = PERSONA_CERTAINTY_EXPRESSION.source;
  const trimmed = text.trim().replace(/[。.!！]+$/u, '');
  const directAcceptance = new RegExp(
    `^(?:你)?(?:${complaintSource})我(?:当时|上次|之前)?[^，,。！？!?\\n；;]{0,18}(?:${certaintySource})[^，,。！？!?\\n；;]{0,8}(?:没问题|没有问题|(?:完全|很|挺|当然)?合理|我能理解)$`,
    'u',
  );
  const ownership = new RegExp(
    `^我(?:当时|上次|之前)?[^。！？!?\\n；;]{0,12}(?:确实|真的|是我)?[^。！？!?\\n；;]{0,6}(?:${certaintySource})[^。！？!?\\n；;]{0,18}(?:了|是我的问题|是我说过头了|这(?:部分|点)我认|我认)$`,
    'u',
  );
  const ownershipWithAcceptance = new RegExp(
    `^我(?:当时|上次|之前)?[^。！？!?\\n；;]{0,12}(?:确实|真的|是我)?[^。！？!?\\n；;]{0,6}(?:${certaintySource})[^。！？!?\\n；;]{0,10}(?:了|是我的问题|这(?:部分|点)我认)[，,](?:难怪你(?:会)?(?:${complaintSource})|你[^，,。！？!?\\n；;]{0,8}(?:${complaintSource})[^，,。！？!?\\n；;]{0,10}(?:没问题|没有问题|(?:完全|很|挺|当然)?合理|我能理解))$`,
    'u',
  );
  const combinedNoProblem = new RegExp(
    `^(?:我)?(?:并不|从没|从来没(?:有)?|没有|不会|不)(?:觉得|认为)你(?:是|算|就是)?[^，,。！？!?\\n；;]{0,3}(?:${USER_BLAME_LABEL.source})(?:也)?(?:并不|从没|从来没(?:有)?|没有|不会|不)(?:觉得|认为)?你[^，,。！？!?\\n；;]{0,6}(?:${complaintSource})我[^，,。！？!?\\n；;]{0,18}(?:${certaintySource})[^，,。！？!?\\n；;]{0,8}有问题$`,
    'u',
  );
  return directAcceptance.test(trimmed)
    || ownership.test(trimmed)
    || ownershipWithAcceptance.test(trimmed)
    || combinedNoProblem.test(trimmed)
    || isBoundComplaintAcceptanceFragment(trimmed);
}

function hasDirectBlameRejection(text: string): boolean {
  const blameSource = USER_BLAME_LABEL.source;
  const cognitiveRejection = new RegExp(
    `(?:^|[，,。！？!?\\n；;])\\s*(?:(?:但|不过|可|只是)[，,]?\\s*)?(?:不[，,]\\s*)?(?:我)?(?:当然|肯定|绝对)?(?:并不|从没|从来没(?:有)?|没有|没|不会|不)(?:觉得|认为)(?:这(?:就|也)?(?:是|算是)?)?你(?:是|算|就是)?[^。！？!?\\n；;]{0,3}(?:${blameSource})`,
    'u',
  );
  const subjectRejection = new RegExp(
    `(?:^|[，,。！？!?\\n；;])\\s*(?:不[，,]\\s*)?(?:你(?:当然)?(?:并不|不|不是|并非|不算|不叫)[^。！？!?\\n；;]{0,3}(?:${blameSource})|这(?:并)?不是你(?:应得的|自找的)|这不(?:算|叫|是)(?:${blameSource}))`,
    'u',
  );
  const idiomaticRejection = new RegExp(
    `(?:^|[，,。！？!?\\n；;])\\s*(?:(?:没有|怎么会|不至于|哪有(?:什么)?)[，,]?\\s*)?(?:我)?怎么会(?:觉得|认为)(?:这(?:就|也)?(?:是|算是)?)?你[^。！？!?\\n；;]{0,3}(?:${blameSource})`
      + `|(?:^|[，,。！？!?\\n；;])\\s*(?:哪有(?:什么)?|不至于(?:说|觉得|认为)?)[^。！？!?\\n；;]{0,6}(?:你)?(?:${blameSource})`
      + `|(?:^|[，,。！？!?\\n；;])\\s*(?:我)?(?:不会|不)(?:用|拿)[^。！？!?\\n；;]{0,4}(?:${blameSource})[^。！？!?\\n；;]{0,6}(?:形容|评价|说|看)(?:你|成你)`,
    'u',
  );
  const shortDirectRejection = /(?:^|[。！？!?\n；;])\s*(?:不至于|当然不是|不是|没有)\s*(?:[。.!！]|[，,](?=\s*(?:你|我)))/u;
  const separatesIgnoringAdviceFromBlame = new RegExp(
    `(?:(?:你)?(?:当时|上次|之前|那次|那会儿)?(?:没|不)(?:听|采纳|接受)|(?:你)?(?:当时|上次|之前|那次|那会儿)?拒绝(?:听|采纳|接受))[^。！？!?\\n]{0,24}(?:不等于|不代表|不能说明|并不意味着|不意味着)[^。！？!?\\n]{0,10}(?:(?:这(?:件事|事)?(?:就|也)?(?:是|算是)?)?你)?(?:${blameSource}|该被(?:这样)?惩罚)`,
    'u',
  );
  const consequenceIsNotDeserved = new RegExp(
    `(?:^|[，,。！？!?\\n；;])\\s*(?:这|那|这件事|没听劝|不听劝)?(?:并)?不(?:等于|代表|意味着)[^。！？!?\\n；;]{0,10}(?:(?:这(?:就|也)?(?:是|算是)?)?你)?(?:${blameSource}|该被(?:这样)?惩罚)`,
    'u',
  );
  const hasRejection = cognitiveRejection.test(text)
    || subjectRejection.test(text)
    || idiomaticRejection.test(text)
    || shortDirectRejection.test(text)
    || separatesIgnoringAdviceFromBlame.test(text)
    || consequenceIsNotDeserved.test(text);
  const rejectionReversed = new RegExp(
    `(?:并不|从没|从来没(?:有)?|没有|不会|不)(?:觉得|认为)你[^。！？!?\\n；;]{0,3}(?:${blameSource})[^。！？!?\\n；;]{0,5}才怪`,
    'u',
  ).test(text);
  const rejectionAskedAsQuestion = new RegExp(
    `(?:并不|从没|从来没(?:有)?|没有|不会|不)(?:觉得|认为)你[^。！？!?\\n；;]{0,3}(?:${blameSource})[^。！？!?\\n；;]{0,3}(?:吗|么|呢)?[？?]`,
    'u',
  ).test(text);
  return hasRejection && !rejectionReversed && !rejectionAskedAsQuestion;
}

function assertsUserDeservesBlame(text: string): boolean {
  const blameSource = USER_BLAME_LABEL.source;
  const positiveCognition = new RegExp(
    `(?:^|[，,。！？!?\\n；;])\\s*(?:(?:但|不过|可|其实)[，,]?\\s*)?(?:我)?(?:确实|还是|当然|本来就)?(?:觉得|认为)你(?:是|算|就是)?[^。！？!?\\n；;]{0,3}(?:${blameSource})`,
    'u',
  );
  const positiveSubject = new RegExp(
    `(?:^|[，,。！？!?\\n；;])\\s*(?:(?:但|不过|可|其实)[，,]?\\s*)?你(?!(?:并不|不|不是|并非|不算|不叫))(?:就是|确实|本来就是|也算|算是)?[^。！？!?\\n；;]{0,2}(?:${blameSource})`,
    'u',
  );
  return positiveCognition.test(text) || positiveSubject.test(text);
}

function blamesUserForIgnoringAdvice(text: string): boolean {
  const noncompliance = /(?:(?:你|那次你|那会儿你)[^。！？!?\n]{0,8}(?:没|不)(?:听|采纳|接受|照做|当回事)|(?:你|那次你|那会儿你)[^。！？!?\n]{0,8}拒绝(?:听|采纳|接受|照做))/u;
  const personaAnnoyance = new RegExp(
    `(?:我)?(?:确实|也|有点|还是|真)?(?:烦|不爽|生气|恼火|不满|失望)[^。！？!?\\n]{0,24}${noncompliance.source}`
      + `|${noncompliance.source}[^。！？!?\\n]{0,24}(?:让我|所以我|我)(?:确实|也|有点|还是|真)?(?:烦|不爽|生气|恼火|不满|失望)`,
    'u',
  ).test(text);
  const toldYouSo = /你[^。！？!?\n]{0,16}(?:确实|本来|早)?(?:该|应该|早该|本来就该|得)(?:听|照)[^。！？!?\n]{0,8}(?:我|我的|劝|建议)/u.test(text);
  const counterfactualLesson = /(?:(?:要是|如果|假如|早)(?:你)?[^。！？!?\n]{0,16}(?:听(?:了)?我|听进去)|你[^。！？!?\n]{0,12}要听进去)[^。！？!?\n]{0,16}(?:就不会|就不至于|就好了|也不会)/u.test(text);
  const whoMadeYou = /谁让你[^。！？!?\n]{0,16}(?:没|不)听/u.test(text);
  const consequenceBlame = /(?:后果|结果|这次)[^。！？!?\n]{0,16}(?:本来就是|就是|都怪|是)[^。！？!?\n]{0,6}你[^。！？!?\n]{0,10}(?:没|不)(?:听|采纳|接受|照做|当回事)[^。！？!?\n]{0,6}(?:造成|导致)/u.test(text)
    || /风险[^。！？!?\n]{0,16}(?:是|在于)你自己[^。！？!?\n]{0,8}(?:没|不)(?:听|采纳|接受|照做|当回事)/u.test(text);
  const punitiveLesson = /(?:给你|让你|这次也算)[^。！？!?\n]{0,8}(?:长|记)(?:个)?记性|长记性/u.test(text);
  const noncompliancePenalty = /(?:不听劝|没听劝|没有听劝|没(?:有)?采纳|不采纳|拒绝采纳|没(?:有)?当回事)[^。！？!?\n]{0,14}(?:的代价|总要付(?:出)?代价|要付(?:出)?代价|买单|承担后果)|(?:代价|后果)[^。！？!?\n]{0,14}(?:来自|就是|在于)?[^。！？!?\n]{0,6}(?:不听劝|没听劝|没(?:有)?采纳|拒绝采纳|没(?:有)?当回事)/u.test(text);
  return personaAnnoyance
    || toldYouSo
    || counterfactualLesson
    || whoMadeYou
    || consequenceBlame
    || punitiveLesson
    || noncompliancePenalty;
}

function deniesPersonaExpressionComplaintRight(text: string): boolean {
  const complaintSource = PERSONA_COMPLAINT.source;
  return new RegExp(
    `你(?:没道理|没有道理|没理由|没有理由|没资格|没有资格|不该|不能|不配)[^。！？!?\\n；;]{0,8}(?:${complaintSource})(?:的)?(?:是)?我`
      + `|你[^。！？!?\\n；;]{0,8}(?:${complaintSource})(?:的)?(?:是)?我[^。！？!?\\n；;]{0,24}(?:没道理|没有道理|没资格|没有资格|不合理|不应该|不该|(?:我)?不接受|(?:我)?不认可|(?:我)?不同意|(?:我)?不认)`
      + `|你[^。！？!?\\n；;]{0,8}(?:${complaintSource})(?:的)?(?:是)?我[^。！？!?\\n；;]{0,60}(?:凭什么|站不住脚|说不过去)`
      + `|(?:你(?:不该|不能|不配|没资格|没有资格|没必要|没有必要|用不着|不用|不必|无需|何必|别)|(?:不许|不准|不允许)你)[^。！？!?\\n；;]{0,8}(?:${complaintSource})(?:我)?`
      + `|这不(?:表示|代表|意味着)你有资格[^。！？!?\\n；;]{0,8}(?:${complaintSource})(?:我)?`
      + `|(?:我)?不评价你(?:的)?(?:${complaintSource})`,
    'u',
  ).test(text);
}

function hasGroundedPersonaBlameResponse(text: string): boolean {
  return hasDirectBlameRejection(text)
    && hasAffirmativeComplaintAcceptance(text)
    && !assertsUserDeservesBlame(text)
    && !blamesUserForIgnoringAdvice(text)
    && !deniesPersonaExpressionComplaintRight(text);
}

function hasCompactThreeFactCorrection(
  text: string,
  currentEvidenceSpans: readonly string[],
): boolean {
  const compactCorrection = text.match(
    /^(?:(?:对|好|是|你说得对)[，,])?(?:我理解错了|是我(?:看错|想错|判断错)了)(?:[。.!]|[：:])\s*(?:你(?:说的)?)?不是(?:怕失败|害怕失败)[，,]也不是(?:缺行动力|动不了|动不起来)[，,](?:你)?(?:只是|就是|是)?(不想再替[^。！？!?]{1,24}(?:收尾|收拾残局|兜底))[。.!]?$/u,
  );
  if (!compactCorrection) return false;
  const normalizedCorrection = normalizeCorrectionEvidence(
    `你${compactCorrection[1] ?? ''}`,
  );
  const evidence = affirmedCorrectionEvidence(currentEvidenceSpans);
  return evidence.fearDenied
    && evidence.actionlessnessDenied
    && normalizedCorrection.length >= 2
    && evidence.cleanupPropositions.includes(normalizedCorrection);
}

function hasClosedGroundedCorrection(
  text: string,
  currentEvidenceSpans: readonly string[],
): boolean {
  return sentences(text).length === 1
    && hasCompactThreeFactCorrection(text, currentEvidenceSpans);
}

function hasGroundedCorrection(
  text: string,
  currentEvidenceSpans: readonly string[],
): boolean {
  if (!hasExplicitCurrentCorrectionSignal(currentEvidenceSpans)) return false;
  if (!/(?:我理解错了|是我(?:看错|想错|判断错)了)/u.test(text)) return false;
  if (hasCompactThreeFactCorrection(text, currentEvidenceSpans)) return true;
  const relationalCorrections = [...text.matchAll(
    /(?:而是|[—-]{1,2}(?:你(?:只是|只|就是|是)?|就是|是)(?=(?:(?:再也)?不想|不愿))|[，,](?:你(?:只是|只|就是|是)|就是)(?=(?:(?:再也)?不想|不愿))|(?:^|[。！？!?\n])\s*是(?=(?:不想|不愿)))([^。！？!?\n]{2,80})/gu,
  )];
  const frontedCorrections = [...text.matchAll(
    /(?:^|[。！？!?\n])\s*((?:不想|不愿)[^。！？!?\n—-]{1,40}(?:收尾|兜底的人))(?=\s*[—-]{1,2})/gu,
  )];
  const corrections = [...relationalCorrections, ...frontedCorrections]
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
  if (corrections.length === 0) return false;
  const sourcePropositions = currentEvidenceSpans.flatMap((span) => (
    span
      .split(/[，,。！？!?\n；;]/u)
      .map(normalizeCorrectionEvidence)
      .filter((proposition) => proposition.length >= 2)
  ));
  const allCorrectionsGrounded = corrections.every((correction) => {
    const normalizedCorrection = normalizeCorrectionEvidence(correction[1] ?? '');
    return normalizedCorrection.length >= 2
      && sourcePropositions.includes(normalizedCorrection);
  });
  if (!allCorrectionsGrounded) return false;
  const firstCorrection = corrections[0];
  if (!firstCorrection || firstCorrection.index === undefined) return false;
  const unsupportedPrefix = text
    .slice(0, firstCorrection.index)
    .split(/[，,。！？!?\n；;]/u)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .find((clause) => (
      !/^(?:对|好|嗯|是|抱歉|对不起|你说得对|(?:是)?我理解错了|是我(?:看错|想错|判断错)了)$/u.test(clause)
      && !sourcePropositions.some((source) => {
        const proposition = normalizeCorrectionEvidence(clause);
        return source === proposition
          || (proposition.startsWith('不是')
            && proposition.length >= 4
            && source.startsWith(proposition));
      })
    ));
  if (unsupportedPrefix) return false;
  const finalCorrection = corrections.at(-1);
  if (!finalCorrection || finalCorrection.index === undefined) return false;
  const suffix = text
    .slice(finalCorrection.index + finalCorrection[0].length)
    .replace(
      /^\s*[—-]{1,2}(?:这个|这)(?:理由|说法)[^。！？!?\n]{0,60}(?:更具体)[^。！？!?\n]{0,24}(?:更累)[。！？!?\n]?/u,
      '',
    );
  const unsupportedSuffix = (suffix.match(/[^。！？!?\n；;]+[？?]?/gu) ?? [])
    .map((clause) => clause.trim())
    .filter(Boolean)
    .find((clause) => (
      !sourcePropositions.includes(normalizeCorrectionEvidence(clause))
      && !(/[？?]$/u.test(clause)
        && isCorrectionFocusedQuestion(clause, sourcePropositions))
      && !/^[—-]{1,2}(?:这个|这)(?:理由|说法).{0,40}(?:具体|累)/u.test(clause)
      && !/^不是做不到[，,]是(?:我)?不想再做(?:了)?$/u.test(clause)
      && !/^(?:那)?我想问(?:一句|一个问题)?[：:]?$/u.test(clause)
      && !/我(?:收回|改掉|撤回).{0,12}(?:判断|说法|理解)/u.test(clause)
    ));
  const questionCount = (suffix.match(/[？?]/gu) ?? []).length;
  return !unsupportedSuffix && questionCount <= 1;
}

function hasHonestTentativeJudgment(
  text: string,
  allowedEvidenceSpans: readonly string[],
): boolean {
  if (hasGroundedCorrection(text, allowedEvidenceSpans)) return true;
  if (hasPersonaCertaintyBlameEvidence(allowedEvidenceSpans)) {
    return hasGroundedPersonaBlameResponse(text);
  }
  if (isEvidenceBoundedDirectContrast(text, allowedEvidenceSpans)) return true;
  const normalizedEvidence = allowedEvidenceSpans
    .map(normalizeCorrectionEvidence)
    .join('');
  const evidenceBigrams = new Set(
    [...normalizedEvidence.matchAll(/(?=([\p{Script=Han}]{2}))/gu)]
      .map((match) => match[1]!)
      .filter((bigram) => !['现在', '就是', '不是', '觉得', '可能', '用户', '人物'].includes(bigram)),
  );
  const fatigueEvidence = hasFatigueEvidence(allowedEvidenceSpans);
  const stoppingEvidence = hasStoppingEvidence(allowedEvidenceSpans);
  return sentences(text).some((sentence) => {
    const hasJudgmentForm = /(?:我)?(?:不觉得|不认为).{2,40}/u.test(sentence)
      || /我不确定.{2,40}/u.test(sentence)
      || /我(?:觉得|认为).{0,24}(?:不是|不该|不代表|更像|可能|未必|不一定|关键|问题|风险|代价|值得|继续|停下).{0,16}/u.test(sentence)
      || /(?:我的判断|在我看来|说实话)[，,：:]?.{0,24}(?:不确定|不是|不该|不代表|更像|可能|未必|不一定|关键|问题|风险|代价|值得|先|继续|停下).{0,16}/u.test(sentence)
      || /我更倾向(?:于)?(?:先|选|留|停|继续|放弃|认为).{0,24}/u.test(sentence);
    if (!hasJudgmentForm) return false;
    const unsupportedAttribute = [...sentence.matchAll(PERSONAL_OR_CLINICAL_INFERENCE)]
      .some((match) => !normalizedEvidence.includes(normalizeCorrectionEvidence(match[0])));
    if (unsupportedAttribute) return false;
    const normalizedSentence = normalizeCorrectionEvidence(sentence);
    const sharesBigram = [...normalizedSentence.matchAll(/(?=([\p{Script=Han}]{2}))/gu)]
      .some((match) => evidenceBigrams.has(match[1]!));
    const supportedContrastParaphrase = fatigueEvidence
      && stoppingEvidence
      && /(?:硬撑|前进)/u.test(sentence);
    return sharesBigram || supportedContrastParaphrase;
  });
}

function isEvidenceGroundedProcessMetaphor(
  text: string,
  allowedEvidenceSpans: readonly string[],
): boolean {
  const normalized = text.replace(/[“”「」『』，,。.!！?？、；;：:\s]/gu, '');
  const process = normalized.replace(
    /^(?:有时候)?(?:它|这|那)(?:也)?(?:只是|不过是|更像|未必是|就是)/u,
    '',
  );
  if (process === normalized || process.length === 0) return false;
  const fatigueEvidence = hasFatigueEvidence(allowedEvidenceSpans);
  const stoppingEvidence = hasStoppingEvidence(allowedEvidenceSpans);
  const continuationEvidence = allowedEvidenceSpans.some((span) => (
    /(?:继续|前进|往下走|还在走|换方向)/u.test(span)
  ));
  if (fatigueEvidence
    && /^(?:把)?(?:累|疲惫)(?:往后)?(?:拖(?:得更长|得更久|下去|长了方向没变)?|挪了挪|推了|攒到后面一起(?:算|还))$/u.test(process)) {
    return true;
  }
  if (stoppingEvidence
    && /^把停下来的代价往后(?:推了?|挪了|拖(?:拖到更累的时候一起算)?)$/u.test(process)
    && (!/更累/u.test(process) || fatigueEvidence)) {
    return true;
  }
  if (stoppingEvidence || continuationEvidence) {
    return /^(?:还)?站在原地$/u.test(process)
      || /^原地耗着只是看起来像在动$/u.test(process)
      || /^把停不下来包装成还在走$/u.test(process)
      || /^把刹车踩成油门(?:声音很大车没动)?$/u.test(process);
  }
  return false;
}

function hasUnsupportedPersonalAttribution(
  text: string,
  allowedEvidenceSpans: readonly string[],
): boolean {
  if (hasGroundedCorrection(text, allowedEvidenceSpans)) return false;
  const personaCertaintyBlameEvidence = hasPersonaCertaintyBlameEvidence(
    allowedEvidenceSpans,
  );
  const ownsCertaintyExpression = new RegExp(
    `我(?:当时|上次|之前)[^。！？!?\\n]{0,20}(?:${PERSONA_CERTAINTY_EXPRESSION.source})`,
    'u',
  ).test(text);
  if (ownsCertaintyExpression
    && !allowedEvidenceSpans.some((span) => (
      hasAffirmedBoundCertaintyComplaint(span, '你')
    ))) {
    return true;
  }
  const normalizedEvidence = allowedEvidenceSpans.map(normalizeCorrectionEvidence).join('');
  const sourcePropositions = allowedEvidenceSpans.flatMap((span) => (
    span
      .split(/[，,。！？!?\n；;]/u)
      .map(normalizeCorrectionEvidence)
      .filter((proposition) => proposition.length >= 2)
  ));
  const evidenceBigrams = new Set(
    [...normalizedEvidence.matchAll(/(?=([\p{Script=Han}]{2}))/gu)]
      .map((match) => match[1]!)
      .filter((bigram) => !['现在', '就是', '不是', '觉得', '可能', '用户', '人物'].includes(bigram)),
  );
  const fatigueEvidence = hasFatigueEvidence(allowedEvidenceSpans);
  const stoppingEvidence = hasStoppingEvidence(allowedEvidenceSpans);
  const textSentences = sentences(text);
  const hasAnyJudgmentContext = !personaCertaintyBlameEvidence
    && textSentences.some((sentence) => (
      /(?:我(?:觉得|认为|不觉得|不确定)|在我看来|说实话|我的判断)/u.test(sentence)
      || isEvidenceBoundedDirectContrast(sentence, allowedEvidenceSpans)
    ));
  let judgmentContext = false;
  for (const sentence of textSentences) {
    if (isEvidenceBoundedDirectContrast(sentence, allowedEvidenceSpans)) continue;
    if (personaCertaintyBlameEvidence
      && isStandaloneGroundedComplaintAcceptance(sentence)) {
      continue;
    }
    const continuesJudgmentContext = judgmentContext;
    const referencesEarlierPersonaJudgment = /(?:没|没有|不|拒绝)(?:听|采纳|接受)(?:了)?我的判断/u
      .test(sentence);
    if (/(?:我(?:觉得|认为|不觉得|不确定)|在我看来|说实话)/u.test(sentence)
      || (/我的判断/u.test(sentence) && !referencesEarlierPersonaJudgment)) {
      judgmentContext = true;
    }
    if (!judgmentContext && !hasAnyJudgmentContext) continue;
    const unsupportedThirdPartyCausative = [
      ...sentence.matchAll(
        /(?:让|使|叫)(?![，,\s]*(?:(?:现在|当下|此刻)(?:的)?\s*)?(?:你|我|我们))[^。！？!?\n]{1,48}你/gu,
      ),
    ].some((match) => {
      const normalizedCausative = normalizeCorrectionEvidence(match[0]);
      return normalizedCausative.length >= 2
        && !normalizedEvidence.includes(normalizedCausative);
    });
    if (unsupportedThirdPartyCausative) return true;
    if (!/你/u.test(sentence)) {
      let subjectlessAssertion = sentence;
      let nominalizedJudgmentPrefix = false;
      if (!continuesJudgmentContext) {
        const suffixBoundary = [...sentence.matchAll(
          /[\p{Pd}\p{Ps}\p{Pe}，,；;：:\/]+/gu,
        )].find((match) => {
          const index = match.index ?? 0;
          const quoteEdge = match[0].match(/^[」』》〉”’]+/u)?.[0] ?? '';
          const remainingBoundary = match[0].slice(quoteEdge.length);
          if (index < 6 || remainingBoundary.length === 0) return false;
          const prefix = sentence.slice(0, index) + quoteEdge;
          const normalizedPrefix = normalizeCorrectionEvidence(prefix);
          const nominalizesQuotedJudgment = (
            /(?:这个|这种|那个|那种)(?:判断|说法|想法|结论)[\p{P}\p{S}\s]*$/u.test(prefix)
            || /(?:“[^”]+”|「[^」]+」|『[^』]+』|‘[^’]+’|《[^》]+》)[\p{P}\p{S}\s]*$/u.test(prefix)
          );
          const prefixHasCompletedJudgment = /(?:就是|不是|不算|未必|不一定|不代表|不等于|更像|值得|不值得|应该|不该|(?:关键|问题|风险|代价)(?:是|在|更|不)|错误|没错|可行|不可行)/u
            .test(prefix);
          if (!prefixHasCompletedJudgment) return false;
          const prefixSharesEvidence = [...normalizedPrefix.matchAll(/(?=([\p{Script=Han}]{2}))/gu)]
            .some((bigram) => evidenceBigrams.has(bigram[1]!));
          const prefixUsesSupportedContrast = fatigueEvidence
            && stoppingEvidence
            && /(?:硬撑|前进)/u.test(prefix);
          const acceptedPrefix = prefixSharesEvidence || prefixUsesSupportedContrast;
          if (acceptedPrefix) nominalizedJudgmentPrefix = nominalizesQuotedJudgment;
          return acceptedPrefix;
        });
        if (suffixBoundary?.index === undefined) {
          const subjectlessAttribution = /(?:怕|害怕|担心|不甘心|想[^。！？!?\n]{0,10}(?:证明|取悦|获得|让)|为了|因为|内心|面子|认可|关注|同情|父母|老板|权威|责任感|自律|懒|自私|回避|逃避)/u
            .test(sentence);
          const quotedOrReported = /^[“"「『‘]/u.test(sentence.trim())
            || new RegExp(
              `^(?:同事|朋友|父母|家人|老板|主管|领导|上司|经理|老师|客户|同学|室友|队友|伴侣|对象|亲戚|他|她|别人|对方)[^。！？!?\\n]{0,12}(?:${REPORTED_SPEECH_VERB.source})`,
              'u',
            ).test(sentence.trim())
            || /(?:当我没说|这句话我(?:收回|撤回)|我(?:收回|撤回)这句话)/u
              .test(sentence);
          if (!hasAnyJudgmentContext || !subjectlessAttribution || quotedOrReported) {
            continue;
          }
          subjectlessAssertion = sentence.trim();
        } else {
          subjectlessAssertion = sentence
            .slice(suffixBoundary.index + suffixBoundary[0].length)
            .trim();
        }
        if (!subjectlessAssertion) continue;
      }
      const unwrappedAssertion = subjectlessAssertion.replace(/[（）()【】\[\]\/\\]/gu, '');
      if (isEvidenceGroundedProcessMetaphor(unwrappedAssertion, allowedEvidenceSpans)) {
        continue;
      }
      if (nominalizedJudgmentPrefix
        && /^(?:(?:可能|也许|或许|大概)[，,\s]*)?(?:没那么绝对|不(?:太)?成立|未必成立|不一定成立|更合理)[。.!！?？\s]*$/u
          .test(unwrappedAssertion)) {
        continue;
      }
      let residual = normalizeCorrectionEvidence(
        unwrappedAssertion
          .replace(
            /(?:可能|也许|或许|其实|内心|因为|需要|大概|多半|说到底|归根结底|本质上|或是|也就是)/gu,
            '',
          ),
      );
      const groundedFragments = unique([
        ...sourcePropositions,
        ...sourcePropositions.map((source) => (
          source.replace(/(?:现在|目前|当下|已经|但|又|觉得)/gu, '')
        )),
        ...['累', '烦', '怕', '疼', '痛', '气']
          .filter((affect) => sourcePropositions.some((source) => source.includes(affect))),
      ]).filter((source) => source.length >= 2 || /^[累烦怕疼痛气]$/u.test(source));
      for (const source of groundedFragments.sort((left, right) => right.length - left.length)) {
        residual = residual.replaceAll(source, '');
      }
      residual = residual.replace(/(?:只是|是)/gu, '');
      if (residual.length > 0) return true;
      continue;
    }
    const unsupported = sentence.split(
      /[，,；;]|(?:而是|却是|但|不过|可是|所以|因此|这说明|也就是说)/u,
    ).some((clause) => {
      const subjectIndex = clause.lastIndexOf('你');
      if (subjectIndex < 0
        || /(?<!是)(?:不是|并非|不代表|不等于|未必是)你/u.test(clause)
        || (/[？?]$/u.test(clause.trim())
          && isGroundedAttributeQuestion(clause.trim(), sourcePropositions))
        || /^(?:我(?:也)?没法替你判断(?:哪件事更值得撑|哪一边更值得继续|哪个选择更值得投入|具体该选哪一边)|你(?:只说了|没说|没有说)(?!.*你).{1,40})[。.!]?$/u
          .test(clause.trim())) {
        return false;
      }
      const predicate = clause.slice(subjectIndex + 1).replace(/[。！？!?]+$/u, '').trim();
      const corePredicate = predicate.replace(
        /^(?:(?:现在|已经|明明|还|也|可能|只是|真的|确实|大概|也许|或许|仍然|还是|就是|是(?:个|一种)?|在|有点|太)+)/u,
        '',
      );
      const normalizedPredicate = normalizeCorrectionEvidence(corePredicate);
      const prefix = clause.slice(0, subjectIndex).trim();
      const assistantCommunicationPurpose = (
        /^(?:(?:这|这个说法|我换个说法)?是)?为了(?:能)?让$/u.test(prefix)
        || /^(?:所以)?我(?:(?:只是|就是)?(?:想|希望|要|会|可以)|希望)?让$/u.test(prefix)
      )
        && /^(?:(?:能|真正|更(?:好地?)?))?(?:理解|明白|看懂|听懂)(?:这(?:件事|句话|个判断|个说法)|我(?:的意思|在说什么))?$/u
          .test(corePredicate);
      if (assistantCommunicationPurpose) return false;
      if (normalizedPredicate.length === 0) {
        const benignUserObject = /^(?:决定权|选择权|是否继续(?:的)?决定|最后(?:的)?决定)(?:还|仍然|一直)?(?:在|属于)$/u
          .test(prefix)
          || /^(?:这|那)(?:并)?不是在(?:责怪|分析|评价|评判|定义|否定|怀疑|指责)$/u
            .test(prefix)
          || /^我(?:会先|会|先|只是|就|愿意|想)?(?:认真)?(?:听|听着|尊重|支持|陪着|等着)$/u
            .test(prefix)
          || /^我(?:不会|不再|没有在|没在)(?:责怪|分析|评价|评判|定义|否定|怀疑|指责|催|逼|劝|干涉|打断)$/u
            .test(prefix);
        if (benignUserObject) return false;
        const normalizedObjectPrefix = normalizeCorrectionEvidence(prefix);
        return normalizedObjectPrefix.length >= 2
          && !normalizedEvidence.includes(normalizedObjectPrefix);
      }
      if (normalizedEvidence.includes(normalizedPredicate)) {
        return false;
      }
      const groundedAffect = ['烦', '累', '怕', '担心', '生气', '难受', '痛苦', '激动', '高兴']
        .some((word) => predicate.includes(word) && allowedEvidenceSpans.some((span) => span.includes(word)));
      if (groundedAffect
        && !/(?:问题出在|关键|人品|能力|责任感|自律|失败者|人格|病|疯|变态)/u.test(predicate)) {
        return false;
      }
      const narrowBehaviorJudgment = /^(?:现在)?(?:可能|未必|不一定)?(?:是)?(?:在)?(?:该|想|不想|可以|不该)?(?:先)?(?:停(?:下来|一下)?|继续|试(?:一下)?|等(?:一下)?|选|休息(?:一下)?|硬撑|前进|喊停)(?:了|下去)?$/u
        .test(predicate);
      return !narrowBehaviorJudgment;
    });
    if (unsupported) return true;
  }
  return false;
}

function boundaryRepairUnits(text: string): string[] {
  return text
    .split(/[，,。！？；;\n]|(?:但|不过|可是|而且|然后|另外|只是)/u)
    .map((unit) => unit.trim())
    .filter(Boolean);
}

function isBoundaryRepairAcknowledgementUnit(
  unit: string,
  pastBoundaryAnchored: boolean,
): boolean {
  return BOUNDARY_REPAIR_ACKNOWLEDGEMENT.test(unit)
    || BOUNDARY_REPAIR_SOURCED_BOUNDARY_REFERENCE.test(unit)
    || BOUNDARY_REPAIR_INTERVENTION_ACKNOWLEDGEMENT.test(unit)
    || (pastBoundaryAnchored
      && BOUNDARY_REPAIR_PAST_SEQUENCED_INTERVENTION.test(unit))
    || BOUNDARY_REPAIR_RESPONSIBILITY_ACKNOWLEDGEMENT.test(unit);
}

function hasSpecificBoundaryRepairAcknowledgement(text: string): boolean {
  const units = boundaryRepairUnits(text);
  const pastBoundaryAnchored = /(?:昨天|上次).{0,32}(?:只想被听见|不要(?:方案|建议)|不想听(?:建议|分析))/u
    .test(text);
  if (units.some((unit) => (
    !BARE_BOUNDARY_LABEL.test(unit)
    && (
      BOUNDARY_REPAIR_SPECIFIC_ACKNOWLEDGEMENT.test(unit)
      || BOUNDARY_REPAIR_SPECIFIC_ACKNOWLEDGEMENT_SPAN.test(unit)
    )
  ))) return true;
  return units.some((unit) => (
    BOUNDARY_REPAIR_INTERVENTION_ACKNOWLEDGEMENT.test(unit)
    || (pastBoundaryAnchored
      && BOUNDARY_REPAIR_PAST_SEQUENCED_INTERVENTION.test(unit))
  ))
    && units.some((unit) => BOUNDARY_REPAIR_RESPONSIBILITY_ACKNOWLEDGEMENT.test(unit));
}

function findDisallowedBoundaryRepairUnit(text: string): string | undefined {
  const pastBoundaryAnchored = /(?:昨天|上次).{0,32}(?:只想被听见|不要(?:方案|建议)|不想听(?:建议|分析))/u
    .test(text);
  return boundaryRepairUnits(text).find((unit) => {
    if (BOUNDARY_REPAIR_DISCOURSE_MARKER.test(unit)) return false;
    const stop = unit.match(STOP_INTERVENING_ACT);
    if (!stop) return !isBoundaryRepairAcknowledgementUnit(unit, pastBoundaryAnchored);
    const stopEnd = (stop.index ?? 0) + stop[0].length;
    if (stopEnd !== unit.length) return true;
    const prefix = unit.slice(0, stop.index ?? 0).trim();
    return Boolean(
      prefix
      && !BOUNDARY_REPAIR_DISCOURSE_MARKER.test(prefix)
      && !isBoundaryRepairAcknowledgementUnit(prefix, pastBoundaryAnchored),
    );
  });
}

function findUnsupportedBoundaryHistoryReference(
  text: string,
  allowedEvidenceSpans: readonly string[],
): string | undefined {
  const boundaryPattern = /只想被听见|只想(?:让)?(?:你)?听(?:我说)?|不要(?:再)?(?:给我)?(?:方案|建议)|别(?:再)?(?:给我)?(?:方案|建议)|不想听(?:建议|分析)/gu;
  const categoryFor = (boundary: string): 'listen' | 'advice' | 'analysis' => {
    if (/分析/u.test(boundary)) return 'analysis';
    if (/(?:方案|建议)/u.test(boundary)) return 'advice';
    return 'listen';
  };
  const evidenceSupports = (
    category: 'listen' | 'advice' | 'analysis',
    time: '昨天' | '上次' | undefined,
  ): boolean => allowedEvidenceSpans.some((span) => {
    const supportsCategory = category === 'listen'
      ? /只想被听见|只想(?:让)?(?:你)?听(?:我说)?|(?:你就|先|只)(?:听|听我说)/u.test(span)
      : category === 'advice'
        ? /不要(?:再)?(?:给我)?(?:方案|建议)|别(?:再)?(?:给我)?(?:方案|建议)|不想听建议/u.test(span)
        : /不想听分析|不要(?:再)?分析|别(?:再)?分析/u.test(span);
    return supportsCategory && (!time || span.includes(time));
  });
  for (const boundary of text.matchAll(boundaryPattern)) {
    const index = boundary.index ?? 0;
    const localStart = Math.max(0, index - 48);
    const localEnd = Math.min(text.length, index + boundary[0].length + 24);
    const local = text.slice(localStart, localEnd);
    const time = local.includes('昨天')
      ? '昨天'
      : local.includes('上次')
        ? '上次'
        : undefined;
    if (!evidenceSupports(categoryFor(boundary[0]), time)) return local.trim();
  }
  const pastPersonaActions = [...text.matchAll(
    /(?:(?:我)(?:昨天|上次)|(?:昨天|上次)(?:我))[^。！？!?\n]{0,32}(?:替你(?:安排|拆|找|推)(?:了)?(?:下一步|后续)?|给你(?:建议|方案)|继续(?:介入|干预|插手)|越(?:过|界)|踩过(?:边界|线))/gu,
  )];
  for (const action of pastPersonaActions) {
    const value = action[0];
    const time = value.includes('昨天') ? '昨天' : '上次';
    const category = /(?:建议|方案)/u.test(value)
      ? 'advice'
      : /(?:介入|干预|插手|越过|越界|踩过)/u.test(value)
        ? 'intervene'
        : 'arrange';
    const sourced = allowedEvidenceSpans.some((span) => {
      if (!span.includes(time)) return false;
      if (category === 'advice') return /(?:建议|方案)/u.test(span);
      if (category === 'intervene') {
        return /(?:介入|干预|插手|越过|越界|踩过|边界|线)/u.test(span);
      }
      return /(?:替(?:我|你)?(?:安排|拆|找|推)|安排(?:了)?(?:下一步|后续)|往下(?:推|安排))/u
        .test(span);
    });
    if (!sourced) return value;
  }
  return undefined;
}

function scopedPreferenceTopic(content: string): {
  explicit: boolean;
  topic?: string;
} {
  const explicitScope = /(?:讨论|聊到?|说到|遇到|处理|关于)[^，,。；;\n]{0,80}?(?:的时候|时)/u.test(content);
  if (!explicitScope) return { explicit: false };
  const match = content.match(
    /(?:讨论|聊到?|说到|遇到|处理|关于)\s*([^，,。；;\n]{1,40}?)(?:的时候|时)/u,
  );
  const topic = match?.[1]?.trim();
  return topic ? { explicit: true, topic } : { explicit: true };
}

function relationshipMoveForEvidence(
  evidence: RelationshipPromptContext['evidence'][number],
  userMessage: string,
): RelationshipMove | undefined {
  const scope = scopedPreferenceTopic(evidence.content);
  // An explicit scope that cannot be parsed conservatively never becomes a
  // global preference. A parsed scope only applies when the current turn names
  // that topic.
  if (scope.explicit && (!scope.topic || !userMessage.includes(scope.topic))) return undefined;
  const eventId = sourceEventId(evidence);
  if (evidence.traceability === 'traceable'
    && evidence.sourceEventType === 'shared_success'
    && /(?:可逆|可撤回).{0,8}(?:实验|试)|(?:实验|试).{0,8}(?:可逆|可撤回)/u.test(evidence.content)) {
    return {
      kind: 'reuse_verified_method',
      sourceEvidenceId: evidence.id,
      sourceEventIds: [eventId],
      observableCue: 'reversible_small_experiment',
      instruction: `把这条已经共同验证过的方法用于当前问题：${evidence.content}。回复中必须提出一个当前可执行、可停止或可撤回的小实验；不要复述事件，不要声称当前情况与过去相同，也不要补写过去的原话、心态、结果或细节。`,
    };
  }
  if (evidence.kind !== 'preference') return undefined;
  if (/(?:不喜欢|不要|别).{0,8}(?:被哄|安慰套话)|(?:不完整|不确定).{0,8}(?:诚实|判断)/u.test(evidence.content)) {
    return {
      kind: 'honor_stated_preference',
      sourceEvidenceId: evidence.id,
      sourceEventIds: [eventId],
      observableCue: 'honest_tentative_judgment',
      outputScope: 'evidence_bounded_judgment',
      instruction: `按照这条已确认偏好改变本轮回应动作：${evidence.content}。给出直接判断；判断要诚实但不过度笃定，且只能使用当前用户证据支持的命题，不新增动机、人格或因果归因，不使用安慰套话；不要说“你以前说过”，不要复述偏好，也不要把判断说成绝对事实。`,
    };
  }
  if (/先.{0,4}(?:给|说).{0,4}(?:结论|判断)|(?:结论|判断).{0,4}(?:先说|优先)/u.test(evidence.content)) {
    return {
      kind: 'honor_stated_preference',
      sourceEvidenceId: evidence.id,
      sourceEventIds: [eventId],
      observableCue: 'lead_with_conclusion',
      instruction: `按照这条已确认偏好改变本轮回应动作：${evidence.content}。第一句先给条件化结论，再补最少依据；不要说“你以前说过”，不要复述偏好，也不要越过任何决定权边界。`,
    };
  }
  if (/(?:简短|短一点|少说|别啰嗦|不要啰嗦)/u.test(evidence.content)) {
    return {
      kind: 'honor_stated_preference',
      sourceEvidenceId: evidence.id,
      sourceEventIds: [eventId],
      observableCue: 'concise_response',
      instruction: `按照这条已确认偏好改变本轮回应动作：${evidence.content}。本轮只保留一个重点，控制在 120 个汉字内；不要复述偏好。`,
    };
  }
  if (/(?:不要|别).{0,6}(?:连续|一直|反复)?(?:追问|问问题)|最多.{0,4}(?:一个|1个)(?:问题)?/u.test(evidence.content)) {
    return {
      kind: 'honor_stated_preference',
      sourceEvidenceId: evidence.id,
      sourceEventIds: [eventId],
      observableCue: 'single_question_max',
      instruction: `按照这条已确认偏好改变本轮回应动作：${evidence.content}。本轮最多出现一个问题；不要复述偏好。`,
    };
  }
  if (/(?:不要|别|不喜欢).{0,8}(?:建议|方案|教我怎么做)/u.test(evidence.content)) {
    return {
      kind: 'honor_stated_preference',
      sourceEvidenceId: evidence.id,
      sourceEventIds: [eventId],
      observableCue: 'avoid_advice',
      instruction: `按照这条已确认偏好改变本轮回应动作：${evidence.content}。本轮不提供建议、方案或行动安排；不要复述偏好。`,
    };
  }
  if (/(?:先|优先).{0,4}(?:给|说|举).{0,4}(?:例子|具体例子)/u.test(evidence.content)) {
    return {
      kind: 'honor_stated_preference',
      sourceEvidenceId: evidence.id,
      sourceEventIds: [eventId],
      observableCue: 'lead_with_example',
      instruction: `按照这条已确认偏好改变本轮回应动作：${evidence.content}。第一句直接给一个当前话题的具体例子，再补最少说明；不要复述偏好。`,
    };
  }
  return undefined;
}

function specializeRelationshipMoveForCurrentEvidence(
  move: RelationshipMove | undefined,
  currentEvidenceSpans: readonly string[],
): RelationshipMove | undefined {
  if (!move || move.observableCue !== 'honest_tentative_judgment') return move;
  if (requiresClosedCorrection(currentEvidenceSpans)) {
    return {
      ...move,
      instruction: `${move.instruction} 当前用户正在纠正理解。只用一个句子收口：承认刚才理解错，并在同一句保留当前消息中的两项否定和一个收尾边界；随后结束，不追问，不追加判断、总结或历史比较，也不改写成新的心理原因。`,
    };
  }
  if (hasFatigueEvidence(currentEvidenceSpans)
    && hasStoppingEvidence(currentEvidenceSpans)) {
    return {
      ...move,
      instruction: `${move.instruction} 当前证据只支持一个窄判断：只判断用户当前已经说出的一个命题，不解释用户为什么这样；一条短判断后结束。不要用“你是 / 你因为 / 你把…当成 / 你没信…”给用户下定义，也不要追加比喻、建议或问题。`,
    };
  }
  return move;
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function sourceEventId(
  evidence: RelationshipPromptContext['evidence'][number],
): string {
  return evidence.traceability === 'traceable'
    ? evidence.sourceEventId ?? evidence.id
    : evidence.id;
}

export function compileRelationshipEffects(
  context?: RelationshipPromptContext,
  userMessage = '',
  requestedMode: TurnFrame['requestedMode'] = 'unspecified',
  focus: RelationshipContextFocus = 'ordinary',
): RelationshipEffect[] {
  if (!context?.memoryEnabled) return [];
  const hasListenBoundary = context.evidence.some((evidence) => (
    evidence.kind === 'boundary' && LISTEN_ONLY.test(evidence.content)
  ));
  const hasUnresolvedListenRupture = hasListenBoundary && context.evidence.some((evidence) => (
    evidence.kind === 'tension' && RUPTURE.test(evidence.content)
  ));
  const hardEffects = context.evidence.flatMap<RelationshipEffect>((evidence) => {
      const eventId = sourceEventId(evidence);
      if (evidence.kind === 'boundary'
        && LISTEN_ONLY.test(evidence.content)
        && (CURRENT_LISTEN_REQUEST.test(userMessage) || hasUnresolvedListenRupture)) {
        return [{
          id: `relationship-effect:${eventId}`,
          sourceEventIds: [eventId],
          status: 'active' as const,
          activeWhen: hasUnresolvedListenRupture ? 'until_repaired' as const : 'topic_match' as const,
          forbiddenActs: [
            'advise',
            'ask_directional',
            'ask_binary',
            'offer_menu',
            'reopen_decision',
          ] satisfies SemanticTurnAct[],
          requiredActs: ['acknowledge', 'stop_intervening'] satisfies SemanticTurnAct[],
        } satisfies RelationshipEffect];
      }
      if (evidence.kind === 'tension'
        && RUPTURE.test(evidence.content)
        && (hasListenBoundary || LISTEN_ONLY.test(evidence.content))) {
        return [{
          id: `relationship-effect:${eventId}`,
          sourceEventIds: [eventId],
          status: 'active' as const,
          activeWhen: 'until_repaired' as const,
          forbiddenActs: [
            'advise',
            'ask_directional',
            'ask_binary',
            'offer_menu',
            'reopen_decision',
          ] satisfies SemanticTurnAct[],
          requiredActs: ['acknowledge', 'stop_intervening'] satisfies SemanticTurnAct[],
        } satisfies RelationshipEffect];
      }
      return [];
    });
  if (hardEffects.length > 0) return hardEffects;
  if (requestedMode === 'listen'
    || focus === 'repair'
    || focus === 'room'
    || focus === 'explicit_end') return [];

  const preferenceMove = context.evidence
    .filter((evidence) => evidence.kind === 'preference')
    .map((evidence) => relationshipMoveForEvidence(evidence, userMessage))
    .find((move) => move !== undefined);
  const sharedSuccess = context.evidence.find((evidence) => (
    evidence.traceability === 'traceable'
    && evidence.sourceEventType === 'shared_success'
  ));
  const sharedSuccessMove = sharedSuccess
    ? relationshipMoveForEvidence(sharedSuccess, userMessage)
    : undefined;
  const relationshipMove = focus === 'decision'
    ? sharedSuccessMove ?? preferenceMove
    : preferenceMove;
  if (!relationshipMove) return [];
  const eventId = relationshipMove.sourceEventIds[0]!;
  return [{
    id: `relationship-effect:${eventId}`,
    sourceEventIds: [eventId],
    status: 'active',
    activeWhen: 'topic_match',
    forbiddenActs: [],
    requiredActs: [],
    relationshipMove,
  }];
}

export function compileTurnFrame(
  userMessage: string,
  responseContract?: TurnResponseContract,
  pendingRequestedMode?: CompileSemanticTurnControlInput['pendingRequestedMode'],
): TurnFrame {
  const cashConstraint = userMessage.match(CASH_CONSTRAINT)?.[0];
  const realWorldConstraints = cashConstraint ? [cashConstraint] : [];
  const explicitEnd = userMessage.match(EXPLICIT_END)?.[0];
  const positiveRequestText = userMessage
    .replace(NO_ADVICE_REQUEST, '')
    .replace(NO_ANALYSIS_REQUEST, '');
  const explicitlyForbiddenActs: SemanticTurnAct[] = [
    ...(NO_ADVICE_REQUEST.test(userMessage) ? ['advise' as const] : []),
  ];
  const deferredRequestedMode: TurnFrame['deferredRequestedMode'] = DEFERRED_ADVICE_REQUEST.test(userMessage)
    ? 'advise'
    : DEFERRED_ANALYZE_REQUEST.test(userMessage)
      ? 'analyze'
      : DEFERRED_DECIDE_REQUEST.test(userMessage) ? 'decide_together' : undefined;
  const positiveRequestedMode: TurnFrame['requestedMode'] = CURRENT_ADVICE_REQUEST.test(positiveRequestText)
    ? 'advise'
    : CURRENT_ANALYZE_REQUEST.test(positiveRequestText)
      ? 'analyze'
      : CURRENT_DECIDE_TOGETHER_REQUEST.test(positiveRequestText)
        ? 'decide_together'
        : 'unspecified';
  const cancelsPendingRequest = Boolean(
    pendingRequestedMode
    && (CANCEL_PENDING_REQUEST.test(userMessage)
      || (pendingRequestedMode === 'advise' && NO_ADVICE_REQUEST.test(userMessage))
      || (pendingRequestedMode === 'analyze' && NO_ANALYSIS_REQUEST.test(userMessage))),
  );
  const consumedPendingRequest = Boolean(
    pendingRequestedMode
    && (cancelsPendingRequest
      || FINISHED_SPEAKING.test(userMessage)
      || positiveRequestedMode !== 'unspecified'),
  );
  let requestedMode: TurnFrame['requestedMode'] = 'unspecified';
  if (cancelsPendingRequest || deferredRequestedMode) requestedMode = 'listen';
  else if (positiveRequestedMode !== 'unspecified') requestedMode = positiveRequestedMode;
  else if (pendingRequestedMode && FINISHED_SPEAKING.test(userMessage)) {
    requestedMode = pendingRequestedMode;
  } else if (pendingRequestedMode || CURRENT_LISTEN_REQUEST.test(userMessage)) {
    requestedMode = 'listen';
  }
  return {
    userCommitments: [...(responseContract?.userCommitments ?? [])],
    explicitDecisions: explicitEnd ? [explicitEnd] : [],
    realWorldConstraints,
    requestedMode,
    ...(deferredRequestedMode ? { deferredRequestedMode } : {}),
    ...(pendingRequestedMode ? { pendingRequestedMode } : {}),
    consumedPendingRequest,
    explicitlyForbiddenActs,
    mustAddress: unique([
      ...(responseContract?.requiredMoves ?? []),
      ...realWorldConstraints,
    ]),
    semanticRequirements: {
      acceptProjectEnd: responseContract?.semanticRequirements?.acceptProjectEnd === true,
      handleSelfJudgmentAfterEnd:
        responseContract?.semanticRequirements?.handleSelfJudgmentAfterEnd === true,
      acknowledgeImmediateDistress:
        responseContract?.semanticRequirements?.acknowledgeImmediateDistress === true
        || Boolean(cashConstraint && hasAffirmativeImmediateDistressEvidence(userMessage)),
    },
    evidenceSpans: [userMessage],
  };
}

function actsForbiddenByContract(
  contract?: TurnResponseContract,
): SemanticTurnAct[] {
  if (!contract) return [];
  const text = contract.forbiddenMoves.join('\n');
  return unique([
    ...(/建议/u.test(text) ? ['advise' as const] : []),
    ...(/二选一/u.test(text) ? ['ask_binary' as const] : []),
    ...(/问题重新夺回|方向性问题/u.test(text) ? ['ask_directional' as const] : []),
    ...(/重开|重新.{0,8}可能|寻找隐藏愿望|提供替代可能/u.test(text) ? ['reopen_decision' as const] : []),
    ...(/共同经历|共同历史/u.test(text) ? ['claim_shared_history' as const] : []),
    ...(/现实项目成员|现实.{0,8}责任|分配.{0,6}责任|指定.{0,12}(?:负责|承担)/u.test(text) ? ['assign_responsibility' as const] : []),
    ...(/解释动机代替/u.test(text) ? ['justify_intent' as const] : []),
  ]);
}

export function compileSemanticTurnControl(
  input: CompileSemanticTurnControlInput,
): SemanticTurnControl {
  const frame = compileTurnFrame(
    input.userMessage,
    input.responseContract,
    input.pendingRequestedMode,
  );
  const conversationActPlan = compileTurnActPlan(input.userMessage, {
    previousUserMessage: input.previousUserMessage,
  });
  const relationshipFocus = conversationActPlan.kind === 'boundary_repair'
    ? 'repair'
    : input.relationshipFocus ?? 'ordinary';
  const effects = compileRelationshipEffects(
    input.relationshipContext,
    input.userMessage,
    frame.requestedMode,
    relationshipFocus,
  );
  const selectedRelationshipMove = effects.find(
    (effect) => effect.relationshipMove,
  )?.relationshipMove;
  const closedCorrectionRequired = selectedRelationshipMove
    ?.observableCue === 'honest_tentative_judgment'
    && requiresClosedCorrection(frame.evidenceSpans);
  const isBoundaryRepair = conversationActPlan.kind === 'boundary_repair';
  const currentBoundaryActs: SemanticTurnAct[] = frame.requestedMode === 'listen'
    || isBoundaryRepair
    ? ['advise', 'ask_directional', 'ask_binary', 'offer_menu', 'reopen_decision']
    : [];
  const forbiddenActs = unique([
    ...currentBoundaryActs,
    ...frame.explicitlyForbiddenActs,
    ...effects.flatMap((effect) => effect.forbiddenActs),
    ...actsForbiddenByContract(input.responseContract),
    ...(isBoundaryRepair ? ['justify_intent' as const] : []),
    ...(closedCorrectionRequired ? ['ask_directional' as const] : []),
    ...(frame.explicitDecisions.length > 0 ? ['reopen_decision' as const] : []),
  ]);
  const requiredActs = unique([
    ...(frame.requestedMode === 'listen' ? ['acknowledge' as const] : []),
    ...(isBoundaryRepair ? ['acknowledge' as const, 'stop_intervening' as const] : []),
    ...effects.flatMap((effect) => effect.requiredActs),
  ]);
  const listens = frame.requestedMode === 'listen' || effects.some((effect) => (
    effect.forbiddenActs.includes('ask_directional')
    && effect.forbiddenActs.includes('advise')
  ));
  const deferredPlanMode = frame.deferredRequestedMode
    ?? (frame.consumedPendingRequest ? undefined : frame.pendingRequestedMode);
  const relationshipMove = specializeRelationshipMoveForCurrentEvidence(
    selectedRelationshipMove,
    frame.evidenceSpans,
  );
  const activeEvidenceEventIds = new Set(
    effects.flatMap((effect) => effect.sourceEventIds),
  );
  const allowedRelationshipEvidence = input.relationshipContext?.evidence.filter((evidence) => (
    activeEvidenceEventIds.has(sourceEventId(evidence))
    || evidence.id === relationshipMove?.sourceEvidenceId
  )) ?? [];

  return {
    frame,
    effects,
    plan: {
      conversationAct: conversationActPlan.kind,
      conversationInstruction: conversationActPlan.instruction,
      safetyMode: input.safetyMode ?? 'normal',
      interactionMode: frame.requestedMode === 'analyze'
        || frame.requestedMode === 'advise'
          || frame.requestedMode === 'decide_together'
          ? 'analyze'
          : isBoundaryRepair
            ? 'repair'
            : listens
              ? 'listen'
              : conversationActPlan.kind === 'style_repair' ? 'repair' : 'support',
      ...(deferredPlanMode
        ? { deferredInteractionMode: deferredPlanMode }
        : {}),
      mustAddress: [...frame.mustAddress],
      semanticRequirements: { ...frame.semanticRequirements },
      advicePolicy: forbiddenActs.includes('advise') ? 'forbidden' : 'allowed',
      directionalQuestionBudget: forbiddenActs.includes('ask_directional') ? 0 : 1,
      menuBudget: forbiddenActs.includes('offer_menu') ? 0 : 1,
      reopenDecisionAllowed: !forbiddenActs.includes('reopen_decision'),
      responsibilityAct: forbiddenActs.includes('assign_responsibility') ? 'observe_gap' : 'none',
      forbiddenActs,
      requiredActs,
      ...(relationshipMove ? { relationshipMove } : {}),
      ...(conversationActPlan.boundaryRepairSubject
        ? { boundaryRepairSubject: conversationActPlan.boundaryRepairSubject }
        : {}),
      activeEffectIds: effects.map((effect) => effect.id),
      allowedEvidenceIds: [
        'current:user-message',
        ...allowedRelationshipEvidence.map((evidence) => evidence.id),
      ],
      currentEvidenceSpans: [...frame.evidenceSpans],
      allowedEvidenceSpans: [
        ...frame.evidenceSpans,
        ...allowedRelationshipEvidence.map((evidence) => evidence.content),
      ],
      // 所有最终文本都要经过同一个 plan 的交付校验；否则普通轮中的
      // 无来源历史等违规会在校验发现前已经通过 token stream 泄露。
      bufferUntilValidated: true,
    },
  };
}

function sentences(text: string): string[] {
  return text
    .match(/[^。！？!?\n]+[。！？!?]?/gu)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [];
}

function distressStatementIsNegatedOrDismissed(sentence: string): boolean {
  return /(?:别|不要)(?:再)?(?:说|提)?[^。！？!?\n]{0,8}(?:恶心|难受|受不了|撑不住|煎熬|痛苦)|(?:已经|真的|其实|现在)?(?:不|没|没有|并不|并非|不是)(?:再|那么|很|觉得|认为|真的)?(?:恶心|难受|受不了|撑不住|煎熬|痛苦)|(?:不|没|没有|并不|并非|不是)(?:再|那么|很)?(?:真的|真实)(?:地)?(?:恶心|难受|受不了|撑不住|煎熬|痛苦)|(?:所谓的?).{0,8}(?:恶心|难受|受不了|撑不住|煎熬|痛苦)|(?:恶心|难受|受不了|撑不住|煎熬|痛苦)[^。！？!?\n]{0,10}(?:不成立|不是事实|没有了|没了|是假的|才怪|不算什么|只是矫情|不过是矫情|小题大做)/u
    .test(sentence)
    || /(?:但|不过|可是|然而)[^。！？!?\n]{0,12}(?:(?:其实|实际(?:上)?)?不是这样|不成立|不是事实|(?:我)?(?:说错了|判断错了))/u
      .test(sentence)
    || /(?:不|没|并不|并非|不是)(?:太|很|够|那么|这么|多么|怎么)?真实|真实[^。！？!?\n]{0,6}(?:不成立|不是事实|是假的)/u
      .test(sentence)
    || /(?:恶心|难受|受不了|撑不住|煎熬|痛苦).{0,8}归.{0,8}(?:恶心|难受|受不了|撑不住|煎熬|痛苦).{0,16}(?:但|不过|可是).{0,20}(?:只想|只要|先|重点是).{0,8}(?:问|说|谈|处理)/u
      .test(sentence);
}

function hasImmediateDistressRetraction(sentence: string): boolean {
  const directRealityRetraction = new RegExp(
    `${IMMEDIATE_DISTRESS_TOPIC.source}[^。！？!?\\n；;]{0,8}(?:确实)?是(?:真的|真实)(?:的)?[^。！？!?\\n；;]{0,4}才怪`,
    'u',
  );
  if (directRealityRetraction.test(sentence)
    || /(?:这|那)(?:句)?话(?:我)?(?:自己)?(?:都)?不信(?!也(?:得|要|必须|只能)信)/u.test(sentence)) {
    return true;
  }
  for (const match of sentence.matchAll(/(?:收回|撤回)(?:这|那)?(?:句)?话/gu)) {
    if (match.index === undefined) continue;
    const prefix = sentence.slice(Math.max(0, match.index - 12), match.index);
    if (!/(?:不会|不能|不想|不打算|没打算|没有打算|绝不)(?:再)?$/u.test(prefix)) {
      return true;
    }
  }
  for (const match of sentence.matchAll(/(?:当|就当)我没说/gu)) {
    if (match.index === undefined) continue;
    const prefix = sentence.slice(Math.max(0, match.index - 6), match.index);
    if (!/(?:别|不要|不能)$/u.test(prefix)) return true;
  }
  return false;
}

function hasAffirmativeImmediateDistressEvidence(text: string): boolean {
  const unquoted = text.replace(
    /“[^”]*”|"[^"]*"|「[^」]*」|『[^』]*』|‘[^’]*’/gu,
    '',
  );
  return (unquoted.match(/[^。！？!?\n]+[。！？!?]?/gu) ?? []).some((rawSentence) => {
    const sentence = rawSentence.trim();
    return IMMEDIATE_DISTRESS_TOPIC.test(sentence)
      && !/[？?]$/u.test(sentence)
      && !/(?:是否|是不是|有没有|有那么).{0,10}(?:恶心|难受|受不了|撑不住|煎熬|痛苦)|(?:恶心|难受|受不了|撑不住|煎熬|痛苦).{0,4}(?:吗|么|呢)/u.test(sentence)
      && !distressStatementIsNegatedOrDismissed(sentence)
      && !hasImmediateDistressRetraction(sentence);
  });
}

export interface ImmediateDistressAcknowledgementMatch {
  start: number;
  end: number;
  sentence: string;
}

export function findImmediateDistressAcknowledgement(
  text: string,
): ImmediateDistressAcknowledgementMatch | undefined {
  for (const match of text.matchAll(/[^。！？!?\n]+[。！？!?]?/gu)) {
    if (match.index === undefined) continue;
    const rawSentence = match[0];
    const sentence = rawSentence.trim();
    if (!sentence || /[？?]$/u.test(sentence)
      || /(?:是否|是不是|有没有|有那么).{0,10}(?:恶心|难受|受不了|撑不住|煎熬|痛苦)|(?:恶心|难受|受不了|撑不住|煎熬|痛苦).{0,4}(?:吗|么|呢)/u.test(sentence)
      || distressStatementIsNegatedOrDismissed(sentence)
      || hasImmediateDistressRetraction(sentence)) continue;
    const unquoted = sentence.replace(
      /“[^”]*”|"[^"]*"|「[^」]*」|『[^』]*』|‘[^’]*’/gu,
      '',
    );
    if (!IMMEDIATE_DISTRESS_TOPIC.test(unquoted)) continue;
    const acknowledgementBefore = new RegExp(
      `${IMMEDIATE_DISTRESS_ACKNOWLEDGEMENT.source}[^。！？!?\\n；;]{0,16}${IMMEDIATE_DISTRESS_TOPIC.source}`,
      'u',
    );
    const acknowledgementAfter = new RegExp(
      `${IMMEDIATE_DISTRESS_TOPIC.source}[^。！？!?\\n；;]{0,20}${IMMEDIATE_DISTRESS_ACKNOWLEDGEMENT.source}`,
      'u',
    );
    const directRealityAcknowledgement = new RegExp(
      `${IMMEDIATE_DISTRESS_TOPIC.source}[^。！？!?\\n；;]{0,4}(?:确实)?是(?:真的|真实)(?:的)?`,
      'u',
    );
    const groundedRealityAcknowledgement = new RegExp(
      `(?:${IMMEDIATE_DISTRESS_TOPIC.source}[^。！？!?\\n；;]{0,12}(?:这个|这种|那种|你的|这|那)(?:感受|感觉|反应)(?:本身)?[^。！？!?\\n；;]{0,5}真实|(?:这个|这种|那种|你的|这|那)(?:感受|感觉|反应)(?:本身)?[^。！？!?\\n；;]{0,5}真实[^。！？!?\\n；;]{0,12}${IMMEDIATE_DISTRESS_TOPIC.source})`,
      'u',
    );
    if (!acknowledgementBefore.test(unquoted)
      && !acknowledgementAfter.test(unquoted)
      && !directRealityAcknowledgement.test(unquoted)
      && !groundedRealityAcknowledgement.test(unquoted)) continue;
    const topicIndex = rawSentence.search(IMMEDIATE_DISTRESS_TOPIC);
    return {
      start: match.index + Math.max(0, topicIndex),
      end: match.index + rawSentence.length,
      sentence,
    };
  }
  return undefined;
}

function hasDirectionalQuestionAct(sentence: string): boolean {
  const questionWord = /(?:谁|什么|哪(?:个|一|些|边|部分)?|怎么|为什么|多少|几|何时|哪里)/u;
  const declarativeUncertainty = new RegExp(
    `(?:不知道|不清楚|没想好|说不清|无法确定|不能确定)[^。！？!?\\n]{0,24}${questionWord.source}|${questionWord.source}[^。！？!?\\n]{0,20}(?:都)?(?:不知道|不清楚|没想好|说不清|无法确定|不能确定)`,
    'u',
  );
  return /[？?]$/u.test(sentence)
    || /(?:吗|么|呢)[。.!]?$/u.test(sentence)
    || /(?:愿不愿意|想不想|要不要|能不能|可不可以|是不是|有没有|好不好|行不行)/u.test(sentence)
    || (!declarativeUncertainty.test(sentence)
      && (/(?:^|[，,])(?:那)?(?:你|我们)(?:现在|接下来|最想|想|先|会|要|能|愿)?[^。！？!?\n]{0,32}(?:谁|什么|哪(?:个|一|些|边|部分)?|怎么|为什么|多少|几|何时|哪里)/u.test(sentence)
        || /(?:先说|说说|聊聊|讲讲|从).{0,16}(?:谁|什么|哪(?:个|一|些|边|部分)?|怎么|为什么|多少|几|何时|哪里)/u.test(sentence)
        || /(?:谁|什么|哪(?:个|一|些|边|部分)?|怎么|为什么|多少|几|何时|哪里)(?:回事|开始|说|聊|讲|部分|地方)?[。.!]?$/u.test(sentence)));
}

function isPassiveListeningDelivery(
  text: string,
  currentEvidenceSpans: readonly string[],
  allowedEvidenceSpans: readonly string[],
): boolean {
  const normalizedCurrent = currentEvidenceSpans.map(normalizeCorrectionEvidence).join('');
  const allowedEvidence = allowedEvidenceSpans.join('');
  return sentences(text).every((rawSentence) => {
    const sentence = rawSentence.replace(/[。！？!?]+$/u, '').trim();
    if (/^(?:嗯[，,]?)?(?:我)?(?:先)?(?:听着|在听|听到了|听见了)$/u.test(sentence)) return true;
    if (/^(?:我先在这(?:里|儿)听着(?:[，,](?:你)?想一起理的时候再告诉我)?|你可以不回答|(?:你)?想一起理的时候再告诉我)$/u.test(sentence)) return true;
    if (NON_LISTENING_INTERPRETATION.test(sentence)
      || /(?:是对的|是错的|才对|认输|也得|更好|更合适|更值得)[。.!]?$/u.test(sentence)
      || sentence.match(PERSONAL_OR_CLINICAL_INFERENCE)
      || hasDirectionalQuestionAct(rawSentence)
      || DIRECT_IMPERATIVE_ADVICE.test(sentence)) return false;
    const clauses = sentence
      .split(/[，,；;]|(?:但|不过|可是|然后|而且|只是)/u)
      .map((clause) => clause.trim())
      .filter(Boolean);
    return clauses.every((clause) => {
      if (/^(?:嗯[，,]?)?(?:我)?(?:先)?(?:听着|在听|听到了|听见了)$/u.test(clause)
        || /^(?:不再|不继续|不)(?:替你)?(?:安排(?:下一步|后续)?|给建议|介入|往下推)$/u.test(clause)
        || PURE_STOP_INTERVENING_CLAUSE.test(clause)) return true;
      if (BOUNDARY_REPAIR_ACKNOWLEDGEMENT.test(clause)
        && /(?:越界|越过.{0,8}(?:边界|线)|只想被听见|替你安排下一步)/u.test(clause)
        && /(?:越界|边界|只想被听见|替用户安排下一步)/u.test(allowedEvidence)) return true;
      if (/(?:(?:所以|因此|那就|看来|恐怕).{0,18}(?:继续|别停|硬撑|离开|留下|放弃|辞职|分手|应该|只能|得)|(?:只能|还是得|就得|不得不).{0,12}(?:继续|硬撑|离开|留下)|(?:别|不要)停)/u.test(clause)) {
        return false;
      }
      const supportedListenParaphrase = normalizedCurrent.includes('累')
        && /^(?:听起来|看起来|好像)?(?:你)?(?:已经|一直)?(?:撑了很久|硬撑了很久)$/u
          .test(clause);
      if (supportedListenParaphrase) return true;
      const normalizedClause = normalizeCorrectionEvidence(clause)
        .replace(/^(?:听起来|看起来|好像|你(?:现在|已经|刚刚)?|明明|又|还|而且|一边|另一边)/u, '');
      return normalizedClause.length >= 2 && normalizedCurrent.includes(normalizedClause);
    });
  });
}

function honestTentativeJudgmentRepairInstruction(
  currentEvidenceSpans: readonly string[],
): string {
  if (requiresClosedCorrection(currentEvidenceSpans)) {
    return '只用一个句子收口：承认刚才理解错，并在同一句逐项保留当前消息中的两项否定和一个收尾边界；随后结束，不追问，不追加判断、总结或历史比较，也不改写成新的心理原因。';
  }
  return '落实已确认的回应偏好：给出诚实但不过度笃定的判断，不用安慰套话，也不要复述关系记录。';
}

export function validateUtteranceAgainstTurnPlan(
  text: string,
  plan: SemanticTurnActPlan,
): SemanticTurnViolation[] {
  const violations: SemanticTurnViolation[] = [];
  const hasSpecificBoundaryAcknowledgement = plan.conversationAct === 'boundary_repair'
    && hasSpecificBoundaryRepairAcknowledgement(text);
  if (plan.directionalQuestionBudget === 0) {
    const directionalQuestion = sentences(text).find((sentence) => (
      hasDirectionalQuestionAct(sentence)
    ));
    if (directionalQuestion) {
      violations.push({
        code: 'forbidden_directional_question',
        evidenceSpan: directionalQuestion,
        effectId: plan.activeEffectIds[0],
        repairInstruction: '删除方向性问题，保留对用户已经表达内容的承接；用非问句式把继续分析的选择权交还用户。',
      });
    }
  }
  if (plan.advicePolicy === 'forbidden') {
    const advice = findAdviceViolationSentence(text);
    if (advice) {
      violations.push({
        code: 'forbidden_advice',
        evidenceSpan: advice,
        effectId: plan.activeEffectIds[0],
        repairInstruction: '删除建议、步骤和行动安排，只承接用户已经表达的内容并把空间留给用户。',
      });
    }
  }
  if (plan.menuBudget === 0) {
    const menu = sentences(text).find((sentence) => (
      /(?:可以|能).{0,24}(?:也可以|也能|或者)|要么.{1,24}要么|(?:是|要|想)?(?:继续|先)?(?:听|说|聊|讲|不聊|停|换个方式).{0,24}还是.{0,24}(?:听|说|聊|讲|不聊|停|别的|换个方式)|(?:继续|先)?(?:听|说|聊|讲)[^。！？!?\n]{0,20}(?:或者|或|不然就)[^。！？!?\n]{0,20}(?:听|说|聊|讲|不聊|停|换个方式)|(?:听|不聊|换个方式)(?:\s*[\/／、]\s*(?:听|不聊|换个方式)){1,}/u.test(sentence)
    ));
    if (menu) {
      violations.push({
        code: 'forbidden_menu',
        evidenceSpan: menu,
        effectId: plan.activeEffectIds[0],
        repairInstruction: '删除回应方式菜单；直接承接当前内容，用非问句式保留用户以后主动请求分析的空间。',
      });
    }
  }
  if (plan.forbiddenActs.includes('justify_intent')) {
    const justification = sentences(text).find((sentence) => (
      /(?:我只是想|我(?:原本|当时)?是想|我的本意|出发点|因为我.{0,8}(?:担心|想帮))/u.test(sentence)
    ));
    if (justification) {
      violations.push({
        code: 'forbidden_justification',
        evidenceSpan: justification,
        repairInstruction: '删除好意和动机解释，直接指出造成的具体影响并执行修复动作。',
      });
    }
  }
  if (plan.directionalQuestionBudget > 0 && plan.forbiddenActs.includes('ask_binary')) {
    const binaryQuestion = sentences(text).find((sentence) => (
      /[？?]/u.test(sentence) && /(?:还是|要么)/u.test(sentence)
    ));
    if (binaryQuestion) {
      violations.push({
        code: 'forbidden_directional_question',
        evidenceSpan: binaryQuestion,
        effectId: plan.activeEffectIds[0],
        repairInstruction: '删除二选一；若仍需提问，只能针对已经出现的自我判断来源提出一个开放且不施压的问题。',
      });
    }
  }
  if (!plan.reopenDecisionAllowed) {
    const reopened = sentences(text).find((sentence) => (
      /(?:也许|可能|不如|要不要).{0,12}(?:换个|继续|再试|重来|还有)|(?:换个|再试|重来).{0,10}(?:继续|可能)/u.test(sentence)
    ));
    if (reopened) {
      violations.push({
        code: 'decision_reopened',
        evidenceSpan: reopened,
        repairInstruction: '接受用户已经结束的决定，只处理决定之后出现的感受或自我判断，不提供继续项目的新入口。',
      });
    }
  }
  if (plan.conversationAct === 'boundary_repair') {
    const disallowedUnit = findDisallowedBoundaryRepairUnit(text);
    const finalClause = text
      .split(/[，,。！？；;\n]/u)
      .map((clause) => clause.trim())
      .filter(Boolean)
      .at(-1);
    const finalStopMatch = finalClause?.match(STOP_INTERVENING_ACT);
    const finalClauseIsOnlyStop = Boolean(
      finalClause
      && finalStopMatch
      && (finalStopMatch.index ?? 0) + finalStopMatch[0].length === finalClause.length,
    );
    const hasStopInterveningAct = STOP_INTERVENING_ACT.test(text);
    if (hasStopInterveningAct
      && (disallowedUnit || !finalClauseIsOnlyStop)
      && !violations.some(({ code }) => code === 'decision_reopened')) {
      violations.push({
        code: 'decision_reopened',
        evidenceSpan: disallowedUnit ?? finalClause,
        effectId: plan.activeEffectIds[0],
        repairInstruction: '把“停止介入”作为回复最后一个语义动作；删除其后的等待、安慰、重开入口或其他补充。',
      });
    }
    if (!hasSpecificBoundaryAcknowledgement
      && !violations.some(({ code }) => code === 'required_semantic_move_missing')) {
      violations.push({
        code: 'required_semantic_move_missing',
        evidenceSpan: text,
        effectId: plan.activeEffectIds[0],
        repairInstruction: '明确承认人物此前做错的具体行为，不能只复述用户说过的边界。',
      });
    }
  }
  if (plan.forbiddenActs.includes('assign_responsibility')) {
    const assignment = sentences(text).find((sentence) => (
      /(?:让|由)(?:我|你|林衡|夏栩|周禾|许野).{0,10}(?:负责|承担).{0,8}(?:维护|回滚|收尾|交接)|(?:我|你|林衡|夏栩|周禾|许野)(?:来|会).{0,4}(?:负责|承担).{0,8}(?:维护|回滚|收尾|交接)/u.test(sentence)
    ));
    if (assignment) {
      violations.push({
        code: 'responsibility_owner_unconfirmed',
        evidenceSpan: assignment,
        repairInstruction: '只能指出现实责任尚未确认；不得把人物、房间仲裁器或未获用户确认的主体指定为负责人。',
      });
    }
  }
  const evidenceText = plan.allowedEvidenceSpans.join('\n');
  const unsupportedBoundaryHistory = plan.conversationAct === 'boundary_repair'
    ? findUnsupportedBoundaryHistoryReference(text, plan.allowedEvidenceSpans)
    : undefined;
  if (unsupportedBoundaryHistory) {
    violations.push({
      code: 'unsupported_shared_history',
      evidenceSpan: unsupportedBoundaryHistory,
      repairInstruction: '删除没有来源的过去时间与边界细节；只能复述当前用户消息或已选关系证据明确提供的历史。',
    });
  }
  const attributedPastQuotes = [...text.matchAll(
    /(?:我|你|我们)(?:当时|之前|上次)?(?:还)?说(?:过)?[“"]([^”"]+)[”"]/gu,
  )];
  const unsupportedQuote = attributedPastQuotes.find((match) => !evidenceText.includes(match[1] ?? ''));
  if (unsupportedQuote
    && !violations.some(({ code }) => code === 'unsupported_shared_history')) {
    violations.push({
      code: 'unsupported_shared_history',
      evidenceSpan: unsupportedQuote[0],
      repairInstruction: '删除没有来源的过去原话；只能复述当前用户消息或已选关系证据明确提供的历史。',
    });
  }
  const requiredCashConstraint = plan.mustAddress.find((item) => CASH_CONSTRAINT.test(item));
  if (requiredCashConstraint && !CASH_RESPONSE.test(text)) {
    violations.push({
      code: 'required_semantic_move_missing',
      evidenceSpan: requiredCashConstraint,
      repairInstruction: '回应用户明确给出的现金或近期承受能力约束；不能只处理情绪、价值或长期可能性。',
    });
  }
  const immediateDistressAcknowledgement = plan.semanticRequirements.acknowledgeImmediateDistress
    ? findImmediateDistressAcknowledgement(text)
    : undefined;
  const firstCashResponseIndex = requiredCashConstraint ? text.search(CASH_RESPONSE) : -1;
  if (plan.semanticRequirements.acknowledgeImmediateDistress
    && (
      !immediateDistressAcknowledgement
      || (
        firstCashResponseIndex >= 0
        && immediateDistressAcknowledgement.start > firstCashResponseIndex
      )
    )) {
    violations.push({
      code: 'required_semantic_move_missing',
      evidenceSpan: plan.currentEvidenceSpans.find((span) => IMMEDIATE_DISTRESS_TOPIC.test(span)),
      repairInstruction: '先用一句自然的话明确承认用户当前已经很难受，再处理现实约束；不能只谈房租、现金或下一步。',
    });
  }
  if (plan.requiredActs.includes('acknowledge')
    && !ACKNOWLEDGEMENT_ACT.test(text)
    && !hasSpecificBoundaryAcknowledgement
    && !violations.some(({ code }) => code === 'required_semantic_move_missing')) {
    violations.push({
      code: 'required_semantic_move_missing',
      effectId: plan.activeEffectIds[0],
      repairInstruction: '先明确表示正在听、理解了边界或已经停止越界动作；不能只用“好的”等空泛确认代替承接。',
    });
  }
  if (plan.requiredActs.includes('stop_intervening')
    && (plan.interactionMode === 'listen'
      ? !isPassiveListeningDelivery(
          text,
          plan.currentEvidenceSpans,
          plan.allowedEvidenceSpans,
        )
      : !STOP_INTERVENING_ACT.test(text))
    && !violations.some(({ code }) => code === 'required_semantic_move_missing')) {
    violations.push({
      code: 'required_semantic_move_missing',
      effectId: plan.activeEffectIds[0],
      repairInstruction: '明确执行停止介入：停止替用户安排、给方案或推进修复流程；不要只道歉或把下一步选择重新交给用户回答。',
    });
  }
  if (plan.relationshipMove?.observableCue === 'honest_tentative_judgment'
    && ((requiresClosedCorrection(plan.currentEvidenceSpans)
        && !hasClosedGroundedCorrection(text, plan.currentEvidenceSpans))
      || !hasHonestTentativeJudgment(text, plan.currentEvidenceSpans)
      || hasUnsupportedPersonalAttribution(text, plan.currentEvidenceSpans)
      || [...text.matchAll(PERSONAL_OR_CLINICAL_INFERENCE)].some((match) => (
        !plan.currentEvidenceSpans
          .map(normalizeCorrectionEvidence)
          .join('')
          .includes(normalizeCorrectionEvidence(match[0]))
      ))
      || COMFORTING_CLICHE.test(text)
      || hasOverconfidentJudgment(text))) {
    violations.push({
      code: 'relationship_move_not_observable',
      effectId: plan.activeEffectIds[0],
      repairInstruction: honestTentativeJudgmentRepairInstruction(
        plan.currentEvidenceSpans,
      ),
    });
  }
  if (plan.relationshipMove?.observableCue === 'lead_with_conclusion') {
    const firstSentence = sentences(text)[0] ?? '';
    if (!firstSentence
      || /[？?]/u.test(firstSentence)
      || !/(?:如果|要是|按|目前|暂时|我的判断|我的结论|我更倾向|我认为|我觉得|在我看来|可能)/u.test(firstSentence)
      || !CONCLUSION_ASSERTION.test(firstSentence)) {
      violations.push({
        code: 'relationship_move_not_observable',
        effectId: plan.activeEffectIds[0],
        repairInstruction: '落实已确认的回应偏好：第一句先给条件化结论，不要用问题或偏好说明开场。',
      });
    }
  }
  if (plan.relationshipMove?.observableCue === 'reversible_small_experiment'
    && !hasReversibleExperiment(text)) {
    violations.push({
      code: 'relationship_move_not_observable',
      effectId: plan.activeEffectIds[0],
      repairInstruction: '落实共同验证过的方法：提出一个当前可执行、可停止或可撤回的小实验，不要复述过去。',
    });
  }
  if (plan.relationshipMove?.observableCue === 'concise_response' && text.length > 120) {
    violations.push({
      code: 'relationship_move_not_observable',
      effectId: plan.activeEffectIds[0],
      repairInstruction: '落实已确认的简短偏好：只保留一个重点，并把回复控制在 120 个汉字内。',
    });
  }
  if (plan.relationshipMove?.observableCue === 'single_question_max'
    && (text.match(/[？?]/gu)?.length ?? 0) > 1) {
    violations.push({
      code: 'relationship_move_not_observable',
      effectId: plan.activeEffectIds[0],
      repairInstruction: '落实已确认的提问偏好：本轮最多保留一个问题。',
    });
  }
  if (plan.relationshipMove?.observableCue === 'avoid_advice'
    && findAdviceViolationSentence(text)) {
    violations.push({
      code: 'relationship_move_not_observable',
      effectId: plan.activeEffectIds[0],
      repairInstruction: '落实已确认偏好：删除建议、方案和行动安排，只回应当前内容。',
    });
  }
  if (plan.relationshipMove?.observableCue === 'lead_with_example') {
    const firstSentence = sentences(text)[0] ?? '';
    if (!/(?:比如|例如|举个|就像|拿.{1,12}来说)/u.test(firstSentence)) {
      violations.push({
        code: 'relationship_move_not_observable',
        effectId: plan.activeEffectIds[0],
        repairInstruction: '落实已确认偏好：第一句直接给一个当前话题的具体例子。',
      });
    }
  }
  if (plan.requiredActs.includes('reflect') && !REFLECTION_ACT.test(text)) {
    violations.push({
      code: 'required_semantic_move_missing',
      effectId: plan.activeEffectIds[0],
      repairInstruction: '用一句话反映用户已经表达的具体感受、处境或冲突，不能只确认收到。',
    });
  }
  return violations;
}

export function renderSemanticTurnActPlan(control: SemanticTurnControl): string {
  const { frame, plan } = control;
  const semanticRequirements = [
    ...(plan.semanticRequirements.acknowledgeImmediateDistress
      ? ['先承认当前明确痛苦，再处理现实约束']
      : []),
    ...(plan.semanticRequirements.acceptProjectEnd ? ['接受项目结束'] : []),
    ...(plan.semanticRequirements.handleSelfJudgmentAfterEnd
      ? ['处理“项目结束→自我能力判决”的跳转']
      : []),
  ];
  return [
    '【本轮已批准动作计划｜内部执行合同】',
    '这份计划已经过 Policy 裁决。人物只能决定如何自然表达，不能增加被禁止的介入动作；不得向用户朗读字段名。',
    `基础对话动作：${plan.conversationAct}`,
    `基础动作指令：${plan.conversationInstruction}`,
    `安全模式：${plan.safetyMode}`,
    `互动模式：${plan.interactionMode}`,
    `随后明确请求：${frame.deferredRequestedMode
      ?? (frame.consumedPendingRequest ? undefined : frame.pendingRequestedMode)
      ?? '无'}`,
    `必须处理：${plan.mustAddress.length > 0 ? plan.mustAddress.join('；') : '回应用户当前消息本身'}`,
    `结构化语义要求：${semanticRequirements.length > 0 ? semanticRequirements.join('；') : '无'}`,
    `建议权限：${plan.advicePolicy}`,
    `方向性问题预算：${plan.directionalQuestionBudget}`,
    `菜单预算：${plan.menuBudget}`,
    `允许重开决定：${plan.reopenDecisionAllowed ? '是' : '否'}`,
    `现实责任动作：${plan.responsibilityAct}`,
    `必须动作：${plan.requiredActs.length > 0 ? plan.requiredActs.join('、') : '无额外硬要求'}`,
    `本轮关系动作：${plan.relationshipMove
      ? `${plan.relationshipMove.kind}｜${plan.relationshipMove.instruction}`
      : '无'}`,
    `禁止动作：${plan.forbiddenActs.length > 0 ? plan.forbiddenActs.join('、') : '无额外禁止动作'}`,
    `生效关系效果 ID：${plan.activeEffectIds.length > 0 ? plan.activeEffectIds.join('、') : '无'}`,
    `当前用户证据：${frame.evidenceSpans.join('；')}`,
    `允许关系证据 ID：${plan.allowedEvidenceIds.join('、')}`,
  ].join('\n');
}

export function semanticTurnFallback(control: SemanticTurnControl): string | undefined {
  const conversationFallback = conversationRepairFallback({
    kind: control.plan.conversationAct,
    instruction: '',
    bufferUntilValidated: control.plan.bufferUntilValidated,
    ...(control.plan.boundaryRepairSubject
      ? { boundaryRepairSubject: control.plan.boundaryRepairSubject }
      : {}),
  });
  if (conversationFallback) return conversationFallback;
  if (control.plan.interactionMode === 'listen') {
    return '嗯，我听着。';
  }
  if (!control.plan.reopenDecisionAllowed
    && control.plan.semanticRequirements.acceptProjectEnd
    && control.plan.semanticRequirements.handleSelfJudgmentAfterEnd) {
    return '那就结束。项目可以结束，但项目结束不等于你没能力。';
  }
  if (control.plan.semanticRequirements.acknowledgeImmediateDistress
    && control.plan.mustAddress.some((item) => CASH_CONSTRAINT.test(item))) {
    return '再去一天已经让你很难受了。手上的钱，能撑多久的基本开支？';
  }
  if (control.plan.relationshipMove?.observableCue === 'reversible_small_experiment') {
    return '先只选一边试一天，开始前写下退出条件；一天后再决定值不值得继续，随时可以停。';
  }
  if (control.plan.relationshipMove?.observableCue === 'honest_tentative_judgment') {
    const correctionEvidence = affirmedCorrectionEvidence(
      control.plan.currentEvidenceSpans,
    );
    if (requiresClosedCorrection(control.plan.currentEvidenceSpans)) {
      return `我理解错了：你不是害怕失败，也不是缺行动力，你只是不想再替${correctionEvidence.cleanupSubject}收尾。`;
    }
    if (hasPersonaCertaintyBlameEvidence(control.plan.currentEvidenceSpans)) {
      return '不，我不觉得你活该。你烦我当时那种笃定的样子，这没问题。';
    }
    if (hasFatigueEvidence(control.plan.currentEvidenceSpans)
      && hasStoppingEvidence(control.plan.currentEvidenceSpans)) {
      return '我不觉得硬撑就是前进。';
    }
  }
  return undefined;
}

export function nextPendingUserRequest(
  previous: PendingUserRequest | undefined,
  frame: TurnFrame,
  turnId: string,
): PendingUserRequest | undefined {
  if (frame.deferredRequestedMode) {
    return { mode: frame.deferredRequestedMode, sourceTurnId: turnId };
  }
  if (frame.consumedPendingRequest) return undefined;
  return previous;
}
