---
title: 'Явные exports ядра и lint-запрет глубоких импортов'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: '6e5e34143e017040f94401ca6e39e28ce61d7940'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Сайт может импортировать внутренности ядра (`@picasso-ai/astrum-scena/src/...`), и
ничто не говорит об этом до того, как обновление ядра сломает сборку; правила, которое AD-3 отдаёт
пресету ядра, нет.

**Approach:** Часть A истории 6.3. Ядро поставляет ESLint-пресет как новую точку `exports`
(`./eslint`): правило запрещает любой specifier пакета, кроме объявленных в `exports`, а список берётся
из `package.json` ядра. Репо подключает пресет к файлам демо; tarball проверяет, что каждая точка
`exports` разрешается из установленного пакета.

**Решения владельца (2026-11-02):** 6.3 делится на части A–D, которые идут по очереди, а PR один —
после последней части. B — объявленный API и снапшоты, C — политика версий и `UPGRADING.md`, D —
`schemaVersion`.

**Решение владельца по ревью (2026-11-02):** ESLint не читает `.mdx`, а `@astrojs/mdx` принимает в
контенте ESM-`import`. Поэтому MDX закрывает сборка: ядро при компиляции MDX сайта отвергает ESM-импорт
и реэкспорт своих внутренностей по тому же правилу из `exports`, что и пресет. Это единственное
изменение поведения сборки в части A, и оно касается только запрещённых импортов. Код первой
реализации не откатывается: правки идут поверх.

## Boundaries & Constraints

**Always:** Список разрешённых точек выводится из `exports` в `package.json` ядра — второго списка
нет. Пресет — чистые данные flat config на встроенных правилах ESLint, поэтому у ядра не появляется
зависимости от `eslint`. Ловятся статический импорт, `export … from` и динамический `import()`. Сайт,
который подключает пресет, получает правило без правки своего конфига при новой точке `exports`.
Комментарии на английском, нарушения исправляются без подавления, `pnpm check` и `pnpm build` проходят.

**Never:** Не объявлять API потребителя, не снимать снапшоты и не вводить политику версий (части B, C).
Не выводить типы MDX-компонентов (`mdx-authoring.d.ts`): MDX-имена — поверхность части B. Не
поставлять общие пресеты стиля, tsconfig или prettier. Не менять поведение сборки и маршруты.

## I/O & Edge-Case Matrix

| Сценарий | Вход (файл демо) | Ожидаемое | Ошибка |
|---|---|---|---|
| Корень пакета | `import x from '@picasso-ai/astrum-scena'` | проходит | — |
| Объявленная точка | `from '@picasso-ai/astrum-scena/collections'` | проходит | — |
| Глубокий импорт | `from '@picasso-ai/astrum-scena/src/lib/x'` | lint падает | имя specifier и указание на `exports` |
| Реэкспорт | `export * from '@picasso-ai/astrum-scena/dist/index.js'` | lint падает | то же |
| Динамический | `` import(`@picasso-ai/astrum-scena/src/${x}`) `` | lint падает | то же |
| Путь в node_modules | `from '../node_modules/@picasso-ai/astrum-scena/src/x'` | lint падает | то же |
| Похожее имя | `from '@picasso-ai/astrum-scena-extra'` | проходит | — |
| Новая точка | в `exports` добавлен `./x` | `…/x` проходит без правки пресета | — |
| Импорт в MDX | `.mdx` сайта: `import X from '../../node_modules/@picasso-ai/astrum-scena/src/x'` или `…/src/x` | сборка падает | файл MDX, specifier и указание на `exports` |
| Объявленная точка в MDX | `.mdx` сайта: `import { a } from '@picasso-ai/astrum-scena'` | сборка проходит | — |

</frozen-after-approval>

## Code Map

- `packages/core/package.json` -- `exports` сейчас: `.` и `./collections` (типы и JS из `dist/`);
  добавить `./eslint`. `files` уже включает `dist`.
