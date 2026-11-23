# ADR-0005: Пины версий тулчейна (TypeScript 6.x)

- **Статус:** accepted
- **Дата:** 2026-07-18

## Контекст

При установке реестр отдал «забежавшие вперёд» мажорные версии: astro 7, react 19.2,
eslint 10, typescript 7, vitest 4. Большинство работает без проблем. Но `astro check`
(наш `typecheck`) падает с TypeScript 7: нативный компилятор (7.0+) ещё не отдаёт
программный API, на который опирается `@astrojs/language-server`. Astro просит TS 6.x
до появления поддержки (см. withastro/roadmap#1321).

## Решение

- **`typescript` пиннут на `^6`** (установлен 6.0.3) — последняя ветка с нужным API.
- Остальные мажоры оставлены как есть (astro 7, react 19.2, eslint 10, vitest 4) — гейты на них зелёные.

## Последствия

- (+) `typecheck` работает (0 ошибок/warnings/hints).
- (−) Держим TS на 6.x, а не 7 — пересмотреть, когда `@astrojs/check` начнёт поддерживать TS 7.
- Аналог дисциплины durer (ADR там: «pin Node 24, defer ESLint 10»).

## Заметки

- `eslint.config.mjs` использует `defineConfig` из `eslint/config` (не deprecated `tseslint.config`).
- `pnpm` 11 хранит `allowBuilds` в `pnpm-workspace.yaml` (не в `package.json`); разрешён `esbuild`.
- Тестовый гейт — `vitest run` без `--passWithNoTests`: если не найден ни один тест, гейт падает (история 5.9).
