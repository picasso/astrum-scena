---
title: 'Объявленный API потребителя и снапшот-гейты'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: '4bd71b64cd0226989e4c74ed6f40672c812b3ff4'
route: 'dispatch'
review_loop_iteration: 2
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Что из ядра сайт вправе использовать, нигде не перечислено, и изменение этого (удалённый
экспорт, новое обязательное поле `site.yaml`, переименованный ключ i18n) проходит CI молча (AD-7).

**Approach:** Часть B истории 6.3. Скрипт снимает с исходников ядра снапшот каждой поверхности API
потребителя — `exports` и их объявления, схемы файлов сайта, имена и пропсы MDX-компонентов и
директив, токены, ключи i18n, команды CLI и env потребителя — в закоммиченные JSON. Гейт в
`pnpm check` падает, если снапшот расходится с исходниками; сравнение с предыдущим снапшотом делит
изменения на совместимые и ломающие (удаление, сужение).

**Решения владельца (2026-11-03):**
- Ломающее изменение помечается гейтом: CI-шаг на PR сравнивает снапшот HEAD со снапшотом
  merge-base с `main` и при ломающем изменении требует в `[Unreleased]` `CHANGELOG.md` запись с
  `**Breaking:**`, называющую это имя; часть C потом свяжет его с `UPGRADING.md`.
- Токены API — те, что ядро читает через `var()`, но не определяет само (контракт `theme.css` сайта),
  плюс layout-токены; внутренние токены ядра в API не входят.
- `INTEGRATION_NAME`, `SITE_ROOT_MODULE`, `coreRoutes`, `siteSourcesCss` убираются из точки `.` до
  первого снапшота; тесты импортируют их из модулей ядра напрямую.
- Типы MDX-компонентов для сайта (`./mdx`) остаются отложенными: в B только имена и пропсы в снапшоте.

## Boundaries & Constraints

**Always:** Снапшот выводится из того же источника, который читает ядро (zod-схемы, `MDX_COMPONENTS`,
`en.json`, `package.json`), — второго списка нет; где единого списка нет (имена директив, env),
он заводится в ядре и его используют и код, и снапшот. Каждое имя env, которое читает код ядра,
объявлено публичным или внутренним, иначе гейт падает; внутренние (`SITE_CONFIG_PATH`,
`IMAGES_LOCAL_*`, `CONTACT_E2E_MOCK_UPSTREAMS`, `TURNSTILE_VERIFY_URL`, `TELEGRAM_API_BASE`) в
снапшот не входят. Снапшот детерминирован (сортировка, без путей и дат). Классификация консервативна:
нераспознанное изменение — ломающее.

**Never:** Не вводить политику версий и `UPGRADING.md` (часть C), не добавлять `schemaVersion`
(часть D). Не менять поведение сборки, маршруты и вывод сайта. Не включать в пакет снапшоты и скрипт.

## I/O & Edge-Case Matrix

| Сценарий | Изменение | Ожидаемое |
|---|---|---|
| Без изменений | — | `check:api-snapshot` проходит |
| Добавлен экспорт / необязательное поле / ключ i18n | исходник | гейт падает до обновления снапшота; классификация «совместимое» |
| Удалён экспорт, ключ, токен, директива | исходник | гейт падает; «ломающее» с именем |
| Поле стало обязательным, enum сузился, тип сменился | схема | «ломающее» с путём поля |
| Код ядра читает новое env | `process.env.X` | гейт падает: имя не объявлено |
| Снапшот обновлён в том же изменении | `--update` | гейт проходит |

</frozen-after-approval>

## Code Map

- `packages/core/package.json` -- `exports` (`.`, `./collections`, `./eslint`), `bin` нет -- поверхность
  `exports` и CLI (пустой список команд).
- `packages/core/dist/{index,collections,eslint}.d.ts` -- объявления точек; снимать через компилятор TS
  (`checker.typeToString` каждого экспорта, `NoTruncation`), dist собран в `typecheck` до тестов.
- Схемы файлов сайта (zod 4 из `astro/zod`, `z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })`):
  `config/site-schema.ts:538` `siteSchema` (`src/config/site.yaml`), `config/seo-schema.ts:7`
  (`seo.yaml`), `lib/images/build/config.ts:179` `imageConfigSchemaV2` (`config/images.yaml`),
  `lib/content/schemas.ts` — `albumSchema` :243, `photoSchema` :197, `articleSchema` :306,
  `pageSchema` :317, `legalSchema` :329, `categoriesConfigSchema` :355, `placesConfigSchema` :361,
  `tagsConfigSchema` :367, `featuredConfigSchema` :445, `moreDocsFrontmatterSchema` :135; image-sets
  в `lib/blocks/gallery/image-sets.ts`. Ключ снапшота — путь файла сайта, не имя схемы.
