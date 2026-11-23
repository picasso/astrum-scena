---
title: 'Контракт токенов темы: только экспортированные токены, фавикон и инлайн-цвета без литералов (6.5, часть B)'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: '6ba96e62963aa8ce8772e656025888ae0c04a7b3'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** тема сайта `src/theme/theme.css` может объявить любой токен: опечатка или токен, который
ядро не читает, молча ничего не меняет, а `--container-*` в теме спорил бы со сгенерированными
layout-токенами. Проверяется только наличие обязательных токенов, и то репо-скриптом на демо, а не
сборкой сайта. Фавикон (`html-shell.astro`) и затемнение баннера (`top-section.astro`) красятся
литералами, которые тема не перекрасит (S2). Что класс, используемый только в ядре, попадает в CSS
установленного сайта, не проверяет никто.

**Approach:** вторая часть 6.5. Экспортированный список токенов — `tokens.json` снапшота API;
сборка (и `astro dev`) сайта проверяет его тему: неизвестный токен, layout-токен в теме и
отсутствующий обязательный — ошибка с файлом и именами. Инлайн-цвета берутся из токенов или
конфига, упакованное демо проверяет класс, используемый только в ядре.

**Decisions (владелец, 2026-11-12):** 6.5 делится на части A (i18n), B (токены темы), C (точки
замены); C опирается на контракт B.
- Контраст светлой темы не меняется: тема — файл сайта, ядро за контраст не отвечает; запись
  `deferred-work.md` (копирайт 2.32:1) закрывается как решение сайта (эталонный сайт решит в 9.3).
  Визуальные эталоны не переписываются.
- Цвета фавикона — поля конфига `theme.favicon.{background,foreground}` с умолчаниями ядра (нынешние
  `#1b1b1f` и `#fcbf00`); вывод не меняется, `site.lock.yaml` демо перегенерируется.
- Спецификация остаётся целой (размер выше рекомендуемого принят).

## Boundaries & Constraints

**Always:**
- Опубликованный вывод демо не меняется: визуальные эталоны и e2e зелёные без обновления.
- Проверка темы — чистая функция ядра; её вызывает Vite-плагин интеграции при загрузке темы сайта
  (сборка и dev), корень — `siteRoot`. У контракта один авторитетный гейт: проверка
  отсутствующих токенов уходит из `check:api-snapshot` в неё.
- Токен, который ядро читает, а определяет Tailwind (`--font-sans`, `--font-weight-*`,
  `--ease-out`…), входит в список как `optional`: сайт вправе его переопределить.
- `--container-*` и другие токены, которые ядро определяет само (`--container-max`), — не токены
  темы; объявление в теме — ошибка.

**Never:**
- Не делать точки замены и SVG-логотип (6.5C), токены модулей (6.6), генерацию темы из конфига.
- Не разбирать значения токенов: проверяются только имена.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Тема по контракту | тема демо после чистки | сборка проходит | N/A |
| Неизвестный токен | `--color-acent: …` в теме | ошибка | `src/theme/theme.css: unknown tokens: --color-acent` |
| Layout-токен | `--container-prose: 700px` в теме | ошибка | файл, имя, «generated from site.yaml layout.*» |
| Нет обязательного | тема без `--color-accent` | ошибка | файл и недостающие имена |
| Переопределение Tailwind | `--font-sans` в теме | проходит | N/A |

</frozen-after-approval>

## Code Map

- `scripts/lib/api-surface.ts:442-515` -- `contractTokens`, `declaredTokens`, `extractTokens`,
  `missingThemeTokens`; токены Tailwind сейчас исключаются из списка — читаемые ядром станут
  `optional`. `declaredTokens` и проверка переезжают в ядро, скрипт импортирует их оттуда.
- `packages/core/api-snapshot/tokens.json` -- список; добавить в `files` пакета
  (`packages/core/package.json`), чтобы интеграция читала его от `CORE_ROOT`.
- Новый `packages/core/src/theme/tokens.ts` (имя на выбор) -- чистая проверка
  `(themeCss, list, layoutTokens)`; без Astro и виртуальных модулей.
- `packages/core/src/index.ts:55-80` -- образец Vite-плагинов с `transform` и `addWatchFile`;
  плагин проверки срабатывает на `<siteRoot>/src/theme/theme.css`.
