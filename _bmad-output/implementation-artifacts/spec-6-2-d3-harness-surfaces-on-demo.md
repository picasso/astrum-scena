---
title: 'Gallery, MoreDocuments и touch-viewer на страницах демо; harness удалён из ядра'
type: 'refactor'
created: '2026-10-31'
status: 'done'
baseline_commit: '22408994263f24e79c4c85af26621506fc9f428e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-2-d2-visual-baselines.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Gallery, WrapAround, варианты MoreDocuments и touch-жесты viewer проверялись в исходнике
только на тестовом маршруте `e2e-harness` под флагами `PORTFOLIO_E2E`/`MORE_DOCS_E2E`/`IMAGES_E2E_*`.
В ядре этот маршрут, `e2e-fixture.ts` и флаги остались, но сборка демо из tarball их не использует,
поэтому браузерных проверок этих поверхностей в ядре нет.

**Approach:** Часть D3 истории 6.2 (запись «часть D (harness)» в `deferred-work.md`). Блоки и варианты
списка документов попадают в синтетический контент демо. Спеки `gallery-harness`, `more-docs-harness`
и `portfolio-touch` исходника переписываются на страницы демо поверх Playwright из D1. Маршрут,
фикстура, e2e-режим каталога и флаги удаляются из ядра.

## Boundaries & Constraints

**Always:**
- Новая синтетическая страница демо `blocks` (MDX, обе локали) содержит Gallery `rect`, `square`,
  `justified`, динамическую Gallery (`randomCount`) и WrapAround. Пропсы — как в harness исходника.
  Пул динамической галереи — набор `image-sets.yaml` из всех фото демо.
- Ожидаемые значения в спеках (число фото, колонки, ratio, подписи) строятся из конфига и контента демо
  (AD-21). Литералов в спеках нет.
- Вторая статья демо в обеих локалях, чтобы у статьи появились соседи в `moreDocs.article`.
- Touch-проекты `mobile-touch` (Pixel 5) и `tablet-touch` (Galaxy Tab S4) запускают только touch-спек.
  Остальные проекты touch-спек не запускают.
- Отсутствие harness и флагов в ядре закреплено проверкой в `pnpm check`.
- Удаление env-флагов записано в `CHANGELOG.md` (Removed).

**Never:**
- e2e в `pnpm check`. Live/R2. Эталоны, снятые вне Docker-образа.
- Поправки поведения компонентов ядра ради тестов.
- Возврат harness-маршрута или флагов в другой форме.
- Сетки альбома `square`/`rect` и карточки `title-strip` на демо: у демо один `portfolio`-конфиг.

**Решения владельца 2026-10-31:**
1. Третий слот MoreDocuments — `page` на странице `blocks` (через `moreDocs.docs`): `grid`,
   `card: title-slide`, `excerpt: off`, `width: wide`; браузер проверяет hover-оверлей и touch-тап по
   title-slide. Масонри без заголовка и медиа (`heading off`, `media off`, `aria-label`) и ширина
   `prose` — рендер-тестом в `content-surfaces.test.ts`.
2. Новый визуальный эталон статических галерей страницы `blocks` на 375/1440/1920 (3 PNG, без
   динамической галереи); эталоны статьи переснимаются; `portfolio-grids` не переносится — альбомы
   сняты в D2.
3. Рендер-тест сворачивания `AlbumList` входит в D3: граница `collapseFrom`, сводка со счётчиком,
   название текущего альбома, оба списка ссылок — на синтетических записях альбомов, без правки демо.

## I/O & Edge-Case Matrix

| Сценарий | Вход / состояние | Ожидаемое | Ошибка |
|---|---|---|---|
| Gallery ≤480px | страница `blocks`, 375 | `outside`-галерея по краям `.prose`; динамическая — 1 живой элемент и `template`, после ресайза до 768 — `randomCount` элементов | — |
| Gallery >480px | 768/1440/1920 | галерея шире `.prose` с обеих сторон; динамическая сразу полная | — |
| Токены отступов | `--content-gap-*` = 1.75rem | отступы WrapAround и сеток равны 1.75rem, ряды justified заполнены, переполнения нет | — |
| Touch | Pixel 5 / Galaxy Tab S4, альбом демо | тап открывает viewer, свайп листает в порядке сетки, двойной тап зумит | — |
| Сборка с флагом | `PORTFOLIO_E2E=1 astro build` | флаг игнорируется, маршрута `/e2e-harness/` нет | — |