- `components/content/mdx-components.ts:12` `MDX_COMPONENTS` + схемы пропсов `lib/blocks/{gallery,wrap-around}/schema.ts`.
- `lib/blocks/{note,callout,links}/plugin.ts` (`node.name !== '…'` :86/:60/:154) и `schema.ts` -- имена
  директив вынести в один список ядра, который читают плагины и снапшот. Атрибуты директив валидирует
  ручной парсер (`parse*Attributes`): `ALLOWED_KEYS` (note :30, callout :36, links :37) и константы
  enum (`NOTE_TONES`, `NOTE_ICONS`, `CALLOUT_*`, `LINKS_*`); `claim` у note обязателен.
- Непредставимые в JSON Schema проверки zod: `.refine`/`.superRefine` (11 вызовов в схемах сайта,
  контента и Gallery) и `z.preprocess` (`lib/blocks/gallery/schema.ts:41`, shorthand `images: ['id']`).
  zod 4.6 `toJSONSchema` принимает `override(ctx)` (`ctx.zodSchema`, `ctx.jsonSchema`) на каждом узле.
- Пути загрузчиков: `collections.ts:27,43` (`glob({ base, pattern: '**/*.{yaml,yml}' })`),
  `lib/content/localized-glob.ts:53` (`LOCALIZED_DOCUMENT_PATTERN`) -- источник ключей site-files.
- `i18n/en.json` -- плоские ключи, `UIKey = keyof typeof en` (`i18n/ui.ts:7`).
- Env: `config/loader.ts:18`, `lib/images/catalog.ts:36-37`, `index.ts:194`, `pages/[locale]/contacts.astro:75`,
  `lib/contact/env.ts:42-50` -- заводимый в ядре список public/internal; гейт сканирует `process.env.X`,
  `import.meta.env.X`, `env.X` в `packages/core/src` (без тестов).
- Токены: имена из `var(--x)` в `packages/core/src/**/*.{css,astro}` минус объявленные там же
  (`--x:`), плюс `lib/layout-tokens.ts:17-20`; `scripts/lib/css-layers.ts`, `color-literals.ts` — образцы
  обхода CSS postcss. Сверка: `demo/src/theme/theme.css` должен определять токены контракта.
- `packages/core/src/index.ts` -- экспортирует `INTEGRATION_NAME`, `SITE_ROOT_MODULE`, `coreRoutes`,
  `siteSourcesCss`; пользуются только `index.test.ts`, `styles/tailwind-sources.test.ts`.
- `.github/workflows/ci.yml` -- джоба `gates` (`pnpm check`, `build`); сюда — шаг сравнения с merge-base.
- `scripts/check.ts` `CHECK_GROUPS` -- добавить `check:api-snapshot` в последнюю группу; образец пары
  генератор/гейт — `scripts/generate-layout-tokens.ts` + `check-layout-tokens.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/` (список директив, список env public/internal) -- единые списки -- нет второго источника.
- [x] `scripts/lib/api-surface.ts` (+тест) -- извлечение поверхностей и классификатор diff (списки: удаление
  ломающее; JSON Schema: удалённое свойство, новое `required`, сужение `enum`/`type`/границ — ломающее) --
  ядро гейта.
- [x] `scripts/api-snapshot.ts` (`--update`), `scripts/check-api-snapshot.ts` (+тесты), `package.json`,
  `scripts/check.ts` -- запись и проверка снапшотов в `packages/core/api-snapshot/*.json` -- гейт в `pnpm check`.
- [x] `packages/core/src/index.ts`, `index.test.ts`, `styles/tailwind-sources.test.ts` -- убрать четыре
  тестовых экспорта из точки `.` (вынести в внутренний модуль, тесты импортируют его) -- решение владельца.
- [x] `scripts/check-api-breaking.ts` (+тест), `.github/workflows/ci.yml` (джоба `gates` на `pull_request`,
  `fetch-depth: 0`) -- снапшот merge-base с `origin/main` через `git show`, ломающие изменения без
  `**Breaking:**` с их именем в `[Unreleased]` валят шаг -- пометка ломающих (решение владельца).
