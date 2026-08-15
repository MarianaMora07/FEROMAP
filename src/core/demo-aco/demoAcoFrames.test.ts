import { describe, expect, it } from 'vitest';
import { runDemoAcoWithFrames } from './demoAcoFrames';
import { MAZE_SIMPLE } from './mazes';

describe('demoAcoFrames', () => {
  it('genera más frames que snapshots de iteración', () => {
    const result = runDemoAcoWithFrames(MAZE_SIMPLE, {
      ants: 4,
      iterations: 3,
      patience: 0,
      seed: 7,
      includeInitialSnapshot: true,
    });

    expect(result.frames.length).toBeGreaterThan(result.snapshots.length);
    const moveFrames = result.frames.filter((frame) => frame.phase === 'ant_move');
    expect(moveFrames.length).toBeGreaterThan(0);
    expect(moveFrames[0]?.decision).toBeDefined();
  });
});
