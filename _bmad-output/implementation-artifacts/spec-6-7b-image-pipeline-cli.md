---
title: 'Пайплайн изображений и GPS-границы мест как команды CLI ядра (6.7, часть B)'
type: 'feature'
created: '2026-11-15'
status: 'done'
baseline_commit: '95f682110ad5bd69bf4ab8586f569af2db8b0945'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-7a-core-cli-skeleton.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Пайплайн изображений (сборка деривативов, ExifTool/XMP-права, `colormode`, отчёт лестницы,
активация релиза, проверки, публикация в R2) живёт только скриптами исходного сайта (~4 600 строк в
`scripts/lib/images`), а в ядре есть лишь чистая функция нарезки. Установленный из npm сайт не может
собрать и опубликовать фото, а GPS-границы мест читают `places.yaml` своим чтением (AD-9, AD-12).

**Approach:** Перенести пайплайн в подкоманды `astrum-scena images …` и гейты `astrum-scena check …`
поверх каркаса 6.7A: IO и команды — в `packages/core/src/cli/images/`, переиспользуя готовые
`lib/images/**` (манифест, релиз, политика, `build/engine`). GPS-границы получают места через
`loadPlacesConfig`, файл границ несёт `schemaVersion`. Решение владельца 2026-11-15: локальная и
удалённая (R2) части — в одной части B, без B2.

## Boundaries & Constraints

**Always:**

- Команды (опции — в реестре и снапшоте `cli`): `images build [--masters <dir>] [--archive <dir>]
  [--release <id>] [--photos <ids>]`, `images activate [--release <id>] [--recover]`,
  `images colormode [--masters <dir>] [--archive <dir>]`, `images ladder-report --release <id>
  [--compare <id>] [--pixels]`, `images public-init`, `images check-derivatives [--release <id>]`,
  `images sync --release <id> [--dry-run]`, `images prune [--release <id>]`,
  `images check-live [--release <id>]`. Гейты в агрегате `check`: `images-policy`,
  `images-public-config`, `place-gps-bounds`; все проходят на демо.
- Поведение — как у скриптов исходного сайта, кроме явно перечисленного здесь. Корни мастеров и архива —
  опции или `IMAGES_MASTERS_ROOT`/`IMAGES_ARCHIVE_ROOT`, учётные данные — `R2_IMAGES_*`; переменные
  окружения процесса и `.env` в корне сайта (`--root`), никогда не `process.cwd()`.
- Пути файлов сайта — от корня сайта: `data/images/masters.jsonl`, `data/images/publication-ledger.jsonl`,
  `.cache/images/`, `src/generated/images-*.json`, фото из `COLLECTION_SOURCES`.
- Файл границ — `src/content/config/place-gps-bounds.yaml` (рядом с `places.yaml`), необязательный;
  `schemaVersion: 1` вместо `version: 1`, проверка через `assertSchemaVersion`; `placeId` сверяется с
  `loadPlacesConfig`. Переход описан в `UPGRADING.md` и проверен на фикстуре. Новые файлы сайта — в
  снапшоте `site-files`.
- Решения владельца 2026-11-15:
  - `data/images/*.jsonl` начинаются строкой-заголовком `{"schemaVersion":1}`, строки данных не
    меняются, дописывание в конец работает; переход — одна строка, в `UPGRADING.md` с фикстурой.
  - `@aws-sdk/client-s3` — необязательный peer ядра с ленивым импортом; без пакета `sync`, `prune`,
    `check-live` падают с ошибкой «установите `@aws-sdk/client-s3`», остальные команды его не грузят.
  - Генератор демо остаётся скриптом репо (замена — 6.12); `images activate` для `publicPath` пишет
    только дескриптор; команды проверяются на временных сайтах, упакованное демо гоняет новые гейты.
  - `images build` печатает предупреждение, когда GPS мастера предлагает другое место, чем `placeId`
    фото, или конфликтует с ним (`gps-place`); без файла границ или GPS — молча.
