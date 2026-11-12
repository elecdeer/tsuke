import { defineProject } from "vite-plus";

export default defineProject({
  test: {
    name: "ui/unit",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
