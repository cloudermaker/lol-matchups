import { describe, it, expect } from 'vitest';
import { LANES } from '@lol/shared';

describe('shared types', () => {
  it('exposes the five lanes', () => {
    expect(LANES).toEqual(['top', 'jungle', 'middle', 'bottom', 'support']);
  });
});
