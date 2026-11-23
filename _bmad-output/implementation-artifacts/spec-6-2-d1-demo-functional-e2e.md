---
title: 'Playwright и функциональные e2e ядра на демо из tarball'
type: 'feature'
created: '2026-10-30'
status: 'done'
baseline_commit: '72bb61e963a2c225c5332b1627999d4718e25ac7'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Критерий 6.2 (EH-47, AD-21): e2e ядра снимаются с демо, ожидаемое строится из конфига
демо. В ядре нет ни Playwright, ни e2e; работа viewer в production-сборке из tarball (остаток C) и SEO
собранных страниц документов ничем не проверены.

**Approach:** Часть D1 истории 6.2 (решение владельца 2026-10-30: D разделена на D1 и D2). Playwright
в корне репо гоняет функциональные спеки по демо, собранному из `pnpm pack`-tarball и поднятому
`astro preview`; CI — отдельный job в закреплённом Playwright-контейнере. Переносятся поведенческие
спеки исходника, где реальные slug'и и строки заменены значениями из конфига, контента и словарей демо.

## Boundaries & Constraints

**Always:** Сайт для e2e — только сборка из tarball (`build-demo-from-pack`), не workspace-сборка.
Ожидаемые значения — из `demo/src/config/site.yaml`, контента демо и словарей ядра через загрузчики
ядра; литералов slug'ов, подписей, `en`/`ru` в спеках нет (хелперы частичны по локалям). Селекторы —
роли, текст и существующие `data-*`; новые `data-testid` в ядро не добавляются. Образ Playwright
закреплён тегом и digest и совпадает с версией `@playwright/test`. Контент демо синтетический (AD-22).

**Never:** Визуальные эталоны, `toHaveScreenshot`, тень баннера, reduced-motion (D2). Live/R2-спеки.
Не менять поведение ядра ради тестов и не включать e2e в `pnpm check`. Не переносить систему
pass-маркеров CI исходника (6.8).

**Решения владельца 2026-10-30:** (1) harness-спеки (`gallery-harness`, `more-docs-harness`,
`portfolio-touch`), маршрут `e2e-harness`, `e2e-fixture.ts` и флаги `PORTFOLIO_E2E`/`MORE_DOCS_E2E`/
`IMAGES_E2E_*` в D1 не трогаются — отдельная часть: Gallery и MoreDocuments в контенте демо, спеки по
страницам демо, harness и флаги удаляются из ядра. (2) `contact.spec` и `security-headers.spec`
отложены до истории, где ядро поставляет Pages Function и деплой сайта (6.8). (3) Спек не режется
(~2,5–3 тыс. токенов, как прежние части).

## I/O & Edge-Case Matrix

| Сценарий | Вход / состояние | Ожидаемое | Ошибка |
|---|---|---|---|
| Локальный прогон | `pnpm test:e2e` | собирает демо из tarball в постоянный каталог, гоняет спеки | — |
| Повтор без сборки | `pnpm test:e2e --no-build` при собранном каталоге | спеки на готовой сборке | нет сборки → понятная ошибка, exit 1 |
| Нет локали в конфиге | демо с одной локалью (мутация конфига в юнит-тесте хелперов) | хелперы не дают подписи несуществующей локали | — |
| `/` | static preview без `_redirects` | спеки ходят на `/<referenceLocale>/` явно | — |

</frozen-after-approval>

## Code Map

- `scripts/build-demo-from-pack.ts:180-197` `main()` — tmp-каталог, удаляется без `--keep`; вынести
  `buildPackedDemo({ out })` с постоянным каталогом (`.cache/demo-packed/`, в `.gitignore` уже `.cache/`);
  CI-job `demo-from-pack` и тест `build-demo-from-pack.test.ts` не ломать.
