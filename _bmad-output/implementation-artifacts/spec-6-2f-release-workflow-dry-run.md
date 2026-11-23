---
title: 'Story 6.2, часть F — релизный workflow ядра (dry-run)'
type: 'feature'
created: '2026-11-01'
status: 'done'
baseline_commit: 'c8e4dd75c62a02dbb64699048c3cdaa968ee7c48'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/adr/0016-core-delivery-channel.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** У ядра нет релизного workflow: критерий 6.2 требует публикации в npm через trusted publishing
(`id-token: write`) с пропуском уже опубликованной версии, а до 6.9 — проверки без публикации
(ADR-0016, Д9).

**Approach:** Workflow `release.yml` собирает ядро, упаковывает `pnpm pack` (тот же артефакт, что ставит
демо) и вызывает скрипт `scripts/release.ts`: для каждого публикуемого пакета workspace он проверяет
`npm view <name>@<version>` и пропускает найденную версию, иначе вызывает `npm publish <tarball>`. До 6.9
workflow передаёт скрипту `--dry-run`, зашитый в файле workflow; 6.9 убирает флаг.

**Decision (владелец, 2026-11-01):** выпуск запускается push в `main` (плюс ручной `workflow_dispatch`),
на PR в `main` — всегда dry-run. Выпуск = подъём `version` пакетов в `main`; workflow публикует то, чего
нет в npm. Push в `main` делает владелец сам; эта работа ничего не пушит.

## Boundaries & Constraints

**Always:** без npm-токена в секретах и `.npmrc`; `id-token: write` только у релизного job, остальное —
`contents: read`; actions пиннятся SHA, как в `ci.yml`; публикуемые пакеты — `packages/*` без
`private: true` (сейчас только core; migrate-wp подхватится в эпике 8 без правки скрипта); одна версия у
всех публикуемых пакетов (ADR-0016 п. 2) — расхождение ошибка до любой публикации; прогоны релиза
сериализованы (`concurrency` без отмены); `publishConfig.access: public` в пакете ядра.

**Never:** настоящая публикация до 6.9; `--provenance` флагом (включается сам при OIDC, Д9); `npm stage
publish` и `dist-tag`; запуск `pnpm check` в релизном job (его даёт CI PR); правка версии пакета.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Новая версия | `npm view` → `E404` (нет пакета или версии) | `npm publish <tgz> [--dry-run]`, лог `publish <name>@<v>` | ненулевой выход publish — ошибка скрипта |
| Уже опубликована | `npm view` печатает версию | `skip <name>@<v>: already published`, publish не зовётся | — |
| Сбой реестра | `npm view` падает не с `E404` | ничего не публикуется | ошибка с выводом npm |
| Расхождение версий | два публикуемых пакета с разной `version` | ничего не публикуется | ошибка с именами и версиями |
| Нет tarball | пакет без `.tgz` в каталоге упаковки | ничего не публикуется | ошибка с именем пакета |
| Старый npm | `npm --version` < 11.5.1 (нет trusted publishing) | ничего не публикуется | ошибка с версией |

</frozen-after-approval>

## Code Map

- `.github/workflows/ci.yml` -- образец: пины `checkout`/`pnpm/action-setup`/`setup-node`, `.nvmrc`,
  `pnpm install --frozen-lockfile`, комментарии над job'ами. Не менять.
- `packages/core/package.json` -- `name`, `version` 0.0.0, `files`; добавить `publishConfig`.
- `packages/migrate-wp/` -- только README, `package.json` нет: скрипт его пропускает.
- `scripts/build-demo-from-pack.ts` -- образец `execFileSync`, `ROOT` от `import.meta.url`, экспорт
  чистых функций для тестов; запуск `node --experimental-strip-types`.
- `vitest.config.ts` -- проект `scripts` берёт `scripts/**/*.test.ts` (входит в `pnpm check`).
- `docs/adr/0016-core-delivery-channel.md` -- «Последствия», Д7, Д9: `npm view` перед каждым пакетом.
- `_bmad-output/planning-artifacts/architecture/architecture-core-2026-10-06/ARCHITECTURE-SPINE.md:466`
  -- строка «Релиз ядра: владелец ставит semver-тег» → «владелец поднимает версию пакетов в `main`».
