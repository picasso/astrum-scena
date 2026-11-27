---
title: 'Категории и виды таксономии из конфига'
type: 'feature'
created: '2026-11-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '8104460f074db04ed4ecd3d8f8eac8daea59569a'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** перечни таксономии зашиты в `lib/content/schemas.ts` под сайт №1: категория альбома
`series|places`, виды мест `country|region|locality` (ранги — `PLACE_KIND_RANK`), виды тегов
`subject|condition|motif|moment|technique`. Сайт с другой таксономией (№2 — страны и темы, №3 — события)
их не задаст, а первый сайт в 9.3 закрепит набор сайта №1 (критерий 6.11 №1, AD-5).

**Approach:** `site.yaml` `content.taxonomy` — `categories`, `placeKinds`, `tagKinds` с умолчаниями ядра
(нынешний набор); эффективные значения пишутся в lock, схемы альбомов и словарей, `check content` и
помощники `/add-album` строятся от них. Ранг вида места — позиция в `placeKinds`, корень — первый вид.

**Decisions (владелец, 2026-11-25):**
- Категории объявляются списком ID в `content.taxonomy.categories`; метки остаются в `categories.yaml`,
  который перечисляет ровно объявленные категории — расхождение в любую сторону ошибка.
- История делится: 6.11a — эта спека; 6.11b — негеографическое измерение (форма выбрана: объявление
  `content.taxonomy.dimensions.<id>`, плоский словарь `src/content/config/<id>.yaml`, ссылки фото
  `dimensions: { <id>: [ids] }`, метки на странице фото) и собственный набор демо (критерии 6.11 №2–3).

## Boundaries & Constraints

**Always:**
- Без `content.taxonomy` эффективные перечни равны нынешним; вывод демо и сайта №1 не меняется, хеш
  изображений прежний, визуальные эталоны не обновляются (AD-7).
- Значение вне перечня — ошибка с путём к файлу и полю и списком допустимых; пустой перечень, повтор
  или не-kebab-case ID — ошибка `site.yaml` с путём.
- Литералы умолчаний перечней в `packages/core/src` — только в слое конфига.
- Снапшоты API обновлены в этой же правке; ломающие по `check:api-breaking` изменения описаны в
  `UPGRADING.md` и `CHANGELOG.md`; изменённая форма файла сайта поднимает его `schemaVersion`.
- ADR-0007, `docs/07-taxonomy.md` и skill `add-album`: `series|places` и списки видов — умолчания
  ядра, сайт задаёт свои.

**Never:**
- Не менять GPS-зоны мест (`place-gps-bounds.yaml`, `cli/images/gps-place.ts`).
- Не добавлять измерения, фильтры, маршруты или sitemap по категориям; не менять набор демо (6.11b).
- Не трогать формы локализованных данных и каталог локалей (6.10).

## I/O & Edge-Case Matrix

| Сценарий | Вход | Результат |
|---|---|---|
| Умолчания | `content.taxonomy` нет | перечни ядра; lock содержит их явно |
| Свои категории | `categories: [journeys, studies]`, `categories.yaml` с ними | альбом `category: studies` принят; `series` — ошибка со списком |
| Словарь расходится | `categories: [journeys]`, в `categories.yaml` ещё `studies` | ошибка `categories.yaml` с путём и ID |
| Свои виды мест | `placeKinds: [land, spot]` | `land` без `parentId`; `spot` требует родителя ранга ниже |
| Чужой вид | `places.yaml` `kind: country` при `placeKinds: [land, spot]` | ошибка с путём `places[i].kind` и списком |
| Свои виды тегов | `tagKinds: [mood]`, `proposeTag` с `kind: mood` | тег принят; `kind: subject` — ошибка |
| Пустой перечень | `tagKinds: []` | ошибка `site.yaml` `content.taxonomy.tagKinds` |

</frozen-after-approval>

## Code Map

- `config/site-schema.ts:470-500` (`contentConfigSchema`) — раздел `taxonomy` с умолчаниями (образец
  `.default()`/`.prefault({})` из 6.4b2); константы умолчаний — в слое `config/**`; `demo/site.lock.yaml`
  через `config resolve`.
- `lib/content/schemas.ts:242,322-372,467` — `albumSchemaFor`, `categorySchemaFor`, `placeSchemaFor`,
  `tagSchemaFor`, `*ConfigSchemaFor` принимают перечни рядом с `locales`; типы `Category`/`Place`/`Tag`
  — `id`/`kind` строкой. Проверка «словарь категорий = объявленные» — в схеме `categories.yaml`.
- `lib/content/files.ts:150-200` — `lockedLocales` — образец чтения lock (`loadSiteSection(root,
  'content')`); загрузчики словарей берут перечни так же.
