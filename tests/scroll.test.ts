import { describe, expect, it } from "vitest";
import { bottomTarget, distanceFromBottom, isNearBottom } from "../src/ui/scrollMath";

const at = (scrollTop: number, scrollHeight: number, clientHeight: number) => ({
  scrollTop,
  scrollHeight,
  clientHeight,
});

describe("distanceFromBottom", () => {
  it("is zero when the last line is in view", () => {
    expect(distanceFromBottom(at(600, 1000, 400))).toBe(0);
  });

  it("measures the remaining scroll", () => {
    expect(distanceFromBottom(at(500, 1000, 400))).toBe(100);
  });

  it("never goes negative when the content is shorter than the viewport", () => {
    expect(distanceFromBottom(at(0, 200, 400))).toBe(0);
  });
});

describe("isNearBottom", () => {
  it("follows the stream while the user is within the threshold", () => {
    expect(isNearBottom(at(560, 1000, 400))).toBe(true);
  });

  it("stops following once the user scrolls up", () => {
    expect(isNearBottom(at(400, 1000, 400))).toBe(false);
  });

  it("respects a custom threshold", () => {
    expect(isNearBottom(at(500, 1000, 400), 200)).toBe(true);
  });

  it("follows when everything fits on screen", () => {
    expect(isNearBottom(at(0, 200, 400))).toBe(true);
  });
});

describe("bottomTarget", () => {
  it("is the maximum scroll offset", () => {
    expect(bottomTarget(at(0, 1000, 400))).toBe(600);
  });

  it("is zero when the content is shorter than the viewport", () => {
    expect(bottomTarget(at(0, 200, 400))).toBe(0);
  });
});
