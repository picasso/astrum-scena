---
title: '`schemaVersion` в файлах сайта (6.3, часть D)'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_commit: '541bb1130d91a6741663885081cfe753f664d8f6'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Файлы сайта, которые читает ядро, не говорят, под какую форму они написаны: только
`images.yaml` несёт `version: 2`, и его отказ — общая ошибка zod без списка версий. Ядро не может
отличить старую форму файла от опечатки и назвать сайту переход (AD-7).

**Approach:** Часть D истории 6.3, последняя перед PR. Каждый файл сайта, который ядро читает
напрямую, получает обязательный `schemaVersion`; одна проверка ядра до разбора схемы отклоняет
отсутствующую или неподдерживаемую версию с именем файла и списком поддерживаемых. `version` в
`images.yaml` становится `schemaVersion: 2` без смены `configDigest`, так что деривативы не
перевыпускаются. Изменение ломающее: снапшот, `**Breaking:**` в CHANGELOG и запись `UPGRADING.md`
`[Unreleased]`.

**Решения владельца (2026-11-06):**
- `place-gps-bounds.yaml` ядро не читает — GPS-код переносится в 6.7. AC 6 истории 6.3 в `epics.md`
  переписывается: версия у файлов в объёме, переход `images.yaml`, версия коллекций — в lock 6.4;
  в AC GPS истории 6.7 добавляется «`place-gps-bounds.yaml` несёт `schemaVersion`, его `version`
  переходит без перегенерации производных».
- Сгенерированные `src/generated/images-public.json` и дескриптор `src/generated/images-release.json`
  входят в объём: верхний `schemaVersion: 1`, его пишут сериализаторы ядра, файлы демо правятся без
  перекодирования; отказы `loadManifestFile` (манифест, `schemaVersion: 3`) тоже перечисляют
  поддерживаемые версии.
- Спека не делится, несмотря на объём выше 1600 токенов.

## Boundaries & Constraints

**Always:**
- Файлы в объёме: `src/config/site.yaml`, `src/config/seo.yaml`, `config/images.yaml`,
  `src/content/config/{categories,places,tags,image-sets}.yaml`, `src/content/featured/home.yaml`,
  `src/generated/images-public.json`, `src/generated/images-release.json` (дескриптор).
  Новые файлы начинают с `schemaVersion: 1`, `images.yaml` — `2`.
- Версия — часть схемы каждого файла (`z.literal`), чтобы снапшот API её показывал; отказ по версии
  выдаёт общая проверка до разбора схемы.
- `configDigest` побайтово тот же: golden-тест `byte-contract.test.ts` не меняет литерал.
- Отсутствующий необязательный файл (`featured/home.yaml`, `image-sets.yaml`) по-прежнему допустим;
  существующий, даже пустой, обязан нести версию.
- Инвариант «каждый файл сайта в объёме несёт `schemaVersion`» сторожит тест в `pnpm check`.

**Never:** Не версионировать контентные коллекции (`albums`, `photos`, `articles`, `pages`, `legal`):
по AD-7 их версия — одна в lock, это 6.4. Не трогать CSS, `_redirects` и ассеты. Не менять формулы
хешей, `schemaVersion: 3` манифеста и поведение сборки. Не поддерживать старую форму (`version: 2`)
параллельно — переход описан в `UPGRADING.md`. Не поднимать npm-версию ядра.

## I/O & Edge-Case Matrix

| Сценарий | Файл | Ожидаемое |
|---|---|---|
| Поддерживаемая версия | `site.yaml` с `schemaVersion: 1` | грузится, как раньше |
| Нет версии | `seo.yaml` без `schemaVersion` | ошибка: путь файла, «missing schemaVersion», поддерживаемые `1` |
| Неподдерживаемая | `tags.yaml` с `schemaVersion: 2` | ошибка: путь, найденное значение, поддерживаемые `1` |
| Нечисловая | `schemaVersion: "1"` | ошибка с путём и поддерживаемыми, не `TypeError` |
| Старая форма | `images.yaml` с `version: 2` | ошибка с путём и поддерживаемыми `2` |
| Переход | `images.yaml` `version: 2` → `schemaVersion: 2` | `configDigest` прежний, `image-files` не видит устаревания |
| Пустой файл | пустой `image-sets.yaml` | ошибка «missing schemaVersion» |
| Нет файла | нет `featured/home.yaml` | как раньше |
| Дескриптор без версии | `images-release.json` без верхнего `schemaVersion` | ошибка с путём и поддерживаемыми `1` |
| Манифест старой формы | манифест `schemaVersion: 2` | ошибка с путём и поддерживаемыми `3` |

</frozen-after-approval>

