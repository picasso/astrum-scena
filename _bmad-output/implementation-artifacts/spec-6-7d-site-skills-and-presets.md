---
title: 'Установка в сайт content-ops skills, пресетов и блока AGENTS.md командой CLI ядра (6.7, часть D)'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_commit: '89847e97364764620f590dc996b58c0a9f759085'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-7c-content-validation-cli.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Content-ops skills, правила кода и агентские правила живут только в исходном сайте:
skills зовут его `pnpm`-алиасы и скрипты, которых у сайта на ядре нет, а пресеты ESLint/Prettier/TS/
markdownlint и правила `AGENTS.md` пришлось бы копировать в каждый сайт и они бы расходились (AD-13).
Пресет ESLint ядра сейчас несёт только запрет глубоких импортов, без `noInlineConfig` (запись 1.5).

**Approach:** Skills, пресеты и текст управляемого блока лежат в пакете ядра; команда
`astrum-scena install` копирует skills в сайт со штампом версии ядра, создаёт недостающие конфиги
сайта, ссылающиеся на пресеты ядра, и обновляет управляемый блок `AGENTS.md`. Гейт `skills` в
агрегате `check` падает, если каталог skill'а с именем ядра не совпадает с установленным ядром.

## Boundaries & Constraints

**Always:**

- Skills вызывают только команды `astrum-scena …` (через `pnpm exec astrum-scena` сайта), а не
  алиасы `package.json` сайта и не `scripts/…`; тест ядра проверяет это по тексту каждого skill'а.
- Каждый установленный `SKILL.md` несёт штамп версии пакета ядра; повторный `install` той же версией
  побайтно ничего не меняет.
- Имена skills ядра и служебного каталога общих правил зарезервированы: `install` не перезаписывает
  чужой (без штампа) каталог с таким именем, а падает с его путём; гейт `skills` падает на любом
  каталоге с именем ядра, чьё содержимое не равно копии установленного ядра (в т. ч. другой штамп).
  Без установленных skills и без каталогов с именами ядра гейт проходит.
- Skills ставятся в `.agents/skills/` и `.claude/skills/` сайта; если один из них — ссылка на другой,
  пишется один раз.
- Управляемый блок `AGENTS.md` ограничен маркерами `<!-- astrum-scena:begin -->` /
  `<!-- astrum-scena:end -->` со штампом версии; текст вне маркеров не меняется; без файла он
  создаётся с одним блоком.
- Пресет ESLint несёт `linterOptions.noInlineConfig: true` и запрет глубоких импортов (AD-3);
  `install` не перезаписывает существующие конфиги сайта, а сообщает, что они не ссылаются на пресет.
- Тексты skills, пресетов и блока — без идентичности (AD-22): без ссылок на `docs/…` исходного сайта,
  ADR, `_bmad`, `scripts/**`, `src/lib/**`, имён моделей и путей.
- Корень — от `--root`; файлы ядра — от `coreRoot`; тесты — на временных сайтах через `runAstrumScena`.
- Решения владельца 2026-11-16:
  - Все девять skills AD-13, одна спека, два пакета с ревью после каждого. Пакет 1 — `install`,
    пресеты, блок `AGENTS.md`, гейт `skills`, исправления из 6.7C и skills `validate`, `fixcontent`,
    `sync-mdx`, `factcheck`, `factcheck-apply` (+ субагенты factcheck-researcher и factcheck-reviewer
    для Claude и Codex). Пакет 2 — `translate` (+ translator и translation-reviewer; без cursor-скрипта
    и жёстких имён моделей), `add-album`, `process-images`, `front-audit` (только общая часть каталога
    ловушек Astro, без аудитов сайта).
  - Пресеты — точки входа пакета (`./eslint`, `./prettier`, `./tsconfig.json`,
    `./markdownlint.json`); версию даёт lockfile сайта; `install` пишет только недостающие короткие
    конфиги сайта, которые их расширяют.
  - Пресет ESLint несёт и общий стиль из `eslint/style.mjs` (`simple-import-sort`, запрет `any`,
    enum, default export кроме `*.config.*`, JSDoc, `capitalized-comments`, `ban-ts-comment`,
    `consistent-type-definitions`, `prefer-const`); `typescript-eslint` и
    `eslint-plugin-simple-import-sort` — необязательные peers; база (`noInlineConfig` + глубокие
    импорты) работает без них. Корень репо переходит на пресет ядра, `eslint/style.mjs` удаляется.
  - Тексты skills — английские; с владельцем skill говорит на языке, на котором пишет пользователь.
  - Отложенное из 6.7C исправляется здесь: черновик без перевода не входит в пары
    `translation-marker` (как в целостности); пакет ревью фактчека показывает id находки — байты
    пакета меняются, переход в `UPGRADING.md`; обе записи `deferred-work.md` закрываются.
  - Документы сайта (голос автора, свои аудиты) skills читают, только если сайт называет их в своём
    `AGENTS.md` вне управляемого блока, и работают без них.