- [x] `packages/core/README.md`, `CHANGELOG.md` (`[Unreleased]`) -- что входит в API и как обновить снапшот.
- [x] `lib/blocks/{note,callout,links}/schema.ts`, `directives.ts`, `api-surface.ts` (+тесты) -- каждый
  парсер объявляет свои атрибуты одним экспортом (`{ атрибут: { required, values? } }`, `values` —
  константа enum, без неё — свободная строка или флаг); `ALLOWED_KEYS` и проверки enum выводятся из
  него; поверхность `directives` становится `{ директива: атрибуты }`. Удалённая директива или атрибут,
  удалённое значение, новый обязательный атрибут — ломающие; добавления — совместимые; имя изменения
  `директива.атрибут` -- пропсы директив из intent.
- [x] `api-surface.ts` `jsonSchema` (+тест) -- через `override` каждый узел с `refine`/`superRefine`/
  custom-проверкой или `transform`/`preprocess` получает `x-refinements`: отсортированные короткие
  sha256 исходника функций (пробелы схлопнуты); появление или смена — ломающее, исчезновение —
  совместимое -- сужение через непредставимую проверку не проходит молча.
- [x] `api-surface.ts` (+тест) -- отпечатки делятся на проверки (`refine`/`superRefine`/custom) и
  преобразования (`transform`/`preprocess`/`overwrite`, в том числе встроенные `.trim()`,
  `.toLowerCase()`): у проверки исчезновение совместимо, у преобразования любое изменение, включая
  исчезновение, ломающее (преобразование расширяет то, что сайт может написать) -- удаление shorthand
  Gallery и добавление `.trim()` видны как ломающие.
- [x] Исправления ревью 2 (`api-surface.ts`, `api-surface.test.ts`, `collections.ts`, `localized-glob.ts`,
  `lib/featured.ts`): любое изменение `oneOf`, кроме совпадения, — ломающее; граница имени в CHANGELOG
  включает `/` (`@scope/pkg/collections` не закрывает `@scope/pkg`); `FEATURED_HOME_PATH` в модуле,
  который грузят скрипты, ключ site-files из него; локализованные загрузчики получают `pattern` из
  `COLLECTION_SOURCES`; тесты: удаление точки `exports` целиком и удаление ключа `site-files`/
  `mdx-components` — ломающие с полным именем -- находки 21–27 триажа.
- [x] `packages/core/README.md` (раздел API) -- граница гейта: отпечаток видит текст колбэка, но не
  хелперы, константы и модули, которые он вызывает, и не прочую логику парсеров директив сверх
  объявленных атрибутов; такие ужесточения автор отмечает в CHANGELOG сам -- гейт не обещает
  больше, чем видит.
- [x] Исправления ревью 1 (`api-surface.ts`, `check-api-*.test.ts`, `api-surface.test.ts`, `collections.ts`,
  `localized-glob.ts`): CHANGELOG — имя совпадает целиком (до и после имени нет `[\w.-]`); env —
  деструктуризация `const { A, B: b } = process.env | import.meta.env | env`; ключи site-files — из
  экспортированных `base`/`pattern` загрузчиков, не литералы; каждый ключ `exports` в снапшоте, и без
  `types`; новый вариант `oneOf` — ломающий (у `anyOf` — совместимый); `acceptsAll` до и после —
  без изменения; интерфейс — с параметрами типа, `extends` и всеми объявлениями; тесты: добавление
  required (ломающее) и optional (совместимое) токена в `compareTokens` и в `check-api-breaking`; CLI
  `check:api-snapshot` падает с именем на необъявленном env и на теме `--site` без required-токена --
  находки 3–11 триажа.

**Acceptance Criteria:**
- [x] Каждая поверхность AD-7 представлена в снапшоте, выведенном из источника, который читает ядро.
- [x] Расхождение исходников со снапшотом валит `pnpm check` с указанием поверхности и имени; `--update` его снимает.
- [x] Удаление и сужение классифицируются как ломающие, добавление — как совместимое (тесты на каждую строку матрицы).
- [x] Необъявленное env в коде ядра валит гейт; внутренние имена в снапшот не попадают.
- [x] На PR ломающее изменение относительно merge-base без записи `**Breaking:**` с его именем в
  `[Unreleased]` валит CI; с записью — проходит.
