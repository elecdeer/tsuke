import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vite-plus/test";
import { AccountIcon, DateIcon, PlaceIcon } from "./FieldIcons.tsx";

const icons = { DateIcon, AccountIcon, PlaceIcon };

describe("FieldIcons", () => {
  test.each(Object.entries(icons))("%s は名前の文字に添える飾りなので読み上げない", (_, Icon) => {
    const markup = renderToStaticMarkup(<Icon />);

    expect(markup).toMatch(/^<svg[^>]* aria-hidden="true"/);
  });

  test.each(Object.entries(icons))("%s はラベルの文字の色で描く", (_, Icon) => {
    const markup = renderToStaticMarkup(<Icon />);

    expect(markup).toContain('stroke="currentColor"');
    expect(markup).not.toMatch(/(fill|stroke)="#/);
  });

  test("大きさを変えるクラスを渡すと、既定の大きさを置き換える", () => {
    const markup = renderToStaticMarkup(<DateIcon className="size-5" />);

    expect(markup).toContain('class="shrink-0 size-5"');
  });

  test("3 つのアイコンはそれぞれ違う形をしている", () => {
    const shapes = Object.values(icons).map((Icon) => renderToStaticMarkup(<Icon />));

    expect(new Set(shapes).size).toBe(shapes.length);
  });
});