**Never:**

- Не переносить `import-wp` (эпик 8, migrate-wp), `bmad-*` skills и гейт версии workflow/`pnpm link`
  (6.8).
- Не менять команды CLI частей A–C, кроме решений владельца выше.
- Не делать универсальную команду обновления сайта.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Первая установка | сайт без skills, конфигов и `AGENTS.md` | skills в обоих каталогах, конфиги-ссылки, `AGENTS.md` с блоком; `check skills` OK | N/A |
| Повтор | `install` дважды | второй запуск без изменений файлов | N/A |
| Чужой skill с именем ядра | `.agents/skills/factcheck/` без штампа | `install` код 1, файлы не тронуты | путь каталога и правило имён |
| Правка установленного skill'а | изменён `SKILL.md` | `check skills` код 1 | путь и `astrum-scena install` |
| Свой skill сайта | `.agents/skills/site-notes/` | `install` и `check skills` его не трогают | N/A |
| Свой `AGENTS.md` | текст до и после блока | после `install` текст вне маркеров побайтно прежний | N/A |
| Старый штамп | skills от другой версии ядра | `check skills` код 1 | обе версии |
| Свой `eslint.config.mjs` | конфиг без пресета ядра | не перезаписан; `install` печатает предупреждение | N/A |

</frozen-after-approval>

## Code Map

- `$REF/.claude/skills/{validate,fixcontent,sync-mdx,factcheck,factcheck-apply,translate,add-album,process-images,front-audit,shared}/`,
  `$REF/.claude/agents/`, `$REF/.codex/agents/` (`$REF` = `REFERENCE_SITE_ROOT`) -- источник;
  у каждого skill'а `agents/openai.yaml`, общие правила — `shared/safety.md`. Алиасы → команды:
  `content:validate` → `astrum-scena check content`, `content:translation-marker:*` →
  `astrum-scena content translation-marker …`, `content:factcheck:*` → `astrum-scena content factcheck …`
  (`:check` → `check factcheck`), `images:*`/`check:images-*` → `astrum-scena images …`/`check …`,
  `check` → `astrum-scena check`; `build`, `lint`, `typecheck` — скрипты сайта, их skill называет
  как «сборка сайта» без имени алиаса.
- `$REF/eslint/style.mjs`, `$REF/prettier.config.mjs`, `$REF/.markdownlint.json`,
  `$REF/tsconfig.json`, `$REF/AGENTS.md` (разделы Interaction rules, Running and verifying, Local
  paths, Code style — общие) -- источник пресетов и блока; в репо те же `eslint/style.mjs`,
  `prettier.config.mjs`, `.markdownlint.json`.
- `packages/core/src/eslint.ts` `astrumScenaEslint`/`LintConfig` -- добавить `linterOptions`
  (`noInlineConfig`); экспорт `./eslint`; корневой `eslint.config.mjs:9,123,215` его использует.
- `packages/core/src/cli/registry.ts` `COMMANDS`/`GATES`/`usage` (группы опций в `usage` захардкожены),
  `run.ts` `RUNNERS`, `OPTION_FORMS`, `runCli` (требует `site.yaml` — `install` ставится в сайт с ним);
  `context.ts` `coreRoot`; `src/core-root.ts` `CORE_ROOT`; `cli/test-fixtures.ts` `runAstrumScena`.
