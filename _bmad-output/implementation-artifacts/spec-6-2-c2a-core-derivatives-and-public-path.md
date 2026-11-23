---
title: 'Функция нарезки деривативов и publicPath в ядре'
type: 'feature'
created: '2026-10-27'
status: 'done'
baseline_commit: '0c786577365a52c81e85c208a7cfc2d22eef1867'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Критерий 6.2 (AD-2): процедурные изображения демо проходят пайплайн ядра, статические
производные раздаются из `public/` демо без R2. В ядре есть только сторона чтения изображений:
нарезки нет (пайплайн исходника переносится в 6.7). `publicOrigin` по схеме и `assertHttpsOrigin`
допускает только HTTPS, поэтому раздать изображения с самого сайта нельзя.

**Approach:** Часть C2a истории 6.2. В ядро переносится минимальная функция нарезки исходника:
мастер-буфер → `sharp` → лестница AVIF/WebP с водяным знаком → запись манифеста v3. Рядом — схема и
загрузчик `config/images.yaml` и проекция в `images-public.json`. Поле `publicPath` (путь от корня
сайта) взаимоисключающее с `publicOrigin`.

**Решения владельца (2026-10-27):** C2 = C2a (этот спек: ядро) + C2b (демо: генератор, контент,
проверки, `check:local-paths` для бинарников). Права в XMP через ExifTool — в 6.7: писатель прав
инъецируемый, без него `rightsEmbedded: false`. `publicPath` — отдельное поле, `publicOrigin`
остаётся только HTTPS.

## Boundaries & Constraints

**Always:** Поведение сайтов с `publicOrigin` не меняется: схема, CSP `img-src`, `preconnect` и
URL. Одна схема и один загрузчик на файл, корень сайта — параметром, не `process.cwd()` (AD-8,
AD-9). Нарезка детерминирована для одних входов и версии `sharp`. Модули нарезки не попадают в
страницы и компоненты (иначе `sharp` уходит в сборку сайта): запрет — lint-правилом в `pnpm check`.

**Never:** Не переносить R2, sync, ledger, live-check, master registry, GPS, ExifTool и CLI (6.7). Не
трогать демо, кроме исправлений тестов. Не менять схему манифеста и release-дескриптора.

## I/O & Edge-Case Matrix

| Сценарий | Вход / состояние | Ожидаемое | Ошибка |
|---|---|---|---|
| Static-сайт | `images-public.json` с `publicPath: /media` | URL `/media/<objectKey>`; `img-src 'self' data:`; нет `preconnect` | — |
| R2-сайт | `publicOrigin: https://…` | как сейчас | — |
| Оба поля / ни одного | оба или ни одного | схема отклоняет | сообщение с полем |
| Плохой путь | `media`, `/media/`, `/a/../b`, `//host` | схема отклоняет | сообщение с полем |
| Нарезка | мастер 3000×2000, лестница 200…1600, native 2000 | ширины ≤ 2000 по `planLadderWidths`; AVIF и WebP на каждой; запись проходит `parseManifestV3` | — |
| Водяной знак | ширина > `watermark.aboveWidth` | знак наложен, `watermarkProfile` = id профиля; иначе `none` | — |
| Без писателя прав | `writeRights` не передан | `rightsEmbedded: false`, `privacyChecked: true` | — |
| Маленький мастер | 300×200 | ширины ≤ 300, без апскейла | — |

</frozen-after-approval>

## Code Map

- Исходник (`$REFERENCE_SITE_ROOT`, только чтение), `scripts/lib/images/`: `build-engine.ts`
  (`computeDominantColor` 57, `renderDerivative` 67, `buildPhotoLadder` 107 с `BuildDeps` 22-30),
  `hashing.ts`, `transform.ts` (`loadOriented`, ориентации 5-8), `watermark.ts`
  (`normalizeWatermarkBounds`, `computeWatermarkLayout`, `composeWatermark`), `watermark-source.ts`
  (`approvedWatermarkBytes` со сверкой sha256), `source-resolver.ts:326-355` (`planLadderWidths`),
  `config.ts` (`imageConfigSchemaV2` 163-257, `REQUIRED_DENIED_FIELDS`, `loadImageConfig`,
  `computeConfigDigest`), `public-config.ts` (`buildImagePublicConfig`). Тесты: `build-engine`,
  `transform`, `watermark`, `hashing`, `config`, `ladder` (`*.test.ts`, мастера через
  `sharp({ create })`). В `buildPhotoLadder` вход — буфер мастера, а не `ResolvedMaster`; staging и
  переименование файлов — у вызывающего.
