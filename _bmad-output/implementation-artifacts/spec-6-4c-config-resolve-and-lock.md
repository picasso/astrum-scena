---
title: 'Resolve конфига и `site.lock.yaml` (6.4, часть C)'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: '1165298bed4f0f1fecfcde67e78579b8cb8af4d3'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** после 6.4b/B2 сборка и команды сливают умолчания ядра с `site.yaml` на лету. Поэтому
новое умолчание ядра молча меняет сайт, хотя должно появиться в git как diff, и версий контентных
коллекций нигде нет (AD-19, AD-7).

**Approach:** ядро получает писателя `resolveSiteLock`: он читает `site.yaml` с умолчаниями и пишет
`site.lock.yaml`, то есть строгий эффективный конфиг с версиями коллекций. Единый загрузчик
(`loadSiteConfig`/`loadSiteSection`) читает только lock, а drift-гейт сравнивает файл с результатом
resolve. До CLI 6.7 команда — `pnpm config:resolve [--site <dir>]` (6.7 обернёт ту же функцию в
`core config resolve`), гейт — `pnpm check:config-lock`, по образцу пары `layout:tokens`.

**Decisions (владелец, 2026-11-10):**
- Устаревший lock ловит только гейт `check:config-lock` (`pnpm check` и CI). Сборка и `astro dev`
  читают lock и не сравнивают его с `site.yaml`; после правки `site.yaml` владелец запускает
  `pnpm config:resolve` (это записано в README ядра и демо).
- Версии коллекций resolve берёт из существующего lock; текущие версии ядра — только для коллекции,
  которой в lock нет, или для нового lock. Загрузчик отклоняет неподдерживаемую версию с отсылкой к
  `UPGRADING.md`; поднимает версию шаг перехода.
- Спек не делится (владелец принял размер ~3000 токенов).

## Boundaries & Constraints

**Always:**
- Lock строгий: известные ключи, обязательная каждая ветка эффективного конфига (умолчания при
  чтении lock не подставляются), собственный `schemaVersion: 1`. Эффективный конфиг лежит в `site`,
  версии коллекций — в `collections`.
- Вывод детерминирован (порядок ключей — порядок схемы) и начинается строкой-комментарием
  «сгенерировано, не править»; повторный resolve побайтно равен прежнему.
- `configDigest` демо, эффективный конфиг, golden-хеш, визуальные эталоны и e2e не меняются.
- Неизвестный ключ в `site.yaml` по-прежнему даёт ошибку resolve с путём ключа.
- Новый файл сайта (`site.lock.yaml`) — ломающее изменение: запись `**Breaking:**` в `CHANGELOG.md` и
  переход в `UPGRADING.md` (сгенерировать lock и закоммитить), проверенный на фикстуре.

**Never:**
- Не делать CLI `core …` и `bin` (6.7); не выводить `rights` из `origin` (часть D).
- Не менять схему `site.yaml`, её умолчания и проекцию хеша изображений.
- Не читать `site.yaml` вне resolve, его теста и шагов перехода.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Resolve | `demo/site.yaml` | `demo/site.lock.yaml`: `site` равен прежнему `loadSiteConfig`, `collections` заполнены | N/A |
| Drift | `site.yaml` правлен, lock нет | `check:config-lock` падает | `site.lock.yaml is stale; run pnpm config:resolve` |
| Ручная правка lock | значение изменено руками | гейт падает (байты ≠ resolve) | то же |
| Нет lock | только `site.yaml` | загрузчик падает | `site.lock.yaml: missing; run pnpm config:resolve` |
| Неполный lock | в `site` нет ветки, у которой есть умолчание | ошибка загрузчика | путь ключа: `site.viewer.counter: missing` |
| Лишний ключ в lock | `site.extra` | ошибка | `site.extra: unrecognized key` |
| Чужая версия коллекции | `collections.albums: 2` | ошибка загрузчика | версия и список поддерживаемых |
| Опечатка в `site.yaml` | `theme.defualt` | resolve падает, lock не пишется | `site.yaml: theme.defualt: unrecognized key` |

</frozen-after-approval>

## Code Map

