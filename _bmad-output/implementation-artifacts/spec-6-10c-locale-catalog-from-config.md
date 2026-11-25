---
title: 'Каталог локалей из конфига'
type: 'feature'
created: '2026-11-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '3c7427f9f60c48751dbb90450011a24bb82bc404'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** набор локалей ядра зашит в `config/locale-schema.ts`: `LOCALE_CATALOG` с `en`/`ru`
(script, ogLocale, intl, charWidthPx), тип `Locale = keyof LOCALE_CATALOG`, `localeSchema = z.enum`,
регулярки `LOCALE_FILE_PATTERN`/`LOCALE_PATH_PREFIX`, `SERVICE_COPY_LOCALE = 'en'`. Сайт на третьем
языке не может даже объявить локаль (критерий 6.10 №2 и часть №5, AD-6).

**Approach:** каталог — умолчание ядра (`en`, `ru`) с переопределением и дополнением в `site.yaml`
`content.catalog`; эффективный каталог пишется в lock и читается всеми потребителями из конфига.
`Locale` становится строкой кода локали, `localeSchema` проверяет формат, принадлежность —
проверки против `content.locales` и каталога; регулярки строятся от списка локалей или принимают
любой код с последующей проверкой.

**Decisions (владелец, 2026-11-25):**
- `SERVICE_COPY_LOCALE` остаётся константой ядра в слое конфига (`config/locale-schema.ts`), без
  настройки сайта: язык `/status/` — свойство английского текста ядра. Запись каталога для него
  обязательна, поэтому lock одноязычного `ru`-сайта содержит и `en`. Критерий 6.10 №2 в `epics.md`
  уточняется в этой же правке.
- Спек остаётся целиком, несмотря на размер (~2700 токенов).
- Только каталог: конфиг принимает локаль вне en/ru (тест `lib`), но сборка сайта на третьем языке
  (ключи `language.<code>` от конфига, полный словарь сайта для локали без словаря ядра, словари
  модулей) не делается и отдельной частью не планируется — сайтам пока хватает двух языков, ядро
  доработают, когда третий язык понадобится.

## Boundaries & Constraints

**Always:**
- `site.yaml` `content.catalog.<code>`: для кода из умолчаний — частичное переопределение полей, для
  нового кода — все поля; `script` — только из письменностей, для которых у ядра есть шрифты
  (`latin`, `cyrillic`). Код без записи в эффективном каталоге в `content.locales` — ошибка с путём.
- Lock хранит эффективный `content.catalog` только для нужных локалей (`content.locales` и язык
  служебных страниц); потребители (`theme/fonts.ts`, `html-shell.astro` ogLocale,
  `lib/portfolio/captured.ts` intl, `album-intro.ts` charWidthPx) получают запись каталога из
  конфига или аргументом, без импорта статичного каталога.
- Формат кода локали — `^[a-z]{2,3}$`; литералы `en`/`ru` остаются только в умолчаниях каталога
  внутри `config/**` (исключение правила `localeLiterals`).
- Вывод демо и реального сайта не меняется: `pnpm check`, `pnpm build`, `pnpm demo:packed`,
  `pnpm test:e2e:docker` зелёные без обновления эталонов; хеш изображений прежний (AD-7).
- Снапшоты API обновлены в этой же правке; ломающие изменения по `check:api-breaking` описаны в
  `UPGRADING.md`.

**Never:**
- Без отката на другую локаль и без молчаливого умолчания для неизвестного кода.
- Не менять шрифты и не добавлять письменности.
- Не трогать формы локализованных данных (6.10a) и вывод одноязычного сайта (6.10b).

## I/O & Edge-Case Matrix

| Сценарий | Вход | Результат |
|---|---|---|
| Умолчания | `content.catalog` нет, `locales: [en, ru]` | эффективный каталог = умолчания ядра; вывод прежний |
| Переопределение | `catalog: { en: { ogLocale: en_GB } }` | `og:locale` `en_GB`, прочие поля `en` — умолчания |
| Новая локаль | `catalog: { de: {script: latin, ogLocale: de_DE, intl: de-DE, charWidthPx: 7.4} }`, `locales: [de]` | каталог принят (тест `lib`) |
| Неполная новая | `catalog: { de: { script: latin } }` | ошибка `site.yaml` с путём `content.catalog.de.ogLocale` |
| Код без записи | `locales: [de]` без `catalog.de` | ошибка `content.locales[0]`: нет записи в каталоге |
| Неверная письменность | `catalog: { el: { script: greek, … } }` | ошибка с путём и списком письменностей |
| Неверный формат | `locales: [EN]` | ошибка формата кода |

</frozen-after-approval>

## Code Map

