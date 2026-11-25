# Deferred Work

Спеки эпиков 1–5 (`spec-1-*`…`spec-5-*`, `spec-epic-*`, `spec-pre-core-fixes`), их контексты и closeout, а также
документы сайта из `docs/` (бриф, аудит, архитектура, роадмап, RUNBOOK, `migration/`, `plans/`, `reference/`,
legacy-аудиты, авторский голос, CSS-бюджет и замеры CI) — в репо сайта.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-remove-dead-code.md`
  summary: Комментарий `src/lib/content/factcheck.ts:272-279` и «Поправка к инварианту переочереди ресёрча» в ADR-0011 описывают обновление factcheck-digest на месте с маркерами `appliedAt`/`appliedDigest`, которых не существует (Story 1.2, EH-16).
  evidence: `.claude/skills/factcheck-apply/SKILL.md:14,70` прямо говорит «no `appliedAt`/`appliedDigest`, no digest refresh»; инструмент `refresh-factcheck-digest` удалён в Story 1.1, ложь существовала и до неё.
  closed_by: spec-1-2-fix-false-docs-and-comments.md
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-remove-dead-code.md`
  summary: EH-06 (`scripts/refresh-translation-digest.ts`, алиас `content:translations:refresh-digest`) не удалён в Story 1.1 и решается вместе с изоляцией миграционной зоны (Story 2.4).
  evidence: он переписывает `sourceDigest` в `data/migration/import-translations.yaml`, который проверяет `content:translations:check`, и на него опирается errata-петля ADR-0011 / `docs/08` шаг 4; замена на `translation-marker:confirm` неверна — тот пишет другое поле (`translatedFromDigest`).
  closed_by: spec-2-4-isolate-migration-zone.md
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-fix-false-docs-and-comments.md`
  summary: Удалить мёртвые поля `decision.appliedAt`/`decision.appliedDigest` (схема, superRefine, `applied-digest-mismatch`/`applied-not-accepted` в `verifyFactcheck`), счётчик `applied` в `FactcheckCounts` и суффикс `applied:` в `factcheck-review.ts` вместе с их тестами — в Story 2.1 (фактчек на `src/content`).
  evidence: `.claude/skills/factcheck-apply/SKILL.md:14,70` — идемпотентность контентная, маркеры никто не ставит; в Story 1.2 исправлен только текст (комментарии, строка отчёта, ADR-0011), код и схема оставлены по границам истории.
  closed_by: spec-2-1-factcheck-on-src-content.md
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-fix-false-docs-and-comments.md`
  summary: Errata-раздел `docs/08-content-model.md` (≈254-282) всё ещё предписывает править RU в `data/legacy/normalized/*.jsonl` и перегенерировать `src/content` через `content:import:full`, что противоречит ADR-0012 (рабочий режим: `src/content` правится напрямую) — переписать или пометить как режим ре-bootstrap в Story 2.4.
  evidence: противоречие существовало до Story 1.2; решение в её спеке ограничило правку раздела утверждениями о гейтах; найдено ревью прохода 1 (blind hunter).
  closed_by: spec-2-4-isolate-migration-zone.md
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-build-once-in-ci.md`
  summary: Деплой не проверяет, что `vars.PUBLIC_TURNSTILE_SITE_KEY` непуст: пустой ключ даёт production-форму, которая отвечает «challenge», а contact-e2e это не ловит (спек подменяет Turnstile-скрипт и не смотрит на `sitekey`) — добавить fail-closed проверку ключа в `gates` перед загрузкой артефакта.
  evidence: до Story 1.4 `deploy` собирал с той же переменной без проверки, а contact-e2e шёл на тестовом ключе — пробел существовал раньше; найдено ревью прохода 1 (blind hunter).
  closed_by: spec-epic-1-deferred-fixes.md
- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-enforce-style-rules-in-eslint.md`
  summary: Используемые `eslint-disable` по-прежнему подавляют ошибки; правило AGENTS.md «не подавлять» не исполняемое (кандидат — `linterOptions.noInlineConfig: true`).
  evidence: Codex-ревью 1.5 — `// eslint-disable-next-line @typescript-eslint/no-explicit-any` перед `export type Unsafe = any` проходит `lint:ci`; в репо сейчас нет ни одного `eslint-disable`, AC 1.5 требовал только ошибку для неиспользуемых директив, так что это расширение сверх истории (решение владельца).
  closed_by: spec-epic-1-deferred-fixes.md
- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-factcheck-on-src-content.md`
  summary: Управляемые `:::note`-заметки в ballheads, filters, photogear стоят перед блоком `:::links`, поэтому `analyzeNoteRegion` (`src/lib/content/errata-edit.ts:540`) считает регион повреждённым и `stripManagedNoteRegion` ничего не вырезает — правка заметки меняет digest перевода и фактчека, а `/factcheck-apply` не может безопасно редактировать регион.
  evidence: прогон `stripManagedNoteRegion` на трёх RU-телах возвращает исходную длину (18399/14022/14677); дефект появился, когда `:::links` стал ставиться после заметок, и затрагивает свежесть переводов независимо от истории 2.1.
  closed_by: spec-epic-2-deferred-fixes.md
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-live-data-by-reader.md`
  summary: Команды `masters:match --tracked-output data/images/masters.jsonl` в `docs/migration/s6-runbook.md` и `s6-master-reconciliation.md` перезаписывают реестр целиком и потеряют new-строки мастеров, зарегистрированных `/add-album`.
  evidence: `scripts/match-masters.ts` пишет tracked-output целиком из WordPress-сопоставления; так было и до переименования; решать в 2.4 при переносе `match-masters` в `migration/` (писать предложения отдельно или сливать с сохранением new-строк).
  closed_by: spec-epic-2-deferred-fixes.md
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-isolate-migration-zone.md`
  summary: `content:import:full --check` не проходит в рабочем режиме (ADR-0012): ожидаемая full-проекция расходится с отредактированным `src/content` (дрейф отчёта `docs/migration/s12-import-report.md` / `migration/data/s12-import-report.json`, `sunrises-for.yaml`, статей) и ссылается на отсутствующие документы (например `src/content/articles/anime.en.md`), а `content:decisions:check` — на расхождении `docs/migration/s12-content-review.md`; починить full `--check` под рабочий режим (или переопределить его роль в `import-wp`).
  evidence: на `baseline_commit` b76b5c4 и после переноса набор дрейфов/отсутствующих файлов full `--check` совпадает поэлементно (45 строк, отличается только путь отчёта), сгенерированные артефакты байт-идентичны; после переноса первой ошибкой стал `docs/migration/s12-import-report.md`, потому что новый путь `migration/data/…` сортируется после `docs/…`.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-isolate-migration-zone.md`
  summary: `docs/design/authorial-voice.md` направляет редактуру описаний и переводов в миграционные overlay (`migration/data/s10-publication-input.yaml`, `import-translations.yaml`) и запрещает правку published YAML, что противоречит ADR-0012 и skill `/translate`.
  evidence: Codex-ревью 2.4 (blind); текст был таким до переноса, история меняла только пути.
  closed_by: spec-epic-2-deferred-fixes.md
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-isolate-migration-zone.md`
  summary: Раздел ownership в `docs/08-content-model.md` (~254) безусловно запрещает ручную правку importer-owned файлов; нужно ограничить его режимом ре-bootstrap.
  evidence: Codex-ревью 2.4 (blind); формулировка до переноса противоречит рабочему режиму ADR-0012.
  closed_by: spec-epic-2-deferred-fixes.md
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-isolate-migration-zone.md`
  summary: В errata-процедуре `docs/08-content-model.md` и ADR-0011 `content:import:full` стоит до починки `sourceDigest` перевода; если импортёр отвергает approved-перевод с протухшим digest, порядок шагов неверен (medium, не проверено).
  evidence: Codex-ревью 2.4 (blind); решит прогон `verifyTranslation` (`migration/lib/translations.ts`) на approved-переводе после правки RU-тела.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-isolate-migration-zone.md`
  summary: `docs/08-content-model.md:157` помещает `locationAliases`/`locationDrops` в `s8-content-map.yaml`, хотя с S12/2 они в `migration/data/taxonomy-aliases.yaml`.
  evidence: Codex-ревью 2.4 (blind); `migration/data/s8-content-map.yaml` в конце сам отсылает к `taxonomy-aliases.yaml`.
  closed_by: spec-epic-2-deferred-fixes.md
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-isolate-migration-zone.md`
  summary: Генераторы review-пакетов и отчётов импорта пишут старые пути `data/migration/…` (`migration/lib/translation-review.ts:130`, `migration/lib/decisions-review.ts:50`, `migration/scripts/import-content.ts:285,442`); исправить при выносе migrate-wp вместе с регенерацией `docs/migration/*`.
  evidence: Codex-ревью 2.4 (edge); правка меняет вывод импортёра и tracked-доки, что история 2.4 запрещала.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-isolate-migration-zone.md`
  summary: `loadContentInventory` (`migration/lib/content-inventory.ts`) не покрыт тестом загрузки из перенесённых путей; откат путей ловится только ручным `content:decisions:check`.
  evidence: Codex-ревью 2.4 (verification-gap); тесты решений строят inventory вручную (`migration/lib/decisions.test.ts:12`).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-derived-fields-via-commands.md`
  summary: `content:factcheck:merge` сохраняет `decision: accepted`, даже когда повторный ресёрч меняет `recommendation` находки, и `/factcheck-apply` может применить рекомендацию, которую владелец не принимал; нужно решение владельца: сбрасывать решение в `open` при смене `recommendationDigest` или отклонять такой merge (medium).
  evidence: Codex-ревью 3.3 (blind + edge); `mergeResearchFindings` (`src/lib/content/factcheck.ts`) берёт `current.decision` без сравнения рекомендаций. Ручной протокол до истории вёл себя так же («preserving its id and decision»), а замороженный Intent 3.3 запрещает `merge` менять `decision`.
  closed_by: spec-3-3-derived-fields-via-commands.md
- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-derived-fields-via-commands.md`
  summary: Вступление review-пакета (`src/lib/content/factcheck-review.ts:119`, `docs/…/factcheck-review`) велит владельцу принимать находки правкой ledger, а теперь решения записывает `content:factcheck:decide`; обновить текст и перегенерировать пакет.
  evidence: Codex-ревью 3.3 (blind); замороженный Intent 3.3 запрещал трогать писатель пакета и сам пакет.
  closed_by: spec-3-3-derived-fields-via-commands.md
- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-locales-from-config.md`
  summary: Формы данных по локалям (`localizedTextSchema {en, ru}` в схемах контента, `privacy`, `seo-schema`, `taxonomy-resolve`, заголовки блоков `note`/`links`, `CHAR_WIDTH_PX` в `album-intro.ts`) сделать записями по локалям из конфига, чтобы одноязычный сайт не заполнял вторую локаль.
  evidence: решение владельца по 4.2 (вопрос 3, вариант B): схемы-фабрики и передача конфига в `content.config.ts` примерно удваивают историю; в 4.2 убираются только списки, роли и умолчания локалей.
  partial_by: spec-6-10a-localized-data-shapes.md -- схемы альбомов, фото, таксономии и `featured/home.yaml` строятся от `content.locales` lock (запись ровно по активным локалям, версии 2), `privacy.controller.name` и `seo.description` — подписи `site.yaml` со строгой проверкой (`schemaVersion` 4), `taxonomy-resolve` и `portfolio/locale.ts` без ключей `en`/`ru`, заголовки `note`/`links` — ключи словарей `note.title`/`links.title`, ширина глифа `CHAR_WIDTH_PX` — поле `charWidthPx` в `LOCALE_CATALOG`; правило ESLint запрещает ключи и чтение `en`/`ru` вне слоя конфига, объявлений поставляемых словарей и тестов.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-locales-from-config.md`
  summary: Полная сборка фикстуры с одной локалью (AC эпика «тестовая фикстура с одной локалью собирается») и производный от конфига редирект корня `public/_redirects` (`/` → `/en/`) — в 4.3, когда маршруты строятся по списку локалей.
  evidence: решение владельца по 4.2 (вопрос 4, вариант A): пока стоят деревья `src/pages/{en,ru}`, сборка с `locales: [ru]` всё равно выпускает `/en/…`; в 4.2 одна локаль проверяется тестами `lib` и SEO-артефакта.
  partial_by: spec-4-3-single-localized-route-set.md (сборка с одной локалью — `pnpm build:one-locale`; редирект `public/_redirects` остаётся за 4.4)
  closed_by: spec-4-4-site-origin-from-config.md
- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-locales-from-config.md`
  summary: Представление `/status/` двуязычно по построению: английский текст при `lang` локали по умолчанию (на сайте с `ru` первой — `lang="ru"`), подписи «EN translation» при любой опорной локали, а на одноязычном сайте документы считаются «актуальными переводами»; решить язык нейтральных маршрутов и подписи свежести по локали перевода.
  evidence: Codex-ревью 4.2 (blind #6–8, vgap-other): `src/components/status/site-status.astro:119,124,130`, `src/lib/status/build-data.ts` `documentFreshness`; на этом сайте (`en` первая, опорная `ru`) вывод не меняется, проявится на сайтах №2 и №3.
  closed_by: spec-epic-4-deferred-fixes.md
- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-site-origin-from-config.md`
  summary: Выводить `rights.webStatement` (`<origin>/rights/`) и `rights.source` в `config/images.yaml` из `origin` в `site.yaml` (AD-6 «URL прав в метаданных изображений выводятся из конфига»), чтобы домен сайта задавался в одном месте.
  evidence: в 4.4 `config/images.yaml` не тронут: оба значения вшиты в XMP выложенных деривативов, а вывод из `origin` может изменить `configDigest` и потребовать перевыпуска изображений; сначала проверить, меняется ли digest при том же итоговом значении. Сейчас согласованность держит `src/lib/content/rights-route.test.ts`. По смыслу — эпик 6 (гейт идентичности ядра).
  closed_by: spec-6-4d-rights-from-origin.md -- `images.rights.source` и `webStatement` выводятся из `origin` (хост и `<origin>/rights/`), явное значение побеждает; resolve пишет их в lock, хеш при тех же значениях прежний, проверено на демо и на реальном конфиге.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-5-menu-socials-and-legal-text-in-config.md`
  summary: `e2e/navigation.spec.ts` пинит реальные значения конфига — заголовок сайта «<имя владельца> Photography» и подписи «Articles»/«Portfolio»; выводить их из `identity.title` и `menu.items`, как уже сделано в `e2e/helpers.ts`.
  evidence: Codex-ревью 4.5 (blind #8): `e2e/navigation.spec.ts:16,128,141,159`; так было и до 4.5 (`git show 03cdc9c:e2e/navigation.spec.ts`), правка заголовка или подписей в `site.yaml` уронит e2e. Нарушает правило AGENTS.md «не пинить значения site.yaml в тестах».
  closed_by: spec-epic-4-deferred-fixes.md
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-4-deferred-fixes.md`
  summary: Тест смены языка в `e2e/navigation.spec.ts` ищет переключатель в шапке на desktop независимо от `menu.lang`; при допустимом `menu.lang: off` на двуязычном сайте e2e падает — учитывать режим из конфига или идти через переключатель в футере.
  evidence: Codex-ревью epic-4-deferred-fixes (blind #4); так было и до правки (`git show 4d1a779:e2e/navigation.spec.ts`, `switchLanguageVia` — `getByRole('banner')`), `site-header.astro:171` не рендерит переключатель при `menu.lang === 'off'`.
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-4-deferred-fixes.md`
  summary: `RouteDef.labels` в `e2e/helpers.ts` типизирован как полный `Record<Locale, string>`, хотя содержит только активные локали, а `e2e/inner.spec.ts:216-221` читает `labels.en` литералом — на сайте без `en` подпись будет `undefined`; сделать e2e-хелперы честно частичными и убрать `.en` из `inner.spec.ts`.
  evidence: Codex-ревью epic-4-deferred-fixes (blind #5); до правки на таком сайте `localizedLabel` бросал при загрузке модуля, сейчас тип врёт молча; `inner.spec.ts` вне границ спека (правка других e2e-спеков запрещена).
  closed_by: spec-6-2-d1-demo-functional-e2e.md -- в ядре `RouteDef.labels` — `PerLocale` (частичный, только активные локали), подписи читаются через `textFor`, который падает на неактивной локали; литералов локалей в `e2e/` нет (правило ESLint), одна локаль проверена юнит-тестом `e2e/helpers.test.ts`.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-measure-css-and-drop-dead-rules.md`
  summary: Минификатор сливает `animation` и `animation-timeline` в один shorthand, который Chrome 155 отбрасывает — в продовой сборке не работают scroll-fade логотипа и параллакс верхней секции.
  evidence: найдено при замере 5.1 — `getComputedStyle(...).animationName === 'none'` на `.scroll-fade-logo` и `.top-section--parallax` в собранном `dist`; вне объёма 5.1 (замер, не правка живых правил).
  closed_by: spec-5-1-fix-animation-timeline-shorthand.md
- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-measure-css-and-drop-dead-rules.md`
  summary: Правила `.prose .more-documents…` не совпадают на реальных страницах (MoreDocuments рендерится вне `.prose`), их держит только `src/pages/e2e-harness/[view].astro` — решить, удалить правила или поправить харнесс.
  evidence: отчёт `pnpm css:coverage` — несовпавшие во всех сборках замера (харнесс в замер не входит); оставлены по правилу «путь в коде существует» до решения владельца.
  closed_by: spec-5-8-restore-broken-contracts-before-extraction.md
- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-split-css-shell-components.md`
  summary: В меню при `prefers-reduced-motion: reduce` hover/focus эффектов всё ещё сдвигает и масштабирует подпись — сброс проигрывает селекторам эффектов по специфичности.
  evidence: Codex-ревью 5.4 (blind B1): сброс `nav[aria-label='Primary'].anim-links .top-menu-label` (0,3,1) в `src/components/site-nav.css` против hover-правил эффектов (0,5,1); так было и на `ea40e23`. Чинить в 5.6 вместе с выделением эффектов.
  closed_by: spec-5-8-restore-broken-contracts-before-extraction.md
- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-split-css-shell-components.md`
  summary: При `prefers-reduced-motion: reduce` свап иконка↔логотип в приклеенной шапке сохраняет сдвиг и задержки.
  evidence: Codex-ревью 5.4 (blind B2): сброс `.site-header__logo--swap > …` (0,2,0) проигрывает `.site-header[data-stuck] .site-header__logo--swap > …` (0,4,0) в `src/components/site-header.css`; так было и на `ea40e23`.
  closed_by: spec-5-8-restore-broken-contracts-before-extraction.md
- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-split-css-shell-components.md`
  summary: Стрелки слайдера главной на hover остаются с opacity 0.55, а не 1.
  evidence: Codex-ревью 5.4 (blind B4): `.hero-fullscreen:hover .zu-hero-swiper .swiper-button-*` (0,4,0) бьёт `.zu-hero-swiper .swiper-button-*:hover` (0,3,0) в `src/components/hero-slider.css`; так было и на `ea40e23`. Проверить по легаси, задумано ли.
  closed_by: spec-5-8-restore-broken-contracts-before-extraction.md
- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-split-css-shell-components.md`
  summary: Полноэкранное меню может не прокручиваться, когда пункты не помещаются в низкий или увеличенный вьюпорт (не проверено, предполагаемая серьёзность medium).
  evidence: Codex-ревью 5.4 (blind B3), не проверено: открыть меню на вьюпорте ~360px высотой или при зуме 200% и проверить доступность последних пунктов.
  previous_deferred_to: Story 5.12 (меню на нативном скрипте) -- подтверждено в spec-5-8-restore-broken-contracts-before-extraction.md: `.menu-overlay-panel` — `position: fixed; inset: 0` с центрированием и без `overflow-y`, содержимое 385px; при высоте 300px (телефон в альбомной ориентации, зум 200%) верх и низ меню обрезаны и недостижимы. Правка меняет вывод, а 5.12 переписывает это меню.
  deferred_to: BK15 — docs/backlog/bk15-menu-short-viewport.md; перенос меню 5.12 сохранил геометрию, исправление остаётся открытым.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-split-css-shell-components.md`
  summary: Inset-тень верхней секции (`shadow: true`) может перекрываться непрозрачной картинкой (не проверено, предполагаемая серьёзность medium).
  evidence: Codex-ревью 5.4 (blind B5), не проверено: сравнить собранную страницу альбома при `shadow: true` и `false`.
  deferred_to: Story 6.2 (эталоны ядра в обеих темах) -- подтверждено в spec-5-8-restore-broken-contracts-before-extraction.md: inset-тень висит на `.top-section__bg`, а непрозрачный `<img>` (`object-fit: cover`) закрывает её целиком, тень не видна. Починка (тень поверх картинки) меняет каждый баннер и все эталоны с ним — только с подтверждением владельца, вместе с пересъёмкой эталонов.
  closed_by: spec-6-2-d2-visual-baselines.md -- решение владельца 2026-10-30 (вариант «б»): тень не чинится в D2, эталоны фиксируют баннер без видимой тени; починка вынесена в BK18 — docs/backlog/bk18-banner-inset-shadow.md, с отдельной пересъёмкой эталонов.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-split-css-shell-components.md`
  summary: В полноэкранном меню нет маркера текущей страницы в покое, только на hover (не проверено, предполагаемая серьёзность medium).
  evidence: Codex-ревью 5.4 (blind B6), не проверено: сверить с легаси-темой (`_menu.scss`), был ли маркер в оригинале.
  closed_by: spec-5-8-restore-broken-contracts-before-extraction.md -- не дефект: в легаси (`sass/basic/_menu.scss`, блок `.mx-menu`) у пунктов полноэкранного меню нет стиля текущей страницы, только цвет ссылки; поведение совпадает.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-split-css-shell-components.md`
  summary: Гамбургер в светлой теме окрашен `--color-surface` (#ededed) и может теряться на белом фоне (не проверено, предполагаемая серьёзность medium).
  evidence: Codex-ревью 5.4 (blind B7), не проверено: замер контраста гамбургера на внутренней странице <1024px в светлой теме.
  previous_deferred_to: Story 5.12 (меню на нативном скрипте) -- подтверждено в spec-5-8-restore-broken-contracts-before-extraction.md: в светлой теме полоски `#fff` на белой странице (~1:1), а в легаси на светлом они `$darker-color` (`$mx-menu-bar-color-on-light`). Правка меняет светлый вид внутренних страниц <1024px — с подтверждением владельца вместе с переделкой меню.
  deferred_to: BK16 — docs/backlog/bk16-menu-light-contrast.md; нативный перенос 5.12 сохранил цвета, исправление остаётся открытым.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-split-css-shell-components.md`
  summary: Копирайт в подвале может иметь контраст ниже WCAG в обеих темах (не проверено, предполагаемая серьёзность medium).
  evidence: Codex-ревью 5.4 (blind B8), не проверено: замер контраста `.site-footer__copyright` в обеих темах; цвета перенесены из легаси.
  deferred_to: Story 6.5 (контракт токенов темы) -- проверено в spec-5-8-restore-broken-contracts-before-extraction.md: тёмная тема 5.94:1 (норма), светлая — `rgb(157,157,157)` на `rgb(237,237,237)` 2.32:1, ниже WCAG AA 4.5:1. Цвета из легаси; новое значение токена — решение владельца, светлая тема станет настройкой в 6.5.
  closed_by: spec-6-5b-theme-tokens.md -- решение сайта: тема — файл сайта, ядро за контраст не отвечает (решение владельца 2026-11-12); светлая тема демо и визуальные эталоны не меняются, значение для эталонного сайта выбирается в 9.3.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-8-restore-broken-contracts-before-extraction.md`
  summary: `reuse` требует совпадения дерева head PR с деревом merge — PR, отстающий от `main`, не переиспользуется, даже когда его прогон записал ровно то дерево, что попало в `main`.
  evidence: Codex-ревью 5.8 (blind #1): предпроверка в `scripts/lib/ci-reuse.ts` существовала до 5.8; убрать её и полагаться на артефакт `tested-tree-*` (тест на отстающую ветку). Вред — лишний полный прогон, не пропуск проверки.
  deferred_to: Story 6.8 — оптимизация reuse при переносе CI ядра; сейчас предпроверка консервативна, ложного пропуска проверок нет.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-8-restore-broken-contracts-before-extraction.md`
  summary: Границы импорта на `no-restricted-imports` не ловят динамический `import()` — ни `migration/`, ни новое правило «`src/lib` не импортирует `src/components`».
  evidence: Codex-ревью 5.8 (blind #2, edge #12): `export const load = () => import('../components/x.astro')` в `src/lib` проходит lint. Чинить одним механизмом для всех границ в 5.9 (R10), с регрессионными кейсами в `scripts/eslint-config.test.ts`.
  closed_by: spec-5-9a-source-gates-in-check.md
- source_spec: `_bmad-output/implementation-artifacts/spec-5-8-restore-broken-contracts-before-extraction.md`
  summary: Сброс reduced-motion для swap иконка↔логотип в приклеенной шапке (`site-header.css`) ничем не проверяется.
  evidence: Codex-ревью 5.8 (vgap #15): в реальном `site.yaml` `sectionIcon: off`, swap не рендерится; e2e-проверка (смещение 0 и нулевые transition до и после `[data-stuck]`) возможна только на сборке с альтернативным конфигом из 5.9 (R19).
  deferred_to: Story 6.2 — браузерный тест на синтетическом демо с включённой sectionIcon; CSS-проверка альтернативных вариантов не доказывает reduced-motion поведение.
  closed_by: spec-6-2-d2-visual-baselines.md -- демо включает `menu.sectionIcon`; `e2e/header-swap.spec.ts` на ширинах ≥1024 проверяет, что иконка и логотип отрендерены, и при `reducedMotion: 'reduce'` у обоих `transition-duration` 0s и `left` 0 до и после `[data-stuck]` (смена мгновенная); удаление `left` или `transition` из сброса `site-header.css` роняет тест.

- source_spec: none
  summary: Story 5.9, часть B — CSS-гейты: `check:css-layers` в `pnpm check` (правило вне слоя, `layers.css` не первым), бюджет CSS на четырёх страницах `dist` по `docs/design/css-baseline.md`, CI-сборка с альтернативным конфигом — в `dist` ровно выбранные варианты (R16, R18, R19).
  evidence: 5.9 разделена владельцем на четыре спека A–D на ветке `refactor/5-9-turn-one-off-checks-into-gates`; часть B независима от A, но правит `ci.yml` вместе с C — делать после C или до неё, не параллельно.
  closed_by: spec-5-9b-css-gates.md
- source_spec: none
  summary: Story 5.9, часть C — строгость CI-раннеров: медиана Lighthouse, `failOnFlakyTests`, сравнение эталонов portfolio/gallery в CI, убрать `--passWithNoTests`, `ci.yml` и `.nvmrc` в ключе Lighthouse, `content:factcheck:check` и `extract --check` в CI с предупреждением на устаревший digest (F1, F2, F3, F10, F11, R9).
  evidence: 5.9 разделена владельцем на четыре спека A–D; часть C — отдельный PR-размер, пересекается с B только по `ci.yml`.
  closed_by: spec-5-9c-strict-ci-runners.md
  closure_evidence: Завершённые Execution/Verification и регрессии scripts/ci-config.test.ts; метка синхронизирована при закрытии эпика 2026-10-24.

- source_spec: none
  summary: Story 5.9, часть D — сканеры: commit-msg проверяет форму заголовка и тип, ловит больше шаблонов атрибуции и прогоняется в CI по коммитам PR; `check:local-paths` ловит `~/`, Windows-пути и экранированные слэши; `check:production-build` сканирует все текстовые файлы и страницы (F4, F6, F7).
  evidence: 5.9 разделена владельцем на четыре спека A–D; часть D не зависит от A–C.
  closed_by: spec-5-9d-scanners.md
- source_spec: `_bmad-output/implementation-artifacts/spec-5-9a-source-gates-in-check.md`
  summary: Гейт «`global.css` импортирует сгенерированные layout-токены» — вернуть в части B истории 5.9 (CSS-гейты).
  evidence: spec-5-8 (S7) удалила блок `tracked artifact` из `src/lib/layout-tokens.test.ts` с пометкой «вернётся гейтом в 5.9»; проверка относится к CSS, а не к гейтам исходников части A.
  closed_by: spec-5-9b-css-gates.md
- source_spec: `_bmad-output/implementation-artifacts/spec-5-10-translate-code-comments-to-english.md`
  summary: Tailwind (`@import 'tailwindcss'` в `src/styles/global.css` без `source(...)`) берёт кандидаты классов из всех файлов проекта, включая `_bmad-output`, `docs/` и комментарии, поэтому правка спека или документа меняет CSS сайта; ограничить источники `source(...)`/`@source` каталогом `src` (без `src/content`, если там нет классов).
  evidence: в 5.10 упоминание имени flex-утилиты в Implementation Notes спека добавило её в `dist/_astro/html-shell.*.css` и сменило fingerprint `dist`; после удаления слова из спека fingerprint вернулся к базовому `3dc71442…`.
  deferred_to: BK17 — docs/backlog/bk17-tailwind-source-boundary.md; явные источники Tailwind нужны до переноса CSS в 6.2, текущий пункт не исправлен.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-10-translate-code-comments-to-english.md`
  summary: `content:import:fixture:check` и `content:decisions:check` не запускаются ни в `pnpm check`, ни в CI — по правилу `AGENTS.md` их нужно включить в джоб или удалить.
  evidence: найдено при переводе `migration/` в 5.10 (пакет 5); в цепочке `check` (`package.json:19`) и в `.github/workflows/ci.yml` этих скриптов нет.
  deferred_to: Story 8.1 — при упаковке migrate-wp подключить CLI-проверки в его CI или удалить; живой сайт миграцию не вызывает, команды здесь не запускались.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-10-translate-code-comments-to-english.md`
  summary: Устаревшие ссылки на этапы и пути в строках `migration/` — сообщения ошибок «plan 7» и «S8 importer» в `decisions.ts` и `import-modes.ts`, «canonical RU source» в `normalize-wordpress.ts`, заголовок `S12/4` и путь `data/migration/…` в пакетах `translation-review.ts` и `decisions-review.ts` (под drift-проверкой).
  evidence: 5.10 переводит комментарии, имена тестов и русские сообщения CLI; английские строки и отчёты для владельца вне её объёма, гейт строки не проверяет.
  deferred_to: Story 8.1 — обновить вывод и регенерировать отчёты при упаковке migrate-wp; импорт и отчёты в закрытии эпика 5 не меняются.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-10-translate-code-comments-to-english.md`
  summary: Возможный мёртвый код — `editHtmlAnchorHref` (`errata-edit.ts`, только тесты), `countRussianLetters`/`containsRussian` (`language.ts`, только `migration/`), повторные replace в `stripPresentation` (`importer.ts`), непрочитанный `translations` из `checkFullCandidate`, `DecisionInventory.masterExcluded`, скрипты `content:translations:draft` и `content:translations:refresh-digest` без вызывающих.
  evidence: исполнители пакетов 2 и 5 не нашли вызывающих при переписывании комментариев; код в 5.10 не менялся.
  deferred_to: Stories 6.2 / 8.1 — перепроверить фактических потребителей при переносе живого кода и migrate-wp; это гипотеза долга, автоматического удаления нет.
  partial_by: spec-6-2-c3-epic-5-debt.md -- в ядре подтверждено и удалено: `language.ts` (`containsRussian`, `countRussianLetters` — вызывающие только в `migration/` исходника) и `editHtmlAnchorHref` с `locateAnchorParts` (вызывающих нет ни в ядре, ни в исходнике, skill `factcheck-apply` его не называет); остальные экспорты `errata-edit.ts` живые (skill `factcheck-apply`, `translation-freshness.ts`) и покрыты перенесённым тестом. Осталось для 8.1: `stripPresentation` (`importer.ts`), `translations` из `checkFullCandidate`, `DecisionInventory.masterExcluded`, скрипты `content:translations:draft`/`refresh-digest` — код миграции в ядро не переносится.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-10-translate-code-comments-to-english.md`
  summary: Правило в `src/lib/content/schemas.ts`, отклоняющее `mediaSource: 'target'` у документа, потеряло обоснование («у документа нет обложки» неверно после ADR-0013, давшей документам `coverId`) — решить, нужно ли оно.
  evidence: при переводе пакета 2 комментарий сделан нейтральным; поведение не менялось.
  deferred_to: Story 6.2 — отдельно решить контракт document mediaSource при переносе модели; текущее требование явного photoSlug сохраняется.
  closed_by: spec-6-2-c3-epic-5-debt.md -- решение владельца 2026-10-28: правило снято, `mediaSource: target` у документа берёт `coverId` его записи опорной локали, без `coverId` — ошибка сборки с именем документа и подсказкой про `mediaSource.photoSlug`; демо — слайд-статья с `target`.

- source_spec: none
  summary: Story 5.11, часть B — цепочка поставки CI: сторонние actions закреплены по SHA, контейнер Playwright — по digest, Dependabot обновляет их (X2).
  evidence: 5.11 разделена владельцем на четыре спека A–D на ветке `feat/5-11-harden-the-live-surface`; часть B правит только workflow-файлы и `.github/dependabot.yml`, от A, C и D не зависит.
  closed_by: spec-5-11b-pin-actions-and-image.md
- source_spec: none
  summary: Story 5.11, часть C — форма: сообщения уходят в Telegram без превью ссылок (X5); `TELEGRAM_API_BASE` и `TURNSTILE_VERIFY_URL` переопределяются только при явном e2e-флаге, тест подтверждает, что production без флага их игнорирует (X6).
  evidence: 5.11 разделена владельцем на четыре спека A–D; часть C трогает только `src/lib/contact/` и её тесты, от A, B и D не зависит.
  closed_by: spec-5-11c-contact-form-upstreams.md
- source_spec: none
  summary: Story 5.11, часть D — обход зоны и чек-лист: `*.pages.dev` перенаправляет на основной домен, чтобы `/api/contact` не обходил правило WAF зоны (X4); чек-лист деплоя называет настройки вне репо — rate limit на `/api/contact` и токен Wrangler только с Pages Edit (X4, X7).
  evidence: 5.11 разделена владельцем на четыре спека A–D; редирект по хосту `_redirects` Pages не выражает, поэтому вероятен middleware в `functions/`, а его ответы должны нести заголовки из части A — делать D после A.
  closed_by: spec-5-11d-pages-dev-and-deploy-checklist.md
- source_spec: `_bmad-output/implementation-artifacts/spec-5-11d-pages-dev-and-deploy-checklist.md`
  summary: Перед тем как репозиторий (или вынесенное ядро) станет публичным, убрать точные параметры rate limit формы (3 запроса за 10 с по IP) из `docs/reference/deploy-checklist.md`, `epics-1-5-elicitation.md` и спеки 5.11d, оставив «правило есть, параметры — в панели Cloudflare».
  evidence: зная порог, можно слать запросы чуть реже него и обходить лимит; пока репозиторий приватный (`gh repo view` → `PRIVATE`, 2026-10-21), цифры видят только участники. Остальное в CHANGELOG 1.5.11 и чек-листе (заголовки, закреплённые actions, `403` на `pages.dev`, имена переменных) секретов не раскрывает: заголовки видны в любом ответе сайта, значения ключей в репо нет.
  deferred_to: Story 6.9 — проверить документы перед публичным выпуском; публикация репозитория и изменение WAF сейчас не выполняются.

- source_spec: none
  summary: Story 5.12, часть B — шрифты: сабсеты latin и cyrillic с `unicode-range`, `.woff` удалены, EN-страница не грузит кириллический сабсет (P7); у LCP-картинки героя нет `decoding="async"` (P8).
  evidence: 5.12 разделена владельцем на три спека A–C на ветке `feat/5-12-lighter-pages-and-faster-ci`; часть B меняет только шрифты и разметку героя, от A и C не зависит; пути сабсетов должны совпасть с `immutable`-кешем шрифтов из 5.11.
  closed_by: spec-5-12b-font-subsets-and-lcp.md
- source_spec: none
  summary: Story 5.12, часть C — быстрый CI: Lighthouse на PR не дольше 3 минут при медиане по 3 прогонам (P3), `pnpm check` параллелит независимые группы с прежним набором (P4), сборка harness и контейнерные e2e идут только при промахе pass-маркера, lookup — в лёгком джобе (P5, P6), время PR-прогона записано до и после.
  evidence: 5.12 разделена владельцем на три спека A–C; часть C правит `package.json` и workflow-файлы, от A и B не зависит; замер «до» снять до первых правок CI.
  closed_by: spec-5-12c-faster-ci.md
  closure_evidence: docs/design/ci-baseline.md; PR #63, run 39931173707 attempts 1/2, холодный и повторный прогоны, Lighthouse максимум 2:25.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-1b-tailwind-source-boundary.md`
  summary: Проверить, не возникает ли на главной `/ru/` иногда длинная задача JavaScript (например, при инициализации Swiper), из-за которой total blocking time выходит за порог Lighthouse 300 мс.
  evidence: в PR #65 (run 40219424153, шард 2, коммит 8c1c35b) медиана трёх прогонов дала TBT 506 мс на `/ru/`, хотя `lighthouserc.cjs` утверждает, что TBT везде измеряется как 0; JS страницы не менялся (бюджет JS в `page-budget.yaml` прежний), CSS только уменьшился. Перезапуск того же коммита прошёл, поэтому вероятен шум раннера. Разобрать при повторе: сравнить TBT `/ru/` на `main` и в ветке, найти длинные задачи в трассировке Lighthouse.

- source_spec: none
  summary: Story 6.2, часть B — `CHANGELOG.md` ядра: вычищенная история версий исходного репо, нумерация продолжается с 1.6.x (AD-7); git-теги версий ставятся только в рабочем репо.
  evidence: 6.2 разделена владельцем на части; часть A даёт каркас репо и гейт утечек, по которому проверяется вычищенный changelog, поэтому B — после A.
- source_spec: none
  summary: Story 6.2, часть C — демо покрывает публичный API: каждый маршрут ядра рендерится на синтетическом контенте обеих локалей; процедурные изображения проходят пайплайн ядра, статические производные лежат в `public/` демо; production-сборка без dev/E2E-флагов строит `<picture>`/`srcset`, viewer работает; политика изображений учитывает статическое размещение, не ослабляя защиту R2-сайтов (AD-2). Сюда же из долга эпика 5 — семантика `mediaSource` и проверка гипотез о мёртвом коде.
  evidence: 6.2 разделена владельцем на части; C требует каркаса, интеграции и разведённых корней из части A.
  partial_by: spec-6-2-c1-demo-locales-and-text-content.md (вторая локаль, страница `privacy`, статья, курс и `rights.ru.md` демо), spec-6-2-c2a-core-derivatives-and-public-path.md и spec-6-2-c2b-demo-images.md (нарезка ядром, деривативы в `demo/public/media/` на `publicPath`, альбомы, фото и слайдер главной, `<picture>`/`srcset` в сборке из tarball), spec-6-2-c3-epic-5-debt.md (`mediaSource: target` у документов, мёртвый код ядра); осталось: работа viewer — e2e части D, гипотезы о коде миграции — 8.1
  partial_by: spec-6-2-d1-demo-functional-e2e.md -- работа viewer в production-сборке из tarball: `e2e/viewer.spec.ts` открывает PhotoSwipe с обоих альбомов демо в каждой локали, листает в порядке сетки, закрывает с возвратом фокуса и проверяет, что декодированные изображения приходят с `/media/` (`publicPath`); осталось: гипотезы о коде миграции — 8.1
- source_spec: none
  summary: Story 6.2, часть D — e2e и визуальные эталоны ядра снимаются с демо в обеих темах (EH-47, S3), ожидаемое строится из конфига демо (AD-21); тесты на реальном контенте не переносятся — переписаны на фикстуры демо или остаются референсом для 9.3; из долга эпика 5 — тень баннера и reduced-motion тест смены иконки/логотипа.
  evidence: 6.2 разделена владельцем на части; эталоны снимаются с демо из части C, поэтому D — после C.
  partial_by: spec-6-2-d2-visual-baselines.md -- визуальные эталоны с демо из tarball в Linux-образе Playwright: главная (тёмная), альбом, статья и `privacy` в обеих темах, открытый viewer, ширины 375/1440/1920; CI-job `e2e` их только сравнивает; тень баннера — BK18; reduced-motion смены иконки/логотипа — `e2e/header-swap.spec.ts`. Осталось: harness-часть D (Gallery и MoreDocuments на страницах демо), пересъёмка эталонов после фото 6.12.
  partial_by: spec-6-2-d3-harness-surfaces-on-demo.md -- Gallery, WrapAround, MoreDocuments и touch-viewer на странице демо `blocks` и второй статье, эталон `blocks-galleries` на 375/1440/1920; маршрут `e2e-harness`, фикстура и флаги `PORTFOLIO_E2E`/`MORE_DOCS_E2E`/`IMAGES_E2E_*` удалены из ядра. Осталось: пересъёмка эталонов после фото 6.12.
- source_spec: none
  summary: Story 6.2, часть E — загрузка мест общая для контента и GPS bounds; GPS-потребитель не читает ненужные категории и теги; второй читатель `places.yaml` устранён (AD-9).
  evidence: 6.2 разделена владельцем на части; E меняет только загрузчики мест в перенесённом коде и от C, D, F не зависит.
- source_spec: none
  summary: Story 6.2, часть F — релизный workflow ядра публикует пакеты в npm через trusted publishing (`id-token: write`), пропускает уже опубликованную версию (`npm view`); до 6.9 проверяется только `npm publish --dry-run` (ADR-0016).
  evidence: 6.2 разделена владельцем на части; F требует собранного пакета и CI из части A.
  closed_by: spec-6-2f-release-workflow-dry-run.md
- source_spec: none
  summary: Story 6.2, часть G — исходный репо заморожен финальным коммитом с решениями 6.2 (последняя версия 1.6.1); правило «код меняется только в ядре» записано в `AGENTS.md` обоих репо.
  evidence: 6.2 разделена владельцем на части; заморозку делать последней, когда решения 6.2 известны и ядро уже собирается.
  closed_by: spec-6-2g-freeze-reference-repo.md
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2a-core-skeleton-and-leak-gate.md`
  summary: Story 6.2, часть A2 — перенос кода эпиков 1–5 (включая 5.13) в `packages/core` вместо интеграции-заглушки: интеграция одним вызовом, ресурсы ядра от `import.meta.url`, файлы потребителя от `config.root`, зависимости размещения из ADR-0016 и прочие `process.cwd()` в `src/lib` и компонентах исправлены (AD-8); тесты на реальном контенте переписаны на фикстуры; комментарии на английском (EH-60).
  evidence: решение владельца по объёму 6.2a — канал поставки и гейт утечек проверяются на заглушке до переноса ~280 файлов; A2 идёт после A и до C.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2a-core-skeleton-and-leak-gate.md`
  summary: `check:local-paths` пропускает бинарные файлы целиком — до изображений демо в части C научить его проверять текстовые фрагменты бинарников (XMP/EXIF), как `check:identity` проверяет их списком владельца.
  evidence: ревью 6.2a (B3, E6): `scripts/check-local-paths.ts` пропускает файл при NUL-байте; Lightroom и Photoshop пишут исходные пути в XMP (`RawFileName`, `DerivedFrom`), XMP — UTF-8 внутри JPEG. Сейчас бинарников в сканируемом дереве нет.
  closed_by: spec-6-2-c2b-demo-images.md (UTF-8-фрагменты между управляющими байтами, в бинарниках — только абсолютные пути: `~/` с буквой встречается в сжатых данных случайно; UTF-16-строки EXIF не проверяются)
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2a-core-skeleton-and-leak-gate.md`
  summary: `.cursor/rules/code-style.mdc` описывает `src/`, ESLint, `theme.css` и `check:color-literals`, которых в ядре пока нет — сверить правила с перенесённым кодом в A2.
  evidence: ревью 6.2a (B1): `AGENTS.md` ссылается на файл как на правила стиля; идентичности в нём нет, но команды и пути не существуют до переноса кода.
  closed_by: spec-6-2-a3-core-source-gates.md
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-a2-port-core-code.md`
  summary: Story 6.2, часть A3 — гейты исходного кода ядра в `pnpm check` (ESLint-конфиг с правилами стиля и границ импортов, `check:color-literals`, `check:css-layers`, `check:code-comments`, `check:pages`, `check:layout-tokens`), 17 тестов исходника на реальном контенте переписаны на фикстуры, `.cursor/rules/code-style.mdc` сверен с гейтами.
  evidence: решение владельца по объёму A2 (спека ~3,5–4 тыс. токенов): A2 переносит код, интеграцию, корни и тесты как есть; гейты и переписанные тесты — отдельное ревью после переноса.
  partial_by: spec-6-2-a3-core-source-gates.md -- 17 тестов на реальном контенте не переписаны (часть A4)
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-a2-port-core-code.md`
  summary: Ядро проверяется `astro/tsconfigs/strict` без `noUncheckedIndexedAccess` базового `tsconfig.base.json` (`packages/core/tsconfig.build.json` выключает его явно) — включить флаг для `packages/core` и исправить перенесённый код; естественное место — A3.
  evidence: ревью A2 (B3, E12): исходный сайт проверялся тем же `astro/tsconfigs/strict` без флага, поэтому код эпиков 1–5 под ним не компилировался; индексный доступ вроде `byLocale[referenceLocale]` не помечается.
  closed_by: spec-6-2-a4-strict-index.md
- source_spec: none
  summary: Story 6.2, отдельная часть после A3 — 17 тестов исходника на реальном контенте переписаны на фикстуры демо и включены в `pnpm check`.
  evidence: решение владельца при планировании A3 (2026-10-26): A3 сужена до гейтов исходного кода; тесты — независимо вливаемая работа, которую после A3 сразу проверяют ESLint и `check:code-comments`.
- source_spec: none
  summary: Story 6.2, та же отдельная часть после A3 — включить `noUncheckedIndexedAccess` для `packages/core` и исправить перенесённый код.
  evidence: решение владельца при планировании A3 (2026-10-26): флаг не входит в критерии эпика и не зависит от гейтов; правки кода под флаг лучше делать, когда ESLint ядра уже работает.
  closed_by: spec-6-2-a4-strict-index.md
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-a3-core-source-gates.md`
  summary: `AGENTS.md` (блок `bmad:context`) описывает `pnpm check` как «typecheck, unit tests, format, markdown lint and both gates» и называет `code-style.mdc` «Style rules no linter enforces yet» — дописать `pnpm lint`, пять гейтов A3 и `pnpm layout:tokens` через `bmad-project-context`.
  evidence: ревью A3 (B1): после A3 в `pnpm check` идут `lint`, `check:{color-literals,css-layers,code-comments,pages,layout-tokens}`; правка — файл контекста агентов, вне diff истории.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-a3-core-source-gates.md`
  summary: Списки `ADAPTERS`/`COMPUTATIONS` в `eslint.config.mjs` не связаны с файлами `packages/core/src/lib/` — тест, что каждая запись существует, иначе переименование модуля молча снимает его границу импортов.
  evidence: ревью A3 (B4, V3): все 31 модуль существуют сейчас; `scripts/eslint-config.test.ts` проверяет синтетические пути и копию списка; так же было в исходнике.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2a-core-skeleton-and-leak-gate.md`
  summary: Заголовки и описания PR не проверяются гейтом утечек — к 6.9 добавить шаг CI на `pull_request` (`opened`, `edited`, `synchronize`), который прогоняет их через `findLeaks` и `findLocalPaths`, не печатая найденное.
  evidence: ревью A Codex (CB10): Always части A включает PR, а CI проверяет только сообщения коммитов (`check-commit-msg.ts --range`); решение владельца 2026-10-26 — отложить до 6.9, пока PR живут в приватном рабочем репо и не публикуются.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-a2-port-core-code.md`
  summary: Типы MDX-компонентов (`MDXProvidedComponents` в `packages/core/src/components/content/mdx-authoring.d.ts`) не доходят до сайта — вывести их через публичную точку пакета (например, `/// <reference>` из типов `exports` или отдельный `./mdx` в `exports`) и проверить автодополнение и ошибки пропсов в `.mdx` сайта; естественное место — 6.3 (MDX-компоненты — публичный API).
  evidence: ревью A2 Codex (CB1): в исходнике `tsconfig.json` включал `**/*` вместе с `src/`, в пакете ни `exports`, ни `dist/index.d.ts` на файл не ссылаются, а `tsconfig` демо включает только свои файлы; тест `mdx-authoring.test.ts` подключает файл явно и разрыв не видит.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-a2-port-core-code.md`
  summary: Интеграция читает `site.yaml` в `astro:config:setup` без `addWatchFile`, поэтому правка `origin` или `content.locales` в dev не перезапускает настройку Astro — зарегистрировать файл конфига сайта через `addWatchFile`.
  evidence: ревью A2 Codex (CB2, CE2): `packages/core/src/index.ts:112-113`; так же было в исходнике (`astro.config.mjs` читал секции на верхнем уровне), поэтому не регрессия A2.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-a2-port-core-code.md`
  summary: Главная без `src/content/featured/home.yaml` — пустой полноэкранный блок без заголовка и навигации; дать доступный запасной вариант (заголовок сайта, ссылки разделов) и проверить отрисовку — в части C вместе с наполнением демо.
  evidence: ревью A2 Codex (CB6): ветка добавлена в A2 для пустого демо (`packages/core/src/pages/[locale]/index.astro:20-22`).
  closed_by: spec-6-2-c1-demo-locales-and-text-content.md
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-a2-port-core-code.md`
  summary: Сборка демо из tarball идёт на пустом контенте — в части C проверить на синтетическом наполнении построитель коллекций (статьи, альбомы, фото), исключения unlisted в sitemap, `_redirects`/robots/CSP из `siteFiles`, слайдер главной и страницу фото при `astro build --root` с cwd ≠ корень сайта.
  evidence: ревью A2 Codex (CB9, CB10, CV2, CV3, первый запуск — featured и photo-page): `scripts/build-demo-from-pack.ts` проверяет только список страниц, а у демо нет фото, альбомов, статей и `featured` (`demo/README.md`); подмена `siteRoot` на `process.cwd()` в `photo-page.ts` или пустой набор unlisted в sitemap прошли бы.
  partial_by: spec-6-2-c1-demo-locales-and-text-content.md (статьи и страницы двух локалей собираются из tarball, проверка — страницы `privacy`, статьи и курса), spec-6-2-c2b-demo-images.md (страницы альбомов и фото обеих локалей, `<picture>` с AVIF/WebP `srcset` на `/media/`, файлы всех `/media/…` в `dist`, слайдер главной); unlisted в sitemap и `_redirects`/robots/CSP не проверены
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-a2-port-core-code.md`
  summary: Перезагрузка `site.yaml`/`seo.yaml` в dev (`configYamlDependency` в `packages/core/src/index.ts:90`) ничем не проверена — в части D добавить проверку с запущенным dev-сервером: правка YAML меняет ответ без перезапуска.
  evidence: ревью A2 Codex (CB8, CV4): `rg configYamlDependency` находит только определение; подмена ключа модуля на путь сайта прошла бы все проверки.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-a3-core-source-gates.md`
  summary: Раздел «What the gates check» в `.cursor/rules/code-style.mdc` обещает больше, чем проверяет `eslint.config.mjs`: запрет литералов локалей не охватывает `demo/src`, а модули `ADAPTERS` могут импортировать синглтон конфига и загрузчик — уточнить формулировки (через `bmad-project-context`, вместе с записью про `AGENTS.md`).
  evidence: ревью A3 Codex (CE14): блоки `boundaries([...])` для `scripts/**`, `demo/astro.config.mjs`, ядра и список `ADAPTERS` в `eslint.config.mjs`; правка — файл правил агентов.
- source_spec: none
  summary: Story 6.2, часть A5 — 17 тестов исходника на реальном контенте (`components/{blocks/gallery.render,cards,content-surfaces,content/privacy-render,shell,site-logo,status/status-route,top-section}`, `config/{loader,privacy,seo}`, `lib/{blocks/links/corpus,content/rights-route,content/translation-freshness,featured,redirects/contract}`, `theme/fonts`; ~3000 строк) переписаны на фикстуры демо и включены в `pnpm check`.
  evidence: решение владельца при планировании A4 (2026-10-27): A4 разделена — флаг `noUncheckedIndexedAccess` (97 ошибок в 19 файлах) отдельно от тестов; тесты после флага, чтобы переписанные тесты сразу проверялись им. Перекрытие — только `redirects/contract` (тест в A5, 15 ошибок исходника в A4).
  partial_by: spec-6-2-a5a-config-and-file-contracts.md -- перенесены восемь тестов конфига и файловых контрактов (`config/{loader,privacy,seo}`, `lib/content/{rights-route,translation-freshness}`, `theme/fonts`, `components/site-logo`, `lib/redirects/contract`) на демо через `siteRoot`/`CORE_ROOT` и временные сайты; случай реального `public/_redirects` остаётся референсом 9.3 в исходнике. Осталось: A5b (рендер компонентов) и A5c (`shell`, `content-surfaces`, `featured`, `links/corpus`); spec-6-2-a5b-component-render-tests.md -- перенесены пять тестов рендера (`components/{cards,top-section,blocks/gallery.render,content/privacy-render,status/status-route}`) на фикстуру манифеста, релиз, MDX и снимок контента демо; случай файла маршрута `/status/` не перенесён (дубль тестов ядра). Осталось: A5c.
  closed_by: spec-6-2-a5c-shell-surfaces-and-featured-tests.md -- последние четыре теста (`components/{shell,content-surfaces}`, `lib/featured`, `lib/blocks/links/corpus`) на фикстурах, релизе и статье демо; сверка ссылок статей с замороженной выгрузкой остаётся референсом в исходном репо.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-c1-demo-locales-and-text-content.md`
  summary: Story 6.2, часть C2 — изображения демо: минимальная функция нарезки в ядре (`sharp` → лестница AVIF/WebP и запись манифеста; 6.7 оборачивает её в CLI), процедурные плашки-заглушки (6.12 заменит), деривативы в `demo/public/`, отдельное поле `publicPath` в `images-public.json` взаимоисключающее с `publicOrigin` (тот остаётся только HTTPS), альбомы, фото и `featured/home.yaml` демо, проверка сборки из tarball на страницах альбома и фото; до первых бинарников — `check:local-paths` проверяет текст внутри них.
  evidence: решение владельца при планировании C (2026-10-27): C разделена на C1–C3; генератора деривативов в ядре нет (пайплайн — 6.7), а `publicOrigin` по схеме и `assertHttpsOrigin` только HTTPS — выбраны функция нарезки в ядре и поле `publicPath`.
  closed_by: spec-6-2-c2a-core-derivatives-and-public-path.md, spec-6-2-c2b-demo-images.md
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-c1-demo-locales-and-text-content.md`
  summary: Story 6.2, часть C3 — долг эпика 5: решить контракт `mediaSource` у документов (правило `schemas.ts:442-447` «article/page target requires an explicit mediaSource.photoSlug» после ADR-0013) и перепроверить гипотезы о мёртвом коде (записи `deferred-work.md` о `editHtmlAnchorHref`, `containsRussian`, `stripPresentation`, `checkFullCandidate`, `masterExcluded`, скриптах переводов).
  evidence: решение владельца при планировании C (2026-10-27): долг эпика 5 не зависит от наполнения демо и изображений.
  partial_by: spec-6-2-c3-epic-5-debt.md -- контракт `mediaSource` решён и закреплён тестами, мёртвый код ядра удалён, тест `errata-edit` перенесён; осталось: гипотезы о коде миграции (`stripPresentation`, `checkFullCandidate`, `masterExcluded`, скрипты переводов) — 8.1 вместе с migrate-wp
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-c2a-core-derivatives-and-public-path.md`
  summary: Story 6.2, часть C2b — изображения демо: до первых бинарников `check:local-paths` проверяет текст внутри них; скрипт генерирует процедурные плашки функцией нарезки ядра в `demo/public/media/` и пишет активный `images-release.json` и `images-public.json` с `publicPath`; синтетические фото, альбомы обеих категорий и `featured/home.yaml`; проверка в `pnpm check`, что у каждой записи манифеста есть файл с тем же sha256; сборка из tarball проверяет страницы альбома и фото и `<picture>`/`srcset`; деривативы с `rightsEmbedded: false` (права в XMP — 6.7).
  evidence: решение владельца при планировании C2 (2026-10-27): C2 разделена на C2a (ядро: `publicPath` и функция нарезки) и C2b (демо); ExifTool — в 6.7 вместе с CLI.
  closed_by: spec-6-2-c2b-demo-images.md
- source_spec: none
  summary: Story 6.5 — `footer.quote` и `contacts.intro` — содержимое сайта, а не ядра: с частичными словарями сайта их текст переезжает в словарь сайта (у ядра — нейтральное значение по умолчанию или ключ без него); `moreDocuments.course.*` («More Tours» / «Другие туры») расходится с `courses.title` («Courses») — сверить подписи курсов.
  evidence: 2026-10-28 в словарях ядра `packages/core/src/i18n/{en,ru}.json` найдены личная цитата автора (`footer.quote`) и обращение от первого лица (`contacts.intro`) — вывод демо выдавал голос владельца вопреки AD-22; тексты заменены нейтральными синтетическими, гейт идентичности их не ловил (фразы нет в списке владельца).
  partial_by: spec-6-5a-i18n-dictionaries.md -- словари сайта `src/i18n/<locale>.yaml` переопределяют ключи ядра, `footer.quote` и `contacts.intro` сохраняют в ядре нейтральное значение по умолчанию, демо задаёт свой текст в своём словаре; осталось: сверка подписей курсов (`moreDocuments.course.*` против `courses.title`) — 6.6, где ключи курсов уходят в словарь модуля.
- source_spec: none
  summary: Story 6.2, часть A5b — тесты рендера компонентов на фикстурах: `components/{cards,top-section,blocks/gallery.render,content/privacy-render,status/status-route}` исходника переносятся в ядро на фикстуры манифеста (`s9-ladder-manifest.json`) или id фото демо, синтетические подписи и ссылки, рендер в Astro-контейнере; включены в `pnpm check`.
  evidence: решение владельца 2026-10-29: A5 разделена на A5a–A5c по похожему объёму; A5b — после A5a, где договаривается приём подмены корня сайта и данных в тестах.
  closed_by: spec-6-2-a5b-component-render-tests.md
- source_spec: none
  summary: Story 6.2, часть A5c — `components/shell` и `components/content-surfaces` исходника переносятся на фикстуры с подменой синглтонов конфига; `lib/featured` сливается с синтетическим `lib/featured.test.ts` ядра (медиа альбома, alt по умолчанию, источники текста, черновики и отсутствующие локали, inline-текст, случаи схемы); по `lib/blocks/links/corpus` — семантика списка ссылок на демо (`:::links` в статье), сверка с замороженной выгрузкой остаётся в исходном репо.
  evidence: решение владельца 2026-10-29: A5 разделена на A5a–A5c; A5c — самые крупные тесты с подменой синглтонов и снимков контента, после A5a и A5b.
  closed_by: spec-6-2-a5c-shell-surfaces-and-featured-tests.md
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-a5a-config-and-file-contracts.md`
  summary: Story 6.5 — контракт SVG логотипа сайта: `components/site-logo.astro` ссылается на пять фрагментов бренд-логотипа (`brand-background-left`, `brand-background-right`, `brand-outline`, `brand-photography`, `brand-signature`), а `demo/src/assets/brand/brand-logo.svg` объявляет два — три `<use>` ничего не рисуют; решить: набор `id` — документированный контракт файла сайта (и дополнить SVG демо), частичный набор допустим, или фрагменты выводятся из SVG при сборке; затем тест сверяет оба направления.
  evidence: ревью A5a Codex (B1, E1): `site-logo.test.ts` проверяет только «каждый `id` SVG рисуется компонентом»; обратное направление сейчас упало бы на демо. Поведение существовало до переноса теста; код ядра в A5a не менялся (граница спека).
  closed_by: spec-6-5c-replacement-points.md -- слои выводятся из SVG сайта при сборке (`components/logo-layers.ts`): каждый элемент с `id` прямо под корневым `<svg>` — слой, `<use>` в порядке документа, `viewBox` из корня; жёсткий список ушёл, пустые `<use>` демо исчезли; `site-logo.test.ts` сверяет оба направления, контракт файла — в `packages/core/README.md` (Replacement points).
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-a5b-component-render-tests.md`
  summary: Story 6.2, часть D — SEO собранных страниц документов: взаимные `hreflang`-альтернативы и canonical на отрендеренных страницах privacy (и других документов) и их URL в сгенерированном sitemap проверяются на собранном демо, а не через помощники `buildLocaleMeta`/`createSitemapFilter`.
  evidence: ревью A5b Codex (B6, V2): `privacy-render.test.ts` вызывает помощники напрямую; удаление `alternates={meta.alternates}` в `pages/[locale]/[slug].astro:68` проходит все тесты, а `scripts/build-demo-from-pack.ts` проверяет наличие страниц и изображений, но не SEO. Пробел существовал до переноса — тест исходника устроен так же.
  closed_by: spec-6-2-d1-demo-functional-e2e.md -- `e2e/navigation.spec.ts` (`document SEO`): canonical и `hreflang`-альтернативы (каждая локаль и x-default) каждого опубликованного документа демо во всех локалях и их URL в `sitemap-index.xml` → sitemap собранного из tarball демо; черновой курс в sitemap отсутствует.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-a5c-shell-surfaces-and-featured-tests.md`
  summary: Story 6.2, часть D — сворачивание `AlbumList` (`components/portfolio/album-list.astro:30`, порог `albumList.collapseFrom`) в no-JS раскрытие проверяется рендером: граница порога, сводка, название текущего альбома и оба списка ссылок.
  evidence: ревью A5c Codex (B4): ни один тест не рендерит свёрнутый список — в демо два альбома при пороге 8, в тесте исходника случая нет; пробел существовал до переноса, код ядра в A5c не менялся.
  closed_by: spec-6-2-d3-harness-surfaces-on-demo.md -- рендер-тест `AlbumList folding` в `components/content-surfaces.test.ts` на синтетических альбомах: на `collapseFrom - 1` один открытый список, на `collapseFrom` — `<details>` со сводкой «подпись (N)», названием текущего альбома и двумя списками ссылок с одним `aria-current` в каждом; на индексе без текущего альбома названия в сводке нет.
- source_spec: none
  summary: Story 6.2, часть D2 — визуальные эталоны ядра с демо в обеих темах (EH-47, S3) на Linux-раннере части D1; из долга эпика 5 — inset-тень баннера `.top-section__bg` (починка меняет все эталоны баннеров — только с подтверждением владельца) и браузерный reduced-motion тест смены иконки/логотипа в приклеенной шапке.
  evidence: решение владельца 2026-10-30: D разделена на D1 (Playwright и функциональные e2e на демо) и D2; эталоны строятся на инфраструктуре D1 и переснимаются после фото 6.12.
  closed_by: spec-6-2-d2-visual-baselines.md
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-d1-demo-functional-e2e.md`
  summary: Story 6.2, часть D (harness) — Gallery и MoreDocuments приходят в контент демо, спеки `gallery-harness`, `more-docs-harness`, `portfolio-touch` исходника переписываются на страницы демо поверх Playwright из D1; маршрут `e2e-harness`, `lib/portfolio/e2e-fixture.ts` и флаги `PORTFOLIO_E2E`/`MORE_DOCS_E2E`/`IMAGES_E2E_*` (`index.ts`, `catalog.ts`, `variant-css.ts`) удаляются из ядра.
  evidence: решение владельца 2026-10-30 по спеку D1 (вопрос 1, вариант «а»): harness — наследие исходного сайта, в сборке демо из tarball не участвует; перенос раздул бы D1.
  closed_by: spec-6-2-d3-harness-surfaces-on-demo.md -- страница демо `blocks` (Gallery `rect`/`square`/`justified`, динамическая из набора `every-photo`, WrapAround, title-slide MoreDocuments через `moreDocs.docs`), вторая статья; спеки `e2e/gallery.spec.ts`, `e2e/more-documents.spec.ts`, `e2e/viewer-touch.spec.ts` (проекты `mobile-touch`, `tablet-touch`), эталон `blocks-galleries`; маршрут, фикстура, e2e-режим каталога, `everyVariant` и фильтр sitemap удалены, возврат закреплён `packages/core/src/no-test-harness.test.ts`.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-d1-demo-functional-e2e.md`
  summary: Story 6.8 — e2e контактной формы (валидация, honeypot, Turnstile, сбой upstream, ровно одно сообщение в Telegram) и заголовков безопасности/CSP (`contact.spec`, `security-headers.spec` исходника) под `wrangler pages dev` с мок-upstream, когда ядро поставляет Pages Function и деплой сайта.
  evidence: решение владельца 2026-10-30 по спеку D1 (вопрос 2, вариант «а»): в ядре нет `functions/api/contact.ts`, статический preview не применяет `_headers`, у формы демо нет бэкенда.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-d3-harness-surfaces-on-demo.md`
  summary: Подчёркивание заголовка MoreDocuments (`components/content/more-documents.css`, `.more-documents__heading::after`, `width: min(200%, 100cqw)`) выходит за правый край внутреннего блока, когда заголовок шире половины контейнера: у блока нет своего контейнера, `100cqw` берётся от ширины страницы и отсчитывается от левого края заголовка. На странице демо `blocks` на 375px `body.scrollWidth` 391 при ширине 375; горизонтальной прокрутки нет, лишнее срезает `overflow-x: clip` у `html`/`body`. Решить: ограничить линию шириной `.more-documents__inner` (контейнер на нём или `max-width`) или принять как есть.
  evidence: найдено D3: проверка переполнения `horizontalOverflow` (учитывает `body`) падала на `blocks` на 375; спеки D3 меряют переполнение `html`, как спеки исходника. Код ядра в D3 не меняется (граница спека).
  closed_by: вне истории (2026-10-31) -- `.more-documents__inner` стал контейнером (`container-type: inline-size`), `100cqw` линии берётся от ширины блока; тест `keeps the heading underline inside the block on every surface` в `e2e/more-documents.spec.ts` на 375 без правки получал выход линии на 32px, с правкой проходит на всех ширинах; эталоны не изменились.
- source_spec: none
  summary: Story 6.3, часть B — объявленный API потребителя (`exports`, схемы файлов сайта, имена MDX-компонентов и директив, токены, ключи i18n, документированные CLI/env) и снапшот-гейты на него; изменение снапшота валит CI, пока снапшот не обновлён в том же изменении, удаление или сужение помечается как ломающее; внутренние переменные runners и тестовые протоколы в API не входят (AD-7).
  evidence: решение владельца 2026-11-02: 6.3 делается частями A–D по очереди одним PR в конце; снапшот снимается с поверхности `exports`, которую задаёт часть A, поэтому B — после A.
  closed_by: spec-6-3b-declared-api-and-snapshots.md
- source_spec: none
  summary: Story 6.3, часть C — политика версий ядра (patch/minor/major, ломающее до 9.3 — minor с диапазоном `~`, байтовый контракт хешей и адресов) и версионированный `UPGRADING.md` с записями «до/после», порядком, версиями писателей и проверкой результата (AD-7).
  evidence: решение владельца 2026-11-02: 6.3 делается частями A–D по очереди одним PR в конце; политика опирается на то, что часть B считает ломающим изменением, поэтому C — после B.
  closed_by: spec-6-3c-version-policy-and-upgrading.md
- source_spec: none
  summary: Story 6.3, часть D — каждый файл сайта, который читает ядро, несёт `schemaVersion`; `version` в `images.yaml` и `place-gps-bounds.yaml` переходит на него без перегенерации производных; файл без `schemaVersion` или с неподдерживаемой версией даёт ошибку с именем файла и списком поддерживаемых версий.
  evidence: решение владельца 2026-11-02: 6.3 делается частями A–D по очереди одним PR в конце; схемы файлов сайта входят в снапшот части B, поэтому D идёт после B.
  closed_by: spec-6-3d-site-file-schema-version.md -- обязательный `schemaVersion` у файлов сайта и сгенерированных `images-*.json`, общая проверка версии до схемы; `place-gps-bounds.yaml` уходит в AC GPS истории 6.7 (решение владельца 2026-11-06).
- source_spec: `_bmad-output/implementation-artifacts/spec-6-3b-declared-api-and-snapshots.md`
  summary: `loadContentSnapshot` в `packages/core/src/lib/content/files.ts` сам задаёт каталоги и расширения коллекций, а не читает их из `COLLECTION_SOURCES`, по которому работают загрузчики Astro и снапшот API.
  evidence: ревью 3 спеки 6.3b, строка 39 триажа: `files.ts` (`loadDataEntries`, `loadLocalizedEntries`, `loadContentSnapshot`) хардкодит `albums`/`photos`/`articles`/`pages` и `/\.ya?ml$/`, `/\.mdx?$/`; дублирование было и на базовом коммите, изменение реестра разведёт sitemap и проверки целостности с тем, что грузит Astro.
  closed_by: spec-6-6a-module-manifest-and-courses-module.md -- `loadContentSnapshot` читает каталоги из `COLLECTION_SOURCES` и коллекций включённых модулей (реестр модулей, `lockedModules` по умолчанию); курсы приходят из коллекции модуля `courses`.
- source_spec: none
  summary: Story 6.4, часть B — конфиг сайта, SEO, изображений и границ мест собран в одно дерево переопределений `site.yaml`, умолчания живут в ядре (AD-19); неизвестный ключ в `site.yaml` — ошибка с путём ключа; переход старой формы описан в `UPGRADING.md` и проверен на фикстуре, производные файлы обновляются через их писателей (AD-7, AD-10).
  evidence: решение владельца 2026-11-08: 6.4 делается частями A–D по очереди; перенос `images.yaml` в дерево не должен менять `configDigest`, поэтому B — после A (хеш от набора полей).
  partial_by: spec-6-4b-site-yaml-override-tree.md -- `src/config/site.yaml`, `src/config/seo.yaml` и `config/images.yaml` слиты в `site.yaml` в корне сайта (`schemaVersion: 2`, секции `seo` и `images`), один загрузчик и срезы `loadSeoConfig`/`loadImageConfig`, ошибка на оставшийся старый файл, неизвестный ключ — ошибка с полным путём, переход в `UPGRADING.md` проверен на фикстуре трёх файлов, `configDigest` прежний; границы мест войдут в дерево, когда появятся (AC GPS истории 6.7). Осталось: умолчания ядра и сокращение `site.yaml` демо до отличий — часть B2.
  closed_by: spec-6-4b2-core-config-defaults.md -- умолчания ядра для секций поведения `site.yaml` в Zod-схеме, `site.yaml` демо сокращён до данных сайта.
- source_spec: none
  summary: Story 6.4, часть C — `core config resolve` читает умолчания и переопределения и пишет `site.lock.yaml` со строгой схемой и версиями контентных коллекций (AD-7); сборка и рабочие команды читают эффективный конфиг из lock через один загрузчик; drift-гейт падает, если lock не совпадает с результатом resolve.
  evidence: решение владельца 2026-11-08: 6.4 делается частями A–D по очереди; resolve сливает дерево переопределений части B с умолчаниями ядра, поэтому C — после B.
  closed_by: spec-6-4c-config-resolve-and-lock.md -- писатель `resolveSiteLock` (`config/lock.ts`) и `pnpm config:resolve [--site]` пишут строгий `site.lock.yaml` (`schemaVersion: 1`, `collections`, `site`); загрузчик читает только lock (недостающая ветка, лишний ключ, чужая версия коллекции — ошибка с путём); гейт `check:config-lock` в `pnpm check` сравнивает байты с resolve; CLI `core config resolve` — в 6.7.
- source_spec: none
  summary: Story 6.4, часть D — `rights.webStatement` и `rights.source` выводятся из `origin`, хеш конфига изображений при том же итоговом значении не меняется (запись 4.4); локальная проверка на реальном конфиге исходного сайта: хеш изображений не меняется (AD-7).
  evidence: решение владельца 2026-11-08: 6.4 делается частями A–D по очереди; неизменность хеша при выводе значений опирается на хеш от набора полей части A, поэтому D — после A.
  closed_by: spec-6-4d-rights-from-origin.md -- вывод `transform` на корне `siteSchema` (`deriveImageRights` в `config/images-schema.ts`, `RIGHTS_PATH` в `config/rights.ts`), поля помечены `x-derived-from` и обязательны в снапшоте lock; `site.yaml` демо без двух строк, lock и `configDigest` прежние; локально хеш исходного сайта с выведенными полями совпал с записанным.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-4a-image-config-digest-fields.md`
  summary: Проекция хеша конфига изображений `digestVersion: 2` без полей, не влияющих на деривативы (`publicOrigin`/`publicPath`, `archive.ignoreDirs`, версия файла), чтобы смена домена или каталогов архива не объявляла релиз устаревшим.
  evidence: решение владельца 2026-11-08 по 6.4a — версия 1 сохраняет нынешние байты хеша; смена проекции меняет хеш у всех сайтов, это ломающий выпуск с записью `UPGRADING.md` и перезаписью дескриптора писателем без перекодирования; ревью 1 спеки 6.4a, находка 1.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-4b-site-yaml-override-tree.md`
  summary: Story 6.4, часть B2 — умолчания ядра для секций поведения `site.yaml` (вид, меню без `items`, раскладки, просмотрщик, параметры конвейера изображений), обязательными остаются данные сайта (`origin`, `identity`, `content`, `privacy.controller`, `menu.items`, `social`, `seo.description`, `images.rights`, водяной знак); `site.yaml` демо сокращается до отличий (AD-19).
  evidence: решение владельца 2026-11-08 при планировании 6.4b: слияние файлов и набор умолчаний — отдельно выпускаемые результаты, набор умолчаний — решение о публичном API, ревьюится отдельно; B2 идёт после B и до или вместе с C (resolve сливает умолчания с переопределениями).
  closed_by: spec-6-4b2-core-config-defaults.md -- умолчания (нынешние значения демо) у листьев и секций схемы, блок `moreDocs.<kind>` пишется целиком, `images.publicPath` по умолчанию `/media` без `publicOrigin`; срезы применяют те же умолчания, неизвестный ключ — прежняя ошибка с путём; `site.yaml` демо — только данные, сторож в тестах загрузчика.
- source_spec: none
  summary: Story 6.5, часть B — контракт токенов темы: тема сайта задаёт только токены из экспортированного списка, неизвестный токен — ошибка, layout-токены `--container-*` генерируются из конфига, фавикон и инлайн-цвета (`html-shell.astro`, `top-section.astro`) берутся из токенов или конфига; демо проверяет, что класс, используемый только в ядре, генерируется (`@source` на пакет есть с 6.1b); контраст светлой темы (строка 139) решается здесь.
  evidence: решение владельца 2026-11-12: 6.5 делается частями A–C по очереди; i18n (A) не зависит от темы, точки замены (C) опираются на контракт токенов, поэтому B — между ними.
  closed_by: spec-6-5b-theme-tokens.md -- `tokens.json` в пакете, Vite-плагин интеграции проверяет тему сайта при сборке и `astro dev` (неизвестный, layout- и недостающий обязательный токен), Tailwind-токены, которые читает ядро, — `optional`; фавикон из `theme.favicon.*`, затемнение баннера — `--color-shade`, `check:color-literals` ловит литералы вне `<style>` в `.astro`; упакованное демо проверяет класс `text-menulink`.
- source_spec: none
  summary: Story 6.5, часть C — небольшой документированный список именованных точек замены визуальных частей с типизированными пропсами/слотами, интерактивная оболочка остаётся у ядра; неизвестное имя точки отклоняется; пример замены в демо и e2e сохранения взаимодействий, клавиатуры и переходов ClientRouter (AD-24); контракт SVG-логотипа сайта (запись про `site-logo.astro`) решается здесь.
  evidence: решение владельца 2026-11-12: 6.5 делается частями A–C по очереди; замена визуальной части опирается на контракт токенов части B, поэтому C — последней.
  closed_by: spec-6-5c-replacement-points.md -- точки `logo` и `footer-copyright` (`overrides/points.ts`, типы пропсов из корня пакета), файл `src/overrides/<point>.astro` сайта отдаётся виртуальным модулем, оболочка (ссылка, `aria-label`, закрепление, свап) остаётся у ядра; неизвестная точка и не `.astro` — ошибка в `astro:config:setup` с файлом и списком известных (тест ядра и негативная сборка упакованного демо); имена точек — поверхность снапшота `replacement-points.json`, удаление ломающее; демо заменяет логотип, `e2e/replacement-points.spec.ts` проверяет фокус с клавиатуры, переход ClientRouter без перезагрузки, свап при закреплении и логотип баннера на телефоне.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-5b-theme-tokens.md`
  summary: Токен, на котором строится утилита ядра (`--color-menulink` для `text-menulink` в `theme-toggle.astro`), должен быть зарегистрирован в `@theme` темы; объявленный только в `:root`, он проходит проверку темы, а Tailwind не генерирует утилиту, и элемент ядра молча теряет цвет.
  evidence: Codex-ревью 6.5B (blind): `themeTokenProblems` проверяет только имена, `tokens.json` не различает токены утилит и `var()`-токены; исправление — отдельный вид записи в публичном списке (например `theme`) и проверка области `@theme`, то есть изменение снапшота API. До 6.5B проверки тоже не было; вероятное место — 6.5C (точки замены опираются на контракт токенов).
- source_spec: `_bmad-output/implementation-artifacts/spec-6-6a-module-manifest-and-courses-module.md`
  summary: 6.6B — гейт коллизий имён между ядром, модулями и slug'ами контента (коллекции, сегменты маршрутов, MDX- и директивные имена, токены, i18n-пространства), поверхность `modules` в API-снапшоте и негативная сборка упакованного демо с намеренной коллизией.
  evidence: решение владельца 2026-11-14: 6.6 делится на A (манифест, `modules.<id>`, курсы как модуль) и B (коллизии); гейт коллизий опирается на манифест и реестр модулей части A.
  closed_by: spec-6-6b-collision-gate.md -- чистые проверки `moduleCollisions`/`slugCollisions` (`modules/collisions.ts`) над манифестами и именами ядра из `coreNames()`; гейт в `astro:config:setup` для включённых модулей и slug'ов страниц `[slug]` одной ошибкой, тест над `MODULES` в `pnpm check`; поверхность `modules.json` снапшота с классификатором; негативная сборка упакованного демо со страницей `slug: courses`.
- source_spec: none
  summary: 6.7B — пайплайн изображений как команды CLI ядра (сборка деривативов, `colormode`, `ladder-report`, ExifTool/XMP-права, проверки деривативов и политики; удалённая часть R2 — `sync`, `prune`, `activate`, `check-live` — возможно отдельной частью B2), GPS bounds мест (`place-gps-bounds`, `gps-place`) через `loadPlacesConfig` ядра и `schemaVersion` у `place-gps-bounds.yaml` без перегенерации производных.
  evidence: решение владельца 2026-11-14: 6.7 делится на A (каркас CLI), B (изображения), C (валидация контента), D (skills и пресеты); пайплайн исходного сайта — около 8 700 строк в `scripts/lib/images` и 15 команд `images:*`, отдельный по объёму результат поверх каркаса CLI части A.
  closed_by: spec-6-7b-image-pipeline-cli.md -- локальная часть и R2 в одной части B (решение владельца 2026-11-15): девять команд `images …`, гейты `images-policy`, `images-public-config`, `place-gps-bounds`, файл границ `src/content/config/place-gps-bounds.yaml` и заголовок `schemaVersion` у `data/images/*.jsonl`; `@aws-sdk/client-s3` — необязательный peer.
- source_spec: none
  summary: 6.7C — валидация контента как команды CLI ядра (`validate-content`, `factcheck`, `translation-marker`), которые вызывают content-ops skills.
  evidence: решение владельца 2026-11-14: 6.7 делится на A–D; команды контента — отдельный результат поверх каркаса CLI части A и нужны skills части D.
  closed_by: spec-6-7c-content-validation-cli.md
- source_spec: none
  summary: 6.7D — установка в сайт командой ядра content-ops skills, пресетов ESLint/Prettier/TS/markdownlint и управляемого блока `AGENTS.md` со штампом версии; skills вызывают команды CLI, а не алиасы; свой skill сайта не может занять имя skill'а ядра; пресет ESLint несёт `noInlineConfig` и запрет глубоких импортов (AD-3, AD-13).
  evidence: решение владельца 2026-11-14: 6.7 делится на A–D; D идёт последней, потому что skills должны вызывать уже существующие команды CLI частей A–C.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-7a-core-cli-skeleton.md`
  summary: Гейт `css-layers` не распознаёт импорт порядка слоёв ядра из входного стиля тонкого сайта: спецификаторы пакета игнорируются, а путь через симлинк pnpm в `node_modules` может не совпасть с реальным путём ядра (`packages/core/src/cli/css-layers.ts:47`); не проверено, оценка — medium.
  evidence: Codex-ревью 6.7A; у демо нет своих `@import` в `demo/src` (тема подключается из `global.css` ядра), поэтому упакованное демо гейт проходит. Решит проверка, нужен ли тонкому сайту собственный входной стиль по лестнице кастомизации (AD-24), — тогда нужен публичный импорт порядка слоёв, который гейт распознаёт.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-7a-core-cli-skeleton.md`
  summary: Гейт `color-literals` сканирует только CSS и Astro, поэтому литерал цвета во inline-стиле TSX-компонента сайта проходит незамеченным (`packages/core/src/cli/commands/check-color-literals.ts:9`).
  evidence: Codex-ревью 6.7A; набор расширений перенесён из `scripts/check-color-literals.ts` без изменений, так что пробел давний, но теперь гейт работает на сайтах, где TSX-компоненты правдоподобны.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-7c-content-validation-cli.md`
  summary: Черновик документа только в одной локали проходит `astrum-scena check content`, но роняет все команды `content translation-marker …` с кодом 1: `buildDocumentPairs` (`packages/core/src/lib/content/translation-marker.ts:113`) требует все активные локали у любого документа, а целостность (`integrity.ts:176`) — только у опубликованной пары; оценка — medium.
  evidence: ревью 6.7C, пакет 1 (blind); функция перенесена в 6.2 без изменений из исходника, и исходный скрипт падал так же. Исправление — пропускать в парах черновик без перевода (или считать его `needs-review`) — меняет поведение исходного скрипта, которое спека 6.7C велит сохранить; решить вместе с skill `/validate` и `/translate` в 6.7D.
  closed_by: spec-6-7d-site-skills-and-presets.md -- `buildDocumentPairs` не строит пар для недостающих локалей черновика (без опорной локали — ни одной), а у опубликованного документа недостающая локаль по-прежнему ошибка, как в целостности; тесты контракта и команды `content translation-marker check` на черновике в одной локали.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-7c-content-validation-cli.md`
  summary: Пакет ревью фактчека (`packages/core/src/lib/content/factcheck-review.ts:52` `renderFinding`) не показывает id находки, а `astrum-scena content factcheck decide --set <id>=<status>` требует его, так что владелец не может записать решение, глядя только в пакет; оценка — low.
  evidence: ревью 6.7C, пакет 2 (Codex blind); пакет и `decide` перенесены без изменений из исходных `src/lib/content/factcheck-review.ts` и `scripts/factcheck.ts`, где пробел тот же. Добавление id меняет байты пакета у всех сайтов — решить вместе со skill `/factcheck` в 6.7D, который ведёт владельца через решения.
  closed_by: spec-6-7d-site-skills-and-presets.md -- `renderFinding` выводит строку `- id: <id>` у каждой находки; переход пакета — в `UPGRADING.md`, проверен тестом «the upgraded review packet» (`factcheck-commands.test.ts`).
- source_spec: `_bmad-output/implementation-artifacts/spec-6-7d-site-skills-and-presets.md`
  summary: Skill `factcheck` первым шагом Phase 0 запускает пишущий `astrum-scena content factcheck extract` до чекпоинта владельца, хотя общие правила (`astrum-scena-shared/safety.md`) требуют явного «да» перед изменением файлов; оценка — low.
  evidence: ревью 6.7D, пакет 1 (Codex blind); `packages/core/skills/factcheck/SKILL.md:82`; шаг перенесён из исходного skill'а, где `extract` тоже идёт первым; решить, считать ли синхронизацию леджера служебной записью или вынести её за чекпоинт.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-7d-site-skills-and-presets.md`
  summary: Skill `factcheck-apply` после остановки между правкой эталонной локали и зеркалированием в переводы при повторном запуске пропускает находку целиком, и переводы остаются без исправления; оценка — low.
  evidence: ревью 6.7D, пакет 1 (Codex blind); `packages/core/skills/factcheck-apply/SKILL.md:108` — шаг 1 пропускает уже применённую в эталоне находку, шаг 5 (зеркало) не достигается; поведение исходного skill'а.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-7d-site-skills-and-presets.md`
  summary: Skill `factcheck-apply` не убирает из контента end note, чьё решение после применения сменилось на отклонённое или отложенное, если у документа не осталось принятых end notes; оценка — low.
  evidence: ревью 6.7D, пакет 1 (Codex blind); `packages/core/skills/factcheck-apply/SKILL.md:96` — Phase 0 выбирает только документы с принятыми actionable-находками; поведение исходного skill'а; исправление — включать в сверку документы с управляемым регионом end notes.
- source_spec: none
  summary: История 6.9, цель 2 — аудит лицензий чужих ассетов ядра (иконки, шрифты, вендорный CSS: лицензия известна, совместима с MIT и указана в репо), MIT в корне репо и README про установку ядра в сайт.
  evidence: при запуске `bmad-build 6.9` (2026-11-20) история разделена по проверке одной цели; цель независима от чистки дерева и публикации и мержится отдельным PR; владелец выбрал начать с цели 1 (чистое дерево и разделение планирования).
- source_spec: none
  summary: История 6.9, цель 3 — публикация: orphan-коммит итогового дерева после зелёного гейта, локального прогона denylist и сканера секретов; новый публичный репо `astrum-scena`, архивация `astrum-scena-zero`; ручной первый npm publish с 2FA, trusted publisher с действием `npm publish`, шаг `main` в `release.yml` без `--dry-run` и удаление guard-теста `scripts/release.test.ts`.
  evidence: при запуске `bmad-build 6.9` (2026-11-20) история разделена по проверке одной цели; цель зависит от целей 1 и 2 и в основном состоит из ручных шагов владельца, поэтому идёт последней.
  closed_by: spec-6-9c-publication.md -- `pnpm check:publication-tree` проверяет orphan-коммит `HEAD` во временном клоне гейтом идентичности по списку владельца и gitleaks; ручные шаги (публичный репо, первый publish с 2FA, trusted publisher, коммит без `--dry-run` и замена guard-теста в публичном репо, тег `v1.6.9`, архивация) — в ранбуке `docs/publication.md`.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-9a-clean-tree-and-planning-split.md`
  summary: `check:identity` проверяет бинарные файлы только по denylist в сыром UTF-8: шаблоны доменов и `HEX_ID` к ним не применяются, а сжатые чанки PNG (`zTXt`, `iTXt`, `caBX`) не распаковываются, поэтому будущие метаданные изображений с утечкой пройдут гейт; оценка — medium.
  evidence: ревью 6.9a, пакет 2 (Codex blind #4, edge #1); `scripts/check-identity.ts:55-59` — ветка `isBinary` вызывает только `findDenylisted`; отказ ревью 6.2a (B4+E4+E5) стоял на том, что в сканируемом дереве бинарников нет, а с 6.9a в нём PNG `docs/` и `_bmad-output/`; сейчас дерево чистое (у восьми PNG остались только `IHDR`/`IDAT`/`IEND`), поведение гейта прежнее.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-9b-licenses-and-readme.md`
  summary: В публичном репо `pnpm check` у внешнего контрибьютора падает на `check:identity`, потому что без `.identity-denylist` или `IDENTITY_DENYLIST` гейт падает, а корневой README этого не объясняет; оценка — medium.
  evidence: ревью 6.9b (Codex blind #4); `README.md` (Development) даёт `pnpm check` без условий; правило «без списка гейт падает» — из AGENTS.md (Identity); решать на цели 3 — пропуск гейта без списка вне CI или строка в README.
  closed_by: spec-6-9c-publication.md -- вне CI (`CI` не задан) `check:identity` без списка проверяет только общие шаблоны и проходит с предупреждением в stderr; в CI список обязателен; README (Development) это объясняет.

- source_spec: `_bmad-output/implementation-artifacts/spec-6-9c-publication.md`
  summary: В публичном репо PR из форков не получают секрет `IDENTITY_DENYLIST`, поэтому `check:identity` и проверка сообщений коммитов в их CI падают.
  evidence: GitHub не передаёт секреты репо в workflow PR из форков, а в CI без списка гейт падает по решению 6.9c; нужен путь для внешних PR (например, проверка по списку после ревью мейнтейнера) — решение владельца.

- source_spec: `_bmad-output/implementation-artifacts/spec-6-10a-localized-data-shapes.md`
  summary: 6.10b — одноязычный сайт: без переключателя языка в меню и альтернатив `hreflang` при одной локали, `/status/` без свежести перевода, демо собирается в CI с одной локалью и с двумя, e2e берут подписи из конфига и словарей (критерии 6.10 №3–5, кроме локали вне en/ru).
  evidence: решение владельца 2026-11-23 при планировании 6.10: спек на всю историю ~4000+ токенов; одноязычный сайт опирается на формы данных 6.10a и поставляется отдельным PR.
  closed_by: spec-6-10b-single-locale-site.md
- source_spec: `_bmad-output/implementation-artifacts/spec-6-10a-localized-data-shapes.md`
  summary: 6.10c — каталог локалей из конфига: `LOCALE_CATALOG` (script, ogLocale, intl), `CHAR_WIDTH_PX` и `SERVICE_COPY_LOCALE` — умолчания ядра с переопределением и дополнением в `site.yaml`, тип `Locale`, `localeSchema` и регулярки путей от конфига, тест `lib` с локалью вне en/ru (критерий 6.10 №2 и часть №5).
  evidence: решение владельца 2026-11-23 при планировании 6.10: тип `Locale` из `keyof LOCALE_CATALOG` используется примерно в 70 файлах ядра — самый широкий рефакторинг истории, от 6.10a и 6.10b не зависит.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-10a-localized-data-shapes.md`
  summary: Заголовки записей `UPGRADING.md` и пункт `**Breaking:**` в `CHANGELOG.md` для 6.10a — списки ~60 имён снапшота (`title.(keys)`, `site.privacy.controller.name.en` …), нечитаемые для владельца сайта; нужен гейт `check:api-breaking`, принимающий префикс или шаблон (`title.*`), либо имена отдельным списком под человеческим заголовком; оценка — medium.
  evidence: ревью 6.10a (blind #6); `scripts/check-api-breaking.ts` (`unnamedBreaking`, `unannouncedBreaking`) сверяет точные имена изменений снапшота с заголовками `### <names>`, а смена `{en, ru}` на запись по локалям даёт по три-четыре имени на каждое поле.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-10a-localized-data-shapes.md`
  summary: `categories[].label`, `places[].name`, `tags[].label` и `copy.description` слайда `featured` принимают пустую строку в активной локали, и сборка выводит пустой чип или имя места; у подписей `site.yaml` и в `idBase` пустое запрещено; оценка — low.
  evidence: ревью 6.10a (blind #8); так было и до 6.10a (`localizedTextSchema` — `z.string()` без `min(1)`); исправление — `required: true` у этих полей в `lib/content/schemas.ts` с проверкой демо и реального сайта.