- `prune` только печатает план удаления по листингу бакета, ничего не удаляет (как исходный скрипт).
- Тесты на синтетических мастерах во временных сайтах и `FakeR2Client`; ни одного обращения к сети.

**Never:**

- Не переносить fixture-режим сборки (`source-fixtures`, `--fixture`, `IMAGES_FIXTURE_CONFIG`),
  `dev-local`, `fixture-e2e`, `run-live-e2e`, неиспользуемый `master-ingest` и синтетический водяной
  знак с инициалами.
- Не менять байты `configDigest`, ключи деривативов и схемы `images-*.json`.
- Не трогать валидацию контента, skills и пресеты (6.7C–D) и генерацию фото демо с EXIF/GPS (6.12).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Сборка | синтетические мастера, реестр, `images build --masters --archive` | релиз в `.cache/images/releases/<id>`, XMP-права в деривативах, `rightsEmbedded: true` | N/A |
| Нет корней | `images build` без опций и env | код ≠ 0 | называет `--masters`/`IMAGES_MASTERS_ROOT` |
| Активация | `images activate --release <id>` | `images-release.json` указывает на релиз | прерванная — `--recover` |
| Неизвестный `placeId` в границах | `check place-gps-bounds` | код ≠ 0 | файл и id |
| `version: 1` в границах | старая форма | код ≠ 0 | нет `schemaVersion`, список поддерживаемых |
| Sync без секретов | `images sync --release <id>` | код ≠ 0 | имена недостающих `R2_IMAGES_*` |
| Неизвестная опция | `images build --foo` | код 2 | список опций команды |

</frozen-after-approval>

## Code Map

- `$REF/scripts/lib/images/*.ts`, `$REF/scripts/images/*.ts` (`REFERENCE_SITE_ROOT`) -- источник
  переноса; тесты переносятся вместе с модулем на синтетике. Уже в ядре: `hashing`, `watermark`,
  `canonical`, `policy`, `manifest`, `release`; частично: `build-engine` → `lib/images/build/engine.ts`
  (байты на вход, `RightsWriter` внедряется — писатель XMP подключается сюда), `transform`
  (`noUpscaleWidth(s)`, `resizeToWidth` нет), `planLadderWidths` → `build/ladder.ts`, `config` →
  `config/images-schema.ts` + `build/config.ts` (`loadImageConfig(siteRoot)`, проекция хеша — не менять),
  `public-config` (`verifyPublicConfig` нет).
- `packages/core/src/cli/registry.ts` `COMMANDS`/`GATES`/`cliSurface`/`usage`, `run.ts` `RUNNERS`/
  `GATE_RUNNERS`/`parseArgs` (сейчас только `--root`/`--help`; добавить опции команды из реестра),
  `context.ts` `CliContext`, `test-fixtures.ts` `runAstrumScena` -- каркас 6.7A.
- `packages/core/src/lib/content/files.ts:150` `loadPlacesConfig`, `COLLECTION_SOURCES` -- места и фото.
- `packages/core/src/config/schema-version.ts:26` `assertSchemaVersion` -- версия файлов сайта.
- `packages/core/src/lib/content/schemas.ts:70-114` -- идентичность мастера фото (`legacyId` |
  `sha256`+`master`), на ней `resolveMaster`.
- `packages/core/package.json` -- `exiftool-vendored` в `dependencies` (проверить, что нет
  install-скриптов, иначе `allowBuilds`); `@aws-sdk/client-s3` — `peerDependencies` + `peerDependenciesMeta.optional`.
- `eslint.config.mjs:56-62,77-112,223-233` -- `build`-сегмент разрешён `cli/**`; `lib` не импортирует
  `cli/`.
