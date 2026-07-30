import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, '../..');

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(repositoryRoot, relativePath), 'utf8')) as T;
}

function readJsonLines<T>(relativePath: string): T[] {
  return readFileSync(resolve(repositoryRoot, relativePath), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function assertEqual(label: string, actual: number, expected: number): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function countCsvDataRows(csv: string): number {
  let records = 0;
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (inQuotes && csv[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === '\n' && !inQuotes) {
      records += 1;
    }
  }

  if (csv.length > 0 && !csv.endsWith('\n')) records += 1;
  return records - 1;
}

interface NaturalConvDialogue {
  content: string[];
}

interface DuLeMonDialogue {
  conversation: string[];
}

const naturalConv = readJson<NaturalConvDialogue[]>(
  'artifacts/corpora/naturalconv-official/extracted/dialog_release.json',
);
const naturalConvUtterances = naturalConv.reduce(
  (total, dialogue) => total + dialogue.content.length,
  0,
);
const naturalConvExactlyTwentyTurns = naturalConv.filter(
  (dialogue) => dialogue.content.length === 20,
).length;
const greetingPattern = /你好|嗨|哈喽|hello|早上好|晚上好|下午好/i;
const naturalConvOpeningGreetings = naturalConv.filter(
  (dialogue) => greetingPattern.test(dialogue.content[0] ?? ''),
).length;

assertEqual('NaturalConv dialogues', naturalConv.length, 19_919);
assertEqual('NaturalConv release utterances', naturalConvUtterances, 400_562);

const cpedSplits = [
  ['train', 'artifacts/corpora/cped-official/data/CPED/train_split.csv', 94_187],
  ['valid', 'artifacts/corpora/cped-official/data/CPED/valid_split.csv', 11_137],
  ['test', 'artifacts/corpora/cped-official/data/CPED/test_split.csv', 27_438],
] as const;
const cpedRows = Object.fromEntries(cpedSplits.map(([name, relativePath, expected]) => {
  const rows = countCsvDataRows(readFileSync(resolve(repositoryRoot, relativePath), 'utf8'));
  assertEqual(`CPED ${name} utterances`, rows, expected);
  return [name, rows];
}));

const dulemonSplits = [
  ['self-train', 'artifacts/corpora/dulemon-official/extracted/DuLeMon/self/train.json'],
  ['self-dev', 'artifacts/corpora/dulemon-official/extracted/DuLeMon/self/dev.json'],
  ['self-test', 'artifacts/corpora/dulemon-official/extracted/DuLeMon/self/test.json'],
  ['both-train', 'artifacts/corpora/dulemon-official/extracted/DuLeMon/both/train.json'],
  ['both-dev', 'artifacts/corpora/dulemon-official/extracted/DuLeMon/both/dev.json'],
  ['both-test', 'artifacts/corpora/dulemon-official/extracted/DuLeMon/both/test.json'],
] as const;
const dulemon = dulemonSplits.flatMap(([, relativePath]) => (
  readJsonLines<DuLeMonDialogue>(relativePath)
));
const dulemonUtterances = dulemon.reduce(
  (total, dialogue) => total + dialogue.conversation.length,
  0,
);

assertEqual('DuLeMon dialogues', dulemon.length, 27_501);
assertEqual('DuLeMon utterances', dulemonUtterances, 448_977);

const characterEvalContexts = readJson<unknown[]>(
  'artifacts/corpora/character-eval-official/data/test_data.jsonl',
);
const characterEvalRewardRatings = readJson<unknown[]>(
  'artifacts/corpora/character-eval-official/rm_train_data.json',
);
assertEqual('CharacterEval released test contexts', characterEvalContexts.length, 4_564);
assertEqual('CharacterEval reward-model ratings', characterEvalRewardRatings.length, 7_228);

interface CharacterDialDialogue {
  dialogue: Array<{ speaker: string; utterance: string }>;
}

const characterDial = readJson<CharacterDialDialogue[]>(
  'artifacts/corpora/character-dial-official/CharacterDial_data/CharacterDial_bilingual.json',
);
const characterDialUtterances = characterDial.reduce(
  (total, dialogue) => total + dialogue.dialogue.length,
  0,
);
assertEqual('CharacterDial dialogues', characterDial.length, 1_034);
assertEqual('CharacterDial utterances', characterDialUtterances, 32_816);

const liveChatSubset = readJson<Record<string, [string, string][]>>(
  'artifacts/corpora/livechat-official-subset/subset.json',
);
const liveChatSubsetPairs = Object.values(liveChatSubset).reduce(
  (total, pairs) => total + pairs.length,
  0,
);
assertEqual('LiveChat official subset pairs', liveChatSubsetPairs, 45);

const report = {
  generatedAt: new Date().toISOString(),
  naturalConv: {
    dialogues: naturalConv.length,
    releaseUtterances: naturalConvUtterances,
    paperUtterances: 400_095,
    releasePaperDifference: naturalConvUtterances - 400_095,
    exactlyTwentyTurns: naturalConvExactlyTwentyTurns,
    exactlyTwentyTurnsRate: naturalConvExactlyTwentyTurns / naturalConv.length,
    openingGreetings: naturalConvOpeningGreetings,
    openingGreetingRate: naturalConvOpeningGreetings / naturalConv.length,
  },
  cped: {
    utterancesBySplit: cpedRows,
    totalUtterances: Object.values(cpedRows).reduce((sum, count) => sum + count, 0),
  },
  dulemon: {
    dialogues: dulemon.length,
    utterances: dulemonUtterances,
  },
  characterEval: {
    releasedTestContexts: characterEvalContexts.length,
    rewardModelRatings: characterEvalRewardRatings.length,
    note: '这两个已发布文件的行数不能直接替代论文所称的 1,785 段对话 / 23,020 examples。',
  },
  characterDial: {
    dialogues: characterDial.length,
    utterances: characterDialUtterances,
  },
  liveChat: {
    officialSubsetStreamers: Object.keys(liveChatSubset).length,
    officialSubsetPairs: liveChatSubsetPairs,
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