- `packages/core/package.json` `files`, `exports`, `version` (штамп), peers;
  `scripts/lib/api-surface.ts` (`SURFACES`, регэксп UNSHIPPED ~:470 зеркалит `files`),
  `packages/core/api-snapshot/{cli,exports}.json` -- `pnpm api:snapshot`.
- Корневые `skills/README.md`, `presets/README.md` -- заглушки вне пакета: содержимое переезжает в
  `packages/core/{skills,presets}/` (иначе не попадёт в tarball), заглушки удаляются, `AGENTS.md`
  (раздел Project) и `.prettierignore` обновляются.
- `scripts/build-demo-from-pack.ts` `buildPackedDemo` (:635), образец `assertContentCommands` (:566),
  `runSiteBin` (:599), `presetVerdicts` (:163) -- упакованное демо зовёт `install` и `check skills`.
- `packages/core/src/lib/content/translation-marker.ts:113` `buildDocumentPairs` (образец —
  `integrity.ts:176`), `lib/content/factcheck-review.ts:52` `renderFinding` -- исправления из 6.7C;
  записи `deferred-work.md` про них (из `spec-6-7c-content-validation-cli.md`) получают `closed_by`.
- `eslint/style.mjs` (`styleConfig`, `enumDeclaration`, правило `local/no-jsdoc`) -- переезжает в
  пресет ядра; корневой `eslint.config.mjs` импортирует пресет из `packages/core`.
- `packages/core/README.md` Commands, `CHANGELOG.md` `[Unreleased]`, `UPGRADING.md` (`ENTRY_PARTS`).

## Tasks & Acceptance

**Execution (пакет 1 — механизм, пресеты, исправления 6.7C, skills контента; ревью после пакета):**

- [x] `packages/core/src/eslint.ts`, `packages/core/presets/` (+ тесты) -- база ESLint с
  `noInlineConfig`, стиль с ленивыми необязательными peers, `prettier`, `tsconfig.json`,
  `markdownlint.json`; `exports`, `files`, `peerDependencies(Meta)`; корневой `eslint.config.mjs`
  на пресете ядра, удалить `eslint/style.mjs`.
- [x] `packages/core/src/cli/install/`, `registry.ts`, `run.ts` (+ тесты) -- команда `install`,
  управляемый блок `AGENTS.md`, конфиги-ссылки, гейт `skills`; `usage`; снапшоты `cli`, `exports`.
- [x] `packages/core/skills/` -- общий каталог правил, `validate`, `fixcontent`, `sync-mdx`, `factcheck`,
  `factcheck-apply` с `agents/openai.yaml`; субагенты factcheck для `.claude/agents` и `.codex/agents`,
  которые `install` тоже ставит со штампом.
- [x] `packages/core/src/cli/install/skills-text.test.ts` -- каждая команда в тексте skills —
  `astrum-scena <команда или гейт из реестра>`; нет `pnpm <алиас>`, `scripts/`, `docs/`, `_bmad`.
- [x] `lib/content/translation-marker.ts`, `factcheck-review.ts` (+ тесты), `UPGRADING.md` (+ фикстура),
  `deferred-work.md` -- исправления из 6.7C.
- [x] `scripts/build-demo-from-pack.ts` (+ тест) -- `install` и `check skills` в упакованном демо,
  ESLint сайта отвергает `eslint-disable`.
- [x] Удалить `skills/README.md`, `presets/README.md`; `AGENTS.md`, `.prettierignore`,
  `packages/core/README.md`, `CHANGELOG.md`.

**Execution (пакет 2 — остальные skills):**

- [x] `packages/core/skills/` -- `translate` (+ translator, translation-reviewer), `add-album`,
  `process-images`, `front-audit`; тест текста skills их покрывает.
- [x] `packages/core/README.md`, `CHANGELOG.md` -- список skills.

**Acceptance Criteria:**

- [x] `pnpm demo:packed`: установленный из tarball `astrum-scena install` ставит skills, конфиги и блок,
  после чего `astrum-scena check` проходит с гейтом `skills`, а ESLint сайта сообщает о
  `eslint-disable` как об ошибке.