- `scripts/check-api-snapshot.ts:35-39` -- убрать проверку темы; `scripts/lib/color-literals.ts:13`
  (`THEME_FILE`) -- путь темы, переиспользовать.
- `demo/src/theme/theme.css` -- объявляет мёртвые токены: `--color-logo-dark`,
  `--color-social-hover`, `--duration-fast`, `--text-h5`, `--text-h6`, `--text-hero*`; удалить те,
  что не читают ни ядро, ни Tailwind (сверить по собранному CSS, вывод не меняется).
- `packages/core/src/components/top-section.astro:62` -- `#000` → `var(--color-shade)`.
- `packages/core/src/layouts/html-shell.astro:66-72` -- цвета фавикона из `site.theme.favicon`.
- `packages/core/src/config/site-schema.ts:652-660` -- секция `theme`: добавить `favicon` с
  умолчаниями (строгий объект, цвет — проверенная строка CSS-цвета); `pnpm config:resolve` для `demo/site.lock.yaml`; снапшот `site-files` — совместимое добавление.
- `scripts/build-demo-from-pack.ts` -- рядом с `assertDemoImages`: CSS упакованного демо содержит
  утилиту, которая есть только в разметке ядра (например `text-menulink`); тест сверяет, что демо
  её не упоминает, а ядро — да.