- Проверено локально (npm 11.6.2): `npm view @picasso-ai/astrum-scena@0.0.0 version` → `E404`, exit 1;
  отсутствующая версия существующего пакета — тоже `E404`; `npm publish <tgz> --dry-run --access public`
  без логина проходит с предупреждением.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/release.ts` -- `--dry-run` и `--pack-dir <dir>`; поиск пакетов, проверка версий и npm,
  `npm view`, `npm publish`; чистые функции экспортировать, вызов npm инъецировать -- логика из матрицы
- [x] `scripts/release.test.ts` -- матрица целиком на подменённом npm, плюс guard: `release.yml`
  передаёт `--dry-run` при любом событии и `id-token: write` есть только у релизного job -- инвариант
  «до 6.9 не публикуем» в `pnpm check`
- [x] `.github/workflows/release.yml` -- `push`/`pull_request` в `main` и `workflow_dispatch`; install, `pnpm --filter
  @picasso-ai/astrum-scena build`, `pnpm pack` в `.cache/release/`, `scripts/release.ts --dry-run`
- [x] `packages/core/package.json` -- `"publishConfig": { "access": "public" }`
- [x] `package.json` -- скрипт `release`
- [x] `docs/adr/0016-core-delivery-channel.md`, spine:466 -- как устроен релиз; 6.9 снимает `--dry-run`
  и guard-тест
- [x] `_bmad-output/planning-artifacts/epics.md` (6.9) -- критерий снятия `--dry-run` и guard-теста
- [x] `CHANGELOG.md` -- запись в `[Unreleased]`

**Acceptance Criteria:**
- [x] `release.yml` запускается на PR и push в `main` и вручную, собирает и упаковывает ядро и проходит до
  `npm publish --dry-run` без секретов.
- [x] `id-token: write` есть только у релизного job; npm-токена нет нигде в workflow.
- [x] Guard-тест в `pnpm check` падает, если `release.yml` вызывает публикацию без `--dry-run`.
- [x] Повторный запуск при опубликованной версии ничего не публикует и завершается успешно.
- [x] ADR-0016, spine и критерий 6.9 описывают релиз и снятие dry-run в 6.9.

## Implementation Notes

- Публикация — два шага: вне `main` (PR, ручной запуск с другой ветки) всегда `--dry-run`, этот шаг и
  его тест остаются после 6.9; шаг `main` несёт `--dry-run`, который снимает 6.9.
- Guard-тесты проверяют все workflow: верхние `permissions: contents: read`, `id-token: write` только у
  job `release` в `release.yml`, вызовов публикации вне `release.yml` нет.

## Spec Change Log

## Review Triage Log

Первый проход (Codex: blind, edge-case, verification-gap).

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|---|
| 1 | blind | `release.yml` собирает и пакует только core, а скрипт публикует все `packages/*` | low | В эпике 8 релиз упадёт на «no tarball», пока не поправят workflow; фильтр `./packages/*` — прямая правка | patch |
| 2 | blind, edge | имя tarball не сверяется с манифестом внутри | false | `release.yml:51` пакует в пустой `.cache/release` из того же checkout, чей `package.json` читает скрипт, сразу перед публикацией; переименовать архив некому | reject |
| 3 | blind | `concurrency` держит один ожидающий прогон, третий push вытесняет второй | low | Поведение GitHub реально, комментарий «queue up» ему не соответствует; два подъёма версии за время одного прогона маловероятны, правится комментарий | patch |
| 4 | blind, edge | guard `--dry-run` смотрит весь текст `run`: комментарий или вторая строка с живой публикацией проходят | low | Подтверждено: `/(?:^|\s)--dry-run(?:\s|$)/` по всему шагу; проверка по строкам — прямая правка | patch |
| 5 | blind | 6.9 не требует включить действие `npm publish` у trusted publisher (по умолчанию только `stage publish`) | medium | ADR-0016, наблюдение владельца 3: `npm publish` включается флажком; без него первый выпуск из CI получит отказ | patch |
| 6 | blind | дозапуск после частичного выпуска (первый пакет есть, второй нет) не проверен тестом | low | `continue` → `break` оставляет тесты зелёными; ADR обещает дописывание пары | patch |
| 7 | edge | `11.5.1-beta.0` проходит проверку версии npm | false | `release.yml` берёт npm, встроенный в Node из `.nvmrc` (24), — стабильный выпуск; prerelease npm в job не ставится | reject |
| 8 | edge | любой `E404` в stderr, например в URL, считается «не опубликовано» | low | Регекс `\bE404\b` по всему stderr; сужение до строки `npm error code E404` — прямая правка | patch |
| 9 | verification-gap | код выхода CLI при ошибке не проверен: без `process.exitCode = 1` тесты зелёные, а job — тоже | medium | Пред-проверено слоем: тесты зовут `release()` напрямую, `main()` не покрыт | patch |

## Design Notes

Публикуется tarball `pnpm pack`, а не каталог пакета: это тот же артефакт, что демо ставит в CI, и
pnpm переписывает `workspace:`-зависимости, которых `npm publish` из каталога не понимает. `npm view`
вызывается с `version` и без `--json`: найденная версия — непустой stdout и код 0; `E404` в stderr —
не опубликовано; прочее — ошибка.

## Verification

**Commands:**
- `pnpm check` -- expected: зелёный, `scripts/release.test.ts` в проекте `scripts`
- `pnpm build` -- expected: зелёный
- `pnpm --filter @picasso-ai/astrum-scena build && pnpm --filter @picasso-ai/astrum-scena pack --pack-destination .cache/release && pnpm release --dry-run --pack-dir .cache/release`
  -- expected: `publish @picasso-ai/astrum-scena@0.0.0 (dry-run)` и `+ @picasso-ai/astrum-scena@0.0.0`