- [x] Точка `.` экспортирует только `astrumScena` (default); тесты ядра проходят.
- [x] Атрибуты директив объявлены в ядре одним списком, его читают парсер и снапшот; удаление
  значения enum директивы — «ломающее» с именем `директива.атрибут` (тест).
- [x] Добавленный или изменённый `refine`/`preprocess` в схеме сайта или пропсов — «ломающее» с путём
  поля (тест).
- [x] `pnpm check` и `pnpm build` проходят.

## Implementation Notes

- Объявления `exports` снимаются компилятором TS с той же программы, что собирает `dist/`
  (`tsconfig.build.json`, исходник каждой точки выводится из её `types`), а не с файлов `dist/*.d.ts`:
  `check:api-snapshot` в последней группе `pnpm check` может идти параллельно с `typecheck`, который
  делает `rm -rf dist`. Значения — `typeToString` (`NoTruncation`), типы — текст объявления.
- Единые списки ядра: `src/lib/blocks/directives.ts` (`DIRECTIVES`, читают плагины callout/note/links),
  `src/consumer-env.ts` (`CONSUMER_ENV`, public/internal; `ContactRawEnv` и `SITE_CONFIG_ENV`
  типизированы по нему; `DEV` от Vite объявлен внутренним),
  `src/components/content/mdx-component-props.ts` (`MDX_COMPONENT_PROPS`: имена и схемы пропсов без
  `.astro`; ключи `MDX_COMPONENTS` обязаны совпадать по типу `MdxComponentRegistry`). Четыре
  тестовых экспорта перенесены в `src/integration-parts.ts`.
- Токены: `{ имя: required | optional }`; optional — читается только с fallback. Определёнными ядром
  считаются и токены темы Tailwind (`tailwindcss/theme.css`, его импортирует `global.css`), и заданные
  через `setProperty`/строки в TS. Новый required-токен — ломающее изменение, optional→required —
  ломающее. Гейт сверяет required-токены (кроме layout) с `theme.css` сайта (`--site`, демо).
- `moreDocsFrontmatterSchema` входит в схемы статей и страниц, отдельного ключа нет. Пути
  таксономии и image-sets экспортированы из своих загрузчиков (`files.ts`, `image-sets.ts`).
- Классификатор JSON Schema: смена `default`, `const`, `pattern` и любого незнакомого ключевого
  слова — ломающая; описания (`description`, `title`) игнорируются. Имя ломающего изменения для
  CHANGELOG: путь поля (`content.locales`), для пропсов — `Компонент.проп`, для остального — имя.
- Снапшоты исключены из Prettier (`.prettierignore`): гейт сравнивает байты с генератором.

## Spec Change Log

- **Ревью 1 → bad_spec (находки 1 и 2 триажа).** Задачи сузили intent «имена и пропсы … директив» до
  имён, а снапшот схем не видел `refine`/`preprocess`, так что сужение через них проходило гейт молча.
  Добавлены Code Map (парсеры директив, `override` в zod, globs загрузчиков), три задачи (атрибуты
  директив, `x-refinements`, исправления находок 3–11) и два AC. Избегаемое состояние: удалённый тон
  `outdated` у note или убранный shorthand `images: ['id']` у Gallery не меняют снапшот.
  **KEEP:** вся реализация до ревью остаётся (код не откатывался, решение владельца 2026-11-06) —
  `consumer-env.ts`, `directives.ts`, `mdx-component-props.ts`, `integration-parts.ts`, гейты, CI-шаг,
  тесты, README и CHANGELOG; меняется только то, что требуют новые задачи. Объявления `exports` —
  по-прежнему из исходников, не из `dist/`.
- **Ревью 2 → bad_spec (находки 19 и 20 триажа).** Правило «исчезновение отпечатка — совместимое»
  неверно для преобразований: удаление `preprocess` у Gallery отвергает `images: ['id']`, а гейт считал
  это совместимым; спека не называла границу того, что видит отпечаток. Добавлены задачи: деление
  отпечатков на проверки и преобразования (с `overwrite`), исправления 21–27, граница гейта в README.
  Избегаемое состояние: удалённое преобразование или `.trim()` проходит гейт без `**Breaking:**`.
  **KEEP:** всё из ревью 1 и его реализация, включая чтение замыкания `superRefine` через
  `node:inspector` с громким отказом при смене обёртки zod; меняется только то, что требуют новые задачи.

## Review Triage Log