- `packages/core/src/config/locale-schema.ts` — источник всех символов; станет: умолчания каталога,
  схема записи каталога (`script` — enum письменностей шрифтов), `localeCodeSchema`, `type Locale =
  string`, фабрики `localeFilePattern(locales)`/`localePathPrefix(locales)` или общие регулярки по
  формату.
- `config/site-schema.ts:469-486` (`contentConfigSchema`) — `locales`/`referenceLocale` от
  `localeCodeSchema`; новый `catalog` с умолчанием и слиянием (образец умолчаний — `.default()`/
  `.prefault({})` из 6.4b2; срезы `loadSiteSection` применяют те же умолчания).
- Схемы, собираемые при импорте: `config/localized-label.ts:8`, `lib/content/schemas.ts:280`
  (`localizedDocumentBaseSchema` → `articleSchema`, `pageSchema`, `modules/courses/schema.ts:21`),
  `lib/contact/schema.ts:36` (Worker и браузер — без lock: только формат кода). Принадлежность
  документа локали уже проверяет `lib/content/integrity.ts:126`.
- Регулярки при импорте: `LOCALE_FILE_PATTERN` — `lib/content/files.ts:129`, `localized-id.ts:8`,
  `translation-marker.ts:40`, `lib/blocks/note/plugin.ts:46`, `links/plugin.ts:74`;
  `LOCALE_PATH_PREFIX` — `i18n/ui.ts:78,85` (есть `site`), клиентский скрипт
  `components/content/privacy-controller.astro:7` (локали передать из разметки),
  `e2e/footer-promo.spec.ts:73,88`.
- `SUPPORTED_LOCALES`: `index.ts:101` (список наблюдаемых словарей → `content.locales`, доступен у
  `:179-185`), `lib/content/integrity.ts:253` (умолчание параметра → обязательный),
  `cli/images/photo-yaml.ts:8` (порядок ключей при импорте — вычислять лениво),
  `config/fixtures/site-config.ts:371`, `scripts/lib/api-surface.ts:26,128-137` (снапшот — от кодов
  умолчаний каталога).
- Потребители полей каталога: `theme/fonts.ts:1-17`, `layouts/html-shell.astro:68,134`,
  `pages/rights.astro:44`, `lib/portfolio/captured.ts:13`, `album-intro.ts:61`; e2e
  `fonts.spec.ts:4-21,111-119`, `inner.spec.ts:100` — из `demoConfig.content.catalog`.
- `SERVICE_COPY_LOCALE`: `components/status/site-status.astro:52,57`, `pages/status.astro:35`,
  `e2e/fonts.spec.ts:119`.
- Словари: `i18n/dictionaries.ts:32` — `CORE_DICTIONARIES: Record<Locale, …>` → частичная запись
  по кодам ядра; `mergeDictionaries` уже требует полноты (`missing keys`).
- `eslint.config.mjs:47-65` — сообщения правила называют `LOCALE_CATALOG`: заменить на
  `content.catalog`; тест `scripts/eslint-config.test.ts`.
- Снапшоты `packages/core/api-snapshot/site-files.json` (enum `en`/`ru` у ключей локалей),
  `exports.json` (`lang: Locale`); `UPGRADING.md`, `CHANGELOG.md`, `packages/core/README.md` (конфиг
  сайта), `demo/site.lock.yaml` через `config resolve`.

## Tasks & Acceptance

**Execution:**
- [x] `config/locale-schema.ts`, `site-schema.ts`, `loader`/lock — каталог с умолчаниями, слиянием и
  проверками матрицы; `Locale` — строка; формат кода.
- [x] Схемы при импорте и регулярки — от формата или от `content.locales`; Worker — только формат.
- [x] Потребители полей каталога, `index.ts`, `integrity.ts`, `photo-yaml.ts`, словари ядра,
  фикстуры, e2e; `SERVICE_COPY_LOCALE` — константа слоя конфига, его запись каталога обязательна.
- [x] Тесты матрицы (`config`), тест `lib` с `de`; правило ESLint и его тест.
- [x] Критерий 6.10 №2 в `_bmad-output/planning-artifacts/epics.md`: `LOCALE_CATALOG` выводится из
  конфига, `SERVICE_COPY_LOCALE` — константа слоя конфига.
- [x] Снапшоты API, `UPGRADING.md`, `CHANGELOG.md`, README; запись 6.10c в `deferred-work.md` —
  `closed_by`; ключ `6-10c-locale-catalog-from-config` в `sprint-status.yaml`.

**Acceptance Criteria:**
- [x] В `packages/core/src` вне `config/**`, поставляемых словарей и тестов нет импорта
  `LOCALE_CATALOG`/`SUPPORTED_LOCALES` и литералов `en`/`ru` (правило ESLint `localeLiterals` и
  ограничение импорта в `eslint.config.mjs`, проверено тестом конфига).
