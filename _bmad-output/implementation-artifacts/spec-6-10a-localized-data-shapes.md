---
title: 'Формы данных по локалям из конфига'
type: 'feature'
created: '2026-11-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '6e7cdbc82674b0d5f9b701c90c8752c03f43930c'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** локализуемые данные сайта жёстко имеют форму `{en, ru}` (`localizedTextSchema` в фото,
альбомах, таксономии и `featured/home.yaml`, `privacy.controller.name`, `seo.description`, умолчания
заголовков `note`/`links`), поэтому одноязычный сайт обязан заполнять вторую локаль (AD-6, запись 4.2
в `deferred-work.md`).

**Approach:** каждое локализуемое поле — запись ровно по активным `content.locales` из lock: лишняя
или пропущенная локаль — ошибка с путём. Коллекции и файлы таксономии валидируются схемами, которые
строятся от списка локалей; умолчания заголовков `note`/`links` переходят в словари ядра.

**Decisions (владелец, 2026-11-23):**
- История 6.10 разделена: 6.10a — формы данных (критерии 1 и 6), 6.10b — одноязычный сайт
  (переключатель, `hreflang`, `/status/`, сборка демо с одной локалью, e2e), 6.10c — каталог локалей
  из конфига (`LOCALE_CATALOG`, `SERVICE_COPY_LOCALE`, `CHAR_WIDTH_PX`, третья локаль).
- Версии поднимаются, хотя данные двуязычного сайта на диске не меняются: `site.yaml` 3→4,
  коллекции `photos` и `albums` в lock 1→2, `categories.yaml`, `places.yaml`, `tags.yaml` и
  `featured/home.yaml` 1→2; старая версия — ошибка с подсказкой. `UPGRADING.md`: двуязычному сайту
  менять только номера, одноязычный убирает ключи лишней локали.
- Подписи `site.yaml` (`identity`, `menu`, `social` и прочие поля `localizedLabelSchema`) тоже
  строгие: локаль вне `content.locales` — ошибка.
- (владелец, 2026-11-25, после ревью Codex) Критерий «нет ключей `en`/`ru`» охраняет правило ESLint
  `localeLiteral`: ключи и чтение `.en`/`.ru` запрещены вне `config/**`, объявлений поставляемых
  словарей (`i18n/dictionaries.ts`, `modules/*/manifest.ts`) и тестов. Ради него `CHAR_WIDTH_PX`
  переезжает в `LOCALE_CATALOG` как статичное поле `charWidthPx` с прежними значениями; вывод
  каталога из конфига остаётся за 6.10c.

## Boundaries & Constraints

**Always:**
- Список локалей берётся из `content.locales` lock (один загрузчик `loadSiteSection`); вычисления
  получают его аргументом, не читают файлы сами.
- Сообщение об ошибке называет файл, путь поля и локаль: `title.ru: not one of content.locales [en]`,
  `title.ru: missing the "ru" text required by content.locales`.
- Пустая строка в обязательном поле (`title`) — ошибка в любой активной локали, как сейчас для обеих.
- Двуязычные данные демо и реального сайта проходят без правки, кроме номеров версий.
- Хеш изображений (`IMAGE_DIGEST_PROJECTION`) не меняется; `pnpm check`, `pnpm build`,
  `pnpm demo:packed` зелёные; снапшот `site-files.json` и `i18n.json` обновлены в этой же правке.

**Never:**
- Не выводить из конфига `LOCALE_CATALOG`, тип `Locale`, `localeSchema`, `SERVICE_COPY_LOCALE`,
  `charWidthPx`, регулярки путей (6.10c); не трогать переключатель, `hreflang`, `/status/`, демо с
  одной локалью (6.10b).
- Без отката на другую локаль при чтении текста: отсутствие — ошибка, как в `localizedLabel`.
- Без отдельного скрипта перехода: правка — только номера версий.

## I/O & Edge-Case Matrix