Ревью 1 (Codex: blind-hunter — B, edge-case-hunter — E, verification-gap — V).

| # | Слои | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|---|
| 1 | B1 | Директивы в снапшоте только по именам, атрибуты (ключи, значения enum) не снимаются | medium | Intent: «имена и пропсы MDX-компонентов и директив»; атрибуты директив проверяются вручную (`ALLOWED_KEYS`, `NOTE_TONES`, `CALLOUT_*`, `LINKS_*` в `lib/blocks/*/schema.ts`), удаление значения enum сейчас проходит гейт молча. Задачи спеки сузили intent до списка имён | bad_spec |
| 2 | B2, E13, B3, E14 | `toJSONSchema` теряет `.refine`/`.superRefine`/`z.preprocess`: ужесточение проверки и удаление shorthand Gallery (`images: ['id']`) не видны снапшоту | medium | 11 вызовов `refine(` в схемах сайта, контента и Gallery; `galleryImage` — `z.preprocess` (`gallery/schema.ts:41`), в `mdx-components.json` `images.items` — только объект. Спека не говорит, как фиксировать непредставимые ограничения | bad_spec |
| 3 | B13, E12, V-other | CHANGELOG сопоставляется подстрокой: запись про `--color-accent-fixed` закрывает `--color-accent`, `nav.homepage` — `nav.home` | medium | `api-surface.ts:792` `entry.includes(change.name)` | patch |
| 4 | B8, E11 | Скан env не видит деструктуризацию `const { X } = process.env` | medium | Шаблоны `ENV_READS` (`api-surface.ts:285`) ловят только `env.X`, `env['X']`, `fn(env,'X')`; инвариант AC «необъявленное env валит гейт» обходится | patch |
| 5 | B4 | Ключи site-files — литералы (`src/content/albums/*.yaml`), а загрузчики читают `**/*.{yaml,yml}`; второй источник путей | low | `api-surface.ts:73-82` против `collections.ts:27,43`; Boundaries: «второго списка нет» | patch |
| 6 | B5, E1 | Точка `exports` без `types` в снапшот не попадает, её удаление не заметят | low | `api-surface.ts:121-123` отбрасывает такие ключи; правка — включать каждый ключ | patch |
| 7 | B11, E10 | Добавление варианта `oneOf` классифицируется как совместимое, хотя пересечение сужает | low | `compareVariants` (`api-surface.ts:660`) не различает `anyOf`/`oneOf`; правка — для `oneOf` новый вариант ломающий | patch |
| 8 | E9 | Смена представления `{}` ↔ `true` даёт ложное «ломающее» | low | `api-surface.ts:532` проверяет `acceptsAll(before)` до сравнения обоих; правка — одна проверка | patch |
| 9 | B6, E3 | Интерфейс снимается без параметров типа и `extends`, только первое объявление | low | `api-surface.ts:149` режет до `{`; сейчас экспортированных интерфейсов нет, правка прямая | patch |
| 10 | V1 | Нет тестов на добавление required/optional токена | low | `api-surface.test.ts:198,218` покрывают удаление и смену use; замена `breaking: use === 'required'` на `false` тесты не валит | patch |
| 11 | B14, V2 | CLI `check:api-snapshot` не тестируется на необъявленное env и на неполную тему через `--site` | low | `check-api-snapshot.test.ts:32` проверяет только дрейф снапшота | patch |
| 12 | B9, E5 | Токен, объявленный в одном селекторе, исключается из контракта целиком | false | Решение владельца (frozen): токены API — те, что ядро «не определяет само»; реализация следует ему буквально | reject |
| 13 | B12, E7 | Новое необязательное поле в открытом объекте может отвергнуть прежние значения | false | Матрица I/O (frozen), строка 2: добавленное необязательное поле — «совместимое» | reject |
| 14 | B10, E8 | `contains` + `maxContains`: расширение подсхемы сужает массив | low | Ни один снапшот не содержит `contains` (grep по `api-snapshot/*.json` — 0), правка добавляет ветку | reject |
| 15 | B7 | Экспортированный класс сводится к `typeof Class` | low | В `exports.json` нет классов, все значения — функции; сериализация членов — новая логика | reject |
| 16 | E2 | Значение ссылается на неэкспортированный локальный тип, его изменения не видны | low | Все типы в объявлениях `exports.json` экспортированы рядом (`eslint.ts:8-16`), внешние (`AstroIntegration`) или покрыты site-files (`typeof albumSchema`); обход достижимых типов — новая логика | reject |
| 17 | E4 | `collapse` схлопывает пробелы внутри строковых литералов | low | В `exports.json` нет литералов с повторными пробелами; правка требует токенизации | reject |
| 18 | E6 | `env.X` в комментарии или строке валит гейт как необъявленное | low | Отказ громкий, не тихий; текущий код гейт проходит; разбор комментариев и строк — новая логика | reject |

