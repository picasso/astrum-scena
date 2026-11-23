---
title: 'Вторая локаль и текстовый контент демо'
type: 'feature'
created: '2026-10-27'
status: 'done'
baseline_commit: 'acdfe8976e83d5d7ab626f67ff2e8c55dd089b6f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Критерий 6.2 «демо покрывает публичный API» требует, чтобы каждый маршрут ядра
рендерился на синтетическом контенте обеих локалей. Сейчас в демо одна локаль (`en`), нет страниц,
статей и курсов. Главная без `featured/home.yaml` — пустой полноэкранный блок без заголовка. Подвал и
форма контактов ссылаются на `/{locale}/privacy/`, которой нет.

**Approach:** Часть C1 истории 6.2. В демо добавляется локаль `ru` и синтетические документы:
страница `privacy`, статья, курс и `rights.ru.md`. У главной без `featured` появляется доступный
запасной вид. Сборка демо из tarball проверяет страницы документов в обеих локалях.

**Решение владельца (2026-10-27):** C делится на C1 (этот спек), C2 (изображения демо: функция
нарезки в ядре, поле `publicPath`) и C3 (долг эпика 5: `mediaSource` и мёртвый код). Альбомы, фото и
слайдер главной — C2.

## Boundaries & Constraints

**Always:** Весь контент синтетический, без имён, мест и брендов реального сайта (AD-22). Тексты
`ru` — для всех полей, которые требует `site-schema.ts:595-613`. Запасная главная берёт заголовок из
`identity.title`, а ссылки — из `menu.items`; литералов локалей и новых строк вне словарей нет.
Цвета — токены, правила в слое (`check:color-literals`, `check:css-layers`). Новая проверка входит
в `pnpm check` или CI.

**Never:** Не добавлять фото, альбомы, `featured/home.yaml`, деривативы и `coverId` (C2). Не менять
схемы контента, `mediaSource` и маршрут `e2e-harness` (C3, D). Не трогать исходный репо.

## I/O & Edge-Case Matrix

| Сценарий | Вход / состояние | Ожидаемое | Ошибка |
|---|---|---|---|
| Главная без `featured` | нет `src/content/featured/home.yaml` | `<h1>` с `identity.title` локали и навигация по `menu.items` поверх полноэкранного фона | — |
| Главная со слайдером | файл есть | слайдер как раньше, запасного вида нет | — |
| Нет страницы документа | в `dist` нет `ru/privacy/index.html` (или статьи, курса) | `pnpm demo:packed` падает | перечень отсутствующих страниц |

</frozen-after-approval>

## Code Map

- `demo/src/config/site.yaml` -- `content.locales` (`:12-15`), тексты `identity`, `menu.items[].label`,
  `social[].label` пока только `en`; `privacy.controller` и `seo.yaml` уже двуязычны.
- `demo/src/content/legal/rights.en.md` -- образец; `rights.astro:25` падает без файла каждой локали.
- Документы: `<key>.<locale>.md|mdx` в `src/content/{pages,articles}/` (`locale-schema.ts:23`);
  схемы -- `lib/content/schemas.ts:283-325`. Поля только для эталонной локали: `publishedAt`, `kind`,
  `courseStatus`, `coverId`, `unlisted` (`integrity.ts:89-96`). Курс -- страница с `kind: course` и
  `courseStatus`. Опубликованной статье нужен `publishedAt` (`integrity.ts:204`).
- `components/content/privacy-controller.astro` -- MDX-компонент `<PrivacyController />` из
  `mdx-components.ts`. Ссылки на `privacy`: `site-footer.astro:136,144`, `contacts.astro:145`.
- `packages/core/src/pages/[locale]/index.astro:21` -- при отсутствии `featured` рендерит пустой
  `<Fullscreen>`. Оверлеи `fullscreen.astro` (язык, соцсети, гамбургер) не меняются.
  Стили -- `layouts/fullscreen.css` (`@layer components`, `--color-on-image`).
- Образец рендер-теста -- `components/brand-logo.test.ts` (`AstroContainer`; корень Vite -- демо).
- `scripts/build-demo-from-pack.ts:28-37,72-81` -- `expectedCorePages` проверяет только индексы;
  тест -- `scripts/build-demo-from-pack.test.ts`.
- Тесты с `locales: ['en']` (`site-status.test.ts`, `site.test.ts` и др.) синтетические и демо не
  читают.

## Tasks & Acceptance

**Execution:**
- [x] `demo/src/config/site.yaml` -- добавить `ru` в `content.locales` и русские тексты во все
  локализованные поля.
- [x] `demo/src/content/pages/privacy.{en,ru}.mdx` -- синтетическая политика с `<PrivacyController />`.
- [x] `demo/src/content/articles/<key>.{en,ru}.md`, `demo/src/content/pages/<key>.{en,ru}.md`
  (`kind: course`, `courseStatus: current`) -- по одной статье и курсу; `legal/rights.ru.md`.
- [x] `packages/core/src/components/home-fallback.astro` (+ CSS в слое, токены) и `index.astro` --
  запасной вид главной; рендер-тест рядом, по образцу `brand-logo.test.ts`.
