import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * eslint-config-next ships flat config arrays directly. Going through
 * FlatCompat instead makes @eslint/eslintrc re-validate the legacy extends,
 * and the failure it reports is a crash while formatting its own schema
 * error — which hides the real reason lint cannot run at all.
 */
const eslintConfig = [
  { ignores: ["node_modules/**", ".next/**", "out/**", "next-env.d.ts"] },
  ...coreWebVitals,
  ...typescript,
];

export default eslintConfig;
