'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Trash } from '@phosphor-icons/react';
import { CharacterAvatar } from '../../components/CharacterAvatar';
import { MobileNav } from '../../components/MobileNav';
import { characterName } from '../../lib/characters';
import { deleteRoom, loadRooms, type RoomArchive } from '../../lib/client';

type HistoryFilter = 'all' | 'single' | 'room';

function relativeTime(value: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - value) / 60_000));
  if (minutes < 2) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  return days === 1 ? '昨天' : `${days} 天前`;
}

export default function ConversationsPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomArchive[]>([]);
  const [filter, setFilter] = useState<HistoryFilter>('all');

  useEffect(() => setRooms(loadRooms()), []);

  const visible = useMemo(() => rooms.filter((room) => {
    if (filter === 'single') return room.agents.length === 1;
    if (filter === 'room') return room.agents.length > 1;
    return true;
  }), [filter, rooms]);

  function remove(id: string) {
    if (!window.confirm('从本机对话入口中移除这段记录吗？服务端数据不会被删除。')) return;
    deleteRoom(id);
    setRooms(loadRooms());
  }

  return (
    <div className="app-shell">
      <main className="app-screen conversations-screen">
        <header className="page-title">
          <span className="wordmark">persona16</span>
          <h1>对话</h1>
          <p>回来接着聊，或者另开一个干净的新话题。</p>
        </header>

        <div className="segmented-control" aria-label="筛选对话">
          {([
            ['all', '全部'],
            ['single', '单聊'],
            ['room', '多人'],
          ] as const).map(([value, label]) => (
            <button key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>

        {visible.length === 0 ? (
          <section className="empty-state">
            <div className="empty-avatar-stack">
              <CharacterAvatar type="INTJ" size={72} />
              <CharacterAvatar type="ENFP" size={72} />
            </div>
            <h2>{rooms.length === 0 ? '还没有对话' : '这里暂时是空的'}</h2>
            <p>{rooms.length === 0 ? '先从一个人开始。对话结束后，会从这里回到原来的房间。' : '换一个筛选条件看看。'}</p>
            {rooms.length === 0 && <button className="secondary-cta" onClick={() => router.push('/')}>去认识一个人</button>}
          </section>
        ) : (
          <section className="conversation-list" aria-label="对话历史">
            {visible.map((room) => {
              const names = room.agents.map(characterName);
              return (
                <article key={room.id} className="conversation-row">
                  <button className="conversation-main" onClick={() => router.push(`/room?id=${room.id}`)}>
                    <span className="conversation-avatars" aria-hidden>
                      {room.agents.slice(0, 3).map((type, index) => (
                        <CharacterAvatar key={type} type={type} size={50} className={`stack-${index}`} />
                      ))}
                    </span>
                    <span className="conversation-copy">
                      <strong>{names.join('、')}</strong>
                      <small>{room.agents.length === 1 ? '单聊' : `${room.agents.length} 人房间`} · {relativeTime(room.updatedAt)}</small>
                      <span>继续上一次话题</span>
                    </span>
                    <ArrowRight size={19} aria-hidden />
                  </button>
                  <button className="row-delete" onClick={() => remove(room.id)} aria-label={`移除与${names.join('、')}的本机记录`}><Trash size={18} aria-hidden /></button>
                </article>
              );
            })}
          </section>
        )}
      </main>
      <MobileNav />
    </div>
  );
}
