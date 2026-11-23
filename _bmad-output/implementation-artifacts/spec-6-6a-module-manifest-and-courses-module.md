---
title: 'Манифест модуля, секция modules.<id> и курсы как эталонный модуль (6.6, часть A)'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: '2a55e37122d25a4a74f1a000472ab9343aacec6b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** курсы вшиты в ядро: вид страницы `kind: course` в `pages`, два маршрута, которые
внедряются всегда, верхние секции `courses`, `moreDocs.course`, `surfaces.coursesIndex`,
`banners.coursesIndex`, ключи словаря ядра, исключение в фильтре sitemap. Включить или выключить их
одной строкой нельзя, и нет контракта, по которому придут туры, отзывы и видео (AD-5, AD-18).

**Approach:** первая из двух частей 6.6. Ядро вводит манифест модуля и реестр модулей; модуль
включается секцией `modules.<id>` в `site.yaml`, которую lock проверяет схемой из манифеста (AD-19).
Курсы — эталонный модуль с собственной коллекцией `courses`; без `modules.courses` нет маршрутов,
коллекции, пункта меню и записей sitemap, а контент выключенного модуля — ошибка сборки.

**Decisions (владелец, 2026-11-14):**
- 6.6 делится на A (этот файл) и B: гейт коллизий имён (ядро, модули, slug'и, MDX, директивы, токены,
  i18n), поверхность `modules` в API-снапшоте, негативная сборка демо с намеренной коллизией.
- Курсы — отдельная коллекция `src/content/courses/` из манифеста модуля, не вид страницы в `pages`;
  `kind: course` и `courseStatus` уходят из `pageSchema`. Демо переносит файлы курсов; сайтам —
  переход в `UPGRADING.md` (эталонный сайт переносит курсы при принятии ядра в 9.3). Опубликованный
  вывод (URL, разметка) не меняется.
- Все настройки курсов переезжают в `modules.courses.*` со схемой из манифеста; включение —
  `modules: { courses: {} }`. `site.yaml` получает `schemaVersion: 3`, версия 2 отклоняется со ссылкой
  на `UPGRADING.md`.
- Пункт меню сайт по-прежнему пишет сам; сегмент проверяется: сегмент выключенного модуля или
  неизвестный сегмент — ошибка сборки с путём ключа.
- Спецификация остаётся целой (размер выше рекомендуемого принят).

## Boundaries & Constraints

**Always:**
- Манифест — типизированный объект в ядре: `id`, коллекции (имя, источник, схема, версии), сегменты
  маршрутов и каталог страниц, схема секции `modules.<id>`, i18n-пространство и словари по локалям,
  MDX- и директивные имена, токены, сегменты меню, зависимости. Поля, которые курсам не нужны
  (MDX, директивы), есть в типе и пусты.
- Реестр модулей — один источник; включённые модули читаются из lock один раз, все потребители
  (построитель коллекций, маршруты, sitemap, меню, словари, snapshot контента) берут их оттуда.
- Зависимость на выключенный или неизвестный модуль — ошибка resolve (проверка чистой функцией, тест
  на фикстурном манифесте).
- Ключи словаря модуля лежат в его пространстве (`courses.*`); полнота проверяется по правилам 6.5
  для каждой локали конфига; словарь сайта может переопределять ключи только включённых модулей.
- `src/content.config.ts` сайта остаётся одной строкой `defineCoreCollections()`; построитель
  добавляет коллекции включённых модулей.

**Never:**
- Не делать в A гейт коллизий и поверхность `modules` в снапшоте (часть B), туры/отзывы/видео,
  CLI-команды модулей (6.7), автоматический пункт меню из манифеста.
- Не держать в ядре ветвлений по курсам вне модуля, кроме общих механизмов, которые получают
  данные модуля (карточки, `/status/`, `moreDocs`, featured).
