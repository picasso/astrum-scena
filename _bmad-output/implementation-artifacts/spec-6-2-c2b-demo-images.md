---
title: 'Изображения, альбомы и фото демо на функции нарезки ядра'
type: 'feature'
created: '2026-10-27'
status: 'done'
baseline_commit: '14fafb6eeffad98bcc82a448f210b181e375891a'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-2-c2a-core-derivatives-and-public-path.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Критерий 6.2 (AD-2): процедурные изображения демо проходят пайплайн ядра, статические
производные хранятся с демо и раздаются из его `public/` без R2; production-сборка строит
`<picture>`/`srcset`. После C2a функция нарезки и `publicPath` есть в ядре, но в демо нет ни фото, ни
альбомов, ни деривативов: манифест пуст (`active: false`), маршруты портфолио не рендерятся.

**Approach:** Часть C2b истории 6.2. До первых бинарников `check:local-paths` учится проверять текст
внутри них. Скрипт репо генерирует процедурные мастера, режет их `buildPhotoLadder` ядра в
`demo/public/media/` и пишет активный `images-release.json` и `images-public.json` с
`publicPath: /media`. Демо получает синтетические фото, альбомы обеих категорий и
`featured/home.yaml`. Гейт в `pnpm check` сверяет файлы с манифестом; сборка из tarball проверяет
страницы альбома и фото и `<picture>`/`srcset`.

## Boundaries & Constraints

**Always:** Деривативы и JSON пишет только генератор; руками не правятся. Генератор детерминирован для
одной версии `sharp` и платформы; гейты его не перезапускают (байты AVIF/WebP могут отличаться между
платформами), а сверяют файлы с манифестом. Мастера процедурные, без текста (шрифты librsvg зависят от
машины), в памяти, не коммитятся. Деривативы без прав: `rightsEmbedded: false`. Корень сайта —
параметром (`--site`, по умолчанию `demo`), не `process.cwd()`. Контент синтетический (AD-22).

**Never:** Не переносить CLI ядра, ExifTool, R2, sync, ledger (6.7). Не делать реалистичных фото (6.12)
и e2e/эталонов (D). Не заполнять `image-sets.yaml` и блок Gallery. Не менять схемы ядра и поведение
сайтов с `publicOrigin`.

## I/O & Edge-Case Matrix

| Сценарий | Вход / состояние | Ожидаемое | Ошибка |
|---|---|---|---|
| Бинарник с путём | NUL-байты и UTF-8 `/Users/<имя>/…` (в т.ч. не-ASCII имя) внутри | `check:local-paths` падает: файл и найденный путь | exit 1 |
| Чистый бинарник | PNG/AVIF/WebP без путей | проходит | — |
| Файлы совпадают | каждый дериватив активного манифеста лежит в `public/media/<objectKey>` | `check:image-files` OK | — |
| Файл изменён / отсутствует | sha256 или размер не совпали, файла нет | падает со списком `objectKey` | exit 1 |
| Лишний файл | файл в `public/media/`, которого нет в манифесте | падает со списком | exit 1 |
| Сайт на `publicOrigin` | `images-public.json` с origin | проверять нечего, OK с пометкой | — |
| Повторный прогон | генератор дважды на одной машине | `git status` чист | — |

</frozen-after-approval>

## Code Map

- `scripts/lib/local-paths.ts` (`findLocalPaths`, `isBinary`), `scripts/check-local-paths.ts:22` —
  бинарник сейчас пропускается целиком; тесты `scripts/lib/local-paths.test.ts`, `scripts/check-local-paths.test.ts`.
- API ядра (импорт скриптом по относительному пути `../packages/core/src/...ts`, как
  `scripts/generate-layout-tokens.ts:4-8`; ESLint для `scripts/**` не ограничивает):
  `lib/images/build/engine.ts:123` `buildPhotoLadder({ photoId, masterBytes, config, resolveWatermark })`
  → `{ entry, files[{objectKey,bytes,sha256,byteSize}], warnings }`; `build/config.ts:283,290`
  `loadImageConfig(siteRoot)`, `computeConfigDigest`; `build/watermark-source.ts:31`
  `createWatermarkResolver({ config, siteRoot })`; `lib/images/public-config.ts:102,116`
  `buildImagePublicConfig`, `serializeImagePublicConfig`; `lib/images/release.ts:63,68`
  `serializeReleaseDescriptor`, `buildReleaseDescriptor({ active, manifest })`;
  `lib/images/manifest.ts:118-122`; загрузчик манифеста `lib/images/catalog.ts:91`.
- Образец «писатель + проверка»: `scripts/generate-layout-tokens.ts` (`.tmp` + rename),
  `scripts/check-layout-tokens.ts`, `scripts/lib/site-root.ts` (`--site`).
- Регистрация гейта: скрипт в корневом `package.json`, `CHECK_GROUPS` в `scripts/check.ts:4-17`
  (последняя группа), `ALL_CHECKS` в `scripts/check.test.ts`.
- `scripts/build-demo-from-pack.ts:28-31,40-49,83-93` — `DOCUMENT_PAGES`, `expectedDemoPages`,
  `assertDemoPages`, `assertBuiltFromTarball`; копирует `demo/public`; тест `build-demo-from-pack.test.ts`.
