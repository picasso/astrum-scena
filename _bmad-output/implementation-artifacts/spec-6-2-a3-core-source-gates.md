---
title: 'Гейты исходного кода ядра в pnpm check'
type: 'chore'
created: '2026-10-26'
status: 'done'
baseline_commit: 'cccb05277f8490d8d2f4cc09ad1a4b568af2bbd3'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-2-a2-port-core-code.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Код эпиков 1–5 перенесён в `packages/core` (A2), но гейты исходного кода, которые стерегли
его в исходном сайте, — ESLint, цветовые литералы, слои CSS, комментарии, страницы, токены раскладки —
в репо ядра не запускаются, и регрессии стиля и границ проходят `pnpm check` молча.

**Approach:** Часть A3 истории 6.2. Перенести конфиг ESLint и пять гейтов исходника в `scripts/` с
тестами и включить их в `pnpm check`; пути переписать под два дерева: движок — `packages/core/src`,
файлы сайта — корень сайта (в репо — `demo/`). Сверить `.cursor/rules/code-style.mdc` с гейтами.

## Boundaries & Constraints

**Always:** Правила гейтов — как в исходнике; меняются только пути и то, что требует разделение ядра и
сайта. Гейт сайта получает корень сайта параметром (по умолчанию `demo`), не из `process.cwd()` кода
ядра. Каждый перенесённый тест — в `pnpm check`. Нарушения в перенесённом коде исправляются, не
подавляются; `noInlineConfig` остаётся. Комментарии на английском; гейт утечек и `check:local-paths`
проходят.

**Решения владельца (2026-10-26):** A3 — только гейты. 17 тестов на реальном контенте и
`noUncheckedIndexedAccess` — отдельная часть A4 после A3 (записаны в `deferred-work.md`).

**Never:** Не менять исходный репо. Не переносить `lint:image-fixture`, `check:page-budget`,
`content:validate`, гейты изображений и `badges:check` (не в A3). Не переписывать 17 тестов (A4). Не
вводить CLI ядра (6.7) и запрет глубоких импортов (6.3). Не менять вид и поведение сборки.

## I/O & Edge-Case Matrix

| Сценарий | Вход / состояние | Ожидаемое | Ошибка |
|---|---|---|---|
| Цвет в CSS ядра | `#fff` в `packages/core/src/**/*.css` | `check:color-literals` падает | файл и строка |
| Цвет в теме сайта | литералы в `demo/src/theme/theme.css` | проходит | — |
| Слой токенов | `global.css` без `layer(theme)` у `/src/generated/layout-tokens.css` | `check:css-layers` падает | файл и правило |
| Дрейф токенов | `layout.*` в `demo/src/config/site.yaml` изменён без генерации | `check:layout-tokens` падает | подсказка `pnpm layout:tokens` |
| Тест в страницах | `*.test.ts` в `packages/core/src/pages` или `demo/src/pages` | `check:pages` падает | путь файла |
| Кириллица в комментарии | `// привет` в отслеживаемом `.ts` | `check:code-comments` падает | файл и строка |

</frozen-after-approval>

## Code Map

Исходник — `$REFERENCE_SITE_ROOT` (только чтение); пути `ref:` — от его корня.

- `ref:eslint.config.mjs` (234 строки), `ref:eslint/style.mjs` (правило `local/no-jsdoc`, `styleConfig`),
  `ref:scripts/eslint-config.test.ts` (395, `ESLint#lintText` на синтетических путях). Глобы `src/**` →
  `packages/core/src/**` (kebab-case — также `demo/src/**`); `astro.config.mjs` → `demo/astro.config.mjs`.
  Удалить: `migration/`, `functions/`, `e2e/`, `playwright*`, `e2e/fixtures/image-site`, сайтовые
  записи `LOCALE_EXEMPT`. Списки `ADAPTERS`/`COMPUTATIONS` (31 модуль, все есть в ядре) — от
  `packages/core/src/lib/`. Пробный прогон дал 8 нарушений: `default export` в
  `packages/core/src/index.ts:106` (интеграция Astro — исключить файл, как `**/*.config.*`), 3
  `capitalized-comments` (`index.ts:33,69`, `scripts/lib/identity.ts:45`), 4 `simple-import-sort`
  (тесты `blocks/{callout,note,wrap-around}/tokens`, `images/public-config`).
- Зависимости (корень): `eslint ^10.7.0`, `typescript-eslint ^8.64.0`, `eslint-plugin-astro ^3.0.1`,
  `astro-eslint-parser ^3.0.0`, `eslint-plugin-check-file ^3.3.2`, `eslint-plugin-simple-import-sort
  ^14.0.0`; `postcss`, `yaml` — гейтам (сейчас только у ядра).
