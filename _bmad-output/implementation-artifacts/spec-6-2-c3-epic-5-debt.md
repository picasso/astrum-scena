---
title: 'Долг эпика 5: mediaSource у документов и мёртвый код ядра'
type: 'refactor'
created: '2026-10-28'
status: 'done'
baseline_commit: 'c09d631a72340981d7689dc10388f81264054360'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Два пункта долга эпика 5 переданы в 6.2 (`epic-5-closeout.md:65`, `deferred-work.md`
записи 5.10). Первый: правило схемы `featured` (`schemas.ts:442-448`) отклоняет
`mediaSource: target` у слайда со статьёй или страницей; его обоснование «у документа нет обложки»
неверно с ADR-0013, давшей документам `coverId`. Второй: гипотезы о мёртвом коде, записанные при
переводе комментариев в 5.10, не проверены на перенесённом коде.

**Approach:** Часть C3 истории 6.2. Решение владельца по контракту `mediaSource` записывается в код,
схему, тесты и демо. Гипотезы о мёртвом коде проверяются по вызывающим в ядре и в skills исходного
сайта (только чтение): мёртвое удаляется, живое остаётся и получает перенесённые синтетические
тесты, код миграции уходит в 8.1.

**Решение владельца (2026-10-28):** `mediaSource: target` у слайда-документа разрешён: медиа — фото
из `coverId` документа опорной локали (ADR-0013: `coverId` хранится только там), как у альбома из его
`coverId`. Документ без `coverId` — ошибка сборки с именем документа и подсказкой указать
`mediaSource.photoSlug`. `photoSlug` работает как раньше; расширение совместимое. В демо — слайд-статья
с `coverId` и `mediaSource: target`.

## Boundaries & Constraints

**Always:** Вердикт о мёртвом коде — по вызывающим вне тестов в `packages/core/src`, `scripts/` и в
skills/скриптах исходника; skill, ссылающийся на функцию, — живой вызывающий. Удалённое уходит вместе
со своими тестами и приватными помощниками, которыми больше никто не пользуется. Литералов локалей в
ядре не прибавляется.

**Never:** Не трогать исходный сайт. Не переносить код миграции (`importer.ts`, `checkFullCandidate`,
`DecisionInventory`, скрипты `content:translations:*`) — это migrate-wp, эпик 8. Не переносить
factcheck и skills (6.7). Не менять поведение слайдов альбомов.

</frozen-after-approval>

## Code Map

- `packages/core/src/lib/content/schemas.ts:432-449` — `superRefine` слайда-документа (правило
  `mediaSource`); `:299` — `coverId` документа (только опорная локаль, ADR-0013).
- `packages/core/src/lib/featured.ts:104-118` `albumMedia` (образец: `photoSlug ?? coverId`),
  `:120-149` `documentTarget`/`pageTarget` (опорная запись уже ищется для курса), `:189-205` —
  ветка документа и заглушка «schema already rejects 'target'».
- Тесты: `lib/featured.test.ts` (A5 — на реальном контенте, сейчас вне `pnpm check`; проверять на
  фикстурах), фикстура `lib/content/__fixtures__/featured-home.yaml`, тесты схемы `featured` в
  `lib/content/*.test.ts`; демо — `demo/src/content/featured/home.yaml`,
  `demo/src/content/articles/reading-the-light.*.md`; проверка числа слайдов —
  `scripts/build-demo-from-pack.ts` (`loadFeaturedSlideCount`).
- `packages/core/src/lib/content/language.ts` + `language.test.ts` — `containsRussian`,
  `countRussianLetters`: в ядре вызывающих нет, в исходнике — только `migration/` (эпик 8).
- `packages/core/src/lib/content/errata-edit.ts` (715 строк): `editHtmlAnchorHref` (`:71`, помощник
  `locateAnchorParts` `:149`) — вызывающих нет ни в ядре, ни в исходнике, skill `factcheck-apply` его
  не называет. `editMarkdownLinkDestination`, `replaceProseLiteral`, `parseErrataNotes`,
  `regenerateNoteRegion` — живые: их называет skill `factcheck-apply` исходника (придёт с 6.7);
  `stripManagedNoteRegion` вызывает `translation-freshness.ts:3`. Тест исходника
  `src/lib/content/errata-edit.test.ts` (574 строки, синтетические строки, импортирует
  `./legacy-links`) в A2 не перенесён (`spec-6-2-a2-port-core-code.md:96`, ревью B9).
- Учёт: `deferred-work.md` — записи 5.10 о мёртвом коде и о `mediaSource` (`closed_by`, для кода
  миграции — `partial_by` с остатком для 8.1), запись C3 и C (`partial_by`); `epic-5-closeout.md:65`
  не правится (это закрытый отчёт).

## Tasks & Acceptance

**Execution:**
- [x] `schemas.ts`, `featured.ts` + тесты на фикстурах (`pnpm check`), фикстура `featured-home.yaml`
  -- снять правило схемы и заглушку; медиа документа из `coverId` опорной записи (как `pageTarget`
  ищет опорную запись); без `coverId` — ошибка с именем документа и подсказкой про `photoSlug`;
  тесты: статья и страница с `target` в обеих локалях, документ без `coverId`, `photoSlug` как раньше.
