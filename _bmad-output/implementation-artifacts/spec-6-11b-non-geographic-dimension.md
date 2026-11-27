---
title: 'Негеографическое измерение таксономии и набор демо'
type: 'feature'
created: '2026-11-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'bfa42612ba985eec638ab81960685542eb429d0d'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** таксономия фото знает только места (гео-иерархия) и теги. Сайт №3 (события, персоны) не может
объявить измерение без гео-иерархии, а демо проверяет только набор сайта №1, так что свои перечни из 6.11a
не проходят через сборку (критерии 6.11 №2–3, AD-5).

**Approach:** сайт объявляет `content.taxonomy.dimensions.<id>` с меткой по локалям; значения лежат в плоском
словаре `src/content/config/<id>.yaml` (`schemaVersion: 1`, `{id, label}`); фото ссылается
`dimensions: { <id>: [ids] }`; `check content` проверяет ссылки, страница фото выводит метки. Демо получает
свои категории, виды мест и тегов и измерение `events`.

**Decisions (владелец, 2026-11-25):** форма измерения — объявление в конфиге, плоский словарь, ссылки фото
и вывод на странице фото (выбрано при разделении 6.11).

**Decisions (владелец, 2026-11-26):**
- Версия коллекции фото остаётся `photos: 2`: поле `dimensions` добавочное, старый контент валиден;
  критерий 6.11 №4 относится к смене формы существующих данных.
- Спек не делится: демо со своим набором — сквозная проверка измерения.
- Значения измерения — чипы в общем ряду с тегами, без подписи измерения. Оформление чипов измерения
  задаёт сайт: тема объявляет для каждого измерения свой токен цвета `--color-dimension-<id>`; без него
  сборка падает, цвет тегов (`--color-link`) запасным не служит. Форма чипа (рамка, размер, шрифт) общая
  с тегами.
- Измерение может задать иконку `icon: <имя Lucide>` в `site.yaml`; она стоит перед текстом каждого
  чипа измерения. SVG ядро читает при сборке из зависимости `lucide-static` (ISC, точная версия) и
  встраивает в страницу; неизвестное имя — ошибка `site.yaml` с путём. Без `icon` чип без иконки.

## Boundaries & Constraints

**Always:**
- Без `dimensions` разметка страницы фото, вывод исходного сайта и хеш изображений не меняются; поле
  `dimensions` фото необязательно.
- Метка измерения и значений — запись по всем локалям конфига (правило 6.10); лишняя или пропущенная
  локаль, неизвестное измерение или значение, повтор ID — ошибка с путём к файлу и полю.
- ID измерения — kebab-case и не совпадает с именем другого файла `src/content/config/`
  (`categories`, `places`, `tags`, `image-sets`) — ошибка `site.yaml` с путём.
- Словарь измерения читает один загрузчик в `lib/content/files.ts` (гейт `check-taxonomy-readers`).
- Снапшоты API обновлены; ломающие по `check:api-breaking` изменения описаны в `UPGRADING.md` и
  `CHANGELOG.md`; документы и skill `add-album` описывают измерения.

**Never:**
- Не добавлять маршруты, фильтры, sitemap или страницы по значениям измерений.
- Не превращать места или теги в измерения; не менять GPS-код мест.

## I/O & Edge-Case Matrix

| Сценарий | Вход | Результат |
|---|---|---|
| Нет измерений | `dimensions` нет | lock `dimensions: {}`; фото без поля; разметка прежняя |
| Ссылка | `events` объявлено, фото `dimensions: {events: [tide-fair]}` | метка значения на странице фото |
| Неизвестное значение | `events: [nope]` | ошибка `photos.<id>.dimensions.events` со списком |
| Неизвестное измерение | `dimensions: {people: [ann]}` без объявления | ошибка с путём и списком измерений |
| Нет словаря | `events` объявлено, `events.yaml` нет | ошибка с путём файла |
| Занятое имя | `dimensions: {tags: …}` | ошибка `content.taxonomy.dimensions.tags` |
| Нет токена | `events` объявлено, в `theme.css` нет `--color-dimension-events` | ошибка `src/theme/theme.css: missing required tokens` |
| Иконка | `events: {icon: calendar-days}` | SVG Lucide перед текстом чипа, цвет `currentColor` |
| Нет такой иконки | `icon: calendr` | ошибка `content.taxonomy.dimensions.events.icon` |
| Чужой токен | `--color-dimension-people` без измерения `people` | ошибка `unknown tokens` |

