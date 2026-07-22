import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  validateNaturalExpressionCorpus,
  type NaturalExpressionCorpus,
} from './naturalExpressionCorpus';

const corpusUrl = new URL('../corpora/natural-expression-v0.1.json', import.meta.url);
const corpus = JSON.parse(readFileSync(corpusUrl, 'utf8')) as NaturalExpressionCorpus;
const result = validateNaturalExpressionCorpus(corpus);

if (!result.passed) {
  process.stderr.write(`${result.errors.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({
    file: fileURLToPath(corpusUrl),
    version: corpus.version,
    status: corpus.status,
    dimensions: corpus.dimensions.length,
    cases: corpus.cases.length,
    approved: corpus.cases.filter(({ reviewStatus }) => reviewStatus === 'approved').length,
    candidate: corpus.cases.filter(({ reviewStatus }) => reviewStatus === 'candidate').length,
  }, null, 2)}\n`);
}
