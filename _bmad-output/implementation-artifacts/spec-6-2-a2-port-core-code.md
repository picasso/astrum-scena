---
title: 'Перенос кода эпиков 1–5 в ядро и разведение корней'
type: 'refactor'
created: '2026-10-26'
status: 'done'
baseline_commit: 'ac2e4940126921176501f70b3a89a2ab79ac82a8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/docs/adr/0016-core-delivery-channel.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-2a-core-skeleton-and-leak-gate.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `packages/core` — заглушка с одним маршрутом; код, прошедший эпики 1–5 (с 5.13), живёт
только в исходном репо и находит файлы сайта через `process.cwd()` и пути `src/...`, поэтому из
установленного пакета не работает (AD-8, находки 6.1).

**Approach:** Часть A2 истории 6.2. Перенести движок исходного сайта в `packages/core` вместо
заглушки: интеграция `astrumScena()` одним вызовом добавляет маршруты, коллекции, MDX-директивы,
Vite-плагины и CSS; ресурсы ядра разрешаются от пакета, файлы сайта — от `config.root`. Демо
собирается из tarball на синтетическом минимуме файлов сайта.

## Boundaries & Constraints

**Always:** Переносится только код движка, без изменения вида и поведения; соглашения о путях файлов
сайта (`src/config/site.yaml`, `src/content/**`, `src/generated/**`, `src/theme/theme.css`,
`src/assets/brand/`) остаются как в исходнике, но от корня сайта. `process.cwd()` в коде ядра не
определяет ни один корень. Комментарии на английском; гейт утечек и `check:local-paths` проходят;
каждый перенесённый тест — в `pnpm check`. Тесты не читают реальный контент и конфиг исходного сайта.
Демо — синтетика без идентичности. Peer: `astro`, `react`, `react-dom`, `@astrojs/react` (ADR-0016).

**Решения владельца (2026-10-26):**
- Объём: A2 — код, интеграция, корни, минимальное демо, тесты, переносимые как есть, и `astro check`.
  ESLint ядра, гейты исходного кода (`check:color-literals`, `check:css-layers`, `check:code-comments`,
  `check:pages`, `check:layout-tokens`) и 17 тестов на реальном контенте (переписать на фикстуры) —
  новая часть **A3**.
- Тема и шрифт — файлы сайта: демо получает свою `src/theme/theme.css` и копию Ubuntu (Ubuntu Font
  Licence) в `public/fonts`.
- Логотипы шапки, меню и баннера ядро берёт из `src/assets/brand/` сайта (контракт исходника); демо
  кладёт туда знак Astrum Scena из `docs/design/astrum-scena/`.

**Never:** Не менять исходный репо. Не переносить контент, конфиг, бренд, водяной знак, деплой
(`functions/`, `wrangler.toml`), `migration/`, сайтовые операции `scripts/` (изображения, factcheck,
переводы — CLI 6.7). Не трогать `CHANGELOG.md` (B), полный контент и изображения демо (C), e2e и
эталоны (D), общий загрузчик мест (E), релиз (F), заморозку (G), схему `site.yaml`/lock (6.4),
литералы локалей (6.10, 6.11). Не подавлять ошибки lint и типов.

## I/O & Edge-Case Matrix

| Сценарий | Вход / состояние | Ожидаемое | Ошибка |
|---|---|---|---|
| Демо из tarball | `pnpm demo:packed` | маршруты ядра в `dist`, CSS вариантов из пакета | — |
| cwd ≠ корень сайта | `astro build --root demo` из корня workspace | те же файлы сайта читаются от `config.root` | — |
| Нет `site.yaml` | корень сайта без файла | сборка падает | путь от корня сайта и имя файла |
| Неверный `site.yaml` | ключ не по схеме | сборка падает | путь ключа (поведение исходника) |
| Нет логотипа | сайт без `src/assets/brand/` | слот логотипа пуст, сборка проходит | — |
| Пустые коллекции | демо без фото | сборка проходит, маршруты альбомов не создаются | — |

</frozen-after-approval>

## Code Map

Исходник — `$REFERENCE_SITE_ROOT` (только чтение); пути ниже — от его корня.

