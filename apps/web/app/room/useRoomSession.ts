'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PERSONAS, getPersona } from '@persona16/engine/personas';
import type { AgentType } from '@persona16/engine/types';
import type { FeedbackTag } from '@persona16/store';
import {
  ApiError,
  addServerAgent,
  deleteRoom,
  fetchMemories,
  fetchRoomFeedback,
  fetchServerRoom,
  removeServerAgent,
  resolveMemory,
  saveMessageFeedback,
  saveRoom,
  setServerAgentPaused,
  streamTurn,
  type MemoryCandidate,
  type MessageFeedback,
  type SavedMemory,
  type ServerRoom,
} from '../../lib/client';

interface LiveMsg {
  messageId?: string;
  agent: AgentType;
  speechType: string;
  text: string;
  done: boolean;
}

interface FailedAttempt {
  text: string;
  calledAgent?: AgentType;
  code: string;
  message: string;
}

function latestReplyCount(room: ServerRoom): number {
  const speakers = new Set<string>();
  for (let index = room.state.history.length - 1; index >= 0; index--) {
    const message = room.state.history[index]!;
    if (message.speaker === 'user') break;
    if (message.speaker !== 'safety') speakers.add(message.speaker);
  }
  return speakers.size;
}

export function useRoomSession(id: string) {
  const router = useRouter();
  const [room, setRoom] = useState<ServerRoom | null>(null);
  const [input, setInput] = useState('');
  const [live, setLive] = useState<LiveMsg[]>([]);
  const [safetyLive, setSafetyLive] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState('准备好了');
  const [called, setCalled] = useState<AgentType | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [failedAttempt, setFailedAttempt] = useState<FailedAttempt | null>(null);
  const [memoryCandidates, setMemoryCandidates] = useState<MemoryCandidate[]>([]);
  const [savedMemories, setSavedMemories] = useState<SavedMemory[]>([]);
  const [showMemories, setShowMemories] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, MessageFeedback>>({});
  const [messageMenu, setMessageMenu] = useState<{ messageId?: string; agent: AgentType } | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [negativeTarget, setNegativeTarget] = useState<string | null>(null);
  const [negativeTags, setNegativeTags] = useState<FeedbackTag[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function loadRoom(roomId = id, shouldApply: () => boolean = () => true): Promise<ServerRoom> {
    if (shouldApply()) setError(null);
    const loaded = await fetchServerRoom(roomId);
    const [feedbackResult, candidatesResult] = await Promise.allSettled([
      fetchRoomFeedback(roomId),
      fetchMemories('candidate', roomId),
    ]);
    if (!shouldApply()) return loaded;
    setRoom(loaded);
    setFeedback(feedbackResult.status === 'fulfilled'
      ? Object.fromEntries(feedbackResult.value.map((record) => [record.messageId, record]))
      : {});
    if (candidatesResult.status === 'fulfilled') {
      setMemoryCandidates(candidatesResult.value);
    } else {
      setError('候选记忆恢复失败，请刷新房间重试');
    }
    setStatusText(latestReplyCount(loaded) > 0 ? '回复完成' : '准备好了');
    saveRoom({
      id: loaded.id,
      agents: loaded.state.agents.map((agent) => agent.type),
      version: loaded.version,
      updatedAt: Date.now(),
    });
    return loaded;
  }

  useEffect(() => {
    let active = true;
    if (!id) {
      router.replace('/');
      return;
    }
    setError(null);
    setMemoryCandidates([]);
    setFeedback({});
    setShowMemories(false);
    void loadRoom(id, () => active).catch(() => {
      deleteRoom(id);
      if (active) router.replace('/');
    });
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, [id, router]);

  useEffect(() => {
    const messageCount = room?.state.history.length ?? 0;
    if (!busy && messageCount > 0 && messageCount <= 3) return;
    bottomRef.current?.scrollIntoView({ behavior: busy ? 'smooth' : 'auto' });
  }, [room?.state.history.length, live, pendingUser, memoryCandidates, busy]);

  useEffect(() => {
    if (!membersOpen && !negativeTarget && !messageMenu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMembersOpen(false);
      setNegativeTarget(null);
      setMessageMenu(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [membersOpen, negativeTarget, messageMenu]);

  const availableToInvite = useMemo(() => {
    const present = new Set(room?.state.agents.map((agent) => agent.type) ?? []);
    return PERSONAS.filter((persona) => !present.has(persona.type));
  }, [room?.state.agents]);

  async function send(text: string, requestedAgent = called) {
    const currentRoom = room;
    const trimmed = text.trim();
    if (!currentRoom || busy || !trimmed) return;
    setBusy(true);
    setError(null);
    setFailedAttempt(null);
    setStatusText('正在决定谁先开口…');
    setPendingUser(trimmed);
    setInput('');
    setLive([]);
    setSafetyLive(null);
    setCalled(undefined);
    const abort = new AbortController();
    abortRef.current = abort;
    let completed = false;

    try {
      await streamTurn({
        roomId: currentRoom.id,
        turnId: crypto.randomUUID(),
        roomVersion: currentRoom.version,
        text: trimmed,
        calledAgent: requestedAgent,
      }, (event) => {
        if (event.type === 'room_action') {
          if ('agent' in event.action) setStatusText(`${getPersona(event.action.agent).title}准备发言…`);
        } else if (event.type === 'speaker_start') {
          setStatusText(`${getPersona(event.agent).title}正在发言`);
          setLive((previous) => [...previous, { agent: event.agent, speechType: event.speechType, text: '', done: false }]);
        } else if (event.type === 'delta') {
          setLive((previous) => previous.map((message, index) => (
            index === previous.length - 1 && message.agent === event.agent
              ? { ...message, text: message.text + event.delta }
              : message
          )));
        } else if (event.type === 'speaker_end') {
          setLive((previous) => previous.map((message, index) => (
            index === previous.length - 1 && message.agent === event.agent
              ? { ...message, messageId: event.messageId, text: event.text, done: true }
              : message
          )));
        } else if (event.type === 'memory_candidate') {
          setMemoryCandidates((previous) => [...previous.filter((item) => item.id !== event.candidate.id), event.candidate]);
        } else if (event.type === 'safety_notice') {
          setSafetyLive(event.text);
        } else if (event.type === 'done') {
          completed = true;
          const next = { id: currentRoom.id, state: event.room, version: event.roomVersion };
          setRoom(next);
          saveRoom({
            id: currentRoom.id,
            agents: event.room.agents.map((agent) => agent.type),
            version: event.roomVersion,
            updatedAt: Date.now(),
          });
          setStatusText('回复完成');
          setLive([]);
          setSafetyLive(null);
          setPendingUser(null);
        } else if (event.type === 'error') {
          setFailedAttempt({ text: trimmed, calledAgent: requestedAgent, code: event.code, message: event.message });
          setError(event.message);
        }
      }, abort.signal);
    } catch (cause) {
      const cancelled = abort.signal.aborted;
      const failure = cancelled
        ? { code: 'CANCELLED', message: '已停止本轮生成' }
        : { code: cause instanceof ApiError ? cause.code : 'NETWORK_ERROR', message: cause instanceof Error ? cause.message : '网络异常，稍后重试' };
      setFailedAttempt({ text: trimmed, calledAgent: requestedAgent, ...failure });
      setError(failure.message);
    } finally {
      if (!completed) {
        setLive([]);
        setPendingUser(null);
        setStatusText('本轮未完成');
      }
      abortRef.current = null;
      setBusy(false);
    }
  }

  async function applyRoomChange(operation: (currentRoom: ServerRoom) => Promise<ServerRoom>) {
    const currentRoom = room;
    if (!currentRoom || busy) return;
    setError(null);
    try {
      const updated = await operation(currentRoom);
      setRoom(updated);
      saveRoom({
        id: updated.id,
        agents: updated.state.agents.map((agent) => agent.type),
        version: updated.version,
        updatedAt: Date.now(),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新房间失败');
      if (cause instanceof ApiError && cause.code === 'ROOM_VERSION_CONFLICT') await loadRoom().catch(() => undefined);
    }
  }

  async function togglePause(type: AgentType) {
    await applyRoomChange((currentRoom) => {
      const agent = currentRoom.state.agents.find((candidate) => candidate.type === type);
      if (!agent) return Promise.resolve(currentRoom);
      return setServerAgentPaused(currentRoom.id, currentRoom.version, type, !agent.paused);
    });
  }

  async function inviteAgent(type: AgentType) {
    await applyRoomChange((currentRoom) => addServerAgent(currentRoom.id, currentRoom.version, type));
    setInviteOpen(false);
  }

  async function removeAgent(type: AgentType) {
    const confirmed = window.confirm(`确定要将 ${getPersona(type).title} 移出房间吗？`);
    if (!confirmed) return;
    await applyRoomChange((currentRoom) => removeServerAgent(currentRoom.id, currentRoom.version, type, true));
    if (called === type) setCalled(undefined);
  }

  async function decideMemory(candidate: MemoryCandidate, action: 'confirm' | 'reject') {
    try {
      await resolveMemory(candidate.id, action);
      setMemoryCandidates((previous) => previous.filter((item) => item.id !== candidate.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新记忆失败');
    }
  }

  async function toggleMemoryManager() {
    if (showMemories) {
      setShowMemories(false);
      return;
    }
    try {
      setSavedMemories(await fetchMemories('confirmed'));
      setShowMemories(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取记忆失败');
    }
  }

  async function deleteSavedMemory(memory: SavedMemory) {
    try {
      await resolveMemory(memory.id, 'delete');
      setSavedMemories((previous) => previous.filter((item) => item.id !== memory.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除记忆失败');
    }
  }

  async function submitFeedback(messageId: string, rating: 'positive' | 'negative', tags: FeedbackTag[] = []) {
    if (!room) return;
    try {
      const result = await saveMessageFeedback({ roomId: room.id, messageId, rating, tags });
      setFeedback((previous) => ({ ...previous, [messageId]: result.feedback }));
      setNegativeTarget(null);
      setNegativeTags([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '反馈保存失败');
    }
  }

  return {
    room,
    input,
    setInput,
    live,
    safetyLive,
    pendingUser,
    busy,
    statusText,
    called,
    setCalled,
    error,
    failedAttempt,
    setFailedAttempt,
    memoryCandidates,
    savedMemories,
    showMemories,
    membersOpen,
    setMembersOpen,
    inviteOpen,
    setInviteOpen,
    feedback,
    messageMenu,
    setMessageMenu,
    expandedMessages,
    setExpandedMessages,
    negativeTarget,
    setNegativeTarget,
    negativeTags,
    setNegativeTags,
    bottomRef,
    availableToInvite,
    replied: room ? latestReplyCount(room) : 0,
    loadRoom,
    send,
    stop: () => abortRef.current?.abort(),
    togglePause,
    inviteAgent,
    removeAgent,
    decideMemory,
    toggleMemoryManager,
    deleteSavedMemory,
    submitFeedback,
  };
}
