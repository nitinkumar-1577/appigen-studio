import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, Flame, Flag, Gauge, Heart, Move, RotateCcw, Sparkles, Target, TowerControl, Zap } from "lucide-react";
import {
  buyTower,
  createDefense,
  createPlatformer,
  createRacer,
  createShooter,
  DEFENSE_PADS,
  moveRacer,
  PLATFORM_COINS,
  PLATFORM_SURFACES,
  startDefenseWave,
  tickDefense,
  tickPlatformer,
  tickRacer,
  tickShooter,
  TOWER_COST,
} from "@/lib/playground/arcadeGames";

type GameKey = "racing" | "platformer" | "defense" | "shooter";
const gameOptions: Array<{ id: GameKey; title: string; description: string; tag: string; icon: typeof Gauge }> = [
  { id: "racing", title: "Velocity Run", description: "Thread through traffic. Keep your line, survive the rush.", tag: "RACING", icon: Gauge },
  { id: "platformer", title: "Skybound", description: "Jump the skyline, collect the shards, reach the gate.", tag: "PLATFORMER", icon: Move },
  { id: "defense", title: "Last Bastion", description: "Build a turret line and hold the route against enemy waves.", tag: "TOWER DEFENSE", icon: TowerControl },
  { id: "shooter", title: "Nova Strike", description: "Pilot the interceptor, clear the swarm, stay in orbit.", tag: "SPACE SHOOTER", icon: Target },
];

export const ArcadeGames = () => {
  const [active, setActive] = useState<GameKey>("racing");
  const selected = gameOptions.find((game) => game.id === active)!;
  return (
    <section className="arcade-shell">
      <div className="arcade-heading"><div><span className="arcade-eyebrow"><Sparkles className="h-3.5 w-3.5" /> ARCADE / FOUR CHALLENGES</span><h2>Pick your next challenge.</h2><p>Four playable game modes. Choose a card to jump in.</p></div><span className="arcade-live"><i /> All games playable</span></div>
      <div className="arcade-picker" role="tablist" aria-label="Arcade games">
        {gameOptions.map((game, index) => <button role="tab" aria-selected={game.id === active} key={game.id} onClick={() => setActive(game.id)} className={`arcade-game-tab ${game.id} ${game.id === active ? "active" : ""}`}>
          <span className="arcade-tab-icon"><game.icon className="h-[18px] w-[18px]" /></span><span><small>{game.tag}</small><b>{game.title}</b></span><i>0{index + 1}</i>
        </button>)}
      </div>
      <div className={`arcade-playfield ${active}`} key={active}>
        {active === "racing" && <RacingGame />}
        {active === "platformer" && <PlatformerGame />}
        {active === "defense" && <DefenseGame />}
        {active === "shooter" && <ShooterGame />}
      </div>
      <div className="arcade-footnote"><span>SELECTED MODE</span><b>{selected.title}</b><i /> Keyboard, touch, and mouse controls supported</div>
    </section>
  );
};

const lanePercent = (lane: number) => [21, 50, 79][lane];

