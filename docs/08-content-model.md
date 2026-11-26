# S8: модель контента и импортный контракт

Канонический исполняемый контракт четырёх Astro Content Collections. Документ продолжает
[таксономию S7](07-taxonomy.md), а решения по legacy-значениям берёт из
карты миграции S7 (репо сайта).

## Коллекции и идентификаторы

`src/content.config.ts` объявляет ровно четыре коллекции через Astro 7 Content Layer API:

| Collection | Формат   | Стабильный entry ID           | Локализация              |
| ---------- | -------- | ----------------------------- | ------------------------ |
| `albums`   | YAML     | имя файла без расширения      | короткие поля по локалям |
| `photos`   | YAML     | имя файла без расширения      | короткие поля по локалям |
| `articles` | Markdown | `${translationKey}-${locale}` | отдельный файл на язык   |
| `pages`    | Markdown | `${translationKey}-${locale}` | отдельный файл на язык   |

Все ID и slug — lowercase ASCII kebab-case. Локализованный файл имеет имя
`<translation-key>.<locale>.md`; filename, `translationKey` и `locale` обязаны совпадать.
`translationKey` — единственный источник pairing identity, а общий `slug` — проверяемый route
invariant. Slug не участвует в построении physical entry ID.

Во время S8 importer создавал только `.md`. В рабочем режиме (ADR-0012) редактор может использовать
`.md` и `.mdx`; loader и проверка имён принимают оба расширения и сохраняют один entry ID.

Короткое локализованное поле (в таблицах ниже — `{ <locale> }`) — запись с текстом ровно на каждую
локаль `content.locales` из `site.lock.yaml`: на одноязычном сайте один ключ. Лишняя локаль или
пропущенная — ошибка с путём поля (`title.ru: not one of content.locales [en]`,
`alt.ru: missing the "ru" text required by content.locales`). Схемы коллекций, таксономии и
`featured/home.yaml` строятся от этого списка (версия 2 у коллекций в lock и у файлов).

## Матрица полей

### Album

| Поле              | Тип                                                | Правило                                                   |
| ----------------- | -------------------------------------------------- | --------------------------------------------------------- |
| `category`        | ID из `content.taxonomy.categories`                | ровно одна объявленная категория                          |
| `title`           | `{ <locale> }`                                     | непустой в каждой локали                                  |
| `description`     | `{ <locale> }`                                     | ключ каждой локали обязателен, пустая строка допустима    |
| `excerpt`         | `{ <locale> }`, optional                           | текст карточки в `details`; пусто → из description        |
| `layout`          | `justified \| masonry \| square \| rect`, optional | режим страницы альбома; нет → site default `album.layout` |
| `status`          | `draft \| published`                               | legacy status не наследуется                              |
| `coverId`         | photo ID                                           | обязан входить в `photoIds`                               |
| `photoIds`        | ordered unique photo IDs                           | единственный persisted источник membership                |
| `source.legacyId` | string, optional                                   | provenance, не публичная taxonomy                         |

Published album может ссылаться только на published photos, включая cover.

### Photo

| Поле                            | Тип                                        | Правило                                            |
| ------------------------------- | ------------------------------------------ | -------------------------------------------------- |
| `title`                         | `{ <locale> }`                             | непустой в каждой локали                           |
| `description`, `caption`, `alt` | `{ <locale> }`, optional                   | короткие локализованные поля                       |
| `status`                        | `draft \| published`                       | единственный источник публичности                  |
| `placeId`                       | place ID, optional                         | самое точное подтверждённое место                  |
| `capturedAt`                    | частичная дата `YYYY \| YYYY-MM`, optional | подтверждённая дата съёмки (см. ниже)              |
| `publishedAt`                   | ISO date/datetime, conditional             | обязательно для `published`                        |
| `colorMode`                     | `color \| black-and-white`, conditional    | обязательно для `published`                        |
| `favorite`                      | boolean                                    | default `false`, только явное редакционное решение |
| `tags`                          | unique controlled IDs                      | default `[]`, порядок семантики не несёт           |
| `media`                         | `MediaDescriptor`, optional                | переходный fixture-контракт до S9                  |
| `source.legacyId`               | string, optional                           | provenance                                         |

`year` и `albumIds` запрещены схемой. Год вычисляется из `capturedAt`, обратная принадлежность —
из `album.photoIds`.

#### `capturedAt`: только частичная дата

