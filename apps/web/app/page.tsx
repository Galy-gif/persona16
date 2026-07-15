'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PERSONAS } from '@persona16/engine/personas';
import type { AgentType, Group } from '@persona16/engine/types';
import { createServerRoom, loadRooms, saveRoom, type RoomArchive } from '../lib/client';

const GROUP_COLOR: Record<Group, string> = {
  NT: 'var(--nt)',
  NF: 'var(--nf)',
  SJ: 'var(--sj)',
  SP: 'var(--sp)',
};

export default function Home() {
  const router = useRouter();
  const [selected, setSelected] = useState<AgentType[]>([]);
  const [recent, setRecent] = useState<RoomArchive[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRecent(loadRooms().slice(0, 3));
  }, []);

  function toggle(type: AgentType) {
    setSelected((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : prev.length >= 3 ? prev : [...prev, type],
    );
  }

  async function start(agents: AgentType[]) {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const room = await createServerRoom(agents);
      saveRoom({ id: room.id, agents, version: room.version, updatedAt: Date.now() });
      router.push(`/room?id=${room.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建房间失败');
      setStarting(false);
    }
  }

  function randomStart() {
    const pool = [...PERSONAS.map((p) => p.type)];
    const n = Math.random() < 0.5 ? 2 : 3;
    const picked: AgentType[] = [];
    while (picked.length < n) {
      const i = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(i, 1)[0]!);
    }
    void start(picked);
  }

  return (
    <div className="container">
      <header className="home-header">
        <h1>persona16</h1>
        <p>选 1 个单聊，或选 2-3 个拉进同一个房间——同一句话，听见不同的理解方式。</p>
      </header>

      {recent.length > 0 && (
        <section className="recent-section">
          <div className="section-heading"><strong>继续最近会谈</strong><span>服务端已保存</span></div>
          {recent.map((r) => (
            <button
              key={r.id}
              className="agent-card"
              style={{ width: '100%', marginBottom: 8 }}
              onClick={() => router.push(`/room?id=${r.id}`)}
            >
              <span className="code">继续最近</span>
              <h3>{r.agents.join(' + ')}</h3>
              <span className="hook">
                继续服务端保存的对话
              </span>
            </button>
          ))}
        </section>
      )}

      <div className="section-heading"><strong>选择会谈成员</strong><span>{selected.length}/3</span></div>
      <div className="grid">
        {PERSONAS.map((p) => (
          <button
            key={p.type}
            className={`agent-card${selected.includes(p.type) ? ' selected' : ''}`}
            onClick={() => toggle(p.type)}
          >
            <span className="dot" style={{ background: GROUP_COLOR[p.group] }} />
            <span className="code">
              <b>{p.type}</b> · {p.group}
            </span>
            <h3>{p.title}</h3>
            <span className="hook">{p.hook}</span>
          </button>
        ))}
      </div>

      <p className="disclaimer">
        这些人格基于 16 型人格的大众文化原型塑造，不是心理诊断，也不是官方 MBTI® 测评。它们不能替代专业帮助；如果你正处在危机中，请联系现实中的专业支持。
      </p>
      {error && <p className="hint">⚠ {error}</p>}

      <div className="toolbar">
        <button className="btn btn-ghost" onClick={randomStart} disabled={starting}>
          随机开局
        </button>
        <button className="btn btn-primary" disabled={selected.length === 0 || starting} onClick={() => void start(selected)}>
          {selected.length === 0
            ? '选 1-3 个开始'
            : selected.length === 1
              ? `和 ${selected[0]} 单聊`
              : starting ? '正在创建…' : `开房间（${selected.join('+')}）`}
        </button>
      </div>
    </div>
  );
}