</frozen-after-approval>

## Code Map

- `config/taxonomy.ts` — `taxonomyConfigSchema`: ключ `dimensions` (запись id → `{label}` локализованная,
  умолчание `{}`), проверка имён против файлов конфига; `IMAGE_SETS_CONFIG_PATH`
  (`lib/blocks/gallery/image-sets.ts:80`) и пути `files.ts:143-145` — источник занятых имён.
- `lib/content/schemas.ts:195-238` (`photoSchemaFor`) — поле `dimensions` (запись id → массив kebab-ID без
  повторов); `tagsConfigSchemaFor` (:420) — образец словаря `{schemaVersion: z.literal(1), <id>: [{id, label}]}`.
- `lib/content/files.ts:156-243` — `loadDimensionConfig`/расширение `loadTaxonomyConfig` и
  `loadContentSnapshot` (словари всех объявленных измерений).
- `lib/content/integrity.ts:259-336` — повторы ID словарей и ссылки фото рядом с `placeId`/`tags`.
- `lib/portfolio/photo-page.ts:50,85-146`, `lib/portfolio/taxonomy.ts` (`resolveTagLabels` — образец),
  `pages/[locale]/portfolio/[album]/[photo].astro:42,110-128` (чипы измерений в `ul.photo__tags` после
  тегов, с атрибутом измерения и `title` — меткой измерения в локали страницы), `styles/pages/photo.css:105-130` (`.photo__tag` — форма; цвет чипа
  измерения — из `--color-dimension-<id>`, не `--color-link`).
- `theme/tokens.ts:31-54` (`themeTokenProblems`) — обязательные токены измерений из lock сверх
  `tokens.json`; вызов проверки темы в интеграции передаёт объявленные измерения. README (контракт темы)
  описывает шаблон токена. Тема демо `demo/src/theme/theme.css` — голубой `--color-dimension-events`.
- Иконки: `lucide-static` в `dependencies` ядра (точная версия); имя проверяется по набору пакета, SVG
  читается от установленного пакета (не от `process.cwd()`), в разметку попадает только он — без
  интерполяции ввода сайта (образец `lib/blocks/links/icons.ts`). `THIRD_PARTY_NOTICES.md` — запись о
  Lucide (иконки встраиваются в вывод сайта). Демо: `events` с `icon`.
- `scripts/check-taxonomy-readers.ts:14-17` — загрузчик измерений в `LOADERS`.
- `scripts/lib/api-surface.ts:123-145`, `api-snapshot/site-files.json` — схема словаря под путём-шаблоном
  `src/content/config/<dimension>.yaml`, поле фото.
- Демо: `demo/site.yaml` (`content.taxonomy` со своими списками и `events`), `demo/site.lock.yaml` через
  `config resolve`, `demo/src/content/config/{categories,places,tags,events}.yaml`, `albums/*.yaml`,
  `photos/*.yaml`. Свой набор (решение агента): категории `journeys|studies`, виды мест `land|shore`, виды
  тегов `mood|form`, `events` — два значения у двух-трёх фото.
- e2e: страницу фото не посещает ни одна спека и эталонов PNG у неё нет; новая проверка меток —
  ожидаемое из конфига и словарей демо (`e2e/content.ts`).
- Документы: `docs/07-taxonomy.md`, `docs/08-content-model.md`, `docs/adr/0007-photo-taxonomy.md`,
  `packages/core/README.md`, `skills/add-album/SKILL.md`, `UPGRADING.md`, `CHANGELOG.md`.

