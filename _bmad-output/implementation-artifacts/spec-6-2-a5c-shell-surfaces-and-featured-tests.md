---
title: 'Тесты оболочки, поверхностей контента, featured и корпуса ссылок на демо'
type: 'test'
created: '2026-10-29'
status: 'done'
baseline_commit: 'e4ef37dbd3630d97544464147bf1b1019eec8ff6'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-2-a5b-component-render-tests.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Критерий 6.2: тесты исходника на реальном контенте переписаны на фикстуры демо. Последние
четыре (`components/{shell,content-surfaces}`, `lib/featured`, `lib/blocks/links/corpus`) в ядро не
перенесены: оболочка (шапка, подвал, `HtmlShell`, `Base`, `Fullscreen`), список альбомов и «ещё
документы» рендерятся без проверки, а у резолвера featured в ядре только часть случаев исходника.

**Approach:** Часть A5c истории 6.2 (A5 = A5a + A5b + A5c; решение владельца 2026-10-29). Приёмы A5a/A5b:
синглтоны `config/site.ts` и `config/seo.ts` — `vi.mock` + `buildSiteConfig`, коллекции — мок
`astro:content`, корень демо — `siteRoot`, файлы ядра — `CORE_ROOT`/`import.meta.url`; реальные id,
slug'и и названия — id демо или синтетика. `lib/featured` сливается с синтетическим тестом ядра. Для
корпуса ссылок в статью демо `reading-the-light` (обе локали) добавляется `:::links` (решение
владельца: семантика списка на демо); сверка с замороженной выгрузкой остаётся в исходном репо.

## Boundaries & Constraints

**Always:** Тесты в `pnpm check` (проект `core`). Ни путей, slug'ов, названий и текстов исходного сайта
(AD-22); ожидаемое — из конфига демо, словарей ядра или фикстуры (AD-21). Внешние ссылки в демо — только
хосты из `PUBLIC_HOSTS` (`example.com` и т. п.). Не перенесённый или устаревший случай — в
Implementation Notes с причиной; дубль существующего теста ядра не переносится.

**Never:** Не менять код ядра ради прохождения; дефект — в Implementation Notes и находкой ревью. Не
трогать исходный сайт. Контент демо меняется только блоком ссылок в `reading-the-light`.

</frozen-after-approval>

## Code Map

- Источники (`$REFERENCE_SITE_ROOT/src/`, только чтение): `components/shell.test.ts` (585 строк),
  `components/content-surfaces.test.ts` (324), `lib/featured.test.ts` (503), `lib/blocks/links/corpus.test.ts` (66).
- `shell` → новый `components/shell.test.ts`: `footer-curve`, `language-switcher`, `site-header`,
  `site-footer`, `layouts/{html-shell,base,fullscreen}.astro`. Синглтоны — как в исходнике
  (`config/fixtures/site-config.ts`). Баннер — `resolveSurfaceMedia(manifest, 'morning-ridge', 'bannerHero')`
  на `lib/images/__fixtures__/s9-ladder-manifest.json` (как `top-section.test.ts`); вложенный маршрут — альбом
  демо `coastal-light`; заголовки — синтетика. Шрифты: ожидаемое — `fontPreloads(localeScript(lang))`
  (`theme/fonts.ts`). Подписи privacy и языков — из `useTranslations`, не литералами. `footerPromo` —
  `footerPromoContext` (`lib/portfolio/footer-promo-build.ts`). Дубли: preconnect — `layouts/html-shell.test.ts`;
  логотипы — `brand-logo*.test.ts`.
- `content-surfaces` → новый `components/content-surfaces.test.ts`: `portfolio/album-list.astro`,
  `content/more-documents.astro`, `site-footer.astro`. Промо подвала резолвит фото через
  `loadImageCatalog(siteRoot)` — в моке `astro:content` фото и альбомы только из активного релиза демо
  (`amber-dunes`, `graphite-lines`, `long-horizon`, `quiet-tower`, `still-square`, `wide-tide`; альбомы —
  `coastal-light`, `geometry-studies`); «ещё документы» — статья демо `/en/articles/reading-the-light/`.
