---
title: 'Политика версий ядра и UPGRADING.md'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_commit: '42cc3a6c5bb00fc1c8a9dd067b01dc8c503dc581'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Гейт части B требует `**Breaking:**` в CHANGELOG, но сайту не сказано, какой выпуск
ядра ломающий, как закрепить версию и что сделать при переходе; хеши и адреса изображений, от которых
зависит повторное использование деривативов, ничем не закреплены побайтово (AD-7).

**Approach:** Часть C истории 6.3. Политика версий ядра записывается в README ядра и становится
проверяемой: версионированный `UPGRADING.md` с записью на каждый ломающий переход («до/после»,
порядок, версии писателей, проверка результата), гейт связывает ломающие изменения снапшота с
записями `UPGRADING.md`, а golden-тест закрепляет байты значимых хешей и адресов.

**Решения владельца (2026-11-06):**
- npm-версия ядра отдельна от репо-версии и остаётся `0.x` до 9.3: ломающий выпуск повышает minor
  (`0.3.0 → 0.4.0`), фичи и фиксы — patch, сайт закрепляет `~0.y.z`; в 9.3 — `1.0.0`, дальше обычный
  semver (ломающее — major). Репо-версия `1.<epic>.<story>` и `/ver` не меняются; AC 4 истории 6.3 в
  `epics.md` и абзац AD-7 в spine переписываются под это в этом же изменении.
- Подъём версии проверяет гейт на PR: если `version` в `packages/core/package.json` изменилась от
  merge-base, а в `UPGRADING.md` есть записи `[Unreleased]` или раздел этой версии, подъём обязан быть
  ломающим по политике; ломающий подъём без раздела `UPGRADING.md` — ошибка. Совместимое vs фикс
  автоматически не различается (в `0.x` оба patch).
- Спека не делится, несмотря на объём выше 1600 токенов.

## Boundaries & Constraints

**Always:** Ломающее — всё, что требует изменить конфиг, контент или код сайта, или перевыпустить
деривативы; нижняя граница — то, что гейт части B классифицирует как ломающее. Формат YAML или отчёта
сам по себе не ломающий. Записи `UPGRADING.md` достаточны, чтобы пройти цепочку пропущенных
выпусков по порядку; скрипт перехода — только по необходимости. `UPGRADING.md` на английском, как
`CHANGELOG.md`.

**Never:** Не добавлять `schemaVersion` (часть D), команду `core upgrade` и поддержку N−1. Не
публиковать пакет и не снимать `--dry-run` (6.9). Не менять формулы хешей и адресов, поведение
сборки и вывод сайта. Не делать гейт одной версии ядра на сайт (6.8).

## I/O & Edge-Case Matrix

| Сценарий | Состояние PR | Ожидаемое |
|---|---|---|
| Ломающее изменение снапшота | есть `**Breaking:**` в CHANGELOG, нет записи в `UPGRADING.md` `[Unreleased]` | `check:api-breaking` падает с именем |
| То же | запись в `UPGRADING.md` называет имя и содержит все обязательные части | проходит |
| Запись без «до/после», порядка, писателей или проверки | — | `check:upgrading` падает с номером записи и недостающей частью |
| Изменён байт `configDigest`/`objectKey`/`translatedFromDigest` на зафиксированном входе | — | golden-тест падает |
| Только совместимые изменения | `UPGRADING.md` не тронут | гейты проходят |
| Подъём `0.3.1 → 0.3.2` | в `UPGRADING.md` есть записи `[Unreleased]` или раздел `0.3.2` | `check:api-breaking` падает: нужен ломающий подъём |
| Подъём `0.3.1 → 0.4.0` | раздела `0.4.0` в `UPGRADING.md` нет | падает: ломающему выпуску нужен раздел |
| Подъём `0.3.1 → 0.4.0` | раздел `0.4.0` есть, `[Unreleased]` пуст | проходит |
| Подъём `0.3.1 → 0.3.2` | `UPGRADING.md` без записей для неё | проходит |

</frozen-after-approval>

## Code Map

