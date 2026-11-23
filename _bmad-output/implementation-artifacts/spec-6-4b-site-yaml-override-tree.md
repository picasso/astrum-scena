---
title: 'Одно дерево переопределений `site.yaml` (6.4, часть B)'
type: 'feature'
created: '2026-11-08'
status: 'done'
baseline_commit: '98f1ee0691da2695181facfcc6c2bc669077fac7'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** конфиг, который читает ядро, разнесён по трём файлам (`src/config/site.yaml`,
`src/config/seo.yaml`, `config/images.yaml`) с тремя загрузчиками, и владелец обязан выписывать
каждое поле, даже совпадающее с поведением ядра: нет одного дерева, на котором часть C построит
`site.lock.yaml` (AD-19).

**Approach:** SEO и конфиг изображений становятся секциями `seo:` и `images:` одного файла
`site.yaml` новой формы (`schemaVersion: 2`); один загрузчик читает его, проверяет строгой схемой и
отдаёт секции прежним потребителям. Старая форма — ошибка с указанием на запись `UPGRADING.md`,
переход проверен тестом на фикстуре старой формы.

**Decisions (владелец, 2026-11-08):**
- `site.yaml` лежит в корне сайта (`SITE_CONFIG_PATH = 'site.yaml'`), рядом с будущим
  `site.lock.yaml`, как в AD-19; путь меняется вместе со слиянием, переход для сайтов один.
- Умолчания ядра и сокращение `site.yaml` демо до отличий — отдельная часть B2 (запись в
  `deferred-work.md`); здесь только слияние файлов, схемы секций сохраняют нынешнюю
  обязательность полей.
- Секцию границ мест не резервировать: файла `place-gps-bounds.yaml` в ядре нет, он уходит в AC GPS
  истории 6.7 (решение 2026-11-06); критерий 6.4 в `epics.md` переписывается — границы мест входят в
  дерево, когда появятся.

## Boundaries & Constraints

**Always:**
- Неизвестный ключ на любом уровне `site.yaml` — ошибка с полным путём ключа
  (`site.yaml: images.ladder.widthz: unrecognized key`), до применения умолчаний.
- `configDigest` демо и golden-литерал `80d0daa2…` не меняются: в проекции хеша `version` — константа
  `2` (байтовый контракт версии 1), а не `schemaVersion` нового файла; деривативы не
  перекодируются, `images-*.json` демо меняются только писателем и без смены `configDigest`.
- Если остался `src/config/site.yaml`, `src/config/seo.yaml` или `config/images.yaml`, загрузка падает с именем файла
  и ссылкой на переход, а не молча его игнорирует.
- Один модуль-загрузчик для всего дерева; `loadImageConfig(siteRoot)` и `loadSeoConfig(siteRoot)`
  остаются функциями-срезами над ним, потребители не меняют сигнатур.

**Never:**
- Не писать `site.lock.yaml`, `core config resolve` и drift-гейт (часть C), не выводить `rights` из
  `origin` (часть D).
