---
title: 'Валидация контента, маркеры перевода и fact-check как команды CLI ядра (6.7, часть C)'
type: 'feature'
created: '2026-11-15'
status: 'done'
baseline_commit: '50415184be253d1caa0a422e3a4b556b4b6fd1ba'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-7b-image-pipeline-cli.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Валидация контента, маркеры перевода `translatedFromDigest` и fact-check живут только
скриптами исходного сайта (`validate-content`, `translation-marker`, `factcheck`, `check-factcheck`,
`build-content-factcheck-review`, ~550 строк и ~670 строк чистого контракта). Установленный из npm сайт
их не запустит, а content-ops skills (6.7D) будут вызывать команды, которых нет в ядре (AD-12).

**Approach:** Перенести их в CLI поверх каркаса 6.7A: гейты `check content` и `check factcheck` в
агрегате `check`, команды `content translation-marker …` и `content factcheck …`; чистый контракт
fact-check — в `lib/content/`, IO и команды — в `packages/core/src/cli/content/`. Леджер получает
`schemaVersion`.

## Boundaries & Constraints

**Always:**

- Команды (опции — в реестре и снапшоте `cli`; `…` — повторяемая опция):
  `content translation-marker confirm [--document <collection>/<key>…] [--all] [--write]`,
  `content translation-marker compute --key <key>`, `content translation-marker check`,
  `content factcheck extract [--check]`, `content factcheck merge --key <key> --findings <file>
  [--date <yyyy-mm-dd>]`, `content factcheck researched --key <key> [--date …]`,
  `content factcheck decide --key <key> --set <id=status>…`, `content factcheck review`.
  Гейты `content` (= `content:validate`) и `factcheck` (= `content:factcheck:check`) входят в агрегат.
- Поведение, выходы и коды — как у скриптов исходного сайта, кроме перечисленного здесь. Корень — от
  `--root`, никогда не `process.cwd()`; локали и опорная локаль — из lock (`loadSiteSection`).
- Документы — `articles`, `pages` и коллекции включённых модулей (`courses`); `targetCollection`
  леджера принимает и `courses`.
- Леджер `data/factcheck/ledger.yaml` необязателен: без него гейт `factcheck` проходит с сообщением,
  `extract` его создаёт. `schemaVersion: 1` вместо `version: 1` через `assertSchemaVersion`; переход —
  в `UPGRADING.md` с фикстурой; леджер — в снапшоте `site-files`.
- `translation-marker check` и `extract --check` — справочные, всегда код 0.
- `--findings` — путь от текущего каталога; `--date` по умолчанию — сегодняшняя локальная дата.
- Тесты — на временных сайтах через `runAstrumScena`; переносимые тесты контракта — на синтетике.
- Решения владельца 2026-11-15:
  - Одна спека, два пакета с ревью после каждого: 1 — гейт `content` и `content translation-marker …`;
    2 — fact-check целиком.
  - `prettier` — необязательный peer ядра с ленивым импортом, форматирует с конфигом сайта (по пути
    целевого файла); без пакета пишущие команды (`confirm --write`, `extract`, `merge`, `researched`,
    `decide`, `review`) и гейт `factcheck` при наличии леджера падают с «установите `prettier`»;
    остальные команды его не грузят.
  - Пакет ревью — `data/factcheck/review.md` рядом с леджером (было `docs/migration/s12-factcheck-review.md`);
    переход — в `UPGRADING.md`.
  - Гейт `factcheck` — в агрегате `check`.

**Never:**

- Не менять `digestTranslationSource`, `factcheckSourceDigest`, `findingId` и форму маркера — их байты
  сравнивают существующие леджеры и переводы.
- Не переносить skills (`/factcheck`, `/factcheck-apply`, `/validate`, `/translate`) и пресеты (6.7D),
  миграционные `content:*` (эпик 8), `errata` и `content:import:*`.
- Не трогать сеть: fact-check не ходит по URL.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Чистое демо | `astrum-scena check` | гейты `content` и `factcheck` OK (без леджера) | N/A |
| Битый контент | фото с неизвестным `albumId` | `check content` код 1 | код ошибки и путь записи |
| Устаревший перевод | правка тела опорной локали | `translation-marker check` — `needs-review`, код 0 | N/A |
| Confirm без цели | `confirm` без `--document`/`--all` | код ≠ 0 | называет обе опции |
| Сухой confirm | `confirm --all` без `--write` | план, файлы не меняются | N/A |
| `version: 1` в леджере | старая форма | `check factcheck` код 1 | нет `schemaVersion`, список поддерживаемых |
| Устаревший пакет ревью | леджер правлен без `review` | `check factcheck` код 1 | называет `astrum-scena content factcheck review` |
| Неизвестный ключ | `merge --key nope` | код 1 | называет ключ |

