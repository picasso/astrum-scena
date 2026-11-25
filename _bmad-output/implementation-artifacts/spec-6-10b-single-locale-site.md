---
title: 'Одноязычный сайт: без переключателя, hreflang и свежести перевода'
type: 'feature'
created: '2026-11-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0661eb449c6463ed6c99a5d98d44325a96a1b888'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** после 6.10a данные одноязычного сайта валидны, но вывод ещё выдаёт двуязычие:
`buildLocaleMeta` при одной локали пишет `<link rel="alternate" hreflang>` (локаль и `x-default`),
меню-оверлей рисует блок языков из одной ссылки, а сборку демо с одной локалью ничто не проверяет
(критерии 6.10 №4 и №5 без локали вне en/ru).

**Approach:** при одной локали ядро не выводит ни альтернатив, ни языковых ссылок; сборщик
упакованного демо получает вариант с одной локалью (опорной): демо переводится на `locales: [en]`
без полей и файлов второй локали, собирается, и сборка проверяется по признакам одноязычности.

**Decisions:**
- Вариант с одной локалью — производный от демо в `scripts/build-demo-from-pack.ts` (как вариант без
  модуля курсов), а не второй закоммиченный сайт: контент не дублируется, CI гоняет его в
  `demo-site` и `e2e` через `pnpm demo:packed` и `pnpm test:e2e`. Playwright по нему не ходит.
- Критерий 6.10 №3 (e2e берут подписи из конфига и словарей) уже выполнен: `e2e/helpers.ts`
  выводит подписи из `demoConfig` и `loadDictionaries`, а правило ESLint `localeLiterals` для
  `e2e/**` (`eslint.config.mjs:238-241`) запрещает литералы и ключи `en`/`ru`. Правок не требует.
- Подвал страницы без локали (`/rights/`, `/status/`) при одной локали даёт одну ссылку на privacy
  без суффикса `(EN)` и без `hreflang`, как на обычной странице.

## Boundaries & Constraints

**Always:**
- Признак одноязычности — `site.content.locales.length === 1`; локали — только из конфига.
- Двуязычный вывод не меняется: e2e и визуальные эталоны зелёные без обновления PNG.
- Вариант восстанавливает демо в `finally`, как `withoutCoursesModule`; собирает в свой `outDir`
  внутри сайта и удаляет его.
- `pnpm check`, `pnpm build`, `pnpm demo:packed` зелёные.

**Never:**
- Не трогать `LOCALE_CATALOG`, тип `Locale`, третью локаль (6.10c).
- Не добавлять второй сайт-фикстуру и Playwright-прогон одноязычного демо.
- `/status/` не менять: таблица без свежести при одной локали уже есть (`site-status.astro:48-50`,
  тест `site-status.test.ts:182`).

## I/O & Edge-Case Matrix

| Сценарий | Вход | Результат |
|---|---|---|
| Две локали | `locales: [en, ru]` | альтернативы `en`, `ru`, `x-default`; оверлей с двумя языками — как сейчас |
| Одна локаль, мета | `buildLocaleMeta(p, o, ['ru'])` | `alternates: []`, `canonical` прежний |
| Одна локаль, оверлей | `localeSwitch` из одного элемента | блока языков (`nav` с `nav.language.label`) нет |
| Одна локаль, подвал `/rights/` | `locales: [en]` | одна ссылка `footer.privacy` без `(EN)` и `hreflang` |
| Сборка варианта | демо → `[en]` | нет `dist/ru/`, ни одного атрибута `hreflang` в HTML, на `/status/` нет `site-status__tone-translations`, все страницы `expectedDemoPages(['en'], albums)` есть |

</frozen-after-approval>

## Code Map

- `packages/core/src/lib/portfolio/page-meta.ts:24-40` — `buildLocaleMeta`: единственный источник
  `alternates` для всех страниц (`pages/[locale]/**`, `layouts/fullscreen.astro:25`, курсы);
  `html-shell.astro:144` рисует их. Тесты `page-meta.test.ts:50-64` пинят старое поведение — заменить.
- `packages/core/src/components/menu-overlay.astro:88` — условие `localeSwitch.length > 0` → `> 1`;
  покрывает оба вызова (`site-header.astro:118`, `layouts/fullscreen.astro:33`).
- `packages/core/src/components/site-footer.astro:63-66,150-163` — `privacyLocales` и ветка
  `localeNeutral`; тест подвала `shell.test.ts:~400-420`.
- Уже одноязычно, не трогать: `language-switcher.astro` (ничего при одной локали, тест
  `shell.test.ts:129`), sitemap без i18n (`index.ts:227`), `/status/`.
- Образец теста одной локали в компонентах: `shell.test.ts:121-133` (`buildSiteConfig`,
  `root.override` во временный каталог — словари демо называют обе локали).
