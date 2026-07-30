'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, ClockCounterClockwise, PaperPlaneTilt } from '@phosphor-icons/react';
import { CharacterAvatar } from '../components/CharacterAvatar';
import { MobileNav } from '../components/MobileNav';
import { CHARACTERS, type CharacterSlug } from '../lib/characters';
import { createServerRoom, saveRoom } from '../lib/client';

export default function Home() {
  const router = useRouter();
  const [selectedSlug, setSelectedSlug] = useState<CharacterSlug>('lin-heng');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(
    () => CHARACTERS.find((character) => character.slug === selectedSlug) ?? CHARACTERS[0]!,
    [selectedSlug],
  );

  async function startConversation() {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const room = await createServerRoom([selected.type]);
      saveRoom({ id: room.id, agents: [selected.type], version: room.version, updatedAt: Date.now() });
      router.push(`/room?id=${room.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '暂时没能开始对话，请稍后再试');
      setStarting(false);
    }
  }

  return (
    <div className="app-shell app-shell-home">
      <main className="app-screen home-screen">
        <header className="brand-row">
          <span className="wordmark"><i>persona</i><b>16</b></span>
          <Link className="icon-surface" href="/conversations" aria-label="查看对话历史">
            <ClockCounterClockwise size={20} weight="light" aria-hidden />
          </Link>
        </header>

        <section className="home-intro">
          <span className="section-kicker">A quiet place to talk</span>
          <h1>今天，想和谁<br /><em>说说话？</em></h1>
          <p>从一个人开始。聊着聊着，也可以请别人进来。</p>
        </section>

        <div className="character-picker" aria-label="选择人物">
          {CHARACTERS.map((character) => {
            const active = character.slug === selected.slug;
            return (
              <button
                key={character.slug}
                className={`character-choice${active ? ' active' : ''}`}
                style={{ '--character-accent': character.accent } as React.CSSProperties}
                aria-pressed={active}
                onClick={() => setSelectedSlug(character.slug)}
              >
                <span className="character-choice-avatar">
                  <CharacterAvatar type={character.type} size={58} priority={character.slug === 'lin-heng'} />
                </span>
                <span className="character-choice-name">{character.name}</span>
              </button>
            );
          })}
        </div>

        <section
          className="selected-character"
          style={{
            '--character-accent': selected.accent,
            '--character-soft': selected.soft,
            '--character-shadow': selected.shadow,
          } as React.CSSProperties}
          aria-live="polite"
        >
          <div className="character-stage">
            <span className="stage-orbit" aria-hidden />
            <CharacterAvatar key={selected.type} type={selected.type} size={194} priority />
            <span className="stage-shadow" aria-hidden />
          </div>
          <div className="selected-copy">
            <span className="selected-index">0{CHARACTERS.findIndex((character) => character.slug === selected.slug) + 1} / 04</span>
            <h2>{selected.name}</h2>
            <p>{selected.fragment}</p>
          </div>
        </section>

        <div className="home-actions">
          <button
            className="conversation-launcher"
            style={{ '--character-accent': selected.accent, '--character-shadow': selected.shadow } as React.CSSProperties}
            onClick={() => void startConversation()}
            disabled={starting}
          >
            <span className="launcher-orb" aria-hidden><PaperPlaneTilt size={15} weight="fill" /></span>
            <span>
              <small>{starting ? '正在准备对话' : `和${selected.name}说点什么`}</small>
              <strong>{starting ? '请稍等…' : '从此刻开始'}</strong>
            </span>
            <span className="launcher-arrow" aria-hidden><ArrowUpRight size={20} /></span>
          </button>
          <Link className="text-action" href={`/characters/${selected.slug}`}>先认识{selected.name}<ArrowUpRight size={15} aria-hidden /></Link>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