</frozen-after-approval>

## Code Map

- `$REF/scripts/{validate-content,translation-marker,factcheck,check-factcheck,build-content-factcheck-review}.ts`,
  `$REF/scripts/lib/{content-documents,content-factcheck-io}.ts`, `$REF/src/lib/content/{factcheck,factcheck-review}.ts`
  (+ тесты; `$REF` = `REFERENCE_SITE_ROOT`) -- источник переноса.
- `packages/core/src/lib/content/files.ts:294` `assertValidRepositoryContent(root, referenceLocale, locales)`
  -- тело гейта `content`; `moduleTargetErrors` (`:205`) -- образец обхода документов включённых модулей.
- `packages/core/src/lib/content/translation-marker.ts` `parseDocumentFile`, `buildDocumentPairs`,
  `confirmTranslatedFromDigest`, `pairSourceDigest`; `translation-freshness.ts`
  `resolveTranslationFreshness`, `digestTranslationSource` -- готово, не менять; комментарий
  «live in `scripts/translation-marker.ts`» поправить на CLI.
- `packages/core/src/config/loader.ts` `loadSiteSection` (`content`, `origin`, `factcheck`);
  `config/site-schema.ts` `factcheck.ownHosts` -- уже есть; `config/sha256-schema.ts`,
  `lib/content/schemas.ts` `kebabIdSchema` -- импорты контракта.
- `packages/core/src/config/schema-version.ts` `assertSchemaVersion`; образец необязательного файла и
  гейта -- `cli/images/place-gps-bounds.ts`, `cli/images/commands/check-place-gps-bounds.ts`.
- `packages/core/src/cli/registry.ts` `GATES`/`COMMANDS`/`usage`, `run.ts` `parseArgs`/`OPTION_FORMS`
  (сейчас одно значение на опцию — добавить повторяемые), `context.ts` `CliContext.options`,
  `stringOption`; `cli/test-fixtures.ts` `runAstrumScena`; `config/fixtures/site-files.ts` -- временные сайты.
- `packages/core/package.json` -- `prettier` в `peerDependencies` + `peerDependenciesMeta.optional`;
  образец ленивого импорта и теста отсутствия — `@aws-sdk/client-s3` (`cli/images/r2-client.ts`,
  `cli/images/optional-peer.test.ts`).
- `packages/core/src/consumer-env.ts` -- `GITHUB_ACTIONS` (аннотации предупреждений) как `internal`.
- `scripts/lib/api-surface.ts:117` `SITE_FILE_SCHEMAS`, `api-snapshot/{cli,site-files}.json`.
- `scripts/build-demo-from-pack.ts` `assertSiteGates` -- упакованное демо зовёт `content translation-marker check`.
- `UPGRADING.md` (`ENTRY_PARTS`), `packages/core/README.md` Commands, `CHANGELOG.md` `[Unreleased]`.

## Tasks & Acceptance

**Execution (пакет 1 — контент и маркеры перевода, ревью после пакета):**

- [x] `packages/core/src/cli/{registry,run,context}.ts` (+ тесты) -- повторяемые опции (`…` в реестре,
  массив значений), команды `content translation-marker …`, гейт `content`; снапшот `cli`.
- [x] `packages/core/src/cli/content/` -- лист документов (`articles`, `pages`, коллекции включённых
  модулей), форматирование через ленивый `prettier`, команды `translation-marker`, гейт `content`, тесты.
- [x] `packages/core/package.json` -- `prettier` — необязательный peer (+ тест отсутствия).
- [x] `scripts/build-demo-from-pack.ts` (+ тест), `packages/core/README.md`, `CHANGELOG.md` -- упакованное
  демо зовёт `content translation-marker check`, список команд.

**Execution (пакет 2 — fact-check):**

- [x] `packages/core/src/lib/content/{factcheck,factcheck-review}.ts` (+ тесты) -- перенос контракта,
  `schemaVersion`, `courses` в `targetCollection`, путь пакета ревью.
