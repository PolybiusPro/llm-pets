import { describe, expect, it } from "vitest";
import { PetStateMachine } from "../src/pet/PetStateMachine.js";
import type { SpriteAnimation } from "../src/pet/types.js";

const looping: SpriteAnimation = {
  row: 0,
  startColumn: 0,
  frameCount: 1,
  frameDurationMs: 100,
  loop: true
};

describe("PetStateMachine", () => {
  it("supports the expected manual transitions", () => {
    const machine = new PetStateMachine();
    expect(machine.state).toBe("idle");
    expect(machine.setState("running")).toBe(true);
    expect(machine.setState("waiting")).toBe(true);
    expect(machine.setState("running")).toBe(true);
    expect(machine.setState("review")).toBe(true);
    expect(machine.setState("failed")).toBe(true);
  });

  it("does not restart the same state", () => {
    const machine = new PetStateMachine();
    expect(machine.setState("idle")).toBe(false);
    machine.setState("running");
    expect(machine.setState("running")).toBe(false);
  });

  it("returns to idle after a non-looping animation", () => {
    const machine = new PetStateMachine();
    machine.setState("review");
    expect(machine.completeAnimation({ ...looping, loop: false })).toBe(true);
    expect(machine.state).toBe("idle");
  });

  it("keeps looping animations in their current state", () => {
    const machine = new PetStateMachine();
    machine.setState("running");
    expect(machine.completeAnimation(looping)).toBe(false);
    expect(machine.state).toBe("running");
  });
});
