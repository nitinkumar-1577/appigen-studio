import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RefreshCw } from "lucide-react";

const GRID_SIZE = 20;
const INITIAL_SNAKE = [
  { x: 10, y: 10 },
  { x: 9, y: 10 },
  { x: 8, y: 10 },
];
const INITIAL_DIRECTION = { x: 1, y: 0 };

function randomApple(snake: Array<{ x: number; y: number }>) {
  const occupied = new Set(snake.map((cell) => `${cell.x}:${cell.y}`));
  let position = { x: 0, y: 0 };
  while (true) {
    position = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
    if (!occupied.has(`${position.x}:${position.y}`)) {
      return position;
    }
  }
}

function isCollision(
  position: { x: number; y: number },
  snake: Array<{ x: number; y: number }>
) {
  return snake.some((segment) => segment.x === position.x && segment.y === position.y);
}

export const SnakeGame = () => {
  const [snake, setSnake] = useState(INITIAL_SNAKE);
  const [direction, setDirection] = useState(INITIAL_DIRECTION);
  const [apple, setApple] = useState(() => randomApple(INITIAL_SNAKE));
  const [score, setScore] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [gameOver, setGameOver] = useState(false);
  const directionRef = useRef(direction);

  useEffect(() => {
    directionRef.current = direction;
  }, [direction]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const key = event.key;
      const nextDirection = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
      } as Record<string, { x: number; y: number }>;

      if (key in nextDirection) {
        const newDirection = nextDirection[key];
        const current = directionRef.current;
        if (current.x + newDirection.x !== 0 || current.y + newDirection.y !== 0) {
          setDirection(newDirection);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isRunning || gameOver) return;
    const interval = window.setInterval(() => {
      setSnake((currentSnake) => {
        const head = currentSnake[0];
        const nextHead = {
          x: (head.x + directionRef.current.x + GRID_SIZE) % GRID_SIZE,
          y: (head.y + directionRef.current.y + GRID_SIZE) % GRID_SIZE,
        };

        if (isCollision(nextHead, currentSnake)) {
          setGameOver(true);
          setIsRunning(false);
          return currentSnake;
        }

        const nextSnake = [nextHead, ...currentSnake];
        const ateApple = nextHead.x === apple.x && nextHead.y === apple.y;

        if (ateApple) {
          setApple(randomApple(nextSnake));
          setScore((current) => current + 1);
          return nextSnake;
        }

        nextSnake.pop();
        return nextSnake;
      });
    }, 120);

    return () => window.clearInterval(interval);
  }, [isRunning, gameOver]);

  const grid = useMemo(() => {
    const cells = [];
    const snakeSet = new Set(snake.map((segment) => `${segment.x}:${segment.y}`));
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const key = `${x}:${y}`;
        const isSnake = snakeSet.has(key);
        const isApple = apple.x === x && apple.y === y;
        cells.push(
          <div
            key={key}
            className={
              "aspect-square w-full rounded-sm border border-slate-900 " +
              (isSnake
                ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]"
                : isApple
                ? "bg-rose-500 shadow-[0_0_10px_rgba(251,113,133,0.5)]"
                : "bg-slate-950"
              )
            }
          />
        );
      }
    }
    return cells;
  }, [apple, snake]);

  const resetGame = () => {
    setSnake(INITIAL_SNAKE);
    setDirection(INITIAL_DIRECTION);
    setApple(randomApple(INITIAL_SNAKE));
    setScore(0);
    setGameOver(false);
    setIsRunning(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-4xl space-y-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Snake Game</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">AppiGen Snake Challenge</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Use arrow keys to control the snake. Eat apples to grow, avoid colliding with yourself, and enjoy the game.
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-sm text-slate-200 shadow-inner sm:w-52">
            <div className="flex items-center justify-between text-slate-300">
              <span>Score</span>
              <span className="font-semibold text-white">{score}</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Status</span>
              <span className={gameOver ? "text-rose-400" : "text-emerald-400"}>{gameOver ? "Game Over" : "Playing"}</span>
            </div>
            <button
              type="button"
              onClick={resetGame}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-700 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-slate-600"
            >
              <RefreshCw className="h-4 w-4" /> Restart
            </button>
          </div>
        </div>

        <div className="grid gap-2 rounded-3xl border border-slate-800 bg-slate-950/90 p-4 shadow-inner">
          <div
            className="grid h-[min(480px,calc(100vw-3rem))] w-[min(480px,calc(100vw-3rem))] grid-cols-20 gap-[1px] rounded-2xl border border-slate-800 bg-slate-900"
          >
            {grid}
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 text-sm text-slate-300 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3">Arrow keys to move</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3">Apples increase score</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3">Wrap-around board</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3">No wall collisions</div>
          </div>
        </div>
      </div>
    </div>
  );
};