`capturedAt` использует отдельную `partialCapturedAtSchema` и хранит строго `YYYY` либо `YYYY-MM`
(с календарной валидацией месяца `01..12`). День, время и timezone не хранятся, полная дата
отклоняется. Это отдельный контракт от общей `isoDateSchema`: `publishedAt` (photo и article)
по-прежнему требует полную дату/datetime и частичные значения не принимает.

Источник истины по году — подтверждённая годовая папка канонического архива
(`<archive-root>/<YYYY>/...`), а не EXIF: реальная проверка нашла ошибочные EXIF-годы. Месяц берётся
из EXIF `DateTimeOriginal` только когда EXIF-год совпадает с folder-year; при отсутствии EXIF или
расхождении годов сохраняется только folder-year. Год фото — первые 4 символа `capturedAt`, одинаково
для `YYYY`, `YYYY-MM` и legacy `YYYY-MM-DD`.

Подтверждённое значение живёт только в `migration/data/s8-content-map.yaml` (`photos[].capturedAt`)
и применяется импортёром до `photoSchema.parse`. Координат оно не несёт.

### Article и Page

| Поле                   | Тип                                | Правило                                                          |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| `translationKey`       | stable ID                          | pairing identity                                                 |
| `locale`               | `en \| ru`                         | совпадает с filename                                             |
| `slug`                 | stable route segment               | общий для pair                                                   |
| `title`                | string                             | локализован в отдельном файле                                    |
| `excerpt`              | string, optional                   | обязателен для будущего featured target                          |
| `status`               | `draft \| published`               | общий для locale pair                                            |
| `publishedAt`          | ISO date/datetime, optional        | Tier-1, только опорная локаль; обязательно для published article |
| `kind`                 | `course`, page only                | Tier-1, только опорная локаль; optional                          |
| `courseStatus`         | `archive \| current`, page only    | Tier-1, только опорная локаль; обязателен при `kind: course`     |
| `coverId`              | photo ID, optional                 | Tier-1, только опорная локаль; обложка документа (ADR-0013)      |
| `translatedFromDigest` | sha256 (64-hex), EN only, optional | durable staleness-маркер (S13)                                   |
| `source.legacyId`      | string, optional                   | Tier-1, только опорная локаль; provenance                        |

Для всех статусов уникальны `{ collection, translationKey, locale }` и
`{ collection, slug }` между logical pairs. Парными (равными в обеих локалях) остаются только `slug`
и `status`; **Tier-1** поля (`coverId`, `publishedAt`, `source`, `kind`, `courseStatus`) — единый источник (ADR-0013):
живут ТОЛЬКО в файле опорной локали (`content.referenceLocale`, здесь `ru`) и запрещены в другой.
Published pair требует RU+EN; draft locale gap допустим только с записью в import report.

`kind` помечает страницы с собственными маршрутами: `course` — курс раздела Courses
(`/{locale}/courses/{slug}/`). У курса обязателен `courseStatus`: `archive` — курс больше не
проводится, `current` — действующий. Integrity на опорной записи требует `courseStatus` при
`kind: course` (`missing-course-status`) и запрещает его без `kind: course`
(`stray-course-status`). `home` и `about` остаются без `kind` и обслуживаются обычными
page-маршрутами.

`translatedFromDigest` (EN-only, S13) — sha256 канонического RU-body на момент перевода или последней
явной проверки владельцем; расхождение с текущим RU честно сигналит, что перевод мог устареть.
Freshness вычисляется единственным helper-ом `src/lib/content/translation-freshness.ts`. Маркер
пишет только `content:translation-marker:confirm --document <collection>/<key> --write`, на том же
helper-е; её вызывают `/translate` после записи перевода и `/validate` после подтверждения владельца.

**Служебная страница `/status/` и presentation boundary (S13).** Свежесть переводов и published-срез
показываются на публичной, но ненавигационной странице `/status/` (`noindex`, вне sitemap), а не
предупреждением внутри материала. Слои строго разделены: **единственная точка настройки её дизайна —
`src/styles/status.css`** (корень `.site-status`, локальные `--status-*`, `data-status`); структура
компонентов (`src/components/status/`) и server-only модель (`src/lib/status/build-data.ts`)
намеренно от неё независимы — правка типографики/разделителей не трогает builder, digest-helper,
image descriptor или route, а правка данных не трогает CSS.

### MediaDescriptor

`assetKey` — kebab-case без extension; `width`/`height` — положительные integers;
`dominantColor` — шестизначный hex. `derivatives.widths` уникальны и строго возрастают,
`formats` — уникальное непустое подмножество `avif | webp | jpg`. S9 заменит переходные fixture
данные manifest-backed metadata без изменения content IDs.

