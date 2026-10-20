import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, Flame, Hand, RotateCcw, Shield, Swords, Zap } from "lucide-react";

type Attack = "jab" | "kick" | null;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const FightArena = () => {
  const [playerX, setPlayerX] = useState(18);
  const [enemyX, setEnemyX] = useState(79);
  const [playerHp, setPlayerHp] = useState(100);
  const [enemyHp, setEnemyHp] = useState(100);
  const [attack, setAttack] = useState<Attack>(null);
  const [enemyAttack, setEnemyAttack] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [winner, setWinner] = useState<"player" | "cpu" | null>(null);
  const [round, setRound] = useState(1);
  const [lastHit, setLastHit] = useState("FIGHT!");
  const keys = useRef(new Set<string>());
  const playerPosition = useRef(18);
  const enemyPosition = useRef(79);
  const playerHealth = useRef(100);
  const enemyHealth = useRef(100);
  const blockingRef = useRef(false);
  const lastPlayerAttack = useRef(0);
  const lastCpuAttack = useRef(0);

  useEffect(() => { playerPosition.current = playerX; }, [playerX]);
  useEffect(() => { enemyPosition.current = enemyX; }, [enemyX]);
  useEffect(() => { playerHealth.current = playerHp; }, [playerHp]);
  useEffect(() => { enemyHealth.current = enemyHp; }, [enemyHp]);
  useEffect(() => { blockingRef.current = blocking; }, [blocking]);

  const playerStrike = useCallback((kind: Exclude<Attack, null>) => {
    if (winner || Date.now() - lastPlayerAttack.current < 420) return;
    lastPlayerAttack.current = Date.now();
    setAttack(kind);
    window.setTimeout(() => setAttack(null), 260);
    const reach = kind === "jab" ? 24 : 31;
    if (Math.abs(enemyPosition.current - playerPosition.current) <= reach) {
      const damage = kind === "jab" ? 8 : 14;
      const health = clamp(enemyHealth.current - damage, 0, 100);
      enemyHealth.current = health;
      setEnemyHp(health);
      setLastHit(`${kind === "jab" ? "JAB" : "POWER KICK"} · −${damage}`);
      if (!health) setWinner("player");
    } else {
      setLastHit("Out of range — close the gap");
    }
  }, [winner]);

  const cpuStrike = useCallback(() => {
    if (winner || Date.now() - lastCpuAttack.current < 1300) return;
    lastCpuAttack.current = Date.now();
    setEnemyAttack(true);
    window.setTimeout(() => setEnemyAttack(false), 300);
    const protectedHit = blockingRef.current;
    const damage = protectedHit ? 3 : 9 + Math.floor(Math.random() * 6);
    const health = clamp(playerHealth.current - damage, 0, 100);
    playerHealth.current = health;
    setPlayerHp(health);
    setLastHit(protectedHit ? `BLOCKED · −${damage}` : `CPU STRIKE · −${damage}`);
    if (!health) setWinner("cpu");
  }, [winner]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowleft", "arrowright", " ", "j", "k"].includes(key)) event.preventDefault();
      keys.current.add(key);
      if (!event.repeat && key === "j") playerStrike("jab");
      if (!event.repeat && key === "k") playerStrike("kick");
      if (key === " ") setBlocking(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      keys.current.delete(key);
      if (key === " ") setBlocking(false);
    };
    const onBlur = () => { keys.current.clear(); setBlocking(false); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [playerStrike]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (winner) return;
      const held = keys.current;
      let nextPlayer = playerPosition.current;
      if (held.has("arrowleft") || held.has("a")) nextPlayer -= 1.7;
      if (held.has("arrowright") || held.has("d")) nextPlayer += 1.7;
      if (nextPlayer !== playerPosition.current) {
        nextPlayer = clamp(nextPlayer, 6, 87);
        playerPosition.current = nextPlayer;
        setPlayerX(nextPlayer);
      }

      let nextEnemy = enemyPosition.current;
      const distance = Math.abs(nextEnemy - playerPosition.current);
      if (distance > 20) nextEnemy += nextEnemy > playerPosition.current ? -0.75 : 0.75;
      nextEnemy = clamp(nextEnemy, 8, 90);
      if (nextEnemy !== enemyPosition.current) {
        enemyPosition.current = nextEnemy;
        setEnemyX(nextEnemy);
      }
      if (distance <= 24 && Math.random() > 0.82) cpuStrike();
    }, 80);
    return () => window.clearInterval(timer);
  }, [cpuStrike, winner]);

  const reset = () => {
    playerPosition.current = 18;
    enemyPosition.current = 79;
    playerHealth.current = 100;
    enemyHealth.current = 100;
    setPlayerX(18);
    setEnemyX(79);
    setPlayerHp(100);
    setEnemyHp(100);
    setWinner(null);
    setAttack(null);
    setEnemyAttack(false);
    setBlocking(false);
    setLastHit("FIGHT!");
    setRound((value) => value + 1);
    keys.current.clear();
    lastPlayerAttack.current = 0;
    lastCpuAttack.current = 0;
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-white/[.08] bg-[#111827] shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[.07] px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3"><span className="fight-title-icon"><Swords className="h-5 w-5" /></span><div><h2 className="font-bold text-white">Neon Clash</h2><p className="text-xs text-slate-500">Ranked sparring · Round {round}</p></div></div>
        <div className="flex items-center gap-2 rounded-full border border-rose-400/20 bg-rose-400/[.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.18em] text-rose-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />Live match</div>
      </div>

      <div className="fight-scoreboard">
        <div className="fight-score-side"><div className="fight-avatar player-avatar">A</div><div className="min-w-0 flex-1"><div className="mb-1.5 flex justify-between text-xs"><b className="text-white">YOU <small className="ml-1 font-normal text-cyan-300">PLAYER 01</small></b><span className="text-slate-400">{playerHp}%</span></div><div className="fight-health"><span className="player-health" style={{ width: `${playerHp}%` }} /></div></div></div>
        <div className="fight-round">VS<span>ROUND {round}</span></div>
        <div className="fight-score-side enemy-score"><div className="min-w-0 flex-1"><div className="mb-1.5 flex justify-between text-xs"><span className="text-slate-400">{enemyHp}%</span><b className="text-white">CPU <small className="ml-1 font-normal text-rose-300">RIVAL</small></b></div><div className="fight-health"><span className="cpu-health" style={{ width: `${enemyHp}%` }} /></div></div><div className="fight-avatar cpu-avatar">X</div></div>
      </div>

      <div className={`fight-stage ${winner ? "round-over" : ""}`}>
        <div className="fight-sun" /><div className="fight-scanlines" />
        <div className="fight-city">{Array.from({ length: 13 }, (_, i) => <i key={i} style={{ height: `${35 + ((i * 17) % 55)}%` }} />)}</div>
        <div className="fight-grid" />
        <div className="fight-spotlight left" /><div className="fight-spotlight right" />
        <div className="fight-stage-label"><Activity className="h-3 w-3" /> {lastHit}</div>
        <div className={`fighter player-fighter ${attack ? `attacking ${attack}` : ""} ${blocking ? "blocking" : ""}`} style={{ left: `${playerX}%` }}>
          <div className="fighter-glow" /><div className="fighter-head"><span /></div><div className="fighter-body"><i className="arm front" /><i className="arm back" /><i className="leg front" /><i className="leg back" /></div>
          {attack && <div className="hit-flash player-flash" />}
        </div>
        <div className={`fighter cpu-fighter ${enemyAttack ? "attacking cpu-attack" : ""}`} style={{ left: `${enemyX}%` }}>
          <div className="fighter-glow" /><div className="fighter-head"><span /></div><div className="fighter-body"><i className="arm front" /><i className="arm back" /><i className="leg front" /><i className="leg back" /></div>
          {enemyAttack && <div className="hit-flash cpu-flash" />}
        </div>
        {winner && <div className="fight-winner"><span>{winner === "player" ? "VICTORY" : "DEFEAT"}</span><b>{winner === "player" ? "The crowd is yours." : "The rival takes this round."}</b><button onClick={reset}><RotateCcw className="h-4 w-4" /> Run it back</button></div>}
        <div className="fight-floor"><span>PLAYER 01</span><span>NEON DISTRICT · 2049</span><span>CPU RIVAL</span></div>
      </div>

      <div className="fight-controls">
        <div className="fight-control-copy"><span className="flex items-center gap-1.5 text-xs font-bold text-white"><Zap className="h-3.5 w-3.5 text-amber-300" /> Combat controls</span><small>Move with A / D or ← / → · J jab · K kick · hold Space to block</small></div>
        <div className="fight-control-buttons">
          <button className="fight-action move-action" aria-label="Move left" onClick={() => { playerPosition.current = clamp(playerPosition.current - 7, 6, 87); setPlayerX(playerPosition.current); }}><ArrowLeft /></button>
          <button className="fight-action move-action" aria-label="Move right" onClick={() => { playerPosition.current = clamp(playerPosition.current + 7, 6, 87); setPlayerX(playerPosition.current); }}><ArrowRight /></button>
          <button className="fight-action jab-action" onClick={() => playerStrike("jab")}><Hand className="h-4 w-4" /> Jab</button>
          <button className="fight-action kick-action" onClick={() => playerStrike("kick")}><Flame className="h-4 w-4" /> Kick</button>
          <button className={`fight-action block-action ${blocking ? "is-blocking" : ""}`} onMouseDown={() => setBlocking(true)} onMouseUp={() => setBlocking(false)} onMouseLeave={() => setBlocking(false)} onTouchStart={() => setBlocking(true)} onTouchEnd={() => setBlocking(false)}><Shield className="h-4 w-4" /> Block</button>
        </div>
      </div>
    </section>
  );
};
