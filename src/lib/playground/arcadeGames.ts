export interface RacerState {
  lane: number;
  obstacles: Array<{ id: number; lane: number; y: number }>;
  score: number;
  lives: number;
  ticks: number;
  crashed: boolean;
}

export const createRacer = (): RacerState => ({ lane: 1, obstacles: [], score: 0, lives: 3, ticks: 0, crashed: false });

export const moveRacer = (state: RacerState, direction: -1 | 1): RacerState =>
  state.crashed ? state : { ...state, lane: Math.max(0, Math.min(2, state.lane + direction)) };

export const tickRacer = (state: RacerState, random = Math.random): RacerState => {
  if (state.crashed) return state;
  const ticks = state.ticks + 1;
  let lives = state.lives;
  const obstacles = state.obstacles
    .map((obstacle) => ({ ...obstacle, y: obstacle.y + 0.055 }))
    .filter((obstacle) => {
      if (obstacle.y >= 0.78 && obstacle.y <= 0.91 && obstacle.lane === state.lane) {
        lives -= 1;
        return false;
      }
      return obstacle.y < 1.05;
    });
  if (ticks % 10 === 0) obstacles.push({ id: ticks, lane: Math.floor(random() * 3), y: -0.08 });
  return { ...state, ticks, lives, obstacles, score: state.score + 1, crashed: lives <= 0 };
};

export interface PlatformState {
  x: number;
  y: number;
  velocityY: number;
  grounded: boolean;
  coins: number[];
  score: number;
  lives: number;
  won: boolean;
}

export const PLATFORM_COINS = [18, 37, 58, 77];
export const PLATFORM_SURFACES = [
  { x: 0, width: 23, y: 82 },
  { x: 29, width: 15, y: 69 },
  { x: 49, width: 16, y: 59 },
  { x: 70, width: 15, y: 72 },
  { x: 88, width: 12, y: 82 },
];

export const createPlatformer = (): PlatformState => ({
  x: 5, y: 82, velocityY: 0, grounded: true, coins: [], score: 0, lives: 3, won: false,
});

export const tickPlatformer = (
  state: PlatformState,
  input: { left?: boolean; right?: boolean; jump?: boolean },
): PlatformState => {
  if (state.won || state.lives <= 0) return state;
  const x = Math.max(1, Math.min(97, state.x + (input.left ? -1.3 : 0) + (input.right ? 1.3 : 0)));
  let velocityY = state.grounded && input.jump ? -4.3 : state.velocityY + 0.19;
  let y = Math.max(0, state.y + velocityY);
  let grounded = false;
  for (const surface of PLATFORM_SURFACES) {
    const overlaps = x + 1.4 > surface.x && x - 1.4 < surface.x + surface.width;
    if (overlaps && state.y <= surface.y && y >= surface.y && velocityY >= 0) {
      y = surface.y;
      velocityY = 0;
      grounded = true;
      break;
    }
  }
  const coins = [...state.coins];
  for (const coin of PLATFORM_COINS) {
    if (!coins.includes(coin) && Math.abs(x - coin) < 3 && Math.abs(y - (82 - (coin % 3) * 5)) < 7) coins.push(coin);
  }
  const fallen = y > 102;
  return {
    x: fallen ? 5 : x,
    y: fallen ? 82 : y,
    velocityY: fallen ? 0 : velocityY,
    grounded: fallen || grounded,
    coins,
    score: coins.length * 100,
    lives: fallen ? state.lives - 1 : state.lives,
    won: x >= 94 && coins.length >= 2,
  };
};

export interface DefenseEnemy {
  id: number;
  progress: number;
  health: number;
}

export interface DefenseState {
  enemies: DefenseEnemy[];
  towers: number[];
  coins: number;
  lives: number;
  wave: number;
  spawnLeft: number;
  ticks: number;
  score: number;
}

export const DEFENSE_PADS = [14, 30, 47, 64, 82];
export const DEFENSE_PATH = [0, 22, 22, 43, 43, 67, 67, 100];
export const TOWER_COST = 60;