- Не менять `IMAGE_DIGEST_VERSION`, байты хеша и схемы `images-*.json`.
- Не делать универсальную команду `core upgrade`; переход ручной, по `UPGRADING.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Новая форма | `site.yaml` v2 с `seo:` и `images:` | `site`, `seo`, конфиг изображений равны прежним значениям демо; хеш `80d0daa2…`-контракта прежний | N/A |
| Старая форма | `site.yaml` с `schemaVersion: 1` | ошибка | `site.yaml: schemaVersion 1 is not supported; supported: 2` + ссылка на `UPGRADING.md` |
| Остался старый файл | v2 и существующий `config/images.yaml` | ошибка | `config/images.yaml: folded into site.yaml (images); see UPGRADING.md` |
| Неизвестный ключ | `images.ladder.widthz: […]` | ошибка с путём | путь `images.ladder.widthz` в сообщении |
| Переход на фикстуре | старые три файла фикстуры → новая форма по записи `UPGRADING.md` | эффективные `site`, `seo`, конфиг изображений и `configDigest` совпадают | N/A |

</frozen-after-approval>

## Code Map

- `packages/core/src/config/loader.ts` -- единственный читатель site/seo: `SITE_CONFIG_PATH` (:14),
  `SITE_CONFIG_ENV`/`siteConfigPath` (:19-20), `readSiteConfigRaw`, `loadSiteConfig`,
  `loadSiteSection` (:56-73), `loadSeoConfig` (:75). Сюда дерево, срезы и проверка забытых файлов.
- `packages/core/src/config/site-schema.ts:538-593` -- `siteSchema` (`schemaVersion: z.literal(1)`,
  `.strict()`, `superRefine` локалей); сюда `seo` и `images` секциями и `schemaVersion: 2`.
- `packages/core/src/config/seo-schema.ts` -- `seoSchema`; становится схемой секции без `schemaVersion`.
- `packages/core/src/lib/images/build/config.ts` -- `imageConfigSchemaV2` (:180), `parseImageConfig`/
  `loadImageConfig` (:277-290), `IMAGE_DIGEST_PROJECTION` (:303, `version: 'schemaVersion'` →
  константа 2); тест инварианта `config.test.ts:207-211` должен обходить схему секции.
- `packages/core/src/config/schema-version.ts` -- `assertSchemaVersion`; сообщение старой формы.
- `packages/core/src/index.ts:67-68,87-88,160-161` -- watch-файлы Vite и `variantCssPlugin` смотрят на
  путь `site.yaml`; `seo.yaml` из watch уходит.
- Потребители конфига изображений: `scripts/lib/demo-images.ts:261-264`, `scripts/lib/image-files.ts:40,56`,
  `scripts/check-image-files.ts:27` (тексты сообщений с `config/images.yaml`).
- `scripts/lib/api-surface.ts:94-97` -- `SITE_FILE_SCHEMAS`: три ключа → один; снапшот
  `packages/core/api-snapshot/site-files.json` (`pnpm api:snapshot`); удаление ключей —
  breaking, нужны `**Breaking:**` в `CHANGELOG.md` и запись `UPGRADING.md` (`check:api-breaking`).
- Демо: `demo/src/config/site.yaml`, `demo/src/config/seo.yaml`, `demo/config/images.yaml` → `demo/site.yaml`;
  `pnpm demo:packed` (`scripts/build-demo-from-pack.ts:245`) копирует сайт — проверить, что корневой файл попадает.
- Тесты с путями/фикстурами: `config/loader.test.ts`, `index.test.ts:199-201`,
  `scripts/check-image-files.test.ts:21,65,151`, `scripts/check-layout-tokens.test.ts:15`,
  `components/brand-logo.no-brand.test.ts:21`, `lib/variant-css.test.ts:164`, `scripts/lib/api-surface.test.ts`,
  `images/build/*.test.ts`, `e2e/helpers.ts:6,17`.
- Документы путей: `packages/core/README.md:27,70,73,136`, `demo/README.md:7,26,28`,
  `docs/02-conventions-and-toolchain.md:41`, `docs/03-architecture.md:162`, `UPGRADING.md`, `CHANGELOG.md`.

## Tasks & Acceptance

**Execution:**
- [x] `site-schema.ts`, `seo-schema.ts`, `images/build/config.ts` -- секции `seo`/`images` в
  `siteSchema` v2; проекция хеша с константой `version: 2`; схемы секций без собственных версий.
- [x] `config/loader.ts` -- одно чтение дерева, срезы `loadSeoConfig`/`loadImageConfig`, ошибка на
  забытый старый файл; `SITE_CONFIG_PATH = 'site.yaml'`.
- [x] `index.ts`, `scripts/lib/*image*`, `scripts/check-image-files.ts` -- пути и тексты.
- [x] демо -- слить три файла в один; `pnpm demo:images` не перекодирует, `images-*.json` без смены
  `configDigest`.
- [x] тесты -- строки матрицы; фикстура старой формы (три файла) и её новая форма по записи
  `UPGRADING.md` дают равные эффективные конфиги и хеш.
- [x] `api-surface.ts` + `pnpm api:snapshot`; `UPGRADING.md` `[Unreleased]` запись перехода;
  `CHANGELOG.md` `**Breaking:**`; README/доки путей; `epics.md` критерий 6.4: границы мест — когда появятся; `deferred-work.md` — `partial_by` у записи
  «6.4, часть B» (остаются умолчания, часть B2).

**Acceptance Criteria:**
- [x] Каждая строка матрицы покрыта тестом в `pnpm check`.
- [x] В репозитории нет читателя `seo.yaml`/`config/images.yaml` по пути, кроме проверки
  забытых файлов (сторож — тест загрузчика на ошибку забытого файла и снапшот `site-files.json` с
  одним ключом конфига).
- [x] `pnpm check`, `pnpm build`, `pnpm demo:packed`, `pnpm check:image-files` проходят;
  `pnpm check:api-breaking --base origin/main` проходит с записями `CHANGELOG.md`/`UPGRADING.md`.

## Implementation Notes

- Схема секции `images` переехала из `lib/images/build/config.ts` в `config/images-schema.ts`: ESLint
  запрещает `config/**` импортировать `lib/**` и всем, кроме `lib/images/build` и тестов, — импорт
  `lib/images/build`. Вместе с ней в `config/` ушли её зависимости: поля места деривативов
  (`config/image-location.ts`, прежде в `lib/images/public-config.ts`), `KEBAB_CASE_PATTERN`
  (`config/kebab-case.ts`, прежде в `lib/content/schemas.ts`) и `lib/sha256-schema.ts` →
  `config/sha256-schema.ts`. `lib/images/build/config.ts` реэкспортирует схему, держит
  `loadImageConfig` (срез `loadSiteSection(root, 'images')`) и проекцию хеша; `parseImageConfig` и
  `IMAGE_CONFIG_RELATIVE_PATH` удалены.
- `assertSchemaVersion` получил необязательную подсказку для более старой версии; её передаёт только
  загрузчик `site.yaml` (`; see UPGRADING.md`), прочие файлы сообщений не меняют.
- Ошибка схемы — строка на каждую проблему `site.yaml: <полный.путь>: <сообщение>`, для лишнего
  ключа `unrecognized key`; срез секции добавляет имя секции в путь.
- Фикстура старой формы — копия трёх файлов демо до слияния в `config/__fixtures__/three-file-site/`;
  тест перехода в `config/loader.test.ts` (эффективные `site`, `seo`, `images` и равенство с демо),
  хеш — в `lib/images/build/config.test.ts` (тесты `config/` не импортируют `lib`).

## Spec Change Log

## Review Triage Log

Ревью 1 (Codex: blind-hunter — B, edge-case-hunter — E, verification-gap — V). E2e (`pnpm test:e2e`):
429 пройдено, 85 пропущено.

| # | Слои | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|---|
| 1 | B1, E1, V-other | `loadSiteSection` проверяет только свою секцию: срез для инструментов изображений примет лишний ключ в корне или в `seo` | low | Каждая сборка грузит всё дерево строгой схемой (`config/site.ts:7` → `loadSiteConfig`), так что опечатка падает на первом `astro build`; срезы по замыслу читают минимальный `site.yaml` CLI и их тестов (комментарий `loadSiteSection`, `scripts/check-layout-tokens.test.ts:15`), полная проверка в срезе сломала бы этот контракт | reject |
| 2 | B2 | Лишний ключ внутри члена union теряет путь: `footer.recentWorks.countz` → `footer.recentWorks: Invalid input` | medium | Воспроизведено на копии `demo/site.yaml`; `footerRecentWorksSchema` — `'off' \| strict object` (`site-schema.ts:169`), `describeIssues` не раскрывает `invalid_union`; нарушает «путь ключа на любом уровне» | patch |
| 3 | B3 | Предыдущая запись `UPGRADING.md` (`schemaVersion`) велит проверить сборкой и пишет, что сборка не читает конфиг изображений, — после этого выпуска сборка падает до второй записи | low | Обе записи в одном `[Unreleased]`; Verify первой записи невыполним отдельно, утверждение про сборку устарело | patch |
| 4 | B4, V-gap | Нет теста, что watch Vite привязывает `site.ts` и `seo.ts` к `site.yaml` | low | Код верен (`index.ts:60-71`: оба модуля, один путь `siteConfigPath()`); плагин не был покрыт и на базовом коммите, исход возможен только при будущей регрессии; исправление — тест с dev-сервером Astro, не прямая правка | reject |
| 5 | B5 | ADR-0014 называет `config/images.yaml` источником лестницы | low | `docs/adr/0014-image-width-ladder.md:16`; AGENTS.md требует обновлять ADR в том же изменении; правка — одна строка | patch |

## Design Notes

Секции `seo:` и `images:` вложены, а не слиты в корень: у сайта и изображений обе есть `privacy`
с разным смыслом. `schemaVersion` у файла один; версии `images.yaml` (2) и `seo.yaml` (1)
исчезают, а `2` в проекции хеша — часть байтового контракта `IMAGE_DIGEST_VERSION = 1`, не
версия файла. Скрипта перехода нет: перенос механический (вложить два файла под ключи, убрать их
`schemaVersion`, поднять версию), ошибка забытого файла ловит неполный перенос.

## Verification

**Commands:**
- `pnpm check` -- expected: зелёный, включая golden-тест хеша и тест перехода на фикстуре.
- `pnpm build && pnpm demo:packed` -- expected: сборка без перекодирования изображений.
- `pnpm check:image-files` -- expected: дескриптор демо не устарел.
- `pnpm check:api-breaking --base origin/main` -- expected: breaking только удаление файлов, с записями.