- Схемы контента (`packages/core/src/lib/content/schemas.ts`): фото 197-241 (`src/content/photos/<id>.yaml`;
  `title`/`status`/`publishedAt`, опц. `alt`, `caption`, `placeId`, `tags`, `capturedAt` `YYYY[-MM]`,
  `colorMode`), альбом 243-281 (`category`, `title`, `description`, `status`, `coverId`, `photoIds`,
  опц. `layout` из `config/variants.ts:20`), места/теги 338-353, `featured` 383-466
  (`src/content/featured/home.yaml`, образец `lib/content/__fixtures__/featured-home.yaml`). Ключ
  манифеста = id фото; id `recent-works`, `favorites` заняты (`integrity.ts:286`); неизвестные
  `placeId`/тег — ошибка сборки.
- Демо: `demo/config/images.yaml` (`publicOrigin` → `publicPath: /media`, комментарий про CLI),
  `demo/src/content/config/{places,tags}.yaml` (пусты), `demo/src/generated/images-*.json`.
- Тесты, завязанные на пустое демо или на его origin: `lib/images/build/config.test.ts:43`,
  `layouts/html-shell.test.ts:10-50` (мок подставляет `publicPath`; инвертировать — подставлять
  origin), `components/home-fallback.test.ts:33` (мокать загрузку `featured`, чтобы файла «нет»),
  `lib/images/public-config.test.ts:83` (проекция — должна остаться верной).

## Tasks & Acceptance

**Execution:**
- [x] `scripts/lib/local-paths.ts`, `scripts/check-local-paths.ts` + тесты -- в бинарнике искать пути в
  UTF-8-фрагментах между управляющими байтами; отчёт `файл: путь` -- закрыть пробел до бинарников.
- [x] `scripts/generate-demo-images.ts` + `scripts/lib/demo-images.ts` + тест, `package.json`
  (`demo:images`) -- таблица мастеров (id, размеры, палитра), процедурный мастер `sharp`, лестница,
  запись файлов и обоих JSON атомарно; чистка `public/media/` от лишних файлов.
- [x] `scripts/check-image-files.ts` + тест, `package.json`, `scripts/check.ts`, `scripts/check.test.ts`
  -- `check:image-files` по матрице.
- [x] `demo/config/images.yaml`, `demo/src/content/{photos,albums,featured,config/places.yaml,config/tags.yaml}`
  -- контент по Design Notes; `demo/public/media/**`, `demo/src/generated/images-*.json` -- вывод генератора.
- [x] `scripts/build-demo-from-pack.ts` + тест -- страницы альбомов и фото в обеих локалях; в них
  `<picture>` с avif/webp `srcset` на `/media/`; каждый `/media/…` из HTML страниц есть в `dist`;
  на главной — слайдер, а не запасная главная.
- [x] Тесты из Code Map -- переписать под демо на `publicPath` с `home.yaml`.
- [x] `sprint-status.yaml`, `deferred-work.md` (C2b, C2, бинарники `check:local-paths`; C — `partial_by`),
  `demo/README.md` (как перегенерировать) -- учёт.

**Acceptance Criteria:**
- [x] `pnpm check`, `pnpm build` и `pnpm demo:packed` проходят; `check:image-files` и бинарная
  ветка `check:local-paths` входят в `pnpm check`.
- [x] Каждая страница альбома и фото демо собирается в обеих локалях; `rg -l sharp demo/dist` пуст.
- [x] Повторный `pnpm demo:images` на той же машине не меняет рабочее дерево.
- [x] Деривативы выше `watermark.aboveWidth` помечены профилем знака, остальные `none`.

## Design Notes

Контент (решение агента; владелец может поменять на чекпоинте): 6 фото, мастера 2400 по длинной
стороне или меньше — горизонталь 3:2, вертикаль 2:3, квадрат, панорама 3:1, широкий 16:9, один
ч/б (`colorMode: black-and-white`); плашки — градиент и геометрия в разной палитре. Альбом `series`
(`layout: justified`, 3 фото) и альбом `places` (`masonry`, 3 фото); 2 места (страна → местность),
2 тега. `home.yaml`: два слайда — альбом с `mediaSource: target` и альбом с `photoSlug`. Оценка
объёма: 6 фото × (5 ширин + native) × 2 формата = 72 файла, порядка единиц МБ.

## Verification

**Commands:**
- `pnpm demo:images && git status --short demo` -- expected: второй прогон ничего не меняет.
- `pnpm check`, `pnpm build`, `pnpm demo:packed` -- expected: зелёные.
- `du -sh demo/public/media` -- expected: единицы МБ.

## Implementation Notes

- `check:local-paths` в бинарнике делит текст на фрагменты по управляющим байтам (кроме табуляции и
  переводов строки) и по U+FFFD невалидного UTF-8, и ищет в них только абсолютные пути (`/Users`,
  `/Volumes`, `/home`, `/private`, Homebrew, `/var/folders`, `C:\Users`). Шаблон `~/` с буквой в
  бинарниках не проверяется: на случайных данных он даёт ~3 совпадения на МБ (замер на 100 МБ
  случайных байт), то есть ложные падения на каждом новом AVIF. UTF-16-строки EXIF не проверяются.
  Отчёт — `файл: путь` без номера строки.
