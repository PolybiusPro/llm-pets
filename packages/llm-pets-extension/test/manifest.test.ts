import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const defaultMessages = JSON.parse(readFileSync("package.nls.json", "utf8"));
const englishMessages = JSON.parse(readFileSync("package.nls.en.json", "utf8"));

describe("extension manifest", () => {
  it("registers the animation speed picker in the PET context menu", () => {
    const command = "pet.selectAnimationSpeed";
    expect(manifest.contributes.commands).toContainEqual(expect.objectContaining({ command }));
    expect(manifest.contributes.menus["webview/context"]).toContainEqual(
      expect.objectContaining({ command, group: "navigation@5" })
    );
  });

  it("registers the Pet size picker and supports auto scale", () => {
    const command = "pet.selectSize";
    expect(manifest.contributes.commands).toContainEqual(expect.objectContaining({ command }));
    expect(manifest.contributes.menus["webview/context"]).toContainEqual(
      expect.objectContaining({ command, group: "navigation@6" })
    );
    expect(manifest.contributes.configuration.properties["pet.scale"].anyOf).toContainEqual(
      expect.objectContaining({ type: "string", enum: ["auto"] })
    );
  });

  it("registers a persistent custom image background and opacity controls", () => {
    const commands = ["pet.selectCustomBackground", "pet.selectBackgroundOpacity"];
    for (const command of commands) {
      expect(manifest.contributes.commands).toContainEqual(expect.objectContaining({ command }));
      expect(manifest.contributes.menus["webview/context"]).toContainEqual(
        expect.objectContaining({ command, when: expect.stringContaining("config.pet.background == custom") })
      );
    }
    const properties = manifest.contributes.configuration.properties;
    expect(properties["pet.background"].enum).toContain("custom");
    expect(properties["pet.customBackground.imagePath"]).toMatchObject({
      type: "string",
      default: ""
    });
    expect(properties["pet.customBackground.opacity"]).toMatchObject({
      type: "number",
      default: 1,
      minimum: 0,
      maximum: 1
    });
  });

  it("defines every manifest localization key in English", () => {
    const placeholders = JSON.stringify(manifest).match(/%([^%]+)%/g) ?? [];
    for (const placeholder of placeholders) {
      const key = placeholder.slice(1, -1);
      expect(englishMessages[key], key).toBeTypeOf("string");
      expect(defaultMessages[key], key).toBe(englishMessages[key]);
    }
    expect(Object.keys(defaultMessages).sort()).toEqual(Object.keys(englishMessages).sort());
    expect(defaultMessages["extension.displayName"]).toBe("LLM Pets");
    expect(englishMessages["extension.displayName"]).toBe("LLM Pets");
    expect(manifest.name).toBe("llm-pets-extension");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.contributes.configuration.properties["pet.integrationMode"].enum).toEqual([
      "manual",
      "hooks"
    ]);
    expect(manifest.contributes.configuration.properties["pet.integrationMode"].default).toBe("hooks");
    expect(manifest.contributes.configuration.properties["pet.hookProvider"].enum).toEqual([
      "cursor",
      "codex",
      "claude"
    ]);
    expect(manifest.contributes.configuration.properties["pet.hookProvider"].default).toBe("cursor");
    expect(
      Object.keys(manifest.contributes.configuration.properties).every((key: string) => key.startsWith("pet."))
    ).toBe(true);
    expect(
      manifest.contributes.commands.every((command: { command: string }) => command.command.startsWith("pet."))
    ).toBe(true);
    expect(manifest.contributes.viewsContainers.panel[0].id).toBe("pet.panelContainer");
    expect(manifest.contributes.views["pet.panelContainer"][0].id).toBe("pet.panelView");
    expect(manifest.contributes.commands.some((command: { command: string }) =>
      command.command.includes("AppServer")
    )).toBe(false);
  });

  it("declares a semver @types/vscode range vsce can parse", () => {
    const typeVersion = manifest.devDependencies["@types/vscode"];
    expect(typeVersion, "vsce cannot parse pnpm catalog: as @types/vscode").toMatch(
      /^(?:\^|>=)?\d+\.\d+\.\d+(?:-.*)?$/
    );
  });
});
