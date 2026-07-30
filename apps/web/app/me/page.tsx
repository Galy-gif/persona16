'use client';

import { useEffect, useState } from 'react';
import { BellSimple, Database, Microphone, ShieldCheck, Trash, X } from '@phosphor-icons/react';
import { MobileNav } from '../../components/MobileNav';
import { characterName } from '../../lib/characters';
import { clearRooms, fetchMemories, resolveMemory, type SavedMemory } from '../../lib/client';

const MEMORY_KEY = 'persona16.memory.enabled';
const MOTION_KEY = 'persona16.motion.reduced';

export default function MePage() {
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [memories, setMemories] = useState<SavedMemory[]>([]);
  const [memoryState, setMemoryState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setMemoryEnabled(localStorage.getItem(MEMORY_KEY) !== 'false');
    setReduceMotion(localStorage.getItem(MOTION_KEY) === 'true');
    void fetchMemories('confirmed')
      .then((items) => { setMemories(items); setMemoryState('ready'); })
      .catch(() => setMemoryState('unavailable'));
  }, []);

  function updateMemory(value: boolean) {
    setMemoryEnabled(value);
    localStorage.setItem(MEMORY_KEY, String(value));
    setNotice(value ? '后续只会使用你确认过的记忆。' : '新对话不会读取已确认记忆。');
  }

  function updateMotion(value: boolean) {
    setReduceMotion(value);
    localStorage.setItem(MOTION_KEY, String(value));
    document.documentElement.dataset.reduceMotion = String(value);
  }

  async function removeMemory(memory: SavedMemory) {
    try {
      await resolveMemory(memory.id, 'delete');
      setMemories((current) => current.filter((item) => item.id !== memory.id));
    } catch {
      setNotice('暂时没能删除这条记忆，请稍后再试。');
    }
  }

  function clearLocalHistory() {
    if (!window.confirm('清除这台设备上的对话入口吗？服务端房间与已确认记忆不会被删除。')) return;
    clearRooms();
    setNotice('已清除这台设备上的对话入口。');
  }

  return (
    <div className="app-shell">
      <main className="app-screen me-screen">
        <header className="page-title">
          <span className="wordmark">persona16</span>
          <h1>我的</h1>
          <p>你决定什么可以留下，也可以随时撤回。</p>
        </header>

        {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="关闭提示"><X size={17} aria-hidden /></button></div>}

        <section className="settings-group">
          <header><Database size={21} weight="fill" aria-hidden /><div><h2>记忆与数据</h2><p>只有你确认过的内容才会进入后续对话。</p></div></header>
          <label className="setting-row">
            <span><strong>使用已确认记忆</strong><small>关闭后保留记录，但不注入新对话</small></span>
            <input type="checkbox" checked={memoryEnabled} onChange={(event) => updateMemory(event.target.checked)} />
          </label>
          <label className="setting-row">
            <span><strong>减少角色动态</strong><small>为后续动画预留的无障碍选项</small></span>
            <input type="checkbox" checked={reduceMotion} onChange={(event) => updateMotion(event.target.checked)} />
          </label>
          <button className="setting-action" onClick={clearLocalHistory}><Trash size={18} aria-hidden /><span><strong>清除本机对话入口</strong><small>不删除服务端房间与记忆</small></span></button>
        </section>

        <section className="settings-group memory-manager">
          <header><ShieldCheck size={21} weight="fill" aria-hidden /><div><h2>已确认的记忆</h2><p>可追溯、可删除，不做隐藏画像。</p></div></header>
          {memoryState === 'loading' && <p className="settings-empty">正在读取…</p>}
          {memoryState === 'unavailable' && <p className="settings-empty">服务暂不可用；聊天页仍可逐条确认和管理。</p>}
          {memoryState === 'ready' && memories.length === 0 && <p className="settings-empty">目前还没有已确认的记忆。</p>}
          {memories.map((memory) => (
            <div className="memory-row" key={memory.id}>
              <span><strong>{characterName(memory.agent)}</strong><p>{memory.content}</p></span>
              <button onClick={() => void removeMemory(memory)} aria-label="删除这条记忆"><Trash size={17} aria-hidden /></button>
            </div>
          ))}
        </section>

        <section className="settings-group coming-soon">
          <header><BellSimple size={21} weight="fill" aria-hidden /><div><h2>以后再开放</h2><p>先把文字关系和多人房间做好。</p></div></header>
          <div className="placeholder-row"><BellSimple size={18} aria-hidden /><span><strong>人物主动联系</strong><small>占位：需要通知权限与打扰边界</small></span><em>准备中</em></div>
          <div className="placeholder-row"><Microphone size={18} aria-hidden /><span><strong>语音对话</strong><small>占位：需要独立的语音安全与成本控制</small></span><em>准备中</em></div>
        </section>

        <p className="product-boundary">persona16 使用大众文化中的 16 型原型作为人物创作先验，不是心理诊断、官方 MBTI® 测评或专业支持的替代品。</p>
      </main>
      <MobileNav />
    </div>
  );
}
