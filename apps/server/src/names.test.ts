import { describe, expect, it } from "vitest";
import { ADJECTIVES, ANIMALS, funnyName } from "./names.ts";
import { cleanNickname } from "./players.ts";

const WORD = /^[A-Z][a-z]+$/;
const NAME_SHAPE = /^[A-Z][a-z]+ [A-Z][a-z]+ ([1-9]|[1-9][0-9])$/;

describe("funny names", () => {
  it("funnyName builds adjective, animal and number", () => {
    expect(funnyName(() => 0)).toBe(`${ADJECTIVES[0]} ${ANIMALS[0]} 1`);
    expect(funnyName(() => 0.999999)).toBe(`${ADJECTIVES[ADJECTIVES.length - 1]} ${ANIMALS[ANIMALS.length - 1]} 99`);
  });

  it("every funny name fits the nickname rule", () => {
    for (const list of [ADJECTIVES, ANIMALS]) {
      expect(list.length).toBeGreaterThanOrEqual(20);
      expect(new Set(list).size).toBe(list.length);
      for (const word of list) expect(word, word).toMatch(WORD);
    }
    for (const adjective of ADJECTIVES) {
      for (const animal of ANIMALS) {
        const name = `${adjective} ${animal} 99`;
        expect(cleanNickname(name), name).toBe(name);
      }
    }
  });

  it("random names have the right shape", () => {
    for (let i = 0; i < 200; i++) expect(funnyName()).toMatch(NAME_SHAPE);
  });
});