- `scripts/lib/api-surface.ts:440` `extractCliCommands`, `packages/core/api-snapshot/{cli,site-files}.json`.
- `scripts/check-taxonomy-readers.ts` -- `place-gps-bounds` не называет `places.yaml`.
- `scripts/lib/identity.ts` `PUBLIC_HOSTS` -- хост R2-эндпоинта (`r2.cloudflarestorage.com`) из шаблона.
- `scripts/build-demo-from-pack.ts` `assertSiteGates` -- новые гейты агрегата в упакованном демо.
- `UPGRADING.md` (`ENTRY_PARTS`), `packages/core/README.md:34-53` Commands, `CHANGELOG.md` `[Unreleased]`.

## Tasks & Acceptance

**Execution (пакет 1 — локальная часть, ревью после пакета):**

- [x] `packages/core/src/cli/{registry,run}.ts` (+ тесты) -- опции команды в реестре, разбор и ошибка
  на неизвестную опцию; снапшот `cli`.
- [x] `packages/core/src/cli/images/` -- источники и реестр мастеров, ExifTool/метаданные/XMP-писатель,
  блокировка, `release-fs`, активация, `check-derivatives`, `validate-candidate`, политика лестницы,
  `ladder-report`, `colormode` и `photo-yaml`, `public-config` init/verify, команды и тесты.
- [x] `packages/core/src/cli/images/place-gps-bounds.ts`, `gps-place.ts` (+ тесты) -- загрузчик через
  `loadPlacesConfig`, гейт, предупреждение в `images build`.
- [x] `packages/core/package.json` -- `exiftool-vendored` (`dependencies`), `@aws-sdk/client-s3` (необязательный peer).
- [x] `eslint.config.mjs`, `scripts/eslint-config.test.ts`, `packages/core/src/lib/content/files.ts` --
  запрет `process.cwd` в ядре вне `cli/index.ts`.
- [x] `scripts/lib/api-surface.ts`, `api-snapshot/site-files.json` -- новые файлы сайта.
- [x] `UPGRADING.md` (+ фикстура) -- переход `version` → `schemaVersion` границ и заголовок `schemaVersion` у `data/images/*.jsonl`.

**Execution (пакет 2 — R2):**

- [x] `packages/core/src/cli/images/` -- R2/S3-клиенты, `r2-env`, `sync`, журнал публикаций, `prune`,
  `remote-verify`, `check-live`, `live-gate`, проверка публичного домена; тесты на `FakeR2Client`.
- [x] `scripts/build-demo-from-pack.ts`, `packages/core/README.md`, `CHANGELOG.md` -- гейты в упакованном
  демо, список команд.

**Acceptance Criteria:**

- [x] `pnpm demo:packed`: `astrum-scena check` из `node_modules` tarball проходит вместе с тремя новыми
  гейтами; `astrum-scena images --help` перечисляет команды.
- [x] `images build` на синтетическом мастере во временном сайте даёт релиз, который проходят
  `images check-derivatives` и `check images-policy` (тест).
- [x] Снапшот `cli` перечисляет все подкоманды и опции; `site-files` — файл границ и оба JSONL.
- [x] `pnpm check:taxonomy-readers` проходит; ни один новый модуль не читает `places.yaml` сам.
- [x] Строки матрицы I/O покрыты тестами команд.
- [x] Без `@aws-sdk/client-s3` `images sync` падает с подсказкой установить пакет, а упакованное демо
  (без пакета) проходит `astrum-scena check` — ни один модуль вне R2-команд его не импортирует (тест).
- [x] `process.cwd` в `packages/core/src` вне `cli/index.ts` — ошибка lint (`no-restricted-properties`,
  тест в `scripts/eslint-config.test.ts`); метка ошибки в `lib/content/files.ts:104` — от корня сайта.

## Implementation Notes

- Текущий запуск реализует только пакет 1; пакет 2 (R2) — в отдельной сессии после ревью пакета 1.
- Пакет 1 закрыт 2026-11-15 (реализован, проверен, отревьюирован, записан в триаж); спека возвращена в
  `in-progress`. Следующая сессия реализует только пакет 2 — его задачи и открытые критерии.
