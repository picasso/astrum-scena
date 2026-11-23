---
title: 'Переиспользуемый CI сайта, реестр гейтов и гейт одной версии ядра (6.8)'
type: 'feature'
created: '2026-11-17'
status: 'done'
baseline_commit: '4bf59b474c99998a1798336cadf1a376a544a4da'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-7d-site-skills-and-presets.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** CI есть только у репо ядра; у сайта на ядре нет общего workflow, поэтому CI сайтов
разойдётся, а пакет, workflow и skills одного сайта могут оказаться разных версий (AD-14, AD-20).
Гейты CLI — список имён без контрактов и писателей. Ничто не мешает CI собрать сайт на ядре,
подключённом через `pnpm link`. Контент исходного сайта на ядре ни разу не собирался.

**Approach:** Ядро поставляет переиспользуемый workflow `site.yml`: гейты CLI из lockfile сайта,
одна сборка, read-only проверка R2 и деплой с защитой из 5.13. Демо собирается этим workflow. CLI
ведёт типизированный реестр «контракт → гейт → писатель» и получает гейт `core-version`: тег
workflow и `pnpm link` в CI. Пробная сборка контента исходного сайта на ядре проходит локально, без
коммита; её пробелы записываются в спеку.

## Boundaries & Constraints

**Always:**

- Сайт подключает `site.yml` строкой `uses: <owner>/<repo>/.github/workflows/site.yml@<40-hex SHA> # v<версия>`.
  Workflow зовёт `pnpm exec astrum-scena …` после `pnpm install --frozen-lockfile` сайта.