Ревью 2 (те же слои, после loopback 1).

| # | Слои | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|---|
| 19 | B1 | Исчезновение отпечатка `preprocess` классифицируется как совместимое, хотя удаление shorthand Gallery отвергает `images: ['id']` | medium | Правило спеки «исчезновение — совместимое» (задача `x-refinements`) верно для проверок, но не для преобразований; `gallery/schema.ts:41` | bad_spec |
| 20 | B2, B7, E8 | Отпечаток не видит хелперы и константы колбэка (`isValidIsoDate`, `REQUIRED_DENIED_FIELDS`) и прочую логику парсеров директив (синтаксис `claim`, непустой `title`) | medium | `refinementSources` (`api-surface.ts:195`) хеширует только текст функции; полный семантический захват невозможен, а спека не называет эту границу, и README обещает больше | bad_spec |
| 21 | B3 | Встроенные преобразования (`.trim()`) не попадают в отпечаток: добавление `.trim()` к `min(1)` отвергает `" "` без изменения снапшота | low | `refinementSources` берёт только `check === 'custom'` (`api-surface.ts:202`); `.trim()` уже есть в `seo-schema.ts:10`, `schemas.ts:288,329` | patch |
| 22 | B6, E6 | Изменённая ветка `oneOf` с пересечением даёт «совместимое» | low | `compareVariants` сравнивает ветки `oneOf` по позиции как обычные схемы; правка прямая — любое изменение `oneOf` ломающее | patch |
| 23 | B9 | Путь `src/content/featured/home.yaml` — литерал рядом с `FEATURED_HOME_PATH` | low | `api-surface.ts:98` против `lib/featured.ts:28`; Boundaries: «второго списка нет» | patch |
| 24 | B10 | Локализованные загрузчики берут `base` из `COLLECTION_SOURCES`, а `pattern` — своей константой | low | `collections.ts:32` передаёт только `base`, `localized-glob.ts:52` — `LOCALIZED_DOCUMENT_PATTERN`; смена `pattern` в `COLLECTION_SOURCES` поменяет снапшот, но не загрузку | patch |
| 25 | B11 | Граница имени в CHANGELOG не включает `/`: запись про `…/collections` закрывает удаление корня пакета | low | Граница — `[\w.-]` (`api-surface.ts:1052`) | patch |
| 26 | V1 | Удаление точки `exports` целиком не покрыто тестом | low | `api-surface.test.ts:265` оставляет ключ точки; замена `breaking: true` на `false` в ветке удаления точки тесты не валит | patch |
| 27 | V2 | Удаление ключа `site-files`/`mdx-components` не покрыто тестом | low | `api-surface.test.ts:348,370` меняют поля внутри сохранённого ключа | patch |
| 28 | B4 | Сортировка отпечатков теряет порядок вложенных `preprocess` | low | В ядре один `preprocess` (`gallery/schema.ts:41`), вложенных нет; сохранение порядка — новая структура | reject |
| 29 | B5, E2 | Схлопывание пробелов внутри строк и regex в колбэке даёт одинаковый отпечаток | low | Колбэк, различающий значения только числом пробелов, в схемах ядра не встречается; правка требует токенизатора | reject |
| 30 | B8, E7 | Скан env пропускает алиасы (`const e = process.env; e.X`) и деструктуризацию с объектным default | low | grep по `packages/core/src` не находит присваивания `= process.env`/`import.meta.env`; значения env — строки, объектный default бессмыслен; разрешение алиасов — разбор AST | reject |
| 31 | E1 | Экспортированный класс сводится к `typeof Class` | low | carried: строка 15, в `exports.json` по-прежнему нет классов | reject |
| 32 | E3 | `var(--x)` в строках TS/TSX не сканируется | false | Единственное чтение в TS — `var(--content-gap-${gap})` (`lib/blocks/content-gap.ts:10`), имя строится во время выполнения, а такие контракт исключает по `VAR_READ` | reject |
| 33 | E4 | `env.X` в комментарии валит гейт | low | carried: строка 18 | reject |
| 34 | E5 | Новое необязательное поле в открытом объекте | false | carried: строка 13, матрица I/O строка 2 | reject |