- `packages/core/tsconfig.build.json` -- `files` — граф, который Node грузит без Vite; добавить
  `src/eslint.ts`.
- `packages/core/src/core-root.ts` -- `CORE_ROOT` одинаков из `src/` и `dist/`: от него читать
  `package.json` (не `process.cwd()`).
- `packages/core/src/index.ts` -- маршруты подключаются абсолютными путями (`coreRoutes`, `injectRoute`),
  внутренние specifier'ы пакета ядру не нужны. Образец импорта `./core-root.ts` с расширением.
- `eslint.config.mjs` -- `SITE = 'demo'`; `boundaries()` (стр. ~110–147) и правило «поздний объект
  заменяет весь список правила»: у `demo/astro.config.mjs` уже есть `no-restricted-syntax`
  (`enumDeclaration`, `localeLiteral`), и пресет не должен его затереть — ни наоборот. `dynamicImport()`
  — образец селекторов для `import()`. Подключать пресет из `./packages/core/src/eslint.ts` (Node 24
  снимает типы сам; `dist/` в `pnpm check` может быть ещё не собран).
- `scripts/eslint-config.test.ts` -- `ESLint#lintText` на синтетических путях; сюда — матрица на путях
  `demo/src/*.ts`, `demo/src/*.astro` и `demo/astro.config.mjs` (с проверкой, что `localeLiteral`
  там жив).
- `scripts/build-demo-from-pack.ts` -- ставит tarball вне workspace (`CORE`, стр. 35); добавить проверку,
  что каждая точка `exports` импортируется из установленного пакета, а `@picasso-ai/astrum-scena/src/...`
  — нет (`ERR_PACKAGE_PATH_NOT_EXPORTED`).
- `demo/astro.config.mjs`, `demo/src/content.config.ts` -- единственные импорты ядра в демо; оба
  объявлены.
- `packages/core/src/index.ts:158` -- `mdx()` подключается без опций; сюда — remark-плагин ядра, который
  проверяет узлы `mdxjsEsm` (`data.estree`: `ImportDeclaration`, `ExportAllDeclaration`,
  `ExportNamedDeclaration` с `source`) по шаблону, общему с пресетом (вынести шаблон в модуль, который
  импортируют и `eslint.ts`, и плагин; второго списка не заводить), и бросает ошибку с путём файла.
  Образцы разбора MDX: `lib/content/mdx-structure.ts`, `lib/content/block-photos.ts` (`mdxjs()`).
