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
// Hard-enforced at error level — violations block builds.
const restrictedImportsByLayer = {
  // shared/ — pure primitives, imports nothing else inside src/
  shared: {
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
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
  // infra/ — outer ring. Can import from shared/ and from
  // contexts/<X>/domain (to implement domain contracts: repository
  // interfaces, types like SUBSCRIPTION_STATUS that the persistence layer
  // must serialize). Cannot import from usecases, ui, app, components.
  infra: {
    files: ["src/infra/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@/contexts/*/usecases/**",
            "@/contexts/*/ui/**",
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
        "error",
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