- [x] `packages/core/src/cli/content/`, `registry.ts`, `run.ts` -- IO леджера и пакета ревью, команды
  `content factcheck …`, гейт `factcheck`, тесты команд.
- [x] `consumer-env.ts`, `api-snapshot/env.json` -- `GITHUB_ACTIONS` (`internal`).
- [x] `scripts/lib/api-surface.ts`, `api-snapshot/site-files.json` -- леджер.
- [x] `UPGRADING.md` (+ фикстура) -- `version` → `schemaVersion` леджера и путь пакета ревью.
- [x] `packages/core/README.md`, `CHANGELOG.md` -- команды fact-check.

**Acceptance Criteria:**

- [x] `pnpm demo:packed`: `astrum-scena check` из tarball проходит с гейтами `content` и `factcheck`, а
  `astrum-scena content translation-marker check` выходит с кодом 0.
- [x] `extract` → `merge` → `decide` → `review` на временном сайте дают леджер и пакет, которые проходит
  `check factcheck`; повторный `review` побайтно тот же (тест).
- [x] `confirm --document … --write` вставляет маркер, после чего пара `current`, а тело файла побайтно
  прежнее (тест).
- [x] Снапшот `cli` перечисляет новые команды и опции, `site-files` — леджер.
- [x] Строки матрицы I/O покрыты тестами команд.

## Implementation Notes

- Текущий запуск реализует только пакет 1; пакет 2 (fact-check) — в отдельной сессии после ревью пакета 1.
- Пакет 1 реализован 2026-11-15 (дифф от `5041518`). Решения там, где спека молчит:
  - Форма повторяемой опции в реестре — `--name <value>…`; `parseArgs` собирает значения в массив
    (`repeatedOption` в `context.ts`), тест держит одну форму на имя во всех командах. `--help` печатает
    опции content-команд отдельным блоком.
  - Гейт `content` — последний в `GATES`; вывод `check content OK (N albums, N photos, N articles,
    N pages, N courses)`, ошибка — `check content FAIL: …` с кодом и путём записи из
    `assertValidRepositoryContent`. В демо нет `albumId` у фото: строка матрицы «битый контент» проверена
    на фото с неизвестным `placeId` (`[unknown-reference] photos.amber-dunes.placeId`).
  - Лист документов читает каталоги рекурсивно (как загрузчики коллекций, `**/*.{md,mdx}`), отсутствующий
    каталог — пусто; из коллекций модулей берутся только известные `DocumentCollection` (`courses`).
  - `confirm` проверяет `--document`/`--all` до чтения документов; `prettier` грузится только с
    `--write`, до чтения и до первой записи (и когда писать нечего). Импорт `prettier` внедряется для
    тестов через `CliContext.importPrettier` (бин его не задаёт), как `openBucket`.
  - `translation-marker check` выходит с 0 при любых статусах, но битый документ (имя не совпадает с
    frontmatter и т. п.) — ошибка с кодом 1, как в исходном скрипте.
  - Упакованное демо зовёт `content translation-marker check` и требует сводку с числом пар. Отсутствие
    `prettier` в упакованном демо не проверяется: `@astrojs/check` (devDependency демо) тянет `prettier`
    через `@astrojs/language-server`, и pnpm связывает его с ядром как peer; отсутствие проверено тестами
    с внедрённым импортом.
  - Комментарии ядра, называвшие `content:validate` и `scripts/translation-marker.ts`, теперь называют
    команды CLI; демо и корень получили алиас `check:content`.
  - Переносимые тесты контракта (`buildDocumentPairs`, `pairSourceDigest`, `confirmTranslatedFromDigest`)
    добавлены в `lib/content/translation-marker.test.ts`.
  - Проверено: `pnpm check` (2260 тестов), `pnpm build`, `pnpm demo:packed` — зелёные.
- Патчи ревью (пакет 1, проход 1): `confirm --write` форматирует все выходы до первой записи;
  гейт `content` проверяет и контент выключенных модулей и цели `moreDocs` их видов, как сборка
  (`assertModuleContent`); лист документов берёт только обычные файлы; упакованное демо требует
  положительное число пар; README и CHANGELOG уточнены (формат prettier, `[code]` только у ошибок
  целостности); тесты на несколько `--document`, пару `courses` из lock и неоднозначный
  `compute --key`. После патчей `pnpm check` (2264 теста), `pnpm build`, `pnpm demo:packed` зелёные.
