import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Bot, Dice5, RotateCcw, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import {
  applyLudoMove,
  chooseComputerToken,
  createLudoGame,
  legalTokenMoves,
  PLAYER_START,
  SAFE_SPACES,
  TRACK_COUNT,
  type LudoState,
  type PlayerId,
} from "@/lib/playground/ludo";

const PLAYERS: Record<PlayerId, { name: string; color: string; className: string }> = {
  ruby: { name: "You", color: "#fb5e6e", className: "ruby" },
  sapphire: { name: "CPU", color: "#59a7ff", className: "sapphire" },
};

const tokenTrackPosition = (player: PlayerId, progress: number) => {
  const angle = ((PLAYER_START[player] + progress) / TRACK_COUNT) * Math.PI * 2 - Math.PI / 2;
  return { x: 50 + 37 * Math.cos(angle), y: 50 + 37 * Math.sin(angle) };
};

const homePosition = (player: PlayerId, progress: number) => {
  const start = tokenTrackPosition(player, 0);
  const ratio = Math.min(1, Math.max(0, (progress - 51) / 6));
  return { x: start.x + (50 - start.x) * ratio, y: start.y + (50 - start.y) * ratio };
};

const yardPosition = (player: PlayerId, index: number) => {
  const slots = [
    { x: 28, y: 21 }, { x: 39, y: 21 }, { x: 28, y: 32 }, { x: 39, y: 32 },
  ];
  const reflected = player === "sapphire" ? { x: 100 - slots[index].x, y: 100 - slots[index].y } : slots[index];
  return reflected;
};

const rollDie = () => Math.floor(Math.random() * 6) + 1;

