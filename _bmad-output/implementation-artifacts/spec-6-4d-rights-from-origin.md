---
title: '`rights.webStatement` и `rights.source` из `origin` (6.4, часть D)'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: 'f8afed08e875ce4b9f83b13f9836d72b19b89c8e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** домен сайта записан в `site.yaml` трижды: в `origin` и в `images.rights.webStatement` и
`images.rights.source`, которые вшиваются в XMP деривативов. Смена домена в одном месте молча
расходится с метаданными (AD-6, запись 4.4 в `deferred-work.md`).

**Approach:** последняя часть 6.4. Ядро выводит `webStatement` = `origin` + `RIGHTS_PATH` и
`source` = хост `origin`; resolve пишет выведенные значения в `site.lock.yaml`, поэтому хеш конфига
изображений (он считается от эффективного конфига) при тех же итоговых значениях не меняется.
`site.yaml` демо теряет обе строки. На реальном конфиге исходного сайта оба правила уже дают
записанные там значения.

**Decisions (владелец, 2026-11-11):**
- Явное значение в `site.yaml` остаётся переопределением и побеждает вывод (сайт при переезде домена
  может оставить старый URL в XMP и не перекодировать деривативы); без него поле выводится.
- Вывод — `transform` на корне `siteSchema`; `check:api-breaking` считает его ломающим, это принято:
  запись `**Breaking:**` в `CHANGELOG.md` и переход в `UPGRADING.md` «действий не требуется, обе
  строки можно удалить», проверенный фикстурой.
- Спек не делится (~2200 токенов).

## Boundaries & Constraints

**Always:**
- `configDigest` демо, golden-литерал `byte-contract.test.ts`, `demo/site.lock.yaml` (байты),
  визуальные эталоны и e2e не меняются.
- Lock по-прежнему строгий: lock без выведенного поля — ошибка загрузчика с путём
  (`site.images.rights.source: missing`), а снапшот `site.lock.yaml` держит оба поля обязательными.
- Вывод — чистая функция в `config/`; `config/` не импортирует `lib/`.

**Never:**
- Не менять проекцию хеша и `IMAGE_DIGEST_VERSION`; не трогать деривативы и XMP-писатель.
- Не читать исходный сайт из тестов и не вносить его строки в репо; локальная проверка — скрипт в
  scratchpad.
- Не делать CLI (6.7).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Вывод | `origin: https://demo.example.com`, полей нет | lock: `source: demo.example.com`, `webStatement: https://demo.example.com/rights/` | N/A |
| Смена домена | `origin` другой, полей нет | оба поля — от нового `origin`, хеш меняется | N/A |
| Тот же итог | поля убраны, значения равны выведенным | хеш и lock прежние | N/A |
| Lock без поля | в lock нет `rights.webStatement` | загрузчик падает | `site.images.rights.webStatement: missing; run pnpm config:resolve` |

</frozen-after-approval>

## Code Map

- `packages/core/src/config/images-schema.ts:59-68` -- `rightsSchema`: `source`/`webStatement`
  становятся необязательными на входе; чистая `deriveImageRights(rights, origin)`; тип `ImageConfig`
  — выход с обязательными полями (его читают `build/engine.ts:31`, `public-config.ts`, `config.ts`).
- `packages/core/src/config/site-schema.ts:634-731` -- корневой `siteSchema`: `.transform`, который
  дописывает недостающие поля из `origin` (по образцу `withDefaultLocation`, литералы внутри функции —
  снапшот отпечатывает её исходник). Неподвижная точка lock (`config/lock.ts`, `divergence`) тогда сама
  ловит lock без поля.
- `packages/core/src/lib/content/routes.ts:6-8` -- `RIGHTS_PATH` переезжает в `config/` (например
  `config/rights.ts`), `routes.ts` реэкспортирует; импорты в `rights.astro`, e2e и тестах не меняются.
- `scripts/lib/api-surface.ts:268-300` -- `requireDefaults`: выведенные поля обязательны в снапшоте
  lock (маркер через `.meta`, который видит JSON Schema, или иной способ); `pnpm api:snapshot`.
- `demo/site.yaml:72-78` -- удалить `source` и `webStatement`; `pnpm config:resolve` не должен менять
  `demo/site.lock.yaml`.
- Фикстуры: `config/fixtures/site-config.ts:334`, `config/__fixtures__/override-tree-site/site.yaml:77`
  (форма 6.4b, поля можно оставить — они равны выведенным или проверяют переопределение);
  `__fixtures__/three-file-site` — старая форма, не трогать.
- Тесты: `config/site.test.ts`, `config/lock.test.ts`, `lib/images/build/config.test.ts`,
  `lib/content/routes.test.ts:76-80` (путь `webStatement` = `RIGHTS_PATH` остаётся),
  `byte-contract.test.ts` (литерал не трогать; если тип требует — выводить через `deriveImageRights`).
- Доки: `packages/core/README.md` (секция `images.rights`), `CHANGELOG.md`, `UPGRADING.md`
  `[Unreleased]`, `deferred-work.md` (`closed_by` у записей «6.4, часть D» и 4.4 строка 79),
  `sprint-status.yaml` (ключ `6-4d-rights-from-origin`; `6-4-config-overrides-and-lock` → `review`).
- Локальная проверка: `$REFERENCE_SITE_ROOT/config/images.yaml` и `src/config/site.yaml` (`origin`),
  `src/generated/images-release.json` (`configDigest`) — только чтение.

## Tasks & Acceptance