- `sharp` 0.35.5 добавлен в `devDependencies` корня: скрипт мастеров импортирует его напрямую (ядро
  — своей зависимостью). Пиксели мастеров считаются в JS (произведения, корни, целочисленный хеш
  зерна; без тригонометрии и степеней) и кодируются в PNG `sharp`; деривативы и JSON совпадают
  побайтно при повторном прогоне, в том числе в песочнице с другим определением CPU.
- Модули: `scripts/lib/demo-images.ts` (таблица `DEMO_MASTERS`, `renderMasterPixels`, `renderMaster`,
  `buildDemoImages` без записи, `writeDemoImages`: деривативы, затем release, затем публичная
  проекция, затем удаление лишних файлов и пустых каталогов; запись `.tmp` + rename, равные байты не
  переписываются), `scripts/lib/image-files.ts` (`mediaDirectory`, `listMediaFiles`,
  `verifyImageFiles` — общие для генератора и гейта).
- Итог: 6 мастеров, 70 деривативов (у `quiet-tower` 1600×2400 потолок длинной стороны даёт 1333 px,
  поэтому 5 ширин), 564 КБ — меньше оценки «единицы МБ»: плоские плашки хорошо сжимаются.
- `build-demo-from-pack` берёт альбомы и фото из `src/content/albums/*.yaml` собираемого сайта, а не
  из списка в скрипте. Слайдер главной проверяется по классу `hero-swiper` и отсутствию
  `home-fallback`.
- `html-shell.test.ts` подменяет проекцию на origin, `home-fallback.test.ts` — `loadFeaturedHome` на
  `undefined`; `catalog.test.ts` и `build/config.test.ts` перевёрнуты так же (демо на `publicPath`,
  origin — мутацией).

## Spec Change Log

## Review Triage Log

Проход 1 (Codex: blind, edge-case, verification-gap; diff от `14fafb6`).

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| B1 | `check:image-files` не сверяет `configDigest` релиза с текущим `config/images.yaml` | medium | `scripts/lib/image-files.ts:44` читает только манифест; смена качества или знака без перегенерации проходит гейт, а `public-config.test.ts:83` ловит лишь публичные поля | patch — сравнить с `computeConfigDigest(loadImageConfig(siteRoot))`, тест |
| B2+E4+V2 | Проверка главной принимает пустой `hero-swiper` | medium | `build-demo-from-pack.ts:157-160` ищет только класс; позитивная фикстура теста — пустой контейнер | patch — число `swiper-slide` на главной каждой локали равно числу слайдов `home.yaml` сайта |
| V1 | Подмена sha256 без смены размера не проверена | medium | тест `check-image-files.test.ts:97` дописывает байт — падает по размеру; удаление сравнения sha256 прошло бы | patch — тест с заменой байта той же длины |
| B4 | `loadDemoAlbums` берёт только `.yaml` | low | ядро принимает `**/*.{yaml,yml}` (`collections.ts:23-47`); альбом `.yml` выпал бы из проверки молча | patch — принимать `.yml` |
| B3+B5 | `<picture>` проверяется по наличию, не по фото маршрута; `srcset="/media/"` без кандидатов проходит | low | подвал страницы фото содержит srcset всех 6 фото (`demo/dist/en/portfolio/geometry-studies/quiet-tower/index.html`), поэтому проверка по id требует разбора основной фигуры — новая ветка; какое фото рендерит маршрут, покрывает `lib/portfolio/photo-page.test.ts`, а `buildPictureModel` (`media.ts:91`) строит кандидатов из деривативов, которых по схеме манифеста не меньше одного | reject |
| B6 | Release и публичная проекция пишутся разными rename | low | прерывание оставляет рассинхрон до повторного запуска; повтор идемпотентен (`writeAtomic` пропускает равные байты), а полусостояние ловят `check:image-files` и `public-config.test.ts:83`; транзакционная запись — новая ветка | reject |
| B7+E2 | Параллельные запуски генератора делят `.tmp` | low | генератор — ручная команда разработчика, его не вызывают ни `scripts/check.ts`, ни CI; блокировка — новая ветка | reject |
| B8+E3 | При смене `publicPath` старые деривативы остаются в `public/` | low | `publicPath` задаётся один раз в `demo/config/images.yaml:4`; чистка прежнего каталога требует чтения прежней проекции — новая ветка под редкое ручное действие | reject |
| B9+E1 | Повтор id мастера перезаписывает запись манифеста | false | `DEMO_MASTERS` — константа; `demo-images.test.ts:489-494` сравнивает отсортированные id с именами файлов фото, которые уникальны, — повтор id ломает тест | reject |
| B10 | Рендер мастеров сравнивается только сам с собой | low | чёрный мастер не ломает сайт и сразу виден в закоммиченных изображениях и в `dominantColor` `images-release.json`; защита — новые утверждения под гипотетическую регрессию | reject |
