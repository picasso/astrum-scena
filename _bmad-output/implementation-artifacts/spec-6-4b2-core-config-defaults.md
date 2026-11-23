---
title: 'Умолчания ядра для `site.yaml` (6.4, часть B2)'
type: 'feature'
created: '2026-11-09'
status: 'done'
baseline_commit: 'dc70ef39e76ab89298546beba1adebc3b9733556'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** после 6.4b `site.yaml` — одно дерево, но каждое поле поведения обязательно: владелец
выписывает ~300 строк, даже совпадающих с поведением ядра, и умолчаний ядра, которые часть C сольёт
в `site.lock.yaml`, нет (AD-19).

**Approach:** ядро задаёт умолчания секций поведения; обязательными остаются только данные сайта
(`schemaVersion`, `origin`, `identity`, `content`, `privacy.controller`, `menu.items`, `social`,
`seo.description`, `images.rights`, `images.watermark`). Эффективный конфиг = умолчания +
переопределения, тип `SiteConfig` для потребителей не меняется; `site.yaml` демо сокращается до
данных и отличий.

**Decisions (владелец, 2026-11-09):**
- Значения умолчаний — нынешние значения демо (перенесённое поведение ядра); `site.yaml` демо
  сжимается почти до данных, механизм переопределений покрывают модульные тесты.
- Взаимно ограниченный блок `moreDocs.<kind>` заменяется целиком: переопределение пишет его
  полностью; остальные секции сливаются глубоко (массивы и скаляры заменяются).
- Умолчания живут в Zod-схеме (`.default()` у листьев, `.prefault({})` у секций, умолчание блока
  `moreDocs.<kind>` — целым объектом); снапшот `site-files.json` (io `input`) их записывает.
- Спека не делится (владелец принял размер ~3500 токенов).

## Boundaries & Constraints

**Always:**
- Неизвестный ключ на любом уровне — по-прежнему ошибка с полным путём, а не молча применённое
  умолчание (`theme.defualt: light` → `site.yaml: theme.defualt: unrecognized key`).
- Эффективный конфиг демо и `configDigest` (`80d0daa2…`) не меняются: тест перехода на фикстуре
  трёх файлов (`loader.test.ts:267`) даёт равенство с сокращённым демо; визуальные базовые снимки и
  e2e не меняются.
- Срезы `loadSiteSection` применяют те же умолчания, что и полная загрузка; секция с умолчаниями
  может отсутствовать целиком.
- Старый полный `site.yaml` (все поля явно) остаётся валидным: переход для сайтов не нужен.

**Never:**
- Не писать `site.lock.yaml`, `core config resolve` и drift-гейт (часть C); не выводить `rights` из
  `origin` (часть D).
- Не менять смысл и границы полей схемы, `IMAGE_DIGEST_VERSION` и проекцию хеша.
- Не читать конфиг исходного сайта в тестах ядра.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Только данные | `site.yaml` лишь с обязательными полями | валиден, все секции поведения = умолчания ядра | N/A |
| Частичное переопределение | `viewer: { counter: on }` | `viewer.counter = on`, прочие поля `viewer` — умолчания | N/A |
| Опечатка | `theme.defualt: light` | ошибка | путь `theme.defualt: unrecognized key` |
| Нет данных сайта | без `identity` | ошибка | `identity: …` (обязательное поле) |
| Срез без секции | `loadSiteSection(root, 'layout')` при `site.yaml` без `layout` | умолчание `layout` | N/A |
| Сокращённое демо | `demo/site.yaml` после сокращения | эффективный конфиг равен фикстуре трёх файлов | N/A |

</frozen-after-approval>

## Code Map

- `packages/core/src/config/site-schema.ts:540-620` -- `siteSchema` v2; секции поведения: `factcheck`,
  `theme`, `hero`, `menu` (кроме `items`), `slider`, `topSection`, `footer` (union `curve`,
  `recentWorks`: умолчание внутри ветки-объекта), `articles`, `courses`, `moreDocs`, `listing`,
  `layout`, `surfaces`, `banners`, `portfolio`, `albumList`, `album`, `photo`, `contacts`, `viewer`.
  `superRefine` локалей не трогать.
