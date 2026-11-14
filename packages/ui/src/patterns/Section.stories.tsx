import preview from "#storybook/preview";
import { Section } from "./Section.tsx";

/**
 * 見出しと中身のまとまり。広いところでは見出しを左の 3 列、中身を右の 9 列に置き、狭いところでは見出しを上に積む。
 * 置き場所の幅（コンテナクエリ）で切り替わるので、Storybook の表示幅を変えて確かめる。
 */
const meta = preview.meta({
  title: "Patterns/Section",
  component: Section,
  args: {
    label: "アカウント",
    children: (
      <dl style={{ borderTop: "1px solid var(--foreground)" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.125rem",
            borderBottomWidth: 1,
            paddingBlock: "0.625rem",
          }}
        >
          <dt style={{ color: "var(--muted-foreground)", fontSize: "0.75rem" }}>ログイン中</dt>
          <dd>user@example.com</dd>
        </div>
      </dl>
    ),
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ padding: "1rem" }}>
        <Story />
      </div>
    ),
  ],
});

export default meta;

export const Default = meta.story({});
