---
title: 'Тесты рендера компонентов на фикстурах и демо'
type: 'test'
created: '2026-10-29'
status: 'done'
baseline_commit: '97cb318fc98f4375aca410a48c072110b95a7712'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-2-a5a-config-and-file-contracts.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Критерий 6.2: тесты исходника на реальном контенте переписаны на фикстуры демо. Пять
тестов рендера (карточки, верхняя секция, блок Gallery, рендер страницы privacy, маршрут `/status/`)
в ядро не перенесены — компоненты рендерятся без проверки. В тесте ядра
`components/portfolio/components.test.ts` лежит фрагмент реального названия альбома исходника.

**Approach:** Часть A5b истории 6.2 (A5 = A5a + A5b + A5c). Тесты переносятся по приёмам A5a: демо через
`siteRoot`, файлы ядра через `CORE_ROOT`, синглтоны — `vi.mock` + `buildSiteConfig`, коллекции —
мок `astro:content`; реальные id, названия, slug'и и тексты заменяются id демо или синтетикой.
Реальный фрагмент в `components.test.ts` заменяется синтетическим.

## Boundaries & Constraints

**Always:** Тесты в `pnpm check` (проект `core`). Ни `process.cwd()`, ни путей, slug'ов, названий и
текстов исходного сайта (AD-22); ожидаемое — из конфига демо или фикстуры (AD-21). Не перенесённый
случай — в Implementation Notes с причиной; дубль уже существующего теста ядра не переносится.

**Never:** Не менять код ядра ради прохождения; дефект — в Implementation Notes и находкой ревью. Не
трогать исходный сайт и A5c. Не добавлять контент демо.

</frozen-after-approval>

## Code Map

- Источники — `$REFERENCE_SITE_ROOT/src/components/` (только чтение): `cards.test.ts` (337 строк),
  `top-section.test.ts` (147), `blocks/gallery.render.test.ts` (77), `content/privacy-render.test.ts`
  (54), `status/status-route.test.ts` (70).
- `cards` → `components/{card,card-collection,card-grid,card-list,card-masonry}.astro`,
  `card-looks/title-slide.css`, `lib/cards/select.ts`. Медиа — `resolveSurfaceMedia(manifest,
  'morning-ridge', 'documentCard')` на `lib/images/__fixtures__/s9-ladder-manifest.json`; карточки —
  статья демо `/en/articles/reading-the-light/` и синтетический курс (`/en/courses/paper-lanterns/`, как
  в `lib/content/routes.test.ts`); регэксп href (исходник `:166`) следует за новым href. Моки не нужны.
- `top-section` → `components/top-section.astro`; ключ `morning-ridge` (поверхность `bannerHero`),
  синтетические `alt` и `title` (разбиение акцента — по новому заголовку). Моки не нужны.
- `gallery.render` → `components/blocks/gallery.astro`; каталог — `loadImageCatalog(siteRoot)` (активный
  релиз демо: `amber-dunes`, `graphite-lines`, `long-horizon`, `quiet-tower`, `still-square`,
  `wide-tide`); мок `astro:content` с фото демо и `[]` альбомов, MDX-рендерер контейнера — как
  `components/content/render-path.test.ts:17`.
- `privacy-render` → `components/content/privacy-controller.astro` через `MDX_COMPONENTS`,
  `lib/portfolio/page-meta.ts`, `lib/sitemap.ts`; MDX демо `demo/src/content/pages/privacy.{en,ru}.mdx`
  (`<PrivacyController />`, контакт `/{lang}/contacts/` из `site.yaml` демо); импорт —
  `/src/content/pages/privacy.<locale>.mdx` (корень Vite — демо) или относительный путь к `demo/`;
  URL запроса — `/{locale}/privacy/`.
- `status-route` → `pages/status.astro` (внедряется `coreRoutes()`, `index.ts:45`); `loadSiteStatus`
  (`lib/status/build-data.ts`) — четыре `getCollection` (мок `astro:content`, как
  `lib/banner/build-data.test.ts:70`), релиз и `demo/package.json`. Случай «страница без локали» уже
  покрыт `lib/content/routes.test.ts` и `index.test.ts:88,99` — не дублировать.
- `components/portfolio/components.test.ts:71` — «Sunrises For» / «Рассветы для» встречается в реальном
  контенте исходника; заменить синтетикой (id `sunrises` синтетический — остаётся).