- Секреты объявлены в `on.workflow_call.secrets` поимённо и все `required: false`:
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` и read-only `R2_IMAGES_*`. `PUBLIC_*` приходят входом
  `public-env` (строки `KEY=value`); имя вне снапшота `env` ядра или пустое значение — ошибка.
  `secrets: inherit` нигде нет.
- В workflow нет записи в R2: ни `images sync`, ни `images prune`, ни `images activate`. Live-проверка
  — только `images check-live`.
- Деплой идёт только на `push` в `main` и только при входе `deploy: true`:
  - job-concurrency `production-deploy`, `queue: max`, `cancel-in-progress: false`;
  - до регистрации deployment и Wrangler `getBranch('main')` сверяется с `github.sha`; при
    расхождении — notice и ни одного шага публикации; при ошибке API — падение;
  - `dist` берётся из артефакта единственной сборки; Wrangler — из lockfile сайта, проект — из его
    `wrangler.toml`.
- Джоб, которому нужен секрет, без секрета (PR из форка) пропускает работу шагом с
  `::notice::<job>: skipped — <имя секрета> is not available` и не падает. Гейты и сборка секретов не
  требуют.
- Все внешние `uses:` закреплены 40-hex SHA с комментарием версии; образ — по digest.
- Реестр: каждому гейту из `GATES` соответствует ровно один контракт, у контракта ровно один гейт.
  Писатель — команда из `COMMANDS` или `owner` (файл правит человек). Соответствие держит тип
  `Record<Gate, …>`, остальное — тест в `pnpm check`. Гейт `skills` остаётся единственным гейтом
  штампа skills: `core-version` его не повторяет.
- Гейт `core-version`:
  - каждая ссылка сайта на `site.yml` ядра в `<root>/.github/workflows/*.yml` закреплена 40-hex SHA,
    а её комментарий `# v<версия>` равен версии установленного ядра; без ссылок гейт проходит;
  - при `CI=true` реальный путь `node_modules/@picasso-ai/astrum-scena` лежит внутри
    `<root>/node_modules`, иначе гейт падает. Исключение — спецификатор `workspace:` в
    `package.json` сайта (демо в монорепо ядра).
- Пробная сборка исходного сайта: временный сайт под `.cache/` (gitignored), ядро из `pnpm pack`.
  Исходный сайт только читается. Ни скриптов, ни фикстур с его данными в репо не появляется (AD-22).
- Решения владельца 2026-11-17:
  - Все четыре цели — в одной спеке, три пакета. После каждого пакета ревью; следующий пакет — в
    новой сессии.
  - Пробелы пробной сборки: в 6.8 закрываются только пробелы ядра размером с патч (схема, загрузчик,
    MDX-плагин). Остальные становятся новыми историями в `epics.md` до 9.1. Список пробелов попадает в
    спеку после пакета 3.

**Never:**

- Не переносить PR-reuse, pass-marker, Lighthouse и e2e исходного сайта. Сайтовые e2e — история 9.2;
  запись `deferred-work.md` про reuse остаётся открытой.
- Не трогать e2e контактной формы (запись 6.8 в `deferred-work.md`): ядро ещё не поставляет Pages
  Function.
- Не проверять соответствие SHA тегу через сеть.
- Не менять существующие гейты, кроме добавления `core-version`. Не сливать гейты репо ядра
  (`scripts/check-*.ts`) в реестр CLI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ссылка в порядке | `site.yml@<sha> # v<installed>` | `check core-version` OK | N/A |
| Старый тег | комментарий `# v0.1.0`, ядро `0.2.0` | код 1 | путь workflow и обе версии |
| Ветка или тег вместо SHA | `site.yml@main` | код 1 | путь и требование 40-hex SHA |
| Нет `.github/workflows` | демо | OK | N/A |
| `pnpm link` в CI | ядро-симлинк вне `node_modules`, `CI=true` | код 1 | реальный путь ядра |
| `pnpm link` локально | то же, без `CI` | OK | N/A |
| `workspace:*` в CI | демо в монорепо | OK | N/A |
| PR из форка | секретов нет | гейты и сборка зелёные, live и deploy — notice | N/A |
| Устаревший запуск main | `getBranch` ≠ `github.sha` | notice, нет deployment и Wrangler | N/A |
| `public-env` с чужим именем | `FOO=1` | джоб падает до сборки | имя и список допустимых |

</frozen-after-approval>

## Code Map

- `.github/workflows/ci.yml` — репо-джобы `gates`, `e2e` и `commit-messages` остаются. Джоб
  `demo-from-pack` заменяется вызовом `uses: ./.github/workflows/site.yml` с входом
  `site-artifact` и `deploy: false`.
- `.github/workflows/release.yml` — образец закрепления `uses:` и `permissions`.
- Новый `.github/workflows/site.yml` (`workflow_call`):
  - входы: `site-artifact`, `node-version-file`, `public-env`, `deploy`, `live-checks`;
  - джобы: `gates` (install, `lint` и `typecheck` сайта через `--if-present`, `astrum-scena check`,
    `astro build`, артефакт `dist`), `live` (`images check-live`), `deploy`.
- Образец защиты деплоя — `$REF/.github/workflows/ci.yml` (`$REF` = `REFERENCE_SITE_ROOT`):
  - job `deploy` около :420–530: `concurrency`, `queue: max`, шаг «Check production freshness»
    на `actions/github-script`, `createDeployment`, `cloudflare/wrangler-action`
    (`pages deploy --branch=main`), финальный статус `always()`;
  - `images-live` :267 — набор секретов R2.
  - Брать только механизм, без имён и доменов.
- `packages/core/src/cli/registry.ts` — `GATES`, `COMMANDS`, `cliSurface`, `usage`:
  - добавить гейт `core-version` и `CONTRACTS: Record<Gate, {contract, writer}>`;
  - `writer` — имя из `COMMANDS` или `'owner'`.
- `packages/core/src/cli/run.ts` — `GATE_RUNNERS`, `checkAll`.
- Новый `packages/core/src/cli/commands/check-core-version.ts` (раскладку уточнить по соседним
  гейтам) и его тест. Образец проверки «установлен, а не прилинкован» —
  `scripts/build-demo-from-pack.ts` `installedCore` около :137.
- Версия ядра: `install/bundle.ts` `readCoreBundle`, `core-imports.ts` `installedManifest`,
  `CliContext.coreRoot`.
- `scripts/build-demo-from-pack.ts` `buildPackedDemo` :789, `prepareSite` :115 (сейчас
  `file:<абсолютный tarball>`). Для артефакта нужен режим `--out <dir> --keep`, в котором tarball
  лежит в сайте, а ссылка на него относительная. `assertSiteGates` :520 добавляет `check core-version`.
- `packages/core/api-snapshot/cli.json` — `pnpm api:snapshot`; добавление гейта совместимо.
- Новый `scripts/ci-workflows.test.ts` (в `pnpm check` через `test`) — инварианты Always по YAML
  обоих workflow:
  - нет `inherit`; внешние `uses:` закреплены SHA;
  - нет команд записи R2;
  - у `deploy` есть `if` push в main, concurrency и шаг свежести раньше Wrangler и `createDeployment`;
  - секреты объявлены поимённо.
- `demo/package.json` и корневой `package.json` — алиас `check:core-version`.
- `packages/core/README.md` (Commands, CI), `CHANGELOG.md` `[Unreleased]`.
- `deferred-work.md`: записи 6.8 (reuse около :141, контакт около :359) не закрываются (Never).

## Tasks & Acceptance

**Execution (пакет 1 — реестр и гейт версии; ревью после пакета):**

- [x] `packages/core/src/cli/registry.ts`, `run.ts` (+ тест) — `CONTRACTS`; тест «писатель
  существует, контракты уникальны».
- [x] `packages/core/src/cli/commands/check-core-version.ts` (+ тест на строки матрицы гейта) — гейт
  `core-version`; `usage`, снапшот `cli`, алиасы.
- [x] `scripts/build-demo-from-pack.ts` (+ тест) — `check core-version` в упакованном демо; проба с
  workflow-ссылкой на чужую версию даёт код 1.
- [x] `packages/core/README.md`, `CHANGELOG.md` — реестр и гейт.

**Execution (пакет 2 — workflow):**

- [x] `scripts/build-demo-from-pack.ts` — переносимый каталог сайта для артефакта (tarball внутри,
  ссылка относительная, lockfile).
- [x] `.github/workflows/site.yml` — workflow по Always.
- [x] `.github/workflows/ci.yml` — демо через `site.yml`.
- [x] `scripts/ci-workflows.test.ts` — инварианты.
- [x] `packages/core/README.md` — подключение `site.yml` сайтом: строка `uses`, секреты,
  `public-env`.

**Execution (пакет 3 — пробная сборка; без коммита данных исходного сайта):**

- [x] Временный сайт под `.cache/trial-site/`: `astro build` и `astrum-scena check`. Пробелы — в
  Implementation Notes. Пробелы размером с патч закрываются правкой ядра (+ тест); остальные
  становятся историями в `epics.md` до 9.1.

**Acceptance Criteria:**

- [x] `pnpm check` зелёный: тест реестра, тест гейта `core-version` и `ci-workflows.test.ts` в нём.
- [x] `pnpm demo:packed`: `check core-version` проходит, проба с чужой версией тега даёт код 1.
- [x] Снапшот `cli` перечисляет `check core-version`.
- [ ] В CI PR джоб демо — вызов `site.yml`; он проходит гейты и сборку, а `live` и `deploy` пропущены с
  notice.
- [x] Пробная сборка выполнена. Каждый пробел записан с решением: правка ядра в 6.8 или история до
  9.1 в `epics.md`.

## Design Notes

- Демо в CI нельзя собрать из workspace: `workspace:*` и симлинк. Поэтому джоб ядра готовит
  переносимый сайт (`demo:packed --out`), кладёт его артефактом, а `site.yml` при `site-artifact`
  скачивает его вместо checkout. Дальше путь тот же, что у настоящего сайта.
- Штамп skills уже сверяет гейт `skills`; второй гейт на тот же контракт нарушил бы AD-14. Поэтому
  `core-version` проверяет только тег workflow и способ установки.

## Verification

**Commands:**

- `pnpm check` — зелёный.
- `pnpm build` — зелёный.
- `pnpm demo:packed` — зелёный, в выводе `check core-version OK`.
- `actionlint` (если установлен) на `.github/workflows/*.yml` — без ошибок, кроме известного ключа
  `queue`.

**Manual checks (if no CLI):**

- После push ветки: в Actions PR-запуск зовёт `site.yml`, в логах `live` и `deploy` — notice о
  пропуске.

## Implementation Notes

- Текущий запуск реализует только пакет 1; пакеты 2 и 3 — в отдельных сессиях после ревью
  предыдущего пакета.
- Пакет 1 реализован 2026-11-17 (дифф от `4bf59b4`). Решения там, где спека молчит:
  - `CONTRACTS` в `registry.ts`: писатели — `config resolve`, `layout-tokens`, `images build`
    (`image-files`), `images activate` (`images-policy`), `images public-init`,
    `content factcheck review` (`factcheck`), `install` (`skills`); остальные гейты — `owner`. Тест
    реестра — в `run.test.ts`.
  - `core-version` находит `<owner>/<repo>` ядра по `repository.url` его `package.json`; ссылки ищутся
    по строкам: ключ `uses` голый или в кавычках, в начале строки или во flow-mapping; комментарий —
    хвостовой `# …` строки. Режим CI — только `CI=true`; `CI` объявлен в `consumer-env.ts` как
    `internal`.
  - Упакованное демо: `assertCoreVersionGate` с `CI=true` — голая установка, проба с текущей
    версией (OK) и со следующей minor (код 1); каталог `.github` пробы удаляется.
- Патчи ревью (пакет 1, проход 1): ключ `"uses"` в кавычках и flow-mapping; тест с верной ссылкой в
  одном файле и устаревшей в другом. Пакет 1 закрыт 2026-11-17: `pnpm check` (2418 тестов),
  `pnpm build`, `pnpm demo:packed` зелёные. Следующая сессия реализует только пакет 2; дифф его ревью
  — от коммита пакета 1.
- Пакет 1 закоммичен (`25390fff8e79b7a87c5969e12eb98ae1f9945e15`). Текущий запуск реализует только
  пакет 2; пакет 3 — в отдельной сессии после ревью пакета 2.
- Пакет 2 реализован 2026-11-18 (дифф от `25390ff`). Решения там, где спека молчит:
  - Переносимость — во всех режимах `demo:packed`, а не только `--out … --keep` (`--out` и так
    оставляет каталог): tarball пакуется в `site/`, ссылка `file:./<tarball>`, в сайт пишутся
    `packageManager` корня и `.nvmrc` (их читают `pnpm/action-setup` и `setup-node`); удаление `.tgz`
    из `<out>` убрано. Чистая функция `portableManifest` (+ тест).
  - `ci.yml`: джоб `demo-site` — `pnpm demo:packed --out .cache/demo-site` (все проверки упакованного
    демо остаются в CI), удаление `node_modules`, `dist`, `.astro` и артефакт `demo-site`; джоб `demo`
    зовёт `site.yml` с `site-artifact: demo-site`, `deploy: false`, `live-checks: false`, без секретов.
    Вызывающий выдаёт `deployments: write`: GitHub проверяет права всех джобов вызываемого workflow,
    даже пропущенных.
  - `site.yml`: `public-env` проверяется первым шагом `gates` (до checkout и install), допустимые имена
    — `PUBLIC_ENV_NAMES` в шаге, тест сверяет их с `public`-именами `PUBLIC_*` из `CONSUMER_ENV`.
    `live` — `if: inputs.live-checks`; `deploy` — job-`if` (push в main, `deploy: true`, `gates`
    успешен, `live` успешен или пропущен) со статической группой `production-deploy`. Пропуск джоба
    входом или событием объявляет notice последнего шага `gates`; пропуск без секрета — первый шаг
    самого джоба (`::notice::<job>: skipped — <имя> is not available`, первое отсутствующее имя).
    Секреты — только в `env` шагов, которым нужны, не в `env` джоба (install сайта их не видит).
    Wrangler — `pnpm exec wrangler --version` до деплоя, иначе wrangler-action поставил бы свой.
  - `ci-workflows.test.ts` разбирает YAML всех трёх workflow и запускает bash-скрипты шагов
    `public-env` и «Secrets» (строки матрицы `FOO=1` и PR из форка).
  - Проверено: `pnpm check`, `pnpm build`, `pnpm demo:packed` зелёные; копия `site/` без
    `node_modules`, `dist`, `.astro` вне репо прошла `pnpm install --frozen-lockfile`, `typecheck`,
    `CI=true astrum-scena check` и `astro build`; `actionlint` — только известный ключ `queue`. Запуск
    `site.yml` в Actions не проверен (нужен push ветки).

- Патчи ревью (пакет 2, проход 1): проверка свежести перенесена вплотную к регистрации deployment
  (после установки и скачивания `dist`); тест исполняет скрипты свежести и статуса deployment с
  заглушками `github`, `context`, `core`; тест инвариантов читает все workflow каталога. Пакет 2 закрыт
  2026-11-18: `pnpm check` (2449 тестов), `pnpm build`, `pnpm demo:packed`, `pnpm test:e2e` (до патчей)
  зелёные; `site.yml` в Actions не запускался — ручная проверка спеки после push. Следующая сессия
  реализует только пакет 3; дифф его ревью — от коммита пакета 2.
- Пакет 2 закоммичен (`9d029f3788e656c8edcd5685248f17d57cab3e82`). Текущий запуск реализует только
  пакет 3; дифф его ревью — от `9d029f3`.
- Пакет 3 выполнен 2026-11-18. Пробный сайт `.cache/trial-site/` собран скриптом подготовки вне репо
  (scratchpad сессии): ядро из `pnpm pack` текущего коммита, файлом `file:./<tarball>` внутри сайта;
  из исходного сайта только копируются контент, тема, бренд, водяной знак, `src/generated/images-*.json`,
  `public/`, реестр мастеров, журнал публикаций и ledger фактчека; каркас сайта (`package.json`,
  `astro.config.mjs`, `src/content.config.ts`, `tsconfig.json`) — как у демо. Формы файлов приведены
  записями `[Unreleased]` `UPGRADING.md` по порядку: `schemaVersion` во всех файлах, один `site.yaml`
  (`schemaVersion: 3`, секция `modules.courses` из `courses`, `moreDocs.course`,
  `surfaces.coursesIndex`, `banners.surfaces.coursesIndex`), 10 курсов из `pages` в `courses` без
  `kind`, зоны мест в `src/content/config/`, первая строка `{"schemaVersion":1}` в `.jsonl`,
  `schemaVersion` ledger, 9 токенов темы, которых не читает ни ядро, ни исходный сайт, удалены. Затем
  `config resolve`, `layout-tokens`, `content factcheck review`, `install`.
- Результат пробной сборки: `astro build` — 90 страниц, тот же набор файлов `dist` (105, без
  `_astro/`), что у последней сборки исходного сайта; `_redirects`, `robots.txt`, оба sitemap
  побайтно равны. HTML после нормализации хешей отличается только минификацией скриптов (версия
  Astro), шейдом `var(--color-shade)` вместо `#000` (запись темы в `UPGRADING.md`; токен сайта —
  `#000000`) и пробелами строки копирайта; CSP в `_headers` — хешами тех же скриптов. В CSS нет
  четырёх утилит (`uppercase`, `outline`, `sepia`, `ease-in-out`), которые не использует ни одна
  страница. `astrum-scena check` (13 гейтов, `CI=true check core-version` тоже) и `astro check`
  зелёные; ESLint и markdownlint на установленных конфигах чисты; `images public-init` побайтно
  повторяет `images-public.json`; `configDigest` из lock равен дескриптору; `images colormode` по
  настоящим мастерам — 17 фото без изменений; `images build` одного фото даёт 12 производных с теми же
  sha256 и размерами, что в манифесте, — перекодировать ничего не нужно.
- Пробелы пробной сборки и решения:
  1. Запись курсов в `UPGRADING.md` не говорила, что записи ledger фактчека перенесённых курсов
     меняют `targetCollection: pages` на `courses`; по записям как есть `check factcheck` падает на
     каждом курсе. Решение: правка ядра в 6.8 — запись курсов (After, Order, Writers, Verify: правка ledger при его наличии, затем `content factcheck review`) и `CHANGELOG.md`
     `Fixed`. Теста нет: правка — текст процедуры; `check:upgrading` проверяет её структуру, а
     пробная сборка — сам переход.
  2. Пресет Prettier ядра не принимает файлы, которые пишет и побайтно сверяет ядро:
     `site.lock.yaml` (двойные кавычки), `src/generated/images-public.json` (многострочные массивы),
     установленные skills и агенты (нет пустой строки после штампа). `prettier --write .` сайта роняет
     гейты `config-lock`, `images-public-config` и `skills` (проверено на пробном сайте); репо ядра
     прячет это корневым `.prettierignore`. Решение: история 6.13 в `epics.md` — не схема, не
     загрузчик и не MDX-плагин, а выбор между формой писателей (меняет байты lock — ломающее) и
     механизмом исключения через `install`.
  3. Обработчик формы и охрана хоста (`src/lib/contact/handle.ts`, `host.ts`) не экспортированы;
     обёртка `functions/api/` сайта (AD-15, 9.1) может взять их только глубоким импортом (AD-3).
     Решение: история 6.14 в `epics.md` (новая точка входа и снапшот `exports`). Запись 6.8 про e2e
     формы в `deferred-work.md` остаётся открытой.
  4. Словари: все 58 ключей JSON-словарей исходного сайта ядро знает в обеих локалях, своими у сайта
     остаются два (`footer.quote`, `contacts.intro`). Перенос в `src/i18n/<locale>.yaml` — часть
     утоньшения сайта, как удаление его копии движка, а не переход формы файла ядра. Решение: новой
     истории нет, покрыто критерием 9.1 «своё у сайта — тема, словари…».
  Гейты CI исходного сайта, которых нет у ядра (SEO-артефакт, бюджет страниц, проверка production-
  сборки, smoke), пробная сборка не трогает: их разбирает критерий 9.2.
- Патчи ревью (пакет 3, проход 1): переход курсов в `UPGRADING.md` — правка ledger условна (только
  имеющиеся записи), после неё `content factcheck review` (пакет называет коллекцию), Verify ждёт
  смены заголовков пакета; критерий 6.13 добавляет `prettier --write .`. Пакет 3 закрыт 2026-11-18:
  `pnpm check` (2449 тестов) и `pnpm build` зелёные. Открыт только критерий CI PR: запуск `site.yml`
  в Actions проверяется вручную после push ветки.

## Spec Change Log

## Review Triage Log

Пакет 1, проход 1 (Codex: blind, edge, vgap; дифф от `4bf59b4`):

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|------|---------|---------|-------------|---------|
| 1 | blind, edge, vgap-other | `USES` не видит ключ `"uses"` в кавычках и flow-mapping `{ uses: … }`: неверная ссылка проходит гейт | medium | `check-core-version.ts:15` якорит `uses:` к началу строки без кавычек; гейт печатает «no workflow runs its site.yml» | patch |
| 2 | blind, edge | строка `uses: <ядро>/…/site.yml@…` внутри `run: \|` даёт ложное падение | low, отклонено | нужен скрипт с буквальной ссылкой на `site.yml` ядра; гейт тогда падает громко, с `path:line`, а не пропускает молча; разбор блочных скаляров добавил бы сложность | reject |
| 3 | blind | `workspace:` пропускает проверку установки целиком | false | исключение для `workspace:` прямо задано правилом Always во frozen-блоке | reject |
| 4 | blind | сайт в pnpm-монорепо с общим `.pnpm` в корне ложно падает | low, отклонено | у сайта по AD-14 свой репо (`site-repo/` в ARCHITECTURE-SPINE); единственный монорепо-случай — демо, его снимает `workspace:` (`check-core-version.ts:82`) | reject |
| 5 | blind, edge | CLI чужого ядра с `--root` сверяет workflow с версией бегущего ядра, а не установленного | low, отклонено | сайт и `site.yml` зовут бин через `pnpm exec` и алиасы `package.json`, которые разрешают ядро самого сайта, так что `coreRoot` — его установленное ядро; на той же модели стоит гейт `skills` (`check-skills.ts:27`) | reject |
| 6 | blind, vgap | нет теста: верная первая ссылка не скрывает неверную следующую в другом файле | medium | `check-core-version.test.ts:70` — две верные ссылки; все тесты отказа содержат одну ссылку | patch |

Пакет 2, проход 1 (Codex: blind, edge, vgap; дифф от `25390ff`):

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|------|---------|---------|-------------|---------|
| 7 | blind, edge | `getBranch` в `deploy` идёт до checkout, установки и скачивания `dist`: `main` может уйти вперёд до регистрации deployment | low | окно реально (`site.yml:228` до `:279`), но отката нет: следующий деплой ждёт в `production-deploy` с `queue: max`; правка — перестановка шага | patch |
| 8 | blind | без секрета R2 `live` проходит, и деплой идёт без live-проверки | false | так требует правило Always во frozen-блоке: джоб без секрета пропускает работу с notice и не падает | reject |
| 9 | blind, edge | артефакт `dist` конфликтует при двойном вызове `site.yml` в одном запуске | low, отклонено | сайт вызывает `site.yml` один раз (README, раздел CI); в `ci.yml` другого артефакта `dist` нет; параметр имени добавил бы вход | reject |
| 10 | blind | у артефакта демо нет workflow-ссылки, и проверка ссылок в `site.yml` не исполняется | false | ссылки проверяет `assertCoreVersionGate` на установленном tarball внутри `pnpm demo:packed`, который CI-джоб `demo-site` и запускает (`build-demo-from-pack.ts:410`) | reject |
| 11 | blind, vgap ×2 | скрипты свежести и статуса deployment не исполняются: перевёрнутые ветки проходят тесты; включённые `live` и `deploy` не прогоняются | medium | тест `ci-workflows.test.ts:212` сверяет только строки; демо зовёт с `deploy: false`; проводка действий в Actions — ручная проверка спеки после push | patch |
| 12 | blind | у демо нет скрипта `lint`, падение `lint` не проверено | false | шаг — обычный `run:` в bash с `-e`: ненулевой код валит шаг; `--if-present` меняет только поведение при отсутствии скрипта | reject |
| 13 | blind | инварианты «каждого workflow» проверяются на трёх зашитых файлах | low | `ci-workflows.test.ts:35` `WORKFLOWS`; новый файл обходит проверки; правка — чтение каталога | patch |

Пакет 3, проход 1 (Codex: blind, edge, vgap; дифф от `9d029f3`; vgap — без находок):

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|------|---------|---------|-------------|---------|
| 14 | blind, edge | после смены `targetCollection` пакет `data/factcheck/review.md` устаревает, `check factcheck` падает | medium | заголовок пакета рендерит коллекцию (`factcheck-review.ts:64`), а запись ledger идёт «в любом порядке» с записью курсов | patch |
| 15 | blind | Verify курсов: «в diff ledger только строки `targetCollection`» противоречит записи ledger, меняющей `version` в том же коммите | low | `UPGRADING.md` запись ledger, Verify: «only the `version` line changed»; правка — формулировка | patch |
| 16 | blind | правка ledger написана как обязательная, хотя ledger необязателен и у курса может не быть записи | low | запись ledger: «it stays optional»; правка — условная формулировка | patch |
| 17 | blind | критерий 6.13 гоняет только `prettier --check .`, хотя исход истории — `--write .` не ломает гейты | low | Primary outcome 6.13 называет `--write`, критерий — нет; правка — дописать шаг | patch |
| 18 | blind | критерий 6.13 не требует слияния механизма исключения с правилами сайта и идемпотентности | low, отклонено | механизм ещё не выбран: первый критерий 6.13 оставляет выбор (форма писателя или исключение) спеке истории, где и задаются его свойства | reject |
| 19 | blind | статус спеки `in-review` расходится с заметкой «остаётся `in-progress`» | low, отклонено | правка — в спеке этой сборки; статус задаёт шаг workflow, заметка обновлена при закрытии пакета | reject |