## Справочники

`src/content/config/categories.yaml`, `places.yaml`, `tags.yaml` — ручные, не принадлежащие
импортёру файлы:

- categories: ровно категории `content.taxonomy.categories`;
- places: kind из `content.taxonomy.placeKinds` (от корня иерархии вниз; у первого вида нет
  `parentId`, у остальных родитель с меньшим рангом), циклы запрещены;
- tags: controlled ID и kind из `content.taxonomy.tagKinds`.

Перечни объявляются в `site.yaml` `content.taxonomy`, эффективные значения пишутся в
`site.lock.yaml`. Умолчания ядра: категории `series`, `places`; виды мест
`country | region | locality`; виды тегов `subject | condition | motif | moment | technique`.

Live integrity gate проверяет photo/place/tag/album references против фактически загруженного
snapshot. Featured test fixture проверяется отдельно и не входит в live repository gate S8.

## Derived API

- `buildPublishedMembershipIndex()` (`src/lib/portfolio/publication.ts`) строит photo ID → IDs
  published-альбомов, fail-closed на missing/draft-ссылках;
- `validateContentSnapshot()` (`src/lib/content/integrity.ts`) агрегирует domain diagnostics с entity и field path.

`Recent Works` и `Favorites` не существуют как persisted albums.

## Fixture и mapping

`pnpm content:fixture` читает versioned normalized JSONL и выбирает exact legacy IDs. Builder
фиксирует gallery order:

- `iceland` (`53`) — `[378, 399]`;
- `sunrises-for` (`96`) — `[378, 380, 399, 376, 383, 379, 382, 381]`.

Ручные решения находятся в `migration/data/s8-content-map.yaml`, а
`locationAliases`/`locationDrops` — в `migration/data/taxonomy-aliases.yaml`: importer выбирает единственное самое глубокое место из legacy
evidence, проверяет per-photo override и блокирует неоднозначные или необъяснённые значения. Любой
новый `published` задаётся только явным status и обязательными publication fields в mapping.

Оба provisional cover используют legacy photo `378` с provenance `legacy-gallery-first`, который
разрешается как `good-morning-mordor`. `Recent Works` (`54`) удаляется, а reverse memberships вне
fixture должны быть перечислены явно.

Page-документ может собираться из legacy-статьи, но только при явном `sourceType: article`
(иначе `legacyId` обязан быть `wp:page:`). На этом контракте держались курсы: четыре
`wp:article:` источника дали page-документы `kind: course` (`courseStatus: archive`), а не статьи;
исторический mapping хранит прежнее имя `course-archive`, импортёр нормализует его в `course`.

`englishBody: omit` — явное редакторское решение не переносить EN-тело до настоящего перевода
(S12). Импортёр пишет EN-файл без body, фиксирует `drop` в отчёте и не считает такой документ
кандидатом на review-запись о кириллице. Publish при этом остаётся fail-closed: документ со
`status: published`, у которого в итоговом EN-тексте (title, excerpt, body) осталась кириллица,
завершает импорт ошибкой — так же, как album/photo publish gate (ADR-0009).

Определение кириллицы одно на весь контент-пайплайн и живёт в `src/lib/content/language.ts`:
буквы современного русского алфавита, включая `Ё`/`ё`. Старославянские знаки, расширенные
кириллические диапазоны и буквы соседних языков вне контракта — сайт двуязычный RU/EN, и
усложнять проверку под них незачем. Тот же модуль питает мягкую review-эвристику импортёра,
которая ничего не блокирует, а лишь помечает подозрительный EN в отчёте.

Все legacy-derived entities создаются как draft; WordPress `publish`, даты, favorite и color mode
не наследуются. Legacy body сериализуется как inert Markdown: из исходного HTML переносится
структура — заголовки (`h1`–`h6` прижимаются к `h2`–`h4`), маркированные и нумерованные списки,
`strong`/`em` — и syntactically safe authored links. HTML anchors, существующие Markdown links,
reference links и autolinks извлекаются до sanitization и возвращаются как CommonMark с тем же
destination и порядком occurrences. `img src`, shortcode attributes, script/style и прочие URL в
атрибутах ссылками не становятся.

Небезопасная или malformed destination не создаёт активный link: подпись сохраняется plain text,
а importer пишет typed diagnostic. Shortcodes, images, остальной presentation HTML и
ESM/JSX/expressions срезаются, текст экранируется. Ведущий legacy-заголовок, дублирующий `title`
документа, отбрасывается — его печатает шаблон страницы. Titles и excerpts остаются plain text:
link markup снимается с сохранением подписи, placeholder `[removed-link]` не создаётся. Import
report фиксирует `sourceLinkOccurrences` и `emittedLinkOccurrences`; потеря safe occurrence
блокирует writer. Детали находятся в отчёте импорта S8 (репо сайта).

