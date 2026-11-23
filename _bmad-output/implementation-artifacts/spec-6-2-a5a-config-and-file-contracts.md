---
title: 'Тесты конфига и файловых контрактов на демо'
type: 'test'
created: '2026-10-29'
status: 'done'
baseline_commit: 'ddd064d4309181d96d7245e757ad5e4e2d2f84c2'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Критерий 6.2: тесты исходника на реальном контенте переписаны на фикстуры демо или
остаются референсом паритета 9.3. Восемь тестов конфига и файловых контрактов в ядро не перенесены,
поэтому загрузчик конфига, схемы privacy и SEO, путь страницы прав, парсер свежести перевода, шрифты
темы, SVG логотипов и правила редиректов ядра проверены хуже, чем в исходнике.

**Approach:** Часть A5a истории 6.2 (решение владельца 2026-10-29: A5 = A5a + A5b + A5c). Тесты
переносятся в ядро и читают демо через `siteRoot`, файлы ядра — через `CORE_ROOT`, временные сайты —
через `mkdtemp`; ожидаемые значения выводятся из конфига демо, а не пинятся. Тест реального
`_redirects` исходника остаётся там референсом 9.3.

## Boundaries & Constraints

**Always:** Тесты в `pnpm check` (проект `core` в `packages/core/vitest.config.ts`). Ни
`process.cwd()`, ни путей исходного сайта, ни его контента (slug'ов, текстов, адресов) — только демо и
синтетика (AD-22). Ожидаемое из конфига и словарей демо (AD-21). Если тест исходника проверял
поведение, которого в ядре нет, — тест не переносится, причина в Implementation Notes.

**Never:** Не менять код ядра ради прохождения теста; найденный дефект — в Implementation Notes и
находкой ревью. Не трогать исходный сайт. Не переносить A5b/A5c. Не добавлять демо контент сверх
необходимого тесту.

</frozen-after-approval>

## Code Map

- Источники — `$REFERENCE_SITE_ROOT/src/<путь>.test.ts` (только чтение): `config/loader` (166 строк;
  `:62` читает `site.yaml` через `process.cwd()`), `config/privacy` (58), `config/seo` (32),
  `lib/content/rights-route` (27; `config/images.yaml` и `pages/rights.astro` через `process.cwd()`),
  `lib/content/translation-freshness` (135; паритет парсеров по `articles/` и `pages/`, требует `.md` и
  `.mdx` в каждой папке), `theme/fonts` (145; `theme.css` и `public/fonts` от `import.meta.url`),
  `components/site-logo` (54; `assets/brand/*.svg`), `lib/redirects/contract` (247; один случай читает
  реальный `public/_redirects` — не переносится).
- Модули ядра (те же пути в `packages/core/src/`): `config/loader.ts`, `config/site.ts`/`seo.ts`,
  `lib/content/routes.ts` (`RIGHTS_PATH`), `pages/rights.astro`, `lib/content/translation-freshness.ts`,
  `theme/fonts.ts`, `components/site-logo.astro`, `lib/redirects/contract.ts`.
- Слияния: `config/privacy` и `config/seo` — в `config/site.test.ts` или рядом (`config/seo.test.ts`);
  `rights-route` — в `lib/content/routes.test.ts`; остальные — одноимённые новые `*.test.ts`.
- Приёмы ядра: `siteRoot` (`config/site-root.ts`), `CORE_ROOT` (`core-root.ts`), синглтон конфига —
  `vi.mock('../config/site.ts')` + `buildSiteConfig()` (`config/fixtures/site-config.ts`, пример
  `components/portfolio/components.test.ts`), временный сайт — `mkdtempSync` (пример
  `lib/featured-home.test.ts`, `lib/site-files.test.ts`).
- Демо: `src/config/{site,seo}.yaml` (privacy.controller, social, описания en/ru), `config/images.yaml`
  (`rights.webStatement` → `/rights/`), `src/theme/theme.css` (10 `@font-face`), `public/fonts/ubuntu/`
  (10 woff2 + `UFL.txt` — сверять только `.woff2`), `src/assets/brand/{brand,menu}-logo.svg` (сверить id
  фрагментов и `fill="currentColor"`), статьи только `.md`, страницы `.md` и `.mdx`, `_redirects` нет.
- `packages/core/vitest.no-brand.config.ts` — проект без логотипов; тест `site-logo` — в обычном проекте.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/config/loader.test.ts` -- перенос; `process.cwd()` → `siteRoot`, ширины раскладки
  — из `site.yaml` демо.
- [x] `config/site.test.ts` (или `config/seo.test.ts`) -- случаи `privacy` и `seo`; локали — из
  `site.content.locales`.
- [x] `lib/content/routes.test.ts` -- случаи `rights-route` через `siteRoot` и `CORE_ROOT`.
- [x] `lib/content/translation-freshness.test.ts` -- перенос; требование форматов — «оба формата во всём
  корпусе демо», а не в каждой папке.
- [x] `theme/fonts.test.ts` -- перенос на `theme.css` и `public/fonts` демо, только `.woff2`.
- [x] `components/site-logo.test.ts` -- перенос на SVG демо.
- [x] `lib/redirects/contract.test.ts` -- перенос правил и снимка в памяти, без реального файла.
- [x] `deferred-work.md` (A5 — `partial_by`), `sprint-status.yaml` -- учёт.

**Acceptance Criteria:**
- [x] `pnpm check`, `pnpm build` проходят; восемь тестов (или их случаи в целевых файлах) входят в
  проект `core`.
- [x] `rg -n "process\.cwd\(\)" <перенесённые тесты>` пуст; `pnpm check:identity` зелёный.
- [x] Каждый не перенесённый случай назван в Implementation Notes с причиной.

## Verification

**Commands:**
- `pnpm check`, `pnpm build` -- expected: зелёные.

## Implementation Notes

- Размещение: `config/privacy` — блок `privacy controller` в `config/site.test.ts` поверх тестового
  конфига (`buildSiteConfig`), как весь файл; локали подписи соцссылки — из его `content.locales`.
  `config/seo` — новый `config/seo.test.ts` на синглтоне `seo` демо, ключи описания сверяются с
  `site.content.locales` демо. `rights-route` — два случая в `lib/content/routes.test.ts`: `webStatement`
  через `loadImageConfig(siteRoot)`, страница — `CORE_ROOT/src/pages/rights.astro` без
  `[locale]/rights(.astro)`. Код ядра не менялся; `pnpm check` (1541 тест) и `pnpm build` зелёные.
- `loader`: случай ADR-0008 с пином 680/960/1200/1440 заменён сверкой `loadSiteSection(siteRoot,
  'layout')` с `layout` из сырого `site.yaml` демо; остальное — синтетика в `mkdtemp`.
- `translation-freshness`: паритет парсеров по `articles/` и `pages/` демо, имена файлов — по
  `LOCALE_FILE_PATTERN` ядра вместо литерала `en|ru`; оба формата требуются в объединённом корпусе (у
  статей демо только `.md`). Формулировки «RU/EN» заменены на опорную локаль и перевод.
- `fonts`: имена семейств и префиксы файлов не пинятся — семейство письменности выводится из файлов,
  которые отдаёт `fontPreloads`, письменности — из `LOCALE_CATALOG`; сверка `public/fonts` — только
  `.woff2` (`UFL.txt` вне сверки). Суффиксы граней (`regular`, `700`…) остаются контрактом: на них
  опирается `PRELOADED_FACES` ядра.
- `site-logo`: рендер обоих вариантов как внешних `<use>` без `<path>`; новый случай — каждый `id` из SVG
  демо есть среди фрагментов компонента; бюджет 75 KiB и `fill="currentColor"` — на SVG демо.
- `redirects/contract`: правила и снимок в памяти перенесены без изменений. **Не перенесён** случай
  «matches the current published route contract and the deployed redirect file»: он читает реальный
  `public/_redirects` исходника и пинит его 15 источников (slug'и исходного сайта) — остаётся референсом
  9.3 в исходнике. Взамен — случай на демо: правило корня из локали по умолчанию демо проходит
  `validateRedirects` против маршрутов снимка демо (`_redirects` у демо нет).
- Находка для ревью (код ядра не менялся): `site-logo.astro` ссылается на пять фрагментов бренд-логотипа
  (`brand-background-left`, `brand-background-right`, `brand-outline`, `brand-photography`,
  `brand-signature`), а `brand-logo.svg` демо объявляет два (`brand-outline`, `brand-signature`) —
  три `<use>` ничего не рисуют. Набор `id` зашит в компоненте и не документирован как контракт файла
  сайта; тест проверяет только обратное направление (SVG ⊆ компонент). Варианты: документировать набор
  как контракт и дополнить SVG демо; допустить частичный набор (текущее поведение); выводить фрагменты
  из SVG при сборке. Решение — к 6.5 (точки визуальной замены).
- `pnpm check` в песочнице падает на `scripts/check-taxonomy-readers.test.ts` и других тестах с
  `git init` во временном каталоге (запрет записи `.git/hooks`); вне песочницы зелёный — к изменению
  не относится.

## Spec Change Log

## Review Triage Log

Проход 1 (Codex: blind, edge-case, verification-gap; diff от `ddd064d`). Verification-gap — пробелов
нет.

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| B1+E1 | `site-logo.astro` ссылается на три фрагмента, которых нет в SVG демо; тест сверяет одно направление | medium | пять `<use>` в компоненте против двух `id` в `demo/src/assets/brand/brand-logo.svg` — три ничего не рисуют; поведение существовало до переноса, контракт файла сайта не задан, а правка кода ядра вне этой части | defer — 6.5 (точки визуальной замены) |
| B3+E3 | Разбор `format()` понимает только одинарные кавычки, пустой список форматов проходит `.every()` | low | `fonts.test.ts` — `/format\('([^']+)'\)/`; `format("woff")` даёт `[]` и проходит | patch — обе кавычки и число форматов равно числу `url()` |
| B5+E2 | Паритет парсеров читает только верхний уровень папок, загрузчик ядра — рекурсивно | low | `readdir(directory)` без `recursive`; вложенный документ выпал бы из проверки | patch — рекурсивный обход `.md`/`.mdx` |
| B6 | Дайджест проверяется только форматом, без известного вектора | low | `digestTranslationSource('hello')` сверяется регэкспом 64 hex; смена алгоритма прошла бы, а сохранённые маркеры `translatedFromDigest` стали бы недействительны | patch — известный sha256 вектора |
| B8 | Черновик и исключённая `home` проверены только на отсутствие в `published` | low | `contract.test.ts` — нет утверждений по `unlisted`; ошибочное попадание в `unlisted` позволило бы одобрить редирект на несуществующую страницу | patch — отсутствие и в `unlisted` |
| B2+E4 | Семейство шрифта выводится из `fontPreloads`, привязки `--font-sans` не проверены | low | тест исходника `--font-sans` не проверял (`rg font-sans` по нему пуст); привязку семейства к странице задаёт тема сайта (`theme.css:175,230`), её видимый результат закрепляют визуальные эталоны части D | reject |
| B4 | Две предзагрузки могут быть дублями или не теми гранями | false | `fontPreloads` строит имена из постоянного `PRELOADED_FACES` (`theme/fonts.ts:16-17`) — набор граней и их различие заданы конструкцией | reject |
| B7 | Одобрение `unlisted` может «протечь» на следующие правила | false | флаг перезаписывается на каждой строке-комментарии (`contract.ts:102`) и сбрасывается на правиле (`contract.ts:109`) | reject |
