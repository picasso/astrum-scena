---
title: 'Словари ядра и частичные словари сайта с проверкой полноты (6.5, часть A)'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: '376707115653b3cbaffa3d54829e5b132573ed53'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** тексты интерфейса задают только словари ядра `packages/core/src/i18n/{en,ru}.json`;
сайт не может поменять ни одну строку, а `useTranslations` молча откатывается на английский, если
ключа нет (AD-23). Тексты, принадлежащие сайту (`footer.quote`, `contacts.intro`), лежат в ядре.

**Approach:** первая часть 6.5. Ядро поставляет полные словари по умолчанию; сайт кладёт частичные
переопределения в свои файлы словарей (по одному на локаль, со `schemaVersion`); для каждой локали
из `content.locales` lock словарь ядра сливается со словарём сайта, и отсутствующий ключ — ошибка
сборки с локалью и ключами, без отката на другую локаль. Демо переопределяет хотя бы один ключ.

**Decisions (владелец, 2026-11-12):**
- 6.5 делится на части A (i18n), B (токены темы), C (точки замены); подписи курсов
  (`moreDocuments.course.*` против `courses.title`) сверяются в 6.6, где ключи курсов уходят в
  словарь модуля.
- `footer.quote` и `contacts.intro` сохраняют нейтральное значение по умолчанию в словаре ядра; демо
  задаёт свой текст в своём словаре. Изменение неломающее.
- Словари сайта — файлы `src/i18n/<locale>.yaml` в корне сайта, по одному на локаль, со
  `schemaVersion: 1`; в `site.lock.yaml` тексты не попадают. Файла нет — у локали только тексты ядра.

## Boundaries & Constraints

**Always:**
- Опубликованный вывод демо не меняется: визуальные эталоны и e2e зелёные, тексты страниц те же.
- Неизвестный ключ в словаре сайта и файл словаря для локали вне `content.locales` — ошибка с именем
  файла и путём ключа (общий `validate` из `config/yaml-file.ts`, `assertSchemaVersion`).
- Слияние и проверка полноты — чистая функция; чтение файлов — отдельный загрузчик с явным корнем
  сайта (`siteRoot`, не `process.cwd()`), чтобы e2e и тесты звали его с корнем демо.
- Новый файл сайта входит в `site-files` снапшота API; ключи ядра по-прежнему в `i18n.json`.

**Never:**
- Не делать локали вне `LOCALE_CATALOG` (6.10), токены темы (6.5B), точки замены (6.5C), словари
  модулей (6.6).
- Не оставлять откат `dict[key] ?? en[key]` ни в каком виде.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Без словарей сайта | локали `en, ru`, файлов нет | тексты ядра | N/A |
| Частичное переопределение | `en`-файл сайта задаёт один ключ | этот ключ из сайта, остальные из ядра; в `ru` — ядро | N/A |
| Ключа нет нигде | у локали нет значения ключа в ядре и в сайте | сборка падает | `i18n (ru): missing keys: footer.quote, …` |
| Неизвестный ключ | `nav.hom: …` в файле сайта | ошибка | `<файл>: nav.hom: unrecognized key` |
| Чужая локаль | файл `ru` при `locales: [en]` | ошибка | файл и список локалей конфига |
| Нет версии | файл без `schemaVersion` | ошибка | `<файл>: missing schemaVersion; supported: 1` |

</frozen-after-approval>

## Code Map

- `packages/core/src/i18n/ui.ts:1-17` -- `dictionaries` и `useTranslations` с откатом на `en`; станет
  использовать слитые словари, привязанные к `siteRoot` (`config/site-root.ts`, виртуальный модуль)
  и локалям `site.content.locales` (`config/site.ts`, загрузка при импорте модуля, как `site`).
  `languageName`, `localizedHref` и прочие функции не трогать.
- `packages/core/src/i18n/{en,ru}.json` -- словари ядра; `UIKey = keyof typeof en`. Тест сверяет, что
  у каждой локали каталога полный набор ключей.