Translation gate сравнивает RU/EN link nodes по числу, порядку и destination, не сравнивая
переведённые подписи. Рабочая последовательность для новых импортов:

```text
normalize → preserve semantic links → translate with link nodes → materialize
```

Доступность, redirects и редакционная актуальность destinations этим контрактом не проверяются:
владелец запускает отдельный workflow после materialization.

## Ownership и безопасный повторный запуск

Importer управляет только exact paths из mapping-кандидата и sidecar
`migration/data/s8-import-ownership.json`. Для каждого owned файла sidecar хранит canonical source
key и SHA-256 опубликованных байтов.

```text
pnpm content:fixture              # normalized fixture builder (JSONL → representative.json)
pnpm content:fixture:check        # его drift-check
pnpm content:import:full          # writer: материализует полную проекцию корпуса в src/content
pnpm content:import:full:check    # canonical drift-гейт (full-checker)
pnpm content:import:fixture:check # isolated hermetic fixture-регрессия (temp, не трогает репозиторий)
pnpm content:validate
```

`content:import:full:check` — on-demand drift-диагностика ре-bootstrap (скилл `import-wp`): строит
полную проекцию, сверяет её с decision-контрактом (reconciliation + subset gate) и с
материализованным деревом/sidecar (checkOnly), не берёт lock и ничего не пишет. В `pnpm check` и CI
он не входит: по ADR-0012 `src/content` правится напрямую, поэтому расхождение с проекцией — норма,
а не ошибка сборки.
`content:import:fixture:check` отдельно гоняет hermetic fixture-проекцию в temp (bootstrap + check),
сохраняя fixture-пайплайн как регрессию после того, как рабочий `src/content` перешёл во владение
full-проекции.

Обычный import:

1. получает exclusive lock в `.cache/content-import`;
2. восстанавливает только token-consistent прерванную транзакцию;
3. отклоняет unowned collision или hash drift;
4. строит и валидирует полный candidate snapshot;
5. форматирует canonical artifacts проектным Prettier;
6. публикует exact owned paths через journaled backup/swap;
7. валидирует опубликованный snapshot и удаляет journal/backup.

При ошибке выполняется rollback. `--check` ничего не пишет, не снимает lock и не выполняет
recovery; при lock/journal или смене sidecar generation он завершается с ошибкой.

Расширение владения — явный режим `--expand-ownership <source-key>` (флаг повторяемый,
`=`-форма равноправна). Один атомарный запуск принимает полный набор новых mapped keys; preflight
требует, чтобы запрошенное множество ключей точно покрывало candidate paths, отсутствующие в
sidecar. Прежний path set обязан остаться строгим подмножеством, source key существующих файлов
не переназначается, hash drift и collision с unowned файлом блокируются. Повторный запуск для
уже принадлежащих ключей завершается ошибкой `expansion not needed`; с `--check` флаг
несовместим.

В режиме ре-bootstrap (скилл `import-wp`) ручное редактирование owned generated files запрещено:
сначала меняется mapping/importer, затем повторяется import. В рабочем режиме
([ADR-0012](adr/0012-working-mode-single-source.md)) `src/content` правится напрямую, а ограничения
ownership sidecar действуют только в ре-bootstrap. Ручные taxonomy config и будущие editorial files
не входят в sidecar.

### Errata: правка RU-источника (ADR-0011) — только режим ре-bootstrap

> **Режим ре-bootstrap.** В рабочем режиме ([ADR-0012](adr/0012-working-mode-single-source.md))
> единственный редактируемый источник — `src/content`; контент правится там напрямую (`/fixcontent`,
> `/validate`), а errata-петля ниже не применяется. Она действует только внутри скилла `import-wp`
> при осознанной полной перезаписи из legacy-корпуса (зона `migration/`, AD-11) и описана как
> процедура этого режима.

В режиме ре-bootstrap generated `src/content/**` править нельзя, а **RU-источник** корпуса
(`migration/data/legacy/normalized/*.jsonl`) — канонический и редактируемый: сырой WordPress-экспорт
нужен только для одноразового bootstrap. Опечатки, фактчек-исправления и авторские end-note вносятся
через errata-петлю ([ADR-0011](adr/0011-legacy-corpus-errata.md)):