- `ref:scripts/check-color-literals.ts` (+test), `ref:scripts/lib/color-literals.ts` (+test): исключения
  `src/theme/theme.css`, `src/generated/layout-tokens.css` — теперь файлы сайта; CSS ядра — без
  исключений.
- `ref:scripts/check-css-layers.ts`, `ref:scripts/lib/css-layers.ts` (+test), половина
  `ref:scripts/css-gates-cli.test.ts` про слои (page-budget не брать). `LAYERS_CSS`/`GLOBAL_CSS` — в
  ядре; импорт с ведущим `/` (`/src/theme/theme.css`, `/src/generated/layout-tokens.css`,
  `packages/core/src/styles/global.css:13,16`) — файл корня сайта. `LAYOUT_TOKENS_RELATIVE_PATH` — из
  `packages/core/src/lib/layout-tokens.ts`.
- `ref:scripts/check-code-comments.ts` (+test), `ref:scripts/lib/code-comments.ts` (+test; импортирует
  `NON_COLOR_TOKEN` из `color-literals`): `git ls-files`; исключения → `demo/src/content/`, `docs/`,
  `_bmad*`, `.claude/`, `.cursor/`, `.agents/`. Правило о прежней теме (`zu`) не переносить — имя
  исходного сайта, в ядре его нет. Запрет `AD-\d+`/`EH-\d+`/`S*` в комментариях сохранить; нарушение
  `scripts/lib/identity.ts:1`.
- `ref:scripts/check-pages-routes.ts` — сканировать `packages/core/src/pages` и `src/pages` корня сайта
  (`coreRoutes()` в `index.ts:45` берёт только `.astro`, но файловый роутинг сайта активен).
- `ref:scripts/check-layout-tokens.ts`, `ref:scripts/generate-layout-tokens.ts`: `loadSiteSection(root,
  key, path)` из `packages/core/src/config/loader.ts`, `verifyLayoutTokens`/`serializeLayoutTokens` из
  `lib/layout-tokens.ts`; корень — сайт. Писателя в репо нет, а `demo/src/generated/layout-tokens.css`,
  `global.css:15` и заголовок генератора уже ссылаются на `pnpm layout:tokens`.
- `scripts/check.ts` `CHECK_GROUPS` (+`scripts/check.test.ts`) — добавить группу гейтов; CI уже
  запускает `pnpm check`. `vitest.config.ts` уже включает `scripts/**/*.test.ts`.
- `.cursor/rules/code-style.mdc` — пути `src/` → ядро/сайт, тема — файл сайта; отметить, что
  проверяет ESLint, и правила вне гейтов.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- devDependencies, скрипты `lint` (`eslint . --max-warnings 0`), `layout:tokens`,
  `check:{color-literals,css-layers,code-comments,pages,layout-tokens}` -- команды гейтов.
- [x] `eslint.config.mjs`, `eslint/style.mjs`, `scripts/eslint-config.test.ts` -- перенос с путями ядра и
  демо, без сайтовых блоков -- стиль и границы импортов.
- [x] `scripts/lib/{color-literals,css-layers,code-comments}.ts` (+тесты), `scripts/check-*.ts` (+тесты),
  `scripts/generate-layout-tokens.ts` -- перенос; корень сайта параметром; тесты покрывают матрицу.
- [x] `scripts/check.ts`, `scripts/check.test.ts` -- `lint` и пять гейтов в `CHECK_GROUPS`.
- [x] `packages/core/src/**`, `scripts/**` -- исправить найденные нарушения без подавления.
- [x] `.cursor/rules/code-style.mdc` -- сверить с гейтами.
- [x] `_bmad-output/planning-artifacts/epics.md`, `sprint-status.yaml` -- A3 сужена, новая часть A4
  (`6-2-a4-real-content-tests-and-strict-index`).

**Acceptance Criteria:**
- Given чистое дерево, when `pnpm check`, then `lint` и пять гейтов идут в нём и проходят.
- Given `pnpm layout:tokens` на демо, when файл перегенерирован, then diff пуст.
- Given `packages/core/src` и `scripts`, when поиск комментариев-подавлений
  (`rg '^\s*(//|/\*|\{/\*).*(eslint-disable|@ts-(ignore|nocheck))'`), then совпадений нет, кроме
  строковых данных тестов (виртуальный MDX-файл `mdx-authoring.test.ts` повторяет вывод сервера MDX).

## Implementation Notes