- Не менять опубликованный вывод демо: визуальные эталоны остаются байт-в-байт.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Модуль включён | `modules.courses: {}`, курсы в `src/content/courses/` | маршруты `/{locale}/courses/…`, пункт меню, записи sitemap как сейчас | N/A |
| Модуль выключен, контента нет | нет `modules.courses`, нет каталога | нет маршрутов, коллекции, записей sitemap | N/A |
| Контент выключенного модуля | нет `modules.courses`, есть `src/content/courses/*.md` | сборка падает | `src/content/courses: content of module "courses", which is not enabled in site.yaml (modules.courses)` |
| Меню на выключенный модуль | `menu.items[].segment: courses` без модуля | resolve/сборка падает | `site.yaml: menu.items.2.segment: "courses" belongs to module "courses", which is not enabled` |
| Неизвестный сегмент меню | `segment: tours` | ошибка | `… "tours" is not a known segment; known: …` |
| Неизвестный модуль | `modules.tours: {}` | ошибка | `site.yaml: modules.tours: unknown module; known: courses` |
| Неверная настройка модуля | `modules.courses.order: random` | ошибка схемы модуля с путём | `site.yaml: modules.courses.order: …` |
| Старая форма | `schemaVersion: 2` или верхний `courses:` | ошибка | `schemaVersion 2 is not supported; supported: 3; see UPGRADING.md` |
| Старый вид страницы | `kind: course` в `pages` | ошибка схемы `pages` с файлом | unrecognized key |
| Ссылка на курс без модуля | `moreDocs` страницы с `kind: course`, модуль выключен | ошибка | файл, ключ и «module "courses" is not enabled» |

</frozen-after-approval>

## Code Map

- `packages/core/src/modules/` (новое) -- `manifest.ts` (тип манифеста), `registry.ts` (список
  модулей, `enabledModules(site)`, чистые проверки зависимостей, сегментов, контента),
  `courses/` (манифест, схема коллекции, схема секции, словари `en.json`/`ru.json`, страницы).
- `packages/core/src/pages/[locale]/courses/{index,[slug]}.astro` -- переезжают в
  `modules/courses/pages/`; `[locale]/[slug].astro:25` теряет исключение курсов.
- `packages/core/src/integration-parts.ts:32` `coreRoutes(pagesDir)` -- переиспользовать для
  каталога страниц каждого включённого модуля; `index.ts:205` внедряет их.
- `packages/core/src/index.ts:121-125,171` -- `courseSlugs` и их фильтр уходят: курс больше не может
  стать плоской страницей; `lib/sitemap.ts:16` `createSitemapFilter` упрощается.
- `packages/core/src/collections.ts`, `config/collection-sources.ts` -- построитель и реестр
  источников принимают коллекции модулей; включённые модули читаются из lock (`config/loader.ts`
  `loadSiteSection`, корень сайта — `virtual:astrum-scena/site-root`, как `config/site.ts`).
- `packages/core/src/config/lock.ts:40-60` -- `COLLECTION_VERSIONS` и `collections` lock'а: версии
  коллекций включённых модулей; `resolveSiteLock` проверяет `modules.<id>` схемой манифеста.
- `packages/core/src/config/site-schema.ts:210,289,317,408,707,774`, `config/banners.ts:18`,
  `config/menu.ts:70,117` -- секции курсов уходят в схему модуля; `schemaVersion` 3; проверка
  сегментов меню (сегменты ядра — первые сегменты `coreRoutes()`).
- `packages/core/src/config/schema-version.ts` -- сообщение о неподдерживаемой версии уже есть.
- `packages/core/src/lib/content/schemas.ts:132,315-322` -- `pageSchema` без `kind`/`courseStatus`;
  `courseSchema` переезжает в модуль; цель `moreDocs` `kind: course` остаётся.
- `packages/core/src/lib/content/{documents,build-data,integrity,routes}.ts`,
  `more-docs/{registry,resolve}.ts`, `lib/featured.ts`, `lib/cards/{build-data,select}.ts`,
  `lib/status/build-data.ts`, `lib/redirects/contract.ts`, `components/status/site-status.astro`
  -- курсы берутся из коллекции `courses`, не фильтром `isCourse` по `pages`; правило ADR-0013
  (`courseStatus` из опорной локали) сохраняется для новой коллекции.
- `packages/core/src/lib/content/files.ts:162` `loadContentSnapshot` -- читает каталоги из
  `COLLECTION_SOURCES` и коллекций включённых модулей (закрывает запись deferred-work 6.3b о жёстком
  списке каталогов).
- `packages/core/src/i18n/{en,ru}.json`, `dictionaries.ts:26-69`, `ui.ts:23` -- ключи
  `courses.title`, `course.status.*`, `moreDocuments.course.*` переезжают в словарь модуля как
  `courses.*`; `UIKey`, схема словаря сайта и полнота учитывают включённые модули;
  `index.ts:87` `configYamlDependency` следит за словарями модуля.
- `packages/core/src/config/fixtures/site-config.ts`, `config/__fixtures__/*` -- фикстуры на новую
  форму.
