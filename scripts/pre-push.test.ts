// Runs .githooks/pre-push for real: a throwaway bare remote + clone using this repo's hooks.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const HOOKS = resolve(__dirname, '../.githooks');
let dir: string;
let work: string;

const git = (...args: string[]) => execFileSync('git', args, { cwd: work, encoding: 'utf8' });
const push = (...args: string[]) => spawnSync('git', ['push', '-q', 'origin', ...args], { cwd: work, encoding: 'utf8' });
function commit(file: string, text: string) {
  writeFileSync(join(work, file), text);
  git('add', file);
  git('commit', '-q', '-m', `edit ${file}`);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'prepush-'));
  work = join(dir, 'work');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', join(dir, 'remote.git')]);
  execFileSync('git', ['clone', '-q', join(dir, 'remote.git'), work], { stdio: 'ignore' });
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  git('checkout', '-q', '-b', 'main');
  commit('STATUS.md', '# STATUS\n');
  expect(push('main').status).toBe(0); // no hook yet: seed the remote
  git('config', 'core.hooksPath', HOOKS);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('pre-push hook', () => {
  it('blocks a push whose new commits never touch STATUS.md, and says what to add', () => {
    commit('app.ts', 'x');
    const r = push('main');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('update STATUS.md');
    expect(r.stderr).toContain('**Changed:**');
  });

  it('allows the push once any of the new commits updates STATUS.md', () => {
    commit('app.ts', 'x');
    commit('STATUS.md', '# STATUS\n\n### today\n');
    commit('app.ts', 'y');
    const r = push('main');
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('Trov');
  });

  it('checks a brand-new branch against what the remote already has', () => {
    git('checkout', '-q', '-b', 'feature');
    commit('app.ts', 'x');
    expect(push('feature').status).not.toBe(0);
    commit('STATUS.md', '# STATUS\n\n### feature\n');
    expect(push('feature').status).toBe(0);
  });

  it('lets through pushes with nothing new, branch deletions and tags', () => {
    git('checkout', '-q', '-b', 'copy');
    expect(push('copy').status).toBe(0); // same commits as main: nothing new
    expect(push('--delete', 'copy').status).toBe(0);
    git('tag', 'v1');
    expect(push('v1').status).toBe(0);
  });

  it('can be skipped on purpose with --no-verify', () => {
    commit('app.ts', 'x');
    expect(push('--no-verify', 'main').status).toBe(0);
  });
});