- Новый `packages/core/src/i18n/dictionaries.ts` (имя на выбор) -- схема файла сайта (строгая, ключи
  ядра, необязательные непустые строки, `schemaVersion: 1`), чистое слияние с проверкой полноты,
  загрузчик `(root, locales)`; без импортов Astro и виртуальных модулей.
- `packages/core/src/config/yaml-file.ts` -- `readYaml`, `validate` (ошибки с путём ключа);
  `config/schema-version.ts` -- `assertSchemaVersion`.
- Потребители `useTranslations`: компоненты и страницы ядра, `lib/cards/build-data.ts` — сигнатура не
  меняется.
- `e2e/helpers.ts:10` -- импортирует `useTranslations` из `ui.ts`; перевести на загрузчик из нового
  модуля с `DEMO_ROOT` и локалями `demoConfig`, иначе ожидания e2e разойдутся со словарями демо.
- `components/content/privacy-render.test.ts:35` -- читает `src/i18n/<locale>.json` напрямую; оставить
  или перевести на загрузчик.
- `scripts/lib/api-surface.ts:94-111` -- `SITE_FILE_SCHEMAS`: добавить файл словаря сайта;
  `i18n: Object.keys(en)` (строка 614) не менять; `pnpm api:snapshot`.
- `demo/` -- словарь демо с одним-двумя переопределёнными ключами, значения которых совпадают с
  нынешним выводом демо (вывод не меняется).