- `packages/core/src/config/loader.ts` -- единый загрузчик: `readTree`/`validate`/`issueLines` (путь
  ошибки), `assertNoRetiredFiles`, `SITE_CONFIG_ENV`/`siteConfigPath` (env `internal`, сейчас указывает
  на другой `site.yaml`; пусть указывает на другой lock, имя `SITE_LOCK_PATH` в `consumer-env.ts`).
  Сюда же — чтение lock; разбор `site.yaml` уходит в писателя.
- `packages/core/src/config/site-schema.ts` -- `siteSchema` (умолчания `.default`/`.prefault`); lock
  проверяется этой схемой плюс проверкой неподвижной точки: разбор не должен ничего добавить.
- `packages/core/src/config/schema-version.ts` -- `assertSchemaVersion` для `schemaVersion` lock и
  версий коллекций.
- `packages/core/src/lib/content/collection-sources.ts` -- `COLLECTION_SOURCES`: ключи `collections`
  берутся из него, литералов имён нет.
- Потребители, которые не меняются по коду (идут через загрузчик): `src/index.ts:82-156`
  (`configYamlDependency` и `siteConfigFile` у `variantCssPlugin` должны следить за lock), `config/site.ts`,
  `config/seo.ts`, `lib/images/build/config.ts`, `scripts/{generate,check}-layout-tokens.ts`,
  `scripts/lib/{image-files,demo-images}.ts`, `scripts/build-demo-from-pack.ts:245` (копирует демо
  целиком, lock едет с ним), `e2e/helpers.ts:17`.
- Тесты, которые пишут `site.yaml` во временный корень (им нужен lock через общий хелпер):
  `config/loader.test.ts`, `index.test.ts:201`, `components/brand-logo.no-brand.test.ts`,
  `lib/variant-css.test.ts`, `lib/images/build/config.test.ts`, `scripts/check-image-files.test.ts`,
  `scripts/check-layout-tokens.test.ts`, `scripts/lib/api-surface.test.ts`.
- `scripts/generate-layout-tokens.ts` + `scripts/check-layout-tokens.ts` + `scripts/lib/site-root.ts` --
  образец пары «писатель + гейт» с `--site`; `scripts/check.ts:14` -- регистрация гейта.
- `scripts/lib/api-surface.ts:89-91` -- `SITE_FILE_SCHEMAS`: добавить `site.lock.yaml`;
  `pnpm api:snapshot`; `check:api-breaking`, `check:upgrading`.