- Пакет 1 закрыт 2026-11-15 (реализован, проверен, отревьюирован, записан в триаж); спека возвращена в
  `in-progress`. Следующая сессия реализует только пакет 2 — его задачи и открытые критерии; дифф
  ревью пакета 2 — от коммита пакета 1. Открыты до пакета 2: критерии про гейт `factcheck` в
  упакованном демо, цепочку `extract → review` и снапшот `site-files`; строки матрицы про леджер.

- Пакет 2 реализован 2026-11-16 (дифф от `da6aaf0`). Решения там, где спека молчит:
  - `parseFactcheck` проверяет `schemaVersion` через `assertSchemaVersion` до схемы и печатает ошибки
    полей с путём от файла (`data/factcheck/ledger.yaml: documents.0.key: …`), как файл границ мест;
    `mergeResearchFindings` по-прежнему бросает `ZodError` входа ресёрчера.
  - Подсказки reconcile и пакета ревью называют команды CLI (`astrum-scena content factcheck …`,
    `astrum-scena check factcheck`); заголовок пакета — «Review packet фактчека» без `S12`, текст
    пакета остаётся русским, «RU-документы» стали «документами опорной локали», фраза «не входит в
    `pnpm check`» убрана (гейт теперь в агрегате).
  - Гейт `factcheck`: нет леджера — `OK (no data/factcheck/ledger.yaml; nothing to check)` без
    prettier; иначе схема, reconcile и blocking-проблемы проверяются до загрузки prettier, а prettier
    грузится только для сравнения пакета; отсутствующий пакет — ошибка без текста `ENOENT`.
  - Пишущие команды проверяют свои опции, затем грузят prettier, затем читают леджер; `extract
    --check` prettier не грузит. Без леджера `merge`/`researched`/`decide`/`review` падают с
    `data/factcheck/ledger.yaml: missing; run astrum-scena content factcheck extract`.
  - Предупреждения — в stderr, аннотации `::warning::` — в stdout при `GITHUB_ACTIONS=true` из
    `context.env`; `GITHUB_ACTIONS` — `internal`, поэтому `api-snapshot/env.json` не меняется.
  - Сообщение об отсутствии prettier обобщено: «the content commands that write or compare formatted
    files need prettier».
  - Демо и корень получили алиас `check:factcheck`; упакованное демо проверяет гейт без леджера через
    общий `assertSiteGates` (все `GATES`), а `assertFactcheckCommands` во временном сайте зовёт
    установленные `content factcheck extract`, `review` и `check factcheck` (с леджером, через peer
    `prettier` сайта).
  - Патчи ревью (пакет 2): `--set` делится по последнему `=` (id находки может содержать `=`);
    тест пакета ревью проверяет строки доказательства и рекомендации; ADR-0011 называет команды CLI.
  - Переход `UPGRADING.md` проверен тестом «the upgraded ledger» (`factcheck-commands.test.ts`):
    старая форма и старый пакет в `docs/migration/` падают, после шага (`version` → `schemaVersion`,
    удалить старый пакет, `review`) гейт проходит.
  - Проверено после патчей ревью: `pnpm check` (2360 тестов), `pnpm build`, `pnpm demo:packed` — зелёные.

## Spec Change Log

## Review Triage Log