- Доки: `packages/core/README.md` (секция Public API, `site-files.json`, новый раздел про словари),
  `CHANGELOG.md` `[Unreleased]`, `UPGRADING.md` при ломающем решении по вопросу 2,
  `deferred-work.md` (запись строка 327: `partial_by` — подписи курсов уходят в 6.6),
  `sprint-status.yaml` (ключ `6-5a-i18n-dictionaries: review`, `6-5-override-theme-and-i18n-contracts:
  in-progress`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/i18n/dictionaries.ts` -- схема файла сайта, слияние с проверкой полноты,
  загрузчик с явным корнем.
- [x] `packages/core/src/i18n/ui.ts` -- слитые словари без отката; тип `t` прежний.
- [x] `packages/core/src/i18n/*.test.ts` -- каждая строка матрицы на фикстурах; полнота словарей ядра.
- [x] `e2e/helpers.ts` -- ожидания из слитых словарей демо.
- [x] `scripts/lib/api-surface.ts` -- файл словаря в `site-files`; `pnpm api:snapshot`.
- [x] `demo/` -- словарь сайта с переопределением.
- [x] доки и учёт -- README ядра, `CHANGELOG.md`, `UPGRADING.md` (если ломающее), `deferred-work.md`,
  `sprint-status.yaml`.

**Acceptance Criteria:**
- [x] Каждая строка матрицы покрыта тестом в `pnpm check`.
- [x] В `packages/core/src` нет отката словаря на другую локаль; тест полноты на демо входит в
  `pnpm check`.
- [x] `pnpm check`, `pnpm build`, `pnpm demo:packed`, `pnpm test:e2e` (визуальные эталоны без
  обновления) проходят; `pnpm check:api-breaking --base origin/main` — вердикт соответствует записи в
  `CHANGELOG.md`.

## Implementation Notes

- Site dictionaries are flat YAML with dotted keys, as in `i18n.json` (`footer.quote: …`); the API
  snapshot keys the file as `src/i18n/<locale>.yaml`. Every entry of `src/i18n/` other than
  `<locale>.yaml` for an active locale (another locale, `en.yml`, any stray file) fails with
  `<file>: not a dictionary; expected <paths> for content.locales (<locales>)`. A blank text (empty or
  whitespace only) is rejected by a regex check, not a transform.
- The dictionary paths live in JSON-free `i18n/site-dictionary-path.ts`, so the integration registers
  `src/i18n/<locale>.yaml` of every catalog locale (with the lock) as watch files of `i18n/ui.ts`
  and `astro dev` picks up dictionary edits.
- `ui.ts` loads the merged dictionaries on the first `useTranslations` call, not on import, cached by
  the identity of `site.content.locales`: four component tests mock the `site` singleton and set it
  per case, so it is undefined while the module is imported. A build still fails on the first page
  that translates anything.
- `shell.test.ts` renders the one-locale `LanguageSwitcher` case from an empty temp site root (a
  getter mock of `config/site-root.ts`), since the demo's `ru.yaml`/`en.yaml` are rightly rejected
  under a one-locale config.
- `footer.quote` and `contacts.intro` get a short neutral core default; the demo overrides both in
  both locales with the previous texts, so its output is unchanged, and a `shell.test.ts` render
  test asserts the footer shows the demo's quote, not the core default. `check:api-breaking --base origin/main`: one compatible addition
  (`site-files: src/i18n/<locale>.yaml`), so no `UPGRADING.md` entry; CHANGELOG lists the missing-key
  error as a non-breaking change (the core dictionaries are complete, so no site loses a text).

## Spec Change Log

## Review Triage Log

Ревью 1 (Codex: blind, edge, verification-gap), diff от `376707115653b3cbaffa3d54829e5b132573ed53`.

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|------|---------|---------|-------------|---------|
| 1 | blind, edge | `ui.ts:14-19`: правка словаря в `astro dev` не видна до перезапуска | medium | `configYamlDependency` (`index.ts:61-72`) регистрирует `site.lock.yaml` как watch-файл модулей конфига, а `src/i18n/*.yaml` никто не регистрирует — Vite не знает о зависимости, кэш `loaded` живёт до перезапуска | patch |
| 2 | blind | `dictionaries.ts:33`: строка из одних пробелов проходит `min(1)` | low | `z.string().min(1)` принимает `'   '`, и текст-пробел стирает видимую или доступную подпись; исправление — замена проверки на регулярное выражение с непробельным символом | patch |
| 3 | blind | `dictionaries.ts:78`: `en.yml` и другие файлы в `src/i18n` молча пропускаются | low | фильтр `endsWith('.yaml')` отбрасывает `en.yml` без ошибки, переопределение сайта теряется молча; исправление — любой файл каталога, кроме `<locale>.yaml`, даёт ошибку с ожидаемым именем | patch |
| 4 | blind | `dictionaries.ts:81`: чужой `.yaml` в `src/i18n` ломает существующие сайты | false | каталог `src/i18n/<locale>.yaml` — решение владельца в замороженном блоке; сайтов на ядре ещё нет (npm `0.x`, первый сайт — 9.3), ломать нечего | reject |
| 5 | blind | README отсылает к `i18n.json`, которого нет в пакете | false | README (секция Public API) явно называет `api-snapshot/` репозитория ядра; кроме того, `src/i18n/en.json` публикуется в пакете (`files: ["src", …]`) и содержит тот же список ключей | reject |
| 6 | blind, vgap | демо переопределяет ключи значениями ядра, поэтому ни один тест не видит, что рендер берёт текст сайта | medium | `demo/src/i18n/en.yaml:3` = `en.json:36`; если `useTranslations` вернётся к словарям ядра, все тесты пройдут. Решение владельца: у ядра нейтральное значение, у демо — свой текст; значения ядра должны отличаться от демо, плюс рендер-тест на текст сайта | patch |
| 3a | (оркестратор) | после исправления 3 `.DS_Store` в `src/i18n` ронял сборку | low | `readdirSync` без фильтра включал скрытые файлы; скрытые файлы теперь пропускаются, тест добавлен | patch |
| 7 | blind | нет негативного теста на уровне сборки (неизвестный ключ, чужая локаль) | low | валидация живёт внутри `loadDictionaries` и покрыта напрямую; связь рендера с загрузчиком доказывает рендер-тест находки 6 (`ui.ts:16-19` зовёт `loadDictionaries` при каждом первом `useTranslations`); тест сборки добавил бы отдельную инфраструктуру | reject |

## Verification

**Commands:**
- `pnpm check` -- зелёный
- `pnpm build && pnpm demo:packed` -- зелёные
- `pnpm test:e2e` -- зелёный, визуальные эталоны не переписаны
