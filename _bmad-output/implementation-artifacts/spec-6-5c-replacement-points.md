---
title: 'Именованные точки замены визуальных частей и контракт SVG-логотипа (6.5, часть C)'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: '234087de491f97e8cb2fb9bb51ce017ad038c972'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** сайт может поменять вид только темой, конфигом и словарями: заменить визуальную часть
(знак бренда в шапке) нельзя иначе, чем форком компонента ядра, а форк молча ломается при обновлении
ядра и теряет поведение оболочки (ссылка, закрепление шапки, переключение иконки и логотипа,
переходы ClientRouter) (AD-24). Логотип по умолчанию держит в `site-logo.astro` жёсткий список из
пяти `id` фрагментов, а SVG демо объявляет два — три `<use>` ничего не рисуют, и контракт файла
логотипа нигде не записан.

**Approach:** третья, последняя часть 6.5. Ядро документирует небольшой список именованных точек
замены с типизированными пропсами; сайт подставляет свой компонент для точки, а оболочка и её
поведение остаются у ядра. Неизвестное имя точки — ошибка сборки с файлом и списком известных. Демо
показывает одну замену, e2e доказывает сохранение взаимодействия, клавиатуры и переходов
ClientRouter. Контракт SVG-логотипа сайта решается здесь.

**Decisions (владелец, 2026-11-12):** 6.5 делится на части A (i18n), B (токены темы), C (точки
замены); C опирается на контракт токенов B.
- Первый список — две точки: `logo` (знак бренда в слоте логотипа шапки и в баннере; оболочка —
  ссылка, закрепление, переключение иконки и логотипа) и `footer-copyright` (содержимое строки
  копирайта подвала; элемент `.site-footer__copyright` остаётся у ядра).
- Замена объявляется файлом `src/overrides/<point>.astro` в корне сайта; `astro.config` остаётся одним
  вызовом, типы пропсов сайт импортирует из `@picasso-ai/astrum-scena` (`import type`).
- Логотип по умолчанию выводит слои из SVG сайта при сборке: `<use>` для каждого `id` верхнего уровня
  в порядке документа; жёсткий список `id` уходит, пустые `<use>` демо исчезают, вид не меняется.
  Контракт файла: каждый `id` верхнего уровня — слой логотипа.
- Демо заменяет `logo` видимо другим знаком; визуальные эталоны с логотипом переписываются в
  Docker-образе, PNG-диф — на ревью владельца. `footer-copyright` в демо не заменяется, его замена
  проверяется тестом ядра.
- Запись `deferred-work.md` о токенах утилит в `@theme` в эту спеку не входит и остаётся открытой.
- Спецификация остаётся целой (размер выше рекомендуемого принят).

## Boundaries & Constraints

**Always:**
- Оболочка точки (элемент `<a>` логотипа, `aria-label`, классы закрепления и переключения, скрипты)
  рендерится ядром при любой замене; компонент сайта получает только визуальную часть.
- Список точек — один источник в ядре; проверка имён — чистая функция, её вызывает интеграция
  в `astro:config:setup` с корнем `siteRoot` (сборка и `astro dev`). Это единственный гейт имён.
- Имена точек входят в снапшот публичного API: удаление или переименование точки и ломающая смена
  её пропсов классифицируются `check:api-breaking` как ломающие.
- Без замены вывод демо по умолчанию не меняется, кроме того, что прямо решено ниже.

**Never:**
- Не делать полную замену интерактивных компонентов (меню, viewer, шапка целиком), токены модулей
  (6.6), генерацию темы из конфига.
- Не проверять поведение списком DOM-хуков вместо e2e.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Без замен | нет файлов замены | вывод ядра по умолчанию | N/A |
| Замена логотипа | компонент сайта для `logo` | знак сайта в шапке и баннере, оболочка ядра | N/A |
| Замена копирайта | компонент сайта для `footer-copyright` | его разметка внутри `.site-footer__copyright` | N/A |
| SVG по умолчанию | SVG сайта с двумя `id` верхнего уровня | два `<use>` в порядке документа | N/A |
| Неизвестная точка | файл замены `footer.astro` | сборка падает | `src/overrides/footer.astro: unknown replacement point "footer"; known: footer-copyright, logo` |
| Чужой файл | `src/overrides/logo.tsx` | сборка падает | файл и «only .astro components» |

</frozen-after-approval>

## Code Map

- `packages/core/src/components/site-header.astro:45-52,147-163` -- слот логотипа: `import.meta.glob`
  брендовых SVG сайта, `logoAvailable`, `slotMode` (`swap`/`icon`/`logo`), оболочка `<a>` и
  `.site-header__brand`; замена встаёт вместо `<SiteLogo>`, и при замене слот доступен без SVG.
- `packages/core/src/layouts/base.astro:78-96` -- логотип баннера (`showBannerLogo`, `banner-logo`);
  та же точка `logo` с `placement: 'banner'`.