</frozen-after-approval>

## Code Map

- `packages/core/src/pages/e2e-harness/[view].astro`, `src/lib/portfolio/e2e-fixture.ts` — удалить.
  Набор пропсов Gallery, WrapAround и конфигов MoreDocuments взять отсюда для контента демо.
- `packages/core/src/lib/images/catalog.ts:28-90` — удалить режим `e2e` и `PORTFOLIO_E2E`/`IMAGES_E2E_*`.
  Режим `local` (`IMAGES_LOCAL_*`) не трогать. `catalog.test.ts:95-195` — убрать e2e-кейсы, кейсы local
  сохранить. Комментарий `release.ts:106`.
- `packages/core/src/index.ts:181-184` и `lib/variant-css.ts:93-120` (+ тест `:158`) — `everyVariant`
  существует только для harness. Удалить опцию.
- `packages/core/src/lib/sitemap.ts:1-27` (+ `sitemap.test.ts:33,44`) — фильтр `HARNESS_SEGMENT` удалить.
- `album-cards.astro:34`, `album-grid.astro:23`, `lib/portfolio/album-layout.ts:32` — пропсы `layout`/
  `presentation`, заданные «harness'ом». Если реальные страницы их не передают, удалить. Иначе поправить
  комментарий.
- `components/content-surfaces.test.ts:92-130` — рендер-тесты MoreDocuments (решение 1) и AlbumList
  (решение 3).
- `demo/src/content/pages/blocks.{en,ru}.mdx` — новые. Блоки берутся из `MDX_COMPONENTS`
  (`document-body.astro`). `demo/src/content/config/image-sets.yaml` (сейчас `{}`) — набор всех фото.
  `demo/src/content/articles/` — вторая статья. `demo/src/config/site.yaml:116-150` — `moreDocs`.
- Источник (только чтение, `$REFERENCE_SITE_ROOT/e2e/`): `gallery-harness`, `more-docs-harness`,
  `portfolio-touch` (inline `touchSwipe` через CDP), `gallery-visual` (`settle`).
- `e2e/helpers.ts`, `e2e/content.ts`, `e2e/viewer.ts` — маршруты, контент и хелперы viewer из D1/D2.
  Новые хелперы класть сюда.