const RacingGame = () => {
  const [game, setGame] = useState(createRacer);
  const move = (direction: -1 | 1) => setGame((state) => moveRacer(state, direction));
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") { event.preventDefault(); move(-1); }
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") { event.preventDefault(); move(1); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setGame((state) => tickRacer(state)), 180);
    return () => window.clearInterval(timer);
  }, []);
  const reset = () => setGame(createRacer());
  return <div className="race-game">
    <div className="race-hud"><div><small>DISTANCE</small><b>{Math.floor(game.score / 5).toLocaleString()} <i>m</i></b></div><div><small>PACE</small><b>{Math.min(280, 120 + Math.floor(game.score / 8))} <i>km/h</i></b></div><div><small>CAR CONDITION</small><span className="race-hearts">{Array.from({ length: 3 }, (_, index) => <Heart key={index} className={index < game.lives ? "heart-on" : ""} />)}</span></div><button onClick={reset} aria-label="Restart race"><RotateCcw /></button></div>
    <div className="race-track">
      <div className="race-skyline">{Array.from({ length: 13 }, (_, index) => <i key={index} style={{ height: `${32 + (index * 19) % 68}%` }} />)}</div>
      <div className="race-road"><i className="road-edge left" /><i className="road-edge right" /><i className="road-lane lane-one" /><i className="road-lane lane-two" />
        {game.obstacles.map((car) => <div className={`race-traffic car-${car.id % 4}`} key={car.id} style={{ left: `${lanePercent(car.lane)}%`, top: `${car.y * 100}%` }}><i /><span /></div>)}
        <div className="race-player-car" style={{ left: `${lanePercent(game.lane)}%` }} aria-label="Your car"><i /><span /></div>
        {game.crashed && <div className="race-over"><span>{game.lives <= 0 ? "RACE OVER" : "FINISH"}</span><b>You held on for {Math.floor(game.score / 5)} meters.</b><button onClick={reset}><RotateCcw /> Race again</button></div>}
        <div className="race-sign">NIGHT CIRCUIT <span>SECTOR 08</span></div>
      </div>
    </div>
    <div className="race-controls"><span>STEER YOUR CAR</span><button aria-label="Steer left" onClick={() => move(-1)}><ArrowLeft /></button><button aria-label="Steer right" onClick={() => move(1)}><ArrowRight /></button><small>← → or A / D</small></div>
  </div>;
};

const PlatformerGame = () => {
  const [game, setGame] = useState(createPlatformer);
  const input = useRef({ left: false, right: false, jump: false });
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowleft", "arrowright", "arrowup", " "].includes(key)) event.preventDefault();
      if (key === "arrowleft" || key === "a") input.current.left = true;
      if (key === "arrowright" || key === "d") input.current.right = true;
      if (key === "arrowup" || key === "w" || key === " ") input.current.jump = true;
    };
    const keyup = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "arrowleft" || key === "a") input.current.left = false;
      if (key === "arrowright" || key === "d") input.current.right = false;
      if (key === "arrowup" || key === "w" || key === " ") input.current.jump = false;
    };
    const clear = () => { input.current = { left: false, right: false, jump: false }; };
    window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup); window.addEventListener("blur", clear);
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", clear); };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setGame((state) => tickPlatformer(state, input.current)), 38);
    return () => window.clearInterval(timer);
  }, []);
  const reset = () => { input.current = { left: false, right: false, jump: false }; setGame(createPlatformer()); };
  return <div className="platform-game">
    <div className="platform-hud"><div><small>SKY SHARDS</small><b>{game.coins.length}<i> / 4</i></b></div><div><small>RUN SCORE</small><b>{game.score.toLocaleString()}</b></div><div><small>ENERGY</small><span>{Array.from({ length: 3 }, (_, i) => <i key={i} className={i < game.lives ? "energy-on" : ""} />)}</span></div><button aria-label="Restart level" onClick={reset}><RotateCcw /></button></div>
    <div className="platform-world" tabIndex={0} aria-label="Skybound platform game">
      <div className="platform-moon" /><div className="platform-cloud cloud-one" /><div className="platform-cloud cloud-two" /><div className="platform-city">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ height: `${18 + (i * 29) % 44}%` }} />)}</div>
      <div className="platform-stars">✦ &nbsp; · &nbsp; ✧ &nbsp; · &nbsp; ✦</div>
      {PLATFORM_SURFACES.map((surface, index) => <div key={index} className={`platform-ledge ledge-${index}`} style={{ left: `${surface.x}%`, width: `${surface.width}%`, top: `${surface.y}%` }} />)}
      {PLATFORM_COINS.filter((coin) => !game.coins.includes(coin)).map((coin) => <div className="platform-coin" key={coin} style={{ left: `${coin}%`, top: `${82 - (coin % 3) * 5}%` }}>✦</div>)}
      <div className="platform-goal"><Flag /><span>EXIT</span></div>
      <div className="platform-hero" style={{ left: `${game.x}%`, top: `${game.y}%` }}><i /><span /></div>
      {(game.won || game.lives <= 0) && <div className="platform-over"><span>{game.won ? "LEVEL CLEAR" : "TRY AGAIN"}</span><b>{game.won ? "You made it to the sky gate." : "The city is still waiting."}</b><button onClick={reset}><RotateCcw /> Play again</button></div>}
      <div className="platform-world-label">CLOUDLINE · STAGE 01</div>
    </div>
    <div className="platform-controls"><span>MOVE & JUMP</span><button aria-label="Move left" onPointerDown={() => { input.current.left = true; }} onPointerUp={() => { input.current.left = false; }} onPointerLeave={() => { input.current.left = false; }}><ArrowLeft /></button><button aria-label="Move right" onPointerDown={() => { input.current.right = true; }} onPointerUp={() => { input.current.right = false; }} onPointerLeave={() => { input.current.right = false; }}><ArrowRight /></button><button className="jump-button" onClick={() => { input.current.jump = true; window.setTimeout(() => { input.current.jump = false; }, 120); }}><ArrowUp /> Jump</button><small>WASD / arrows · Space to jump</small></div>
  </div>;
};