- Корень сайта: `scripts/lib/site-root.ts` — `--site <dir>` от корня репо, по умолчанию `demo`; ядро —
  фиксированный `packages/core/src`. Гейты по-прежнему берут корень репо из cwd (это инструменты репо,
  а не код ядра).
- ESLint: блоки `migration/`, `functions/`, `e2e/`, `playwright*` и фикстуры image-site удалены, вместе с
  ними — пустые для этого репо границы `LIVE_FILES`; запрет литералов локалей — на `scripts/**`,
  `demo/astro.config.mjs` и ядре. `default export` разрешён `packages/core/src/index.ts` рядом с
  `**/*.config.*`. Добавлены тесты kebab-case и исключения интеграции.
- `check:css-layers`: импорт с ведущим `/` (и в CSS, и в коде) разрешается от корня сайта; любой
  относительный или корневой импорт — файл проверяемых деревьев (раньше — префикс `src/`). Алиас `@/`
  удалён: в ядре его нет. Тест CLI — `scripts/check-css-layers.test.ts` (половина
  `css-gates-cli.test.ts`), добавлен случай токенов вне `layer(theme)`.
- `check:color-literals`: исключения — `theme.css` и `layout-tokens.css` от корня сайта; одноимённый
  файл в ядре не исключён.
- `check:code-comments`: правила прежней темы (слово и префикс классов) не перенесены; исключение `data/`
  снято (каталога нет), добавлено `.agents/`.
- `check:layout-tokens` и `layout:tokens` получили тест CLI (в исходнике его не было): генерация
  побайтно стабильна, дрейф и отсутствие файла — с подсказкой `pnpm layout:tokens`.
- `tsconfig.json` корня проверяет `scripts/` с `noUncheckedIndexedAccess`: в перенесённых `color-literals`
  и `code-comments` доступ к группам regex переписан без подавлений.
- Нарушения: 4 сортировки импортов (autofix), 3 `capitalized-comments`, `AD-22` в комментарии
  `identity.ts`. `// @ts-ignore` внутри строки виртуального MDX-файла `mdx-authoring.test.ts` — данные,
  повторяющие вывод сервера MDX, а не подавление: оставлен, критерий поиска уточнён до комментариев.

## Spec Change Log

## Review Triage Log

