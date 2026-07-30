'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Sparkle } from '@phosphor-icons/react';
import { CharacterAvatar } from '../../../components/CharacterAvatar';
import { getCharacterBySlug } from '../../../lib/characters';
import { createServerRoom, saveRoom } from '../../../lib/client';

export default function CharacterDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const character = getCharacterBySlug(params.slug);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!character) {
    return (
      <div className="app-shell">
        <main className="app-screen centered-state">
          <h1>没有找到这个人</h1>
          <Link className="primary-cta" href="/">回到人物页</Link>
        </main>
      </div>
    );
  }

  const currentCharacter = character;

  async function startConversation() {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const room = await createServerRoom([currentCharacter.type]);
      saveRoom({ id: room.id, agents: [currentCharacter.type], version: room.version, updatedAt: Date.now() });
      router.push(`/room?id=${room.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '暂时没能开始对话，请稍后再试');
      setStarting(false);
    }
  }

  return (
    <div className="app-shell">
      <main
        className="app-screen detail-screen"
        style={{
          '--character-accent': character.accent,
          '--character-soft': character.soft,
          '--character-shadow': character.shadow,
        } as React.CSSProperties}
      >
        <header className="detail-head">
          <button className="icon-button" onClick={() => router.back()} aria-label="返回">
            <ArrowLeft size={23} aria-hidden />
          </button>
          <span>认识{character.name}</span>
          <span className="head-spacer" />
        </header>

        <section className="detail-hero">
          <CharacterAvatar type={character.type} size={168} priority />
          <span className="eyebrow">刚刚认识</span>
          <h1>{character.name}</h1>
          <p>{character.fragment}</p>
        </section>

        <section className="detail-copy">
          <article>
            <h2>会先注意什么</h2>
            <p>{character.pointOfView}</p>
          </article>
          <article>
            <h2>身上的矛盾</h2>
            <p>{character.tension}</p>
          </article>
          <article className="boundary-note">
            <Sparkle size={19} weight="fill" aria-hidden />
            <div><h2>相处边界</h2><p>{character.boundary}</p></div>
          </article>
        </section>

        <section className="starter-section">
          <h2>不知道怎么开口？</h2>
          {character.starters.map((starter) => (
            <button key={starter} onClick={() => void startConversation()} disabled={starting}>
              <span>{starter}</span><ArrowRight size={18} aria-hidden />
            </button>
          ))}
        </section>

        <div className="sticky-detail-action">
          <button className="primary-cta" onClick={() => void startConversation()} disabled={starting}>
            {starting ? '正在准备对话…' : `和${character.name}聊聊`}
          </button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </main>
    </div>
  );
}