## Code Map

- `packages/core/src/config/loader.ts:26-70` -- `readYaml`/`validate` для `site.yaml`, `seo.yaml`
  (путь может прийти из `SITE_CONFIG_ENV`); `loadSiteSection` валидирует только секцию — проверка
  версии нужна и там. `readSiteConfigRaw` отдаёт сырое для CLI, выводящих другой `site.yaml`.
- `packages/core/src/lib/content/files.ts:122-150` -- `loadConfigFile` для таксономии; `parseDataEntry`
  (`:84`) — образец сообщения с путём. `check:taxonomy-readers` не должен пострадать.
- `packages/core/src/lib/blocks/gallery/image-sets.ts:60-80`, `packages/core/src/lib/featured.ts:31`
  -- свой `parseYaml`; пустой `image-sets.yaml` сейчас допустим.
- `packages/core/src/lib/images/build/config.ts:179-292` -- `imageConfigSchemaV2` (`version:
  z.literal(2)`), `loadImageConfig`, `computeConfigDigest` (sha256 `canonicalStringify` всего
  конфига — ключ `version` входит в байты).
- `packages/core/src/lib/images/byte-contract.test.ts` -- литерал `configDigest` на `CONFIG` с
  `version: 2`; вход переходит на `schemaVersion: 2`, литерал — нет.
- `scripts/lib/image-files.ts:56` -- устаревание = `descriptor.configDigest !== computeConfigDigest(...)`.
- `packages/core/src/lib/images/{release.ts:85-140,public-config.ts:66-126,manifest.ts:44}` --
  дескриптор (`releaseDescriptorSchema`, `buildReleaseDescriptor`/`serializeReleaseDescriptor`),
  публичный конфиг (`imagePublicConfigSchemaV2`, `buildImagePublicConfig`/`serialize…`) и манифест;
  `release.ts:138` — текущее сообщение версии манифеста. Писатель демо — `scripts/lib/demo-images.ts`.
- `_bmad-output/planning-artifacts/epics.md:1116-1119` (AC 6 истории 6.3), `:1228` (AC GPS 6.7) --
  правятся по решению владельца.
- `scripts/lib/api-surface.ts:82-96` `SITE_FILE_SCHEMAS` -> `packages/core/api-snapshot/site-files.json`;
  добавление обязательного поля классифицируется как ломающее, `check:api-breaking` требует
  `**Breaking:**` и запись `UPGRADING.md`.
- `demo/src/config/*.yaml`, `demo/config/images.yaml`, `demo/src/content/config/*.yaml`,
  `demo/src/content/featured/home.yaml` -- получают версию; фикстуры тестов, пишущие эти файлы, тоже.
