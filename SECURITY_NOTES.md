# Security notes

## npm audit (2026-11-02)

`npm audit fix` (without `--force`) changes nothing: the only fix npm offers
is `--force`, which would install eslint@4. Lockfile unchanged; `npm ci` from
a clean `node_modules` installs it as is.

### Runtime dependencies: `npm audit --omit=dev`

```
found 0 vulnerabilities
```

### Remaining findings (all dev-only)

All 16 entries are one advisory, reported once for minimatch and once for
each package that depends on it.

| Package | Severity | Shipped? | Reachable? | Decision |
|---|---|---|---|---|
| minimatch 3.1.5 / 10.2.6 ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)), via eslint 9, @eslint/config-array, @eslint/eslintrc, eslint-plugin-import / jsx-a11y / react, typescript-eslint, eslint-config-next | moderate | No: devDependencies only (lint tooling), not in the production bundle or server | No: the amplification needs `optimizationLevel >= 2` and an attacker-supplied glob. ESLint uses the default level (1) and only globs from our own config | Accepted. Fixed only in minimatch 11.0.1 (released 2026-10-27); no 3.x or 10.x backport. An `overrides` pin to 11 is a major bump under eslint, which calls the 3.x default-export API. Revisit when eslint / typescript-eslint move to minimatch 11. |

### Full `npm audit`

```
# npm audit report

minimatch  <11.0.1
Severity: moderate
minimatch has potential denial of service via globparts amplification - https://github.com/advisories/GHSA-g3hv-75wg-m249
fix available via `npm audit fix --force`
Will install eslint@4.0.0, which is a breaking change
node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch
node_modules/minimatch
  @eslint/config-array  *
  Depends on vulnerable versions of minimatch
  node_modules/@eslint/config-array
    eslint  0.7.1 - 2.0.0-rc.1 || >=4.1.0
    Depends on vulnerable versions of @eslint-community/eslint-utils
    Depends on vulnerable versions of @eslint/config-array
    Depends on vulnerable versions of @eslint/eslintrc
    Depends on vulnerable versions of minimatch
    node_modules/eslint
      @eslint-community/eslint-utils  *
      Depends on vulnerable versions of eslint
      node_modules/@eslint-community/eslint-utils
        @next/eslint-plugin-next  >=16.3.0-canary.0
        Depends on vulnerable versions of @eslint-community/eslint-utils
        node_modules/@next/eslint-plugin-next
          eslint-config-next  >=10.2.1-canary.2
          Depends on vulnerable versions of @next/eslint-plugin-next
          Depends on vulnerable versions of eslint
          Depends on vulnerable versions of eslint-plugin-import
          Depends on vulnerable versions of eslint-plugin-jsx-a11y
          Depends on vulnerable versions of eslint-plugin-react
          Depends on vulnerable versions of typescript-eslint
          node_modules/eslint-config-next
        @typescript-eslint/utils  *
        Depends on vulnerable versions of @eslint-community/eslint-utils
        Depends on vulnerable versions of @typescript-eslint/typescript-estree
        Depends on vulnerable versions of eslint
        node_modules/@typescript-eslint/utils
          @typescript-eslint/eslint-plugin  *
          Depends on vulnerable versions of @typescript-eslint/parser
          Depends on vulnerable versions of @typescript-eslint/type-utils
          Depends on vulnerable versions of @typescript-eslint/utils
          Depends on vulnerable versions of eslint
          node_modules/@typescript-eslint/eslint-plugin
          @typescript-eslint/type-utils  >=5.9.2-alpha.0
          Depends on vulnerable versions of @typescript-eslint/typescript-estree
          Depends on vulnerable versions of @typescript-eslint/utils
          Depends on vulnerable versions of eslint
          node_modules/@typescript-eslint/type-utils
          typescript-eslint  *
          Depends on vulnerable versions of @typescript-eslint/eslint-plugin
          Depends on vulnerable versions of @typescript-eslint/parser
          Depends on vulnerable versions of @typescript-eslint/typescript-estree
          Depends on vulnerable versions of @typescript-eslint/utils
          Depends on vulnerable versions of eslint
          node_modules/typescript-eslint
      @typescript-eslint/parser  *
      Depends on vulnerable versions of @typescript-eslint/typescript-estree
      Depends on vulnerable versions of eslint
      node_modules/@typescript-eslint/parser
  @eslint/eslintrc  0.0.1 || >=0.1.1
  Depends on vulnerable versions of minimatch
  node_modules/@eslint/eslintrc
  @typescript-eslint/typescript-estree  >=6.16.0
  Depends on vulnerable versions of minimatch
  node_modules/@typescript-eslint/typescript-estree
  eslint-plugin-import  >=1.15.0
  Depends on vulnerable versions of minimatch
  node_modules/eslint-plugin-import
  eslint-plugin-jsx-a11y  >=6.5.0
  Depends on vulnerable versions of minimatch
  node_modules/eslint-plugin-jsx-a11y
  eslint-plugin-react  >=7.23.0
  Depends on vulnerable versions of minimatch
  node_modules/eslint-plugin-react

16 moderate severity vulnerabilities

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force
```
