import { describe, expect, test, vi } from "vite-plus/test";
import { subscribeMediaQuery } from "./mediaQuery.ts";

describe("subscribeMediaQuery", () => {
  test("渡したクエリの change に onChange を登録し、返した関数で同じものを外す", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const matchMedia = vi.fn(() => ({ matches: false, addEventListener, removeEventListener }));
    const onChange = () => {};

    const unsubscribe = subscribeMediaQuery(matchMedia, "(min-width: 80rem)", onChange);

    expect(matchMedia).toHaveBeenCalledWith("(min-width: 80rem)");
    expect(addEventListener).toHaveBeenCalledWith("change", onChange);
    expect(removeEventListener).not.toHaveBeenCalled();

    unsubscribe();

    expect(removeEventListener).toHaveBeenCalledWith("change", onChange);
  });
});