- `scripts/check-api-breaking.ts` -- PR-гейт: `compareSnapshots` merge-base↔HEAD, `unannouncedBreaking`
  по `CHANGELOG.md`; сюда — сверка с `UPGRADING.md` и правило подъёма версии.
- `scripts/lib/api-surface.ts:1064-1100` -- `unreleasedBreakingEntries`/`unannouncedBreaking`: разбор
  `[Unreleased]` (fenced-блоки пропускаются, граница имени `[\w./-]`); переиспользовать для
  `UPGRADING.md`, не копировать.
- `scripts/check.ts` `CHECK_GROUPS` -- новый `check:upgrading` (структура файла) в последнюю группу;
  образец пары скрипт+тест — `check-layout-tokens.ts`.
- `.github/workflows/ci.yml:48` -- шаг `pnpm check:api-breaking --base origin/main`, уже с `fetch-depth: 0`.
- `packages/core/package.json` -- `version: 0.0.0`; `scripts/release.ts` `sharedVersion` читает её.
- Значимые байты: `lib/images/build/config.ts:290` `computeConfigDigest` (`canonicalStringify`,
  `lib/images/canonical.ts`), `lib/images/build/hashing.ts` `ladderObjectKey` и проверка ключа в
  `lib/images/manifest.ts:83-86`, `lib/content/translation-freshness.ts` `digestTranslationSource`
  (уже закреплён на `'hello'` в его тесте). `config.test.ts:103` проверяет только равенство/неравенство,
  не байты.
- `packages/core/README.md:61-102` -- раздел «Public API»; сюда раздел «Versions» с политикой.
- `CHANGELOG.md:6` -- шапка про отдельную npm-версию; `AGENTS.md:116` -- то же для `/ver`.
- `_bmad-output/planning-artifacts/epics.md:1104-1112` (AC 4–5 истории 6.3) и spine AD-7 `:149-153`
  -- правятся под решение о `0.x`.

## Tasks & Acceptance

**Execution:**
- [x] `UPGRADING.md` (корень) -- шапка: как читать, цепочка пропущенных выпусков, шаблон записи
  (`### <name>`: Before/After, Order, Writers, Verify); `## [Unreleased]` пустой -- контракт записи.
- [x] `scripts/lib/upgrading.ts` (+тест), `scripts/check-upgrading.ts` (+тест), `package.json`,
  `scripts/check.ts` -- разбор разделов и записей, проверка обязательных частей и порядка версий
  (каждый раздел — ломающий подъём от предыдущего) -- `check:upgrading` в `pnpm check`.
- [x] `scripts/check-api-breaking.ts`, `scripts/lib/api-surface.ts` (+тесты) -- ломающее изменение без
  записи `UPGRADING.md` `[Unreleased]`, называющей его, валит шаг; подъём `version` ядра от merge-base проверяется по решению владельца (+тест на каждый случай).
- [x] `packages/core/src/lib/images/byte-contract.test.ts` -- на зафиксированных входах литералы
  `computeConfigDigest`, `ladderObjectKey`, ключа манифеста и `digestTranslationSource` -- байтовый
  контракт AD-7 под гейтом.
- [x] `packages/core/README.md` (раздел Versions), `CHANGELOG.md` `[Unreleased]`, `AGENTS.md`, `epics.md`,
  spine AD-7 -- политика patch/minor/major, `~`, байтовый контракт, ссылка на `UPGRADING.md`;
  тексты согласованы с решением о `0.x`.

**Acceptance Criteria:**
- [x] README ядра описывает политику версий: что patch, minor и ломающее, диапазон закрепления до и после
  9.3, что форматирование не ломающее, какие хеши и адреса байтово стабильны.
- [x] Каждая строка матрицы покрыта тестом.
- [x] `check:upgrading` в `pnpm check`; `check:api-breaking` в CI сверяет и `UPGRADING.md`.
- [x] AC истории 6.3 в `epics.md`, AD-7 и `AGENTS.md` не противоречат друг другу о нумерации.
- [x] `pnpm check` и `pnpm build` проходят.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Ревью 1 (Codex: blind-hunter — B, edge-case-hunter — E, verification-gap — V).

