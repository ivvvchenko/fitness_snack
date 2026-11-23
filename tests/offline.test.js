import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const listed = [...sw.matchAll(/^ {2}'([^']+)',$/gm)].map((m) => m[1]);

test('every file cached for offline use exists', () => {
  for (const f of listed) assert.ok(f === './' || existsSync(join(root, f)), `${f} is missing`);
});

test('every script and stylesheet is cached for offline use', () => {
  for (const dir of ['js', 'css']) {
    for (const f of readdirSync(join(root, dir), { recursive: true })) {
      if (/\.(js|css)$/.test(f)) assert.ok(listed.includes(`${dir}/${f}`), `add ${dir}/${f} to sw.js`);
    }
  }
});

test('all links are relative, so the app works under /repo-name/ on GitHub Pages', () => {
  for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'js/app.js']) {
    assert.doesNotMatch(readFileSync(join(root, f), 'utf8'), /(?:href|src|"start_url"|"scope")[=:]\s*"\/|register\('\//, f);
  }
});