- `demo/site.yaml`, `demo/site.lock.yaml`, `demo/src/content/pages/{darkroom-basics,meteor-watch,night-sky-workshop}.*.md`
  -- `modules.courses`, `schemaVersion: 3`, курсы в `demo/src/content/courses/`.
- `scripts/build-demo-from-pack.ts:39-42,330-420` -- образец негативных сборок; добавить сборку с
  выключенным модулем при наличии контента и сборку демо без модуля и без контента курсов.
- `e2e/content.ts`, `e2e/{inner,more-documents,navigation,footer-promo}.spec.ts` -- ожидания из
  коллекции `courses` демо.
- `packages/core/api-snapshot/{site-files,i18n}.json` -- `pnpm api:snapshot`; `check:api-breaking`
  должен назвать смену формы ломающей.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/modules/` + тесты -- тип манифеста, реестр, манифест курсов, чистые проверки
  (модуль, зависимость, сегмент меню, контент выключенного модуля); каждая строка матрицы — тест.
- [x] `config/site-schema.ts`, `lock.ts`, `menu.ts`, `banners.ts`, фикстуры + тесты -- `modules`,
  `schemaVersion: 3`, секции курсов в схеме модуля, версии коллекций модулей в lock.
- [x] `collections.ts`, `collection-sources.ts`, `lib/content/files.ts` -- коллекции модулей в
  построителе и snapshot'е контента.
- [x] `lib/content/*`, `lib/{featured,cards,status,redirects}`, `site-status.astro`, страницы курсов
  -- курсы из коллекции `courses`; маршруты курсов внедряются только при включённом модуле.
- [x] `index.ts`, `lib/sitemap.ts` -- проверки модулей в `astro:config:setup`, маршруты модулей,
  фильтр sitemap без `courseSlugs`.
- [x] `i18n/*` + тесты -- словарь модуля `courses.*`, полнота по локалям, словарь сайта знает только
  включённые модули.
- [x] `demo/` -- `modules.courses`, перенос курсов, `pnpm config:resolve`.
- [x] `scripts/build-demo-from-pack.ts` + тест -- сборка с контентом выключенного модуля падает;
  сборка без модуля и без контента курсов не содержит `courses/` в выводе и sitemap.
- [x] `e2e/` -- ожидания из коллекции `courses`; визуальные эталоны не меняются.
- [x] Доки и учёт: `packages/core/README.md` (модули, манифест, `modules.courses`), `CHANGELOG.md`
  `[Unreleased]` с `**Breaking:**`, `UPGRADING.md` (schemaVersion 3, перенос курсов и настроек,
  ключи словаря), `deferred-work.md` (`closed_by` для 6.3b `loadContentSnapshot`), `epics.md` (критерий
  6.6 разделён на A/B), `sprint-status.yaml` (`6-6a-…: review`, `6-6-…: in-progress`).

**Acceptance Criteria:**
- [x] Каждая строка матрицы покрыта тестом в `pnpm check`; две новые сборки упакованного демо идут в
  `pnpm demo:packed`.
- [x] Демо с включённым модулем строит прежние страницы курсов; визуальные эталоны байт-в-байт,
  `pnpm test:e2e` зелёный.
- [x] `src/content.config.ts` демо не изменился (одна строка).
- [x] `pnpm check:api-breaking --base origin/main` называет смену формы ломающей, и она описана в
  `CHANGELOG.md` и `UPGRADING.md`.
- [x] `pnpm check`, `pnpm build`, `pnpm demo:packed`, `pnpm test:e2e` проходят.

## Implementation Notes

- Общие схемы документов (`articlesOrderSchema`, `moreDocsConfigSchema`, `documentSurfaceSchema`)
  вынесены из `site-schema.ts` в `config/document-schemas.ts`, иначе `site-schema → registry →
  courses/schema → site-schema` дают цикл. Баннер индекса курсов модуль отдаёт через необязательное
  поле манифеста `surfaceBanners`, цели `moreDocs` модуля — через `moreDocsKinds` (оба поля сверх
  перечня спеки).
- `modules` — объект с `catchall(z.unknown())` и проверкой ключей: строгий объект дал бы
  `unrecognized key` без списка известных модулей.
- Неизвестный сегмент меню проверяется в `astro:config:setup` (известны сегменты ядра из
  `coreRoutes()`, сегменты меню включённых модулей и slug'и опубликованных страниц); сегмент
  выключенного модуля и зависимости — в схеме, то есть уже на resolve.
- `configYamlDependency` не менялся: словари модулей — JSON ядра, их импортирует граф модулей, и Vite
  следит за ними сам.
- Порядок CSS в общем чанке `card-masonry` сменился (`course-badge.css` первым): свойства не
  пересекаются с правилами карточек. HTML всех страниц демо совпал с прежней сборкой байт-в-байт,
  кроме хеша в имени этого чанка и времени сборки на `/status/`.

## Spec Change Log

## Review Triage Log

Ревью 1 (Codex: blind, edge, verification-gap), дифф от `2a55e37122d25a4a74f1a000472ab9343aacec6b`.

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|------|---------|---------|-------------|---------|
| 1 | blind | `index.ts:134`: проверка сегментов меню не знает маршрутов сайта (`src/pages` сайта) — пункт на собственную страницу сайта падает | low, отклонено | лестница кастомизации эпика 6 (конфиг, тема, контент и словари, точки замены, черновики `site-*`) не содержит собственных маршрутов сайта; черновики объявят сегменты своим манифестом (AD-18). Матрица спеки требует ошибку на неизвестный сегмент; меню эталонного сайта (`portfolio`, `articles`, `courses`, `about` — страница, `contacts`) проходит | reject |
| 2 | blind | `index.ts:157`: маршруты модулей внедряются в `astro:config:setup`; смена набора модулей в `astro dev` требует перезапуска | low | реально (как файлы `src/overrides/` в 6.5C); исправление — фраза о перезапуске в README | patch |
| 3 | blind, edge | `files.ts:178-189`: `loadContentSnapshot` грузит только коллекцию курсов, а не каждую коллекцию манифестов | low, отклонено | в `MODULES` один модуль (`registry.ts:5`), а `ContentSnapshot` типизирован по коллекциям, так что новый модуль всё равно правит тип snapshot'а; обобщение — новая сложность ради модуля, которого нет | reject |
| 4 | blind | `translation-marker.ts:13,49`: писатель маркера `translatedFromDigest` знает только `articles`/`pages`; файл курса теперь падает на `pageSchema` | low | реально: до изменения курсы были `pages` и маркер для них писался; теперь курс без коллекции в писателе. Исправление — `courses` с `courseSchema` в `DocumentCollection` | patch |
| 5 | blind | `UPGRADING.md:444`: при выключении модуля переопределения `courses.*` в словаре сайта роняют сборку, инструкции этого не говорят | low | реально: словарь сайта принимает ключи только включённых модулей; исправление — фраза в README о выключении модуля (секция, контент, пункт меню, ключи словаря) | patch |
| 6 | edge | `registry.ts:125`: символическая ссылка на файл в каталоге выключенного модуля не считается контентом | low | реально (`Dirent.isFile()` ложно для ссылки); исправление — прямая правка условия | patch |
| 7 | vgap | `collections.ts:36`: ни один тест не проверяет, что объект `defineCoreCollections()` не содержит `courses` при выключенном модуле и содержит при включённом | medium (gap) | пред-проверено слоем: `registry.test.ts:91` проверяет только `isCollectionDefined`; всегда добавляемая коллекция прошла бы все тесты | patch |

## Design Notes

Манифест курсов (форма, не окончательный код):

```ts
export const coursesModule = defineModule({
  id: 'courses',
  collections: { courses: { source: { base: './src/content/courses', pattern: LOCALIZED_DOCUMENT_PATTERN }, schema: courseSchema, versions: [1] } },
  pagesDir: 'pages', segments: ['courses'],
  config: coursesConfigSchema, // order, currentFirst, moreDocs, surface, banner
  i18n: { namespace: 'courses', dictionaries: { en, ru } },
  mdx: [], directives: [], tokens: ['--status-badge-courses', …], menu: ['courses'], dependsOn: [],
})
```

Коллекции модулей читаются построителем из lock, поэтому включение модуля — правка `site.yaml` и
`pnpm config:resolve`, без правки `content.config.ts`.

## Verification

**Commands:**
- `pnpm check` -- зелёный
- `pnpm build && pnpm demo:packed` -- зелёные, обе новые сборки упакованного демо отработали
- `pnpm test:e2e` -- зелёный, визуальные эталоны без изменений
- `pnpm check:api-breaking --base origin/main` -- ломающие изменения названы в CHANGELOG и UPGRADING