- `featured` → дописать `lib/featured.test.ts` на его синтетическом снимке (`northland`, `sunrises`,
  `field-notes`, `about-light`, `course-light`; фикстуры `content/__fixtures__/featured-{home.yaml,images-ladder.json}`):
  `albumAccent`, текст из фото (`copySource: media`, en/ru), фото вне манифеста, `genericAlt`, пустое
  описание, обложка вне альбома, excerpt и ссылка документа, `media` без вызова excerpt, нет excerpt,
  черновик, нет локали, inline-копия; схема — inline-правила, документ с `photoSlug`, дубли id.
  Устарел случай «документ без `photoSlug` отвергается схемой»: ядро берёт `coverId` (`d95091e`,
  ADR-0013), принятие уже в `lib/content/schemas.test.ts:278`, отказ без обложки — в `featured.test.ts`.
  `loadFeaturedHome`: в `lib/featured-home.test.ts` проверка `slides.length > 0` усиливается до равенства
  разобранной фикстуре.
- `corpus` → новый `lib/blocks/links/corpus.test.ts`: тела `reading-the-light.{en,ru}.md` из `siteRoot`,
  процессор `createSatteriMarkdownProcessor` с `[calloutMdastPlugin, noteMdastPlugin, linksMdastPlugin]`
  (порядок `index.ts:153`), ссылки — `extractLegacyLinks` (`lib/content/legacy-links.ts:319`). Без
  `expected-link-hrefs.json`. Синтаксис — `lib/blocks/links/render.test.ts` (его случаи не дублировать).
- Демо: `demo/src/content/articles/reading-the-light.{en,ru}.md` — в конце блок `:::links` (2–3 ссылки на
  `example.com`/`example.org`) и следом `:::note`, чтобы пара шла через оба плагина. Опорная локаль — `en`:
  `translatedFromDigest` в ru пересчитать `digestTranslationSource` (`lib/content/translation-freshness.ts:19`)
  от нового тела en (CLI `translation-marker` ещё нет).

## Tasks & Acceptance

**Execution:**
- [x] `demo/src/content/articles/reading-the-light.{en,ru}.md` -- блок ссылок и заметка; дайджест ru.
- [x] `packages/core/src/lib/blocks/links/corpus.test.ts` -- корпус на статье демо.
- [x] `packages/core/src/lib/featured.test.ts`, `packages/core/src/lib/featured-home.test.ts` -- слияние.
- [x] `packages/core/src/components/shell.test.ts` -- перенос на фикстуры.
- [x] `packages/core/src/components/content-surfaces.test.ts` -- перенос на релиз и контент демо.
- [x] `deferred-work.md` (A5c и A5 — `closed_by`), `sprint-status.yaml` -- учёт.

**Acceptance Criteria:**
- [x] `pnpm check`, `pnpm build` и `pnpm demo:packed` проходят; четыре перенесённых теста входят в проект `core`.
- [x] Корпусный тест падает, если убрать `linksMdastPlugin` или блок `:::links` из статьи демо (проверено
  временной правкой, записано в Implementation Notes).
- [x] `pnpm check:identity` зелёный; id, slug'и и названия в изменённых тестах — из демо, фикстур ядра
  или синтетики (сверка `rg` по id исходника — доказательство в Implementation Notes, не гейт).
- [x] Каждый не перенесённый или устаревший случай назван в Implementation Notes с причиной.

## Implementation Notes

- Код ядра не менялся. `pnpm check` (1661 тест, 147 файлов), `pnpm build`, `pnpm demo:packed` и
  `pnpm check:identity` зелёные. Тесты `scripts/` с `git init` во временном каталоге падают только в песочнице
  агента (запрет записи в `.git/hooks`), вне неё проходят.
