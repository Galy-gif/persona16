import { PERSONAS } from '@persona16/engine';

/** 生成人工盲测页：隐名展示回复，人工选人格，本地对答案 */
export function renderBlindtestHtml(
  results: {
    question: { id: string; text: string };
    replies: { agent: string; text: string }[];
  }[],
): string {
  const options = PERSONAS.map((p) => `<option value="${p.type}">${p.type} ${p.title}</option>`).join('');
  const data = results.map((r) => ({
    id: r.question.id,
    text: r.question.text,
    // 页面内再洗牌一次的顺序在服务端固定，避免答案位置可预测
    replies: r.replies.map((x) => ({ agent: x.agent, text: x.text })),
  }));

  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>16 人格盲测</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 720px; margin: 0 auto; padding: 16px; background: #fafafa; color: #222; }
  h1 { font-size: 1.3rem; } h2 { font-size: 1.05rem; margin-top: 2rem; }
  .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; padding: 12px 14px; margin: 10px 0; }
  .reply { white-space: pre-wrap; line-height: 1.6; margin-bottom: 8px; }
  select { padding: 6px; border-radius: 6px; }
  .ok { color: #0a7d38; font-weight: 600; } .bad { color: #c0392b; font-weight: 600; }
  button { padding: 10px 18px; border-radius: 8px; border: none; background: #222; color: #fff; font-size: 1rem; margin: 16px 0; }
  .score { font-size: 1.1rem; font-weight: 700; }
</style>
</head>
<body>
<h1>16 人格盲测</h1>
<p>每条回复来自 16 个人格 Agent 中的一个。凭语气和关注点猜猜是谁，全部选完后点"对答案"。</p>
<div id="app"></div>
<button onclick="grade()">对答案</button>
<div id="result" class="score"></div>
<script>
const DATA = ${JSON.stringify(data)};
const app = document.getElementById('app');
// 页面加载时按固定种子洗牌
function shuffle(a, seed) { let s = seed; const r = () => ((s = (s*1664525+1013904223)%4294967296)/4294967296);
  a = a.slice(); for (let i=a.length-1;i>0;i--){ const j=Math.floor(r()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
DATA.forEach((q, qi) => {
  const h = document.createElement('h2');
  h.textContent = '题目 ' + (qi+1) + '：' + q.text;
  app.appendChild(h);
  shuffle(q.replies, 97 + qi).forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = '<div class="reply">' + r.text.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</div>' +
      '<select data-answer="' + r.agent + '"><option value="">——猜猜是谁——</option>${options.replace(/'/g, "\\'")}</select>' +
      ' <span class="verdict"></span>';
    app.appendChild(div);
  });
});
function grade() {
  let hit = 0, total = 0;
  document.querySelectorAll('select').forEach(sel => {
    total++;
    const v = sel.nextElementSibling;
    if (sel.value === sel.dataset.answer) { hit++; v.textContent = '✓ ' + sel.dataset.answer; v.className = 'verdict ok'; }
    else { v.textContent = '✗ 是 ' + sel.dataset.answer; v.className = 'verdict bad'; }
  });
  document.getElementById('result').textContent = '辨识率：' + hit + '/' + total;
}
</script>
</body>
</html>`;
}
