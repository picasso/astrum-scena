---
title: 'Гейт коллизий имён и поверхность modules в API-снапшоте (6.6, часть B)'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: '96e1287943005f1761a6f1b0893a4fd5ae7f98bf'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-6a-module-manifest-and-courses-module.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** манифест модуля (6.6A) объявляет имена, но никто не проверяет, что они не пересекаются
с именами ядра, других модулей и slug'ами контента: страница со slug `courses` или `articles` молча
перекрывается статическим маршрутом, ключ словаря модуля с именем ключа ядра молча его заменяет. Схема
`modules.<id>` и остальной манифест не входят в API-снапшот, так что смена настроек модуля проходит
мимо `check:api-breaking` (AD-18, AD-7).

**Approach:** чистые функции проверки коллизий над манифестами и именами ядра; сборка
(`astro:config:setup`) падает на любой коллизии включённых модулей и slug'ов страниц, а тест в
`pnpm check` прогоняет её над всеми модулями реестра, так что ядро не публикуется с коллизией. Новая
поверхность `modules` в `api-snapshot/` со своим классификатором изменений; негативная сборка
упакованного демо со страницей, чей slug совпадает с сегментом модуля курсов.

**Decisions (агент, принимаются на чекпоинте):**
- Пространства имён гейта: id модулей; коллекции (имя и каталог источника: равный или вложенный каталог
  — коллизия); сегменты маршрутов `/{locale}/<segment>/` и сегменты меню; MDX-имена; директивы;
  токены (токен модуля не может быть токеном контракта темы ядра `api-snapshot/tokens.json` или
  другого модуля); i18n (пространство модуля не совпадает с первым сегментом ключей ядра и с
  пространством другого модуля; ключ модуля вне своего пространства — ошибка).
- Slug'и: страница `pages`, которую строит маршрут `[locale]/[slug]` (опубликованная или unlisted,
  кроме `home`), не может носить сегмент ядра или включённого модуля. Сегмент выключенного модуля не
  проверяется: маршрута нет, страница строится.
- Классификатор `modules`: модуль удалён или добавлен — ломающее (владелец, 2026-11-14, после ревью 1:
  выключенный модуль сразу занимает свои сегменты меню и каталог контента); `config` — через
  `compareSchemas` с умолчаниями (как lock); добавленный сегмент — ломающее (может перекрыть slug
  страницы сайта), добавленная зависимость — ломающее, убранная версия коллекции — ломающее;
  добавленная коллекция модуля — ломающее (владелец, 2026-11-14: lock включившего модуль сайта без её
  версии не загрузится до `pnpm config:resolve`); смена пространства i18n — ломающее; прочие удаления
  — ломающие, прочие добавления — совместимые.
- Сайт со страницей, чей slug совпадает с сегментом, раньше молча терял страницу; теперь сборка
  падает — это `**Breaking:**` в `CHANGELOG.md` и абзац в `UPGRADING.md` (переименовать slug,
  поставить редирект).

## Boundaries & Constraints

**Always:**
- Проверки — чистые функции над манифестами и явным набором имён ядра (тестируются на фикстурных
  манифестах); реальные имена ядра собирает одна функция из источников, которые ядро уже читает.
- Каждое сообщение называет обе стороны коллизии и владельца имени (ядро или `module "<id>"`), для
  slug'а — id страницы.
- Все коллизии сборки выводятся одной ошибкой, как `assertModuleContent`.
- Снапшот и классификатор выводятся из `MODULES`; `pnpm api:snapshot` обновляет `modules.json`,
  `check:api-snapshot` ловит расхождение.

**Never:**
- Черновики `site-*` (история процедуры расширения) — гейт лишь строится так, чтобы их можно было
  добавить вторым источником имён.
- Поверхность маршрутов ядра в снапшоте, новые модули, CLI (6.7).
- Не менять опубликованный вывод демо: визуальные эталоны байт-в-байт.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Нет коллизий | демо как есть | сборка проходит | N/A |
| Slug = сегмент модуля | страница `slug: courses`, модуль включён | сборка падает | `page "<id>": slug "courses" is the route segment of module "courses"` |
| Slug = сегмент ядра | страница `slug: articles` | сборка падает | `… is the route segment of the core` |
| Slug = сегмент выключенного модуля | `slug: courses`, модуля нет | страница строится | N/A |
| Коллекция | фикстурный модуль с коллекцией `albums` | ошибка | `module "x": collection "albums" is the core's` |
| Каталог источника | `./src/content/pages/x` | ошибка | `… source … is inside the core collection "pages"` |
| Сегмент между модулями | два модуля с `tours` | ошибка | `module "b": segment "tours" is module "a"'s` |
| MDX / директива | `Gallery` / `callout` в модуле | ошибка | `… is the core's` |
| Токен | модуль с токеном контракта темы | ошибка | `… token "--color-accent" is the core's` |
| i18n | пространство `nav`; ключ `x.y` в модуле `courses` | ошибка | `… namespace "nav" is the core's` / `key "x.y" is outside namespace "courses"` |
| Повтор id | два модуля `courses` | ошибка | `module id "courses" is declared twice` |

