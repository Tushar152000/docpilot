import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { chunkText, cosine, hashEmbedding, rrf, toOrTsQuery } from './text-utils';

test('chunkText keeps chunks under the size limit and preserves content', () => {
  const para = 'Refunds are processed within 7 business days. '.repeat(40);
  const chunks = chunkText(`${para}\n\n${para}`, 500, 100);
  assert.ok(chunks.length > 2);
  for (const c of chunks) assert.ok(c.length <= 500 + 100 + 2, `chunk too long: ${c.length}`);
  assert.ok(chunks.join(' ').includes('Refunds are processed'));
});

test('chunkText carries overlap into the next chunk', () => {
  const text = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} talks about topic number ${i}.`).join('\n\n');
  const chunks = chunkText(text, 120, 40);
  assert.ok(chunks.length > 1);
  const tail = chunks[0].slice(-15);
  assert.ok(chunks[1].includes(tail.trim().split(' ').pop()!));
});

test('chunkText handles empty input', () => {
  assert.deepEqual(chunkText('   \n\n  '), []);
});

test('hashEmbedding is normalised and similar texts score higher', () => {
  const a = hashEmbedding('refund policy for the DSA course');
  const b = hashEmbedding('what is the refund policy for courses');
  const c = hashEmbedding('office wifi password and parking rules');
  assert.equal(a.length, 1536);
  assert.ok(Math.abs(Math.sqrt(a.reduce((s, v) => s + v * v, 0)) - 1) < 1e-9);
  assert.ok(cosine(a, b) > cosine(a, c));
});

test('toOrTsQuery drops stopwords and joins with OR', () => {
  assert.equal(toOrTsQuery('What is the refund policy?'), 'refund | policy');
  assert.equal(toOrTsQuery('???'), '');
});

test('rrf rewards items ranked well in multiple lists', () => {
  const scores = rrf([
    ['a', 'b', 'c'],
    ['b', 'd'],
  ]);
  const ranked = [...scores.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id);
  assert.equal(ranked[0], 'b');
});