## Tasks & Acceptance

**Execution:**
- [x] `config/taxonomy.ts`, `schemas.ts`, `files.ts`, `integrity.ts` -- измерения в конфиге, словаре, фото и `check content` -- ядро формы.
- [x] `photo-page.ts`, `taxonomy.ts`, `[photo].astro`, `photo.css` -- чипы измерений на странице фото -- вывод.
- [x] `theme/tokens.ts` и вызов проверки темы -- токен `--color-dimension-<id>` обязателен для объявленных измерений -- оформление от сайта.
- [x] Гейт загрузчиков, снапшоты API, lock -- контракт.
- [x] Демо: свой набор и `events`; e2e страницы фото -- доказательство на сборке.
- [x] Тесты матрицы (`config`, `lib/content`, `lib/portfolio`); документы, `UPGRADING.md`, `CHANGELOG.md`.
- [x] `sprint-status.yaml` -- `6-11b-non-geographic-dimension`; `6-11-…` -- `review` по закрытии; запись 6.11b в `deferred-work.md` -- `closed_by`.

**Acceptance Criteria:**
- [x] `pnpm build` демо со своими категориями, видами и `events` зелёный; e2e находит чипы `events` на
  странице фото с цветом из `--color-dimension-events` темы демо, отличным от цвета тегов, и с иконкой
  Lucide перед текстом.
- [x] `pnpm demo:packed` зелёный: иконка находится от упакованного ядра вне workspace.
- [x] Визуальные эталоны не меняются (`pnpm test:e2e:docker`).
- [x] Только `files.ts` читает словари измерений (гейт `check-taxonomy-readers` с тестом).
- [x] `check:api-breaking --base origin/main` и `check:upgrading` проходят.

## Implementation Notes

- Имя иконки схема `site.yaml` проверяет только на kebab-case; наличие в `lucide-static` проверяют
  `config resolve` (`resolveSiteLock`) и хук интеграции (`dimensionIconIssues`), оба в Node: lock
  парсится и в собранном коде страниц, где расположение пакета нестабильно. Страница фото берёт папку
  иконок из `virtual:astrum-scena/lucide-icons`, которую интеграция вычисляет от модуля ядра.
- Занятые имена — `RESERVED_DIMENSION_IDS` в `config/taxonomy.ts`; тест в `files.test.ts` сверяет их с
  путями загрузчиков (импорт `files.ts` из `config/` дал бы цикл).
- Повтор ID значения ловит схема словаря (`<file>: events.1.id: repeats …`), неизвестное измерение и
  значение фото — `check content` (`photos.<id>.dimensions.<dim>`); построитель страницы фото — запасная
  проверка.
- Гейт `check-taxonomy-readers` дополнительно ловит путь `content/config/${…}`, собранный из ID.
- `lucide-static` закреплён на `1.71.0`; в разметку попадает SVG пакета с его лицензионным комментарием, без
  переносов строк.
- Критерий 6.11 №4 в `epics.md` сужен по решению владельца 2026-11-26 (добавочное поле версию не
  поднимает).

## Spec Change Log

## Review Triage Log