- [x] `demo/src/content/{featured/home.yaml,articles/reading-the-light.en.md}` -- слайд-статья с
  `mediaSource: target`; `coverId` — фото демо.
- [x] `lib/content/language.ts`, `language.test.ts` -- удалить.
- [x] `lib/content/errata-edit.ts` -- удалить `editHtmlAnchorHref` и помощники, нужные только ему.
- [x] `lib/content/errata-edit.test.ts` -- перенести тест исходника без раздела `editHtmlAnchorHref`;
  проходит в `pnpm check`.
- [x] `deferred-work.md`, `sprint-status.yaml` -- учёт.

**Acceptance Criteria:**
- [x] `pnpm check`, `pnpm build` и `pnpm demo:packed` проходят.
- [x] `rg -n "containsRussian|countRussianLetters|editHtmlAnchorHref" packages scripts demo` пуст.
- [x] Каждая оставшаяся экспортируемая функция `errata-edit.ts` вызывается тестом в `pnpm check`.
- [x] Поведение слайда-документа соответствует решению владельца и закреплено тестом.

## Verification

**Commands:**
- `pnpm check`, `pnpm build`, `pnpm demo:packed` -- expected: зелёные.

## Implementation Notes

- `featured.ts`: общий помощник `referenceDocument` (опорная запись документа) используют
  `pageTarget` (проверка курса) и новый `documentMediaId` (`coverId` для `mediaSource: target`).
  Опорная запись статьи ищется только при `target`, так что слайд с `photoSlug` не требует её, как и
  раньше.
- `lib/featured.test.ts` в ядре — новый, на синтетическом снимке, фикстурах `featured-home.yaml`
  (добавлен слайд-статья с `target`) и `featured-images-ladder.json` (раньше не использовался); тест
  исходника на реальном контенте не переносился.
- Демо: `coverId: wide-tide` у `reading-the-light.en.md` (опорная локаль демо — `en`) даёт статье ещё
  баннер и картинку карточки — прямое следствие ADR-0013; `loadFeaturedSlideCount` демо теперь 3.
- `errata-edit.ts`: вместе с `editHtmlAnchorHref` ушли `locateAnchorParts`, `AnchorParts`,
  `AnchorEditResult` и импорт `parse5` (остаётся зависимостью — его используют `legacy-links.ts` и
  `security-headers.ts`); тип отказа сужен до `LinkEditFailure` без недостижимого `bare-in-prose`.
- `errata-edit.test.ts`: перенесён без раздела `editHtmlAnchorHref`; реальные бренды и хосты корпуса
  заменены синтетическими (`*.example`). Экспорты `escapeMarkdownLabel` и `serializeNoteRegion`
  внешних вызывающих не имеют и тестом исходника вызывались только косвенно — добавлены два прямых
  теста ради критерия «каждая экспортируемая функция вызывается тестом».

## Spec Change Log

## Review Triage Log

Проход 1 (Codex: blind, edge-case, verification-gap; diff от `c09d631`). Edge-case — `[]`,
verification-gap — пробелов нет.

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| B1 | `docs/08-content-model.md` предписывает документам `mediaSource.photoSlug` | medium | `docs/08-content-model.md:308-309` противоречит снятому правилу: читатель документа выберет обязательный `photoSlug` | patch — описать `target` из `coverId` опорной записи и ошибку без обложки |
| B8 | Тест правок URL-меток не проверяет `labelChanges` | low | `rg labelChanges packages/core/src/lib/content/errata-edit.test.ts` пуст; неверный отчёт о смене метки для владельца прошёл бы | patch — сверить `labelChanges` в тестах переписывания метки и пустой отчёт для описательной метки |
| B2 | `sprint-status.yaml` — `in-progress` при спеке `in-review` | false | статус `review` ставит шаг завершения процесса после ревью; до него `in-progress` — ожидаемое состояние | reject |
| B3 | Ошибка «нет `coverId`» проверена только для статей | low | `documentMediaId` (`featured.ts`, общий для статей и страниц) — одна функция; путь страниц отличается только `pageTarget`, его проверяет тест «takes document media … pages»; дублирующий тест — без новой защиты | reject |
| B4 | `photoSlug` поверх обложки проверен только для статей | low | `photoSlug` берётся до любого обращения к коллекции (`featured.ts`, тернарник `typeof slide.mediaSource === 'string'`), ветка общая для статей и страниц | reject |
| B5 | Медиа документа не проверено с `copySource: media/inline` | low | выбор медиа (`photoSlug`) вычисляется до ветвления по `copySource` и от него не зависит (`featured.ts`) | reject |
| B6 | Нет теста, что `photoSlug` статьи не требует опорной записи | low | `documentMediaId` вызывается только в ветке `mediaSource === 'target'` (`featured.ts`), других обращений к опорной записи у статьи нет | reject |
| B7 | Сборка из tarball не сверяет содержимое нового слайда | low | число слайдов сверяется с `home.yaml` и все `/media/…` проверяются на существование (`assertDemoImages`, C2b); заголовок и фото слайда-документа закреплены `featured.test.ts` | reject |
