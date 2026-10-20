export type PlayerId = "ruby" | "sapphire";
export type TokenProgress = number;

export interface LudoState {
  tokens: Record<PlayerId, TokenProgress[]>;
  turn: PlayerId;
  die: number | null;
  winner: PlayerId | null;
}

export const TRACK_COUNT = 52;
export const FINISH_PROGRESS = 57;
export const SAFE_SPACES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const PLAYER_START: Record<PlayerId, number> = { ruby: 0, sapphire: 26 };

export const createLudoGame = (): LudoState => ({
  tokens: { ruby: [-1, -1, -1, -1], sapphire: [-1, -1, -1, -1] },
  turn: "ruby",
  die: null,
  winner: null,
});

export const legalTokenMoves = (tokens: TokenProgress[], die: number): number[] =>
  tokens.flatMap((progress, index) => {
    if (progress === FINISH_PROGRESS) return [];
    if (progress === -1) return die === 6 ? [index] : [];
    return progress + die <= FINISH_PROGRESS ? [index] : [];
  });

export const applyLudoMove = (
  state: LudoState,
  player: PlayerId,
  tokenIndex: number,
  die: number,
): LudoState => {
  if (state.winner || state.turn !== player || state.die !== die || die < 1 || die > 6) return state;
  const progress = state.tokens[player][tokenIndex];
  if (progress === undefined || !legalTokenMoves(state.tokens[player], die).includes(tokenIndex)) return state;

  const tokens: LudoState["tokens"] = {
    ruby: [...state.tokens.ruby],
    sapphire: [...state.tokens.sapphire],
  };
  tokens[player][tokenIndex] = progress === -1 ? 0 : progress + die;

  const nextProgress = tokens[player][tokenIndex];
  if (nextProgress >= 0 && nextProgress < TRACK_COUNT) {
    const landing = (PLAYER_START[player] + nextProgress) % TRACK_COUNT;
    if (!SAFE_SPACES.has(landing)) {
      const opponent: PlayerId = player === "ruby" ? "sapphire" : "ruby";
      tokens[opponent] = tokens[opponent].map((position) => {
        if (position < 0 || position >= TRACK_COUNT) return position;
        return (PLAYER_START[opponent] + position) % TRACK_COUNT === landing ? -1 : position;
      });
    }
  }

  const won = tokens[player].every((position) => position === FINISH_PROGRESS);
  return {
    tokens,
    turn: die === 6 || won ? player : player === "ruby" ? "sapphire" : "ruby",
    die: null,
    winner: won ? player : null,
  };
};

export const chooseComputerToken = (state: LudoState, die: number): number | null => {
  const moves = legalTokenMoves(state.tokens.sapphire, die);
  if (!moves.length) return null;
  return moves.sort((a, b) => {
    const score = (index: number) => {
      const progress = state.tokens.sapphire[index];
      const next = progress === -1 ? 0 : progress + die;
      const landing = (PLAYER_START.sapphire + next) % TRACK_COUNT;
      const captures = state.tokens.ruby.some(
        (position) => position >= 0 && position < TRACK_COUNT &&
          (PLAYER_START.ruby + position) % TRACK_COUNT === landing,
      );
      return (next === FINISH_PROGRESS ? 100 : 0) + (captures ? 40 : 0) + next;
    };
    return score(b) - score(a);
  })[0];
};