- `collections.ts:54` — `albumSchemaFor` с перечнями из lock (локали там уже есть).
- `lib/content/integrity.ts:260-284` — проверка `category` альбома уже есть; сообщения со списком.
- `lib/content/taxonomy-resolve.ts:18,156-214` — `PLACE_KIND_RANK` → позиция в `placeKinds`;
  `proposePlace`/`proposeTag` получают перечни (как `TaxonomyLocales`).
- `scripts/lib/api-surface.ts:49-52,136-138` — снапшот схем от умолчаний; `api-snapshot/*.json`.
- `eslint.config.mjs:49-65,167,252` — по образцу `localeLiterals` запрет литералов умолчаний перечней
  вне `config/**` (кроме тестов и фикстур); тест `scripts/eslint-config.test.ts`.
- Не трогать: `cli/images/gps-place.ts`, `place-gps-bounds.ts` (читают только `id`/`parentId`).
- Тесты с литералами: `lib/content/{schemas,integrity,files,taxonomy-resolve}.test.ts`,
  `lib/portfolio/*.test.ts`, `blocks/*/test-fixtures.ts`, `cli/images/test-fixtures.ts` — на
  умолчаниях остаются как есть.
- Документы: `packages/core/skills/add-album/SKILL.md:32-132`, `docs/adr/0007-photo-taxonomy.md`,
  `docs/07-taxonomy.md`, `packages/core/README.md` (конфиг сайта), `UPGRADING.md`, `CHANGELOG.md`.

## Tasks & Acceptance

**Execution:**
- [x] `config/site-schema.ts` и умолчания — `content.taxonomy` с проверками матрицы; lock демо.
- [x] `schemas.ts`, `files.ts`, `collections.ts`, `integrity.ts`, `taxonomy-resolve.ts` — перечни из
  lock или аргументом.
- [x] Правило ESLint и его тест; тесты матрицы (`config`, `lib/content`).
- [x] Снапшоты API, `UPGRADING.md`, `CHANGELOG.md`, README, skill `add-album`, ADR-0007,
  `docs/07-taxonomy.md`.
- [x] `sprint-status.yaml` — ключ `6-11a-enumerations-from-config`, `6-11-…` — `in-progress`;
  запись 6.11b в `deferred-work.md` остаётся открытой.

**Acceptance Criteria:**
- [x] Тест `lib` собирает схемы альбома, категорий, мест и тегов с перечнями вне умолчаний и
  проверяет помощники `/add-album` с рангом из `placeKinds`.
- [x] В `packages/core/src` вне `config/**`, тестов и фикстур нет литералов умолчаний перечней
  (правило ESLint, проверено тестом конфига).
- [x] `check:api-breaking --base origin/main` и `check:upgrading` проходят.

## Implementation Notes

- `config/taxonomy.ts` — `DEFAULT_TAXONOMY` и `taxonomyConfigSchema` (`content.taxonomy` с умолчаниями,
  пустой список, повтор и не-kebab-case ID — ошибка с путём); lock демо хранит три списка явно.
- Схемы `albumSchemaFor`, `categorySchemaFor`, `placeSchemaFor`, `tagSchemaFor` и `*ConfigSchemaFor`
  принимают списки после `locales`; `categories.yaml` метит ровно объявленные категории; `places.yaml`
  проверяет ранги `placeKinds` (корень без родителя, иначе родитель ранга ниже) — после ревью.
- `PLACE_KIND_RANK` удалён: ранг — индекс в `placeKinds`; помощники принимают `TaxonomySite`.
- ESLint: запрет литералов умолчаний и импорта `DEFAULT_TAXONOMY` вне `config/**`, тестов и фикстур,
  со своими исключениями (словари и манифесты модулей им не исключены).
- `check:api-breaking` считает ломающими `site.content.taxonomy` в lock и новые проверки
  `categories.yaml` и `places.yaml`; все описаны в `UPGRADING.md` и `CHANGELOG.md`. `schemaVersion`
  файлов не поднят: поля не менялись, новое — правила проверки (журнал ревью, №5).
- Вывод демо не изменился (сравнение `demo/dist` с базой: только uid островов и метка `/status/`).
  Исходный сайт ещё на старой раскладке — пробной сборки нет; его 17 мест соответствуют правилу
  рангов, а таксономия — умолчаниям ядра.
- Прогоны после ревью: `pnpm check` (2544 теста), `pnpm build`, `pnpm demo:packed`,
  `check:api-breaking --base origin/main`, `check:upgrading`, `pnpm test:e2e:docker` (470 прошли,
  60 пропущены, PNG без изменений) — зелёные.

## Spec Change Log

## Review Triage Log

