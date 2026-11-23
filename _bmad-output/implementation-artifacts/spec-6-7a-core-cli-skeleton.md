---
title: 'Каркас CLI ядра: `bin` собранным JS, config resolve и гейты сайта (6.7, часть A)'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: '8ac814f503f53d7dd85947fb91434dae74086efb'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Операции сайта (`config resolve`, генерация layout-токенов, гейты файлов сайта) — скрипты
репо ядра, которые импортируют `packages/core/src` по относительному пути и берут сайт из `--site`
внутри репо. Установленный из npm сайт их запустить не может, а `cli.json` снапшота пуст (AD-12).
Objective истории: сайт получает операции из ядра, а не копирует скрипты; без этого skill вызывает
команду, которой нет в установленном ядре.

**Approach:** Ядро получает `bin` — собранный `tsc` JS с диспетчером подкоманд; в него переезжают
`config resolve`, генерация layout-токенов и гейты файлов сайта, их библиотеки — из `scripts/lib` в
`packages/core/src/cli/`. Демо вызывает их тонкими алиасами, упакованное демо прогоняет их из
`node_modules` установленного tarball, а снапшот `cli` фиксирует подкоманды и опции.

## Boundaries & Constraints

**Always:**

- Решение владельца (2026-11-14): команда `bin` называется `astrum-scena` (хвост имени пакета);
  `scena` и `core` отклонены из-за риска совпасть с чужим `bin` в `node_modules/.bin`.
- Команды: `config resolve`, `layout-tokens`, `check` (все гейты сайта подряд) и `check <gate>` для
  `config-lock`, `layout-tokens`, `color-literals`, `css-layers`, `pages`, `image-files`; опция
  `--root <dir>` (корень сайта, по умолчанию cwd), `--help`. Корень сайта определяется один раз в
  диспетчере и передаётся явно; ресурсы ядра — от `CORE_ROOT`.
- Поведение гейтов не меняется: `color-literals`, `css-layers` и `pages` сканируют исходники
  установленного ядра (`CORE_ROOT/src`) и `src/` сайта, как сейчас `CORE_SRC` и `--site`; сообщения
  об исправлении называют команды CLI.
- `bin` запускается из `node_modules` без build-скриптов и без `--experimental-strip-types`;
  зависимости, нужные ему в рантайме (`postcss`), — в `dependencies` ядра.
- `src` вне `src/cli/` не импортирует `cli/` — граница в `eslint.config.mjs` с тестом.
- В `package.json` демо — только алиасы `astrum-scena …` и команды Astro; это проверяет тест.
- Снапшот `cli`: подкоманды и их опции списком строк; удаление — ломающее, добавление — совместимое.

**Never:**

- Не переносить в CLI гейты репо ядра: `identity`, `local-paths`, `code-comments`, `taxonomy-readers`,
  `api-snapshot`, `api-breaking`, `upgrading`, `commit-msg`, release, e2e, `demo:packed`,
  `demo:images` (генератор демо — 6.7B/6.12).
- Не начинать пайплайн изображений, валидацию контента, skills и пресеты (6.7B–D).
- Без универсальной команды обновления и без парсера аргументов из npm.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Чистый сайт | `astrum-scena check` в корне демо | все шесть гейтов OK, код 0 | N/A |
| Устаревший lock | `site.yaml` правлен без resolve | `check config-lock` падает | сообщение: `astrum-scena config resolve` и путь lock |
| Другой корень | `--root ../site` | читает файлы того сайта | нет `site.yaml` — ошибка с путём |
| Неизвестная команда | `astrum-scena chek` | код ≠ 0 | список команд в stderr |
| Пустой `--root` | `--root` без значения | код ≠ 0 | `--root needs a directory` |

</frozen-after-approval>

## Code Map

- `scripts/{config-resolve,check-config-lock,generate-layout-tokens,check-layout-tokens,check-color-literals,check-css-layers,check-pages-routes,check-image-files}.ts`
  -- тела команд; переезжают в `packages/core/src/cli/commands/`, файлы скриптов удаляются.
- `scripts/lib/{color-literals,css-layers,image-files}.ts` (+ тесты) -- библиотеки гейтов; переезжают
  в `packages/core/src/cli/`, импорты на `../config/…`, `../lib/…`.
- `scripts/lib/site-root.ts` -- `siteRootArg`/`sitePath`/`CORE_SRC`; остаётся для гейтов репо, CLI
  заменяет его своим разбором `--root`.
