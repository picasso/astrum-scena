---
title: 'Граница источников классов Tailwind'
type: 'fix'
created: '2026-10-25'
status: 'done'
baseline_commit: 'b5c5574113e46d68d8f7cfc955fafcb0fa246805'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/backlog/bk17-tailwind-source-boundary.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Tailwind сканирует весь репо, поэтому класс из документа меняет CSS сайта: строка
`tracking-[0.42em]` из ADR-0016 уронила `check:page-budget` в PR #65, в 5.10 было то же
([BK17](../../docs/backlog/bk17-tailwind-source-boundary.md)).

**Approach:** Явно задать источники Tailwind в `src/styles/global.css`, доказать сравнением сборок, что
сайт теряет только классы из не-сайтовых файлов, и закрепить границу регрессиями в CI. Коммит идёт в
ветку PR #65 по решению владельца.

## Boundaries & Constraints

**Always:** Вид сайта не меняется: визуальные эталоны e2e проходят без перезаписи. Каждое исчезнувшее
CSS-правило проверено на отсутствие использования в `src/`. Регрессии входят в `pnpm check` или CI.

**Решение владельца (контент):** Tailwind сканирует `src/` без `src/content`; `content:validate`
запрещает атрибут `class` в контенте — оформление статей только через компоненты и директивы, CSS не
зависит от текстов.

**Never:** Не ослаблять бюджеты и проверки; не трогать CSS пакета ядра и демо (их `@source` — 6.2);
не трогать `_bmad-output/brainstorming/`.

## I/O & Edge-Case Matrix

| Сценарий | Ожидаемый результат |
|---|---|
| Класс-метка записан только в документе `docs/` | В CSS `dist` его нет |
| Класс используется только в компоненте `src/` | В CSS `dist` он есть |
| Слово-утилита только в тексте `src/content` | В CSS `dist` его нет |
| Атрибут `class` в файле `src/content` | `content:validate` падает с файлом и строкой |
| Сборка `main` против сборки с границей | Пропали только 40 правил (38 из не-сайтовых файлов, `.contents` и `.ring` из текстов), новых нет |

</frozen-after-approval>

## Code Map

- `src/styles/global.css:4` — `@import 'tailwindcss';` без границы: автоопределение сканирует весь
  репо, кроме gitignored. Синтаксис Tailwind 4.3: `source(none)` у импорта и `@source '<путь>'`
  относительно CSS-файла, `@source not '<путь>'` для исключения.
- Опыт планирования (сборка как есть против `@source '../'`): уходят 38 правил, все из `docs/`,
  `_bmad-output/`, `scripts/`, тестов — например `.tracking-\[0\.42em\]`, `.bg-\[\#fff\]`,
  `.\[scan\:css\]`, `.overflow-hidden`, `.md\:hidden`; новых нет. Без `src/content` уходят ещё
  `.contents` и `.ring`.
- `scripts/assert-production-build.ts`, `scripts/lib/production-build.ts` и тест рядом — проверка
  `dist` после сборки в CI (`gates`, после `pnpm build`); сюда — регрессии границы.
- `scripts/validate-content.ts` (`pnpm content:validate`, входит в `check`) — место для запрета `class`
  в контенте; сейчас в `src/content` нет ни одного `class=`.
- Регрессия «слово из текста не в CSS» без правки опубликованного текста: проверка конфигурации — тест,
  что `global.css` содержит `source(none)`, `@source '../'` и `@source not '../content'`, падает при
  снятии границы.
- `docs/design/page-budget.yaml`, `docs/design/css-baseline.md` — бюджеты и раздел «Изменения
  бюджета»: при похудении страниц бюджет ужимается до новых значений с записью причины.
- `prettier.config.mjs:20` берёт `global.css` как таблицу канонических классов — проверить, что
  `format:check` не меняется.
- `docs/backlog/bk17-tailwind-source-boundary.md`, `docs/backlog/README.md` — закрыть ссылкой на
  историю; `_bmad-output/planning-artifacts/epics.md` — история 6.1b перед 6.2;
  `sprint-status.yaml` — ключ `6-1b-tailwind-source-boundary`.

## Tasks & Acceptance

**Execution:**
- [x] `src/styles/global.css` -- `source(none)` и явные `@source` с комментарием, почему граница --
  CSS зависит только от кода сайта.
- [x] Сравнение сборок -- списки селекторов `main` и ветки; каждое исчезнувшее правило проверить
  поиском в `src/` -- доказательство отсутствия потерь.
- [x] `scripts/lib/production-build.ts`, `assert-production-build.ts`, тест -- проверка: класс-метка
  из `docs/design/css-baseline.md` отсутствует в CSS, класс только из компонента `src/` присутствует --
  регрессии в CI.
- [x] `scripts/validate-content.ts` и его тест -- запрет атрибута `class` в `src/content` с файлом и
  строкой; тест конфигурации границы в `global.css` -- регрессии в `pnpm check`.
- [x] `docs/design/css-baseline.md` -- правило источников, класс-метка, запись в «Изменения бюджета»;
  `docs/design/page-budget.yaml` -- новые значения.
