import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('npm metadata', () => {
  it('stays search-friendly', () => {
    expect(pkg.description.length).toBeLessThanOrEqual(120);
    expect(pkg.keywords.length).toBeGreaterThanOrEqual(8);
    expect(pkg.keywords.length).toBeLessThanOrEqual(12);
    expect(pkg.repository.url).toMatch(/github\.com\/Krrishkumar125\//);
    expect(pkg.homepage).toBeTruthy();
    expect(pkg.bugs).toBeTruthy();
  });
});
