export interface HardGateResult<Violation extends string> {
  text: string;
  violations: Violation[];
  regenerated: boolean;
  scoreable: boolean;
}

export async function generateWithHardGate<Violation extends string>(input: {
  attempts: number;
  generate: (attempt: number, previousViolations: readonly Violation[]) => Promise<string>;
  validate: (text: string) => readonly Violation[];
}): Promise<HardGateResult<Violation>> {
  if (input.attempts < 1) throw new Error('硬门至少需要一次生成尝试');
  let text = '';
  let violations: Violation[] = [];
  for (let attempt = 0; attempt < input.attempts; attempt++) {
    text = await input.generate(attempt, violations);
    violations = [...input.validate(text)];
    if (violations.length === 0) {
      return { text, violations, regenerated: attempt > 0, scoreable: true };
    }
  }
  return { text, violations, regenerated: input.attempts > 1, scoreable: false };
}

/**
 * 统一人物、关系和房间评审的硬门：任一生成未通过时，Judge 不得运行。
 */
export async function judgeWhenScoreable<Verdict>(
  results: readonly { scoreable: boolean }[],
  runJudge: () => Promise<Verdict>,
): Promise<Verdict | null> {
  if (results.some((result) => !result.scoreable)) return null;
  return runJudge();
}