const pathPoint = (progress: number) => {
  const segments = [
    { from: [0, 25], to: [22, 25], length: 22 },
    { from: [22, 25], to: [22, 70], length: 45 },
    { from: [22, 70], to: [45, 70], length: 23 },
    { from: [45, 70], to: [45, 28], length: 42 },
    { from: [45, 28], to: [70, 28], length: 25 },
    { from: [70, 28], to: [70, 75], length: 47 },
    { from: [70, 75], to: [100, 75], length: 30 },
  ];
  const length = segments.reduce((total, segment) => total + segment.length, 0);
  let distance = progress * length;
  for (const segment of segments) {
    if (distance <= segment.length) {
      const t = distance / segment.length;
      return { x: segment.from[0] + (segment.to[0] - segment.from[0]) * t, y: segment.from[1] + (segment.to[1] - segment.from[1]) * t };
    }
    distance -= segment.length;
  }
  return { x: 100, y: 75 };
};

const DefenseGame = () => {
  const [game, setGame] = useState(createDefense);
  useEffect(() => {
    const timer = window.setInterval(() => setGame((state) => tickDefense(state)), 120);
    return () => window.clearInterval(timer);
  }, []);
  const reset = () => setGame(createDefense());
  return <div className="defense-game">
    <div className="defense-hud"><div><small>WAVE</small><b>{String(game.wave).padStart(2, "0")}</b></div><div><small>COINS</small><b className="coin-readout">◆ {game.coins}</b></div><div><small>BASE SHIELDS</small><b className="shield-readout">{game.lives} <i>/ 12</i></b></div><div><small>HOSTILES</small><b>{game.enemies.length + game.spawnLeft}</b></div><button onClick={reset} aria-label="Reset tower defense"><RotateCcw /></button></div>
    <div className="defense-map">
      <div className="defense-grid" />
      <svg className="defense-route" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="0,25 22,25 22,70 45,70 45,28 70,28 70,75 100,75" /></svg>
      <div className="defense-route-label start">ENTRY</div><div className="defense-route-label end">CORE</div>
      {game.towers.map((pad) => <div key={pad} className="defense-tower" style={{ left: `${pad}%`, top: `${pad % 2 ? 47 : 11}%` }}><TowerControl /></div>)}
      {DEFENSE_PADS.map((pad, index) => !game.towers.includes(pad) && <button key={pad} className="defense-pad" aria-label={`Build tower at site ${index + 1}`} onClick={() => setGame((state) => buyTower(state, pad))} style={{ left: `${pad}%`, top: `${index % 2 ? 47 : 11}%` }}><span>+</span><small>{TOWER_COST}</small></button>)}
      {game.enemies.map((enemy) => { const position = pathPoint(enemy.progress); return <div key={enemy.id} className="defense-enemy" style={{ left: `${position.x}%`, top: `${position.y}%` }}><i style={{ width: `${enemy.health * 20}%` }} /></div>; })}
      <span className="defense-map-caption">FORTRESS LINE · NORTH PASS</span>
    </div>
    <div className="defense-controls"><div><b><TowerControl className="h-4 w-4" /> TACTICAL OVERVIEW</b><small>Deploy towers near the route, then launch a wave. Defeated enemies fund your next defense.</small></div><button disabled={game.spawnLeft > 0 || game.enemies.length > 0 || game.lives <= 0} onClick={() => setGame((state) => startDefenseWave(state))}><Flame className="h-4 w-4" />{game.lives <= 0 ? "BASE LOST" : game.wave ? "LAUNCH NEXT WAVE" : "BEGIN WAVE 01"}</button></div>
  </div>;
};

