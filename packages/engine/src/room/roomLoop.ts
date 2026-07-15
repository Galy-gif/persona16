import type { RoomActionEvent, TurnStopReason } from '../runtime/turnEvents';
import type { AgentUtterance, RoomState, SpeakerPlan, TurnPlan } from '../types';
import {
  createRoomLoopState,
  forcedStopReason,
  initialRoomAction,
  recordExecutedAction,
  speakerPlanForAction,
  validateRoomAction,
} from './roomPolicy';
import {
  DEFAULT_ROOM_LOOP_BUDGET,
  type RoomAction,
  type RoomController,
  type RoomLoopBudget,
  type RoomLoopResult,
} from './types';
import { ModelBudgetExceededError } from '../runtime/modelBudget';
import { invokeDelivery, invokeObserver, type ObserverErrorHandler } from '../lifecycleHooks';

export interface ExecuteRoomActionContext {
  action: Exclude<RoomAction, { type: 'stop' }>;
  speaker: SpeakerPlan;
  forceSummary: boolean;
  remainingCharacters: number;
}

export interface RunRoomLoopOptions {
  room: RoomState;
  /** 生产调用应显式传入；独立调用缺省时从最近一条用户历史中恢复。 */
  userMessage?: string;
  plan: TurnPlan;
  controller: RoomController;
  budget?: Partial<RoomLoopBudget>;
  now?: () => number;
  execute(context: ExecuteRoomActionContext): Promise<AgentUtterance>;
  /** 可选观测；失败不影响 RoomLoop。 */
  onAction?: (action: RoomAction) => void;
  /** 必需事件投递；失败会转换为 DeliveryCallbackError。 */
  onActionEvent?: (action: RoomAction) => void;
  onObserverError?: ObserverErrorHandler;
}

export async function runRoomLoop(options: RunRoomLoopOptions): Promise<RoomLoopResult> {
  const now = options.now ?? Date.now;
  const budget = { ...DEFAULT_ROOM_LOOP_BUDGET, ...options.budget };
  const state = createRoomLoopState(now());
  const userMessage = options.userMessage
    ?? [...options.room.history].reverse().find((message) => message.speaker === 'user')?.text
    ?? '';
  let proposed: RoomAction = initialRoomAction(options.plan);
  let stopReason: TurnStopReason = 'complete';

  for (;;) {
    const action = validateRoomAction(proposed, options.room, options.plan, state, budget, now());
    invokeObserver('room_action', options.onAction, [action], options.onObserverError);
    invokeDelivery('room_action', options.onActionEvent, [action]);

    if (action.type === 'stop') {
      state.actions.push(action);
      stopReason = action.reason;
      break;
    }

    const speaker = speakerPlanForAction(action, options.plan);
    let utterance: AgentUtterance;
    try {
      utterance = await options.execute({
        action,
        speaker,
        forceSummary: action.type === 'summarize',
        remainingCharacters: Math.max(1, budget.maxGeneratedCharacters - state.generatedCharacters),
      });
    } catch (error) {
      if (!(error instanceof ModelBudgetExceededError)) throw error;
      const stop: RoomActionEvent = { type: 'stop', reason: 'budget_exhausted' };
      state.actions.push(stop);
      invokeObserver('room_action', options.onAction, [stop], options.onObserverError);
      invokeDelivery('room_action', options.onActionEvent, [stop]);
      stopReason = 'budget_exhausted';
      break;
    }
    recordExecutedAction(state, action, speaker, utterance);

    if (action.type === 'ask_user') {
      stopReason = 'needs_user_input';
      break;
    }
    if (action.type === 'summarize') {
      stopReason = 'summary_complete';
      break;
    }
    if (state.duplicateDetected) {
      stopReason = 'no_new_value';
      break;
    }
    if (options.plan.userEmotion === '危险') {
      stopReason = 'safety_redirect';
      break;
    }
    if (options.room.agents.filter((agent) => !agent.paused).length === 1) {
      stopReason = 'complete';
      break;
    }

    const forced = forcedStopReason(state, budget, now());
    if (forced) {
      stopReason = forced;
      break;
    }
    if (state.controllerCalls >= budget.maxControllerCalls) {
      stopReason = 'budget_exhausted';
      break;
    }

    const availableSpeakers = options.plan.speakers.filter(
      (speaker) => !state.normalSpeakers.includes(speaker.type),
    );
    state.controllerCalls += 1;
    try {
      proposed = await options.controller.decide({
        room: options.room,
        userMessage,
        plan: options.plan,
        state,
        budget,
        availableSpeakers,
      });
    } catch (error) {
      if (!(error instanceof ModelBudgetExceededError)) throw error;
      proposed = { type: 'stop', reason: 'budget_exhausted' };
    }
  }

  return {
    utterances: state.utterances,
    speakers: state.speakers,
    report: {
      actions: state.actions,
      stopReason,
      controllerCalls: state.controllerCalls,
      normalSpeakerCount: state.normalSpeakers.length,
      summaryCount: state.summaryCount,
      generatedCharacters: state.generatedCharacters,
      duplicateDetected: state.duplicateDetected,
      elapsedMs: Math.max(0, now() - state.startedAt),
    },
  };
}
