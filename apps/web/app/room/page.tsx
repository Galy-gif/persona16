'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle,
  Circle,
  DotsThreeVertical,
  PaperPlaneTilt,
  Pause,
  Play,
  Plus,
  StopCircle,
  ThumbsDown,
  ThumbsUp,
  Trash,
  UserPlus,
  Users,
  X,
} from '@phosphor-icons/react';
import { getPersona } from '@persona16/engine/personas';
import type { AgentType, Group } from '@persona16/engine/types';
import type { FeedbackTag } from '@persona16/store';
import { useRoomSession } from './useRoomSession';

const GROUP_COLOR: Record<Group, string> = {
  NT: 'var(--nt)', NF: 'var(--nf)', SJ: 'var(--sj)', SP: 'var(--sp)',
};

const FEEDBACK_REASONS: Array<{ tag: FeedbackTag; label: string }> = [
  { tag: 'too_ai', label: '太像 AI' },
  { tag: 'stereotyped', label: '人格刻板' },
  { tag: 'repetitive', label: '内容重复' },
  { tag: 'not_helpful', label: '没有帮助' },
  { tag: 'too_long', label: '太长' },
  { tag: 'too_short', label: '太短' },
  { tag: 'offensive', label: '让人不舒服' },
];

function readablePersonaText(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/gu, '$1')
    .replace(/^#{1,3}\s+/gmu, '')
    .replace(/^\s*[-*]\s+/gmu, '• ')
    .trim();
}