const ShooterGame = () => {
  const [game, setGame] = useState(createShooter);
  const keys = useRef({ left: false, right: false, fire: false });
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      if (key === "arrowleft" || key === "a") keys.current.left = true;
      if (key === "arrowright" || key === "d") keys.current.right = true;
      if (key === " ") keys.current.fire = true;
    };
    const keyup = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "arrowleft" || key === "a") keys.current.left = false;
      if (key === "arrowright" || key === "d") keys.current.right = false;
      if (key === " ") keys.current.fire = false;
    };
    const clear = () => { keys.current = { left: false, right: false, fire: false }; };
    window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup); window.addEventListener("blur", clear);
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", clear); };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setGame((state) => tickShooter(state, keys.current)), 75);
    return () => window.clearInterval(timer);
  }, []);
  const reset = () => { keys.current = { left: false, right: false, fire: false }; setGame(createShooter()); };
  return <div className="shooter-game">
    <div className="shooter-hud"><div><small>SECTOR SCORE</small><b>{String(game.score).padStart(6, "0")}</b></div><div><small>HULL INTEGRITY</small><span>{Array.from({ length: 3 }, (_, index) => <i key={index} className={index < game.lives ? "hull-on" : ""} />)}</span></div><div><small>THREAT LEVEL</small><b>SECTOR {String(1 + Math.floor(game.score / 500)).padStart(2, "0")}</b></div><button aria-label="Restart space shooter" onClick={reset}><RotateCcw /></button></div>
    <div className="space-field">
      <div className="space-nebula" />
      {Array.from({ length: 46 }, (_, index) => <i key={index} className={`space-star star-${index % 4}`} style={{ left: `${(index * 47 + 9) % 100}%`, top: `${(index * 73 + 3) % 100}%`, animationDelay: `${(index % 7) * -.4}s` }} />)}
      <div className="space-planet" />
      {game.enemies.map((enemy) => <div className="space-enemy" key={enemy.id} style={{ left: `${enemy.x}%`, top: `${enemy.y}%` }}><i /></div>)}
      {game.shots.map((shot, index) => <div className="space-shot" key={`${index}-${shot.y}`} style={{ left: `${shot.x}%`, top: `${shot.y}%` }} />)}
      <div className="space-ship" style={{ left: `${game.x}%` }}><i /><span /></div>
      {game.lives <= 0 && <div className="space-over"><span>SHIP DESTROYED</span><b>Final score · {game.score.toLocaleString()}</b><button onClick={reset}><RotateCcw /> Relaunch</button></div>}
      <span className="space-field-label">NOVA SECTOR · 01</span>
    </div>
    <div className="space-controls"><div><b><Zap className="h-4 w-4" /> INTERCEPTOR CONTROLS</b><small>Move with A / D or ← / → · Hold Space or fire to attack</small></div><div className="space-pad"><button aria-label="Move ship left" onPointerDown={() => { keys.current.left = true; }} onPointerUp={() => { keys.current.left = false; }} onPointerLeave={() => { keys.current.left = false; }}><ArrowLeft /></button><button aria-label="Move ship right" onPointerDown={() => { keys.current.right = true; }} onPointerUp={() => { keys.current.right = false; }} onPointerLeave={() => { keys.current.right = false; }}><ArrowRight /></button><button className="fire-button" onPointerDown={() => { keys.current.fire = true; }} onPointerUp={() => { keys.current.fire = false; }} onPointerLeave={() => { keys.current.fire = false; }}><Zap /> FIRE</button></div></div>
  </div>;
};