- `config/menu.ts`, `layout.ts`, `banners.ts`, `privacy.ts` (только `controller`, без умолчаний),
  `seo-schema.ts` (`description` обязателен), `images-schema.ts:176` (`publicPath`, `formats`,
  `ladder`, `privacy.deniedFields`, `archive` — умолчания; `rights`, `watermark` — обязательны;
  `refineImageLocation` и `superRefine` лестницы сохранить).
- `packages/core/src/config/loader.ts` -- `validate`/`loadSiteConfig`/`loadSiteSection`: точка
  применения умолчаний; `issueLines` уже раскрывает union с путём (находка 2 ревью 6.4b).
- `demo/site.yaml` -- сократить до данных и отличий; комментарии про `controller`/`seo` сохранить.
- Тесты: `config/loader.test.ts` (срезы, переход `:267-302`), `config/site.test.ts` (принятие/отказ
  схемы — минимальный конфиг), `lib/images/build/config.test.ts` (golden-хеш).
- `scripts/lib/api-surface.ts:89` + `pnpm api:snapshot` → `packages/core/api-snapshot/site-files.json`;
  при классификации как breaking — `CHANGELOG.md` `**Breaking:**` и `UPGRADING.md`
  (`check:api-breaking`, `check:upgrading`).
- Доки: `packages/core/README.md` (конфиг сайта: обязательные поля и умолчания), `demo/README.md`.
- `_bmad-output/implementation-artifacts/deferred-work.md:378,391` -- `closed_by` у записей «часть B»
  и «часть B2»; `sprint-status.yaml` -- ключ `6-4b2-core-config-defaults`.

## Tasks & Acceptance

**Execution:**
- [x] схемы `config/*` -- умолчания секций поведения по решениям выше; данные сайта обязательны.
- [x] `config/loader.ts` -- умолчания в полной загрузке и срезах, ошибка неизвестного ключа прежняя.
- [x] `demo/site.yaml` -- оставить данные и отличия от умолчаний.
- [x] тесты -- строки матрицы; сторож «демо без значений, равных умолчанию» (обход листьев и массивов
  `demo/site.yaml`, сравнение с эффективным конфигом минимального файла); переход на фикстуре и
  golden-хеш зелёные без правки ожиданий.
- [x] `pnpm api:snapshot`; при breaking — записи `CHANGELOG.md`/`UPGRADING.md`; README ядра и демо;
  `deferred-work.md` и `sprint-status.yaml`.

**Acceptance Criteria:**
- [x] Каждая строка матрицы покрыта тестом в `pnpm check`.
- [x] Ни одно значение в `demo/site.yaml` не равно умолчанию ядра (сторож — тест в `pnpm check`).
- [x] Снапшот `site-files.json` обновлён, `pnpm check:api-breaking --base origin/main` проходит.
- [x] `pnpm check`, `pnpm build`, `pnpm demo:packed`, `pnpm check:image-files`, `pnpm test:e2e`
  проходят; визуальные снимки не меняются.

## Implementation Notes

- Умолчания — `.default()` у листьев и `.prefault({})` у объектов; union с веткой-объектом
  (`footer.curve`, `footer.recentWorks`) по умолчанию даёт эту ветку с её умолчаниями. Общие
  подсхемы с разными умолчаниями стали фабриками: `documentSurfaceSchema(...)` (`articlesIndex` /
  `coursesIndex`), `masonryLayoutSchema({ gap })` (16 у `portfolio`, 12 у `album`).
- `images.publicPath` нельзя сделать умолчанием поля (запрещён при `publicOrigin`): `imageConfigSchema`
  подставляет `DEFAULT_PUBLIC_PATH = '/media'` в `.transform(withDefaultLocation)` перед прежними
  проверками. Умолчание `privacy.deniedFields` — список демо в его порядке (порядок входит в хеш).
