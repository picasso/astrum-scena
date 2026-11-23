---
title: 'Хеш конфига изображений от набора полей с `digestVersion` (6.4, часть A)'
type: 'feature'
created: '2026-11-08'
status: 'done'
baseline_commit: 'f86fa9a63cc95756b6b317bc8f577851508dd33e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `computeConfigDigest` хеширует весь распарсенный `config/images.yaml`, поэтому хеш
зависит от формы файла: перенос конфига в дерево `site.yaml` (часть B), переименование ключа или новое
поле с умолчанием меняют `configDigest`, и `check:image-files` объявляет релиз устаревшим, хотя
деривативы не изменились (AD-19, ревью N2).

**Approach:** хеш считается от явной проекции — определённого ядром набора значений конфига в
фиксированной раскладке — под константой `digestVersion`. Форма конфига и поля вне проекции на хеш не
влияют; изменить проекцию можно только вместе со сменой `digestVersion`, и это ломающее изменение
по AD-7.

**Decision (владелец, 2026-11-08):** вариант A — проекция `digestVersion: 1` воспроизводит
нынешние байты: все текущие поля конфига в нынешней раскладке, версия файла под ключом `version: 2`.
Хеш демо, golden-литерал `80d0daa2…` и хеш реального конфига не меняются; выпуск не ломающий,
записи `UPGRADING.md` нет. Исключение полей, не влияющих на деривативы (`publicOrigin`/`publicPath`,
`archive`), — будущая `digestVersion: 2`, не эта часть.

## Boundaries & Constraints

**Always:**
- Проекция строится из значений распарсенного конфига (с умолчаниями), а не из его ключей: хеш не
  зависит от порядка ключей, имени поля версии и места конфига.
- Каждое поле схемы `config/images.yaml` либо входит в проекцию, либо явно числится исключённым;
  тест падает на поле, которое не отнесено ни туда ни туда (сторож инварианта).
- `computeConfigDigest` остаётся единственной функцией хеша; потребители (`demo-images.ts`,
  `image-files.ts`) не меняются.

**Never:**
- Не хранить `digestVersion` в дескрипторе или манифесте и не менять их схемы (снапшот
  `site-files.json` не меняется).
- Не поддерживать параллельно две версии проекции.
- Не трогать перенос конфига в `site.yaml`, lock и вывод `rights` из `origin` (части B–D).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Тот же конфиг | `CONFIG` golden-теста | хеш `80d0daa2…`, как сейчас | N/A |
| Порядок ключей | ключи переставлены на всех уровнях | хеш прежний | N/A |
| Умолчание явно | `archive: { ignoreDirs: [] }` записан или опущен | хеш прежний | N/A |
| Свойство вне проекции | у объекта конфига есть свойство, которого нет в проекции (будущее поле) | хеш прежний | N/A |
| Поле проекции | меняется, например, `ladder.widths` | хеш другой | N/A |
| Новое поле схемы | поле не отнесено к проекции или исключениям | тест инварианта падает с путём поля | N/A |

</frozen-after-approval>

## Code Map

- `packages/core/src/lib/images/build/config.ts:290-298` -- `computeConfigDigest`: сейчас
  `sha256(canonicalStringify({...rest, version: schemaVersion}))`; сюда проекция и `digestVersion`.
  Схема `imageConfigSchemaV2` (`:179`) — перечень полей для теста инварианта.
- `packages/core/src/lib/images/canonical.ts` -- `canonicalStringify`, переиспользовать.
- `packages/core/src/lib/images/byte-contract.test.ts:13-78,114-117` -- golden-литерал на `CONFIG`;
  шапка `:8-11` описывает правило «литерал меняется только с записью `UPGRADING.md`».
- `packages/core/src/lib/images/build/config.test.ts:120-135` -- хеш демо равен
  `configDigest` дескриптора; тест независимости от порядка ключей.
- Потребители (не менять): `scripts/lib/demo-images.ts:283` пишет хеш в манифест и дескриптор,
  `scripts/lib/image-files.ts:56` сравнивает (`pnpm check:image-files`). Ключи деривативов
  (`build/hashing.ts:12-19`) от хеша не зависят.
- Что читает поля: `build/engine.ts:48-52,113-121,136-172,186,206`, `build/ladder.ts:23-29`,
  `build/watermark-source.ts:14-24`, `public-config.ts:86-93`.
- Описания семантики хеша: `packages/core/README.md:132-136`, `docs/03-architecture.md:160-163`,
  `UPGRADING.md:80-90`, `CHANGELOG.md` `[Unreleased]`.
