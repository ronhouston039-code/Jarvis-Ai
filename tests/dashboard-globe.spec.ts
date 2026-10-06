import { openHomeMenu, mockHomeMapTiles } from "./helpers/home-controls";
import { expect, loadAllTestAccounts, test } from "deepspace/testing";

test.skip(loadAllTestAccounts().length < 1, "Requires test account");

test("desktop shell pins the command bar and scrolls Home content internally on short screens", async ({
  users,
}) => {
  const [user] = await users(1);
  await mockHomeMapTiles(user.page);
  await user.page.goto("/home");
  await expect(user.page.locator(".jarvis-desktop-shell")).toBeVisible();
  for (const height of [600, 720, 900]) {
    await user.page.setViewportSize({ width: 1280, height });
    await expect
      .poll(() =>
        user.page.evaluate(() => {
          const mic = document
            .querySelector(".hud-bottom .mic-button")!
            .getBoundingClientRect();
          return mic.bottom <= innerHeight;
        }),
      )
      .toBe(true);
    const geometry = await user.page.evaluate(() => {
      const shell = document
        .querySelector(".jarvis-desktop-shell")!
        .getBoundingClientRect();
      const right = document.querySelector<HTMLElement>(
        ".j-home-content",
      )!;
      right.scrollTop = right.scrollHeight;
      return {
        shellBottom: shell.bottom,
        pageHeight: document.documentElement.scrollHeight,
        viewportHeight: innerHeight,
        overflow: getComputedStyle(right).overflowY,
        panelScrolled: right.scrollTop > 0,
      };
    });
    expect(geometry.shellBottom).toBeLessThanOrEqual(height);
    expect(geometry.pageHeight).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(geometry.overflow).toBe("auto");
    if (height === 600) expect(geometry.panelScrolled).toBe(true);
  }
});

test("command center rotates its globe and releases it when entering Focus", async ({
  users,
}, testInfo) => {
  const [user] = await users(1);
  await user.page.setViewportSize({ width: 1280, height: 720 });
  await mockHomeMapTiles(user.page);
  await user.page.goto("/home");
  const globe = user.page.locator(
    '.holographic-globe canvas[data-renderer="webgl"]',
  );
  await expect(globe).toBeVisible();
  await expect(globe).toHaveAttribute("data-rotation", /\d/);
  const rotation = await globe.getAttribute("data-rotation");
  await expect
    .poll(() => globe.getAttribute("data-rotation"))
    .not.toBe(rotation);
  await expect(user.page.locator(".neural-plexus canvas")).toHaveCount(1);
  await user.page.screenshot({
    path: testInfo.outputPath("command-center.png"),
  });
  await openHomeMenu(user.page);
  await user.page
    .getByRole("button", { name: "Full Screen Focus", exact: true })
    .click();
  await expect(
    user.page.getByRole("region", { name: "Jarvis Focus Mode" }),
  ).toBeVisible();
  await expect(globe).toHaveCount(0);
  await expect(user.page.locator(".neural-plexus canvas")).toHaveCount(1);
});

test("command center globe handles context loss and unsupported WebGL", async ({
  users,
}) => {
  const [user] = await users(1);
  await mockHomeMapTiles(user.page);
  await user.page.goto("/home");
  const globe = user.page.locator(
    '.holographic-globe canvas[data-renderer="webgl"]',
  );
  await expect(globe).toBeVisible();
  await globe.evaluate((canvas) =>
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
  );
  await expect(
    user.page.locator('.holographic-globe svg[data-renderer="svg"]'),
  ).toBeVisible();
  await expect(globe).toHaveCount(0);
  // The unified core releases its only canvas and keeps a state-driven SVG.
  await expect(user.page.locator(".neural-plexus canvas")).toHaveCount(0);
  await expect(user.page.locator(".neural-core svg[data-active=true]")).toHaveCount(1);
  await user.page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      ...args: unknown[]
    ) {
      if (type.startsWith("webgl")) return null;
      return original.apply(this, [type, ...args] as Parameters<
        typeof original
      >);
    } as typeof original;
  });
  await user.page.reload();
  await expect(
    user.page.locator('.holographic-globe svg[data-renderer="svg"]'),
  ).toBeVisible();
  await expect(user.page.locator(".holographic-globe canvas")).toHaveCount(0);
  await expect(
    user.page.getByRole("button", { name: "Start voice input", exact: true }),
  ).toBeVisible();
});