Проход 1 (2026-10-26: blind-hunter B, edge-case-hunter E, verification-gap V). «Как в исходнике» —
основание, сверенное `diff` с `ref:scripts/…` 2026-10-27: логика, на которую указывает находка, не
изменена; diff A3 этих файлов затрагивает только пути — `css-layers.ts`: `resolveLocal`, флаг
`local`, `siteRoot` (регулярки `FRONTMATTER`, `COMMENTS`, `STYLE_BLOCK`, `SCRIPT_CSS_IMPORT`,
`IMPORT_PARAMS`, `LAYER_NEUTRAL_AT_RULES` и фильтр файлов кода — как в исходнике);
`color-literals.ts`: исключения от корня сайта; `code-comments.ts`: удалены правила `zu`;
`eslint.config.mjs`: глобы, удалённые блоки исходного сайта и `default export` интеграции. Правило
Always этой спеки («правила гейтов — как в исходнике») такие находки не допускает к правке здесь.

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| V1+E26 | Тест «исключения из запрета локалей» для `pages/rights.astro` и `site-footer.astro` проходит вхолостую: проба без `---` — разметка | medium | Утверждение добавлено в A3, конфиг эти файлы не исключает; возврат исключения тест бы не заметил | patch |
| V2+B8+E1 | Абсолютный или выходящий из репо `--site`: `check:pages` проходит, не сканируя | medium | `path.join(root, '/x')` даёт ENOENT → `[]` → OK; остальные гейты падают или читают другое | patch |
| B3 | `(AD-8)` в сообщениях ESLint и имени теста | low | Строки, не комментарии; в публичном репо ссылка не разрешится; правка — удаление | patch |
| B1 | `AGENTS.md` не называет `lint` и пять гейтов, «Style rules no linter enforces yet» устарело | medium | Агенты получают неверное описание `pnpm check`; правка — файл контекста агентов | defer |
| B4+V3 | Списки `ADAPTERS`/`COMPUTATIONS` не связаны с файлами; переименование модуля молча снимает границу | medium | Все 31 существуют; как в исходнике — будущий дрейф, не регрессия | defer |
| B5+E29 | В ESLint корень сайта — константа `demo` | low | Других сайтов в репо нет; ESLint для сайтов — пресет 6.7; параметр — новая ветка | reject |
| B2+E18 | Гейт комментариев не ловит id историй и строчные `ad-8` | low | Как в исходнике; `code-style.mdc` перечисляет ровно проверяемое | reject |
| B6+E13 | Цвета в inline `style`, TSX и произвольных классах Tailwind не проверяются | low | Как в исходнике; формулировка правил равна исходной | reject |
| B7+E14 | `<style>` в color-literals ищется без вычистки frontmatter и комментариев | low | Как в исходнике; ложное срабатывание громкое | reject |
| B9 | `main()` без проверки точки входа в части гейтов | low | Как в исходнике; гейты не импортируются | reject |
| B10 | `check:css-layers` всегда пишет `global.css:1`; нет теста неверного `site.yaml` | low | Как в исходнике; загрузчик падает с путём | reject |
| B11+E28 | Генератор токенов может оставить `.tmp` при сбое `rename` | low | Как в исходнике; редкий сбой | reject |
| B12 | `check:pages` ловит только `*.test.*`/`*.spec.*` | low | Как в исходнике; правило о тестах, не о любых модулях | reject |
| B13 | Тест слоёв проверяет собственную фикстуру | low | Как в исходнике; соседние случаи проверяют гейт | reject |
| B14 | Новые записи `deferred-work.md` дублируют старую, `source_spec: none` | false | Формат шага 1 требует `none` и запрещает править прежние записи | reject |
| B15 | Статусы спеки и sprint-status расходятся; диапазоны зависимостей в Code Map старше; длинная строка в `epic-6-context.md` | low | Статусы сводит шаг 5; Code Map — правка спеки; строка переформатирована | reject |
| B16 | `capitalized-comments` не видит CSS, разметку и YAML | low | `code-style.mdc` относит правило к `pnpm lint`; как в исходнике | reject |
| B17 | Критерий поиска подавлений уже риска | low | Правка спеки; подавления закрывает `noInlineConfig` в `pnpm lint` | reject |
| E2 | `--site=x` молча игнорируется | low | Гейты зовутся из `package.json` без флага; разбор `=` — новая ветка | reject |
| E3 | Без каталога страниц ядра `check:pages` проходит | low | `pnpm` запускает из корня репо, каталог есть | reject |
| E4 | Файлы с `_` в `pages/` не становятся маршрутами | low | Тест рядом со страницей — ошибка в любом случае | reject |
| E5 | Симлинк на тест в `pages/` не замечается | low | Как в исходнике; маловероятно | reject |
| E6 | Без `src/` сайта или каталог `*.css` — стек ENOENT/EISDIR | low | Громкое падение — корректное поведение | reject |
| E7 | `.js`/`.mjs`, импортирующие CSS, не считаются входами | low | Как в исходнике; в ядре таких нет | reject |
| E8 | Алиас `@/` не разрешается в css-layers | false | В ядре нет импортов `@/` | reject |
| E9 | Сайт не может импортировать `layers.css` спецификатором пакета | low | Входные стили у ядра; сайт стилей-входов не держит | reject |
| E10 | Локальный `@import` вне проверяемых деревьев не проверяется | low | Вердикт прохода 1 неверен: исходник пропускал без `layer()` только цели под `src/`, A3 — любой локальный путь; см. проход 2 CE11 | reject → patch (проход 2) |
| E11 | `@utility`, `@variant` и др. Tailwind — ложная ошибка | low | Как в исходнике; в коде их нет, ошибка громкая | reject |
| E12+E17 | CRLF во frontmatter, SCSS-блоки | low | Как в исходнике; LF и чистый CSS в репо | reject |
| E15+E16 | `<Script>`/`<Style>` и незакрытые выражения в лексере `.astro` | low | Как в исходнике; таких компонентов нет | reject |
| E19 | `import.meta.glob` обходит границы импортов | low | Как в исходнике; правило про `import`/`import()` | reject |
| E20 | Транзитивные импорты вычислений не проверяются | low | Как в исходнике; правило про прямые импорты | reject |
| E21 | Прочие модули IO (`child_process`, `sharp`) не запрещены вычислениям | low | Как в исходнике | reject |
| E22 | Ключи `{ en, ru }` и `en-US` проходят запрет локалей | low | Как в исходнике; формы данных — 6.10/6.11 | reject |
| E23 | Файлы под каталогами `[param]` не проверяются на kebab-case | low | Как в исходнике (исключение `[[]*]`) | reject |
| E24 | `.js`/`.mjs` в `src` не проверяются на kebab-case | low | Как в исходнике; таких файлов нет | reject |
| E25 | Тесты lib `.test.tsx` вне исключения загрузчика | low | Как в исходнике; таких тестов нет | reject |
| E27 | `SITE_CONFIG_PATH` меняет источник токенов | low | Как в исходнике; переменная только у сборки одной локали | reject |