| Сценарий | Вход | Результат |
|---|---|---|
| Две локали | `locales: [en, ru]`, `title: {en, ru}` | валидно, вывод сборки прежний |
| Одна локаль | `locales: [en]`, `title: {en}` | валидно |
| Лишняя | `locales: [en]`, `title: {en, ru}` | ошибка: путь `title.ru` |
| Пропущенная | `locales: [en, ru]`, `alt: {en}` | ошибка: путь `alt.ru` |
| Необязательное поле | `locales: [en]`, `alt` отсутствует | валидно |
| Подпись конфига | `locales: [en]`, `menu.items[0].label: {en, ru}` | ошибка `site.yaml` с путём |
| Старая версия | `tags.yaml` `schemaVersion: 1` | ошибка с поддерживаемыми версиями и подсказкой |

</frozen-after-approval>

## Code Map

- `packages/core/src/lib/content/schemas.ts:54-59` — `localizedTextSchema` `{en, ru}`; поля фото
  (:199-205), альбомов (:246-253), таксономии (:328-369, версии :354/:361/:368), `featuredInlineCopySchema`
  (:373-381), `featuredConfigSchema` (:447). Три `refine` с `value.en.trim() && value.ru.trim()`.
  Типы `LocalizedText`, `PhotoData`, `AlbumData`, `Place`, `Tag` (:462-473) используются по ядру.
- Образец: `config/localized-label.ts` (`partialRecord` + `localizedLabel`) и `superRefine` в
  `config/site-schema.ts:634-645` (`requireLocales` — только пропуск; добавить лишнюю локаль);
  `schemaVersion: z.literal(3)` — `site-schema.ts:564`.
- `config/privacy.ts:10`, `config/seo-schema.ts:10` — inline `{en, ru}` → `localizedLabelSchema` с
  проверкой полноты в `superRefine` сайта.
- `collections.ts:37` — `defineCoreCollections()` читает только `modules`; добавить чтение `content`
  и схемы `photos`/`albums` от локалей. Тип `CoreCollections` выводится из схем — держать его
  стабильным (тип фабрики).
- `lib/content/files.ts:191-192` — `loadDataEntries(..., albumSchema/photoSchema)` для CLI; места
  чтения `categories/places/tags.yaml` и `featured/home.yaml` (`lib/featured.ts`, `lib/portfolio/taxonomy.ts`)
  — тоже получают локали.
- `cli/images/photo-yaml.ts:6` — порядок ключей из `photoSchema.shape`; сохранить.
- `lib/content/taxonomy-resolve.ts:91,98,119,154,174` — ключи поиска по `.en/.ru`, `assertLocalized`,
  slug от `.en`: перейти на все активные локали, slug — от опорной локали.
- `lib/portfolio/locale.ts:1-10` — `pickLocale`/`pickOptional`: тип записи по локалям, отсутствие
  обязательного текста — ошибка.
- `lib/blocks/note/plugin.ts:14-17,112`, `lib/blocks/links/plugin.ts:15-18,181` — умолчания
  заголовков → ключи словарей ядра `i18n/en.json`, `ru.json` (и типы `UIKey`), чтение через
  `i18n/ui.ts`.
- `config/lock.ts:67` — `COLLECTION_VERSIONS`: `photos`, `albums` → `[2]`.
- Данные демо: `demo/site.yaml` (комментарии «schema still requires both» в :20 и у `seo`),
  `demo/site.lock.yaml` (через `config resolve`), `demo/src/content/config/*.yaml`, `featured`.
- Фикстуры: `config/fixtures/site-config.ts`, `lib/blocks/*/test-fixtures.ts`; тесты, пинящие форму.
- Снапшоты `packages/core/api-snapshot/site-files.json`, `i18n.json` (`pnpm api:snapshot`);
  `UPGRADING.md` `[Unreleased]`; `CHANGELOG.md`. Критерии 6.10 в `epics.md` не меняются: разделение
  их не сужает.

## Tasks & Acceptance

**Execution:**
- [x] `lib/content/schemas.ts`, новый модуль записи по локалям — фабрика `localizedText(locales, {required})`
  и схемы фото, альбомов, таксономии, featured от списка локалей; версии таксономии и featured → 2.
- [x] `config/site-schema.ts`, `privacy.ts`, `seo-schema.ts`, `localized-label.ts` — строгая
  проверка (пропуск и лишняя) для всех подписей; `schemaVersion` 4.
