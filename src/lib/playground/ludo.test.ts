import { describe, expect, it } from "vitest";
import {
  applyLudoMove,
  chooseComputerToken,
  createLudoGame,
  FINISH_PROGRESS,
  legalTokenMoves,
} from "./ludo";

describe("Ludo rules", () => {
  it("lets every yard token enter the track on a six", () => {
    expect(legalTokenMoves(createLudoGame().tokens.ruby, 6)).toEqual([0, 1, 2, 3]);
    expect(legalTokenMoves(createLudoGame().tokens.ruby, 5)).toEqual([]);
  });

  it("moves a token and gives the player another turn after a six", () => {
    const game = { ...createLudoGame(), die: 6 };
    const moved = applyLudoMove(game, "ruby", 2, 6);
    expect(moved.tokens.ruby).toEqual([-1, -1, 0, -1]);
    expect(moved.turn).toBe("ruby");
    expect(moved.die).toBeNull();
  });

  it.each([0, 1, 2, 3])("allows ruby token %i to enter and advance", (tokenIndex) => {
    const entered = applyLudoMove({ ...createLudoGame(), die: 6 }, "ruby", tokenIndex, 6);
    expect(entered.tokens.ruby[tokenIndex]).toBe(0);
    const advanced = applyLudoMove({ ...entered, die: 2 }, "ruby", tokenIndex, 2);
    expect(advanced.tokens.ruby[tokenIndex]).toBe(2);
  });

  it("captures an opponent on an unsafe space and protects safe spaces", () => {
    const unsafeGame = {
      ...createLudoGame(),
      tokens: { ruby: [4, -1, -1, -1], sapphire: [31, -1, -1, -1] },
      die: 1,
    };
    expect(applyLudoMove(unsafeGame, "ruby", 0, 1).tokens.sapphire[0]).toBe(-1);

    const safeGame = {
      ...unsafeGame,
      tokens: { ruby: [7, -1, -1, -1], sapphire: [34, -1, -1, -1] },
    };
    expect(applyLudoMove(safeGame, "ruby", 0, 1).tokens.sapphire[0]).toBe(34);
  });

  it("requires an exact roll to finish and the computer picks a legal token", () => {
    expect(legalTokenMoves([FINISH_PROGRESS - 2, -1], 3)).toEqual([]);
    expect(legalTokenMoves([FINISH_PROGRESS - 2, -1], 2)).toEqual([0]);
    const game = { ...createLudoGame(), tokens: { ruby: [-1, -1, -1, -1], sapphire: [8, -1, -1, -1] } };
    expect(chooseComputerToken(game, 6)).toBe(0);
  });
});
