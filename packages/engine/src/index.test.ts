import { describe, expect, it } from "vitest";
import { STEPS_PER_SECOND, stepsToMs } from "./index.ts";

describe("stepsToMs", () => {
  it("maps one second of steps to 1000 ms", () => {
    expect(stepsToMs(STEPS_PER_SECOND)).toBe(1000);
  });

  it("maps zero steps to zero", () => {
    expect(stepsToMs(0)).toBe(0);
  });
});