- [x] `collections.ts`, `lib/content/files.ts`, загрузчики таксономии и featured, `config/lock.ts` —
  схемы от `content.locales`, версии коллекций 2.
- [x] `taxonomy-resolve.ts`, `portfolio/locale.ts`, блоки `note`/`links` + словари — без ключей
  `en`/`ru`.
- [x] Тесты матрицы (фабрика, `site.yaml`, загрузка коллекций и таксономии, `note`/`links` с
  умолчанием из словаря); фикстуры и демо на новые версии.
- [x] `UPGRADING.md`, `CHANGELOG.md`, снапшоты API; запись 4.2 в `deferred-work.md` — `partial_by`.

**Acceptance Criteria:**
- Given демо с `[en, ru]`, when собрано, then HTML совпадает с прежним (e2e и визуальные эталоны
  зелёные).
- Given `pnpm check:upgrading` и `check:api-breaking --base origin/main`, when запущены, then проходят.
- Given `packages/core/src` без тестов и фикстур, when ищем ключи `en:`/`ru:` и `.en`/`.ru` в
  локализуемых данных, then их нет вне `config/locale-schema.ts`.

## Implementation Notes

- Новый модуль `config/localized-text.ts`: `localeCoverageIssues` (лишняя локаль, затем пропущенная),
  фабрика `localizedText(locales, { required })`, чтение `localizedTextIn` без отката. Схемы данных —
  фабрики `*SchemaFor(locales)`; тип `CoreCollections` называет `AlbumSchema`/`PhotoSchema` (форма та
  же), `check:api-breaking` это отмечает, запись в `UPGRADING.md`.
- Умолчания `note`/`links` — ключи `note.title`, `links.title` словарей; плагины стали фабриками,
  интеграция кормит их из `loadDictionaries` (не `i18n/ui.ts`: тот импортирует виртуальный модуль,
  недоступный Node при загрузке конфига). Побочно сайт может переопределить эти заголовки словарём.
- Slug предложения таксономии — от опорной локали, а если её текст не даёт slug (кириллица на сайте с
  опорной `ru`), от первой активной локали, которая даёт. Производственных вызовов у помощников нет.
- Переход для сайта: resolve сохраняет версии коллекций из lock, поэтому `collections.albums`/`photos`
  в `site.lock.yaml` поднимаются до 2 вручную перед `config resolve` — это в `UPGRADING.md`.
- Классификатор API видит переход `{en, ru}` → запись по локалям как ~60 ломающих имён; все
  перечислены в `UPGRADING.md` и `CHANGELOG.md`, потому что `check:api-breaking` сверяет точные имена.
- Критерий о ключах: вне `locale-schema.ts` остаются `CHAR_WIDTH_PX` (`album-intro.ts`, 6.10c) и
  комментарий в `localized-glob.ts`.
- «HTML прежний» проверен сборкой базового коммита во временном worktree и сравнением `dist`:
  различаются только `uid` двух `astro-island` (от пути сборки) и метка времени `/status/`.
- Прогоны: `pnpm check` (206 файлов, 2498 тестов), `pnpm build`, `pnpm demo:packed`,
  `pnpm test:e2e:docker` (470 прошли, 60 пропущены, эталоны без изменений), `check:upgrading`,
  `check:api-breaking --base origin/main` — зелёные.

- Второй проход ревью (Codex, 2026-11-24/25): правило ESLint `localeLiteral` расширено на ключи и
  чтение `en`/`ru` (тест в `scripts/eslint-config.test.ts`), `CHAR_WIDTH_PX` → `LOCALE_CATALOG.charWidthPx`
  по решению владельца. Попытка читать словари ядра по локали через `readFileSync` уронила
  `astro build` (JSON нет рядом с чанком в `dist/.prerender`) и откатана; объявления словарей
  исключены из правила. Повторно: `pnpm check` (2504 теста), `pnpm build`, `pnpm demo:packed`,
  `check:api-breaking`, `pnpm test:e2e:docker` (470 прошли, 60 пропущены) — зелёные.

## Spec Change Log

## Review Triage Log

