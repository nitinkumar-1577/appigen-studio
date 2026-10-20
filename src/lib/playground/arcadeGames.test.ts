import { describe, expect, it } from "vitest";
import {
  buyTower,
  createDefense,
  createPlatformer,
  createRacer,
  createShooter,
  moveRacer,
  startDefenseWave,
  tickDefense,
  tickPlatformer,
  tickRacer,
  tickShooter,
} from "./arcadeGames";

describe("arcade game rules", () => {
  it("keeps racing lanes bounded, spawns traffic and registers a collision", () => {
    const atLeftEdge = { ...createRacer(), lane: 0 };
    expect(moveRacer(atLeftEdge, -1).lane).toBe(0);
    const spawning = tickRacer({ ...createRacer(), ticks: 9 }, () => 0.6);
    expect(spawning.obstacles).toEqual([{ id: 10, lane: 1, y: -0.08 }]);
    const hit = tickRacer({ ...createRacer(), obstacles: [{ id: 1, lane: 1, y: 0.75 }] });
    expect(hit.lives).toBe(2);
  });

  it("supports platform jumps, shard collection and level completion", () => {
    const jumped = tickPlatformer(createPlatformer(), { jump: true });
    expect(jumped.y).toBeLessThan(82);
    const shard = tickPlatformer({ ...createPlatformer(), x: 16 }, { right: true });
    expect(shard.coins).toContain(18);
    const atGate = { ...createPlatformer(), x: 93, coins: [18, 37] };
    expect(tickPlatformer(atGate, { right: true }).won).toBe(true);
  });

  it("charges for valid defense sites and launches escalating waves", () => {
    const bought = buyTower(createDefense(), 14);
    expect(bought.coins).toBe(60);
    expect(buyTower(bought, 14)).toBe(bought);
    expect(startDefenseWave(bought).spawnLeft).toBe(6);
  });

  it("moves and fires the ship, destroys targets and loses hull on a breach", () => {
    const shot = tickShooter({ ...createShooter(), ticks: 3 }, { fire: true }, () => 0.5);
    expect(shot.shots).toContainEqual({ x: 50, y: 82 });
    const hit = tickShooter({
      ...createShooter(),
      shots: [{ x: 50, y: 15 }],
      enemies: [{ id: 1, x: 50, y: 11 }],
    }, {});
    expect(hit.score).toBe(100);
    const breach = tickShooter({ ...createShooter(), enemies: [{ id: 2, x: 50, y: 88 }] }, {});
    expect(breach.lives).toBe(2);
  });
});
