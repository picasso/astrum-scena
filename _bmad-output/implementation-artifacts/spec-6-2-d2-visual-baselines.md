---
title: 'Визуальные эталоны ядра на демо и reduced-motion смены иконки/логотипа'
type: 'feature'
created: '2026-10-30'
status: 'done'
baseline_commit: '822616e93551b46d6b604f169561c22ad23c6621'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-2-d1-demo-functional-e2e.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Критерий 6.2 (EH-47, S3): визуальные эталоны ядра снимаются с демо в обеих темах. После D1
у ядра есть только функциональные e2e, вид страниц ничем не закреплён. Из долга эпика 5 осталось два
пункта. Inset-тень баннера `.top-section__bg` не видна под непрозрачной картинкой. Сброс reduced-motion
для смены иконки и логотипа в приклеенной шапке ничем не проверен: в демо `sectionIcon: off`.

**Approach:** Часть D2 истории 6.2. Визуальный спек на Playwright из D1 снимает эталоны с демо, собранного
из tarball, в закреплённом Linux-образе. Эталоны создаются и обновляются только в Docker, а сравнивает
их CI-job `e2e`. Демо включает `sectionIcon`, браузерный тест проверяет сброс движения при смене
иконки и логотипа.

## Boundaries & Constraints

**Always:** Поверхности эталонов:
- главная, только тёмная (`fullscreen.astro` передаёт `forceDark`);
- страница альбома демо (баннер `top-section` и сетка);
- статья;
- документ `privacy`;
- открытый viewer на альбоме.

Альбом, статья и документ снимаются в `dark` и `light`. Ширины 375/1440/1920. Снимки делаются с
`reducedMotion: 'reduce'` после `document.fonts.ready` и декодирования картинок. Год копирайта
(`.fs-copyright`, `.site-footer__copyright`) маскируется. Маршруты и slug'и берутся из хелперов и
контента демо, литералов нет. Путь эталонов не зависит от платформы. CI их только сравнивает.
Изображения демо синтетические (AD-22).

**Never:**
- Эталоны harness-поверхностей (Gallery, MoreDocuments, `portfolio-visual`) — это отдельная часть harness.
- Live/R2.
- Эталоны, снятые на macOS.
- Включение e2e в `pnpm check`.
- Поправки поведения ядра ради стабильности снимков (кроме решения по тени).
- Ослабление порога сравнения ради прохода.

**Решение владельца 2026-10-30 (тень баннера, вариант «б»):** тень не чиним. Эталоны фиксируют
текущий вид баннера без видимой тени. Дефект оформляется пунктом `docs/backlog/bk18-banner-inset-shadow.md`:
починка (тень на слое над картинкой) перепишет все эталоны баннеров, её делают отдельно с явным диффом
эталонов. Код `top-section.*` в D2 не меняется.

## I/O & Edge-Case Matrix

| Сценарий | Вход / состояние | Ожидаемое | Ошибка |
|---|---|---|---|
| CI / Docker | `pnpm test:e2e:docker` | функциональные и визуальные спеки зелёные | расхождение → отчёт с диффом |
| Обновление | `pnpm test:e2e:docker:update` | эталоны переписаны в `e2e/__screenshots__/` | — |
| Хост не Linux | `pnpm test:e2e` на macOS | визуальный спек пропущен с подсказкой про Docker, остальные идут | — |
| Нет эталона в CI | новый снимок без PNG | падение, файл не создаётся | exit 1 |
| Reduced motion | `reduce`, ширина ≥1024, скролл до `[data-stuck]` | у иконки и логотипа `transition-duration` 0s и `left` 0 до и после | — |

</frozen-after-approval>

## Code Map

- `playwright.config.ts` — добавить `snapshotPathTemplate: 'e2e/__screenshots__/{testFileName}/{projectName}-{arg}{ext}'`,
  `expect.toHaveScreenshot.maxDiffPixelRatio: 0.01` и `updateSnapshots: isCI ? 'none' : 'missing'`.
  Проекты и `webServer` из D1 не трогать.
- Источник (только чтение, `$REFERENCE_SITE_ROOT/e2e/visual.spec.ts`, `portfolio-visual.spec.ts`):
  `settleFonts`, `applyTheme` (`data-theme` и `localStorage` с ключом `theme`), decode картинок, `VISUAL_WIDTHS`,
  маски копирайта. Хелперы harness не переносить.
- `e2e/helpers.ts` — `href`, `referenceLocale`, `viewportWidth`, загрузчики. Slug'и альбома и статьи
  читать из контента демо (`e2e/content.ts`); поверхности viewer взять из `e2e/viewer.spec.ts`.