- `packages/core/src/components/site-logo.astro` -- логотип по умолчанию, жёсткий `LOGO_PARTS`;
  `site-logo.test.ts:37-45` уже сверяет одно направление (каждый `id` SVG рисуется).
- `packages/core/src/index.ts:36-50` -- образец виртуального модуля (`siteRootModule`); замены
  отдаются виртуальным модулем `virtual:astrum-scena/overrides`, сгенерированным из файлов сайта;
  объявление типов — `packages/core/src/env.d.ts`.
- `packages/core/src/index.ts` (точка входа `.`) -- `export type` пропсов точки; `exports.json`
  снапшота подхватит тип сам (`scripts/lib/api-surface.ts:336` `extractExports`).
- `scripts/lib/api-surface.ts:68-78,590,1066` -- `SURFACES`, `extractSnapshot`, `compareSurface`:
  новая поверхность имён точек (`replacement-points.json`), удаление — ломающее.
- `packages/core/src/theme/tokens-plugin.ts`, `theme/tokens.ts` -- образец чистой проверки и
  сообщения с файлом сайта.
- `demo/src/assets/brand/{brand,menu}-logo.svg` -- SVG демо (два слоя у каждого).
- `packages/core/src/components/site-footer.astro:117-120` -- строка копирайта (`copyright.since`,
  год сборки, `holder`, `t('home.copyright.rights')`); пропсы `footer-copyright` — эти значения и
  `lang`.
- `e2e/header-swap.spec.ts`, `e2e/navigation.spec.ts`, `e2e/helpers.ts` -- образцы e2e шапки и
  навигации; ожидания из конфига и контента демо, не литералы.
