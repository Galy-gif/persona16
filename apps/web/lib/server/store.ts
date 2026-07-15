import { InMemoryPersonaStore, PostgresPersonaStore, type PersonaStore } from '@persona16/store';

declare global {
  // eslint-disable-next-line no-var
  var __persona16Store: PersonaStore | undefined;
}

export function getPersonaStore(): PersonaStore {
  if (globalThis.__persona16Store) return globalThis.__persona16Store;
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    globalThis.__persona16Store = new PostgresPersonaStore(connectionString);
  } else {
    if (process.env.NODE_ENV === 'production' && process.env.PERSONA16_ALLOW_MEMORY_STORE !== '1') {
      throw new Error('DATABASE_URL is required in production');
    }
    globalThis.__persona16Store = new InMemoryPersonaStore();
  }
  return globalThis.__persona16Store;
}