- [x] BK17, `docs/backlog/README.md`, `epics.md`, `sprint-status.yaml`, `CHANGELOG.md` (`[Unreleased]`)
  -- учёт истории.

**Acceptance Criteria:**
- [x] `global.css` задаёт источники явно: `src/` без `src/content`; документы, спеки, скрипты и
  тексты статей на CSS не влияют.
- [x] Исчезнувшие правила перечислены в `css-baseline.md`, ни одно не используется в `src/`.
- [x] Регрессии I/O-матрицы работают в `pnpm check` или CI и падают, если границу снять.
- [x] `pnpm check`, `pnpm build`, `check:production-build`, `check:page-budget` и
  `pnpm test:e2e:docker` проходят без перезаписи эталонов.
- [x] BK17 закрыт ссылкой на историю 6.1b; изменения бюджета записаны.

## Implementation Notes

- Сравнение сборок — по набору правил (селектор с контекстом at-rule и декларации) всех листов
  `dist/_astro`. База — ветка как есть: её `src/` совпадает с `main`, а честно собрать `main` в
  песочнице нельзя (без `.git` автоопределение не видит `.gitignore`). Пропали 40 правил: 38 из
  не-сайтовых файлов, `.contents` и `.ring` из текстов; кроме того, `.shadow-sm` ушёл из общего
  правила `.shadow,.shadow-sm` (правило `.shadow` осталось). Новых правил нет. Ни один из классов не
  встречается в атрибутах `class`/`classList` собранных HTML и JS.
- Класс-метка — `[source-boundary:docs]` в `css-baseline.md`; класс только из компонента —
  `px-(--container-pad)` из `site-header.astro`. Тест рядом с проверкой сборки следит, что оба остались
  на месте. Снятие границы проверено: `check:production-build` падает на метке, тест конфигурации
  `src/styles/tailwind-sources.test.ts` — на обоих утверждениях.
- Запрет `class` — `classAttributeErrors` в `src/lib/content/files.ts`, вызывается из
  `assertValidRepositoryContent`: `class`, `className` и директивное `{class="…"}`; краткая форма
  `{.name}` не проверяется (в контенте её нет).
- Тесты внутри `src/` сканируются Tailwind, поэтому в их строках нет имён утилит.

## Spec Change Log

## Review Triage Log

Проход 1 (2026-10-25, Codex: blind-hunter, edge-case-hunter, verification-gap).

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| B1+E3 | Запрет `class` ловит примеры кода, комментарии и цитаты | low | Реально для будущего примера кода, но сегодня в `src/content` нет ни одного `class=` (поиск `rg -i 'class\s*='`), контент — фотостатьи; исправление требует разбора markdown/HTML-парсером | reject |
| B2+E1+V2 | `class` с `=` на следующей строке обходит запрет | low | Построчный поиск не видел `<div class\n="lead">`; поиск по всему тексту — прямая правка | patch |
| B3+E2 | Регистр: `CLASS="wide"` обходит запрет | low | HTML-атрибуты регистронезависимы; флаг `i` — прямая правка | patch |
| E4 | Файл только с `\r` получает номер строки 1 | low | Деление по `\r?\n` не видит одиночный `\r`; счёт строк по смещению — прямая правка | patch |
| B4+V1 | Нет теста, что запрет подключён к `assertValidRepositoryContent` | medium | Удаление вызова в `files.ts:211` оставляло тесты зелёными, а `content:validate` переставал бы отклонять классы | patch |
| B5 | Положительная проверка принимает класс из любого листа `dist`, даже неподключённого | low | Astro кладёт в `dist/_astro` только листы, собранные из графа страниц; проверка привязки к странице добавила бы разбор HTML — маловероятный дефект, сложная правка | reject |
| B6 | Метки проверяются на наличие, но не на исключительность | false | Положительная метка доказывает, что сканируется `src/`: любой файл `src/` с ней подходит, файлы вне `src/` вне источников; снятие границы ловят метка документа и тест `tailwind-sources.test.ts` | reject |
| B7 | Контекст эпика называет контент допустимым источником классов | low | `epic-6-context.md:53–56` противоречил решению владельца; 6.2 унаследовал бы неверную границу | patch |
| B8 | В sprint-status 6.1b `in-progress`, а спека `in-review` | false | Шаг 5 workflow переводит историю в `review` при завершении; промежуточное расхождение — порядок шагов, не дефект | reject |
| B9 | Сравнение сборок — с «веткой как есть», а не с `main`; `bg-[#…]` сокращён | false | `git diff --stat main b5c5574 -- src` пуст: исходники сайта ветки и `main` совпадают; `bg-[#…]` — дословная строка из `epics-1-5-elicitation.md:82`, не сокращение | reject |
| B10 | В Verification нет фактических результатов | false | Исправление — правка спецификации этой сборки, такие находки отклоняются правилом; результаты записаны в Implementation Notes | reject |
| E5 | Сводка: регистр, многострочность, CR | — | Повтор E1, E2, E4, учтён в их строках | — |

## Verification

**Commands:**
- `pnpm check` -- expected: успех.
- `pnpm build && pnpm check:production-build && pnpm check:page-budget` -- expected: успех.
- `pnpm test:e2e:docker` -- expected: успех без обновления эталонов.