Ревью 3 (те же слои, после loopback 2).

| # | Слои | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|---|
| 35 | B5, E8, E-claim | Замена схемы с `x-transforms` на «принимает всё» классифицируется как совместимая: выход `acceptsAll(after)` раньше сравнения преобразований | low | `compareSchemas` (`api-surface.ts:809-811`) возвращается до ключей; противоречит правилу спеки «любое изменение преобразования — ломающее» | patch |
| 36 | B8 | `NOTE_ATTRIBUTES.claim.required` объявлен, но парсер требует `claim` отдельно; смена объявления меняет снапшот, а не поведение | low | `note/schema.ts:32` против `:65-68`; `directives.test.ts` не проверяет пропуск необязательных атрибутов | patch |
| 37 | B10, E15, E-claim | Запись `**Breaking:**` внутри блока кода в `[Unreleased]` засчитывается | low | `unreleasedBreakingEntries` (`api-surface.ts:1057-1070`) не различает fenced-блоки | patch |
| 38 | V1 | Тест merge-base проходит и при сравнении с вершиной `main` | low | `check-api-breaking.test.ts:91-97` проверяет только exit 0; замена `merge-base` на `rev-parse` тест не валит | patch |
| 39 | B7 | `loadContentSnapshot` хардкодит каталоги и расширения коллекций мимо `COLLECTION_SOURCES` | low | `files.ts:71,106,160-165`; дублирование было до этого изменения (тот же хардкод на базовом коммите), реестр его не ввёл | defer |
| 40 | B1, B2, E3, E-claim | Порядок и кратность проверок и преобразований теряются при сортировке отпечатков | low | carried: строка 28; в схемах ядра `.trim()` всегда стоит перед `.min(1)` (`seo-schema.ts:10`, `schemas.ts:288,329`), упорядоченный конвейер — новая структура | reject |
| 41 | B3 | Параметр `.normalize(form)` не входит в отпечаток | low | `.normalize(` в схемах ядра не встречается (grep по схемам) | reject |
| 42 | B4, E5, E-claim | Проверки на выходной стороне `.pipe()` не видны | low | `.pipe(` в схемах ядра не встречается (grep); граница названа в README | reject |
| 43 | B6 | Условия разрешения `exports` (`require`, `default`) не снимаются | low | Все три точки имеют одинаковые `types`/`default`; снимок условий — новая структура, правка не прямая | reject |
| 44 | B9 | Комментарий внутри деструктуризации env обходит скан | low | carried по смыслу строки 30: в ядре нет деструктуризации `process.env`; правка — разбор AST | reject |
| 45 | E1 | Приватные типы сигнатур и члены классов не снимаются | low | carried: строки 15, 16 | reject |
| 46 | E2 | `export type` класса не меняет `kind` | low | В точках нет классов (`exports.json`), реэкспортов `export type { Class }` нет | reject |
| 47 | E4 | Пробелы внутри литералов колбэка схлопываются | low | carried: строка 29 | reject |
| 48 | E6 | `z.date().min(...)` непредставим, ужесточение не видно | low | Единственный `z.date()` — `schemas.ts:31` в union без границ; граница в README | reject |
| 49 | E7 | Колбэк `when` у refine не в отпечатке | low | `when:` в схемах ядра не встречается | reject |
| 50 | E10, E-claim | Дубль ветки `oneOf` не меняет классификацию | low | `oneOf` в снапшотах не встречается; дублирование ветки бессмысленно | reject |
| 51 | E11, E-claim | Алиасы env и вычисляемые ключи | low | carried: строка 30 | reject |
| 52 | E12 | `env.X` в комментарии | low | carried: строка 18 | reject |
| 53 | E13 | `var(--x)` в строках TS | false | carried: строка 32 | reject |
| 54 | E14 | `setProperty('--x')` в комментарии TS помечает токен определённым ядром | low | Сейчас таких комментариев нет (гейт сверяет снапшот), правка — разбор комментариев | reject |
| 55 | E9, E-claim | Новое необязательное поле в открытом объекте | false | carried: строка 13, матрица I/O строка 2 | reject |

## Verification

**Commands:**
- `pnpm check` -- проходит, `check:api-snapshot` и его тесты в нём.
- `pnpm build` -- проходит.