- Пакет 1 закоммичен владельцем (`ae985941d85c5c5f8fa9d5b83840565a013ae9c7`). Текущий запуск реализует
  только пакет 2; дифф его ревью — от этого коммита.
- Пакет 1 закрыт по задачам; открытыми до пакета 2 остаются критерии про `images --help` в упакованном
  демо и про `images sync` без `@aws-sdk/client-s3`, и строка матрицы «Sync без секретов».
- Решения реализации там, где спека молчит: `images build` без `--release` берёт id из UTC-времени
  (`20261115-142607`), без `--photos` — все фото контента; `images check-derivatives` без `--release`
  проверяет релиз кэша, чей манифест побайтно равен манифесту активного дескриптора (`--expect-tracked`
  исходного скрипта свёрнут в это); `images activate` требует `--release`, если нет `--recover`.
- Предупреждение GPS — только при конфликте с `placeId` или при предложении для фото без `placeId`;
  точка вне зон и пересечение несвязанных зон молчат; координаты в вывод не попадают.
- Журнал публикаций (`ledger.ts`) перенесён в пакете 1: снапшоту `site-files` нужна его схема.
  `IMAGES_MASTERS_ROOT`/`IMAGES_ARCHIVE_ROOT` — публичные имена в `consumer-env.ts` и `env.json`.
- Неизвестная опция теперь печатает опции команды, а не список команд (README и CHANGELOG обновлены;
  в критерии 6.7 в `epics.md` поведение не зафиксировано, правка не нужна).
- `exiftool-vendored@37.0.0` без install-скриптов; pnpm в workspace ставит необязательный peer
  `@aws-sdk/client-s3` автоматически (~360 строк lock-файла), в упакованное демо он не попадает.
- `README.md` ядра и `CHANGELOG.md` обновлены уже в пакете 1. Проверено: `pnpm check` (2160 тестов),
  `pnpm build`, `pnpm demo:packed` — зелёные.
- Патчи ревью (пакет 1, проход 1): `swapRelease` возвращает брошенный бэкап на место до удаления;
  `images colormode` считает все правки до первой записи; команды читают фото `.yaml` и `.yml` (оба
  файла одного id — ошибка); негативные тесты на запрещённое поле в деривативе и на неверную лестницу в
  гейте `images-policy`; точная метка ошибки контента от корня сайта; примеры JSONL в `UPGRADING.md`
  по строке на запись. После патчей `pnpm check` (2166 тестов), `pnpm build`, `pnpm demo:packed` зелёные.
- Пакет 2 реализован 2026-11-15 (дифф от `ae98594`). Решения там, где спека молчит:
  - `images sync` всегда работает с настоящим бакетом: флаги `--fake`/`--real` исходного скрипта не
    перенесены (в реестре спеки их нет), фейк остался только в тестах. `images prune` листает настоящий
    бакет read-only (исходный скрипт показывал отчёт на пустом фейке), без `--release` — по манифесту
    дескриптора релиза. `check-live` и `prune` открывают бакет read-only.
  - Порядок: учётные данные → ленивый импорт SDK → запросы; без секретов команда падает с именами
    переменных, не загрузив SDK. `sync` и `check-live` (кроме прохода неактивного пустого дескриптора)
    требуют `images.publicOrigin`: при `publicPath` — ошибка «the bucket commands need publicOrigin»;
    `prune` origin не нужен.
  - Внедрение для тестов: в `CliContext` необязательные `openBucket` и `fetch` (бин их не задаёт —
    R2 через SDK и глобальный `fetch`); `runAstrumScena` пробрасывает фейки. `FakeR2Client` —
    функция `createFakeR2Client` в `cli/images/test-fixtures.ts` (в пакет не входит), без классов.
  - Упакованное демо проверяет `images --help` и отсутствие SDK через `images prune` с фиктивными
    `R2_IMAGES_*`: демо отдаёт деривативы через `publicPath`, и `sync`/`check-live` отказывают раньше
    загрузки SDK. Отсутствие SDK в демо проверяется по настоящей ошибке Node, а не симуляции.
  - `R2_IMAGES_*` — публичные имена в `consumer-env.ts` и `env.json`; хост
    `r2.cloudflarestorage.com` добавлен в `PUBLIC_HOSTS` (ID аккаунта ловит `HEX_ID`).
  - Тест команд правит `site.yaml` через новый `editSiteConfig` в `config/fixtures/site-files.ts`
    (разрешённый писатель `site.yaml` в `scripts/site-yaml-readers.test.ts`).
  - Проверено: `pnpm check` (2213 тестов), `pnpm build`, `pnpm demo:packed` — зелёные.