</frozen-after-approval>

## Code Map

- `packages/core/src/modules/registry.ts` -- `MODULES`, `ModuleIssue`, стиль проверок (`dependencyIssues`);
  новые проверки — в `modules/collisions.ts` рядом, тесты в `collisions.test.ts` по образцу
  `registry.test.ts` (фикстурные манифесты через `defineModule`).
- Имена ядра: `config/collection-sources.ts` `COLLECTION_SOURCES` (имена и `base`);
  `integration-parts.ts:45` `coreSegments()`; `components/content/mdx-component-props.ts`
  `MDX_COMPONENT_PROPS`; `lib/blocks/directives.ts` `DIRECTIVE_ATTRIBUTES`;
  `theme/tokens-plugin.ts:9` `CORE_TOKENS_FILE` + `theme/tokens.ts` `parseTokenList`;
  `i18n/en.json` (первые сегменты ключей); `i18n/dictionaries.ts:40` `moduleKeys`.
- `packages/core/src/index.ts:117-140,165-170` -- `assertModuleContent`, `assertMenuSegments`: новый
  вызов гейта рядом, после `loadContentSnapshot`; страницы маршрута `[slug]` брать тем же способом,
  что строит маршруты (`collectPublishedDocuments` + unlisted из `buildRedirectRouteSets`).
- `scripts/lib/api-surface.ts:70,602,692+` -- `SURFACES` + `'modules'`, извлечение в
  `extractSnapshot`, `compareModules` в диспетчере изменений; `jsonSchema`/`requireDefaults`/
  `compareSchemas` переиспользовать; тесты в `scripts/lib/api-surface.test.ts`,
  `scripts/check-api-breaking.test.ts`.
- `packages/core/api-snapshot/modules.json` -- генерируется `pnpm api:snapshot`.
- `scripts/build-demo-from-pack.ts:332-360,434-447` -- образец `assertBuildRejectsBadTheme` /
  `assertBuildRejectsDisabledModuleContent`; новая негативная сборка со страницей-коллизией (оба
  языка демо), тест в `build-demo-from-pack.test.ts`.