export const createDefense = (): DefenseState => ({
  enemies: [], towers: [], coins: 120, lives: 12, wave: 0, spawnLeft: 0, ticks: 0, score: 0,
});

export const buyTower = (state: DefenseState, pad: number): DefenseState => {
  if (state.coins < TOWER_COST || state.towers.includes(pad) || !DEFENSE_PADS.includes(pad)) return state;
  return { ...state, coins: state.coins - TOWER_COST, towers: [...state.towers, pad] };
};

export const startDefenseWave = (state: DefenseState): DefenseState =>
  state.spawnLeft > 0 || state.enemies.length > 0
    ? state
    : { ...state, wave: state.wave + 1, spawnLeft: 6 + state.wave * 2 };

export const tickDefense = (state: DefenseState): DefenseState => {
  const ticks = state.ticks + 1;
  const enemies = state.enemies.map((enemy) => ({ ...enemy, progress: enemy.progress + 0.0024 }));
  let spawnLeft = state.spawnLeft;
  if (spawnLeft > 0 && ticks % 14 === 0) {
    enemies.push({ id: state.wave * 100 + spawnLeft, progress: 0, health: Math.min(5, 2 + Math.floor(state.wave / 2)) });
    spawnLeft -= 1;
  }

  let coins = state.coins;
  let lives = state.lives;
  let score = state.score;
  for (const enemy of enemies) {
    if (enemy.progress >= 1 && enemy.health > 0) {
      enemy.health = 0;
      lives -= 1;
    }
    if (enemy.health > 0) {
      const pathX = enemy.progress < 0.22 ? enemy.progress * 100 : enemy.progress < 0.43 ? 22 : enemy.progress < 0.67 ? 22 + (enemy.progress - 0.43) * 100 : 46 + (enemy.progress - 0.67) * 163;
      const closeTower = state.towers.find((tower) => Math.abs(tower - pathX) < 17);
      if (closeTower !== undefined && ticks % 8 === 0) {
        enemy.health -= 1;
        if (enemy.health <= 0) {
          coins += 15;
          score += 100;
        }
      }
    }
  }
  return {
    ...state,
    ticks,
    coins,
    lives,
    score,
    spawnLeft,
    enemies: enemies.filter((enemy) => enemy.health > 0 && enemy.progress < 1),
  };
};

export interface ShooterState {
  x: number;
  shots: Array<{ x: number; y: number }>;
  enemies: Array<{ id: number; x: number; y: number }>;
  score: number;
  lives: number;
  ticks: number;
}

export const createShooter = (): ShooterState => ({ x: 50, shots: [], enemies: [], score: 0, lives: 3, ticks: 0 });

export const tickShooter = (
  state: ShooterState,
  input: { left?: boolean; right?: boolean; fire?: boolean },
  random = Math.random,
): ShooterState => {
  if (state.lives <= 0) return state;
  const ticks = state.ticks + 1;
  const x = Math.max(5, Math.min(95, state.x + (input.left ? -2 : 0) + (input.right ? 2 : 0)));
  const shots = state.shots.map((shot) => ({ ...shot, y: shot.y - 7 })).filter((shot) => shot.y > -8);
  if (input.fire && ticks % 4 === 0) shots.push({ x, y: 82 });
  const enemies = state.enemies.map((enemy) => ({ ...enemy, y: enemy.y + 1.15 }));
  if (ticks % 17 === 0) enemies.push({ id: ticks, x: 8 + Math.floor(random() * 84), y: -5 });

  let score = state.score;
  let lives = state.lives;
  const remainingEnemies = enemies.filter((enemy) => {
    if (enemy.y > 88) { lives -= 1; return false; }
    const shot = shots.findIndex((bullet) => Math.abs(bullet.x - enemy.x) < 7 && Math.abs(bullet.y - enemy.y) < 6);
    if (shot >= 0) {
      shots.splice(shot, 1);
      score += 100;
      return false;
    }
    return true;
  });
  return { x, shots, enemies: remainingEnemies, score, lives, ticks };
};