- Реальный конфиг для локальной проверки: `$REFERENCE_SITE_ROOT/config/images.yaml` (только чтение,
  поле там ещё `version`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/lib/images/build/config.ts` -- экспортировать `IMAGE_DIGEST_VERSION = 1`,
  функцию проекции и список исключённых полей; `computeConfigDigest` хеширует проекцию -- хеш
  отвязан от формы.
- [x] `packages/core/src/lib/images/build/config.test.ts` -- строки матрицы и тест инварианта:
  обход листовых путей схемы (через JSON Schema из `z.toJSONSchema`) против проекции ∪ исключений.
- [x] `packages/core/src/lib/images/byte-contract.test.ts` -- литерал не меняется; шапка
  упоминает `IMAGE_DIGEST_VERSION`.
- [x] `packages/core/README.md`, `docs/03-architecture.md`, `CHANGELOG.md` `[Unreleased]` -- описать хеш как проекцию с `digestVersion`.

**Acceptance Criteria:**
- [x] Каждая строка матрицы покрыта тестом.
- [x] `pnpm check`, `pnpm build`, `pnpm demo:packed` и `pnpm check:api-breaking --base origin/main`
  проходят; `site-files.json` не меняется.
- [x] `pnpm check:image-files` проходит на демо без перегенерации изображений; дескриптор демо
  не меняется.

## Implementation Notes

- Проекция задана деревом `IMAGE_DIGEST_PROJECTION` в `config.ts`: лист `true` берёт значение того же
  ключа, строка — имя ключа конфига (`version: 'schemaVersion'`), массив `[{…}]` проецирует каждый
  элемент; отсутствующие необязательные значения пропускаются. `IMAGE_DIGEST_EXCLUDED_FIELDS` в
  версии 1 пуст.
- Тест инварианта обходит листья `z.toJSONSchema(imageConfigSchemaV2, { io: 'input' })` (массив
  скаляров — один лист, элемент массива объектов — `[]`) и сверяет их с путями проекции ∪ исключений
  в обе стороны; мутационная проверка (удалён `watermark.assets[].sha256`, добавлено поле в схему)
  валит тест с путями обоих полей.
- `UPGRADING.md` не тронут: выпуск не ломающий, переход 1.6.3 описан верно.
- Ручная проверка на реальном конфиге исходного сайта: старая и новая функции дают одинаковый хеш.

## Spec Change Log

## Review Triage Log

Ревью 1 (Codex: blind-hunter — B, edge-case-hunter — E: находок нет, verification-gap — V: пробелов нет).

| # | Слои | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|---|
| 1 | B1 | AC 6.4 в `epics.md` требует хеш «от полей, влияющих на деривативы», а решение A включает все поля; версия 2 нигде не записана | medium | Спека сужает критерий эпика, AGENTS.md требует переписать его в том же изменении; `epics.md:1148` не менялся | patch (AC переписан, `digestVersion: 2` — запись в `deferred-work.md`) |
| 2 | B2 | Тест инварианта обходит `imageConfigSchemaV2`, а не активный `imageConfigSchema` | low | `config.test.ts:213`; при переводе алиаса на новую схему её поля ушли бы мимо проверки; правка — одно имя | patch |
| 3 | B3 | Проекция и исключения не проверены на пересечение | low | `config.test.ts:208` сливает их в один `Set`; поле в обоих списках прошло бы, оставаясь в хеше; правка — одно утверждение | patch |
| 4 | B4 | `IMAGE_DIGEST_VERSION` не связан с golden-литералом | low | `byte-contract.test.ts` пинит только хеш; смена проекции и версии могла разойтись; правка — одно утверждение | patch |
| 5 | B5 | Нет сверки старой и новой функции на конфиге с `publicOrigin` и непустым `ignoreDirs` | low | `project` (`config.ts`) копирует листья `publicOrigin: true` и `archive.ignoreDirs: true` по тому же ключу как есть, как и прежняя полная сериализация; тест инварианта ловит потерю пути; правка требует воспроизвести старую функцию в тесте | reject |
| 6 | B6 | `CHANGELOG.md` пишет, что порядок ключей и явное умолчание «больше не» меняют хеш | low | Прежний `computeConfigDigest` уже канонизировал ключи и хешировал распарсенный конфиг с умолчаниями; новое — только проекция | patch |
| 7 | B7 | README: «поле вне проекции не меняет хеш» читается как допуск произвольных ключей YAML | low | Строгая схема (`.strict()`, `config.ts:179`) отвергает неизвестные ключи до хеша; формулировка вводит в заблуждение | patch |
| 8 | B8 | `sprint-status.yaml` держит 6.4a в `in-progress`, а спека — `in-review` | false | Статус спринта синхронизирует шаг 5 workflow (`sync-sprint-status.md`) при закрытии; это состояние процесса, не дефект изменения | reject |

## Design Notes

Проекция — обычный объект с фиксированными ключами, собранный из значений конфига; в
`digestVersion: 1` её раскладка совпадает с нынешней формой файла, поэтому `canonicalStringify` даёт прежние байты.
Будущая часть B меняет только то, откуда функция проекции берёт значения, а не её выход.

## Verification

**Commands:**
- `pnpm check` -- expected: зелёный, включая golden-тест и тест инварианта.
- `pnpm build && pnpm demo:packed` -- expected: сборка без перекодирования изображений.
- `pnpm check:api-breaking --base origin/main` -- expected: без ломающих изменений.

**Manual checks (if no CLI):**
- Локально: хеш `$REFERENCE_SITE_ROOT/config/images.yaml` (с `version` → `schemaVersion` в памяти)
  старой и новой функцией совпадает.
