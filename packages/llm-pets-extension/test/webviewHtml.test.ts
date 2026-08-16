import { describe, expect, it } from "vitest";
import { getStrings } from "../src/localization.js";
import { getWebviewHtml } from "../src/webview/getWebviewHtml.js";
import { PET_BACKGROUND_IDS } from "../src/webview/backgrounds.js";

const TEST_PROVIDER_ICON_URIS = {
  cursor: "https://example.test/cursor-32.png",
  codex: "https://example.test/codex-32.png",
  claude: "https://example.test/claude-32.png"
};

function renderHtml(locale: "en" | "ja" = "en") {
  return getWebviewHtml({ cspSource: "test-source" } as never, getStrings(locale), TEST_PROVIDER_ICON_URIS);
}

describe("Pet webview HTML", () => {
  it("contains syntactically valid webview JavaScript", () => {
    const html = renderHtml();
    const script = html.match(/<script nonce="[^"]+">([\s\S]+)<\/script>/)?.[1];
    expect(script).toBeDefined();
    expect(() => new Function(script!)).not.toThrow();
  });

  it("contains a procedural renderer for every bundled scene", () => {
    const html = renderHtml();
    for (const backgroundId of PET_BACKGROUND_IDS) {
      if (backgroundId === "none") continue;
      const escaped = backgroundId.replace(/[-]/g, "\\$&");
      const pattern = new RegExp(`['"]?${escaped}['"]?\\s*:\\s*\\{`);
      expect(html, backgroundId).toMatch(pattern);
    }
  });

  it("holds the idle rest frame for a random two to five seconds", () => {
    const html = renderHtml();
    expect(html).toContain("pet.state === 'idle'");
    expect(html).toContain("2000 + Math.round(Math.random() * 3000)");
  });

  it("renders English UI and the Hooks onboarding action", () => {
    const html = renderHtml("ja");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Waiting for the first hook event");
    expect(html).toContain("setupHooks");
  });

  it("uses the same Pet sizing constraints with and without a background", () => {
    const html = renderHtml();
    expect(html).toContain(".pet { position: absolute;");
    expect(html).toContain("max-width: 92%; max-height: 90%");
    expect(html).toContain(".stage.has-background .pet { filter:");
    expect(html).not.toContain(".stage.has-background .pet { position:");
  });

  it("fits auto size to the stage and recalculates after resize", () => {
    const html = renderHtml();
    expect(html).toContain("pet.scale === 'auto'");
    expect(html).toContain("stage.clientWidth * 0.92 / pet.frameWidth");
    expect(html).toContain("stage.clientHeight * 0.9 / pet.frameHeight");
    expect(html).toContain("if (currentPet?.scale === 'auto')");
  });

  it("renders custom images decoratively and never layers them over Canvas scenes", () => {
    const html = renderHtml();
    expect(html).toContain('id="pet-custom-background"');
    expect(html).toContain('aria-hidden="true" alt="" hidden');
    expect(html).toContain(".custom-background { object-fit: cover; image-rendering: auto; }");
    expect(html).toContain("const hasCanvasBackground = !hasCustomBackground");
    expect(html).toContain("background.hidden = !hasCanvasBackground");
    expect(html).toContain("customBackground.style.opacity");
    expect(html).toContain("type: 'customBackgroundLoadFailed'");
  });

  it("plays one waving reaction on activation and restores the latest state", () => {
    const html = renderHtml();
    expect(html).toContain('role="button" tabindex="0"');
    expect(html).toContain(".pet:focus-visible { outline:");
    expect(html).toContain("sprite.addEventListener('click', (event)");
    expect(html).toContain("if (event.button === 0) wavePet()");
    expect(html).toContain("event.key !== 'Enter' && event.key !== ' '");
    expect(html).toContain("interactionCooldownUntil = now + 1500");
    expect(html).toContain("currentPet = data.pet");
    expect(html).toContain("if (!interactionActive) showPet(data.pet)");
    expect(html).toContain("if (currentPet) showPet(currentPet)");
    expect(html).toContain("loadedSpriteUri === pet.spriteUri");
    expect(html).toContain("startRendering(loadedSpriteSheet)");
    expect(html).toContain("if (sprite.width !== width) sprite.width = width");
    expect(html).toContain("if (sprite.height !== height) sprite.height = height");
    expect(html).toContain('"waveAction":"Wave hello"');
    expect(html).toContain('"wavingStatus":"Waving"');
  });

  it("tracks the pointer onto v2 look-direction cells while idle", () => {
    const html = renderHtml();
    expect(html).toContain("currentPet.lookDirections");
    expect(html).toContain("Math.atan2(direction.x, -direction.y)");
    expect(html).toContain("stage.addEventListener('pointermove'");
    expect(html).toContain("stage.addEventListener('pointerleave'");
    expect(html).toContain("pet.state !== 'idle'");
    expect(html).toContain("lookCell.column * pet.frameWidth");
    expect(html).toContain("lookCell.row * pet.frameHeight");
  });

  it("renders a bundled pixel-art provider toggle in the bottom-left of the stage", () => {
    const html = renderHtml();
    expect(html).toContain('id="provider-toggle"');
    expect(html).toContain('<img id="provider-icon"');
    expect(html).toContain(".provider-toggle {");
    expect(html).toContain(".provider-toggle img {");
    expect(html).toContain("image-rendering: pixelated");
    expect(html).toContain("providerToggle.addEventListener('click'");
    expect(html).toContain("type: 'cycleHookProvider'");
    expect(html).toContain("data.type === 'setHookProvider'");
    expect(html).toContain("showProviderIcon(data.provider)");
    expect(html).toContain(JSON.stringify(TEST_PROVIDER_ICON_URIS.cursor));
    expect(html).toContain(JSON.stringify(TEST_PROVIDER_ICON_URIS.codex));
    expect(html).toContain(JSON.stringify(TEST_PROVIDER_ICON_URIS.claude));
    expect(html).toContain('"hookProviderLabel":"Hook provider"');
  });
});