- `packages/core/README.md:230+` -- перечень поверхностей снапшота и раздел модулей; `CHANGELOG.md`,
  `UPGRADING.md` (`pnpm check:upgrading`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/modules/collisions.ts` + тест -- функции коллизий и сбор имён ядра; каждая
  строка матрицы — тест; тест над `MODULES` с реальными именами ядра даёт пусто.
- [x] `packages/core/src/index.ts` -- гейт в `astro:config:setup` для включённых модулей и slug'ов.
- [x] `scripts/lib/api-surface.ts` + тесты -- поверхность `modules` и классификатор по решениям;
  `pnpm api:snapshot`.
- [x] `scripts/build-demo-from-pack.ts` + тест -- сборка с `slug: courses` падает с сообщением гейта,
  идёт в `pnpm demo:packed`.
- [x] Доки и учёт: README (гейт, поверхность `modules`), `CHANGELOG.md` `[Unreleased]`, `UPGRADING.md`,
  `deferred-work.md` (`closed_by` для записи 6.6B), `sprint-status.yaml` (`6-6b-collision-gate:
  review`, `6-6-…: review`).

**Acceptance Criteria:**
- [x] Каждая строка матрицы — тест в `pnpm check`; негативная сборка в `pnpm demo:packed`.
- [x] Инвариант «в ядре нет коллизий между ядром и модулями» охраняет тест в `pnpm check`.
- [x] `pnpm check:api-snapshot` падает при смене манифеста без обновления `modules.json`; тест
  классификатора покрывает каждое правило из решений.
- [x] `pnpm check`, `pnpm build`, `pnpm demo:packed`, `pnpm test:e2e` проходят; эталоны не меняются.

## Implementation Notes

- Страницы маршрута `[slug]` гейт берёт из `collectPublishedDocuments(snapshot.pages, …, slug !== 'home')`:
  этот набор уже включает unlisted (флаг `unlisted` не исключает документ из опубликованных), так что
  отдельное объединение с `unlisted` из `buildRedirectRouteSets` не нужно. Id страницы в сообщении —
  `translationKey`.
- Пространства сегментов маршрутов и меню — одно: сегмент меню модуля, не совпадающий с его же
  сегментом маршрута, проверяется против сегментов ядра и сегментов/меню других модулей. Каталог
  источника коллекции сталкивается при равенстве, вложенности и обратной вложенности (каталог модуля
  содержит каталог чужой коллекции).
- Ошибка сборки — одна, с заголовком `name collisions:` и строкой на каждую коллизию.
- Имена изменений поверхности `modules`: `<id>` (модуль), `<id>.config.<путь>` (настройки),
  `<id>.collections.<имя>[.source|.versions]`, `<id>.<поле>.<значение>` для списков,
  `<id>.namespace`. По правилу «прочие удаления — ломающие» удалённая зависимость тоже ломающая.
- Коллекции в `modules.json` — путь источника и версии; схема документа коллекции остаётся в
  `site-files.json`, ключи словаря — в `i18n.json`.

## Spec Change Log

## Review Triage Log

Ревью 1 (Codex: blind, edge, verification-gap), дифф от `96e1287943005f1761a6f1b0893a4fd5ae7f98bf`.

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|------|---------|---------|-------------|---------|
| 1 | blind, edge | `collisions.ts:104`: источники коллекций модуля регистрируются после цикла, две коллекции одного модуля с равным или вложенным каталогом не ловятся | low | реально: `sources.push` идёт после проверки всех коллекций модуля; исправление — регистрировать источник сразу после его проверки | patch |
| 2 | blind, edge | `collisions.ts:52-55`: каталог `.` (корень сайта) не считается содержащим `src/content/pages` | low | реально: `path.posix.normalize('./')` даёт `.`, а `contains` ищет префикс `./`; исправление — одно условие для `.` | patch |
| 3 | blind | `collisions.ts:121`: пространство с точкой (`nav.extra`) не сталкивается с пространством ядра `nav` | low | реально: сравнение точное, а ключи `nav.extra.*` лежат в пространстве `nav` ядра; исправление — сравнивать и регистрировать первый сегмент пространства | patch |
| 4 | blind | `index.ts:177`: контент модулей загружается до проверки коллизий манифестов, конфликтующий источник может упасть ошибкой схемы раньше гейта | low, отклонено | включённые модули — подмножество `MODULES`, а `collisions.test.ts:50` в `pnpm check` требует, чтобы `moduleCollisions(MODULES)` было пусто; опубликованное ядро не доходит до этой ветки, а перенос проверки раньше разбил бы требование «все коллизии одной ошибкой» | reject |
| 5 | blind | `UPGRADING.md:479`: совет поставить редирект со старого адреса, который занят статическим маршрутом | low | реально: `lib/redirects/contract.ts:127-131` отклоняет источник на существующем или защищённом маршруте, а страница по этому адресу никогда не открывалась; исправление — убрать фразу о редиректе | patch |
| 6 | blind | `api-surface.ts:1140`: добавленный модуль считается совместимым, хотя выключенный модуль сразу резервирует сегменты меню и каталоги контента | medium | реально: `registry.ts` `disabledMenuSegmentIssues` и `disabledModuleContentErrors` срабатывают для любого модуля реестра, так что пункт меню `tours` на собственную страницу сайта упадёт после выхода модуля `tours`; правило «модуль добавлен — совместимое» записано в замороженном блоке | intent_gap → решено владельцем (вариант 1: ломающее), правка на месте |
| 7 | blind | `api-surface.ts:1171`: добавленная коллекция включённого модуля считается совместимой, хотя lock сайта без её версии не загрузится до `pnpm config:resolve` | medium | реально: `lock.ts` `lockCollectionNames` требует версию каждой коллекции включённых модулей; по AD-7 изменение, которое требует перегенерации lock, ломающее; правило «прочие добавления — совместимые» записано в замороженном блоке | intent_gap → решено владельцем (вариант 1: ломающее), правка на месте |
| 8 | blind | `api-surface.ts:1162`: перестановка версий `[1, 2]` → `[2, 1]` меняет текущую версию без находки | low, отклонено | в `manifest.ts` версии перечислены по возрастанию, последняя — текущая, и новые версии дописываются в конец, так что перестановка нереалистична; исправление добавляет ещё одну ветку сравнения | reject |
| 9 | blind, vgap | `index.ts:140`: нет интеграционного теста, что `astro:config:setup` отклоняет коллизию включённого модуля; если убрать `moduleCollisions` из гейта, все тесты пройдут | low (gap) | пред-проверено слоем: интеграционные тесты и негативная сборка проверяют только slug'и | patch |

## Verification

**Commands:**
- `pnpm check` -- зелёный
- `pnpm build && pnpm demo:packed` -- зелёные, негативная сборка отработала
- `pnpm test:e2e` -- зелёный, визуальные эталоны без изменений
- `pnpm check:api-breaking --base origin/main` -- поверхность `modules` появилась как добавление
