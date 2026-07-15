import { addAgent, removeAgent, setPaused, type AgentType } from '@persona16/engine';
import { StoreError, type PersonaStore, type RoomRecord } from '@persona16/store';

export type RoomCommand =
  | { type: 'pause_agent'; agent: AgentType }
  | { type: 'resume_agent'; agent: AgentType }
  | { type: 'invite_agent'; agent: AgentType }
  | { type: 'remove_agent'; agent: AgentType };

export type RoomCommandAuthorization =
  | { source: 'ui_action'; confirmed?: boolean }
  | { source: 'explicit_user_text'; confirmed?: boolean }
  | { source: 'model_inference' }
  | { source: 'safety_system' };

export type RoomCommandPermissionDecision =
  | { decision: 'allow' }
  | { decision: 'confirm'; code: 'ROOM_COMMAND_CONFIRMATION_REQUIRED' }
  | { decision: 'deny'; code: 'ROOM_COMMAND_PERMISSION_DENIED' };

export function decideRoomCommandPermission(
  command: RoomCommand,
  authorization: RoomCommandAuthorization,
): RoomCommandPermissionDecision {
  if (authorization.source === 'model_inference' || authorization.source === 'safety_system') {
    return { decision: 'deny', code: 'ROOM_COMMAND_PERMISSION_DENIED' };
  }
  if (command.type === 'remove_agent' && !authorization.confirmed) {
    return { decision: 'confirm', code: 'ROOM_COMMAND_CONFIRMATION_REQUIRED' };
  }
  return { decision: 'allow' };
}

export interface ExecuteRoomCommandInput {
  userId: string;
  roomId: string;
  expectedVersion: number;
  command: RoomCommand;
  authorization: RoomCommandAuthorization;
}

export interface ExecuteRoomCommandResult {
  room: RoomRecord;
  changed: boolean;
}

export type RoomCommandErrorCode =
  | 'ROOM_COMMAND_PERMISSION_DENIED'
  | 'ROOM_COMMAND_CONFIRMATION_REQUIRED'
  | 'AGENT_ALREADY_IN_ROOM'
  | 'ROOM_AGENT_LIMIT'
  | 'UNKNOWN_AGENT'
  | 'LAST_AGENT'
  | 'LAST_ACTIVE_AGENT';

export class RoomCommandError extends Error {
  constructor(
    public readonly code: RoomCommandErrorCode,
    message: string,
    public readonly status: 400 | 403 | 409,
  ) {
    super(message);
    this.name = 'RoomCommandError';
  }
}

export interface RoomCommandModule {
  execute(input: ExecuteRoomCommandInput): Promise<ExecuteRoomCommandResult>;
}

export function createRoomCommandModule(store: PersonaStore): RoomCommandModule {
  return {
    async execute(input) {
      const room = await store.getRoom(input.roomId, input.userId);
      const permission = decideRoomCommandPermission(input.command, input.authorization);
      if (permission.decision === 'deny') {
        throw new RoomCommandError(
          permission.code,
          '需要用户明确授权后才能修改房间',
          403,
        );
      }
      if (permission.decision === 'confirm') {
        throw new RoomCommandError(
          permission.code,
          '移除成员前需要用户再次确认',
          409,
        );
      }
      if (room.version !== input.expectedVersion) {
        throw new StoreError('ROOM_VERSION_CONFLICT', '房间版本已更新');
      }
      if (room.activeTurnId) throw new StoreError('TURN_NOT_ACTIVE', '房间正在生成');

      const state = structuredClone(room.state);
      const existing = state.agents.find((agent) => agent.type === input.command.agent);
      if (input.command.type === 'pause_agent' || input.command.type === 'resume_agent') {
        if (!existing) throw new RoomCommandError('UNKNOWN_AGENT', '该 Agent 不在房间中', 400);
        const shouldPause = input.command.type === 'pause_agent';
        if (existing.paused === shouldPause) return { room, changed: false };
        if (shouldPause && state.agents.filter((agent) => !agent.paused).length <= 1) {
          throw new RoomCommandError('LAST_ACTIVE_AGENT', '至少保留一个未暂停的 Agent', 409);
        }
        setPaused(state, input.command.agent, shouldPause);
      } else if (input.command.type === 'invite_agent') {
        if (existing) throw new RoomCommandError('AGENT_ALREADY_IN_ROOM', '该 Agent 已在房间中', 409);
        if (state.agents.length >= 3) throw new RoomCommandError('ROOM_AGENT_LIMIT', '房间最多 3 个 Agent', 409);
        addAgent(state, input.command.agent);
      } else if (input.command.type === 'remove_agent') {
        if (!existing) throw new RoomCommandError('UNKNOWN_AGENT', '该 Agent 不在房间中', 400);
        if (state.agents.length <= 1) throw new RoomCommandError('LAST_AGENT', '房间至少保留一个 Agent', 409);
        removeAgent(state, input.command.agent);
        if (state.calledAgent === input.command.agent) state.calledAgent = undefined;
      }
      const updated = await store.updateRoom({
        userId: input.userId,
        roomId: input.roomId,
        expectedVersion: input.expectedVersion,
        state,
      });
      return { room: updated, changed: true };
    },
  };
}