function RoomView() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const {
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
    replied,
    send,
    recoverFailedTurn,
    recoveryHint,
    recoveryLabel,
    hasUnknownTurn,
    stop,
    togglePause,
    inviteAgent,
    removeAgent,
    decideMemory,
    toggleMemoryManager,
    deleteSavedMemory,
    submitFeedback,
  } = useRoomSession(id);

  if (!room) {
    return <div className="room-loading" role="status">正在进入房间…</div>;
  }
  const currentRoom = room;
  const state = currentRoom.state;
  const agents = state.agents.map((agent) => agent.type);
  const multi = state.agents.length > 1;

  return (
    <div className="room">
      <header className="room-head">
        <button className="icon-button back" onClick={() => router.push('/')} aria-label="返回首页">
          <ArrowLeft size={22} aria-hidden />
        </button>
        <div className="room-title">
          <strong>persona16 · {multi ? '多人会谈室' : '单人会谈室'}</strong>
          <span>{state.agents.filter((agent) => !agent.paused).length} 位成员在线</span>
        </div>
        <button className="head-action" onClick={() => setMembersOpen(true)}>
          <Users size={18} aria-hidden />
          管理成员
        </button>
      </header>

      <section className="roster" aria-label="房间成员">
        {state.agents.map((agent) => {
          const persona = getPersona(agent.type);
          return (
            <div className={`member-seat${called === agent.type ? ' called' : ''}${agent.paused ? ' paused' : ''}`} key={agent.type}>
              <button
                className="member-main"
                onClick={() => !agent.paused && setCalled((value) => value === agent.type ? undefined : agent.type)}
                aria-pressed={called === agent.type}
                disabled={agent.paused || busy}
              >
                <span className="member-name"><Circle size={10} weight="fill" style={{ color: GROUP_COLOR[persona.group] }} aria-hidden />{persona.title}</span>
                <span className="member-meta">{agent.type} · {persona.group}</span>
                <span className="member-state">{agent.paused ? '已暂停' : called === agent.type ? '已调用' : '待调用'}</span>
              </button>
              <button className="member-more" onClick={() => setMembersOpen(true)} aria-label={`管理${persona.title}`}>
                <DotsThreeVertical size={20} weight="bold" aria-hidden />
              </button>
            </div>
          );
        })}
        {state.agents.length < 3 && (
          <button className="invite-seat" onClick={() => { setMembersOpen(true); setInviteOpen(true); }}>
            <UserPlus size={20} aria-hidden />邀请
          </button>
        )}
      </section>

      <main className="messages" aria-label="会谈消息" aria-live="polite" tabIndex={0}>
        {state.history.length === 0 && !pendingUser && (
          <div className="empty-room">
            <span>把真实问题带进来</span>
            <p>{multi ? '他们不必轮流回答；有新角度的人才会开口。' : getPersona(state.agents[0]!.type).hook}</p>
          </div>
        )}
        {state.history.map((message, index) => message.speaker === 'user' ? (
          <article key={message.id ?? index} className="user-message"><p>{message.text}</p></article>
        ) : message.speaker === 'safety' ? (
          <article key={message.id ?? index} className="safety-message">
            <strong>安全支持</strong><p>{message.text}</p>
          </article>
        ) : (
          <article key={message.id ?? index} className="persona-message" style={{ '--speaker-color': GROUP_COLOR[getPersona(message.speaker).group] } as React.CSSProperties}>
            <header>
              <strong>{getPersona(message.speaker).title}</strong>
              <span>{message.speaker} · {getPersona(message.speaker).group}</span>
              {message.speechType && message.speechType !== '长发言' && <small>{message.speechType}</small>}
              <button className="message-more" onClick={() => setMessageMenu({ messageId: message.id, agent: message.speaker as AgentType })} aria-label="更多消息操作"><DotsThreeVertical size={20} weight="bold" aria-hidden /></button>
            </header>
            <p>{message.id && readablePersonaText(message.text).length > 240 && !expandedMessages.has(message.id) ? `${readablePersonaText(message.text).slice(0, 240)}…` : readablePersonaText(message.text)}</p>
            {message.id && readablePersonaText(message.text).length > 240 && (
              <button className="expand-message" onClick={() => setExpandedMessages((current) => {
                const next = new Set(current);
                if (next.has(message.id!)) next.delete(message.id!); else next.add(message.id!);
                return next;
              })}>{expandedMessages.has(message.id) ? '收起全文' : '展开全文'}</button>
            )}
            {message.id && (
              <div className="feedback-row" aria-label="评价这条回复">
                <button
                  className={feedback[message.id]?.rating === 'positive' ? 'selected' : ''}
                  aria-pressed={feedback[message.id]?.rating === 'positive'}
                  onClick={() => void submitFeedback(message.id!, 'positive')}
                >
                  <ThumbsUp size={18} aria-hidden />有帮助
                </button>
                <button
                  className={feedback[message.id]?.rating === 'negative' ? 'selected' : ''}
                  aria-pressed={feedback[message.id]?.rating === 'negative'}
                  onClick={() => { setNegativeTarget(message.id!); setNegativeTags(feedback[message.id!]?.tags ?? []); }}
                >
                  <ThumbsDown size={18} aria-hidden />不太对
                </button>
              </div>
            )}
          </article>
        ))}
        {pendingUser && <article className="user-message"><p>{pendingUser}</p></article>}
        {safetyLive && <article className="safety-message"><strong>安全支持</strong><p>{safetyLive}</p></article>}
        {live.map((message, index) => (
          <article key={`live-${index}`} className="persona-message live" style={{ '--speaker-color': GROUP_COLOR[getPersona(message.agent).group] } as React.CSSProperties}>
            <header><strong>{getPersona(message.agent).title}</strong><span>{message.agent}</span></header>
            <p>{message.text}<span className="cursor" /></p>
          </article>
        ))}
        {memoryCandidates.map((candidate) => (
          <section key={candidate.id} className="memory-card">
            <span>允许 {candidate.agent} 以后记住</span>
            <p>{candidate.content}</p>
            <div>
              <button onClick={() => void decideMemory(candidate, 'reject')}>不记</button>
              <button className="primary" onClick={() => void decideMemory(candidate, 'confirm')}>确认记住</button>
            </div>
          </section>
        ))}
        {showMemories && (
          <section className="memory-card">
            <strong>已确认的记忆</strong>
            {savedMemories.length === 0 && <p>还没有已确认的记忆。</p>}
            {savedMemories.map((memory) => (
              <div className="saved-memory" key={memory.id}>
                <span>{memory.agent} · {memory.content}</span>
                <button onClick={() => void deleteSavedMemory(memory)}>删除</button>
              </div>
            ))}
          </section>
        )}
        {failedAttempt && (
          <section className="recovery" role="alert">
            <div><strong>{failedAttempt.message}</strong><span>{recoveryHint(failedAttempt)}</span></div>
            <button className="primary" onClick={() => void recoverFailedTurn(failedAttempt)}>
              {recoveryLabel(failedAttempt)}
            </button>
          </section>
        )}
        {error && !failedAttempt && <p className="inline-error" role="alert">{error}</p>}
        <div ref={bottomRef} />
      </main>

      <footer className="composer">
        {(busy || (replied > 0 && !failedAttempt)) && (
          <div className="turn-status" role="status">
            <span className={busy ? 'status-pulse' : 'status-check'}>{busy ? '生成中' : <CheckCircle size={20} weight="fill" aria-hidden />}</span>
            <strong>{statusText}</strong>
            {!busy && multi && <span>{replied}/{state.agents.length} 位成员已回复</span>}
            {busy ? (
              <button onClick={stop}><StopCircle size={18} aria-hidden />停止生成</button>
            ) : multi ? (
              <button onClick={() => void send('总结一下你们的分歧，并给出我现在最值得做的一步。')} disabled={busy || hasUnknownTurn}>总结分歧</button>
            ) : null}
          </div>
        )}
        {called && <div className="called-banner">已点名 {getPersona(called).title}<button onClick={() => setCalled(undefined)} aria-label="取消点名"><X size={16} aria-hidden /></button></div>}
        <div className="composer-row">
          <textarea
            value={input}
            disabled={hasUnknownTurn}
            rows={1}
            maxLength={2_000}
            placeholder={called ? `追问 ${getPersona(called).title}…` : '继续提问，或 @ 某位成员…'}
            onChange={(event) => setInput(event.target.value)}
            onInput={(event) => {
              const element = event.currentTarget;
              element.style.height = 'auto';
              element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send(input);
              }
            }}
          />
          <button className="send" disabled={busy || hasUnknownTurn || !input.trim()} onClick={() => void send(input)} aria-label="发送消息">
            <PaperPlaneTilt size={21} weight="fill" aria-hidden /><span>发送</span>
          </button>
        </div>
        <div className="composer-meta"><span>输入 @成员名 可定向提问</span><span>{input.length}/2000</span></div>
      </footer>

      {membersOpen && (
        <div className="sheet-backdrop" role="presentation" onMouseDown={() => setMembersOpen(false)}>
          <section className="sheet members-sheet" role="dialog" aria-modal="true" aria-labelledby="members-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><h2 id="members-title">房间成员</h2><span>{state.agents.length}/3</span></div><button autoFocus className="icon-button" onClick={() => setMembersOpen(false)} aria-label="关闭"><X size={22} aria-hidden /></button></header>
            {!inviteOpen ? (
              <>
                <div className="member-list">
                  {state.agents.map((agent) => {
                    const persona = getPersona(agent.type);
                    return (
                      <div className="member-row" key={agent.type}>
                        <div><strong><Circle size={10} weight="fill" style={{ color: GROUP_COLOR[persona.group] }} aria-hidden />{persona.title}</strong><span>{agent.type} · {agent.paused ? '已暂停' : '在线'}</span></div>
                        <div className="member-actions">
                          <button onClick={() => { setCalled(agent.type); setMembersOpen(false); }} disabled={agent.paused}><Users size={18} aria-hidden />点名</button>
                          <button onClick={() => void togglePause(agent.type)}>{agent.paused ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}{agent.paused ? '恢复' : '暂停'}</button>
                          <button onClick={() => void removeAgent(agent.type)} disabled={state.agents.length <= 1}><Trash size={18} aria-hidden />移除</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button className="sheet-wide-action" onClick={() => setInviteOpen(true)} disabled={state.agents.length >= 3}><UserPlus size={20} aria-hidden />邀请新成员</button>
                <button className="sheet-text-action" onClick={() => void toggleMemoryManager()}>{showMemories ? '收起记忆管理' : '管理已确认记忆'}</button>
              </>
            ) : (
              <div className="invite-list">
                <button className="sheet-back" onClick={() => setInviteOpen(false)}><ArrowLeft size={18} aria-hidden />返回成员列表</button>
                {availableToInvite.map((persona) => (
                  <button key={persona.type} onClick={() => void inviteAgent(persona.type)}>
                    <span><Circle size={10} weight="fill" style={{ color: GROUP_COLOR[persona.group] }} aria-hidden /><strong>{persona.title}</strong><small>{persona.type} · {persona.group}</small></span>
                    <Plus size={20} aria-hidden />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {negativeTarget && (
        <div className="sheet-backdrop" role="presentation" onMouseDown={() => setNegativeTarget(null)}>
          <section className="sheet feedback-sheet" role="dialog" aria-modal="true" aria-labelledby="feedback-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><h2 id="feedback-title">哪里不太对？</h2><span>最多选 4 项</span></div><button autoFocus className="icon-button" onClick={() => setNegativeTarget(null)} aria-label="关闭"><X size={22} aria-hidden /></button></header>
            <div className="reason-grid">
              {FEEDBACK_REASONS.map((reason) => (
                <button
                  key={reason.tag}
                  className={negativeTags.includes(reason.tag) ? 'selected' : ''}
                  aria-pressed={negativeTags.includes(reason.tag)}
                  onClick={() => setNegativeTags((current) => current.includes(reason.tag)
                    ? current.filter((tag) => tag !== reason.tag)
                    : current.length < 4 ? [...current, reason.tag] : current)}
                >{reason.label}</button>
              ))}
            </div>
            <button className="sheet-submit" disabled={negativeTags.length === 0} onClick={() => void submitFeedback(negativeTarget, 'negative', negativeTags)}>提交反馈</button>
          </section>
        </div>
      )}

      {messageMenu && (
        <div className="sheet-backdrop" role="presentation" onMouseDown={() => setMessageMenu(null)}>
          <section className="sheet message-sheet" role="dialog" aria-modal="true" aria-labelledby="message-actions-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><h2 id="message-actions-title">{getPersona(messageMenu.agent).title}</h2><span>这条回复</span></div><button autoFocus className="icon-button" onClick={() => setMessageMenu(null)} aria-label="关闭"><X size={22} aria-hidden /></button></header>
            <button onClick={() => { setCalled(messageMenu.agent); setMessageMenu(null); }}><Users size={19} aria-hidden />点名继续追问</button>
            {messageMenu.messageId && <button onClick={() => { void submitFeedback(messageMenu.messageId!, 'positive'); setMessageMenu(null); }}><ThumbsUp size={19} aria-hidden />标记为有帮助</button>}
            {messageMenu.messageId && <button onClick={() => { setNegativeTarget(messageMenu.messageId!); setNegativeTags(feedback[messageMenu.messageId!]?.tags ?? []); setMessageMenu(null); }}><ThumbsDown size={19} aria-hidden />告诉我们哪里不对</button>}
          </section>
        </div>
      )}
    </div>
  );
}

export default function RoomPage() {
  return <Suspense fallback={<div className="room-loading" role="status">正在进入房间…</div>}><RoomView /></Suspense>;
}
