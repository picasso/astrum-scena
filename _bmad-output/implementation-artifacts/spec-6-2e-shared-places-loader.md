---
title: 'Общая загрузка мест'
type: 'refactor'
created: '2026-10-27'
status: 'done'
baseline_commit: 'dcd912fe986832e87cf730fae45003f87725f8b5'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Критерий 6.2 (AD-9): загрузка мест общая для контента и GPS bounds, GPS-потребитель не
читает ненужные ему категории и теги, второй читатель `places.yaml` устранён. В ядре `places.yaml`
читает только `loadTaxonomyConfig` (`lib/content/files.ts`) — всегда вместе с категориями и тегами,
путь — строкой в коде; второй читатель (`loadPlaceIds` в `scripts/lib/images/place-gps-bounds.ts`
исходника) — часть пайплайна изображений, который по `epics.md` переносится в 6.7.

**Approach:** Часть E истории 6.2. У каждого файла таксономии (`categories.yaml`, `places.yaml`,
`tags.yaml`) — свой загрузчик и путь в одной константе; `loadTaxonomyConfig` собирает их. Проверка в
`pnpm check` не даёт читать эти файлы в обход загрузчика, поэтому перенос GPS-кода в 6.7 обязан
получать места через `loadPlacesConfig`.

**Решение владельца (2026-10-27):** вариант A — загрузчик и гейт сейчас; GPS-код (`place-gps-bounds`,
`gps-place`) переносится в 6.7 вместе с пайплайном изображений поверх загрузчика. Критерий эпика
переписывается под это.

## Boundaries & Constraints

**Always:** Один загрузчик и одна схема на файл, путь — в одном месте (AD-9); поведение и сообщения
ошибок `loadTaxonomyConfig`, `loadContentSnapshot` и страницы фото не меняются; загрузчики берут
корень сайта параметром, не `process.cwd()`. Гейт — в `pnpm check`.

**Never:** Не переносить GPS-код, остальной пайплайн изображений и CLI (6.7). Не менять исходный репо.

## I/O & Edge-Case Matrix

| Сценарий | Вход / состояние | Ожидаемое | Ошибка |
|---|---|---|---|
| Места отдельно | `loadPlacesConfig(root)` при валидном `places.yaml` | массив мест; `categories.yaml` и `tags.yaml` не читаются | — |
| Нет файла | `places.yaml` отсутствует | отказ, как раньше у `loadTaxonomyConfig` | ENOENT с путём |
| Обход загрузчика | `'places.yaml'` (или другой файл таксономии) в коде ядра или `scripts/` вне загрузчика | гейт падает | файл и строка |
| Тесты и фикстуры | имя файла в `*.test.ts` или фикстурах | гейт проходит | — |

</frozen-after-approval>

## Code Map

- `packages/core/src/lib/content/files.ts:119-137` — `loadTaxonomyConfig(root)`: `Promise.all` трёх
  `readFile(path.join(root, 'src/content/config', '<file>.yaml'))` + `*ConfigSchema.parse(parseYaml)`;
  вызывающие — `loadContentSnapshot` (`files.ts:146`, его зовёт интеграция `index.ts:118`) и
  `lib/portfolio/photo-page.ts:84`. Возвращаемая форма `{ categories, places, tags }` сохраняется.
- `packages/core/src/lib/content/schemas.ts` — `categoriesConfigSchema`, `placesConfigSchema`
  (`:361`), `tagsConfigSchema`; типы `Place` (`:478`) и др.
- `packages/core/src/lib/content/files.test.ts:69,101,176` — фикстуры с `config/places.yaml`; сюда —
  тесты загрузчиков (места без файлов категорий и тегов, отсутствие файла).
- `eslint.config.mjs` — `files.ts` в списке `ADAPTERS` (IO разрешён); новый модуль не нужен.
- Гейт: тест в `scripts/` по образцу гейтов A3 (`scripts/check-*.ts` + тест, `git ls-files`, как
  `scripts/check-code-comments.ts`); проверяемые деревья — `packages/core/src` и `scripts`; исключения —
  `*.test.ts`, каталоги `test-fixtures`/`__fixtures__`, сам загрузчик и сам гейт (в нём имена файлов). Регистрация — `package.json`
  (`check:taxonomy-readers`) и `scripts/check.ts` `CHECK_GROUPS` (+`scripts/check.test.ts`).