1. Правится `.ru`-сторона нужного поля в `migration/data/legacy/normalized/*.jsonl` — единственная точка
   правки RU-контента (EN — дериват перевода, вручную не трогается).
2. Правка фиксируется одной записью в `migration/data/errata.yaml` (схема
   [`migration/lib/errata.ts`](../migration/lib/errata.ts); валидатор
   `pnpm content:errata:check` — on-demand, вне `pnpm check` и CI). Точный текст «было → стало» не
   дублируется — он в git-диффе JSONL.
3. `pnpm content:import:full` регенерирует `src/content/**` + sidecar → drift-гейт снова зелёный.
4. Переведённые документы (внутри ре-bootstrap `import-wp`): протухший `sourceDigest`
   (`content:translations:check`) точечно показывает, какие EN-записи в
   `migration/data/import-translations.yaml` переделать. End-note — тоже RU-правка тела, которая
   затем переводится там же. Без переперевода (owner-authorized): при чистом удалении куска
   (вырезается и в EN) или ошибке только в оригинале перевод не трогается, а digest синхронизируется
   `content:translations:refresh-digest` (строго ПОСЛЕ того, как EN стал верным). Оговорка: digest
   покрывает `title`+`content`, но не `excerpt`, поэтому правку excerpt гейт не ловит — EN-excerpt в
   `import-translations.yaml` синхронизируется по факту правки поля.
5. `pnpm check` зелёный → коммит.

В рабочем режиме `/fixcontent` и `/factcheck` (ledger `data/factcheck/ledger.yaml`) работают с
`src/content` и эту петлю не используют.

`pnpm content:normalize` без флага `--bootstrap` отказывается перезаписывать уже существующий
normalized-корпус: ре-нормализация из сырья затёрла бы errata-правки.

## Featured foundation и активация S12

S8 определяет strict schema и pure resolver с target
`{ collection, slug, linkKind }`, независимыми `copySource` и `mediaSource`. Album может брать
copy из target или photo и выбирать explicit `photoSlug`; hero-фото article/page описано ниже.
Href всегда строится из typed target и locale.

На S12/8 cutover выполнен: `src/content/featured/home.yaml` — единственный редактируемый источник
набора; adapter (`src/components/hero-slider.astro`) резолвит media каждого слайда из active manifest
по `(photoId, 'hero')` и строит `PictureModel`; статический `hero.json` вместе с `resolveHeroSlides`
(`src/lib/hero.ts`) и `scripts/build-hero-fixtures.mjs` удалён. Слайд поддерживает
`copySource: target | media | inline` (inline — маркетинговый RU/EN текст прямо в конфиге). Hero-фото
document-цели — `coverId` её записи опорной локали при `mediaSource: target` или явный
`mediaSource.photoSlug`; документ без `coverId` при `mediaSource: target` — ошибка сборки с именем
документа и подсказкой указать `mediaSource.photoSlug`. Excerpt документа берётся из frontmatter,
иначе выводится из тела (`deriveExcerpt`).

## S12 decision contract

`migration/data/s12-content-decisions.yaml` — versioned (`version: 1`), машинно-валидируемый реестр
редакционных решений по всему S6 inventory. Не содержит нормализованных тел, абсолютных путей и
master hashes; хранит только disposition per legacy ID. Schema и reconcile: `migration/lib/decisions.ts`.

Каждая сущность несёт `action: import | transform | exclude`, опциональный `canonical`
(`{ collection, id }`), `reason`, `publicationIntent` (`draft` по умолчанию), опциональные
`publicationStage` (`current-active | after-s12-images | draft`), `provenance`, `revisit` и
`reviewItems`. Инварианты, которые отклоняет контракт: неполное покрытие exact-set (6/31/19/10),
пропущенный/повторный legacy ID, `import` без canonical, canonical ID collision, `published` без
owner provenance, автоматическое наследование legacy publish, `current-active` без ID/ролей в active
image descriptor, `published`, опережающий readiness. Отдельные группы: `extraMasters` (34 отложенных
несопоставленных мастера), `aboutMedia` (единственное место с `restore`; `wp:page:38`), `documentMedia`
(embedded gallery media остальных документов — только `defer | exclude`) и `ownerDecisions`
(published subset, favorites, hero).

`content:decisions:check` — read-only migration diagnostic: валидирует контракт и требует нулевой
blocking count. Writer `content:decisions:review` регенерирует owner-friendly проекцию
в документах миграции S12 (репо сайта). После перехода в рабочий режим он не входит в `pnpm check`
или CI (ADR-0012).