Пакет 1, проход 1 (субагенты GPT 5.6 Sol вместо Codex по указанию владельца: blind, edge-case,
verification-gap; дифф от `5041518` без `_bmad-output` и lock-файла):

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|------|---------|---------|-------------|---------|
| 1 | blind, edge | README и CHANGELOG обещают «no other byte of the file changed», а `writeFormatted` прогоняет prettier по всему файлу (`prettier.ts:37`) | low | для файла, который prettier сайта уже держит чистым, формат не трогает тело (тест `content-commands.test.ts`), но неотформатированный файл переформатируется целиком — так же делал исходный `scripts/translation-marker.ts`; ложно только обещание в документации | patch (исправлено) |
| 2 | blind, edge | `confirm --write` пишет файлы по одному: сбой форматирования позднего файла оставляет ранние изменёнными (`translation-marker.ts:94`) | low | `prettier.format` бросает на MDX, которое не разбирает, уже после записи предыдущих пар; исправление — сначала отформатировать все выходы, потом писать (как патч `colormode` в 6.7B) | patch (исправлено) |
| 3 | blind | Постоянное имя `<file>.tmp`, гонки, права файла (`prettier.ts:39`) | low | тот же `.tmp`+`rename`, что в исходном `scripts/translation-marker.ts` `writeFormatted`; два одновременных `confirm --write` на одном сайте маловероятны, а уникальные имена с уборкой и перенос прав — новые ветки | reject |
| 4 | blind | Черновик в одной локали проходит `check content`, но `translation-marker check` падает с кодом 1 | medium | `integrity.ts:176` требует все локали только у опубликованной пары, а `buildDocumentPairs` (`translation-marker.ts:113`) — у любой; функция перенесена в 6.2 без изменений из исходника, и исходный скрипт падал так же — изменение только открыло её командой | defer |
| 5 | blind | `check content` не проверяет контент выключенного модуля и цели `moreDocs` его видов (`check-content.ts:11`) | low | сборка отвергает их в `assertModuleContent` (`index.ts:119`), а гейт говорит OK — skill `/validate` узнал бы об ошибке только на сборке; исправление — добавить в гейт те же `disabledModuleContentErrors` и `moduleTargetErrors` | patch (исправлено) |
| 6 | blind, edge | Упакованное демо принимает `0 pairs` (`build-demo-from-pack.ts:574`) | low | регулярка `\d+ pairs` пропустит сломанный поиск документов в установленном пакете; исправление — требовать положительное число | patch (исправлено) |
| 7 | blind | Лист документов знает только `courses` и молча теряет другие коллекции модулей (`documents.ts:18`) | false | `MODULES` (`modules/registry.ts:11`) — только `coursesModule`, а `DOCUMENT_SCHEMAS` (`translation-marker.ts:10`) — схемы ровно `articles`, `pages`, `courses`; другой коллекции документов модуля нет, новая потребует схемы в `DOCUMENT_SCHEMAS` | reject |
| 8 | blind, edge | Каталог или симлинк с именем `*.md` читается как файл (`documents.ts:46`) | low | `readdir(recursive)` отдаёт и каталоги; `readFile` на каталоге `x.md` роняет команду с `EISDIR`, а загрузчики контента (`regularFiles`, `files.ts:56`) берут только `isFile()`; исправление — тот же фильтр | patch (исправлено) |
| 9 | blind, edge | `confirm --write` без prettier падает, даже когда писать нечего (`translation-marker.ts:56`) | false | решение владельца в Always: без пакета пишущие команды, `confirm --write` в их числе, падают с «установите `prettier`»; заметка реализации фиксирует «и когда писать нечего» | reject |
| 10 | blind | README и CHANGELOG: «a failure names the error code», а у ошибок схемы, юридических текстов и разметки кода нет | low | `assertValidRepositoryContent` (`files.ts:303-312`) печатает `[code]` только для нарушений целостности; исправление — уточнить текст | patch (исправлено) |
| 11 | edge | Правка автора между чтением и `rename` перезаписывается (`translation-marker.ts:94`) | low | окно — время форматирования нескольких файлов; исходный скрипт так же читал и писал без блокировки; блокировка файлов — новый механизм | reject |
| 12 | vgap | Несколько `--document` не проверены командой | medium | тест `parseArgs` собирает два значения, а командный тест пишет один селектор; команда, взявшая только первый, прошла бы | patch (исправлено) |
| 13 | vgap | Документы включённого модуля не проверены на уровне CLI | medium | `documents.test.ts` передаёт `[coursesModule]` явно, демо-тест принимает любое число пар; потеря модулей из lock прошла бы | patch (исправлено) |
| 14 | vgap | Неоднозначный `compute --key` не проверен | medium | удаление проверки `ambiguous across collections` (`translation-marker.ts:103`) оставит тесты зелёными | patch (исправлено) |

