import type * as vscode from "vscode";
import type { HookProvider } from "../cursor/hookProvider.js";
import type { UiStrings } from "../localization.js";

const IDLE_BLINK_MIN_DELAY_MS = 2000;
const IDLE_BLINK_MAX_DELAY_MS = 5000;

export function getWebviewHtml(
  webview: vscode.Webview,
  strings: UiStrings,
  providerIconUris: Record<HookProvider, string>
): string {
  const nonce = createNonce();
  const localized = escapeForInlineScript(JSON.stringify({
    ...strings.webview,
    animationAria: undefined,
    stateLabels: strings.stateLabels,
    hooks: {
      notConfiguredTitle: strings.hooks.notConfiguredTitle,
      notConfiguredBody: strings.hooks.notConfiguredBody,
      awaitingTrustTitle: strings.hooks.awaitingTrustTitle,
      awaitingTrustBody: strings.hooks.awaitingTrustBody,
      activeTitle: strings.hooks.activeTitle,
      activeBody: strings.hooks.activeBody,
      enable: strings.hooks.enable,
      showHelp: strings.hooks.showHelp
    }
  }));
  const providerIcons = escapeForInlineScript(JSON.stringify(providerIconUris));
  return `<!doctype html>
<html lang="${strings.languageTag}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    html, body { width: 100%; height: 100%; }
    body { box-sizing: border-box; margin: 0; padding: 2px; overflow: hidden; color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
    main { width: 100%; height: 100%; min-width: 0; min-height: 0; }
    #pet-content { box-sizing: border-box; width: 100%; height: 100%; min-width: 0; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto auto; gap: 0; }
    .stage { position: relative; width: 100%; height: 100%; min-width: 0; min-height: 0; display: grid; place-items: center; overflow: hidden; border-radius: 4px; background: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-foreground)); }
    .background { position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%; image-rendering: pixelated; }
    .custom-background { object-fit: cover; image-rendering: auto; }
    .pet { position: absolute; left: 50%; bottom: 5%; z-index: 1; width: auto; height: auto; max-width: 92%; max-height: 90%; transform: translateX(-50%); image-rendering: pixelated; }
    .pet[role="button"] { cursor: pointer; }
    .pet:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: -2px; }
    .stage.has-background .pet { filter: drop-shadow(0 2px 1px rgb(0 0 0 / 35%)); }
    .provider-toggle { position: absolute; left: 4px; bottom: 4px; z-index: 2; width: 44px; height: 44px; padding: 0; border: 0; background: transparent; cursor: pointer; display: grid; place-items: center; }
    .provider-toggle:hover { opacity: 0.82; }
    .provider-toggle:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; border-radius: 4px; }
    .provider-toggle img { width: 100%; height: 100%; image-rendering: pixelated; filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.65)) drop-shadow(0 0 1px rgba(255, 255, 255, 0.65)); }
    .status { margin: 0; color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 16px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hook-status { margin: 4px; padding: 8px; border: 1px solid var(--vscode-widget-border); border-radius: 5px; background: var(--vscode-editorWidget-background); font-size: 12px; }
    .hook-status strong, .hook-status span { display: block; }
    .hook-status span { margin-top: 3px; color: var(--vscode-descriptionForeground); }
    .hook-status button { margin-top: 7px; border: 0; padding: 4px 8px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
    .hook-status button:hover { background: var(--vscode-button-hoverBackground); }
    .hook-status[data-state="active"] { display: none; }
    .empty { min-height: 180px; display: grid; place-content: center; gap: 8px; text-align: center; }
    code { word-break: break-all; font-family: var(--vscode-editor-font-family); }
    [hidden] { display: none !important; }
    @media (max-height: 34px) {
      body { padding: 1px; }
      #pet-content { grid-template-rows: minmax(0, 1fr) auto; }
      .status { display: none; }
      .provider-toggle { display: none; }
      .hook-status { font-size: 10px; padding: 2px 4px; margin: 1px; }
      .hook-status span { display: none; }
      .hook-status button { margin-top: 2px; padding: 2px 4px; }
    }
  </style>
</head>
<body>
  <main data-vscode-context='{"webviewSection":"pet","preventDefaultContextMenuItems":true}'>
    <section id="pet-content" hidden>
      <div id="pet-stage" class="stage"><canvas id="pet-background" class="background" aria-hidden="true" hidden></canvas><img id="pet-custom-background" class="background custom-background" aria-hidden="true" alt="" hidden><canvas id="pet" class="pet" role="button" tabindex="0"></canvas><button id="provider-toggle" class="provider-toggle" type="button"><img id="provider-icon" alt="" aria-hidden="true"></button></div>
      <p id="pet-status" class="status"></p>
      <aside id="hook-status" class="hook-status" data-state="notConfigured" aria-live="polite">
        <strong id="hook-title"></strong>
        <span id="hook-body"></span>
        <button id="hook-action" type="button"></button>
      </aside>
    </section>
    <section id="empty-content" class="empty" hidden>
      <strong id="empty-title"></strong>
      <span>${escapeHtml(strings.webview.expected)}</span>
      <code id="pets-directory"></code>
    </section>
    <section id="error-content" class="empty" hidden><strong>${escapeHtml(strings.webview.loadFailed)}</strong><span id="error-message"></span></section>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const strings = ${localized};
    const providerIcons = ${providerIcons};
    const petContent = document.getElementById('pet-content');
    const emptyContent = document.getElementById('empty-content');
    const errorContent = document.getElementById('error-content');
    const stage = document.getElementById('pet-stage');
    const background = document.getElementById('pet-background');
    const customBackground = document.getElementById('pet-custom-background');
    const sprite = document.getElementById('pet');
    const hookStatus = document.getElementById('hook-status');
    const hookTitle = document.getElementById('hook-title');
    const hookBody = document.getElementById('hook-body');
    const hookAction = document.getElementById('hook-action');
    const providerToggle = document.getElementById('provider-toggle');
    const providerIcon = document.getElementById('provider-icon');
    const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer;
    let imageGeneration = 0;
    let backgroundFrame;
    let backgroundId;
    let backgroundStartedAt = 0;
    let backgroundLastDraw = 0;
    let currentPet;
    let interactionActive = false;
    let interactionCooldownUntil = 0;
    let loadedSpriteSheet;
    let loadedSpriteUri;
    let lookDegrees;
    let drawCurrentFrame;

    function stateLabel(state) {
      return strings.stateLabels[state] || state;
    }

    function setHookIntegration(state) {
      hookStatus.dataset.state = state;
      const pending = state === 'awaitingTrust';
      const active = state === 'active';
      hookTitle.textContent = active ? strings.hooks.activeTitle : pending ? strings.hooks.awaitingTrustTitle : strings.hooks.notConfiguredTitle;
      hookBody.textContent = active ? strings.hooks.activeBody : pending ? strings.hooks.awaitingTrustBody : strings.hooks.notConfiguredBody;
      hookAction.textContent = pending ? strings.hooks.showHelp : strings.hooks.enable;
      hookAction.hidden = active;
    }

    function showOnly(element) {
      petContent.hidden = element !== petContent;
      emptyContent.hidden = element !== emptyContent;
      errorContent.hidden = element !== errorContent;
    }

    function stopAnimation() {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    }

    function stopBackgroundAnimation() {
      if (backgroundFrame !== undefined) {
        window.cancelAnimationFrame(backgroundFrame);
        backgroundFrame = undefined;
      }
    }

    /* =====================================================================
       Background renderer (coarse pixel art)
       - Sky and wall gradients use Bayer 8x8 ordered dithering
       - Static terrain is drawn once offscreen and reused each frame
       - Circles use pixDisc for sharp pixels (no anti-aliasing)
       ===================================================================== */
    const R = Math.round;
    function lerp(a, b, t) { return a + (b - a) * t; }
    // Deterministic pseudo-random in 0..1 from an index
    function rnd(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
    // Scale a hex color by a brightness factor
    function shade(hex, f) {
      const n = parseInt(hex.slice(1), 16);
      const r = Math.min(255, ((n >> 16) & 255) * f);
      const g = Math.min(255, ((n >> 8) & 255) * f);
      const b = Math.min(255, (n & 255) * f);
      return 'rgb(' + R(r) + ',' + R(g) + ',' + R(b) + ')';
    }

    // Integer pixel rectangle
    function px(ctx, color, x, y, w, h) {
      ctx.fillStyle = color;
      ctx.fillRect(R(x), R(y), Math.max(1, R(w)), Math.max(1, R(h)));
    }
    // Polygon for mountain and leaf silhouettes
    function poly(ctx, color, pts) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(R(pts[0][0]), R(pts[0][1]));
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(R(pts[i][0]), R(pts[i][1]));
      ctx.closePath();
      ctx.fill();
    }
    // Sharp pixel disc (one rectangle per scanline)
    function pixDisc(ctx, color, cx, cy, r) {
      cx = R(cx); cy = R(cy); r = Math.max(1, R(r));
      for (let dy = -r; dy <= r; dy += 1) {
        const dx = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
        px(ctx, color, cx - dx, cy + dy, dx * 2 + 1, 1);
      }
    }

    // ---- Dithering (limited palette + Bayer 8x8) ----
    const BAYER = [
      [0, 48, 12, 60, 3, 51, 15, 63], [32, 16, 44, 28, 35, 19, 47, 31],
      [8, 56, 4, 52, 11, 59, 7, 55], [40, 24, 36, 20, 43, 27, 39, 23],
      [2, 50, 14, 62, 1, 49, 13, 61], [34, 18, 46, 30, 33, 17, 45, 29],
      [10, 58, 6, 54, 9, 57, 5, 53], [42, 26, 38, 22, 41, 25, 37, 21]
    ];
    // More levels shrink the dithered color gap and look smoother.
    const LEVELS = 12;
    function quant(v, thr) {
      const q = v / 255 * (LEVELS - 1);
      const f = Math.floor(q);
      return R((f + ((q - f) > thr ? 1 : 0)) * 255 / (LEVELS - 1));
    }
    function colorAt(stops, t) {
      const n = stops.length;
      if (t <= stops[0][0]) return stops[0][1];
      if (t >= stops[n - 1][0]) return stops[n - 1][1];
      for (let i = 0; i < n - 1; i += 1) {
        const a = stops[i], b = stops[i + 1];
        if (t >= a[0] && t <= b[0]) {
          const f = (t - a[0]) / ((b[0] - a[0]) || 1);
          return [lerp(a[1][0], b[1][0], f), lerp(a[1][1], b[1][1], f), lerp(a[1][2], b[1][2], f)];
        }
      }
      return stops[n - 1][1];
    }
    // Write a vertical dithered gradient into ImageData rows [y0, y1)
    function ditherBand(d, w, y0, y1, stops) {
      y0 = Math.max(0, R(y0)); y1 = R(y1);
      const span = y1 - y0;
      for (let y = y0; y < y1; y += 1) {
        const t = span <= 1 ? 0 : (y - y0) / (span - 1);
        const c = colorAt(stops, t);
        const br = BAYER[y & 7];
        for (let x = 0; x < w; x += 1) {
          const thr = (br[x & 7] + 0.5) / 64;
          const i = (y * w + x) * 4;
          d[i] = quant(c[0], thr); d[i + 1] = quant(c[1], thr); d[i + 2] = quant(c[2], thr); d[i + 3] = 255;
        }
      }
    }
    // Fill several dither bands (covers the full background)
    function skyFill(ctx, w, h, regions) {
      const img = ctx.createImageData(w, h);
      for (const rg of regions) ditherBand(img.data, w, rg.y0, rg.y1, rg.stops);
      ctx.putImageData(img, 0, 0);
    }
    // Indoor: wall gradient plus floor gradient
    function interior(ctx, w, h, wallStops, floorY, floorStops) {
      skyFill(ctx, w, h, [{ y0: 0, y1: floorY, stops: wallStops }, { y0: floorY, y1: h, stops: floorStops }]);
    }

    // ---- Shared terrain and plant silhouettes ----
    // Rolling hill (top edge from a function, filled down to floorY)
    function hill(ctx, w, topFn, floorY, color) {
      const step = Math.max(2, Math.ceil(w / 48));
      const pts = [];
      for (let x = 0; x <= w; x += step) pts.push([x, topFn(x)]);
      pts.push([w, floorY]); pts.push([0, floorY]);
      poly(ctx, color, pts);
    }
    // Jagged mountain range
    function ridge(ctx, w, baseY, amp, color, seed, segs) {
      segs = segs || 6;
      const pts = [[0, baseY]];
      for (let i = 0; i <= segs; i += 1) {
        const x = w * i / segs;
        const y = baseY - amp * (0.35 + 0.65 * rnd(seed + i * 1.7));
        pts.push([x, y]);
      }
      pts.push([w, baseY]);
      poly(ctx, color, pts);
    }
    // Pine tree
    function pine(ctx, x, baseY, hgt, trunk, dark, light, snow) {
      x = R(x); const wd = hgt * 0.32;
      px(ctx, trunk, x - 1, baseY - hgt * 0.16, 3, hgt * 0.16);
      poly(ctx, dark, [[x, baseY - hgt], [x - wd * 0.55, baseY - hgt * 0.6], [x + wd * 0.55, baseY - hgt * 0.6]]);
      poly(ctx, dark, [[x, baseY - hgt * 0.75], [x - wd * 0.8, baseY - hgt * 0.32], [x + wd * 0.8, baseY - hgt * 0.32]]);
      poly(ctx, dark, [[x, baseY - hgt * 0.5], [x - wd, baseY - hgt * 0.05], [x + wd, baseY - hgt * 0.05]]);
      poly(ctx, light, [[x, baseY - hgt * 0.95], [x - wd * 0.3, baseY - hgt * 0.62], [x + wd * 0.12, baseY - hgt * 0.66]]);
      poly(ctx, light, [[x, baseY - hgt * 0.68], [x - wd * 0.45, baseY - hgt * 0.33], [x + wd * 0.15, baseY - hgt * 0.37]]);
      if (snow) {
        poly(ctx, snow, [[x, baseY - hgt], [x - wd * 0.35, baseY - hgt * 0.66], [x - wd * 0.1, baseY - hgt * 0.7], [x + wd * 0.2, baseY - hgt * 0.64]]);
        poly(ctx, snow, [[x, baseY - hgt * 0.75], [x - wd * 0.5, baseY - hgt * 0.36], [x - wd * 0.15, baseY - hgt * 0.42], [x + wd * 0.3, baseY - hgt * 0.34]]);
      }
    }
    // Broadleaf tree (round canopy in three tones)
    function broadleaf(ctx, x, baseY, hgt, sway, trunk, dark, mid, light) {
      x = R(x); const cx = x + sway; const cy = baseY - hgt; const tw = Math.max(2, hgt * 0.1); const r = hgt * 0.34;
      poly(ctx, trunk, [[x - tw * 0.6, baseY], [x + tw * 0.6, baseY], [cx + tw * 0.4, cy + hgt * 0.35], [cx - tw * 0.4, cy + hgt * 0.35]]);
      pixDisc(ctx, dark, cx - r * 0.6, cy + r * 0.4, r * 0.7);
      pixDisc(ctx, dark, cx + r * 0.6, cy + r * 0.45, r * 0.68);
      pixDisc(ctx, dark, cx, cy, r * 0.9);
      pixDisc(ctx, mid, cx - r * 0.4, cy + r * 0.05, r * 0.55);
      pixDisc(ctx, mid, cx + r * 0.45, cy + r * 0.15, r * 0.5);
      pixDisc(ctx, mid, cx, cy - r * 0.1, r * 0.55);
      pixDisc(ctx, light, cx - r * 0.35, cy - r * 0.25, r * 0.28);
      pixDisc(ctx, light, cx + r * 0.2, cy - r * 0.2, r * 0.22);
    }
    // Palm tree
    function palm(ctx, x, baseY, hgt, lean, phase) {
      x = R(x); const cx = x + lean, cy = baseY - hgt;
      poly(ctx, '#7a4a28', [[x - 2, baseY], [x + 2, baseY], [cx + 1, cy], [cx - 1, cy]]);
      poly(ctx, '#9a6035', [[x - 1, baseY], [x + 1, baseY], [cx + 0.5, cy], [cx - 0.5, cy]]);
      const angs = [-2.7, -2.2, -1.7, -1.1, -0.5, 0.1, 2.9 + phase * 0];
      for (let i = 0; i < angs.length; i += 1) {
        const a = angs[i]; const L = hgt * (i === 3 ? 0.5 : 0.4);
        const mx = cx + Math.cos(a) * L * 0.5, my = cy + Math.sin(a) * L * 0.4;
        const tx = cx + Math.cos(a) * L, ty = cy + Math.sin(a) * L * 0.8;
        poly(ctx, i % 3 === 0 ? '#1c6b40' : i % 2 ? '#2f9652' : '#49b864', [[cx, cy - 1], [mx, my], [tx, ty], [mx, my + 1], [cx, cy + 1]]);
      }
      pixDisc(ctx, '#6d4929', cx, cy + 2, 2);
    }
    // Coral
    function coral(ctx, x, baseY, hgt, lean, dark, mid, tip) {
      const tx = x + lean, ty = baseY - hgt, wd = Math.max(2, hgt * 0.12);
      poly(ctx, dark, [[x - wd, baseY], [x + wd, baseY], [tx + wd * 0.6, ty], [tx - wd * 0.6, ty]]);
      poly(ctx, mid, [[x, baseY], [x + wd, baseY], [tx + wd * 0.5, ty], [tx, ty + hgt * 0.12]]);
      poly(ctx, dark, [[x, baseY - hgt * 0.45], [x - hgt * 0.28, baseY - hgt * 0.72], [x - hgt * 0.2, baseY - hgt * 0.78], [x + wd, baseY - hgt * 0.56]]);
      poly(ctx, mid, [[x, baseY - hgt * 0.3], [x + hgt * 0.3, baseY - hgt * 0.56], [x + hgt * 0.24, baseY - hgt * 0.64], [x - wd, baseY - hgt * 0.42]]);
      px(ctx, tip, tx - 1, ty - 1, 3, 2); px(ctx, tip, x - hgt * 0.27, baseY - hgt * 0.79, 3, 2); px(ctx, tip, x + hgt * 0.23, baseY - hgt * 0.65, 3, 2);
    }
    // Houseplant (drawn each frame so it can sway)
    function drawPlant(ctx, x, baseY, hgt, t, phase) {
      const sway = Math.sin(t * 0.9 + phase) * hgt * 0.04; const topY = baseY - hgt;
      poly(ctx, '#7a4a30', [[x - hgt * 0.18, baseY - hgt * 0.26], [x + hgt * 0.18, baseY - hgt * 0.26], [x + hgt * 0.13, baseY], [x - hgt * 0.13, baseY]]);
      px(ctx, '#a56a44', x - hgt * 0.15, baseY - hgt * 0.24, hgt * 0.3, 2);
      pixDisc(ctx, '#2f5d3c', x - hgt * 0.16 + sway, topY + hgt * 0.34, hgt * 0.2);
      pixDisc(ctx, '#2f5d3c', x + hgt * 0.18 + sway, topY + hgt * 0.42, hgt * 0.2);
      pixDisc(ctx, '#4b8a52', x + sway, topY + hgt * 0.2, hgt * 0.24);
      pixDisc(ctx, '#4b8a52', x - hgt * 0.06 + sway, topY + hgt * 0.5, hgt * 0.18);
      pixDisc(ctx, '#78b06a', x - hgt * 0.06 + sway, topY + hgt * 0.12, hgt * 0.1);
    }
    // Soft pixel cloud
    function pixCloud(ctx, x, y, s, dark, mid, light) {
      x = R(x); y = R(y);
      px(ctx, dark, x + 2 * s, y + 3 * s, 20 * s, 3 * s);
      px(ctx, dark, x + 6 * s, y + s, 12 * s, 3 * s);
      px(ctx, mid, x, y + 2 * s, 24 * s, 3 * s);
      px(ctx, mid, x + 4 * s, y, 16 * s, 3 * s);
      px(ctx, mid, x + 8 * s, y - 2 * s, 8 * s, 3 * s);
      px(ctx, light, x + 2 * s, y + s, 18 * s, 2 * s);
      px(ctx, light, x + 7 * s, y - s, 8 * s, 2 * s);
    }
    // City skyline (window lights baked into the static layer)
    function cityRow(ctx, x0, width, topY, baseY, dark, litA, litB, seed) {
      let x = x0, i = 0; const end = x0 + width;
      while (x < end) {
        const bw = Math.max(4, R(width * (0.1 + rnd(seed + i) * 0.12)));
        const top = R(lerp(baseY, topY, 0.35 + 0.6 * rnd(seed + i * 2.1)));
        const bwc = Math.min(bw, end - x);
        px(ctx, dark, x, top, bwc - 1, baseY - top);
        px(ctx, shade(dark, 1.25), x, top, bwc - 1, 1);
        for (let wy = top + 2; wy < baseY - 2; wy += 3) {
          for (let wx = x + 1; wx < x + bwc - 2; wx += 2) {
            if (rnd(seed * 1.3 + wx * 7.7 + wy * 3.1) > 0.55) px(ctx, ((wx + wy) & 1) ? litA : litB, wx, wy, 1, 1);
          }
        }
        x += bwc; i += 1;
      }
    }
    // Ring around a planet
    function ringEllipse(ctx, cx, cy, rx, ry, color) {
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(R(cx), R(cy), R(rx), R(ry), -0.2, 0, Math.PI * 2); ctx.stroke();
    }

    // ---- Animated parts ----
    function stars(ctx, w, h, t, count, seed, y1) {
      y1 = y1 || h * 0.7;
      for (let i = 0; i < count; i += 1) {
        const x = R(rnd(seed + i) * w); const y = R(rnd(seed + i + 3) * y1);
        const tw = Math.sin(t * 1.5 + i * 1.3);
        px(ctx, tw > 0.3 ? '#ffffff' : tw > -0.2 ? '#cdd8f5' : '#8f9dc8', x, y, 1, 1);
        if (tw > 0.85) { px(ctx, 'rgba(255,255,255,0.5)', x - 1, y, 3, 1); px(ctx, 'rgba(255,255,255,0.5)', x, y - 1, 1, 3); }
      }
    }
    function rain(ctx, w, h, t, count, color, slant) {
      slant = slant || 1;
      for (let i = 0; i < count; i += 1) {
        const sp = 1.2 + rnd(i) * 1.0;
        const x = ((rnd(i) * w) + t * slant * 14) % (w + 8);
        const y = ((rnd(i + 9) * h) + t * h * sp) % (h + 8);
        px(ctx, color, x, y, 1, 3);
      }
    }
    function snow(ctx, w, h, t, count) {
      for (let i = 0; i < count; i += 1) {
        const sp = 0.3 + rnd(i) * 0.5;
        const x = (rnd(i) * w + Math.sin(t * 0.6 + i) * 3) % w;
        const y = (rnd(i + 5) * h + t * h * sp) % h;
        const s = rnd(i + 2) > 0.7 ? 2 : 1;
        px(ctx, '#eef4f8', x, y, s, s);
      }
    }
    function leaves(ctx, w, h, t, count, pal) {
      for (let i = 0; i < count; i += 1) {
        const sp = 0.25 + rnd(i) * 0.4;
        const x = (rnd(i) * w + Math.sin(t * 0.8 + i * 2) * 8) % (w + 8) - 4;
        const y = (rnd(i + 7) * h + t * h * sp) % (h + 6) - 4;
        px(ctx, pal[i % pal.length], x, y, 2, 1);
      }
    }
    function fireflies(ctx, w, h, t, count, color, y0, y1) {
      y0 = y0 || h * 0.3; y1 = y1 || h * 0.85;
      for (let i = 0; i < count; i += 1) {
        const x = rnd(i) * w + Math.sin(t * 0.7 + i) * 6;
        const y = lerp(y0, y1, rnd(i + 3)) + Math.cos(t * 0.5 + i * 2) * 5;
        const on = Math.sin(t * 2 + i * 1.7);
        if (on > 0) {
          px(ctx, color, x, y, 1, 1);
          if (on > 0.7) { px(ctx, 'rgba(255,240,180,0.4)', x - 1, y, 3, 1); px(ctx, 'rgba(255,240,180,0.4)', x, y - 1, 1, 3); }
        }
      }
    }
    function bubbles(ctx, w, h, t, count) {
      for (let i = 0; i < count; i += 1) {
        const sp = 0.4 + rnd(i) * 0.6;
        const x = rnd(i) * w + Math.sin(t + i) * 3;
        const y = h - (rnd(i + 4) * h + t * h * sp) % (h + 6);
        const s = rnd(i + 1) > 0.6 ? 2 : 1;
        px(ctx, 'rgba(210,245,255,0.75)', x, y, s, s);
      }
    }
    function rays(ctx, w, h, t, color, count, y1) {
      y1 = y1 || h;
      for (let i = 0; i < count; i += 1) {
        const x = (i / count) * w + Math.sin(t * 0.2 + i) * 6; const wd = w * 0.05;
        poly(ctx, color, [[x, 0], [x + wd, 0], [x - wd * 1.5, y1], [x - wd * 2.5, y1]]);
      }
    }
    function waves(ctx, w, t, y, rows, c1, c2) {
      for (let r = 0; r < rows; r += 1) {
        const off = (t * (6 + r * 3)) % 16;
        for (let x = -16; x < w + 16; x += 16) px(ctx, r % 2 ? c1 : c2, x + off, y + r * 3, 8, 1);
      }
    }
    function glow(ctx, cx, cy, r, color, a) {
      a = a || 0.14;
      for (let k = 3; k >= 1; k -= 1) { ctx.globalAlpha = a * (4 - k); pixDisc(ctx, color, cx, cy, r * k / 3); }
      ctx.globalAlpha = 1;
    }
    function campfire(ctx, cx, baseY, t) {
      cx = R(cx);
      px(ctx, '#5b3a26', cx - 5, baseY, 10, 2); px(ctx, '#3f2819', cx - 3, baseY - 1, 8, 2);
      const fl = Math.sin(t * 9) * 0.5 + Math.sin(t * 13) * 0.3; const hgt = 8 + fl * 2;
      poly(ctx, '#ff7a1e', [[cx - 4, baseY], [cx, baseY - hgt - 2], [cx + 4, baseY]]);
      poly(ctx, '#ffb43c', [[cx - 2, baseY], [cx + fl, baseY - hgt], [cx + 2, baseY]]);
      poly(ctx, '#ffe27a', [[cx - 1, baseY], [cx, baseY - hgt * 0.6], [cx + 1, baseY]]);
      glow(ctx, cx, baseY - 3, hgt, '#ff9a2e', 0.08);
      for (let i = 0; i < 4; i += 1) { const y = baseY - ((t * 14 + i * 7) % 20); const x = cx + Math.sin(t * 3 + i) * 3; px(ctx, '#ffb24a', x, y, 1, 1); }
    }
    function firework(ctx, cx, cy, t, phase, color) {
      const p = ((t * 0.5 + phase) % 1); const r = p * 14;
      ctx.globalAlpha = Math.max(0, 1 - p);
      for (let k = 0; k < 10; k += 1) { const a = k * Math.PI / 5; px(ctx, color, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1, 1); }
      ctx.globalAlpha = 1;
      if (p < 0.08) pixDisc(ctx, color, cx, cy, 1);
    }
    // Ground shadow under the pet
    function groundShadow(ctx, w, h) {
      const y = R(h * 0.945); const cx = R(w * 0.5); const rw = Math.max(4, R(w * 0.16));
      px(ctx, 'rgba(0,0,0,0.22)', cx - rw, y, rw * 2, 2);
      px(ctx, 'rgba(0,0,0,0.14)', cx - rw * 0.6, y + 2, rw * 1.2, 1);
      px(ctx, 'rgba(0,0,0,0.1)', cx - rw * 1.2, y - 1, rw * 2.4, 1);
    }

    // ---- Provider toggle icon (bundled pixel-art badge, one per hook provider) ----
    function showProviderIcon(providerId) {
      const uri = providerIcons[providerId] || providerIcons.cursor;
      if (providerIcon.src !== uri) providerIcon.src = uri;
    }
    showProviderIcon('cursor');

    // ---- Scene definitions (id -> { base, anim }) ----
    const SCENES = {
      'blue-sky': {
        base(c, w, h) {
          skyFill(c, w, h, [{ y0: 0, y1: h, stops: [[0, [74, 167, 232]], [0.55, [126, 200, 240]], [1, [196, 232, 246]]] }]);
          pixCloud(c, w * 0.5 - 24, h * 0.82, 3, '#cdd9ec', '#e6eef7', '#ffffff');
        },
        anim(c, w, h, t) {
          pixCloud(c, (t * 4) % (w + 60) - 40, h * 0.18, 2, '#cfe0f0', '#eaf3fb', '#ffffff');
          pixCloud(c, w - ((t * 3 + 20) % (w + 70)), h * 0.36, 1.6, '#d4e4f2', '#eef5fc', '#ffffff');
          for (let i = 0; i < 6; i += 1) if (Math.sin(t * 2 + i) > 0.4) px(c, '#ffffff', (i * 37 + 11) % w, (i * 19 + 8) % Math.max(1, R(h * 0.5)), 1, 1);
        }
      },
      grassland: {
        base(c, w, h) {
          skyFill(c, w, h, [{ y0: 0, y1: R(h * 0.66), stops: [[0, [96, 196, 236]], [0.7, [150, 214, 240]], [1, [206, 236, 230]]] }, { y0: R(h * 0.66), y1: h, stops: [[0, [122, 190, 86]], [1, [86, 158, 66]]] }]);
          hill(c, w, function (x) { return h * 0.5 + 8 * Math.sin(x / w * 6.28 * 0.5 + 1); }, h, '#8fc85f');
          hill(c, w, function (x) { return h * 0.62 + 6 * Math.sin(x / w * 6.28 + 2); }, h, '#79bd52');
          px(c, '#6fb04a', 0, R(h * 0.72), w, h);
          broadleaf(c, w * 0.08, h * 0.74, Math.min(w * 0.26, h * 0.42), 3, '#523827', '#245f3b', '#3d8c4c', '#72b957');
          broadleaf(c, w * 0.94, h * 0.75, Math.min(w * 0.22, h * 0.38), -3, '#523827', '#245f3b', '#3d8c4c', '#72b957');
          for (let i = 0; i < 14; i += 1) { const x = (i * 29 + 7) % w; px(c, i % 2 ? '#ff8cb1' : '#fff2a1', x, R(h * 0.78) + (i % 4) * 4, 2, 1); px(c, '#3c8a44', x, R(h * 0.79) + (i % 4) * 4, 1, 3); }
        },
        anim(c, w, h, t) {
          pixCloud(c, (t * 3) % (w + 50) - 30, h * 0.16, 1.8, '#d4ead8', '#eef7ec', '#ffffff');
          pixCloud(c, w - ((t * 2 + 10) % (w + 60)), h * 0.3, 1.4, '#d8ecdc', '#f0f8ee', '#ffffff');
          for (let i = 0; i < 3; i += 1) { const x = (i * 90 + t * 14) % (w + 20) - 10; const y = h * 0.6 + Math.sin(t * 3 + i) * 8; px(c, i % 2 ? '#f6b93b' : '#ef8fb3', x, y, Math.sin(t * 12 + i) > 0 ? 2 : 1, 1); }
        }
      },
      'autumn-forest': {
        base(c, w, h) {
          skyFill(c, w, h, [{ y0: 0, y1: R(h * 0.62), stops: [[0, [240, 180, 120]], [0.6, [233, 150, 110]], [1, [210, 120, 110]]] }, { y0: R(h * 0.62), y1: h, stops: [[0, [110, 80, 60]], [1, [70, 55, 42]]] }]);
          hill(c, w, function (x) { return h * 0.6 - 6 * Math.sin(x / w * 8); }, h, '#9c5a4a');
          poly(c, '#c98a52', [[w * 0.42, h], [w * 0.48, h * 0.62], [w * 0.54, h * 0.62], [w * 0.7, h]]);
          const dark = ['#7a2f30', '#8f3a2c', '#9c4d2a'], mid = ['#c74f3b', '#df783f', '#d98236'], light = ['#ed8d3f', '#f0aa43', '#f5bd58'];
          for (let side = 0; side < 2; side += 1) for (let i = 0; i < 3; i += 1) { const x = side ? w - 4 - i * R(w * 0.1) : 4 + i * R(w * 0.1); broadleaf(c, x, h * 0.72, h * (0.4 + i * 0.04), side ? -2 : 2, '#4b3028', dark[i], mid[i], light[i]); }
        },
        anim(c, w, h, t) { leaves(c, w, h, t, 14, ['#f3b64c', '#dc6a3e', '#a94a3c', '#e08a3a']); }
      },
      sunset: {
        base(c, w, h) {
          skyFill(c, w, h, [{ y0: 0, y1: R(h * 0.7), stops: [[0, [92, 60, 120]], [0.35, [200, 80, 110]], [0.6, [240, 130, 90]], [0.85, [250, 190, 110]], [1, [252, 220, 150]]] }, { y0: R(h * 0.7), y1: h, stops: [[0, [120, 90, 110]], [1, [70, 60, 80]]] }]);
          pixDisc(c, '#fff1b4', w * 0.5, h * 0.52, Math.min(w, h) * 0.09);
          pixDisc(c, '#ffd98a', w * 0.5, h * 0.52, Math.min(w, h) * 0.07);
          ridge(c, w, h * 0.7, h * 0.34, '#6a4470', 2.2, 7);
          ridge(c, w, h * 0.72, h * 0.2, '#523a63', 5.6, 6);
          px(c, '#b06a86', 0, R(h * 0.72), w, R(h * 0.1));
        },
        anim(c, w, h, t) {
          for (let i = 0; i < 6; i += 1) { const y = h * 0.73 + i * 2; px(c, i % 2 ? '#ffcf8a' : '#f6a878', w * 0.42 + Math.sin(t * 2 + i) * 2, y, Math.max(1, w * 0.16 - i * 4), 1); }
          for (let i = 0; i < 3; i += 1) { const x = (i * 70 + t * 10) % (w + 20) - 10; const y = h * 0.24 + i * 6 + Math.sin(t + i) * 3; px(c, '#4a3a4a', x, y, 1, 1); px(c, '#4a3a4a', x - 1, y - 1, 1, 1); px(c, '#4a3a4a', x + 1, y - 1, 1, 1); }
        }
      },
      'tropical-beach': {
        base(c, w, h) {
          skyFill(c, w, h, [{ y0: 0, y1: R(h * 0.46), stops: [[0, [96, 196, 236]], [0.7, [150, 214, 240]], [1, [206, 236, 240]]] }, { y0: R(h * 0.46), y1: R(h * 0.7), stops: [[0, [40, 180, 196]], [1, [74, 204, 196]]] }, { y0: R(h * 0.7), y1: h, stops: [[0, [238, 214, 150]], [1, [224, 196, 132]]] }]);
          pixDisc(c, '#fff0b0', w * 0.72, h * 0.18, Math.min(w, h) * 0.08);
          pixDisc(c, '#ffe17c', w * 0.72, h * 0.18, Math.min(w, h) * 0.06);
          palm(c, w * 0.1, h * 0.86, Math.min(w * 0.36, h * 0.56), w * 0.06, 0);
          palm(c, w * 0.92, h * 0.9, Math.min(w * 0.28, h * 0.46), -w * 0.05, 2.4);
          for (let i = 0; i < 7; i += 1) px(c, i % 2 ? '#d6ae70' : '#fff0bb', (i * 23 + 7) % w, R(h * 0.82) + (i % 3) * 4, 2, 1);
        },
        anim(c, w, h, t) {
          waves(c, w, t, h * 0.56, 4, '#d9fbec', '#f8f1cf');
          pixCloud(c, (t * 2.5) % (w + 50) - 30, h * 0.12, 1.4, '#dfeee0', '#f2f9ef', '#ffffff');
          for (let i = 0; i < 3; i += 1) { const x = (i * 80 + t * 8) % (w + 16) - 8; const y = h * 0.22 + Math.sin(t + i) * 3; px(c, '#4a5a66', x, y, 1, 1); px(c, '#4a5a66', x - 1, y - 1, 1, 1); px(c, '#4a5a66', x + 1, y - 1, 1, 1); }
        }
      },
      underwater: {
        base(c, w, h) {
          skyFill(c, w, h, [{ y0: 0, y1: h, stops: [[0, [36, 150, 180]], [0.55, [26, 120, 158]], [1, [18, 86, 120]]] }]);
          px(c, '#c9b378', 0, R(h * 0.82), w, h);
          poly(c, '#2a6076', [[0, h], [0, h * 0.66], [w * 0.1, h * 0.6], [w * 0.2, h * 0.74], [w * 0.22, h]]);
          poly(c, '#2a6076', [[w, h], [w, h * 0.64], [w * 0.9, h * 0.58], [w * 0.8, h * 0.74], [w * 0.78, h]]);
          for (let i = 0; i < 3; i += 1) {
            coral(c, 3 + i * 6, h * 0.86, h * (0.16 + i * 0.03), i - 1, i % 2 ? '#a84d75' : '#714c98', i % 2 ? '#ed7180' : '#a46db5', '#ffc09c');
            coral(c, w - 3 - i * 6, h * 0.87, h * (0.15 + i * 0.035), 1 - i, i % 2 ? '#714c98' : '#a84d75', i % 2 ? '#a46db5' : '#ed7180', '#ffd1a6');
          }
        },
        anim(c, w, h, t) {
          rays(c, w, h, t, 'rgba(200,240,255,0.06)', 5, h * 0.8);
          bubbles(c, w, h, t, 18);
          for (let i = 0; i < 4; i += 1) { const x = (i * 70 + t * 12) % (w + 16) - 8; const y = h * 0.3 + (i % 3) * h * 0.14 + Math.sin(t + i) * 4; px(c, i % 2 ? '#ffd27a' : '#ff9a6a', x, y, 3, 2); poly(c, i % 2 ? '#ffd27a' : '#ff9a6a', [[x, y], [x - 2, y - 1], [x - 2, y + 3]]); }
        }
      },
      'night-camp': {
        base(c, w, h) {
          skyFill(c, w, h, [{ y0: 0, y1: R(h * 0.66), stops: [[0, [12, 20, 52]], [0.7, [28, 36, 74]], [1, [60, 54, 86]]] }, { y0: R(h * 0.66), y1: h, stops: [[0, [32, 50, 44]], [1, [22, 36, 32]]] }]);
          ridge(c, w, h * 0.68, h * 0.42, '#25324f', 2.2, 7);
          ridge(c, w, h * 0.7, h * 0.28, '#1c2740', 5.1, 6);
          px(c, '#284a38', 0, R(h * 0.66), w, h);
          for (let side = 0; side < 2; side += 1) for (let i = 0; i < 4; i += 1) { const x = side ? w - 3 - i * 6 : 3 + i * 6; pine(c, x, h * 0.7, h * (0.3 + i * 0.05), '#2a221c', '#123024', '#28563e'); }
          poly(c, '#c9793f', [[w * 0.06, h * 0.78], [w * 0.19, h * 0.5], [w * 0.34, h * 0.78]]);
          poly(c, '#8a4f2e', [[w * 0.19, h * 0.5], [w * 0.24, h * 0.78], [w * 0.34, h * 0.78]]);
          poly(c, '#3a2418', [[w * 0.15, h * 0.78], [w * 0.19, h * 0.6], [w * 0.24, h * 0.78]]);
        },
        anim(c, w, h, t) { stars(c, w, h, t, 26, 3.1, h * 0.6); campfire(c, w * 0.82, h * 0.8, t); fireflies(c, w, h, t, 7, '#ffd36a', h * 0.5, h * 0.78); }
      },
      space: {
        base(c, w, h) {
          skyFill(c, w, h, [{ y0: 0, y1: h, stops: [[0, [8, 10, 42]], [0.5, [16, 14, 58]], [1, [10, 8, 40]]] }]);
          poly(c, 'rgba(80,50,140,0.25)', [[0, h * 0.3], [w * 0.4, h * 0.15], [w, h * 0.35], [w, h * 0.5], [w * 0.5, h * 0.32], [0, h * 0.48]]);
          poly(c, 'rgba(60,120,200,0.18)', [[0, h * 0.4], [w * 0.6, h * 0.2], [w, h * 0.42], [w, h * 0.55], [0, h * 0.6]]);
          pixDisc(c, '#7b4da3', w * 0.8, h * 0.26, Math.min(w, h) * 0.13);
          pixDisc(c, '#9a6bc0', w * 0.77, h * 0.23, Math.min(w, h) * 0.09);
          pixDisc(c, '#c98fd8', w * 0.75, h * 0.21, Math.min(w, h) * 0.04);
          ringEllipse(c, w * 0.8, h * 0.26, Math.min(w, h) * 0.24, Math.min(w, h) * 0.07, '#ffc878');
          px(c, '#3a3f6a', 0, R(h * 0.8), w, h); px(c, '#5a63a0', 0, R(h * 0.8), w, 2);
          for (let x = 3; x < w; x += 13) px(c, '#242a5e', x, R(h * 0.9), 8, 2);
        },
        anim(c, w, h, t) { stars(c, w, h, t, 40, 7.7, h * 0.78); for (let x = 4; x < w; x += 14) px(c, Math.sin(t * 3 + x) > 0 ? '#55dcff' : '#1a2050', x, R(h * 0.9), 4, 1); }
      },
      'night-city': {
        base(c, w, h) {
          skyFill(c, w, h, [{ y0: 0, y1: R(h * 0.72), stops: [[0, [10, 14, 40]], [0.6, [26, 22, 64]], [1, [58, 34, 78]]] }, { y0: R(h * 0.72), y1: h, stops: [[0, [26, 26, 52]], [1, [16, 16, 36]]] }]);
          cityRow(c, 0, w, h * 0.34, h * 0.72, '#141a3a', '#8fd0ff', '#f07bd0', 3.7);
          px(c, '#1c2140', 0, R(h * 0.72), w, h); px(c, '#4a5a86', 0, R(h * 0.72), w, 2);
          for (let x = 0; x < w; x += 9) px(c, x % 2 ? '#2a3660' : '#5a3a7a', x, R(h * 0.9), 6, 1);
        },
        anim(c, w, h, t) {
          rain(c, w, h, t, 40, 'rgba(150,190,230,0.5)', 1);
          for (let i = 0; i < 5; i += 1) if (Math.sin(t * 2 + i) > 0) px(c, i % 2 ? '#2ee1f0' : '#f064da', (i * w * 0.2 + 8) % w, h * 0.5 - (i % 3) * 6, R(w * 0.05), 2);
          for (let i = 0; i < 8; i += 1) px(c, i % 2 ? 'rgba(46,225,240,0.35)' : 'rgba(240,100,218,0.3)', (i * 19 + 5) % w, h * 0.76 + (i % 4) * 5, 4, 1);
        }
      },
      'japanese-festival': {
        base(c, w, h) {
          skyFill(c, w, h, [{ y0: 0, y1: R(h * 0.7), stops: [[0, [18, 22, 54]], [0.7, [40, 32, 66]], [1, [70, 44, 74]]] }, { y0: R(h * 0.7), y1: h, stops: [[0, [52, 40, 58]], [1, [36, 28, 42]]] }]);
          for (let i = 0; i < 5; i += 1) { const x = i * R(w * 0.22) - R(w * 0.05); px(c, '#2a2340', x, R(h * 0.56), R(w * 0.2), R(h * 0.16)); poly(c, '#6e3a4a', [[x - 2, h * 0.56], [x + w * 0.1, h * 0.5], [x + w * 0.2 + 2, h * 0.56]]); }
          px(c, '#9b3a44', R(w * 0.44), R(h * 0.34), 3, R(h * 0.24)); px(c, '#9b3a44', R(w * 0.56), R(h * 0.34), 3, R(h * 0.24));
          px(c, '#b5474f', R(w * 0.4), R(h * 0.32), R(w * 0.2), 3); px(c, '#8a2f38', R(w * 0.42), R(h * 0.4), R(w * 0.16), 2);
        },
        anim(c, w, h, t) {
          for (let i = 0; i < 9; i += 1) { const x = i * R(w * 0.12); const y = R(h * 0.18 + Math.sin(i * 0.8) * 4); const on = Math.sin(t * 2 + i) > -0.5; px(c, '#3a2a30', x, R(h * 0.12), 1, y - R(h * 0.12)); px(c, on ? '#ffb54a' : '#7a4a2a', x - 1, y, 3, 4); if (on) glow(c, x, y + 2, 4, '#ffb54a', 0.12); }
          firework(c, w * 0.24, h * 0.18, t, 0, '#f38aaa'); firework(c, w * 0.74, h * 0.22, t, 0.5, '#82d9ef'); firework(c, w * 0.5, h * 0.12, t, 0.8, '#ffd45f');
        }
      },
      'snowy-cabin': {
        base(c, w, h) {
          skyFill(c, w, h, [{ y0: 0, y1: R(h * 0.58), stops: [[0, [120, 150, 180]], [0.7, [150, 175, 198]], [1, [196, 212, 224]]] }, { y0: R(h * 0.58), y1: h, stops: [[0, [224, 232, 238]], [1, [236, 242, 246]]] }]);
          ridge(c, w, h * 0.6, h * 0.3, '#8ea6bc', 3.3, 6);
          px(c, '#e6edf2', 0, R(h * 0.58), w, h);
          px(c, '#7a4d34', R(w * 0.2), R(h * 0.42), R(w * 0.6), R(h * 0.34));
          poly(c, '#56382e', [[w * 0.14, h * 0.44], [w * 0.5, h * 0.2], [w * 0.86, h * 0.44]]);
          poly(c, '#f4f4ef', [[w * 0.14, h * 0.42], [w * 0.5, h * 0.18], [w * 0.86, h * 0.42], [w * 0.8, h * 0.4], [w * 0.5, h * 0.23], [w * 0.2, h * 0.44]]);
          px(c, '#f3ad54', R(w * 0.28), R(h * 0.5), R(w * 0.12), R(h * 0.11)); px(c, '#f3ad54', R(w * 0.6), R(h * 0.5), R(w * 0.12), R(h * 0.11));
          px(c, '#ffd983', R(w * 0.3), R(h * 0.52), R(w * 0.08), R(h * 0.07)); px(c, '#ffd983', R(w * 0.62), R(h * 0.52), R(w * 0.08), R(h * 0.07));
          px(c, '#56382e', R(w * 0.45), R(h * 0.54), R(w * 0.1), R(h * 0.22));
          px(c, '#56382e', R(w * 0.67), R(h * 0.16), R(w * 0.05), R(h * 0.16));
          for (let side = 0; side < 2; side += 1) for (let i = 0; i < 3; i += 1) { const x = side ? w - 3 - i * 8 : 3 + i * 8; pine(c, x, h * 0.72, h * (0.32 + i * 0.04), '#4c4138', '#234744', '#3c6058', '#f2f4ef'); }
        },
        anim(c, w, h, t) { for (let p = 0; p < 4; p += 1) { const rise = (t * 2 + p * 5) % 18; pixDisc(c, 'rgba(226,234,238,0.6)', w * 0.69 + Math.sin(t + p) * 2, h * 0.16 - rise, 1.5 + p * 0.4); } snow(c, w, h, t, 26); }
      },
      treehouse: {
        base(c, w, h) {
          skyFill(c, w, h, [{ y0: 0, y1: h, stops: [[0, [58, 110, 80]], [0.6, [46, 92, 64]], [1, [34, 72, 50]]] }]);
          for (let i = 0; i < 14; i += 1) pixDisc(c, i % 2 ? '#2f6548' : '#3f7a50', (i * w * 0.09) % w, (i * 13) % Math.max(1, R(h * 0.34)), Math.max(5, w * 0.06));
          px(c, '#5a3a24', 0, 0, R(w * 0.13), h); px(c, '#4a2f1c', 0, 0, R(w * 0.05), h);
          px(c, '#5a3a24', R(w * 0.87), 0, R(w * 0.13), h); px(c, '#4a2f1c', R(w * 0.95), 0, R(w * 0.05), h);
          px(c, '#ad6f3c', R(w * 0.08), R(h * 0.6), R(w * 0.84), R(h * 0.4));
          for (let y = R(h * 0.63); y < h; y += 5) px(c, '#7a4a28', R(w * 0.08), y, R(w * 0.84), 1);
          px(c, '#6b4428', R(w * 0.32), R(h * 0.1), R(w * 0.36), R(h * 0.42));
          pixDisc(c, '#9ad6bb', w * 0.5, h * 0.3, Math.min(w, h) * 0.11);
          px(c, '#6b4428', R(w * 0.5) - 1, R(h * 0.19), 2, R(h * 0.22)); px(c, '#6b4428', R(w * 0.4), R(h * 0.29), R(w * 0.2), 2);
        },
        anim(c, w, h, t) {
          for (let i = 0; i < 8; i += 1) { const x = w * 0.1 + i * w * 0.11; const y = h * 0.08 + Math.sin(i * 0.9) * 3; px(c, Math.sin(t * 2 + i) > -0.3 ? '#ffd46d' : '#8a6a32', x, y, 1, 2); }
          fireflies(c, w, h, t, 6, '#ffe08a', h * 0.3, h * 0.58);
        }
      },
      office: {
        base(c, w, h) {
          interior(c, w, h, [[0, [224, 166, 110]], [0.7, [214, 150, 100]], [1, [196, 130, 88]]], R(h * 0.7), [[0, [150, 88, 58]], [1, [120, 70, 46]]]);
          for (let x = 0; x < w; x += Math.max(6, R(w * 0.08))) px(c, '#7c4a30', x, R(h * 0.7), 1, h);
          const wx = R(w * 0.36), wy = R(h * 0.08), ww = R(w * 0.28), wh = R(h * 0.36);
          px(c, '#6f4431', wx - 2, wy - 2, ww + 4, wh + 4); px(c, '#bfe6ea', wx, wy, ww, wh); px(c, '#e8f4d6', wx, wy, ww, R(wh * 0.4));
          px(c, '#6f4431', wx + R(ww / 2) - 1, wy, 2, wh); px(c, '#6f4431', wx, wy + R(wh / 2), ww, 2);
          px(c, '#5a3524', R(w * 0.06), R(h * 0.24), R(w * 0.2), R(h * 0.42));
          for (let s = 0; s < 3; s += 1) { const sy = R(h * 0.28) + s * R(h * 0.13); px(c, '#3f2618', R(w * 0.06), sy + R(h * 0.11), R(w * 0.2), 2); for (let b = 0; b < 6; b += 1) px(c, ['#8a4a3a', '#4a6b5a', '#c19b54', '#6a4a7a'][b % 4], R(w * 0.07) + b * R(w * 0.03), sy, R(w * 0.025), R(h * 0.1)); }
          px(c, '#8a5a38', R(w * 0.68), R(h * 0.5), R(w * 0.28), 4); px(c, '#6a4328', R(w * 0.7), R(h * 0.53), 3, R(h * 0.17)); px(c, '#6a4328', R(w * 0.9), R(h * 0.53), 3, R(h * 0.17));
        },
        anim(c, w, h, t) {
          glow(c, w * 0.5, h * 0.26, h * 0.3, '#fff0c0', 0.04);
          drawPlant(c, w * 0.9, h * 0.66, Math.min(w * 0.13, h * 0.24), t, 1.2);
          for (let i = 0; i < 5; i += 1) px(c, 'rgba(255,240,200,0.7)', (i * 23 + t * 4) % w, R(h * 0.3) + i * 7 + Math.sin(t + i) * 3, 1, 1);
        }
      },
      'living-room': {
        base(c, w, h) {
          interior(c, w, h, [[0, [228, 190, 138]], [1, [210, 166, 112]]], R(h * 0.66), [[0, [172, 110, 74]], [1, [140, 88, 58]]]);
          for (let x = 0; x < w; x += Math.max(6, R(w * 0.08))) px(c, '#7a4a2e', x, R(h * 0.66), 1, h);
          px(c, '#e8b984', R(w * 0.24), R(h * 0.72), R(w * 0.56), R(h * 0.24)); px(c, '#d59a6d', R(w * 0.28), R(h * 0.75), R(w * 0.48), R(h * 0.18));
          const wx = R(w * 0.4), wy = R(h * 0.1), ww = R(w * 0.26), wh = R(h * 0.34);
          px(c, '#6a4230', wx - 2, wy - 2, ww + 4, wh + 4); px(c, '#bfe0ea', wx, wy, ww, wh); px(c, '#e6f2d0', wx, wy, ww, R(wh * 0.4));
          px(c, '#6a4230', wx + R(ww / 2) - 1, wy, 2, wh); px(c, '#6a4230', wx, wy + R(wh / 2), ww, 2);
          px(c, '#c46a4a', R(w * 0.04), R(h * 0.5), R(w * 0.24), R(h * 0.16)); px(c, '#a8543a', R(w * 0.04), R(h * 0.5), R(w * 0.24), 3);
          px(c, '#8a5a3a', R(w * 0.74), R(h * 0.16), R(w * 0.14), R(h * 0.16)); px(c, '#7fa06a', R(w * 0.76), R(h * 0.19), R(w * 0.1), R(h * 0.1));
        },
        anim(c, w, h, t) { drawPlant(c, w * 0.9, h * 0.63, Math.min(w * 0.13, h * 0.26), t, 1.4); for (let i = 0; i < 5; i += 1) px(c, 'rgba(255,241,186,0.6)', (i * 23 + t * 3) % w, h * 0.28 + i * 6 + Math.sin(t + i) * 2, 1, 1); }
      },
      'japanese-room': {
        base(c, w, h) {
          interior(c, w, h, [[0, [225, 204, 160]], [1, [206, 180, 132]]], R(h * 0.64), [[0, [176, 146, 90]], [1, [150, 120, 70]]]);
          const tile = Math.max(10, R(w * 0.2));
          for (let x = 0; x < w; x += tile) { px(c, '#8e713e', x, R(h * 0.64), 1, h); px(c, '#d3ba78', x + 1, R(h * 0.82), tile - 1, 1); }
          for (let side = 0; side < 2; side += 1) { const x = side ? R(w * 0.72) : 0; const sw = R(w * 0.28), sy = R(h * 0.06), sh = R(h * 0.56); px(c, '#6f5636', x, sy, sw, sh); px(c, '#f2e8cc', x + 2, sy + 2, sw - 4, sh - 4); for (let g = 1; g < 4; g += 1) px(c, '#a58c60', x + 2 + g * R(sw / 4), sy + 2, 1, sh - 4); for (let g = 1; g < 4; g += 1) px(c, '#a58c60', x + 2, sy + 2 + g * R(sh / 4), sw - 4, 1); }
          px(c, '#5f4327', R(w * 0.31), R(h * 0.05), R(w * 0.38), R(h * 0.55)); px(c, '#8fc39b', R(w * 0.34), R(h * 0.09), R(w * 0.32), R(h * 0.47));
          poly(c, '#4d7c53', [[w * 0.34, h * 0.5], [w * 0.46, h * 0.3], [w * 0.55, h * 0.47], [w * 0.66, h * 0.32], [w * 0.66, h * 0.56], [w * 0.34, h * 0.56]]);
          px(c, '#6b4a30', R(w * 0.4), R(h * 0.72), R(w * 0.2), 3); px(c, '#d5644e', R(w * 0.46), R(h * 0.68), R(w * 0.08), R(h * 0.05));
        },
        anim(c, w, h, t) {
          glow(c, w * 0.16, h * 0.3, h * 0.18, '#fff3c0', 0.05); glow(c, w * 0.84, h * 0.3, h * 0.18, '#fff3c0', 0.05);
          for (let i = 0; i < 2; i += 1) { const x = w * 0.5 + i - 1 + Math.sin(t + i); const y = h * 0.66 - ((t * 2 + i * 3) % 8); px(c, 'rgba(245,235,210,0.6)', x, y, 1, 3); }
        }
      },
      'rainy-cafe': {
        base(c, w, h) {
          interior(c, w, h, [[0, [64, 46, 38]], [1, [86, 58, 44]]], R(h * 0.67), [[0, [120, 80, 58]], [1, [96, 62, 44]]]);
          const wx = R(w * 0.2), wy = R(h * 0.06), ww = R(w * 0.6), wh = R(h * 0.54);
          px(c, '#3a2c26', wx - 2, wy - 2, ww + 4, wh + 4); px(c, '#3a4650', wx, wy, ww, wh);
          for (let i = 0; i < 10; i += 1) px(c, i % 2 ? '#5a6a74' : '#6a5a4a', wx + 2 + ((i * 13) % (ww - 6)), wy + 3 + ((i * 17) % (wh - 8)), 3, R(wh * 0.2));
          px(c, '#2c343d', wx + R(ww / 2) - 1, wy, 2, wh); px(c, '#2c343d', wx, wy + R(wh / 2), ww, 2);
          px(c, '#7a4d33', R(w * 0.06), R(h * 0.72), R(w * 0.88), 4); px(c, '#5b392d', R(w * 0.12), R(h * 0.76), 3, h); px(c, '#5b392d', R(w * 0.85), R(h * 0.76), 3, h);
          px(c, '#e5d2b4', R(w * 0.58), R(h * 0.66), 6, 5); px(c, '#9f6044', R(w * 0.585), R(h * 0.65), 4, 1);
        },
        anim(c, w, h, t) {
          const wx = R(w * 0.2), wy = R(h * 0.06), ww = R(w * 0.6), wh = R(h * 0.54);
          for (let i = 0; i < 14; i += 1) { const x = wx + 3 + ((i * 17) % (ww - 6)); const y = wy + ((i * 11 + t * 20) % (wh - 3)); px(c, 'rgba(200,225,230,0.5)', x, y, 1, 3); }
          for (let i = 0; i < 2; i += 1) { const x = w * 0.6 + i + Math.sin(t * 1.5 + i); const y = h * 0.63 - ((t * 2 + i * 3) % 8); px(c, 'rgba(240,228,205,0.6)', x, y, 1, 3); }
          glow(c, w * 0.14, h * 0.32, h * 0.2, '#ffb45a', 0.06);
        }
      },
      arcade: {
        base(c, w, h) {
          interior(c, w, h, [[0, [24, 18, 44]], [1, [40, 28, 66]]], R(h * 0.74), [[0, [36, 26, 58]], [1, [22, 16, 38]]]);
          px(c, '#ff3fa4', 0, R(h * 0.08), w, 2); px(c, '#37e6ff', 0, R(h * 0.13), w, 1);
          for (let y = R(h * 0.78); y < h; y += 4) px(c, 'rgba(120,80,180,0.25)', 0, y, w, 1);
          for (let x = 0; x < w; x += 8) px(c, 'rgba(80,60,140,0.4)', x, R(h * 0.74), 1, h);
          const cols = ['#8f3da7', '#2d72a8', '#c24f6f'];
          for (let side = 0; side < 2; side += 1) for (let i = 0; i < 3; i += 1) {
            const cw = Math.max(9, R(w * 0.09)); const x = side ? w - cw * (i + 1) - i * 2 : i * (cw + 2) + 2; const top = R(h * 0.28), bh = R(h * 0.5);
            px(c, cols[i], x, top, cw, bh); px(c, shade(cols[i], 0.7), x, top, cw, 2); px(c, shade(cols[i], 1.2), x, top, 2, bh);
            px(c, '#0b1830', x + 2, top + 4, cw - 4, R(bh * 0.4)); px(c, '#20223e', x + 1, top + bh - R(bh * 0.28), cw - 2, R(bh * 0.28));
          }
        },
        anim(c, w, h, t) {
          for (let side = 0; side < 2; side += 1) for (let i = 0; i < 3; i += 1) {
            const cw = Math.max(9, R(w * 0.09)); const x = side ? w - cw * (i + 1) - i * 2 : i * (cw + 2) + 2; const top = R(h * 0.28), bh = R(h * 0.5);
            px(c, Math.sin(t * 3 + i + side * 2) > 0.1 ? ['#53e7e1', '#f178cf', '#ffd45f'][i] : '#173a52', x + 3, top + 5, cw - 6, R(bh * 0.3));
          }
          for (let i = 0; i < 6; i += 1) if (Math.sin(t * 4 + i) > 0) px(c, i % 2 ? '#f57bd6' : '#53e6e0', (i * 23 + R(t * 2)) % w, R(h * 0.07) + (i % 2) * 4, 1, 1);
        }
      },
      'pro-office': {
        base(c, w, h) {
          interior(c, w, h, [[0, [18, 30, 44]], [1, [30, 46, 62]]], R(h * 0.66), [[0, [54, 66, 82]], [1, [36, 46, 60]]]);
          const wx = R(w * 0.3), wy = R(h * 0.12), ww = R(w * 0.4), wh = R(h * 0.44);
          px(c, '#0a1622', wx - 2, wy - 2, ww + 4, wh + 4);
          c.save(); c.beginPath(); c.rect(wx, wy, ww, wh); c.clip();
          px(c, '#0d1b30', wx, wy, ww, wh);
          cityRow(c, wx, ww, wy, wy + wh, '#14263e', '#5fe0ff', '#ffd27a', 7.3);
          c.restore();
          px(c, '#2b4a5f', wx + R(ww / 2) - 1, wy, 2, wh); px(c, '#2b4a5f', wx, wy + R(wh / 2), ww, 2);
          px(c, '#9a6742', 0, R(h * 0.64), w, 4);
          const ms = [{ x: R(w * 0.08), y: R(h * 0.3), w: R(w * 0.24), h: R(h * 0.28) }, { x: R(w * 0.68), y: R(h * 0.3), w: R(w * 0.24), h: R(h * 0.28) }];
          for (const m of ms) { px(c, '#0b1b2b', m.x, m.y, m.w, m.h); px(c, '#3a4a5c', m.x - 1, m.y - 1, m.w + 2, 1); px(c, '#26323f', m.x + R(m.w / 2) - 2, m.y + m.h, 4, R(h * 0.05)); }
        },
        anim(c, w, h, t) {
          const ms = [{ x: R(w * 0.08), y: R(h * 0.3), w: R(w * 0.24), h: R(h * 0.28) }, { x: R(w * 0.68), y: R(h * 0.3), w: R(w * 0.24), h: R(h * 0.28) }];
          const codeCols = ['#57c7ff', '#8be18f', '#e6b95a', '#c98fe0'];
          ms.forEach(function (m, mi) {
            for (let r = 0; r < 6; r += 1) {
              const y = m.y + 3 + r * 4; if (y > m.y + m.h - 3) break;
              const seed = mi * 7 + r + Math.floor(t * 1.2);
              const indent = (seed % 3) * 3;
              const len = 4 + (seed * 5) % Math.max(6, m.w - 6 - indent);
              px(c, codeCols[(r + mi) % codeCols.length], m.x + 2 + indent, y, len, 1);
            }
            if (Math.sin(t * 4 + mi) > 0) px(c, '#e8f4ff', m.x + 2, m.y + m.h - 5, 1, 2);
          });
          drawPlant(c, w * 0.5, h * 0.64, Math.min(w * 0.1, h * 0.16), t, 2);
        }
      },
      'server-room': {
        base(c, w, h) {
          interior(c, w, h, [[0, [8, 20, 32]], [1, [14, 30, 44]]], R(h * 0.5), [[0, [26, 40, 56]], [1, [16, 26, 38]]]);
          poly(c, '#1a2c40', [[0, h], [w * 0.34, h * 0.5], [w * 0.66, h * 0.5], [w, h]]);
          for (let i = 1; i < 7; i += 1) { const y = lerp(h * 0.5, h, i / 7); px(c, '#2c4560', lerp(w * 0.34, 0, i / 7), y, lerp(w * 0.32, w, i / 7), 1); }
          for (let i = 0; i < 8; i += 1) { const bx = lerp(w * 0.34, 0, i / 7); const tx = lerp(w * 0.42, w * 0.1, i / 7); poly(c, '#243a52', [[bx, h], [tx, h * 0.5], [tx + 1, h * 0.5], [bx + 2, h]]); }
          for (let side = 0; side < 2; side += 1) for (let r = 0; r < 3; r += 1) { const x = side ? w - 6 - r * 7 : r * 7; px(c, '#1f3a52', x, 0, 6, R(h * 0.82)); px(c, '#0a2030', x + 1, 2, 4, R(h * 0.76)); }
        },
        anim(c, w, h, t) {
          for (let side = 0; side < 2; side += 1) for (let r = 0; r < 3; r += 1) { const x = side ? w - 6 - r * 7 : r * 7; for (let y = 4; y < h * 0.72; y += 4) if (Math.sin(t * 4 + x + y) > 0) px(c, (Math.floor(y / 4)) % 3 === 0 ? '#58e46d' : '#37cffa', x + 2, y, 1, 1); }
          px(c, '#0c2436', w * 0.44, h * 0.32, w * 0.12, h * 0.1); px(c, Math.sin(t * 3) > 0 ? '#55dfff' : '#1a4a5a', w * 0.45, h * 0.34, w * 0.1, h * 0.06);
        }
      },
      terminal: {
        base(c, w, h) {
          px(c, '#07110e', 0, 0, w, h);
          px(c, '#14251e', 0, 0, w, 4); px(c, '#c65f5f', 3, 1, 2, 2); px(c, '#d6b24e', 7, 1, 2, 2); px(c, '#5fae6e', 11, 1, 2, 2);
          px(c, '#276047', 0, 4, w, 1);
        },
        anim(c, w, h, t) {
          for (let y = 6; y < h; y += 3) px(c, 'rgba(30,90,60,0.14)', 0, y, w, 1);
          const dur = 2.6; const idx = Math.floor(t / dur); const prog = (t % dur) / dur; const lh = 4; const bottom = Math.max(18, R(h * 0.86));
          for (let row = 0; row < Math.ceil(bottom / lh) - 2; row += 1) {
            const seed = (idx - row + 40) % 13; const y = bottom - row * lh;
            px(c, seed % 3 === 0 ? '#67df93' : '#3d9e78', 3, y, 1, 1);
            px(c, '#315e4c', 6, y, 5 + (seed * 3) % Math.max(6, R(w * 0.4)), 1);
            px(c, seed % 4 === 0 ? '#bb78df' : '#67b2d0', R(w * 0.5), y, 4 + (seed * 5) % Math.max(7, R(w * 0.34)), 1);
            if (seed % 2 === 0) px(c, '#cdae58', R(w * 0.8), y, 2 + (seed % 6), 1);
          }
          const ay = Math.min(h - 5, bottom + lh); const lens = [24, 31, 19, 36, 28]; const len = Math.min(lens[idx % lens.length], Math.max(8, w - 10));
          const typed = Math.min(len, Math.floor(prog * len * 1.35)); px(c, '#70e59a', 3, ay, 2, 1);
          for (let ch = 0; ch < typed; ch += 1) { const x = 7 + ch; if (ch % 6 !== 5) px(c, ch < 5 ? '#6dc2db' : ch < len * 0.72 ? '#c387df' : '#e1bd63', x, ay, 1, 1); }
          if (prog < 0.86 && Math.sin(t * 8) > -0.25) px(c, '#b2f5c8', 7 + typed, ay, 1, 2);
        }
      }
    };

    function renderBackground(timestamp) {
      if (!backgroundId || background.hidden || document.hidden) return;
      const reduce = mqReduce.matches;
      if (timestamp - backgroundLastDraw >= 60) {
        backgroundLastDraw = timestamp;
        const minDim = Math.min(stage.clientWidth, stage.clientHeight);
        const pixelSize = Math.max(2, Math.min(4, Math.round(minDim / 150)));
        const width = Math.max(1, Math.ceil(stage.clientWidth / pixelSize));
        const height = Math.max(1, Math.ceil(stage.clientHeight / pixelSize));
        if (background.width !== width || background.height !== height) {
          background.width = width;
          background.height = height;
          baseKey = undefined;
        }
        const context = background.getContext('2d');
        if (context) {
          context.imageSmoothingEnabled = false;
          const scene = SCENES[backgroundId] || SCENES['blue-sky'];
          const base = getBase(width, height, backgroundId, scene.base);
          context.clearRect(0, 0, width, height);
          context.drawImage(base, 0, 0);
          const seconds = reduce ? 0 : (timestamp - backgroundStartedAt) / 1000;
          if (scene.anim) scene.anim(context, width, height, seconds);
          groundShadow(context, width, height);
        }
      }
      if (!reduce) backgroundFrame = window.requestAnimationFrame(renderBackground);
      else backgroundFrame = undefined;
    }

    // Offscreen cache for the static layer (rebuild on size/scene change)
    let baseCanvas, baseKey;
    function getBase(w, h, id, build) {
      const key = id + ':' + w + 'x' + h;
      if (baseKey === key && baseCanvas) return baseCanvas;
      const c = baseCanvas || document.createElement('canvas');
      c.width = w; c.height = h;
      const b = c.getContext('2d');
      b.imageSmoothingEnabled = false;
      b.clearRect(0, 0, w, h);
      build(b, w, h);
      baseCanvas = c; baseKey = key;
      return c;
    }

    function configureBackground(pet) {
      const hasCustomBackground = typeof pet.customBackgroundUri === 'string' && pet.customBackgroundUri.length > 0;
      const hasCanvasBackground = !hasCustomBackground && typeof pet.backgroundId === 'string' && pet.backgroundId.length > 0;
      background.hidden = !hasCanvasBackground;
      customBackground.hidden = !hasCustomBackground;
      stage.classList.toggle('has-background', hasCanvasBackground || hasCustomBackground);
      if (hasCustomBackground) {
        backgroundId = undefined;
        stopBackgroundAnimation();
        customBackground.style.opacity = String(Math.max(0, Math.min(1, Number(pet.customBackgroundOpacity) || 0)));
        if (customBackground.src !== pet.customBackgroundUri) customBackground.src = pet.customBackgroundUri;
        return;
      }
      customBackground.removeAttribute('src');
      if (!hasCanvasBackground) {
        backgroundId = undefined;
        stopBackgroundAnimation();
        return;
      }
      if (backgroundId !== pet.backgroundId) backgroundStartedAt = performance.now();
      backgroundId = pet.backgroundId;
      backgroundLastDraw = 0;
      if (backgroundFrame === undefined) backgroundFrame = window.requestAnimationFrame(renderBackground);
    }

    function resolveLookDirection(direction, deadzone) {
      if (!direction) return undefined;
      let degrees;
      if (typeof direction === 'number') {
        degrees = direction;
      } else {
        if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y)) return undefined;
        const magnitude = Math.hypot(direction.x, direction.y);
        if (magnitude === 0 || magnitude <= Math.max(0, deadzone || 0)) return undefined;
        degrees = (Math.atan2(direction.x, -direction.y) * 180) / Math.PI;
      }
      if (!Number.isFinite(degrees)) return undefined;
      const normalized = ((degrees % 360) + 360) % 360;
      return (Math.round(normalized / 22.5) % 16) * 22.5;
    }

    function showPet(pet, interactionAnimation) {
      stopAnimation();
      if (!interactionAnimation) currentPet = pet;
      if (pet.state !== 'idle' || interactionAnimation) lookDegrees = undefined;
      const animation = interactionAnimation || pet.animation;
      const isInteraction = Boolean(interactionAnimation);
      showOnly(petContent);
      sprite.setAttribute('aria-label', isInteraction ? pet.wavingAriaLabel : pet.animationAriaLabel);
      sprite.title = strings.waveAction;
      configureBackground(pet);
      document.getElementById('pet-status').textContent = strings.statusPrefix + ' ' + (isInteraction ? strings.wavingStatus : stateLabel(pet.state));
      const availableScale = Math.min(
        stage.clientWidth * 0.92 / pet.frameWidth,
        stage.clientHeight * 0.9 / pet.frameHeight
      );
      const requestedScale = pet.scale === 'auto'
        ? Number.POSITIVE_INFINITY
        : Math.max(0.25, Math.min(3, Number(pet.scale) || 1));
      const displayScale = Math.max(0.01, Math.min(requestedScale, availableScale));
      const width = Math.max(1, Math.round(pet.frameWidth * displayScale));
      const height = Math.max(1, Math.round(pet.frameHeight * displayScale));
      const generation = ++imageGeneration;
      const startRendering = (sheet) => {
        if (generation !== imageGeneration) return;
        if (sprite.width !== width) sprite.width = width;
        if (sprite.height !== height) sprite.height = height;
        const context = sprite.getContext('2d');
        if (!context) {
          showOnly(errorContent);
          document.getElementById('error-message').textContent = strings.canvasUnavailable;
          return;
        }
        context.imageSmoothingEnabled = false;
        let frame = 0;
        const drawFrame = () => {
          const lookCell = !isInteraction && lookDegrees !== undefined && Array.isArray(pet.lookDirections)
            ? pet.lookDirections[Math.round(lookDegrees / 22.5) % pet.lookDirections.length]
            : undefined;
          const column = lookCell ? lookCell.column : animation.startColumn + frame;
          const row = lookCell ? lookCell.row : animation.row;
          context.clearRect(0, 0, width, height);
          context.drawImage(
            sheet,
            lookCell ? lookCell.column * pet.frameWidth : column * pet.frameWidth,
            lookCell ? lookCell.row * pet.frameHeight : row * pet.frameHeight,
            pet.frameWidth,
            pet.frameHeight,
            0,
            0,
            width,
            height
          );
        };
        drawCurrentFrame = drawFrame;
        const render = () => {
          drawFrame();
          const durations = animation.frameDurationsMs;
          const baseDelay = Array.isArray(durations) && durations[frame] ? durations[frame] : animation.frameDurationMs;
          const isIdleRestFrame = !isInteraction && pet.state === 'idle' && animation.loop && animation.frameCount > 1 && frame === 0;
          const delay = isIdleRestFrame
            ? ${IDLE_BLINK_MIN_DELAY_MS} + Math.round(Math.random() * ${IDLE_BLINK_MAX_DELAY_MS - IDLE_BLINK_MIN_DELAY_MS})
            : Math.max(16, baseDelay / Math.max(0.25, pet.animationSpeed));
          timer = window.setTimeout(() => {
            if (frame + 1 >= animation.frameCount) {
              if (isInteraction) {
                interactionActive = false;
                if (currentPet) showPet(currentPet);
                return;
              }
              if (!animation.loop) {
                vscode.postMessage({ type: 'animationComplete', state: pet.state });
                return;
              }
              frame = 0;
            } else {
              frame += 1;
            }
            render();
          }, delay);
        };
        render();
      };
      if (loadedSpriteSheet && loadedSpriteUri === pet.spriteUri) {
        startRendering(loadedSpriteSheet);
        return;
      }
      const sheet = new Image();
      sheet.addEventListener('load', () => {
        if (generation !== imageGeneration) return;
        loadedSpriteSheet = sheet;
        loadedSpriteUri = pet.spriteUri;
        startRendering(sheet);
      });
      sheet.addEventListener('error', () => {
        if (generation !== imageGeneration) return;
        stopAnimation();
        showOnly(errorContent);
        document.getElementById('error-message').textContent = strings.spriteLoadFailed;
      });
      sheet.src = pet.spriteUri;
    }

    window.addEventListener('message', ({ data }) => {
      if (!data || typeof data.type !== 'string') return;
      if (data.type === 'showPet') {
        currentPet = data.pet;
        if (!interactionActive) showPet(data.pet);
      }
      if (data.type === 'showEmpty') {
        stopAnimation();
        stopBackgroundAnimation();
        interactionActive = false;
        currentPet = undefined;
        showOnly(emptyContent);
        document.getElementById('empty-title').textContent = data.directoryExists ? strings.noPets : strings.directoryMissing;
        document.getElementById('pets-directory').textContent = data.petsDirectory;
      }
      if (data.type === 'showDisabled') {
        stopAnimation();
        stopBackgroundAnimation();
        interactionActive = false;
        currentPet = undefined;
        showOnly(emptyContent);
        document.getElementById('empty-title').textContent = strings.disabled;
        document.getElementById('pets-directory').textContent = strings.enableSetting;
      }
      if (data.type === 'showError') {
        stopAnimation();
        stopBackgroundAnimation();
        interactionActive = false;
        currentPet = undefined;
        showOnly(errorContent);
        document.getElementById('error-message').textContent = data.message;
      }
      if (data.type === 'setHookIntegration') setHookIntegration(data.state);
      if (data.type === 'setHookProvider') {
        showProviderIcon(data.provider);
        const description = strings.hookProviderLabel + ': ' + data.label + ' (' + strings.hookProviderHint + ')';
        providerToggle.setAttribute('aria-label', description);
        providerToggle.title = description;
      }
    });
    customBackground.addEventListener('error', () => {
      customBackground.hidden = true;
      vscode.postMessage({ type: 'customBackgroundLoadFailed' });
    });
    function wavePet() {
      const now = Date.now();
      if (interactionActive || now < interactionCooldownUntil || !currentPet?.wavingAnimation) return;
      interactionActive = true;
      interactionCooldownUntil = now + 1500;
      showPet(currentPet, currentPet.wavingAnimation);
    }
    function updateLookFromPointer(event) {
      if (!currentPet || !currentPet.lookDirections || currentPet.state !== 'idle' || interactionActive) {
        if (lookDegrees !== undefined) {
          lookDegrees = undefined;
          if (drawCurrentFrame) drawCurrentFrame();
        }
        return;
      }
      const rect = sprite.getBoundingClientRect();
      const deadzone = Math.min(rect.width, rect.height) * 0.2;
      const next = resolveLookDirection({
        x: event.clientX - (rect.left + rect.width / 2),
        y: event.clientY - (rect.top + rect.height / 2)
      }, deadzone);
      if (next === lookDegrees) return;
      lookDegrees = next;
      if (drawCurrentFrame) drawCurrentFrame();
    }
    function clearLook() {
      if (lookDegrees === undefined) return;
      lookDegrees = undefined;
      if (drawCurrentFrame) drawCurrentFrame();
    }
    sprite.addEventListener('click', (event) => {
      if (event.button === 0) wavePet();
    });
    sprite.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      wavePet();
    });
    stage.addEventListener('pointermove', updateLookFromPointer);
    stage.addEventListener('pointerleave', clearLook);
    hookAction.addEventListener('click', () => {
      vscode.postMessage({
        type: hookStatus.dataset.state === 'awaitingTrust' ? 'showHooksHelp' : 'setupHooks'
      });
    });
    providerToggle.addEventListener('click', () => {
      vscode.postMessage({ type: 'cycleHookProvider' });
    });
    document.addEventListener('visibilitychange', () => {
      if (!currentPet || !currentPet.pauseWhenHidden) return;
      if (document.hidden) {
        stopAnimation();
        stopBackgroundAnimation();
        interactionActive = false;
      }
      else showPet(currentPet);
    });
    new ResizeObserver(() => {
      if (interactionActive) return;
      if (currentPet?.scale === 'auto') {
        showPet(currentPet);
        return;
      }
      if (!backgroundId || background.hidden) return;
      backgroundLastDraw = 0;
      if (backgroundFrame === undefined) backgroundFrame = window.requestAnimationFrame(renderBackground);
    }).observe(stage);
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}

function createNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function escapeForInlineScript(value: string): string {
  return value.replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