### Проход 1

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|---|
| 1 | edge, blind | Ключ вне каталога (`de`, опечатка `enn`) даёт `Unrecognized key` с путём поля, а не `title.de: not one of content.locales` | low | Воспроизведено ревьюером; ошибка всё же называет ключ и поле, а единый формат требует ключей-строк и смены типа `LocalizedText` | отклонено |
| 2 | edge | `referenceLocale` вне `locales` в `idBase` — `TypeError` | false | `contentConfigSchema` требует опорную локаль из `locales`; производственных вызовов нет | отклонено |
| 3 | edge | Прочие `SlugError` молча переводят id на другую локаль | false | Из достижимых `slugifyFromTitle` бросает только «нет символов для slug» (`maxWords` по умолчанию) | отклонено |
| 4 | edge | Правка `note.title`/`links.title` в словаре сайта не подхватывается dev-сервером без перезапуска | low | Реально: словари читаются в `astro:config:setup`; только dev, правка редкая, исправление — ленивое чтение или перезапуск | отклонено |
| 5 | edge, vgap | `assertValidRepositoryContent` по умолчанию берёт `SUPPORTED_LOCALES` и теперь передаёт их в `loadContentSnapshot` | low | Единственный вызов передаёт локали; исправление — прямая замена умолчания на `lockedLocales(root)` | patch |
| 6 | edge | `resolvePhotoDisplayName` бросает вместо отката на подпись | false | `title` обязателен во всех активных локалях после валидации | отклонено |
| 7 | vgap | `projectAlbumText().excerpt` (карточки, meta description альбома) не проверен ни одним тестом | medium | Заявлено слоем с доказательствами: фикстуры без `excerpt`, `toEqual` игнорирует `undefined` | patch |
| 8 | vgap | `defineCoreCollections` проверен на одной локали только для `photos`, не для `albums` | medium | Заявлено слоем; демо двуязычное | patch |
| 9 | vgap | Порядок «сначала опорная локаль» в `idBase` не отличим тестами | low | Заявлено слоем; тест — одно прямое добавление | patch |
| 10 | blind | `docs/blocks/note.md`, `links.md` описывают жёсткие таблицы `ru`/`en` и имена `x.ru.md`/`x.en.md` | medium | Проверено: строки 66-69 и 85-88; нет ключей словаря, переопределения и новой ошибки | patch |
| 11 | blind | Загрузчики по умолчанию читают lock, вопреки Always | false | Правило — о вычислениях; загрузчики и так читают файлы сайта (IO-адаптеры) | отклонено |
| 12 | blind | Критерий о ключах противоречит заметкам (`CHAR_WIDTH_PX`) | low | Исправление — правка спека | отклонено |
| 13 | blind | `sprint-status.yaml` отстаёт от статуса спека, нет ключей 6.10b/c и отметки частей в `epics.md` | low | Статус синхронизирует шаг 5; ключи частей появляются при их спеках, как у 6.9 | отклонено |
| 14 | blind | Заголовки `UPGRADING.md` и пункт `CHANGELOG.md` — списки ~60 имён снапшота | medium | Реально; форму навязывает точное сравнение имён в `check:api-breaking` (6.3c), исправление — менять гейт (префиксы) | defer |
| 15 | blind | Пример «После» `tags.yaml` в `UPGRADING.md` не показывает одну локаль; нет примеров альбома и `copy` | low | Проверено; прямая правка текста | patch |
| 16 | blind | `categories[].label`, `places[].name`, `tags[].label`, `copy.description` допускают пустую строку | low | Было так и до правки (`localizedTextSchema` — `z.string()`) | defer |
| 17 | blind | Нет теста переопределения `note.title` словарём сайта; `index.test.ts` сверяет только имена плагинов | medium | Обещано в `CHANGELOG.md`, не проверено | patch |
| 18 | blind | Тест «Тоскана» проходил бы и до правки | low | Верно: старые ключи уже включали `name.ru`; замена на запись с одной локалью — прямая | patch |
| 19 | blind | Три имени одного чтения (`localizedTextIn`, `localizedLabel`, `pickLocale`) | low | Алиасы без расхождения поведения; объединение — рефакторинг | отклонено |
| 20 | blind | `add-album/SKILL.md` не описывает новое правило id | low | Skill задаёт правило агенту сам и не вызывает помощников без производственных вызовов; правило «как у фото» не изменилось | отклонено |
| 21 | blind | Два комментария `taxonomy-resolve.ts` шире 100 колонок | low | Проверено; прямая перекладка строк | patch |

