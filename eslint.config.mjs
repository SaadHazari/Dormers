import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Dependency-rule enforcement for the layered architecture.
// See .planning/refactor/L1-BOUNDARIES.md for the inward-pointing rule.
// Warn-level during the refactor (Phase 0–10); tightened to error in Phase 11.
const restrictedImportsByLayer = {
  // shared/ — pure primitives, imports nothing else inside src/
  shared: {
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            "@/contexts/**",
            "@/infra/**",
            "@/ui-system/**",
            "@/app/**",
            "@/lib/**",
            "@/utils/**",
            "@/components/**",
            "@/hooks/**",
          ],
        },
      ],
    },
  },
  // infra/ — outer ring, imports only shared/
  infra: {
    files: ["src/infra/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            "@/contexts/**",
            "@/ui-system/**",
            "@/app/**",
            "@/components/**",
            "@/hooks/**",
          ],
        },
      ],
    },
  },
  // contexts/<X>/domain — pure domain, only shared/ allowed
  contextsDomain: {
    files: ["src/contexts/*/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            "@/infra/**",
            "@/ui-system/**",
            "@/app/**",
            "@/components/**",
            "@/hooks/**",
          ],
        },
      ],
    },
  },
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  restrictedImportsByLayer.shared,
  restrictedImportsByLayer.infra,
  restrictedImportsByLayer.contextsDomain,
];

export default eslintConfig;