### Проход 1 (Codex)

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|---|
| 1 | blind | В диффе нет `pnpm-lock.yaml` при новой зависимости | false | `pnpm-lock.yaml` изменён в рабочем дереве (+8 строк, `lucide-static@1.71.0`); из диффа ревью исключён при подготовке | отклонено |
| 2 | blind | Снапшот `site-files.json` не обновлён | false | `packages/core/api-snapshot/site-files.json` изменён в дереве (+144 строки); из диффа исключён при подготовке, `check:api-snapshot` в `pnpm check` зелёный | отклонено |
| 3 | blind | Спек, на который ссылается `closed_by`, не в диффе | false | Спек лежит в `_bmad-output/implementation-artifacts/` (неотслеживаемый); из диффа исключён, чтобы его читал только слой edge | отклонено |
| 4 | blind | Измерение `place-gps-bounds` занимает файл GPS-зон | medium | Подтверждено: `PLACE_GPS_BOUNDS_PATH` (`cli/images/place-gps-bounds.ts:16`) лежит в `src/content/config/`, а `RESERVED_DIMENSION_IDS` (`config/taxonomy.ts:21`) его не содержит | patch |
| 5 | blind, edge, vgap | Измерение `constructor` ломает страницу фото без него | low | Подтверждено слоем vgap запуском: `photoDimensions[dimension]` читает унаследованное свойство (`lib/portfolio/taxonomy.ts:76`); правка — `Object.hasOwn` | patch |
| 6 | blind, edge, vgap | Числовые ID измерений меняют порядок чипов | low | Реально (порядок ключей JS), но числовой ID измерения в обычной работе не встречается, а правка — новое правило схемы или список вместо записи | отклонено |
| 7 | blind, edge | Пустая метка значения даёт пустой чип | low | Значения берут тот же `localizedText`, что метки тегов, мест и категорий (`schemas.ts`, `tagSchemaFor`); правило общее и было до правки | отклонено |
| 8 | blind | Ошибка разбора YAML словаря без имени файла | low | Существовало до правки: `loadConfigFile` (`files.ts:172`) так читает все словари | отклонено |
| 9 | blind, edge | `astro dev` держит старый список токенов после `config resolve` | low | Все значения lock, прочитанные в `astro:config:setup` (локали, модули, маршруты, `index.ts:185`), живут так же; смена конфига требует перезапуска dev | отклонено |
| 10 | blind, edge | SVG Lucide встраивается без лицензионной пометки | medium | Подтверждено: `lucideIconSvg` вырезает комментарий пакета (`config/lucide-icons.ts:42`), в HTML сайта пометки ISC нет; правка — оставить комментарий | patch |
| 11 | blind | Чипы измерений наследуют `opacity` тегов, контраст низкий | low | Форма чипа общая с тегами по решению владельца; у чипов тегов та же `opacity` (`photo.css:128`), цвет задаёт тема сайта | отклонено |
| 12 | blind | Блоки галерей читают все словари измерений ради мест | low | Подтверждено: `gallery.astro:33`, `wrap-around.astro:31` берут из `loadTaxonomyConfig` только `places`; правка — `loadPlacesConfig` | patch |
| 13 | blind, edge, vgap | Гейт читателей не ловит литерал или `path.join` пути словаря | low | Ядро не знает ID измерений сайта, литерал невозможен; ловить любой путь `src/content/config` потребует исключений для `image-sets.ts:80` и `place-gps-bounds.ts:16` | отклонено |
| 14 | blind, edge | `withOneLocale` может принять измерение с именем локали за локаль | low | Скрипт конвертирует только демо, чьё единственное измерение — `events` (`demo/site.yaml`) | отклонено |
| 15 | blind, edge | Заголовки e2e по ID фото повторятся при фото в двух альбомах | low | Подтверждено `e2e/photo-page.spec.ts:35`; правка — ID альбома в заголовке | patch |
| 16 | blind, edge, vgap | E2e не проверяет чип без иконки, фото только с измерением, порядок тегов и чипов; `:first-child` не видит текстовые узлы | medium | Пробел подтверждён слоем vgap (`photo-page.spec.ts:34-64`, у всех трёх фото есть тег, место и дата, `events` с иконкой) | patch |
| 17 | vgap | `check content` не проверен на значении из словаря другого измерения | medium | Пробел подтверждён слоем vgap (`integrity.test.ts:123` — один словарь) | patch |

## Verification

**Commands:**
- `pnpm check`, `pnpm build`, `pnpm demo:packed` -- зелёные
- `pnpm check:api-breaking --base origin/main`, `pnpm check:upgrading` -- зелёные
- `pnpm test:e2e:docker` -- зелёный, PNG без изменений

**Manual checks:**
- Исходный сайт: без `dimensions` вывод прежний; пробная сборка — только если он уже на раскладке `site.yaml`.