- [x] Тест над всеми skills ядра: команды в их тексте существуют в реестре CLI, алиасов сайта нет.
- [x] Снапшот `cli` перечисляет `install` и гейт `skills`; `exports` — новые точки входа пресетов.
- [x] Строки матрицы I/O покрыты тестами команд.
- [x] Черновик в одной локали не роняет `content translation-marker check`; пакет ревью фактчека
  показывает id каждой находки, а переход в `UPGRADING.md` проверен тестом (тесты).
- [x] Корневой `pnpm lint` идёт на пресете ядра: `eslint/style.mjs` нет, `eslint-disable` в коде
  репо — ошибка.

## Implementation Notes

- Текущий запуск реализует только пакет 1; пакет 2 — в отдельной сессии после ревью пакета 1.
- Пакет 1 реализован 2026-11-17 (дифф от `89847e9`). Решения там, где спека молчит:
  - Раскладка в пакете: `skills/<name>/` (общий каталог правил — `astrum-scena-shared`, без
    `SKILL.md`), `agents/{claude,codex}/` → `.claude/agents/`, `.codex/agents/`, `presets/`
    (`prettier.mjs`, `tsconfig.json`, `markdownlint.json`, текст блока `agents-block.md`); всё в `files`.
  - Штамп — строка `astrum-scena <версия>: installed by astrum-scena install; …`: HTML-комментарий
    после frontmatter у Markdown, `#`-комментарий первой строкой у YAML/TOML. Каталог «свой», если его
    `SKILL.md` (у общего каталога — первый `.md`) несёт штамп; агент — если файл несёт штамп. Каталог
    заменяется целиком, так что лишний файл в skill'е ядра удаляется. Пути дедуплицируются по реальному
    пути каждого каталога (ссылка корня или отдельного skill'а).
  - Гейт `skills` — последний в `GATES`; «установлено» — если есть хоть один элемент с именем ядра,
    тогда каждый обязан совпасть (отсутствующий — ошибка). Блок `AGENTS.md` гейт не проверяет.
  - Блок: маркеры строго из спеки, штамп — второй строкой внутри; без маркеров блок дописывается в
    конец; одиночный, повторный или перевёрнутый маркер — ошибка до любой записи.
  - Конфиги: `eslint.config.mjs`, `prettier.config.mjs`, `tsconfig.json`, `.markdownlint.json`; любой
    существующий конфиг инструмента (все имена, которые он читает) — не трогается, предупреждение, если
    в нём нет спецификатора пресета.
  - ESLint: `noInlineConfig` даёт только предупреждение, поэтому база и стиль несут правило
    `astrum-scena/no-inline-config` (ошибка на каждом директивном комментарии; `// global …` строкой —
    не директива). `astrumScenaStyle()` асинхронна, включает `typescript-eslint` recommended;
    `LintConfig.plugins` — `Record<string, object>` (тип контекста правила ESLint несовместим с
    узким). Изменение `LintConfig` — ломающее по снапшоту: записи в `CHANGELOG.md` и `UPGRADING.md`.
  - Пресет Prettier разрешает `prettier-plugin-astro` (новый необязательный peer) от ядра и без него
    не форматирует `.astro`. Корень: `prettier.config.mjs` и `.markdownlint.json` — на пресетах ядра;
    демо — `tsconfig.json` на пресете ядра.
  - Упакованное демо ставит в сайт `eslint`, `typescript-eslint`, `eslint-plugin-simple-import-sort`
    (версии корня), зовёт `install` дважды (второй — `0 written`), `check skills`, `eslint .` сайта
    (чисто) и пробу с `eslint-disable-next-line` (ошибка `astrum-scena/no-inline-config`).
  - Алиас `check:skills` в демо и корне. `.prettierignore` не потребовал правок.
  - Проверено: `pnpm check` (2394 теста), `pnpm build`, `pnpm demo:packed` — зелёные.

- Патчи ревью (пакет 1, проход 1): ключ `prettier` в `package.json` сайта считается его конфигом
  Prettier; `filesUnder` учитывает ссылки внутри каталога skill'а; упакованное демо запускает Prettier и
  `markdownlint-cli2` на установленных конфигах; `factcheck-apply` и `validate` проверяют каждую
  настроенную локаль и одобряют маркеры документа целиком. После патчей `pnpm check` (2398 тестов),
  `pnpm build`, `pnpm demo:packed` зелёные.
- Пакет 1 закрыт 2026-11-17 (реализован, проверен, отревьюирован, записан в триаж); спека возвращена в
  `in-progress`. Следующая сессия реализует только пакет 2 — его задачи; дифф ревью пакета 2 — от
  коммита пакета 1.
- Пакет 2 реализован 2026-11-17 (дифф от `2d93227`). Решения там, где спека молчит:
  - `translate`: перевод из опорной локали в любую другую (цель — аргумент, при одной другой локали не
    нужна); отсутствующий файл перевода создаётся с `translationKey`, `slug`, `status` опорного без
    полей опорной локали. Две независимые проверки `translation-reviewer` (A и B) на моделях, отличных
    от переводчика и друг от друга, когда хост даёт выбрать модель; иначе — «reduced diversity», без
    проверки — «skipped». Роль ревьюера — агент `translation-reviewer` (`.claude/agents/*.md`, Codex
    читает его тело), а не файл `references/` skill'а. Двухколоночный файл — `.cache/translate/`.
    Голосовой цикл — только если `AGENTS.md` сайта называет голосовой документ. `confirm --document`
    пишет маркеры всех переводов документа — skill предупреждает и откладывает на `/validate`, если
    другие переводы не актуальны.
  - `factcheck-apply` теперь называет агентов `translator` и `translation-reviewer` для пакета
    концевых примечаний (оба агента описывают и этот режим).
  - `add-album`: у ядра нет команд для slug, таксономии и регистрации мастеров, поэтому skill описывает
    правила словами (по `slug.ts`, `taxonomy-resolve.ts`) и пишет файлы под чекпоинтами; судья —
    `astrum-scena check content`. Идентичность мастера — плоские `sha256`/`master` записи фото (схема
    ядра), строка реестра `{id, masterFilename, masterSha256}`; таксономия — `src/content/config/`.
  - `process-images`: на командах ядра (`--fixture`, `--fake`/`--real` и локального dev-сервера
    изображений в ядре нет; дымовой прогон — сборка и офлайн-проверки, `images sync --dry-run` уже
    ходит в бакет). Явно: релиз для активации собирается без `--photos` — дескриптор указывает на один
    релиз, и фото вне манифеста пропали бы. Сайт без `publicOrigin` копирует производные в
    `public/<publicPath>/` своей процедурой, проверка — `check image-files`.
  - `front-audit`: каталог ядра `references/astro-pitfalls.md` — обобщённые ловушки без источников
    исходного сайта (поле Source — только у записей сайта); новые ловушки — в собственный каталог сайта,
    который называет его `AGENTS.md`, потому что правка установленного каталога роняет гейт `skills`.
    `operational-lessons.md` не перенесён (он про исходный сайт).
  - Тест текста skills перечисляет новые skills и агента среди найденных файлов.
  - Проверено: `pnpm check` (2398 тестов), `pnpm build`, `pnpm demo:packed` (`check skills OK (10
    skills, 4 agents …)`) — зелёные.
- Патчи ревью (пакет 2, проход 1): `translate` спрашивает «да» до записи, пишет маркер и собирает сайт после
  одобрения, без одобрения восстанавливает прежнюю версию по «да» владельца, читальный файл — под
  `<collection>/`; `add-album` до записи требует единственный файл мастера под корнем и его копию в одном
  `<YYYY>/` архива; `process-images` — новый id релиза, корни `--pixels` только из окружения, копия в
  `public/` до активации; Codex-`translator` знает форму строк концевых примечаний. Пакет 2 закрыт
  2026-11-17: `pnpm check` (2398 тестов), `pnpm build`, `pnpm demo:packed` зелёные.

## Spec Change Log

## Review Triage Log

Пакет 1, проход 1 (Codex: blind, edge-case, verification-gap; дифф от `89847e9`).

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|------|---------|---------|-------------|---------|
| 1 | blind, edge | Prettier-конфиг в ключе `prettier` у `package.json` не виден `planConfigs` (`configs.ts:49`): `install` пишет второй конфиг без предупреждения | low | реально: `candidates` не включает `package.json`, а Prettier читает этот ключ первым, так что записанный файл молча не действует | patch |
| 2 | blind | `writeItem` рекурсивно удаляет цель symlink'а вне сайта (`site-items.ts:68`) | false | удаление идёт только для состояния `stale`, а `inspect` (`site-items.ts:55-58`) даёт `stale` лишь каталогу, чей `SKILL.md` несёт штамп ядра; чужой каталог — `foreign`, и `install` падает до записи | reject |
| 3 | blind, edge | `filesUnder` пропускает symlink'и внутри каталога skill'а (`bundle.ts:66`), гейт проходит каталог с добавленной ссылкой | low | реально: `entry.isFile()` ложно для ссылки; правка — прямая замена фильтра | patch |
| 4 | blind | Цикл висячих symlink'ов роняет `realPathOf` переполнением стека (`site-items.ts:24`) | low | реально, но нужен намеренный цикл висячих ссылок под именем skill'а; исправление — новый guard с учётом пройденных путей | reject |
| 5 | edge | Два skill'а ядра, ссылающиеся на одну цель, — второй молча пропускается (`site-items.ts:35-38`) | low | реально только если сайт сам связал каталог одного skill'а ядра с другим; исправление — новая ветка конфликта | reject |
| 6 | blind | `factcheck` запускает пишущий `extract` до чекпоинта (`factcheck/SKILL.md:82`) | low | реально, но перенесено из исходного skill'а, где `extract` тоже первый шаг; меняет поток skill'а | defer |
| 7 | blind | `factcheck-apply`: после остановки между эталоном и переводами повторный запуск пропускает находку (`SKILL.md:108`) | low | реально: шаг 1 пропускает находку целиком, шаг 5 не достигается; перенесено из исходного skill'а | defer |
| 8 | blind | `factcheck-apply` не убирает end note, решение которого позже отклонено (`SKILL.md:96`) | low | реально: Phase 0 выбирает только документы с принятыми находками; поведение исходного skill'а | defer |
| 9 | blind | `factcheck-apply` Phase 0 проверяет «нет файла перевода», а не каждую локаль (`SKILL.md:100`) | low | реально на сайте с 3+ локалями; обобщение на N локалей — изменение этой истории; правка — одна фраза | patch |
| 10 | blind | `validate` Phase 5 может предложить к публикации черновик без файла локали (`SKILL.md:138`) | medium | реально: после исправления 6.7C у такого черновика нет пар, он не unresolved, а публикация роняет гейт `content` | patch |
| 11 | blind | `validate`: `confirm --document` пишет маркеры всех переводов документа, а одобрение — по переводу (`SKILL.md:98`) | low | реально на сайте с 3+ локалями; правка — текст условия | patch |
| 12 | blind | `fixcontent` не запускает сборку после правки (`SKILL.md:89`) | false | `astrum-scena-shared/safety.md:41` требует сборку сайта после любой правки, если skill не планирует свою; `fixcontent` ссылается на эти правила | reject |
| 13 | blind, vgap | Упакованное демо не запускает Prettier и markdownlint на созданных конфигах (`build-demo-from-pack.ts:629`, `:648`) | medium | реально: тест `install` проверяет подстроку спецификатора, упакованное демо — только наличие файлов; битый экспорт пресета прошёл бы | patch |

Пакет 2, проход 1 (Codex: blind, edge-case, verification-gap; дифф от `2d93227`). Verification-gap: пробелов нет.

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|------|---------|---------|-------------|---------|
| 14 | blind | `translate` создаёт перевод со `status` опорного, то есть `published` до одобрения (`translate/SKILL.md:49`) | false | `integrity.ts:171` требует одного `status` у всех локалей, а опубликованный документ без локали падает (`documents.ts:82`, `translation-marker.ts:115`): черновой перевод опубликованного документа роняет `check content` | reject |
| 15 | blind | Без одобрения заменённый текст существующего перевода остаётся в дереве (`translate/SKILL.md:46`) | low | реально: Phase 6 оставляет черновик и не называет пути назад; правка — фраза о восстановлении по «да» владельца | patch |
| 16 | blind | Маркер `confirm --write` пишется до ревью и одобрения (`translate/SKILL.md:105`) | medium | реально: отклонённый перевод помечен актуальным, а сама команда просит `--write` после подтверждения владельца (`translation-marker.ts:91`) | patch |
| 17 | blind | Нет plan → confirm перед записью перевода (`translate/SKILL.md:84`) | low | реально: `astrum-scena-shared/safety.md` («Working discipline») требует «да» до изменения файлов; правка — шаг в Phase 0 | patch |
| 18 | blind | Правки по ревью B не возвращаются ревью A (`translate/SKILL.md:130`) | low | реально, но итоговую версию с таблицей всех правок B читает и одобряет владелец в Phase 6; правка — ещё один цикл ревью | reject |
| 19 | blind | `translate` не запускает сборку сайта (`translate/SKILL.md:134`) | low | реально: `safety.md` («Validation is the product») требует сборку после пишущего прогона; правка — один шаг | patch |
| 20 | blind | Читальный файл `.cache/translate/<key>.<locale>.md` без коллекции (`translate/SKILL.md:113`) | low | реально: ключи пар группируются внутри коллекции (`integrity.ts:98`), один ключ в двух коллекциях перезапишет файл; правка — сегмент пути | patch |
| 21 | blind | Codex-`translator` требует только формат документа, а `/factcheck-apply` ждёт строки (`translator.toml:14`) | low | реально: «the delimited translation» читается как форма документа; правка — одна фраза | patch |
| 22 | blind, edge | `add-album` проверяет совпадение basename только среди входов и только при разных sha256 (`add-album/SKILL.md:87`) | medium | реально: `resolveMaster` падает на любом втором файле с тем же basename под корнем мастеров (`source-resolver.ts`, `matches.length > 1`), уже после записи реестра и фото | patch |
| 23 | blind | `add-album` не проверяет копию в архиве до регистрации (`add-album/SKILL.md:87`) | medium | реально: `archive-missing-year`/`archive-year-conflict` резолвера роняют сборку после записей | patch |
| 24 | blind | Уже зарегистрированный мастер останавливает весь альбом (`add-album/SKILL.md:107`) | low | реально, но STOP даёт владельцу id существующего фото (Phase 4.1), а `photoIds` в Phase 6 — список владельца, так что фото входит в альбом после его решения; автопродолжение обошло бы чекпоинт | reject |
| 25 | blind, edge | `ladder-report --pixels` не берёт `--masters`/`--archive` (`process-images/SKILL.md:52`, `:109`) | medium | реально: `images-ladder-report.ts:41` передаёт `options: {}`, корни только из окружения или `.env` | patch |
| 26 | blind | id релиза может совпасть с существующим (`process-images/SKILL.md:72`) | low | реально: `release-fs.ts` заменяет существующий локальный релиз; правка — условие в тексте | patch |
| 27 | blind | Сайт без бакета копирует производные после активации (`process-images/SKILL.md:133`) | medium | реально: отложенная копия оставляет активный релиз без файлов в `public/` | patch |
| 28 | blind | `front-audit` не сообщает новый дефект без правила или ловушки (`front-audit/SKILL.md:34`) | false | skill сообщает его владельцу как открытый вопрос с меткой unsourced, а доступность и адаптивность названы обязательными источниками («What it checks against», п. 1) | reject |
| 29 | edge | `confirm --document` помечает устаревшие переводы других локалей актуальными (`translate/SKILL.md:105`) | false | протокол skill'а запускает шаг только когда те переводы актуальны, иначе предупреждает владельца и оставляет маркер `/validate` | reject |

## Verification

**Commands:**

- `pnpm check` -- expected: зелёный, включая тест текста skills и гейт `skills`.
- `pnpm build` -- expected: зелёный.
- `pnpm demo:packed` -- expected: `install` и `check skills` в упакованном демо проходят.