- [x] `scripts/build-demo-from-pack.ts` + тест -- проверять страницы документов демо в каждой
  локали (`privacy/`, статья, курс).
- [x] `demo/README.md` -- описать две локали и документы; фото по-прежнему нет (C2).
- [x] `_bmad-output/planning-artifacts/epics.md` (список частей 6.2) и `sprint-status.yaml` --
  C → C1/C2/C3 с решениями владельца; `deferred-work.md` -- отметки `closed_by`/`partial_by`.

**Acceptance Criteria:**
- [x] `pnpm build` и `pnpm demo:packed` проходят. В `dist` есть главная, индексы портфолио, статей
  и курсов, контакты, `privacy`, статья и курс для `en` и `ru`, а также `rights/` и `status/`.
- [x] Ссылки на `privacy` из подвала и формы контактов ведут на существующие страницы.
- [x] Рендер-тест: главная без `featured` содержит `<h1>` с заголовком сайта и ссылки разделов.
- [x] `pnpm check` проходит, включая `check:identity` и `check:local-paths`.

## Implementation Notes

- Документы демо: `privacy` (MDX), статья `reading-the-light`, курс `night-sky-workshop`; их адреса
  перечислены в `DOCUMENT_PAGES` скрипта сборки из tarball, сообщение об ошибке — «dist lacks demo
  pages». Переводы `ru` несут `translatedFromDigest`, посчитанный от текущих тел `en` функциями ядра
  (`pairSourceDigest`, `confirmTranslatedFromDigest` в `lib/content/translation-marker.ts`) разовой
  командой: библиотечный писатель маркера есть, CLI-команды для него пока нет.
- В меню демо добавлен раздел `courses`, чтобы курс был доступен из шапки, подвала, оверлея и
  запасной главной.
- Рендер-тест рендерит сам маршрут главной (`pages/[locale]/index.astro`) в обеих локалях демо и
  разбирает HTML через `parse5` (зависимость ядра): `jsdom` без типов ломает typecheck, а окружение
  vitest `jsdom` лишает `AstroContainer` рендерера. Проверки — только внутри `.home-fallback`;
  подмена локали ссылок валит тест (проверено мутацией).
- Удаление одного перевода опубликованного документа валит сборку раньше проверки страниц — гейтом
  целостности `locale-gap` в `astro:config:setup`.
- Аудит матрицы: ветку со слайдером покрывает `components/home-slider.test.ts` (подмена
  `loadFeaturedHome` и заглушка `components/test-fixtures/hero-slider-stub.astro`, каталог исключён из
  пакета и Tailwind); падение на отсутствующей странице — `assertDemoPages` в
  `scripts/build-demo-from-pack.ts` и его тест на временном `dist`.

## Spec Change Log

## Review Triage Log

Проход 1 (Codex: blind, edge-case, verification-gap; diff от `acdfe89`).

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| B5+V1+E3 | Тест запасной главной ищет href и подписи по всей странице и сверяет заголовок регэкспом из конфига | medium | `menu-overlay.astro:78` рендерит те же ссылки; подмена `localizedHref('ru', …)` в запасном виде проходила тест | patch — разбор `parse5`, проверки внутри `.home-fallback` |
| B1+E1 | Центрирование в `100dvh` при `overflow: hidden` у `.hero-fullscreen` обрезает блок на низких экранах и при масштабе | low | `fullscreen.css:6-9` — прокрутки нет | patch — `overflow-y: auto`, `safe center`, отступы |
| B2+E2 | Длинное слово в заголовке или подписи выходит за экран | low | ширина не ограничена, переносов нет | patch — `overflow-wrap: anywhere`, `max-width: 100%` |
| B3 | Курс недоступен из навигации: в `menu.items` нет `courses` | low | шапка, подвал, оверлей и запасная главная строятся из `menu.items` | patch — пункт `courses` (иконка `person`) |
| B4 | Текст `privacy` обещает доставку сообщений и запросы через форму, которой в демо не на что отправлять | low | у демо нет эндпоинта формы; первый абзац говорит, что сообщения никто не читает | patch — форма описана как демонстрационная, анонс поправлен |
| B7 | В заметках сказано, что писателя `translatedFromDigest` нет; `/status/` показывает три неактуальных перевода | low | `confirmTranslatedFromDigest`/`pairSourceDigest` в `translation-marker.ts:132,150` | patch — маркеры посчитаны функциями ядра; `/status/`: 0 неактуальных |
| B6 | Сборка из tarball не проверяет, что `PrivacyController` что-то рендерит | false | рендер-тест `components/content/privacy-render` на фикстурах демо уже в записи A5 `deferred-work.md` («17 тестов исходника…»); C1 проверяет существование страниц и ссылок | reject |

## Verification

**Commands:**
- `pnpm check` -- expected: все группы зелёные.
- `pnpm build` -- expected: ядро и демо собираются, в логе страницы `en/*` и `ru/*`.
- `pnpm demo:packed` -- expected: «demo built from the packed …», нет «dist lacks core pages».