export const LudoArena = () => {
  const [game, setGame] = useState<LudoState>(createLudoGame);
  const [message, setMessage] = useState("Roll a six to bring a token onto the board.");
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const gameRef = useRef(game);
  gameRef.current = game;
  const legalMoves = useMemo(
    () => game.die === null || game.winner ? [] : legalTokenMoves(game.tokens[game.turn], game.die),
    [game],
  );

  const finishTurn = (state: LudoState, die: number): LudoState => {
    if (state.winner) return state;
    if (die === 6) return { ...state, die: null };
    return { ...state, die: null, turn: state.turn === "ruby" ? "sapphire" : "ruby" };
  };

  const moveToken = (player: PlayerId, index: number, die: number) => {
    const moved = applyLudoMove(game, player, index, die);
    if (moved === game) return;
    if (moved.winner) {
      setMessage(`${PLAYERS[player].name} brought every token home!`);
    } else {
      const opponent: PlayerId = player === "ruby" ? "sapphire" : "ruby";
      const captured = moved.tokens[opponent]
        .filter((position, tokenIndex) => position === -1 && game.tokens[opponent][tokenIndex] >= 0)
        .length;
      setMessage(captured ? `Nice hit! ${captured} CPU token${captured === 1 ? "" : "s"} sent home.` : die === 6 ? "Six! Take another turn." : "Token moved. The CPU is up next.");
    }
    setGame(moved);
  };

  const reset = () => {
    setGame(createLudoGame());
    setMessage("Roll a six to bring a token onto the board.");
    setLastRoll(null);
    setIsThinking(false);
  };

  useEffect(() => {
    if (game.winner || game.turn !== "sapphire" || game.die !== null) return;
    setIsThinking(true);
    const timeout = window.setTimeout(() => {
      const die = rollDie();
      setLastRoll(die);
      setGame((current) => ({ ...current, die }));
      const options = legalTokenMoves(game.tokens.sapphire, die);
      if (!options.length) {
        setMessage(`CPU rolled ${die} and has no legal move.`);
        window.setTimeout(() => {
          setGame((current) => current.die === die ? finishTurn(current, die) : current);
          setIsThinking(false);
        }, 800);
        return;
      }
      setMessage(`CPU rolled ${die}.`);
      window.setTimeout(() => {
        const current = gameRef.current;
        if (current.die !== die || current.turn !== "sapphire") return;
        const chosen = chooseComputerToken(current, die);
        const moved = chosen === null ? finishTurn(current, die) : applyLudoMove(current, "sapphire", chosen, die);
        if (moved.winner) setMessage("CPU brought every token home. Better luck next time!");
        else setMessage(die === 6 ? "CPU rolled a six and gets another turn." : "Your turn. Roll the die.");
        setGame(moved);
        setIsThinking(false);
      }, 950);
    }, 750);
    return () => window.clearTimeout(timeout);
  }, [game.turn, game.die, game.winner, game.tokens.sapphire]);

  useEffect(() => {
    if (game.turn !== "ruby" || game.die === null || legalMoves.length || game.winner) return;
    const die = game.die;
    setMessage(`No legal moves for ${die}. ${die === 6 ? "Roll again." : "CPU is up next."}`);
    const timeout = window.setTimeout(() => setGame((current) => current.die === die ? finishTurn(current, die) : current), 850);
    return () => window.clearTimeout(timeout);
  }, [game.turn, game.die, game.winner, legalMoves.length]);

  const roll = () => {
    if (game.turn !== "ruby" || game.die !== null || game.winner) return;
    const die = rollDie();
    setLastRoll(die);
    setGame((current) => ({ ...current, die }));
    setMessage(`You rolled ${die}. ${legalTokenMoves(game.tokens.ruby, die).length ? "Choose a glowing token." : "No legal moves."}`);
  };

  const tokensOnBoard = (player: PlayerId, tokenIndex: number, progress: number) => {
    if (progress < 0) return yardPosition(player, tokenIndex);
    if (progress >= 52) return homePosition(player, progress);
    return tokenTrackPosition(player, progress);
  };

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 rounded-3xl border border-white/[0.08] bg-[#111a2b] p-4 shadow-2xl sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.22em] text-amber-300">
              <Sparkles className="h-3.5 w-3.5" /> Classic board, clever CPU
            </div>
            <h2 className="mt-1 text-xl font-bold text-white">Ludo: last token standing</h2>
          </div>
          <button onClick={reset} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[.09]">
            <RotateCcw className="h-3.5 w-3.5" /> New match
          </button>
        </div>

        <div className="ludo-layout mx-auto">
          <div className="ludo-board" role="group" aria-label="Ludo board">
            <div className="ludo-board-glow" />
            <div className="ludo-home ruby-home"><span>YOU · RUBY</span><div className="ludo-yard">{game.tokens.ruby.map((progress, index) => <span key={index} />)}</div></div>
            <div className="ludo-home sapphire-home"><span>CPU · SAPPHIRE</span><div className="ludo-yard">{game.tokens.sapphire.map((progress, index) => <span key={index} />)}</div></div>
            <div className="ludo-home-lane ruby-lane">{Array.from({ length: 6 }, (_, index) => <i key={index} />)}</div>
            <div className="ludo-home-lane sapphire-lane">{Array.from({ length: 6 }, (_, index) => <i key={index} />)}</div>
            {Array.from({ length: TRACK_COUNT }, (_, index) => {
              const angle = (index / TRACK_COUNT) * Math.PI * 2 - Math.PI / 2;
              const safe = SAFE_SPACES.has(index);
              return <span key={index} className={`ludo-space ${safe ? "is-safe" : ""}`} style={{ left: `${50 + 37 * Math.cos(angle)}%`, top: `${50 + 37 * Math.sin(angle)}%` }} aria-label={safe ? "Safe space" : undefined}>{safe ? "✦" : ""}</span>;
            })}
            {(["ruby", "sapphire"] as PlayerId[]).flatMap((player) => game.tokens[player].map((progress, index) => {
              const position = tokensOnBoard(player, index, progress);
              const movable = game.turn === player && legalMoves.includes(index);
              return <button
                key={`${player}-${index}`}
                type="button"
                aria-label={`${PLAYERS[player].name} token ${index + 1}${movable ? ", move token" : ""}`}
                disabled={!movable || player !== "ruby"}
                onClick={() => game.die !== null && moveToken(player, index, game.die)}
                className={`ludo-token ${PLAYERS[player].className} ${movable ? "is-movable" : ""} ${progress < 0 ? "in-yard" : ""} ${progress === 57 ? "is-finished" : ""}`}
                style={{ left: `${position.x}%`, top: `${position.y}%`, "--token-color": PLAYERS[player].color } as CSSProperties}
              ><span>{index + 1}</span></button>;
            }))}
            <div className="ludo-center"><Trophy className="h-5 w-5 text-amber-300" /><span>HOME</span></div>
          </div>
        </div>
        <p className="mt-5 flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/[.06] bg-[#0c1320] px-4 py-2 text-center text-sm text-slate-300" aria-live="polite">
          {isThinking && <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />}{message}
        </p>
      </div>

      <aside className="flex flex-col gap-4">
        <div className="rounded-3xl border border-white/[0.08] bg-[#111a2b] p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-slate-400"><Dice5 className="h-4 w-4 text-amber-300" /> Match console</div>
          <div className="my-5 flex items-center justify-between">
            <div className={`ludo-player ${game.turn === "ruby" ? "active" : ""}`}><span className="player-dot ruby-dot" /><div><b>You</b><small>Ruby</small></div></div>
            <span className="text-xs font-bold text-slate-600">VS</span>
            <div className={`ludo-player ${game.turn === "sapphire" ? "active" : ""}`}><span className="player-dot sapphire-dot" /><div><b>CPU</b><small><Bot className="inline h-3 w-3" /> Sapphire</small></div></div>
          </div>
          <div className="ludo-die" aria-label={lastRoll ? `Last roll ${lastRoll}` : "No roll yet"}>{lastRoll ?? "—"}</div>
          {game.winner ? (
            <div className="mt-4 rounded-xl bg-amber-300/10 p-3 text-center text-sm font-bold text-amber-200"><Trophy className="mr-1 inline h-4 w-4" />{game.winner === "ruby" ? "Victory! You won." : "CPU wins this round."}</div>
          ) : (
            <button onClick={roll} disabled={game.turn !== "ruby" || game.die !== null} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-orange-400 px-4 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-amber-500/10 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">
              <Dice5 className="h-4 w-4" />{game.turn === "ruby" ? "Roll the dice" : "CPU thinking…"}
            </button>
          )}
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Star spaces protect tokens from capture.</div>
        </div>
        <div className="rounded-3xl border border-white/[0.08] bg-[#111a2b] p-5">
          <h3 className="text-sm font-bold text-white">Token progress</h3>
          {(["ruby", "sapphire"] as PlayerId[]).map((player) => {
            const tokens = game.tokens[player];
            const finished = tokens.filter((progress) => progress === 57).length;
            const onBoard = tokens.filter((progress) => progress >= 0 && progress < 57).length;
            return <div key={player} className="mt-4">
              <div className="mb-2 flex justify-between text-xs"><span className={player === "ruby" ? "text-rose-300" : "text-sky-300"}>{PLAYERS[player].name}</span><span className="text-slate-500">{finished}/4 home · {onBoard} moving</span></div>
              <div className="flex gap-1.5">{tokens.map((progress, index) => <span key={index} className={`h-2 flex-1 rounded-full ${progress === 57 ? player === "ruby" ? "bg-rose-400" : "bg-sky-400" : progress >= 0 ? player === "ruby" ? "bg-rose-400/50" : "bg-sky-400/50" : "bg-white/10"}`} />)}</div>
            </div>;
          })}
          <p className="mt-5 border-t border-white/[.06] pt-4 text-xs leading-5 text-slate-500">Roll a six to leave the yard. Choose a glowing token to move; land on the CPU to send it home. Get every token home to win.</p>
        </div>
      </aside>
    </section>
  );
};