Пакет 2, проход 1 (Codex: blind, edge-case, verification-gap; дифф от `da6aaf0` без `_bmad-output` и lock-файла):

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|------|---------|---------|-------------|---------|
| 15 | blind | Пакет ревью не показывает id находок, а `decide --set` их требует (`factcheck-review.ts:52`) | low | реально, но пакет и `decide` перенесены как есть из исходных `factcheck-review.ts` и `scripts/factcheck.ts:36`; изменение меняет байты пакета у всех сайтов и относится к потоку skill `/factcheck` (6.7D) | defer |
| 16 | blind, edge | `extract` перезаписывает `targetCollection` существующей записи: ключ удалённой статьи, переиспользованный страницей, унесёт находки и решения (`factcheck.ts:116`) | low | то же в исходном `scripts/factcheck.ts:133`; нужно удалить документ и создать в другой коллекции документ с тем же `translationKey` до следующего `extract` — в обычной работе маловероятно, а исправление — новая ветка-гард | reject |
| 17 | blind | `merge` сохраняет решение при неизменной рекомендации, даже если сменились статус или доказательство (`lib/content/factcheck.ts:415`) | low | решение владельца принимает рекомендацию (что применит `/factcheck-apply`), и контракт переоткрывает его ровно по `recommendationDigest`; смена статуса при той же рекомендации не меняет применяемую правку; перенесено без изменений | reject |
| 18 | blind | `extractUrls` обрывает URL на `)`: `…/Mercury_(planet)` усекается (`lib/content/factcheck.ts:241`) | low | обрыв на `)` нужен для Markdown-ссылки `[t](url)`, иначе захватывалась бы скобка; URL со скобками в теле редки, разбор парных скобок — новая логика; поведение исходника | reject |
| 19 | blind | `self-link-rewrite` принимает внешний или протокол-относительный URL (`lib/content/factcheck.ts:500`) | low | замена видна в пакете и применяется только после `decision: accepted` владельца; проверка хостов в `verifyFactcheck` потребовала бы нового параметра `ownHosts`; поведение исходника | reject |
| 20 | blind, edge | Параллельные пишущие команды делят имя `.tmp` и теряют решения (`factcheck-io.ts:81`) | low | тот же `.tmp`+`rename`, что в исходном скрипте и в пакете 1 (#3, #11); леджер пишет один владелец или его skill последовательно; блокировка — новый механизм | reject |
| 21 | blind | Схема допускает две находки с одним `(kind, raw)` и разными id, а `merge` на таком документе падает (`lib/content/factcheck.ts:160`) | false | `extract` и `merge` выводят id из `(kind, raw)` через `findingId` и такую пару не создают; на ручной правке `merge` падает явно с сообщением, данные не теряются | reject |
| 22 | blind | id с `=` не адресуется `decide --set`, разбор по первому `=` (`commands/factcheck.ts:186`) | low | схема id — `z.string().min(1)`; статусы решения `=` не содержат, разбор по последнему `=` — прямая правка | patch (исправлено) |
| 23 | blind | `researched` штампует digest текста на диске, а не того, что исследовали (`commands/factcheck.ts:172`) | low | поток исходника: `/factcheck` зовёт `researched` в конце сессии; перенос digest начала ресёрча — новый механизм; правка документа во время сессии маловероятна | reject |
| 24 | blind | Свободный текст в пакете экранирует только `<` и `\|`, Markdown-ссылки и выделение проходят (`factcheck-review.ts:34`) | low | текст пишут ресёрч-агенты владельца в его же леджер, пакет читает он же; `oneLine` уже не даёт сломать структуру пакета; полное экранирование — новая логика рендера исходника | reject |
| 25 | blind | Свой хост сравнивается с `URL.host` с портом: ссылка на бывший хост с портом сеется как внешняя (`lib/content/factcheck.ts:256`) | low | `ownHosts` — имена хостов без портов, ссылки на свой сайт с явным портом в текстах не встречаются; поведение исходника | reject |
| 26 | blind | ADR-0011 называет писателем леджера `scripts/factcheck.ts` и команды `content:factcheck:*` (`docs/adr/0011-legacy-corpus-errata.md:54`) | low | AGENTS.md: изменение, меняющее постановление ADR, обновляет его в том же изменении; теперь писатель — CLI ядра | patch (исправлено) |
| 27 | vgap | Доказательство и рекомендация в пакете не проверены тестами | medium | удаление этих строк из `renderFinding` оставит тесты и гейт дрейфа зелёными | patch (исправлено) |
| 28 | vgap | Упакованное демо не запускает пишущие команды fact-check и гейт с леджером | medium | демо без леджера: гейт выходит до загрузки prettier, так что разрешение peer у установленного бина не проверено | patch (исправлено) |

## Verification

**Commands:**

- `pnpm check` -- expected: зелёный.
- `pnpm build` -- expected: ядро и демо собираются.
- `pnpm demo:packed` -- expected: гейты CLI и сборка из tarball проходят.