- Доки: `packages/core/README.md` (конфиг сайта), `demo/README.md`, `UPGRADING.md` `[Unreleased]`,
  `CHANGELOG.md`; `deferred-work.md:383` (`closed_by`), `sprint-status.yaml` (новый ключ
  `6-4c-config-resolve-and-lock`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/config/lock.ts` (новый) -- схема lock, `resolveSiteLock(root)` → текст и
  `COLLECTION_VERSIONS`; разбор `site.yaml` переезжает сюда из загрузчика.
- [x] `packages/core/src/config/loader.ts` -- `loadSiteConfig`/`loadSiteSection` читают lock со
  строгой проверкой; ошибки по матрице.
- [x] `scripts/config-resolve.ts`, `scripts/check-config-lock.ts`, `package.json`, `scripts/check.ts` --
  писатель и гейт с `--site`, гейт в `pnpm check`.
- [x] `demo/site.lock.yaml` -- сгенерировать; `src/index.ts` -- следить за lock.
- [x] тесты -- строки матрицы; общий тестовый хелпер «site.yaml + lock»; переход на фикстуре
  (`site.yaml` 6.4 без lock → resolve → загрузка равна прежней) и golden-хеш зелёные без правки
  ожиданий.
- [x] снапшот API, `CHANGELOG.md`/`UPGRADING.md`, README ядра и демо, `deferred-work.md`,
  `sprint-status.yaml`.

**Acceptance Criteria:**
- [x] Каждая строка матрицы покрыта тестом в `pnpm check`.
- [x] Вне `config/lock.ts`, его тестов и фикстуры перехода никто не читает `site.yaml` (сторож — тест
  или гейт в `pnpm check`).
- [x] `pnpm check:config-lock` входит в `pnpm check` и проходит на демо.
- [x] `pnpm check`, `pnpm build`, `pnpm demo:packed`, `pnpm check:image-files`,
  `pnpm check:api-breaking --base origin/main`, `pnpm test:e2e` проходят.

## Spec Change Log

## Review Triage Log

Проход 1 (Codex: blind-hunter, edge-case-hunter, verification-gap).

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|------|---------|---------|-------------|---------|
| 1 | blind, edge | `lockedCollections` (`lock.ts:134-146`) переносит версии коллекций из старого lock без проверки | low | `collections.photos: 99` переживает resolve, и `check:config-lock` зелёный (байты совпадают), а загрузчик падает на сборке. Сборка падает громко, но гейт врёт; правка — вызвать существующий `assertCollectionVersions` | patch |
| 2 | blind | resolve читает `collections` из lock чужого `schemaVersion` и переписывает его как версию 1 | low | Возможно только при откате ядра на старую версию; lock производный и пересобирается из `site.yaml`, а правка — новый guard | reject |
| 3 | blind, vgap (other) | снапшот `site.lock.yaml` (`api-surface.ts:97`) снят с входной схемы `siteSchema`, где поля с умолчаниями необязательны | medium | `parseSiteLock` отклоняет lock без любой ветки с умолчанием, а JSON Schema снапшота такой lock принимает; новое умолчание ядра ломает старый lock, но `check:api-breaking` этого не увидит. Простая правка не прошла: в режиме `io: 'output'` секция `images` (кончается `.transform`) выходит пустой `{}`, так что правка не тривиальна | intent_gap → владелец (2026-11-11) выбрал вариант (b): снапшот lock снимается во входном виде, затем `requireDefaults` делает обязательным каждое поле с умолчанием; исправлено |
| 4 | blind | `UPGRADING.md` велит скрипту с `SITE_CONFIG_PATH` «разрешить тот файл в lock», а у resolve нет опции входного файла | low | Процедура не исполнима как написана; рабочий путь — каталог с этим `site.yaml` и `--site <dir>`, затем `SITE_LOCK_PATH` на его lock. Правка только текста | patch |
| 5 | blind | README ядра отсылает сайт к `pnpm config:resolve`, которого нет в npm-пакете | low | Реально для внешнего сайта, но намерение прямо откладывает CLI до 6.7 (Never: «не делать CLI»), а README уже говорит, что команда живёт в репозитории до CLI; внешних сайтов до 9.3 нет | reject (вне намерения) |
| 6 | edge | `config-resolve.ts:22` — общий `.tmp` у двух одновременных resolve | low | Один процесс может переименовать чужой временный файл; редкость, но правка — прямая (pid в имени) | patch |
| 7 | vgap | смена файла, за которым следит `configYamlDependency` (`index.ts:61-73`), ничем не проверена | low | Пробел подтверждён слоем; регресс к слежке за `site.yaml` прошёл бы все тесты, а `astro dev` показывал бы старый конфиг. Вместо dev-сервера достаточно юнит-проверки плагина из `updateConfig`: `addWatchFile` получает путь lock | patch |

## Design Notes

Строгость lock не требует второй схемы: lock проходит `siteSchema`, а затем
`isDeepStrictEqual(parsed, raw.site)` подтверждает, что разбор ничего не добавил. Умолчание или
transform, которые срабатывают на lock, означают недостающую ветку; путь берётся из первого
расхождения. Гейт сравнивает байты, поэтому ловит и ручную правку, и смену форматирования писателя.

```yaml
# generated by pnpm config:resolve from site.yaml and the core defaults; do not edit
schemaVersion: 1
collections: { albums: 1, articles: 1, legal: 1, pages: 1, photos: 1 }
site: { schemaVersion: 2, origin: …, … }
```

## Verification

**Commands:**
- `pnpm config:resolve && git diff --exit-code demo/site.lock.yaml` -- expected: повторный resolve
  ничего не меняет.
- `pnpm check` -- expected: зелёный, включая `check:config-lock`, переход и golden-хеш.
- `pnpm build && pnpm demo:packed && pnpm check:image-files` -- expected: без перекодирования, дескриптор
  не устарел.
- `pnpm test:e2e` -- expected: те же результаты, что до изменения.