- `scripts/check.ts` `CHECK_GROUPS` -- `check:*` шесть гейтов → одна запись, вызывающая алиас демо.
- `package.json` (корень) -- `config:resolve`, `layout:tokens`, `check:{config-lock,layout-tokens,color-literals,css-layers,pages,image-files}`
  → `pnpm --filter astrum-scena-demo …`.
- `packages/core/package.json` -- `bin`, `postcss` в `dependencies`; `tsconfig.build.json` `files` +
  `src/cli/index.ts`.
- `packages/core/src/core-root.ts` `CORE_ROOT` -- корень ядра для `src/` из `dist/cli/`.
- `eslint.config.mjs:182-290` -- `boundaries(...)`, `scriptsImport`: по образцу добавить запрет `cli/`;
  тест в `scripts/eslint-config.test.ts`.
- `scripts/lib/api-surface.ts:437` `extractCliCommands` -- читать реестр команд CLI; классификатор `cli`
  уже `compareList` (`:1228`); `packages/core/api-snapshot/cli.json` регенерировать.
- `scripts/build-demo-from-pack.ts` `prepareSite`/`buildPackedDemo` -- после установки tarball запустить
  `pnpm run check:site` (алиас `astrum-scena check`) в упакованном сайте.
- `packages/core/README.md:60-70,246` -- «command and its gate live in this repository» и «none yet».

## Tasks & Acceptance

**Execution:**

- [x] `packages/core/src/cli/` -- `index.ts` (shebang, диспетчер, `--root`, `--help`, реестр команд с
  опциями), `commands/*.ts`, перенесённые библиотеки и их тесты -- одна точка входа и реестр для
  снапшота.
- [x] `packages/core/package.json`, `packages/core/tsconfig.build.json` -- `bin`, `postcss`, сборка
  `dist/cli/index.js` -- запуск из `node_modules`.
- [x] `demo/package.json`, корневой `package.json`, `scripts/check.ts` -- алиасы демо, корневые скрипты
  через них, удаление перенесённых `scripts/*` -- одна реализация гейтов.
- [x] `scripts/demo-manifest.test.ts` -- каждый скрипт демо — `astrum-scena …` или `astro …`.
- [x] `eslint.config.mjs`, `scripts/eslint-config.test.ts` -- граница `cli/`.
- [x] `scripts/lib/api-surface.ts` (+ тест), `packages/core/api-snapshot/cli.json` -- снапшот подкоманд.
- [x] `scripts/build-demo-from-pack.ts` (+ тест) -- гейты CLI в упакованном сайте.
- [x] `packages/core/README.md`, `CHANGELOG.md` -- CLI вместо скриптов репо.

**Acceptance Criteria:**

- [x] `pnpm demo:packed` запускает `astrum-scena check` из `node_modules` установленного tarball, и он
  проходит.
- [x] `pnpm check` прогоняет те же гейты через алиасы демо; перенесённых `scripts/*` нет.
- [x] `cli.json` перечисляет подкоманды с опциями; удаление подкоманды `check:api-breaking` считает
  ломающим (тест).
- [x] Импорт `cli/` из `src` вне `src/cli/` — ошибка lint (тест конфига).
- [x] Скрипт демо не-алиас роняет `pnpm check` (тест).
- [x] Строки матрицы I/O покрыты тестами диспетчера и команд.

## Implementation Notes

- Отступление от спецификации, принято владельцем 2026-11-15: `bin` указывает на закоммиченную
  обёртку `packages/core/bin/astrum-scena.js` (две строки, `await import('../dist/cli/index.js')`), а
  не на `dist/cli/index.js`: pnpm не создаёт ссылку на `bin`, чьего файла нет при установке, а на
  чистом checkout (CI) `dist/` появляется только после `typecheck`, и алиасы демо не нашли бы
  `astrum-scena`. Обёртка входит в `files`; исполняемый код — по-прежнему вывод `tsc`.
- `pnpm check` запускает `check:site` в первой группе — после `typecheck` (он собирает `dist/`) и до
  `test`; шесть корневых `check:<gate>` остаются алиасами для ручного запуска.
- Пути в выводе CLI — относительно текущего каталога; библиотеки гейтов получают пару таких меток
  `{ coreSrc, siteRoot }` вместо `CORE_SRC` от корня репо.
- `RESOLVE_HINT` теперь `run astrum-scena config resolve`; заголовки lock и сгенерированного файла
  layout-токенов не менялись — их байты сравнивают drift-гейты.
- Тест читателей `site.yaml` переехал в `scripts/site-yaml-readers.test.ts` и допускает `cli/run.ts`
  (диспетчер проверяет, что в корне есть `site.yaml`); тест команды image-files остался в `scripts/`
  (`image-files-cli.test.ts`), потому что генерирует деривативы генератором демо из `scripts/lib`.