- Доки: `packages/core/README.md` (`tokens.json`, `optional`, проверка при сборке), шапка
  `demo/src/theme/theme.css`, `CHANGELOG.md` `[Unreleased]`, `UPGRADING.md` если
  `check:api-breaking` назовёт ломающим, `deferred-work.md` (стр. 139: `closed_by` с пометкой «решение сайта»; стр. 400: `closed_by`),
  `sprint-status.yaml` (`6-5b-theme-tokens: review`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/theme/tokens.ts` + тест -- проверка темы, каждая строка матрицы.
- [x] `scripts/lib/api-surface.ts`, `scripts/check-api-snapshot.ts` -- Tailwind-токены как
  `optional`, гейт отсутствующих токенов переезжает в ядро; `pnpm api:snapshot`.
- [x] `packages/core/src/index.ts`, `package.json` -- плагин проверки темы, `tokens.json` в пакете.
- [x] `demo/src/theme/theme.css` -- только токены списка.
- [x] `top-section.astro`, `html-shell.astro`, `site-schema.ts` -- без цветовых литералов, фавикон
  из конфига; lock демо перегенерирован.
- [x] `scripts/build-demo-from-pack.ts` + тест -- класс только ядра в CSS упакованного демо.
- [x] доки и учёт.

**Acceptance Criteria:**
- [x] Каждая строка матрицы покрыта тестом в `pnpm check`; сборка демо с неизвестным токеном
  падает (тест плагина на временном сайте).
- [x] В `html-shell.astro` и `top-section.astro` нет цветовых литералов; гейт `check:color-literals`
  ловит их в `.astro` (расширить, если не ловит).
- [x] `pnpm demo:packed` падает, если класс только ядра не сгенерирован.
- [x] `pnpm check`, `pnpm build`, `pnpm demo:packed`, `pnpm test:e2e` проходят;
  `pnpm check:api-breaking --base origin/main` соответствует записи в `CHANGELOG.md`.

## Implementation Notes

- Tailwind inlines the `@import` of the theme, so the theme is never a Vite module of its own: the
  plugin (`theme/tokens-plugin.ts`) runs when the core's `global.css` is transformed (and on the theme
  file itself), reads `<siteRoot>/src/theme/theme.css`, registers it with `addWatchFile` and throws on
  any problem. The list is read from `CORE_ROOT/api-snapshot/tokens.json`, which the package ships.
- `contractTokens` lists a token the core reads and Tailwind defines as `optional` (21 names, among
  them the Tailwind palette colors `status.css` reads); the theme check of `check:api-snapshot` and
  `missingThemeTokens` are removed, so the plugin is the only gate.
- `check:api-breaking --base origin/main` classifies `site.theme.favicon` as breaking for
  `site.lock.yaml` (the lock schema requires defaulted fields): CHANGELOG `**Breaking:**` and an
  `UPGRADING.md` entry; the theme check itself is also marked breaking (a theme with dead tokens no
  longer builds). Favicon colors accept hex and color functions only, never named colors.
- `check:color-literals` now scans `.astro` outside `<style>` for hex colors and color functions;
  named colors there are ordinary text.
- Built output against the pre-change build: CSS differs only by the two removed light declarations,
  HTML only by the mono shade `#000` → `var(--color-shade)` (`#000` in the demo), the favicon data URI
  is byte-identical.

## Spec Change Log

## Review Triage Log

Ревью 1 (Codex: blind, edge, verification-gap), diff от `6ba96e62963aa8ce8772e656025888ae0c04a7b3`.

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|------|---------|---------|-------------|---------|
| 1 | blind, edge | `tokens.ts:18`: регулярное выражение объявлений находит `--x:` внутри строк CSS | low | `declaredTokens` вырезает только комментарии; `content: "--x: y"` даёт ложный неизвестный токен. Исправление — вырезать строки так же, как комментарии | patch |
| 2 | blind | `tokens.ts:39`: обязательный токен, объявленный только под `[data-theme='light']`, считается объявленным | low, отклонено | прежний `missingThemeTokens` проверял имена так же; тема по контракту объявляет умолчания в `@theme`/`:root` (`demo/src/theme/theme.css:181`), а различение областей требует разбора CSS по селекторам — сложность, несоразмерная редкому случаю | reject |
| 3 | blind | `tokens.ts:39`: токен утилиты (`--color-menulink`), объявленный в `:root`, а не в `@theme`, проходит, но Tailwind не генерирует `text-menulink` (`theme-toggle.astro:27`) | medium | реально: утилиты ядра требуют регистрации токена в `@theme`; до этой истории проверки тоже не было, а новое требование — новый вид записи в публичном `tokens.json` | defer |
| 4 | blind, edge | `site-schema.ts:59`: схема цвета фавикона принимает `rgb()`, `oklch(garbage)` | low, отклонено | значение остаётся внутри атрибута (тест `site.test.ts:515` отвергает выход из атрибута), неверный цвет сайт видит сразу на вкладке; полный разбор аргументов цветовых функций — сложность ради редкой опечатки | reject |
| 5 | blind, edge | `color-literals.ts:119`: `href="#abc"` или комментарий с `#fff` в `.astro` ловятся как цвет | low, отклонено | в ядре и демо таких мест нет (гейт зелёный); якорь из одних hex-букв (`#add`, `#face`) редок, а ограничение поиска контекстами атрибутов — отдельный разборщик разметки | reject |
| 6 | blind | `color-literals.ts:120`: именованные цвета в `fill="red"` вне `<style>` не ловятся | low, отклонено | осознанное решение: вне `<style>` именованный цвет неотличим от текста (`<p>red</p>`); различение по атрибутам — тот же разборщик разметки, а литералы ядра hex-овые | reject |
| 7 | blind, vgap | проверка темы доказана только прямым вызовом `transform`; настоящая сборка установленного ядра с плохой темой не проверяется | medium | при расхождении id модуля в установленном пакете (`GLOBAL_CSS` против пути Vite) unit-тесты прошли бы, а сборка пропустила бы плохую тему; исправление — негативная сборка в `pnpm demo:packed` | patch |
| 8 | blind, vgap | повторная проверка темы в `astro dev` после правки не проверена тестом | low, отклонено | dev-сервер в тесте — отдельная инфраструктура; авторитетный гейт — сборка (находка 7), в dev ошибка в худшем случае появится при следующей сборке; ручная проверка dev (500 с сообщением) записана в Implementation Notes | reject |
| 9 | edge | `build-demo-from-pack.ts:316`: `.text-menulink` в комментарии или строке CSS засчитывается | low | регулярное выражение не требует правила; исправление — требовать селектор с `{` | patch |
| 10 | vgap | тест фавикона рендерит только цвета по умолчанию | low | у демо значения совпадают с умолчаниями схемы (`demo/site.lock.yaml:42`), так что игнорирование конфига прошло бы тест; исправление — рендер с другими цветами | patch |
| 11 | blind | `UPGRADING.md`: «эталоны без изменений», хотя mono-баннер теперь красится `--color-shade` | low | у сайта с нечёрным `--color-shade` mono-баннеры меняются; исправление — одна фраза о `--color-shade: #000` | patch |

## Verification

**Commands:**
- `pnpm check` -- зелёный
- `pnpm build && pnpm demo:packed` -- зелёные
- `pnpm test:e2e` -- зелёный, визуальные эталоны не переписаны