- Демо: в конце `reading-the-light.{en,ru}.md` — `:::links` (три ссылки на `example.com`/`example.org`, одинаковые
  адреса в обеих локалях) и `:::note{claim="demo-light-table:0a1b2c3d"}`. Заметка в канонической форме errata,
  поэтому `stripManagedNoteRegion` её вырезает и дайджест считается от тела без неё. Прежний
  `translatedFromDigest` ru совпадал с `digestTranslationSource` старого тела en (конвенция подтверждена), новый —
  `04bd8f4c…db6c0` от нового тела en; на собранном `/status/` нет `outdated`/`unverified`. В `dist` обеих
  локалей статьи — `links__list` и `note note--`.
- `corpus`: файлы — по `content.locales` конфига демо (`loadSiteConfig(siteRoot)`); процессор с тремя плагинами
  в порядке `index.ts`. Сверх исходника: нет диагностик `extractLegacyLinks`, ссылок больше нуля, заметка
  отрисована, адреса ссылок одинаковы во всех локалях. Случай «инвентарь равен `expected-link-hrefs.json`» не
  перенесён: сверка с замороженной выгрузкой остаётся в исходном репо (решение владельца).
- Проверка временной правкой (откачена): без `linksMdastPlugin` оба теста локалей падают
  (`expected +0 to be 1` — нет `links links--`); без блоков `:::links` в обеих статьях — падают
  (`expected 0 to be greater than 0`).
- `featured`: в синтетический снимок добавлено опубликованное фото `unsliced-dawn`, которого нет в
  `featured-images-ladder.json`. Перенесены: ссылка альбома с подписью, `albumAccent` (документ остаётся `alt`),
  текст из фото en/ru, фото вне манифеста, `genericAlt`, пустое описание, обложка вне альбома, excerpt и ссылка
  документа (обе локали), `media` без вызова excerpt, нет excerpt, черновик, нет локали, inline-копия; схема —
  inline-правила, документ с `copySource: media` и `photoSlug`, дубли id (по сообщению). Курс уже был в тесте
  ядра — не дублировался. Устарел «документ без `photoSlug` отвергается схемой» (ядро берёт `coverId`, `d95091e`,
  ADR-0013; принятие — `schemas.test.ts:278`, отказ без обложки — `featured.test.ts`). `loadFeaturedHome`:
  в `featured-home.test.ts` результат равен разобранной фикстуре; отдельный случай исходника не нужен.
- `shell`: перенесены все 38 случаев. Баннер — `morning-ridge` фикстуры, вложенный маршрут
  `/en/portfolio/coastal-light/`, заголовки синтетические («Quiet Notes», «Harbour Mornings»). Шрифты — по
  `fontPreloads(localeScript(lang))` для обеих локалей плюс случай «у latin и cyrillic разные файлы» вместо
  литералов путей; имя языка — `languageName`, подписи privacy — `useTranslations`; `footerPromo` —
  `footerPromoContext`. Случаев preconnect и логотипов в исходном тесте нет, дублей с
  `layouts/html-shell.test.ts` и `brand-logo*.test.ts` не возникло.
- `content-surfaces`: мок `astro:content` — альбомы и фото `loadContentSnapshot(siteRoot)` (только активный релиз
  демо); `AlbumList` — на альбомах демо, ожидаемые href и названия выводятся из снимка; «ещё документы» —
  статья демо `/en/articles/reading-the-light/` (href через `articleHref`, заголовок из снимка). Подписи
  «Russian» и «Последние работы» — из `languageName`/`useTranslations`. Усилено: при частичном исключении
  в промо остаётся хотя бы одно неисключённое фото; ссылка промо ведёт в альбом демо.
- Сверка `rg` по id и названиям исходника (`good-morning-mordor`, `snow-ice-water-stones`, `lonely-umbrella`,
  `sky-reflections`, `iceland`, `amazing-japan`, `sunrises-for`, `there-is-no-spoon`, `symmetry-of-sound`,
  `divine-light`, `eyes-of-japan`, `to-see-and-turn-to-stone`, «Mordor», «Исландия», «Симметрия», «Рассветы для»,
  `expected-link-hrefs`, `process.cwd()`) по пяти изменённым тестам и статье демо — пусто.