- Ядро, `packages/core/src/lib/images/`: `manifest.ts` (схема v3 и `superRefine` 50-100),
  `release.ts:68` (`buildReleaseDescriptor`), `canonical.ts` (`canonicalStringify`),
  `public-config.ts` (схема, `loadImagePublicConfig`), `catalog.ts:21` (`originBase`). Новые модули
  нарезки — в `lib/images/build/` (kebab-case).
- Потребители `publicOrigin`: `index.ts:114,166` (`imagesOrigin` → `siteFiles`),
  `lib/security-headers.ts:118-131` (`cspDirectives`, `assertHttpsOrigin`),
  `layouts/html-shell.astro:60,134` (`preconnect`). `media.ts:85` и `viewer-data.ts:16` склеивают
  `originBase` + `objectKey` и путь принимают без правок.
- `demo/config/images.yaml` — реальный вход для тестов схемы (версия 2, водяной знак
  `src/assets/images/watermarks/astrum-scena-mark.png`).
- `eslint.config.mjs:60-93` — `ADAPTERS`/`COMPUTATIONS`; модули с IO — в `ADAPTERS`.
- `sharp` 0.35.5 уже стоит в workspace как опциональная зависимость Astro; `allowBuilds` его
  содержит (`pnpm-workspace.yaml:7`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/package.json` -- `sharp` в `dependencies` (закреплённая версия 0.35.x).
- [x] `packages/core/src/lib/images/build/*.ts` + тесты -- перенос минимального набора из Code Map;
  `config/images.yaml` получает `publicPath` xor `publicOrigin`.
- [x] `packages/core/src/lib/images/public-config.ts` + тест -- `publicPath` xor `publicOrigin`,
  помощники «база URL» и «внешний origin или ничего»; проекция из конфига изображений.
- [x] `catalog.ts`, `security-headers.ts`, `index.ts`, `html-shell.astro` + тесты -- база URL из
  помощника; без внешнего origin `img-src` без хоста и без `preconnect`.
- [x] `eslint.config.mjs` + тест -- новые модули в `ADAPTERS`; импорт `lib/images/build/` из
  `pages/`, `components/`, `layouts/` запрещён.
- [x] `epics.md` (части 6.2), `sprint-status.yaml` (C2 → C2a/C2b) -- решения владельца.

**Acceptance Criteria:**
- [x] Тест строит на синтетическом мастере полную запись манифеста, которая проходит
  `parseManifestV3` и `buildReleaseDescriptor({ active: true, … })`.
- [x] `configDigest` не зависит от порядка ключей `images.yaml`.
- [x] `pnpm check`, `pnpm build` и `pnpm demo:packed` проходят; сборка демо не тянет `sharp` в
  `dist`.

## Implementation Notes

- Модули `lib/images/build/`: `config.ts` (схема v2 с `publicPath` xor `publicOrigin`,
  `loadImageConfig(siteRoot)` без `process.cwd()`, `computeConfigDigest`), `hashing.ts`, `ladder.ts`
  (`planLadderWidths`), `transform.ts`, `watermark.ts`, `watermark-source.ts`, `engine.ts`
  (`computeDominantColor`, `renderDerivative`, `buildPhotoLadder`). В `ADAPTERS` — только модули с
  IO: `build/config` и `build/watermark-source`.
- `loadOriented` возвращает только размер после ориентации и ориентацию: экземпляр `sharp` движку не
  нужен, `noUpscaleWidth`/`resizeToWidth` не перенесены (лестница уже не апскейлит, у `resize` —
  `withoutEnlargement`).
- `buildPhotoLadder({ photoId, masterBytes, config, resolveWatermark, writeRights? })` возвращает
  `{ entry, files: { objectKey, bytes, sha256, byteSize }[], warnings }` и ничего не пишет.
  `RightsWriter` работает с байтами: `(bytes, { format, rights, deniedFields }) → { bytes,
  rightsEmbedded, deniedFieldsPresent }`. Без писателя проверка приватности — отсутствие блоков
  EXIF/XMP/IPTC в файле (`sharp` их не переносит из мастера); найденный блок — ошибка.
- Синтетический знак и fixture-режим резолвера не перенесены: тесты берут утверждённый знак демо со
  сверкой sha256.
- Проекция `buildImagePublicConfig` — в `lib/images/public-config.ts` со структурным типом входа,
  чтобы рантайм не импортировал `build/`; схема `images.yaml` берёт поля и проверку xor оттуда же.
- Запрет lint — импорт любого сегмента `build` (единственный такой каталог ядра —
  `lib/images/build`) из любого файла ядра, кроме самого `lib/images/build/` и тестов; так закрыт и
  путь через промежуточный модуль `lib`, и обход через сегменты `./`.
- Схема запрещает id профиля водяного знака `none` и непрозрачность, при которой альфа знака
  округляется до нуля.
- Демо не менялось: оно по-прежнему на `publicOrigin`, поэтому ветка без внешнего origin проверена
  юнит-тестами (CSP, `html-shell` с подменой загрузчика, `catalog`, `media`), а не сборкой.

## Spec Change Log

## Review Triage Log

Проход 1 (Codex: blind, edge-case, verification-gap; diff от `0c78657`).

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| B6+V1 | Тест лестницы проверяет водяной знак только по меткам манифеста | medium | снятие опций знака в `engine.ts:160` проходило тесты | patch — пиксели области знака выше и ниже порога |
| B9+V2 | Писатели прав в тестах возвращают те же байты | medium | подмена `embedding.bytes` на `rendered.bytes` проходила | patch — писатель с перекодированием, сверка bytes/sha256/byteSize/objectKey |
| B7+V3 | Ориентация не проверяется на пикселях деривативов | medium | удаление `.rotate()` проходило | patch — асимметричный мастер с ориентацией 6 |
| B10 | Мастера без приватных метаданных — очистка не показана | low | фикстуры без EXIF/XMP | patch — мастер с EXIF и XMP, выходы без блоков |
| B8+V5 | Доминантный цвет проверяется регэкспом | medium | константа `#000000` проходила | patch — сплошные мастера, RGB с допуском |
| V4 | Связка `publicPath` → `siteFiles` в интеграции не проверена | medium | `imageUrlBase` в `index.ts:114` проходил | patch — интеграционный тест на временном сайте с `publicPath` |
| E5 | Lint-запрет обходится через `images/./build` и промежуточный модуль `lib` | medium | правило висело только на `pages/components/layouts` и прямом пути | patch — запрет сегмента `build` во всём ядре, кроме `lib/images/build/**` и тестов |
| B1+E1 | Прозрачность знака читается из `channels[3]` | low | у серого PNG с альфой два канала — невидимый знак проходил | patch — последний канал после `ensureAlpha()` |
| B2 | `opacity: 0` (или квантуемая в ноль) даёт невидимый знак с меткой профиля | low | `config.ts:164` `.min(0)` | patch — схема отклоняет |
| B3 | Id профиля `none` допускается | low | `none` в манифесте — «без знака» | patch — схема отклоняет |
| B4 | Ассет знака разрешается, даже если все ширины ниже порога | false | ассет — часть конфига (`config.ts:234` требует единственный ссылаемый ассет); громкий отказ на сломанном конфиге — корректное поведение | reject |
| B5 | Писатель прав может вернуть EXIF-ориентацию | low | писателя нет до 6.7 (решение владельца); защита добавила бы ветку под несуществующего вызывающего | reject |
| E2 | `renderDerivative` молча пропускает знак при одном из двух аргументов | false | единственный вызывающий `engine.ts:160` передаёт оба вместе | reject |
| E3 | NaN/Infinity в размерах раскладки знака | false | размеры приходят из `info` sharp (`engine.ts:88-89`) и `normalizeWatermarkBounds` — целые | reject |
| E4 | Писатель прав может вернуть HEIC вместо AVIF | low | писателя нет до 6.7; проверка `compression` — новая ветка под несуществующего вызывающего | reject |

После исправлений `check:identity` упал на URI пространства имён Dublin Core в синтетическом XMP
теста; `purl.org` добавлен в `PUBLIC_HOSTS` (`scripts/lib/identity.ts`) — хост никого не называет.

## Verification

**Commands:**
- `pnpm check` -- expected: все группы зелёные.
- `pnpm build` и `pnpm demo:packed` -- expected: сборки проходят.
- `rg -l sharp demo/dist` -- expected: пусто.
