---
title: 'noUncheckedIndexedAccess для ядра'
type: 'chore'
created: '2026-10-27'
status: 'done'
baseline_commit: 'b3fd2b56bd37eeac81cdc9b7e69979200d96b67b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-2-a3-core-source-gates.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `packages/core` проверяется `astro/tsconfigs/strict` без `noUncheckedIndexedAccess`, а
`tsconfig.build.json` выключает флаг базового `tsconfig.base.json` явно; индексный доступ вроде
`byLocale[referenceLocale]` не помечается, хотя `scripts/` уже проверяются с флагом.

**Approach:** Часть A4 истории 6.2. Включить флаг в обоих tsconfig ядра, исправить 83 ошибки
перенесённого кода без изменения поведения и закрепить флаг тестом, который падает при его снятии.

## Boundaries & Constraints

**Always:** Поведение кода не меняется: правки только сужают типы (проверка, деструктуризация с
проверкой, `??` с прежним результатом, `!` там, где индекс доказан конструкцией — как уже принято в
ядре, например `index.ts:98`, `translation-marker.ts:47`). В тестах допустимы `!` и `?.`. Без
подавлений (`@ts-expect-error`, `as any`, снятие флага для файла); `pnpm check`, `pnpm build` и
`pnpm demo:packed` проходят.

**Решение владельца (2026-10-27):** A4 сужена до флага; 17 тестов на реальном контенте — часть A5
(запись в `deferred-work.md`), после флага, чтобы переписанные тесты сразу проверялись им.

**Never:** Не переписывать 17 тестов (A5). Не включать флаг демо и не вводить
`exactOptionalPropertyTypes` или другие флаги. Не менять исходный репо.

</frozen-after-approval>

## Code Map

Ошибки — `astro check` ядра с флагом (83, только `.ts`; в `.astro` нет; 14 ошибок `Cannot find
module '*.astro'` у голого `tsc` к флагу не относятся).

- `packages/core/tsconfig.json` (extends `astro/tsconfigs/strict`, проверяется `astro check` в
  `pnpm typecheck`) — добавить флаг. `packages/core/tsconfig.build.json:8` — удалить `false`, флаг
  придёт из `tsconfig.base.json`; `dist/` строится из `index.ts`, `collections.ts` — ошибок там нет.
- Исходник: `lib/content/mdx-structure.ts` (24: `lcsOps` — `dp[i][j]` в границах циклов; `diffLevel`,
  `classifyGapResidual` — `a[op.i]`, `b[op.j]`, `dels[k]`, индексы из того же массива);
  `lib/redirects/contract.ts:112-135` (15: `[from, to, status] = fields` после `fields.length !== 3`);
  `lib/split-heading.ts:20,57-69` (6: `SPLIT_POINTS[wordCount]` при `wordCount < length`, `words[0]`
  после непустой строки); `lib/security-headers.ts:162` (`long[0]` после `length > 0`);
  `lib/text.ts:37`, `lib/portfolio/captured.ts:9` (группа `year` всегда есть при совпадении),
  `lib/contact/handle.ts:14` (`split(';')[0]`).
- Тесты: `lib/content/mdx-structure.test.ts` (23), `lib/contact/{telegram,turnstile,handle}.test.ts`
  (8), `lib/blocks/callout/tokens.test.ts:20`, `config/site.test.ts:414`.
- Гард флага: корневой `tsconfig.json` включает `scripts/**/*.ts`; `typescript` — зависимость корня
  (`scripts/lib/code-comments.ts` его импортирует); `vitest.config.ts` уже берёт
  `scripts/**/*.test.ts`. `ts.getParsedCommandLineOfConfigFile` разрешает `extends` (включая
  `astro/tsconfigs/strict` из `node_modules` ядра).