### Проход 1 (Codex)

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|---|
| 1 | blind, edge, vgap | `places.yaml` и `check content` принимают иерархию против рангов `placeKinds` (корень с родителем, `spot` без родителя, родитель того же ранга) | medium | Подтверждено: правило рангов только в `proposePlace`, схема делает `parentId` необязательным, `integrity.ts:216` проверяет лишь существование и циклы; 17 мест исходного сайта правилу соответствуют | patch |
| 2 | blind | Категория-дата `2026-11-25` проходит CLI, но Astro читает её как `Date` | low | Реально, но ID категорий — kebab-case-слова из `site.yaml`, дата-подобный ID в обычной работе не встречается, а правка — отдельная ветка разбора YAML-скаляров | отклонено |
| 3 | blind, edge, vgap | `String(issue.input)` в `enumerationOf` бросает на отображении `{toString: null}` | low | Подтверждено слоем vgap запуском; правка — прямая замена форматирования | patch |
| 4 | blind, edge | Схема `categories.yaml` принимает повтор строки категории | false | Повторы ловит `checkUniqueDictionaryIds('categories', …)` (`integrity.ts:260`) в `check content`, как и до правки; схема словаря повторы не проверяла и в базе | отклонено |
| 5 | blind, vgap | Lock требует `content.taxonomy`, а `categories.yaml` — полный список, без подъёма `schemaVersion` | false | Поля `categories.yaml` не менялись (форма `schemaVersion: 2` та же), новое — правило проверки, описанное в `UPGRADING.md`; lock генерируется `config resolve`, отсутствие раздела — ошибка `site.content.taxonomy: missing; run astrum-scena config resolve`, как с `content.catalog` в 6.10c (`a4c3c32`) без подъёма версии lock | отклонено |
| 6 | blind | `UPGRADING.md` не объясняет правку альбомов, `kind` и `parentId` после смены списков | false | Сайт без `content.taxonomy` получает умолчания (`config/taxonomy.ts`) — контент не меняется; свои списки — новая возможность, не переход | отклонено |
| 7 | blind, edge | Skill `add-album` называет ключи lock `content.taxonomy.*` вместо `site.content.taxonomy.*` | low | Подтверждено `SKILL.md:63-68`; правка текста | patch |
| 8 | blind | `docs/08-content-model.md` перечисляет `series \| places` и виды как фиксированные | low | Подтверждено; правка текста | patch |
| 9 | blind | README выдаёт `site-files.json` за схему файлов сайта, а таксономия там по умолчанию | low | Подтверждено `api-surface.ts` (`DEFAULT_TAXONOMY`); одна фраза | patch |
| 10 | blind, edge | Правило литералов наследует `LOCALE_EXEMPT` с `i18n/dictionaries.ts` и `modules/*/manifest.ts` | low | Подтверждено `eslint.config.mjs:103-110`; шире, чем критерий «вне `config/**`, тестов и фикстур» | patch |
| 11 | blind | Импорт `DEFAULT_TAXONOMY` вне слоя конфига не запрещён | medium | Подтверждено: для каталога локалей есть `catalogImport`, для таксономии аналога нет — инвариант обходится импортом | patch |
| 12 | blind, edge | `loadTaxonomyConfig(siteRoot)` на странице фото повторно читает lock, хотя `config.content` передан | low | Подтверждено `photo-page.ts:85`; прямая передача аргументов | patch |
| 13 | blind, vgap | `check content` не проверен на сайте со своими списками | medium | Пробел подтверждён слоем vgap (`content-commands.test.ts:81` — только умолчания демо) | patch |
| 14 | blind, vgap | Коллекция альбомов Astro не проверена со своими категориями | medium | Пробел подтверждён слоем vgap (`collections.test.ts:62` — только `series`) | patch |
| 15 | vgap | Гейт GPS-зон не проверен со своими видами мест | medium | Пробел подтверждён слоем vgap (`place-gps-bounds.test.ts:81` — умолчания) | patch |
| 16 | blind, vgap | Тест `withOneLocale` прошёл бы при сбросе таксономии к умолчаниям | low | Пробел подтверждён слоем vgap (`build-demo-from-pack.test.ts:665` на умолчаниях) | patch |

## Verification

**Commands:**
- `pnpm check` -- зелёный
- `pnpm build` и `pnpm demo:packed` -- зелёные
- `pnpm check:api-breaking --base origin/main` и `pnpm check:upgrading` -- зелёные
- `pnpm test:e2e:docker` -- зелёный, PNG без изменений

**Manual checks:**
- Реальный конфиг исходного сайта: если `$REFERENCE_SITE_ROOT` уже на раскладке `site.yaml` — пробная
  сборка только для чтения без изменений вывода; иначе, как в 6.10c, путь покрыт тестом умолчаний.