- `package.json:14` — `test:e2e:docker`; рядом `test:e2e:docker:update` (`pnpm test:e2e --update-snapshots`).
  Образ и тот же digest. Тест `scripts/run-e2e.test.ts` сверяет версию образа и должен покрыть новую команду.
- `.github/workflows/ci.yml:62-90` — job `e2e` уже запускает `pnpm test:e2e` в образе. Добавить в
  артефакт при падении `test-results/` (диффы PNG).
- `packages/core/src/components/top-section.css:49`, `top-section.astro:76` — тень. В D2 не меняется,
  в backlog-пункте нужно указать эти места. Формат пункта такой же, как у `docs/backlog/bk16-menu-light-contrast.md`
  (на русском).
- `packages/core/src/components/site-header.astro:60-96` — `swapMode` при `sectionIcon: on`, логотипе и
  `sticky: on`. `site-header.css:85-152` — переходы и сброс reduced-motion.
- `demo/src/config/site.yaml:47` — `sectionIcon: on`. У пунктов меню демо иконки уже есть. Спеки D1
  после этого перепроверить.
- Учёт: `sprint-status.yaml` (`6-2-d2-visual-baselines`), `deferred-work.md` (запись D2 и два пункта
  эпика 5 — `closed_by`, родительская D — `partial_by`), `AGENTS.md` (обновление эталонов).

## Tasks & Acceptance

**Execution:**
- [x] `playwright.config.ts` -- путь эталонов, порог, `updateSnapshots` -- эталоны одни на все ОС, CI их не дописывает.
- [x] `e2e/visual.spec.ts` -- поверхности и темы из Boundaries; на не-Linux `test.skip` с подсказкой про Docker.
- [x] `e2e/header-swap.spec.ts` -- reduced-motion смены иконки/логотипа при ≥1024 (I/O), и что смена
  включена: иконка и логотип отрендерены.
- [x] `demo/src/config/site.yaml` -- `sectionIcon: on`.
- [x] `docs/backlog/bk18-banner-inset-shadow.md` -- дефект тени и как его чинить; запись эпика 5 о тени
  в `deferred-work.md` получает `closed_by` со ссылкой на BK18.
- [x] `package.json`, `scripts/run-e2e.test.ts` -- `test:e2e:docker:update`; тест образа видит обе команды.
- [x] `.github/workflows/ci.yml` -- `test-results/` в артефакт при падении.
- [x] `e2e/__screenshots__/visual.spec.ts/*.png` -- снять в Docker и просмотреть.
- [x] `AGENTS.md`, `sprint-status.yaml`, `deferred-work.md` -- учёт.

**Acceptance Criteria:**
- [x] `pnpm check`, `pnpm build`, `pnpm demo:packed` проходят; `pnpm test:e2e:docker` зелёный со всеми эталонами.
- [x] Повторный `pnpm test:e2e:docker` без изменений зелёный (снимки стабильны).
- [x] Если вернуть `left`/`transition` в сброс reduced-motion `site-header.css`, `header-swap.spec` падает.
- [x] Если сдвинуть цвет токена темы, визуальный спек падает в обеих темах.

## Design Notes

Порог `maxDiffPixelRatio: 0.01` взят из источника. На macOS визуальный спек пропускается, а не падает:
растеризация шрифтов там другая. Это закреплено тем, что CI и Docker работают на Linux. Каждый из
30 PNG — полный снимок страницы, кроме viewer. Эталоны переснимаются после фото 6.12.

## Verification

**Commands:**
- `pnpm test:e2e:docker` -- expected: зелёный, дважды подряд.
- `pnpm test:e2e` (macOS) -- expected: функциональные спеки зелёные, визуальный пропущен.
- `pnpm check && pnpm build && pnpm demo:packed` -- expected: зелёные.

## Implementation Notes

- Эталонов 30, а не 18: на каждую из трёх ширин — главная (1), каждый альбом демо (`coastal-light` —
  masonry, `geometry-studies` — justified), статья и `privacy` в двух темах (8) и viewer (1). Имена
  снимков альбомов — по id альбома. Viewer снимается один раз, в теме демо по умолчанию: его фон —
  фиксированный `--color-surface-fixed`.
- Визуальный спек идёт только в закреплённом образе Playwright (`PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`,
  его задаёт официальный образ; CI-job `e2e` работает в нём); на macOS и на Linux вне образа пропущен
  с подсказкой про Docker.
- Порог: кроме `maxDiffPixelRatio: 0.01` задан `threshold: 0.02` (порог цвета пикселя). С умолчанием
  0.2 сдвиг `--color-background` на 8 уровней в обеих темах проходил зелёным (pixelmatch не считает
  пиксель изменённым до ~50 уровней серого), критерий «сдвиг токена роняет спек» не выполнялся. С 0.02
  тот же сдвиг роняет все 18 снимков альбома, статьи и `privacy`. Это ужесточение, не ослабление.
