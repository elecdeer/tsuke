import addonDocs from "@storybook/addon-docs";
import { definePreview } from "@storybook/react-vite";

import "./storybook.css";

export default definePreview({
  addons: [addonDocs()],
  parameters: {
    layout: "padded",
    options: {
      storySort: {
        order: ["Introduction", "Tokens", "Patterns", "Components"],
      },
    },
  },
});