- `scripts/build-demo-from-pack.ts` -- негативные сборки упакованного демо (образец 6.5B): сборка с
  неизвестной точкой падает и в установленном пакете.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/overrides/` (имя на выбор) + тест -- список точек, типы пропсов, чистая
  проверка файлов сайта (каждая строка матрицы).
- [x] `packages/core/src/index.ts`, `env.d.ts` -- проверка в `astro:config:setup`, виртуальный модуль
  замен, `export type` пропсов.
- [x] `site-header.astro`, `base.astro`, `site-logo.astro` -- компонент точки вместо логотипа по
  умолчанию, оболочка у ядра; слои логотипа выводятся из SVG, тест обоих направлений.
- [x] `site-footer.astro` + тест рендера -- точка `footer-copyright` внутри
  `.site-footer__copyright`; тест рендерит подвал с подставленной заменой и без неё (вывод по
  умолчанию прежний).
- [x] `scripts/lib/api-surface.ts`, `scripts/check-api-snapshot.ts` + тесты -- поверхность имён точек;
  `pnpm api:snapshot`.
- [x] `demo/src/overrides/logo.astro`, `e2e/__screenshots__/` -- видимо другой знак (например, знак и
  название из `identity.title`) на токенах темы; эталоны с логотипом переписаны
  `pnpm test:e2e:docker:update`, остальные PNG не меняются.
- [x] `e2e/` новый spec -- с заменой: логотип шапки — знак сайта внутри ссылки ядра; Tab доходит до
  ссылки, Enter ведёт на главную переходом ClientRouter (без полной перезагрузки), переключение
  иконки и логотипа при закреплении работает; на телефоне — логотип баннера.
- [x] `scripts/build-demo-from-pack.ts` + тест -- сборка упакованного демо с неизвестной точкой падает.
- [x] Доки и учёт: `packages/core/README.md` (раздел о точках замены и пропсах, контракт SVG),
  `CHANGELOG.md` `[Unreleased]`, `UPGRADING.md` если `check:api-breaking` назовёт ломающим,
  `deferred-work.md` (`closed_by` для записей 6.5C и SVG-логотипа), `epics.md` (критерий 6.5 при
  сужении), `sprint-status.yaml` (`6-5c-replacement-points: review`, `6-5-…: review`).

**Acceptance Criteria:**
- [x] Каждая строка матрицы покрыта тестом в `pnpm check`; сборка упакованного демо с неизвестной
  точкой падает в `pnpm demo:packed`.
- [x] e2e с заменой в демо проверяет взаимодействие, клавиатуру и переход ClientRouter через
  оболочку ядра и входит в `pnpm test:e2e`.
- [x] Удаление точки из списка ядра классифицируется `check:api-breaking` как ломающее (тест).
- [x] `pnpm check`, `pnpm build`, `pnpm demo:packed`, `pnpm test:e2e` проходят;
  `pnpm check:api-breaking --base origin/main` соответствует записи в `CHANGELOG.md`.

## Implementation Notes

- Points live in `packages/core/src/overrides/points.ts` (props types, `REPLACEMENT_POINTS`,
  `replacementProblems`, `siteReplacements`); `astro:config:setup` reads `src/overrides/` once and
  serves `virtual:astrum-scena/overrides`, so adding or removing a file in `astro dev` needs a
  restart, while editing one reloads. Hidden entries (`.DS_Store`) are ignored.
- The package root exports `LogoReplacementProps`, `FooterCopyrightReplacementProps` and
  `ReplacementPointProps` as types; logo props are `placement`, `lang`, `title` (no slots).
- `components/logo-layers.ts` derives the default logo's layers from the site SVG; a file without a
  `viewBox` or a top-level `id` fails with its path. The frozen reference site's brand SVGs give the
  former viewBoxes and ids in the former order.
- `check:api-breaking --base origin/main` finds nothing new breaking (points and types are additions),
  so no `UPGRADING.md` entry; `epics.md` unchanged (criterion not narrowed).
- 12 baselines rewritten in the Docker image (`--update-snapshots=all`): privacy dark/light at
  1440 and 1920, and the 8 mobile-375 banner pages; every other PNG byte-identical. A first demo mark
  with `inline-flex` grew the header by 4px; `flex` fixed it, and the README advises a block-level
  root.

## Spec Change Log

## Review Triage Log

Ревью 1 (Codex: blind, edge, verification-gap), дифф от `234087de491f97e8cb2fb9bb51ce017ad038c972`.

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|------|---------|---------|-------------|---------|
| 1 | blind | `logo-layers.ts`: вложенные `id`, которые раньше рисовались по жёсткому списку, теперь не считаются слоями; файл без `id` верхнего уровня не собирается | low | реально: прежний `site-logo.astro` ссылался на `id` любой глубины; у эталонного сайта набор совпадает, но для контракта файла сайта это ломающее изменение, а запись CHANGELOG его так не помечает. Исправление — пометка `**Breaking:**` и переход в `UPGRADING.md` | patch |
| 2 | blind, edge | `index.ts:116`: в `astro dev` новый или удалённый файл `src/overrides/` замечается только после перезапуска | low | реально, но гейт имён — сборка (`astro:config:setup`, негативная сборка в `pnpm demo:packed`); наблюдатель каталога с инвалидацией модуля — новая сложность. Исправление — одна фраза о перезапуске в README | patch |
| 3 | blind | `logo-layers.ts:33`: `<defs id>` верхнего уровня считается слоем | low, отклонено | `<use>` на `<defs>`/`<metadata>` ничего не рисует, так что вред — только пустой логотип при видимом содержимом без `id` верхнего уровня, а это нарушение контракта README («каждый слой имеет `id`»), видимое сразу; фильтр по именам элементов — новая ветка ради редкого случая | reject |
| 4 | blind, edge | `site-logo.astro:23`: атрибуты оформления корня SVG (`fill` на `<svg>`) теряются | false | не регрессия: прежний `site-logo.astro` (baseline, строки 31-32) тоже рендерил свой `<svg>` только с `viewBox`; README требует, чтобы слой держал свой `fill` | reject |
| 5 | blind, edge | `logo-layers.ts:11`: сущности в `id` (`a&amp;b`) не декодируются | low, отклонено | `id` с XML-сущностями в файлах логотипов практически не встречаются; декодирование сущностей — новый разборщик ради такого случая | reject |
| 6 | blind | `logo-layers.ts:24`: незакрытые или несогласованные теги не проверяются | low, отклонено | битый SVG автор видит сразу (браузер не рисует файл); проверка вложенности — полноценный XML-разборщик, контракт проверяет только корень, `viewBox` и слои | reject |
| 7 | blind | README: «ядро сохраняет `menu.logoSize`», но высоту слота берёт только `<svg>` замены, текст не масштабируется | low | реально: формулировка шире поведения; исправление — сузить текст README | patch |
| 8 | blind | `site-footer.astro:104`: замена рендерится внутри `<p>`, блочный корень выталкивает её наружу | low | реально (парсер HTML закрывает `<p>`); исправление — README: только фразовое содержимое | patch |
| 9 | blind | `site-header.astro:145`: замена логотипа внутри ссылки ядра может содержать свою ссылку — вложенные интерактивные элементы | low | реально; исправление — README: без интерактивных элементов | patch |
| 10 | edge | в диффе нет обновлённых эталонов, хотя спека заявляет их перезапись | false | PNG исключены из текстового диффа намеренно; `git status` показывает 12 изменённых PNG в `e2e/__screenshots__/visual.spec.ts/` | reject |
| 11 | vgap | замена `logo` без брендовых SVG (слоты шапки и баннера) не проверена | medium (gap) | фикстура no-brand убирает и SVG, и замену; возврат условия к `logoUrl` прошёл бы все тесты. Исправление — тест на фикстуре no-brand с подставленной заменой | patch |
| 12 | vgap | обнаружение `footer-copyright` и генерация модуля проверены только для `logo` | low (gap) | `site-footer.test.ts` подставляет мок; пропуск точки при генерации модуля прошёл бы тесты. Исправление — временный сайт с обоими файлами и проверка модуля | patch |

## Verification

**Commands:**
- `pnpm check` -- зелёный
- `pnpm build && pnpm demo:packed` -- зелёные
- `pnpm test:e2e` (и `pnpm test:e2e:docker` при изменении эталонов) -- зелёные