Проход 2 (2026-10-27, Codex: blind-hunter CB, edge-case-hunter CE, verification-gap CV) — повторное
ревью другой моделью по диффу `cccb052..59780c9` без `pnpm-lock.yaml`. Основание «как в исходнике» —
то же, что в проходе 1; факты о дереве — `rg` по `packages/core/src` и `demo/src` 2026-10-27.

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| CE11 | `@import` без `layer()` файла вне проверяемых деревьев (`/public/x.css`, `../../../x.css`) проходит | medium | Вызвано A3: `local` ставился любому относительному или корневому пути, исходник — только целям под `src/`. `local` теперь только для `packages/core/src/` и `src/` сайта; тест в `css-layers.test.ts` | patch |
| CB1+CE9 | Шаблонный `import(\`…css\`)` не виден | low | Как в исходнике (`SCRIPT_CSS_IMPORT`); в дереве таких импортов 0 | reject |
| CB2 | `@import 'x.css?query'` — другой путь графа | low | Как в исходнике (`IMPORT_PARAMS`); `@import` с query или `url(` без кавычек в дереве — 0 | reject |
| CB3+CE10 | Текст `import '…css'` в комментарии или строке снимает исключение | low | Как в исходнике; ошибка в сторону лишней проверки — громкая | reject |
| CB4+CE13 | Слой не наследуется вложенным `@import` | low | Как в исходнике; ложное срабатывание громкое | reject |
| CB5+CE7 | `/*` в значении атрибута `.astro` скрывает `<style>` | low | Как в исходнике (`COMMENTS`); `/*` внутри атрибутов `.astro` в дереве — 0 | reject |
| CB6 | Импорт токенов после `@layer` с правилами принимается | low | Как в исходнике; в `global.css` импорт на строке 16, первый `@layer` — 25 | reject |
| CB7+CE4 | Имена цветов в нецветовых свойствах (`animation-name: red`) — ложное срабатывание | low | Как в исходнике (`color-literals.ts`, меняются только исключения); громко | reject |
| CB8+CE5 | `<style>` в строке frontmatter даёт ложное срабатывание | low | Carried: проход 1 B7+E14; код тот же | reject |
| CB9+CE3 | Лексер `#`-комментариев не держит многострочные строки и heredoc | low | Как в исходнике (`code-comments.ts`, удалены только правила `zu`); ложное срабатывание громкое | reject |
| CB10 | `../config/./site.ts` обходит границу импорта | low | Как в исходнике; специфайеров с `/./` в ядре — 0 | reject |
| CE1 | PascalCase-файл под `[param]/` не проверяется | low | Carried: проход 1 E23; исключение `[[]*]/**` то же | reject |
| CE2 | Два генератора токенов пишут один `.tmp` | low | Генератор запускается вручную одной командой; та же схема записи, что в исходнике | reject |
| CE6 | `@import url(x.css)` без кавычек — ложная ошибка | low | Как в исходнике (`IMPORT_PARAMS`); таких импортов 0, ошибка громкая | reject |
| CE8 | CRLF во frontmatter | low | Carried: проход 1 E12+E17; `.astro` с CRLF в дереве — 0 | reject |
| CE12 | `.js`/`.mjs`, импортирующие CSS, не видны | low | Carried: проход 1 E7; `.js`/`.mjs`/`.jsx` в `src` — 0 | reject |
| CE14 | `code-style.mdc` обещает больше, чем проверяет lint: запрет локалей не охватывает `demo/src`, адаптерам можно импортировать синглтон и загрузчик | low | Так в `eslint.config.mjs` (блоки `boundaries` и `ADAPTERS`), а формулировки раздела «What the gates check» — шире; правка — файл правил агентов | defer |
| CV1 | Переименование модуля молча снимает границу | medium | Carried: проход 1 B4+V3, уже в `deferred-work.md` | defer |

Проход 3 (2026-10-27, Codex) — ревью исправлений по диффу `59780c9..4f42a06`; общий журнал — в
спеке A.

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| FB3 | `@import '/src/extra.pcss'` под `src/` проходит без `layer()`, хотя гейт разбирает только `.css` | low | `isChecked` смотрел только на дерево; добавлено условие `.css`; случай в тесте `css-layers` | patch |

## Verification

**Commands:**
- `pnpm check` -- expected: успех, в выводе `lint` и `check:*` из A3.
- `pnpm build && pnpm demo:packed` -- expected: успех, вывод сборки не изменился.
- `pnpm layout:tokens && git diff --exit-code demo/src/generated` -- expected: без изменений.