- `scripts/build-demo-from-pack.ts:435-474` — образец `withoutCoursesModule` (сохранить тексты,
  `writeSiteFiles` из `loadSiteConfig`, отложить файлы, вернуть в `finally`); `:922-934` — образец
  сборки варианта в `buildPackedDemo`; `expectedDemoPages`, `loadDemoAlbums` — для проверки страниц.
- Что убирает вариант (опорная локаль из `content.referenceLocale`, остальные — лишние): ключи лишних
  локалей в конфиге сайта и в YAML `src/content/**` (альбомы, фото, `config/*.yaml`,
  `featured/home.yaml`) — объект, все ключи которого — локали сайта; файлы
  `src/content/**/*.<locale>.md(x)`; словарь `src/i18n/<locale>.yaml`.
- Тесты сборщика: `scripts/build-demo-from-pack.test.ts:560-655` — образец на фикстуре сайта.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/lib/portfolio/page-meta.ts` + тест — при одной локали `alternates: []`.
- [x] `packages/core/src/components/menu-overlay.astro`, `site-footer.astro` + `shell.test.ts` —
  нет блока языков в оверлее и одна ссылка privacy без суффикса при одной локали; двуязычные тесты
  прежние.
- [x] `scripts/build-demo-from-pack.ts` — `withOneLocale(site, action)` и `assertOneLocaleBuild(dist,
  site)`; шаг в `buildPackedDemo` после варианта без курсов.
- [x] `scripts/build-demo-from-pack.test.ts` — вариант на фикстуре: убирает ключи, файлы и словарь
  лишней локали, восстанавливает всё после `action` и после исключения; проверка сборки ловит
  `hreflang`, каталог лишней локали, метрику переводов и пропущенную страницу.
- [x] `CHANGELOG.md` `[Unreleased]`, запись 6.10b в `deferred-work.md` — `closed_by`, ключ
  `6-10b-single-locale-site` в `sprint-status.yaml`.

**Acceptance Criteria:**
- [x] `pnpm demo:packed` собирает вариант с одной локалью и проходит его проверку; демо после
  прогона побайтно прежнее (`git status` чистый в `demo/` при сборке из рабочего дерева).
- [x] Двуязычный вывод без изменений: `pnpm test:e2e:docker` зелёный без обновления эталонов.

## Implementation Notes

- `withOneLocale` пишет конфиг через `loadSiteConfig` → `keepLocale` → `writeSiteFiles`: тест
  `scripts/site-yaml-readers.test.ts` запрещает коду, кроме resolve, называть `site.yaml`.
- `keepLocale` считает локализованным любой непустой объект, все ключи которого — локали сайта; для
  демо верно, словарь с ключами-локалями был бы урезан тоже.
- Тесты одной локали в `shell.test.ts` копируют `src/generated/images-public.json` демо во временный
  корень: оболочка его читает.
- Прогоны: `pnpm check` (2508 тестов), `pnpm build`, `pnpm demo:packed` (вариант с одной локалью
  прошёл проверку, `demo/` чистый), `pnpm test:e2e:docker` (470 прошли, 60 пропущены, PNG без
  изменений).

## Spec Change Log

## Review Triage Log

### Проход 1 (Codex)

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|---|
| 1 | blind, edge | `CHANGELOG.md` обещает ссылку privacy в подвале `/status/`, а страница её скрывает | low | `pages/status.astro:32` передаёт `hidePrivacyLinks`; правка — одно слово | patch |
| 2 | blind | Проверка ловит только `hreflang=` в нижнем регистре | false | HTML пишет только Astro из шаблонов ядра, а они выводят атрибут `hreflang={…}` строчными без пробела (`html-shell.astro:144`, `menu-overlay.astro:96`, `site-footer.astro:156`, `language-switcher.astro`) | отклонено |
| 3 | blind | Метрика переводов опознаётся только по классу `site-status__tone-translations` | low | Переименование класса в `site-status.astro:106` молча ослабит проверку, но правка редкая, а сверка по структуре — новая логика | отклонено |
| 4 | blind | Столбец и сводка свежести могут появиться без метрики | false | Метрика, сводка, столбец и ячейки рисуются по одному флагу `hasTranslations` (`site-status.astro:50,104,138,150,160,206`); порознь не появляются | отклонено |
| 5 | blind | `withOneLocale` восстанавливает файлы до завершения асинхронного `action` | false | Единственный вызов передаёт синхронный `buildInto` (`spawnSync`), как и `withoutCoursesModule` | отклонено |
| 6 | blind | Упакованная сборка не проверяет блок языков в оверлее и ссылку privacy на `/rights/` | false | Обе регрессии выводят `hreflang` (`menu-overlay.astro:96`, `site-footer.astro:156`), а `assertOneLocaleBuild` отвергает любой `hreflang` в HTML | отклонено |
| — | vgap | Пробелов проверки нет | — | — | — |

## Verification

**Commands:**
- `pnpm check` — зелёный.
- `pnpm build`, `pnpm demo:packed` — зелёные, в выводе шаг варианта с одной локалью.
- `pnpm test:e2e:docker` — функциональные и визуальные спеки зелёные, PNG без изменений.