| # | Слои | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|---|
| 1 | B1, E1, E2 | Подъём версии, не ломающий и не обычный (`0.3.1 → 0.5.0`, `→ 2.0.0`), и откат версии проходят без записей `UPGRADING.md` | medium | `versionBumpErrors` (`upgrading.ts:179-183`) возвращает `[]`, если подъём не `isBreakingBump` и записей нет; порядок версий не проверяется | patch |
| 2 | B2, B3 | Гейт не читает `UPGRADING.md` merge-base: релизный PR может поднять patch и удалить уже влитые записи `[Unreleased]` или выпущенные разделы | medium | `check-api-breaking.ts:68-75` берёт только файл HEAD; ломающие изменения уже в `main`, снапшот merge-base их не покажет; цепочка пропущенных выпусков (intent) теряется | patch |
| 3 | B4, E5 | Метка без текста (`**Verify:**`) считается заполненной частью | low | `partLabel` (`upgrading.ts:56`) проверяет только начало строки; правка — одно условие | patch |
| 4 | B5, E7 | Имя ломающего изменения засчитывается по упоминанию в теле чужой записи | low | `sectionEntries` возвращает `entry.text` (заголовок + тело), а шапка `UPGRADING.md` требует имя в заголовке; правка прямая | patch |
| 5 | B6, E4 | Самый старый или единственный раздел (`## [0.3.2]`) не проверяется на форму ломающего выпуска | low | Сравнение в `checkUpgrading` (`:130-134`) идёт только с `older`; правка — одно условие | patch |
| 6 | B8, E9 | Регресс CRLF: `## [Unreleased]\r` не совпадает с `text === open`, записи CHANGELOG пропадают | low | `releaseSection` (`api-surface.ts:1085`), до изменения проверялся `^## \[Unreleased\]` без конца строки; правка — `split(/\r?\n/)` | patch |
| 7 | V1 | Нет CLI-теста, где падает только проверка CHANGELOG | medium | Все негативные случаи CHANGELOG в `check-api-breaking.test.ts` без записи `UPGRADING.md`; удаление ветки `report(...)` CHANGELOG тесты не валит | patch |
| 8 | B7, E8 | `~~~` и длинные ограды кода не распознаются | low | В `CHANGELOG.md` и `UPGRADING.md` нет `~~~` (grep — 0), шаблон `UPGRADING.md` — ```` ``` ````; тот же разбор был в `unreleasedBreakingEntries` до изменения; учёт символа и длины ограды — новая логика | reject |
| 9 | E3 | Версии с ведущими нулями или больше `MAX_SAFE_INTEGER` | low | Версия ядра — одна строка в `packages/core/package.json`, которую пишет человек при выпуске; `0.0.0` сейчас; защита — новые проверки для невстречающегося входа | reject |
| 10 | E6 | Запись с пустым заголовком `### ` проходит структуру | low | После правки 4 покрытие идёт по заголовку, пустой заголовок не называет ни одного изменения и гейт не закрывает; запись без имени в файле не встречается | reject |

## Design Notes

`UPGRADING.md` лежит в корне рядом с `CHANGELOG.md` и в tarball не входит, как и CHANGELOG. Разделы
ключуются npm-версией ядра (то, что видит сайт), а не репо-версией. Запись называет имена ломающих
изменений так же, как `**Breaking:**` в CHANGELOG (путь поля, `Компонент.проп`, имя), — одна функция
сопоставления на оба файла.

«Ломающий подъём» — одна функция политики: при major `0` — рост minor (patch обнуляется), с `1.0.0` —
рост major; `0.x → 1.0.0` тоже ломающий. Функцию используют и `check:upgrading` (порядок разделов),
и PR-гейт (подъём `version`).

## Verification

**Commands:**
- `pnpm check` -- проходит, `check:upgrading` и тесты в нём.
- `pnpm build` -- проходит.
- `pnpm check:api-breaking --base origin/main` -- проходит на ветке.