- `playwright.config.ts` — touch-проекты, `testIgnore` touch-спека в проектах ширин.
- `e2e/__screenshots__/visual.spec.ts/*article*` — переснять в Docker (`pnpm test:e2e:docker:update`).
- Учёт: `sprint-status.yaml` (новый ключ `6-2-d3-harness-surfaces-on-demo`), `deferred-work.md`
  (`closed_by` у записи «часть D (harness)» и, по решению 3, у записи AlbumList). Запись D2 с
  `partial_by` не трогать: в ней ещё открыта пересъёмка эталонов после 6.12.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/**` — удалить маршрут, фикстуру, e2e-режим каталога, `everyVariant`, фильтр
  sitemap, мёртвые пропсы и их тесты.
- [x] `scripts/` или `packages/core/src/*.test.ts` — проверка в `pnpm check`: в `packages/core/src`
  нет `e2e-harness`, `PORTFOLIO_E2E`, `MORE_DOCS_E2E`, `IMAGES_E2E_`.
- [x] `demo/src/content/**`, `demo/src/config/site.yaml` — страница `blocks`, набор изображений, вторая
  статья, `moreDocs`.
- [x] `e2e/gallery.spec.ts`, `e2e/more-documents.spec.ts`, `e2e/viewer-touch.spec.ts` — сценарии
  harness-спеков на страницах демо.
- [x] `playwright.config.ts` — touch-проекты.
- [x] `components/content-surfaces.test.ts` — рендер-тесты по решениям 1 и 3.
- [x] `e2e/visual.spec.ts` и эталоны — по решению 2, снимать в Docker и просматривать.
- [x] `CHANGELOG.md`, `sprint-status.yaml`, `deferred-work.md` — учёт.

**Acceptance Criteria:**
- [x] `pnpm check`, `pnpm build`, `pnpm demo:packed` проходят; `pnpm test:e2e:docker` зелёный дважды подряд.
- [x] Возврат строки `PORTFOLIO_E2E` в `packages/core/src` роняет `pnpm check`.
- [x] Каждое утверждение спеков `gallery-harness`, `more-docs-harness`, `portfolio-touch` исходника
  есть в новых спеках или в рендер-тесте. Исключения — только сетки и карточки из Never.
- [x] Порча правила `outside` в CSS Gallery роняет `e2e/gallery.spec.ts`.

## Verification

**Commands:**
- `pnpm check && pnpm build && pnpm demo:packed` — expected: зелёные.
- `pnpm test:e2e:docker` (дважды) — expected: зелёный, эталоны стабильны.
- `pnpm test:e2e` (macOS) — expected: функциональные и touch-спеки зелёные, визуальный пропущен.

## Implementation Notes

- Пропсы блоков спеки читают из MDX страницы `blocks` (`pageBlocks` в `e2e/content.ts`: блок под
  ближайшим `data-testid` перед ним, значения `{…}` — YAML flow) и пропускают через `parseGalleryProps`
  ядра; пул галереи (`galleryPool`) — по источнику с высшим приоритетом: набор `every-photo`, альбом
  или `images`. Значения CSS-контракта ядра (ratio ячеек и карточек, кегль заголовка, радиус миниатюры,
  порог контейнера сетки, `viewBox` заглушки) читаются из стилей и ассетов ядра (`coreCss`, `coreFile`
  в `e2e/helpers.ts`), цвет заглушки сравнивается с `--color-accent` темы.
- Толщина рамки Gallery берётся из `data-gallery-frame` в DOM плюс порядок `thin < medium < thick`:
  импорт `GALLERY_FRAME_PX` тянет `lib/images/catalog.ts` в корневой `tsc`, а там `import.meta.env`
  без типов Vite; правка ядра ради типа теста запрещена границами.
- Статические галереи: `rect` — альбом `coastal-light`, `square` — `geometry-studies` (как `albumId` в
  harness), `justified` — набор `every-photo` (6 фото, чтобы рядов было несколько). WrapAround —
  `wide-tide` и `still-square`, за ним абзац, который его обтекает.
- `moreDocs.page`: `source: off`, `grid`, `width: wide`, `heading: on`, `card: title-slide`,
  `excerpt: off`, `ratio: vista`, 3 колонки; список задаёт `moreDocs.docs` страницы `blocks` (два курса
  без обложки — заглушка — и статья). Средний список — `moreDocs.course` на странице курса, сетка
  статей — `moreDocs.article` со второй статьёй `waiting-for-the-tide`.
- Мёртвые пропсы: `layout` у `AlbumCards` и `AlbumGrid` удалены (реальные страницы их не передают),
  тесты `components/portfolio/components.test.ts` переключают `portfolio.layout` в подменённом конфиге
  и `layout` альбома; `presentation` реальная страница передаёт — оставлен.
- Проверка возврата harness — `packages/core/src/no-test-harness.test.ts` (входит в `pnpm test`); там
  же проверено, что старые флаги (полные, частичные, рядом с `IMAGES_LOCAL_*` в dev) не меняют
  `resolveCatalogEnv` и `loadImageCatalog`.
  Проверено: строка `PORTFOLIO_E2E` в `lib/sitemap.ts` роняет его. `PORTFOLIO_E2E=1 MORE_DOCS_E2E=1`
  сборка демо проходит, маршрута `e2e-harness` нет.
- Переполнение: спеки D3 меряют `html` (как исходник), а не `body`. На `blocks` при 375 `body`
  переполняется на 16px подчёркиванием заголовка MoreDocuments (`width: min(200%, 100cqw)` без
  контейнера), его срезает `overflow-x: clip`; прокрутки нет. Вынесено в `deferred-work.md`, ядро не
  менялось.
- Эталон `blocks-galleries`: полная страница, обрезанная полосой секции на всю ширину вьюпорта —
  снимок элемента резал выход `outside` за `.prose` и ловил приклеенную шапку. Пересняты 6 эталонов
  статьи (появился блок «More Articles»); остальные 24 побайтно не изменились. Сняты на arm64.
- Проверено: порча `.gallery--outside` (ширина без второй стороны) роняет `expands outside prose…` на
  768/1440/1920.

## Spec Change Log

## Review Triage Log

Проход 1 (Codex: blind, edge-case, verification-gap; дифф от `2240899` без PNG и без спека).

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| V1 | Игнорирование снятых флагов `PORTFOLIO_E2E`/`IMAGES_E2E_*` ничем не проверено в рантайме | medium | `catalog.test.ts` подаёт только пустое окружение и `IMAGES_LOCAL_*`; гейт `no-test-harness.test.ts` проверяет текст, а не выбор каталога; обещание CHANGELOG «ядро их игнорирует» не закреплено | patch — в `no-test-harness.test.ts` сравнить `loadImageCatalog` с флагами (полными, частичными, вместе с local в dev) и без них |
| B3 | Список `moreDocs.docs` страницы `blocks` проверяется только числом карточек | medium | `more-documents.spec.ts` сверяет `toHaveCount(targets.docs.length)`; неверные ссылки, дубли и порядок проходят | patch — сверить href и заголовки карточек с `moreDocs.docs` в авторском порядке |
| B4 | Desktop hover-тест title-slide не проверяет скрытое состояние в покое | low | по `card-looks/title-slide.css:33-42` на fine pointer оверлей в покое `translateY(100%)`; тест проверяет только позицию после hover, постоянно видимый оверлей проходит | patch — до hover оверлей ниже рамки, после ухода курсора снова скрыт |
| B7 | Открытие viewer из Gallery проверяет только оболочку PhotoSwipe | low | `gallery.spec.ts` ждёт `pswp--ui-visible`; пустой или чужой слайд проходит, хелпер `viewerShowsImageOf` уже есть в `e2e/viewer.ts` | patch — проверить, что слайд показывает фото триггера |
| B2 | У WrapAround на странице `blocks` нет текста, который его обтекает | low | после блока в `blocks.{en,ru}.mdx` секция закрывается; раздел «Images in the text flow» показывает картинки без текста | patch — абзац после блока в обеих локалях, `translatedFromDigest` пересчитать |
| B8 | `documentOverflow` не видит переполнение `body` | low | реальное: на 375 `body` шире на 16px из-за подчёркивания заголовка MoreDocuments; дефект — CSS ядра (`more-documents.css`, `::after`), его правка запрещена Never спека, и он записан этим же изменением в `deferred-work.md` | defer — запись уже добавлена этим спеком, новой не нужно |
| B5 | Видимость заголовка title-slide на touch проверена только геометрией | false | оверлей скрывается только `transform: translateY(100%)` и только под `(hover: hover) and (pointer: fine)` (`card-looks/title-slide.css:33-37`); ни opacity, ни visibility не используются, поэтому сдвиг ловит `getBoundingClientRect` | reject |
| B6 | Динамическая Gallery не проверяет уникальность и принадлежность фото пулу | low | уникальность выборки закреплена `lib/blocks/gallery/random.test.ts:13`, кандидаты кладутся в `template` из серверного пула (`build-data.ts`); проверка в e2e добавила бы разбор `src` ради уже покрытого контракта | reject |
| B9 | Тест наборов не требует, чтобы `every-photo` содержал все фото демо | false | ни одно ожидание не зависит от полноты набора: `galleryPool` в `e2e/content.ts` строит ожидаемый пул из самого набора, так что устаревший набор не делает ни одно утверждение ложным | reject |
| B10+E1 | Разбор JSX-атрибутов в `e2e/content.ts` путает скобки и экранирование внутри строк | false | на таком входе разбор падает громко: незакрытая глубина вызывает `fail()` (`content.ts:125`), а обрезанное или `\'`-выражение роняет `parseYaml`; тихо неверного ожидания не возникает, а в текущем MDX таких значений нет | reject |
| B1 | В диффе нет новых и обновлённых PNG | false | дифф ревью собран с `':!e2e/__screenshots__'`; в рабочем дереве 3 новых `*-blocks-galleries.png` и 6 изменённых `*-article-*.png`, Docker-прогон их сравнивал | reject |