- Патчи ревью (проход 1): все восемь patch-находок закрыты в тестах, код ядра не менялся; `pnpm check`
  (1662 теста), `pnpm build`, `pnpm demo:packed` зелёные. Контейнер Astro 7.4 берёт `i18n` только из
  `manifest` (`astro/dist/container/index.js:56`), `astroConfig.i18n` игнорирует, а остальные поля манифеста
  заполняет умолчаниями — поэтому в `shell.test.ts` манифест только с `i18n` приводится к `SSRManifest`.
  В `privacy-render.test.ts` (A5b) `astroConfig.i18n` тоже ни на что не влияет, но тест корректен: контролёр
  берёт локаль из `Astro.url.pathname` (`privacy-controller.astro:8`), а не из `Astro.currentLocale`.

## Spec Change Log

## Review Triage Log

Проход 1 (Codex: blind, edge-case, verification-gap; diff от `e4ef37d`).

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| B3+V1 | Текущий альбом проверяется счётом маркеров, а не их принадлежностью ссылке `currentAlbumId` | medium | verification-gap: предикат «первый альбом» проходит тест; страница альбома (`pages/[locale]/portfolio/[album].astro:58`) объявила бы текущим чужой альбом | patch — оба маркера на ссылке выбранного альбома, на остальных их нет |
| B5+V2 | Inline-копия проверена только на альбоме; ветка документа (`featured.ts:237`) не исполняется | medium | verification-gap: удаление inline-ветки документа проходит все тесты | patch — inline-слайд статьи с `throwingExcerpt`, en/ru |
| B1 | Шрифты сверяются с теми же `fontPreloads`/`localeScript`, что использует оболочка | medium | `fonts.test.ts:157` проверяет лишь два файла семейства, не начертания 400/700 и не связь локали со скриптом; перестановка en/ru в `LOCALE_CATALOG` или preload italic прошли бы | patch — `en` → `latin`, `ru` → `cyrillic`, файлы preload — начертания `regular` и `700` |
| B2 | `Fullscreen` в контейнере без `i18n` рендерит `/ru/` на локали по умолчанию | medium | `fullscreen.astro:22` берёт `Astro.currentLocale`, которого без маршрутизации нет (`gallery.render.test.ts:48`); canonical из пути маскирует это | patch — контейнер с `astroConfig.i18n` (как `privacy-render.test.ts:42`), проверка `<html lang>` и `og:locale` |
| B9+E1+E2 | Сравнения `indexOf` проходят при отсутствии элемента (`-1`) | low | `shell.test.ts` (порядок баннера, шапки, `<main>`) и `content-surfaces.test.ts` (копирайт над колонками): пропавший баннер или копирайт проходит | patch — сначала наличие, затем порядок |
| B7+E3 | Адрес и подпись ссылки корпуса проверяются раздельно | low | перестановка подписей между адресами проходит `corpus.test.ts` | patch — пара `href` и подпись в одном `<a>` |
| B8 | Корпус считает классы, а не элемент списка | low | `div.links__list` прошёл бы; нормализация в `<ul>` есть в `render.test.ts`, но корпус её не держит | patch — счёт `<ul class="links__list">` |
| B6 | Описание фото при `copySource: media` не проверяется | low | фото снимка без `description` (`featured.ts:93`); пустое описание прошло бы | patch — описание у фото снимка и проверка `desc` en/ru |
| B4 | Сворачивание `AlbumList` от `albumList.collapseFrom` не рендерится ни одним тестом | low | `album-list.astro:30`; в демо два альбома, в тесте исходника случая нет — пробел существовал до переноса | defer |
| B10 | Implementation Notes повторяют id и названия исходника как доказательство сверки | false | правка этой спеки — не исправление кода (правило триажа); `_bmad-output` до 6.9 не сканируется гейтом идентичности (`AGENTS.md`), а в 6.9 планирование о сайте уходит в его приватный репо до orphan-коммита | reject |

## Verification

**Commands:**
- `pnpm check`, `pnpm build`, `pnpm demo:packed` -- expected: зелёные.