- Исходник (`$REFERENCE_SITE_ROOT`, только чтение) — для формулировки критерия 6.7:
  `scripts/lib/images/place-gps-bounds.ts:86-91` (`PLACES_RELATIVE_PATH`, `loadPlaceIds`),
  `gps-place.ts` (чистая функция над `Place[]`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/lib/content/files.ts` -- константы путей трёх файлов, экспортируемые
  `loadCategoriesConfig`, `loadPlacesConfig`, `loadTagsConfig` (корень параметром, разбор схемой);
  `loadTaxonomyConfig` собирает их -- один загрузчик на файл.
- [x] `packages/core/src/lib/content/files.test.ts` -- строки матрицы «места отдельно» и «нет файла».
- [x] `scripts/check-taxonomy-readers.ts` (+тест), `package.json`, `scripts/check.ts`,
  `scripts/check.test.ts` -- гейт обхода загрузчика; тест покрывает строки матрицы про гейт.
- [x] `_bmad-output/planning-artifacts/epics.md` -- критерий 6.2 про места: один загрузчик и гейт,
  GPS-потребитель — в 6.7 через `loadPlacesConfig`; в критерии 6.7 — строка о том же.
- [x] `.cursor/rules/code-style.mdc` -- новый гейт в разделе «What the gates check».

**Acceptance Criteria:**
- [x] `pnpm check` проходит, `check:taxonomy-readers` в нём; `pnpm build && pnpm demo:packed` проходят,
  набор страниц демо прежний.
- [x] Строка с чтением `places.yaml` по своему пути в `packages/core/src/lib/**` (не тест) роняет гейт.
- [x] Ожидания существующих тестов `files.test.ts` и страницы фото не правятся.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Проход 1 (2026-10-27, Codex: blind-hunter B, edge-case-hunter E, verification-gap V).

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| B1+E1 | `\b` считает `-` и `.` границей: `my-places.yaml`, `places.yaml.bak` роняют гейт | low | Регэксп `check-taxonomy-readers.ts:16`; заменён на полное имя файла с lookaround, отрицательные случаи в тесте | patch |
| B5+V1 | Нарушитель в тестах CLI только неотслеживаемый: снятие `--cached` прошло бы | medium | `check-taxonomy-readers.test.ts:91-112`; добавлен случай с `git add` без удаления | patch |
| B6 | Отказ схемы через новые загрузчики не проверен | low | Удаление `schema.parse` прошло бы тесты; добавлен случай с неверным `places.yaml` | patch |
| B7 | Места и теги во всех фикстурах пустые: перестановка полей результата `loadTaxonomyConfig` прошла бы | low | `files.test.ts:69-73,99-104`; добавлен случай с непустыми тремя файлами и полным результатом | patch |
| B8 | `epic-6-context.md:81-82` обещает убрать второй читатель в 6.2 | low | Противоречит решению владельца (вариант A) и `epics.md`; строка переписана | patch |
| B2+E2 | Имя, собранное во время выполнения (`` `${kind}.yaml` ``), гейт не видит | low | Матрица спеки задаёт литеральное имя; второй читатель исходника (`place-gps-bounds.ts:86`) — литерал `'src/content/config/places.yaml'`, гейт его ловит (тест `scripts/lib/images/gps-bounds.ts`) | reject |
| B3 | Исключение всего `files.ts` допускает второй читатель внутри модуля | low | Матрица и Code Map исключают «сам загрузчик»: AD-9 требует путь в одном модуле, и это он | reject |
| B4 | Срез после первой точки исключает `test-fixtures.runtime.ts` | low | Модули ядра с префиксом `test-fixtures`/`__fixtures__` — только фикстуры (`rg` по `packages/core/src`: `gallery/test-fixtures.ts`, `wrap-around/test-fixtures.ts`); исправление — новая ветка ради имени, которого нет | reject |

## Verification

**Commands:**
- `pnpm check:taxonomy-readers` -- expected: OK.
- `pnpm check` -- expected: успех.
- `pnpm build && pnpm demo:packed` -- expected: успех, 7 страниц.