- Патчи ревью (проход 1): `check` ловит исключение каждого гейта и продолжает; команда ищется только
  среди собственных ключей реестра; `-h` убран; тесты агрегата на сайте с нарушением и с бросающим
  гейтом. После патчей `pnpm check` (2091 тест), `pnpm build` и `pnpm demo:packed` зелёные.

## Spec Change Log

## Review Triage Log

Проход 1 (Codex: blind, edge-case, verification-gap):

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|------|---------|---------|-------------|---------|
| 1 | blind, edge, vgap | `check` прерывается на гейте, который бросает (`run.ts:34`) | medium | `checkAll` вызывает гейты без `try`; исключение `checkLayoutTokens` на отсутствующем lock уходит в `runCli` и последующие гейты не запускаются вопреки комментарию «even after one fails» | patch (исправлено) |
| 2 | blind, edge | Поиск команды видит унаследованные свойства (`run.ts:88`) | low | `RUNNERS` — объектный литерал: `astrum-scena toString` берёт `Object.prototype.toString` вместо ошибки «unknown command»; исправление — прямая проверка `Object.hasOwn` | patch (исправлено) |
| 3 | blind | `chek --help` выходит с кодом 0 | low | справка печатается до проверки команды; на деле опечатка с `--help` показывает список команд, ничего не запуская, а исправление добавляет ветку — отклонено (маловероятно, сложнее прямой правки) | reject |
| 4 | blind, edge | Подсказка не экранирует `--root` с пробелами (`context.ts:31`) | low | реально для пути с пробелом, но корень сайта с пробелом в алиасах не встречается, а исправление — новая функция экранирования — отклонено | reject |
| 5 | blind | `check config-lock` проверяет lock по умолчанию при `SITE_LOCK_PATH` | low | `consumer-env.ts:22` помечает `SITE_LOCK_PATH` как `internal` — это не настройка сайта; удалённый `scripts/check-config-lock.ts` проверял тот же `SITE_LOCK_PATH` — отклонено | reject |
| 6 | blind | Входной стиль тонкого сайта не может импортировать порядок слоёв ядра (`css-layers.ts:47`) | maybe-false | у демо нет своих `@import` в `demo/src`, тема подключается из `global.css` ядра; решит проверка, нужен ли тонкому сайту свой входной стиль (лестница кастомизации AD-24) | defer |
| 7 | blind | `@import` в комментариях считается импортом (`css-layers.ts:123`) | low | регулярка перенесена без изменений из `scripts/lib/css-layers.ts`; закомментированный CSS-импорт в `.ts` маловероятен, исправление требует лексера — отклонено | reject |
| 8 | blind | Цветовой литерал в комментарии Astro роняет гейт (`color-literals.ts:118`) | low | поведение перенесено без изменений, ложное срабатывание видно и правится сразу; исправление — разбор комментариев — отклонено | reject |
| 9 | blind | `color-literals` не сканирует TSX (`check-color-literals.ts:9`) | low | набор расширений перенесён без изменений; inline-цвет в TSX-компоненте сайта правдоподобен, это давний пробел гейта | defer |
| 10 | blind, edge | Падение `check:site` пропускает `test` (`check.ts:6`) | low | `runGroups` ставит `passed = false`, и `pnpm check` всё равно падает; так же падение `typecheck` всегда пропускало `test` в этой группе — теряется только полнота отчёта за один прогон — отклонено | reject |
| 11 | blind | Параллельные `layout-tokens` делят `.tmp` (`layout-tokens.ts:15`) | low | тот же `.tmp`+rename был в удалённом `scripts/generate-layout-tokens.ts`; два одновременных запуска на одном сайте маловероятны, а уникальный путь требует очистки — отклонено | reject |
| 12 | blind | `-h` принимается, но не попадает в снапшот (`registry.ts:44`) | low | `parseArgs` принимает `-h`, а `cliSurface` пишет только `--help`; спецификация называет только `--help` — убрать `-h` | patch (исправлено) |
| 13 | vgap | Нет теста, что `check` падает на сайте с нарушением | medium | `run.test.ts:16` гоняет агрегат только на чистом демо; `checkAll`, всегда возвращающий 0, прошёл бы все тесты | patch (исправлено) |

## Verification

**Commands:**

- `pnpm check` -- expected: зелёный.
- `pnpm build` -- expected: ядро и демо собираются.
- `pnpm demo:packed` -- expected: гейты CLI и сборка из tarball проходят.
