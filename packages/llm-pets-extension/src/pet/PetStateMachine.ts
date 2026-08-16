import type { PetState, SpriteAnimation } from "./types.js";

export class PetStateMachine {
  private currentState: PetState = "idle";

  public get state(): PetState {
    return this.currentState;
  }

  public setState(state: PetState): boolean {
    if (state === this.currentState) {
      return false;
    }
    this.currentState = state;
    return true;
  }

  public completeAnimation(animation: SpriteAnimation): boolean {
    if (animation.loop || this.currentState === "idle") {
      return false;
    }
    this.currentState = "idle";
    return true;
  }
}