- Исходник (только чтение, `$REFERENCE_SITE_ROOT`): `playwright.base.ts` (`defineE2EConfig`,
  `viewportProjects`, `previewServer`, VIEWPORTS), `playwright.config.ts` (порт 4322,
  `snapshotPathTemplate`), `e2e/helpers.ts` (`RouteDef`, `href`, `openMenu`/`closeMenu`, `labels.en`
  в `home.spec.ts:106,158` и `inner.spec.ts:269-274`), спеки `home`, `navigation`, `menu-overlay`,
  `inner` (slug'и `:12-15`, строки `Archive`/`Open`), `fonts` (регэкспы файлов `:3-4`),
  `footer-promo` (маршруты `:16-25`), `portfolio-harness` (viewer PhotoSwipe — переписать на альбомы
  демо `coastal-light`, `geometry-studies`), `package.json:32` (docker-команда).
- Ядро: `src/ui/hero-slider.tsx:165` (`window.__heroSwiper`), `lib/theme.ts` (`data-theme`, ключ
  `theme`), `components/theme-toggle.astro` (`data-theme-toggle`), `components/menu-overlay.astro`
  (`data-open`, `data-menu-inert`), `components/language-switcher.astro`, `lib/portfolio/viewer-data.ts`,
  загрузчик конфига и словари (`localizedLabel`, `languageName`).
- Демо: `demo/src/config/site.yaml` (локали `en`,`ru`, `referenceLocale: en`, меню из 4 пунктов,
  тема `dark`, viewer, `recentWorks`), курс `pages/night-sky-workshop.*` (`courseStatus: current`),
  статья `reading-the-light`, `privacy.*.mdx`, шрифты Ubuntu в `public/fonts`.
- Гейты для `e2e/`: `tsconfig.json` (`include` — добавить `e2e/**/*.ts`, `playwright.config.ts`),
  ESLint и Prettier (весь репо), `check:code-comments`, `check:identity`, `check:local-paths`;
  `.prettierignore` и `lint:md` — исключить `playwright-report`, `test-results`. Vitest не трогает
  `*.spec.ts`; Tailwind корень не сканирует.
- CI: `.github/workflows/ci.yml` — пины SHA с комментарием версии, 4 пробела, `node-version-file`.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/build-demo-from-pack.ts` + тест -- `--out <dir>` / `buildPackedDemo`; без флага
  поведение прежнее.
- [x] `package.json`, `pnpm-lock.yaml`, `playwright.config.ts`, `scripts/run-e2e.ts` + тест --
  `@playwright/test` точной версией; `test:e2e` (сборка + прогон, `--no-build`), `test:e2e:docker`;
  проекты 375/768/1440/1920, `astro preview` установленного сайта.
- [x] `e2e/helpers.ts` + юнит-тест -- маршруты, подписи и локали из конфига демо; подписи только
  активных локалей.
- [x] `e2e/{home,navigation,menu-overlay,inner,fonts,footer-promo,viewer}.spec.ts` -- перенос по
  Code Map; navigation проверяет `hreflang`-альтернативы и canonical страниц документов и их URL в
  sitemap.
- [x] `demo/src/content/pages/*` -- синтетические курсы для `inner` (архивный и черновик), если их нет.
- [x] `.github/workflows/ci.yml` -- job `e2e` в Playwright-контейнере (tag + digest), отчёт артефактом
  при падении.
- [x] `tsconfig.json`, `.prettierignore`, `package.json` (`lint:md`) -- гейты видят `e2e/`, не видят
  отчёты.
- [x] `sprint-status.yaml` (`6-2-d1-…`), `deferred-work.md` (`labels.en`, SEO документов — `closed_by`;
  C — `partial_by` для viewer), `AGENTS.md` (как запускать e2e) -- учёт.

**Acceptance Criteria:**
- [x] `pnpm check`, `pnpm build`, `pnpm demo:packed` проходят; `pnpm test:e2e` зелёный локально и в
  CI-job `e2e`. (CI-job не запускался: ветка не запушена; локально и в Docker-образе CI — зелёный.)
- [x] Viewer открывается со страницы альбома демо, листается и закрывается; изображения грузятся из
  `/media/`.
- [x] `rg -n "'(en|ru)'" e2e` пуст, и это закреплено правилом ESLint для `e2e/**`.
- [x] Тест сверяет версию образа Playwright в CI и `test:e2e:docker` с версией `@playwright/test`.

## Verification

**Commands:**
- `pnpm test:e2e` -- expected: зелёный; повтор с `--no-build` тоже.
- `pnpm check && pnpm build && pnpm demo:packed` -- expected: зелёные.

## Implementation Notes

- `astro preview`, запущенный AI-агентом, уходит в фоновый сервер и сразу завершается; `--ignore-lock`
  в `playwright.config.ts` держит его на переднем плане, где им владеет Playwright.
- Постоянная сборка `.cache/demo-packed/site` лежит внутри репо: у неё свой `pnpm-workspace.yaml`, но
  разрешение модулей Node/Vite может подняться до корневого `node_modules`, поэтому пропущенную
  зависимость ядра ловит только job `demo-from-pack` (сборка во временном каталоге). HTML и CSS обеих
  сборок совпадают, кроме случайных id островов.
- Перенесены reduced-motion-проверки исходника (подписи меню, scroll-анимации, autoplay слайдера);
  в D2 остаётся только смена иконки/логотипа. Тест плотности меню сверяет фиксированные значения CSS
  ядра (14/17px).
- Не перенесены проверки на реальном контенте исходника: wrap-around, галереи About, карточки
  MoreDocuments, «historical archive», отсутствие CTA записи, ссылка на контакты в текстах прав.
- Демо получило архивный курс `darkroom-basics` и черновик `meteor-watch`; `translatedFromDigest` RU
  посчитан `digestTranslationSource` ядра.
- Итог: `pnpm test:e2e` — 355 passed, 37 skipped по ширине; `pnpm test:e2e:docker` зелёный.

## Spec Change Log

## Review Triage Log

Проход 1 (Codex: blind, edge-case, verification-gap; diff от `72bb61e`).

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| V1+B5+E6 | Проба viewer принимает скрытые соседние слайды и плейсхолдер | medium | `e2e/viewer.spec.ts:32` берёт любой `.pswp img.pswp__img` с `naturalWidth > 0`; `visibility: hidden` у изображения или битая полная картинка при загруженном плейсхолдере проходят | patch — активный слайд (`aria-hidden="false"`), без `pswp__img--placeholder`, видим и загружен |
| B3+E4+Vo2 | Локально переиспользуется любой сервер на 4322 | medium | `playwright.config.ts:46` `reuseExistingServer: !isCI`: после пересборки тесты идут по уже запущенному (устаревшему или чужому) preview, вопреки «только сборка из tarball» | patch — `reuseExistingServer: false` |
| V2 | Код выхода раннера при падении Playwright не проверен | medium | `scripts/run-e2e.ts:47` ставит `exitCode = 1` в `catch`; тесты покрывают только разбор аргументов и `missingBuild`, удаление строки ничего не роняет | patch — подпроцессный тест с падающей командой |
| B1+E1+Vo1 | `--out` удаляет `<out>/site` и все `.tgz` без проверки владения | low | `scripts/build-demo-from-pack.ts:202-204`; комментарий над функцией обещает, что опечатка в `--out` «не сотрёт дерево», а `site/` стирается рекурсивно | patch — честный комментарий (что именно удаляется); маркер владения — новая ветка под ручной флаг разработчика |
| B6 | Сетка альбома сверяется только с `length > 1` | low | `e2e/viewer.spec.ts:50-51`: выпавшее из сетки фото проходит | patch — набор id сетки равен набору фото альбома |
| B7 | «Разные страницы — разные наборы» сравнивает URL с префиксом локали | low | `e2e/footer-promo.spec.ts:80-86`: `ROUTES` идут в разных локалях, поэтому наборы различаются одним префиксом | patch — снимать `LOCALE_PATH_PREFIX`, как в соседнем тесте |
| B8 | Латинский тест шрифтов не требует загруженного начертания | low | `e2e/fonts.spec.ts:83-88` проверяет только запросы; кириллический — ещё и `hasLoadedFace` | patch — `hasLoadedFace(page, FAMILY.latin)` |
| E8 | ESLint не игнорирует `playwright-report/`, `test-results/` | low | `eslint.config.mjs:154-164`: HTML-отчёт (`--reporter=html` или `CI=1` локально) несёт JS трейс-вьюера, `pnpm check` на нём падает | patch — добавить оба каталога в ignores |
| B2+E2 | Параллельные прогоны делят `.cache/demo-packed/` | low | раннер — ручная команда разработчика, CI запускает один job `e2e` на свой checkout (`ci.yml:61`); блокировка — новая ветка | reject |
| B4+E3 | `JSON.stringify` не экранирует `$()` в пути | low | путь собирается из корня репо и фиксированного `.cache/demo-packed/site` (`build-demo-from-pack.ts:30-32`); подстановка возможна только при `$(`/backtick в пути checkout; экранирование — новая ветка | reject |
| E5 | Внешний origin с путём `/media/` проходит `photoIdOfImage` | low | URL изображений строит то же `imageUrlBase(config)` ядра (`lib/images/public-config.ts`), проекция `publicPath` закреплена тестами C2b (`public-config.test.ts`, `html-shell.test.ts`); сравнение с origin страницы — новый параметр | reject |
| E7 | Ветки `copyright`/`moreInfo: off` не проверяют отсутствие элементов | low | в демо обе опции `on` (`demo/src/config/site.yaml:229-230`), off-ветка не исполняется на этом конфиге | reject |
| B9 | Поведение слайдера проверяется только в опорной локали | low | `ui/hero-slider.tsx` не ветвится по локали, подписи приходят пропсами из словаря, полнота словарей — `i18n/ui.test.ts`; параметризация — рост числа тестов без новой ветки кода | reject |
| B10 | Проверка разбиения заголовка смотрит только на акцентное слово | low | перенесена из исходника как есть; текст слайдов закреплён `lib/featured.test.ts` (A5c), проверка разбиения потребовала бы повторить логику `hero-slider.tsx` в спеке | reject |

Патчи прохода 1 применены; для подпроцессного теста раннера `PACKED_DEMO_DIR` читает `E2E_DEMO_DIR`
(задаёт только `scripts/run-e2e.test.ts`). После патчей: `pnpm check`, `pnpm build`, `pnpm demo:packed`
зелёные; `pnpm test:e2e` и `--no-build` — 355 passed, 37 skipped.