- Переносится в `packages/core/src/`: `src/lib/**` (111), `src/components/**` (81), `src/ui/**` (9),
  `src/styles/**` (14), `src/pages/**` (13 маршрутов), `src/layouts/**` (5), `src/config/*.ts` (14),
  `src/i18n/**`, `src/theme/fonts.ts`, `src/content.config.ts` (→ построитель коллекций), `src/env.d.ts`,
  `src/assets/icons/**`.
- Остаются сайту: `src/content/**`, `src/config/{site,seo}.yaml`, `config/*.yaml`, `data/**`,
  `src/generated/**`, `src/theme/theme.css`, `src/assets/{brand,images}/**`, `public/**`, `functions/**`,
  `wrangler.toml`, `migration/**`.
- `astro.config.mjs` -- состав интеграции: `mdx()`, `sitemap({filter,serialize})`, `siteFiles(...)`,
  `markdown: satteri({directive, mdastPlugins:[callout,note,links]})`, Vite `tailwindcss()`,
  `configYamlDependency()`, `variantCssPlugin(...)`, `build.cssMinify:'esbuild'`, `compressHTML:false`,
  i18n `prefixDefaultLocale`; загрузка site/images/snapshot на верхнем уровне; флаги `PORTFOLIO_E2E`,
  `MORE_DOCS_E2E`, `IMAGES_LOCAL_MANIFEST`. `react()` добавляет сайт (6.1: рендерер резолвится от сайта).
- Корень сайта через `process.cwd()`: `astro.config.mjs:28-34,44-52,102-104`; `src/config/loader.ts:13,22,34,50,66`;
  `src/config/site.ts:6` (синглтон `site`, 37 импортёров), `src/config/seo.ts:9-10`;
  `src/pages/[locale]/index.astro:16`; `src/components/blocks/{gallery.astro:32-33,wrap-around.astro:30}`;
  `src/lib/portfolio/{photo-page.ts:83,footer-promo-build.ts:41}`;
  `src/lib/images/{catalog.ts:16,91,release.ts:43-44,85,public-config.ts:44,60}` (~14 вызовов
  `loadImageCatalog()` без корня); `src/lib/blocks/gallery/image-sets.ts:71`; `src/lib/featured.ts:28`;
  `src/lib/layout-tokens.ts:7`; `src/lib/content/files.ts:120-182` (корень уже параметр).
- `src/lib/variant-css.ts:16-132` -- один `root` для `ALBUMS_DIR` (сайт) и `VARIANT_CSS_DIRS` (ядро).
- `src/styles/global.css:7-14` -- `@source '../'`, импорты `../theme/theme.css`,
  `../generated/layout-tokens.css` относительно CSS.
- `import.meta.glob('../assets/brand/*.svg')`: `src/layouts/base.astro:80`, `src/components/site-header.astro:43`;
  иконки меню, соцсетей, заглушки (`site-header.astro:61`, `social-icons.astro:18`, `card.astro:5`) — ядро.
- Тесты: 99 переносимы как есть; пересчёт путей через `process.cwd()` в `config/menu`, `blocks/*/tokens`,
  `content-gap`, `variant-css`, `styles/tailwind-sources`, `mdx-authoring`; `lib/astro-config.test.ts` —
  на интеграцию. Не в A2: 17 на реальном контенте (A3) и `factcheck`, `factcheck-review`, `errata-edit`,
  `legacy-links` (сайт, эпик 8). `vitest.config.ts` исходника — `getViteConfig`; jsdom через
  `@vitest-environment`.
- Зависимости `package.json` исходника -- версии для ядра (`@astrojs/{mdx,sitemap,markdown-satteri}`,
  `tailwindcss`, `@tailwindcss/vite`, `mdast-*`, `micromark-*`, `parse5`, `photoswipe`, `swiper`, `yaml`);
  `@aws-sdk/client-s3` не переносить.