### Проход 2 (Codex, после восстановления личных настроек BMAD)

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|---|
| 22 | blind | Словари для `note`/`links` читаются один раз в `astro:config:setup`; в `astro dev` правка переопределения не доходит до заголовков | low | carried: строка 4 — `index.ts:185` грузит словари при настройке, правка только в dev и редкая, исправление — инвалидация контента по файлу словаря | отклонено |
| 23 | blind | Ключ вне каталога (`de`) отвергается до проверки покрытия, без пути `title.de` | low | carried: строка 1 — сообщение Zod называет ключ и поле; единый формат требует ключей-строк и смены типа `LocalizedText` | отклонено |
| 24 | blind | Предложение места или тега невозможно для имени только по-русски (`Сумерки`): ни одна локаль не даёт латинского slug | low | `idBase` бросает `TaxonomyProposalError` с понятным текстом; `proposePlace`/`proposeTag` не вызываются ни из `packages/`, ни из `scripts/` (поиск по именам), skill `add-album` назначает id сам; исправление — новый параметр | отклонено |
| 25 | blind | Правило id в `idBase` расходится с `add-album/SKILL.md` | low | carried: строка 20 — skill не вызывает помощники, его правило не менялось | отклонено |
| 26 | blind | Подписи таксономии принимают пустую строку | low | carried: строка 16 — так было до правки, запись уже в `deferred-work.md` | defer (уже записано) |
| 27 | blind | Шаг Verify записи `UPGRADING.md` не читает `featured/home.yaml`: `check content` и `check config-lock` его не загружают, ошибка всплывёт только при сборке | medium | Проверено: вывод `check content` — альбомы, фото, статьи, страницы, курсы, без `featured`; `UPGRADING.md:198-200` не требует сборки | patch |
| 28 | blind | `UPGRADING.md` велит поднять версию «в четырёх файлах», хотя `featured/home.yaml` необязателен | low | Проверено `UPGRADING.md:190`; сайт без слайдера встретит это при переходе, правка — прямая формулировка | patch |
| 29 | blind | `UPGRADING.md:89` говорит, что resolve пишет `schemaVersion: 4` в lock, не называя поле `site.schemaVersion` (у lock своя версия `1`) | low | Проверено; правка — одно слово | patch |
| 30 | blind | `packages/core/README.md:554` указывает `2` для `site.yaml` и `1` для остальных файлов | medium | Проверено: теперь `site.yaml` 4, таксономия и `featured` 2; README — опубликованное описание API | patch |
| 31 | blind | Переопределение `links.title` словарём сайта не проверено через интеграцию (тест есть только для `note.title`) | low | Проверено `index.test.ts`; у `links` отдельная строка подключения в `index.ts`; тест — прямое добавление | patch |
| 32 | vgap | `loadContentSnapshot` не проверен на одноязычных альбоме и фото | medium | Заявлено слоем с доказательствами: `files.test.ts:43` двуязычный, `:279` без альбомов и фото | patch |
| 33 | правило invariant-gates | Критерий «нет ключей `en:`/`ru:` и `.en`/`.ru` вне `config/locale-schema.ts`» не охраняется автоматической проверкой | medium | `eslint.config.mjs:49-54` (`localeLiteral`) ловит только строковые литералы `'en'`/`'ru'`, не ключи объектов и не доступ к свойству; 6.10b/6.10c могут вернуть ключи незаметно. `CHAR_WIDTH_PX` (`album-intro.ts:29`) нарушает критерий | patch |

## Verification

**Commands:**
- `pnpm check` — зелёный, со снапшотами API.
- `pnpm build` и `pnpm demo:packed` — зелёные.
- `pnpm test:e2e:docker` — функциональные и визуальные спеки без изменений эталонов.
- `pnpm check:api-breaking --base origin/main` — находит ломающие изменения и их записи в `UPGRADING.md`.
