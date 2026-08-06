'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  DotsThree,
  PaperPlaneTilt,
  Pause,
  Play,
  Plus,
  StopCircle,
  ThumbsDown,
  ThumbsUp,
  Trash,
  UserPlus,
  UsersThree,
  X,
} from '@phosphor-icons/react';
import { getPersona } from '@persona16/engine/personas';
import type { AgentType } from '@persona16/engine/types';
import type { FeedbackTag } from '@persona16/store';
import { CharacterAvatar } from '../../components/CharacterAvatar';
import { characterName, getCharacterByType } from '../../lib/characters';
import { useRoomSession } from './useRoomSession';

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

function characterStyle(type: AgentType): React.CSSProperties {
  const character = getCharacterByType(type);
  return {
    '--character-accent': character?.accent ?? '#6f7787',
    '--character-soft': character?.soft ?? '#f3f4f6',
    '--character-shadow': character?.shadow ?? 'rgba(75, 85, 99, 0.18)',
  } as React.CSSProperties;
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
    mutterEnabled,
    toggleMutter,
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

  if (!room) return <div className="room-loading" role="status">正在进入对话…</div>;

  const state = room.state;
  const multi = state.agents.length > 1;
  const title = multi
    ? state.agents.map((agent) => characterName(agent.type)).join('、')
    : characterName(state.agents[0]!.type);
  const firstType = state.agents[0]!.type;

  return (
    <div className="room-shell" style={characterStyle(firstType)}>
      <a className="skip-link" href="#room-messages">跳到对话</a>
      <header className="room-head">
        <button className="icon-button" onClick={() => router.push('/conversations')} aria-label="返回对话列表">
          <ArrowLeft size={21} weight="light" aria-hidden />
        </button>
        <div className="room-title-block">
          <span className="room-title-avatars" aria-hidden>
            {state.agents.slice(0, 3).map((agent, index) => (
              <CharacterAvatar key={agent.type} type={agent.type} size={34} priority={index === 0} className={`stack-${index}`} />
            ))}
          </span>
          <span><strong>{title}</strong><small>{multi ? `${state.agents.filter((agent) => !agent.paused).length} 人在这里` : '此刻在这里'}</small></span>
        </div>
        <button className="head-action" onClick={() => setMembersOpen(true)} aria-label="房间成员与邀请">
          <UsersThree size={18} weight="light" aria-hidden /><span>{state.agents.length}</span>
        </button>
      </header>

      {multi && (
        <section className="room-roster" aria-label="房间成员">
          {state.agents.map((agent) => {
            const active = called === agent.type;
            return (
              <button
                key={agent.type}
                className={`roster-chip${active ? ' called' : ''}${agent.paused ? ' paused' : ''}`}
                style={characterStyle(agent.type)}
                aria-pressed={active}
                disabled={agent.paused || busy}
                onClick={() => setCalled((value) => value === agent.type ? undefined : agent.type)}
              >
                <CharacterAvatar type={agent.type} size={34} />
                <span><strong>{characterName(agent.type)}</strong><small>{agent.paused ? '已暂停' : active ? '正在点名' : '点名提问'}</small></span>
              </button>
            );
          })}
          {state.agents.length < 3 && (
            <button className="invite-chip" onClick={() => { setMembersOpen(true); setInviteOpen(true); }}>
              <UserPlus size={18} aria-hidden /><span>邀请</span>
            </button>
          )}
        </section>
      )}

      <main id="room-messages" className="messages" aria-label="对话消息" aria-live="polite" tabIndex={0}>
        {state.history.length === 0 && !pendingUser && (
          <section className="empty-room" style={characterStyle(firstType)}>
            <span className="empty-room-kicker">A quiet conversation</span>
            <div className="empty-room-character">
              <CharacterAvatar type={firstType} size={132} priority />
              <span aria-hidden />
            </div>
            <h1>今天想从哪里<br /><em>开始？</em></h1>
            <p>{multi ? '不用让每个人轮流回答；有新角度的人才会开口。' : getCharacterByType(firstType)?.shortFragment ?? getPersona(firstType).hook}</p>
          </section>
        )}

        {state.history.map((message, index) => message.speaker === 'user' ? (
          <article key={message.id ?? index} className="user-message"><p>{message.text}</p></article>
        ) : message.speaker === 'safety' ? (
          <article key={message.id ?? index} className="safety-message"><strong>安全支持</strong><p>{message.text}</p></article>
        ) : (
          <article key={message.id ?? index} className="persona-message" style={characterStyle(message.speaker)}>
            <header>
              <CharacterAvatar type={message.speaker} size={38} />
              <span><strong>{characterName(message.speaker)}</strong></span>
              <button className="message-more" onClick={() => setMessageMenu({ messageId: message.id, agent: message.speaker as AgentType })} aria-label="更多消息操作"><DotsThree size={22} weight="bold" aria-hidden /></button>
            </header>
            {message.mutter && <p className="mutter" aria-label={`${characterName(message.speaker)}的碎碎念`}>{message.mutter}</p>}
            <p>{message.id && readablePersonaText(message.text).length > 240 && !expandedMessages.has(message.id) ? `${readablePersonaText(message.text).slice(0, 240)}…` : readablePersonaText(message.text)}</p>
            {message.id && readablePersonaText(message.text).length > 240 && (
              <button className="expand-message" onClick={() => setExpandedMessages((current) => {
                const next = new Set(current);
                if (next.has(message.id!)) next.delete(message.id!); else next.add(message.id!);
                return next;
              })}>{expandedMessages.has(message.id) ? '收起全文' : '展开全文'}</button>
            )}
          </article>
        ))}

        {pendingUser && <article className="user-message"><p>{pendingUser}</p></article>}
        {safetyLive && <article className="safety-message"><strong>安全支持</strong><p>{safetyLive}</p></article>}
        {live.map((message, index) => (
          <article key={`live-${index}`} className="persona-message live" style={characterStyle(message.agent)}>
            <header><CharacterAvatar type={message.agent} size={38} /><span><strong>{characterName(message.agent)}</strong><small>正在回应</small></span></header>
            {message.mutter && <p className="mutter" aria-label={`${characterName(message.agent)}的碎碎念`}>{message.mutter}</p>}
            <p>{message.text}<span className="cursor" /></p>
          </article>
        ))}

        {memoryCandidates.map((candidate) => (
          <section key={candidate.id} className="memory-card">
            <span>允许 {characterName(candidate.agent)} 以后记住</span>
            <p>{candidate.content}</p>
            <div><button onClick={() => void decideMemory(candidate, 'reject')}>不记</button><button className="primary" onClick={() => void decideMemory(candidate, 'confirm')}>确认记住</button></div>
          </section>
        ))}

        {showMemories && (
          <section className="memory-card">
            <strong>已确认的记忆</strong>
            {savedMemories.length === 0 && <p>还没有已确认的记忆。</p>}
            {savedMemories.map((memory) => (
              <div className="saved-memory" key={memory.id}><span>{characterName(memory.agent)} · {memory.content}</span><button onClick={() => void deleteSavedMemory(memory)}>删除</button></div>
            ))}
          </section>
        )}

        {failedAttempt && (
          <section className="recovery" role="alert"><div><strong>{failedAttempt.message}</strong><span>{recoveryHint(failedAttempt)}</span></div><button className="primary" onClick={() => void recoverFailedTurn(failedAttempt)}>{recoveryLabel(failedAttempt)}</button></section>
        )}
        {error && !failedAttempt && <p className="inline-error" role="alert">{error}</p>}
        <div ref={bottomRef} />
      </main>

      <footer className="composer">
        {busy && (
          <div className="turn-status" role="status">
            <span className="status-pulse" aria-hidden><i /></span>
            <strong>{statusText}</strong>
            <button onClick={stop}><StopCircle size={18} aria-hidden />停止</button>
          </div>
        )}
        {!busy && multi && replied > 1 && !failedAttempt && (
          <button className="turn-followup" onClick={() => void send('总结一下你们的分歧，并给出我现在最值得做的一步。')} disabled={hasUnknownTurn}>
            把刚才的分歧收成一步
          </button>
        )}
        {called && <div className="called-banner">正在问 {characterName(called)}<button onClick={() => setCalled(undefined)} aria-label="取消点名"><X size={16} aria-hidden /></button></div>}
        <div className="composer-row">
          <textarea
            value={input}
            disabled={hasUnknownTurn}
            rows={1}
            maxLength={2_000}
            placeholder={called ? `想问 ${characterName(called)} 什么？` : multi ? '想和他们聊什么？' : `想和${title}聊什么？`}
            onChange={(event) => setInput(event.target.value)}
            onInput={(event) => {
              const element = event.currentTarget;
              element.style.height = 'auto';
              element.style.height = `${Math.min(element.scrollHeight, 112)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send(input);
              }
            }}
          />
          <button className="send" disabled={busy || hasUnknownTurn || !input.trim()} onClick={() => void send(input)} aria-label="发送消息"><PaperPlaneTilt size={19} weight="fill" aria-hidden /></button>
        </div>
        <div className="composer-meta">
          <span>{multi ? '点人物可定向提问' : 'Enter 发送，Shift + Enter 换行'}</span>
          {input.length > 0 && <span>{input.length}/2000</span>}
        </div>
      </footer>

      {membersOpen && (
        <div className="sheet-backdrop" role="presentation" onMouseDown={() => setMembersOpen(false)}>
          <section className="sheet members-sheet" role="dialog" aria-modal="true" aria-labelledby="members-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><h2 id="members-title">房间成员</h2><span>{state.agents.length}/3</span></div><button autoFocus className="icon-button" onClick={() => setMembersOpen(false)} aria-label="关闭"><X size={22} aria-hidden /></button></header>
            {!inviteOpen ? (
              <>
                <div className="member-list">
                  {state.agents.map((agent) => (
                    <div className="member-row" key={agent.type}>
                      <div className="member-identity"><CharacterAvatar type={agent.type} size={48} /><span><strong>{characterName(agent.type)}</strong><small>{agent.paused ? '已暂停' : '在房间里'}</small></span></div>
                      <div className="member-actions">
                        <button onClick={() => { setCalled(agent.type); setMembersOpen(false); }} disabled={agent.paused}><UsersThree size={18} aria-hidden />点名</button>
                        <button onClick={() => void togglePause(agent.type)}>{agent.paused ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}{agent.paused ? '恢复' : '暂停'}</button>
                        <button onClick={() => void removeAgent(agent.type)} disabled={state.agents.length <= 1}><Trash size={18} aria-hidden />移除</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="sheet-wide-action" onClick={() => setInviteOpen(true)} disabled={state.agents.length >= 3}><UserPlus size={20} aria-hidden />邀请新成员</button>
                <button className="sheet-text-action" onClick={() => void toggleMemoryManager()}>{showMemories ? '收起记忆管理' : '管理已确认记忆'}</button>
                <button className="sheet-text-action" aria-pressed={mutterEnabled} onClick={toggleMutter}>{mutterEnabled ? '关闭碎碎念' : '开启碎碎念'}</button>
              </>
            ) : (
              <div className="invite-list">
                <button className="sheet-back" onClick={() => setInviteOpen(false)}><ArrowLeft size={18} aria-hidden />返回成员列表</button>
                {availableToInvite.map((persona) => (
                  <button key={persona.type} onClick={() => void inviteAgent(persona.type)}>
                    <span><CharacterAvatar type={persona.type} size={48} /><span><strong>{characterName(persona.type)}</strong><small>{getCharacterByType(persona.type)?.shortFragment ?? persona.hook}</small></span></span>
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
                <button key={reason.tag} className={negativeTags.includes(reason.tag) ? 'selected' : ''} aria-pressed={negativeTags.includes(reason.tag)} onClick={() => setNegativeTags((current) => current.includes(reason.tag) ? current.filter((tag) => tag !== reason.tag) : current.length < 4 ? [...current, reason.tag] : current)}>{reason.label}</button>
              ))}
            </div>
            <button className="sheet-submit" disabled={negativeTags.length === 0} onClick={() => void submitFeedback(negativeTarget, 'negative', negativeTags)}>提交反馈</button>
          </section>
        </div>
      )}

      {messageMenu && (
        <div className="sheet-backdrop" role="presentation" onMouseDown={() => setMessageMenu(null)}>
          <section className="sheet message-sheet" role="dialog" aria-modal="true" aria-labelledby="message-actions-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><h2 id="message-actions-title">{characterName(messageMenu.agent)}</h2><span>这条回复</span></div><button autoFocus className="icon-button" onClick={() => setMessageMenu(null)} aria-label="关闭"><X size={22} aria-hidden /></button></header>
            <button onClick={() => { setCalled(messageMenu.agent); setMessageMenu(null); }}><UsersThree size={19} aria-hidden />点名继续追问</button>
            {messageMenu.messageId && <button className={feedback[messageMenu.messageId]?.rating === 'positive' ? 'selected' : ''} aria-pressed={feedback[messageMenu.messageId]?.rating === 'positive'} onClick={() => { void submitFeedback(messageMenu.messageId!, 'positive'); setMessageMenu(null); }}><ThumbsUp size={19} aria-hidden />{feedback[messageMenu.messageId]?.rating === 'positive' ? '已标记为有帮助' : '标记为有帮助'}</button>}
            {messageMenu.messageId && <button className={feedback[messageMenu.messageId]?.rating === 'negative' ? 'selected' : ''} aria-pressed={feedback[messageMenu.messageId]?.rating === 'negative'} onClick={() => { setNegativeTarget(messageMenu.messageId!); setNegativeTags(feedback[messageMenu.messageId!]?.tags ?? []); setMessageMenu(null); }}><ThumbsDown size={19} aria-hidden />告诉我们哪里不对</button>}
          </section>
        </div>
      )}
    </div>
  );
}

export default function RoomPage() {
  return <Suspense fallback={<div className="room-loading" role="status">正在进入对话…</div>}><RoomView /></Suspense>;
}