- Этот репо: `packages/core/{src/index.ts,routes/index.astro}` (заглушка), `scripts/build-demo-from-pack.ts`
  (маркер заглушки в `dist`), `demo/astro.config.mjs`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/**` -- перенести движок по Code Map, удалить заглушку и `routes/` -- AD-1.
- [x] `packages/core/src/index.ts` -- интеграция: маршруты через `injectRoute`, MDX, sitemap, `siteFiles`,
  директивы, Vite-плагины, i18n и build-настройки исходника; корень сайта из `config.root` идёт в
  загрузчики и плагины; `site`/`seo` — виртуальный модуль от корня сайта -- AD-8.
- [x] `variant-css.ts`, `config/loader.ts`, `lib/images/*`, `featured.ts`, `layout-tokens.ts`,
  `blocks/gallery/image-sets.ts` и их вызовы -- явный корень без умолчания `process.cwd()` -- AD-8, 6.1.
- [x] `packages/core/src/styles/global.css`, `base.astro`, `site-header.astro` -- `@source` на ядро и
  сайт; тема, токены и логотипы — от корня сайта -- 6.1b, решения владельца.
- [x] `packages/core/package.json` -- зависимости, `exports` интеграции и построителя коллекций, `files`.
- [x] `demo/**` -- синтетика: `src/config/{site,seo}.yaml`, `config/images.yaml`, таксономия,
  `src/content.config.ts` одной строкой, пустые сгенерированные файлы изображений, `theme.css`, Ubuntu в
  `public/fonts`, знак в `src/assets/brand/`.
- [x] Тесты ядра, `vitest.config.ts`, корневой `package.json` -- 99 тестов в `pnpm test`, `astro check`
  демо в `pnpm typecheck`.
- [x] `scripts/build-demo-from-pack.ts` -- проверять маршруты ядра вместо маркера заглушки.
- [x] `sprint-status.yaml`, `epics.md`, `deferred-work.md` -- часть A3.

**Acceptance Criteria:**
- Given `pnpm build` и `pnpm demo:packed`, when демо собирается из tarball, then в `dist` есть главная,
  портфолио, статьи, контакты, `rights` и `status` локалей демо.
- Given `packages/core/src`, when поиск `process.cwd()`, then ни одно совпадение не задаёт корень.
- Given `pnpm check`, when гейты идут по перенесённому коду, then все группы проходят.

## Design Notes

Vite разрешает путь с ведущим `/` от своего корня — это корень сайта, — поэтому глоб из файла пакета
сохраняет контракт исходника без нового API:

```ts
const brandLogos = import.meta.glob<string>('/src/assets/brand/*.svg', { query: '?url', import: 'default', eager: true })
```

Тему и токены `global.css` подключает так же или через алиас корня сайта, который задаёт интеграция;
выбор — по тому, что принимает `@tailwindcss/vite`.

## Implementation Notes

- Поставка: `dist/` — только граф, который Node грузит с конфигом (`src/index.ts`,
  `src/collections.ts`, `tsc` с `rewriteRelativeImportExtensions`); остальной движок пакет отдаёт
  исходниками `src/` (без тестов и фикстур), их компилирует Vite. `exports`: `.` и `./collections`.
- Корни: `CORE_ROOT` (`src/core-root.ts`, `new URL('..', import.meta.url)` — одинаков из `src/` и
  `dist/`) и `siteRoot` из виртуального модуля `virtual:astrum-scena/site-root`
  (`src/config/site-root.ts`), который интеграция отдаёт от `config.root`. У загрузчиков
  `config/loader.ts`, `lib/images/*`, `lib/status/build-data.ts` корень обязателен; вызовы без корня
  (~20) получают `siteRoot`. `variantCssPlugin` принимает `coreRoot` и `siteRoot`. `layout-tokens.ts`
  корня не читает — правка не нужна. Остался `process.cwd()` только в тексте ошибки `files.ts:97`.
- Tailwind: `@source '../'` — исходники ядра; источники сайта (`src/` без `content`) дописывает плагин
  `astrum-scena:site-sources` абсолютными путями, так как Tailwind резолвит `@source` от файла стиля в
  пакете. Тема и токены — `@import '/src/…'`: ведущий `/` резолвится от корня Vite, то есть сайта.
- Логотипы: глоб `/src/assets/brand/*.svg` с `?no-inline` вместо `?url` — маленький SVG демо Vite
  встраивал как `data:` URL, который `<use>` не принимает; у исходного сайта логотипы больше лимита.
- Пустые коллекции: без `src/content/featured/home.yaml` главная строится без слайдера (схема требует
  слайд с фото, а фото у демо нет; сайт с файлом не меняется); `readAlbumLayouts` без
  `src/content/albums` даёт `[]`. Версия на `/status/` — из `package.json` корня сайта.
- `esbuild` — зависимость ядра: `build.cssMinify: 'esbuild'` его требует, а Vite 8 держит esbuild
  необязательным peer; копию ядра Vite находит через hoisting pnpm (и плоский npm).
- Тесты: 99 перенесённых и `lib/featured-home.test.ts` в проекте Vitest `core` —
  `getViteConfig` с корнем демо, `configFile: false` и интеграцией из исходников; `scripts/` —
  отдельный проект. `lib/astro-config.test.ts` стал `src/index.test.ts`. Пути — от `CORE_ROOT` (код
  ядра) и `siteRoot` (тема демо). Три теста пинили данные исходного сайта мимо классификации
  (набор `about-intro` в `image-sets`, непустой релиз в `catalog`) — переведены на временные фикстуры;
  в `contact/host.test.ts` убраны блоки `functions/` (деплой сайта).
- Проверка типов: `tsc` не понимает импорт `.astro`, поэтому ядро проверяет `astro check`, как
  исходник; типы коллекций — из сгенерированного `.astro/` демо. `pnpm typecheck` сначала собирает
  `dist/` ядра (его грузит `astro check` демо). `i18n.routing` передаётся целиком (умолчания Astro),
  а `MdastLike` блоков допускает `null` — так типизированы `updateConfig` и mdast.
- Идентичность: имена mdast-плагинов → `astrum-scena-*`, `rightsId` владельца в фикстурах →
  `demo-rights`, тестовые хосты → `*.example`; в `PUBLIC_HOSTS` — `cloudflare.com`, `flickr.com`,
  `pages.dev`, `t.me`, `telegram.org`. Сырой NUL-байт в `lib/status/build-data.ts` заменён на
  `\u0000`: гейт считал файл бинарным и пропускал шаблоны.
- Демо: `site.yaml` собран из синтетической фикстуры (`en`, баннеры и картинка контактов `off`);
  схемы `privacy.controller.name` и `seo.description` пока требуют и `ru` (литералы — 6.10/6.11).
  `config/images.yaml` синтетический, водяной знак — иконка знака; дайджест пустого релиза посчитан
  функцией CLI исходника (только чтение). Логотипы — знак под id из контракта `site-logo.astro`.

## Spec Change Log

## Review Triage Log

Проход 1 (2026-10-26: blind-hunter B, edge-case-hunter E, verification-gap V).

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| B1 | Имена снимков, альбомов и статей исходного портфолио в тестах, фикстурах и e2e-стенде | medium | ~200 вхождений в 24 файлах ядра (слаги из `src/content` исходника, заголовки карточек стенда); гейт утечек их не видит — не хосты и не ID; ядро обязано быть синтетическим | patch |
| B6+V1 | Сборка страниц с cwd ≠ корень сайта не проверяется | medium | `pnpm build` и `demo:packed` шли с cwd в корне сайта, `index.test.ts` проверяет только виртуальный модуль; возврат `process.cwd()` в `status`/`rights` прошёл бы | patch |
| V2 | `transform` плагина `astrum-scena:site-sources` не запускается тестом | medium | Тест есть только у `siteSourcesCss`; демо без своих классов, поэтому потеря `@source` сайта прошла бы незамеченной | patch |
| B5 | Проверка tarball не ждёт `courses/`, а CSS вариантов не проверяется | low | `courses/` собирается для каждой локали — прямая правка; отсутствующий файл варианта роняет сборку громко, отдельная проверка CSS — новая ветка | patch (`courses/`), reject (CSS) |
| B3+E12 | Ядро проверяется без `noUncheckedIndexedAccess` базового tsconfig | medium | Исходник проверялся `astro/tsconfigs/strict` без этого флага; включение требует правки перенесённого кода — долг, существовавший до A2 | defer |
| B9 | `errata-edit.ts` и `legacy-links.ts` (~1100 строк) в ядре без тестов | low | Импортируются `translation-freshness`/`translation-marker`/`note/claim`; код не изменён, в исходнике покрыт; перенос тестов — работа A3, не прямая правка | reject |
| B2 | Маршрут e2e-стенда компилируется в каждом сайте | low | Как в исходнике: без флагов `getStaticPaths` пуст; условная инъекция — новая ветка; стенд и его фикстура — часть D | reject |
| B4 | `dist` и `src` держат две копии модулей с кешами | false | Граф конфигурации (Node) и граф рендера (Vite) были раздельными и в исходнике (`astro.config.mjs` импортировал `src/config/loader.ts` из Node); общего состояния между ними нет | reject |
| B7+E5+E13 | `files.ts:97` строит путь ошибки от cwd | low | Только текст сообщения, корень не задаёт; при `--root` путь длиннее, но верный; правка добавляет параметр | reject |
| B8 | `coreRoutes()` не повторяет все правила file-based routing | low | Все 13 страниц — `.astro` без `_` и `[...rest]`; новые виды страниц — вместе с ними | reject |
| B10 | `esbuild` находится через hoisting pnpm | low | Работает при настройках pnpm по умолчанию и в демо из tarball; `hoist=false` у сайта маловероятен; проверка при setup — новая ветка | reject |
| B11 | Проверка tarball читает локали загрузчиком workspace | low | Скрипт запускается только в workspace, читает `site.yaml` копии демо; результат тот же | reject |
| B12 | Статусы спеки и sprint-status расходятся; `ru` в схемах; копия демо на каждый `vitest run` | false/low | Статусы синхронизирует шаг 5; обязательные `ru`-тексты — 6.10/6.11 (эпик); копия ~10 мс | reject |
| E1 | `site-logo.astro` жёстко задаёт id и viewBox, у логотипа демо 2 из 5 id | low | Отсутствующий `<use>` ничего не рисует, логотип демо виден частями, которые есть; контракт файлов бренда документируется в 6.5 | reject |
| E2 | Сравнение id с `GLOBAL_CSS` на Windows | low | Windows не целевая платформа сборки; нормализация — новая ветка | reject |
| E3 | Новый альбом в dev не выбирает CSS до перезапуска | low | Поведение исходника не изменено | reject |
| E4 | Относительные пути `IMAGES_*_MANIFEST` разрешаются от cwd | low | Флаги dev/e2e, путь в env по соглашению CLI от cwd; e2e — часть D | reject |
| E6+E7 | Голая `ZodError` frontmatter при setup; симлинки в контенте | low | Поведение исходника не изменено; редкие случаи; правки — новые ветки | reject |
| E8 | Нет `image-sets.yaml` — `Gallery` падает с ENOENT | low | Поведение исходника; файл есть у сайта и демо; громкое падение | reject |
| E9 | Контакты демо ссылаются на отсутствующую страницу `privacy` | low | Демо-минимум; страницы демо — часть C | reject |
| E10 | Параллельные `vitest` удаляют копию сайта друг у друга | low | Одновременный watch и check в одном дереве маловероятен; падение громкое | reject |
| E11 | Метасимволы regex во временном пути теста | false | `mkdtemp` даёт буквенно-цифровой суффикс; `.` в пути совпадает сам с собой | reject |

Проход 2 (2026-10-27, Codex: blind-hunter CB, edge-case-hunter CE, verification-gap CV) — повторное
ревью другой моделью. Дифф: файлы вне ядра — от `ac2e494`; 97 изменённых файлов ядра — от
`ref:src/…`; 8 новых — целиком; 272 скопированных без изменений — списком. Первый запуск (R) шёл без
8 новых файлов из-за ошибки сборки диффа; его уникальные находки разобраны здесь же.

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| CB1+R1 | `mdx-authoring.d.ts` не доходит до сайтов: тип `MDXProvidedComponents` глобальный, а `tsconfig` сайта включает только свои файлы | medium | В исходнике `tsconfig.json` включал `**/*` вместе с `src/`; в пакете ни `exports`, ни `dist/index.d.ts` на файл не ссылаются (`rg mdx-authoring` — только `mdx-components.ts` и тест). Вывод типов в API — 6.3 | defer |
| CB2+CE2 | `site.yaml` читается при setup без `addWatchFile`: правка `origin`/`locales` в dev требует перезапуска | low | Так же в исходнике: `astro.config.mjs:28-29` читал секции на верхнем уровне без наблюдения; правка конфига ядра — вне A2 | defer |
| CB3+CE1 | Первый альбом нового макета в dev не выбирает CSS до перезапуска | low | Код наблюдения не изменён: `ref:src/lib/variant-css.ts:128,131` = `variant-css.ts:136,139` (`addWatchFile` конфига и файлов альбомов); то же, что проход 1 E3 | reject |
| CB4 | `@source '../'` сканирует тесты и фикстуры, которых нет в пакете: CSS из workspace ≠ CSS установленного ядра | medium | Подтверждено A/B-сборкой демо: без исключений в CSS попадали `.uppercase`, `.outline`, `.sepia`, `.ease-in-out`, `.transform!` только из тестов. Добавлены `@source not` по каждому исключению `files`; тест `tailwind-sources` сверяет их с `package.json` | patch |
| CB5 | `pages.dev` в `PUBLIC_HOSTS` пропускает любой поддомен | false | Намеренно: `identity.ts:45` — имя проекта под `pages.dev` идёт в список владельца, и список его ловит раньше доменного шаблона (`findLeaks` сначала `findDenylisted`) | reject |
| CB6+R2 | Главная без `featured/home.yaml` — пустой экран без заголовка | low | Ветка нужна пустому демо (Implementation Notes A2); наполнение главной демо — часть C | defer |
| CB7+CV1+R3 | Директивы проверяются отдельным процессором, а не тем, что регистрирует интеграция | medium | Пред-проверено ревьюером; добавлены проверка `mdastPlugins` по идентичности и отрисовка `:::callout` процессором из `updateConfig` (`index.test.ts`) | patch |
| CB8+CV4+R4 | Перезагрузка YAML в dev не проверена | medium | Пред-проверено; нужен стенд с запущенным dev-сервером — часть D | defer |
| CB9+CB10+CV2+CV3+R5+R6+R7 | Сборка из tarball идёт на пустом контенте: не проверены построитель коллекций, sitemap и исключения unlisted, `_redirects`/robots/CSP, слайдер главной и страница фото при cwd ≠ корень | medium | Общая причина — пустое демо (`demo/README.md`); проверка `build-demo-from-pack.ts` смотрит только список страниц. Демо, покрывающее публичный API, — часть C | defer |
| R8 | Дифф без новых файлов (раздел 3 пуст) | false | Ошибка сборки диффа ревью (zsh не делит переменную на слова), не изменения; повторный запуск шёл с 8 файлами | reject |
| R9 | В диффе нет `pnpm-lock.yaml` | false | Исключён из диффа ревью, в коммите `cccb052` есть | reject |
| R10 | Стенд e2e галереи ссылается на `sunrises`, которого нет в демо | low | Маршрут стенда без флагов `PORTFOLIO_E2E`/`MORE_DOCS_E2E` пуст (`getStaticPaths`, проход 1 B2); стенд и фикстура — часть D | reject |
| R11 | `catalog.test.ts` не удаляет временные каталоги | low | `fixtureSiteRoot()` и два теста звали `mkdtempSync` без очистки; общий `tempDir` с `afterAll` | patch |
| R12 | `image-sets.test.ts` оставляет каталог при падении загрузки | low | `rmSync` стоял после `await`; перенесён в `finally` | patch |
| R13 | Два параллельных `vitest` удаляют фикстуру no-brand друг у друга | low | Та же находка, что проход 1 E10: одновременный запуск в одном дереве маловероятен, падение громкое | reject |

Проход 3 (2026-10-27, Codex) — ревью исправлений по диффу `59780c9..4f42a06`; общий журнал — в
спеке A.

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| FB5+FV1 | Исключения Tailwind проверяются как текст директив, а не тем, что сканирует Tailwind | medium | Пред-проверено; тест `tailwind-sources` теперь компилирует `@source` через `@tailwindcss/node` и спрашивает `Scanner` из `@tailwindcss/oxide` (dev-зависимости ядра 4.3.3, как у `@tailwindcss/vite`); порча одного исключения роняет оба теста | patch |

## Verification

**Commands:**
- `pnpm check` -- expected: успех.
- `pnpm build && pnpm demo:packed` -- expected: успех, маршруты ядра в `dist` копии демо.
- `rg -n 'process\.cwd\(\)' packages/core/src` -- expected: нет разрешения корней.