- `deferred-work.md` стр. 289 (типы MDX) -- остаётся открытой для части B.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/eslint.ts` (+`eslint.test.ts`) -- пресет: flat-config объекты для файлов сайта
  (`no-restricted-imports` и селекторы `no-restricted-syntax` для `import()`), плюс его части для
  сборки с чужими списками правил; разрешённые точки из `exports` -- правило AD-3 в ядре.
- [x] `packages/core/package.json`, `packages/core/tsconfig.build.json` -- точка `./eslint` и сборка
  `dist/eslint.js` -- пресет доступен сайту.
- [x] `eslint.config.mjs` -- подключить пресет к `demo/**`, сохранив существующие правила демо --
  демо проверяется тем же правилом, что получит сайт.
- [x] `scripts/eslint-config.test.ts` -- матрица на путях демо -- гейт правила в `pnpm check`.
- [x] `scripts/build-demo-from-pack.ts` (+тест) -- импорт каждой точки `exports` из tarball и отказ
  внутреннего пути -- `exports` проверены на упакованном артефакте в CI.
- [x] `packages/core/README.md`, `CHANGELOG.md` (`[Unreleased]`) -- подключение пресета сайтом.
- [x] `packages/core/src/index.ts`, новый remark-плагин в `packages/core/src/lib/content/` (+тест) --
  отказ сборки на ESM-импорт внутренностей ядра в MDX сайта; строки матрицы про MDX в тестах --
  решение владельца по ревью.
- [x] Правки ревью (Review Triage Log, маршрут `patch`) -- проверка tarball загружает установленный
  `/eslint` и проверяет, что правило пропускает объявленную точку и отвергает внутренний путь; цели
  `exports` — только обычные файлы; `TSImportType` ловится; типы правил совместимы с `defineConfig`
  без приведения в тестах; `caseSensitive: true`; куски вычисляемого `import()` ловят и голое имя
  пакета, а селектор смотрит только поле `source`; подпути с целью `null` не разрешены.

**Acceptance Criteria:**
- [x] `pnpm lint` проходит на демо, а глубокий импорт в файле кода `demo/**` (`ts`, `tsx`, `astro`,
  `mjs`) его валит.
- [x] Глубокий импорт в `.mdx` сайта валит сборку, а объявленная точка — нет.
- [x] `pnpm demo:packed` проверяет, что каждая точка `exports` разрешается из tarball, а внутренний
  путь — нет; добавление точки в `exports` без файла в `dist/` его валит.
- [x] Список разрешённых точек существует только в `exports`: тест пресета подменяет `exports` и видит
  изменение правила.
- [x] `pnpm check` и `pnpm build` проходят.

## Implementation Notes

- Список точек и шаблон запрета вынесены в `packages/core/src/core-imports.ts` (`installedManifest`,
  `declaredSpecifiers`, `coreImportRule`); их используют и пресет `eslint.ts`, и плагин MDX.
- Проверка MDX сделана mdast-плагином Sätteri (`lib/content/core-imports-mdx.ts`), а не remark-плагином
  `mdx()`. Ядро задаёт `markdown.processor: satteri`, и `@astrojs/mdx` 7.0.8 компилирует MDX через
  `mdxToJs` Sätteri: этот путь не вызывает `mdxOptions.remarkPlugins`. Sätteri отдаёт узел `mdxjsEsm`
  текстом без estree, поэтому плагин разбирает его зависимостями ядра (`micromark-extension-mdxjs`,
  `mdast-util-mdx`).
- Проверка tarball загружает установленный `/eslint` в дочернем процессе и применяет его шаблоны к
  объявленным точкам и к `/src/index.ts`. Цели `exports` должны быть обычными файлами.
- `index.test.ts` перечисляет плагины Sätteri, поэтому в нём добавлен новый плагин.

## Spec Change Log

- Ревью, проход 1, находка E8 (intent_gap): ESLint не видит `.mdx`, а критерий обещал «любой файл
  `demo/**`». Владелец решил закрыть MDX проверкой при сборке и не откатывать код. Изменено: решение в
  Intent, две строки матрицы, Code Map (`index.ts:158`, общий шаблон), задача MDX, задача с правками
  ревью, критерий lint сужен до файлов кода, отдельный критерий для MDX. Предотвращённое состояние:
  сайт может импортировать внутренности ядра из MDX-контента, и ни lint, ни сборка этого не заметят.
  KEEP: пресет — чистые данные на встроенных правилах; список точек выводится только из `exports`;
  `boundaries()` получает готовые `extra`, и правила `demo/astro.config.mjs` не затираются; проверка
  tarball разрешает specifier'ы из каталога сайта в дочернем процессе.

## Review Triage Log

Проход 1 (2026-11-02, Codex: blind-hunter B, edge-case-hunter E, verification-gap V).

| # | Находка | Вердикт | Основание | Маршрут |
|---|---|---|---|---|
| E8 | Файлы `.mdx` демо не проходят ESLint, поэтому глубокий импорт в MDX-контенте не ловится, хотя критерий обещает «любой файл `demo/**`» | medium | `eslint --print-config demo/src/content/pages/blocks.en.mdx` даёт `undefined`: для MDX нет конфига. `@astrojs/mdx` принимает ESM-`import` в контенте, так что сайт может импортировать внутренности ядра из MDX | intent_gap |
| V1, B7, E9 | Проверка tarball только разрешает `/eslint` и смотрит, что файл есть, но не загружает пресет: если `exports` укажет на чужой модуль, проверка всё равно пройдёт | medium | `scripts/build-demo-from-pack.ts:144`: `resolveFromSite` вызывает только `import.meta.resolve`, а `packageExportProblems` проверяет только `existsSync` | patch |
| B5, E3 | Тип через `import('…/src/x').T` (`TSImportType`) не ловится | medium | Селекторы `deepImportRules` (`eslint.ts:48-58`) покрывают только `ImportExpression`, а `no-restricted-imports` не видит `TSImportType` | patch |
| B1 | Тип `LintConfig` (`rules: Record<string, unknown[]>`) несовместим с `defineConfig` в TS-конфиге сайта, а приведение типа в тесте это прячет | medium | `eslint.ts:15`: в ESLint `RuleEntry` первым элементом идёт уровень серьёзности; `eslint.test.ts:151` использует `as Linter.Config[]` | patch |
| B2 | Статический импорт `/COLLECTIONS` проходит: шаблоны `no-restricted-imports` по умолчанию нечувствительны к регистру | low | В `no-restricted-imports.js:336,344` при `caseSensitive: false` regex собирается с флагом `iu`. Исправляется одной опцией `caseSensitive: true` | patch |
| B3, E2, E10 | В `import('@picasso-ai/astrum-scena' + '/src/x')` ни один кусок не начинается с `<имя>/`, поэтому импорт не ловится | low | Регулярка кусков `^name/` в `eslint.ts:304` не ловит голое имя пакета. Исправляется прямо: регулярка кусков `^name(/\|$)` | patch |
| B6, E6 | Селектор вычисляемого `import()` заходит и в объект опций (`with`), поэтому строка там даёт ложное срабатывание | low | Селектор `eslint.ts:318` берёт любой непрямой потомок `ImportExpression`, а не только поле `source`. Исправляется сужением селектора до поля `source` | patch |
| B8, E7 | Если цель `exports` — каталог, проверка tarball её пропускает | low | `existsSync` в `build-demo-from-pack.ts:172,184` истинно и для каталога. Исправляется прямо: `statSync(…)?.isFile()` | patch |
| E5 | Подпуть `exports` с целью `null` попадает в список разрешённых | low | `declaredSpecifiers` (`eslint.ts:285`) берёт ключи без проверки цели. Исправляется прямо: фильтр `target !== null` | patch |
| B4, E1 | Путь `./node_modules/./@picasso-ai/astrum-scena/src/x` проходит | low, отклонено | Нарочно искажённый путь в обычной работе не встречается, а исправление требует нормализации путей внутри селекторов и шаблонов — это уже не прямая правка | reject |
| E4 | Если в `exports` нет `.`, импорт корня всё равно разрешён | low, отклонено | В `exports` ядра `.` есть всегда (`package.json:18`), и проверка tarball требует его разрешения. Исправление добавляет ветку для состояния, которого нет | reject |

Проход 2 (2026-11-02). Все три слоя — Cursor `gpt-5.6-sol-medium` (у Codex исчерпаны кредиты): blind-hunter B, edge-case-hunter E, verification-gap V. Номера — внутри прохода 2.

| # | Находка | Вердикт | Основание | Маршрут |
|---|---|---|---|---|
| V1, B6 | Проверка MDX не прогоняется через настоящую компиляцию: тесты зовут visitor напрямую, а в MDX демо нет ESM-импортов, так что поломка подключения плагина ничего не уронит | medium | Находка verification-gap, проверена при подаче. `core-imports-mdx.test.ts` вызывает `mdxjsEsm` сам, `index.test.ts` сравнивает только список плагинов | patch |
| B5 | Матрица lint на путях демо не включает `.tsx`, хотя критерий его называет | low | `SITE_FILES` в `scripts/eslint-config.test.ts:391` — только `ts`, `astro`, `mjs`. Исправляется одной строкой | patch |
| B3 | Путь `node_modules/./@picasso-ai/astrum-scena/src/x` проходит | low, отклонено | carried: та же находка, что B4/E1 прохода 1; `coreImportRule` (`core-imports.ts:39`) не изменился | reject |
| E1 | Если в `exports` нет `.`, импорт корня разрешён | low, отклонено | carried: та же находка, что E4 прохода 1; `exports` ядра по-прежнему с `.` (`package.json`) | reject |
| B1, E2, E5 | Подпути-шаблоны `exports` (`./features/*`) не поддержаны ни пресетом, ни проверкой tarball | false | В `exports` ядра только литеральные ключи `.`, `./collections`, `./eslint` с целями `./dist/*` (`package.json`). Добавленный шаблон не пройдёт молча: импорт по нему завалит lint, а цель `./dist/*.js` не файл — `packageExportProblems` (`build-demo-from-pack.ts:207`) завалит `demo:packed` | reject |
| B2 | Вложенная условная цель из одних `null` считается объявленной | false | Такой specifier не разрешится из сайта, и `packageExportProblems` (`build-demo-from-pack.ts:212-213`) завалит `demo:packed` с «does not resolve»; в `exports` ядра таких целей нет | reject |
| E3 | Сахар `exports` (строка или условия на верхнем уровне) превращается в несуществующие подпути | false | `declaredSpecifiers` (`core-imports.ts:18`) оставляет только ключи `.` и `./…`, поэтому ключи-условия и индексы строки отбрасываются, и подпуть не появляется. `exports` ядра — карта подпутей | reject |
| B4, E4 | `import('@picasso-ai/astrum-' + 'scena/src/x')` с именем пакета, разрезанным между литералами, не ловится | low, отклонено | Так имя пакета пишут только нарочно, в обычной работе это не встречается. Исправление требует вычислять склейку строк в селекторе — это уже не прямая правка | reject |
| B7 | MDX не проверяется на импорт `/eslint` | false | Плагин и пресет строят правило из одного `declaredSpecifiers` (`core-imports.ts:34`), а `core-imports-mdx.test.ts:43-52` проверяет объявленный подпуть `/collections`. `/eslint` идёт той же веткой регулярки | reject |
| B8 | Проверка tarball зовёт из установленного `/eslint` только `deepImportRules`, а не `astrumScenaEslint` | low, отклонено | `astrumScenaEslint` — обёртка над `deepImportRules` в том же модуле (`eslint.ts:45-58`), и она покрыта в `eslint.test.ts`. Расхождение `dist` с `src` у одной функции модуля невозможно, а исправление добавляет проверку | reject |
| B9 | Типы из tarball не проверяются компилятором потребителя | low, отклонено | `.d.ts` выпускает `tsc` из проверенного исходника, а `pnpm check` запускает `astro check` демо на `dist` ядра через `exports`. Отдельный tsc-проект для tarball — новая проверка, а не прямая правка | reject |
| B10 | Проверяется только разрешение по условиям Node по умолчанию | false | В `exports` ядра только условия `types` и `default` (`package.json`): `default` разрешает Node в проверке, `types` проверяется как файл (`build-demo-from-pack.ts:206-208`). Других ветвей нет | reject |
| E6 | Цель `types` с `../` вне пакета пройдёт проверку tarball | low, отклонено | Все цели ядра — `./dist/…` (`package.json`); такую цель пишут только нарочно. Исправление добавляет охранную ветку для состояния, которого нет | reject |

Правки прохода 2 внесены мной: исполнитель шага 3 остался в прошлом контексте, продолжить его нельзя. `index.test.ts` прогоняет MDX через хуки и Vite-плагин `@astrojs/mdx` с процессором интеграции: импорт `…/src/x` валит компиляцию с именем файла, specifier и `exports`, а `/collections` компилируется. Если убрать плагин из `index.ts`, первый тест падает (проверено). В матрицу lint добавлен `demo/src/probe.tsx`.

## Verification

**Commands:**
- `pnpm check` -- проходит, новые тесты пресета и конфига ESLint в нём.
- `pnpm build` -- проходит.
- `pnpm demo:packed` -- проходит с проверкой точек `exports`.