- Патчи ревью (пакет 2, проход 1): `cache-control` разбирается по директивам (`immutable` обязателен,
  `no-store` запрещён); публичный HEAD с `redirect: 'manual'`, 3xx — ошибка; `prune` берёт опорным
  набором манифест дескриптора и, с `--release`, ещё манифест релиза; значения `R2_IMAGES_*` в ошибках
  бакетного клиента заменяются именами переменных; тесты на провал проверки после загрузки и на
  устаревший дескриптор в `check-live`. Известный остаток: ошибка уже во время чтения потока GET (только
  объекты без контрольной суммы) не маскируется — ошибки сокета на этом этапе не несут имя хоста. После
  патчей `pnpm check` (2220 тестов), `pnpm build`, `pnpm demo:packed` зелёные.

## Spec Change Log

## Review Triage Log

Пакет 1, проход 1 (Codex: blind, edge-case, verification-gap):

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|------|---------|---------|-------------|---------|
| 1 | blind, edge | `swapRelease` удаляет бэкап, не проверив, завершилась ли прошлая подмена (`release-fs.ts:32`) | medium | после сбоя между двумя `rename` релиз лежит только в `.backup-<id>`, а следующий `images build` того же id первым делом делает `rm(backupDir)` — единственная копия релиза (возможно, активного) теряется до пересборки | patch (исправлено) |
| 2 | blind, edge | `images colormode` пишет фото по одному и падает на позднем (`images-colormode.ts:42`) | low | `setPhotoColorMode` бросает на неверном `colorMode` или битом YAML уже после записи предыдущих файлов, вопреки комментарию команды «a missing master writes nothing»; исправление — сначала посчитать все выходы, потом писать | patch (исправлено) |
| 3 | blind | Команды видят только `.yaml`-фото (`content-photos.ts:11`) | low | коллекция фото принимает `**/*.{yaml,yml}` (`collection-sources.ts:3`), а `contentPhotoIds`/`photoFile` — только `.yaml`: фото `.yml` выпадает из `images build` без `--photos`, а `check-derivatives` пишет «has no content file» | patch (исправлено) |
| 4 | vgap | Нет негативного теста на запрещённые поля в деривативе (`check-derivatives.ts:179`) | medium | удаление проверки `deniedFieldsPresent` оставит все тесты зелёными; активация могла бы принять релиз с приватными метаданными | patch (исправлено) |
| 5 | vgap | Отказ гейта `images-policy` на неверной лестнице не проверен (`check-images-policy.ts:62`) | medium | удаление вызова `validateLadderManifest` оставит тесты зелёными | patch (исправлено) |
| 6 | vgap | Тест метки ошибки контента сверяет только хвост пути (`files.test.ts:133`) | low | регулярка `/albums[\\/]broken\.yaml: layout: /` пропустит возврат к `path.relative(process.cwd(), …)` | patch (исправлено) |
| 7 | своя | Пример «до» в `UPGRADING.md` показывает строку JSONL на шести строках | low | Prettier разложил блок ` ```jsonl ` по строкам, а текст рядом говорит «one JSON object per line» — пример противоречит описанию формы | patch (исправлено) |
| 8 | blind | Пересборка id активного релиза подменяет его кэш (`images-build.ts:138`) | low | дескриптор хранит свой манифест целиком (`release.ts` `descriptor.manifest`), так что сайт продолжает отдавать активированный набор; расходится только кэш, и `images check-derivatives` без `--release` тогда падает с «no cache release matches the active release descriptor», а не проходит молча; исходный `build.ts` так же заменяет релиз того же id | reject |
| 9 | blind | `check-derivatives` пропускает `rightsEmbedded: false`, если файл и манифест согласны (`check-derivatives.ts:178`) | low | флаг — честный результат обратного чтения при сборке (`createRightsWriter` возвращает `inspectRights`), проверка сверяет его с фактом; требование `true` — новая политика, которой нет в исходном `check-derivatives.ts:225`, а Always спеки держит поведение исходного скрипта; сборка CLI всегда пишет права, тест сборки проверяет `true` в AVIF и WebP | reject |
| 10 | blind | `activate` не проверяет, что `.cache` не симлинк наружу (`activate.ts:129`) | low | релиз для активации появляется только через `images build`, а она до записи проверяет `assertCacheWithinRoot` для каталогов релиза под тем же `.cache/images` (`images-build.ts`); симлинк наружу валит сборку, и активировать нечего, если `.cache` не подменён вручную; исправление — новый guard | reject |
| 11 | blind | Каталог релиза-симлинк за пределами кэша проходит `checkRelease` (`check-derivatives.ts:89`) | low | каталоги релизов создаёт только `swapRelease` переименованием настоящего staging-каталога после `assertCacheWithinRoot` (`images-build.ts`); симлинк возможен лишь ручной подменой; исправление — новый guard | reject |
| 12 | blind, edge | Вставка `colorMode` портит YAML в flow-стиле или с отступом верхнего уровня (`photo-yaml.ts:39`) | low | все фото демо и фикстуры `photo-yaml.test.ts` — блочные отображения без отступа, ни один писатель ядра не пишет flow-стиль; исправление — новый guard на маловероятную раскладку | reject |
| 13 | blind, edge | `walkFiles` глотает ошибки `readdir` и может пропустить конфликт года (`source-resolver.ts:118`) | low | поведение перенесено без изменений из исходного `source-resolver.ts`; нужна ошибка прав в собственном архиве владельца; исправление меняет смысл отсутствующего корня (сейчас — `missing-master`) и добавляет ветки | reject |
| 14 | blind, edge | `--recover` удаляет неполный журнал при битом дескрипторе и битом бэкапе (`activate.ts:236`) | low | `activateRelease` загружает и проверяет текущий дескриптор (`loadReleaseDescriptor(root).raw`) до записи журнала, а неполный журнал значит, что `rename` не выполнялся — отслеживаемый файл остаётся проверенным, если его не испортили руками после сбоя; исправление — новая ветка | reject |
| 15 | blind | `images build --unknown --help` выходит с кодом 0 (`run.ts:174`) | low | `--help` ничего не запускает и печатает справку; то же решение, что строка 3 триажа 6.7A (`chek --help`) | reject |
| 16 | edge | Lock с JSON без `acquiredAt` роняет форматирование даты (`locking.ts:76`) | low | файл блокировки пишет только `acquireLock` с числовым `acquiredAt` (`satisfies LockRecord`); не-JSON уже идёт по ветке с подсказкой; нужен ручной JSON без поля; исправление — новый guard | reject |

Пакет 2, проход 1 (Codex: blind, edge-case, verification-gap; дифф от `ae98594`):

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|------|---------|---------|-------------|---------|
| 1 | blind, edge | `immutable` в `cache-control` ищется подстрокой (`public-domain-check.ts:42`) | low | `no-store, immutable` и `not-immutable` проходят публичную проверку; исправление — разбор директив через запятую, нужна директива `immutable` и нет `no-store` | patch (исправлено) |
| 2 | blind | `prune --release <кандидат>` называет сиротами объекты активного релиза (`prune.ts:23`) | medium | опорный набор — только выбранный манифест, так что отчёт «план удаления» перечисляет ключи, которые сайт отдаёт сейчас; удаление по нему ломает живой сайт; исправление — объединить выбранный манифест с манифестом дескриптора | patch (исправлено) |
| 3 | blind | Публичный HEAD идёт за редиректами (`public-domain-check.ts:32`) | low | `fetch` по умолчанию следует редиректам, и origin, который перенаправляет на другой хост, проходит проверку как отдающий сам; исправление — `redirect: 'manual'` и 3xx как ошибка | patch (исправлено) |
| 4 | blind | ID аккаунта R2 может попасть в вывод через ошибку SDK (`s3-client.ts:124`) | medium | эндпоинт `https://<accountId>.r2.cloudflarestorage.com`, а `runImageCommand` печатает сообщение ошибки как есть (например `getaddrinfo ENOTFOUND <accountId>…`), вопреки «Values are never printed» в `r2-env.ts`; исправление — заменять значения `R2_IMAGES_*` в сообщениях ошибок бакетных команд именами переменных | patch (исправлено) |
| 5 | vgap | Нет теста на провал проверки после успешной загрузки (`sync.ts:116`) | medium | удаление цикла `verifyRemoteObject` после загрузки оставит тесты зелёными, и релиз записался бы в журнал непроверенным | patch (исправлено) |
| 6 | vgap | Отказ `check-live` на устаревшем дескрипторе не проверен командой (`images-check-live.ts:83`) | medium | если команда проигнорирует `fail` от `decideLiveGate`, юнит-тесты гейта и два командных теста пройдут | patch (исправлено) |
| 7 | blind, edge, vgap | Безусловный PUT после HEAD может перезаписать чужой объект (`s3-client.ts:57`) | false | ключ содержит sha256 своих байтов (`ladderObjectKey`, `lib/images/build/hashing.ts`), так что честный писатель того же ключа пишет те же байты; другие байты под этим ключом возможны лишь у писателя вне ядра, а проверка после загрузки (`sync.ts`) сверяет длину и контрольную сумму | reject |
| 8 | blind, edge | Проверка доверяет sha256 из метаданных объекта (`remote-verify.ts:30`) | low | метаданные пишет сам `sync` вместе с проверенными байтами; поведение перенесено без изменений из исходного `remote-verify.ts` («cheap before expensive»); потоковое хеширование всегда скачивало бы весь бакет на каждом `check-live` в CI | reject |
| 9 | blind | `sync` принимает существующий объект, не проверяя его заголовки (`sync.ts:100`) | low | заголовки ставит только `sync` при загрузке (`IMMUTABLE_CACHE_CONTROL`, `contentTypeForFormat`), а `check-live` через публичный HEAD (`public-domain-check.ts`) падает на неверном content-type или кэшировании — это гейт перед деплоем | reject |
| 10 | blind | Публичная проверка не сверяет байты (`public-domain-check.ts:32`) | low | так задумано и записано в комментарии модуля: «Bytes are not verified here (the bucket check does that)»; байты сверяет `checkLive` по бакету в той же команде | reject |
| 11 | blind | У публичных HEAD нет тайм-аута (`public-domain-check.ts:32`) | low | зависший origin маловероятен, и прогон упирается в тайм-аут задачи CI; исправление — новый параметр тайм-аута | reject |
| 12 | blind | Манифест читается дважды — до проверки и в ней (`sync.ts:85`) | low | единственный писатель манифеста релиза в ядре — `images build`, и он берёт ту же блокировку, что `images sync` (`images-sync.ts` `withLock`); подмена между чтениями требует писателя вне ядра | reject |

## Verification

**Commands:**

- `pnpm check` -- expected: зелёный.
- `pnpm build` -- expected: ядро и демо собираются.
- `pnpm demo:packed` -- expected: гейты CLI и сборка из tarball проходят.