**Execution:**
- [x] `config/images-schema.ts`, `config/site-schema.ts`, `config/rights.ts` -- вывод полей из
  `origin` и тип выхода.
- [x] `lib/content/routes.ts` -- реэкспорт `RIGHTS_PATH`.
- [x] `scripts/lib/api-surface.ts` + тест -- выведенные поля обязательны в снапшоте lock;
  `pnpm api:snapshot`.
- [x] `demo/site.yaml` -- убрать две строки; lock не меняется.
- [x] тесты -- строки матрицы; явное значение побеждает вывод; переход `UPGRADING.md` на фикстуре.
- [x] доки и учёт -- README ядра, `CHANGELOG.md`, `UPGRADING.md`, `deferred-work.md`,
  `sprint-status.yaml`.

**Acceptance Criteria:**
- [x] Каждая строка матрицы покрыта тестом в `pnpm check`.
- [x] `pnpm config:resolve && git diff --exit-code demo/site.lock.yaml` чист, golden-тест и
  `pnpm check:image-files` зелёные без правки ожиданий.
- [x] `pnpm check`, `pnpm build`, `pnpm demo:packed`, `pnpm check:api-breaking --base origin/main`
  (ломающий вердикт ожидаем и покрыт `UPGRADING.md`), `pnpm test:e2e` проходят.
- [x] Локально: `computeConfigDigest` от `images.yaml` исходного сайта с полями, выведенными из его
  `origin`, равен `configDigest` его `images-release.json`; результат (да/нет, без значений) записан в
  Implementation Notes.

## Implementation Notes

- `siteSchema` теперь `ZodPipe` (объект → `transform(withDerivedRights)`), поэтому `.shape` читается через
  `siteSchema.in` (`lock.ts` для `assertSchemaVersion`, тесты конфига).
- Маркер выведенного поля — `.meta({ 'x-derived-from': 'origin' })` (`DERIVED_FROM_KEYWORD` в
  `config/images-schema.ts`); `requireDefaults` делает такие поля обязательными в снапшоте lock.
  `check:api-breaking` от `HEAD` называет ломающими `images.rights.{source,webStatement}`,
  `site.images.rights.{source,webStatement}` и transform корня — все покрыты `CHANGELOG.md` и `UPGRADING.md`.
- Снапшот отпечатывает только исходник `withDerivedRights`, не `deriveImageRights`, которую он вызывает:
  смена правила вывода сама по себе не видна снапшоту, но меняет `demo/site.lock.yaml` (ловит
  `check:config-lock`).
- Локальная проверка на реальном конфиге исходного сайта (скрипт в scratchpad, только чтение):
  выведенные `source` и `webStatement` равны записанным — да; `computeConfigDigest` с выведенными
  полями равен `configDigest` его `images-release.json` — да.

## Spec Change Log

## Review Triage Log

Проход 1 (Codex: blind-hunter, edge-case-hunter, verification-gap; edge-case-hunter — без находок).

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|------|---------|---------|-------------|---------|
| 1 | blind | снапшот отпечатывает `withDerivedRights`, но не `deriveImageRights`/`RIGHTS_PATH`: смена правила вывода не видна `check:api-breaking` | low | правда для снапшота, но смена правила не проходит молча: `lock.test.ts` (блок «image rights derived from origin») и `config.test.ts` («rights derived from origin») пинят выведенные значения, а `check:config-lock` — байты `demo/site.lock.yaml`, так что `pnpm check` падает; правка — перестройка отпечатка или дублирование литерала | reject |
| 2 | blind, vgap | нет случаев «записан только `source`» и «записан только `webStatement`» | low | регресс, сохраняющий переопределение только при паре, прошёл бы тесты (`lock.test.ts` покрывает лишь оба/ни одного) | patch |
| 3 | blind | вывод не проверен на `origin` с портом | false | плохого исхода нет: `new URL(origin).host` и `new URL(RIGHTS_PATH, origin)` оба сохраняют порт, поля согласованы между собой и с `origin` (`images-schema.ts`, `deriveImageRights`) | reject |
| 4 | blind | путь команды `config:resolve`/`check:config-lock` с опущенными полями не проверен | false | `demo/site.yaml` теперь без обоих полей, и `check:config-lock` в `pnpm check` резолвит именно его и сравнивает с lock, где поля записаны (`demo/site.lock.yaml:273`) | reject |
| 5 | blind | README советует оставить старый `webStatement` после переезда, не требуя, чтобы старый URL отвечал | low | без этого XMP выложенных деривативов ведёт на мёртвую страницу прав; правка — одна фраза | patch |
| 6 | blind | Verify в `UPGRADING.md`: «lock изменился — значит значения отличались» неверно, lock меняют и другие правки | low | вывод из факта изменения lock ложен при других правках `site.yaml`; правка — сузить до полей `site.images.rights.*` | patch |
| 7 | blind | YAML-примеры `UPGRADING.md` без `credit`/`licensor`/`imageId` выглядят полными | low | скопированный пример даёт невалидный конфиг; правка — пометить как фрагмент | patch |

## Verification

**Commands:**
- `pnpm check` -- expected: зелёный, включая `check:config-lock`, golden-хеш и `check:upgrading`.
- `pnpm build && pnpm demo:packed && pnpm check:image-files` -- expected: без перекодирования.
- `pnpm test:e2e` -- expected: те же результаты.

**Manual checks (if no CLI):**
- Скрипт в scratchpad: хеш реального конфига с выведенными полями равен записанному (AD-7).