- [x] `check:api-breaking --base origin/main` и `check:upgrading` проходят.

## Implementation Notes

- `Locale = string`, формат `^[a-z]{2,3}$` (`localeCodeSchema`); `DEFAULT_LOCALE_CATALOG` — умолчания
  ядра, `catalogIssues`/`effectiveCatalog` — проверка и слияние в `contentConfigSchema`; lock держит
  записи `content.locales` и `en` (`SERVICE_COPY_LOCALE`), повторный разбор lock — неподвижная точка.
- `localeEntry(catalog, locale)` бросает без записи; `languageKey(code)` бросает, если у ядра нет
  `language.<code>` (третий язык вне скоупа по решению владельца).
- Вынужденные широким типом: `documentIn(document, locale)` для чтения `byLocale` с ошибкой вместо
  `undefined`; `withOneLocale` (6.10b) пишет эффективный каталог явно.
- Вывод демо: относительно базы различаются только хеш клиентского бандла контактной формы (схема
  проверяет формат кода) и метка времени `/status/`.
- `check:api-breaking` считает переход enum `en`/`ru` → шаблон формата ломающим (~20 имён); все в
  `UPGRADING.md` и `CHANGELOG.md`. На реальном конфиге исходного сайта не проверено: он ещё на старой
  раскладке из трёх файлов; путь перехода покрыт тестом `loader.test.ts`.
- После ревью: правило `catalogImport` ловит и чтение `.DEFAULT_LOCALE_CATALOG` через пространство
  имён; тесты переопределений каталога — `intl` в `buildPhotoPageModel` (`photo-page.test.ts`),
  `charWidthPx` в `AlbumIntro` (`components.test.ts`), `script` в оболочке (`shell.test.ts`).
  Секция `/rights/` с переопределённым `script` тестом не покрыта: страница читает `astro:content`,
  а `rights.astro:44` вызывает тот же `localeScript(site.content.catalog, …)`.
- Прогоны: `pnpm check` (2526 тестов), `pnpm build`, `pnpm demo:packed`, `check:upgrading`,
  `check:api-breaking --base origin/main`, `pnpm test:e2e:docker` (470 прошли, 60 пропущены, PNG без
  изменений) — зелёные.

## Spec Change Log

## Review Triage Log

### Проход 1 (Codex)

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|---|
| 1 | blind, edge | Список наблюдаемых словарей фиксируется при старте dev-сервера; словарь локали, добавленной в lock, не отслеживается | false | Набор локалей и так требует перезапуска: `i18n.locales` Astro задаётся в `astro:config:setup` (`index.ts:195`), а при перезапуске список пересчитывается | отклонено |
| 2 | blind | На `/status/` английский текст получает шрифт письменности локали по умолчанию | false | Поведение прежнее (`html-shell.astro:68` и до правки брал письменность страницы), а семейство `cyrillic` — файлы `ubuntu-v9-cyrillic_latin` с латиницей | отклонено |
| 3 | blind, edge | `catalogImport` ловит только именованный импорт; импорт пространства имён обходит запрет | low | Реально: `import * as l` + `l.DEFAULT_LOCALE_CATALOG` проходит правило, охраняющее критерий; правка — один селектор и тест | patch |
| 4 | blind | `fonts.spec.ts:120` ждёт письменность `SERVICE_COPY_LOCALE` у `/rights/`, сайт с опорной `ru` упал бы | low | Строка была и до правки (база: `localeScript(SERVICE_COPY_LOCALE)`), правка лишь передаёт каталог; e2e идут только на демо | отклонено |
| 5 | blind, vgap | Дата фото не проверена с переопределённым `intl` каталога | medium | Заявлено слоем vgap: `captured.test.ts` передаёт тег напрямую, тестов `buildPhotoPageModel` с каталогом нет | patch |
| 6 | blind, vgap | Мозаика шапки альбома не проверена с переопределённым `charWidthPx` | medium | Заявлено слоем vgap: `album-intro.test.ts` передаёт ширину напрямую | patch |
| 7 | blind, vgap | Шрифты оболочки и секций `/rights/` не проверены с переопределённым `script` | medium | Заявлено слоем vgap: `shell.test.ts:317` и e2e идут на умолчаниях каталога | patch |

## Verification

**Commands:**
- `pnpm check`, `pnpm build`, `pnpm demo:packed` — зелёные.
- `pnpm test:e2e:docker` — зелёный, PNG без изменений.
- `pnpm check:api-breaking --base origin/main` — ломающие изменения описаны в `UPGRADING.md`.