- Эталоны сняты в образе на arm64 (Docker на Apple Silicon); CI — amd64. Прогон сравнения в том же
  образе под `--platform linux/amd64` зелёный и с порогом 0.02.
- `header-swap.spec` после закрепления проверяет, что шапка видна и стоит на `top: 0`, а после
  возврата наверх — что `data-stuck` снят и иконка/логотип вернулись. Второй тест без reduced motion
  ждёт, пока логотип встанет в `left: 0px` с opacity 1, а иконка уйдёт в opacity 0; `left: 100%` в
  правиле закреплённого логотипа роняет его.
- `header-swap.spec` идёт по статье: альбом на 1920×1080 не прокручивается настолько, чтобы сторож
  шапки ушёл из вьюпорта. Хелперы viewer вынесены из `viewer.spec.ts` в `e2e/viewer.ts`.
- Проверено: удаление `left: 0` или `transition: none` из сброса reduced-motion роняет `header-swap`;
  в CI-режиме (`CI=true`) отсутствующий эталон роняет тест, файл не создаётся. Строку матрицы
  закрепляет `scripts/run-e2e.test.ts` (`updateSnapshots` — `none` в CI, `missing` вне его).

## Spec Change Log

## Review Triage Log

Проход 1 (Codex: blind, edge-case, verification-gap; дифф от `822616e` без PNG).

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| B3+E2 | На нативном Linux визуальный спек пишет недостающие эталоны со своей растеризацией | medium | `e2e/visual.spec.ts` пропускал только `process.platform !== 'linux'`, а `updateSnapshots` вне CI — `missing`: хост с Linux вне образа создавал эталоны вопреки «только в Docker» | patch — пропуск вне образа (`PLAYWRIGHT_BROWSERS_PATH === '/ms-playwright'`, его задаёт официальный образ; CI-job идёт в нём) |
| B5 | Снимается только первый альбом (`masonry`), `justified`-сетка `geometry-studies` без эталона | medium | `const [album] = albums`; у альбомов демо `layout: masonry` и `layout: justified` (`demo/src/content/albums/*.yaml:8`) | patch — эталоны каждого альбома в обеих темах (+6 PNG, прежние 24 побайтно не изменились) |
| V1 | Включённый в демо swap без reduced motion ничем не проверен | medium | `header-swap.spec` и визуальный спек форсируют `reduce`; `left: 100%` в правиле `[data-stuck] … __brand` (`site-header.css:134-141`) проходил все тесты | patch — случай `no-preference`: после закрепления логотип на `left: 0px` с opacity 1, иконка 0; правка на `100%` роняет тест |
| B6 | Не проверено, что шапка закреплена и видна | low | `pin` проверял только `data-stuck` и стили детей | patch — шапка видима и её `top` в вьюпорте 0 |
| B7 | Тест не возвращается наверх | low | залипший `data-stuck` или сломанный обратный swap проходили | patch — скролл к началу: `data-stuck` снят, иконка/логотип в исходном состоянии без движения |
| B1 | В диффе нет PNG-эталонов | false | дифф ревью собран с `':!e2e/__screenshots__'`; эталоны лежат в рабочем дереве `e2e/__screenshots__/visual.spec.ts/` (30 файлов) и сравниваются Docker-прогоном | reject |
| B2+E1 | `image.decode().catch(() => null)` пропускает битые картинки в эталон | low | в режиме сравнения битая картинка расходится с хорошим эталоном и роняет тест; переписывание эталонов идёт только `test:e2e:docker:update` с просмотром диффа PNG (`AGENTS.md`), так что битая картинка не попадает в эталон незамеченной | reject |
| B4 | `maxDiffPixelRatio: 0.01` пропускает до ~36 тыс. пикселей на большом снимке | low | значение утверждено в Code Map (из источника); исчезновение элементов управления ловят функциональные спеки D1 (`home`, `menu-overlay`, `navigation`), цветовой сдвиг — `threshold: 0.02` | reject |
| B8 | Маска копирайта скрывает и правообладателя | low | текст копирайта и правообладатель из конфига проверены рендер-тестами ядра (`packages/core/src/components/shell.test.ts`); маскируется только блок с годом сборки | reject |

Патчи прохода 1 применены (тот же исполнитель). После патчей: `scripts/run-e2e.test.ts` зелёный,
`pnpm build`, `pnpm demo:packed` зелёные; `pnpm test:e2e:docker` — см. Verification.