- Планирование: `_bmad-output/planning-artifacts/epics.md:995-996` (строка A4),
  `sprint-status.yaml:94` (`6-2-a4-real-content-tests-and-strict-index`), `deferred-work.md` — записи
  флага (источник A2 и «та же отдельная часть после A3»).

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/tsconfig.json`, `packages/core/tsconfig.build.json` -- включить флаг, убрать
  явный `false` -- ядро проверяется и собирается с флагом.
- [x] `packages/core/src/lib/**` (7 файлов исходника из Code Map) -- сузить типы без изменения
  поведения -- 0 ошибок `astro check`.
- [x] `packages/core/src/**/*.test.ts` (6 файлов из Code Map) -- то же в тестах.
- [x] `scripts/core-tsconfig.test.ts` -- для `packages/core/tsconfig.json` и `tsconfig.build.json`
  разобранные опции (с `extends`) содержат `noUncheckedIndexedAccess: true` -- снятие флага ловит
  `pnpm check`.
- [x] `_bmad-output/planning-artifacts/epics.md`, `sprint-status.yaml` -- A4 = флаг, новая часть A5
  (17 тестов на фикстурах); ключ A4 → `6-2-a4-strict-index`, добавить `6-2-a5-real-content-tests`
  (`backlog`).

**Acceptance Criteria:**
- [x] `pnpm check` проходит; в нём `astro check` ядра идёт с флагом и даёт 0 ошибок.
- [x] Удаление флага из любого из двух tsconfig ядра (или `false` в нём) роняет
  `scripts/core-tsconfig.test.ts`.
- [x] `pnpm build && pnpm demo:packed` проходят; набор страниц демо не изменился.
- [x] Подавлений нет: `pnpm lint` (`noInlineConfig`, `ban-ts-comment`, `no-explicit-any`) проходит.
- [x] Поведение не изменилось: ожидания существующих тестов ядра не правятся — меняются только
  обращения к значениям ради типов.

## Implementation Notes

- `!` — на индексах, доказанных границами циклов и операциями LCS (`mdx-structure.ts`),
  `SPLIT_POINTS[wordCount]` и `words[0]` (`split-heading.ts`), группе `year` (`captured.ts`) и
  `split(';')[0]` (`handle.ts`). `redirects/contract.ts`: проверка `fields.length !== 3` заменена
  деструктуризацией `[from, to, status, ...extra]` с проверкой на `undefined` и пустой `extra` —
  то же условие. `security-headers.ts`: `const [long] = …; if (long)`. `text.ts`: `sentences[0] ?? clean`.
- Тесты: `!` у индексов; `g?.line` в `mdx-structure.test.ts` — ожидание `toBe(6)` то же.
- `tsconfig.build.json` флаг наследует из `tsconfig.base.json`, поэтому «снять» его там можно только
  явным `false` или удалением из базы; тест ловит оба случая (проверено мутацией всех четырёх
  вариантов, включая удаление из `tsconfig.json`).
- Сборка демо: тот же набор из 47 файлов и 7 страниц, отличие только во времени сборки на `/status/`.

## Spec Change Log

## Review Triage Log

Проход 1 (2026-10-27, Codex: blind-hunter B, edge-case-hunter E, verification-gap V — пробелов
проверки V не нашёл).

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| B2+E1 | `parsedOptions` не смотрит восстановимые ошибки `parsed.errors`: неверная опция при флаге `true` проходит | low | `getParsedCommandLineOfConfigFile` кладёт их в `parsed.errors`, колбэк ловит только невосстановимые; добавлена проверка пустого `parsed.errors` | patch |
| B1 | Гард проходит при `strictNullChecks: false`, когда флаг ничего не даёт | low | Флаг сужает типы только при проверке `null`/`undefined`; `strict: true` приходит из `tsconfig.base.json:7` и `astro/tsconfigs/strict`, но его снятие гард не ловил; добавлено `strictNullChecks ?? strict` | patch |
| B3 | Записи флага в `deferred-work.md` остаются открытыми | low | Записи источника A2 и «та же отдельная часть после A3» закрыты `closed_by`; `partial_by` записи A3 — прежняя запись, её текст не правится по правилам файла, открытая часть теперь в записи A5 | patch |
| B4 | `sprint-status.yaml` держит A4 `in-progress` при спеке `in-review` | false | Шаг 5 синхронизирует статус истории в `review` вместе со спекой `done`; между шагами расхождение — штатное состояние | reject |
| B5 | Критерий «удаление флага из любого из двух tsconfig» неточен для `tsconfig.build.json`, где флаг унаследован | low | Правка — текст этой спеки; поведение покрыто: тест падает при явном `false` в `tsconfig.build.json` и при удалении из `tsconfig.base.json` (Implementation Notes) | reject |
| B6 | Пример `byLocale[referenceLocale]` в Intent не затрагивается флагом: `byLocale` — `Record<Locale, …>` (`lib/status/build-data.ts:112`) | low | Верно, но правка — текст этой спеки (замороженный Intent); на код не влияет | reject |

## Verification

**Commands:**
- `pnpm --filter @picasso-ai/astrum-scena typecheck` -- expected: `0 errors`.
- `pnpm check` -- expected: успех, `scripts/core-tsconfig.test.ts` в выводе vitest.
- `pnpm build && pnpm demo:packed` -- expected: успех.
