import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { getStrings } from "../src/localization.js";
import { getWebviewHtml } from "../src/webview/getWebviewHtml.js";

function extractScript(): string {
  const html = getWebviewHtml({ cspSource: "test-source" } as never, getStrings("en"), {
    cursor: "https://example.test/cursor-32.png",
    codex: "https://example.test/codex-32.png",
    claude: "https://example.test/claude-32.png"
  });
  const script = html.match(/<script nonce="[^"]+">([\s\S]+)<\/script>/)?.[1];
  if (!script) throw new Error("Could not extract the webview script from the rendered HTML.");
  return script;
}

function makeCanvasContext(): unknown {
  const state: Record<string, unknown> = {};
  return new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      return (...args: unknown[]) => {
        if (prop === "createImageData") {
          const width = args[0] as number;
          const height = args[1] as number;
          return { data: new Uint8ClampedArray(width * height * 4), width, height };
        }
        return undefined;
      };
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    }
  });
}

function makeElement(id: string): Record<string, unknown> {
  const element: Record<string, unknown> = {
    id,
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() {
      return null;
    },
    removeAttribute() {},
    getContext: () => makeCanvasContext(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    focus() {},
    clientWidth: 100,
    clientHeight: 100
  };
  return element;
}

/**
 * Executes the webview's inline <script> in a minimally-stubbed DOM so ordering bugs
 * (temporal-dead-zone references, undefined globals, etc.) throw here instead of only
 * surfacing as "the pet stopped rendering" once installed in a real editor.
 */
function runWebviewScript(): { postedMessages: unknown[] } {
  const script = extractScript();
  const elements = new Map<string, Record<string, unknown>>();
  const postedMessages: unknown[] = [];

  const documentStub = {
    hidden: false,
    addEventListener() {},
    getElementById(id: string) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    }
  };

  class ResizeObserverStub {
    observe() {}
    disconnect() {}
  }

  class ImageStub {
    addEventListener() {}
  }

  const sandbox: Record<string, unknown> = {
    console,
    document: documentStub,
    window: {
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => {},
      setTimeout,
      clearTimeout,
      addEventListener() {}
    },
    performance: { now: () => 0 },
    ResizeObserver: ResizeObserverStub,
    Image: ImageStub,
    acquireVsCodeApi: () => ({ postMessage: (message: unknown) => postedMessages.push(message) }),
    setTimeout,
    clearTimeout,
    Math,
    Uint8ClampedArray
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { filename: "webview-script.js" });

  return { postedMessages };
}

describe("Pet webview script execution", () => {
  it("runs top-to-bottom without throwing and signals readiness to the extension", () => {
    const { postedMessages } = runWebviewScript();
    expect(postedMessages).toContainEqual({ type: "ready" });
  });
});
