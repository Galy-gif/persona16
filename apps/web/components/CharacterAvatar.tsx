import Image from 'next/image';
import type { AgentType } from '@persona16/engine/types';
import { Circle } from '@phosphor-icons/react/dist/ssr';
import { getCharacterByType } from '../lib/characters';

interface CharacterAvatarProps {
  type: AgentType;
  size?: number;
  priority?: boolean;
  className?: string;
}

export function CharacterAvatar({ type, size = 56, priority = false, className = '' }: CharacterAvatarProps) {
  const character = getCharacterByType(type);

  if (!character) {
    return (
      <span className={`character-avatar character-avatar-fallback ${className}`} style={{ width: size, height: size }} aria-hidden>
        <Circle size={Math.max(20, Math.round(size * 0.42))} weight="fill" />
      </span>
    );
  }

  return (
    <span
      className={`character-avatar ${className}`}
      style={{
        width: size,
        height: size,
        '--character-accent': character.accent,
        '--character-soft': character.soft,
        '--character-shadow': character.shadow,
      } as React.CSSProperties}
    >
      <Image
        src={character.image}
        alt={`${character.name}的雾面水晶猫形象`}
      width={size * 2}
      height={size * 2}
      priority={priority}
      unoptimized
      sizes={`${size}px`}
      />
    </span>
  );
}
