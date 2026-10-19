import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../app/globals.css"), "utf8")
const dark = css.match(/\.dark\s*\{([^}]+)\}/)![1]
const tokens = Object.fromEntries(
  [...dark.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)].map(([, name, value]) => [name, value]),
)
function luminance(hex: string) {
  const rgb = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
}

describe("dark theme text contrast", () => {
  it.each([
    ["foreground", "background"],
    ["card-foreground", "card"],
    ["popover-foreground", "popover"],
    ["muted-foreground", "card"],
    ["muted-foreground", "muted"],
    ["primary-foreground", "primary"],
    ["sidebar-foreground", "sidebar"],
    ["sidebar-accent-foreground", "sidebar-accent"],
  ])("keeps %s readable on %s", (text, surface) => {
    const values = [luminance(tokens[text]), luminance(tokens[surface])].sort((a, b) => a - b)
    expect((values[1] + 0.05) / (values[0] + 0.05)).toBeGreaterThanOrEqual(4.5)
  })
})
