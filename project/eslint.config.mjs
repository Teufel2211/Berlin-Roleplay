// ESLint flat config – enforce Components V2 (no classic embeds)
export default [
  {
    ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**"],
  },
  {
    plugins: {
      "@typescript-eslint": (await import("@typescript-eslint/eslint-plugin")).default,
    },
    languageOptions: {
      parser: (await import("@typescript-eslint/parser")).default,
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "discord.js",
              importNames: ["EmbedBuilder", "Embed"],
              message:
                "Components V2 only — no classic embeds. Use the V2Layout engine from @berlin/shared.",
            },
          ],
        },
      ],
    },
  },
];