- `packages/core/README.md:70,132`, `docs/03-architecture.md:162` -- упоминания формы `images.yaml`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/lib/schema-version.ts` (+тест) -- одна функция проверки версии сырого
  значения файла с путём и списком поддерживаемых -- единый текст отказа.
- [x] Загрузчики из Code Map, их схемы (`schemaVersion: z.literal(N)`) -- проверка до схемы.
- [x] `config.ts` -- `version` → `schemaVersion: 2`; `computeConfigDigest` хеширует ту же
  каноническую форму, что раньше (ключ версии в байтах прежний) -- без перевыпуска деривативов.
- [x] `byte-contract.test.ts` -- вход на `schemaVersion: 2`, литерал прежний.
- [x] Тест инварианта (рядом с `api-surface` или схемой) -- каждый файл в объёме имеет обязательный
  `schemaVersion`; сторож AC-инварианта.
- [x] `release.ts`, `public-config.ts` (+тесты) -- верхний `schemaVersion: 1` в схемах и
  сериализаторах, отказ через общую проверку; `loadManifestFile` перечисляет поддерживаемые версии.
- [x] `epics.md` -- AC 6 истории 6.3 и AC GPS истории 6.7 по решению владельца.
- [x] Демо, `demo/src/generated/images-*.json` (правка поля, без `pnpm demo:images`), фикстуры тестов, `api-snapshot/site-files.json` (`pnpm` скрипт обновления снапшота) --
  версии добавлены.
- [x] `CHANGELOG.md` `[Unreleased]` `**Breaking:**`, `UPGRADING.md` `[Unreleased]` запись (все пять
  частей; «Writers: none»), README ядра, `docs/03-architecture.md` -- переход описан.
- [x] `deferred-work.md` -- `closed_by` у записи «6.3, часть D» и у записи «6.3, часть C».

**Acceptance Criteria:**
- [x] Каждая строка матрицы покрыта тестом.
- [x] Сборка демо (`pnpm build`, `pnpm demo:packed`) проходит без перекодирования изображений; `configDigest`
  дескриптора демо совпадает с конфигом.
- [x] `pnpm check` и `pnpm check:api-breaking --base origin/main` проходят.

## Implementation Notes

- The shared check lives in `packages/core/src/config/schema-version.ts`, not `src/lib/`: the lint
  boundary forbids `config/` from importing `lib/`, and `config/loader.ts` needs it; `lib/` may
  import `config/`.
- `image-sets.yaml` keeps its sets at the top level: the file schema is an object with
  `schemaVersion` and a catchall of sets, the kebab-case ID check moved into a refinement;
  `parseImageSetsConfig` returns the sets without the version. A missing file still throws as
  before (only `featured/home.yaml` is optional on disk).
- `loadManifestFile` uses the same check, so a pre-v3 or non-numeric manifest version fails with
  `<file>: schemaVersion … is not supported; supported: 3`.
- The invariant test is in `scripts/lib/api-surface.test.ts`; it covers every non-collection key of
  the `site-files` snapshot plus the schemas of the two generated JSON files, and checks that the
  collections carry no `schemaVersion`.

## Spec Change Log

## Review Triage Log

Ревью 1 (Codex: blind-hunter — B, edge-case-hunter — E, verification-gap — V).

| # | Слои | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|---|
| 1 | B1, V-other | Схемы `images-public.json` и дескриптора не в `SITE_FILE_SCHEMAS`; снапшот не показывает их версию | medium | `api-surface.ts:86` их не регистрирует, тест инварианта добавляет их отдельно; Always требует версию в снапшоте; правка — две строки реестра | patch |
| 2 | B2, B3, E1 | `JSON.stringify` значения версии падает на циклическом YAML-алиасе и печатает `null` для `.nan`/`.inf` | low | `schema-version.ts:32`; `yaml` разворачивает алиас в цикл; правка — форматирование по типу | patch |
| 3 | B4 | Отсутствующий `image-sets.yaml` бросает ENOENT, хотя Always разрешает отсутствие | medium | `loadImageSets` (`image-sets.ts:93`) не ловит ENOENT, его зовёт `footer-promo-build.ts:42` на каждой сборке | patch |
| 4 | B5 | Пример `image-sets.yaml` в `docs/blocks/gallery.md:238` без `schemaVersion` | low | Пример копируется владельцем и теперь не грузится | patch |
| 5 | B6 | Verify в `UPGRADING.md` («сайт собирается») не проверяет `config/images.yaml` | low | Сборка сайта читает только сгенерированные JSON; `images.yaml` читают `check:image-files` и `demo:images` | patch |
| 6 | B7 | Встроенный `manifest.schemaVersion` дескриптора без проверки — голая ошибка zod без файла | low | `parseReleaseDescriptor` (`release.ts:65`) проверяет только верхний уровень; правка — ещё один вызов проверки | patch |
| 7 | V1 | Нет теста `loadManifestFile` на манифест без `schemaVersion` | medium | Подтверждено слоем: тесты загрузчика покрывают только неподдерживаемые значения | patch |
| 8 | B8 | Проверка ID наборов в `superRefine` убирает `propertyNames` из JSON Schema снапшота | false | Единственный потребитель снапшота — `compareSchemas` в `api-surface.ts`, он видит изменение уточнения через отпечаток `x-refinements` и помечает его ломающим (вывод `check:api-breaking --base HEAD`); внешних потребителей JSON Schema нет | reject |
| 9 | B9 | Тест инварианта требует один `const`, несколько версий дадут `enum` | low | AD-7 и Never спека исключают параллельную поддержку версий; при её появлении тест падает громко, а не пропускает | reject |
| 10 | B10 | Тест инварианта проверяет только зарегистрированные файлы | false | Удаление файла из `SITE_FILE_SCHEMAS` — «file removed [breaking]» в `compareSchemaMap` и дрейф снапшота в `pnpm check` (часть B); перечень уже под гейтом | reject |

## Design Notes

Ключ версии в байтах дайджеста: `computeConfigDigest` переносит `schemaVersion` под прежний ключ
`version` перед `canonicalStringify` — дайджест описывает содержание конфига, а не имя поля.
Альтернатива (исключить версию из дайджеста) меняет байты у всех сайтов — это и есть перевыпуск.

Текст отказа: `<path>: missing schemaVersion; supported: 1` и
`<path>: schemaVersion 2 is not supported; supported: 1`.

## Verification

**Commands:**
- `pnpm check` -- проходит.
- `pnpm build` -- проходит.
- `pnpm check:api-breaking --base origin/main` -- проходит с записями CHANGELOG и `UPGRADING.md`.