- Пример рендера `Base` в контейнере — `components/brand-logo.test.ts:9`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/components/cards.test.ts` -- перенос на фикстуру и демо.
- [x] `packages/core/src/components/top-section.test.ts` -- перенос на фикстуру.
- [x] `packages/core/src/components/blocks/gallery.render.test.ts` -- перенос на каталог и фото демо.
- [x] `packages/core/src/components/content/privacy-render.test.ts` -- перенос на MDX демо.
- [x] `packages/core/src/components/status/status-route.test.ts` -- рендер `/status/` на моках коллекций
  демо, без дубля проверки файла маршрута.
- [x] `packages/core/src/components/portfolio/components.test.ts` -- синтетическое название вместо
  реального фрагмента.
- [x] `deferred-work.md` (A5b — `closed_by`, A5 — `partial_by`), `sprint-status.yaml` -- учёт.

**Acceptance Criteria:**
- [x] `pnpm check`, `pnpm build` проходят; пять перенесённых тестов входят в проект `core`.
- [x] `rg -n "process\.cwd\(\)"` по перенесённым тестам и `rg -n "Sunrises For|Рассветы для"
  packages/core/src` пусты; `pnpm check:identity` зелёный.
- [x] Каждый не перенесённый случай назван в Implementation Notes с причиной.

## Verification

**Commands:**
- `pnpm check`, `pnpm build` -- expected: зелёные.

## Implementation Notes

- Приёмы: фикстура манифеста и CSS ядра — через `CORE_ROOT`, корень демо — через `siteRoot`; код ядра не
  менялся. `pnpm check` (1586 тестов) и `pnpm build` зелёные.
- `cards`, `top-section`: перенесены все случаи; медиа — `morning-ridge` фикстуры, карточки — статья демо
  `reading-the-light` и синтетический курс `paper-lanterns`, alt и заголовок баннера синтетические.
  Проверка разбиения акцента усилена: для «Morning Ridge» голова `Morning`, акцент ` Ridge`.
- `gallery.render`: id фото — первые три по алфавиту из манифеста активного релиза демо
  (`loadImageCatalog(siteRoot)`), не пинятся; `--gallery-min-tile` сверяется с `GALLERY_MIN_TILE_PX`, а не
  с литералом 240; добавлен случай «в релизе демо есть три фото».
- `privacy-render`: MDX демо — `import.meta.glob('/src/content/pages/privacy.*.mdx')` от корня Vite (демо);
  локали, локаль по умолчанию и контакт — из `site.yaml` демо (`privacyControllerModel`), проверяется и имя
  контролёра; взаимные `hreflang` — по всем остальным локалям конфига.
- `status-route`: синглтон — `buildSiteConfig` с подменённым origin и `content` демо (иначе пары
  документов демо не сходятся с опорной локалью фикстуры); `astro:content` — `loadContentSnapshot(siteRoot)`
  (статьи, страницы, фото, альбомы демо). Новый случай «модель»: ссылки опубликованных статей, счётчики фото,
  альбомов и ассетов релиза, версия из `package.json` демо. Снимок контента без тел, поэтому свежесть перевода
  не проверяется (её покрывает `lib/status/build-data.test.ts`).
- **Не перенесён** случай `status-route` «exists only as a language-neutral page» (через `process.cwd()`
  проверял `src/pages/status.astro` и отсутствие `src/pages/{en,ru}/status.astro`): дубль
  `lib/content/routes.test.ts` (`STATUS_PATH` без префикса) и `index.test.ts:88,99` (маршрут `/status`
  из `CORE_ROOT/src/pages`, уникальные шаблоны). Отсутствие `pages/[locale]/status(.astro)` — случай в
  `routes.test.ts` по образцу `/rights/` (по ревью).
- `components.test.ts`: название альбома `sunrises` — «Early Light» / «Ранний свет»; на текст названия
  утверждений нет.

## Spec Change Log

## Review Triage Log

Проход 1 (Codex: blind, edge-case, verification-gap; diff от `97cb318`). Edge-case — `[]`.

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| B2+B3+B4+V1 | Тест Gallery проверяет наличие разметки, а не содержимое: пустой `<template>`, пустой вывод при `action: none`, одно фото из двух | medium | verification-gap: удаление отображения кандидатов (`gallery.astro:110`) проходит тест, а `populateDynamic` (`ui/gallery-coordinator.ts:67`) тогда ничего не показывает | patch — id всех кандидатов в шаблоне, два изображения в `<noscript>`, оба `data-image-id` по порядку, изображение при `action: none` |
| B1 | Отсутствие локализованного `/[locale]/status` нигде не проверено | low | `routes.test.ts` проверяет это для `/rights/`, для `/status/` — только путь без префикса; лишний маршрут прошёл бы | patch — отсутствие `pages/[locale]/status(.astro)` через `CORE_ROOT`, как для прав |
| B5 | Правило hover/focus оверлея проверяется по селекторам без объявления | low | `cards.test.ts` — смена `transform` в правиле проходит | patch — `transform: none` в правиле |
| B7 | Подпись ссылки на контакт не сверяется со словарём локали | low | английская подпись на русской странице прошла бы | patch — текст ссылки равен `privacy.contactForm` локали |
| B6+V2 | SEO страниц privacy проверено через помощники, а не через собранную страницу и sitemap | medium | verification-gap: удаление `alternates` в `pages/[locale]/[slug].astro:68` проходит все тесты; пробел существовал до переноса (тест исходника устроен так же), проверка собранных страниц — работа части D | defer — часть D |
| B8 | Вложенность оверлея проверяется регэкспом порядка, а не деревом | low | разбор дерева разметки — новая зависимость теста под маловероятную регрессию вёрстки; положение оверлея закрепят визуальные эталоны части D | reject |