- `loader.ts` не менялся по коду: полная загрузка и срезы берут умолчания из той же схемы.
- Сторож демо — тест `loader.test.ts` «writes no value of the demo's site.yaml that equals the core
  default»: удаляет по одному листу/массиву и падает, если эффективный конфиг не изменился.
- `check:api-breaking --base origin/main` проходит (на `main` нет `site.yaml` формы 6.4b); против
  `HEAD` (6.4b) гейт видит ~150 изменений «default changed» и смену transform секции `images` как
  breaking — записи `**Breaking:**` нет, изменение записано в `### Added`.
- Визуальные снимки не сравнивались: нет Docker; `pnpm test:e2e` — 429 пройдено, 85 пропущено.
- После коммита: `pnpm test:e2e:docker` — 462 пройдено, 52 пропущено, визуальные снимки без изменений. Классификатор
  `check:api-breaking` считает умолчание у прежде обязательного поля совместимым; против `dc70ef3`
  остаётся одна ожидаемая запись — transform секции `images`.

## Spec Change Log

## Review Triage Log

Ревью 1 (Codex: blind-hunter — B, edge-case-hunter — E, verification-gap — V: пробелов нет).
`pnpm check` до ревью: 1884 теста пройдено.

| # | Слои | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|---|
| 1 | B1, E1 | Смена значения `DEFAULT_PUBLIC_PATH` не видна в снапшоте | medium | `fingerprintSources` берёт `String(fn)` transform (`scripts/lib/api-surface.ts:224-227`), а в исходнике `withDefaultLocation` только имя константы; README обещает, что снапшот записывает умолчания | patch |
| 2 | B2 | README отсылает к снапшоту, который не публикуется в пакете | low | Умолчания читаемы в опубликованном `src/config/*.ts` (`packages/core/package.json` `files: src`); фраза README — про гейт API, не про справочник; правка — новый справочный раздел, не прямая правка | reject |
| 3 | B3, B4, B5, B6 | Частичное переопределение одной стороны связанной пары падает на унаследованном умолчании (`articlesIndex.kind: grid` + `ratio: original`, `recentWorks.count: 1` + `favorites: 2`, компактная `portfolio.card` + `excerpt: on`, `square.columns: 1` + `minColumns: 2`) | low | Ошибка громкая и с путём (перекрёстные правила `site-schema.ts`), но README правил слияния об этом молчит; правка — одно предложение | patch |
| 4 | B7 | Нет примера целого блока `moreDocs.<kind>` | low | Умолчания блоков целиком в опубликованном `site-schema.ts` (`moreDocsSchema`), а каждое нарушение условного поля даёт сообщение с путём (`superRefine` `moreDocsConfigSchema`); правка — новый пример в документации | reject |
| 5 | B8 | README демо не называет смену умолчаний конвейера ядра поводом перерезать деривативы | low | `configDigest` считается от эффективного конфига, поэтому смена умолчания `images.*` делает дескриптор устаревшим и `pnpm check:image-files` падает (`scripts/check-image-files.ts:27`) | reject |
| 6 | B9 | Сторож демо не ловит целый блок `moreDocs.<kind>`, равный умолчанию | low | `loader.test.ts` удаляет только листья; без любого обязательного поля блок невалиден, поэтому совпадение не находится — дыра в стороже инварианта AC | patch |
| 7 | B10 | AC отмечен, хотя визуальные снимки не сравнивались | low | Верно: Docker нет, Implementation Notes это записывают; правка — правка спеки этой сборки, поэтому reject по правилу триажа; AC переотмечен как невыполненная часть | reject |

## Verification

**Commands:**
- `pnpm check` -- expected: зелёный, включая переход на фикстуре, golden-хеш и сторож демо.
- `pnpm build && pnpm demo:packed` -- expected: сборка без перекодирования изображений.
- `pnpm check:image-files` -- expected: дескриптор демо не устарел.
- `pnpm check:api-breaking --base origin/main` -- expected: проходит с записями при breaking.
- `pnpm test:e2e` -- expected: те же результаты, что до изменения.
