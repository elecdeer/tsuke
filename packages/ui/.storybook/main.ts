import tailwindcss from "@tailwindcss/vite";
import { defineMain } from "@storybook/react-vite/node";

export default defineMain({
  stories: ["../docs/**/*.mdx", "../src/**/*.stories.{ts,tsx}"],
  addons: ["@storybook/addon-docs", "@storybook/addon-vitest"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  features: {
    experimentalTestSyntax: true,
  },
  viteFinal: (config) => ({
    ...config,
    plugins: [...(config.plugins ?? []), tailwindcss()],
  }),
});
